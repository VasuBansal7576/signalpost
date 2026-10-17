import{test}from'node:test';import assert from'node:assert/strict';
import{hasPopulatedField,hiringObservations}from'../src/coverage.ts';import type{Envelope}from'../src/domain.ts';
test('a completed NAV zero is a source check, not populated hiring information',()=>{
 const p:Envelope={organisation_number:'999111222',run:{run_id:'x',mode:'eve',started_at:'',completed_at:'',terminal_status:'partial'},claims:[{field:'hiring',value:{active_ads_attributed:0},availability:'available',confidence:null,evidence_ids:['e'],qualifiers:{attribution:'nav-complete-index-exact-org'}}],evidence:[],changes:[],errors:[],operations:{requests:0,runtime_ms:0,third_party_cost_usd:0,known_exa_cost_usd:0,model_cost_usd:0,cost_complete:true}};
 assert.equal(hasPopulatedField(p,'hiring'),false);assert.equal(hiringObservations([p]).companies_with_verified_nav_query,1);assert.equal(hiringObservations([p]).companies_with_nav_ads,0);p.claims.push({field:'hiring',value:'We accept open applications.',availability:'available',confidence:null,evidence_ids:['x']});assert.equal(hasPopulatedField(p,'hiring'),true);assert.equal(hiringObservations([p]).companies_with_other_recruitment_information,1);
});

test('historical available-but-empty registry collections are excluded from populated coverage',()=>{
 const p:Envelope={organisation_number:'999111222',run:{run_id:'historical',mode:'eve',started_at:'',completed_at:'',terminal_status:'partial'},evidence:[],changes:[],errors:[],operations:{requests:0,runtime_ms:0,third_party_cost_usd:0,known_exa_cost_usd:0,model_cost_usd:0,cost_complete:true},claims:[{confidence:null,evidence_ids:[],field:'workplaces',availability:'available',value:{locations:[],total_reported:0}},{confidence:null,evidence_ids:[],field:'leadership',availability:'available',value:{roles:[]}},{confidence:null,evidence_ids:[],field:'financial_history',availability:'available',value:{years:[],documents:[]}}]};
 for(const field of ['workplaces','leadership','financial_history'])assert.equal(hasPopulatedField(p,field),false,field);
});
