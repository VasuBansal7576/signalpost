import {test} from 'node:test';
import assert from 'node:assert/strict';
import {repairContext} from '../src/repair.ts';
import {snapshot,type Proposal} from '../src/domain.ts';
test('repair skips wrong-company proposals and bounds context around the relevant preserved quote',()=>{
 const quote='Acme AS is hiring an engineer. Apply by 2026-12-20.';
 const source=snapshot({source_url:'https://acme.no/jobs',source_class:'external',organisation_number:'999111222',run_id:'repair',text:'x'.repeat(100000)+quote+'y'.repeat(100000)});
 const proposal:Proposal={field:'hiring',value:'We are hiring!',quote,snapshot_id:source.id,effective_date:null};
 assert.equal(repairContext(proposal,source,'Page does not name the exact legal entity'),null);
 assert.equal(repairContext(proposal,source,'Directory, recruitment and social hosts are not company-owned website anchors'),null);
 const context=repairContext(proposal,source,'First version accepts extractive values present verbatim in the quote');
 assert.ok(context);assert.ok(context.includes(quote));assert.ok(context.length<=7000);assert.ok(context.length<source.text.length/20);
});
