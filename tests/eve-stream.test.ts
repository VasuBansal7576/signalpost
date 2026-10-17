import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MessageResponse,type MessageStreamEvent} from 'eve/client';
import {meteredResult} from '../src/eve-stream.ts';
import {Store} from '../src/store.ts';

test('model usage survives a later stream timeout and successful results are counted once',async()=>{
 const store=new Store(':memory:');
 const step:MessageStreamEvent={type:'step.completed',meta:{id:'step-0',at:'2026-10-15T00:00:00Z'},data:{finishReason:'tool-calls',sequence:0,stepIndex:0,turnId:'turn-0',usage:{inputTokens:100,outputTokens:20}}};
 const response=(fail:boolean)=>new MessageResponse({sessionId:'test',cancelTurn:async()=>({status:'no_active_turn'}),createStream:async function*(){yield step;yield step;if(fail)throw new Error('stream timeout');yield {type:'result.completed',meta:{id:'result-0',at:'2026-10-15T00:00:01Z'},data:{result:{claims:[]},sequence:1,stepIndex:0,turnId:'turn-0'}};}});
 try{
  const failed=store.createJob('999111222','failed-stream','eve');await assert.rejects(meteredResult(response(true),store,failed.id),/stream timeout/);assert.deepEqual(store.modelUsage(failed.id),{steps:1,input_tokens:100,output_tokens:20,cache_read_tokens:0,reported_cost_usd:0,cost_reported_steps:0});
  const successful=store.createJob('999111222','good-stream','eve');const result=await meteredResult(response(false),store,successful.id);assert.deepEqual(result.data,{claims:[]});assert.equal((store.modelUsage(successful.id) as {input_tokens:number}).input_tokens,100);
 }finally{store.close();}
});
