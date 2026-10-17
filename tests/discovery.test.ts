import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.ts';
import {ResearchService} from '../src/service.ts';
import {ownership,hiringAttribution,hiringState,profileUrl,profileMatches,linksIn,canonicalProfile,registryEmailDomain} from '../src/attribution.ts';
import {snapshot,type Proposal} from '../src/domain.ts';

const org='999111222',identity={navn:'Acme Technology AS',organisasjonsnummer:org,forretningsadresse:{adresse:['Havneveien 10'],postnummer:'5003',poststed:'BERGEN'}};
const page=(url:string,text:string)=>snapshot({source_url:url,text,source_class:'external',organisation_number:org,run_id:'test'});
test('missing registry website can be resolved through legal ID or exact address and brand domain',()=>{
 const legal=page('https://acme.no/kontakt','Acme Technology AS. Organisasjonsnummer 999 111 222. We build software.');
 assert.equal(ownership(legal,identity,[legal]).accepted,true);
 const address=page('https://acme.no/','Acme Technology AS. Havneveien 10, 5003 Bergen.');
 assert.equal(ownership(address,identity,[address]).accepted,true);
 const wrong=page('https://acme.no/','Acme Technology AS. Organisasjonsnummer 999 111 233.');
 assert.equal(ownership(wrong,{...identity,hjemmeside:'acme.no'},[wrong]).accepted,false);
 const namesake=page('https://acme.no/','Acme Technology AS. Oslo. We build software.');
 assert.equal(ownership(namesake,identity,[namesake]).accepted,false);
 const directory=page('https://proff.no/selskap/acme','Acme Technology AS. Organisasjonsnummer 999111222. Hjemmeside https://acme.no/');
 const proof=ownership(namesake,identity,[namesake,directory]);assert.equal(proof.accepted,true);assert.equal(proof.support[0]?.id,directory.id);
 assert.equal(ownership(directory,identity,[directory]).accepted,false,'a company directory is never the official company website');
 const otherDirectory=page('https://unrelated-business-index.example.org/acme','Acme Technology AS. Havneveien 10, 5003 Bergen.');
 const crosslink=page('https://proff.no/selskap/acme',`Acme Technology AS. Organisasjonsnummer ${org}. https://unrelated-business-index.example.org/acme`);
 assert.equal(ownership(otherDirectory,identity,[otherDirectory,crosslink]).accepted,false,'cross-linked directories cannot promote one another to an official site');
 const association={...identity,navn:'Bondelia I Borettslag'};
 const sectorDirectory=page('https://borettslagsoversikt.example.org/bondelia','Bondelia I Borettslag. Organisasjonsnummer 999111222. Havneveien 10, 5003 Bergen.');
 assert.equal(ownership(sectorDirectory,association,[sectorDirectory]).accepted,false,'a generic sector word in a directory hostname is not a company brand');
});
test('third-party recruitment needs exact legal employer and independent identity/location context',()=>{
 const job=page('https://arbeidsplassen.nav.no/stillinger/stilling/a','Vi søker en utvikler. Arbeidsgiver: Acme Technology AS. Arbeidssted: Bergen. Søknadsfrist: 2026-12-20.');
 assert.equal(hiringAttribution(job,identity,[job]).accepted,true);
 assert.equal(ownership(job,identity,[job]).accepted,false);
 const parent=page('https://acme.teamtailor.com/jobs/a','Vi søker en utvikler. Arbeidsgiver: Acme Group AS. Arbeidssted Bergen.');
 assert.equal(hiringAttribution(parent,identity,[parent]).accepted,false);
 const wrongCity=page('https://arbeidsplassen.nav.no/stillinger/stilling/b','Vi søker en utvikler. Arbeidsgiver: Acme Technology AS. Arbeidssted: Oslo.');
 assert.equal(hiringAttribution(wrongCity,identity,[wrongCity]).accepted,false);
 assert.equal(hiringState(job.text,new Date('2026-10-15')).expired,false);
 assert.equal(hiringState('Søknadsfrist: 20.12.2025',new Date('2026-10-15')).expired,true);
 assert.equal(hiringState('Søknadsfrist: 15. oktober 2025',new Date('2026-10-15')).expired,true);
 assert.equal(hiringState('Annonsen er utløpt.').expired,true);
 assert.equal(hiringState('Vi har ingen ledige stillinger akkurat nå. Send en åpen søknad.').kind,'explicit_no_open_roles');
 const location=page('https://acme.teamtailor.com/locations/acme-technology','Acme Technology\nBergen\nDeveloper\nAcme Technology\nhttps://acme.teamtailor.com/jobs/123-developer');
 assert.equal(hiringAttribution(location,identity,[location]).accepted,true,'a dedicated recruiter location page identifies the legal brand and matching city');
});
test('fresh search full text and outbound links become inspectable evidence without duplicate contents requests',async()=>{
 const store=new Store(':memory:');let requests=0;
 const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:4,maxPages:8},async()=>{requests++;return Response.json({results:[{url:'https://acme.no/',title:'Acme Technology AS',text:'Acme Technology AS. Organisasjonsnummer 999111222. Havneveien 10, Bergen.',extras:{links:['https://www.linkedin.com/company/acme-technology/','https://www.facebook.com/sharer/sharer.php?u=x']}}],costDollars:{total:.007}});});
 try{
  const job=store.createJob(org,'search','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/'+org,JSON.stringify(identity),'public_registry');
  const result=await service.search(job.id,'Acme Technology AS Bergen');assert.ok(result.candidates[0]?.snapshot_id);
  await service.read(job.id,'https://acme.no/');assert.equal(requests,1);
  const profile=service.finalize(job,{claims:[],evidence:[],errors:[]},[]);
  const linked=profile.claims.find(c=>c.field==='company_owned_profiles'&&c.availability==='available');assert.equal(linked?.value,'https://www.linkedin.com/company/acme-technology');
  assert.ok(profile.evidence.some(e=>e.extraction_method==='exa-text-and-links/v2'));
  const source=store.snapshots(job.id).find(s=>s.source_url==='https://acme.no/')!;assert.equal(source.source_class,'company_owned');
  const directory:Proposal={field:'company_owned_profiles',value:'https://proff.no/selskap/acme',quote:source.text,snapshot_id:source.id,effective_date:null};
  assert.equal(service.verify(job.id,directory).accepted,false);
  await assert.rejects(service.read(job.id,'https://www.linkedin.com/company/acme-technology/'),/Restricted platform/);assert.equal(requests,1);
  assert.equal(profileUrl('https://facebook.com/sharer/sharer.php?u=x'),false);
  assert.equal(profileUrl('https://linkedin.com/company/acme-technology'),true);
  assert.equal(profileMatches('https://instagram.com/experienceandoy','EXPERIENCE ANDØY AS'),true);
  assert.equal(profileMatches('https://instagram.com/acmeno','Acme Technology AS','https://acmeno.no/'),true);
  assert.equal(profileMatches('https://instagram.com/acmegroup','Acme Technology AS'),false);
  assert.equal(profileMatches('https://instagram.com/acmegroup','Acme Technology AS','https://acme.no/'),false);
  assert.equal(profileMatches('https://instagram.com/acmetechnologygroup','Acme Technology AS'),false);
 }finally{store.close();}
});
test('single-quoted account links, harmless tracking parameters and Norwegian URL transliterations are retained',()=>{
 const raw="<a href='https://www.facebook.com/AasgreinaByggassistanse/?checkpoint_src=any'>Facebook</a>";
 const link=linksIn(raw)[0]!;assert.equal(link,'https://www.facebook.com/AasgreinaByggassistanse/?checkpoint_src=any');
 assert.equal(profileUrl(link),true);assert.equal(profileMatches(link,'ÅSGREINA BYGGASSISTANSE AS'),true);
 const canonical=canonicalProfile(link);assert.equal(canonical,'https://www.facebook.com/AasgreinaByggassistanse');assert.ok(raw.includes(canonical));
 assert.equal(profileUrl('https://facebook.com/l.php?u=https://unrelated.no'),false);
});
test('website and hiring discovery are kept out of directories while identity search retains them',async()=>{
 const store=new Store(':memory:'),requests:Record<string,unknown>[]=[];
 const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:4,maxPages:8},async(_url,init)=>{requests.push(JSON.parse(String(init?.body)));return Response.json({results:[],costDollars:{total:.007}});});
 try{const job=store.createJob(org,'routing','eve');await service.search(job.id,'Acme official website','website');await service.search(job.id,'Acme job vacancies','hiring');await service.search(job.id,'Acme organisation number','identity');assert.ok((requests[0]?.excludeDomains as string[]).includes('proff.no'));assert.equal(requests[1]?.includeDomains,undefined);assert.equal((requests[2]?.excludeDomains as string[]).includes('proff.no'),false);}finally{store.close();}
});
test('expired recruitment and navigation-only careers text cannot inflate supported hiring coverage',()=>{
 const store=new Store(':memory:'),service=new ResearchService(store);
 try{
  const job=store.createJob(org,'hiring','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/'+org,JSON.stringify({...identity,hjemmeside:'acme.no'}),'public_registry');
  const expired=service.save(job,'https://finn.no/job/ad/1','Acme Technology AS. Arbeidsgiver i Bergen. Vi søker en utvikler. Søknadsfrist: 2025-01-01.','external');
  assert.equal(service.verify(job.id,{field:'hiring',value:expired.text,quote:expired.text,snapshot_id:expired.id,effective_date:null}).accepted,false);
  const multi=service.save(job,'https://finn.no/job/ad/2','Arbeidsgiver Acme Technology AS Bergen. Other Group AS is hiring an engineer.','external');
  assert.equal(service.verify(job.id,{field:'hiring',value:'Other Group AS is hiring an engineer.',quote:'Other Group AS is hiring an engineer.',snapshot_id:multi.id,effective_date:null}).accepted,false);
  const nav=service.save(job,'https://acme.no/','Acme Technology AS. Om oss. Kontakt. Ledige stillinger.','external');
  assert.equal(service.verify(job.id,{field:'hiring',value:'Ledige stillinger.',quote:nav.text,snapshot_id:nav.id,effective_date:null}).accepted,false);
  const none=service.save(job,'https://acme.no/careers','Acme Technology AS. Vi har ingen ledige stillinger akkurat nå, men tar imot en åpen søknad.','external');
  const checked=service.verify(job.id,{field:'hiring',value:none.text,quote:none.text,snapshot_id:none.id,effective_date:null});
  assert.equal(checked.accepted,true);assert.equal(checked.claim?.qualifiers?.hiring_kind,'explicit_no_open_roles');
  const branch=service.save(job,'https://acme.teamtailor.com/locations/acme-technology','Acme Technology AS Bergen\n- Developer\nAcme Technology AS\n## Om Acme Group\nA parent company with 750 employees.\nhttps://acme.teamtailor.com/jobs/123-developer','external');
  const listing=service.verify(job.id,{field:'hiring',value:branch.text,quote:branch.text,snapshot_id:branch.id,effective_date:null});
  assert.equal(listing.accepted,true);assert.equal(listing.claim?.value,'Acme Technology AS Bergen\n- Developer\nAcme Technology AS');
 }finally{store.close();}
});

test('abbreviated company domains need a registry-listed domain and the exact legal ID',()=>{
 const source=page('https://atc.no/about',`Acme Technology AS. Organisasjonsnummer ${org}. Havneveien 10, Bergen. post@atc.no`);
 assert.equal(ownership(source,{...identity,epostadresse:'post@atc.no'},[source]).accepted,true);
 assert.equal(ownership(source,identity,[source]).accepted,false,'a page email cannot vouch for its own ownership');
 assert.equal(ownership(page(source.source_url,source.text.replace(org,'999111233')),{...identity,epostadresse:'post@atc.no'},[]).accepted,false);
 const directory=page('https://unrelated-business-index.example.org/acme',source.text);assert.equal(ownership(directory,{...identity,epostadresse:'post@atc.no'},[directory]).accepted,false);
});
test('a directory publisher footer cannot establish ownership of its member record',()=>{
 const listing=page('https://architecture-network.no/member/acme',`Acme Technology AS. Organisasjonsnummer ${org}. Havneveien 10, Bergen. Contact post@acme.no. Publisher footer: Org. nr. 988 412 120. post@architecture-network.no`);
 assert.equal(ownership(listing,identity,[listing]).accepted,false);
});

test('an unknown directory cannot promote itself using its own footer email',()=>{
 const listing=page('https://generic-index.no/en/company/'+org,`Acme Technology AS. Organisasjonsnummer ${org}. Havneveien 10, Bergen. Contact: hello@generic-index.no`);
 assert.equal(ownership(listing,identity,[listing]).accepted,false);
 assert.equal(ownership(listing,{...identity,epostadresse:'post@atc.no'},[listing]).accepted,false);
});

test('registry email discovery skips consumer mail providers and does not use page footer addresses',()=>{
 assert.equal(registryEmailDomain({epostadresse:'post@atc.no'}),'atc.no');
 for(const mail of ['user@gmail.com','user@hotmail.no','user@online.no','not an email'])assert.equal(registryEmailDomain({epostadresse:mail}),undefined);
});

test('an archived undated vacancy cannot establish current hiring even for the exact company',()=>{
 const store=new Store(':memory:'),service=new ResearchService(store);
 try{const job=store.createJob(org,'archive','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/'+org,JSON.stringify({...identity,hjemmeside:'acme.no'}),'public_registry');const text='Acme Technology AS. Vi har en ledig stilling som utvikler ved vårt kontor i Bergen. Send søknad med CV.';const old=service.save(job,'https://acme.no/Arkiv/ledig-stilling',text,'external');assert.equal(service.verify(job.id,{field:'hiring',value:text,quote:text,snapshot_id:old.id,effective_date:null}).accepted,false);const current=service.save(job,'https://acme.no/careers',text,'external');assert.equal(service.verify(job.id,{field:'hiring',value:text,quote:text,snapshot_id:current.id,effective_date:null}).accepted,true);}finally{store.close()}
});

test('one operator page on a shared brand host cannot attribute the whole chain to that operator',()=>{
 const branch={...identity,navn:'Acme Bergen AS'};
 const location=page('https://acme.no/locations/bergen',`Acme Bergen AS. Organisasjonsnummer ${org}. Havneveien 10, 5003 Bergen.`);
 const parent=page('https://acme.no/','Acme. We operate restaurants throughout Norway.');
 assert.equal(ownership(location,branch,[location,parent]).accepted,true);
 assert.equal(ownership(parent,branch,[location,parent]).accepted,false);
});

test('a company team can be corroborated by two registry officers, but one person or a conflicting ID cannot',()=>{
 const officers={...identity,registry_roles:[{name:'Kari Johanne Nordvik',role_code:'DAGL'},{name:'Per Henrik Bergesen',role_code:'LEDE'}]};
 const roles=page('https://data.brreg.no/enhetsregisteret/api/enheter/'+org+'/roller',JSON.stringify({rollegrupper:[{roller:[{person:{navn:{fornavn:'Kari',mellomnavn:'Johanne',etternavn:'Nordvik'}},type:{kode:'DAGL'}},{person:{navn:{fornavn:'Per',mellomnavn:'Henrik',etternavn:'Bergesen'}},type:{kode:'LEDE'}}]}]}));roles.source_class='public_registry';
 const team=page('https://acme.no/team','Acme Technology AS. Norge. Teamet vårt. Kari Nordvik — CEO. Per Bergesen — Chairman. We build software.');
 assert.equal(ownership(team,officers,[roles,team]).accepted,true);
 assert.equal(ownership({...team,text:team.text.replace('Per Bergesen','Someone Else')},officers,[roles]).accepted,false);
 assert.equal(ownership({...team,text:team.text+' Org.nr. 999111233'},officers,[roles]).accepted,false);
 const customer=page('https://acme.no/customers',team.text);assert.equal(ownership(customer,officers,[roles,customer]).accepted,false);
});
test('a zero-result NAV observation never suppresses independent careers discovery',async()=>{
 const store=new Store(':memory:'),service=new ResearchService(store,{db:':memory:',maxExaUsd:1,maxSearches:6,maxPages:12}),queries:string[]=[];
 try{const job=store.createJob(org,'nav-zero-routing','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/'+org,JSON.stringify(identity),'public_registry');const nav=service.save(job,'https://pam-stilling-feed.nav.no/api/v1/feed','NAV source check: zero attributed advertisements.','external');nav.extraction_method='nav-feed-index-query/v1';store.db.prepare('UPDATE snapshots SET body=? WHERE id=?').run(JSON.stringify(nav),nav.id);store.saveProposal(job.id,'nav-zero',{field:'hiring',value:nav.text,quote:nav.text,snapshot_id:nav.id,effective_date:null});
 service.fallbackDiscovery=async()=>{};service.inspectCompanyCandidates=async()=>{};service.completeProfileLinks=async()=>{};service.seedProposals=()=>{};service.search=async(_job,_query,purpose)=>{queries.push(purpose??'general');return{candidates:[],usage:store.usage(job.id),note:''}};await service.discover(job);assert.ok(queries.includes('hiring'),'NAV absence is source-scoped; independent employer/careers search is still required');}finally{store.close();}
});
test('an attributed site gets dated activity discovery independently of hiring checks',async()=>{
 const store=new Store(':memory:'),service=new ResearchService(store,{db:':memory:',maxExaUsd:1,maxSearches:6,maxPages:12}),queries:string[]=[];
 try{const job=store.createJob(org,'activity-routing','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/'+org,JSON.stringify(identity),'public_registry');const own=service.save(job,'https://acme.no/',identity.navn+' Org.nr '+org,'external');store.saveProposal(job.id,'own',{field:'official_website',value:own.source_url,quote:own.text,snapshot_id:own.id,effective_date:null});service.fallbackDiscovery=async()=>{};service.inspectCompanyCandidates=async()=>{};service.completeProfileLinks=async()=>{};service.seedProposals=()=>{};service.search=async(_job,query)=>{queries.push(query);return{candidates:[],usage:store.usage(job.id),note:''}};await service.discover(job);assert.ok(queries.some(q=>q.includes('site:acme.no')&&/nyheter|aktuelt/.test(q)));}finally{store.close();}
});
