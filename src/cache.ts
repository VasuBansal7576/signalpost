import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {hash,canonical} from './domain.ts';

type CachedResponse={url:string;status:number;headers:Record<string,string>;body_hash:string;retrieved_at:string};
/** Immutable raw blobs; conditional GET across runs, single-flight within one run. */
export class EvidenceCache {
  private pending=new Map<string,Promise<CachedResponse>>();
  readonly metrics={network_gets:0,revalidated_304:0,in_run_shared:0,raw_bytes:0,derived_hits:0,derived_misses:0};
  constructor(readonly directory:string,readonly request:typeof fetch=fetch,readonly scope='public'){}
  async read<T>(namespace:string,key:string):Promise<T|undefined>{try{return JSON.parse(await readFile(join(this.directory,namespace,hash(key)+'.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'||e instanceof SyntaxError)return;throw e;}}
  async write(namespace:string,key:string,value:unknown){await this.atomic(join(this.directory,namespace,hash(key)+'.json'),JSON.stringify(value));}
  async atomic(path:string,body:string|Buffer){await mkdir(dirname(path),{recursive:true});const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,body,{mode:0o600});await rename(temp,path);}
  async blob(bytes:string){const digest=hash(bytes),path=join(this.directory,'blobs',digest+'.gz');await mkdir(dirname(path),{recursive:true});try{await writeFile(path,gzipSync(bytes),{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}return digest;}
  async body(digest:string){return gunzipSync(await readFile(join(this.directory,'blobs',digest+'.gz'))).toString('utf8');}
  readonly fetch:typeof fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
    if((init.method??'GET')!=='GET')return this.request(input,init);
    const headers=new Headers(init.headers),key=canonical({url,scope:this.scope,accept:headers.get('accept'),auth:hash(headers.get('authorization')??'')});
    const existing=this.pending.get(key);if(existing)this.metrics.in_run_shared++;
    const task=existing??this.get(url,headers,key,init);if(!existing)this.pending.set(key,task);
    try{const record=await task;if(record.status<200||record.status>=300)this.pending.delete(key);return new Response([204,205,304].includes(record.status)?null:await this.body(record.body_hash),{status:record.status,headers:{...record.headers,'x-signalpost-raw-sha256':record.body_hash,'x-signalpost-retrieved-at':record.retrieved_at}});}catch(error){this.pending.delete(key);throw error;}
  };
  private async get(url:string,headers:Headers,key:string,init:RequestInit){
    const prior=await this.read<CachedResponse>('http',key);
    if(prior?.headers.etag)headers.set('if-none-match',prior.headers.etag);else if(prior?.headers['last-modified'])headers.set('if-modified-since',prior.headers['last-modified']);
    this.metrics.network_gets++;const response=await this.request(url,{...init,headers});
    const retained=Object.fromEntries(['content-type','etag','last-modified','date','retry-after','x-signalpost-final-url','x-signalpost-redirects'].flatMap(k=>response.headers.get(k)?[[k,response.headers.get(k)!]]:[]));
    if(response.status===304&&prior){await this.body(prior.body_hash);this.metrics.revalidated_304++;const next={...prior,headers:{...prior.headers,...retained},retrieved_at:new Date().toISOString()};await this.write('http',key,next);return next;}
    const reader=response.body?.getReader();let bytes=0;const chunks:Uint8Array[]=[];
    if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>(new URL(url).hostname==='pam-stilling-feed.nav.no'?16_000_000:4_000_000)){await reader.cancel();throw new Error('Source response exceeds host byte limit');}chunks.push(value);}
    const body=Buffer.concat(chunks).toString('utf8');this.metrics.raw_bytes+=bytes;
    const record:CachedResponse={url,status:response.status,headers:retained,body_hash:await this.blob(body),retrieved_at:new Date().toISOString()};
    // Temporary errors are never persistent negative cache entries.
    if(response.ok)await this.write('http',key,record);return record;
  }
}
