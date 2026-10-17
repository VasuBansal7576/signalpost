import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, mkdir, writeFile, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { config, loadEnv } from './config.ts';
import { Store } from './store.ts';
import { hash, type Envelope } from './domain.ts';
import { getPath } from './financials.ts';
import {hasPopulatedField,hasHiringSignal,isNavCheck,hiringObservations} from './coverage.ts';
import {qualityPolicy} from './quality-gate.ts';
import {assertSubscriptionAdmission} from './subscription-admission.ts';
import {boundedExit} from './bounded-process.ts';

loadEnv();
const store=new Store(config().db), token=randomBytes(24).toString('hex');
const port=Number(process.env.SIGNALPOST_UI_PORT??4317);
const fields=['official_website','business_description','financials','financial_history','leadership','workplaces','hiring','company_owned_profiles','public_activity','public_reputation'];
const jsonBody=z.object({body:z.string()});
function profiles(run:string):Envelope[]{return store.db.prepare('SELECT body FROM profiles WHERE run=? ORDER BY org').all(run).map(row=>JSON.parse(jsonBody.parse(row).body));}
function orderedProfiles(run:string):Envelope[]{const all=profiles(run),input=store.run(run)?.organisations;if(!Array.isArray(input))return all;const byOrg=new Map(all.map(p=>[p.organisation_number,p])),ordered=input.flatMap(org=>typeof org==='string'&&byOrg.has(org)?[byOrg.get(org)!]:[]),listed=new Set(ordered.map(p=>p.organisation_number));return [...ordered,...all.filter(p=>!listed.has(p.organisation_number))];}
function runs(){
  const registered=store.db.prepare('SELECT id,body FROM runs ORDER BY rowid DESC').all().map(row=>JSON.parse(jsonBody.parse(row).body));
  const ids=new Set(registered.map(r=>r.run_id));
  for(const row of store.db.prepare('SELECT run,COUNT(*) as count,MIN(completed) as completed FROM profiles GROUP BY run ORDER BY completed DESC').all()){
    const r=z.object({run:z.string(),count:z.number(),completed:z.string()}).parse(row);
    if(!ids.has(r.run)){const p=profiles(r.run);registered.push({run_id:r.run,input_count:r.count,organisations:p.map(p=>p.organisation_number),status:'finished',mode:p[0]?.run.mode??'registry',completed_at:r.completed});}
  }
  return registered;
}
function summary(run:string){
  const meta=runs().find(r=>r.run_id===run);if(!meta)return null;
  const results=profiles(run), byOrg=new Map(results.map(p=>[p.organisation_number,p]));
  const jobs=store.db.prepare('SELECT body FROM jobs WHERE run=?').all(run).map(row=>JSON.parse(jsonBody.parse(row).body));
  const jobMap=new Map(jobs.map(j=>[j.organisation_number,j]));
  const events=store.db.prepare('SELECT id,org,at,stage,message FROM events WHERE run=? ORDER BY id DESC LIMIT 80').all(run);
  const orgs:Array<string>=Array.isArray(meta.organisations)?meta.organisations:results.map(p=>p.organisation_number);
  const companies=orgs.map(org=>{
    const p=byOrg.get(org),job=jobMap.get(org),claims=p?.claims??[];
    const available=(field:string)=>hasPopulatedField(p,field)?claims.find(c=>c.field===field&&c.availability==='available'):undefined;
    const identity=job?store.db.prepare("SELECT body FROM snapshots WHERE job=? AND json_extract(body,'$.source_class')='public_registry' ORDER BY rowid LIMIT 1").get(job.id):undefined;
    let name=meta.company_names?.[org]??org;if(identity){try{name=JSON.parse(JSON.parse(jsonBody.parse(identity).body).text).navn??name;}catch{}}
    const stage=events.find(e=>e.org===org)?.stage;
    return {organisation_number:org,name:available('legal_name')?.value??name,status:p?.run.terminal_status??(job?'running':'queued'),stage:stage??(p?'finished':'queued'),available:fields.filter(f=>available(f)).length,total:fields.length,available_fields:[...new Set(claims.filter(c=>hasPopulatedField(p,c.field)).map(c=>c.field))],has_hiring_check:claims.some(isNavCheck),has_hiring_signal:claims.some(hasHiringSignal),cost:p?.operations.known_exa_cost_usd??(job?store.usage(job.id).cost:0),runtime_ms:p?.operations.runtime_ms??(job?Date.now()-Date.parse(job.started_at):0),financial_year:getPath(available('revenue')?.value,['period_end'])??getPath(available('assets')?.value,['period_end'])??null,financial_records:getPath(available('financials')?.value,['records']),errors:p?.errors.length??0,job_id:job?.id};
  });
  const ledger=z.object({requests:z.number(),cost:z.number()}).parse(store.db.prepare('SELECT COUNT(*) as requests,COALESCE(SUM(cost),0) as cost FROM calls JOIN jobs ON jobs.id=calls.job WHERE jobs.run=?').get(run));
  return {run:{...meta,report:{...meta.report,hiring_observations:hiringObservations(results)}},companies:companies.map(({financial_records,...c})=>({...c,has_financials:Array.isArray(financial_records)&&financial_records.length>0})),coverage:fields.map(field=>({field,available:results.filter(p=>hasPopulatedField(p,field)).length,total:orgs.length})),events,operations:meta.review_only?{requests:meta.report?.requests??0,cost:meta.report?.known_exa_cost_usd??0,company_source_requests:meta.report?.company_source_requests??meta.report?.requests??0,shared_nav_requests:meta.report?.shared_nav_requests??0}:{...ledger,requests:ledger.requests+(meta.report?.shared_nav_requests??0),company_source_requests:ledger.requests,shared_nav_requests:meta.report?.shared_nav_requests??0},completed:results.length,error_count:results.reduce((n,p)=>n+p.errors.length,0),financial_records:companies.reduce((n,c)=>n+(Array.isArray(c.financial_records)?c.financial_records.length:0),0)};
}
function send(response:ServerResponse,status:number,data:unknown){response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});response.end(JSON.stringify(data));}
async function body(request:IncomingMessage){let data='';for await(const chunk of request){data+=chunk;if(data.length>100_000)throw new Error('Request too large');}return JSON.parse(data);}
const launchSchema=z.object({organisations:z.array(z.string().regex(/^\d{9}$/)).min(1).max(1000),mode:z.enum(['demo','eve','registry']),workers:z.number().int().min(1).max(8).default(2),budget_usd:z.number().min(0).max(10).default(2),run_id:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,70}$/)});

const server=createServer(async(request,response)=>{
  try{
    const listeningPort=(server.address() as {port:number}|null)?.port??port;
    if(![`127.0.0.1:${listeningPort}`,`localhost:${listeningPort}`].includes(request.headers.host??''))return send(response,403,{error:'Open this workspace on its local dashboard address'});
    const url=new URL(request.url??'/',`http://${request.headers.host}`),parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if(request.method==='GET'&&url.pathname==='/api/config')return send(response,200,{token,keyless:process.env.SIGNALPOST_KEYLESS==='1',source_transport:config().exaTransport??'api',exa_configured:Boolean(config().exaTransport==='mcp'||config().exaTransport==='connector'&&config().exaRelayUrl&&config().exaRelayToken||config().exaKey),model:process.env.SIGNALPOST_MODEL??'gpt-6-luna',provider:process.env.SIGNALPOST_MODEL_PROVIDER??(process.env.OPENAI_API_KEY?'openai':'chatgpt')});
    if(request.method==='GET'&&url.pathname==='/api/runs')return send(response,200,runs());
    if(request.method==='GET'&&parts[0]==='api'&&parts[1]==='runs'&&parts[2]){
      const run=parts[2];
      if(parts[3]==='export'){
        const rows=orderedProfiles(run);if(!rows.length)return send(response,404,{error:'No completed profiles to export yet'});
        response.writeHead(200,{'content-type':'application/x-ndjson','content-disposition':`attachment; filename="signalpost-${run.replace(/[^\w-]/g,'_')}.jsonl"`});response.end(rows.map(p=>JSON.stringify(p)).join('\n')+'\n');return;
      }
      if(parts[3]==='companies'&&parts[4]){
        const org=parts[4],profile=store.profile(org,run),row=store.db.prepare('SELECT body FROM jobs WHERE org=? AND run=?').get(org,run);
        if(!row)return send(response,404,{error:'Company has not started yet'});
        const job=JSON.parse(jsonBody.parse(row).body);
        const calls=store.db.prepare('SELECT kind,state,cost,key FROM calls WHERE job=? ORDER BY rowid').all(job.id);
        return send(response,200,{profile,job,calls,events:store.db.prepare('SELECT id,at,stage,message FROM events WHERE run=? AND org=? ORDER BY id DESC LIMIT 100').all(run,org)});
      }
      const result=summary(run);return send(response,result?200:404,result??{error:'Run not found'});
    }
    if(request.method==='GET'&&parts[0]==='api'&&parts[1]==='sources'&&parts[2]&&parts[3]){
      const source=store.source(parts[2],parts[3]);if(source.extraction_method!=='registry-public-roles-projection/v1'&&source.source_class==='public_registry'&&/\/roller(?:$|[?#])/.test(source.source_url))return send(response,403,{error:'Original leadership response is private; inspect the public role projection linked from the claim.'});return send(response,200,{...source,hash_verified:hash(source.text)===source.content_sha256});
    }
    if(request.method==='POST'&&url.pathname==='/api/runs'){
      if(request.headers['x-signalpost-token']!==token)return send(response,403,{error:'Reload the dashboard before starting a run'});
      if(request.headers.origin&&new URL(request.headers.origin).host!==request.headers.host)return send(response,403,{error:'Origin mismatch'});
      const input=launchSchema.parse(await body(request));
      if(input.mode!=='demo'&&input.organisations.length>qualityPolicy.pilotMax)return send(response,409,{error:'Quality admission denied: scale launches require reviewed pilot/100-company evidence. Use the bounded quality runner; mechanical dashboard results cannot authorize scale.'});
      if(input.mode==='eve'&&process.env.SIGNALPOST_KEYLESS==='1')try{assertSubscriptionAdmission();}catch{return send(response,409,{error:'Subscription acquisition is stopped. Inspect the preserved capacity receipt before another run; no company work was started.'});}
      if(runs().some(r=>r.status==='running'||r.status==='queued'))return send(response,409,{error:'A run is already active. Wait for it to finish.'});
      if(runs().some(r=>r.run_id===input.run_id))return send(response,409,{error:'Choose a new run name'});
      if(input.mode==='eve'&&(config().exaTransport??'api')==='api'&&!config().exaKey)return send(response,400,{error:'EXA_API_KEY is missing. Add it to the local .env file.'});
      const dir=resolve('out',input.run_id);await mkdir(dir,{recursive:true});
      const organisations=[...new Set(input.organisations)],file=join(dir,'companies.jsonl');
      await writeFile(file,organisations.map(org=>JSON.stringify({organisation_number:org})).join('\n')+'\n',{mode:0o600});
      store.saveRun(input.run_id,{run_id:input.run_id,mode:input.mode,status:'queued',started_at:new Date().toISOString(),input_count:organisations.length,organisations,workers:input.workers,max_exa_usd:input.budget_usd});
      const args=['--import','tsx','src/cli.ts','--organisations',file,'--output',join(dir,'results.jsonl'),'--db',config().db,'--run-id',input.run_id,'--workers',String(input.workers)];
      if(input.mode==='eve')args.push('--timeout-seconds',String(qualityPolicy.deadlineSeconds.pilot),'--company-timeout-seconds','90','--max-requests',String(organisations.length*qualityPolicy.maxRequestsPerCompany),'--max-model-equivalent-usd',String(organisations.length*qualityPolicy.maxModelUsdPerCompany),'--max-search-equivalent-usd',String(organisations.length*(qualityPolicy.equivalentUsdPerCompany-qualityPolicy.maxModelUsdPerCompany)));
      if(input.mode==='demo')args.push('--demo');if(input.mode==='registry')args.push('--registry-only');
      const log=await open(join(dir,'runner.log'),'a',0o600);
      const child=spawn(process.execPath,args,{cwd:process.cwd(),detached:process.platform!=='win32',env:{...process.env,SIGNALPOST_MAX_EXA_USD:String(input.budget_usd)},stdio:['ignore',log.fd,log.fd]});await log.close();
      const fail=(message:string)=>{const current=store.run(input.run_id);if(current?.status!=='finished'){store.saveRun(input.run_id,{...current,status:'failed',error:message});store.event(input.run_id,null,'error',message);}};
      void boundedExit(child,(input.mode==='eve'?qualityPolicy.deadlineSeconds.pilot:1800)*1000,5000,process.platform!=='win32').then(result=>{if(result.code!==0||result.timed_out)fail(`Runner ${result.timed_out?'exceeded its timebox':'exited with code '+result.code}; inspect runner.log`);}).catch(error=>fail(error instanceof Error?error.message:String(error)));
      return send(response,202,{run_id:input.run_id});
    }
    const files:Record<string,[string,string]>={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
    const file=files[url.pathname];if(request.method==='GET'&&file){response.writeHead(200,{'content-type':file[1],'cache-control':'no-cache','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});response.end(await readFile(resolve('ui',file[0])));return;}
    send(response,404,{error:'Not found'});
  }catch(error){send(response,error instanceof z.ZodError?400:500,{error:error instanceof Error?error.message:'Request failed'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Signalpost dashboard: http://127.0.0.1:${(server.address() as {port:number}).port}`));
const stop=()=>server.close(()=>{store.close();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
