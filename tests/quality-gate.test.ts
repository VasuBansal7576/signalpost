import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical, hash, researchFields, type Envelope, type Snapshot} from '../src/domain.ts';
import {availableClaims, companyHostsFor, evaluateQuality, assertQualityAdmission, runtimeFingerprint, policyFingerprint, requiredEvidence, precisionLower95} from '../src/quality-gate.ts';

// Synthetic fixtures test enforcement only. They are never real quality evidence.
async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'signalpost-quality-evidence-'));
  await mkdir(join(root,'sources'));
  const now=Date.now(),started=new Date(now-30000).toISOString(),finished=new Date(now-10000).toISOString(),referenceTime=new Date(now-60000).toISOString();
  const code=await runtimeFingerprint(),configuration=hash('test configuration');
  const snapshots:Snapshot[]=[],rows:Envelope[]=Array.from({length:12},(_,i)=>({organisation_number:String(800000000+i),
    run:{run_id:'synthetic',started_at:started,completed_at:finished,terminal_status:'completed',mode:'eve'},claims:[],evidence:[],changes:[],errors:[],
    operations:{requests:1,runtime_ms:1000,third_party_cost_usd:0,known_exa_cost_usd:0,model_cost_usd:0,cost_complete:true,model_usage_complete:true}}));
  for(let i=0;i<60;i++){
    const row=rows[i%rows.length]!,field=researchFields[i%researchFields.length]!,body=`Synthetic exact source for ${row.organisation_number}: supported statement number ${i}.`;
    const digest=hash(body),id='snapshot-'+i;
    snapshots.push({id,source_url:'https://example.org/'+i,source_class:'external',retrieved_at:started,content_sha256:digest,text:body,organisation_number:row.organisation_number,run_id:'synthetic'});
    row.claims.push({field,value:body,availability:'available',confidence:null,evidence_ids:['e'+i]});
    row.evidence.push({id:'e'+i,snapshot_id:id,source_url:'https://example.org/'+i,source_class:'external',retrieved_at:started,content_sha256:digest,claim_span:body});
    await writeFile(join(root,'sources',digest+'.txt'),body);
  }
  for(const row of rows){
    const name='Synthetic Company '+row.organisation_number,body=JSON.stringify({organisasjonsnummer:row.organisation_number,navn:name}),digest=hash(body),id='registry-'+row.organisation_number,url='https://data.brreg.no/enhetsregisteret/api/enheter/'+row.organisation_number;
    snapshots.push({id,source_url:url,source_class:'public_registry',retrieved_at:started,content_sha256:digest,text:body,organisation_number:row.organisation_number,run_id:'synthetic'});
    row.evidence.push({id,snapshot_id:id,source_url:url,source_class:'public_registry',retrieved_at:started,content_sha256:digest,claim_span:JSON.stringify(name)});
    row.claims.push({field:'legal_name',value:name,availability:'available',confidence:null,evidence_ids:[id]});
    for(const field of ['financials','leadership','workplaces','financial_history','group_structure'])row.claims.push({field,value:null,availability:'not_available',confidence:null,evidence_ids:[]});
    await writeFile(join(root,'sources',digest+'.txt'),body);
  }
  const claims=availableClaims(rows);
  const external=claims.filter(c=>researchFields.some(field=>field===c.claim.field));
  const reference={reviewer:'independent-reference-reviewer',sealed_at:referenceTime,independent_of_output:true,
    companies:rows.map(r=>({organisation_number:r.organisation_number,identity_reviewed:true,families:Object.fromEntries(researchFields.map(f=>[f,'reviewed']))})),
    facts:external.map((c,i)=>({id:'fact-'+i,organisation_number:c.organisation_number,field:c.claim.field,statement:String(c.claim.value),scope:'exact company',
      source:{url:rows.find(r=>r.organisation_number===c.organisation_number)!.evidence.find(e=>e.id===c.claim.evidence_ids[0])!.source_url,sha256:hash(String(c.claim.value)),quote:String(c.claim.value),
        provenance:{kind:'public_http_text',retrieved_at:referenceTime,publisher_raw_sha256:null},policy_review:{status:'permitted',reviewed_at:referenceTime,source_url:'https://example.org/terms',basis:'Synthetic source permission declaration used only for enforcement tests.'}}}))};
  const review={reviewer:'contextual-output-reviewer',reviewed_at:new Date(now-1000).toISOString(),full_output_context:true,
    claims:claims.map(c=>({id:c.id,verdict:'supported',reason:'Exact entity and field checked in complete source context.',material_error:'none'})),
    matches:external.map((c,i)=>({fact_id:'fact-'+i,verdict:'full',claim_ids:[c.id],reason:'All scope and temporal meaning checked against the output.'})),
    synthesis:rows.map(r=>({organisation_number:r.organisation_number,supported:true,reason:'All synthesized propositions reviewed against their claims.'})),
    ux:{sources_inspectable:true,unknowns_visible:true,qualifiers_preserved:true}};
  const input=rows.map(r=>JSON.stringify(r.organisation_number)).join('\n')+'\n',output=rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
  const report={input_count:12,output_count:12,elapsed_ms:20000,company_runtime_ms:{p95:1000},keyless:true,model_disabled:false,model_transport:'compact',exa_transport:'codex',
    search_usage_complete:true,combined_api_equivalent_usd:.10,runtime:{admission_stopped:false,physical_requests:12},
    quality_measurements:{runtime_unchanged:true,unknown_usage_calls:0,omitted_extraction_spans:0,unfinished_extraction_packets:0}};
  const manifest={version:1,stage:'pilot',code_sha256:code,configuration_sha256:configuration,policy_sha256:policyFingerprint(),input_sha256:hash(input),
    reference_sha256:hash(JSON.stringify(reference)),output_sha256:hash(output),report_sha256:hash(JSON.stringify(report)),started_at:started,finished_at:finished,prior_company_overlap:0,prior_host_overlap:0};
  const freshness={captured_at:referenceTime,excluded_company_ids:[],company_hosts:[],scope:'Synthetic inventory used only for testing enforcement.'};
  Object.assign(manifest,{freshness_sha256:hash(JSON.stringify(freshness)),source_index_sha256:hash(JSON.stringify(snapshots))});
  for(const [name,value] of Object.entries({'manifest.json':manifest,'reference.json':reference,'review.json':review,'report.json':report,'source-index.json':snapshots,'freshness.json':freshness}))await writeFile(join(root,name),JSON.stringify(value));
  await writeFile(join(root,'companies.jsonl'),input);await writeFile(join(root,'results.jsonl'),output);
  return {root,expected:{code,configuration},manifest,reference,review,report,rows,
    save:async(name:string,value:unknown)=>writeFile(join(root,name),JSON.stringify(value)),
    cleanup:()=>rm(root,{recursive:true,force:true})};
}

test('only a complete semantically reviewed, source-grounded cohort with known usage passes',async()=>{
  const f=await fixture();try{const r=await evaluateQuality(f.root,f.expected);assert.equal(r.passed,true,r.failures.join('\n'));assert.equal(r.precision,1);assert.ok(r.precision_lower_95>.9);assert.ok(Object.values(r.families).every(v=>v.weighted_recall===1));}finally{await f.cleanup();}
});
test('scale thresholds cannot be evaded with21,99,101or1001 rows',()=>{
  assert.equal(requiredEvidence(20),undefined);assert.equal(requiredEvidence(21),'pilot');assert.equal(requiredEvidence(99),'pilot');assert.equal(requiredEvidence(100),'pilot');assert.equal(requiredEvidence(101),'100');assert.equal(requiredEvidence(1000),'100');assert.equal(requiredEvidence(1001),'1000');
  assert.equal(precisionLower95(0,0),0);assert.ok(precisionLower95(5,5)<.6);
});
test('stale code, changed configuration and expired evidence cannot authorize scale',async()=>{
  const f=await fixture();try{
    for(const expected of [{...f.expected,code:hash('changed')},{...f.expected,configuration:hash('changed')}])assert.equal((await evaluateQuality(f.root,expected)).passed,false);
    assert.equal((await evaluateQuality(f.root,f.expected,Date.now()+8*86400000)).passed,false);
  }finally{await f.cleanup();}
});
test('duplicates and omitted claim judgments do not confer mechanical precision',async()=>{
  const f=await fixture();try{f.review.claims[0]=f.review.claims[1]!;await f.save('review.json',f.review);const r=await evaluateQuality(f.root,f.expected);assert.equal(r.passed,false);assert.ok(r.failures.some(s=>s.includes('judgment')));}finally{await f.cleanup();}
});
test('unmeasured families and missing reference matches block admission',async()=>{
  const f=await fixture();try{f.reference.companies[0]!.families.public_reputation='unknown';f.manifest.reference_sha256=hash(JSON.stringify(f.reference));await f.save('reference.json',f.reference);await f.save('manifest.json',f.manifest);f.review.matches.pop();await f.save('review.json',f.review);await assert.rejects(evaluateQuality(f.root,f.expected),/unmeasured/);}finally{await f.cleanup();}
});
test('a high populated-field count cannot hide low individual-fact recall',async()=>{
  const f=await fixture();try{for(const m of f.review.matches){m.verdict='partial';}await f.save('review.json',f.review);const r=await evaluateQuality(f.root,f.expected);assert.equal(r.passed,false);assert.ok(Object.values(r.families).every(v=>v.fact_recall===0));}finally{await f.cleanup();}
});
test('post-output reference creation and unsupported financial publications fail',async()=>{
  const f=await fixture();try{f.reference.sealed_at=f.manifest.finished_at;f.manifest.reference_sha256=hash(JSON.stringify(f.reference));await f.save('reference.json',f.reference);await f.save('manifest.json',f.manifest);f.review.claims[0]!.material_error='financial';await f.save('review.json',f.review);const r=await evaluateQuality(f.root,f.expected);assert.equal(r.passed,false);assert.ok(r.failures.some(s=>s.includes('frozen before')));assert.ok(r.failures.some(s=>s.includes('materially')));}finally{await f.cleanup();}
});
test('unknown cost and unfinished extraction cannot become zero-cost successes',async()=>{
  const f=await fixture();try{
    await f.save('report.json',{...f.report,combined_api_equivalent_usd:null});await assert.rejects(evaluateQuality(f.root,f.expected));
    await f.save('report.json',{...f.report,quality_measurements:{...f.report.quality_measurements,unfinished_extraction_packets:1}});await assert.rejects(evaluateQuality(f.root,f.expected));
  }finally{await f.cleanup();}
});
test('cost and tail latency budgets block a semantically correct cohort',async()=>{
  const f=await fixture();try{f.report.combined_api_equivalent_usd=2;f.report.company_runtime_ms.p95=100000;f.manifest.report_sha256=hash(JSON.stringify(f.report));await f.save('report.json',f.report);await f.save('manifest.json',f.manifest);const r=await evaluateQuality(f.root,f.expected);assert.equal(r.passed,false);assert.ok(r.failures.some(s=>s.includes('cost')));assert.ok(r.failures.some(s=>s.includes('p95')));}finally{await f.cleanup();}
});
test('edited source bodies and changed exports invalidate the preserved proof',async()=>{
  const f=await fixture();try{const body=String(f.rows[0]!.claims[0]!.value);await writeFile(join(f.root,'sources',hash(body)+'.txt'),'tampered');await assert.rejects(evaluateQuality(f.root,f.expected),/fidelity/);await writeFile(join(f.root,'results.jsonl'),(await readFile(join(f.root,'results.jsonl'),'utf8'))+'\n');await assert.rejects(evaluateQuality(f.root,f.expected),/fidelity/);}finally{await f.cleanup();}
});
test('successful evidence does not authorize reusing its own companies as a holdout',async()=>{
  const f=await fixture();try{const input=Array.from({length:100},(_,i)=>String(800000000+i));await assert.rejects(assertQualityAdmission(input,f.root,f.expected.configuration),/overlaps/);}finally{await f.cleanup();}
});
test('an asserted zero host overlap cannot override the frozen prior-host inventory',async()=>{
  const f=await fixture();try{
    const index=JSON.parse(await readFile(join(f.root,'source-index.json'),'utf8'));index[0].source_class='company_owned';
    await f.save('source-index.json',index);Object.assign(f.manifest,{source_index_sha256:hash(JSON.stringify(index))});
    f.rows[0]!.evidence[0]!.source_class='company_owned';const output=f.rows.map(row=>JSON.stringify(row)).join('\n')+'\n';await writeFile(join(f.root,'results.jsonl'),output);f.manifest.output_sha256=hash(output);
    const inventory=JSON.parse(await readFile(join(f.root,'freshness.json'),'utf8'));inventory.company_hosts=['example.org'];await f.save('freshness.json',inventory);Object.assign(f.manifest,{freshness_sha256:hash(JSON.stringify(inventory))});await f.save('manifest.json',f.manifest);
    const result=await evaluateQuality(f.root,f.expected);assert.equal(result.passed,false);assert.ok(result.failures.includes('Company host overlaps historical research'));
  }finally{await f.cleanup();}
});
test('matching a reference to another company cannot inflate coverage',async()=>{
  const f=await fixture();try{f.review.matches[0]!.claim_ids=[f.review.claims[10]!.id];await f.save('review.json',f.review);const result=await evaluateQuality(f.root,f.expected);assert.equal(result.passed,false);assert.ok(result.failures.includes('Invalid or unsupported matched claim'));}finally{await f.cleanup();}
});
test('real external-class website evidence still participates in host-disjointness checks',async()=>{
  const f=await fixture();try{
    const row=f.rows[0]!;row.claims.push({field:'registered_website',value:'WWW.EXAMPLE.ORG',availability:'available',confidence:null,evidence_ids:[]});
    assert.ok(companyHostsFor(f.rows,[]).includes('example.org'));
  }finally{await f.cleanup();}
});
test('unreviewed source permission cannot be promoted into admissible reference truth',async()=>{
  const f=await fixture();try{f.reference.facts[0]!.source.policy_review.status='unknown';await f.save('reference.json',f.reference);await assert.rejects(evaluateQuality(f.root,f.expected));}finally{await f.cleanup();}
});
