import{publicUrl}from'./service.ts';import{onDomain,domain}from'./attribution.ts';
export type ToolReply={isError?:boolean;content?:{type:string;text?:string}[]};
const text=(r:ToolReply)=>{const t=(r.content??[]).filter(c=>c.type==='text').map(c=>c.text??'').join('\n\n');if((r.isError||!/(?:^|\n)(?:Title: |URL: https:)/.test(t))&&/(quota|no.more.credits|rate.limit|credits?.limit|request.limit|(?:error\s*\(|HTTP\s+)(?:401|402|403)\b)/i.test(t))throw Error('Connected Exa access blocked: '+t.slice(0,300));if(r.isError)throw Error('Connected Exa tool failed: '+t.slice(0,300));return t;};
export function connectorHtmlUrl(value:string){const u=publicUrl(value);const parts=[decodeURIComponent(u.pathname),...u.searchParams.values()];if(parts.some(p=>/\.(pdf|docx?|xlsx?|pptx?|csv|zip)(?:$|[?#&])/i.test(p)))throw Error('Document downloads are excluded from company HTML discovery');return u.toString();}
export const connectorUrlKey=(s:string)=>{const u=publicUrl(s);u.hostname=u.hostname.replace(/^www\./,'');u.pathname=u.pathname.replace(/\/$/,'')||'/';return u.toString()};
export function connectorCandidates(reply:ToolReply,excluded:string[],limit:number){
 const body=text(reply),out:{url:string;title:string}[]=[];for(const m of body.matchAll(/^Title: ([^\n]*)\r?\nURL: (https?:\/\/[^\s]+)/gm)){try{const u=connectorHtmlUrl(m[2]!.replace(/^http:/,'https:'));if(!onDomain(domain(u),excluded)&&!out.some(r=>r.url===u))out.push({url:u,title:m[1]!});}catch{}}
 return out.slice(0,limit); // Search highlights are discovery metadata, never evidence.
}
export function connectorPages(reply:ToolReply,expected:string[]){
 const body=text(reply),headers=[...body.matchAll(/^# ([^\n]*)\r?\nURL: ([^\s]+)\r?\n/gm)],out:{url:string;title:string;text:string}[]=[];
 if([...body.matchAll(/^URL: \S+/gm)].length!==headers.length)throw Error('Unrecognized fetch source boundary');
 for(let i=0;i<headers.length;i++){const m=headers[i]!,url=connectorHtmlUrl(m[2]!);const allowed=expected.some(v=>connectorUrlKey(v)===connectorUrlKey(url))||(expected.length===1&&headers.length===1&&domain(expected[0]!)===domain(url));if(!allowed)throw Error('Connected fetch returned an unrequested source');if(out.some(p=>connectorUrlKey(p.url)===connectorUrlKey(url)))throw Error('Ambiguous duplicate source header');const start=m.index!+m[0].length,end=headers[i+1]?.index??body.length,content=body.slice(start,end).replace(/^(?:(?:Author|Published|Published Time|Date|Last[- ]Modified):[^\n]*\r?\n)*(?:\r?\n)/i,'').replace(/(?:^|\n)Error fetching https?:\/\/[^\n]*[\s\S]*$/,'').replace(/\n\n---\s*$/,'').trim();if(content)out.push({url,title:m[1]!,text:content});}
 if(!out.length)throw Error('Connected fetch returned no full source pages');return out;
}
