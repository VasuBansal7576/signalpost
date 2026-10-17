import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {navCatalogueSchema,navAdSchema} from '../src/nav-feed.ts';
import {hash,canonical} from '../src/domain.ts';
const [cataloguePath,rawDirectory,output]=process.argv.slice(2);if(!cataloguePath||!rawDirectory||!output)throw new Error('Supply catalogue.json raw-response-directory audit.json');
const catalogue=navCatalogueSchema.parse(JSON.parse(await readFile(cataloguePath,'utf8'))),manifest=catalogue.manifest as {pages_checked:{url:string;sha256:string;items:number}[];catch_up_pages?:{url:string;sha256:string;items:number}[]};
const failures:string[]=[],active=new Map<string,{url:string;modified:number}>();let pages=0,events=0,ads=0,unknown=0;
const rawDirectories=rawDirectory.split(',').filter(Boolean);
async function raw(url:string,sha:string){
 for(const directory of rawDirectories)for(const name of [hash(url)+'-'+sha+'.json.gz',hash(url)+'.json.gz']){
  try{const text=gunzipSync(await readFile(directory+'/'+name)).toString('utf8');if(hash(text)===sha)return text;}catch{}
 }
 throw new Error('No preserved receipt matching source hash '+sha+' for '+url);
}
for(const page of [...manifest.pages_checked,...(manifest.catch_up_pages??[])]){
 const text=await raw(page.url,page.sha256);if(hash(text)!==page.sha256)failures.push('Header page hash mismatch: '+page.url);
 const body=JSON.parse(text);if(body.items.length!==page.items)failures.push('Header item count mismatch');pages++;events+=body.items.length;
 for(const item of body.items){const uuid=item._feed_entry.uuid,modified=Date.parse(item.date_modified),old=active.get(uuid);if(old&&old.modified>modified)continue;if(item._feed_entry.status==='ACTIVE')active.set(uuid,{url:new URL(item.url,'https://pam-stilling-feed.nav.no').toString(),modified});else active.delete(uuid);}
}
const records=new Map(catalogue.records.map(r=>[r.uuid,r]));if(records.size!==catalogue.records.length)failures.push('Duplicate ad UUID');
for(const [uuid,header]of active){const record=records.get(uuid);if(!record){failures.push('Missing active head: '+uuid);continue;}try{
 const text=await raw(record.source_url,record.content_sha256);if(hash(text)!==record.content_sha256)failures.push('Ad hash mismatch: '+uuid);const ad=navAdSchema.parse(JSON.parse(text)),employer=String(ad.json.employer.orgnr??'').replace(/\s/g,'');
 if(ad.json.uuid!==uuid||ad.status!==record.status||ad.json.title!==record.title||ad.json.published!==record.published||ad.json.expires!==record.expires||ad.json.employer.name!==record.employer_name||(/^[0-9]{9}$/.test(employer)?employer:null)!==record.employer_org)failures.push('Normalized employer/ad mismatch: '+uuid);if(record.employer_org===null)unknown++;ads++;
 }catch(error){failures.push(uuid+': '+(error instanceof Error?error.message:'Missing source'));}}
for(const uuid of records.keys())if(!active.has(uuid))failures.push('Unexpected record outside current active heads: '+uuid);
const result={created_at:new Date().toISOString(),catalogue_sha256:hash(canonical(catalogue)),mechanical_checks_passed:catalogue.complete&&catalogue.failures.length===0&&failures.length===0,complete_catalogue:catalogue.complete,source_receipt_directories:rawDirectories,header_pages_checked:pages,header_events_checked:events,active_heads:active.size,ad_records_checked:ads,records_without_usable_employer_id:unknown,failures,qualification:'Source consistency check; no company-wide hiring absence is inferred'};
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,failures:failures.slice(0,10)},null,2));if(!result.mechanical_checks_passed)process.exitCode=1;
