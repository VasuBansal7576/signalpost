/** Structured publisher data outranks UI empty-state labels; all returned spans are original substrings. */
export function recruitmentSourceConflict(text:string){
 const [body,...tail]=text.split('[Page metadata description]'),metadata=(tail.join('[Page metadata description]').split(/\[Structured data from this page\]|\[Links extracted from this page\]/)[0]??'');
 if(!metadata)return{};
 const negative=(s:string)=>/ingen (?:ledige|utlyste) stillinger|no (?:current |open )?(?:vacancies|positions)/i.test(s),positive=(s:string)=>/\b(?:vi søker|vi søkjer|we are (?:currently )?hiring|we seek|ledig stilling som)\b/iu.test(s);
 return negative(body??'')&&positive(metadata)||negative(metadata)&&positive(body??'')?{source_internal_recruitment_conflict:true,current_vacancy_established:false,current_absence_of_vacancies_established:false,hiring_kind:'conflicting_recruitment_statements',currentness:'Body and page metadata conflict; neither a current vacancy nor current absence is established.'}:{};
}
export function comparativeMarketingScope(value:string){return /\b(?:største|størst|largest|eldste|oldest)\b/iu.test(value)?{assertion_scope:'company_self_description_and_comparative_marketing',comparative_ranking_independently_established:false}:{};}
/** Only complete weekly schedules; an address with hours is not reclassified. */
export function openingHoursStatement(value:string){
 const day='(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|man|tir|ons|tor|tors|fre|lør|søn|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)',clock='(?:[01]?\\d|2[0-3])(?:[:.][0-5]\\d)?';
 const line=new RegExp('^'+day+'(?:\\s*[-–]\\s*'+day+')?\\s*:?\\s*(?:'+clock+'\\s*[-–]\\s*'+clock+'|stengt|closed|etter avtale|by appointment)\\s*$','iu'),lines=value.trim().split(/\n/).map(s=>s.trim()).filter(Boolean);
 const heading=/^(?:åpningstider|opening hours|salg|sales|verksted|workshop|delelager|parts|resepsjon|reception)\s*:?[ ]*$/iu;
 const keyDrop=/^(?:levering bil|vehicle drop[- ]?off)\s*:\s*(?:hele døgnet, alle dager\s*\(nøkkeldropp\)|24\s*\/\s*7(?:\s*\(key drop\))?)\s*$/iu;
 return lines.some(s=>line.test(s))&&lines.every(s=>line.test(s)||heading.test(s)||keyDrop.test(s));
}
export function recruitmentPositions(text:string){
 const spans:{start:number;end:number;raw:string;value:Record<string,unknown>}[]=[],stack:number[]=[];let quoted=false,escaped=false;
 for(let i=0;i<Math.min(text.length,500000);i++){const ch=text[i];if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}if(ch==='"'&&stack.length){quoted=true;continue;}if(ch==='{')stack.push(i);if(ch==='}'&&stack.length){const start=stack.pop()!;if(spans.length>=2048)continue;const raw=text.slice(start,i+1);try{const value=JSON.parse(raw);if(value&&typeof value==='object'&&!Array.isArray(value))spans.push({start,end:i+1,raw,value});}catch{}}}
 const feed=spans.find(s=>s.value.success===true&&Array.isArray(s.value.departments)&&s.value.departments.every(d=>d&&typeof d==='object'&&Array.isArray(d.positions)));
 if(!feed)return{recognized:false,positions:[] as {id:string;title:string;url:string;quote:string;open_application:boolean}[]};
 const positions:{id:string;title:string;url:string;quote:string;open_application:boolean}[]=[];
 for(const department of feed.value.departments as {positions:unknown[]}[])for(const p of department.positions){if(!p||typeof p!=='object')continue;const r=p as Record<string,unknown>;if(typeof r.name!=='string'||typeof r.url!=='string')continue;let url:URL;try{url=new URL(r.url);if(url.protocol!=='https:'||url.username||url.password||!/(?:^|\.)bamboohr\.com$/.test(url.hostname)||!/^\/careers\/\d+/.test(url.pathname))continue;}catch{continue;}
 const source=spans.find(s=>s.start>=feed.start&&s.end<=feed.end&&s.value.id===r.id&&s.value.name===r.name&&s.value.url===r.url);if(!source||!source.raw.includes(r.name))continue;positions.push({id:String(r.id??url.pathname),title:r.name,url:url.toString(),quote:source.raw,open_application:/open application|åpen søknad/i.test(r.name)});}
 return{recognized:true,positions};
}
export function locationContext(text:string,value:string,quote:string){
 const quoteAt=text.indexOf(quote),local=quote.indexOf(value),at=quoteAt>=0?quoteAt+Math.max(0,local):text.indexOf(value),before=at>=0?text.slice(Math.max(0,at-220),at):'',context=before+value;
 const postal=/(?:\bpostboks\s*\d|\bP\.?\s*B\.?\s*\d|\bp\.?\s*o\.?\s*box\s*\d)/i.test(value),labels=[...context.matchAll(/(?<![\p{L}\p{N}_-])(?:besøksadresse|visiting address|visit address|office address|kontoradresse|postadresse|postal address|mailing address|korrespondanseadresse)(?![\p{L}\p{N}_-])/giu)],nearest=labels.at(-1)?.[0]??'';
 if(/besøksadresse|visiting address|visit address|office address|kontoradresse/i.test(nearest)&&!postal)return{location_kind:'visiting_address',operating_location_established:true};
 if(!postal&&/\b(?:vi er etablert i|vi er stasjonert i|we are based in|we are established in)\b/i.test(value)&&!/[0-9]/.test(value))return{location_kind:'reported_company_base',operating_location_established:false};
 if(postal||/postadresse|postal address|mailing address|korrespondanseadresse/i.test(nearest))return{location_kind:'postal_contact',operating_location_established:false};
 if(/(?:^|[\s:])(?:c\s*\/\s*o|co\/|care of)\s*[^\n]{0,90}(?:\n[^\n]{0,70})?$/i.test(before)||/(?:^|[\s:])(?:c\s*\/\s*o|co\/|care of)\s*/i.test(value))return{location_kind:'care_of_address',operating_location_established:false};
 if(/(?:konferansen|conference|arrangementet|seminaret|messen).{0,100}(?:arranger|held|avhold|fant sted|place)|(?:arrangert|avholdt|arrangeres|held)\s+(?:på|at|i)\s*$/i.test(before)&&!/kontor|headquarters|office address|besøksadresse/i.test(before.slice(-100)))return{location_kind:'event_venue',operating_location_established:false};
 if(/(?:\bvi har verksted\b|\bvårt verksted\b|\bour workshop (?:is|in|at)\b)/i.test(value)&&/(?:holder til|verksted.{0,100}(?:i|på|at|in)\s+[\p{L}]|(?:på|i)\s+[\p{L}][^.!?]{0,100}verksted|workshop (?:is located |is based )?(?:in|at)\s+[\p{L}])/iu.test(value))return{location_kind:'company_reported_workshop',operating_location_established:true,establishment_basis:'explicit_company_statement',independent_site_visit:false};
 if(/(?:anlegget vårt|vårt (?:produksjonsanlegg|anlegg)|our (?:production plant|factory|production facility))/i.test(value)&&/(?:produksjonslokaler|produksjonsanlegg|production plant|factory|production facility)/i.test(value)&&/(?:\b(?:på|i|in|at)\s+[\p{L}])/iu.test(value))return{location_kind:'company_reported_production_plant',operating_location_established:true,establishment_basis:'explicit_company_statement',independent_site_visit:false};
 if(!/\b\d{2,}\b/.test(value)&&!/(?:holder til|kontor|avdeling|lokalisert|based in|office|located|headquarters|besøk)/i.test(context)&&(/(?:operer(?:er)?|dekker|kunder|kundene|marked|leverer|serves?|coverage|customers).{0,100}(?:områd|region|i |in |across)/i.test(context)||/^(?:Norge|Norway)\s+(?:og|and)\s+(?:Sverige|Sweden)$/i.test(value.trim())))return{location_kind:'service_area',operating_location_established:false};
 return{};
}

/** Explicit publisher statements are stronger than a basename shared with a tenant/operator. */
export function legalPublishers(text:string){
 const names:string[]=[];
 for(const line of text.split('\n')){
  if(!/©|copyright|opphavsrett/i.test(line))continue;
  let tail=line.replace(/^.*?(?:©|copyright(?:ed)?|opphavsrett)\s*/i,'').replace(/^(?:(?:©|copyright(?:ed)?)\s*|(?:\d{4}|\{currentyear\})\s*[-–:.]?\s*)+/i,'').trim();
  if(/^(?:drift(?:et)? av|konstruert|design(?:et)? av|utviklet av|powered by|website by|webdesign)/i.test(tail))continue;
  tail=tail.replace(/^(?:av|by)\s+/i,'');
  tail=tail.split(/all rights|alle rettigheter|org\.?\s*nr|organisasjonsnummer|\s*\||design|utvikl|webdesign/i)[0]??'';
  for(const part of tail.split(/\s+\/\s+/)){const m=/^(.{2,90}?\b(?:AS|ASA|ANS|DA|LLC|LTD))\b/i.exec(part.trim());if(m)names.push(m[1]!.trim());}
 }
 return [...new Set(names)];
}
export function legalNameKey(name:string){return name.normalize('NFKC').toLocaleLowerCase('nb').replace(/([\p{L}])['’](?=s\b)/gu,'$1').replace(/&/g,' og ').replace(/\s+(as|asa|ans|da|llc|ltd)$/,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();}

export function parkedWebsite(text:string){const lead=text.slice(0,1800);return/(?:domain (?:is )?for sale|(?:\.com|\.no|\.net|\.org) (?:is )?for sale|buy this domain|domenet er til salgs|dette domenet er til salgs|this domain (?:has expired|is parked))/i.test(lead);}
export function sharedLegalPractice(text:string){return /(?:two|multiple|several|to|flere) (?:registered )?(?:legal entities|juridiske enheter)|(?:LLC|Ltd).{0,80}(?:sister entity|søsterselskap)|single practice|selskapene bak (?:merkevaren|brand)/i.test(text);}

/** Obvious representation failures only; passing this is not a semantic judgment. */
export function descriptionRepresentationProblem(value:string):string|undefined{
 const text=value.trim(),sentence=text.replace(/\s+/g,' ');
 if(/^[^.!?]{2,120}\s+(?:ligger|holder til|is located|is based)\s+(?:i|på|in|at)\s+[^.!?]{2,200}\.?$/i.test(sentence)&&!/\b(?:og|and|som|where|hvor|med|with|tilbyr|leverer|provides?|offers?)\b/i.test(sentence))return 'A location-only sentence does not describe business offerings; retain its supported geographic scope in locations';
 if(text.length>60&&/(?:…|\.{3}|\[\s*(?:…|\.{3})\s*\])\s*$/.test(text))return 'A clipped excerpt is not a complete business description; select the complete substantive statement from the source';
 const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
 if(lines.length>=12&&lines.filter(s=>s.length<100).length/lines.length>.8&&!lines.some(s=>/[.!?][”"']?$/.test(s)))return 'A long feature/navigation menu is not a coherent business description; select substantive company prose';
 return undefined;
}

/** Recover actual complete body paragraphs, never finish a clipped sentence by guessing. */
export function completeDescriptionParagraphs(text:string,excerpt:string):string[]{
 if(!descriptionRepresentationProblem(excerpt))return[];
 const body=text.split(/\[Page metadata description\]|\[Links extracted from this page\]|\[Structured data from this page\]/)[0]??'',fold=(s:string)=>s.replace(/\s+/g,' ').trim().toLocaleLowerCase('nb'),prefix=fold(excerpt);
 return [...new Set(body.split('\n').map(s=>s.trim()).filter(s=>s.length>=60&&s.length<=3000&&/[.!?][”"']?$/.test(s)&&!descriptionRepresentationProblem(s)&&prefix.includes(fold(s).slice(0,80))))];
}

/** Explicit unsolicited recruitment invitations, kept as complete literal source lines. */
export function openApplicationPassages(text:string):string[]{
 const body=text.split(/\[Page metadata description\]|\[Structured data from this page\]|\[Links extracted from this page\]/)[0]??'',lines=body.split('\n'),result:string[]=[];
 for(let i=0;i<lines.length;i++){const line=lines[i]!.trim();if(!/(?:åpen\s+søknad|open application)/i.test(line))continue;const invite=/(?:send(?:\s+(?:oss|gjerne|en|din|åpen)){0,5}\s+søknad|welcome.{0,20}applications|send.{0,30}application|vil du jobbe hos oss)/i;
  let passage=line;if(!invite.test(line)&&lines[i+1])passage=line+'\n'+lines[i+1]!.trim();
  if(passage.length>=20&&passage.length<=1200&&invite.test(passage)&&!descriptionRepresentationProblem(passage))result.push(passage);
 }return [...new Set(result)];
}
