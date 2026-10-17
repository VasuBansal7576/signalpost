import{companyStageDeadline}from'./company-work-budget.ts';import{StagePayloadStore,type StagePayload}from'./stage-payload.ts';
import{stagedPipeline}from'./staged-pipeline.ts';import{CheckpointLedger}from'./checkpoint-ledger.ts';
import{cutoffDay}from'./publication-policy.ts';
import{verifySemanticProposals,sealSemanticProposals,verifiedDerivedProposals}from'./semantic-verifier.ts';
import{nativeReceiptComplete}from'./native-search.ts';
import { parseArgs } from 'node:util';import{performance}from'node:perf_hooks';
import { mkdir, readFile, rename, writeFile, access } from 'node:fs/promises';
import { dirname, resolve, join as joinPath } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { config, loadEnv } from './config.ts';
import { canonical, errorMessage, hash, materialChanges,proposalSchema, type Envelope, type Proposal } from './domain.ts';
import { Store } from './store.ts';
import { ResearchService } from './service.ts';
import { readBulk, readOrganisations } from './input.ts';
import { demoResearch } from './demo.ts';
import { researchWithEve, startEve } from './eve.ts';
import { monitorMemory } from './metrics.ts';
import {ensureNavCatalogue,type NavSetup} from './source-catalogue.ts';
import {acquireCompanyWeb} from './research-company.ts';
import {hasPopulatedField,hiringObservations} from './coverage.ts';
import {RunController} from './runtime.ts';
import {EvidenceCache} from './cache.ts';
import {routedExtraction,defaultModelOptions} from './model.ts';
import{closePublicRenderer}from'./public-render.ts';
import {publicGet} from './public-web.ts';
import {modelRates} from './pricing.ts';
import {assertQualityAdmission, executionConfiguration, qualityPolicy} from './quality-gate.ts';
import {assertSubscriptionAdmission} from './subscription-admission.ts';
import {verificationResume} from './verification-resume.ts';
import {configureHttpTransport,closeHttpTransport} from './http-transport.ts';

const { values } = parseArgs({ options: {
  organisations: { type: 'string' }, bulk: { type: 'string' }, output: { type: 'string', default: 'out/results.jsonl' },
  'profiles-output': { type: 'string' }, report: { type: 'string' }, 'run-id': { type: 'string' }, db: { type: 'string' },
  'expected-count': { type: 'string' }, workers: { type: 'string', default: '2' }, 'timeout-seconds': { type: 'string', default: '1800' },
  'company-timeout-seconds': { type: 'string', default: '180' }, 'previous-snapshot': { type: 'string' },
  'eve-url': { type: 'string' }, demo: { type: 'boolean' }, 'registry-only': { type: 'boolean' },
  'nav-catalogue':{type:'string'},
  'model-transport':{type:'string',default:'compact'}, 'cache':{type:'string'},
  'finalization-seconds':{type:'string',default:'15'},'max-requests':{type:'string',default:'50000'},
  'max-model-equivalent-usd':{type:'string',default:'10'},'network-workers':{type:'string',default:'24'},
  'max-search-equivalent-usd':{type:'string'},
  'per-host-workers':{type:'string',default:'2'},'model-rpm':{type:'string',default:'120'},'model-tpm':{type:'string',default:'2000000'},
  'provider-workers':{type:'string',default:'2'},'extraction-workers':{type:'string',default:'2'},'review-workers':{type:'string',default:'1'},'queue-bytes':{type:'string',default:'33554432'},
  'max-rss-mib':{type:'string',default:'2048'},'registry-workers':{type:'string',default:'8'},
  keyless:{type:'boolean'},'no-model':{type:'boolean'},'skip-nav':{type:'boolean'},'checkpoint-every':{type:'string',default:'20'},
  'demo-revision': { type: 'string', default: '1' }, help: { type: 'boolean' },
  'quality-evidence': {type: 'string'}, evaluator:{type:'boolean'},
  'verification-only': {type:'boolean'}, 'verification-selection': {type:'string'},
  'verification-resume': {type:'string'},
} });
if (values.help) console.log('npm run batch -- --organisations companies.jsonl [--bulk frozen.csv.gz] [--output out/results.jsonl] [--run-id ID] [--workers 2] [--demo | --registry-only]\nOptional: --evaluator (explicit arbitrary-size harness execution; no local .env loading or development quality certificate) --expected-count N --previous-snapshot prior.jsonl --profiles-output profiles.jsonl --report report.json --db data/run.sqlite --company-timeout-seconds 180 --timeout-seconds 1800');
else await main().catch(error => { console.error(errorMessage(error)); process.exitCode = 1; });

function positive(value: string, name: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${name} must be a positive integer`);
  return number;
}
async function atomic(path: string, content: string) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, content, { mode: 0o600 });
  await rename(temp, path);
}
async function main() {
  if(values.keyless)process.env.SIGNALPOST_KEYLESS='1';
  if(!values.evaluator)loadEnv();else if(values.keyless){const {enforceKeyless}=await import('./config.ts');enforceKeyless();}
  cutoffDay(process.env.SIGNALPOST_EVIDENCE_CUTOFF);
  if(values.evaluator&&values['verification-only'])throw Error('Select evaluator execution or development verification, not both');
  if(process.env.SIGNALPOST_KEYLESS==='1'&&values['model-transport']!=='compact')throw Error('Keyless mode requires compact subscription extraction');
  if (!values.organisations) throw new Error('Supply --organisations companies.jsonl (or run npm run demo)');
  if (values.demo && values['registry-only']) throw new Error('Select one execution mode');
  const organisations = await readOrganisations(values.organisations);
  if (!organisations.length) throw new Error('Organisation input is empty');
  if (values['expected-count'] && organisations.length !== positive(values['expected-count'], 'expected-count')) throw new Error('Input count does not match --expected-count');
  if (values['max-search-equivalent-usd']) process.env.SIGNALPOST_MAX_SEARCH_EQUIVALENT_USD=values['max-search-equivalent-usd'];
  // Admission precedes database/cache/source setup. Mechanical results cannot unlock scale.
  const qualityConfiguration = executionConfiguration(values);
  let continuation:Awaited<ReturnType<typeof verificationResume>>|undefined;
  if(values['verification-resume']&&!values['verification-only'])throw Error('Measurement continuation requires explicit verification-only mode');
  if (!values.demo) {
    if(values['verification-only']) {
      if(process.env.SIGNALPOST_KEYLESS!=='1'||values['no-model']||values['registry-only']||values['previous-snapshot']||values.bulk||![100,1000].includes(organisations.length)||!values['verification-selection']||!values.db||!values.cache)throw Error('Uncertified measurement requires a fresh full keyless100/1000-company selection and explicit empty database/cache');
      const selection=JSON.parse(await readFile(values['verification-selection'],'utf8'));
      if(selection.company_overlap!==0||selection.input_sha256!==hash(await readFile(values.organisations,'utf8')))throw Error('Measurement selection changed or is not fresh');
      if(values['verification-resume']){
        if(!values['run-id'])throw Error('Measurement continuation requires its original run ID');
        continuation=await verificationResume(values.db,values['run-id'],organisations,values['verification-resume'],selection.input_sha256);
      }else for(const path of [values.db,values.cache,values.output!])try{await access(path);throw Error('Measurement cannot reuse existing state: '+path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    } else if(!values.evaluator)await assertQualityAdmission(organisations, values['quality-evidence'], qualityConfiguration);
    if (process.env.SIGNALPOST_KEYLESS === '1' && !values['registry-only']) assertSubscriptionAdmission();
    const stage = organisations.length <= qualityPolicy.pilotMax ? 'pilot' : organisations.length <= 100 ? '100' : '1000';
    if (!values['registry-only']&&!values.evaluator) {
    if (positive(values['timeout-seconds']!, 'timeout-seconds') > (values['verification-only']?(organisations.length===100?1200:5400):qualityPolicy.deadlineSeconds[stage])) throw Error('Quality admission denied: explicit batch deadline exceeds ' + stage + ' timebox');
    if (positive(values['max-requests']!, 'max-requests') > organisations.length * qualityPolicy.maxRequestsPerCompany) throw Error('Quality admission denied: explicit request budget exceeds per-company cap');
    if (Number(values['max-model-equivalent-usd']) > organisations.length * (values['verification-only']?.1:qualityPolicy.maxModelUsdPerCompany)) throw Error('Quality admission denied: explicit model budget exceeds per-company cap');
    if (process.env.SIGNALPOST_KEYLESS === '1') {
      const searchBudget = Number(process.env.SIGNALPOST_MAX_SEARCH_EQUIVALENT_USD ?? '100');
      if (!Number.isFinite(searchBudget) || searchBudget < 0 || searchBudget > organisations.length * (values['verification-only']?.06:qualityPolicy.equivalentUsdPerCompany-qualityPolicy.maxModelUsdPerCompany)) throw Error('Quality admission denied: explicit search budget exceeds per-company cap');
    }
    }
  }
  configureHttpTransport();
  const memory=monitorMemory();
  const workers = Math.min(positive(values.workers!, 'workers'), 64);
  const timeout = positive(values['company-timeout-seconds']!, 'company-timeout-seconds') * 1000;
  const started = Date.now(), deadline = Math.min(started + positive(values['timeout-seconds']!, 'timeout-seconds') * 1000,continuation?Date.parse(continuation.started_at)+continuation.max_campaign_seconds*1000:Infinity);
  if(deadline<=started)throw Error('Interrupted measurement exhausted its original campaign timebox');
  const runId = values['run-id'] ?? new Date().toISOString().replace(/[:.]/g, '-');
  const mode = values.demo ? 'demo' : values['registry-only'] ? 'registry' : 'eve';
  if (values.db) process.env.SIGNALPOST_DB = resolve(values.db);
  process.env.SIGNALPOST_DB = config().db;
  const store = new Store(config().db);
  if(continuation){
    const interrupted=store.db.prepare("SELECT DISTINCT job FROM calls WHERE kind='search' AND state='pending' UNION SELECT job FROM model_attempts WHERE json_extract(body,'$.state') IN ('pending','uncertain')").all();
    for(const row of interrupted){const old=store.modelUsage(String(row.job))??{};store.saveModelUsage(String(row.job),{...(old as object),incomplete:true});}
    store.event(runId,null,'measurement_continuation','Continue saved cohort; completed profiles and possibly billed calls are never repeated');
  }
  if(!['compact','eve'].includes(values['model-transport']!))throw Error('model-transport must be compact or eve');
  const controller=new RunController(store,runId,{providerConcurrency:positive(values['provider-workers']!,'provider-workers'),deadline,finalizationMs:Math.min(positive(values['finalization-seconds']!,'finalization-seconds')*1000,Math.max(1,(deadline-started)/5)),requests:positive(values['max-requests']!,'max-requests'),networkConcurrency:positive(values['network-workers']!,'network-workers'),perHostConcurrency:positive(values['per-host-workers']!,'per-host-workers'),modelRpm:positive(values['model-rpm']!,'model-rpm'),modelTpm:positive(values['model-tpm']!,'model-tpm'),modelEquivalentUsd:Number(values['max-model-equivalent-usd']),maxRssMiB:positive(values['max-rss-mib']!,'max-rss-mib')});
  if(!Number.isFinite(controller.limits.modelEquivalentUsd)||controller.limits.modelEquivalentUsd<0)throw Error('Invalid model equivalent budget');
  const network:typeof fetch=async(input,init={})=>{const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url,signal=AbortSignal.any([init.signal??controller.signal,controller.signal]),localRelay=config().exaTransport==='connector'&&config().exaRelayUrl&&new URL(url).origin===new URL(config().exaRelayUrl!).origin;return controller.network(new URL(url).hostname,signal,async()=>{const response=await fetch(input,{...init,signal});controller.observeResponse(new URL(url).hostname,response.status,response.headers.get('retry-after'));const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;if(reader)for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>(new URL(url).hostname==='pam-stilling-feed.nav.no'?16_000_000:4_000_000)){await reader.cancel();throw Error('Network response exceeds host byte limit');}chunks.push(part.value);}return new Response([204,205,304].includes(response.status)?null:Buffer.concat(chunks),{status:response.status,headers:response.headers});},localRelay?controller.limits.networkConcurrency:controller.limits.perHostConcurrency);};
  const cache=new EvidenceCache(resolve(values.cache??`${dirname(values.output!)}/cache`),network,process.env.SIGNALPOST_EVIDENCE_CUTOFF??'live');
  const publicCache=new EvidenceCache(joinPath(cache.directory,'public'),async(input,init={})=>{const url=String(input),h=new Headers(init.headers),conditional=Object.fromEntries(['if-none-match','if-modified-since'].flatMap(k=>h.get(k)?[[k,h.get(k)!]]:[]));const r=await publicGet(url,0,init.signal??controller.signal,conditional,(host,signal,perform)=>controller.network(host,signal,perform));return new Response([204,205,304].includes(r.status)?null:r.text,{status:r.status,headers:{'content-type':r.content_type,...(r.etag?{etag:r.etag}:{}),...(r.last_modified?{'last-modified':r.last_modified}:{}),'x-signalpost-final-url':r.url,'x-signalpost-redirects':JSON.stringify(r.redirect_chain??[])}});});
  const website=async(url:string,_redirects=0,signal=controller.signal)=>{const r=await publicCache.fetch(url,{signal});return{url:r.headers.get('x-signalpost-final-url')??url,status:r.status,text:await r.text(),content_type:r.headers.get('content-type')??'',raw_sha256:r.headers.get('x-signalpost-raw-sha256'),retrieved_at:r.headers.get('x-signalpost-retrieved-at'),redirect_chain:JSON.parse(r.headers.get('x-signalpost-redirects')??'[]')};};
  const service=new ResearchService(store,config(),cache.fetch,website);service.runtime=controller;
  service.resumeInterruptedUnpaidGets=Boolean(continuation);
  if(values['model-transport']==='compact')service.discoveryReserveMs=defaultModelOptions().timeoutMs+2000;
  const onInterrupt=()=>controller.stop('Process interrupted; preserve evidence and finalise every input');process.once('SIGINT',onInterrupt);process.once('SIGTERM',onInterrupt);
  const bulk = values.bulk ? await readBulk(values.bulk, new Set(organisations)) : new Map();
  let bulkSource: string | undefined;
  if (values.bulk) {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(values.bulk)) digest.update(chunk);
    bulkSource = `urn:signalpost:bulk:sha256:${digest.digest('hex')}`;
  }
  const previous = new Map<string, Envelope>();
  if (values['previous-snapshot']) for (const line of (await readFile(values['previous-snapshot'], 'utf8')).split(/\r?\n/).filter(Boolean)) {
    const profile: Envelope = JSON.parse(line);
    if (!Array.isArray(profile.claims) || typeof profile.organisation_number !== 'string') throw new Error('Invalid previous snapshot');
    previous.set(profile.organisation_number, profile);
  }
  const unique = [...new Set(organisations)], results = new Map<string, Envelope>();
  const existingRun=store.run(runId),declaredCutoff=cutoffDay(process.env.SIGNALPOST_EVIDENCE_CUTOFF)??null;
  if(existingRun&&(existingRun.evidence_cutoff??null)!==declaredCutoff)throw Error('A run-id cannot change its evidence cutoff; start a new run');
  if(existingRun?.status==='finished'&&(existingRun.mode!==mode||existingRun.input_count!==organisations.length||canonical(existingRun.organisations)!==canonical(unique)))throw new Error('A finished run-id must be replayed with the same batch and mode. Use a new run-id to refresh.');
  if(existingRun?.status!=='finished')store.saveRun(runId,{...existingRun,run_id:runId,evidence_cutoff:declaredCutoff,mode,status:'running',started_at:continuation?.started_at??new Date(started).toISOString(),input_count:organisations.length,organisations:unique,company_names:Object.fromEntries(unique.map(org=>[org,bulk.get(org)?.navn??org])),workers,output:resolve(values.output!),model:process.env.SIGNALPOST_MODEL??'gpt-6-luna',model_provider:process.env.SIGNALPOST_MODEL_PROVIDER??(process.env.OPENAI_API_KEY?'openai':'chatgpt'),max_exa_usd:config().maxExaUsd,exa_transport:config().exaTransport??'api'});
  store.event(runId,null,'run','Run started');
  let eve: Awaited<ReturnType<typeof startEve>> | undefined, startupError: string | undefined;
  let navSetup:NavSetup|undefined,navError:string|undefined;
  try {
    if (mode === 'eve' && unique.some(org => !store.profile(org, runId))) {
      try {
        if(!values['skip-nav'])try{navSetup=await ensureNavCatalogue({allowAuthentication:process.env.SIGNALPOST_KEYLESS!=='1',path:values['nav-catalogue']?.trim()||process.env.SIGNALPOST_NAV_CATALOGUE?.trim()||resolve(process.env.SIGNALPOST_SOURCE_CACHE?.trim()||'data/sources','nav-catalogue.json'),signal:controller.signal,request:cache.fetch,seed:store.latestCatalogue(),onProgress:message=>{store.event(runId,null,'source_setup',message);store.saveRun(runId,{...store.run(runId),shared_sources:{nav:{status:'running',message}}});console.error(message);}});service.navCatalogue=navSetup.catalogue;store.saveRun(runId,{...store.run(runId),shared_sources:{nav:{status:'available',mode:navSetup.mode,requests:navSetup.requests,elapsed_ms:navSetup.elapsed_ms}}});}catch(error){navError=errorMessage(error);store.event(runId,null,'source_setup','NAV source unavailable: '+navError);store.saveRun(runId,{...store.run(runId),shared_sources:{nav:{status:'failed',error:navError}}});}
        if(!values['no-model']&&values['model-transport']==='eve')eve = await startEve(`${dirname(values.output!)}/eve.log`, values['eve-url']);
      } catch (error) { startupError = errorMessage(error); }
    }
    type Baseline=Awaited<ReturnType<ResearchService['registry']>>;
    type Prepared={job:ReturnType<Store['createJob']>;baseline:Baseline;errors:Envelope['errors'];active_ms:number;proposals:Proposal[];cached?:Envelope};
    const prepare=async(org:string,queuedAt:number):Promise<Prepared>=>{
        const cached = store.profile(org, runId);
        if (cached) {
          if (cached.run.mode !== mode) throw new Error('A run-id cannot be reused with another execution mode');
          return{job:store.createJob(org,runId,mode),baseline:{claims:[],evidence:[],errors:[]},errors:[],active_ms:0,proposals:[],cached};
        }
        const job = store.createJob(org, runId, mode, new Date(Math.min(controller.workDeadline, Date.now() + timeout)).toISOString());
        if(continuation){job.deadline_at=new Date(Math.min(controller.workDeadline,Date.now()+timeout)).toISOString();store.db.prepare('UPDATE jobs SET body=? WHERE id=?').run(JSON.stringify(job),job.id);}
        store.event(runId,org,'registry','Collecting registry identity, financials, roles and history');
        let baseline: Awaited<ReturnType<ResearchService['registry']>> = { claims: [], evidence: [], errors: [] };
        const errors: Envelope['errors'] = [];
        const activeStarted=Date.now();
        try {
          if (Date.now() >= controller.workDeadline) throw new Error('Batch work deadline reached before company started');
          if (mode === 'demo')baseline=demoResearch(service, job, positive(values['demo-revision']!, 'demo-revision')).baseline;
          else {
            if(values.bulk&&!bulk.has(org))throw new Error('Organisation absent from the supplied frozen registry. Live identity substitution is disabled.');
            baseline = await controller.stage(org,'registry',queuedAt,()=>service.registry(job, bulk.get(org), bulkSource));
          }
        }catch(error){errors.push({code:'research_failed',message:errorMessage(error)});}
        return{job,baseline,errors,active_ms:Date.now()-activeStarted,proposals:[]};
    };
    const ledger=new CheckpointLedger(values.output!,runId,positive(values['checkpoint-every']!,'checkpoint-every'));
    const queueLimit=positive(values['queue-bytes']!,'queue-bytes');if(queueLimit<1024)throw Error('queue-bytes must allow at least1024bytes for durable references');const payloads=new StagePayloadStore<Prepared>(store,queueLimit);
    const stage=async<T>(org:string,prepared:Prepared,name:string,at:number,perform:()=>Promise<T>)=>{prepared.job.deadline_at=new Date(companyStageDeadline(prepared.active_ms,timeout,controller.workDeadline)).toISOString();store.db.prepare('UPDATE jobs SET body=? WHERE id=?').run(JSON.stringify(prepared.job),prepared.job.id);const started=performance.now();try{return await controller.stage(org,name,at,perform);}finally{prepared.active_ms+=performance.now()-started;}};
    const acquire=async(org:string,prepared:Prepared,queuedAt:number)=>{
      if(prepared.cached)return prepared;const {job,errors}=prepared;

      try{if(mode==='demo')prepared.proposals=demoResearch(service,job,positive(values['demo-revision']!,'demo-revision')).proposals;
      if(mode==='eve'){if(!service.identity(job))throw Error('No verified registry identity; web research skipped');const acquired=await stage(org,prepared,'acquisition',queuedAt,()=>acquireCompanyWeb(service,job));errors.push(...acquired.errors);}}
      catch(error){errors.push({code:'research_failed',message:errorMessage(error)});}return prepared;
    };
    const extract=async(org:string,prepared:Prepared,queuedAt:number)=>{
      if(prepared.cached||mode!=='eve'||values['no-model'])return prepared;const {job,errors}=prepared;
      try{prepared.proposals=await stage(org,prepared,'extraction',queuedAt,async()=>{if(startupError)throw Error(startupError);if(values['model-transport']==='compact')return routedExtraction(service,job,defaultModelOptions(),controller,cache);if(!eve)throw Error('eve server unavailable');return researchWithEve(eve.client,store,job,Math.max(1,Math.min(timeout,controller.remaining(),Date.parse(job.deadline_at!)-Date.now())));});}
      catch(error){errors.push({code:'research_failed',message:errorMessage(error)});}return prepared;
    };
    const pack=(prepared:Prepared)=>payloads.pack(prepared);
    await stagedPipeline<StagePayload<Prepared>>(unique,{registry:mode==='demo'?workers:positive(values['registry-workers']!,'registry-workers'),acquisition:workers,extraction:positive(values['extraction-workers']!,'extraction-workers'),review:positive(values['review-workers']!,'review-workers'),queueBytes:positive(values['queue-bytes']!,'queue-bytes')},async(org,at)=>pack(await prepare(org,at)),async(org,ref,at)=>pack(await acquire(org,payloads.unpack(ref),at)),async(org,ref,at)=>pack(await extract(org,payloads.unpack(ref),at)),async(org,ref,queuedAt)=>{const prepared=payloads.unpack(ref);
        if(prepared.cached){results.set(org,prepared.cached);if(existingRun?.status!=='finished')await ledger.append(org,JSON.stringify(prepared.cached),results.size);return;}
        const {job,baseline,errors}=prepared;let proposals=prepared.proposals;
        if(mode==='eve'&&!values['no-model']){const candidates=[...proposals,...proposalSchema.array().parse(store.proposals(job.id))];try{proposals=(await stage(org,prepared,'semantic_review',queuedAt,()=>verifySemanticProposals(service,job,candidates,controller))).accepted;}catch(error){errors.push({code:'semantic_entailment_unresolved',message:errorMessage(error)});proposals=verifiedDerivedProposals(service,job,candidates);sealSemanticProposals(service,job,proposals);}}
        const profile = service.finalize(job, baseline, proposals, errors);
        if (previous.has(org)) { profile.changes = materialChanges(previous.get(org), profile); store.saveProfile(profile); }
        results.set(org, profile);
        store.event(runId,org,'finished',`Saved ${profile.run.terminal_status} profile with ${profile.claims.filter(c=>c.availability==='available').length} supported fields`);
        console.error(`${results.size}/${unique.length} ${org} ${profile.run.terminal_status} (${profile.operations.requests} requests)`);
        await ledger.append(org,JSON.stringify(profile),results.size);
    },ref=>ref.bytes);
    await ledger.flush();
    const ordered = organisations.map(org => results.get(org)!);
    await atomic(values.output!, ordered.map(p => JSON.stringify(p)).join('\n') + '\n');
    if (values['profiles-output']) await atomic(values['profiles-output'], ordered.map(p => JSON.stringify(p)).join('\n') + '\n');
    const durations = [...results.values()].map(r => r.operations.runtime_ms).sort((a, b) => a - b), profiles = [...results.values()];
    const report = {
      workers,stage_workers:{acquisition:workers,extraction:positive(values['extraction-workers']!,'extraction-workers'),review:positive(values['review-workers']!,'review-workers'),provider:positive(values['provider-workers']!,'provider-workers')},evidence_view:store.evidenceViewMetrics(),registry_workers:positive(values['registry-workers']!,'registry-workers'),web_provider_preflight_block:service.sourceBlockReason()??config().exaBlockedReason??null,
      exa_transport:config().exaTransport??'api',keyless:process.env.SIGNALPOST_KEYLESS==='1',search_api_equivalent_exposure_usd:store.resources(runId).search_api_equivalent_usd??0,exa_billing:config().exaTransport==='codex'?'No Exa; native Codex subscription search and unauthenticated public HTTPS':config().exaTransport==='connector'?'Connected Exa service; provider USD cost is not reported':config().exaTransport==='mcp'?'Official keyless MCP free tier; rate-limited; no API key or paid credit used':'API cost returned by Exa',web_freshness:config().exaTransport==='codex'?'Native live-search candidates; evidence fetched directly with robots checks and immutable raw snapshots':config().exaTransport==='connector'?'Connected Exa search/fetch provider freshness defaults; direct HTML is fetched live with robots checks':config().exaTransport==='mcp'?'New source responses; advanced search requests maxAgeHours=0; MCP fetch uses provider freshness defaults, not forced livecrawl':'Fresh API contents maxAgeHours=0',
      shared_sources:navSetup?{nav:{status:'available',mode:navSetup.mode,requests:navSetup.requests,elapsed_ms:navSetup.elapsed_ms}}:navError?{nav:{status:'failed',error:navError}}:undefined,
      shared_nav_requests:navSetup?.requests??0,company_source_requests:profiles.reduce((n,p)=>n+p.operations.requests,0),
      ...(service.navCatalogue?{nav_source:{scope:'Complete NAV feed; exact employer/subunit identifiers; Finn excluded; source zero is not company-wide absence',catalogue_sha256:hash(canonical(service.navCatalogue)),collection_started_at:service.navCatalogue.collection_started_at,completed_at:service.navCatalogue.completed_at,records:service.navCatalogue.records.length,complete:service.navCatalogue.complete,bootstrap_manifest:service.navCatalogue.manifest,job_queries:'Derived afresh for every company from the shared source catalogue; no prior company hiring result reused'}}:{}),
      run_id: runId, mode, input_count: organisations.length, unique_companies: unique.length, output_count: ordered.length,
      evaluator_execution:Boolean(values.evaluator),evidence_cutoff:process.env.SIGNALPOST_EVIDENCE_CUTOFF??null,cutoff_scope:'Explicit claim date admission; undated live pages are not a historical archive',
      quality_admission: {configuration_sha256: qualityConfiguration, predecessor_evidence: values['quality-evidence'] ?? null, verification_only:Boolean(values['verification-only']), semantic_pass: false, note: 'Production completion is not quality certification; independently review the sealed artifacts.'},
      elapsed_ms: Date.now() - (continuation?Date.parse(continuation.started_at):started), continuation:continuation?{...continuation,segment_elapsed_ms:Date.now()-started,unfinished_company_active_budget_renewed:true,prior_segment_counters_retained_in_database:true}:null, company_runtime_ms: { p50: durations[Math.floor(durations.length * .5)], p95: durations[Math.min(durations.length - 1, Math.floor(durations.length * .95))] },
      terminal_statuses: Object.fromEntries(['completed', 'partial', 'failed'].map(s => [s, profiles.filter(r => r.run.terminal_status === s).length])),
      hiring_observations:hiringObservations(profiles),
      field_coverage: Object.fromEntries([...new Set(profiles.flatMap(p => p.claims.map(c => c.field)))].map(field => [field, profiles.filter(p => hasPopulatedField(p,field)).length])),
      external_source_health:store.externalSourceHealth(),
      requests: (navSetup?.requests??0)+profiles.reduce((n, p) => n + p.operations.requests, 0), known_exa_cost_usd: profiles.reduce((n, p) => n + p.operations.known_exa_cost_usd, 0),
      model_billing: mode === 'eve' ? 'Configured provider; actual subscription/API billing and token-based API equivalent reported separately' : 'none',
      changes: profiles.reduce((n, p) => n + p.changes.length, 0), result_sha256: hash(ordered.map(p => canonical(p)).join('\n')),
      financial_records:profiles.reduce((n,p)=>n+((p.claims.find(c=>c.field==='financials')?.value as {records?:unknown[]}|null)?.records?.length??0),0),
      errors_by_code:Object.fromEntries([...new Set(profiles.flatMap(p=>p.errors.map(e=>e.code)))].map(code=>[code,profiles.reduce((n,p)=>n+p.errors.filter(e=>e.code===code).length,0)])),
      model_cost_usd:profiles.every(p=>p.operations.model_cost_usd!==null)?profiles.reduce((n,p)=>n+(p.operations.model_cost_usd??0),0):null,
      third_party_cost_usd:profiles.every(p=>p.operations.third_party_cost_usd!==null)?profiles.reduce((n,p)=>n+(p.operations.third_party_cost_usd??0),0):null,
      model_input_tokens:profiles.reduce((n,p)=>n+(p.operations.model_input_tokens??0),0),model_output_tokens:profiles.reduce((n,p)=>n+(p.operations.model_output_tokens??0),0),
      model_transport:values['model-transport'],model_disabled:Boolean(values['no-model']),runtime:controller.report(),cache:{directory:cache.directory,...cache.metrics,public_html:publicCache.metrics,semantics:'HTTP GETs revalidated across runs; no TTL trust; extraction cache target-entity/identity/prompt/model/schema/cutoff scoped'},
      model_api_equivalent_usd:profiles.filter(p=>(p.operations.model_input_tokens??0)>0||!p.operations.model_usage_complete).every(p=>p.operations.model_api_equivalent_usd!==null)?profiles.reduce((n,p)=>n+(p.operations.model_api_equivalent_usd??0),0):null,
      model_api_equivalent_rates:modelRates(process.env.SIGNALPOST_MODEL??'gpt-6-luna',process.env.SIGNALPOST_MODEL_PROVIDER??'chatgpt')??null,
      cost_scope:{subscription:'Actual incremental model API charge is zero; fixed subscription excluded; API equivalent is a separate estimate',external_source:'Connector bills are unknown, not zero; no new credit purchases',source_setup:'Shared source setup included in runtime and physical requests; cache mode declared'},
      output_sha256:hash(ordered.map(p=>JSON.stringify(p)).join('\n')+'\n'),
      process_max_rss_kib:process.resourceUsage().maxRSS,
      peak_sampled_process_tree_rss_kib:memory.value(),memory_note:'RSS sum sampled every 2 seconds for the runner and its child processes; shared pages may be counted more than once',
      process_user_cpu_ms:process.resourceUsage().userCPUTime/1000,process_system_cpu_ms:process.resourceUsage().systemCPUTime/1000,
    };
    if(report.keyless){const calls=store.db.prepare("SELECT state,body FROM calls WHERE kind='search' AND job IN (SELECT id FROM jobs WHERE run=?)").all(runId),metrics=store.db.prepare('SELECT body FROM operation_metrics WHERE run=?').all(runId).map(row=>JSON.parse(String(row.body))).filter(row=>row.stage==='native_search_receipt'),known=metrics.reduce((sum,row)=>sum+Number(row.known_search_api_equivalent_usd??row.search_api_equivalent_usd??0),0),complete=calls.every(row=>row.state==='completed')&&metrics.length===calls.length&&metrics.every(nativeReceiptComplete);Object.assign(report,{known_search_api_equivalent_usd:known,search_api_equivalent_usd:complete?known:null,combined_api_equivalent_usd:complete&&report.model_api_equivalent_usd!==null?known+report.model_api_equivalent_usd:null,search_usage_complete:complete});}
    await atomic(values.report ?? `${values.output}.report.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if(existingRun?.status!=='finished')store.saveRun(runId,{...store.run(runId),status:'finished',completed_at:new Date().toISOString(),report});
    store.event(runId,null,'run',existingRun?.status==='finished'?'Saved profiles exported without new research':'Run finished; exports saved');
  } finally {memory.stop();await closePublicRenderer();controller.close();process.off('SIGINT',onInterrupt);process.off('SIGTERM',onInterrupt);await eve?.stop();await closeHttpTransport(); store.close(); }
}
