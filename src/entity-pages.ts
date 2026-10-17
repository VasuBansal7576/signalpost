import type{Snapshot}from'./domain.ts';import{normalizeRoles}from'./financials.ts';
const compact=(v:string)=>v.normalize('NFKC').toLocaleLowerCase('nb').replace(/[^\p{L}\p{N}]/gu,'');
/** Structured identity declarations are scoped to the named Organization, never a page's generic WebSite object. */
export function exactOrganizationAccounts(source:Snapshot,legalName:string){
 const tail=source.text.split('[Structured data from this page]')[1]?.split('[Links extracted')[0]??'',result:string[]=[];
 const visit=(v:unknown)=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(visit);return;}const r=v as Record<string,unknown>,types=Array.isArray(r['@type'])?r['@type']:[r['@type']],name=r.legalName??r.name;
  if(types.some(t=>typeof t==='string'&&/^(?:Organization|Corporation|LocalBusiness|TravelAgency|AccountingService|AutoRepair)$/.test(t))&&typeof name==='string'&&compact(name)===compact(legalName))for(const u of Array.isArray(r.sameAs)?r.sameAs:[])if(typeof u==='string')result.push(u);
  Object.values(r).forEach(visit);
 };for(const line of tail.split('\n').map(l=>l.trim()).filter(l=>l.startsWith('{')||l.startsWith('[')))try{visit(JSON.parse(line));}catch{}return [...new Set(result)];
}
/** This verifies the profile's subject, not ownership of the hosting press platform. */
export function exactPressroomSubject(source:Snapshot,identity:Record<string,unknown>,sources:Snapshot[]){
 const u=new URL(source.source_url),org=String(identity.organisasjonsnummer??''),name=String(identity.navn??'');if(!['api.kommunikasjon.ntb.no','kommunikasjon.ntb.no'].includes(u.hostname)||!/^\/presserom\/\d+\/[^/]+\/?$/.test(u.pathname)||name.length<8||!compact(source.text).includes(compact(name)))return null;
 const roles=sources.find(s=>s.source_class==='public_registry'&&s.source_url===`https://data.brreg.no/enhetsregisteret/api/enheter/${org}/roller`);if(!roles)return null;
 try{const leaders=normalizeRoles(JSON.parse(roles.text)).roles.filter(r=>r.role_code==='DAGL'&&typeof r.name==='string');const leader=leaders.find(r=>compact(source.text).includes(compact(String(r.name))));if(!leader||!/(?:Daglig leder|Managing Director|CEO)/i.test(source.text))return null;return{proof:roles,leader:String(leader.name)};}catch{return null;}
}
