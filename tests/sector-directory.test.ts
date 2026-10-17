import{test}from'node:test';import assert from'node:assert/strict';import{Store}from'../src/store.ts';import{ResearchService}from'../src/service.ts';

test('a generic sector domain cannot turn a directory member page into the official company site',()=>{
 for(const host of ['barnehage.info','barnehageportal.no']){
 const store=new Store(':memory:'),service=new ResearchService(store);
 try{const job=store.createJob('999111222','sector-directory','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify({organisasjonsnummer:'999111222',navn:'NORDLYS BESTUM BARNEHAGE AS',forretningsadresse:{adresse:['Fagertunveien 8F'],postnummer:'0281',poststed:'OSLO'}}),'public_registry');const source=service.save(job,'https://'+host+'/nordlys-bestum-barnehage/','Nordlys Bestum barnehage. Fagertunveien 8F, 0281 Oslo. Eier: Nordlys Bestum barnehage AS (999111222). https://nordlys.no/barnehage/bestum','external');service.seedProposals(job);assert.equal(service.verify(job.id,{field:'official_website',value:source.source_url,quote:source.text,snapshot_id:source.id,effective_date:null}).accepted,false);assert.equal(service.finalize(job,{claims:[],evidence:[],errors:[]},[]).claims.some(c=>c.field==='official_website'&&c.availability==='available'),false);}finally{store.close()}
 }
});

test('regional member directories remain third-party even when their domain shares the company city name',()=>{
 const store=new Store(':memory:'),service=new ResearchService(store);
 try{const job=store.createJob('999111222','regional-directory','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify({organisasjonsnummer:'999111222',navn:'EXPERIENCE BERGEN AS',forretningsadresse:{adresse:['Havneveien 10'],postnummer:'5003',poststed:'BERGEN'}}),'public_registry');const listing=service.save(job,'https://visitbergen.example.org/medlemsbedrift/experience-bergen','Experience Bergen AS. Havneveien 10, 5003 Bergen. Org.nr 999111222.','external');assert.equal(service.verify(job.id,{field:'official_website',value:listing.source_url,quote:listing.text,snapshot_id:listing.id,effective_date:null}).accepted,false);}finally{store.close()}
});

test('a chain homepage listing one operator and its phone cannot become that operator website',()=>{
 const store=new Store(':memory:'),service=new ResearchService(store);
 try{const job=store.createJob('999111222','chain-directory','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify({organisasjonsnummer:'999111222',navn:'ACME BERGEN AS',forretningsadresse:{adresse:['Havneveien 10'],postnummer:'5003',poststed:'BERGEN'}}),'public_registry');service.save(job,'https://www.proff.no/selskap/acme/ID','ACME BERGEN AS. Org.nr 999111222. Havneveien 10, 5003 Bergen. Phone 41234567.','external');const root=service.save(job,'https://acme.no/','Acme chain. Restaurants across Norway. '+('Choose a restaurant and order online. '.repeat(40))+'Locations: Acme Bergen. Havneveien 10, 5003 Bergen. 41234567.','external');assert.equal(service.verify(job.id,{field:'official_website',value:root.source_url,quote:root.text,snapshot_id:root.id,effective_date:null}).accepted,false);}finally{store.close()}
});
