import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {Store} from '../src/store.ts';
import {RunController,pipeline} from '../src/runtime.ts';
const limits=()=>({deadline:Date.now()+10000,finalizationMs:1000,requests:3,networkConcurrency:3,perHostConcurrency:1,modelRpm:60,modelTpm:100000,modelEquivalentUsd:1,maxRssMiB:4096});
test('physical request admission is shared, host-bounded and cannot overshoot',async()=>{
 const store=new Store(':memory:'),c=new RunController(store,'budget',limits());let active=0,peak=0;
 try{const results=await Promise.allSettled(Array.from({length:6},()=>c.network('same.example',c.signal,async()=>{active++;peak=Math.max(active,peak);await sleep(5);active--;return 1;})));assert.equal(peak,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,3);assert.equal(c.report().physical_requests,3);assert.equal(store.resources('budget').requests,3);}finally{c.close();store.close();}
});
test('work deadline cancels a waiting request while reserving finalisation time',async()=>{
 const store=new Store(':memory:'),c=new RunController(store,'deadline',{...limits(),deadline:Date.now()+120,finalizationMs:90});
 try{await sleep(50);await assert.rejects(c.network('example.com',c.signal,async()=>1),/deadline|reserve/i);assert.equal(c.report().physical_requests,0);}finally{c.close();store.close();}
});
test('pipeline starts ready research before a slow unrelated baseline completes',async()=>{
 const events:string[]=[];await pipeline(['slow','fast','third'],2,2,async org=>{if(org==='slow')await sleep(40);events.push('baseline:'+org);return org;},async org=>{events.push('research:'+org);});assert.ok(events.indexOf('research:fast')<events.indexOf('baseline:slow'));assert.equal(events.filter(x=>x.startsWith('research:')).length,3);
});
test('resource reservation is conservative until a measured result settles it',()=>{
 const s=new Store(':memory:');try{s.reserveResource('r','model',.8,1);assert.throws(()=>s.reserveResource('r','model',.3,1));s.settleResource('r','model',.8,.1);s.reserveResource('r','model',.3,1);assert.ok(Math.abs(s.resources('r').model!-.4)<1e-9);}finally{s.close();}
});
test('Retry-After holds subsequent host admission without holding unrelated hosts',async()=>{
 const s=new Store(':memory:'),c=new RunController(s,'cooldown',limits());const start=Date.now();
 try{c.observeResponse('busy.example',429,'0.1');let fast=0;await Promise.all([c.network('busy.example',c.signal,async()=>{assert.ok(Date.now()-start>=90);}),c.network('ready.example',c.signal,async()=>{fast=Date.now()-start;})]);assert.ok(fast<80);}finally{c.close();s.close();}
});
test('a local source adapter can share global admission without inheriting a publisher host cap',async()=>{
 const s=new Store(':memory:'),c=new RunController(s,'relay',limits());let n=0,peak=0;
 try{await Promise.all(Array.from({length:3},()=>c.network('127.0.0.1',c.signal,async()=>{n++;peak=Math.max(peak,n);await sleep(5);n--;},3)));assert.equal(peak,3);assert.equal(c.report().physical_requests,3);}finally{c.close();s.close();}
});
test('completed search usage releases unused TPM reservation while uncertain calls retain it',async()=>{const s=new Store(':memory:'),c=new RunController(s,'quota-settlement',{...limits(),modelTpm:100});try{const first=await c.modelQuota(80,c.signal);c.settleModelQuota(first,10);const second=await c.modelQuota(80,AbortSignal.timeout(50));assert.equal(second.tokens,80);await assert.rejects(c.modelQuota(20,AbortSignal.timeout(20)),/abort|timeout/i);}finally{c.close();s.close();}});
test('snapshot lookup uses a per-job index rather than scanning the growing corpus',()=>{const store=new Store(':memory:');try{const plan=store.db.prepare('EXPLAIN QUERY PLAN SELECT body FROM snapshots WHERE job=? ORDER BY rowid').all('fixture');assert.ok(plan.some(row=>String(row.detail).includes('snapshots_job')));}finally{store.close();}});
