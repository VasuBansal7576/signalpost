import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicAddress,robotsAllowed,websiteUrl} from '../src/public-web.ts';
import {Store} from '../src/store.ts';
import {ResearchService} from '../src/service.ts';
test('public HTML retrieval rejects restricted/private targets and honors robots path rules',()=>{
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.100.100.200','::1','fc00::1','2001:db8::1'])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
 for(const url of ['https://localhost','https://127.0.0.1','http://company.no','https://www.linkedin.com/company/acme','https://company.no:8080','https://user:secret@company.no'])assert.throws(()=>websiteUrl(url));
 const robots='User-agent: *\nDisallow: /private\nDisallow: /*?secret=\nAllow: /private/public\n';
 assert.equal(robotsAllowed(robots,'/contact'),true);assert.equal(robotsAllowed(robots,'/private/x'),false);assert.equal(robotsAllowed(robots,'/private/public/x'),true);assert.equal(robotsAllowed(robots,'/x?secret=yes'),false);
 assert.equal(robotsAllowed('User-agent: *\nDisallow: /\nUser-agent: SignalpostResearch\nAllow: /contact\n','/contact'),true);
});
test('robots-approved verified-company HTML supplies profile links; disallow cannot be bypassed',async()=>{
 const store=new Store(':memory:');let htmlRequests=0;
 const service=new ResearchService(store,{db:':memory:',exaKey:'test',maxExaUsd:1,maxSearches:4,maxPages:8},fetch,async url=>{htmlRequests++;return {url,status:200,text:url.endsWith('robots.txt')?'User-agent: *\nDisallow: /private':'<footer>Acme AS, org.nr. 999111222 <a href="https://www.instagram.com/acme/">Instagram</a></footer>',content_type:url.endsWith('robots.txt')?'text/plain':'text/html'};});
 try{
  const job=store.createJob('999111222','html','eve');service.save(job,'https://data.brreg.no/enhetsregisteret/api/enheter/999111222',JSON.stringify({navn:'Acme AS',organisasjonsnummer:'999111222',hjemmeside:'acme.no'}),'public_registry');
  service.save(job,'https://acme.no/','Acme AS builds software.','external');
  await service.publicNavigation(job,'https://acme.no/');await service.publicNavigation(job,'https://acme.no/');assert.equal(htmlRequests,2,'one robots and one page request; repeat is replayed');
  const profile=service.finalize(job,{claims:[],evidence:[],errors:[]},[]);assert.ok(profile.claims.some(p=>p.field==='company_owned_profiles'&&p.value==='https://www.instagram.com/acme'));
  service.save(job,'https://acme.no/private','Acme AS private.','external');await assert.rejects(service.publicNavigation(job,'https://acme.no/private'),/robots/);assert.equal(htmlRequests,2);
  await assert.rejects(service.publicNavigation(job,'https://unverified.no/'),/Verify this company/);
  assert.equal(store.uncertainCosts(job.id),0,'free HTML requests must not be misreported as unknown Exa charges');
 }finally{store.close();}
});
