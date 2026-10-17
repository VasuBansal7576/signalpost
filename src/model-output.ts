import {z} from 'zod';
import {proposalSchema,type Proposal} from './domain.ts';

// One malformed proposal must not discard other independently verifiable claims.
// The outer envelope and the per-claim evidence requirements remain strict.
export function parseModelOutput(input:unknown,rejected:(index:number,reason:string)=>void=()=>{}):{claims:Proposal[]}{
 const entries=z.object({claims:z.array(z.unknown()).max(40)}).parse(input).claims;
 const claims:Proposal[]=[];
 entries.forEach((entry,index)=>{
  const parsed=proposalSchema.safeParse(entry);
  if(parsed.success)claims.push(parsed.data);
  else rejected(index,parsed.error.issues.map(issue=>issue.path.join('.')+': '+issue.message).join('; '));
 });
 return {claims};
}
