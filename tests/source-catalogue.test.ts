import{test}from'node:test';
import assert from'node:assert/strict';
import{mkdtemp,readFile,writeFile,rm}from'node:fs/promises';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{ensureNavCatalogue}from'../src/source-catalogue.ts';
import{navQuery}from'../src/nav-feed.ts';

test('first-use NAV setup bootstraps itself, persists shared source and reuses it without company history',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'signalpost-source-')),path=join(dir,'nav.json'),urls:string[]=[];
 const id='47cfbfed-73c2-469a-a190-f45ba9927c36',org='999111222',entry='https://pam-stilling-feed.nav.no/api/v1/feedentry/'+id;
 const request:typeof fetch=async url=>{const u=String(url);urls.push(u);if(u.endsWith('/publicToken'))return new Response('Current public token\neyJabc.def.ghi');if(u===entry)return Response.json({status:'ACTIVE',ad_content:{uuid:id,title:'Developer',published:'2026-01-01T00:00:00Z',expires:'2099-01-01T00:00:00Z',employer:{name:'ACME TECHNOLOGY AS',orgnr:org}}});return Response.json({next_url:null,items:[{url:entry,date_modified:'2026-01-01T00:00:00Z',_feed_entry:{uuid:id,status:'ACTIVE',businessName:'ACME TECHNOLOGY AS',title:'Developer',municipal:'Bergen'}}]});};
 try{const options={path,signal:AbortSignal.timeout(5000),request};const a=await ensureNavCatalogue(options);assert.equal(a.mode,'bootstrapped');assert.equal(navQuery(a.catalogue,org,[]).active_ads_attributed,1);assert.equal(a.requests,urls.length);const before=urls.length,b=await ensureNavCatalogue(options);assert.equal(b.mode,'reused');assert.equal(b.requests,0);assert.equal(urls.length,before);assert.equal(b.catalogue.records.length,1);
 const old={...a.catalogue,completed_at:'2000-01-01T00:00:00Z'};await writeFile(path,JSON.stringify(old));const refreshed=await ensureNavCatalogue(options);assert.equal(refreshed.mode,'refreshed');assert.equal(navQuery(refreshed.catalogue,org,[]).active_ads_attributed,1);
 await writeFile(path,JSON.stringify(old));const raw=await readFile(path,'utf8');const keyless=await ensureNavCatalogue({...options,allowAuthentication:false,request:async()=>{throw new Error('No network is permitted');}});assert.equal(keyless.mode,'frozen-keyless');assert.equal(keyless.requests,0);assert.equal(keyless.catalogue.completed_at,old.completed_at);assert.equal(await readFile(path,'utf8'),raw);await assert.rejects(ensureNavCatalogue({...options,path:join(dir,'missing.json'),allowAuthentication:false}),/no complete frozen/);await assert.rejects(ensureNavCatalogue({...options,request:async()=>new Response('Unavailable',{status:401})}),/HTTP 401/);assert.equal(await readFile(path,'utf8'),raw,'failed refresh preserves the last source and cannot publish a fresh source zero');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('NAV catch-up removes an ad withdrawn after its ACTIVE header without requiring missing ad content',async()=>{
 const {NavFeed}=await import('../src/nav-feed.ts');const id='47cfbfed-73c2-469a-a190-f45ba9927c36',entry='https://pam-stilling-feed.nav.no/api/v1/feedentry/'+id;
 const feed=new NavFeed(async url=>String(url).endsWith('/publicToken')?new Response('eyJabc.def.ghi'):String(url)===entry?Response.json({status:'INACTIVE',uuid:id}):Response.json({next_url:null,items:[{url:entry,date_modified:'2026-10-15T00:00:00Z',_feed_entry:{uuid:id,status:'ACTIVE',businessName:'Acme',title:'Developer'}}]}),AbortSignal.timeout(5000));
 const catalogue={version:1 as const,complete:true,collection_started_at:'2026-01-01T00:00:00Z',completed_at:'2026-01-02T00:00:00Z',failures:[],manifest:{requests:1,pages_checked:[{url:'https://pam-stilling-feed.nav.no/api/v1/feed?pageSize=10000',sha256:'old',items:1}]},records:[{uuid:id,title:'Developer',status:'ACTIVE',employer_org:'999111222',employer_name:'Acme',published:'2026-01-01T00:00:00Z',expires:'2099-01-01T00:00:00Z',source_url:entry,retrieved_at:'2026-01-01T00:00:00Z',content_sha256:'old'}]};
 const updated=await feed.catchUp(catalogue);assert.equal(updated.records.length,0);assert.equal(updated.complete,true);
});
