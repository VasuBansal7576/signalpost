import{PermitGate}from'./permit-gate.ts';
import {setTimeout as sleep} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import type {Store,Job} from './store.ts';
import {errorMessage} from './domain.ts';

export type RuntimeLimits={deadline:number;finalizationMs:number;requests:number;networkConcurrency:number;perHostConcurrency:number;modelRpm:number;modelTpm:number;modelEquivalentUsd:number;maxRssMiB:number;providerConcurrency?:number};
export type Timing={company:string;stage:string;queued_ms:number;execution_ms:number;status:'completed'|'failed';error?:string};
export class ResourceLimit extends Error {constructor(message:string){super(message);this.name='ResourceLimit';}}

/** One owner for admission, quotas, cancellation and operation measurements. */
export class RunController {
  readonly abort=new AbortController();
  readonly timings:Timing[]=[];
  readonly started=Date.now();
  private timer:NodeJS.Timeout;
  private providerGates=new Map<string,PermitGate>();
  private providerWaitMs=0;
  private networkActive=0;
  private hostActive=new Map<string,number>();
  private hostCooldown=new Map<string,number>();
  observeResponse(host:string,status:number,retryAfter:string|null){if(![429,503].includes(status)||!retryAfter)return;const seconds=Number(retryAfter),until=Number.isFinite(seconds)?Date.now()+Math.max(0,seconds)*1000:Date.parse(retryAfter);if(Number.isFinite(until))this.hostCooldown.set(host,Math.max(this.hostCooldown.get(host)??0,until));}
  private modelWindow:{at:number;tokens:number}[]=[];
  private counters={physical_requests:0,network_wait_ms:0,model_quota_wait_ms:0,model_admissions:0,request_failures:0};
  constructor(readonly store:Store,readonly runId:string,readonly limits:RuntimeLimits){
    this.timer=setTimeout(()=>this.stop('Batch work deadline reached; finalisation reserve retained'),Math.max(1,this.workDeadline-Date.now()));this.timer.unref();
  }
  get workDeadline(){return this.limits.deadline-this.limits.finalizationMs;}
  get signal(){return this.abort.signal;}
  stop(reason:string){if(!this.signal.aborted){this.abort.abort(new ResourceLimit(reason));this.store.event(this.runId,null,'admission_stopped',reason);}}
  close(){clearTimeout(this.timer);}
  check(){
    this.signal.throwIfAborted();
    if(Date.now()>=this.workDeadline){this.stop('Work deadline reached');this.signal.throwIfAborted();}
    if(process.memoryUsage().rss/1048576>this.limits.maxRssMiB){this.stop('Runner RSS limit reached');this.signal.throwIfAborted();}
  }
  remaining(){return Math.max(0,this.workDeadline-Date.now());}
  companySignal(job:Job){return AbortSignal.any([this.signal,AbortSignal.timeout(Math.max(1,Math.min(this.remaining(),job.deadline_at?Date.parse(job.deadline_at)-Date.now():this.remaining())))]);}
  async network<T>(host:string,signal:AbortSignal,perform:()=>Promise<T>,hostLimit=this.limits.perHostConcurrency):Promise<T>{
    const queued=performance.now();
    while(Date.now()<(this.hostCooldown.get(host)??0)||this.networkActive>=this.limits.networkConcurrency||(this.hostActive.get(host)??0)>=hostLimit){this.check();await sleep(20,undefined,{signal:AbortSignal.any([signal,this.signal])});}
    this.check();signal.throwIfAborted();
    // SQLite admission is synchronous and transactional across all workers.
    this.store.reserveResource(this.runId,'requests',1,this.limits.requests);
    this.counters.physical_requests++;this.counters.network_wait_ms+=performance.now()-queued;
    this.networkActive++;this.hostActive.set(host,(this.hostActive.get(host)??0)+1);
    try{return await perform();}catch(error){this.counters.request_failures++;throw error;}finally{this.networkActive--;this.hostActive.set(host,(this.hostActive.get(host)??1)-1);}
  }
  async providerExecution<T>(provider:string,signal:AbortSignal,perform:()=>Promise<T>):Promise<T>{
    let gate=this.providerGates.get(provider);if(!gate){gate=new PermitGate(this.limits.providerConcurrency??2);this.providerGates.set(provider,gate);}const at=performance.now(),release=await gate.acquire(signal);this.providerWaitMs+=performance.now()-at;
    try{this.check();signal.throwIfAborted();return await perform();}finally{release();}
  }
  async modelQuota(tokens:number,signal:AbortSignal){
    if(tokens>this.limits.modelTpm)throw new ResourceLimit('A single model packet exceeds the configured TPM allowance');
    const queued=performance.now();
    for(;;){this.check();const at=Date.now();this.modelWindow=this.modelWindow.filter(x=>at-x.at<60000);if(this.modelWindow.length<this.limits.modelRpm&&this.modelWindow.reduce((n,x)=>n+x.tokens,0)+tokens<=this.limits.modelTpm){const reservation={at,tokens};this.modelWindow.push(reservation);this.counters.model_admissions++;this.counters.model_quota_wait_ms+=performance.now()-queued;return reservation;}await sleep(Math.min(250,Math.max(10,60000-(at-this.modelWindow[0]!.at))),undefined,{signal:AbortSignal.any([signal,this.signal])});}
  }
  settleModelQuota(reservation:{at:number;tokens:number},actual:number){if(!Number.isFinite(actual)||actual<0)throw Error('Invalid measured model tokens');reservation.tokens=Math.ceil(actual);}
  async stage<T>(company:string,stage:string,queuedAt:number,perform:()=>Promise<T>):Promise<T>{
    const start=performance.now();let status:Timing['status']='completed',message:string|undefined;
    try{this.check();return await perform();}catch(error){status='failed';message=errorMessage(error);throw error;}finally{const timing:Timing={company,stage,queued_ms:Math.max(0,Date.now()-(performance.now()-start)-queuedAt),execution_ms:performance.now()-start,status,...(message?{error:message}:{})};this.timings.push(timing);this.store.operation(this.runId,company,timing);}
  }
  report(){
    const percentiles=(v:number[])=>{const a=v.toSorted((x,y)=>x-y);const p=(q:number)=>a.length?a[Math.min(a.length-1,Math.floor(a.length*q))]:null;return{p50:p(.5),p95:p(.95),p99:p(.99),max:a.at(-1)??null};};
    return{limits:{...this.limits,deadline:new Date(this.limits.deadline).toISOString()},...this.counters,provider_concurrency:this.limits.providerConcurrency??2,provider_wait_ms:this.providerWaitMs,admission_stopped:this.signal.aborted,stop_reason:this.signal.aborted?errorMessage(this.signal.reason):null,stages:Object.fromEntries([...new Set(this.timings.map(t=>t.stage))].map(stage=>{const ts=this.timings.filter(t=>t.stage===stage);return[stage,{count:ts.length,failures:ts.filter(t=>t.status==='failed').length,queue_ms:percentiles(ts.map(t=>t.queued_ms)),execution_ms:percentiles(ts.map(t=>t.execution_ms))}];})),resource_ledger:this.store.resources(this.runId)};
  }
}

/** Bounded pipeline: baselines keep flowing while ready companies research. */
export async function pipeline<T>(items:string[],registryWorkers:number,researchWorkers:number,baseline:(org:string,queuedAt:number)=>Promise<T>,research:(org:string,value:T,queuedAt:number)=>Promise<void>){
  let index=0,producers=registryWorkers,failed=false;const ready:{org:string;value:T;at:number}[]=[];const queuedAt=Date.now();
  const producersDone=Promise.all(Array.from({length:registryWorkers},async()=>{try{while(!failed&&index<items.length){const org=items[index++]!;const value=await baseline(org,queuedAt);ready.push({org,value,at:Date.now()});while(!failed&&ready.length>Math.max(4,researchWorkers*2))await sleep(5);}}catch(e){failed=true;throw e;}finally{producers--;}}));
  const consumers=Promise.all(Array.from({length:researchWorkers},async()=>{try{while(!failed&&(producers||ready.length)){const task=ready.shift();if(!task){await sleep(5);continue;}await research(task.org,task.value,task.at);}}catch(e){failed=true;throw e;}}));
  const outcomes=await Promise.allSettled([producersDone,consumers]);const failure=outcomes.find(x=>x.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
}
