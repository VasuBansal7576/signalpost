import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.ts';
import {ResearchService} from '../src/service.ts';
import {snapshot,canonical,hash} from '../src/domain.ts';
import {profileAttribution,profileUrl,canonicalProfile,ownership} from '../src/attribution.ts';
import {websiteLinks,htmlText} from '../src/website-links.ts';
import {navEmployerOrg,navQuery,NavFeed,type NavCatalogue} from '../src/nav-feed.ts';
const org='999111222',identity={navn:'ACME TECHNOLOGY AS',organisasjonsnummer:org,forretningsadresse:{adresse:['Havneveien 10'],postnummer:'5003',poststed:'BERGEN'}};
test('model tools bind jobs through server-side session receipts, not copied UUID arguments',()=>{
 const store=new Store(':memory:');try{const first=store.createJob(org,'session-bind','eve'),second=store.createJob('999111233','session-bind','eve');store.saveReceipt(first.id,'session-a');store.saveReceipt(second.id,'session-b');assert.equal(store.jobForSession('session-a').id,first.id);assert.equal(store.jobForSession('session-b').id,second.id);assert.throws(()=>store.jobForSession('unknown-session'),/not bound/);}finally{store.close();}
});
test('non-employment applications cannot become hiring observations on a verified company site',()=>{
 const store=new Store(':memory:'),service=new ResearchService(store);try{const job=store.createJob(org,'grant','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/'+org,JSON.stringify({...identity,hjemmeside:'acme.no'}),'public_registry');const source=service.save(job,'https://acme.no/apply','ACME TECHNOLOGY AS. Søknad om støtte til et allmennyttig formål sendes via vårt kontaktskjema.','external');assert.equal(service.verify(job.id,{field:'hiring',value:source.text,quote:source.text,snapshot_id:source.id,effective_date:null}).accepted,false);}finally{store.close();}
});
test('directory profile fallback binds exact org, legal name, address and matching account on a specific trusted record',()=>{
 const page=(text:string,url='https://www.proff.no/selskap/acme/bergen/software/ID')=>snapshot({source_url:url,text,source_class:'external',organisation_number:org,run_id:'test'});
 const text='ACME TECHNOLOGY AS. Org.nr 999111222. Havneveien 10, 5003 Bergen. https://www.linkedin.com/company/acme-technology';
 assert.equal(profileAttribution(page(text),identity,[]).accepted,true);
 for(const wrong of [page(text.replace('999111222','999111233')),page(text.replace('Havneveien 10, 5003 Bergen','Storgata 2, 0181 Oslo')),page(text.replace('company/acme-technology','company/acme-group')),page(text,'https://www.proff.no/bransjesøk?q=999111222'),page(text,'https://untrusted.example.org/company/acme')])assert.equal(profileAttribution(wrong,identity,[]).accepted,false);
 const store=new Store(':memory:'),service=new ResearchService(store);try{const job=store.createJob(org,'profile','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/'+org,JSON.stringify(identity),'public_registry');const source=service.save(job,page(text).source_url,text,'external');service.seedProposals(job);const p=service.finalize(job,{claims:[],evidence:[],errors:[]},[]);assert.equal(p.claims.find(c=>c.field==='company_owned_profiles')?.availability,'available');assert.equal(store.source(job.id,source.id).source_class,'external','directory proof is never relabelled company-owned');assert.equal(p.claims.find(c=>c.field==='official_website')?.availability,'ambiguous');}finally{store.close();}
});
test('website fallback resolves relative careers/contact links, escaped ampersands and JSON-LD sameAs without executing scripts',()=>{
 const html=`<a href='/careers?x=1&amp;y=2'>Careers</a><a href="../contact">Contact</a><script type='application/ld+json'>{"sameAs":["https://www.linkedin.com/company/acme-technology"]}</script><script>throw new Error('untrusted')</script><p>We are hiring.</p>`;
 assert.deepEqual(websiteLinks(html,'https://acme.no/about/').sort(),['https://acme.no/careers?x=1&y=2','https://acme.no/contact','https://www.linkedin.com/company/acme-technology'].sort());assert.ok(htmlText(html).includes('We are hiring.'));assert.ok(!htmlText(html).includes('throw new Error'));
 assert.equal(profileUrl('https://no.linkedin.com/company/acme-technology'),true);assert.equal(canonicalProfile('https://no.linkedin.com/company/acme-technology/'),'https://www.linkedin.com/company/acme-technology');
});
test('published canonical regional profile URLs pass evidence revalidation without admitting another account',()=>{
 const store=new Store(':memory:'),service=new ResearchService(store);try{const job=store.createJob(org,'regional-profile','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/'+org,JSON.stringify(identity),'public_registry');const text='ACME TECHNOLOGY AS. Org.nr 999111222. Havneveien 10, 5003 Bergen. https://no.linkedin.com/company/acme-technology/';const source=service.save(job,'https://www.proff.no/selskap/acme/bergen/software/ID',text,'external');const proposal={field:'company_owned_profiles' as const,value:'https://www.linkedin.com/company/acme-technology',quote:text,snapshot_id:source.id,effective_date:null};assert.equal(service.verify(job.id,proposal).accepted,true);assert.equal(service.verify(job.id,{...proposal,value:'https://www.linkedin.com/company/acme-other'}).accepted,false);}finally{store.close();}
});
test('website identity can use exact-org directory phone plus legal brand and registered locality without fuzzy address guessing',()=>{
 const page=(url:string,text:string)=>snapshot({source_url:url,text,source_class:'external',organisation_number:org,run_id:'phone'});
 const source=page('https://acme.no/','Acme Technology AS. Bergen. Telefon 919 14 524.'),directory=page('https://proff.no/selskap/acme','Acme Technology AS. Org.nr 999111222. Telefon 919 14 524 5003 Bergen');
 assert.equal(ownership(source,identity,[source,directory]).kind,'legal-name-city-phone-and-brand-domain');
 for(const other of [page(directory.source_url,directory.text.replace('999111222','999111233')),page(directory.source_url,directory.text.replace('919 14 524','919 14 525'))])assert.equal(ownership(source,identity,[source,other]).accepted,false);
 assert.equal(ownership(page(source.source_url,source.text.replace('Bergen','Oslo')),identity,[directory]).accepted,false);
});
const ad={status:'ACTIVE',ad_content:{uuid:'47cfbfed-73c2-469a-a190-f45ba9927c36',title:'Utvikler',published:'2026-10-01T00:00:00Z',expires:'2026-11-01T00:00:00Z',employer:{name:'ACME TECHNOLOGY AS',orgnr:org}}};
test('NAV detail matching requires exact employer or verified subunit org and active non-expired dates',()=>{
 const at='2026-10-15T00:00:00Z';assert.equal(navEmployerOrg(ad,org,[],at)?.binding,'organisation_number');assert.equal(navEmployerOrg(ad,'999111233',[],at),undefined);assert.equal(navEmployerOrg(ad,'999111233',[org],at)?.binding,'registered_subunit_parent');assert.equal(navEmployerOrg({...ad,status:'INACTIVE'},org,[],at),undefined);assert.equal(navEmployerOrg(ad,org,[],'2026-11-02T00:00:00Z'),undefined);assert.equal(navEmployerOrg({...ad,ad_content:{...ad.ad_content,employer:{name:identity.navn,orgnr:'999111233'}}},org,[],at),undefined,'matching name cannot override a different employer identifier');
});
function catalogue():NavCatalogue{return {version:1,complete:true,collection_started_at:'2026-10-15T00:00:00Z',completed_at:'2026-10-15T00:05:00Z',failures:[],manifest:{scope:'full feed'},records:[{uuid:ad.ad_content.uuid,title:'Utvikler',status:'ACTIVE',employer_org:org,employer_name:identity.navn,published:ad.ad_content.published,expires:ad.ad_content.expires,source_url:'https://pam-stilling-feed.nav.no/api/v1/feedentry/'+ad.ad_content.uuid,retrieved_at:'2026-10-15T00:03:00Z',content_sha256:hash(JSON.stringify(ad))}]};}
test('complete NAV query distinguishes source-scoped zero from company-wide absence and rejects incomplete collection',()=>{
 const c=catalogue();assert.equal(navQuery(c,org,[]).active_ads_attributed,1);const zero=navQuery(c,'999111233',[]);assert.equal(zero.active_ads_attributed,0);assert.equal(zero.company_wide_absence_established,false);assert.match(zero.scope,/Finn.no ads excluded/);assert.throws(()=>navQuery({...c,complete:false},org,[]),/Incomplete/);
 const store=new Store(':memory:'),service=new ResearchService(store);try{const job=store.createJob(org,'nav-index','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/'+org,JSON.stringify(identity),'public_registry');service.navCatalogue=c;service.navCatalogueHiring(job);const p=service.finalize(job,{claims:[],evidence:[],errors:[]},[]);const hiring=p.claims.find(c=>c.field==='hiring')!;assert.equal(hiring.qualifiers?.hiring_kind,'source_scoped_active_ads');assert.equal((hiring.value as {active_ads_attributed:number}).active_ads_attributed,1);
 const independent=new ResearchService(store);const source=store.snapshots(job.id).find(s=>s.extraction_method==='nav-feed-index-query/v1')!;assert.equal(independent.verify(job.id,{field:'hiring',value:source.text,quote:source.text,snapshot_id:source.id,effective_date:null}).accepted,true);
 const corrupted={...c,records:[]};store.db.prepare('UPDATE catalogues SET body=? WHERE id=?').run(JSON.stringify(corrupted),hash(canonical(c))); assert.equal(independent.verify(job.id,{field:'hiring',value:source.text,quote:source.text,snapshot_id:source.id,effective_date:null}).accepted,false);
 }finally{store.close();}
});
