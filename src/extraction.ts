import{openingHoursStatement}from'./semantic-context.ts';
import{exactWhitespaceSpan,conciseAddressStatement}from'./exact-span.ts';
import{proposalSchema,canonical,errorMessage,type Proposal}from'./domain.ts';
import type{ResearchService}from'./service.ts';

/** Validate and commit model proposals before any conversational cleanup. */
export function commitExtraction(service:ResearchService,jobId:string,claims:Proposal[]){
 const job=service.store.job(jobId);if(job.deadline_at&&Date.parse(job.deadline_at)<=Date.now())throw Error('Extraction deadline elapsed; no late result is committed');if(service.store.profile(job.organisation_number,job.run_id))throw Error('Company output is already finalized');const accepted:Proposal[]=[],rejected:{field:string;reason:string}[]=[];
 for(const raw of proposalSchema.array().max(256).parse(claims)){let proposal=raw;if(proposal.field==='locations'&&openingHoursStatement(raw.value)){proposal={...raw,field:'business_description'};service.store.event(job.run_id,job.organisation_number,'claim_field_normalized','Exact weekly opening-hours statement retained under business_description, not locations');}try{const source=service.store.source(jobId,raw.snapshot_id),quote=exactWhitespaceSpan(source.text,raw.quote);if(quote){const exactValue=proposal.field==='official_website'?raw.value:exactWhitespaceSpan(quote,raw.value),statement=exactValue===undefined&&proposal.field==='locations'?conciseAddressStatement(quote,raw.value):undefined,value=exactValue??statement??raw.value;proposal=proposalSchema.parse({...proposal,value,quote});if(value!==raw.value||quote!==raw.quote)service.store.event(job.run_id,job.organisation_number,statement?'claim_source_statement_selected':'claim_whitespace_reanchored',raw.field+(statement?': selected the concise exact single-address source statement':': retained exact source characters; no words or punctuation changed'));}const check=service.verify(jobId,proposal);if(check.accepted)accepted.push(proposal);else rejected.push({field:proposal.field,reason:check.reason});}catch(error){rejected.push({field:proposal.field,reason:errorMessage(error)})}}
 for(const item of rejected)service.store.event(job.run_id,job.organisation_number,'claim_rejected',item.field+': '+item.reason);
 service.store.db.exec('BEGIN IMMEDIATE');
 let combined:Proposal[];
 try{if(job.deadline_at&&Date.parse(job.deadline_at)<=Date.now())throw Error('Extraction deadline elapsed; no late result is committed');const previous=service.store.modelResult(jobId),prior=previous===undefined?[]:proposalSchema.array().max(256).parse((previous as {claims:Proposal[]}).claims);combined=[...new Map([...prior,...accepted].map(p=>[canonical(p),p])).values()];if(combined.length>256)throw Error('Explicit aggregate extraction limit (256) reached; remaining proposals were not committed');service.store.saveModelResult(jobId,{claims:combined});service.store.db.exec('COMMIT');}catch(error){service.store.db.exec('ROLLBACK');throw error}
 service.store.event(job.run_id,job.organisation_number,'extraction_committed',combined.length+' verified model proposals persisted');
 return{committed:true,claims:combined,rejected};
}

/** Inspect only saved evidence; a bounded window count prevents model loops. */
export function inspectExtractionSource(service:ResearchService,jobId:string,snapshotId:string,phrase:string){
 const job=service.store.job(jobId),count=Number(service.store.db.prepare("SELECT count(*) n FROM events WHERE run=? AND org=? AND stage='model_inspect'").get(job.run_id,job.organisation_number)?.n??0);
 if(count>=4)return{snapshot_id:snapshotId,excerpt:null,budget_exhausted:true,message:'Local inspection budget reached. Submit the supported extraction now; unknown fields stay unresolved.'};
 service.store.event(job.run_id,job.organisation_number,'model_inspect','Local evidence window '+snapshotId);
 return service.inspect(jobId,snapshotId,phrase);
}
