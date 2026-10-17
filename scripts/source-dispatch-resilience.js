// Codex functions.exec host wrapper. Source search/fetch calls are never retried.
// Only local exec commands rejected before launch by an approval-review timeout
// receive the one retry explicitly allowed by that review response.
const sourceTools=tools;
const approvalTimeout=/automatic (?:permission )?approval review did not finish before its deadline/i;
const resilientTools=new Proxy(sourceTools,{get(target,key){if(key!=='exec_command')return Reflect.get(target,key);return async args=>{try{return await target.exec_command(args);}catch(error){if(!approvalTimeout.test(String(error)))throw error;notify({local_approval_timeout:true,action:'Retrying this local command once; no source search/fetch is repeated'});try{return await target.exec_command(args);}catch(second){if(!approvalTimeout.test(String(second)))throw second;throw Error('automatic approval review timed out twice; source retention unavailable, not an unsafe-content determination');}}};}});
await(async(tools)=>{await eval('(async()=>{'+load('signalpost_pump_script')+'})()');})(resilientTools);
