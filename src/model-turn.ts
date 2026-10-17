import {MessageResponse,type MessageStreamEvent,type MessageResult,type CancelSessionResult} from 'eve/client';
import {z} from 'zod';
import {meteredResult} from './eve-stream.ts';
import type {Store} from './store.ts';

type Recovery={
 sessionId:()=>string;
 snapshot:()=>Promise<readonly MessageStreamEvent[]>;
 retire:()=>Promise<void>;
 replaceEmpty:()=>Promise<void>;
 follow:()=>AsyncIterable<MessageStreamEvent>;
 cancel:()=>Promise<CancelSessionResult>;
 note:(message:string)=>void;
};
const emptyCompletion=z.object({type:z.literal('session.completed'),data:z.object({usage:z.object({inputTokens:z.literal(0),outputTokens:z.literal(0),cacheReadTokens:z.literal(0),cacheWriteTokens:z.literal(0)})})});
const demonstrablyEmpty=(events:readonly MessageStreamEvent[])=>events.every(e=>emptyCompletion.safeParse(e).success);
const hasResult=(events:readonly MessageStreamEvent[])=>events.some(e=>e.type==='result.completed');
function transportError(error:unknown){let description='',current=error;for(let i=0;i<4&&current instanceof Error;i++){description+=' '+current.message;current=current.cause;}return /ECONNRESET|ECONNREFUSED|UND_ERR_SOCKET|socket hang up|fetch failed/i.test(description);}

// First turn in a NEW session only. Reconnects READ the same durable stream.
// A send is repeated only after the old session is retired and both snapshots
// prove it contains no accepted message, model/tool step or nonzero usage.
export async function resilientFirstTurn<T>(send:()=>Promise<MessageResponse<T>>,recovery:Recovery,store:Store,job:string,signal:AbortSignal):Promise<MessageResult<T>>{
 const seen=new Set<string>();let operation:()=>Promise<MessageResponse<T>>=send,recreated=false;
 const response=(events?:readonly MessageStreamEvent[])=>new MessageResponse<T>({sessionId:recovery.sessionId(),cancelTurn:recovery.cancel,createStream:async function*(){if(events)yield*events;else yield*recovery.follow();}});
 for(let attempt=0;;attempt++){
  signal.throwIfAborted();
  try{return await meteredResult(await operation(),store,job,seen)}catch(error){
   if(attempt>=2||signal.aborted||!transportError(error))throw error;
   const before=await recovery.snapshot();
   if(hasResult(before)){recovery.note('Recovered the existing durable result; no message was resent');operation=async()=>response(before);continue;}
   if(!demonstrablyEmpty(before)){
    if(before.some(e=>e.type==='session.completed'))throw error;
    recovery.note('Reconnecting the same durable event stream; no message was resent');operation=async()=>response();continue;
   }
   if(recreated)throw error;
   await recovery.retire();
   const after=await recovery.snapshot();
   if(hasResult(after)){recovery.note('Recovered the result found during retirement; no message was resent');operation=async()=>response(after);continue;}
   if(!demonstrablyEmpty(after))throw error;
   recovery.note('Retired an empty session after transport failure; no accepted turn or usage found before or after retirement');
   await recovery.replaceEmpty();recreated=true;operation=send;
  }
 }
}
