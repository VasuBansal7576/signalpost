import {z} from 'zod';
import {setTimeout as delay} from 'node:timers/promises';
import {fold} from './attribution.ts';
import {hash,canonical} from './domain.ts';

const base='https://pam-stilling-feed.nav.no';
const headerSchema=z.object({url:z.string(),date_modified:z.string(),_feed_entry:z.object({uuid:z.string(),status:z.string(),businessName:z.string(),title:z.string(),municipal:z.string().nullish()}).passthrough()}).passthrough();
const pageSchema=z.object({next_url:z.string().nullable(),items:z.array(headerSchema)}).passthrough();
const contentSchema=z.object({uuid:z.string().uuid(),title:z.string().min(1).max(3000),expires:z.string(),published:z.string(),employer:z.object({name:z.string(),orgnr:z.string().nullish()}).passthrough()}).passthrough();
export const navAdSchema=z.union([z.object({status:z.string(),ad_content:contentSchema}).passthrough().transform(value=>({status:value.status,json:value.ad_content})),z.object({status:z.string(),json:contentSchema}).passthrough()]);
export const navRecordSchema=z.object({uuid:z.string(),title:z.string(),status:z.string(),employer_org:z.string().nullable(),employer_name:z.string(),published:z.string(),expires:z.string(),source_url:z.string(),retrieved_at:z.string(),content_sha256:z.string()});
export const navCatalogueSchema=z.object({version:z.literal(1),complete:z.boolean(),collection_started_at:z.string(),completed_at:z.string(),records:z.array(navRecordSchema),failures:z.array(z.object({url:z.string(),error:z.string()})),manifest:z.unknown()});
export type NavCatalogue=z.infer<typeof navCatalogueSchema>;
export function navQuery(catalogue:NavCatalogue,org:string,subunits:string[]){
 if(!catalogue.complete||catalogue.failures.length)throw new Error('Incomplete NAV catalogue cannot establish a scoped count');
 const eligible=(r:z.infer<typeof navRecordSchema>)=>r.status==='ACTIVE'&&Number.isFinite(Date.parse(r.published))&&Date.parse(r.published)<=Date.parse(catalogue.completed_at)&&Number.isFinite(Date.parse(r.expires))&&Date.parse(r.expires)>Date.parse(catalogue.completed_at);
 const matched=catalogue.records.filter(r=>eligible(r)&&r.employer_org!==null&&(r.employer_org===org||subunits.includes(r.employer_org)));
 return {source:'NAV job vacancy feed',organisation_number:org,subunit_count:subunits.length,subunit_organisation_numbers_sha256:hash(canonical([...subunits].sort())),observed_from:catalogue.collection_started_at,observed_at:catalogue.completed_at,active_ads_attributed:matched.length,advertisements_complete:true,advertisements:matched.map(r=>({title:r.title,employer:r.employer_name,employer_org:r.employer_org,published_at:r.published,expires_at:r.expires,url:'https://arbeidsplassen.nav.no/stillinger/stilling/'+r.uuid,source_url:r.source_url,content_sha256:r.content_sha256})),unresolved_employer_records:catalogue.records.filter(r=>eligible(r)&&r.employer_org===null).length,scope:'NAV feed, exact employer/subunit organisation numbers; Finn.no ads excluded',company_wide_absence_established:false};
}
export function navEmployerOrg(raw:unknown,org:string,subunits:string[],at:string){
 const parsed=navAdSchema.safeParse(raw);if(!parsed.success)return;
 const ad=parsed.data,employer=String(ad.json.employer.orgnr??'').replace(/\s/g,'');
 if(!/^[0-9]{9}$/.test(employer)||(employer!==org&&!subunits.includes(employer)))return;
 if(ad.status!=='ACTIVE'||!Number.isFinite(Date.parse(at))||!Number.isFinite(Date.parse(ad.json.expires))||!Number.isFinite(Date.parse(ad.json.published))||Date.parse(ad.json.expires)<=Date.parse(at)||Date.parse(ad.json.published)>Date.parse(at))return;
 return {ad,employer,binding:employer===org?'organisation_number':'registered_subunit_parent'};
}
const generic=new Set(['holding','invest','eiendom','selskap','as','asa','ans','da','norge','borettslag','sameiet','eierseksjonssameie','butikkdrift','drift','company']);
export function navCandidate(header:z.infer<typeof headerSchema>,name:string,aliases:string[]=[]){
 const tokens=[name,...aliases].flatMap(n=>fold(n).split(' ')).filter(t=>t.length>=3&&!generic.has(t));
 const hay=' '+fold(header._feed_entry.businessName+' '+header._feed_entry.title)+' ';
 return tokens.some(token=>hay.includes(' '+token+' '));
}
export class NavFeed {
 headers:z.infer<typeof headerSchema>[]=[];
 manifest={source:'https://navikt.github.io/pam-stilling-feed/',started_at:new Date().toISOString(),completed_at:'',since:'',pages:0,requests:0,header_events:0,latest_headers:0,active_headers:0,complete:false,pages_checked:[] as {url:string;sha256:string;items:number}[]};
 catalogue?:NavCatalogue;
 private slot=0;
 private token='';
 constructor(readonly request:typeof fetch=fetch,readonly signal=AbortSignal.timeout(1800000),readonly onProgress:(message:string)=>void=()=>{},readonly capture:(url:string,text:string)=>Promise<void>=async()=>{}){}
 async get(url:string,first=false){
  const parsed=new URL(url,base);if(parsed.origin!==base||!parsed.pathname.startsWith('/api/'))throw new Error('Unexpected NAV feed URL');
  for(let attempt=0;;attempt++){
   const wait=Math.max(0,this.slot-Date.now());this.slot=Math.max(this.slot,Date.now())+50;if(wait)await delay(wait,undefined,{signal:this.signal});
   this.manifest.requests++;
   const response=await this.request(parsed,{headers:{accept:'application/json','user-agent':'SignalpostResearch/0.3',...(this.token?{authorization:'Bearer '+this.token}:{}),...(first?{'if-modified-since':this.manifest.since}:{})},signal:AbortSignal.any([this.signal,AbortSignal.timeout(30000)]),redirect:'error'});
   if([429,502,503,504].includes(response.status)&&attempt<2){const seconds=Number(response.headers.get('retry-after')??(response.status===429?30:2));await response.body?.cancel();this.onProgress('NAV source busy: backing off before retry');this.slot=Math.max(this.slot,Date.now()+Math.min(60000,Math.max(1000,Number.isFinite(seconds)?seconds*1000:30000)));continue;}
   if(!response.ok)throw new Error(`NAV feed HTTP ${response.status}`);
   const text=await response.text();if(text.length>16000000)throw new Error('NAV response exceeds 16 MB');if(!parsed.pathname.endsWith('/publicToken'))await this.capture(parsed.toString(),text);return {url:parsed.toString(),text};
  }
 }
 async authenticate(){
  if(process.env.SIGNALPOST_KEYLESS==='1')throw new Error('Keyless mode forbids external bearer-token authentication');
  const token=await this.get(base+'/api/publicToken'),matches=token.text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g);if(matches?.length!==1)throw new Error('Published NAV experiment token was not recognized');this.token=matches[0]!;
 }
 async load(){
  await this.authenticate();
  this.manifest.since='first available event; no date filter';
  let url=base+'/api/v1/feed?pageSize=10000';const latest=new Map<string,z.infer<typeof headerSchema>>(),seen=new Set<string>();
  while(url){if(seen.has(url)||this.manifest.pages>=1500)throw new Error('NAV feed pagination incomplete');seen.add(url);
   const raw=await this.get(url),page=pageSchema.parse(JSON.parse(raw.text));
   this.manifest.pages++;this.manifest.header_events+=page.items.length;this.manifest.pages_checked.push({url:raw.url,sha256:hash(raw.text),items:page.items.length});
   // The feed is ordered by change time. Retain active heads only; removing
   // inactive heads avoids retaining years of retired advertisements in RAM.
   for(const item of page.items){const old=latest.get(item._feed_entry.uuid);if(!old||Date.parse(item.date_modified)>=Date.parse(old.date_modified)){if(item._feed_entry.status==='ACTIVE')latest.set(item._feed_entry.uuid,item);else latest.delete(item._feed_entry.uuid);}}
   this.onProgress(`NAV feed page ${this.manifest.pages}: ${this.manifest.header_events} events`);
   url=page.next_url?new URL(page.next_url,base).toString():'';if(url){const next=new URL(url);next.searchParams.set('pageSize','10000');url=next.toString();await delay(200,undefined,{signal:this.signal});}
  }
  this.headers=[...latest.values()].filter(h=>h._feed_entry.status==='ACTIVE');this.manifest.latest_headers=latest.size;this.manifest.active_headers=this.headers.length;this.manifest.complete=true;this.manifest.completed_at=new Date().toISOString();return this;
 }
 candidates(name:string,aliases:string[]=[]){return this.headers.filter(header=>navCandidate(header,name,aliases));}
 async entry(url:string){const raw=await this.get(url),data:unknown=JSON.parse(raw.text),withdrawn=z.object({status:z.enum(['INACTIVE','DELETED']),uuid:z.string().uuid()}).safeParse(data);if(withdrawn.success){if(new URL(raw.url).pathname.split('/').at(-1)!==withdrawn.data.uuid)throw new Error('NAV withdrawal UUID mismatch');return {...raw,body:null,retrieved_at:new Date().toISOString()};}return {...raw,body:navAdSchema.parse(data),retrieved_at:new Date().toISOString()};}
 async hydrate(workers=8){
  if(!this.manifest.complete)throw new Error('NAV header sweep incomplete');let index=0,done=0;const records:NavCatalogue['records']=[],failures:NavCatalogue['failures']=[];
  await Promise.all(Array.from({length:workers},async()=>{while(index<this.headers.length){const header=this.headers[index++]!;
   try{const entry=await this.entry(header.url);if(!entry.body){done++;continue;}const a=entry.body.json,org=String(a.employer.orgnr??'').replace(/\s/g,'');records.push({uuid:a.uuid,title:a.title,status:entry.body.status,employer_org:/^[0-9]{9}$/.test(org)?org:null,employer_name:a.employer.name,published:a.published,expires:a.expires,source_url:entry.url,retrieved_at:entry.retrieved_at,content_sha256:hash(entry.text)});}catch(error){failures.push({url:header.url,error:error instanceof Error?error.message:'NAV ad read failed'});}
   done++;if(done%250===0||done===this.headers.length)this.onProgress(`NAV employer index ${done}/${this.headers.length}; ${failures.length} failures`);
  }}));
  records.sort((a,b)=>a.uuid.localeCompare(b.uuid));this.catalogue={version:1,complete:failures.length===0,collection_started_at:this.manifest.started_at,completed_at:new Date().toISOString(),records,failures,manifest:{...this.manifest,requests:this.manifest.requests}};return this.catalogue;
 }
 async catchUp(catalogue:NavCatalogue){
  if(!catalogue.complete||catalogue.failures.length)throw new Error('Repair incomplete NAV hydration before refreshing');
  if(!this.token)await this.authenticate();
  const manifest=z.object({requests:z.number(),pages_checked:z.array(z.object({url:z.string(),sha256:z.string(),items:z.number()}))}).passthrough().parse(catalogue.manifest);
  let url=manifest.pages_checked.at(-1)?.url;if(!url)throw new Error('NAV cursor missing');
  const records=new Map(catalogue.records.map(r=>[r.uuid,r])),seen=new Set<string>();const pages:{url:string;sha256:string;items:number}[]=[];
  while(url){if(seen.has(url)||pages.length>100)throw new Error('NAV catch-up cursor incomplete');seen.add(url);const raw=await this.get(url),page=pageSchema.parse(JSON.parse(raw.text));pages.push({url:raw.url,sha256:hash(raw.text),items:page.items.length});
   const latest=new Map<string,z.infer<typeof headerSchema>>();for(const h of page.items){const previous=latest.get(h._feed_entry.uuid);if(!previous||Date.parse(h.date_modified)>=Date.parse(previous.date_modified))latest.set(h._feed_entry.uuid,h);}
   const changed=[...latest.values()];let position=0;
   await Promise.all(Array.from({length:8},async()=>{while(position<changed.length){const h=changed[position++]!;if(h._feed_entry.status!=='ACTIVE'){records.delete(h._feed_entry.uuid);continue;}const old=records.get(h._feed_entry.uuid);if(old&&Date.parse(old.retrieved_at)>=Date.parse(h.date_modified))continue;
    const e=await this.entry(h.url);if(!e.body){records.delete(h._feed_entry.uuid);continue;}const a=e.body.json,org=String(a.employer.orgnr??'').replace(/\s/g,'');records.set(a.uuid,{uuid:a.uuid,title:a.title,status:e.body.status,employer_org:/^[0-9]{9}$/.test(org)?org:null,employer_name:a.employer.name,published:a.published,expires:a.expires,source_url:e.url,retrieved_at:e.retrieved_at,content_sha256:hash(e.text)});
   }}));
   url=page.next_url?new URL(page.next_url,base).toString():undefined;this.onProgress(`NAV catch-up ${pages.length}: ${records.size} indexed records`);
  }
  return {...catalogue,completed_at:new Date().toISOString(),records:[...records.values()].sort((a,b)=>a.uuid.localeCompare(b.uuid)),manifest:{...manifest,requests:manifest.requests+this.manifest.requests,catch_up_pages:pages}};
 }
}
