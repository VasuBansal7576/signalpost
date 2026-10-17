import type{Snapshot}from'./domain.ts';
const rawMethods=new Set(['public-html-links/v1','public-rendered-html/v1']);
export function readableVersionKey(s:Snapshot){
 if(s.source_class==='public_registry'||rawMethods.has(s.extraction_method??'')||/^nav-|^public-reputation-/.test(s.extraction_method??''))return null;
 try{const u=new URL(s.source_url);u.hostname=u.hostname.replace(/^www\./,'');u.hash='';u.pathname=u.pathname.replace(/\/$/,'')||'/';const method=s.extraction_method??'unclassified-readable',family=/^public-rendered-text/.test(method)?'rendered-html':/^public-html-text/.test(method)?'static-html':/^exa-/.test(method)?'exa-readable':method;return u.toString()+'|extractor='+family+(s.document?'#page='+s.document.page_number:'');}catch{return null;}
}
/** A newer successful readable version supersedes an older body; length is only a same-time tie break. */
export function currentSourceVersions(sources:Snapshot[]){
 const latest=new Map<string,Snapshot>();
 for(const s of sources){const key=readableVersionKey(s);if(key===null)continue;const previous=latest.get(key);if(!previous||s.retrieved_at>previous.retrieved_at||s.retrieved_at===previous.retrieved_at&&s.text.length>previous.text.length)latest.set(key,s);}
 return sources.filter(s=>{const key=readableVersionKey(s);return key===null||latest.get(key)?.id===s.id;});
}
/** Transfer an unchanged quotation only to a successfully retained newer body of the same page. */
export function rebindProposalVersion<T extends{snapshot_id:string;quote:string}>(proposal:T,sources:Snapshot[]):T|undefined{
 const old=sources.find(s=>s.id===proposal.snapshot_id);if(!old)return;
 const key=readableVersionKey(old);if(key===null)return proposal;
 const current=currentSourceVersions(sources).find(s=>readableVersionKey(s)===key);if(!current)return;
 if(current.id===old.id)return proposal;
 return current.text.includes(proposal.quote)?{...proposal,snapshot_id:current.id}:undefined;
}
