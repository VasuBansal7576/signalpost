import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.ts';
import {ResearchService} from '../src/service.ts';
import {researchCompanyWeb} from '../src/research-company.ts';

// Fresh company storage, no remembered URLs, registry website or employee count.
// The real discovery path must still spend its remaining search on profiles.
test('cold discovery finds a company profile without a website, employee count or previous run',async()=>{
 const store=new Store(':memory:'),queries:string[]=[];
 const org='999111222',identity={organisasjonsnummer:org,navn:'ACME TECHNOLOGY AS',forretningsadresse:{adresse:['Havneveien 10'],postnummer:'5003',poststed:'BERGEN'}};
 const transport:typeof fetch=async(url,init)=>{
  const path=String(url);
  if(path.endsWith('/api/enheter/'+org))return Response.json(identity);
  if(path.includes('data.brreg.no'))return Response.json({}, {status:404});
  const body=JSON.parse(String(init?.body??'{}'));
  if(path.endsWith('/search')){queries.push(body.query);return Response.json({results:/sosiale medier/.test(body.query)?[{url:'https://www.proff.no/selskap/acme/bergen/software/ID',text:'ACME TECHNOLOGY AS. Org.nr 999111222. Havneveien 10, 5003 Bergen. https://www.linkedin.com/company/acme-technology'}]:[],costDollars:{total:.007}});}
  return Response.json({results:[],costDollars:{total:.001}});
 };
 const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:4,maxPages:8},transport,async url=>({url:String(url),status:403,text:'Blocked',content_type:'text/plain'}));
 try{const job=store.createJob(org,'cold-start','eve'),baseline=await service.registry(job);assert.equal(store.previous(org,job.run_id),undefined);assert.deepEqual(store.candidates(org),[]);const web=await researchCompanyWeb(service,job,async()=>{throw new Error('Model transport failed');});assert.equal(web.errors[0]?.message,'Model transport failed');const result=service.finalize(job,baseline,web.proposals,web.errors);assert.equal(queries.length,4,'missing employees or site must not skip profile research');assert.ok(result.claims.some(c=>c.field==='company_owned_profiles'&&c.availability==='available'&&c.value==='https://www.linkedin.com/company/acme-technology'));}finally{store.close();}
});

test('cold discovery inspects candidate contact links before ownership is established, then verifies exact identity',async()=>{
 for(const correct of [true,false]){
 const store=new Store(':memory:'),requested:string[]=[];
 const identity={organisasjonsnummer:'999111222',navn:'ACME TECHNOLOGY AS',forretningsadresse:{adresse:['Havneveien 10'],postnummer:'5003',poststed:'BERGEN'}};
 const transport:typeof fetch=async(url,init)=>{const body=JSON.parse(String(init?.body??'{}'));if(String(url).endsWith('/search'))return Response.json({results:[{url:'https://acme.no/',text:'ACME TECHNOLOGY AS. We build software.'}],costDollars:{total:.007}});const u=body.urls?.[0];return Response.json({results:u==='https://acme.no/contact'?[{url:u,text:`ACME TECHNOLOGY AS. Organisasjonsnummer ${correct?'999111222':'999111233'}. Havneveien 10, 5003 Bergen. https://www.linkedin.com/company/acme-technology`}]:[],costDollars:{total:.001}});};
 const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:4,maxPages:8},transport,async url=>{requested.push(url);return{url,status:200,content_type:url.endsWith('robots.txt')?'text/plain':'text/html',text:url.endsWith('robots.txt')?'User-agent: *\nAllow: /':'<h1>ACME TECHNOLOGY AS</h1><a href="/contact">Contact us</a>'}});
 try{const job=store.createJob('999111222','candidate-'+correct,'eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify(identity),'public_registry');await service.discover(job);assert.ok(requested.includes('https://acme.no/'),'a plausible candidate is crawled, not assumed owned');const result=service.finalize(job,{claims:[],evidence:[],errors:[]},[]);assert.equal(result.claims.some(c=>c.field==='company_owned_profiles'&&c.availability==='available'),correct);assert.equal(result.claims.some(c=>c.field==='official_website'&&c.availability==='available'),correct);}finally{store.close()}
 }
});

test('bounded model context deduplicates company URLs so repeated homepages cannot crowd out useful facts',()=>{
 const store=new Store(':memory:'),service=new ResearchService(store);
 try{const job=store.createJob('999111222','context','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify({organisasjonsnummer:'999111222',navn:'Acme Technology AS',hjemmeside:'acme.no'}),'public_registry');
 for(let n=0;n<20;n++)service.save(job,n%2?'https://www.acme.no/':'https://acme.no/','Acme Technology AS. org.nr.999111222. '+n,'external');
 const detailed=service.save(job,'https://acme.no/about','Acme Technology AS. org.nr.999111222. '+('Useful company context. '.repeat(55))+'We deliver architecture and planning services.','external');
 const raw=service.save(job,'https://acme.no/about','<html>Acme Technology AS. org.nr.999111222</html>','external');raw.extraction_method='public-html-links/v1';store.db.prepare('UPDATE snapshots SET body=? WHERE id=? AND job=?').run(JSON.stringify(raw),raw.id,job.id);
 service.save(job,'https://acme.no/Arkiv/ledig-stilling','Acme Technology AS. org.nr.999111222. Vi har en ledig stilling som utvikler.','external');
 const before=store.snapshots(job.id).length,context=service.context(job.id);
 assert.ok(context.discovered_sources.some(s=>s.snapshot_id===detailed.id&&s.text.includes('architecture and planning')));
 assert.equal(context.discovered_sources.filter(s=>new URL(s.source_url).pathname==='/').length,1);
 assert.equal(context.discovered_sources.some(s=>s.snapshot_id===raw.id||/Arkiv/.test(s.source_url)),false);
 assert.equal(store.snapshots(job.id).length,before,'context selection never destroys the original evidence');
 }finally{store.close()}
});

test('a branded homepage without the full legal name is inspected for exact-entity contact proof',async()=>{
 const store=new Store(':memory:'),reads:string[]=[];
 const identity={organisasjonsnummer:'999111222',navn:'ACME TECHNOLOGY AS',forretningsadresse:{adresse:['Havneveien 10'],postnummer:'5003',poststed:'BERGEN'}};
 const transport:typeof fetch=async(url,init)=>{const body=JSON.parse(String(init?.body??'{}'));if(String(url).endsWith('/search'))return Response.json({results:[{url:'https://acme.no/',text:'Acme — software for your business.'}],costDollars:{total:.007}});const u=body.urls?.[0];reads.push(u);return Response.json({results:u==='https://acme.no/contact'?[{url:u,text:'ACME TECHNOLOGY AS. Organisasjonsnummer 999111222. Havneveien 10, 5003 Bergen. https://www.linkedin.com/company/acme-technology'}]:[],costDollars:{total:.001}});};
 const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:4,maxPages:8},transport,async url=>({url,status:200,content_type:url.endsWith('robots.txt')?'text/plain':'text/html',text:url.endsWith('robots.txt')?'User-agent: *\nAllow: /':'<h1>Acme</h1><a href="/contact">Contact us</a>'}));
 try{const job=store.createJob('999111222','brand-contact','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify(identity),'public_registry');await service.discover(job);assert.ok(reads.includes('https://acme.no/contact'),'brand candidate must reach exact legal contact proof');const result=service.finalize(job,{claims:[],evidence:[],errors:[]},[]);assert.ok(result.claims.some(c=>c.field==='official_website'&&c.availability==='available'));assert.ok(result.claims.some(c=>c.field==='company_owned_profiles'&&c.availability==='available'));}finally{store.close()}
});

test('hiring search can discover company careers outside the recruiter allowlist',async()=>{
 const store=new Store(':memory:');let payload:Record<string,unknown>={};
 const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:4,maxPages:8},async(_url,init)=>{payload=JSON.parse(String(init?.body));return Response.json({results:[],costDollars:{total:.007}})});
 try{const job=store.createJob('999111222','hiring-unrestricted','eve');await service.search(job.id,'"Acme Technology" Bergen ledige stillinger','hiring');assert.equal(payload.includeDomains,undefined,'company careers must not be excluded before a website has been verified');}finally{store.close()}
});

test('unrelated recruitment results cannot displace verified company content from model context',()=>{
 const store=new Store(':memory:'),service=new ResearchService(store);
 try{const job=store.createJob('999111222','context-attribution','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify({organisasjonsnummer:'999111222',navn:'Acme Technology AS',hjemmeside:'acme.no'}),'public_registry');
 for(let n=0;n<18;n++)service.save(job,'https://some-recruiter.no/jobs/'+n,'Other Company AS. We are hiring developers. '.repeat(10),'external');
 const owned=service.save(job,'https://acme.no/about','Acme Technology AS. We build accounting software for Norwegian businesses.','external');assert.ok(service.context(job.id).discovered_sources.some(s=>s.snapshot_id===owned.id));
 }finally{store.close()}
});

test('relative provider navigation links reach contact proof when direct HTML is unavailable',async()=>{
 const store=new Store(':memory:'),reads:string[]=[];
 const identity={organisasjonsnummer:'999111222',navn:'ACME TECHNOLOGY AS',forretningsadresse:{adresse:['Havneveien 10'],postnummer:'5003',poststed:'BERGEN'}};
 const transport:typeof fetch=async(url,init)=>{const body=JSON.parse(String(init?.body??'{}'));if(String(url).endsWith('/search'))return Response.json({results:[{url:'https://acme.no/',text:'Acme Technology AS. We build software.',extras:{links:['/contact','//www.linkedin.com/company/acme-technology']}}],costDollars:{total:.007}});const u=body.urls?.[0];reads.push(u);return Response.json({results:u==='https://acme.no/contact'?[{url:u,text:'ACME TECHNOLOGY AS. Organisasjonsnummer 999111222. Havneveien 10, 5003 Bergen.'}]:[],costDollars:{total:.001}});};
 const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:6,maxPages:12},transport,async url=>({url,status:403,content_type:'text/plain',text:'Blocked'}));
 try{const job=store.createJob('999111222','relative-provider-links','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify(identity),'public_registry');await service.discover(job);assert.ok(reads.includes('https://acme.no/contact'));const result=service.finalize(job,{claims:[],evidence:[],errors:[]},[]);assert.ok(result.claims.some(c=>c.field==='official_website'&&c.availability==='available'));assert.ok(result.claims.some(c=>c.field==='company_owned_profiles'&&c.value==='https://www.linkedin.com/company/acme-technology'));}finally{store.close()}
});

test('a company first found by the late profile fallback still gets contact-page verification',async()=>{
 const store=new Store(':memory:'),reads:string[]=[];const identity={organisasjonsnummer:'999111222',navn:'ACME TECHNOLOGY AS',forretningsadresse:{adresse:['Havneveien 10'],postnummer:'5003',poststed:'BERGEN'}};
 const transport:typeof fetch=async(url,init)=>{const b=JSON.parse(String(init?.body??'{}'));if(String(url).endsWith('/search'))return Response.json({results:/sosiale medier/.test(b.query)?[{url:'https://acme.no/',text:'Acme — Norwegian technology.',extras:{links:['/contact']}}]:[],costDollars:{total:.007}});const u=b.urls?.[0];reads.push(u);return Response.json({results:u==='https://acme.no/contact'?[{url:u,text:'ACME TECHNOLOGY AS. Org.nr 999111222. Havneveien 10, 5003 Bergen. https://www.linkedin.com/company/acme-technology'}]:[],costDollars:{total:.001}})};
 const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:6,maxPages:12},transport,async url=>({url,status:403,text:'Blocked',content_type:'text/plain'}));
 try{const job=store.createJob('999111222','late-candidate','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify(identity),'public_registry');await service.discover(job);assert.ok(reads.includes('https://acme.no/contact'));const p=service.finalize(job,{claims:[],evidence:[],errors:[]},[]);assert.ok(p.claims.some(c=>c.field==='company_owned_profiles'&&c.availability==='available'));}finally{store.close()}
});

test('Norwegian candidates are inspected before uncorroborated foreign namesakes',async()=>{
 const store=new Store(':memory:'),reads:string[]=[];const identity={organisasjonsnummer:'999111222',navn:'ACME TECHNOLOGY AS',forretningsadresse:{adresse:['Havneveien 10'],postnummer:'5003',poststed:'BERGEN'}};
 const transport:typeof fetch=async(url,init)=>{const b=JSON.parse(String(init?.body??'{}'));if(String(url).endsWith('/search'))return Response.json({results:[{url:'https://acme.fr/',text:'Acme Technology. Paris France.',extras:{links:['/contact']}},{url:'https://acme.ca/',text:'Acme Technology. Toronto Canada.',extras:{links:['/contact']}},{url:'https://acme.no/',text:'Acme Technology. Bergen Norge.',extras:{links:['/contact']}}],costDollars:{total:.007}});const u=b.urls?.[0];reads.push(u);return Response.json({results:u==='https://acme.no/contact'?[{url:u,text:'ACME TECHNOLOGY AS. Org.nr 999111222. Havneveien 10, 5003 Bergen. https://www.linkedin.com/company/acme-technology'}]:[],costDollars:{total:.001}})};
 const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:6,maxPages:12},transport,async url=>({url,status:403,text:'Blocked',content_type:'text/plain'}));
 try{const job=store.createJob('999111222','candidate-order','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify(identity),'public_registry');await service.discover(job);assert.equal(reads.filter(u=>u?.includes('acme.'))[0],'https://acme.no/contact');assert.ok(service.finalize(job,{claims:[],evidence:[],errors:[]},[]).claims.some(c=>c.field==='company_owned_profiles'&&c.availability==='available'));}finally{store.close()}
});

test('verified homepage metadata survives model failure without borrowing another entity description',async()=>{
 for(const correct of [true,false]){
 const store=new Store(':memory:'),service=new ResearchService(store,undefined,undefined,async url=>({url,status:200,content_type:url.endsWith('robots.txt')?'text/plain':'text/html',text:url.endsWith('robots.txt')?'User-agent: *\nAllow: /':`<html><head><meta content="Norwegian software for payroll and accounting, with a local team in Bergen." name="description"></head><body>Acme Technology AS. Org.nr ${correct?'999111222':'999111233'}.</body></html>`}));
 try{const job=store.createJob('999111222','metadata-'+correct,'eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify({organisasjonsnummer:'999111222',navn:'ACME TECHNOLOGY AS'}),'public_registry');await service.publicNavigation(job,'https://acme.no/',false);const p=service.finalize(job,{claims:[],evidence:[],errors:[]},[]);const d=p.claims.find(c=>c.field==='business_description'&&c.availability==='available');assert.equal(Boolean(d),correct);if(d){assert.equal(d.value,'Norwegian software for payroll and accounting, with a local team in Bergen.');assert.ok(d.evidence_ids.length);}}finally{store.close()}
 }
});

test('newly searched exact-organisation directory links are inspected as candidates, never published as the company site',async()=>{
 const store=new Store(':memory:'),reads:string[]=[];const identity={organisasjonsnummer:'999111222',navn:'ACME TECHNOLOGY AS',forretningsadresse:{adresse:['Havneveien 10'],postnummer:'5003',poststed:'BERGEN'}};
 const transport:typeof fetch=async(url,init)=>{const b=JSON.parse(String(init?.body??'{}'));if(String(url).endsWith('/search'))return Response.json({results:[{url:'https://www.proff.no/selskap/acme/ID',text:'ACME TECHNOLOGY AS. Org.nr 999111222. Havneveien 10, 5003 Bergen.',extras:{links:['https://acme.no/']}}],costDollars:{total:.007}});const u=b.urls?.[0];reads.push(u);return Response.json({results:u==='https://acme.no/'?[{url:u,text:'ACME TECHNOLOGY AS. Org.nr 999111222. https://www.linkedin.com/company/acme-technology'}]:[],costDollars:{total:.001}})};
 const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:6,maxPages:12},transport,async url=>({url,status:403,text:'Blocked',content_type:'text/plain'}));
 try{const job=store.createJob('999111222','directory-candidate','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify(identity),'public_registry');await service.discover(job);assert.ok(reads.includes('https://acme.no/'));const p=service.finalize(job,{claims:[],evidence:[],errors:[]},[]);assert.ok(p.claims.some(c=>c.field==='company_owned_profiles'&&c.availability==='available'));assert.equal(p.claims.some(c=>c.field==='official_website'&&typeof c.value==='string'&&c.value.includes('proff.no')),false);}finally{store.close()}
});

test('a registry website can fall back to public HTML when the extraction provider returns no page',async()=>{
 const store=new Store(':memory:'),reads:string[]=[];const s=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:6,maxPages:12},async()=>Response.json({results:[],costDollars:{total:.001}}),async url=>{reads.push(url);return{url,status:200,content_type:url.endsWith('robots.txt')?'text/plain':'text/html',text:url.endsWith('robots.txt')?'User-agent: *\nAllow: /':'<h1>Acme Technology AS</h1><p>Org.nr 999111222</p><a href="https://www.linkedin.com/company/acme-technology">Our company</a>'}});
 try{const j=store.createJob('999111222','registry-html','eve');s.save(j,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify({organisasjonsnummer:'999111222',navn:'ACME TECHNOLOGY AS',hjemmeside:'acme.no'}),'public_registry');await s.discover(j);assert.ok(reads.includes('https://acme.no/'));assert.ok(s.finalize(j,{claims:[],evidence:[],errors:[]},[]).claims.some(c=>c.field==='company_owned_profiles'&&c.availability==='available'));}finally{store.close()}
});
