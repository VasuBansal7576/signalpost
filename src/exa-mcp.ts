import{z}from'zod';
import{setTimeout as delay}from'node:timers/promises';
const endpoint='https://mcp.exa.ai/mcp?tools=web_search_advanced_exa,web_fetch_exa';
const rpcSchema=z.object({error:z.object({message:z.string()}).optional(),result:z.object({isError:z.boolean().optional(),content:z.array(z.object({type:z.string(),text:z.string().optional()})),structuredContent:z.unknown().optional()}).optional()});
let slot=0;
export class ExaMcp{
 private listed?:Promise<Set<string>>;private id=0;
 constructor(readonly request:typeof fetch=fetch){}
 async rpc(method:string,params:unknown,signal:AbortSignal){
  const id=++this.id;const wait=Math.max(0,slot-Date.now());slot=Math.max(slot,Date.now())+1500;if(wait)await delay(wait,undefined,{signal});
  const response=await this.request(endpoint,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal});
  if(!response.ok){const blocked=response.status===429&&Number(response.headers.get('retry-after'))>60;const error=new Error(blocked?`Exa MCP access blocked: HTTP429, retry-after ${response.headers.get('retry-after')} seconds`:`Exa MCP HTTP ${response.status}`);if(blocked)error.name='ExaMcpAccessError';throw error;}const raw=await response.text();if(raw.length>4000000)throw new Error('Exa MCP response exceeded 4 MB');
  const messages=raw.trim().startsWith('{')?[JSON.parse(raw)]:raw.split(/\r?\n/).filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
  const message=messages.find(message=>message.id===id);if(!message)throw new Error('Exa MCP response ID missing');if(message.error)throw new Error('Exa MCP: '+String(message.error.message).slice(0,240));return message;
 }
 async tool(name:string,args:Record<string,unknown>,signal:AbortSignal){
  this.listed??=this.rpc('tools/list',{},signal).then(value=>new Set(z.object({result:z.object({tools:z.array(z.object({name:z.string()}))})}).parse(value).result.tools.map(t=>t.name)));
  if(!(await this.listed).has(name))throw new Error(`Exa MCP does not advertise ${name}`);
  for(let attempt=0;attempt<3;attempt++){
   const result=rpcSchema.parse(await this.rpc('tools/call',{name,arguments:args},signal)).result;if(!result)throw new Error('Exa MCP result missing');const text=result.content.filter(c=>c.type==='text').map(c=>c.text??'').join('\n');
   if(!text.trim().startsWith('{')&&/you've hit|rate.?limit|too many requests|quota/i.test(text)){
    if(attempt<2&&!/daily|monthly|credits|upgrade|sign.?up|sign.?in|api.?key/i.test(text)){await delay(2000*(attempt+1),undefined,{signal});continue;}
    throw new Error('Exa MCP provider limit: '+text.slice(0,400));
   }
   if(result.isError)throw new Error('Exa MCP tool error: '+text.slice(0,240));return {text,receipt:result};
  }
  throw new Error('Exa MCP provider limit: retry budget exhausted');
 }
 async execute(kind:string,payload:Record<string,unknown>,signal:AbortSignal){
  if(kind==='search'){
   const contents=z.object({text:z.object({maxCharacters:z.number()}).optional(),maxAgeHours:z.number().optional(),livecrawlTimeout:z.number().optional()}).parse(payload.contents??{});
   const args=Object.fromEntries(Object.entries({...payload,contents:undefined,textMaxCharacters:contents.text?.maxCharacters??24000,maxAgeHours:contents.maxAgeHours??0,livecrawlTimeout:contents.livecrawlTimeout??8000,enableHighlights:false}).filter(([,v])=>v!==undefined));
   const response=await this.tool('web_search_advanced_exa',args,signal),data=z.object({results:z.array(z.object({url:z.string(),text:z.string().nullish(),title:z.string().nullish()}).passthrough())}).passthrough().parse(JSON.parse(response.text));
   return {...data,results:data.results.map(r=>({...r,extraction_method:'exa-mcp-advanced-text/v1'})),costDollars:{total:0},mcp_receipt:response.receipt,transport:'exa-mcp-keyless'};
  }
  const urls=z.array(z.string()).length(1).parse(payload.urls);const response=await this.tool('web_fetch_exa',{urls,maxCharacters:50000},signal);
  const match=/^# ([^\n]*)\r?\nURL: (https:\/\/[^\s]+)[\s\S]*?\r?\n\r?\n([\s\S]*)$/.exec(response.text);if(!match)throw new Error('Exa MCP returned no readable page with a source URL');
  if(new URL(match[2]!).hostname.replace(/^www\./,'')!==new URL(urls[0]!).hostname.replace(/^www\./,''))throw new Error('Exa MCP fetch source host changed');
  return {results:[{url:match[2]!,title:match[1],text:match[3],extraction_method:'exa-mcp-fetch-text/v1'}],costDollars:{total:0},mcp_receipt:response.receipt,transport:'exa-mcp-keyless'};
 }
}
