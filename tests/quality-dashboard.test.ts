import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

test('dashboard refuses scale and stopped subscription launches before queuing company work',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'signalpost-quality-dashboard-')),db=join(dir,'store.sqlite'),guard=join(dir,'guard.json');
  await writeFile(guard,JSON.stringify({reason:'test active capacity stop',automatic_resume:false}));
  const child=spawn(process.execPath,['--import','tsx','src/dashboard.ts'],{env:{...process.env,SIGNALPOST_KEYLESS:'1',SIGNALPOST_DB:db,SIGNALPOST_UI_PORT:'0',SIGNALPOST_SUBSCRIPTION_ADMISSION_GUARD:guard},stdio:['ignore','pipe','pipe']});
  let diagnostics='';child.stderr.on('data',chunk=>{diagnostics+=String(chunk);});
  try{
    const origin=await new Promise<string>((done,reject)=>{
      const timer=setTimeout(()=>reject(Error('Dashboard did not start')),5000);let output='';
      child.stdout.on('data',chunk=>{output+=String(chunk);const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);done(match[0]);}});
      child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(Error('Dashboard exited '+code+': '+diagnostics.slice(0,1200)));});
    });
    const config=await (await fetch(origin+'/api/config')).json() as {token:string};
    const launch=(organisations:string[])=>fetch(origin+'/api/runs',{method:'POST',headers:{'content-type':'application/json','x-signalpost-token':config.token},body:JSON.stringify({run_id:'quality-rejection-test',mode:'eve',organisations})});
    const large=await launch(Array.from({length:100},(_,i)=>String(800000000+i)));assert.equal(large.status,409);assert.match(JSON.stringify(await large.json()),/Quality admission denied/);
    const stopped=await launch(['800000001']);assert.equal(stopped.status,409);assert.match(JSON.stringify(await stopped.json()),/Subscription acquisition is stopped/);
    const store=new DatabaseSync(db,{readOnly:true});try{assert.equal(store.prepare('SELECT count(*) n FROM jobs').get()!.n,0);assert.equal(store.prepare('SELECT count(*) n FROM runs').get()!.n,0);}finally{store.close();}
  }finally{child.kill('SIGTERM');await new Promise<void>(done=>{if(child.exitCode!==null)done();else child.once('exit',()=>done());});await rm(dir,{recursive:true,force:true});}
});
