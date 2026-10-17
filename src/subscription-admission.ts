import{existsSync,readFileSync}from'node:fs';import{resolve}from'node:path';
export class SubscriptionAdmissionStopped extends Error{readonly provider_call_started=false;constructor(readonly path:string){super('Subscription admissions are stopped by a preserved guard. No provider call was started; inspect the stop receipt before an explicit manual clearance.');this.name='SubscriptionAdmissionStopped';}}
/** Shared stop survives process boundaries; neither a timer nor a new worker clears it. */
export function assertSubscriptionAdmission(path=process.env.SIGNALPOST_SUBSCRIPTION_ADMISSION_GUARD??resolve('out/semantic-verification/subscription-admission-guard.json')){
 if(!existsSync(path))return;
 try{const receipt=JSON.parse(readFileSync(path,'utf8'));if(receipt.active===false&&receipt.manual_clearance===true)return;}catch{}
 throw new SubscriptionAdmissionStopped(path);
}
