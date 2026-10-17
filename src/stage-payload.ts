import{canonical,hash}from'./domain.ts';import type{Store}from'./store.ts';
export type StagePayload<T>={inline?:T;key?:string;sha256?:string;bytes:number};
/** Oversized queue payloads spill into private SQLite rather than breaking the byte bound. */
export class StagePayloadStore<T>{
 constructor(private store:Store,private limit:number){}
 pack(value:T):StagePayload<T>{const bytes=Buffer.byteLength(JSON.stringify({inline:value}))+32;if(bytes<=this.limit)return{inline:value,bytes};const body=canonical(value),sha256=hash(body),key='pipeline-stage-payload/v1:'+sha256;this.store.saveExtractionCache(key,value);return{key,sha256,bytes:512};}
 unpack(ref:StagePayload<T>):T{if(ref.inline!==undefined)return ref.inline;if(!ref.key||!ref.sha256)throw Error('Invalid spilled stage reference');const value=this.store.extractionCache(ref.key);if(value===undefined||hash(canonical(value))!==ref.sha256)throw Error('Spilled stage payload hash mismatch');return value as T;}
}
