import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {reservePilotCampaign} from '../src/quality-campaign.ts';
import {hash} from '../src/domain.ts';
test('changing cohort names cannot create an endless pilot repair loop',async()=>{
  const root=await mkdtemp(join(tmpdir(),'signalpost-campaign-')),now=Date.now();
  try{
    await reservePilotCampaign(join(root,'a'),['800000001'],hash('code'),now);
    await assert.rejects(reservePilotCampaign(join(root,'b'),['800000001'],hash('changed code'),now+1),/reuse/);
    await reservePilotCampaign(join(root,'b'),['800000002'],hash('changed code'),now+2);
    await assert.rejects(reservePilotCampaign(join(root,'c'),['800000003'],hash('code'),now+3),/budget exhausted/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('elapsed campaign time and corrupt state cannot silently reset admission',async()=>{
  const root=await mkdtemp(join(tmpdir(),'signalpost-campaign-')),now=Date.now();
  try{
    await reservePilotCampaign(join(root,'a'),['800000001'],hash('code'),now);
    await assert.rejects(reservePilotCampaign(join(root,'b'),['800000002'],hash('code'),now+1800001),/budget exhausted/);
    await writeFile(join(root,'quality-pilot-campaign.json'),'{');
    await assert.rejects(reservePilotCampaign(join(root,'b'),['800000002'],hash('code'),now+1));
  }finally{await rm(root,{recursive:true,force:true});}
});
