/** Independent FIFO stage queues with count and retained-payload byte bounds. */
class Channel<T>{
 private rows:{value:T;bytes:number}[]=[];private bytes=0;private closed=false;private changed: (()=>void)[]=[];
 constructor(private count:number,private byteLimit:number){}
 private wake(){for(const resolve of this.changed.splice(0))resolve();}
 private wait(){return new Promise<void>(resolve=>this.changed.push(resolve));}
 async put(value:T,bytes:number){if(!Number.isSafeInteger(bytes)||bytes<0||bytes>this.byteLimit)throw Error('Pipeline queue payload exceeds its byte bound; spill before admission');while(!this.closed&&(this.rows.length>=this.count||this.rows.length>0&&this.bytes+bytes>this.byteLimit))await this.wait();if(this.closed)throw Error('Pipeline queue closed');this.rows.push({value,bytes});this.bytes+=bytes;this.wake();}
 async take(){while(!this.rows.length&&!this.closed)await this.wait();const item=this.rows.shift();if(item){this.bytes-=item.bytes;this.wake();}return item?.value;}
 close(){this.closed=true;this.wake();}
}
type Task<T>={org:string;value:T;queued_at:number;bytes:number};
export async function stagedPipeline<T>(items:string[],workers:{registry:number;acquisition:number;extraction:number;review:number;queueBytes:number},prepare:(org:string,at:number)=>Promise<T>,acquire:(org:string,value:T,at:number)=>Promise<T>,extract:(org:string,value:T,at:number)=>Promise<T>,review:(org:string,value:T,at:number)=>Promise<void>,weight:(value:T)=>number){
 for(const n of Object.values(workers))if(!Number.isSafeInteger(n)||n<1)throw Error('Pipeline bounds must be positive integers');
 const acquisition=new Channel<Task<T>>(Math.max(1,workers.acquisition*2),workers.queueBytes),extraction=new Channel<Task<T>>(Math.max(1,workers.extraction*2),workers.queueBytes),reviewQueue=new Channel<Task<T>>(Math.max(1,workers.review*2),workers.queueBytes),channels=[acquisition,extraction,reviewQueue];let index=0,failed:unknown;const queued=Date.now();
 const fail=(error:unknown)=>{failed??=error;for(const c of channels)c.close();};
 const producers=Promise.all(Array.from({length:workers.registry},async()=>{try{while(!failed&&index<items.length){const org=items[index++]!,value=await prepare(org,queued);await acquisition.put({org,value,queued_at:Date.now(),bytes:weight(value)},weight(value));}}catch(e){fail(e);}})).finally(()=>acquisition.close());
 const stage=(input:Channel<Task<T>>,output:Channel<Task<T>>|undefined,count:number,work:(org:string,value:T,at:number)=>Promise<T|void>)=>Promise.all(Array.from({length:count},async()=>{try{while(!failed){const task=await input.take();if(!task)break;const value=await work(task.org,task.value,task.queued_at);if(output){const next=value as T;await output.put({org:task.org,value:next,queued_at:Date.now(),bytes:weight(next)},weight(next));}}}catch(e){fail(e);}})).finally(()=>output?.close());
 await Promise.allSettled([producers,stage(acquisition,extraction,workers.acquisition,acquire),stage(extraction,reviewQueue,workers.extraction,extract),stage(reviewQueue,undefined,workers.review,review)]);if(failed)throw failed;
}
