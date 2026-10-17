import {readFile, writeFile, open, unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';

const schema=z.object({started_at:z.string().datetime(),attempts:z.array(z.object({directory:z.string(),companies:z.array(z.string().regex(/^\d{9}$/)),code_sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict())}).strict();
/** An expired, corrupt or locked campaign needs diagnosis; never reset it automatically. */
export async function reservePilotCampaign(directory:string,companies:string[],code:string,now=Date.now()){
  const path=resolve(directory,'../quality-pilot-campaign.json'),lock=await open(path+'.lock','wx',0o600);
  try{
    let campaign:z.infer<typeof schema>;
    try{campaign=schema.parse(JSON.parse(await readFile(path,'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;campaign={started_at:new Date(now).toISOString(),attempts:[]};}
    if(now<Date.parse(campaign.started_at)||now-Date.parse(campaign.started_at)>1800000||campaign.attempts.length>=2)throw Error('Pilot campaign budget exhausted: at most two fresh attempts within30minutes; stop and report the failed gate');
    if(campaign.attempts.some(a=>a.companies.some(id=>companies.includes(id))))throw Error('Pilot repair/reuse is development, not a fresh verification attempt');
    campaign.attempts.push({directory,companies,code_sha256:code});
    await writeFile(path,JSON.stringify(campaign,null,2)+'\n',{mode:0o600});
  }finally{await lock.close();await unlink(path+'.lock');}
}
