import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {canonical,hash} from './domain.ts';

/** An interrupted measurement may continue; it cannot become quality certification. */
export function assertResumeRun(run:unknown,organisations:string[]) {
  const r=run as Record<string,unknown>|undefined;
  if(!r||r.status!=='running'||r.mode!=='eve'||r.model_provider!=='chatgpt'||r.model!=='gpt-6-luna'||r.exa_transport!=='codex'||r.input_count!==organisations.length||canonical(r.organisations)!==canonical([...new Set(organisations)]))throw Error('Resume requires the same interrupted full keyless cohort and run ID');
  if(typeof r.started_at!=='string'||!Number.isFinite(Date.parse(r.started_at)))throw Error('Resume lacks the original start time');
  return r.started_at;
}
export async function verificationResume(path:string,runId:string,organisations:string[],receiptPath:string,inputSha:string) {
  const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
  if(receipt.run_id!==runId||receipt.input_sha256!==inputSha||receipt.quality_certified!==false||!Number.isSafeInteger(receipt.prior_pid)||receipt.prior_pid<1)throw Error('Invalid interrupted measurement receipt');
  try{process.kill(receipt.prior_pid,0);throw Error('Prior measurement process is still alive');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    const row=db.prepare('SELECT body FROM runs WHERE id=?').get(runId);
    const startedAt=assertResumeRun(row?JSON.parse(String(row.body)):undefined,organisations);
    const profiles=db.prepare('SELECT org,body FROM profiles WHERE run=? ORDER BY org').all(runId);
    if(receipt.saved_profiles_sha256!==hash(canonical(profiles)))throw Error('Saved measurement profiles changed before continuation');
    let maxCampaignSeconds=organisations.length===100?1200:5400;
    const completion=receipt.phase==='completion_after_failed_measurement';
    if(completion){
      if(organisations.length!==1000||Date.now()<Date.parse(startedAt)+5400000||typeof receipt.failed_process_receipt!=='string')throw Error('Completion recovery requires an expired failed1000-company measurement');
      const raw=await readFile(receipt.failed_process_receipt,'utf8'),failure=JSON.parse(raw);
      if(hash(raw)!==receipt.failed_process_receipt_sha256||failure.exit_code!==1||failure.output_count!==0||failure.quality_certified!==false||failure.runtime_unchanged!==true)throw Error('Completion recovery lacks an immutable failed measurement receipt');
      maxCampaignSeconds=7200;
    }else if(receipt.phase!==undefined)throw Error('Unknown measurement continuation phase');
    return {started_at:startedAt,saved_profiles:profiles.length,receipt:receiptPath,certified:false,max_campaign_seconds:maxCampaignSeconds,completion_after_failed_measurement:completion};
  }finally{db.close();}
}
