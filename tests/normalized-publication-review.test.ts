import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Store} from '../src/store.ts';
import {ResearchService} from '../src/service.ts';
import {hash} from '../src/domain.ts';
const f=JSON.parse(readFileSync(new URL('./fixtures/semantic/sweco-normalized-profile-review.json',import.meta.url),'utf8'));
test('a rejected domain relationship cannot re-enter through another page on the same reviewed source version',()=>{const s=new Store(':memory:'),service=new ResearchService(s),j=s.createJob('967032271','domain-relationship','eve');try{service.save(j,'https://data.brreg.no/enhetsregisteret/api/enheter/967032271',JSON.stringify(f.identity),'public_registry');s.saveSnapshot(j.id,f.source);const host=new URL(f.source.source_url).hostname.replace(/^www\./,'');s.saveExtractionCache('assisted-source-bound-publication-decisions/v1:'+j.id,[{field:'official_website',value_sha256:hash('https://'+host+'/'),source_sha256:f.source.content_sha256,action:'reject',reason:'Current legal ownership of the reviewed domain is unresolved.',qualifiers:{rejected_domain_relationship_host:host}}]);const result=service.verify(j.id,{...f.proposal,field:'official_website',value:'https://'+host+'/faq'});assert.equal(result.accepted,false);assert.match(result.reason,/Source-bound assistant review/);const changed={...f.source,text:f.source.text+'\nNew source observation'};changed.content_sha256=hash(changed.text);changed.id=hash(changed.text);s.saveSnapshot(j.id,changed);assert.doesNotMatch(service.verify(j.id,{...f.proposal,snapshot_id:changed.id,field:'official_website',value:'https://'+host+'/faq'}).reason,/Source-bound assistant review/);}finally{s.close();}});
test('actual Sweco withdrawal applies before and after canonical account URL normalization',()=>{
 const s=new Store(':memory:'),service=new ResearchService(s),j=s.createJob('967032271','normalized-withdrawal','eve');
 try{service.save(j,'https://data.brreg.no/enhetsregisteret/api/enheter/967032271',JSON.stringify(f.identity),'public_registry');s.saveSnapshot(j.id,f.source);const raw={...f.proposal,value:f.published_value+'/'};const first=service.verify(j.id,raw);assert.equal(first.accepted,true);assert.equal(first.claim?.value,f.published_value);
  s.saveExtractionCache('assisted-source-bound-publication-decisions/v1:'+j.id,[{field:'company_owned_profiles',value_sha256:hash(f.published_value),source_sha256:f.source.content_sha256,action:'reject',reason:'Source-context review found global account allocation unresolved for this exact Norwegian company.'}]);
  assert.equal(service.verify(j.id,raw).accepted,false);assert.equal(s.proposals(j.id).length,0,'The raw spelling cannot survive as a deterministic re-entry route');
  assert.equal(service.verify(j.id,{...f.proposal,value:f.published_value}).accepted,false);
 }finally{s.close();}
});
test('source-bound qualifications also apply to the normalized published value',()=>{
 const s=new Store(':memory:'),service=new ResearchService(s),j=s.createJob('967032271','normalized-qualification','eve');
 try{service.save(j,'https://data.brreg.no/enhetsregisteret/api/enheter/967032271',JSON.stringify(f.identity),'public_registry');s.saveSnapshot(j.id,f.source);
  s.saveExtractionCache('assisted-source-bound-publication-decisions/v1:'+j.id,[{field:'company_owned_profiles',value_sha256:hash(f.published_value),source_sha256:f.source.content_sha256,action:'qualify',reason:'A source-bound test qualification on the actual canonical URL.',qualifiers:{administrative_control_established:false}}]);
  assert.equal(service.verify(j.id,f.proposal).claim?.qualifiers?.administrative_control_established,false);
 }finally{s.close();}
});
