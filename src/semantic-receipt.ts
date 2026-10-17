import {canonical,hash,type Proposal} from './domain.ts';
import type {Store} from './store.ts';
import type {semanticReviewPacket,SemanticDecision} from './semantic-verifier.ts';
type Packet=ReturnType<typeof semanticReviewPacket>;
type Receipt={version:1;job_id:string;attempt_key:string;packet_sha256:string;raw_sha256:string;raw_text:string;complete:boolean;source_refs:{alias:string;url:string;sha256:string}[]};

/** Private audit data only: never returned in public company evidence or summaries. */
export function captureSemanticText(store:Store,jobId:string,attemptKey:string,packet:Packet,text:string,complete:boolean){
 if(Buffer.byteLength(text)>100000)throw Error('Semantic receipt exceeds the bounded private output limit');
 const receipt:Receipt={version:1,job_id:jobId,attempt_key:attemptKey,packet_sha256:hash(canonical(packet)),raw_sha256:hash(text),raw_text:text,complete,source_refs:packet.sources.map(s=>({alias:s.id,url:s.url,sha256:hash(s.text)}))};
 const key='semantic-review-output/v1:'+jobId+':'+hash(canonical(receipt));
 const prior=store.extractionCache(key);if(prior&&canonical(prior)!==canonical(receipt))throw Error('Semantic receipt collision');
 if(!prior)store.saveExtractionCache(key,receipt);
 return key;
}

export function recoverSemanticText(store:Store,jobId:string,attemptKey:string,packet:Packet,key:string,parse:(raw:unknown)=>SemanticDecision[],validate:(p:Packet,j:SemanticDecision[])=>SemanticDecision[]){
 const r=store.extractionCache(key) as Receipt|undefined;
 if(!r||r.version!==1||r.job_id!==jobId||r.attempt_key!==attemptKey||r.packet_sha256!==hash(canonical(packet))||r.raw_sha256!==hash(r.raw_text)||!r.complete)throw Error('No complete matching semantic receipt; candidates remain unpublished');
 return validate(packet,parse(JSON.parse(r.raw_text)));
}

/** Keep excluded proposals inspectable without treating preservation as publication. */
export function quarantineSemanticCandidates(store:Store,jobId:string,candidates:Proposal[]){
 if(!candidates.length)return;
 const record={version:1,job_id:jobId,publication_state:'not_published',reason:'Retained candidate is not a semantic acceptance or a current company fact',candidates:candidates.map(proposal=>({proposal,source_sha256:store.source(jobId,proposal.snapshot_id).content_sha256}))};
 const key='semantic-unpublished-candidates/v1:'+jobId+':'+hash(canonical(record));
 if(!store.extractionCache(key))store.saveExtractionCache(key,record);
 return key;
}
