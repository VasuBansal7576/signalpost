import type {Store} from './store.ts';
export type Rates={input:number;cached:number;write:number;output:number;source:string;as_of:string};
export function modelRates(model:string,provider:string):Rates|undefined{
  const input=process.env.SIGNALPOST_MODEL_INPUT_USD_PER_MILLION,output=process.env.SIGNALPOST_MODEL_OUTPUT_USD_PER_MILLION;
  if(input!==undefined||output!==undefined){
    const configured={input:Number(input),output:Number(output),cached:Number(process.env.SIGNALPOST_MODEL_CACHE_READ_USD_PER_MILLION??input),write:Number(process.env.SIGNALPOST_MODEL_CACHE_WRITE_USD_PER_MILLION??input)};
    if(!Object.values(configured).every(n=>Number.isFinite(n)&&n>=0))throw Error('All configured model prices must be finite nonnegative USD per million tokens');
    return {...configured,source:'configured rates',as_of:process.env.SIGNALPOST_PRICING_DATE??'user-supplied'};
  }
  const normalized=model.replace(/-fast$/,'');let rates:Rates|undefined;
  if(normalized==='gpt-6-luna')rates={input:.1,cached:.01,write:.125,output:.5,source:'https://developers.openai.com/api/docs/models/gpt-6-luna',as_of:'2026-10-16'};
  if(normalized==='claude-haiku-5-5')rates={input:.1,cached:.01,write:.125,output:.5,source:'https://platform.claude.com/docs/en/models/haiku-5-5/overview',as_of:'2026-10-16'};
  if(normalized==='claude-sonnet-5-5')rates={input:2,cached:.2,write:2.5,output:10,source:'https://platform.claude.com/docs/en/models/haiku-5-5/overview',as_of:'2026-10-16'};
  if(normalized==='gpt-6-sol')rates={input:2,cached:.2,write:2.5,output:10,source:'https://developers.openai.com/api/docs/models/gpt-6-sol',as_of:'2026-10-16'};
  if(normalized==='GLM-5.3-Flash'||normalized==='zai/GLM-5.3-Flash')rates={input:.15,cached:.03,write:.15,output:.5,source:'https://docs.z.ai/guides/overview/pricing',as_of:'2026-10-16'};
  if(rates&&model.endsWith('-fast'))return{...rates,input:rates.input*2,cached:rates.cached*2,write:rates.write*2,output:rates.output*2};
  return rates;
}
export function recordNormalizedUsage(store:Store,job:string,raw:unknown,model:string,provider:string){
  const u=raw as {inputTokens?:number;outputTokens?:number;inputTokenDetails?:{cacheReadTokens?:number;cacheWriteTokens?:number};outputTokenDetails?:{reasoningTokens?:number}};
  const old=(store.modelUsage(job)??{}) as Record<string,unknown>;
  const call={input_tokens:u.inputTokens??0,output_tokens:u.outputTokens??0,cache_read_tokens:u.inputTokenDetails?.cacheReadTokens??0,cache_write_tokens:u.inputTokenDetails?.cacheWriteTokens??0,usage_semantics:'inclusive',incomplete:u.inputTokens===undefined||u.outputTokens===undefined};
  const rates=modelRates(model,provider),equivalent=rates?apiEquivalent(call,rates):null;
  const line={provider,model,...call,api_equivalent_usd:equivalent,rates:rates??null};
  const lines=[...(Array.isArray(old.calls)?old.calls:[]),line];
  store.saveModelUsage(job,{steps:Number(old.steps??0)+1,input_tokens:Number(old.input_tokens??0)+call.input_tokens,output_tokens:Number(old.output_tokens??0)+call.output_tokens,cache_read_tokens:Number(old.cache_read_tokens??0)+call.cache_read_tokens,cache_write_tokens:Number(old.cache_write_tokens??0)+call.cache_write_tokens,reasoning_tokens:Number(old.reasoning_tokens??0)+(u.outputTokenDetails?.reasoningTokens??0),reported_cost_usd:Number(old.reported_cost_usd??0),cost_reported_steps:Number(old.cost_reported_steps??0),usage_semantics:'inclusive',incomplete:Boolean(old.incomplete)||call.incomplete,provider,model,calls:lines});
  return equivalent;
}
export function apiEquivalent(raw:unknown,rates:Rates):number|null{
  const u=raw as {input_tokens?:number;output_tokens?:number;cache_read_tokens?:number;cache_write_tokens?:number;incomplete?:boolean;usage_semantics?:string;calls?:{api_equivalent_usd:number|null}[]}|undefined;
  if(!u||u.incomplete||!Number.isFinite(u.input_tokens)||!Number.isFinite(u.output_tokens))return null;
  if(u.calls)return u.calls.every(c=>c.api_equivalent_usd!==null)?u.calls.reduce((n,c)=>n+c.api_equivalent_usd!,0):null;
  const reads=u.usage_semantics==='inclusive'?u.cache_read_tokens??0:0,writes=u.usage_semantics==='inclusive'?u.cache_write_tokens??0:0;
  return(Math.max(0,u.input_tokens!-reads-writes)*rates.input+reads*rates.cached+writes*rates.write+u.output_tokens!*rates.output)/1e6;
}
