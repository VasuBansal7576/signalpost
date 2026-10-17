/** Dates must occur in the quoted evidence; no model-only calendar inference. */
export function supportedDates(text:string):string[]{
 const results=new Set<string>(),add=(y:string,m:string,d:string)=>{const iso=y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0'),date=new Date(iso+'T00:00:00Z');if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso)results.add(iso);};
 for(const m of text.matchAll(/\b((?:1\d{3}|20\d{2}))-(\d{2})-(\d{2})(?=\b|T\d{2}:)/g))add(m[1]!,m[2]!,m[3]!);
 // Numeric dates use the Norwegian day/month convention, never a guessed US order.
 for(const m of text.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-]((?:1\d{3}|20\d{2}))\b/g))add(m[3]!,m[2]!,m[1]!);
 const groups=[['januar','january','jan'],['februar','february','feb'],['mars','march','mar'],['april','apr'],['mai','may'],['juni','june','jun'],['juli','july','jul'],['august','aug'],['september','sep','sept'],['oktober','october','okt','oct'],['november','nov'],['desember','december','des','dec']];
 const months=new Map(groups.flatMap((names,i)=>names.map(name=>[name,String(i+1)] as const))),names=[...months.keys()].sort((a,b)=>b.length-a.length).join('|');
 for(const m of text.toLowerCase().matchAll(new RegExp('\\b(\\d{1,2})\\.?\\s+('+names+')\\.?\\s+((?:1\\d{3}|20\\d{2}))\\b','g')))add(m[3]!,months.get(m[2]!)!,m[1]!);
 for(const m of text.toLowerCase().matchAll(new RegExp('\\b('+names+')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+((?:1\\d{3}|20\\d{2}))\\b','g')))add(m[3]!,months.get(m[1]!)!,m[2]!);
 return[...results];
}
/** Coarse dates remain coarse; a reported year is never changed into January1. */
export function supportedTemporalDate(text:string,value:string):boolean{
 if(/^(?:1\d{3}|20\d{2})-\d{2}$/.test(value)){const groups=[['januar','january','jan'],['februar','february','feb'],['mars','march','mar'],['april','apr'],['mai','may'],['juni','june','jun'],['juli','july','jul'],['august','aug'],['september','sep','sept'],['oktober','october','okt','oct'],['november','nov'],['desember','december','des','dec']],month=Number(value.slice(5));if(month<1||month>12)return false;const year=value.slice(0,4);return new RegExp('\\b(?:'+groups[month-1]!.join('|')+')\\.?\\s+'+year+'\\b','i').test(text)||new RegExp('\\b'+value+'(?![0-9-])').test(text);}
 if(/^(?:1\d{3}|20\d{2})$/.test(value))return new RegExp('(?:^|[^0-9])'+value+'(?![0-9])').test(text);
 return supportedDates(text).includes(value);
}
export function temporalDateQualifiers(value:string|null,type?:string){
 if(value===null)return{};
 return{date_precision:/^(?:1\d{3}|20\d{2})$/.test(value)?'year':/^(?:1\d{3}|20\d{2})-\d{2}$/.test(value)?'month':'day',date_type:type??'source_date_unclassified'};
}
