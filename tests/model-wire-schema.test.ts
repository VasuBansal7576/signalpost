import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zodSchema} from 'ai';
import {extractionOutputSchema} from '../src/model.ts';
test('actual provider extraction JSON schema requires every object property, using nullable wire fields',async()=>{
  const schema=JSON.parse(JSON.stringify(await zodSchema(extractionOutputSchema).jsonSchema));
  function check(node:any,path='root'){
    if(!node||typeof node!=='object')return;
    if(node.properties)for(const key of Object.keys(node.properties))assert.ok(node.required?.includes(key),path+' missing required wire key '+key);
    for(const [key,value] of Object.entries(node))if(value&&typeof value==='object'){if(Array.isArray(value))value.forEach((part,i)=>check(part,path+'/'+key+'/'+i));else check(value,path+'/'+key);}
  }
  check(schema);
});
