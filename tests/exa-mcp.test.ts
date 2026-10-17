import{test}from'node:test';import assert from'node:assert/strict';
import{ExaMcp}from'../src/exa-mcp.ts';
test('keyless MCP discovers advertised tools, sends no key, preserves structured results and separates concurrent IDs',async()=>{
 const calls:{method:string;params:Record<string,unknown>}[]=[];
 const mcp=new ExaMcp(async(_url,init)=>{assert.equal(new Headers(init?.headers).has('x-api-key'),false);assert.equal(new Headers(init?.headers).has('authorization'),false);const req=JSON.parse(String(init?.body));calls.push(req);const result=req.method==='tools/list'?{tools:[{name:'web_search_advanced_exa'},{name:'web_fetch_exa'}]}:{content:[{type:'text',text:JSON.stringify({results:[{url:'https://acme.no',text:'Acme Technology AS Org 999111222'}]})}]};return new Response('data: '+JSON.stringify({jsonrpc:'2.0',id:req.id,result})+'\n\n');});
 const args={query:'A company contact page',numResults:2,contents:{text:{maxCharacters:24000},maxAgeHours:0}};
 const responses=await Promise.all([mcp.execute('search',args,AbortSignal.timeout(5000)),mcp.execute('search',{...args,query:'Another contact page'},AbortSignal.timeout(5000))]);assert.equal(responses.length,2);assert.equal(calls.filter(c=>c.method==='tools/list').length,1);assert.ok(responses.every(r=>r.results[0]?.text?.includes('999111222')&&r.costDollars.total===0));assert.equal((calls.find(c=>c.method==='tools/call')!.params.arguments as Record<string,unknown>).maxAgeHours,0);
});
test('MCP errors and fetch source changes fail closed',async()=>{
 const mcp=new ExaMcp(async(_url,init)=>{const req=JSON.parse(String(init?.body));return Response.json({jsonrpc:'2.0',id:req.id,result:req.method==='tools/list'?{tools:[{name:'web_fetch_exa'}]}:{content:[{type:'text',text:'# Fake\nURL: https://another.no/\n\nUnrelated company'}]}});});await assert.rejects(mcp.execute('contents',{urls:['https://acme.no/']},AbortSignal.timeout(5000)),/source host changed/);
});

test('MCP reports plain-text provider quota responses explicitly instead of a JSON syntax error',async()=>{
 const mcp=new ExaMcp(async(_url,init)=>{const req=JSON.parse(String(init?.body));return Response.json({jsonrpc:'2.0',id:req.id,result:req.method==='tools/list'?{tools:[{name:'web_search_advanced_exa'}]}:{content:[{type:'text',text:"You've hit the free request limit. Try again later."}]}});});
 await assert.rejects(mcp.execute('search',{query:'company'},AbortSignal.timeout(15000)),/Exa MCP provider limit/);
});

test('a long MCP quota reset is classified as access-blocked rather than retried as company absence',async()=>{const mcp=new ExaMcp(async()=>new Response('Daily free-tier limit',{status:429,headers:{'retry-after':'54000'}}));await assert.rejects(mcp.execute('search',{query:'company'},AbortSignal.timeout(5000)),e=>e instanceof Error&&e.name==='ExaMcpAccessError'&&e.message.includes('54000'))});
