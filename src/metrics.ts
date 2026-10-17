import { execFileSync } from 'node:child_process';
export function processTreeRss(text:string,root:number):number {
  const rows=text.trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number)).filter(row=>row.length===3&&row.every(Number.isFinite));
  const owned=new Set([root]);let changed=true;
  while(changed){changed=false;for(const [pid,ppid]of rows)if(pid!==undefined&&ppid!==undefined&&owned.has(ppid)&&!owned.has(pid)){owned.add(pid);changed=true;}}
  return rows.reduce((sum,[pid,,rss])=>sum+(pid!==undefined&&owned.has(pid)?rss??0:0),0);
}
export function monitorMemory(){
  let peak:number|null=null;
  const sample=()=>{try{const output=execFileSync('ps',['-eo','pid=,ppid=,rss='],{encoding:'utf8',timeout:1000});peak=Math.max(peak??0,processTreeRss(output,process.pid));}catch{}};
  sample();const timer=setInterval(sample,2000);timer.unref();
  return {value:()=>peak,stop:()=>clearInterval(timer)};
}
