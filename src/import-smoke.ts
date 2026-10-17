import { readFile } from 'node:fs/promises';
import { config,loadEnv } from './config.ts';
import { Store } from './store.ts';
import type { Envelope } from './domain.ts';
loadEnv();const store=new Store(config().db);
try{
  const profiles:Envelope[]=(await readFile('submission/smoke-results.jsonl','utf8')).trim().split('\n').map(line=>JSON.parse(line));
  const report=JSON.parse(await readFile('submission/smoke-report.json','utf8')),run=report.run_id;
  if(store.run(run)&&!store.run(run)?.review_only){console.log('The original live run already exists. Its full local evidence was preserved.');}
  else{
    for(const profile of profiles){const job=store.createJob(profile.organisation_number,run,profile.run.mode);job.started_at=profile.run.started_at;job.review_only=true;store.db.prepare('UPDATE jobs SET body=? WHERE id=?').run(JSON.stringify(job),job.id);store.saveProfile(profile);}
    store.saveRun(run,{run_id:run,mode:'eve',status:'finished',review_only:true,input_count:profiles.length,organisations:profiles.map(p=>p.organisation_number),company_names:Object.fromEntries(profiles.map(p=>[p.organisation_number,p.claims.find(c=>c.field==='legal_name')?.value])),started_at:profiles[0]?.run.started_at,completed_at:profiles.map(p=>p.run.completed_at).sort().at(-1),report});
    console.log(`Imported ${profiles.length} recorded live profiles for offline review. No network calls were made; full raw-source caches are not bundled.`);
  }
}finally{store.close();}
