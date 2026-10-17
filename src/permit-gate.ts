/** FIFO concurrency admission; cancelled waiters never consume a permit. */
export class PermitGate{
 private active=0;private pending:{signal:AbortSignal;resolve:(release:()=>void)=>void;reject:(reason:unknown)=>void;abort:()=>void}[]=[];
 constructor(readonly limit:number){if(!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid concurrency bound');}
 private drain(){while(this.active<this.limit&&this.pending.length){const request=this.pending.shift()!;request.signal.removeEventListener('abort',request.abort);if(request.signal.aborted){request.reject(request.signal.reason);continue;}this.active++;let released=false;request.resolve(()=>{if(!released){released=true;this.active--;this.drain();}});}}
 acquire(signal:AbortSignal){signal.throwIfAborted();return new Promise<()=>void>((resolve,reject)=>{const request={signal,resolve,reject,abort:()=>{const index=this.pending.indexOf(request);if(index>=0)this.pending.splice(index,1);reject(signal.reason);this.drain();}};signal.addEventListener('abort',request.abort,{once:true});this.pending.push(request);this.drain();});}
}
