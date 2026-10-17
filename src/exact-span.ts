/** Return real source characters; only whitespace differences may be reconciled. */
export function exactWhitespaceSpan(source:string,proposed:string):string|undefined{
 if(!proposed.trim())return;
 if(source.includes(proposed))return proposed;
 const needle=proposed.replace(/\s+/gu,' ').trim();if(!needle)return;
 const segments:{normalizedStart:number;normalizedEnd:number;rawStart:number;rawEnd:number;space:boolean}[]=[],parts:string[]=[];let offset=0;
 for(const match of source.matchAll(/\s+|\S+/gu)){const space=/^\s/u.test(match[0]),part=space?' ':match[0];parts.push(part);segments.push({normalizedStart:offset,normalizedEnd:offset+part.length,rawStart:match.index,rawEnd:match.index+match[0].length,space});offset+=part.length;}
 const index=parts.join('').indexOf(needle);if(index<0)return;const end=index+needle.length,first=segments.find(s=>s.normalizedStart<=index&&s.normalizedEnd>index),last=segments.find(s=>s.normalizedStart<end&&s.normalizedEnd>=end);if(!first||!last)return;
 return source.slice(first.rawStart+(first.space?0:index-first.normalizedStart),last.space?last.rawEnd:last.rawStart+end-last.normalizedStart);
}

/** Select a complete, single-address source statement instead of invented address punctuation. */
export function conciseAddressStatement(quote:string,value:string):string|undefined{
 if(quote.length>200||!/(?:besøksadresse|besokadresse|visiting address|postal address|office address|registered address|\badresse\b)/iu.test(quote))return;
 const postcodes=[...quote.matchAll(/\b\d{4}\b/g)];if(postcodes.length!==1)return;
 const format=(text:string)=>text.replace(/,\s+/gu,' ').replace(/\s+/gu,' ').trim();
 return format(quote).includes(format(value))?quote:undefined;
}
