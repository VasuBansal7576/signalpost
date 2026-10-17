import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

test('a production scale batch without semantic evidence is rejected before storage or provider work',()=>{
  const dir=mkdtempSync(join(tmpdir(),'signalpost-quality-'));
  try {
    const input=join(dir,'companies.jsonl');
    writeFileSync(input,Array.from({length:100},(_,i)=>JSON.stringify(String(900000000+i))).join('\n')+'\n');
    for(const mode of [['--keyless'],['--registry-only']]){
      const result=spawnSync(process.execPath,['--import','tsx','src/cli.ts',...mode,'--organisations',input,'--db','/dev/null/quality-test.sqlite'],{encoding:'utf8',timeout:10000});
      assert.equal(result.status,1);
      assert.match(result.stderr,/Quality admission denied:.*pilot/i);
      assert.doesNotMatch(result.stderr,/ENOTDIR|SQLITE_CANTOPEN/);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
