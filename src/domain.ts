import { createHash } from 'node:crypto';
import { z } from 'zod';

export const availabilitySchema = z.enum(['available', 'not_available', 'blocked', 'not_applicable', 'ambiguous', 'failed']);
export type Availability = z.infer<typeof availabilitySchema>;
export const organisationSchema = z.string().regex(/^\d{9}$/, 'Expected a nine-digit Norwegian organisation number');
export const researchFields = ['business_description', 'official_website', 'company_owned_profiles', 'hiring', 'public_activity', 'locations','public_reputation'] as const;
export const dateTypeSchema=z.enum(['event_date','publication_date','scheduled_event_date','source_date_unclassified','application_deadline','project_period_start','project_period_end','approval_period_start','approval_period_end','fee_validity_year']);
export const proposalSchema = z.object({
  field: z.enum(researchFields), value: z.string().min(1).max(3000), snapshot_id: z.string(),
  historical_hiring:z.literal(true).optional(),
  quote: z.string().min(10).max(6000), effective_date: z.string().nullable(), date_type:dateTypeSchema.optional(),
});
export type Proposal = z.infer<typeof proposalSchema>;
export const researchResultSchema = z.object({ claims: z.array(proposalSchema).max(256) });
export const researchOutputSchema = {
  type: 'object', properties: { claims: { type: 'array', maxItems: 40, items: {
    type: 'object', properties: {
      field: { type: 'string', enum: [...researchFields] }, value: { type: 'string', minLength: 1, maxLength: 3000, description: 'Copy the exact quote as the value. Never paraphrase. For official_website only, use the verified HTTPS URL.' },
      snapshot_id: { type: 'string' }, quote: { type: 'string', minLength: 10, maxLength: 6000, description: 'Exact contiguous text copied from preserved research_context or inspect_source. Preserve whitespace and punctuation.' }, effective_date: { type: ['string', 'null'] },
    }, required: ['field', 'value', 'snapshot_id', 'quote', 'effective_date'], additionalProperties: false,
  } } }, required: ['claims'], additionalProperties: false,
};
export type Snapshot = {
  derivation?:{kind:'privacy_filtered_registry_projection';input_snapshot_id:string;input_content_sha256:string;fields_removed:string[];generated_at?:string};
  id: string; source_url: string; source_class: 'public_registry' | 'company_owned' | 'external' | 'fixture';
  retrieved_at: string; content_sha256: string; text: string; organisation_number: string; run_id: string;extraction_method?:string;rendering?:{input_snapshot_id:string;dom_sha256:string;resources:{url:string;raw_sha256:string;retrieved_at:string;status:number}[];elapsed_ms:number;blocked_requests:number};transport?:{raw_sha256:string;retrieved_at:string;redirect_chain?:string[];final_url?:string};
 document?:{raw_sha256:string;source_url:string;page_number:number;page_count:number;parser:{id:string;version:string};raw_path:string};
};
export type Evidence = Omit<Snapshot, 'text' | 'organisation_number' | 'run_id'> & { claim_span: string; snapshot_id: string; extraction_method?:string };
export type Claim = { field: string; value: unknown; availability: Availability; confidence: number | null; evidence_ids: string[]; reporting_period?: string | null;qualifiers?:Record<string,unknown> };
export type Change = { field: string; previous_value: unknown; current_value: unknown; previous_evidence_ids: string[]; current_evidence_ids: string[] };
export type Envelope = {
  claim_history?:import('./claim-ledger.ts').ClaimRevision[];
  synthesis?:ReturnType<typeof import('./claim-ledger.ts').synthesize>;
  organisation_number: string;
  run: { run_id: string; started_at: string; completed_at: string; terminal_status: 'completed' | 'partial' | 'failed'; mode: 'demo' | 'registry' | 'eve' };
  claims: Claim[]; evidence: Evidence[]; changes: Change[]; errors: { code: string; message: string }[];
  operations: { requests: number; runtime_ms: number; third_party_cost_usd: number | null; known_exa_cost_usd: number; model_cost_usd: number | null; cost_complete: boolean; exa_billing?:string; model_billing?:string; model_input_tokens?:number; model_output_tokens?:number;model_api_equivalent_usd?:number|null;model_api_equivalent_basis?:unknown;model_usage_complete?:boolean;estimated_third_party_cost_usd?:number|null;known_search_api_equivalent_usd?:number;search_api_equivalent_usd?:number|null };
};
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const now = () => new Date().toISOString();
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((v) => JSON.parse(canonical(v))));
  if (value !== null && typeof value === 'object') return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, JSON.parse(canonical(v))])));
  return JSON.stringify(value) ?? 'null';
}
export function snapshot(input: Omit<Snapshot, 'id' | 'content_sha256' | 'retrieved_at'>, at = now()): Snapshot {
  const content_sha256 = hash(input.text);
  return { ...input, content_sha256, retrieved_at: at, id: hash(`${input.organisation_number}\n${input.run_id}\n${input.source_url}\n${content_sha256}\n${at}`) };
}
export function evidenceFor(source: Snapshot, quote: string): Evidence {
  return { id: hash(`${source.id}\n${quote}`), snapshot_id: source.id, source_url: source.source_url, source_class: source.source_class, retrieved_at: source.retrieved_at, content_sha256: source.content_sha256, claim_span: quote,extraction_method:source.extraction_method??(source.source_class==='public_registry'?'registry-json/v1':source.source_class==='fixture'?'fixture/v1':'exa-text-extractive/v1'),...(source.document?{document:source.document}:{}),...(source.transport?{transport:source.transport}:{}),...(source.derivation?{derivation:source.derivation}:{}) };
}
export function materialChanges(previous: Envelope | undefined, current: Envelope): Change[] {
  if (!previous) return [];
  const result: Change[] = [];
  const fields = new Set(current.claims.filter(c => c.availability === 'available').map(c => c.field));
  for (const field of fields) {
    const before = previous.claims.filter(c => c.field === field && c.availability === 'available');
    const after = current.claims.filter(c => c.field === field && c.availability === 'available');
    const sourceVersions=(claims:Claim[],profile:Envelope)=>{
      const references=new Map(profile.evidence.map(e=>[e.id,e]));
      const webFact=researchFields.some(f=>f===field)&&field!=='official_website';
      return [...new Set(claims.flatMap(c=>(webFact?c.evidence_ids.slice(0,1):c.evidence_ids).map(id=>references.get(id))).filter((e):e is Evidence=>Boolean(e&&/^[0-9a-f]{64}$/.test(e.content_sha256)&&(!webFact||e.source_class!=='public_registry'))).map(e=>{const derived=field==='hiring'&&e.extraction_method==='nav-feed-index-query/v1'?claims.find(c=>c.evidence_ids.includes(e.id))?.qualifiers?.catalogue_sha256:undefined;return `${e.source_url.startsWith('urn:signalpost:bulk:')?`urn:signalpost:bulk:${profile.organisation_number}`:e.source_url}${webFact?'#extraction='+e.extraction_method:''}\n${typeof derived==='string'&&/^[a-f0-9]{64}$/.test(derived)?derived:e.content_sha256}`;}))].sort();
    };
    const beforeSources=sourceVersions(before,previous),afterSources=sourceVersions(after,current);
    // A new extractor/normalizer or another chosen excerpt from unchanged
    // source content is a processing revision, not a business-change event.
    if(beforeSources.length&&canonical(beforeSources)===canonical(afterSources))continue;
    const previousVersions=new Map(beforeSources.map(version=>{const split=version.lastIndexOf('\n');return [version.slice(0,split),version.slice(split+1)];}));
    const changedComparableSource=afterSources.some(version=>{const split=version.lastIndexOf('\n'),url=version.slice(0,split);return previousVersions.has(url)&&previousVersions.get(url)!==version.slice(split+1);});
    if(!changedComparableSource)continue;
    const materialValue = (value:unknown):unknown => {
      if(field==='official_website'&&typeof value==='string'){try{return new URL(value).hostname.replace(/^www\./,'');}catch{}}
      if(field==='company_owned_profiles'&&typeof value==='string'){try{const u=new URL(value);return u.hostname.replace(/^www\./,'')+u.pathname.replace(/\/$/,'');}catch{}}
      if(Array.isArray(value))return value.map(materialValue);
      if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['evidence_id','evidence_ids','observed_at','observed_from','catalogue_sha256','collection_started_at','completed_at','record_id'].includes(key)).map(([key,v])=>[key,materialValue(v)]));
      return value;
    };
    const values = (claims: Claim[]) => claims.map(c => materialValue(c.value)).sort((a, b) => canonical(a).localeCompare(canonical(b)));
    if(['business_description','company_owned_profiles'].includes(field)&&before.every(claim=>after.some(next=>canonical(materialValue(next.value))===canonical(materialValue(claim.value)))))continue;
    if (before.length && canonical(values(before)) !== canonical(values(after))) result.push({ field, previous_value: values(before), current_value: values(after), previous_evidence_ids: before.flatMap(c => c.evidence_ids), current_evidence_ids: after.flatMap(c => c.evidence_ids) });
  }
  return result;
}
