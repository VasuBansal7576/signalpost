import{z}from'zod';
// The desktop's connected Exa tools are dispatched by an explicit local relay.
// Only public queries/URLs leave the container; no API key is sent to the relay.
export class ExaConnector{
 constructor(readonly base:string,readonly token:string,readonly request:typeof fetch=fetch){const u=new URL(base);if(u.protocol!=='http:'||!['127.0.0.1','localhost','host.docker.internal'].includes(u.hostname)||u.username||u.password||token.length<32)throw Error('Connected Exa requires an authenticated local relay');}
 async execute(endpoint:string,payload:Record<string,unknown>,run:string,org:string,signal:AbortSignal){
  const r=await this.request(new URL('/source',this.base),{method:'POST',headers:{'content-type':'application/json','x-signalpost-source-token':this.token},body:JSON.stringify({endpoint,payload,run_id:run,organisation_number:org}),signal});if(!r.ok){const e=Error('Connected Exa '+([401,402,403].includes(r.status)?'access blocked: ':'relay ' )+'HTTP '+r.status);if([401,402,403].includes(r.status))e.name='ExaConnectorAccessError';throw e;}
  const result=z.object({results:z.array(z.object({url:z.string(),text:z.string().nullish(),title:z.string().nullish()}).passthrough()),transport:z.literal('exa-connected-service'),cost_reported:z.literal(false),run_id:z.literal(run),organisation_number:z.literal(org),connector_tool_calls:z.number().int().nonnegative(),receipt_ids:z.array(z.string())}).passthrough().parse(await r.json());
  if('costDollars'in result)throw Error('Connected Exa must not invent provider USD costs');
  return {...result,results:result.results.map(r=>({...r,extraction_method:'exa-connected-fetch-markdown/v1'}))};
 }
}
