import type{Snapshot}from'./domain.ts';
export function freezeEvidence<T>(value:T):T{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freezeEvidence(child);Object.freeze(value);}return value;}
/** Small LRU of immutable views; SQLite-triggered generations invalidate every direct update. */
export class SealedEvidenceViews{
 private entries=new Map<string,{generation:number;sources:Snapshot[];bytes:number}>();private bytes=0;
 readonly metrics={hits:0,misses:0,parsed_bytes:0};
 constructor(private byteLimit=32*1024*1024,private entryLimit=16){}
 get(job:string,generation:number,load:()=>{sources:Snapshot[];bytes:number}){const previous=this.entries.get(job);if(previous?.generation===generation){this.entries.delete(job);this.entries.set(job,previous);this.metrics.hits++;return previous.sources;}if(previous){this.bytes-=previous.bytes;this.entries.delete(job);}this.metrics.misses++;const view=load();this.metrics.parsed_bytes+=view.bytes;freezeEvidence(view.sources);if(view.bytes<=this.byteLimit){while(this.entries.size>=this.entryLimit||this.bytes+view.bytes>this.byteLimit){const first=this.entries.entries().next().value;if(!first)break;this.entries.delete(first[0]);this.bytes-=first[1].bytes;}this.entries.set(job,{generation,...view});this.bytes+=view.bytes;}return view.sources;}
 clear(){this.entries.clear();this.bytes=0;}
}
