import assert from 'node:assert/strict';
import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
const origin=process.env.SIGNALPOST_DASHBOARD_URL??'http://127.0.0.1:4317';
const config=await fetch(origin+'/api/config').then(r=>r.json());
assert.ok(config.token);assert.equal('exa_key'in config,false);assert.equal('OPENAI_API_KEY'in config,false);
const runs=await fetch(origin+'/api/runs').then(r=>r.json());assert.ok(runs.length);
const completed=runs.filter(r=>r.status==='finished').sort((a,b)=>b.input_count-a.input_count||Number(Boolean(a.review_only))-Number(Boolean(b.review_only)))[0];assert.ok(completed);
const path='/api/runs/'+encodeURIComponent(completed.run_id);
const run=await fetch(origin+path).then(r=>r.json());assert.equal(run.companies.length,completed.input_count);
if(run.run.report?.hiring_observations){const h=run.run.report.hiring_observations;assert.equal(run.companies.filter(c=>c.has_hiring_check).length,h.companies_with_verified_nav_query);const signals=run.companies.filter(c=>c.has_hiring_signal).length;assert.ok(signals>=h.companies_with_nav_ads&&signals<=h.companies_with_other_recruitment_information+h.companies_with_nav_ads);assert.equal(run.operations.requests,run.operations.company_source_requests+run.operations.shared_nav_requests);}
const exported=await fetch(origin+path+'/export').then(r=>r.text());assert.equal(exported.trim().split('\n').length,run.completed);assert.deepEqual(exported.trim().split('\n').map(line=>JSON.parse(line).organisation_number),run.companies.filter(c=>!['queued','running'].includes(c.status)).map(c=>c.organisation_number));
if(process.env.SIGNALPOST_EXPECTED_EXPORT){const expected=await readFile(process.env.SIGNALPOST_EXPECTED_EXPORT,'utf8'),digest=value=>createHash('sha256').update(value).digest('hex');assert.equal(digest(exported),digest(expected),'Dashboard export must preserve the exact reviewed JSONL bytes');console.log('Exact reviewed export SHA-256: '+digest(exported));}
const first=run.companies.find(c=>['partial','completed'].includes(c.status));assert.ok(first);
const detail=await fetch(origin+path+'/companies/'+first.organisation_number).then(r=>r.json());assert.ok(detail.profile.evidence.length);
const evidence=detail.profile.evidence[0];if(!detail.job.review_only){const source=await fetch(origin+'/api/sources/'+detail.job.id+'/'+evidence.snapshot_id).then(r=>r.json());assert.equal(source.hash_verified,true);assert.ok(source.text.includes(evidence.claim_span));}
const rejected=await fetch(origin+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(rejected.status,403);
const badInput=await fetch(origin+'/api/runs',{method:'POST',headers:{'content-type':'application/json','x-signalpost-token':config.token},body:JSON.stringify({run_id:'invalid-test',organisations:['bad'],mode:'demo'})});assert.equal(badInput.status,400);
console.log(`Dashboard API checks passed: ${run.completed} profiles (${completed.run_id}), inspection, ${detail.job.review_only?'recorded-source disclosure':'source hashing'}, export, credential isolation, and launch validation.`);
