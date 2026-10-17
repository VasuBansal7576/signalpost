import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {Store} from '../src/store.ts';
import {ResearchService} from '../src/service.ts';
import {config,loadEnv} from '../src/config.ts';
import {startEve,researchWithEve} from '../src/eve.ts';
import {canonical,hash,type Envelope} from '../src/domain.ts';
import {monitorMemory} from '../src/metrics.ts';

loadEnv();const dir=process.argv[2]??'out/benchmark-web-v5';
const rows:Envelope[]=(await readFile(dir+'/results.jsonl','utf8')).trim().split('\n').map(line=>JSON.parse(line));
const report=JSON.parse(await readFile(dir+'/report.json','utf8'));
const store=new Store(config().db),service=new ResearchService(store),memory=monitorMemory();
const eligible=rows.filter(p=>p.errors.some(e=>e.code==='research_failed')).map(p=>{
 const row=store.db.prepare('SELECT body FROM jobs WHERE org=? AND run=?').get(p.organisation_number,p.run.run_id);
 if(!row||typeof row.body!=='string')throw new Error('Missing job');const job=JSON.parse(row.body);
 if(store.receipt(job.id)||store.modelResult(job.id))throw new Error('An existing model receipt requires inspection; recovery will not submit another model message');
 return {profile:p,job};
});
if(!eligible.length){memory.stop();store.close();console.log('No unstarted model jobs require recovery.');}
else{
 await copyFile(dir+'/report.json',dir+'/report.collection.json');await copyFile(dir+'/results.jsonl',dir+'/results.collection.jsonl');
 const started=Date.now(),run=String(report.run_id);let eve:Awaited<ReturnType<typeof startEve>>|undefined;
 const outcomes:unknown[]=[];
 try{
  store.saveRun(run,{...store.run(run),status:'running',phase:'model-recovery'});
  eve=await startEve(dir+'/recovery-eve.log');
  for(const {profile,job:oldJob}of eligible){
   const job={...oldJob,deadline_at:new Date(Date.now()+240000).toISOString()};
   store.db.prepare('UPDATE jobs SET body=? WHERE id=?').run(JSON.stringify(job),job.id);
   const before=store.usage(job.id),anchor=service.identitySource(job);if(!anchor)throw new Error('Frozen identity missing');
   store.event(run,job.organisation_number,'recovery','Retrying model research: original empty-session creation failed before a model message was sent');
   const baseline=await service.registry(job,JSON.parse(anchor.text),anchor.source_url);
   const proposals=await researchWithEve(eve.client,store,job,240000);
   const replacement=service.finalize(job,baseline,proposals);
   rows[rows.indexOf(profile)]=replacement;
   outcomes.push({organisation_number:job.organisation_number,original_errors:profile.errors,requests_added:store.usage(job.id).requests-before.requests,recovered:!replacement.errors.some(e=>e.code==='research_failed')});
   store.event(run,job.organisation_number,'finished','Model recovery finished; original source evidence retained');
  }
  await eve.stop();eve=undefined;
  const elapsed=Date.now()-started,durations=rows.map(p=>p.operations.runtime_ms).sort((a,b)=>a-b);
  report.collection_elapsed_ms=report.elapsed_ms;report.recovery_elapsed_ms=elapsed;report.elapsed_ms+=elapsed;
  report.recovery={method:'Only jobs with no saved model receipt/result; existing job sources reused, no original model message repeated',code_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),outcomes,note:'Reported elapsed time is collection execution plus measured recovery execution. Human inspection time between phases is excluded.'};
  report.company_runtime_ms={p50:durations[50],p95:durations[95],max:durations.at(-1)};
  report.field_coverage=Object.fromEntries([...new Set(rows.flatMap(p=>p.claims.map(c=>c.field)))].map(f=>[f,rows.filter(p=>p.claims.some(c=>c.field===f&&c.availability==='available')).length]));
  for(const [key,field]of [['requests','requests'],['known_exa_cost_usd','known_exa_cost_usd'],['model_input_tokens','model_input_tokens'],['model_output_tokens','model_output_tokens'],['model_cost_usd','model_cost_usd'],['third_party_cost_usd','third_party_cost_usd']]as const){report[key]=rows.every(p=>p.operations[field]!==null)?rows.reduce((n,p)=>n+(p.operations[field]??0),0):null;}
  report.errors_by_code=Object.fromEntries([...new Set(rows.flatMap(p=>p.errors.map(e=>e.code)))].map(code=>[code,rows.reduce((n,p)=>n+p.errors.filter(e=>e.code===code).length,0)]));
  report.terminal_statuses=Object.fromEntries(['completed','partial','failed'].map(status=>[status,rows.filter(p=>p.run.terminal_status===status).length]));
  report.changes=rows.reduce((n,p)=>n+p.changes.length,0);report.result_sha256=hash(rows.map(p=>canonical(p)).join('\n'));
  report.process_max_rss_kib=Math.max(report.process_max_rss_kib,process.resourceUsage().maxRSS);
  report.peak_sampled_process_tree_rss_kib=Math.max(report.peak_sampled_process_tree_rss_kib??0,memory.value()??0);
  report.process_user_cpu_ms+=process.resourceUsage().userCPUTime/1000;report.process_system_cpu_ms+=process.resourceUsage().systemCPUTime/1000;
  await writeFile(dir+'/results.jsonl',rows.map(p=>JSON.stringify(p)).join('\n')+'\n',{mode:0o600});
  await writeFile(dir+'/report.recovered.json',JSON.stringify(report,null,2)+'\n');await writeFile(dir+'/report.json',JSON.stringify(report,null,2)+'\n');
  store.saveRun(run,{...store.run(run),status:'finished',phase:'complete',completed_at:new Date().toISOString(),report});
  console.log(JSON.stringify({recovery_ms:elapsed,outcomes,coverage:report.field_coverage},null,2));
 }finally{memory.stop();await eve?.stop();store.close();}
}
