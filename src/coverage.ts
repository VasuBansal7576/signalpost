import type {Claim,Envelope} from './domain.ts';
export function isNavCheck(c:Claim){return c.field==='hiring'&&c.availability==='available'&&c.qualifiers?.attribution==='nav-complete-index-exact-org';}
export function hasHiringSignal(c:Claim){return c.field==='hiring'&&c.availability==='available'&&(typeof c.value==='object'&&c.value!==null?Number((c.value as Record<string,unknown>).active_ads_attributed)>0:!['explicit_no_open_roles','conflicting_recruitment_statements'].includes(String(c.qualifiers?.hiring_kind)));}
export function hasPopulatedField(profile:Envelope|undefined,field:string){
 return Boolean(profile?.claims.some(c=>{
  if(c.field!==field||c.availability!=='available'||c.value===null||Array.isArray(c.value)&&c.value.length===0)return false;
  if(field==='locations'&&c.qualifiers?.operating_location_established===false)return false;
  const key=field==='workplaces'?'locations':field==='leadership'?'roles':field==='financial_history'?'years':undefined;
  if(key&&typeof c.value==='object'){const items=(c.value as Record<string,unknown>)[key];if(Array.isArray(items)&&items.length===0)return false;}
  return !isNavCheck(c)||hasHiringSignal(c);
 }));
}
export function hiringObservations(profiles:Envelope[]){return {companies_with_verified_nav_query:profiles.filter(p=>p.claims.some(isNavCheck)).length,companies_with_nav_ads:profiles.filter(p=>p.claims.some(c=>isNavCheck(c)&&hasHiringSignal(c))).length,attributed_nav_ads:profiles.reduce((n,p)=>n+p.claims.filter(isNavCheck).reduce((n,c)=>n+Number((c.value as Record<string,unknown>).active_ads_attributed??0),0),0),companies_with_other_recruitment_information:profiles.filter(p=>p.claims.some(c=>c.field==='hiring'&&c.availability==='available'&&!isNavCheck(c))).length,company_wide_no_hiring_claims:0,note:'Completed NAV source checks are separate from populated hiring information and positive recruitment signals.'};}
