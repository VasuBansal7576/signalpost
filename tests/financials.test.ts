import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFinancials, normalizeHistory, normalizeRoles, normalizeWorkplaces } from '../src/financials.ts';
import { snapshot, materialChanges, evidenceFor, type Envelope } from '../src/domain.ts';
import { Store } from '../src/store.ts';
import { ResearchService } from '../src/service.ts';

function record(year=2025,type='SELSKAP',revenue:unknown=100) {return {id:`${year}-${type}`,regnskapstype:type,virksomhet:{organisasjonsnummer:'999111222'},regnskapsperiode:{fraDato:`${year}-01-01`,tilDato:`${year}-12-31`},valuta:'NOK',resultatregnskapResultat:{driftsresultat:{driftsinntekter:{sumDriftsinntekter:revenue},driftsresultat:-5},aarsresultat:-7},eiendeler:{sumEiendeler:1000},egenkapitalGjeld:{egenkapital:{sumEgenkapital:300},gjeldOversikt:{sumGjeld:700}}};}
function normalize(rows:unknown[]) {const source=snapshot({source_url:'https://data.brreg.no/regnskapsregisteret/regnskap/999111222',source_class:'public_registry',organisation_number:'999111222',run_id:'test',text:JSON.stringify(rows)});return normalizeFinancials(rows,'999111222',source);}

test('normalizer sorts every year, keeps group separate and retains negative/zero amounts',()=>{
  const result=normalize([record(2023),record(2025,'KONSERN',5000),record(2025,'SELSKAP',0),record(2024)]);
  const revenue=result.claims.find(c=>c.field==='revenue')!;
  assert.equal(revenue.availability,'available');
  assert.deepEqual(revenue.value,{amount:0,currency:'NOK',period_start:'2025-01-01',period_end:'2025-12-31',scope:'company',record_id:'2025-SELSKAP',unit:'currency_units_as_reported',source_path:'resultatregnskapResultat.driftsresultat.driftsinntekter.sumDriftsinntekter'});
  assert.equal((result.claims.find(c=>c.field==='group_revenue')!.value as {amount:number}).amount,5000);
  assert.equal((result.claims.find(c=>c.field==='operating_result')!.value as {amount:number}).amount,-5);
  assert.equal(result.evidence.length,4);
  for(const evidence of result.evidence)assert.ok(JSON.stringify([record(2023),record(2025,'KONSERN',5000),record(2025,'SELSKAP',0),record(2024)]).includes(evidence.claim_span));
});
test('missing newest amounts do not borrow older values and no currency conversion is invented',()=>{
  const current=record();delete current.resultatregnskapResultat.driftsresultat.driftsinntekter.sumDriftsinntekter;
  current.valuta='USD';
  const result=normalize([record(2024),current]);
  assert.equal(result.claims.find(c=>c.field==='revenue')!.availability,'not_available');
  assert.equal((result.claims.find(c=>c.field==='assets')!.value as {currency:string}).currency,'USD');
});
test('wrong entities, invalid numbers, invalid periods and conflicting statements fail closed',()=>{
  const wrong=record();wrong.virksomhet.organisasjonsnummer='999111233';
  assert.equal(normalize([wrong]).claims[0]!.availability,'ambiguous');
  assert.equal(normalize([record(2025,'SELSKAP','1,000')]).claims.find(c=>c.field==='revenue')!.availability,'not_available');
  const badDate=record();badDate.regnskapsperiode.tilDato='2025-02-30';
  assert.equal(normalize([badDate]).claims.some(c=>c.field==='revenue'),false);
  const conflict=normalize([record(2025,'SELSKAP',100),record(2025,'SELSKAP',200)]);
  assert.equal(conflict.claims.find(c=>c.field==='revenue')!.availability,'ambiguous');
  const noCurrency=record();noCurrency.valuta='';
  assert.equal(normalize([noCurrency]).claims.find(c=>c.field==='revenue')!.availability,'ambiguous');
});
test('balance mismatches are reported without rewriting the registry amounts',()=>{
  const row=record();row.eiendeler.sumEiendeler=1500;
  const result=normalize([row]);assert.ok(result.warnings.some(w=>w.includes('Assets differ')));
  assert.equal((result.claims.find(c=>c.field==='assets')!.value as {amount:number}).amount,1500);
});
test('financial refresh ignores new evidence IDs but detects a changed reported amount',()=>{
 const store=new Store(':memory:'),service=new ResearchService(store);
 try{const make=(run:string,revenue:number)=>{const job=store.createJob('999111222',run,'registry'),rows=[record(2025,'SELSKAP',revenue)],source=service.save(job,'https://data.brreg.no/regnskapsregisteret/regnskap/999111222',JSON.stringify(rows),'public_registry');const normalized=normalizeFinancials(rows,'999111222',source);return service.finalize(job,{claims:normalized.claims,evidence:normalized.evidence,errors:[]},[]);};
 const a=make('a',100),b=make('b',100);assert.deepEqual(materialChanges(a,b),[]);const c=make('c',150);assert.ok(c.changes.some(change=>change.field==='revenue'));
 }finally{store.close();}
});
test('normalization changes on identical source bytes are not reported as business changes',()=>{
 const source=snapshot({source_url:'https://data.brreg.no/entity',source_class:'public_registry',organisation_number:'999111222',run_id:'a',text:'{"antallAnsatte":"10"}'}),support=evidenceFor(source,source.text);
 const before:Envelope={organisation_number:'999111222',run:{run_id:'a',started_at:'',completed_at:'',terminal_status:'completed',mode:'registry'},claims:[{field:'registered_employee_count',value:'10',availability:'available',confidence:null,evidence_ids:[support.id]}],evidence:[support],changes:[],errors:[],operations:{requests:0,runtime_ms:0,third_party_cost_usd:0,known_exa_cost_usd:0,model_cost_usd:0,cost_complete:true}};
 const after={...before,claims:[{...before.claims[0]!,value:10}]};assert.deepEqual(materialChanges(before,after),[]);
});
test('new-page enrichment is separate from a changed fact on a comparable source',()=>{
 const make=(url:string,value:string):Envelope=>{const source=snapshot({source_url:url,source_class:'company_owned',organisation_number:'999111222',run_id:value,text:value}),support=evidenceFor(source,value);return{organisation_number:'999111222',run:{run_id:value,started_at:'',completed_at:'',terminal_status:'completed',mode:'eve'},claims:[{field:'business_description',value,availability:'available',confidence:null,evidence_ids:[support.id]}],evidence:[support],changes:[],errors:[],operations:{requests:0,runtime_ms:0,third_party_cost_usd:0,known_exa_cost_usd:0,model_cost_usd:0,cost_complete:true}};};
 const before=make('https://acme.no/','We build software for energy operators.');
 assert.deepEqual(materialChanges(before,make('https://acme.no/about','We build software and develop embedded systems.')),[]);
 assert.equal(materialChanges(before,make('https://acme.no/','We now build software and develop embedded systems.')).length,1);
 const extracted=make('https://acme.no/','We build software and develop embedded systems.');extracted.evidence[0]!.extraction_method='public-html-text-and-links/v2';assert.deepEqual(materialChanges(before,extracted),[],'another extraction format is not comparable source content');
 const support=snapshot({source_url:'https://proff.no/selskap/acme',source_class:'external',organisation_number:'999111222',run_id:'proof',text:'Updated directory identity anchor'}),proof=evidenceFor(support,support.text);const enriched=make('https://acme.no/about','We build software and develop embedded systems.');enriched.evidence.push(proof);enriched.claims[0]!.evidence_ids.push(proof.id);before.evidence.push({...proof,content_sha256:'0'.repeat(64)});before.claims[0]!.evidence_ids.push(proof.id);assert.deepEqual(materialChanges(before,enriched),[],'changed attribution support cannot turn a newly discovered page into a changed business fact');
 const websiteBefore=make('https://acme.no/terms','Acme before'),websiteAfter=make('https://acme.no/terms','Acme after');websiteBefore.claims[0]!.field='official_website';websiteAfter.claims[0]!.field='official_website';websiteBefore.claims[0]!.value='https://www.acme.no/terms';websiteAfter.claims[0]!.value='https://acme.no/';assert.deepEqual(materialChanges(websiteBefore,websiteAfter),[],'same company domain with another page path is not a website change');
});
test('history links remain document availability and inactive roles/unknown employees are handled',()=>{
  const history=normalizeHistory([2023,'2025',2025,'bad'],'999111222');assert.deepEqual(history.years,['2025','2023']);assert.ok(history.documents[0]!.url.endsWith('/2025'));
  const roles=normalizeRoles({rollegrupper:[{roller:[{avregistrert:true,person:{navn:{fornavn:'Former'}}},{avregistrert:false,person:{navn:{fornavn:'Current',etternavn:'Manager'},fodselsdato:'1960-01-01'},type:{kode:'DAGL'}}]}]});
  assert.equal(roles.roles.length,1);assert.equal(roles.roles[0]!.name,'Current Manager');assert.equal(JSON.stringify(roles).includes('1960'),false);
  const places=normalizeWorkplaces({_embedded:{underenheter:[{overordnetEnhet:'999111222',harRegistrertAntallAnsatte:false,antallAnsatte:0},{overordnetEnhet:'999111233'}]},page:{totalElements:3}},'999111222');assert.equal(places.locations.length,1);assert.equal(places.locations[0]!.employees,null);assert.equal(places.complete,false);
});


test('deceased people and deleted roleholders are preserved outside current registered roles',()=>{const r=normalizeRoles({rollegrupper:[{sistEndret:'2025-01-02',roller:[{person:{erDoed:true,navn:{fornavn:'Registered',etternavn:'Deceased'}},type:{kode:'DAGL'}},{enhet:{erSlettet:true,navn:['Deleted Auditor'],organisasjonsnummer:'999111222'},type:{kode:'REVI'}},{person:{erDoed:false,navn:{fornavn:'Current',etternavn:'Director'}},type:{kode:'LEDE'}}]}]});assert.equal(r.roles.length,1);assert.equal(r.inactive_registered_relations.length,2);assert.equal(r.inactive_registered_relations[0]?.person_deceased,true);assert.equal(r.roles[0]?.last_changed_semantics,'registry_role_group_update');});

// Actual Oxaas source separates its street location from its postal box.
test('subunit postal contacts retain their own scope alongside physical locations',()=>{const physical={adresse:['Heinsagata 2A'],postnummer:'6507',poststed:'KRISTIANSUND N'},postal={adresse:['Postboks 2183'],postnummer:'6510',poststed:'KRISTIANSUND N'};const rows=[{organisasjonsnummer:'930396303',overordnetEnhet:'889237392',navn:'OXAAS HOLDING AS',beliggenhetsadresse:physical,postadresse:postal},{organisasjonsnummer:'999111222',overordnetEnhet:'889237392',navn:'Postal only',postadresse:postal},{organisasjonsnummer:'888111222',overordnetEnhet:'999111222',postadresse:postal}];const result=normalizeWorkplaces({_embedded:{underenheter:rows}},'889237392');assert.equal(result.locations.length,2);assert.deepEqual(result.locations[0]?.address,physical);assert.deepEqual(result.locations[0]?.postal_address,postal);assert.equal(result.locations[0]?.postal_operating_location_established,false);assert.equal(result.locations[1]?.address_scope,'registered_subunit_postal_contact');});
