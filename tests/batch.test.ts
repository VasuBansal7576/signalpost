import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readBulk, readOrganisations } from '../src/input.ts';
import { Store } from '../src/store.ts';
import { ResearchService } from '../src/service.ts';
import type { Envelope } from '../src/domain.ts';

test('100 company batch preserves order, replays exactly, and refreshes only material facts', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'signalpost-batch-'));
  try {
    const input=join(dir,'companies.jsonl'), db=join(dir,'store.sqlite'), output=join(dir,'results.jsonl');
    const orgs=Array.from({length:100},(_,i)=>String(900000000+i));
    await writeFile(input,orgs.map(organisation_number=>JSON.stringify({organisation_number})).join('\n'));
    const run=(runId:string,revision='1',out=output)=>{
      const result=spawnSync(process.execPath,['--import','tsx','src/cli.ts','--demo','--organisations',input,'--db',db,'--output',out,'--run-id',runId,'--expected-count','100','--workers','4','--demo-revision',revision],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr); return result;
    };
    run('first'); const original=await readFile(output,'utf8');
    const profiles:Envelope[]=original.trim().split('\n').map(line=>JSON.parse(line));
    assert.deepEqual(profiles.map(p=>p.organisation_number),orgs);
    assert.ok(profiles.every(p=>p.run.terminal_status==='partial' && p.operations.requests===0));
    run('first'); assert.equal(await readFile(output,'utf8'),original);
    run('refresh','2');
    const refreshed:Envelope[]=(await readFile(output,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.ok(refreshed.every(p=>p.changes.length===1 && p.changes[0]!.field==='hiring'));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('JSONL/gzip input keeps duplicates and frozen bulk has distinct provenance',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'signalpost-input-'));
  try {
    const input=join(dir,'companies.jsonl.gz'),csv=join(dir,'bulk.csv.gz');
    await writeFile(input,gzipSync('"999111222"\n{"orgnr":"999111222"}\n'));
    assert.deepEqual(await readOrganisations(input),['999111222','999111222']);
    await writeFile(csv,gzipSync('organisasjonsnummer,navn,hjemmeside\n999111222,Acme AS,acme.no\n999111233,Other AS,other.no\n'));
    const bulk=await readBulk(csv,new Set(['999111222']));assert.equal(bulk.size,1);
    const disguised=join(dir,'bulk.csv');await writeFile(disguised,await readFile(csv));assert.equal((await readBulk(disguised,new Set(['999111222']))).size,1,'gzip is detected without relying on the filename');
    const store=new Store(':memory:');
    try {
      const service=new ResearchService(store,undefined,async()=>Response.json([]));
      const job=store.createJob('999111222','a','registry');
      const baseline=await service.registry(job,bulk.get('999111222'),'urn:signalpost:bulk:sha256:fixture');
      assert.equal(service.identity(job)?.navn,'Acme AS');
      assert.equal(baseline.evidence[0]!.source_url,'urn:signalpost:bulk:sha256:fixture');
    } finally {store.close();}
    await writeFile(join(dir,'bad.jsonl'),'not-an-org');
    await assert.rejects(readOrganisations(join(dir,'bad.jsonl')),/input line 1/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('missing frozen identities produce terminal failures without live substitution',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'signalpost-frozen-'));
 try{
  const input=join(dir,'input.jsonl'),bulk=join(dir,'bulk.csv'),output=join(dir,'output.jsonl');
  await writeFile(input,'"999111222"\n');await writeFile(bulk,'organisasjonsnummer,navn\n999111233,Other AS\n');
  const result=spawnSync(process.execPath,['--import','tsx','src/cli.ts','--registry-only','--organisations',input,'--bulk',bulk,'--db',join(dir,'db.sqlite'),'--output',output,'--run-id','missing-frozen'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const profile:Envelope=JSON.parse((await readFile(output,'utf8')).trim());assert.equal(profile.run.terminal_status,'failed');assert.equal(profile.operations.requests,0);assert.ok(profile.errors.some(e=>e.message.includes('Live identity substitution is disabled')));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('expired jobs cannot issue network requests',async()=>{
  const store=new Store(':memory:');let requests=0;
  try {
    const service=new ResearchService(store,undefined,async()=>{requests++;return Response.json({});});
    const job=store.createJob('999111222','deadline','registry','2000-01-01T00:00:00Z');
    const result=await service.registry(job);
    assert.equal(requests,0);assert.equal(result.errors.length,6);
  }finally{store.close();}
});
