import{test}from'node:test';
import assert from'node:assert/strict';
import{processTreeRss}from'../src/metrics.ts';
test('memory measurement includes owned descendants and excludes unrelated processes',()=>{
 assert.equal(processTreeRss('100 1 200\n 200 100 400\n 300 200 800\n 400 1 9000',100),1400);
});
