import{test}from'node:test';
import assert from'node:assert/strict';
import{Store}from'../src/store.ts';
import{modelBilling,recordModelUsage}from'../src/billing.ts';
test('API billing stays unknown for blank rates and records provider costs or explicit rates',()=>{
 const names=['SIGNALPOST_MODEL_PROVIDER','SIGNALPOST_MODEL_INPUT_USD_PER_MILLION','SIGNALPOST_MODEL_OUTPUT_USD_PER_MILLION'];
 const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));const store=new Store(':memory:');
 try{process.env.SIGNALPOST_MODEL_PROVIDER='openai';process.env.SIGNALPOST_MODEL_INPUT_USD_PER_MILLION='';process.env.SIGNALPOST_MODEL_OUTPUT_USD_PER_MILLION='';
 recordModelUsage(store,'job',[{type:'step.completed',data:{usage:{inputTokens:1000,outputTokens:500}}}]);assert.equal(modelBilling(store,'job','eve').cost,null);
 process.env.SIGNALPOST_MODEL_INPUT_USD_PER_MILLION='1';process.env.SIGNALPOST_MODEL_OUTPUT_USD_PER_MILLION='2';assert.equal(modelBilling(store,'job','eve').cost,.002);
 recordModelUsage(store,'reported',[{type:'step.completed',data:{usage:{inputTokens:1000,outputTokens:500,costUsd:.03}}}]);assert.equal(modelBilling(store,'reported','eve').cost,.03);
 process.env.SIGNALPOST_MODEL_PROVIDER='chatgpt';assert.equal(modelBilling(store,'job','eve').cost,0);
 }finally{store.close();for(const name of names){const value=previous[name];if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
