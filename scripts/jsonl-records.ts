/** JSONL uses LF records. Preserve Unicode line separators inside JSON strings. */
export async function* jsonlRecords(input:AsyncIterable<string|Uint8Array>){
 const decoder=new TextDecoder();let pending='';
 for await(const chunk of input){pending+=typeof chunk==='string'?chunk:decoder.decode(chunk,{stream:true});let index:number;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index).replace(/\r$/,'');pending=pending.slice(index+1);if(line.trim())yield line;}}
 pending+=decoder.decode();if(pending.trim())yield pending;
}
