import{validationPolicy}from'../src/policy.ts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { Store } from '../src/store.ts';
import { ResearchService } from '../src/service.ts';
import { config, loadEnv } from '../src/config.ts';
import { canonical, hash, materialChanges, researchFields, type Envelope, type Proposal } from '../src/domain.ts';
import { getPath, metricPaths } from '../src/financials.ts';
import { modelBilling } from '../src/billing.ts';
import { readOrganisations } from '../src/input.ts';
import {isDirectory} from '../src/attribution.ts';

const {values}=parseArgs({options:{input:{type:'string'},organisations:{type:'string'},db:{type:'string'},output:{type:'string',default:'out/benchmark-100/audit.json'},revalidate:{type:'boolean'}}});
loadEnv();if(!values.input||!values.organisations)throw new Error('Supply --input results.jsonl --organisations companies.jsonl');
const store=new Store(values.db??config().db);let blockedSourceCalls=0;const refuse:typeof fetch=async()=>{blockedSourceCalls++;throw Error('Mechanical audit is offline and cannot acquire sources');};const service=new ResearchService(store,{db:values.db??config().db,exaTransport:'codex',maxExaUsd:0,maxSearches:0,maxPages:0},refuse,async()=>{blockedSourceCalls++;throw Error('Mechanical audit cannot fetch HTML');});service.nativeSearch=async()=>{blockedSourceCalls++;throw Error('Mechanical audit cannot invoke discovery');};service.renderPublic=async()=>{blockedSourceCalls++;throw Error('Mechanical audit cannot render new sources');};
const rows:Envelope[]=(await readFile(values.input,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
const orgs=await readOrganisations(values.organisations),failures:string[]=[],withdrawn:{organisation_number:string;field:string;reason:string}[]=[];
if(canonical(rows.map(p=>p.organisation_number))!==canonical(orgs))failures.push('Input/output order or count mismatch');
let evidenceCount=0,availableClaims=0,financialRecords=0,financialAmounts=0,webClaims=0;
try{
  for(const p of rows){
    const row=store.db.prepare('SELECT body FROM jobs WHERE org=? AND run=?').get(p.organisation_number,p.run.run_id);
    if(!row){failures.push(`${p.organisation_number}: missing job`);continue;}
    const job=JSON.parse(z.object({body:z.string()}).parse(row).body);
    const evidence=new Map(p.evidence.map(e=>[e.id,e]));
    for(const e of p.evidence){
      evidenceCount++;
      try{const source=store.source(job.id,e.snapshot_id);if(hash(source.text)!==e.content_sha256||source.source_url!==e.source_url||!source.text.includes(e.claim_span))failures.push(`${p.organisation_number}: invalid evidence ${e.id}`);if(source.source_class==='company_owned'&&isDirectory(source.source_url)){source.source_class='external';store.db.prepare('UPDATE snapshots SET body=? WHERE id=? AND job=?').run(JSON.stringify(source),source.id,job.id);}e.source_class=source.source_class;e.extraction_method=source.extraction_method??(source.source_class==='public_registry'?'registry-json/v1':source.source_class==='fixture'?'fixture/v1':'exa-text-extractive/v1');}catch{failures.push(`${p.organisation_number}: cross-job or absent snapshot ${e.snapshot_id}`);}
    }
    for(const c of p.claims){
      if(c.availability!=='available')continue;
      if(!c.evidence_ids.length||c.evidence_ids.some(id=>!evidence.has(id)))failures.push(`${p.organisation_number}: unsupported ${c.field}`);
      if(researchFields.some(field=>field===c.field)){
        const primary=c.evidence_ids.map(id=>evidence.get(id)).find(e=>e&&e.source_class!=='public_registry');
        const value=typeof c.value==='string'?c.value:primary?.extraction_method==='nav-feed-index-query/v1'?primary.claim_span:undefined;
        const proposal:Proposal|undefined=primary&&value!==undefined?{field:z.enum(researchFields).parse(c.field),value,quote:primary.claim_span,snapshot_id:primary.snapshot_id,effective_date:c.reporting_period??null}:undefined;
        let reason='No preserved web source';
        if(proposal){try{const check=service.verify(job.id,proposal);if(check.accepted){webClaims++;continue;}reason=check.reason;}catch(error){reason=error instanceof Error?error.message:'Verification failed';}}
        if(values.revalidate){withdrawn.push({organisation_number:p.organisation_number,field:c.field,reason});c.availability='ambiguous';c.value=null;c.confidence=null;c.evidence_ids=[];p.errors.push({code:'final_revalidation',message:`${c.field}: ${reason}`});}
        else failures.push(`${p.organisation_number}: ${c.field}: ${reason}`);
      }
    }
    const financial=p.claims.find(c=>c.field==='financials');
    const records=getPath(financial?.value,['records']);
    for(const record of Array.isArray(records)?records:[]){
      financialRecords++;
      const id=String(getPath(record,['evidence_id'])??''),support=evidence.get(id);
      if(!support){failures.push(`${p.organisation_number}: financial evidence missing`);continue;}
      const raw=JSON.parse(support.claim_span);
      if(String(getPath(raw,['virksomhet','organisasjonsnummer']))!==p.organisation_number)failures.push(`${p.organisation_number}: financial entity mismatch`);
      const scope=getPath(raw,['regnskapstype'])==='KONSERN'?'group':getPath(raw,['regnskapstype'])==='SELSKAP'?'company':'unknown';
      if(getPath(record,['scope'])!==scope||getPath(record,['currency'])!==getPath(raw,['valuta'])||getPath(record,['period','end'])!==getPath(raw,['regnskapsperiode','tilDato']))failures.push(`${p.organisation_number}: financial scope/currency/period mismatch`);
      for(const [name,path]of Object.entries(metricPaths)){
        const amount=getPath(record,['metrics',name,'amount']);if(amount===null)continue;
        financialAmounts++;const original=getPath(raw,path);
        if(original===null||original===undefined||Number(original)!==amount)failures.push(`${p.organisation_number}: incorrect normalized ${name}`);
      }
    }
    availableClaims+=p.claims.filter(c=>c.availability==='available').length;
    const billing=modelBilling(store,job.id,job.mode);
    p.operations.model_cost_usd=billing.cost;p.operations.model_billing=billing.basis;
    p.operations.third_party_cost_usd=billing.cost===null?null:p.operations.known_exa_cost_usd+billing.cost;
    p.operations.cost_complete=billing.cost!==null&&store.uncertainCosts(job.id)===0;
    if(values.revalidate){p.changes=materialChanges(store.previous(p.organisation_number,p.run.run_id),p);p.run.terminal_status=p.claims.some(c=>c.availability==='available')?p.claims.some(c=>['failed','ambiguous','blocked'].includes(c.availability))?'partial':'completed':'failed';store.saveProfile(p);}
  }
  if(blockedSourceCalls)failures.push('Unexpected source acquisition attempted during offline audit');const report={audit_version:2,offline_source_calls:blockedSourceCalls,verification_policy:validationPolicy,created_at:new Date().toISOString(),input_count:orgs.length,output_count:rows.length,unique_companies:new Set(rows.map(p=>p.organisation_number)).size,available_claims:availableClaims,evidence_references_checked:evidenceCount,financial_records_checked:financialRecords,financial_amounts_compared_to_source:financialAmounts,web_claims_revalidated:webClaims,withdrawn_claims:withdrawn,failures,mechanical_checks_passed:failures.length===0,independent_semantic_precision:'not measured; these are mechanical consistency checks',result_sha256:hash(rows.map(p=>canonical(p)).join('\n'))};
  if(values.revalidate){await writeFile(values.input,rows.map(p=>JSON.stringify(p)).join('\n')+'\n',{mode:0o600});}
  await mkdir(dirname(values.output!),{recursive:true});await writeFile(values.output!,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
}finally{store.close();}
