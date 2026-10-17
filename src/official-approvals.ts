import{hasOrganisationNumber,namesEntity}from'./attribution.ts';import{supportedDates}from'./dates.ts';import type{Snapshot}from'./domain.ts';
/** Read only a named enterprise's actual approval rows, never the generic explanatory examples. */
export function officialApprovalAreas(source:Snapshot,identity:Record<string,unknown>){
 let url:URL;try{url=new URL(source.source_url);}catch{return null;}const org=String(identity.organisasjonsnummer??''),name=String(identity.navn??'');
 if(url.hostname!=='sgregister.dibk.no'||url.pathname!=='/enterprises/'+org||!hasOrganisationNumber(source.text.slice(0,1300),org)||!namesEntity(source.text.slice(0,1300),name,'000000000')||!/(?:Foretaket har sentral godkjenning|The enterprise has central approval)/i.test(source.text.slice(0,2000)))return null;
 const period=/(?:Godkjenningsperiode|Approval period)\s*:\s*(\d{2}\.\d{2}\.\d{4})\s*[–—-]\s*(\d{2}\.\d{2}\.\d{4})/i.exec(source.text);if(!period)return null;const dates=supportedDates(period[0]);if(dates.length!==2||dates[0]!>dates[1]!)return null;
 const rows=[...source.text.matchAll(/(?:Funksjon|Function)\s+(Prosjekterende|Utførende|Ansvarlig søker|Kontrollerende)\s*\n(?:Fagområde|Field area)\s+([^\n]+)\s*\n(?:Tiltaksklasse|Development class)\s+([123])\b/g)].map(m=>({quote:m[0],role:m[1]!,category:m[2]!.trim(),class:Number(m[3])}));
 return{org,valid_from:dates[0]!,valid_until:dates[1]!,period_quote:period[0],rows:[...new Map(rows.map(r=>[r.quote,r])).values()],current_at_observation:dates[0]!<=source.retrieved_at.slice(0,10)&&dates[1]!>=source.retrieved_at.slice(0,10)};
}
