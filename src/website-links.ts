import {linksIn} from './attribution.ts';
import{decodeHTMLAttribute}from'entities';
import {parse,type DefaultTreeAdapterMap} from 'parse5';
export function websiteLinks(text:string,base:string){
 const html=/<(?:html|head|body|a|script)\b/i.test(text);
 const candidates=[...(html?[]:linksIn(text)),...(!html?[...text.matchAll(/\[[^\]\n]*\]\(<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\)/g)].map(m=>m[1]??''):[])];
 if(html){const pending:DefaultTreeAdapterMap['node'][]=[parse(text)];while(pending.length){const node=pending.pop()!;if('attrs' in node)for(const a of node.attrs)if(a.name==='data-href'||a.name==='href'&&'tagName'in node&&['a','area'].includes(node.tagName))candidates.push(a.value);if('childNodes' in node)pending.push(...[...node.childNodes].reverse());}}
 for(const script of text.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const walk=(value:unknown):void=>{if(typeof value==='string'&&/^https?:/.test(value))candidates.push(value);else if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')Object.values(value).forEach(walk);};walk(JSON.parse(script[1]!));}catch{}
 }
 return [...new Set(candidates.flatMap(value=>{try{const u=new URL(decodeHTMLAttribute(value),base);if(u.protocol==='http:')u.protocol='https:';u.hash='';return u.protocol==='https:'&&!u.username&&!u.password?[u.toString()]:[];}catch{return [];}}))];
}
export function metadataDescriptions(html:string){
 const descriptions:string[]=[];
 for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){
  const attributes=Object.fromEntries([...tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1]!.toLowerCase(),m[2]??m[3]??'']));
  if(!['description','og:description','twitter:description'].includes((attributes.name??attributes.property??'').toLowerCase()))continue;
  const value=decodeHTMLAttribute(attributes.content??'').replace(/\s+/g,' ').trim();if(value.length>=40&&value.length<=600)descriptions.push(value);
 }
 return [...new Set(descriptions)];
}
export function htmlText(html:string){
 const parts:string[]=[],structured:string[]=[];
 const walk=(node:DefaultTreeAdapterMap['node']):void=>{
  if(node.nodeName==='#text'&&'value' in node){parts.push(node.value);return;}
  if(!('childNodes' in node))return;
  if('tagName' in node){
   if(node.tagName==='script'){const type=node.attrs.find(a=>a.name==='type')?.value;if(type==='application/ld+json'){const text=node.childNodes.filter(n=>'value' in n).map(n=>'value' in n?n.value:'').join('');try{JSON.parse(text);if(text.length<=20000)structured.push(text);}catch{}}return;}
   if(['style','template'].includes(node.tagName))return;
   if(node.tagName==='br')parts.push('\n');else parts.push(' ');
  }
  for(const child of node.childNodes)walk(child);
  if('tagName' in node)parts.push(/^(?:p|div|h[1-6]|li|section|article|tr|footer|header)$/.test(node.tagName)?'\n':' ');
 };
 walk(parse(html));
 const body=parts.join('').replace(/[\p{Zs}\t]+/gu,' ').replace(/(^|\n) +/g,'$1').replace(/ +(?=\n|$)/g,'').replace(/\n\s*\n/g,'\n').trim(),metadata=metadataDescriptions(html);
 return body+(metadata.length?'\n\n[Page metadata description]\n'+metadata.join('\n'):'')+(structured.length?'\n\n[Structured data from this page]\n'+structured.join('\n'):'');
}
