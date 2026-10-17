import {setTimeout as pause} from 'node:timers/promises';

// This is only for creating an EMPTY eve session. Never retry send() or a
// possibly billed search this way: their durable receipts must be inspected.
export async function retryIdleCreation<T>(create:()=>Promise<T>,signal:AbortSignal,wait:(attempt:number)=>Promise<unknown>=attempt=>pause(250*attempt,undefined,{signal})):Promise<T>{
 for(let attempt=0;;attempt++){
  signal.throwIfAborted();
  try{return await create();}catch(error){
   let current=error,description='';
   for(let depth=0;depth<3&&current instanceof Error;depth++){description+=' '+current.message;current=current.cause;}
   if(attempt>=2||signal.aborted||!/ECONNRESET|ECONNREFUSED|UND_ERR_SOCKET|socket hang up|fetch failed/i.test(description))throw error;
   await wait(attempt+1);
  }
 }
}
