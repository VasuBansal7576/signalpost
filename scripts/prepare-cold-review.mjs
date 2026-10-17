import {readFile,writeFile,copyFile,mkdir,readdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

// Stage an audited cold run for local review. Never edit its results, report or database.
if(!process.argv[2])throw Error('Supply the completed cold-run directory');
const directory=resolve(process.argv[2]);
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const proof=await read(directory+'/cold-input-proof.json'),report=await read(directory+'/report.json'),audit=await read(directory+'/audit.json');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=await readFile(directory+'/results.jsonl');
if(!proof.checks_passed||!proof.completed||proof.final_counts.profiles!==100||!audit.mechanical_checks_passed||audit.withdrawn_claims.length||audit.failures.length)throw Error('An unchanged, audited 100-company cold run is required');
if(proof.run_id!==report.run_id||proof.result_file_sha256!==digest(bytes))throw Error('Run/result proof mismatch');
const input=await readFile('benchmark/registry-numbers-100.jsonl');
if(proof.input_file_sha256!==digest(input))throw Error('Input changed since the run');
const profiles=bytes.toString('utf8').trim().split('\n').map(JSON.parse),numbers=input.toString('utf8').trim().split('\n').map(JSON.parse);
if(numbers.length!==100||numbers.some(x=>typeof x!=='string'||!/^\d{9}$/.test(x))||JSON.stringify(numbers)!==JSON.stringify(profiles.map(p=>p.organisation_number)))throw Error('Input/output cohort mismatch');
await mkdir('submission',{recursive:true});
let previous;try{previous=await read('submission/smoke-report.json')}catch(error){if(error.code!=='ENOENT')throw error}
if(previous?.run_id&&previous.run_id!==report.run_id){
 const history=resolve('submission/history',String(previous.run_id).replace(/[^\w.-]/g,'_'));
 await mkdir('submission/history',{recursive:true});
 await mkdir(history);
 for(const entry of await readdir('submission',{withFileTypes:true}))if(entry.isFile())await rename(resolve('submission',entry.name),resolve(history,entry.name));
 console.log('Previous local review preserved at '+history);
}
for(const [source,target]of Object.entries({'results.jsonl':'smoke-results.jsonl','report.json':'smoke-report.json','audit.json':'evidence-audit.json','run-manifest.json':'run-manifest.json','fresh-db.json':'fresh-db.json','cold-input-proof.json':'cold-input-proof.json','coverage-100.csv':'coverage-100.csv','nav-source-audit.json':'nav-index-audit.json'}))await copyFile(resolve(directory,source),resolve('submission',target));
await writeFile('submission/companies-100.jsonl',input);
const selection=await read('benchmark/manifest.json');
await writeFile('submission/datasets.json',JSON.stringify({run_id:report.run_id,input_count:100,input_kind:'Bare nine-digit registry numbers only',input_sha256:digest(input),selection:'Unchanged original official sample; see historical selection manifest',historical_selection:selection,identity_source:'Live Brreg registry; no frozen bulk identity input',company_database:'Fresh empty database, no imported profiles or candidate URLs',shared_source:proof.source_conditions},null,2)+'\n');
const lock=await read('package-lock.json');
await writeFile('submission/dependency-licences.json',JSON.stringify(Object.entries(lock.packages).filter(([path])=>path.startsWith('node_modules/')).map(([path,pkg])=>({name:path.replace(/^node_modules\//,'').split('/node_modules/').at(-1),version:pkg.version,license:pkg.license??'See package licence',resolved:pkg.resolved??null})),null,2)+'\n');
const costDescription=report.exa_transport==='connector'?'Connected Exa provider USD charges are unreported; total provider cost is unknown. Provider-default page freshness applies. The host relay and active Codex dispatcher are outside the container resource cap.':`Exa provider-reported cost: $${proof.provider_reported_exa_usd.toFixed(3)}; uncertain reserved cost: $${proof.uncertain_reserved_exa_usd.toFixed(3)}.`;
const coverage=Object.entries(proof.field_coverage).map(([field,count])=>`| ${field} | ${count}/100 |`).join('\n');
await writeFile('submission/SUBMISSION.md',`# Signalpost local review — ${report.run_id}\n\nNot submitted or published. This review supersedes the previous local review, preserved under history/.\n\nAll 100 inputs were bare registry numbers. The company database started empty. No remembered company URLs, previous company responses, bulk identity data or hand-filled answers were used. The global NAV source was reused under its freshness policy; each company's query was computed afresh.\n\n| Populated field | Companies |\n|---|---:|\n${coverage}\n\nNAV checks are separate from positive hiring information. A source-scoped zero does not establish company-wide absence. Annual-report availability does not mean the PDFs were extracted. All unresolved fields remain explicit.\n\nThe run saved ${proof.model_results_completed}/100 final model results. ${proof.companies_with_processing_issues}/100 companies had processing issues and ${proof.companies_with_recorded_errors}/100 had any recorded error, including rejected proposals. The cold-input proof records their exact errors; rejected proposals are not published claims. A guardrail was not manually approved and no selected company was repaired after the batch.\n\nThe run took ${(report.elapsed_ms/60000).toFixed(2)} minutes. ${costDescription} Model usage used the existing Codex subscription; its fixed fee is excluded. Source requests, token usage and memory are in smoke-report.json. Mechanical checks are not an independent semantic precision/recall measurement or an official qualification score.\n\n## Inspect locally\n\nRun npm ci, npm run import:smoke, and npm run dashboard. The imported review has recorded values and source excerpts, but does not pretend the full raw source caches are bundled. The original local run retains full source hash verification.\n\n## Repeat the cold test\n\nConfigure working provider access and a model login; the connected desktop adapter additionally needs an active Codex source dispatcher (see README). Then run npm run benchmark:cold -- --run-id YOUR_NEW_UNIQUE_RUN_ID. The wrapper refuses an existing database/output directory and audits a copy after completing all 100. It never rewrites the result export.\n\nFor an evaluator-owned API model or arbitrary input batch, follow ../README.md. The local benchmark used the subscription provider; a paid-model API live run is not claimed.\n\n## Evidence\n\n- smoke-results.jsonl and smoke-report.json: unchanged full-run outputs.\n- companies-100.jsonl: the exact bare-number input.\n- cold-input-proof.json, fresh-db.json, run-manifest.json: input, database, runtime and result fingerprints.\n- evidence-audit.json: preserved evidence, attribution and financial consistency checks.\n- nav-index-audit.json: offline audit of the shared source's preserved raw receipts.\n- coverage-100.csv: every company, with populated and unresolved fields.\n- source-manifest.json and dependency-licences.json: source fingerprints and package licences.\n\nRaw global NAV contacts, source caches, SQLite databases, model traces and credentials are excluded. The investor movie is a separate local artifact. No email, push, publication or submission is performed by this command.\n`);
const files=[];
for(const root of ['src','agent','ui','tests','scripts','docs','examples']){
 const walk=async dir=>{for(const entry of await readdir(dir,{withFileTypes:true})){let path=dir+'/'+entry.name;if(entry.isDirectory())await walk(path);else files.push({path,sha256:digest(await readFile(path))})}};
 await walk(root);
}
for(const path of ['Dockerfile.evaluator','Dockerfile.evaluator-codex','.dockerignore','.gitattributes','package.json','package-lock.json','README.md','.env.example','tsconfig.json','LICENSE'])files.push({path,sha256:digest(await readFile(path))});
await writeFile('submission/source-manifest.json',JSON.stringify(files,null,2)+'\n');
if(digest(await readFile(directory+'/results.jsonl'))!==proof.result_file_sha256)throw Error('Source results unexpectedly changed');
console.log(JSON.stringify({run_id:report.run_id,companies:profiles.length,source_files:files.length,result_sha256:proof.result_file_sha256,local_review_only:true}));
