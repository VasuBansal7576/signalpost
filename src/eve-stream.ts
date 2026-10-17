import {MessageResponse} from 'eve/client';
import {recordModelUsage} from './billing.ts';
import type {Store} from './store.ts';

export function meteredResult<T>(response:MessageResponse<T>,store:Store,job:string,seen=new Set<string>()){
 const metered=new MessageResponse<T>({
  sessionId:response.sessionId,
  cancelTurn:()=>response.cancel(),
  createStream:async function*(){for await(const event of response){if(event.type==='step.completed'&&!seen.has(event.meta.id)){seen.add(event.meta.id);recordModelUsage(store,job,[event]);}yield event;}},
 });
 return metered.result();
}
