import type{Snapshot}from'./domain.ts';
export type EvidenceBlock={kind:'body'|'metadata'|'structured_data'|'navigation_link'|'resource_link';start:number;end:number};
const resource=/\.(?:css|m?js|map|woff2?|ttf|eot|ico|png|jpe?g|gif|webp|avif|svg|mp4|webm|mp3|wav)(?:$|[?#])/i;
/** Offsets always address the unchanged archival readable snapshot. */
export function evidenceBlocks(source:{text:string;extraction_method?:string|undefined}):EvidenceBlock[]{
 const text=source.text;if(!/^public-(?:html|rendered)-text-and-links\//.test(source.extraction_method??''))return[{kind:'body',start:0,end:text.length}];
 const marker='\n\n[Links extracted from this page]\n',links=text.indexOf(marker),end=links<0?text.length:links,blocks:EvidenceBlock[]=[];
 let start=0;for(const [heading,kind]of [['\n\n[Page metadata description]\n','metadata'],['\n\n[Structured data from this page]\n','structured_data']]as const){const at=text.indexOf(heading,start);if(at>=0&&at<end){if(at>start)blocks.push({kind:'body',start,end:at});start=at;const following=kind==='metadata'?text.indexOf('\n\n[Structured data from this page]\n',start+heading.length):-1;const finish=following>=0&&following<end?following:end;blocks.push({kind,start,end:finish});start=finish;}}
 if(start<end)blocks.push({kind:'body',start,end});if(links>=0){let cursor=links+marker.length;for(const line of text.slice(cursor).split('\n')){const finish=cursor+line.length;blocks.push({kind:resource.test(line.trim())?'resource_link':'navigation_link',start:cursor,end:finish});cursor=finish+1;}}
 return blocks.filter(b=>b.end>b.start);
}
export function extractionSpans(source:{text:string;extraction_method?:string|undefined}){const spans:{start:number;end:number}[]=[];for(const b of evidenceBlocks(source).filter(b=>b.kind!=='resource_link')){const previous=spans.at(-1);if(previous&&b.start<=previous.end+1)previous.end=b.end;else spans.push({start:b.start,end:b.end});}return spans;}
