import{test}from'node:test';import assert from'node:assert/strict';import{mkdtemp,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';import{EvidenceCache}from'../src/cache.ts';
test('in-run duplicate GETs coalesce; next run revalidates and preserves raw bytes on 304',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'signalpost-cache-'));let calls=0;
 try{const fetcher:typeof fetch=async(_url,init)=>{calls++;if(new Headers(init?.headers).get('if-none-match')==='v1')return new Response(null,{status:304});return new Response('original body',{headers:{etag:'v1','content-type':'text/plain'}});};
 const first=new EvidenceCache(dir,fetcher);const replies=await Promise.all([first.fetch('https://company.no/'),first.fetch('https://company.no/')]);assert.equal(calls,1);assert.deepEqual(await Promise.all(replies.map(r=>r.text())),['original body','original body']);
 const second=new EvidenceCache(dir,fetcher);const r=await second.fetch('https://company.no/');assert.equal(await r.text(),'original body');assert.equal(calls,2);assert.equal(second.metrics.revalidated_304,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('temporary source errors are not persisted as absence across runs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'signalpost-negative-'));let n=0;
 try{const fetcher:typeof fetch=async()=>++n===1?new Response('busy',{status:503}):new Response('recovered');assert.equal((await new EvidenceCache(dir,fetcher).fetch('https://company.no/')).status,503);assert.equal(await(await new EvidenceCache(dir,fetcher).fetch('https://company.no/')).text(),'recovered');}finally{await rm(dir,{recursive:true,force:true});}
});
