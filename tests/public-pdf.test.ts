import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {delimiter,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createPublicPdfRetriever,extractPdf,publicPdfUrl,validatePdfBytes,type PdfTransport} from '../src/public-pdf.ts';

const deadline=()=>AbortSignal.timeout(5000);
function pdf(pageCount=1){
 const text='Brekke Strand 916863071 approval valid until 05.11.2024',objects:string[]=[];
 objects.push('<< /Type /Catalog /Pages 2 0 R >>');
 const children=Array.from({length:pageCount},(_,i)=>`${3+i*2} 0 R`).join(' ');objects.push(`<< /Type /Pages /Kids [${children}] /Count ${pageCount} >>`);
 for(let i=0;i<pageCount;i++){objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3+pageCount*2} 0 R >> >> /Contents ${4+i*2} 0 R >>`);const stream=`BT /F1 12 Tf 40 740 Td (${text}) Tj ET`;objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);}
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');let body='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(body));body+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const offset=Buffer.byteLength(body);body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;return Buffer.from(body);
}
function mock(overrides:Partial<PdfTransport>={}){
 const seen:string[]=[],io:PdfTransport={lookup:async()=>[{address:'8.8.8.8',family:4}],fetchPinned:async(url,_address,_signal,_max)=>{seen.push(url.toString());return url.pathname==='/robots.txt'?{status:200,content_type:'text/plain',raw:Buffer.from('User-agent: *\nAllow: /')}:{status:200,content_type:'application/pdf',raw:pdf()};},...overrides};return {retrieve:createPublicPdfRetriever(io),seen};
}
test('PDF URLs reject credentials, signed/key parameters, private literals and restricted hosts',()=>{
 for(const url of ['http://company.no/a.pdf','https://127.0.0.1/a.pdf','https://[::1]/a.pdf','https://localhost/a.pdf','https://user:secret@company.no/a.pdf','https://company.no:444/a.pdf','https://company.no/a.pdf?api_key=secret','https://company.no/a.pdf?X-Amz-Signature=secret','https://company.no/a.pdf?access_token=secret','https://company.no/a.pdf?key=secret','https://www.linkedin.com/a.pdf'])assert.throws(()=>publicPdfUrl(url),url);
 assert.equal(publicPdfUrl('https://company.no/a.pdf?year=2025#page=2').toString(),'https://company.no/a.pdf?year=2025');
});
test('private or mixed DNS results fail before a PDF or robots request',async()=>{
 for(const addresses of [[],[{address:'127.0.0.1',family:4}],[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}],[{address:'::ffff:127.0.0.1',family:6}]]){
  let calls=0;const {retrieve}=mock({lookup:async()=>addresses,fetchPinned:async()=>{calls++;throw Error('must not fetch');}});await assert.rejects(retrieve('https://company.no/a.pdf',deadline()),/non-public/);assert.equal(calls,0);
 }
});
test('robots approval precedes every fetch and metering callback sees both physical requests',async()=>{
 const {retrieve,seen}=mock();let networkCalls=0;const r=await retrieve('https://company.no/a.pdf',deadline(),async(host,signal,perform)=>{assert.equal(host,'company.no');assert.equal(signal.aborted,false);networkCalls++;return perform();});
 assert.deepEqual(seen,['https://company.no/robots.txt','https://company.no/a.pdf']);assert.equal(networkCalls,2);assert.equal(r.raw_sha256,createHash('sha256').update(r.raw).digest('hex'));assert.equal(r.robots.status,200);assert.deepEqual(r.redirect_chain,['https://company.no/a.pdf']);
});
test('disallowed or unavailable robots policy cannot be bypassed; only404/410 permit absent robots',async()=>{
 for(const status of [200,401,403,429,500]){
  let pdfCalls=0;const {retrieve}=mock({fetchPinned:async(url)=>{if(url.pathname!='/robots.txt')pdfCalls++;return {status,content_type:'text/plain',raw:Buffer.from('User-agent: *\nDisallow: /')};}});
  await assert.rejects(retrieve('https://company.no/a.pdf',deadline()),/robots/);assert.equal(pdfCalls,0);
 }
 for(const status of [404,410]){const {retrieve}=mock({fetchPinned:async(url)=>url.pathname==='/robots.txt'?{status,content_type:'text/plain',raw:Buffer.from('missing')}:{status:200,content_type:'application/pdf',raw:pdf()}});assert.equal((await retrieve('https://company.no/a.pdf',deadline())).status,200);}
});
test('redirects remain on the approved host and cannot enter disallowed paths or key URLs',async()=>{
 for(const target of ['https://other.no/a.pdf','https://127.0.0.1/a.pdf','https://company.no/private/a.pdf','https://company.no/a.pdf?token=secret']){
  let pages=0;const {retrieve}=mock({fetchPinned:async(url)=>url.pathname==='/robots.txt'?{status:200,content_type:'text/plain',raw:Buffer.from('User-agent: *\nDisallow: /private')}:(pages++,{status:302,content_type:'text/plain',raw:Buffer.alloc(0),location:target})});
  await assert.rejects(retrieve('https://company.no/a.pdf',deadline()));assert.equal(pages,1);
 }
 const {retrieve}=mock({fetchPinned:async(url)=>url.pathname==='/robots.txt'?{status:200,content_type:'text/plain',raw:Buffer.from('User-agent: *\nAllow: /')}:url.pathname==='/old.pdf'?{status:301,content_type:'text/plain',raw:Buffer.alloc(0),location:'/new.pdf'}:{status:200,content_type:'application/pdf',raw:pdf()}});assert.deepEqual((await retrieve('https://company.no/old.pdf',deadline())).redirect_chain,['https://company.no/old.pdf','https://company.no/new.pdf']);
});
test('non-PDF, unsupported content types, byte excess and incomplete HTTP response are rejected',async()=>{
 for(const response of [{status:200,content_type:'text/html',raw:pdf()},{status:200,content_type:'application/pdf',raw:Buffer.from('<html>not PDF</html>')},{status:200,content_type:'application/pdf',raw:Buffer.alloc(8*1024*1024+1)},{status:403,content_type:'application/pdf',raw:pdf()}]){
  const {retrieve}=mock({fetchPinned:async(url)=>url.pathname==='/robots.txt'?{status:404,content_type:'text/plain',raw:Buffer.alloc(0)}:response});await assert.rejects(retrieve('https://company.no/a.pdf',deadline()));
 }
 assert.throws(()=>validatePdfBytes(Buffer.alloc(8*1024*1024+1)),/8 MB/);assert.throws(()=>validatePdfBytes(Buffer.from('not PDF')),/signature/);
});
test('cancellation interrupts pending DNS and never starts a request',async()=>{
 let calls=0;const {retrieve}=mock({lookup:()=>new Promise(()=>{}),fetchPinned:async()=>{calls++;throw Error('must not fetch');}}),controller=new AbortController();const pending=retrieve('https://company.no/a.pdf',controller.signal);controller.abort(Error('audit cancelled'));await assert.rejects(pending,/cancelled/);assert.equal(calls,0);
});
const toolAvailable=(name:string)=>{const configured=process.env[name==='pdfinfo'?'SIGNALPOST_PDFINFO_PATH':'SIGNALPOST_PDFTOTEXT_PATH'];return configured?existsSync(configured):(process.env.PATH??'').split(delimiter).some(path=>[join(path,name),resolve(path,'../../native/poppler/poppler/bin',name),resolve(path,'../../native/poppler/bin',name)].some(existsSync));};
const tools=toolAvailable('pdfinfo')&&toolAvailable('pdftotext');
test('local text extraction preserves page numbers, exact reported date, parser and raw hash',{skip:!tools},async()=>{
 const raw=pdf(2),r=await extractPdf(raw);assert.equal(r.page_count,2);assert.deepEqual(r.pages.map(p=>p.page_number),[1,2]);assert.match(r.pages[0]!.text,/916863071 approval valid until 05\.11\.2024/);assert.equal(r.raw_sha256,createHash('sha256').update(raw).digest('hex'));assert.equal(r.parser.id,'poppler-pdftotext/layout-utf8/v1');assert.match(r.parser.version,/\d+\.\d+/);assert.equal(r.has_text_layer,true);
});
test('local parser rejects over40pages, damaged documents and aborted requests',{skip:!tools},async()=>{
 await assert.rejects(extractPdf(pdf(41)),/1 and 40/);await assert.rejects(extractPdf(Buffer.from('%PDF-1.4\nbroken')),/parser rejected/);const controller=new AbortController();controller.abort();await assert.rejects(extractPdf(pdf(),controller.signal));
});
const nif='out/semantic-verification/requirements/pdf-nif-probe/947975072.pdf';
test('saved real NIF PDF keeps page5 description and historical2022 event as page12 text',{skip:!tools||!existsSync(nif)},async()=>{
 const r=await extractPdf(await readFile(nif));assert.equal(r.page_count,30);assert.equal(r.raw_sha256,'5940339df0fcea5533354e85f32063a794c5a2cc730f32ba7ca196d833daf38c');assert.match(r.pages[4]!.text,/Paraplyorganisasjon for idretten i Norge/);assert.match(r.pages[4]!.text,/Sognsveien 73, 0854 Oslo/);assert.match(r.pages[11]!.text,/17\. november 2022/);assert.match(r.pages[11]!.text,/Norges\s+idrettsforbund/);
});
const certificate='out/semantic-verification/requirements/pdf-probes/916863071.pdf';
test('saved real certificate preserves expired2024 wording without converting it into current approval',{skip:!tools||!existsSync(certificate)},async()=>{
 const r=await extractPdf(await readFile(certificate));assert.equal(r.page_count,1);assert.match(r.pages[0]!.text,/organisasjonsnummer 916863071/);assert.match(r.pages[0]!.text,/gyldig til 05\.11\.2024/);
});
