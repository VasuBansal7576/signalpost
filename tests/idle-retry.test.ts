import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retryIdleCreation} from '../src/idle-retry.ts';
test('empty session creation retries transient transport failures but respects errors and cancellation',async()=>{
 let attempts=0;const delays:number[]=[];
 const result=await retryIdleCreation(async()=>{attempts++;if(attempts===1)throw new Error('read ECONNRESET');return {session:'idle'};},AbortSignal.timeout(1000),async n=>{delays.push(n);});
 assert.equal(attempts,2);assert.deepEqual(delays,[1]);assert.deepEqual(result,{session:'idle'});
 attempts=0;await assert.rejects(retryIdleCreation(async()=>{attempts++;throw new Error('Invalid model configuration');},AbortSignal.timeout(1000),async()=>{}),/Invalid model/);assert.equal(attempts,1);
 attempts=0;await assert.rejects(retryIdleCreation(async()=>{attempts++;throw new Error('read ECONNRESET');},AbortSignal.timeout(1000),async()=>{}),/ECONNRESET/);assert.equal(attempts,3);
 attempts=0;const controller=new AbortController();controller.abort();await assert.rejects(retryIdleCreation(async()=>{attempts++;return 1;},controller.signal));assert.equal(attempts,0);
});
