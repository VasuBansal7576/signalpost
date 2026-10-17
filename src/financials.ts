import { z } from 'zod';
import { canonical, evidenceFor, type Availability, type Claim, type Evidence, type Snapshot } from './domain.ts';

const object = z.record(z.unknown());
export const metricPaths = {
  revenue: ['resultatregnskapResultat','driftsresultat','driftsinntekter','sumDriftsinntekter'],
  operating_result: ['resultatregnskapResultat','driftsresultat','driftsresultat'],
  profit_before_tax: ['resultatregnskapResultat','ordinaertResultatFoerSkattekostnad'],
  annual_result: ['resultatregnskapResultat','aarsresultat'],
  assets: ['eiendeler','sumEiendeler'],
  equity: ['egenkapitalGjeld','egenkapital','sumEgenkapital'],
  liabilities: ['egenkapitalGjeld','gjeldOversikt','sumGjeld'],
} as const;
export type Metric = keyof typeof metricPaths;
export type FinancialRecord = {
  record_id: string | null; journal_number: string | null; organisation_number: string;
  account_type: string | null; liquidation_accounts:boolean|null; scope: 'company' | 'group' | 'unknown';
  period: { start: string | null; end: string | null }; currency: string | null;
  unit: 'currency_units_as_reported'; metrics: Record<Metric, { amount: number | null; availability: Availability; source_path: string }>;
  balance_check: { status: 'balanced' | 'mismatch' | 'insufficient_data'; difference: number | null };
  evidence_id: string; warnings: string[];
};
export function getPath(value: unknown, path: readonly string[]): unknown {
  for (const key of path) { const parsed = object.safeParse(value); if (!parsed.success) return undefined; value = parsed.data[key]; }
  return value;
}
const stringOrNull = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : null;
function date(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value ? value : null;
}
function amount(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? number : null;
}

export function normalizeFinancials(body: unknown, org: string, source: Snapshot): { claims: Claim[]; evidence: Evidence[]; warnings: string[] } {
  if (!Array.isArray(body)) throw new Error('Annual accounts response must be an array');
  const records: FinancialRecord[] = [], evidence: Evidence[] = [], warnings: string[] = [];
  for (const raw of body) {
    const parsed = object.safeParse(raw);
    if (!parsed.success) { warnings.push('Rejected a non-object financial record'); continue; }
    const item = parsed.data;
    if (String(getPath(item,['virksomhet','organisasjonsnummer']) ?? '') !== org) {
      warnings.push(`Rejected annual-account record ${String(item.id ?? 'unknown')}: organisation mismatch`); continue;
    }
    const type = stringOrNull(item.regnskapstype)?.toUpperCase() ?? null;
    const scope = type === 'KONSERN' ? 'group' : type === 'SELSKAP' ? 'company' : 'unknown';
    const period = { start: date(getPath(item,['regnskapsperiode','fraDato'])), end: date(getPath(item,['regnskapsperiode','tilDato'])) };
    const currency = typeof item.valuta === 'string' && /^[A-Z]{3}$/.test(item.valuta) ? item.valuta : null;
    const support = evidenceFor(source,JSON.stringify(raw)); evidence.push(support);
    const recordWarnings: string[] = [];
    if (scope === 'unknown') recordWarnings.push('Unknown statement scope; excluded from latest company/group metrics');
    if (!period.start || !period.end || period.start > period.end) recordWarnings.push('Invalid reporting period');
    if (!currency) recordWarnings.push('Missing or invalid reported currency');
    const entries = Object.entries(metricPaths).map(([name,path]) => {
      const rawAmount = getPath(item,path), parsedAmount = amount(rawAmount);
      if (rawAmount !== undefined && rawAmount !== null && parsedAmount === null) recordWarnings.push(`Invalid ${name} amount`);
      return [name, { amount: parsedAmount, availability: parsedAmount === null ? 'not_available' : 'available', source_path: path.join('.') }];
    });
    const metrics = z.object({revenue:metricSchema,operating_result:metricSchema,profit_before_tax:metricSchema,annual_result:metricSchema,assets:metricSchema,equity:metricSchema,liabilities:metricSchema}).parse(Object.fromEntries(entries));
    const a=metrics.assets.amount,e=metrics.equity.amount,l=metrics.liabilities.amount;
    const difference=a!==null&&e!==null&&l!==null?a-e-l:null;
    const balance: FinancialRecord['balance_check'] = {status:difference===null?'insufficient_data':Math.abs(difference)<=Math.max(1,Math.abs(a!)*1e-9)?'balanced':'mismatch',difference};
    if(balance.status==='mismatch')recordWarnings.push('Assets differ from equity plus liabilities; source values preserved');
    records.push({record_id:stringOrNull(item.id),journal_number:stringOrNull(item.journalnr),organisation_number:org,account_type:type,liquidation_accounts:typeof item.avviklingsregnskap==='boolean'?item.avviklingsregnskap:null,scope,period,currency,unit:'currency_units_as_reported',metrics,balance_check:balance,evidence_id:support.id,warnings:recordWarnings});
  }
  records.sort((a,b)=>(b.period.end??'').localeCompare(a.period.end??'') || a.scope.localeCompare(b.scope) || (a.record_id??'').localeCompare(b.record_id??''));
  const claims: Claim[] = [{field:'financials',value:{normalization_version:1,records},availability:records.length?'available':body.length?'ambiguous':'not_available',confidence:null,evidence_ids:evidence.map(e=>e.id)}];
  for (const scope of ['company','group'] as const) {
    const eligible=records.filter(r=>r.scope===scope&&r.period.start&&r.period.end&&r.period.start<=r.period.end);
    const newest=eligible[0]; if(!newest)continue;
    const ties=eligible.filter(r=>r.period.end===newest.period.end&&r.period.start===newest.period.start);
    const conflict=ties.some(r=>canonical({currency:r.currency,metrics:r.metrics,liquidation_accounts:r.liquidation_accounts})!==canonical({currency:newest.currency,metrics:newest.metrics,liquidation_accounts:newest.liquidation_accounts}));
    if(conflict) warnings.push(`Conflicting ${scope} statements for ${newest.period.end}; no arbitrary revision selected`);
    for (const name of Object.keys(metricPaths)) {
      const metric=newest.metrics[z.enum(['revenue','operating_result','profit_before_tax','annual_result','assets','equity','liabilities']).parse(name)];
      const availability:Availability=conflict?'ambiguous':metric.amount===null?'not_available':!newest.currency?'ambiguous':'available';
      claims.push({field:scope==='company'?name:`group_${name}`,value:availability==='available'?{amount:metric.amount,currency:newest.currency,period_start:newest.period.start,period_end:newest.period.end,scope,record_id:newest.record_id,unit:newest.unit,source_path:metric.source_path,...(newest.liquidation_accounts!==null?{liquidation_accounts:newest.liquidation_accounts}:{})}:null,availability,confidence:null,evidence_ids:ties.map(r=>r.evidence_id),reporting_period:newest.period.end,qualifiers:{liquidation_accounts:newest.liquidation_accounts,statement_context:newest.liquidation_accounts?'Liquidation accounts; do not interpret as an ordinary continuing-operation period':'Reported annual accounts'}});
    }
  }
  return {claims,evidence,warnings:[...warnings,...records.flatMap(r=>r.warnings.map(w=>`${r.record_id??'unknown'}: ${w}`))]};
}
const metricSchema=z.object({amount:z.number().nullable(),availability:z.enum(['available','not_available']),source_path:z.string()});

export function normalizeHistory(body: unknown, org: string) {
  if(!Array.isArray(body)) throw new Error('Annual-account history response must be an array');
  const years=[...new Set(body.map(v=>typeof v==='string'||typeof v==='number'?String(v):'').filter(v=>/^\d{4}$/.test(v)))].sort().reverse();
  return {years,documents:years.map(year=>({year,url:`https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/${org}/${year}`})),note:'Document availability only; PDF contents have not been extracted'};
}

export function normalizeRoles(body: unknown) {
  const groups=getPath(body,['rollegrupper']); if(!Array.isArray(groups)) throw new Error('Invalid roles response');
  const registered=groups.flatMap(group=>{
    const roles=getPath(group,['roller']); if(!Array.isArray(roles))return [];
    return roles.filter(role=>getPath(role,['avregistrert'])!==true).map(role=>{
      const names=getPath(role,['person','navn']),name=object.safeParse(names),deceased=getPath(role,['person','erDoed']),deleted=getPath(role,['enhet','erSlettet']),personDeceased=typeof deceased==='boolean'?deceased:null,entityDeleted=typeof deleted==='boolean'?deleted:null;
      return {name:name.success?[name.data.fornavn,name.data.mellomnavn,name.data.etternavn].filter(v=>typeof v==='string').join(' '):getPath(role,['enhet','navn'])??null,organisation_number:getPath(role,['enhet','organisasjonsnummer'])??null,role_code:getPath(role,['type','kode'])??null,role:getPath(role,['type','beskrivelse'])??null,last_changed:getPath(group,['sistEndret'])??null,last_changed_semantics:'registry_role_group_update',person_deceased:personDeceased,entity_deleted:entityDeleted,entity_approval_status:getPath(role,['enhet','godkjenningsstatus'])??null,current_registered_projection:personDeceased!==true&&entityDeleted!==true};
    });
  });
  return {roles:registered.filter(r=>r.current_registered_projection),inactive_registered_relations:registered.filter(r=>!r.current_registered_projection),note:'Current registered relations are distinct from independently confirmed operational leadership. Deceased people/deleted entities remain in the inactive register relation section. Group update dates are not appointment dates; approval status is retained verbatim.'};
}
export function normalizeWorkplaces(body: unknown, org: string) {
  if(!object.safeParse(body).success)throw new Error('Invalid workplaces response');
  const rows=getPath(body,['_embedded','underenheter']);
  const total=getPath(body,['page','totalElements']);
  if(rows===undefined&&total!==0)throw Error('Invalid workplaces response: missing subunit collection or explicit zero page');
  if(rows!==undefined&&!Array.isArray(rows))throw new Error('Invalid workplaces response');
  if(total!==undefined&&(!Number.isSafeInteger(total)||Number(total)<0))throw Error('Invalid workplaces response: invalid total');
  if(Array.isArray(rows)&&typeof total==='number'&&rows.length>total)throw Error('Invalid workplaces response: contradictory total');
  const locations=(Array.isArray(rows)?rows:[]).filter(row=>String(getPath(row,['overordnetEnhet']))===org).map(row=>({organisation_number:getPath(row,['organisasjonsnummer']),name:getPath(row,['navn']),address:getPath(row,['beliggenhetsadresse'])??getPath(row,['postadresse'])??null,address_scope:getPath(row,['beliggenhetsadresse'])?'registered_subunit_location':getPath(row,['postadresse'])?'registered_subunit_postal_contact':null,postal_address:getPath(row,['postadresse'])??null,postal_scope:'registered_subunit_postal_contact',postal_operating_location_established:false,employees:getPath(row,['harRegistrertAntallAnsatte'])===false?null:getPath(row,['antallAnsatte'])??null}));
  const complete=typeof total==='number'&&locations.length>=total;
  if(!locations.length&&!complete)throw Error('Invalid workplaces response: incomplete collection cannot establish absence');
  return {locations,total_reported:typeof total==='number'?total:null,complete};
}
