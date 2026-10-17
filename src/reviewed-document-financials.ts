import{evidenceFor,hash,type Claim,type Evidence,type Snapshot}from'./domain.ts';

const standard=['revenue','operating_result','profit_before_tax','annual_result','assets','equity','liabilities'] as const;
type Metric=typeof standard[number]|'portfolio_result'|'management_result';
export type ReviewedFinancialPage={source:Snapshot;image_sha256:string;visually_verified:true};
export type ReviewedFinancialStatement={organisation_number:string;legal_form:string;period_start:string|null;period_end:string|null;reporting_year?:string;currency:string;comparative_in_later_filing:boolean;cells:Partial<Record<Metric,{amount:number;label:string;page_number:number}>>};

/** Explicit visual-review import, never an OCR confidence threshold or an automatic PDF parser.
 * Callers must verify the raw PDF and rendered image digests before invoking this function.
 * Source snapshots contain the reviewed table transcription, with its derivation labelled.
 */
export function reviewedDocumentFinancials(statements:ReviewedFinancialStatement[],pages:ReviewedFinancialPage[]){
 if(!statements.length)throw Error('No visually reviewed financial statements');
 const org=statements[0]!.organisation_number,records:any[]=[],evidence:Evidence[]=[];
 const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 for(const statement of statements){
  if(statement.organisation_number!==org||!/^\d{9}$/.test(org))throw Error('Reviewed document organisation mismatch');
  const unknownComparative=statement.comparative_in_later_filing&&statement.period_start===null&&statement.period_end===null&&/^\d{4}$/.test(statement.reporting_year??'');
  if(!unknownComparative&&(!statement.period_start||!statement.period_end||!validDate(statement.period_start)||!validDate(statement.period_end)||statement.period_start>statement.period_end)||!/^[A-Z]{3}$/.test(statement.currency))throw Error('Reviewed statement has invalid period or currency');
  if(statement.legal_form==='VPFO'&&(statement.cells.revenue||statement.cells.operating_result))throw Error('Fund portfolio/management results cannot become ordinary-company revenue or operating profit');
  const metrics:Record<string,unknown>={},ids:string[]=[];
  for(const metric of [...standard,'portfolio_result','management_result'] as const){
   const cell=statement.cells[metric];
   if(!cell){if(standard.includes(metric as typeof standard[number]))metrics[metric]={amount:null,availability:'not_available',source_path:null};continue;}
   if(!Number.isSafeInteger(cell.amount)||!cell.label.trim())throw Error('Reviewed financial cell must be a labelled exact integer');
   const page=pages.find(p=>p.source.document?.page_number===cell.page_number),source=page?.source,doc=source?.document;
   if(!page?.visually_verified||!source||!doc||!/^[a-f0-9]{64}$/.test(page.image_sha256)||source.organisation_number!==org||source.source_class!=='public_registry'||source.extraction_method!=='official-account-copy-visual-transcription/v1'||doc.parser.id!=='manual-visual-transcription/v1'||!/^https:\/\/data\.brreg\.no\/regnskapsregisteret\/regnskap\/aarsregnskap\/kopi\/\d{9}\/\d{4}$/.test(doc.source_url)||!doc.source_url.includes('/'+org+'/')||source.source_url!==doc.source_url+'#page='+cell.page_number||hash(source.text)!==source.content_sha256||!/^[a-f0-9]{64}$/.test(doc.raw_sha256))throw Error('Unverified or unrelated document page cannot support financial import');
   const quote=`${cell.label} | ${statement.reporting_year??statement.period_end!.slice(0,4)} | ${statement.currency} | ${cell.amount}`;
   if(!source.text.split('\n').includes(quote))throw Error('Reviewed cell does not match the exact page transcription');
   const e=evidenceFor(source,quote);evidence.push(e);ids.push(e.id);metrics[metric]={amount:cell.amount,availability:'available',source_path:`pdf_page:${cell.page_number}:${cell.label}`,evidence_id:e.id};
  }
  const amount=(m:Metric)=>statement.cells[m]?.amount??null,a=amount('assets'),eq=amount('equity'),l=amount('liabilities'),difference=a!==null&&eq!==null&&l!==null?a-eq-l:null;
  records.push({record_id:hash(JSON.stringify(statement)),journal_number:null,organisation_number:org,account_type:statement.legal_form,liquidation_accounts:null,scope:'company',period:{start:statement.period_start,end:statement.period_end},reporting_year:statement.reporting_year??statement.period_end!.slice(0,4),currency:statement.currency,unit:'currency_units_as_reported',metrics,balance_check:{status:difference===null?'insufficient_data':Math.abs(difference)<=1?'balanced':'mismatch',difference},evidence_ids:ids,warnings:unknownComparative?['Comparative year column only; full reporting dates not established']:[],source_basis:'visually_reviewed_original_filing',comparative_in_later_filing:statement.comparative_in_later_filing});
 }
 records.sort((a,b)=>(b.period.end??'').localeCompare(a.period.end??''));
 if(new Set(records.map(r=>r.period.start+'/'+r.period.end+'/'+r.reporting_year)).size!==records.length)throw Error('Duplicate reviewed periods require explicit conflict adjudication');
 const latest=records[0]!,claims:Claim[]=[{field:'financials',value:{normalization_version:'reviewed-pdf/v1',records,partial_document_transcription:true},availability:'available',confidence:null,evidence_ids:[...new Set(evidence.map(e=>e.id))]}];
 for(const metric of [...standard,'portfolio_result','management_result'] as const){if(!latest.period.start||!latest.period.end)break;const cell=latest.metrics[metric];if(!cell)continue;const fund=latest.account_type==='VPFO',unavailable=cell.amount===null;
  claims.push({field:metric,value:unavailable?null:{amount:cell.amount,currency:latest.currency,period_start:latest.period.start,period_end:latest.period.end,scope:'company',record_id:latest.record_id,unit:latest.unit,source_path:cell.source_path},availability:unavailable&&fund&&['revenue','operating_result'].includes(metric)?'not_applicable':unavailable?'not_available':'available',confidence:null,evidence_ids:cell.evidence_id?[cell.evidence_id]:[],reporting_period:latest.period.end,qualifiers:{verification_method:'visual_page_review',statement_context:fund?'Securities fund accounts; portfolio/management results are separately named':'Reported legal-entity accounts',comparative_in_later_filing:latest.comparative_in_later_filing,partial_document_transcription:true,independent_second_review:false}});
 }
 return{claims,evidence:[...new Map(evidence.map(e=>[e.id,e])).values()]};
}
