import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertResumeRun,verificationResume} from '../src/verification-resume.ts';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical,hash} from '../src/domain.ts';
import {Store} from '../src/store.ts';
import {ResearchService} from '../src/service.ts';
import {config} from '../src/config.ts';

const run={status:'running',mode:'eve',model_provider:'chatgpt',model:'gpt-6-luna',exa_transport:'codex',input_count:2,organisations:['123','456'],started_at:'2026-10-17T00:00:00Z'};
test('continuation admits only the same interrupted keyless cohort',()=>{
  assert.equal(assertResumeRun(run,['123','456']),run.started_at);
  for(const r of [{...run,status:'finished'},{...run,model_provider:'openai'},{...run,exa_transport:'api'},{...run,input_count:3},undefined])assert.throws(()=>assertResumeRun(r,['123','456']));
  assert.throws(()=>assertResumeRun(run,['456','123']));
  assert.throws(()=>assertResumeRun(run,['123','999']));
});
test('resume receipt rejects live processes, changed profiles and changed input',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'signalpost-resume-')),path=join(dir,'store.sqlite'),receipt=join(dir,'receipt.json'),store=new Store(path);
  try{
    store.saveRun('r',run);
    store.db.prepare('INSERT INTO profiles VALUES(?,?,?,?)').run('123','r',run.started_at,'{}');
    const rows=store.db.prepare('SELECT org,body FROM profiles WHERE run=? ORDER BY org').all('r');
    const base={run_id:'r',input_sha256:'input',quality_certified:false,prior_pid:2147483647,saved_profiles_sha256:hash(canonical(rows))};
    await writeFile(receipt,JSON.stringify(base));
    assert.equal((await verificationResume(path,'r',['123','456'],receipt,'input')).saved_profiles,1);
    await assert.rejects(verificationResume(path,'r',['123','456'],receipt,'changed'),/Invalid/);
    await writeFile(receipt,JSON.stringify({...base,prior_pid:process.pid}));
    await assert.rejects(verificationResume(path,'r',['123','456'],receipt,'input'),/still alive/);
    await writeFile(receipt,JSON.stringify(base));store.db.prepare('UPDATE profiles SET body=?').run('{"changed":true}');
    await assert.rejects(verificationResume(path,'r',['123','456'],receipt,'input'),/profiles changed/);
  }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
test('continuation retries interrupted unpaid GET once and never a pending search',async()=>{
  const store=new Store(':memory:'),service=new ResearchService(store,{...config(),exaTransport:'codex'}),job=store.createJob('123','resume','eve');let gets=0,searches=0;
  try{
    store.reserve(job.id,'get','registry',0,10,20);store.reserve(job.id,'paid','search',0,10,20);
    await assert.rejects(service.call(job,'get','registry',0,async()=>{gets++;return{};}),/Interrupted request/);
    service.resumeInterruptedUnpaidGets=true;
    const perform=async()=>{gets++;return{ok:true};};
    assert.deepEqual(await service.call(job,'get','registry',0,perform),{ok:true});
    await service.call(job,'get','registry',0,perform);assert.equal(gets,1);
    assert.equal(store.call(job.id,'get')?.state,'pending');
    assert.equal(store.call(job.id,'get#resume-unpaid=1')?.state,'completed');
    await assert.rejects(service.call(job,'paid','search',0,async()=>{searches++;return{};}),/possibly billed/);assert.equal(searches,0);
    store.reserve(job.id,'other#resume-unpaid=1','html',0,10,20);
    await assert.rejects(service.call(job,'other#resume-unpaid=1','html',0,perform),/possibly billed/);
  }finally{store.close();}
});
test('completion after a failed timebox requires the sealed failed receipt and remains uncertified',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'signalpost-completion-')),path=join(dir,'store.sqlite'),receipt=join(dir,'receipt.json'),failed=join(dir,'failed.json'),store=new Store(path);
 const organisations=Array.from({length:1000},(_,i)=>String(100000000+i));
 try{
  store.saveRun('r',{...run,input_count:1000,organisations,started_at:'2026-10-17T00:00:00Z'});
  const failure=JSON.stringify({exit_code:1,output_count:0,quality_certified:false,runtime_unchanged:true});await writeFile(failed,failure);
  const base={run_id:'r',input_sha256:'input',quality_certified:false,prior_pid:2147483647,saved_profiles_sha256:hash(canonical([])),phase:'completion_after_failed_measurement',failed_process_receipt:failed,failed_process_receipt_sha256:hash(failure)};
  await writeFile(receipt,JSON.stringify(base));
  const context=await verificationResume(path,'r',organisations,receipt,'input');assert.equal(context.max_campaign_seconds,7200);assert.equal(context.certified,false);assert.equal(context.completion_after_failed_measurement,true);
  await writeFile(receipt,JSON.stringify({...base,failed_process_receipt_sha256:'changed'}));await assert.rejects(verificationResume(path,'r',organisations,receipt,'input'),/immutable failed/);
  await writeFile(receipt,JSON.stringify(base));await writeFile(failed,JSON.stringify({exit_code:0,output_count:1000,quality_certified:true,runtime_unchanged:true}));await assert.rejects(verificationResume(path,'r',organisations,receipt,'input'),/immutable failed/);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
