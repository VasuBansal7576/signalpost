/** Candidates only; domain spelling never proves company identity. */
export function domainSeeds(name:string):string[]{
 const clean=name.normalize('NFKC').toLocaleLowerCase('nb').replace(/\s+(as|asa|ans|da|nuf|sa|enk)$/,'').replaceAll('æ','ae').replaceAll('ø','o').replaceAll('å','a').normalize('NFKD').replace(/\p{M}/gu,'');
 const words=clean.split(/[^a-z0-9]+/).filter(Boolean),whole=words.join('');if(whole.length<5||whole.length>60||/^\d/.test(whole))return[];
 const generic=new Set(['norsk','norske','norge','nordic','holding','eiendom','invest','bygg','sameiet','borettslag','borettslaget','selskapet','utvikling']);
 const choices=[whole,...(words.length>1&&words[0]!.length>=5&&!generic.has(words[0]!)?[words[0]!]:[])];
 return [...new Set(choices)].slice(0,2).map(host=>'https://www.'+host+'.no/');
}
