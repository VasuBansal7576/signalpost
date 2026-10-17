import type {ChildProcess} from 'node:child_process';

/** Parent watchdog survives a stalled worker/provider. Group mode owns detached children too. */
export function boundedExit(child:ChildProcess,timeoutMs:number,graceMs=5000,processGroup=false) {
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isFinite(graceMs)||graceMs<0)throw Error('Invalid process deadline');
  return new Promise<{code:number|null;signal:NodeJS.Signals|null;timed_out:boolean}>((done,reject)=>{
    let timedOut=false,hard:ReturnType<typeof setTimeout>|undefined;
    const kill=(signal:NodeJS.Signals)=>{try{if(processGroup&&process.platform!=='win32'&&child.pid)process.kill(-child.pid,signal);else child.kill(signal);}catch{}};
    const cleanup=()=>{clearTimeout(timer);if(hard)clearTimeout(hard);};
    const timer=setTimeout(()=>{timedOut=true;kill('SIGTERM');hard=setTimeout(()=>kill('SIGKILL'),graceMs);},timeoutMs);
    child.once('error',error=>{cleanup();kill('SIGKILL');reject(error);});
    child.once('exit',(code,signal)=>{cleanup();if(timedOut&&processGroup)kill('SIGKILL');done({code,signal,timed_out:timedOut});});
  });
}
