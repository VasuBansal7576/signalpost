import {parseArgs} from 'node:util';
import {readFile, writeFile, mkdir, access} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {hash, type Envelope} from '../src/domain.ts';
import {enforceKeyless} from '../src/config.ts';
import {assertSubscriptionAdmission} from '../src/subscription-admission.ts';
import {boundedExit} from '../src/bounded-process.ts';
import {reservePilotCampaign} from '../src/quality-campaign.ts';
import {availableClaims, assertReferenceReady, companyHostsFor, evaluateQuality, qualityPolicy, runtimeFingerprint, policyFingerprint, referenceSchema} from '../src/quality-gate.ts';
import {researchFields} from '../src/domain.ts';

const {positionals, values} = parseArgs({allowPositionals:true, options:{directory:{type:'string'}, evidence:{type:'string'}}});
const command = positionals[0], root = resolve(values.directory ?? '');
if (!values.directory || !['run','evaluate','claims'].includes(command ?? '')) throw Error('quality.ts run|evaluate|claims --directory DIR [--evidence predecessor-DIR]');
enforceKeyless();
if (command === 'run') await run();
else if (command === 'claims') {
  const rows: Envelope[] = (await readFile(join(root,'results.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  await writeFile(join(root,'claims-to-review.json'),JSON.stringify(availableClaims(rows),null,2)+'\n',{flag:'wx'});
} else {
  let result;
  try {
    const current = JSON.parse(await readFile(join(root,'report.json'),'utf8'));
    result = await evaluateQuality(root,{code:await runtimeFingerprint(),configuration:current.quality_admission.configuration_sha256});
  } catch(error) {
    result={passed:false,status:'incomplete_or_invalid_evidence',failures:[error instanceof Error?error.message:String(error)],precision:null,families:null,equivalent_usd:null,elapsed_ms:null};
  }
  await writeFile(join(root,'quality-result.json'),JSON.stringify({...result,measured_at:new Date().toISOString(),official_score:null},null,2)+'\n');
  console.log(JSON.stringify(result,null,2)); if (!result.passed) process.exitCode=1;
}

async function run() {
  await mkdir(root,{recursive:true});
  const input = await readFile(join(root,'companies.jsonl'),'utf8');
  const companies: string[] = input.trim().split('\n').map(line=>JSON.parse(line));
  if (companies.some(id=>typeof id!=='string'||!/^\d{9}$/.test(id)) || new Set(companies).size!==companies.length) throw Error('Supply unique bare company identifiers');
  const selection = JSON.parse(await readFile(join(root,'selection.json'),'utf8'));
  if (selection.input_sha256!==hash(input)||selection.company_overlap!==0) throw Error('Frozen fresh selection failed');
  const count=companies.length, stage=count<=qualityPolicy.pilotMax?'pilot':count===100?'100':count===1000?'1000':undefined;
  if (!stage || stage==='pilot'&&count<qualityPolicy.pilotMin) throw Error('Quality stages require12–20,100or1000 companies');
  // A known stop is a measured preflight failure, never an empty successful benchmark.
  try {assertSubscriptionAdmission();}
  catch(error) {
    const result={status:'blocked_before_acquisition',reason:error instanceof Error?error.message:String(error),checked_at:new Date().toISOString(),
      input_sha256:hash(input),input_count:count,provider_calls_started:0,network_calls_started:0,
      accuracy:null,coverage:null,api_equivalent_usd:null,production_latency_ms:null,scale_admission:false};
    await writeFile(join(root,'preflight.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2)); process.exitCode=2; return;
  }
  const referenceText=await readFile(join(root,'reference.json'),'utf8'),reference=referenceSchema.parse(JSON.parse(referenceText));
  const freshnessText=await readFile(join(root,'freshness.json'),'utf8'),freshness=JSON.parse(freshnessText);
  if(!Array.isArray(freshness.excluded_company_ids)||!Array.isArray(freshness.company_hosts)||companies.some(id=>freshness.excluded_company_ids.includes(id)))throw Error('Freshness inventory does not exclude prior company research');
  if(reference.companies.length!==count||new Set(reference.companies.map(c=>c.organisation_number)).size!==count||reference.companies.some(c=>!companies.includes(c.organisation_number)||researchFields.some(field=>c.families[field]!=='reviewed'))) throw Error('Independent all-family reference review must finish before acquisition');
  if(researchFields.some(field=>reference.facts.filter(f=>f.field===field).length<qualityPolicy.referenceFactsPerFamily))throw Error('Reference opportunities do not cover every challenge family; no acquisition admitted');
  if(reference.facts.some(f=>!companies.includes(f.organisation_number)))throw Error('Reference contains another cohort');
  if(new Date(reference.sealed_at).getTime()>=Date.now())throw Error('Reference must already be frozen');
  await assertReferenceReady(root,reference,companies);
  for (const name of ['store.sqlite','cache','results.jsonl','manifest.json','review.json','quality-result.json','attempt.json','runner.log','process-result.json']) {
    try {await access(join(root,name));throw Error('Existing '+name+' would contaminate a fresh quality attempt');}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  // Exclusive attempt marker: no repair/replay can overwrite an evaluated cohort.
  const started=Date.now(), code=await runtimeFingerprint();
  if(stage==='pilot')await reservePilotCampaign(root,companies,code);
  await writeFile(join(root,'attempt.json'),JSON.stringify({stage,started_at:new Date(started).toISOString(),code_sha256:code,policy_sha256:policyFingerprint(),input_sha256:hash(input),reference_sha256:hash(referenceText),max_seconds:qualityPolicy.deadlineSeconds[stage],automatic_retries:0},null,2)+'\n',{flag:'wx'});
  const args=['--import','tsx','src/cli.ts','--keyless','--organisations',join(root,'companies.jsonl'),'--db',join(root,'store.sqlite'),
    '--output',join(root,'results.jsonl'),'--report',join(root,'report.json'),'--cache',join(root,'cache'),
    '--workers','4','--registry-workers','4','--company-timeout-seconds','90','--timeout-seconds',String(qualityPolicy.deadlineSeconds[stage]),
    '--max-requests',String(count*qualityPolicy.maxRequestsPerCompany),'--max-model-equivalent-usd',String(count*qualityPolicy.maxModelUsdPerCompany),
    '--max-search-equivalent-usd',String(count*(qualityPolicy.equivalentUsdPerCompany-qualityPolicy.maxModelUsdPerCompany)),
    ...(values.evidence?['--quality-evidence',resolve(values.evidence)]:[])];
  const log=createWriteStream(join(root,'runner.log'),{flags:'wx',mode:0o600});
  const child=spawn(process.execPath,args,{env:process.env,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  const outcome=await boundedExit(child,qualityPolicy.deadlineSeconds[stage]*1000,5000,process.platform!=='win32').finally(()=>log.end());
  const exit=outcome.code,timedOut=outcome.timed_out;
  const finished=Date.now(),unchanged=code===await runtimeFingerprint();
  await writeFile(join(root,'process-result.json'),JSON.stringify({exit_code:exit,timed_out:timedOut,elapsed_ms:finished-started,runtime_unchanged:unchanged},null,2)+'\n',{flag:'wx'});
  if(exit!==0||timedOut||!unchanged)throw Error('Production run failed; preserve artifacts, do not repair this holdout');
  const report=JSON.parse(await readFile(join(root,'report.json'),'utf8'));
  const db=new DatabaseSync(join(root,'store.sqlite'),{readOnly:true});
  try {
    const metrics=db.prepare('SELECT body FROM operation_metrics').all().map(row=>JSON.parse(String(row.body)));
    const attempts=db.prepare('SELECT body FROM model_attempts').all().map(row=>JSON.parse(String(row.body)));
    const sources=db.prepare('SELECT body FROM snapshots').all().map(row=>JSON.parse(String(row.body)));
    await mkdir(join(root,'sources'),{recursive:true});
    for(const source of sources){if(hash(source.text)!==source.content_sha256)throw Error('Snapshot hash changed');await writeFile(join(root,'sources',source.content_sha256+'.txt'),source.text);}
    const sourceIndexText=JSON.stringify(sources)+'\n';
    await writeFile(join(root,'source-index.json'),sourceIndexText,{flag:'wx'});
    const packetMetrics=metrics.filter(m=>m.stage==='extraction_packet_coverage');
    report.quality_measurements={runtime_unchanged:unchanged,unknown_usage_calls:attempts.filter(a=>['pending','uncertain'].includes(a.state)).length,
      omitted_extraction_spans:packetMetrics.reduce((n,m)=>n+(m.omitted_spans?.length??0),0),
      unfinished_extraction_packets:packetMetrics.reduce((n,m)=>n+Math.max(0,m.packet_count-m.completed_packets),0)};
    const reportText=JSON.stringify(report,null,2)+'\n';await writeFile(join(root,'report.json'),reportText);
    const output=await readFile(join(root,'results.jsonl'),'utf8');
    const companyHosts=companyHostsFor(output.trim().split('\n').map(line=>JSON.parse(line)),sources);
    await writeFile(join(root,'manifest.json'),JSON.stringify({version:1,stage,code_sha256:code,configuration_sha256:report.quality_admission.configuration_sha256,
      policy_sha256:policyFingerprint(),input_sha256:hash(input),reference_sha256:hash(referenceText),output_sha256:hash(output),report_sha256:hash(reportText),
      freshness_sha256:hash(freshnessText),source_index_sha256:hash(sourceIndexText),
      started_at:new Date(started).toISOString(),finished_at:new Date(finished).toISOString(),prior_company_overlap:0,
      prior_host_overlap:companyHosts.filter(host=>freshness.company_hosts.includes(host)).length,
      ...(values.evidence?{previous_evidence:resolve(values.evidence)}:{})},null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:'awaiting_independent_semantic_review',directory:root,input_count:count,elapsed_ms:finished-started,scale_admission:false}));
  } finally {db.close();}
}

