import {Agent,getGlobalDispatcher,setGlobalDispatcher,type Dispatcher} from 'undici';
let agent:Agent|undefined,previous:Dispatcher|undefined;
/** Avoid Node26's unhandled HTTP2 idle-reaper error; retain TLS verification. */
export function configureHttpTransport(){
 if(agent)return;
 previous=getGlobalDispatcher();agent=new Agent({allowH2:false});setGlobalDispatcher(agent);
}
export async function closeHttpTransport(){
 const owned=agent;agent=undefined;
 if(!owned)return;
 if(previous&&getGlobalDispatcher()===owned)setGlobalDispatcher(previous);
 previous=undefined;await owned.destroy();
}
