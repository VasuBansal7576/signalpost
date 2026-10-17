import{knownAccessRestriction}from'./source-access-policy.ts';
import{validationPolicy}from'./policy.ts';
import {canonical,hash,type Claim,type Envelope} from './domain.ts';
import type {Store} from './store.ts';
export type ClaimRevision={key:string;field:string;value:unknown;availability:string;freshness:'current'|'stale'|'withdrawn';first_observed:string;last_observed:string;run_id:string;evidence_ids:string[];source_versions:string[];verification_policy?:string;historical_review_required?:boolean;withdrawal_reason?:string;withdrawal_receipt_sha256?:string|undefined;kind:'new'|'unchanged'|'updated'|'processing_correction'|'stale'|'withdrawn'};
const semantic=(value:unknown):unknown=>Array.isArray(value)?value.map(semantic):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!['evidence_id','evidence_ids','observed_at','observed_from','catalogue_sha256','collection_started_at','completed_at','record_id'].includes(k)).map(([k,v])=>[k,semantic(v)])):value;
export function claimKey(org:string,claim:Claim,envelope:Envelope){
  const value=claim.value as Record<string,unknown>|null;
  const scope=value&&typeof value==='object'&&!Array.isArray(value)?value.scope:null;
  const source=envelope.evidence.find(e=>claim.evidence_ids.includes(e.id))?.source_url??null;
  const discriminator=['business_description','hiring','public_activity','locations'].includes(claim.field)?source:claim.field==='company_owned_profiles'?claim.value:null;
  return hash(canonical({org,field:claim.field,period:claim.reporting_period??null,scope,discriminator}));
}
/** Current projections are mutable; each observation and original envelope is preserved. */
export function updateClaimLedger(store:Store,envelope:Envelope):ClaimRevision[]{
  const prior=store.db.prepare('SELECT body FROM current_claims WHERE org=?').all(envelope.organisation_number).map(r=>JSON.parse(String(r.body)) as ClaimRevision);
  const entries:ClaimRevision[]=[],seen=new Set<string>();
  const groups=new Map<string,{claim:Claim;values:unknown[]}>();
  for(const c of envelope.claims.filter(c=>c.availability==='available')){
    const key=claimKey(envelope.organisation_number,c,envelope),group=groups.get(key);
    if(!group){groups.set(key,{claim:{...c,evidence_ids:[...c.evidence_ids]},values:[c.value]});continue;}
    if(!group.values.some(v=>canonical(v)===canonical(c.value)))group.values.push(c.value);
    group.claim.evidence_ids=[...new Set([...group.claim.evidence_ids,...c.evidence_ids])];
  }
  for(const [key,group] of groups){
    const values=group.values.sort((a,b)=>canonical(a).localeCompare(canonical(b))),c={...group.claim,value:values.length===1?values[0]:values},old=prior.find(x=>x.key===key);seen.add(key);
    const source_versions=[...new Set(envelope.evidence.filter(e=>c.evidence_ids.includes(e.id)).map(e=>{const catalogue=c.field==='hiring'&&e.extraction_method==='nav-feed-index-query/v1'?c.qualifiers?.catalogue_sha256:undefined;return e.source_url+'\n'+(typeof catalogue==='string'&&/^[a-f0-9]{64}$/.test(catalogue)?catalogue:e.content_sha256);}))].sort();
    const sameValue=old&&canonical(semantic(old.value))===canonical(semantic(c.value));
    // Older ledgers fingerprinted the derived NAV query body. Resolve that legacy
    // pointer through its preserved source before calling newly exposed detail a business update.
    let previousVersions=old?.source_versions;
    if(old&&!sameValue&&c.field==='hiring'&&c.qualifiers?.catalogue_sha256){
      const sources=store.db.prepare("SELECT body FROM snapshots WHERE job IN (SELECT id FROM jobs WHERE org=?) AND json_extract(body,'$.extraction_method')='nav-feed-index-query/v1'").all(envelope.organisation_number).map(r=>JSON.parse(String(r.body)));
      previousVersions=old.source_versions.map(version=>{const split=version.lastIndexOf('\n'),url=version.slice(0,split),digest=version.slice(split+1),source=sources.find(s=>s.source_url===url&&s.content_sha256===digest);if(!source)return version;try{const receipt=JSON.parse(source.text);return /^[a-f0-9]{64}$/.test(receipt.catalogue_sha256)?url+'\n'+receipt.catalogue_sha256:version;}catch{return version;}}).sort();
    }
    const sameSources=old&&canonical(previousVersions)===canonical(source_versions);
    const revision:ClaimRevision={key,field:c.field,value:c.value,availability:c.availability,freshness:'current',first_observed:old?.first_observed??envelope.run.completed_at,last_observed:envelope.run.completed_at,run_id:envelope.run.run_id,evidence_ids:c.evidence_ids,source_versions,verification_policy:validationPolicy,kind:!old?'new':sameValue?'unchanged':sameSources?'processing_correction':'updated'};
    entries.push(revision);
  }
  for(const old of prior)if(!seen.has(old.key)){
    if(old.freshness==='withdrawn'){entries.push({...old,run_id:envelope.run.run_id});continue;}
    const withdrawals=envelope.claims.filter(c=>c.field===old.field&&c.availability!=='available'&&typeof c.qualifiers?.withdrawn_value_sha256==='string');
    const values=Array.isArray(old.value)?old.value:[old.value],matches=withdrawals.filter(c=>values.some(v=>typeof v==='string'&&hash(v)===c.qualifiers!.withdrawn_value_sha256)&&old.source_versions.some(s=>s.endsWith('\n'+c.qualifiers!.withdrawn_source_sha256)));
    const primary=old.source_versions.map(v=>v.slice(0,v.lastIndexOf('\n'))).filter(u=>!u.startsWith('https://data.brreg.no/')&&!u.startsWith('urn:signalpost:bulk:'));
    const policies=primary.map(knownAccessRestriction),blocked=primary.length>0&&policies.every(Boolean);
    if(matches.length||blocked){const retained=blocked?[]:values.filter(v=>!matches.some(c=>typeof v==='string'&&hash(v)===c.qualifiers!.withdrawn_value_sha256));const reason=blocked?'Historical evidence is blocked by reviewed source-access restrictions.':String(matches[0]!.qualifiers!.reason??'Exact source/value withdrawn after semantic review.');entries.push({...old,value:retained.length?(retained.length===1?retained[0]:retained):null,availability:retained.length?old.availability:blocked?'blocked':'ambiguous',freshness:retained.length?'stale':'withdrawn',kind:retained.length?'processing_correction':'withdrawn',withdrawal_reason:reason,withdrawal_receipt_sha256:matches[0]?.qualifiers?.publication_review_receipt_sha256 as string|undefined,historical_review_required:false,run_id:envelope.run.run_id});}
    else entries.push({...old,freshness:'stale',kind:'stale',historical_review_required:old.verification_policy!==validationPolicy,run_id:envelope.run.run_id});
  }
  store.db.exec('BEGIN IMMEDIATE');
  try{for(const entry of entries){store.db.prepare('INSERT INTO current_claims VALUES(?,?,?) ON CONFLICT(org,key) DO UPDATE SET body=excluded.body').run(envelope.organisation_number,entry.key,JSON.stringify(entry));store.db.prepare('INSERT OR IGNORE INTO claim_observations VALUES(?,?,?,?)').run(envelope.organisation_number,entry.key,envelope.run.run_id,JSON.stringify(entry));}store.db.exec('COMMIT');}catch(e){store.db.exec('ROLLBACK');throw e;}
  return entries;
}
export function synthesize(envelope:Envelope){
  const sections:{title:string;text:string;evidence_ids:string[]}[]=[];
  const supported=(field:string)=>envelope.claims.filter(c=>c.field===field&&c.availability==='available');
  const qualifications=(c:Claim)=>{const q=c.qualifiers??{};return [typeof q.scope_note==='string'?q.scope_note:null,q.current_independent_provider_established===false?'Current independent operation by this legal company is not established. '+String(q.migration_context??'Provider transition remains unresolved.'):null,q.assertion_scope==='company_advertised_service_and_performance_promise'?'Company-advertised promise; independent performance evidence or a contractual guarantee is not established.':null,q.comparative_ranking_independently_established===false?'Company self-description; independent comparative ranking is not established.':null,q.source_internal_recruitment_conflict===true?'The source has conflicting recruitment statements; current vacancies and current absence of vacancies are both unresolved.':null,q.retrieval_date_is_duration_reference===false?'The source-relative duration has an unconfirmed reference date.':null,q.document_subject_only===true?'Historical document observation; current status is not established.':null,q.brand_history_not_legal_entity_formation===true?'Publisher-reported brand/predecessor history; this legal entity was formed in '+String(q.legal_entity_formation_year)+'. Continuous legal-entity operation since the earlier date is not established.':null,q.current_certification_independently_verified===false?'Publisher-reported credentials; independent current certificate status, scope and validity are not established.':null].filter(Boolean).join(' ');};
  const descriptions=supported('business_description').filter(c=>c.qualifiers?.source_scope!=='official_reported_competence');if(descriptions.length)sections.push({title:'Business',text:descriptions.map(description=>[String(description.value),qualifications(description)].filter(Boolean).join(' ')).join('\n\n'),evidence_ids:[...new Set(descriptions.flatMap(c=>c.evidence_ids))]});else{const registered=supported('registry_activity')[0];if(registered)sections.push({title:'Registered activity',text:(Array.isArray(registered.value)?registered.value.join(' '):String(registered.value))+' Registered activity only; current products/services were not independently established.',evidence_ids:registered.evidence_ids});}
  const approvals=supported('business_description').filter(c=>c.qualifiers?.source_scope==='official_reported_competence');if(approvals.length)sections.push({title:'Official reported competence',text:approvals.map(c=>String(c.value)+'; approval '+String(c.qualifiers?.approval_valid_from??'start unknown')+' to '+String(c.qualifiers?.approval_valid_until??'end unknown')+'.').join(' ')+' Approval scope only; completed projects and current service delivery are not established.',evidence_ids:[...new Set(approvals.flatMap(c=>c.evidence_ids))]});
  const status=supported('legal_status')[0],legal=status?.value as {under_liquidation?:boolean;bankruptcy?:boolean;deleted_at?:string}|undefined;if(status&&legal&&(legal.under_liquidation||legal.bankruptcy||legal.deleted_at))sections.push({title:'Legal status',text:[legal.under_liquidation?'Registered as under liquidation':null,legal.bankruptcy?'Registered bankruptcy':null,legal.deleted_at?'Registry deletion date '+legal.deleted_at:null].filter(Boolean).join('; '),evidence_ids:status.evidence_ids});
  for(const field of ['revenue','annual_result','assets']){const c=supported(field)[0],v=c?.value as {amount:number;currency:string;period_end:string;scope:string;liquidation_accounts?:boolean}|undefined;if(c&&v)sections.push({title:field==='revenue'?'Revenue':field==='assets'?'Assets':'Annual result',text:`${v.amount.toLocaleString('en-US')} ${v.currency}; company ${v.liquidation_accounts?'liquidation ':''}accounts ending ${v.period_end}.`,evidence_ids:c.evidence_ids});}
  const roles=supported('leadership')[0];if(roles){const list=(roles.value as {roles?:{name:string;role:string}[]}).roles?.slice(0,4)??[];if(list.length)sections.push({title:'Current registered roles',text:list.map(x=>x.name+' — '+x.role).join('; '),evidence_ids:roles.evidence_ids});}
  const hiring=supported('hiring').find(c=>c.qualifiers?.hiring_kind!=='source_scoped_no_attributed_ads'&&!c.qualifiers?.historical_hiring)??supported('hiring').find(c=>c.qualifiers?.historical_hiring);if(hiring)sections.push({title:hiring.qualifiers?.historical_hiring?'Historical recruitment':'Hiring information',text:typeof hiring.value==='string'?hiring.value:`${String((hiring.value as {active_ads_attributed?:number}).active_ads_attributed??'Unknown number of')} ads were active and exactly attributed in the NAV source at ${(hiring.value as {observed_at?:string}).observed_at??'an unknown cutoff'}; see source-scoped details.`,evidence_ids:hiring.evidence_ids});
  const unknown=[...new Set(envelope.claims.filter(c=>['failed','blocked','ambiguous','not_available'].includes(c.availability)).map(c=>c.field))];
  for(const section of sections.filter(s=>s.title==='Hiring information'||s.title==='Historical recruitment')){const c=supported('hiring').find(c=>c.evidence_ids[0]===section.evidence_ids[0]);if(c&&qualifications(c))section.text+=' '+qualifications(c);}
  return{method:'claim-templates/v3-complete-business-inventory',sections,unknown_fields:unknown,change_count:envelope.changes.length,note:'Only supported facts are summarised; source-scoped absence does not establish company-wide absence.'};
}
