import type{Snapshot}from'./domain.ts';
const key=(v:string)=>v.toLocaleLowerCase('nb').replace(/[^\p{L}\p{N}]/gu,'');
/** A catalogue attached to the exact legal business is distinct from a chain navigation menu. */
export function exactEntityServiceCatalogues(source:Snapshot,identity:Record<string,unknown>){
 const org=String(identity.organisasjonsnummer??''),legal=String(identity.navn??''),tail=source.text.split('[Structured data from this page]')[1]?.split('[Links extracted')[0]??'',result:{services:string[];literal_block:string;identity_quote:string;profile_url:string}[]=[];
 function visit(value:unknown){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(visit);return;}const r=value as Record<string,any>,identifiers=Array.isArray(r.identifier)?r.identifier:[r.identifier],catalogue=r.hasOfferCatalog;
  if(['AutoRepair','LocalBusiness','Organization'].includes(r['@type'])&&key(String(r.legalName??r.name??''))===key(legal)&&identifiers.some(i=>i&&i.propertyID==='NO:orgnr'&&String(i.value)===org)&&catalogue?.['@type']==='OfferCatalog'&&Array.isArray(catalogue.itemListElement)&&catalogue.itemListElement.length<=100){
   const offers=catalogue.itemListElement,valid=offers.every((o:any)=>o?.['@type']==='Offer'&&o.itemOffered?.['@type']==='Service'&&typeof o.itemOffered.name==='string'&&o.itemOffered.name.length>=2&&o.itemOffered.name.length<=150);if(valid&&offers.length){const services=offers.map((o:any)=>o.itemOffered.name),block=services.join('\n'),proof=JSON.stringify(r);if(source.text.includes(block)&&source.text.includes(proof)&&block.length<=3000&&proof.length<=6000&&typeof r.url==='string'&&new URL(r.url).origin+new URL(r.url).pathname.replace(/\/$/,'')===new URL(source.source_url).origin+new URL(source.source_url).pathname.replace(/\/$/,''))result.push({services,literal_block:block,identity_quote:proof,profile_url:r.url});}
  }
  // Each business can own only its own direct catalogue. Other nested business nodes need their own ID.
  for(const v of Object.values(r))if(v!==catalogue)visit(v);
 }
 for(const line of tail.split('\n').map(l=>l.trim()).filter(l=>l.startsWith('{')||l.startsWith('[')))try{visit(JSON.parse(line));}catch{}return result;
}
