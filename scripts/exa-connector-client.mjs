import{readFileSync}from'node:fs';
const access=JSON.parse(readFileSync(process.env.SIGNALPOST_RELAY_ACCESS??'out/exa-connector-relay/access.json')),action=process.argv[2];let path='/pending',body;
if(action==='complete'){const id=process.argv[3];if(!/^[a-f0-9-]{36}$/.test(id??''))throw Error('Invalid receipt ID');path='/complete/'+id;body=readFileSync(0,'utf8');JSON.parse(body);}else if(action!=='drain')throw Error('Use drain or complete UUID');
const r=await fetch(new URL(path,access.url),{method:body?'POST':'GET',headers:{'content-type':'application/json','x-signalpost-source-token':access.token},...(body?{body}:{})});if(!r.ok)throw Error('Relay client HTTP '+r.status);console.log(await r.text());
