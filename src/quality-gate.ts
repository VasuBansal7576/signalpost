import {readFile, readdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {z} from 'zod';
import {canonical, hash, researchFields, type Envelope, type Snapshot} from './domain.ts';
import {publicationRestriction} from './source-access-policy.ts';

// Engineering admission criteria, deliberately separate from the official score.
export const qualityPolicy = {
  version: 'quality-admission/v1', pilotMin: 12, pilotMax: 20,
  precision: .98, precisionLower95: .90, externalClaimsMin: 50,
  familyRecall: .80, factRecall: .70, referenceFactsPerFamily: 2,
  companyP95Ms: 90000, equivalentUsdPerCompany: .10,
  maxRequestsPerCompany: 100, maxModelUsdPerCompany: .05,
  deadlineSeconds: {pilot: 600, '100': 1200, '1000': 2700},
  maxEvidenceAgeMs: 7 * 86400000,
  reviewDeadlineMs: {pilot: 1800000, '100': 2700000, '1000': 3600000},
} as const;
export type QualityStage = 'pilot' | '100' | '1000';
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const org = z.string().regex(/^\d{9}$/);
const date = z.string().datetime();
const family = z.enum(researchFields);
const source = z.object({url: z.string().url(), sha256: sha, quote: z.string().min(10),
  provenance:z.object({kind:z.enum(['public_http_text','public_rendered_text','readable_web_transcript','pdf_text']),retrieved_at:date,publisher_raw_sha256:sha.nullable()}).strict(),
  policy_review:z.object({status:z.literal('permitted'),reviewed_at:date,source_url:z.string().url(),basis:z.string().min(20)}).strict(),
}).strict();
export const referenceSchema = z.object({
  reviewer: z.string().min(3), sealed_at: date, independent_of_output: z.literal(true),
  companies: z.array(z.object({organisation_number: org, identity_reviewed: z.literal(true),
    families: z.record(family, z.enum(['reviewed', 'unknown']))}).strict()),
  facts: z.array(z.object({id: z.string().min(1), organisation_number: org, field: family,
    statement: z.string().min(10), scope: z.string().min(3), source}).strict()),
}).strict();
export const reviewSchema = z.object({
  reviewer: z.string().min(3), reviewed_at: date, full_output_context: z.literal(true),
  claims: z.array(z.object({id: sha, verdict: z.enum(['supported', 'ambiguous', 'unsupported']),
    reason: z.string().min(20), material_error: z.enum(['none', 'wrong_entity', 'financial', 'policy'])}).strict()),
  matches: z.array(z.object({fact_id: z.string(), verdict: z.enum(['full', 'partial', 'missing']),
    claim_ids: z.array(sha), reason: z.string().min(20)}).strict()),
  synthesis: z.array(z.object({organisation_number: org, supported: z.boolean(), reason: z.string().min(20)}).strict()),
  ux: z.object({sources_inspectable: z.literal(true), unknowns_visible: z.literal(true), qualifiers_preserved: z.literal(true)}).strict(),
}).strict();
const manifestSchema = z.object({
  version: z.literal(1), stage: z.enum(['pilot', '100', '1000']),
  code_sha256: sha, configuration_sha256: sha, policy_sha256: sha,
  input_sha256: sha, reference_sha256: sha, output_sha256: sha, report_sha256: sha,
  freshness_sha256: sha, source_index_sha256: sha,
  started_at: date, finished_at: date, prior_company_overlap: z.literal(0),
  prior_host_overlap: z.number().int().nonnegative(),
  previous_evidence: z.string().optional(),
}).strict();
const reportSchema = z.object({
  input_count: z.number().int().positive(), output_count: z.number().int().positive(),
  elapsed_ms: z.number().finite().nonnegative(),
  company_runtime_ms: z.object({p95: z.number().finite().nonnegative()}),
  keyless: z.literal(true), model_disabled: z.literal(false), model_transport: z.literal('compact'),
  exa_transport: z.literal('codex'), search_usage_complete: z.literal(true),
  combined_api_equivalent_usd: z.number().finite().nonnegative(),
  runtime: z.object({admission_stopped: z.literal(false), physical_requests: z.number().int().nonnegative()}),
  quality_measurements: z.object({runtime_unchanged: z.literal(true), unknown_usage_calls: z.literal(0),
    omitted_extraction_spans: z.literal(0), unfinished_extraction_packets: z.literal(0)}).strict(),
});

export class QualityAdmissionDenied extends Error {
  constructor(readonly failures: string[]) {
    super('Quality admission denied: ' + failures.join('; ')); this.name = 'QualityAdmissionDenied';
  }
}
export const policyFingerprint = () => hash(canonical(qualityPolicy));
export async function runtimeFingerprint(root = process.cwd()) {
  const files = ['package.json', 'package-lock.json'];
  async function walk(directory: string) {
    for (const entry of await readdir(join(root, directory), {withFileTypes: true})) {
      if (entry.isDirectory()) await walk(join(directory, entry.name));
      else if (/\.(?:ts|mjs|js|md|py|html|css|json)$/.test(entry.name)) files.push(join(directory, entry.name));
    }
  }
  for (const directory of ['src', 'agent', 'scripts', 'ui']) await walk(directory);
  return hash(canonical(await Promise.all(files.sort().map(async path => [path, hash(await readFile(join(root, path), 'utf8'))]))));
}
/** Bind every behavior environment variable, without exposing its value. State paths vary by cohort. */
export function configurationFingerprint(options: Record<string, unknown>, env = process.env) {
  const state = new Set(['SIGNALPOST_DB', 'SIGNALPOST_SUBSCRIPTION_ADMISSION_GUARD', 'SIGNALPOST_MAX_SEARCH_EQUIVALENT_USD']);
  const environment = Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('SIGNALPOST_') && !state.has(key)));
  return hash(canonical({options, environment,provider_routing:{openai_key_present:Boolean(env.OPENAI_API_KEY),openai_base_url:env.OPENAI_BASE_URL??null,openai_api_base:env.OPENAI_API_BASE??null,gateway_key_present:Boolean(env.AI_GATEWAY_API_KEY),anthropic_key_present:Boolean(env.ANTHROPIC_API_KEY)}}));
}
export function executionConfiguration(options: Record<string, unknown>) {
  const state = new Set(['organisations', 'output', 'profiles-output', 'report', 'run-id', 'db', 'cache', 'expected-count',
    'quality-evidence', 'timeout-seconds', 'max-requests', 'max-model-equivalent-usd', 'max-search-equivalent-usd', 'checkpoint-every', 'help']);
  return configurationFingerprint(Object.fromEntries(Object.entries(options).filter(([key]) => !state.has(key))));
}
export function availableClaims(rows: Envelope[]) {
  return rows.flatMap(row => row.claims.filter(c => c.availability === 'available').map(claim => ({
    id: hash(canonical({organisation_number: row.organisation_number, claim})),
    organisation_number: row.organisation_number, claim,
  })));
}
/** Production snapshots often retain external class even after an exact site binding. */
export function companyHostsFor(rows:Envelope[],snapshots:Snapshot[]) {
  const urls=[...snapshots.filter(s=>s.source_class==='company_owned').map(s=>s.source_url),
    ...rows.flatMap(row=>row.claims.filter(c=>['official_website','registered_website'].includes(c.field)&&c.availability==='available').flatMap(c=>typeof c.value==='string'?[c.value]:[]))];
  return [...new Set(urls.flatMap(value=>{try{return[new URL(value.includes('://')?value:'https://'+value).hostname.toLowerCase().replace(/^www\./,'')];}catch{return[];}}))];
}
export function requiredEvidence(count: number): QualityStage | undefined {
  return count > 1000 ? '1000' : count > 100 ? '100' : count > qualityPolicy.pilotMax ? 'pilot' : undefined;
}
export function precisionLower95(supported: number, total: number) {
  if (!total) return 0;
  const p = supported / total, z = 1.959963984540054, a = z * z;
  return (p + a / (2 * total) - z * Math.sqrt((p * (1 - p) + a / (4 * total)) / total)) / (1 + a / total);
}
function unique(values: string[], name: string, failures: string[]) {
  if (new Set(values).size !== values.length) failures.push('Duplicate ' + name);
}
export async function assertReferenceReady(directory:string,reference:z.infer<typeof referenceSchema>,companies:string[]){
  const failures:string[]=[];
  if(canonical(reference.companies.map(c=>c.organisation_number).sort())!==canonical([...companies].sort()))failures.push('Reference company coverage incomplete');
  unique(reference.facts.map(f=>f.id),'reference fact',failures);
  for(const company of reference.companies)for(const field of researchFields)if(company.families[field]!=='reviewed')failures.push('Reference family unmeasured: '+field);
  for(const field of researchFields)if(reference.facts.filter(f=>f.field===field).length<qualityPolicy.referenceFactsPerFamily)failures.push('Reference lacks opportunities for '+field);
  for(const fact of reference.facts){
    if(!companies.includes(fact.organisation_number))failures.push('Reference belongs to another cohort');
    const body=await readFile(join(directory,'sources',fact.source.sha256+'.txt'),'utf8');
    if(hash(body)!==fact.source.sha256||!body.includes(fact.source.quote))failures.push('Reference source fidelity failed');
    if(Date.parse(fact.source.provenance.retrieved_at)>Date.parse(reference.sealed_at)||Date.parse(fact.source.policy_review.reviewed_at)>Date.parse(reference.sealed_at))failures.push('Reference provenance/policy review was not frozen before acquisition');
    if(publicationRestriction({id:fact.id,source_url:fact.source.url,source_class:'external',retrieved_at:reference.sealed_at,content_sha256:fact.source.sha256,text:body,organisation_number:fact.organisation_number,run_id:'reference'}))failures.push('Reference uses a restricted source');
  }
  if(failures.length)throw new QualityAdmissionDenied([...new Set(failures)]);
}

export async function evaluateQuality(directory: string, expected: {code: string; configuration: string}, now = Date.now(), seen = new Set<string>()) {
  const root = resolve(directory);
  if (seen.has(root)) throw new QualityAdmissionDenied(['Cyclic evidence chain']);
  if (seen.size >= 3) throw new QualityAdmissionDenied(['Quality evidence chain exceeds the three declared stages']);
  seen.add(root);
  const failures: string[] = [];
  const text = async (name: string) => readFile(join(root, name), 'utf8');
  const [manifestText, inputText, outputText, referenceText, reviewText, reportText] = await Promise.all(
    ['manifest.json', 'companies.jsonl', 'results.jsonl', 'reference.json', 'review.json', 'report.json'].map(text));
  const manifest = manifestSchema.parse(JSON.parse(manifestText!));
  const reference = referenceSchema.parse(JSON.parse(referenceText!));
  const review = reviewSchema.parse(JSON.parse(reviewText!));
  const report = reportSchema.parse(JSON.parse(reportText!));
  const sourceIndexText = await text('source-index.json'), freshnessText = await text('freshness.json');
  const snapshots: Snapshot[] = JSON.parse(sourceIndexText);
  const freshness = z.object({captured_at:date, excluded_company_ids:z.array(org), company_hosts:z.array(z.string().min(1)),scope:z.string().min(20)}).passthrough().parse(JSON.parse(freshnessText));
  const snapshotMap = new Map(snapshots.map(s => [s.id, s]));
  const input = inputText!.trim().split(/\r?\n/).map(line => org.parse(JSON.parse(line)));
  await assertReferenceReady(root,reference,input);
  const rows: Envelope[] = outputText!.trim().split(/\r?\n/).map(line => JSON.parse(line));
  for (const [label, actual, desired] of [
    ['runtime', manifest.code_sha256, expected.code], ['configuration', manifest.configuration_sha256, expected.configuration],
    ['policy', manifest.policy_sha256, policyFingerprint()], ['input', hash(inputText!), manifest.input_sha256],
    ['output', hash(outputText!), manifest.output_sha256], ['reference', hash(referenceText!), manifest.reference_sha256],
    ['report', hash(reportText!), manifest.report_sha256],
    ['freshness inventory', hash(freshnessText), manifest.freshness_sha256],
    ['source index', hash(sourceIndexText), manifest.source_index_sha256],
  ]) if (actual !== desired) failures.push(label + ' fingerprint mismatch');
  const started = Date.parse(manifest.started_at), finished = Date.parse(manifest.finished_at);
  if (started > finished || finished > now || now - finished > qualityPolicy.maxEvidenceAgeMs) failures.push('Invalid or expired run window');
  if (Date.parse(reference.sealed_at) >= started) failures.push('Reference must be frozen before production starts');
  if (Date.parse(review.reviewed_at) < finished || Date.parse(review.reviewed_at) > now) failures.push('Invalid review time');
  if (Date.parse(review.reviewed_at) - started > qualityPolicy.reviewDeadlineMs[manifest.stage]) failures.push('Verification timebox exceeded; no extended repair loop');
  if (manifest.prior_host_overlap) failures.push('Host overlap with prior development/evaluation evidence');
  if (Date.parse(freshness.captured_at) >= started) failures.push('Freshness inventory must precede production');
  if (input.some(id=>freshness.excluded_company_ids.includes(id))) failures.push('Cohort includes previously seen companies');
  const companyHosts = companyHostsFor(rows,snapshots);
  if (companyHosts.some(host=>freshness.company_hosts.includes(host))) failures.push('Company host overlaps historical research');
  const count = input.length;
  if (manifest.stage === 'pilot' ? count < qualityPolicy.pilotMin || count > qualityPolicy.pilotMax : count !== Number(manifest.stage)) failures.push('Incorrect stage cohort size');
  unique(input, 'company', failures);
  if (canonical(input) !== canonical(rows.map(r => r.organisation_number)) || report.input_count !== count || report.output_count !== count) failures.push('Ordered output/input count mismatch');
  if (canonical([...reference.companies.map(c => c.organisation_number)].sort()) !== canonical([...input].sort())) failures.push('Reference company coverage incomplete');
  for (const company of reference.companies) for (const field of researchFields) if (company.families[field] !== 'reviewed') failures.push('Unmeasured reference family: ' + company.organisation_number + '/' + field);
  if (report.elapsed_ms > qualityPolicy.deadlineSeconds[manifest.stage] * 1000 || finished - started > qualityPolicy.deadlineSeconds[manifest.stage] * 1000) failures.push('Batch latency exceeds stage budget');
  if (report.company_runtime_ms.p95 > qualityPolicy.companyP95Ms) failures.push('Company p95 latency exceeds budget');
  if (report.combined_api_equivalent_usd / count > qualityPolicy.equivalentUsdPerCompany) failures.push('API-equivalent cost exceeds per-company budget');
  if (report.runtime.physical_requests > count * qualityPolicy.maxRequestsPerCompany) failures.push('Physical request budget exceeded');
  if (rows.some(r => r.run.mode !== 'eve' || r.run.terminal_status === 'failed' || r.errors.some(e => /failed|unresolved|deadline|budget|quota/.test(e.code)))) failures.push('Production failures or unresolved work');
  for (const row of rows) {
    const identity = snapshots.find(s => s.organisation_number === row.organisation_number && s.source_class === 'public_registry' && (()=>{try{const body=JSON.parse(s.text);return String(body.organisasjonsnummer??body.organisation_number)===row.organisation_number;}catch{return false;}})());
    const name = row.claims.find(c=>c.field==='legal_name'&&c.availability==='available');
    if (!identity || !name || name.value !== JSON.parse(identity.text).navn) failures.push('Missing or mismatched registry identity anchor');
    for (const field of ['financials','leadership','workplaces','financial_history','group_structure']) {
      if (!row.claims.some(c=>c.field===field&&['available','not_available','not_applicable'].includes(c.availability))) failures.push('Unmeasured or failed registry family: '+field);
    }
  }

  const claims = availableClaims(rows), claimMap = new Map(claims.map(c => [c.id, c]));
  unique(claims.map(c => c.id), 'available claim', failures);
  unique(review.claims.map(c => c.id), 'claim judgment', failures);
  if (canonical([...claimMap.keys()].sort()) !== canonical(review.claims.map(c => c.id).sort())) failures.push('Every available claim requires exactly one contextual judgment');
  const judgments = new Map(review.claims.map(c => [c.id, c]));
  const external = claims.filter(c => researchFields.some(field => c.claim.field === field));
  const supported = external.filter(c => judgments.get(c.id)?.verdict === 'supported').length;
  const precision = external.length ? supported / external.length : 0;
  const lower = precisionLower95(supported, external.length);
  if (external.length < qualityPolicy.externalClaimsMin || precision < qualityPolicy.precision || lower < qualityPolicy.precisionLower95) failures.push('Insufficient semantic precision or sample support');
  if (review.claims.some(c => c.material_error !== 'none' || c.verdict !== 'supported')) failures.push('Unsupported, ambiguous or materially incorrect publication');
  const evidence = new Map(rows.flatMap(row => row.evidence.map(e => [e.id, {e, org: row.organisation_number}] as const)));
  for (const {claim, organisation_number} of claims) {
    if (!claim.evidence_ids.length) failures.push('Available claim lacks evidence');
    for (const id of claim.evidence_ids) {
      const item = evidence.get(id);
      if (!item || item.org !== organisation_number) { failures.push('Missing or cross-company evidence'); continue; }
      const snapshot = snapshotMap.get(item.e.snapshot_id);
      if (!snapshot || snapshot.organisation_number !== organisation_number || snapshot.content_sha256 !== item.e.content_sha256 || snapshot.source_url !== item.e.source_url || snapshot.source_class !== item.e.source_class) failures.push('Evidence snapshot lineage mismatch');
      else if (publicationRestriction(snapshot, snapshots.filter(s=>s.organisation_number===organisation_number))) failures.push('Published source violates retained access policy');
      const body = await text('sources/' + sha.parse(item.e.content_sha256) + '.txt');
      if (hash(body) !== item.e.content_sha256 || !body.includes(item.e.claim_span)) failures.push('Published proof fidelity failure');
    }
  }
  unique(reference.facts.map(f => f.id), 'reference fact', failures);
  unique(review.matches.map(m => m.fact_id), 'reference match', failures);
  if (canonical(reference.facts.map(f => f.id).sort()) !== canonical(review.matches.map(m => m.fact_id).sort())) failures.push('Reference matching incomplete');
  const matching = new Map(review.matches.map(m => [m.fact_id, m]));
  for (const fact of reference.facts) {
    if (!input.includes(fact.organisation_number)) failures.push('Reference belongs to another cohort');
    const body = await text('sources/' + fact.source.sha256 + '.txt');
    if (hash(body) !== fact.source.sha256 || !body.includes(fact.source.quote)) failures.push('Reference quote/hash mismatch');
    if (publicationRestriction({id:fact.id,source_url:fact.source.url,source_class:'external',retrieved_at:reference.sealed_at,content_sha256:fact.source.sha256,text:body,organisation_number:fact.organisation_number,run_id:'reference'})) failures.push('Reference uses a restricted source');
    const match = matching.get(fact.id);
    if (match && (match.verdict === 'missing' ? match.claim_ids.length !== 0 : match.claim_ids.length === 0)) failures.push('Invalid reference match evidence');
    for (const id of match?.claim_ids ?? []) if (claimMap.get(id)?.organisation_number !== fact.organisation_number || judgments.get(id)?.verdict !== 'supported') failures.push('Invalid or unsupported matched claim');
  }
  const families = Object.fromEntries(researchFields.map(field => {
    const facts = reference.facts.filter(f => f.field === field), full = facts.filter(f => matching.get(f.id)?.verdict === 'full');
    const eligibleCompanies = new Set(facts.map(f => f.organisation_number)), representedCompanies = new Set(full.map(f => f.organisation_number));
    const factRecall = facts.length ? full.length / facts.length : null;
    const companyRecall = eligibleCompanies.size ? representedCompanies.size / eligibleCompanies.size : null;
    const weighted = factRecall === null || companyRecall === null ? null : .7 * companyRecall + .3 * factRecall;
    if (facts.length < qualityPolicy.referenceFactsPerFamily || weighted === null || weighted < qualityPolicy.familyRecall || factRecall! < qualityPolicy.factRecall) failures.push('Unmeasured or insufficient recall: ' + field);
    return [field, {eligible_facts: facts.length, represented_facts: full.length, fact_recall: factRecall, company_recall: companyRecall, weighted_recall: weighted}];
  }));
  unique(review.synthesis.map(s => s.organisation_number), 'synthesis review', failures);
  if (canonical(review.synthesis.map(s => s.organisation_number).sort()) !== canonical([...input].sort()) || review.synthesis.some(s => !s.supported)) failures.push('Synthesis review incomplete or unsupported');
  const predecessors: string[] = [];
  const predecessorHosts: string[] = [];
  if (manifest.stage !== 'pilot') {
    if (!manifest.previous_evidence) failures.push('Missing predecessor quality stage');
    else {
      const prior = await evaluateQuality(resolve(root, manifest.previous_evidence), expected, now, seen);
      if (!prior.passed || prior.stage !== (manifest.stage === '100' ? 'pilot' : '100')) failures.push('Predecessor quality stage did not pass');
      if (prior.companies.some(id => input.includes(id))) failures.push('Company overlap with predecessor');
      if (prior.predecessor_companies.some(id => input.includes(id))) failures.push('Company overlap with earlier quality stage');
      predecessors.push(...prior.companies, ...prior.predecessor_companies);
      predecessorHosts.push(...prior.company_hosts, ...prior.predecessor_hosts);
      if (companyHosts.some(host=>predecessorHosts.includes(host))) failures.push('Company host overlaps an earlier quality stage');
    }
  }
  return {passed: failures.length === 0, stage: manifest.stage, companies: input, company_hosts: companyHosts, predecessor_companies: predecessors, predecessor_hosts: predecessorHosts, precision, precision_lower_95: lower,
    external_claims: external.length, families, equivalent_usd: report.combined_api_equivalent_usd,
    elapsed_ms: report.elapsed_ms, company_p95_ms: report.company_runtime_ms.p95, failures: [...new Set(failures)]};
}

export async function assertQualityAdmission(input: string[], evidence: string | undefined, configuration: string) {
  const stage = requiredEvidence(input.length);
  if (!stage) return;
  if (!evidence) throw new QualityAdmissionDenied(['passing ' + stage + ' quality evidence is required before a ' + input.length + '-row batch']);
  try {
    const result = await evaluateQuality(evidence, {code: await runtimeFingerprint(), configuration});
    if (!result.passed || result.stage !== stage) throw new QualityAdmissionDenied(result.failures.length ? result.failures : ['Incorrect predecessor stage']);
    if ([...result.companies,...result.predecessor_companies].some(id => input.includes(id))) throw new QualityAdmissionDenied(['Target cohort overlaps quality evidence']);
  } catch (error) {
    if (error instanceof QualityAdmissionDenied) throw error;
    throw new QualityAdmissionDenied(['Incomplete or invalid ' + stage + ' evidence: ' + (error instanceof Error ? error.message : String(error))]);
  }
}
