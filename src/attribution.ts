import type { Snapshot } from './domain.ts';
import{recruitmentPositions,legalPublishers,legalNameKey,parkedWebsite}from'./semantic-context.ts';
import{supportedDates}from'./dates.ts';
import {normalizeWorkplaces,normalizeRoles} from './financials.ts';

export const restrictedDomains=['linkedin.com','facebook.com','instagram.com','indeed.com'];
export const directoryDomains=['proff.no','purehelp.no','1881.no','gulesider.no','rosa.no','io.no','yra.no','bizzy.org','generate.no','virksomhet.brreg.no','firmalisten.no','proff.se','proff.dk','companydata.com','virksomhetsinfo.no','regnskapstall.no','virksomhet.no','merinfo.no','creditsafe.com','sokfirma.no','firmadatabasen.no','rati.no','regnskapsbasen.no','nyeselskaper.no','similars.net','begravelsesbyraer.no','fysioterapiguiden.no','borettslagsportalen.no','barnehage.info','barnehagelisten.no'];
export const recruiterDomains=['arbeidsplassen.nav.no','finn.no','jobbnorge.no','webcruiter.com','teamtailor.com','reachmee.com','jobylon.com','recman.no','talentadore.com','karriere.no'];
export const fold=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('nb').replace(/([\p{L}])['’](?=s\b)/gu,'$1').replace(/([\p{L}])([0-9])/gu,'$1 $2').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const compact=(s:string)=>fold(s).normalize('NFKD').replace(/\p{M}/gu,'').replaceAll('ø','o').replaceAll('æ','ae').replaceAll(' ','');
export const domain=(url:string)=>new URL(url).hostname.replace(/^www\./,'');
export const onDomain=(host:string,list:string[])=>list.some(d=>host===d||host.endsWith('.'+d));
export function hasOrganisationNumber(text:string,org:string){return new RegExp(`(^|[^0-9])${org.split('').join('[ \\t.\\u00a0]*')}([^0-9]|$)`).test(text);}
export function namesEntity(text:string,name:string,org:string){
  if(hasOrganisationNumber(text,org))return true;
  const legal=fold(name),base=legal.replace(/\s+(as|asa|ans|da)$/,'');
  const source=` ${fold(text)} `;
  return Boolean(legal&&(source.includes(` ${legal} `)||(base.length>=4&&source.includes(` ${base} `))));
}
export function linksIn(text:string):string[]{return [...new Set((text.match(/https?:\/\/[^\s<>"'\]\)]+/g)??[]).map(s=>s.replace(/[.,;]+$/,'')))];}
export function canonicalProfile(value:string):string{const u=new URL(value);if(/^(?:www\.|[a-z]{2}\.)?linkedin\.com$/.test(u.hostname))u.hostname='www.linkedin.com';u.search='';u.hash='';u.pathname=u.pathname.replace(/\/$/,'');return u.toString().replace(/\/$/,'');}
export function profileUrl(value:string):boolean{
  try{const u=new URL(value);if(u.protocol!=='https:')return false;const h=u.hostname.replace(/^www\./,'').replace(/^[a-z]{2}\.linkedin\.com$/,'linkedin.com');const p=u.pathname.replace(/\/$/,'');
    if(h==='linkedin.com')return /^\/company\/[^/]+$/.test(p);
    if(h==='facebook.com'||h==='instagram.com')return /^\/[^/]+$/.test(p)&&!/^\/(share|sharer|login|reel|reels|p|stories|groups|people|search|privacy|dialog|plugins|help|accounts)(\.|$)/i.test(p)&&[...u.searchParams.keys()].every(k=>/^(checkpoint_src|fref|ref|refsrc|fbclid|igsh|hl|locale|mibextid|utm_.*)$/.test(k));
    if(h==='github.com')return /^\/[A-Za-z0-9-]+$/.test(p)&&!/^\/(?:login|join|signup|features|enterprise|pricing|marketplace|topics|trending|collections|explore|settings|organizations|orgs|search|security|sponsors|readme)$/i.test(p);
    if(h==='x.com'||h==='twitter.com')return /^\/[A-Za-z0-9_]+$/.test(p)&&!/^\/(share|intent|search|home|i)$/i.test(p);
    return (h==='youtube.com'&&/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+)$/.test(p));
  }catch{return false;}
}
export function profileMatches(value:string,name:string,primaryWebsite?:string){try{
  const legal=name.replace(/\s+(AS|ASA|ANS|DA)$/i,''),bases=[compact(legal),compact(legal.replace(/å/gi,'aa')),compact(legal.replace(/ø/gi,'oe')),compact(legal.replace(/å/gi,'aa').replace(/ø/gi,'oe'))],slug=compact(decodeURIComponent(new URL(value).pathname).split('/').filter(Boolean).at(-1)??'');
  const matches=(brand:string)=>brand.length>=4&&slug.startsWith(brand)&&['','as','asa','official','no','norge','norway','ltd','inc','ab'].includes(slug.slice(brand.length));
  if(bases.some(matches))return true;if(!primaryWebsite)return false;
  return matches(compact(domain(primaryWebsite).split('.').slice(0,-1).join('')));
}catch{return false;}}
export function isDirectory(url:string){const path=new URL(url).pathname;return onDomain(domain(url),directoryDomains)||/\/(?:medlemsbedrifter?|medlemsbedrift|members?|directory)\//i.test(path)||/\/(?:selskaper|bedrifter|companies|businesses|firms)\/[^/]+\/[^/]+/i.test(path)||/\/(?:selskap|company|business)\/[^/]*[-/]\d{9}(?:[/.]|$)/i.test(path)||/(?:senter|center|centre|mall|shopping)/i.test(domain(url))&&/\/(?:store|stores|butikk|butikker)\/[^/]+/i.test(path);}
export function isRecruiter(url:string){return onDomain(domain(url),recruiterDomains)&&(!onDomain(domain(url),['finn.no'])||/^\/job/.test(new URL(url).pathname));}
export function registryEmailDomain(identity:Record<string,unknown>):string|undefined{
 const match=/^[^@\s]+@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(String(identity.epostadresse??'').trim()),host=match?.[1]?.toLowerCase();
 return host&&!onDomain(host,['gmail.com','googlemail.com','hotmail.com','hotmail.no','outlook.com','outlook.no','live.com','live.no','yahoo.com','yahoo.no','icloud.com','me.com','online.no','broadpark.no','frisurf.no','start.no','proton.me','protonmail.com','mail.com','msn.com','aol.com'])?host:undefined;
}
export function brandDomain(url:string,name:string){const host=compact(domain(url).split('.').slice(0,-1).join(' '));return fold(name).split(' ').filter(t=>t.length>=4&&!['holding','invest','company','selskap','norge','borettslag','sameiet','sameie','eierseksjonssameie','barnehage','barnehagen','eiendom','forening','drift','butikk','bygg','elektriker','elektrikern','elektro','restaurant','kafe','cafe','tannlege','klinikk','klinikken','medisinsk','medisinske','advokat','regnskap','tømrer','tomrer','renhold','transport'].includes(t)).some(t=>[t,t.replaceAll('æ','a')].some(variant=>host.includes(compact(variant))));}
export function addressMatch(text:string,identity:Record<string,unknown>){
  const addresses=[identity.forretningsadresse,identity.correspondence_address].filter((a):a is Record<string,unknown>=>Boolean(a&&typeof a==='object'));
  return addresses.some(address=>{
  const streetText=(value:string)=>' '+fold(value).replace(/(?<=\p{L})(?:vegen|veien)(?= |$)/gu,'veg').replace(/(?<=\p{L})(?:gata|gaten|gate|gt)(?= |$)/gu,'gata')+' ';
  const normalized=compact(text),lines=Array.isArray(address.adresse)?address.adresse.flatMap(v=>String(v).split('\n')):[];
  const street=lines.some(v=>/\d/.test(v)&&compact(v).length>=6&&streetText(text).includes(streetText(v)));
  return street&&[address.postnummer,address.poststed].some(v=>v&&compact(String(v)).length>=4&&normalized.includes(compact(String(v))));});
}
export function profileAttribution(source:Snapshot,identity:Record<string,unknown>,sources:Snapshot[]):Attribution{
 const own=ownership(source,identity,sources);if(own.accepted)return own;
 const org=String(identity.organisasjonsnummer??''),name=String(identity.navn??''),url=new URL(source.source_url);
 const trusted=onDomain(domain(source.source_url),['proff.no','purehelp.no','gulesider.no','1881.no']);
 const record=onDomain(domain(source.source_url),['proff.no'])?/\/selskap\//.test(url.pathname):onDomain(domain(source.source_url),['purehelp.no'])?url.pathname.includes('/company/details/'+org):/bedrift/.test(url.pathname);
 if(trusted&&record&&hasOrganisationNumber(source.text,org)&&namesEntity(source.text,name,'000000000')&&addressMatch(source.text,identity)&&linksIn(source.text).some(link=>profileUrl(link)&&profileMatches(link,name)))return {accepted:true,kind:'exact-org-directory-profile',support:[],reason:'Trusted company record binds an actual matching account link to the exact organisation, legal name and registered street/location'};
 return {accepted:false,kind:'unresolved',support:[],reason:'No attributed company page or exact-org/name/address directory record supports this account'};
}
export type Attribution={accepted:boolean;kind:string;support:Snapshot[];reason:string;scope?:'company_host'|'entity_page'|'explicit_entity_facts'|'document_subject'|'third_party_contact'|'partner_subject'|'registered_subunit'};
/** A report subject is not the publisher, a customer mentioned in it, or the owner of its host. */
export function documentAttribution(source:Snapshot,identity:Record<string,unknown>,sources:Snapshot[]):Attribution{
 const no=(reason:string):Attribution=>({accepted:false,kind:'unresolved',support:[],reason});
 if(!source.document||source.extraction_method!=='public-pdf-text/v1')return no('No preserved public document metadata');
 const name=fold(String(identity.navn??'')),org=String(identity.organisasjonsnummer??'');if(name.length<4||!/^\d{9}$/.test(org))return no('Missing official document-subject identity');
 const pages=sources.filter(s=>s.document?.raw_sha256===source.document!.raw_sha256&&s.document.source_url===source.document!.source_url&&s.organisation_number===source.organisation_number&&s.run_id===source.run_id&&s.extraction_method==='public-pdf-text/v1');
 const labels=/(?:navn\s+p[åa]\s+(?:virksomheten|foretaket|selskapet)|company\s+name|legal\s+(?:entity|name)|sentral\s+godkjenning\s+for|(?:report|rapport)\s+(?:for|om))\s*[:\n]?\s*/giu;
 const subject=pages.find(page=>{
  for(const label of page.text.matchAll(labels)){
   const start=label.index+label[0].length,window=page.text.slice(start,start+Math.min(700,name.length*2+350)),normalized=fold(window);
   if(!(normalized===name||normalized.startsWith(name+' ')))continue;
   const ids=legalIdentifiers(page.text);if(ids.length&&!ids.includes(org))continue;
   if(hasOrganisationNumber(window,org)||addressMatch(page.text,identity))return true;
  }return false;
 });
 if(!subject)return no('Document subject requires a labelled full legal name and exact organisation number or registered street/locality; mentions and report host names are insufficient');
 const period=pages.find(page=>/(?:rapporterings[åa]ret|reporting\s+year|[åa]rsrapport)\s*[:\n]?\s*20\d{2}/i.test(page.text));
 return{accepted:true,kind:'public-document-exact-subject',scope:'document_subject',support:[subject,...(period&&period.id!==subject.id?[period]:[])],reason:'Preserved report subject matches the full registered legal name and organisation/address; permission is scoped to document facts, never host ownership'};
}
function differentLegalIdentifier(text:string,org:string){
 const ids=legalIdentifiers(text);
 return ids.length>0&&!ids.includes(org);
}
function primaryHeading(text:string){const title=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1],htmlHeading=/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text)?.[1],markdown=/^#\s+(.+)$/m.exec(text)?.[1],first=text.split('\n').map(s=>s.trim()).find(Boolean);return[title,htmlHeading,markdown,first?.slice(0,240)].filter(Boolean).join(' ').replace(/<[^>]+>/g,' ').slice(0,800);}
function primaryIdentifiesEntity(text:string,name:string){const heading=primaryHeading(text);return namesEntity(heading,name,'000000000')&&(!/\d/.test(name)||(' '+fold(heading)+' ').includes(' '+fold(name)+' '));}
function legalIdentifiers(text:string){return [...new Set([...text.matchAll(/(?:org(?:anisasjons)?\.?\s*(?:nr|nummer)?\.?\s*:?\s*|reg(?:istrerings)?\.?\s*(?:nr|nummer)\.?\s*:?\s*)(?:NO[ \t]*)?(\d{3}[ .\u00a0]*\d{3}[ .\u00a0]*\d{3})/giu)].map(m=>m[1]!.replace(/\D/g,'')))];}
function entityBrandDomain(url:string,identity:Record<string,unknown>){const address=identity.forretningsadresse as Record<string,unknown>|undefined,places=new Set(fold(String(address?.poststed??'')+' '+String(address?.kommune??'')).split(' '));return brandDomain(url,fold(String(identity.navn??'')).split(' ').filter(t=>!places.has(t)).join(' '));}
export function secondaryContactAttribution(source:Snapshot,identity:Record<string,unknown>):Attribution{
 const no:Attribution={accepted:false,kind:'unresolved',support:[],reason:'A secondary contact record needs the legal name and matching registered street/locality'};
 const knownRecord=isDirectory(source.source_url)||/\/(?:klinikk|salong|salons|clinics)\/[^/]+/i.test(new URL(source.source_url).pathname)&&/(?:samarbeidende|satelitter|partner clinics)/i.test(source.text);
 if(!knownRecord||!namesEntity(source.text,String(identity.navn??''),'000000000')||!addressMatch(source.text,identity))return no;
 return{accepted:true,kind:'secondary-exact-entity-contact',scope:'third_party_contact',support:[],reason:'A secondary directory/partner record names this legal entity and its registered street/locality; website ownership or current operating-site status is not established'};
}
/** Target-specific partner prose can describe a subject without owning the host. */
export function partnerSubjectParagraphs(source:Snapshot,identity:Record<string,unknown>):string[]{
 const path=new URL(source.source_url).pathname,name=String(identity.navn??'');
 if(!/\/(?:klinikk|salong|salons|clinics)\/[^/]+/i.test(path)||!/(?:samarbeidende|satelitter|partner clinics)/i.test(source.text)||!primaryIdentifiesEntity(source.text,name)||!secondaryContactAttribution(source,identity).accepted)return[];
 const body=source.text.split(/\[Page metadata description\]|\[Structured data from this page\]|\[Links extracted from this page\]/)[0]??'';
 return [...new Set(body.split('\n').map(s=>s.trim()).filter(s=>s.length>=60&&s.length<=1200&&namesEntity(s,name,'000000000')&&/(?:tilbyr|spesialis|leverer|offers|provides)/i.test(s)))];
}
export function partnerSubjectAttribution(source:Snapshot,identity:Record<string,unknown>):Attribution{
 return partnerSubjectParagraphs(source,identity).length?{accepted:true,kind:'partner-published-exact-subject',scope:'partner_subject',support:[],reason:'Partner-hosted dedicated page identifies the exact clinic through its name and registered address; only target-named service paragraphs are admitted, not host ownership or network offerings'}:{accepted:false,kind:'unresolved',support:[],reason:'No dedicated exact-subject partner service paragraph'};
}
export function explicitEntityFacts(source:Snapshot,identity:Record<string,unknown>):Attribution{
 const no={accepted:false,kind:'unresolved',support:[],reason:'No registered-host exact-entity fact binding'};if(isDirectory(source.source_url)||isRecruiter(source.source_url)||onDomain(domain(source.source_url),restrictedDomains))return no;
 try{const registered=String(identity.hjemmeside??'');if(registered&&domain(registered.startsWith('http')?registered:`https://${registered}`)===domain(source.source_url)&&hasOrganisationNumber(source.text,String(identity.organisasjonsnummer??''))&&namesEntity(source.text,String(identity.navn??''),'000000000'))return{accepted:true,kind:'registered-host-explicit-entity-fact',scope:'explicit_entity_facts',support:[],reason:'Registered shared host contains the exact legal identifier; only a quoted fact naming this entity is permitted, without asserting host ownership'};}catch{}
 return no;
}
function ownershipName(identity:Record<string,unknown>,source:Snapshot){const full=String(identity.navn??''),form=identity.organisasjonsform as {kode?:unknown}|undefined,ids=legalIdentifiers(source.text);const core=form?.kode==='STI'&&ids.length===1&&ids[0]===String(identity.organisasjonsnummer??'')?full.replace(/^(?:stiftinga|stiftelsen)\s+/i,''):full;return core.length>=4?core:full;}
export function ownership(source:Snapshot,identity:Record<string,unknown>,sources:Snapshot[]):Attribution{
  if(source.document||source.extraction_method==='public-pdf-text/v1')return {accepted:false,kind:'unresolved',support:[],reason:'A document subject or PDF host cannot establish official website ownership'};
  if(['public-html-links/v1','public-rendered-html/v1'].includes(source.extraction_method??''))return {accepted:false,kind:'unresolved',support:[],reason:'Raw HTML is an audit artifact; ownership needs independently extracted readable evidence'};
  sources=sources.filter(s=>!s.document&&!['public-html-links/v1','public-rendered-html/v1','public-pdf-text/v1'].includes(s.extraction_method??''));
  const org=String(identity.organisasjonsnummer??''),name=ownershipName(identity,source),host=domain(source.source_url);
  const no=(reason:string):Attribution=>({accepted:false,kind:'unresolved',support:[],reason});
  const samePage=source.extraction_method==='exa-navigation-and-links/v2'?sources.find(s=>s.id!==source.id&&s.source_url===source.source_url&&namesEntity(s.text,name,org)):undefined;
  if(!name)return no('Registry legal name is missing');
  if(isDirectory(source.source_url)||isRecruiter(source.source_url)||onDomain(host,restrictedDomains))return no('Directory, recruitment and social hosts are not company-owned website anchors');
  if(parkedWebsite(source.text))return no('A parked, expired or for-sale domain is not current company website evidence');
  const publishers=legalPublishers(source.text);
  const historical=(Array.isArray(identity.historiskeNavn)?identity.historiskeNavn:[]).flatMap(r=>r&&typeof r==='object'&&typeof(r as Record<string,unknown>).navn==='string'?[String((r as Record<string,unknown>).navn)]:[]),publisherKey=(value:string)=>legalNameKey(value).replace(/\bno\b/g,'').replace(/\s+/g,' ').trim();
  let registeredHost=false;try{const registered=String(identity.hjemmeside??'');registeredHost=Boolean(registered&&domain(registered.startsWith('http')?registered:'https://'+registered)===host);}catch{}
  const currentSeller=registeredHost?sources.find(s=>s.source_class!=='public_registry'&&domain(s.source_url)===host&&/(?:selger er|seller is|nettstedet eies|nettsiden eies|owned and operated by)/i.test(s.text)&&hasOrganisationNumber(s.text,org)&&namesEntity(s.text,String(identity.navn??''),'000000000')):undefined;
  const historicalPublisher=Boolean(currentSeller&&publishers.some(p=>historical.some(n=>publisherKey(n)===publisherKey(p)&&publisherKey(p).length>=12)));
  if(publishers.length&&!publishers.some(p=>legalNameKey(p)===legalNameKey(String(identity.navn??'')))&&!historicalPublisher)return no('The page explicitly names a different legal publisher; matching brand words cannot transfer ownership');
  const conflictingLegal=sources.find(s=>s.source_class!=='public_registry'&&domain(s.source_url)===host&&/(?:privacy|personvern|terms|vilkar|vilkår|legal|impressum|kontakt|contact)/i.test(new URL(s.source_url).pathname)&&/(?:eies og drives|owned and operated|site is owned|eieren av dette nettstedet|nettstedet eies|nettsiden eies|hos\s+[^.!?\n]{1,100}[,;]\s*juridisk navn)/i.test(s.text)&&differentLegalIdentifier(s.text,org));if(conflictingLegal)return no('A legal ownership page on the same host identifies a different organisation number; this conflict requires resolution');
  if(differentLegalIdentifier(source.text,org))return no('Page explicitly identifies a different organisation number');
  const publisherAnchor=sources.find(s=>s.source_class!=='public_registry'&&domain(s.source_url)===host&&hasOrganisationNumber(s.text,org)&&namesEntity(s.text,name,'000000000')&&addressMatch(s.text,identity)&&!differentLegalIdentifier(s.text,org)&&legalPublishers(s.text).length===1&&legalNameKey(legalPublishers(s.text)[0]!)===legalNameKey(String(identity.navn??'')));
  if(publisherAnchor)return{accepted:true,kind:'sole-legal-publisher-org-and-registered-address',scope:'company_host',support:[publisherAnchor],reason:'Sole explicit legal publisher, exact organisation number and current registered street/locality agree. This corroborated publisher declaration does not depend on a hostname spelling resembling the legal name'};
  if(new URL(source.source_url).pathname==='/'){
    const contactAnchor=sources.find(s=>s.id!==source.id&&s.source_class!=='public_registry'&&domain(s.source_url)===host&&/(?:^|\/)(?:kontakt(?:-oss)?|contact(?:-us)?)(?:\/|$)/i.test(new URL(s.source_url).pathname)&&namesEntity(s.text,name,'000000000')&&brandDomain(s.source_url,name)&&addressMatch(s.text,identity)&&!differentLegalIdentifier(s.text,org)&&!legalPublishers(s.text).some(p=>legalNameKey(p)!==legalNameKey(String(identity.navn??''))));
    if(contactAnchor)return{accepted:true,kind:'registered-company-contact-and-brand-homepage',scope:'company_host',support:[contactAnchor],reason:'Distinctive company brand is corroborated by a separate exact-company contact page and current registered street/locality. Long homepage navigation does not erase that independent proof; conflicting legal operators remain blocked'};
  }
  // A legal name can differ completely from a registered trading name. Require
  // both a sole explicit legal publisher and the current parent-bound registered
  // trading name/locality on its own brand host; a copyright or brand alone is
  // insufficient. The page address remains a separately scoped observation.
  const tradingProofs=sources.filter(s=>s.source_class==='public_registry'&&s.source_url.startsWith(`https://data.brreg.no/enhetsregisteret/api/underenheter?`)).flatMap(registry=>{try{return normalizeWorkplaces(JSON.parse(registry.text),org).locations.map(place=>({registry,name:String(place.name??''),city:String((place.address as Record<string,unknown>|undefined)?.poststed??'')}));}catch{return[];}});
  for(const trading of tradingProofs){
    if(trading.name.length<4||trading.city.length<4||!brandDomain(source.source_url,trading.name))continue;
    const publisher=sources.find(s=>s.source_class!=='public_registry'&&domain(s.source_url)===host&&!differentLegalIdentifier(s.text,org)&&!parkedWebsite(s.text)&&legalPublishers(s.text).length===1&&legalNameKey(legalPublishers(s.text)[0]!)===legalNameKey(String(identity.navn??''))&&namesEntity(s.text,trading.name,'000000000')&&(' '+fold(s.text)+' ').includes(' '+fold(trading.city)+' '));
    if(publisher)return{accepted:true,kind:'legal-publisher-and-registered-trading-name',scope:'company_host',support:[publisher,trading.registry],reason:'Sole explicit legal publisher matches the target; its registered parent-bound trading name, brand domain and registered locality corroborate the same company-published site. No street-number equivalence is inferred'};
  }
  const declared=sources.find(s=>s.source_class!=='public_registry'&&domain(s.source_url)===host&&/(?:imprint|legal|vilkar|vilkår|terms|personvern|privacy)/i.test(new URL(s.source_url).pathname)&&legalIdentifiers(s.text).every(id=>id===org)&&[...s.text.matchAll(/(?:this (?:web)?site is (?:published|owned|operated) by|nettstedet (?:eies|drives)|nettsiden (?:eies|drives)|responsible for this website)/gi)].some(m=>{const block=s.text.slice(m.index,m.index+900);return hasOrganisationNumber(block,org)&&namesEntity(block,String(identity.navn??''),'000000000')&&addressMatch(block,identity);}));
  if(declared)return{accepted:true,kind:'exact-legal-project-publisher',scope:'company_host',support:[declared],reason:'Explicit website-publisher declaration independently matches the exact registered legal name, organisation number and address; this is a company-published web property, not ownership of external project platforms'};
  const roleProof=sources.find(s=>s.source_class==='public_registry'&&s.source_url===`https://data.brreg.no/enhetsregisteret/api/enheter/${org}/roller`);
  const registeredPhones=[identity.telefon,identity.mobil].filter((v):v is string=>typeof v==='string').map(v=>v.replace(/\D/g,'')).map(v=>v.length===10&&v.startsWith('47')?v.slice(2):v).filter(v=>v.length===8);
  if(roleProof&&registeredPhones.length){try{
    const officers=normalizeRoles(JSON.parse(roleProof.text)).roles.filter(r=>r.role_code==='DAGL'&&typeof r.name==='string').map(r=>fold(String(r.name)).split(' '));
    const locality=identity.forretningsadresse as Record<string,unknown>|undefined,cityTokens=fold(String(locality?.poststed??'')).split(' ').filter(t=>t.length>=4),hostCore=compact(host.split('.').slice(0,-1).join('')),legalCore=compact(name.replace(/\s+(AS|ASA|ANS|DA)$/i,'')),distinct=entityBrandDomain(source.source_url,identity)||legalCore.length>=6&&hostCore.includes(legalCore)||hostCore.length>=7&&legalCore.startsWith(hostCore);
    const contact=distinct?sources.find(s=>domain(s.source_url)===host&&s.source_class!=='public_registry'&&namesEntity(s.text,String(identity.navn??''),'000000000')&&registeredPhones.some(phone=>new RegExp('(?:^|[^0-9])(?:\\+47[ .]*)?'+phone.split('').join('[ .-]*')+'(?![0-9])').test(s.text))&&cityTokens.some(t=>(' '+fold(s.text)+' ').includes(' '+t+' '))&&officers.some(parts=>parts.length>=2&&new RegExp('(?:^| )'+parts[0]+'(?: [\\p{L}]+){0,3} '+parts.at(-1)+'(?: |$)','u').test(fold(s.text)))&&!differentLegalIdentifier(s.text,org)&&!legalPublishers(s.text).some(p=>legalNameKey(p)!==legalNameKey(String(identity.navn??'')))):undefined;
    if(contact)return{accepted:true,kind:'registry-phone-director-locality-and-company-brand',scope:'company_host',support:[contact,roleProof],reason:'Exact company self-identification on its distinctive brand host is independently corroborated by the registered phone, current managing director and locality; address differences remain separate observations'};
  }catch{}}
  const named=namesEntity(source.text,name,org)||Boolean(samePage);
  const hostAnchor=sources.find(s=>s.source_class!=='public_registry'&&domain(s.source_url)===host&&hasOrganisationNumber(s.text,org)&&(namesEntity(s.text,name,'000000000')||addressMatch(s.text,identity))&&!differentLegalIdentifier(s.text,org)&&(brandDomain(s.source_url,name)||registryEmailDomain(identity)===host)&&legalIdentifiers(s.text).length===1&&(/^\/(?:(?:en|no|nb|nn)\/?)?$/i.test(new URL(s.source_url).pathname)||/^\/(?:(?:en|no|nb|nn|pages|policies|index\.php)\/)?(?:(?:kontakt(?:-oss)?|contact(?:-us)?|about|about-us|om-oss|legal(?:-notice)?|impressum|personvern[^/]*|privacy(?:-policy)?|terms(?:-of-service)?|vilkar|vilkår|betingelser|salgsbetingelser))?\/?$/i.test(new URL(s.source_url).pathname)));
  const ownRoot=sources.find(s=>s.id!==source.id&&domain(s.source_url)===host&&/^\/(?:(?:no|nb|nn|en)\/?)?$/.test(new URL(s.source_url).pathname)&&namesEntity(s.text,name,'000000000')&&!differentLegalIdentifier(s.text,org)&&!legalPublishers(s.text).some(p=>legalNameKey(p)!==legalNameKey(String(identity.navn??'')))&&(registryEmailDomain(identity)===host&&entityBrandDomain(s.source_url,identity)||brandDomain(s.source_url,name)&&addressMatch(s.text,identity)));
  if(ownRoot&&(!named||!primaryIdentifiesEntity(source.text,name)))return{accepted:true,kind:'independently-bound-company-homepage',scope:'company_host',support:[ownRoot],reason:'The same distinctive company host has an independently registry-email/address-bound exact-company homepage; shared operators and conflicting legal publishers remain excluded'};
  if(!named&&!hostAnchor)return no('Page does not name the exact legal entity and lacks a verified legal contact page');
  if(!named&&hostAnchor)return {accepted:true,kind:'verified-company-host-and-legal-contact',scope:'company_host',support:[hostAnchor],reason:'Same brand host is anchored by an exact legal-name/organisation-number contact page'};
  if(new URL(source.source_url).pathname==='/'&&!hasOrganisationNumber(source.text,org)&&!namesEntity(source.text.slice(0,1200),name,'000000000')&&!hostAnchor)return no('A shared homepage naming the operator only in a later location list cannot establish the operator website');
  const path=new URL(source.source_url).pathname,primary=named&&primaryIdentifiesEntity(source.text,name),legalBase=compact(name.replace(/\s+(AS|ASA|ANS|DA)$/i,'')),literalBrand=legalBase.length>=4&&compact(host.split('.').slice(0,-1).join('')).includes(legalBase);
  const root=/^\/(?:(?:no|nb|nn|en)\/?)?$/.test(path),globalPage=/^\/(?:(?:no|nb|nn|en)\/)?(?:about|about-us|om-oss|kontakt(?:-oss)?|contact(?:-us)?|legal|privacy|personvern[^/]*|terms|vilkar|vilkår)?\/?$/i.test(path);
  const collection=/(?:^|\/)(?:eiendommer|properties|portfolio|companies|subsidiaries|datterselskaper|leietakere|tenants|members|register|signup|join|mrk)(?:\.html?)?\/?$/i.test(path)||/\/(?:branches|locations|barnehager|stores|avdelinger)\/[^/]+\/?$/i.test(path);
  if(collection&&!primary&&!literalBrand)return no('A shared collection, signup form or municipality list does not establish the listed legal entity website');
  const ids=legalIdentifiers(source.text),soleOwner=ids.length===1&&ids[0]===org;
  if(root&&!primary&&!literalBrand&&!soleOwner&&!hostAnchor)return no('A parent/group homepage naming another entity only in a business or contact list is not that entity website');
  const scope:Attribution['scope']=literalBrand||hostAnchor||(root||globalPage)&&primary?'company_host':'entity_page';
  if(scope==='entity_page'){
    const value=String(identity.hjemmeside??'');let registeredHost=false;try{registeredHost=Boolean(value&&domain(value.startsWith('http')?value:`https://${value}`)===host);}catch{}
    const exactLink=sources.find(s=>s.source_class!=='public_registry'&&onDomain(domain(s.source_url),['proff.no','purehelp.no','gulesider.no','1881.no'])&&/(?:\/selskap\/|\/company\/details\/|\/bedrift\/)/i.test(new URL(s.source_url).pathname)&&hasOrganisationNumber(s.text,org)&&namesEntity(s.text,name,'000000000')&&addressMatch(s.text,identity)&&linksIn(s.text).some(link=>{try{const u=new URL(link);return domain(link)===host&&u.pathname.replace(/\/$/,'')===path.replace(/\/$/,'');}catch{return false;}}));
    const strongDirect=primary&&entityBrandDomain(source.source_url,identity)&&hasOrganisationNumber(source.text,org),teamCandidate=primary&&entityBrandDomain(source.source_url,identity)&&sources.some(s=>s.source_class==='public_registry'&&s.source_url===`https://data.brreg.no/enhetsregisteret/api/enheter/${org}/roller`);
    if(!registeredHost&&!exactLink&&!strongDirect&&!teamCandidate)return no('A page on an unregistered shared host needs an independently bound exact-entity link; partial brand/city words and a copied company record do not prove ownership');
    if(!primary){
      const section=registeredHost?sources.find(s=>s.id!==source.id&&s.source_class!=='public_registry'&&domain(s.source_url)===host&&!isDirectory(s.source_url)&&!differentLegalIdentifier(s.text,org)&&primaryIdentifiesEntity(s.text,name)&&new URL(s.source_url).pathname!=='/'&&path.startsWith(new URL(s.source_url).pathname.replace(/\/$/,'')+'/')):undefined;
      if(section)return{accepted:true,kind:'verified-entity-section',scope:'entity_page',support:[section],reason:'Quoted page is inside a registered-host section whose primary heading identifies this exact legal entity'};
      return no('A shared/non-literal host page needs the exact entity in its primary heading or an independently verified entity section; a footer mention is insufficient');
    }
  }

  if(registryEmailDomain(identity)===host&&named&&entityBrandDomain(source.source_url,identity)&&!isDirectory(source.source_url))return{accepted:true,kind:'registry-email-domain-and-exact-company-page',scope,support:[],reason:'Official registry email domain independently matches this distinctive company host and its exact company self-identification'};
  const registered=String(identity.hjemmeside??'');
  try{if(registered&&domain(registered.startsWith('http')?registered:`https://${registered}`)===host)return {accepted:true,kind:'registry-domain-and-entity',scope,support:samePage?[samePage]:[],reason:'Registry domain and exact entity match'};}catch{}
  const own=sources.filter(s=>s.source_class!=='public_registry'&&domain(s.source_url)===host&&namesEntity(s.text,name,org)&&!differentLegalIdentifier(s.text,org));
  const anchor=own.find(s=>hasOrganisationNumber(s.text,org)&&(brandDomain(s.source_url,name)||(registryEmailDomain(identity)===domain(s.source_url)&&namesEntity(s.text,name,'000000000'))));
  if(anchor)return {accepted:true,kind:'legal-identifier-on-brand-domain',scope,support:[anchor],reason:'Company brand or registry-listed email domain corroborates the exact legal organisation number'};
  const address=own.find(s=>brandDomain(s.source_url,name)&&addressMatch(s.text,identity));
  if(address)return {accepted:true,kind:'legal-name-address-and-brand-domain',scope,support:[address],reason:'Legal name, registered street/address and brand domain match'};
  const directory=sources.find(s=>s.source_class!=='public_registry'&&isDirectory(s.source_url)&&hasOrganisationNumber(s.text,org)&&linksIn(s.text).some(link=>{try{return domain(link)===host;}catch{return false;}}));
  if(directory&&brandDomain(source.source_url,name))return {accepted:true,kind:'organisation-directory-link-and-company-page',scope,support:[directory],reason:'Exact-organisation directory links this brand domain; company page names the entity'};
  const phones=(text:string)=>new Set([...text.matchAll(/(?:^|[^0-9])(?:\+47[ .]*)?([2-9](?:[ .]*[0-9]){7})(?![0-9])/g)].map(m=>m[1]!.replace(/\D/g,'')));
  const numbers=phones(source.text),registeredAddress=identity.forretningsadresse as Record<string,unknown>|undefined,city=String(registeredAddress?.poststed??'');
  const phoneDirectory=brandDomain(source.source_url,name)&&city.length>=4&&compact(source.text).includes(compact(city))?sources.find(s=>s.source_class!=='public_registry'&&onDomain(domain(s.source_url),['proff.no','purehelp.no','gulesider.no','1881.no'])&&hasOrganisationNumber(s.text,org)&&namesEntity(s.text,name,'000000000')&&[...phones(s.text)].some(phone=>numbers.has(phone))):undefined;
  if(phoneDirectory)return {accepted:true,kind:'legal-name-city-phone-and-brand-domain',scope,support:[phoneDirectory],reason:'Legal company name, registered locality, brand domain and a phone on its exact-org trusted directory record agree'};
  // Two independent registry people corroborate a named company team; a customer
  // or portfolio page and a single shared director are insufficient.
  const roleSource=sources.find(s=>s.source_class==='public_registry'&&s.source_url===`https://data.brreg.no/enhetsregisteret/api/enheter/${org}/roller`);
  if(roleSource&&brandDomain(source.source_url,name)){
    try{
      const people=[...new Map(normalizeRoles(JSON.parse(roleSource.text)).roles.filter(r=>typeof r.name==='string'&&['DAGL','LEDE','MEDL','NEST'].includes(String(r.role_code))).map(r=>{const parts=fold(String(r.name)).split(' ');return [parts[0]+' '+parts.at(-1),parts] as const;})).values()].filter(parts=>parts.join(' ').length>=12&&parts.length>=2);
      const team=own.find(s=>/(team|teamet|om[-_]?oss|about|ledelse|ansatte)/i.test(new URL(s.source_url).pathname)&&/\b(norge|norway|norsk|norwegian)\b/i.test(s.text)&&people.filter(parts=>new RegExp(`(?:^| )${parts[0]}(?: [\\p{L}]+){0,3} ${parts.at(-1)}(?: |$)`,'u').test(fold(s.text))).length>=2);
      if(team)return {accepted:true,kind:'legal-name-brand-and-registry-team',scope,support:[team,roleSource],reason:'Exact company name, brand domain and Norwegian team page corroborated by at least two current registry officers'};
    }catch{ /* Invalid or missing official roles do not establish website identity. */ }
  }
  return no('No legal-identifier, address, exact-organisation link or independently matched registry team corroborates website ownership');
}
export function registeredRecruitmentSubjects(source:Snapshot,quote:string,identity:Record<string,unknown>,sources:Snapshot[]){
 const org=String(identity.organisasjonsnummer??''),name=String(identity.navn??''),path=new URL(source.source_url).pathname;
 if(!/(?:career|karriere|stilling|jobbe|jobs?|vacanc|recruit)/i.test(path)||!/(?:søk(?:er|jer)|søknadsfrist|stilling|arbeidssted|hiring|vacanc|production workers)/i.test(quote))return[];
 const units=sources.filter(s=>s.source_class==='public_registry'&&s.source_url.startsWith('https://data.brreg.no/enhetsregisteret/api/underenheter?'));const matches:{organisation_number:string;name:string;source:Snapshot}[]=[];
 for(const proof of units)try{for(const unit of normalizeWorkplaces(JSON.parse(proof.text),org).locations){const unitName=String(unit.name??''),address=unit.address as Record<string,unknown>|null,city=String(address?.poststed??'');if(unitName.length>=7&&namesEntity(quote,unitName,'000000000')&&city.length>=4&&(' '+fold(quote)+' ').includes(' '+fold(city)+' ')&&fold(name).split(' ').filter(t=>t.length>=4&&!['norge','midt','nord','vest','holding'].includes(t)).some(t=>fold(unitName).split(' ').includes(t)))matches.push({organisation_number:String(unit.organisation_number),name:unitName,source:proof});}}catch{}
 return matches;
}
export function hiringAttribution(source:Snapshot,identity:Record<string,unknown>,sources:Snapshot[]):Attribution{
  const own=ownership(source,identity,sources);if(own.accepted)return own;
  const subjects=registeredRecruitmentSubjects(source,source.text,identity,sources);if(subjects.length)return{accepted:true,kind:'recruitment-registered-subunit',scope:'registered_subunit',support:[...new Map(subjects.map(s=>[s.source.id,s.source])).values()],reason:'Career source names a target registered subunit and its registered locality; each quoted listing must independently match that same subunit'};
  const regional=/(?:jobbe|arbeid|career|karriere|stilling)/i.test(new URL(source.source_url).pathname)&&(' '+fold(source.text)+' ').includes(' '+fold(String(identity.navn??''))+' ');
  if(!isRecruiter(source.source_url)&&!regional)return own;
  const name=String(identity.navn??''),org=String(identity.organisasjonsnummer??''),legal=fold(name);
  if(!legal||!namesEntity(source.text,name,org))return {accepted:false,kind:'unresolved',support:[],reason:'Recruitment page does not identify the exact legal employer'};
  const addresses=[identity.forretningsadresse,...(Array.isArray(identity.workplace_addresses)?identity.workplace_addresses:[])].filter((a):a is Record<string,unknown>=>Boolean(a&&typeof a==='object'));
  const location=addresses.some(address=>[address.postnummer,address.poststed].some(v=>v&&compact(String(v)).length>=4&&compact(source.text).includes(compact(String(v)))));
  const employer=regional&&/(?:søker|søkjer|rekrutterer|hiring|vacancy)/i.test(source.text)||/(arbeidsgiver|om bedriften|om arbeidsgiveren|employer|organisasjonsnummer|bedrift|company|ledige stillinger)/i.test(source.text)||(/\/locations\//i.test(source.source_url)&&linksIn(source.text).some(link=>/\/jobs\/\d/.test(link)));
  if(!hasOrganisationNumber(source.text,org)&&!(location&&employer))return {accepted:false,kind:'unresolved',support:[],reason:'Legal employer needs an organisation number or matching registered location and employer context'};
  return {accepted:true,kind:'recruitment-employer-and-identity',support:sources.filter(s=>s.source_class==='public_registry'&&s.source_url.startsWith('https://data.brreg.no/enhetsregisteret/api/underenheter?')),reason:'Recruitment source identifies the legal employer and organisation/location'};
}
export function hiringState(text:string,at=new Date()):{kind:string;expired:boolean}{
  const structured=recruitmentPositions(text);if(structured.recognized)return{kind:structured.positions.length?structured.positions.every(p=>p.open_application)?'open_application':'current_listings_at_observation':'source_scoped_no_listings',expired:false};
  if(/(?:we are (?:currently )?fully staffed|vi er (?:for tiden )?fullt? bemannet)/i.test(text))return{kind:'self_reported_fully_staffed',expired:false};
  if(/(ingen ledige stillinger|ingen utlyste stillinger|alle stillinger (er )?besatt|no (current |open )?(vacancies|positions)|no jobs available)/i.test(text))return {kind:'explicit_no_open_roles',expired:false};
  if(/(annonsen er (utløpt|inaktiv)|stillingen er besatt|søknadsfristen (er )?(utløpt|passert)|(?:søknadsfristen|søk(?:e|je)fristen|fristen)\s+(?:(?:er|har)\s+gått ut|(?:gikk|gjekk) ut|er (?:utløpt|passert))|utgått annonse|job (has )?expired|position has been filled)/i.test(text))return {kind:'expired_vacancy',expired:true};
  const deadline=/(?:søknadsfrist|application deadline|apply by|frist)\s*[:\-]?\s*(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[./](\d{1,2})[./](\d{4}))/i.exec(text);
  const named=/(?:søknadsfrist|application deadline|apply by|frist)\s*[:\-]?\s*(\d{1,2})\.?\s*([a-zæøå]+)\s+(\d{4})/i.exec(text);
  const months=['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];
  let date=deadline?(deadline[1]?`${deadline[1]}-${deadline[2]}-${deadline[3]}`:`${deadline[6]}-${deadline[5]!.padStart(2,'0')}-${deadline[4]!.padStart(2,'0')}`):null;
  if(!date&&named){const token=named[2]!.toLowerCase().slice(0,3).replace('may','mai').replace('oct','okt').replace('dec','des'),month=months.indexOf(token)+1;if(month)date=`${named[3]}-${String(month).padStart(2,'0')}-${named[1]!.padStart(2,'0')}`;}
  // A past, yearless deadline on a concretely dated advert cannot establish current hiring.
  // This rejects uncertain currency; it does not publish an inferred expiry date.
  const short=/(?:søknadsfrist|application deadline|apply by|søk senest|frist)\s*[:\-]?\s*(?:(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+)?(\d{1,2})\.?\s*([a-zæøå]+)\b(?!\s+20\d{2})/i.exec(text);
  if(!date&&short){const published=supportedDates(text).filter(d=>d<=at.toISOString().slice(0,10));const token=short[2]!.toLowerCase().slice(0,3).replace('may','mai').replace('oct','okt').replace('dec','des'),month=months.indexOf(token)+1;if(published.length===1&&month){const candidate=published[0]!.slice(0,4)+'-'+String(month).padStart(2,'0')+'-'+short[1]!.padStart(2,'0');if(candidate>=published[0]!&&candidate<at.toISOString().slice(0,10))return{kind:'unverified_yearless_deadline',expired:false};}}
  if(date&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date){if(date<at.toISOString().slice(0,10))return {kind:'expired_vacancy',expired:true};return {kind:'dated_vacancy',expired:false};}
  if(/(åpen søknad|open application|connect with us)/i.test(text))return{kind:'open_application',expired:false};
  if(/\bsøk(?:er|jer)\b[\s\S]{0,180}\b(?:kollega|medarbeider(?:e)?|ingeniør(?:er)?|elektriker(?:e)?|tømrer(?:e)?|produksjonsmedarbeidere|maskinoperatør(?:er)?|rådgiver|prosjektleder|MATarbeider(?:e)?)\b/iu.test(text)||/\b(?:seeking|hiring|looking for)\b[\s\S]{0,120}\b(?:engineers?|developers?|designers?|workers?|assistants?)\b/i.test(text))return{kind:'undated_vacancy',expired:false};
  return {kind:'careers_or_vacancy_information',expired:false};
}
