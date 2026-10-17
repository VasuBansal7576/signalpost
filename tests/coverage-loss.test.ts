import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Store} from '../src/store.ts';
import {ResearchService} from '../src/service.ts';
import {semanticReviewPacket,validateSemanticDecisions} from '../src/semantic-verifier.ts';
import {researchCompanyWeb} from '../src/research-company.ts';
import {commitExtraction} from '../src/extraction.ts';

const org='999111222',identity={organisasjonsnummer:org,navn:'Acme Technology AS',hjemmeside:'acme.no'};
const settings={db:':memory:',exaTransport:'codex' as const,maxExaUsd:1,maxSearches:6,maxPages:12};
function fixture(website?:ConstructorParameters<typeof ResearchService>[3]){
 const store=new Store(':memory:'),service=new ResearchService(store,settings,fetch,website),job=store.createJob(org,'coverage-loss','eve');
 service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/'+org,JSON.stringify(identity),'public_registry');return {store,service,job};
}
test('one invented verifier counterquote or omitted judgment cannot erase other supported facts',()=>{
 const {store,service,job}=fixture();try{
  const text='Acme Technology AS. Org.nr 999111222. We build payroll software. We also provide implementation and training.',source=service.save(job,'https://acme.no/',text,'external');
  const packet=semanticReviewPacket(service,job,['We build payroll software.','We also provide implementation and training.'].map(value=>({field:'business_description',value,quote:value,snapshot_id:source.id,effective_date:null})));
  const good={id:'c0',verdict:'supported' as const,reason:'Offering stated by the exact entity',counter_quote:null,counter_source_id:null};
  const result=validateSemanticDecisions(packet,[good,{id:'c1',verdict:'unsupported',reason:'Invented contradiction',counter_quote:'This business is closed forever.',counter_source_id:'r0'}]);
  assert.deepEqual(result?.map(j=>[j.id,j.verdict]),[['c0','supported'],['c1','ambiguous']]);
  assert.deepEqual(validateSemanticDecisions(packet,[good])?.map(j=>[j.id,j.verdict]),[['c0','supported'],['c1','ambiguous']]);
 }finally{store.close();}
});
test('a readable canonical www/apex redirect is returned instead of lost after successful fetch',async()=>{
 const calls:string[]=[],{store,service,job}=fixture(async url=>{calls.push(url);return url.endsWith('/robots.txt')?{url,status:404,text:'',content_type:'text/plain'}:{url:'https://www.acme.no/',status:200,text:'<html><body>Acme Technology AS. Org.nr 999111222. We build payroll software.</body></html>',content_type:'text/html'};});
 try{const result=await service.read(job.id,'https://acme.no/');assert.equal(result.source_url,'https://www.acme.no/');assert.ok(result.text.includes('payroll software'));assert.ok(calls.includes('https://www.acme.no/robots.txt'),'Check policy on the final origin as well');}finally{store.close();}
});
test('transient unpaid robots fetch retries once with retained receipts; deny responses do not retry',async()=>{
 let attempts=0;const {store,service,job}=fixture(async url=>{if(url.endsWith('/robots.txt')&&++attempts===1)throw Error('Public website timed out');return {url,status:url.endsWith('/robots.txt')?404:200,text:'<html>Acme Technology AS. Org.nr 999111222. We build payroll software.</html>',content_type:'text/html'};});
 try{await service.read(job.id,'https://acme.no/');assert.equal(attempts,2);const first=store.call(job.id,'https://acme.no/robots.txt');assert.equal(first?.state,'failed');assert.equal(store.call(job.id,'https://acme.no/robots.txt#retry=1')?.state,'completed');}finally{store.close();}
});
test('company navigation discovers detailed services and opening hours, not just legal/about pages',async()=>{
 const {store,service,job}=fixture(),read:string[]=[];try{
  const source=service.save(job,'https://acme.no/','Acme Technology AS. Org.nr 999111222. https://acme.no/tjenester/ https://acme.no/apningstider/ https://acme.no/aktuelt/lansering/ https://acme.no/vare-selskapsadresser/','external');
  service.read=async(_job,url)=>{read.push(url);return {} as never;};await service.followCompanyLinks(job,source);
  assert.ok(read.includes('https://acme.no/tjenester/'));assert.ok(read.includes('https://acme.no/apningstider/'));
  assert.ok(read.includes('https://acme.no/vare-selskapsadresser/'));
 }finally{store.close();}
});
test('link recovery runs before extraction, so newly acquired detail pages are actually extracted',async()=>{
 const {store,service,job}=fixture(),steps:string[]=[];try{
  service.discover=async()=>{steps.push('discovery');};service.completeProfileLinks=async()=>{steps.push('recovery');};
  await researchCompanyWeb(service,job,async()=>{steps.push('extraction');return [];});
  assert.ok(steps.indexOf('recovery')<steps.indexOf('extraction'));
 }finally{store.close();}
});
test('duplicate or unknown verifier IDs never authorize an unreviewed proposal',()=>{
 const {store,service,job}=fixture();try{
  const value='We build payroll software.',source=service.save(job,'https://acme.no/','Acme Technology AS. Org.nr 999111222. '+value,'external');
  const packet=semanticReviewPacket(service,job,[{field:'business_description',value,quote:value,snapshot_id:source.id,effective_date:null}]);
  const good={id:'c0',verdict:'supported' as const,reason:'Exact company statement',counter_quote:null,counter_source_id:null};
  assert.equal(validateSemanticDecisions(packet,[good,good])[0]?.verdict,'ambiguous');
  assert.equal(validateSemanticDecisions(packet,[{...good,id:'invented'}])[0]?.verdict,'ambiguous');
 }finally{store.close();}
});
test('public retries never evade HTTP403 or a robots disallow, including canonical redirects',async()=>{
 for(const denied of ['http403','robots','redirect-robots']){
  const calls:string[]=[],{store,service,job}=fixture(async url=>{calls.push(url);return {url:!url.endsWith('/robots.txt')&&denied==='redirect-robots'?'https://www.acme.no/':url,status:denied==='http403'?403:200,text:url.endsWith('/robots.txt')?(denied==='robots'||url.includes('www.')?'User-agent: *\nDisallow: /':'User-agent: *\nAllow: /'):'<html>Acme Technology AS. Org.nr 999111222.</html>',content_type:url.endsWith('/robots.txt')?'text/plain':'text/html'};});
  try{await assert.rejects(service.read(job.id,'https://acme.no/'),/robots policy|unavailable/);assert.equal(calls.length,new Set(calls).size);assert.equal(store.snapshots(job.id).filter(s=>s.source_class!=='public_registry').length,0);}finally{store.close();}
 }
});
test('company-reported certification details retain their assertion scope instead of becoming independent approval',()=>{
 const {store,service,job}=fixture();try{
  const value='We are certified to the ASC standard.',source=service.save(job,'https://acme.no/about','Acme Technology AS. Org.nr 999111222. '+value,'external');
  const checked=service.verify(job.id,{field:'business_description',value,quote:value,snapshot_id:source.id,effective_date:null});
  assert.equal(checked.accepted,true);assert.equal(checked.claim?.qualifiers?.certification_independently_verified,false);
 }finally{store.close();}
});
test('a dated first-person business-history statement using oss is retained only on an established single-entity host',()=>{
 const {store,service,job}=fixture();try{
  const value='Mottoet «Kunden Først» har fulgt oss siden oppstarten i 2013.',source=service.save(job,'https://acme.no/about','Acme Technology AS. Org.nr 999111222. '+value,'external');
  assert.equal(service.verify(job.id,{field:'public_activity',value,quote:value,snapshot_id:source.id,effective_date:'2013',date_type:'event_date'}).accepted,true);
 }finally{store.close();}
});
test('native discovery ranks plausible company pages before applying the candidate fetch cap',async()=>{
 const {store,service,job}=fixture(),fetched:string[]=[];try{
  service.nativeSearch=async()=>({sources:['https://regional-news.no/a','https://another-news.no/b','https://tradepress.no/c','https://association.no/d','https://acme.no/contact'],actions:[],usage:{inputTokens:100,outputTokens:10},response_id:'fixture-only',elapsed_ms:1,search_calls:1});
  service.read=async(_job,url)=>{fetched.push(url);return {snapshot_id:'fixture-only'} as never;};
  await service.keylessSearch(job,'Acme Technology official website','website');
  assert.equal(fetched[0],'https://acme.no/contact');assert.equal(fetched.length,4);
 }finally{store.close();}
});
test('a short fresh company budget still admits native discovery while preserving the extraction reserve',async()=>{
 const {store,service,job}=fixture(),purposes:string[]=[];try{
  job.deadline_at=new Date(Date.now()+60000).toISOString();service.discoveryReserveMs=32000;
  service.publicNavigation=async()=>{throw Error('fixture has no registered site response');};service.read=async()=>{throw Error('fixture has no guessed-domain response');};
  service.fallbackDiscovery=async()=>{};service.inspectCompanyCandidates=async()=>{};service.completeProfileLinks=async()=>{};
  service.search=async(_job,_query,purpose)=>{purposes.push(purpose!);return {candidates:[],usage:store.usage(job.id),note:''};};
  await service.discover(job);assert.ok(purposes.includes('website'),'A worst-case45s search estimate must not suppress all discovery in the remaining60s');
 }finally{store.close();}
});
test('native website discovery uses exact registered trading names when the legal name is different',async()=>{
 const {store,service,job}=fixture(),queries:string[]=[];try{
  service.save(job,'https://data.brreg.no/enhetsregisteret/api/underenheter?overordnetEnhet='+org+'&size=1000',JSON.stringify({_embedded:{underenheter:[{organisasjonsnummer:'999111223',overordnetEnhet:org,navn:'PAYROLL HARBOR',beliggenhetsadresse:{poststed:'BERGEN'}}]}}),'public_registry');
  service.publicNavigation=async()=>{throw Error('No known site');};service.read=async()=>{throw Error('No guessed site');};service.fallbackDiscovery=async()=>{};service.inspectCompanyCandidates=async()=>{};service.completeProfileLinks=async()=>{};
  service.search=async(_job,query)=>{queries.push(query);return {candidates:[],usage:store.usage(job.id),note:''};};
  await service.discover(job);assert.ok(queries[0]?.includes('"PAYROLL HARBOR"'),'Registered trading names must reach the search, while legal ownership still needs separate proof');
 }finally{store.close();}
});
test('actual BACO publisher and its registered trading name bind SPRØ without inferring its changed street number',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/coverage/baco-trading-name.json',import.meta.url),'utf8'));
 for(const variant of ['exact','missing-publisher','other-publisher','other-city','other-parent','design-credit']){
  const store=new Store(':memory:'),service=new ResearchService(store),job=store.createJob('915190596','baco-'+variant,'eve');try{
   service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/915190596',JSON.stringify(f.identity),'public_registry');
   const workplaces=structuredClone(f.workplaces);if(variant==='other-parent')workplaces._embedded.underenheter[0].overordnetEnhet='999111222';
   service.save(job,'https://data.brreg.no/enhetsregisteret/api/underenheter?overordnetEnhet=915190596&size=1000',JSON.stringify(workplaces),'public_registry');
   let text=f.source.text;if(variant==='missing-publisher')text=text.replace('© 2015 Baco AS.','');if(variant==='other-publisher')text=text.replace('© 2015 Baco AS.','© 2015 Other Operator AS.');if(variant==='other-city')text=text.replaceAll('Oppdal','Bergen');if(variant==='design-credit')text=text.replace('© 2015 Baco AS.','© Design by Baco AS.');
   const source=service.save(job,f.source.url,text,'external'),checked=service.attribution(job,source,'official_website');
   assert.equal(checked.accepted,variant==='exact',variant+': '+checked.reason);
   if(variant==='exact'){assert.ok(checked.support.some(s=>s.source_class==='public_registry'&&s.source_url.includes('underenheter?')));const value='Ola Setroms veg 38\n7340 Oppdal';const checkedLocation=service.verify(job.id,{field:'locations',value,quote:value,snapshot_id:source.id,effective_date:null});assert.equal(checkedLocation.claim?.value,value);assert.notEqual(checkedLocation.claim?.qualifiers?.operating_location_established,true,'A contact address does not prove inspected premises, and number42 is not substituted');}
  }finally{store.close();}
 }
});
test('published opening hours cannot become a location and are retained under business details without rewriting',()=>{
 const {store,service,job}=fixture();try{
  const value='Man - Tors: 7:30 - 16:00\nFredag: 7:30 - 15:30',source=service.save(job,'https://acme.no/contact','Acme Technology AS. Org.nr 999111222.\n'+value,'external'),proposal={field:'locations' as const,value,quote:value,snapshot_id:source.id,effective_date:null};
  assert.equal(service.verify(job.id,proposal).accepted,false,'Hours alone must not satisfy the location family');
  const result=commitExtraction(service,job.id,[proposal]);assert.equal(result.claims[0]?.field,'business_description');assert.equal(result.claims[0]?.value,value);assert.equal(result.claims[0]?.quote,value);
 }finally{store.close();}
});
test('headings, department hours and a key-drop clause cannot bypass the hours/location distinction',()=>{
 const {store,service,job}=fixture();try{
  const value='Åpningstider\nMANDAG-TORSDAG: 08-17\nFREDAG: 08-16\nLØRDAG: stengt\nLEVERING BIL: hele døgnet, alle dager (nøkkeldropp)',source=service.save(job,'https://acme.no/contact','Acme Technology AS. Org.nr 999111222.\n'+value,'external');
  const result=commitExtraction(service,job.id,[{field:'locations',value,quote:value,snapshot_id:source.id,effective_date:null}]);assert.equal(result.claims[0]?.field,'business_description');assert.equal(result.claims[0]?.value,value);assert.equal(service.verify(job.id,result.claims[0]!).claim?.qualifiers?.current_operational_hours_established,false);
 }finally{store.close();}
});
test('adjectives do not disguise an unqualified staff count as a business offering',()=>{
 const {store,service,job}=fixture();try{const value='Vi er i dag 18 topp motiverte ansatte og vi selger annonser for flere store utgivere.',source=service.save(job,'https://acme.no/','Acme Technology AS. Org.nr 999111222. '+value,'external');assert.equal(service.verify(job.id,{field:'business_description',value,quote:value,snapshot_id:source.id,effective_date:null}).accepted,false);}finally{store.close();}
});
