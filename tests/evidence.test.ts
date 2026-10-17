import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.ts';
import { ResearchService, hasOrganisationNumber, publicUrl, namesEntity } from '../src/service.ts';
import { demoResearch } from '../src/demo.ts';
import { materialChanges, type Proposal } from '../src/domain.ts';

test('only exact preserved extractive quotes pass, snapshots cannot cross company jobs', () => {
  const store = new Store(':memory:'), service = new ResearchService(store);
  try {
    const job = store.createJob('999111222', 'a', 'demo'), fixture = demoResearch(service, job);
    const proposal = fixture.proposals[0]!;
    assert.equal(service.verify(job.id, proposal).accepted, true);
    assert.equal(service.verify(job.id, { ...proposal, quote: 'A fabricated statement about this company.' }).accepted, false);
    assert.equal(service.verify(job.id, { ...proposal, value: 'We sell insurance.' }).accepted, false);
    assert.equal(service.verify(job.id, { ...proposal, effective_date: '2026-10-15' }).accepted, false);
    const byline=service.save(job,'https://company.example.org/news','18/10/2024 av Mikael Thorsgaard','fixture');
    assert.equal(service.verify(job.id,{field:'public_activity',value:byline.text,quote:byline.text,snapshot_id:byline.id,effective_date:null}).accepted,false);
    const other = store.createJob('999111233', 'a', 'demo');
    assert.throws(() => service.verify(other.id, proposal), /does not belong/);
  } finally { store.close(); }
});

test('an external company page needs the exact entity registry domain before publication', async () => {
  const store = new Store(':memory:');
  let text = 'Acme AS builds monitoring software. Organisation number 999111233.';
  let requests = 0;
  const request: typeof fetch = async () => { requests++; return Response.json({results:[{url:'https://acme.no/about',text}],costDollars:{total:.001}}); };
  const service = new ResearchService(store, { db: ':memory:', exaKey:'test', maxExaUsd:1,maxSearches:2,maxPages:5 }, request);
  try {
    const job = store.createJob('999111222','a','eve');
    service.save(job, 'https://data.brreg.no/enhetsregisteret/api/enheter/999111222', JSON.stringify({navn:'Acme AS',organisasjonsnummer:'999111222',hjemmeside:'acme.no'}),'public_registry');
    const wrong=service.save(job,'https://other.no/about',text,'external');
    const proposal: Proposal = {field:'business_description',value:'builds monitoring software',quote:'Acme AS builds monitoring software.',snapshot_id:wrong.id,effective_date:null};
    assert.equal(service.verify(job.id,proposal).accepted,false);
    text = 'Acme AS builds monitoring software. Organisation number 999 111 222.';
    const legal = await service.read(job.id, 'https://acme.no/legal');
    assert.equal(legal.identity_verified,true);
    assert.equal(service.verify(job.id,{...proposal,snapshot_id:legal.snapshot_id}).accepted,true);
    await service.read(job.id, 'https://acme.no/legal');
    assert.equal(requests,1,'same job and request replays its persisted response');
    assert.equal(store.usage(job.id).cost,.001);
  } finally {store.close();}
});

test('refresh ignores evidence timestamp churn and reports a supported hiring change', () => {
  const store = new Store(':memory:'), service = new ResearchService(store);
  try {
    const firstJob=store.createJob('999111222','first','demo'), first=demoResearch(service,firstJob);
    const before=service.finalize(firstJob,first.baseline,first.proposals);
    const secondJob=store.createJob('999111222','second','demo'), second=demoResearch(service,secondJob);
    const same=service.finalize(secondJob,second.baseline,second.proposals);
    assert.deepEqual(materialChanges(before,same),[]);
    const thirdJob=store.createJob('999111222','third','demo'), third=demoResearch(service,thirdJob,2);
    const changed=service.finalize(thirdJob,third.baseline,third.proposals);
    assert.deepEqual(changed.changes.map(c=>c.field),['hiring']);
    assert.equal(changed.changes[0]!.previous_evidence_ids.length,1);
    const failed=service.finalize(store.createJob('999111222','failed','demo'),{claims:[],evidence:[],errors:[]},[]);
    assert.deepEqual(materialChanges(changed,failed),[],'a failed fetch does not imply a business change');
    const recoveredJob=store.createJob('999111222','recovered','demo'), recovered=demoResearch(service,recoveredJob,1);
    const afterFailure=service.finalize(recoveredJob,recovered.baseline,recovered.proposals);
    assert.deepEqual(afterFailure.changes.map(c=>c.field),['hiring'],'comparison remembers the last supported fact across a failed refresh');
  } finally {store.close();}
});

test('run budget is shared across companies and an interrupted billed request is not retried', async () => {
  const store=new Store(':memory:'); let requests=0;
  const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:.007,maxSearches:2,maxPages:5},async()=>{requests++;return Response.json({results:[],costDollars:{total:.007}});});
  try {
    const one=store.createJob('999111222','a','eve'), two=store.createJob('999111233','a','eve');
    await service.search(one.id,'Acme AS'); await service.search(one.id,'Acme AS');
    await assert.rejects(service.search(two.id,'Other AS'),/budget exhausted/);
    assert.equal(requests,1);
    store.reserve(two.id,'pending','registry',0,1,20);
    await assert.rejects(service.call(two,'pending','registry',0,async()=>{requests++;return {};}),/Interrupted request/);
    assert.equal(requests,1);
  } finally {store.close();}
});

test('missing registry data never turns into a numeric zero', async()=>{
  const store=new Store(':memory:'), service=new ResearchService(store,undefined,async()=>new Response('',{status:503}));
  try {
    const job=store.createJob('999111222','a','registry');
    const baseline=await service.registry(job);
    assert.equal(baseline.claims.length,6);
    assert.ok(baseline.claims.every(c=>c.value===null && c.availability==='failed'));
    assert.equal(service.finalize(job,baseline,[]).run.terminal_status,'failed');
  } finally {store.close();}
});

test('organisation matching has digit boundaries and source URLs must be public HTTPS',()=>{
  assert.equal(hasOrganisationNumber('NO 999 111 222 MVA','999111222'),true);
  assert.equal(hasOrganisationNumber('19991112223','999111222'),false);
  for(const url of ['http://acme.no','https://127.0.0.1','https://[::1]','https://localhost','https://user:pass@acme.no']) assert.throws(()=>publicUrl(url));
});

test('a shared group/franchise domain does not establish the individual legal entity',()=>{
  assert.equal(namesEntity('Welcome to 7-Eleven. Explore our stores and careers.','BUTIKKDRIFT UMAZABAL GUERRA AS','999111222'),false);
  assert.equal(namesEntity('AAS Elektronikk supplies electronic services.','AAS ELEKTRONIKK AS','999111222'),true);
  assert.equal(namesEntity('Solutions for all companies','SOL AS','999111222'),false);
  assert.equal(namesEntity('Organisasjonsnummer 999 111 222','Any company AS','999111222'),true);
});

test('social account tracking and trailing-slash cleanup is not a business change',()=>{
 const store=new Store(':memory:'),service=new ResearchService(store);
 try{
  const a=store.createJob('999111222','profile-before','demo'),ra=demoResearch(service,a,1),before=service.finalize(a,ra.baseline,ra.proposals);
  const b=store.createJob('999111222','profile-after','demo'),rb=demoResearch(service,b,2),after=service.finalize(b,rb.baseline,rb.proposals);
  before.claims=before.claims.filter(c=>c.field==='hiring').map(c=>({...c,field:'company_owned_profiles',value:'https://www.facebook.com/acme/?checkpoint_src=any'}));
  after.claims=after.claims.filter(c=>c.field==='hiring').map(c=>({...c,field:'company_owned_profiles',value:'https://facebook.com/acme'}));
  assert.deepEqual(materialChanges(before,after),[]);
  after.claims.push({...after.claims[0]!,value:'https://www.instagram.com/acme'});assert.deepEqual(materialChanges(before,after),[],'discovering another linked account does not prove the company created it during this interval');
 }finally{store.close();}
});

test('a shared group footer cannot attribute a parent company event to its Norwegian entity',()=>{
 const store=new Store(':memory:'),service=new ResearchService(store);
 try{
  const job=store.createJob('999111222','activity-scope','eve');
  service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify({organisasjonsnummer:'999111222',navn:'ACME NORGE AS',hjemmeside:'acme.no'}),'public_registry');
  const parent='On 2026-09-01 Acme International won a contract in Sweden.',local='On 2026-09-01 Acme Norge AS won a contract in Bergen.';
  const source=service.save(job,'https://acme.no/news',parent+'\n'+local+'\nContact: ACME NORGE AS, Norway. Org999111222.','external');
  const proposal={field:'public_activity' as const,value:parent,quote:parent,snapshot_id:source.id,effective_date:'2026-09-01'};
  assert.equal(service.verify(job.id,proposal).accepted,false);
  assert.equal(service.verify(job.id,{...proposal,value:local,quote:local}).accepted,true);
 }finally{store.close()}
});
