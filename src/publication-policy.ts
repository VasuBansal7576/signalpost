/** One temporal admission rule used by fresh, cached and saved proposals. */
export function cutoffDay(value:string|undefined){
 if(value===undefined)return undefined;
 if(!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value))throw Error('Evidence cutoff must be a valid ISO day or UTC timestamp');
 if(value.includes('T')){const timestamp=new Date(value);if(!Number.isFinite(timestamp.getTime())||timestamp.toISOString().slice(0,19)!==value.slice(0,19))throw Error('Evidence cutoff is not a valid UTC timestamp');}
 const day=value.slice(0,10),date=new Date(day+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)throw Error('Evidence cutoff is not a calendar date');
 return day;
}
export function proposalAfterCutoff(effectiveDate:string|null,cutoff:string|undefined){
 const day=cutoffDay(cutoff);return Boolean(day&&effectiveDate&&(effectiveDate.length===4?effectiveDate>day.slice(0,4):effectiveDate.slice(0,10)>day));
}
