import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MessageResponse,type MessageStreamEvent,type CancelSessionResult} from 'eve/client';
import {Store} from '../src/store.ts';
import {resilientFirstTurn} from '../src/model-turn.ts';

const step:MessageStreamEvent={type:'step.completed',meta:{id:'step-0',at:'2026-10-16T00:00:00Z'},data:{finishReason:'tool-calls',sequence:0,stepIndex:0,turnId:'turn-0',usage:{inputTokens:100,outputTokens:20}}};
const result:MessageStreamEvent={type:'result.completed',meta:{id:'result-0',at:'2026-10-16T00:00:01Z'},data:{result:{claims:[]},sequence:1,stepIndex:0,turnId:'turn-0'}};
const empty:MessageStreamEvent={type:'session.completed',meta:{id:'empty-0',at:'2026-10-16T00:00:02Z'},data:{usage:{inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0}}};
const cancel=async():Promise<CancelSessionResult>=>({status:'no_active_turn'});
function response(events:readonly MessageStreamEvent[],fail=false){return new MessageResponse<unknown>({sessionId:'test',cancelTurn:cancel,createStream:async function*(){yield*events;if(fail)throw new Error('read ECONNRESET')}})}
function fixture(){
 const store=new Store(':memory:'),job=store.createJob('999111222','transport-test','eve');
 let sends=0,snapshots=0,retirements=0,replacements=0,follows=0;const notes:string[]=[];
 const recovery={sessionId:()=>replacements?'replacement':'initial',snapshot:async():Promise<readonly MessageStreamEvent[]>=>{snapshots++;return[]},retire:async()=>{retirements++},replaceEmpty:async()=>{replacements++},follow:async function*():AsyncGenerator<MessageStreamEvent,void,unknown>{follows++;yield result},cancel,note:(message:string)=>notes.push(message)};
 return{store,job,recovery,notes,send:async()=>{sends++;return response([step],true)},counts:()=>({sends,snapshots,retirements,replacements,follows})};
}
test('a transport disconnect recovers the durable result without resending or double-counting usage',async()=>{
 const f=fixture();f.recovery.snapshot=async()=>[step,result];
 try{const output=await resilientFirstTurn(f.send,f.recovery,f.store,f.job.id,AbortSignal.timeout(1000));assert.deepEqual(output.data,{claims:[]});assert.equal(f.counts().sends,1);assert.equal(f.counts().retirements,0);assert.equal(f.counts().replacements,0);assert.deepEqual(f.store.modelUsage(f.job.id),{steps:1,input_tokens:100,output_tokens:20,cache_read_tokens:0,reported_cost_usd:0,cost_reported_steps:0});}finally{f.store.close()}
});
test('an active accepted turn reconnects its existing stream and never resends the turn',async()=>{
 const f=fixture();f.recovery.snapshot=async()=>[step];f.recovery.follow=async function*(){yield step;yield result};
 try{const output=await resilientFirstTurn(f.send,f.recovery,f.store,f.job.id,AbortSignal.timeout(1000));assert.deepEqual(output.data,{claims:[]});assert.equal(f.counts().sends,1);assert.equal(f.counts().replacements,0);assert.deepEqual(f.store.modelUsage(f.job.id),{steps:1,input_tokens:100,output_tokens:20,cache_read_tokens:0,reported_cost_usd:0,cost_reported_steps:0});}finally{f.store.close()}
});
test('only a retired session proven empty before and after retirement permits a replacement send',async()=>{
 const f=fixture();let snapshots=0,sends=0;f.recovery.snapshot=async()=>++snapshots===1?[]:[empty];
 try{const output=await resilientFirstTurn(async()=>{sends++;if(sends===1)throw new Error('read ECONNRESET');return response([result])},f.recovery,f.store,f.job.id,AbortSignal.timeout(1000));assert.deepEqual(output.data,{claims:[]});assert.equal(sends,2);assert.equal(f.counts().retirements,1);assert.equal(f.counts().replacements,1);assert.equal(snapshots,2);}finally{f.store.close()}
});
test('an ended session with model history must not create another potentially billed turn',async()=>{
 const f=fixture();f.recovery.snapshot=async()=>[step,empty];
 try{await assert.rejects(resilientFirstTurn(f.send,f.recovery,f.store,f.job.id,AbortSignal.timeout(1000)),/ECONNRESET/);assert.equal(f.counts().sends,1);assert.equal(f.counts().replacements,0);}finally{f.store.close()}
});
test('a message appearing during retirement prevents a replacement send',async()=>{
 const f=fixture();let snapshots=0,sends=0;f.recovery.snapshot=async()=>++snapshots===1?[]:[step,empty];
 try{await assert.rejects(resilientFirstTurn(async()=>{sends++;throw new Error('read ECONNRESET')},f.recovery,f.store,f.job.id,AbortSignal.timeout(1000)),/ECONNRESET/);assert.equal(sends,1);assert.equal(f.counts().retirements,1);assert.equal(f.counts().replacements,0);}finally{f.store.close()}
});
