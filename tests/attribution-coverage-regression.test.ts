import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {Store} from '../src/store.ts';import {ResearchService} from '../src/service.ts';import {currentSourceVersions} from '../src/source-versions.ts';import type {Snapshot} from '../src/domain.ts';import {supportedTemporalDate} from '../src/dates.ts';
const fixtures: {org:string;host:string;sources:Snapshot[]}[]=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/coverage/fresh-attribution.json.gz',import.meta.url))).toString());
for(const fixture of fixtures)test('preserved fresh attribution failure is repaired for '+fixture.org,()=>{
 const store=new Store(':memory:'),service=new ResearchService(store),job=store.createJob(fixture.org,'attribution-fixture','eve');try{
  for(const source of fixture.sources)store.saveSnapshot(job.id,source);
  const root=currentSourceVersions(store.snapshots(job.id)).find(s=>s.source_class!=='public_registry'&&new URL(s.source_url).pathname==='/')!;assert.ok(root);
  const check=service.attribution(job,root,'official_website');assert.equal(check.accepted,true,check.reason);assert.ok(check.support.length>0,'Retain corroborating legal/contact evidence');
  if(fixture.org==='971488204'){assert.ok(root.text.includes('96 plassar'));assert.ok(root.text.includes('1989'));assert.equal(supportedTemporalDate(root.text,'1989'),true);}
 }finally{store.close();}
});
test('publisher connectors, possessive spelling and street abbreviations never override a conflicting legal operator or house number',()=>{
 for(const [org,variant] of [['962161677','other-publisher'],['962161677','missing-org'],['961022207','other-number'],['971488204','other-contact-operator']]){
  const f=structuredClone(fixtures.find(f=>f.org===org)!),store=new Store(':memory:'),service=new ResearchService(store),job=store.createJob(org!,'negative-'+variant,'eve');try{
   for(const source of f.sources){if(source.source_class!=='public_registry'){
    if(variant==='other-publisher')source.text=source.text.replaceAll('av Vestlandske Industrimontasje AS','av Other Company AS');
    if(variant==='missing-org')source.text=source.text.replaceAll('962 161 677','111 222 333').replaceAll('962161677','111222333');
    if(variant==='other-number')source.text=source.text.replaceAll('Storgt.14','Storgt.15').replaceAll('Storgata 14','Storgata 15').replaceAll('Storgt. 14','Storgt. 15');
    if(variant==='other-contact-operator'&&/kontakt/i.test(source.source_url))source.text+='\nThis website is owned and operated by Other Operator AS. Org.nr 999111222.';
   }store.saveSnapshot(job.id,source);}
   const root=currentSourceVersions(store.snapshots(job.id)).find(s=>s.source_class!=='public_registry'&&new URL(s.source_url).pathname==='/')!;
   assert.equal(service.attribution(job,root,'official_website').accepted,false,org+' '+variant);
  }finally{store.close();}
 }
});
