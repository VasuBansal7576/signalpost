import{exactWhitespaceSpan}from'./exact-span.ts';
import{z}from'zod';import{researchFields,dateTypeSchema,type Proposal}from'./domain.ts';
const url=z.string().max(512).regex(/^https:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/);
/** Quotes are transmitted once. Short source refs resolve only against this packet. */
export function extractionWireContract(outputBytes=14000){
 if(!Number.isSafeInteger(outputBytes)||outputBytes<5000)throw Error('Extraction output budget must be at least5000 bytes');
 const quoteChars=500,perClaimBound=quoteChars*6+512+512,maxClaims=Math.min(6,Math.floor((outputBytes-512)/perClaimBound));
 const claim=z.object({field:z.enum(researchFields),source_id:z.string().regex(/^s\d{1,4}$/).max(5),quote:z.string().min(10).max(quoteChars),value_url:url.nullable(),effective_date:z.string().regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/).max(10).nullable(),historical_hiring:z.boolean().nullable(),date_type:dateTypeSchema.nullable()});
 return{claimSchema:claim,schema:z.object({claims:z.array(claim).max(maxClaims)}),maxClaims,quoteChars,canonicalByteBound:512+maxClaims*perClaimBound};
}
export function resolveExtractionWire(input:unknown,sources:readonly{id:string;url:string;text:string}[],outputBytes=14000,onRejected:(index:number,reason:string)=>void=()=>{}):Proposal[]{
 const contract=extractionWireContract(outputBytes),result=z.object({claims:z.array(z.unknown()).max(contract.maxClaims)}).parse(input);
 return result.claims.flatMap((entry,index)=>{try{let{source_id,value_url,quote,field,historical_hiring,date_type,effective_date}=contract.claimSchema.parse(entry);
  const source=sources.find(s=>s.id===source_id);if(!source)throw Error('Extraction wire references an absent packet source');
  const exact=exactWhitespaceSpan(source.text,quote);if(!exact)throw Error('Extraction wire quote is absent from its packet passage');quote=exact;
  if(!['company_owned_profiles','official_website'].includes(field)&&value_url!==null)throw Error('Only website/profile claims may supply a URL');
  if(value_url!==null&&value_url!==source.url&&!quote.includes(value_url))throw Error('Declared destination URL must occur in its exact quote');
  if(field==='company_owned_profiles'&&(!value_url||!quote.includes(value_url)))throw Error('Profile URL must occur in its exact quote');
  return[{field,value:field==='official_website'?(value_url??source.url):field==='company_owned_profiles'?value_url!:quote,quote,snapshot_id:source_id,effective_date,...(historical_hiring===true?{historical_hiring:true as const}:{}),...(date_type?{date_type}:{})}];
 }catch(error){onRejected(index,error instanceof Error?error.message:'Invalid extraction reference');return[];}});
}
