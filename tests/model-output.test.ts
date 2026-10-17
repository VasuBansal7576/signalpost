import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseModelOutput} from '../src/model-output.ts';

test('an eight-character social label cannot discard a valid website and description',()=>{
 const description={field:'business_description',value:'A preserved business description.',quote:'A preserved business description.',snapshot_id:'source-a',effective_date:null};
 const website={field:'official_website',value:'https://example.test/',quote:'Example Company AS 999 111 222',snapshot_id:'source-b',effective_date:null};
 const rejected:{index:number;reason:string}[]=[];
 const result=parseModelOutput({claims:[description,website,{field:'company_owned_profiles',value:'https://www.facebook.com/example',quote:'Facebook',snapshot_id:'source-c',effective_date:null}]},(index,reason)=>rejected.push({index,reason}));
 assert.deepEqual(result.claims,[description,website]);assert.equal(rejected.length,1);assert.equal(rejected[0]?.index,2);assert.match(rejected[0]?.reason??'',/quote.*10/);
});
test('malformed or oversized envelopes remain failures instead of empty successful results',()=>{
 assert.throws(()=>parseModelOutput({claims:'wrong'}));
 assert.throws(()=>parseModelOutput({claims:Array(41).fill({})}));
});
