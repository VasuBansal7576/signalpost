import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {access,chmod,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {delimiter,isAbsolute,join,resolve} from 'node:path';
import {publicAddress,robotsAllowed,websiteUrl,type PublicNetwork} from './public-web.ts';

const MAX_BYTES=8*1024*1024,MAX_PAGES=40,MAX_TEXT_BYTES=4*1024*1024;
const USER_AGENT='SignalpostResearch/0.2';
const sha256=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
type Address={address:string;family:number};
type Response={status:number;raw:Buffer;content_type:string;location?:string};
export type PdfTransport={lookup:(host:string)=>Promise<Address[]>;fetchPinned:(url:URL,address:Address,signal:AbortSignal,maxBytes:number)=>Promise<Response>};
export type PublicPdfReceipt={requested_url:string;url:string;status:number;content_type:string;raw:Buffer;raw_sha256:string;retrieved_at:string;redirect_chain:string[];robots:{url:string;status:number;content_sha256:string;retrieved_at:string;redirect_chain:string[]};elapsed_ms:number};
export type PdfExtraction={raw_sha256:string;page_count:number;pages:{page_number:number;text:string}[];parser:{id:string;version:string};has_text_layer:boolean;elapsed_ms:number};

/** Public unauthenticated URLs only. Query credentials are never sent, even to public hosts. */
export function publicPdfUrl(value:string){
 const url=websiteUrl(value);
 if([...url.searchParams.keys()].some(key=>/^(?:api[-_]?key|access[-_]?token|authorization|auth|token|key|secret|password|signature|session|jwt|x-amz-.+|x-goog-.+)$/i.test(key)||/(?:^|[-_])(?:key|token|secret|password|authorization|credential|signature)(?:$|[-_])/i.test(key)))throw Error('Public PDF URL contains credential or signed-access parameters');
 url.hash='';return url;
}
export function validatePdfBytes(raw:Buffer){
 if(raw.length>MAX_BYTES)throw Error('Public PDF exceeds 8 MB');
 if(!raw.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Public PDF response has no PDF signature');
}
function publicAddresses(addresses:Address[]){
 if(!addresses.length||addresses.some(item=>!publicAddress(item.address)))throw Error('Public PDF DNS resolves to a non-public address');
 return addresses.find(item=>item.family===4)??addresses[0]!;
}
function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((done,reject)=>{
  signal.throwIfAborted();const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
  promise.then(value=>{signal.removeEventListener('abort',abort);done(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  if(signal.aborted)abort();
 });
}
const transport:PdfTransport={
 lookup:host=>lookup(host,{all:true}),
 fetchPinned:(url,pinned,signal,maxBytes)=>new Promise((done,reject)=>{
  const req=request(url,{signal,family:pinned.family,lookup:(_host,_options,callback)=>callback(null,pinned.address,pinned.family),headers:{'user-agent':USER_AGENT,accept:'application/pdf,text/plain;q=0.8','accept-encoding':'identity'}},res=>{
   const chunks:Buffer[]=[];let size=0;
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>maxBytes){res.destroy(Error('Public PDF response exceeds byte limit'));return;}chunks.push(Buffer.from(chunk));});
   res.once('error',reject);res.once('end',()=>done({status:res.statusCode??0,raw:Buffer.concat(chunks),content_type:String(res.headers['content-type']??''),...(res.headers.location?{location:res.headers.location}:{})}));
  });req.setTimeout(10000,()=>req.destroy(Error('Public PDF request timed out')));req.once('error',reject);req.end();
 }),
};

/** Injectable transport supports offline policy tests; the default pins validated DNS in HTTPS lookup. */
export function createPublicPdfRetriever(io:PdfTransport=transport){
 return async(value:string,signal:AbortSignal,network?:PublicNetwork):Promise<PublicPdfReceipt>=>{
  const began=Date.now(),deadline=AbortSignal.any([signal,AbortSignal.timeout(20000)]),requested=publicPdfUrl(value),chain:string[]=[];
  const read=async(url:URL,maxBytes:number)=>{
   deadline.throwIfAborted();const pinned=publicAddresses(await abortable(io.lookup(url.hostname),deadline));deadline.throwIfAborted();
   const perform=()=>io.fetchPinned(url,pinned,deadline,maxBytes);
   const result=await abortable(network?network(url.hostname,deadline,perform):perform(),deadline);
   if(result.raw.length>maxBytes)throw Error('Public PDF response exceeds byte limit');
   return result;
  };
  const robotsUrl=new URL('/robots.txt',requested),robotsChain:string[]=[];let robotsCurrent=robotsUrl,robotsResponse:Response|undefined;
  for(let n=0;n<=3;n++){
   const r=await read(robotsCurrent,256*1024);
   if([301,302,303,307,308].includes(r.status)&&r.location){
    if(n===3)throw Error('Public PDF robots redirect limit reached');
    const next=publicPdfUrl(new URL(r.location,robotsCurrent).toString());if(next.hostname!==requested.hostname)throw Error('Public PDF robots redirect left the permitted host');
    robotsChain.push(robotsCurrent.toString());robotsCurrent=next;continue;
   }robotsResponse=r;break;
  }
  if(!robotsResponse||![200,404,410].includes(robotsResponse.status))throw Error('Public PDF robots policy unavailable');
  const robotsText=robotsResponse.status===200?robotsResponse.raw.toString('utf8'):'';
  const robots={url:robotsCurrent.toString(),status:robotsResponse.status,content_sha256:sha256(robotsResponse.raw),retrieved_at:new Date().toISOString(),redirect_chain:[...robotsChain,robotsCurrent.toString()]};
  let current=requested;
  for(let n=0;n<=3;n++){
   if(!robotsAllowed(robotsText,current.pathname+current.search))throw Error('Public PDF robots disallows this path');
   const r=await read(current,MAX_BYTES);
   if([301,302,303,307,308].includes(r.status)&&r.location){
    if(n===3)throw Error('Public PDF redirect limit reached');
    const next=publicPdfUrl(new URL(r.location,current).toString());if(next.hostname!==requested.hostname)throw Error('Public PDF redirect left the permitted host');
    chain.push(current.toString());current=next;continue;
   }
   if(r.status!==200)throw Error('Public PDF source returned HTTP '+r.status);
   if(!/^(?:application\/pdf|application\/octet-stream|binary\/octet-stream)(?:\s*;|$)/i.test(r.content_type))throw Error('Public PDF source returned an unsupported content type');
   validatePdfBytes(r.raw);return {requested_url:requested.toString(),url:current.toString(),status:r.status,content_type:r.content_type,raw:r.raw,raw_sha256:sha256(r.raw),retrieved_at:new Date().toISOString(),redirect_chain:[...chain,current.toString()],robots,elapsed_ms:Date.now()-began};
  }
  throw Error('Public PDF redirect limit reached');
 };
}
export const retrievePublicPdf=createPublicPdfRetriever();

async function executable(name:'pdfinfo'|'pdftotext'){
 const configured=process.env[name==='pdfinfo'?'SIGNALPOST_PDFINFO_PATH':'SIGNALPOST_PDFTOTEXT_PATH'];
 if(configured&&!isAbsolute(configured))throw Error('Configured PDF tool path must be absolute');
 const directories=(process.env.PATH??'').split(delimiter).filter(Boolean),candidates=configured?[configured]:directories.flatMap(path=>[join(path,name),resolve(path,'../../native/poppler/poppler/bin',name),resolve(path,'../../native/poppler/bin',name)]);
 for(const candidate of candidates){try{await access(candidate,constants.X_OK);return candidate;}catch{}}
 throw Error('Public PDF text extraction requires installed Poppler '+name+' or an explicit absolute tool path');
}
function localCommand(binary:string,args:string[],cwd:string,signal:AbortSignal,maxBytes:number){
 return new Promise<{stdout:string;stderr:string}>((done,reject)=>{
  signal.throwIfAborted();
  const env=Object.fromEntries(Object.entries(process.env).filter(([key,value])=>value!==undefined&&['PATH','TMPDIR','LANG','LC_ALL','SystemRoot','WINDIR'].includes(key))) as Record<string,string>;
  const child=spawn(binary,args,{cwd,env,stdio:['ignore','pipe','pipe'],shell:false});let stdout:Buffer[]=[],stderr:Buffer[]=[],size=0,finished=false;
  const stop=(error:Error)=>{if(finished)return;finished=true;child.kill('SIGKILL');reject(error);};
  const abort=()=>stop(Error('Public PDF extraction aborted or exceeded its 20 second limit'));signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  const collect=(chunks:Buffer[],chunk:Buffer)=>{size+=chunk.length;if(size>maxBytes){stop(Error('Public PDF extracted output exceeds byte limit'));return;}chunks.push(Buffer.from(chunk));};
  child.stdout.on('data',chunk=>collect(stdout,chunk));child.stderr.on('data',chunk=>collect(stderr,chunk));
  child.once('error',error=>{signal.removeEventListener('abort',abort);if(!finished){finished=true;reject(error);}});
  child.once('close',code=>{signal.removeEventListener('abort',abort);if(finished)return;finished=true;if(code!==0)reject(Error('Public PDF parser rejected the document (exit '+code+')'));else done({stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')});});
 });
}
/** Text layer only: no OCR, document execution, remote helpers or ownership inference. */
export async function extractPdf(raw:Buffer,signal:AbortSignal=AbortSignal.timeout(20000)):Promise<PdfExtraction>{
 validatePdfBytes(raw);const began=Date.now(),deadline=AbortSignal.any([signal,AbortSignal.timeout(20000)]);
 const [info,textTool]=await Promise.all([executable('pdfinfo'),executable('pdftotext')]);deadline.throwIfAborted();
 const directory=await mkdtemp(join(tmpdir(),'signalpost-pdf-'));await chmod(directory,0o700);
 try{
  const input=join(directory,'source.pdf');await writeFile(input,raw,{mode:0o600});
  const infoResult=await localCommand(info,['-isodates',input],directory,deadline,64*1024),pages=Number(/^Pages:\s*(\d+)\s*$/m.exec(infoResult.stdout)?.[1]);
  if(!Number.isSafeInteger(pages)||pages<1||pages>MAX_PAGES)throw Error('Public PDF must contain between 1 and 40 pages');
  if(/^Encrypted:\s*yes/im.test(infoResult.stdout))throw Error('Public PDF encrypted documents are unsupported');
  const version=await localCommand(textTool,['-v'],directory,deadline,4096),versionText=/pdftotext version\s+([^\s]+)/.exec(version.stderr+'\n'+version.stdout)?.[1];
  if(!versionText)throw Error('Public PDF parser version could not be identified');
  const result=await localCommand(textTool,['-layout','-enc','UTF-8','-f','1','-l',String(pages),input,'-'],directory,deadline,MAX_TEXT_BYTES);
  const sections=result.stdout.split('\f');if(sections.length&&sections.at(-1)!.trim()==='')sections.pop();
  if(sections.length!==pages)throw Error('Public PDF parser did not return every declared page');
  return {raw_sha256:sha256(raw),page_count:pages,pages:sections.map((text,index)=>({page_number:index+1,text})),parser:{id:'poppler-pdftotext/layout-utf8/v1',version:versionText},has_text_layer:sections.some(text=>text.trim().length>0),elapsed_ms:Date.now()-began};
 }finally{await rm(directory,{recursive:true,force:true});}
}
