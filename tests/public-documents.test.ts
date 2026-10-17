import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,stat,symlink,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store.ts';
import {createPublicDocumentPreserver,type PublicDocumentTools} from '../src/public-documents.ts';

const raw=Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.from([0xff,0x00,0x80,0xfe]),Buffer.from('\nraw binary fixture')]),sha=createHash('sha256').update(raw).digest('hex'),at='2026-10-17T03:00:00.000Z';
const url='https://report.publisher.no/company-report.pdf';
function tools(overrides:Partial<PublicDocumentTools>={}):PublicDocumentTools{
 return {retrieve:async()=>({requested_url:url,url,status:200,content_type:'application/pdf',raw,raw_sha256:sha,retrieved_at:at,redirect_chain:[url],robots:{url:'https://report.publisher.no/robots.txt',status:200,content_sha256:'a'.repeat(64),retrieved_at:at,redirect_chain:['https://report.publisher.no/robots.txt']},elapsed_ms:17}),extract:async()=>({raw_sha256:sha,page_count:2,pages:[{page_number:1,text:'Exact company report first page.'},{page_number:2,text:'The report says 17. november 2022.'}],parser:{id:'poppler-pdftotext/layout-utf8/v1',version:'26.05.0'},has_text_layer:true,elapsed_ms:5}),...overrides};
}
async function fixture(){const directory=await mkdtemp(join(tmpdir(),'signalpost-public-documents-test-')),store=new Store(':memory:'),job=store.createJob('947975072','document-tests','eve');return {directory,store,job,close:async()=>{store.close();await rm(directory,{recursive:true,force:true});}};}
test('public document raw bytes are immutable and persisted before parser invocation',async()=>{
 const f=await fixture();try{
  const mock=tools();mock.extract=async buffer=>{assert.deepEqual(await readFile(join(f.directory,sha+'.pdf')),raw);assert.deepEqual(buffer,raw);return tools().extract(buffer);};
  const result=await createPublicDocumentPreserver(mock)(f.store,f.job,url,f.directory,AbortSignal.timeout(2000));
  assert.equal(result.status,'available');assert.equal(result.raw_sha256,sha);assert.deepEqual(await readFile(result.raw_path),raw);assert.equal((await stat(result.raw_path)).mode&0o777,0o600);assert.equal(result.pages.length,2);
  for(const [index,page] of result.pages.entries()){
   assert.equal(page.source_class,'external');assert.equal(page.retrieved_at,at);assert.equal(page.extraction_method,'public-pdf-text/v1');assert.equal(page.source_url,url+'#page='+(index+1));assert.equal(page.document.page_number,index+1);assert.equal(page.document.page_count,2);assert.equal(page.document.raw_sha256,sha);assert.equal(page.document.source_url,url);assert.equal(page.document.raw_path,result.raw_path);assert.equal(page.document.parser.version,'26.05.0');assert.equal(f.store.source(f.job.id,page.id).text,page.text);
  }
  const rows=f.store.db.prepare('SELECT body FROM operation_metrics ORDER BY id').all().map(row=>JSON.parse(String(row.body)));assert.deepEqual(rows.map(row=>row.stage),['public_document_preserved','public_document_parsed']);assert.ok(rows.every(row=>!('raw' in row)));assert.equal(f.store.resources(f.job.run_id).physical_requests,undefined,'caller owns network metering');
  const repeat=await createPublicDocumentPreserver(mock)(f.store,f.job,url,f.directory,AbortSignal.timeout(2000));assert.equal(repeat.document_id,result.document_id);assert.deepEqual(repeat.pages.map(p=>p.id),result.pages.map(p=>p.id));assert.equal(f.store.snapshots(f.job.id).length,2);
 }finally{await f.close();}
});
test('parser failure retains exact raw evidence and durable failure receipt without invented text',async()=>{
 const f=await fixture();try{
  const preserve=createPublicDocumentPreserver(tools({extract:async()=>{throw Error('PDF parser rejected input');}})),result=await preserve(f.store,f.job,url,f.directory,AbortSignal.timeout(2000));assert.equal(result.status,'parse_failed');assert.equal(result.page_count,null);assert.equal(result.parser,null);assert.equal(result.has_text_layer,false);assert.deepEqual(result.pages,[]);assert.deepEqual(await readFile(result.raw_path),raw);assert.equal(f.store.snapshots(f.job.id).length,0);assert.match(result.parse_error!,/rejected/);
  const row=f.store.db.prepare("SELECT body FROM operation_metrics WHERE json_extract(body,'$.stage')='public_document_parse_failed'").get();assert.equal(JSON.parse(String(row?.body)).raw_sha256,sha);
 }finally{await f.close();}
});
test('empty text layers remain explicit, and identical blank pages have distinct stable IDs',async()=>{
 const f=await fixture();try{
  const result=await createPublicDocumentPreserver(tools({extract:async()=>({raw_sha256:sha,page_count:2,pages:[{page_number:1,text:''},{page_number:2,text:''}],parser:{id:'test-parser',version:'1'},has_text_layer:false,elapsed_ms:0})}))(f.store,f.job,url,f.directory,AbortSignal.timeout(2000));
  assert.equal(result.status,'empty_text_layer');assert.equal(result.has_text_layer,false);assert.equal(result.pages.length,2);assert.notEqual(result.pages[0]!.id,result.pages[1]!.id);assert.equal(result.pages[0]!.content_sha256,result.pages[1]!.content_sha256);assert.equal(f.store.snapshots(f.job.id).length,2);
 }finally{await f.close();}
});
test('hash mismatch and content-addressed corruption are rejected without overwriting files',async()=>{
 const f=await fixture();try{
  const io=tools(),get=io.retrieve;io.retrieve=async(...args)=>({...await get(...args),raw_sha256:'b'.repeat(64)});await assert.rejects(createPublicDocumentPreserver(io)(f.store,f.job,url,f.directory,AbortSignal.timeout(2000)),/transport byte hash mismatch/);assert.deepEqual(await readdir(f.directory),[]);
  const target=join(f.directory,sha+'.pdf');await writeFile(target,Buffer.alloc(raw.length,0x20),{mode:0o600});await assert.rejects(createPublicDocumentPreserver(tools())(f.store,f.job,url,f.directory,AbortSignal.timeout(2000)),/hash mismatch/);assert.deepEqual(await readFile(target),Buffer.alloc(raw.length,0x20));
 }finally{await f.close();}
});
test('content-addressed paths never follow an existing symlink',async()=>{
 const f=await fixture();try{const victim=join(f.directory,'unrelated.txt');await writeFile(victim,'preserve me');await symlink(victim,join(f.directory,sha+'.pdf'));await assert.rejects(createPublicDocumentPreserver(tools())(f.store,f.job,url,f.directory,AbortSignal.timeout(2000)));assert.equal(await readFile(victim,'utf8'),'preserve me');}finally{await f.close();}
});
test('malformed parser page order/hash is a preserved parse failure, never a published snapshot',async()=>{
 for(const error of ['order','hash']){const f=await fixture();try{
  const io=tools(),extract=io.extract;io.extract=async(...args)=>{const r=await extract(...args);return error==='hash'?{...r,raw_sha256:'c'.repeat(64)}:{...r,pages:[r.pages[1]!,r.pages[0]!]};};
  const r=await createPublicDocumentPreserver(io)(f.store,f.job,url,f.directory,AbortSignal.timeout(2000));assert.equal(r.status,'parse_failed');assert.equal(f.store.snapshots(f.job.id).length,0);assert.deepEqual(await readFile(r.raw_path),raw);
 }finally{await f.close();}}
});
test('concurrent identical documents publish one complete raw file and clean private write files',async()=>{
 const f=await fixture();try{
  const preserve=createPublicDocumentPreserver(tools()),jobs=[f.job,f.store.createJob('916863071','document-tests','eve')];
  const results=await Promise.all(jobs.map(job=>preserve(f.store,job,url,f.directory,AbortSignal.timeout(2000))));
  assert.ok(results.every(result=>result.status==='available'));assert.deepEqual(await readdir(f.directory),[sha+'.pdf']);assert.deepEqual(await readFile(results[0]!.raw_path),raw);assert.equal(results[0]!.raw_path,results[1]!.raw_path);assert.notEqual(results[0]!.document_id,results[1]!.document_id);
 }finally{await f.close();}
});
