import {mkdir,open,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {setTimeout as delay} from 'node:timers/promises';
import {NavFeed,navCatalogueSchema,type NavCatalogue} from './nav-feed.ts';
import {hash} from './domain.ts';

export type NavSetup={catalogue:NavCatalogue;mode:'reused'|'refreshed'|'bootstrapped'|'frozen-keyless';requests:number;elapsed_ms:number;path:string};
type Options={path:string;signal:AbortSignal;request?:typeof fetch;onProgress?:(message:string)=>void;seed?:unknown;now?:()=>number;allowAuthentication?:boolean};
const pending=new Map<string,Promise<NavSetup>>();
const usable=(value:unknown):NavCatalogue|undefined=>{const parsed=navCatalogueSchema.safeParse(value);return parsed.success&&parsed.data.complete&&!parsed.data.failures.length?parsed.data:undefined;};
export function ensureNavCatalogue(options:Options):Promise<NavSetup>{
 const path=resolve(options.path),running=pending.get(path);if(running)return running;
 const task=prepare({...options,path}).finally(()=>pending.delete(path));pending.set(path,task);return task;
}
async function prepare(options:Options):Promise<NavSetup>{
 const started=Date.now(),now=options.now??Date.now,onProgress=options.onProgress??(()=>{}),path=options.path;
 const fresh=(c:NavCatalogue)=>{const age=now()-Date.parse(c.completed_at);return Number.isFinite(age)&&age>=-1000&&age<=3600000;};
 const read=async()=>{try{return usable(JSON.parse(await readFile(path,'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'||error instanceof SyntaxError)return;throw error;}};
 await mkdir(dirname(path),{recursive:true});
 let saved=await read();if(options.allowAuthentication===false){saved??=usable(options.seed);if(!saved)throw new Error('Keyless mode forbids NAV bearer-token authentication; no complete frozen public-source catalogue is available');onProgress('NAV frozen public-source snapshot reused at '+saved.completed_at+'; no token request or freshness assertion');return {catalogue:saved,mode:'frozen-keyless',requests:0,elapsed_ms:Date.now()-started,path};}if(saved&&fresh(saved)){onProgress('NAV shared source is current; no source download needed');return {catalogue:saved,mode:'reused',requests:0,elapsed_ms:Date.now()-started,path};}
 const lock=path+'.lock';let handle:Awaited<ReturnType<typeof open>>|undefined;
 while(!handle){options.signal.throwIfAborted();try{handle=await open(lock,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid}));}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;let alive=true;try{const owner=JSON.parse(await readFile(lock,'utf8'));try{process.kill(Number(owner.pid),0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')alive=false;}}catch{}if(!alive){await rm(lock,{force:true});continue;}onProgress('Waiting for the running shared NAV source update');await delay(1000,undefined,{signal:options.signal});saved=await read();if(saved&&fresh(saved))return {catalogue:saved,mode:'reused',requests:0,elapsed_ms:Date.now()-started,path};}}
 try{
  saved=await read()??usable(options.seed);
  if(saved&&fresh(saved)){await atomic(path,saved);return {catalogue:saved,mode:'reused',requests:0,elapsed_ms:Date.now()-started,path};}
  const raw=path+'.sources';await mkdir(raw,{recursive:true});
  const feed=new NavFeed(options.request??fetch,options.signal,onProgress,async(url,text)=>{await writeFile(resolve(raw,hash(url)+'-'+hash(text)+'.json.gz'),gzipSync(text),{mode:0o600});});
  const mode=saved?'refreshed':'bootstrapped';onProgress(saved?'Refreshing the shared NAV source automatically':'Building the shared NAV source for first use; this can take several minutes');
  let catalogue:NavCatalogue;if(saved)catalogue=await feed.catchUp(saved);else{await feed.load();catalogue=await feed.hydrate();if(catalogue.complete)catalogue=await feed.catchUp(catalogue);}
  if(!catalogue.complete||catalogue.failures.length||!fresh(catalogue))throw new Error('NAV source update was incomplete; the previous source was preserved and no scoped absence is inferred');
  await atomic(path,catalogue);return {catalogue,mode,requests:feed.manifest.requests,elapsed_ms:Date.now()-started,path};
 }finally{await handle.close();await rm(lock,{force:true});}
}
async function atomic(path:string,catalogue:NavCatalogue){const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(catalogue)+'\n',{mode:0o600});await rename(temp,path);}finally{await rm(temp,{force:true});}}
