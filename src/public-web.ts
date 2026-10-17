import{knownAccessRestriction}from'./source-access-policy.ts';
import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';
import {gunzipSync,inflateSync,brotliDecompressSync} from 'node:zlib';

/** node:https supplies wire bytes, even when a server ignores accept-encoding:identity. */
export function decodePublicBody(raw:Buffer,encoding:string,contentType:string):string{
 const limit=2_000_000;if(raw.length>limit)throw Error('Public website response exceeds 2 MB wire limit');
 const encodings=encoding.toLowerCase().split(',').map(s=>s.trim()).filter(s=>s&&s!=='identity');
 if(!encodings.length&&raw[0]===0x1f&&raw[1]===0x8b)encodings.push('gzip');
 if(encodings.length>2)throw Error('Unsupported public response encoding depth');
 let decoded=raw;
 for(const item of encodings.reverse()){
  if(item==='gzip'||item==='x-gzip')decoded=gunzipSync(decoded,{maxOutputLength:limit});
  else if(item==='deflate')decoded=inflateSync(decoded,{maxOutputLength:limit});
  else if(item==='br')decoded=brotliDecompressSync(decoded,{maxOutputLength:limit});
  else throw Error('Unsupported public response content encoding: '+item);
 }
 if(decoded.length>limit)throw Error('Public website response exceeds 2 MB decoded limit');
 const charset=/charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType)?.[1]??'utf-8';
 const text=new TextDecoder(charset,{fatal:true}).decode(decoded);
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error('Public website response contains binary control bytes, not usable text');
 return text;
}

export function publicAddress(address:string):boolean{
 if(isIP(address)===6){const first=parseInt(address.split(':')[0]!,16);return first>=0x2000&&first<=0x3fff&&!address.toLowerCase().startsWith('2001:db8:');}
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a!>=224||a===169&&b===254||a===172&&b!>=16&&b!<=31||a===192&&b===168||a===100&&b!>=64&&b!<=127||a===198&&[18,19].includes(b!)||a===192&&b===0||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
}
export function websiteUrl(value:string):URL{
 const url=new URL(value),host=url.hostname.replace(/^\[|\]$/g,'');
 const restriction=knownAccessRestriction(value);if(restriction)throw Error('Source access policy: '+restriction.reason);
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||isIP(host)||!host.includes('.')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(host)||['linkedin.com','facebook.com','instagram.com','indeed.com'].some(d=>host===d||host.endsWith('.'+d)))throw new Error('Expected an unrestricted public HTTPS website');
 return url;
}
export type PublicNetwork=<T>(host:string,signal:AbortSignal,perform:()=>Promise<T>)=>Promise<T>;
export async function publicGet(value:string,redirects=0,signal=AbortSignal.timeout(15000),conditional:Record<string,string>={},network?:PublicNetwork):Promise<{url:string;status:number;text:string;content_type:string;etag?:string;last_modified?:string;redirect_chain?:string[]}>{
 const url=websiteUrl(value),addresses=await lookup(url.hostname,{all:true});
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Website DNS resolves to a non-public address');
 const pinned=addresses.find(a=>a.family===4)??addresses[0]!;
 const perform=()=>new Promise<{status:number;text:string;location?:string|undefined;content_type:string;etag?:string;last_modified?:string}>((resolve,reject)=>{
  const req=request(url,{signal,family:pinned.family,lookup:(_host,_options,callback)=>callback(null,pinned.address,pinned.family),headers:{'user-agent':'SignalpostResearch/0.2','accept':'text/html,text/plain;q=0.9','accept-encoding':'identity',...conditional}},res=>{
   const chunks:Buffer[]=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>2_000_000){res.destroy(new Error('Public website response exceeds 2 MB'));return;}chunks.push(Buffer.from(chunk));});
   res.on('error',reject);res.on('end',()=>{try{const content_type=String(res.headers['content-type']??'');resolve({status:res.statusCode??0,text:decodePublicBody(Buffer.concat(chunks),String(res.headers['content-encoding']??''),content_type),location:res.headers.location,content_type,...(res.headers.etag?{etag:res.headers.etag}:{}),...(res.headers['last-modified']?{last_modified:res.headers['last-modified']}:{})});}catch(error){reject(error);}});
  });req.setTimeout(10000,()=>req.destroy(new Error('Public website timed out')));req.on('error',reject);req.end();
 });
 const result=await(network?network(url.hostname,signal,perform):perform());
 if([301,302,303,307,308].includes(result.status)&&result.location){if(redirects>=3)throw new Error('Public website redirect limit reached');const next=websiteUrl(new URL(result.location,url).toString());if(next.hostname.replace(/^www\./,'')!==url.hostname.replace(/^www\./,''))throw new Error('Cross-domain redirect requires separate company verification');const final=await publicGet(next.toString(),redirects+1,signal,conditional,network);return{...final,redirect_chain:[url.toString(),...(final.redirect_chain??[final.url])]};}
 return {url:url.toString(),...result};
}
export function robotsAllowed(text:string,path:string):boolean{
 const groups:{agents:string[];rules:{allow:boolean;path:string}[]}[]=[];let current={agents:[] as string[],rules:[] as {allow:boolean;path:string}[]};
 for(const raw of text.split(/\r?\n/)){const line=raw.split('#')[0]!.trim();const split=line.indexOf(':');if(split<0)continue;const key=line.slice(0,split).trim().toLowerCase(),value=line.slice(split+1).trim();
  if(key==='user-agent'){if(current.rules.length){groups.push(current);current={agents:[],rules:[]};}current.agents.push(value.toLowerCase());}
  else if(['allow','disallow'].includes(key)&&current.agents.length&&value)current.rules.push({allow:key==='allow',path:value});
 }groups.push(current);
 const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&'signalpostresearch'.includes(a))),selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
 const matching=selected.flatMap(g=>g.rules).filter(r=>{const escaped=r.path.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replaceAll('*','.*').replace(/\$$/,'$');return new RegExp('^'+escaped).test(path);}).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));
 return matching[0]?.allow??true;
}
