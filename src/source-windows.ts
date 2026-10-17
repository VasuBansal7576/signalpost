/** Exact substring windows retain qualifiers and facts beyond a long HTML text prefix. */
export function sourceWindows(text:string,maxChars=3500):string[]{
 const candidates:{start:number;end:number;rank:number}[]=[];
 const add=(position:number,before:number,after:number,rank:number)=>candidates.push({start:Math.max(0,position-before),end:Math.min(text.length,position+after),rank});
 add(0,0,650,30);add(text.length,900,0,25);
 const patterns:[RegExp,number,number,number][]=[
  [/(?:besøksadresse|besokadresse|visiting address|visit us|våre kontorer|our offices|postadresse|postal address|arbeidssted)/gi,220,650,130],
  [/\b\d{4}\s+[A-ZÆØÅ][\p{L} .'-]{2,35}/gu,200,320,110],
  [/(?:søknadsfrist|application deadline|we are hiring|vi søker|ledige stillinger|ingen ledige|no open positions|fully staffed|fullt? bemannet)/gi,200,550,120],
  [/\b(?:20\d{2}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}\.?\s+(?:januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|january|february|march|may|june|july|october|december)\s+20\d{2})\b/gi,230,480,100],
  [/(?:we (?:build|provide|deliver|offer)|vi (?:leverer|tilbyr|utvikler|produserer)|[\p{L} ]{3,50} (?:utfører|leverer|tilbyr) )/giu,100,650,90],
  [/(?:organisasjonsnummer|org\.?\s*(?:nr|number)|company registration)/gi,160,450,70]
 ];
 for(const [pattern,before,after,rank]of patterns){let n=0;for(const match of text.matchAll(pattern)){add(match.index,before,after,rank);if(++n>=12)break;}}
 const chosen:{start:number;end:number}[]=[];let used=0;
 for(const c of candidates.sort((a,b)=>b.rank-a.rank||a.start-b.start)){
  const overlaps=chosen.filter(w=>Math.max(w.start,c.start)<Math.min(w.end,c.end));
  const start=Math.min(c.start,...overlaps.map(w=>w.start)),end=Math.max(c.end,...overlaps.map(w=>w.end)),removed=overlaps.reduce((n,w)=>n+w.end-w.start,0),added=end-start-removed;
  if(end<=start||used+added>maxChars)continue;
  for(const window of overlaps)chosen.splice(chosen.indexOf(window),1);
  chosen.push({start,end});used+=added;
 }
 return chosen.sort((a,b)=>a.start-b.start).map(w=>text.slice(w.start,w.end));
}
