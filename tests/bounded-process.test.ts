import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {boundedExit} from '../src/bounded-process.ts';
test('a worker ignoring graceful cancellation is killed within the parent watchdog budget',async()=>{
  const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore',detached:process.platform!=='win32'});
  const started=Date.now(),result=await boundedExit(child,100,100,process.platform!=='win32');
  assert.equal(result.timed_out,true);assert.notEqual(result.code,0);assert.ok(Date.now()-started<2000);
});
test('normal exit cancels the watchdog and preserves the actual exit status',async()=>{
  const result=await boundedExit(spawn(process.execPath,['-e','process.exit(3)'],{stdio:'ignore'}),5000);
  assert.equal(result.code,3);assert.equal(result.timed_out,false);
});
