import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {link,mkdir,open,realpath,rm} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {errorMessage,hash,snapshot,type Snapshot} from './domain.ts';
import type {Store,Job} from './store.ts';
import {extractPdf,publicPdfUrl,retrievePublicPdf,validatePdfBytes,type PdfExtraction,type PublicPdfReceipt} from './public-pdf.ts';
import type {PublicNetwork} from './public-web.ts';

export type PublicDocumentMetadata={raw_sha256:string;source_url:string;page_number:number;page_count:number;parser:{id:string;version:string};raw_path:string};
export type DocumentPageSnapshot=Snapshot&{document:PublicDocumentMetadata};
export type PreservedPublicDocument={document_id:string;raw_sha256:string;raw_path:string;status:'available'|'empty_text_layer'|'parse_failed';pages:DocumentPageSnapshot[];page_count:number|null;parser:PdfExtraction['parser']|null;has_text_layer:boolean;parse_error?:string;receipt:Omit<PublicPdfReceipt,'raw'>;retrieval_ms:number;parse_ms:number};
export type PublicDocumentTools={retrieve:typeof retrievePublicPdf;extract:typeof extractPdf};
const digest=(raw:Buffer)=>createHash('sha256').update(raw).digest('hex');

/** The filename comes only from a recomputed digest, never a URL or publisher filename. */
async function preserveRaw(directory:string,raw:Buffer,sha:string){
 if(!directory.trim()||!isAbsolute(directory))throw Error('Public document directory must be an explicit absolute path');
 const root=resolve(directory);await mkdir(root,{recursive:true,mode:0o700});const realRoot=await realpath(root),path=join(realRoot,sha+'.pdf'),temporary=join(realRoot,'.pdf-write-'+randomUUID());
 try{
  const file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await file.writeFile(raw);await file.sync();}finally{await file.close();}
  // Atomic publication means concurrent jobs cannot observe another writer's partial bytes.
  await link(temporary,path);
 }catch(error){
  if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
  const existing=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const stat=await existing.stat();if(!stat.isFile()||stat.size!==raw.length||stat.size>8*1024*1024)throw Error('Content-addressed public document is not the expected immutable file');
   if(digest(await existing.readFile())!==sha)throw Error('Content-addressed public document hash mismatch');
   await existing.chmod(0o600);
  }finally{await existing.close();}
 }finally{await rm(temporary,{force:true});}
 return path;
}

/** Page text is derived evidence; binary bytes are persisted first, including when parsing fails. */
export function createPublicDocumentPreserver(tools:PublicDocumentTools={retrieve:retrievePublicPdf,extract:extractPdf}){
 return async(store:Store,job:Job,url:string,directory:string,signal:AbortSignal,network?:PublicNetwork):Promise<PreservedPublicDocument>=>{
  const requested=publicPdfUrl(url).toString();
  const response=await tools.retrieve(requested,signal,network),finalUrl=publicPdfUrl(response.url).toString();
  validatePdfBytes(response.raw);const raw_sha256=digest(response.raw);
  if(response.raw_sha256!==raw_sha256)throw Error('Public document transport byte hash mismatch');
  const raw_path=await preserveRaw(directory,response.raw,raw_sha256),{raw:_binary,...receipt}=response;
  const document_id=hash('public-document/v1\n'+job.organisation_number+'\n'+job.run_id+'\n'+finalUrl+'\n'+raw_sha256);
  store.operation(job.run_id,job.organisation_number,{stage:'public_document_preserved',document_id,raw_sha256,raw_path,requested_url:requested,final_url:finalUrl,retrieved_at:response.retrieved_at,bytes:response.raw.length,retrieval_ms:response.elapsed_ms,redirect_chain:response.redirect_chain,robots:response.robots});
  const began=Date.now();let extraction:PdfExtraction;
  try{
   extraction=await tools.extract(response.raw,signal);
   if(extraction.raw_sha256!==raw_sha256)throw Error('Public document parser byte hash mismatch');
   if(!Number.isSafeInteger(extraction.page_count)||extraction.page_count<1||extraction.page_count>40||extraction.pages.length!==extraction.page_count)throw Error('Public document parser did not preserve the declared page count');
   if(extraction.pages.some((page,index)=>page.page_number!==index+1||typeof page.text!=='string'))throw Error('Public document parser returned invalid or reordered pages');
   if(extraction.pages.reduce((n,page)=>n+Buffer.byteLength(page.text),0)>4*1024*1024)throw Error('Public document text exceeds the preserved text limit');
  }catch(error){
   const parse_error=errorMessage(error).slice(0,1000),parse_ms=Date.now()-began;
   store.operation(job.run_id,job.organisation_number,{stage:'public_document_parse_failed',document_id,raw_sha256,raw_path,parse_ms,error:parse_error});
   return {document_id,raw_sha256,raw_path,status:'parse_failed',pages:[],page_count:null,parser:null,has_text_layer:false,parse_error,receipt,retrieval_ms:response.elapsed_ms,parse_ms};
  }
  const pages:DocumentPageSnapshot[]=extraction.pages.map(page=>{
   const pageUrl=new URL(finalUrl);pageUrl.hash='page='+page.page_number;
   const base=snapshot({source_url:pageUrl.toString(),source_class:'external',text:page.text,organisation_number:job.organisation_number,run_id:job.run_id,extraction_method:'public-pdf-text/v1',transport:{raw_sha256,retrieved_at:response.retrieved_at,final_url:finalUrl,redirect_chain:response.redirect_chain}},response.retrieved_at);
   const item:DocumentPageSnapshot={...base,id:hash(base.id+'\npublic-pdf-page/v1\n'+page.page_number+'\n'+raw_sha256),document:{raw_sha256,source_url:finalUrl,page_number:page.page_number,page_count:extraction.page_count,parser:extraction.parser,raw_path}};
   store.saveSnapshot(job.id,item);return item;
  });
  const has_text_layer=pages.some(page=>page.text.trim().length>0),parse_ms=Date.now()-began;
  store.operation(job.run_id,job.organisation_number,{stage:'public_document_parsed',document_id,raw_sha256,raw_path,page_count:extraction.page_count,parser:extraction.parser,has_text_layer,text_bytes:pages.reduce((n,page)=>n+Buffer.byteLength(page.text),0),parse_ms,snapshot_ids:pages.map(page=>page.id)});
  return {document_id,raw_sha256,raw_path,status:has_text_layer?'available':'empty_text_layer',pages,page_count:extraction.page_count,parser:extraction.parser,has_text_layer,receipt,retrieval_ms:response.elapsed_ms,parse_ms};
 };
}
export const preservePublicDocument=createPublicDocumentPreserver();
