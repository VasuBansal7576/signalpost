import {createHash} from 'node:crypto';
import {z} from 'zod';

export type ReputationSnapshot={id:string;source_url:string;text:string;content_sha256:string;retrieved_at:string};
export type ReputationTarget={organisation_number:string;legal_name:string};
/** A reviewed, preserved policy decision, never inferred from a 200 response or robots alone. */
export type ReputationPolicy={decision:'allowed'|'blocked'|'unknown';source_origin:string;terms_url:string;terms_sha256:string;robots_sha256:string;reviewed_at:string;reason:string};
export type ReputationProof={snapshot_id:string;content_sha256:string;path:string;quote:string;start:number;end:number};
export type ReputationSubject={organisation_number:string;legal_name:string;merchant_name:string;merchant_id:string;scope:'merchant_outlet';publisher:'Foodora';source_url:string;observed_at:string};
export type ReputationObservation=ReputationSubject&({kind:'aggregate_rating';rating_value:number;scale_min:number;scale_max:number;count:number;count_type:'ratingCount';rating_date:null}|{kind:'individual_review';rating_value:number;scale_min:number;scale_max:number;review_date:string;review_text:string;sample_size:1});
export type PublicReputationResult={status:'supported';observations:ReputationObservation[];proofs:ReputationProof[];policy:ReputationPolicy;policy_receipt_key:string}|{status:'blocked'|'unavailable'|'ambiguous';reason:string;observations:[]};
export const reputationPolicyKey=(policy:ReputationPolicy)=>createHash('sha256').update(JSON.stringify([policy.source_origin,policy.terms_url,policy.terms_sha256,policy.robots_sha256,policy.decision])).digest('hex');
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
const normal=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('nb').replace(/[^\p{L}\p{N}]/gu,'');
const rich=z.object({textType:z.string(),value:z.string()});
const stateSchema=z.object({vendor:z.object({data:z.object({code:z.string(),name:z.string(),url_key:z.string(),rating:z.number(),review_number:z.number().int().nonnegative()})}),vendorInfoComponents:z.array(z.object({__typename:z.string(),title:z.array(rich).nullish(),bodyParagraphs:z.array(z.array(rich)).nullish()}))});
const rating=z.object({ratingValue:z.number().finite(),bestRating:z.number().finite(),worstRating:z.number().finite()});
const restaurantSchema=z.object({'@type':z.literal('Restaurant'),'@id':z.string(),name:z.string(),url:z.string(),aggregateRating:rating.extend({ratingCount:z.number().int().positive()}),reviews:z.array(z.object({'@type':z.literal('Review'),datePublished:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),reviewBody:z.string().min(1).max(4000),reviewRating:rating})).max(100).optional()});
/** Parse data, never execute JavaScript. Only undefined tokens outside strings are normalized. */
export function parseLiteralState(value:string):unknown{
 if(value.length>256_000)throw Error('Merchant state exceeds bound');let output='',quoted=false,escaped=false;
 for(let i=0;i<value.length;i++){const c=value[i]!;if(quoted){output+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;output+=c;continue;}if(value.slice(i,i+9)==='undefined'&&!/[\w$]/.test(value[i-1]??'')&&!/[\w$]/.test(value[i+9]??'')){output+='null';i+=8;}else output+=c;}
 return JSON.parse(output);
}
function scriptData(text:string){const scripts=[...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];return{states:scripts.filter(m=>/^\s*window\.__PRELOADED_STATE__\s*=/.test(m[2]!)),restaurants:scripts.filter(m=>/data-testid\s*=\s*["']restaurant-seo-schema["']/i.test(m[1]!)&&/type\s*=\s*["']application\/ld\+json["']/i.test(m[1]!))};}
function proof(s:ReputationSnapshot,path:string,quote:string):ReputationProof{const start=s.text.indexOf(quote);if(start<0)throw Error('Literal proof not found');return{snapshot_id:s.id,content_sha256:s.content_sha256,path,quote,start,end:start+quote.length};}
function validRating(value:{ratingValue:number;bestRating:number;worstRating:number}){return value.worstRating>=0&&value.bestRating>value.worstRating&&value.ratingValue>=value.worstRating&&value.ratingValue<=value.bestRating;}

/** Foodora merchant adapter. No fetch, credentials, policy inference, sentiment inference or whole-company extrapolation. */
export function parsePublicReputation(raw:ReputationSnapshot,readable:ReputationSnapshot,target:ReputationTarget,policy?:ReputationPolicy):PublicReputationResult{
 const fail=(status:'blocked'|'unavailable'|'ambiguous',reason:string):PublicReputationResult=>({status,reason,observations:[]});
 let url:URL;try{url=new URL(raw.source_url);}catch{return fail('unavailable','Invalid source URL');}
 if(!policy||policy.decision!=='allowed'||policy.source_origin!==url.origin||!/^https:\/\//.test(policy.terms_url)||![policy.terms_sha256,policy.robots_sha256].every(v=>/^[a-f0-9]{64}$/.test(v))||!Number.isFinite(Date.parse(policy.reviewed_at))||!policy.reason.trim())return fail('blocked','Both terms and robots require an explicit preserved allowed-policy decision');
 if(url.protocol!=='https:'||url.hostname!=='www.foodora.no'||url.search||url.hash)return fail('unavailable','Unsupported public reputation source');
 const path=/^\/restaurant\/([a-z0-9]+)\/([a-z0-9-]+)\/?$/.exec(url.pathname);if(!path)return fail('unavailable','Expected a single merchant outlet URL');
 if(raw.text.length>2_000_000||readable.text.length>2_000_000||digest(raw.text)!==raw.content_sha256||digest(readable.text)!==readable.content_sha256||raw.source_url!==readable.source_url||!Number.isFinite(Date.parse(raw.retrieved_at)))return fail('ambiguous','Preserved raw/readable provenance mismatch');
 if(!/^\d{9}$/.test(target.organisation_number)||!target.legal_name.trim())return fail('ambiguous','Missing exact registry identity');
 try{
  const scripts=scriptData(raw.text);if(scripts.states.length!==1||scripts.restaurants.length!==1)return fail('ambiguous','Expected one merchant state and one Restaurant record');
  const stateText=scripts.states[0]![2]!.replace(/^\s*window\.__PRELOADED_STATE__\s*=\s*/,'').replace(/;\s*$/,'');
  const state=stateSchema.parse(parseLiteralState(stateText)),schema=restaurantSchema.parse(JSON.parse(scripts.restaurants[0]![2]!)),vendor=state.vendor.data;
  const sections=state.vendorInfoComponents.filter(c=>c.__typename==='VendorInfoSectionComponent'&&c.title?.some(t=>t.value==='NEXTGEN_VENDOR_IMPRINT_TITLE'));
  if(sections.length!==1)return fail('ambiguous','Missing unambiguous merchant legal imprint');
  const paragraphs=sections[0]!.bodyParagraphs;if(!paragraphs||paragraphs.length!==3||paragraphs.some(p=>p.length!==1||p[0]!.textType!=='RAW_TEXT'))return fail('ambiguous','Unrecognized merchant legal imprint shape');
  const [merchant,legalName,legalOrg]=paragraphs.map(p=>p[0]!.value);
  if(legalOrg!==target.organisation_number+'MVA'||normal(legalName!)!==normal(target.legal_name)||normal(merchant!)!==normal(vendor.name)||normal(schema.name)!==normal(vendor.name)||vendor.code!==path[1]||vendor.url_key!==path[2]||schema['@id']!==raw.source_url||schema.url!==raw.source_url)return fail('ambiguous','Merchant, exact legal identity, URL and rating subject do not all agree');
  const aggregate=schema.aggregateRating;if(!validRating(aggregate)||vendor.rating!==aggregate.ratingValue||vendor.review_number!==aggregate.ratingCount)return fail('ambiguous','Merchant aggregate and Restaurant rating disagree');
  if(!readable.text.includes(vendor.name)||!readable.text.includes(String(aggregate.ratingValue)))return fail('ambiguous','Readable page does not corroborate the merchant and rating');
  const subject:ReputationSubject={organisation_number:target.organisation_number,legal_name:target.legal_name,merchant_name:vendor.name,merchant_id:vendor.code,scope:'merchant_outlet',publisher:'Foodora',source_url:raw.source_url,observed_at:raw.retrieved_at};
  const observations:ReputationObservation[]=[{...subject,kind:'aggregate_rating',rating_value:aggregate.ratingValue,scale_min:aggregate.worstRating,scale_max:aggregate.bestRating,count:aggregate.ratingCount,count_type:'ratingCount',rating_date:null}];
  const proofs=[proof(raw,'window.__PRELOADED_STATE__ (merchant data and legal imprint)',stateText),proof(raw,'Restaurant',scripts.restaurants[0]![2]!),proof(readable,'merchant',vendor.name)];
  for(const review of schema.reviews??[]){if(!validRating(review.reviewRating)||Date.parse(review.datePublished+'T00:00:00Z')>Date.parse(raw.retrieved_at)||new Date(review.datePublished+'T00:00:00Z').toISOString().slice(0,10)!==review.datePublished)return fail('ambiguous','Invalid, future or out-of-scale individual review');if(!readable.text.includes(review.reviewBody.trim()))return fail('ambiguous','Individual review is absent from readable source');observations.push({...subject,kind:'individual_review',rating_value:review.reviewRating.ratingValue,scale_min:review.reviewRating.worstRating,scale_max:review.reviewRating.bestRating,review_date:review.datePublished,review_text:review.reviewBody.trim(),sample_size:1});}
  return{status:'supported',observations,proofs,policy,policy_receipt_key:reputationPolicyKey(policy)};
 }catch{return fail('ambiguous','Structured merchant data unsupported, malformed or not literally anchored');}
}
