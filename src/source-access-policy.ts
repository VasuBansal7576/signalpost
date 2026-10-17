import type{Snapshot}from'./domain.ts';
/** Reviewed restrictions for this automated research/publication pattern. No permission is presumed. */
export const reviewedAccessRestrictions=[
 {host:'jobbsafari.no',policy_url:'https://jobbsafari.no/compliance/generelle-vilkar',reviewed_at:'2026-10-17',reason:'Reviewed public terms section5 prohibit commercial reuse, public display, storage and systematic copying without prior written consent; none is configured. Ordinary independent linking is separate.'},
 {host:'lonna.no',policy_url:'https://www.lonna.no/info/vilkar-og-betingelser',reviewed_at:'2026-10-17',reason:'Reviewed public website terms section5 prohibit copying/distributing site content without prior written permission; none is configured for this research/publication pattern.'},
 {host:'point-s.no',policy_url:'https://www.point-s.no/betingelser-bruk',reviewed_at:'2026-10-17',reason:'Reviewed legal notice and terms IV prohibit site-content reuse/publication without prior written permission; none is configured.'},
 {host:'foodora.no',policy_url:'https://www.foodora.no/contents/terms-and-conditions.htm',reviewed_at:'2026-10-17',reason:'Reviewed May2026 platform terms sections16.1–16.2 require prior written consent for this commercial collection/publication pattern; none is configured.'},
 {host:'finn.no',policy_url:'https://www.finn.no/vilkar/brukervilkar-finn',reviewed_at:'2026-10-17',reason:'FINN sections6/7 require written permission for automated/systematic copying and business reuse; no such permission is configured.'},
 {host:'eiendomsmegler1.no',policy_url:'https://www.eiendomsmegler1.no/om-oss/personvern/generelle-vilkar',reviewed_at:'2026-10-17',reason:'EiendomsMegler1 prohibits automated collection/analysis and AI use without consent, including indirectly linked content; no consent is configured.'},
 {host:'farvatnventure.com',policy_url:'https://www.farvatnventure.com/terms-of-use',reviewed_at:'2026-10-17',reason:'The retained terms identify Farvatn Venture AS and prohibit reproduction/redistribution; this source cannot support this publication pattern.'},
 {host:'sagarobotics.com',policy_url:'https://www.sagarobotics.com/terms-of-use',reviewed_at:'2026-10-17',reason:'Original January2026terms explicitly prohibit automated website access for any purpose without written permission; none is configured.'},
 {host:'bondensmarked.no',policy_url:'https://bondensmarked.no/vilkar-og-betingelser',reviewed_at:'2026-10-17',reason:'The reviewed public-platform terms prohibit automated data extraction and content copying without express permission; none is configured.'},
 {host:'forvalt.no',policy_url:'https://forvalt.no/Nettbutikk/produkter/920285333',reviewed_at:'2026-10-17',reason:'The preserved Proff Forvalt footer explicitly prohibits systematic collection/storage/reuse without written permission; none is configured.'},
 {host:'hyve.app',policy_url:'https://www.hyve.app/terms-of-service',reviewed_at:'2026-10-17',reason:'Reviewed terms apply to public web pages and application and prohibit automated monitoring/copying without permission; none is configured.'},
 {host:'celestialthecollective.com',policy_url:'https://celestialthecollective.com/pages/terms-privacy',reviewed_at:'2026-10-17',reason:'Reviewed public website terms explicitly prohibit spider/crawl/scrape use.'},
 {host:'satoshispaceclub.store',policy_url:'https://satoshispaceclub.store/policies/terms-of-service',reviewed_at:'2026-10-17',reason:'Reviewed public website terms explicitly prohibit spider/crawl/scrape use.'},
 {host:'shop-skye.com',policy_url:'https://shop-skye.com/pages/terms-conditions',reviewed_at:'2026-10-17',reason:'Reviewed public website terms explicitly prohibit spider/crawl/scrape use.'},
]as const;
const host=(url:string)=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return'';}};
export function knownAccessRestriction(url:string){const h=host(url);return reviewedAccessRestrictions.find(r=>h===r.host||h.endsWith('.'+r.host));}
/** Saved material and alternate transport paths must pass the same gate as a fresh fetch. */
export function publicationRestriction(source:Snapshot,sources:Snapshot[]=[]):{reason:string;policy_url:string;reviewed_at:string}|undefined{
 for(const url of[source.source_url,source.document?.source_url,source.transport?.final_url].filter((u):u is string=>Boolean(u))){const known=knownAccessRestriction(url);if(known)return known;}
 const h=host(source.source_url),prohibition=sources.find(s=>host(s.source_url)===h&&s.source_class!=='public_registry'&&/(?:regelmessig|systematisk|kontinuerlig).{0,180}(?:innhenting|innsamling|lagring|indeksering).{0,240}(?:tillates ikke|ikke tillatt).{0,100}(?:skriftlig|tillatelse|samtykke)/i.test(s.text));
 return prohibition?{reason:'A preserved source on this host explicitly prohibits this systematic collection/reuse without written permission; no permission is configured.',policy_url:prohibition.source_url,reviewed_at:'2026-10-17'}:undefined;
}
