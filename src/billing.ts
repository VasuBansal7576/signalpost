import { z } from 'zod';
import type { Store } from './store.ts';

const usageSchema=z.object({steps:z.number(),input_tokens:z.number(),output_tokens:z.number(),cache_read_tokens:z.number(),reported_cost_usd:z.number(),cost_reported_steps:z.number()});
export function recordModelUsage(store:Store,job:string,events:unknown[]){
  const saved=usageSchema.safeParse(store.modelUsage(job));
  const total=saved.success?saved.data:{steps:0,input_tokens:0,output_tokens:0,cache_read_tokens:0,reported_cost_usd:0,cost_reported_steps:0};
  const schema=z.object({type:z.literal('step.completed'),data:z.object({usage:z.object({inputTokens:z.number().optional(),outputTokens:z.number().optional(),cacheReadTokens:z.number().optional(),costUsd:z.number().optional()}).optional()})});
  for(const event of events){const parsed=schema.safeParse(event);if(!parsed.success)continue;const usage=parsed.data.data.usage;total.steps++;total.input_tokens+=usage?.inputTokens??0;total.output_tokens+=usage?.outputTokens??0;total.cache_read_tokens+=usage?.cacheReadTokens??0;if(usage?.costUsd!==undefined){total.reported_cost_usd+=usage.costUsd;total.cost_reported_steps++;}}
  store.saveModelUsage(job,total);
}
export function modelBilling(store:Store,job:string,mode:string){
  const provider=process.env.SIGNALPOST_MODEL_PROVIDER??(process.env.OPENAI_API_KEY?'openai':'chatgpt');
  const parsed=usageSchema.safeParse(store.modelUsage(job));const usage=parsed.success?parsed.data:null;
  if(mode!=='eve')return {cost:0,basis:'none',input:0,output:0};
  if(provider!=='chatgpt'&&(store.modelUsage(job) as {incomplete?:boolean}|undefined)?.incomplete)return {cost:null,basis:'Incomplete provider usage; retain conservative reservation',input:usage?.input_tokens,output:usage?.output_tokens};
  if(provider==='chatgpt')return {cost:0,basis:'subscription; zero incremental model API charge; fixed plan fee excluded',input:usage?.input_tokens,output:usage?.output_tokens};
  if(usage&&usage.steps&&usage.cost_reported_steps===usage.steps)return {cost:usage.reported_cost_usd,basis:'provider reported',input:usage.input_tokens,output:usage.output_tokens};
  const inputRaw=(process.env.SIGNALPOST_MODEL_INPUT_USD_PER_MILLION??'').trim(),outputRaw=(process.env.SIGNALPOST_MODEL_OUTPUT_USD_PER_MILLION??'').trim();
  const input=Number(inputRaw),output=Number(outputRaw);
  if(usage&&inputRaw&&outputRaw&&Number.isFinite(input)&&input>=0&&Number.isFinite(output)&&output>=0)return {cost:(usage.input_tokens*input+usage.output_tokens*output)/1_000_000,basis:'configured token rates; cache discounts excluded',input:usage.input_tokens,output:usage.output_tokens};
  return {cost:null,basis:'API cost unavailable; supply model token rates or a provider that reports cost',input:usage?.input_tokens,output:usage?.output_tokens};
}
