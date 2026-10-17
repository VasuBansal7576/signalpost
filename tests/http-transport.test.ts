import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSecureServer} from 'node:http2';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
const execute=promisify(execFile);
test('the batch transport never negotiates the failing HTTP2 path; aborted streams remain request failures',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'signalpost-h1-')),key=join(dir,'key.pem'),cert=join(dir,'cert.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 const server=createSecureServer({key:await readFile(key),cert:await readFile(cert),allowHTTP1:true});
 const sockets=new Set<import('node:net').Socket>();server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
 server.on('request',(req,res)=>{if(req.url==='/slow'){res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: started\n\n');return;}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({protocol:req.httpVersionMajor}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as import('node:net').AddressInfo).port;
 const script=`import assert from 'node:assert/strict';import {configureHttpTransport,closeHttpTransport} from ${JSON.stringify(new URL('../src/http-transport.ts',import.meta.url).href)};configureHttpTransport();try{const url='https://127.0.0.1:${port}';const first=await(await fetch(url)).json();assert.equal(first.protocol,1,'HTTP2 must not be negotiated by the production transport');const stream=await fetch(url+'/slow',{signal:AbortSignal.timeout(100)});await assert.rejects(stream.text());await new Promise(r=>setTimeout(r,150));assert.equal((await(await fetch(url)).json()).protocol,1);console.log('HTTP1_ONLY_ABORT_CONTAINED');}finally{await closeHttpTransport();}`;
 try{const result=await execute(process.execPath,['--import','tsx','--input-type=module','-e',script],{cwd:resolve('.'),env:{...process.env,NODE_EXTRA_CA_CERTS:cert},timeout:8000,maxBuffer:100000});assert.match(result.stdout,/HTTP1_ONLY_ABORT_CONTAINED/);}finally{for(const s of sockets)s.destroy();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
