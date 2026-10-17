// Run inside Codex functions.exec; set signalpost_relay_run_root first.
// One continuous pool keeps at most 24 source tasks in flight. It does not wait
// for a slow entire batch before dispatching new work. Public HTML text only.
await (async()=>{
 const root=load('signalpost_relay_run_root');if(!root||root.includes('..')||!/^out\/[\w./-]+$/.test(root))throw Error('Set a safe local run root');
 const access=load('signalpost_relay_access')??'out/exa-connector-relay/access.json';if(!/^out\/[\w./-]+\/access\.json$/.test(access)||access.includes('..'))throw Error('Invalid relay access path');const prefix='SIGNALPOST_RELAY_ACCESS='+access+' ';
 const workdir=load('signalpost_relay_workdir');if(typeof workdir!=='string'||!workdir.startsWith('/')||workdir.includes('..'))throw Error('Set an authorized absolute signalpost_relay_workdir');const active=new Set(),until=Date.now()+150*60000;let done=0,failed=0,excluded=0,lastNotice=Date.now(),lastStats=null,fatal=null;
 const isDocumentUrl=value=>{try{return/\.(pdf|docx?|xlsx?|pptx?|csv|zip)(?:$|[?#&])/i.test(decodeURIComponent(String(value)));}catch{return true;}};
 const persist=async(id,reply)=>{const raw=JSON.stringify(reply);let delimiter='SIGNALPOST_REPLY_'+id.replaceAll('-','');while(raw.includes(delimiter))delimiter+='X';return await tools.exec_command({cmd:prefix+'node scripts/exa-connector-client.mjs complete '+id+" <<'"+delimiter+"'\n"+raw+'\n'+delimiter,workdir,sandbox_permissions:'require_escalated',justification:'Record the authorized source result locally; no company answers are edited.',max_output_tokens:120});};
 const processRequest=async req=>{
  if(!/^[a-f0-9-]{36}$/.test(req.id))throw Error('Invalid source request identifier');
  let reply;try{if(req.tool==='fetch'&&req.arguments.urls.some(isDocumentUrl))throw Error('Document download excluded from company HTML discovery');if(req.tool==='search')reply=await tools.mcp__codex_apps__exa_web_search_exa(req.arguments);else if(req.tool==='fetch')reply=await tools.mcp__codex_apps__exa_web_fetch_exa(req.arguments);else throw Error('Unknown relay tool');}catch(e){reply={isError:true,content:[{type:'text',text:String(e)}]};}
  const sourceText=(reply.content??[]).filter(c=>c.type==='text').map(c=>c.text??'').join('\n');if([...sourceText.matchAll(/^URL: (\S+)/gm)].some(m=>isDocumentUrl(m[1]))||/^(?:Content-Type|Mime-Type|Format):[^\n]*(?:application\/pdf|\bPDF\b)/mi.test(sourceText))reply={isError:true,content:[{type:'text',text:'Document redirect excluded; original document text was not retained.'}]};
  if(reply.isError)failed++;reply={isError:Boolean(reply.isError),content:(reply.content??[]).filter(c=>c.type==='text').map(c=>({type:'text',text:c.text??''}))};
  try{await persist(req.id,reply);}catch(error){if(!/unacceptable risk|automatic approval|rejected due to/i.test(String(error)))throw error;excluded++;failed++;notify({source_receipt_excluded:req.id,reason:'Automatic approval review blocked retention. Original content is not saved or retried.'});try{await persist(req.id,{isError:true,content:[{type:'text',text:'Source excluded by automatic approval review; original content not retained or retried.'}]});}catch{notify({source_receipt_excluded:req.id,failure_status_not_saved:true});}}
  done++;
 };
 while(Date.now()<until){
  if(fatal)throw fatal;
  if(active.size<=12){const r=await tools.exec_command({cmd:prefix+'node scripts/exa-connector-client.mjs drain',workdir,sandbox_permissions:'require_escalated',justification:'Dispatch public company queries and source URLs through connected Exa.',max_output_tokens:20000});const queue=JSON.parse(r.output);lastStats=queue.stats;for(const req of queue.requests){let task;task=processRequest(req).then(()=>active.delete(task),error=>{active.delete(task);fatal=error;});active.add(task);}}
  if(Date.now()-lastNotice>=15000){
   const resultFile=load('signalpost_relay_result_file')??'container-result.json';if(!/^[\w.-]+$/.test(resultFile))throw Error('Invalid result filename');
   const status=await tools.exec_command({cmd:`node -e 'const fs=require("fs");const p=process.argv[1];console.log(JSON.stringify({finished:fs.existsSync(p),result:fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null}))' ${root}/${resultFile}`,workdir,max_output_tokens:1200});
   const state=JSON.parse(status.output);text({source_tool_calls_completed:done,tool_errors:failed,excluded_receipts:excluded,in_flight:active.size,relay:lastStats,run_finished:state.finished});lastNotice=Date.now();if(state.finished){await Promise.allSettled([...active]);if(fatal)throw fatal;text(state.result);return;}await yield_control();
  }
  await Promise.race([new Promise(r=>setTimeout(r,350)),...active]);
 }
 await Promise.allSettled([...active]);throw Error('Dispatcher safety deadline reached; preserve the run');
})();
