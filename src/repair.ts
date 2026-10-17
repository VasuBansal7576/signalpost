import type {Proposal,Snapshot} from './domain.ts';
// A rewrite cannot repair wrong-company attribution. Only spend a repair turn
// on text alignment, using a small window around the original evidence.
export function repairContext(proposal:Proposal,source:Snapshot,reason:string):string|null{
 if(!/^(Quote is absent|First version accepts extractive|Effective date must)/.test(reason))return null;
 const quoted=source.text.indexOf(proposal.quote),value=source.text.indexOf(proposal.value),position=quoted>=0?quoted:Math.max(0,value);
 return source.text.slice(Math.max(0,position-800),position+6200);
}
