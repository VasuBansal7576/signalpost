import{collectNurserySurveys}from'./nursery-acquisition.ts';
import type {Envelope,Proposal} from './domain.ts';
import {errorMessage} from './domain.ts';
import type {Job} from './store.ts';
import type {ResearchService} from './service.ts';

// One production path for a bare registry identity: deterministic discovery,
// link recovery, then model extraction. Never acquire model-only facts after the
// sole extraction pass: those pages would otherwise be saved but never read.
export async function acquireCompanyWeb(service:ResearchService,job:Job){
 const errors:Envelope['errors']=[];
 try{await collectNurserySurveys(service,job);}catch(error){errors.push({code:'public_survey_unavailable',message:errorMessage(error)});}
 try{await service.discover(job,false);}catch(error){errors.push({code:'discovery_failed',message:errorMessage(error)});}
 try{await service.completeProfileLinks(job,service.discoveryReserveMs);}catch(error){errors.push({code:'fallback_failed',message:errorMessage(error)});}
 return {errors};
}
export async function researchCompanyWeb(service:ResearchService,job:Job,model:()=>Promise<Proposal[]>){
 const {errors}=await acquireCompanyWeb(service,job);let proposals:Proposal[]=[];
 try{service.store.event(job.run_id,job.organisation_number,'research','Extracting verified company facts with the model');proposals=await model();}catch(error){errors.push({code:'research_failed',message:errorMessage(error)});}
 return{proposals,errors};
}
