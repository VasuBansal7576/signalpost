import{openaiApiSearch,openaiSearchConfiguration,OpenAiSearchError}from'./openai-search.ts';
import{discoverySearchQuery,discoveryCandidateScore,conflictingPublisherExpansion,identityDiscoveryLink}from'./discovery-planning.ts';
import{freezeEvidence}from'./sealed-evidence-view.ts';
import{sealNavCatalogue}from'./validated-nav-catalogue.ts';
import{cutoffDay,proposalAfterCutoff}from'./publication-policy.ts';
import{exactEntityServiceCatalogues}from'./entity-service-catalogue.ts';
import{exactOrganizationAccounts,exactPressroomSubject}from'./entity-pages.ts';
import{officialApprovalAreas}from'./official-approvals.ts';
import{knownAccessRestriction,publicationRestriction,reviewedAccessRestrictions}from'./source-access-policy.ts';
import{assertSubscriptionAdmission}from'./subscription-admission.ts';
import{seedReputationObservations,verifyReputationObservation}from'./reputation-service.ts';
import{currentSourceVersions,readableVersionKey}from'./source-versions.ts';
import{recruitmentSourceConflict,comparativeMarketingScope,openingHoursStatement,recruitmentPositions,locationContext,sharedLegalPractice,descriptionRepresentationProblem,completeDescriptionParagraphs,openApplicationPassages}from'./semantic-context.ts';
import {dirname,resolve} from 'node:path';
import {preservePublicDocument} from './public-documents.ts';
import {publicPdfUrl} from './public-pdf.ts';
import { isIP } from 'node:net';
import{domainSeeds}from'./domain-seeds.ts';
import{renderPublic,javascriptShell}from'./public-render.ts';
import{nativeSearch,NativeSearchProviderError,NativeSearchResponseError,nativeReceiptComplete}from'./native-search.ts';
import{recordNormalizedUsage}from'./pricing.ts';
import{validationPolicy}from'./policy.ts';
import{ExaConnector}from'./exa-connector.ts';
import {ExaMcp} from './exa-mcp.ts';
import { z } from 'zod';
import { config } from './config.ts';
import { canonical, errorMessage, evidenceFor, hash, materialChanges, now, proposalSchema, researchFields, snapshot, type Claim, type Envelope, type Evidence, type Proposal, type Snapshot } from './domain.ts';
import { Store, type Job } from './store.ts';
import { normalizeFinancials, normalizeHistory, normalizeRoles, normalizeWorkplaces } from './financials.ts';
import { setTimeout as delay } from 'node:timers/promises';
import { modelBilling } from './billing.ts';
import { identityFields } from './identity.ts';
import { restrictedDomains,directoryDomains,recruiterDomains,registeredRecruitmentSubjects,domain, onDomain, linksIn, ownership, explicitEntityFacts,documentAttribution,secondaryContactAttribution,partnerSubjectAttribution,partnerSubjectParagraphs,hiringAttribution,profileAttribution,registryEmailDomain, hiringState, profileUrl, profileMatches,canonicalProfile,namesEntity,hasOrganisationNumber,isRecruiter,isDirectory,brandDomain,addressMatch,fold,type Attribution } from './attribution.ts';
import {publicGet,robotsAllowed,type PublicNetwork} from './public-web.ts';
import {websiteLinks,htmlText} from './website-links.ts';
import {NavFeed,navEmployerOrg,navQuery,type NavCatalogue} from './nav-feed.ts';
import type {RunController} from './runtime.ts';
import {apiEquivalent,modelRates} from './pricing.ts';
import {updateClaimLedger,synthesize} from './claim-ledger.ts';
import {supportedDates,supportedTemporalDate,temporalDateQualifiers} from './dates.ts';
export {hasOrganisationNumber,namesEntity} from './attribution.ts';

let historySlot = 0;
class SourceError extends Error { constructor(readonly status:number){super(`Source returned HTTP ${status}`);} }

const objectSchema = z.record(z.unknown());
const exaResponseSchema = z.object({
  results: z.array(z.object({ url: z.string(), title: z.string().nullish(), text: z.string().nullish(), publishedDate: z.string().nullish(),extras:z.object({links:z.array(z.string()).optional()}).passthrough().optional() }).passthrough()),
  costDollars: z.object({ total: z.number().nonnegative() }).passthrough().optional(),
}).passthrough();
export function publicUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(host) || !host.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) throw new Error('Expected a public HTTPS source URL');
  url.hash = '';
  return url;
}
function permittedContentUrl(value:string):URL{const url=publicUrl(value),restriction=knownAccessRestriction(url.toString());if(restriction)throw Error('Source access policy: '+restriction.reason);return url;}
const hostOf = (url: string) => publicUrl(url).hostname.replace(/^www\./, '');
export function isPublicPdfUrl(value:string){try{const u=publicPdfUrl(value);return /\.pdf$/i.test(u.pathname)||/\/aarsregnskap\/kopi\/\d{9}\/\d{4}$/.test(u.pathname);}catch{return false;}}
export function relevantPdfCandidate(value:string,identity:Record<string,unknown>,verifiedHosts:string[]=[]){
 if(!isPublicPdfUrl(value))return false;const u=publicPdfUrl(value),text=fold(decodeURIComponent(u.hostname+' '+u.pathname)),org=String(identity.organisasjonsnummer??'');
 if(org&&text.includes(org)||verifiedHosts.includes(domain(value))&&/(?:rapport|report|annual|[åa]rs|statement|redegj|certif|godkjen|prospekt|jobb|stilling)/i.test(decodeURIComponent(u.pathname)))return true;
 const tokens=fold(String(identity.navn??'')).split(' ').filter(t=>t.length>=5&&!['holding','invest','stiftelsen','stiftinga','norge','norway','selskap','komite','company'].includes(t));
 const matched=tokens.filter(t=>text.split(' ').includes(t));return matched.length>=2&&matched.length>=Math.ceil(tokens.length*.6)||tokens.length===1&&tokens[0]!.length>=7&&matched.length===1;
}
export class ResearchService {
  private publicationCutoffs=new Map<string,string|undefined>();
  setPublicationCutoff(jobId:string,value:string|undefined){const day=cutoffDay(value??process.env.SIGNALPOST_EVIDENCE_CUTOFF);if(this.publicationCutoffs.has(jobId)&&this.publicationCutoffs.get(jobId)!==day)throw Error('A job cannot change its evidence cutoff; start a new run');this.publicationCutoffs.set(jobId,day);}
  resumeInterruptedUnpaidGets=false;
  runtime?:RunController;
  discoveryReserveMs=90000;
  private rawMetadata=new Map<string,NonNullable<Snapshot['transport']>>();
  private mcp?:ExaMcp;
  private connector?:ExaConnector;
  private providerBlock?:string;
  sourceBlockReason(){return this.providerBlock??null;}
  nativeSearch=nativeSearch;
  apiSearch=(query:string,excluded:string[],signal:AbortSignal)=>openaiApiSearch(query,excluded,signal,this.request);
  directWeb(){return this.settings.exaTransport==='codex'||this.settings.exaTransport==='openai';}
  renderPublic=renderPublic;
  preservePublicDocument=preservePublicDocument;
  navFeed?:NavFeed;
  navCatalogue?:NavCatalogue;
  private identityViews=new Map<string,{revision:number;value:Record<string,unknown>}>();
  private verifiedNavCatalogues=new Map<string,ReturnType<typeof sealNavCatalogue>>();
  constructor(readonly store: Store, readonly settings = config(), readonly request: typeof fetch = fetch, readonly websiteRequest=publicGet) {if(settings.exaBlockedReason)this.providerBlock=settings.exaBlockedReason;}
  async call(job: Job, key: string, kind: 'registry' | 'search' | 'contents'|'html'|'public_feed', cost: number, perform: () => Promise<unknown>): Promise<unknown> {
    const existing = this.store.call(job.id, key);
    if (existing?.state === 'completed') return existing.body;
    if (existing) {
      // A previously completed unpaid continuation is evidence, not a new retry.
      const resumed=kind!=='search'&&cost===0&&!key.includes('#resume-unpaid=1')?this.store.call(job.id,key+'#resume-unpaid=1'):undefined;
      if(resumed)return this.call(job,key+'#resume-unpaid=1',kind,cost,perform);
      if(existing.state==='pending'){
        if(this.resumeInterruptedUnpaidGets&&this.directWeb()&&kind!=='search'&&cost===0&&!key.includes('#resume-unpaid=1')){
          this.store.event(job.run_id,job.organisation_number,'resume_unpaid_get','Resume interrupted public GET once; original pending receipt retained');
          return this.call(job,key+'#resume-unpaid=1',kind,cost,perform);
        }
        throw new Error('Interrupted request is recorded; not automatically repeating a possibly billed call');
      }
      const previous=z.object({error:z.string()}).safeParse(existing.body),status=previous.success?/HTTP (\d{3})/.exec(previous.data.error):null;
      if(status)throw new SourceError(Number(status[1]));
      throw new Error(previous.success?previous.data.error:'Previous request failed; inspect the run report');
    }
    this.runtime?.check();
    if (job.deadline_at && Date.now() >= Date.parse(job.deadline_at)) throw new Error('Company deadline reached');
    const limit = kind === 'search' ? this.settings.maxSearches : kind === 'contents' ? this.settings.maxPages : kind==='html'?(this.directWeb()?2*(this.settings.maxPages+this.settings.maxSearches*(this.settings.searchResults??4)+2):this.settings.maxPages*2):20;
    this.store.reserve(job.id, key, kind, cost, this.settings.maxExaUsd, limit);
    this.store.event(job.run_id,job.organisation_number,kind,`Request started: ${kind==='registry'?key:kind}`);
    try {
      const body = await perform();
      const measured = z.object({ costDollars: z.object({ total: z.number().nonnegative() }) }).safeParse(body);
      this.store.settle(job.id, key, body, 'completed', measured.success ? measured.data.costDollars.total : undefined);
      return body;
    } catch (error) {
      this.store.settle(job.id, key, { error: errorMessage(error),...((error instanceof NativeSearchProviderError||error instanceof NativeSearchResponseError||error instanceof OpenAiSearchError)&&error.diagnostic?{provider_diagnostic:error.diagnostic}:{}) }, 'failed');
      throw error;
    }
  }
  async json(url: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.request(url, { ...init, redirect: 'error', signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
    if (!response.ok) throw new SourceError(response.status);
    const raw=response.headers.get('x-signalpost-raw-sha256'),retrieved=response.headers.get('x-signalpost-retrieved-at');if(raw&&retrieved)this.rawMetadata.set(url,{raw_sha256:raw,retrieved_at:retrieved,final_url:url});
    return response.json();
  }
  async registryCall(job:Job,url:string,perform:()=>Promise<unknown>){
    // A completed later unpaid GET remains authoritative even if the first cached attempt timed out.
    // Retain both receipts and never repeat the earlier request during source-only replay.
    const first=this.store.call(job.id,url),retry=this.store.call(job.id,url+'#retry=1');
    if(first?.state!=='completed'&&retry)return this.call(job,url+'#retry=1','registry',0,perform);
    try{return await this.call(job,url,'registry',0,perform);}catch(error){
      const retryable=error instanceof SourceError?[429,500,502,503,504].includes(error.status):error instanceof TypeError||error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);
      if(!retryable||job.deadline_at&&Date.parse(job.deadline_at)-Date.now()<1500)throw error;
      this.store.event(job.run_id,job.organisation_number,'registry_retry',`Retrying unpaid registry GET once after ${errorMessage(error)}`);
      await delay(500,undefined,{signal:this.signal(job)});
      return this.call(job,url+'#retry=1','registry',0,perform);
    }
  }
  async publicCall(job:Job,key:string,perform:()=>ReturnType<typeof publicGet>){
    const retryKey=key+'#retry=1',first=this.store.call(job.id,key),retry=this.store.call(job.id,retryKey);
    if(first?.state!=='completed'&&retry?.state==='completed')return retry.body as Awaited<ReturnType<typeof publicGet>>;
    const request=async()=>{const response=await perform();if([429,500,502,503,504].includes(response.status))throw new SourceError(response.status);return response;};
    try{return await this.call(job,key,'html',0,request) as Awaited<ReturnType<typeof publicGet>>;}catch(error){
      const transient=error instanceof SourceError?[429,500,502,503,504].includes(error.status):error instanceof Error&&(/timed out|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(error.message)||['TimeoutError','AbortError'].includes(error.name));
      if(!transient||this.signal(job).aborted||job.deadline_at&&Date.parse(job.deadline_at)-Date.now()<1500)throw error;
      this.store.event(job.run_id,job.organisation_number,'public_retry','Retry unpaid transient public GET once; original receipt retained');
      await delay(250,undefined,{signal:this.signal(job)});
      return this.call(job,retryKey,'html',0,request) as Promise<Awaited<ReturnType<typeof publicGet>>>;
    }
  }
  researchTime(job:Job,reserveMs=this.discoveryReserveMs,requestMs=this.directWeb()?15000:this.settings.exaTransport==='connector'?45000:20000){return !this.runtime?.signal.aborted&&(!job.deadline_at||Date.parse(job.deadline_at)-Date.now()>reserveMs+requestMs);}
  save(job: Job, url: string, text: string, sourceClass: Snapshot['source_class']) {
    const preserved = this.store.evidenceView(job.id).find(s => s.source_url === url && s.text === text && (s.source_class === sourceClass||sourceClass==='external'&&s.source_class==='company_owned'));
    if (preserved) return structuredClone(preserved);
    const source = snapshot({ source_url: url, source_class: sourceClass, text, organisation_number: job.organisation_number, run_id: job.run_id });
    const raw=this.rawMetadata.get(url);if(raw)source.transport=raw;
    this.store.saveSnapshot(job.id, source);
    return source;
  }
  async registry(job: Job, bulk?: Record<string, unknown>, bulkSource?: string): Promise<{ claims: Claim[]; evidence: Evidence[]; errors: Envelope['errors'] }> {
    const claims: Claim[] = [], evidence: Evidence[] = [], errors: Envelope['errors'] = [];
    const org = job.organisation_number;
    const endpoints = [
      ['identity', `https://data.brreg.no/enhetsregisteret/api/enheter/${org}`],
      ['annual_accounts', `https://data.brreg.no/regnskapsregisteret/regnskap/${org}`],
      ['leadership', `https://data.brreg.no/enhetsregisteret/api/enheter/${org}/roller`],
      ['workplaces', `https://data.brreg.no/enhetsregisteret/api/underenheter?overordnetEnhet=${org}&size=1000`],
      ['financial_history', `https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/${org}/aar`],
      ['group_structure', `https://data.brreg.no/enhetsregisteret/api/konsernstruktur/${org}`],
    ] as const;
    for (const [field, url] of endpoints) {
      try {
        const body = field === 'identity' && bulk ? bulk : await this.registryCall(job, url, async () => {
          if(field==='financial_history') {const wait=Math.max(0,historySlot-Date.now());historySlot=Math.max(Date.now(),historySlot)+2100;await delay(wait,undefined,{signal:this.runtime?.companySignal(job)??this.signal(job)});}
          return this.json(url, { signal: this.signal(job) });
        });
        if (field === 'identity') {
          const identity = objectSchema.parse(body);
          if (String(identity.organisasjonsnummer ?? identity.organisation_number ?? '') !== org) throw new Error('Registry identity mismatch');
        }
        const source = this.save(job, field === 'identity' && bulk && bulkSource ? bulkSource : url, JSON.stringify(body), 'public_registry');
        if (field === 'identity') {
          const record = objectSchema.parse(body);
          for (const [name, value] of Object.entries(identityFields(record))) {
            if (value === undefined || value === null || value === '') continue;
            const encoded=JSON.stringify(value),span=source.text.includes(encoded)?encoded:source.text;
            const item = evidenceFor(source, span); evidence.push(item);
            claims.push({ field: name, value, availability: 'available', confidence: null, evidence_ids: [item.id],...(name==='registered_postal_address'?{qualifiers:{source_scope:'registered_company_postal_contact',operating_location_established:false}}:{}) });
          }
        } else if(field==='annual_accounts') {
          const normalized=normalizeFinancials(body,org,source);claims.push(...normalized.claims);evidence.push(...normalized.evidence);
          for(const warning of normalized.warnings)errors.push({code:'financial_normalization',message:warning});
        } else {
          const value=field==='financial_history'?normalizeHistory(body,org):field==='leadership'?normalizeRoles(body):field==='workplaces'?normalizeWorkplaces(body,org):body;
          // Keep original registry evidence private. Publish a labelled projection,
          // with its own hash and explicit derivation, rather than birth dates.
          const publishedSource=field==='leadership'?this.publicRolesSource(job,source):source;
          const item = evidenceFor(publishedSource, publishedSource.text); evidence.push(item);
          const collection=field==='leadership'?(value as ReturnType<typeof normalizeRoles>).roles:field==='workplaces'?(value as ReturnType<typeof normalizeWorkplaces>).locations:field==='financial_history'?(value as ReturnType<typeof normalizeHistory>).years:value;
          const empty = value===null || (Array.isArray(collection)&&!collection.length&&!(field==='leadership'&&(value as ReturnType<typeof normalizeRoles>).inactive_registered_relations.length));
          claims.push({ field, value: empty ? null : value, availability: empty ? 'not_available' : 'available', confidence: null, evidence_ids: [item.id] });
        }
      } catch (error) {
        const message = errorMessage(error);
        const absent=error instanceof SourceError&&[404,410].includes(error.status);
        claims.push({ field:field==='annual_accounts'?'financials':field, value: null, availability:absent?'not_available':/HTTP (401|403|429)/.test(message)?'blocked':'failed', confidence: null, evidence_ids: [] });
        if(!absent)errors.push({ code: `registry_${field}`, message });
      }
    }
    return { claims, evidence, errors };
  }
  identity(job: Job):Record<string,unknown>|undefined {
    const revision=this.store.artifactRevision('evidence',job.id),cached=this.identityViews.get(job.id);if(cached?.revision===revision)return cached.value;
    const source = this.identitySource(job);
    if(!source)return undefined;
    const raw=objectSchema.parse(JSON.parse(source.text));
    const row=this.store.db.prepare("SELECT body FROM snapshots WHERE job=? AND json_extract(body,'$.source_class')='public_registry' AND json_extract(body,'$.source_url') LIKE 'https://data.brreg.no/enhetsregisteret/api/underenheter?%' LIMIT 1").get(job.id);
    let workplace_addresses:unknown[]=[];
    if(row){try{const saved=JSON.parse(z.object({body:z.string()}).parse(row).body);workplace_addresses=normalizeWorkplaces(JSON.parse(saved.text),job.organisation_number).locations.map(place=>place.address);}catch{}}
    const correspondence_address=raw.postadresse??Object.fromEntries(['adresse','postnummer','poststed'].flatMap(key=>{const value=raw['postadresse.'+key];return value?[[key,key==='adresse'?[String(value)]:value]]:[];}));
    const value=freezeEvidence({...raw,forretningsadresse:identityFields(raw).registered_address,correspondence_address,workplace_addresses});if(this.identityViews.size>=16)this.identityViews.delete(this.identityViews.keys().next().value!);this.identityViews.set(job.id,{revision,value});return value;
  }
  identitySource(job: Job):Snapshot|undefined {const row=this.store.db.prepare("SELECT body FROM snapshots WHERE job=? AND json_extract(body,'$.source_class')='public_registry' AND (json_extract(body,'$.source_url')=? OR json_extract(body,'$.source_url') LIKE 'urn:signalpost:bulk:%') ORDER BY rowid LIMIT 1").get(job.id,`https://data.brreg.no/enhetsregisteret/api/enheter/${job.organisation_number}`);return row?JSON.parse(z.object({body:z.string()}).parse(row).body):undefined;}
  signal(job: Job) { const timeout=AbortSignal.timeout(Math.max(1, Math.min(20_000, job.deadline_at ? Date.parse(job.deadline_at) - Date.now() : 20_000)));return this.runtime?AbortSignal.any([timeout,this.runtime.signal]):timeout; }
  context(jobId: string,limit=8) {
    const job = this.store.job(jobId);
    const rank=(s:Snapshot)=>{
      const path=new URL(s.source_url).pathname,explicitCareer=/(career|karriere|stilling|jobb-hos-oss|\/jobs?\/|vacanc)/i.test(path),recruitment=explicitCareer||/(we are hiring|vi søk(?:er|jer)|åpen søknad|søknadsfrist|apply with|recruitment)/i.test(s.text.slice(0,s.text.indexOf('[Links extracted')>0?s.text.indexOf('[Links extracted'):undefined));
      const about=/(?:^|\/)(?:about(?:-us)?|om(?:-oss|-[^/]+)?|tenester|tjenester|services|produkter|products)(?:\/|$)/i.test(path),contact=/(?:kontakt|contact|locations|lokasjon|avdelinger)/i.test(path),root=/^\/(?:(?:no|nb|nn|en)\/?)?$/.test(path);
      return Number(recruitment&&this.attribution(job,s,'hiring').accepted)*(explicitCareer?45:15)+Number(this.attribution(job,s,'official_website').accepted)*20+Number(hasOrganisationNumber(s.text,job.organisation_number))*8+Number(s.text.length>=120)+Number(about)*35+Number(contact)*25+Number(root)*15+Number(/(aktuelt|news|nyhe|\/b\/)/i.test(path))*5+Number(Boolean(s.document)&&this.attribution(job,s,'business_description').accepted)*(20+Number(/(?:navn p[åa] virksomheten|viktigste merker|beskrivelse av virksomheten)/i.test(s.text))*25+Number(supportedDates(s.text).length>0)*10)-Number(/(privacy|personvern|legal|cookies|terms)/i.test(path))*50;
    };
    const unique=new Map<string,Snapshot>();
    for(const source of currentSourceVersions(this.store.evidenceView(jobId))){
      if(source.source_class==='public_registry'||['public-html-links/v1','public-rendered-html/v1','nav-feed-index-query/v1','nav-feed-json/v1'].includes(source.extraction_method??'')||/\/(arkiv|archives?|archiv)\/.*(stilling|career|job|vacanc)/i.test(source.source_url))continue;
      const url=new URL(source.source_url);url.hostname=url.hostname.replace(/^www\./,'');if(!source.document)url.hash='';url.pathname=url.pathname.replace(/\/$/,'')||'/';
      const key=source.document?'document:'+source.document.raw_sha256+'#page='+source.document.page_number:readableVersionKey(source)??url.toString(),previous=unique.get(key);
      if(!previous||source.text.length>previous.text.length)unique.set(key,source);
    }
    const sources=[...unique.values()].map(source=>({source,rank:rank(source)})).sort((a,b)=>b.rank-a.rank||a.source.source_url.length-b.source.source_url.length).slice(0,limit).map(item=>item.source);
    return { job, identity: this.identity(job), usage: this.store.usage(job.id), limits: { searches: this.settings.maxSearches, pages: this.settings.maxPages }, fields: researchFields, discovered_sources:sources.map(s=>this.sourceContext(job,s,1600)), saved_proposals:this.store.proposals(jobId).map(p=>{const c=proposalSchema.parse(p);return {field:c.field,snapshot_id:c.snapshot_id,...(c.field==='company_owned_profiles'?{value:c.value}:{})};}), note:'Fresh full-page text is already saved. Inspect snapshot IDs without network calls. Code-saved proposals need not be repeated. Prioritize current hiring and company-owned links, then complete descriptions, locations and actual dated company events from attributed pages. Raw HTML and NAV receipts are omitted here to avoid duplicate/noisy context. Search snippets/titles alone are not evidence.' };
  }
  async exa(job: Job, endpoint: string, payload: Record<string, unknown>, cost: number, kind: 'search' | 'contents') {
    if(this.directWeb())throw Error('Keyless mode never invokes Exa; use native search and direct public retrieval');
    if(this.providerBlock)throw new Error(this.providerBlock);
    if(this.settings.exaTransport==='mcp'){this.mcp??=new ExaMcp(this.request);try{return exaResponseSchema.parse(await this.call(job,hash('mcp\n'+endpoint+'\n'+canonical(payload)),kind,0,()=>this.mcp!.execute(endpoint,payload,this.signal(job))));}catch(error){if(error instanceof Error&&error.name==='ExaMcpAccessError')this.providerBlock=error.message;throw error;}}
    if(this.settings.exaTransport==='connector'){
      this.connector??=new ExaConnector(this.settings.exaRelayUrl??'',this.settings.exaRelayToken??'',this.request);
      try{return exaResponseSchema.parse(await this.call(job,hash('connector\n'+endpoint+'\n'+canonical(payload)),kind,0,()=>this.connector!.execute(endpoint,payload,job.run_id,job.organisation_number,AbortSignal.timeout(Math.max(1,Math.min(45000,job.deadline_at?Date.parse(job.deadline_at)-Date.now():45000))))));}catch(error){if(error instanceof Error&&error.name==='ExaConnectorAccessError')this.providerBlock=error.message;throw error;}
    }
    if(this.providerBlock)throw new Error(this.providerBlock);
    if (!this.settings.exaKey) throw new Error('Set EXA_API_KEY in .env to enable live web research');
    try{return exaResponseSchema.parse(await this.call(job, hash(`${endpoint}\n${canonical(payload)}`), kind, cost, () => this.json(`https://api.exa.ai/${endpoint}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': this.settings.exaKey ?? '' }, body: JSON.stringify(payload), signal: this.signal(job),
    })));}catch(error){if(error instanceof SourceError&&[401,402].includes(error.status))this.providerBlock=`Exa API access blocked: HTTP ${error.status}. This is a provider access failure, not missing company evidence.`;throw error;}
  }
  async search(jobId: string, query: string,purpose:'website'|'hiring'|'identity'|'general'='general') {
    const job = this.store.job(jobId);
    if(this.directWeb())return this.keylessSearch(job,query,purpose);
    const response = await this.exa(job, 'search', { query, type: 'auto', userLocation:'NO', numResults:this.settings.searchResults??8, excludeDomains:[...restrictedDomains,...reviewedAccessRestrictions.map(r=>r.host),...(['website','hiring'].includes(purpose)?directoryDomains:[])],contents: { text:{maxCharacters:24000,verbosity:'full',includeSections:['header','navigation','body','footer','metadata']},extras:{links:100},maxAgeHours:0,livecrawlTimeout:8000 } }, 0.007, 'search');
    const candidates:{url:string;title:string|null|undefined;snapshot_id?:string}[]=[];
    for(const result of response.results){
      try{permittedContentUrl(result.url);if(onDomain(domain(result.url),restrictedDomains))continue;
        const source=result.text?this.ingest(job,result):undefined;
        candidates.push({url:result.url,title:result.title,...(source?this.sourceContext(job,source,1000):{})});
      }catch{ /* Invalid URLs and unreadable results remain unverified. */ }
    }
    this.seedProposals(job);
    return { candidates, usage: this.store.usage(job.id), note: 'Only preserved full-page text, not search titles or highlights, can support claims. Inspect snapshot_id for longer text. Ownership and employer identity are checked independently.' };
  }
  async keylessSearch(job:Job,query:string,purpose:'website'|'hiring'|'identity'|'general'){
    query=discoverySearchQuery(query,this.identity(job)??{},purpose);
    const api=this.settings.exaTransport==='openai',apiConfig=api?openaiSearchConfiguration():undefined,provider=api?'openai':'chatgpt',model=apiConfig?.model??'gpt-6-luna',toolFee=apiConfig?.fee??.01,rates=modelRates(model,provider);
    if(api&&!rates)throw Error('Declare model token prices before OpenAI API discovery');
    if(!api&&this.nativeSearch===nativeSearch)assertSubscriptionAdmission();
    if(this.providerBlock)throw Error(this.providerBlock);
    const excluded=[...restrictedDomains,...reviewedAccessRestrictions.map(r=>r.host),...(['website','hiring'].includes(purpose)?directoryDomains:[])];
    const receipt=await this.call(job,hash((api?'openai-api-search/v1\n'+model+'\n':'codex-native-search/v1\n')+query),'search',0,async()=>{
      const available=job.deadline_at?Date.parse(job.deadline_at)-Date.now()-this.discoveryReserveMs:45000;if(available<=0)throw Error('Discovery stopped to preserve extraction and verification time');const signal=AbortSignal.any([this.runtime?.companySignal(job)??this.signal(job),AbortSignal.timeout(Math.max(1,Math.min(45000,available)))]);const perform=async()=>{const quota=await this.runtime?.modelQuota(40000,signal);
      const reservation=api?(40000*rates!.input+1024*rates!.output)/1e6:.03,toolReservation=toolFee;
      this.store.reserveResource(job.run_id,'model_api_equivalent_usd',reservation,this.runtime?.limits.modelEquivalentUsd??10);
      this.store.reserveResource(job.run_id,'search_api_equivalent_usd',toolReservation,Number(process.env.SIGNALPOST_MAX_SEARCH_EQUIVALENT_USD??100));
      try{const r=await (api?this.apiSearch(query,excluded,signal):this.nativeSearch(query,excluded,signal)),u=r.usage as {inputTokens?:number;outputTokens?:number};if(quota&&u.inputTokens!==undefined&&u.outputTokens!==undefined)this.runtime?.settleModelQuota(quota,u.inputTokens+u.outputTokens);const price=recordNormalizedUsage(this.store,job.id,r.usage,model,provider);
        if(price!==null)this.store.settleResource(job.run_id,'model_api_equivalent_usd',reservation,price);
        const complete=nativeReceiptComplete({...r,model_api_equivalent_usd:price});if(complete)this.store.settleResource(job.run_id,'search_api_equivalent_usd',toolReservation,r.search_calls*toolFee);
        this.store.operation(job.run_id,job.organisation_number,{stage:'native_search_receipt',...r,usage:undefined,sources:undefined,source_count:r.sources.length,model_api_equivalent_usd:price,known_search_api_equivalent_usd:r.search_calls*toolFee,search_api_equivalent_usd:complete?r.search_calls*toolFee:null,provider,model,incremental_api_bill_usd:api?null:0});return r;
      }catch(error){if(error instanceof NativeSearchProviderError||error instanceof OpenAiSearchError&&[400,401,402,403,429].includes(error.status??0)){this.providerBlock=error.message;this.runtime?.stop(error.message);}const old=this.store.modelUsage(job.id)??{};this.store.saveModelUsage(job.id,{...(old as object),incomplete:true});throw error;}
      };return this.runtime?this.runtime.providerExecution(provider,signal,perform):perform();
    }) as Awaited<ReturnType<typeof nativeSearch>>;
    if(receipt.rejected||receipt.search_calls!==1)throw Error(receipt.rejected??'Native search did not return exactly one tool call');
    const candidates:{url:string;title:string;snapshot_id?:string}[]=[],documents:{url:string;title:string;snapshot_id?:string}[]=[];
    const verifiedHosts=this.store.evidenceView(job.id).filter(s=>this.attribution(job,s,'official_website').accepted).map(s=>domain(s.source_url));
    const identity=this.identity(job)??{},candidateRank=(value:string)=>discoveryCandidateScore(value,identity,purpose,verifiedHosts)-Number(isDirectory(value))*5;
    // Ranking allocates fetch budget only; exact legal attribution still runs on
    // independently retrieved full text before any fact can be published.
    const ranked=[...receipt.sources].sort((a,b)=>candidateRank(b)-candidateRank(a));
    for(const value of ranked){try{const url=publicUrl(value.replace(/^http:/,'https:')).toString();if(onDomain(domain(url),excluded)||/\.(docx?|xlsx?|zip|png|jpe?g|svg)(?:$|[?#])/i.test(url)||candidates.some(c=>c.url===url)||documents.some(c=>c.url===url))continue;if(isPublicPdfUrl(url)){if(documents.length<1&&relevantPdfCandidate(url,this.identity(job)??{},verifiedHosts))documents.push({url,title:''});}else if(candidates.length<(this.settings.searchResults??4))candidates.push({url,title:''});}catch{}}
    candidates.push(...documents);
    // Tool snippets and generated prose never enter the evidence store.
    for(const candidate of candidates){if(!this.researchTime(job,this.discoveryReserveMs,15000))break;try{const page=await this.read(job.id,candidate.url,'full',true);candidate.snapshot_id=page.snapshot_id;}catch(error){this.store.event(job.run_id,job.organisation_number,'keyless_fetch','Candidate unavailable: '+errorMessage(error));}}
    return {candidates,usage:this.store.usage(job.id),note:'Native subscription search URLs are candidates only; facts require independently preserved permitted public HTML and exact-entity verification.'};
  }
  ingest(job:Job,result:z.infer<typeof exaResponseSchema>['results'][number],navigation=false){
    const links=[...new Set((result.extras?.links??[]).flatMap(link=>{try{const resolved=new URL(link,result.url);if(resolved.protocol==='http:')resolved.protocol='https:';return [publicUrl(resolved.toString()).toString()];}catch{return [];}}))];
    const text=result.text!+(links.length?'\n\n[Outbound links extracted by Exa from this page]\n'+links.join('\n'):'');
    const source=this.save(job,permittedContentUrl(result.url).toString(),text,'external');
    source.extraction_method=typeof result.extraction_method==='string'?result.extraction_method:navigation?'exa-navigation-and-links/v2':links.length?(result.extras?.links?.some(link=>!/^https:\/\//.test(link))?'exa-text-and-resolved-links/v3':'exa-text-and-links/v2'):'exa-text-extractive/v1';
    this.store.db.prepare('UPDATE snapshots SET body=? WHERE id=? AND job=?').run(JSON.stringify(source),source.id,job.id);
    return source;
  }
  attribution(job:Job,source:Snapshot,field:Proposal['field']):Attribution{
    const identity=this.identity(job)??{},allSources=currentSourceVersions(this.store.evidenceView(job.id)),restriction=publicationRestriction(source,allSources);if(restriction)return{accepted:false,kind:'source-policy-blocked',support:[],reason:'Source access policy: '+restriction.reason};const sources=allSources.filter(s=>!publicationRestriction(s,allSources));
    if(readableVersionKey(source)!==null&&!sources.some(s=>s.id===source.id))return{accepted:false,kind:'superseded-source-version',support:[],reason:'A newer successful readable version of this URL is preserved; an older body cannot establish the current projection'};
    if(source.document){if(!['business_description','locations','public_activity'].includes(field))return {accepted:false,kind:'unresolved',support:[],reason:'PDF subjects do not establish official websites, social account ownership or current hiring'};return documentAttribution(source,identity,sources);}
    const pressroom=exactPressroomSubject(source,identity,sources);if(pressroom&&['business_description','official_website','company_owned_profiles','locations'].includes(field))return{accepted:true,kind:'exact-entity-declared-pressroom',scope:'entity_page',support:[pressroom.proof],reason:'Permitted pressroom identifies the full legal entity and its exact current registered managing director; only this declared subject/profile is supported, not platform ownership'};
    if(field==='locations'){const own=ownership(source,identity,sources);if(!own.accepted){const secondary=secondaryContactAttribution(source,identity);if(secondary.accepted)return secondary;}}
    if(field==='business_description'){const partner=partnerSubjectAttribution(source,identity);if(partner.accepted)return partner;}
    if(field==='hiring')return hiringAttribution(source,identity,sources);if(field==='company_owned_profiles')return profileAttribution(source,identity,sources);const own=ownership(source,identity,sources);const shared=sources.find(s=>s.source_class!=='public_registry'&&domain(s.source_url)===domain(source.source_url)&&sharedLegalPractice(s.text));if(own.accepted&&shared&&field!=='official_website')return{...own,scope:'explicit_entity_facts',kind:'shared-legal-practice-explicit-entity',support:[...own.support,shared],reason:'The brand explicitly spans separate legal entities; the published fact must identify this exact legal entity'};return own.accepted||field==='official_website'?own:explicitEntityFacts(source,identity);
  }
  sourceContext(job:Job,source:Snapshot,length:number){
    const restriction=publicationRestriction(source,currentSourceVersions(this.store.evidenceView(job.id)));if(restriction)return{snapshot_id:source.id,source_url:source.source_url,identity_verified:false,facts_attribution:null,source_scope:'source_policy_blocked',allowed_fields:[]as string[],attribution:'Source access policy: '+restriction.reason,hiring_attribution:null,text:'',truncated:false,links:[]as string[],source_access_policy:restriction};
    const owner=this.attribution(job,source,'official_website'),hiring=this.attribution(job,source,'hiring'),baseFacts=owner.accepted?owner:this.attribution(job,source,'business_description'),facts=baseFacts.accepted?baseFacts:secondaryContactAttribution(source,this.identity(job)??{});
    return {snapshot_id:source.id,source_url:source.source_url,identity_verified:owner.accepted,facts_attribution:facts.accepted?facts.reason:null,source_scope:owner.accepted?owner.scope??'company_host':facts.scope??'third_party_record',allowed_fields:owner.accepted?researchFields.filter(f=>f!=='public_reputation'):facts.accepted?(facts.scope==='third_party_contact'?['locations']:facts.scope==='partner_subject'?['business_description']:['business_description','locations','public_activity']):source.document?[]:['hiring'],attribution:owner.reason,hiring_attribution:hiring.accepted?hiring.reason:null,...(source.document?{document:source.document,document_subject_proof:facts.support.map(s=>({snapshot_id:s.id,source_url:s.source_url,text:s.text.slice(0,1200),truncated:s.text.length>1200}))}:{}),text:source.text.slice(0,length),truncated:source.text.length>length,links:linksIn(source.text).filter(link=>profileUrl(link)||/(kontakt|contact|about|om-oss|karriere|career|jobb|job|stilling)/i.test(link)).slice(0,8)};
  }
  async discover(job:Job,complete=true){
    const identity=this.identity(job),address=identity?.forretningsadresse as Record<string,unknown>|undefined;
    const name=String(identity?.navn??''),city=String(address?.poststed??'');
    const registered=String(identity?.hjemmeside??''),emailHost=registryEmailDomain(identity??{});
    const guessed=this.directWeb()?domainSeeds(name):[],registrySeeds=[...new Set([...(registered?[registered.startsWith('http')?registered:`https://${registered}`]:[]),...(emailHost?[`https://${emailHost}/`]:[])])];
    for(const url of registrySeeds){if(!this.researchTime(job))break;if(guessed.includes(url)&&this.store.proposals(job.id).some(raw=>proposalSchema.parse(raw).field==='official_website'))continue;try{await this.publicNavigation(job,url,false,false);}catch(error){this.store.event(job.run_id,job.organisation_number,'registry_seed_unavailable','Registered website navigation failed: '+errorMessage(error));try{await this.read(job.id,url);}catch(fallback){this.store.event(job.run_id,job.organisation_number,'registry_seed_unavailable','Registered website readable fetch failed: '+errorMessage(fallback));}}}
    const exact=JSON.stringify(name.replace(/\s+(AS|ASA|ANS|DA)$/i,''));
    const workplace=this.store.evidenceView(job.id).find(s=>s.source_url.startsWith('https://data.brreg.no/enhetsregisteret/api/underenheter?'));
    let tradingNames:string[]=[];if(workplace)try{tradingNames=[...new Set(normalizeWorkplaces(JSON.parse(workplace.text),job.organisation_number).locations.map(p=>String(p.name??'')).filter(n=>n.length>=4&&fold(n.replace(/\s+AS$/i,''))!==fold(name.replace(/\s+AS$/i,''))))].slice(0,2);}catch{}
    const websiteQuery=`${tradingNames.length?'('+[exact,...tradingNames.map(n=>JSON.stringify(n))].join(' OR ')+')':exact} ${city} Norway nettside kontakt`;
    // Search before speculative DNS probes and slow directory refreshes. In a
    // short company budget those used to consume the entire discovery window.
    const native=this.directWeb();
    if(native&&this.researchTime(job)){try{await this.search(job.id,websiteQuery,'website');}catch(error){this.store.event(job.run_id,job.organisation_number,'discovery','Website discovery unavailable: '+errorMessage(error));}}
    if(native)await this.inspectCompanyCandidates(job);
    if(!native||!this.store.proposals(job.id).some(raw=>proposalSchema.parse(raw).field==='official_website'))await this.fallbackDiscovery(job,this.discoveryReserveMs);
    if(native&&!this.store.proposals(job.id).some(raw=>proposalSchema.parse(raw).field==='official_website'))for(const url of guessed){if(!this.researchTime(job,this.discoveryReserveMs,15000))break;try{await this.read(job.id,url);}catch{}}
    const queries:[string,'website'|'hiring'|'identity'][]=[[`${exact} ${city} Norway nettside kontakt`,'website'],[`${job.organisation_number} ${exact} hjemmeside kontakt`,'identity'],[`${exact} ${city} ledige stillinger karriere`,'hiring']];
    for(const [query,purpose] of queries.slice(0,this.settings.maxSearches)){
      if(native&&purpose==='website')continue;
      if(!this.researchTime(job))break;
      if(purpose==='hiring'&&this.store.proposals(job.id).some(raw=>{const p=proposalSchema.parse(raw);return p.field==='hiring'&&this.store.source(job.id,p.snapshot_id).extraction_method!=='nav-feed-index-query/v1';}))continue;
      if(purpose==='identity'&&this.store.proposals(job.id).some(raw=>proposalSchema.parse(raw).field==='official_website'))continue;
      try{await this.search(job.id,query,purpose);}catch(error){this.store.event(job.run_id,job.organisation_number,'discovery',`Discovery incomplete: ${errorMessage(error)}`);}
    }
    await this.inspectCompanyCandidates(job);
    this.seedProposals(job);
    const official=this.store.proposals(job.id).map(raw=>proposalSchema.parse(raw)).find(p=>p.field==='official_website');
    if(official&&this.researchTime(job)&&this.store.usage(job.id).searches<this.settings.maxSearches&&!this.store.proposals(job.id).some(raw=>proposalSchema.parse(raw).field==='public_activity')){
      try{await this.search(job.id,`site:${new URL(official.value).hostname} ${exact} nyheter aktuelt news pressemelding`,'general');}catch(error){this.store.event(job.run_id,job.organisation_number,'discovery','Dated company activity lookup unavailable: '+errorMessage(error));}
    }

    if(this.researchTime(job)&&!this.store.proposals(job.id).some(raw=>proposalSchema.parse(raw).field==='official_website')&&this.store.usage(job.id).searches+1<this.settings.maxSearches){try{await this.search(job.id,`\"${job.organisation_number}\" ${exact} kontakt`,'identity');}catch(error){this.store.event(job.run_id,job.organisation_number,'discovery','Exact-ID fallback unavailable: '+errorMessage(error));}}
    if(complete)await this.completeProfileLinks(job,this.discoveryReserveMs);
    if(!this.researchTime(job))this.store.event(job.run_id,job.organisation_number,'discovery','Optional discovery stopped to reserve time for model extraction');
    this.store.event(job.run_id,job.organisation_number,'discovery',`Preserved ${this.store.evidenceView(job.id).filter(s=>s.source_class!=='public_registry').length} discovery pages`);
  }
  async inspectCompanyCandidates(job:Job,reserveMs=this.discoveryReserveMs){
    const identity=this.identity(job)??{},name=String(identity.navn??''),city=String((identity.forretningsadresse as Record<string,unknown>|undefined)?.poststed??'');
    const directoryLinks=[...new Set(this.store.evidenceView(job.id).filter(s=>s.source_class!=='public_registry'&&isDirectory(s.source_url)&&hasOrganisationNumber(s.text,job.organisation_number)&&namesEntity(s.text,name,'000000000')).flatMap(s=>websiteLinks(s.text,s.source_url)).filter(link=>!isDirectory(link)&&!isRecruiter(link)&&!onDomain(domain(link),restrictedDomains)&&brandDomain(link,name)&&!/\.(pdf|csv|json|png|jpe?g|zip|css|js)$/i.test(new URL(link).pathname)))].slice(0,2);
    for(const link of directoryLinks){if(!this.researchTime(job,reserveMs))break;try{await this.read(job.id,link);}catch{try{if(this.researchTime(job,reserveMs,40000))await this.publicNavigation(job,link,false,false);}catch{}}}
    const score=(s:Snapshot)=>Number(this.attribution(job,s,'official_website').accepted)*1000+Number(hasOrganisationNumber(s.text,job.organisation_number))*300+Number(addressMatch(s.text,identity))*100+Number(registryEmailDomain(identity)===domain(s.source_url))*100+Number(domain(s.source_url).endsWith('.no'))*30+Number(city.length>=4&&fold(s.text).includes(fold(city)))*20+Number(/\b(norge|norway|norwegian|norsk)\b/i.test(s.text))*5;
    const sites=this.store.evidenceView(job.id).filter(s=>s.source_class!=='public_registry'&&s.extraction_method!=='public-html-links/v1'&&!/\.(pdf|csv|json|png|jpe?g|zip)$/i.test(new URL(s.source_url).pathname)&&!isDirectory(s.source_url)&&!isRecruiter(s.source_url)&&!onDomain(domain(s.source_url),restrictedDomains)&&(this.attribution(job,s,'official_website').accepted||brandDomain(s.source_url,name)||registryEmailDomain(identity)===domain(s.source_url))).sort((a,b)=>score(b)-score(a)||a.source_url.length-b.source_url.length);
    const captured=new Set<string>();
    for(const site of sites){if(!this.researchTime(job,reserveMs))break;if(captured.has(domain(site.source_url)))continue;captured.add(domain(site.source_url));if(captured.size>2)break;try{this.store.event(job.run_id,job.organisation_number,'navigation','Inspecting candidate links; ownership remains unverified until exact-entity checks pass');await this.followCompanyLinks(job,site,reserveMs);if(this.researchTime(job,reserveMs,40000)){const html=await this.publicNavigation(job,site.source_url,false,false);await this.followCompanyLinks(job,html,reserveMs);}}catch(error){this.store.event(job.run_id,job.organisation_number,'navigation',`Website navigation unavailable: ${errorMessage(error)}`);}}
  }
  async completeProfileLinks(job:Job,reserveMs=0){
    const identity=this.identity(job)??{},hasProfiles=this.store.proposals(job.id).some(raw=>proposalSchema.parse(raw).field==='company_owned_profiles');
    if(this.researchTime(job,reserveMs)&&!hasProfiles&&identity.navn&&this.store.usage(job.id).searches<this.settings.maxSearches){try{await this.search(job.id,`${JSON.stringify(String(identity.navn).replace(/\s+(AS|ASA|ANS|DA)$/i,''))} ${String((identity.forretningsadresse as Record<string,unknown>|undefined)?.poststed??'')} Norge hjemmeside kontakt sosiale medier Facebook Instagram LinkedIn`,'identity');}catch(error){this.store.event(job.run_id,job.organisation_number,'fallback','Targeted profile lookup unavailable: '+errorMessage(error));}}
    await this.inspectCompanyCandidates(job,reserveMs);
    const sites=this.store.evidenceView(job.id).filter(s=>s.source_class!=='public_registry'&&s.extraction_method!=='public-html-links/v1'&&this.attribution(job,s,'official_website').accepted).sort((a,b)=>a.source_url.length-b.source_url.length),hosts=new Set<string>();
    for(const site of sites){if(!this.researchTime(job,reserveMs,40000))break;const host=domain(site.source_url);if(hosts.has(host))continue;hosts.add(host);if(hosts.size>2)break;if(this.store.evidenceView(job.id).some(s=>s.extraction_method==='public-html-links/v1'&&domain(s.source_url)===host))continue;try{const html=await this.publicNavigation(job,site.source_url,true,false);await this.followCompanyLinks(job,html,reserveMs);}catch(error){this.store.event(job.run_id,job.organisation_number,'fallback','Final profile navigation unavailable: '+errorMessage(error));}}
    this.seedProposals(job);
  }
  seedScopedRepairs(job:Job){
    for(const source of currentSourceVersions(this.store.evidenceView(job.id)).filter(s=>s.source_class!=='public_registry'&&!s.document&&!['public-html-links/v1','public-rendered-html/v1'].includes(s.extraction_method??'')&&!/^nav-|^public-reputation-/.test(s.extraction_method??''))){
      for(const catalogue of exactEntityServiceCatalogues(source,this.identity(job)??{})){this.verify(job.id,{field:'business_description',value:catalogue.literal_block,quote:catalogue.literal_block,snapshot_id:source.id,effective_date:null});/* An exact chain-hosted business record does not establish a company-owned account. */}
      const approval=officialApprovalAreas(source,this.identity(job)??{});if(approval)for(const area of approval.rows)this.verify(job.id,{field:'business_description',value:area.quote,quote:area.quote,snapshot_id:source.id,effective_date:null});
      for(const value of partnerSubjectParagraphs(source,this.identity(job)??{}))this.verify(job.id,{field:'business_description',value,quote:value,snapshot_id:source.id,effective_date:null});
      const invitations=openApplicationPassages(source.text);if(invitations.length&&this.attribution(job,source,'hiring').accepted)for(const value of invitations)this.verify(job.id,{field:'hiring',value,quote:value,snapshot_id:source.id,effective_date:null});
    }
  }
  seedProposals(job:Job){
    this.seedScopedRepairs(job);
    seedReputationObservations(this,job);
    const name=String(this.identity(job)?.navn??'');
    for(const source of currentSourceVersions(this.store.evidenceView(job.id)).filter(s=>s.source_class!=='public_registry')){
      const declaredPressroom=exactPressroomSubject(source,this.identity(job)??{},this.store.evidenceView(job.id));if(declaredPressroom){
        this.verify(job.id,{field:'company_owned_profiles',value:source.source_url,quote:source.text.slice(0,Math.min(1000,source.text.length)),snapshot_id:source.id,effective_date:null});
        for(const m of source.text.matchAll(/^www\.[a-z0-9.-]+\/?$/gim)){const quote=source.text.slice(Math.max(0,m.index-180),m.index+m[0].length);this.verify(job.id,{field:'official_website',value:'https://'+m[0].trim(),quote,snapshot_id:source.id,effective_date:null});}
      }
      if(source.document){
        if(this.attribution(job,source,'business_description').accepted){
          for(const m of source.text.matchAll(/(?:viktigste merker,? produkter og tjenester|description of (?:the )?(?:company|business)|principal activities|main products)\s*:?\s*\n([^\n]{10,900})/gi)){const value=m[1]!.trim();this.verify(job.id,{field:'business_description',value,quote:value,snapshot_id:source.id,effective_date:null});}
          for(const m of source.text.matchAll(/(?:[A-ZÆØÅ][\p{L} ,&'-]{0,80}\s)?(?:vedtok|vedtatt|lanserte|announced|launched|opened)\b[\s\S]{10,700}/gu)){const sentence=m[0].split(/(?<=\.)\s+(?=[A-ZÆØÅ])/u)[0]!.trim(),dates=supportedDates(sentence);if(dates.length===1)this.verify(job.id,{field:'public_activity',value:sentence,quote:sentence,snapshot_id:source.id,effective_date:dates[0]!,date_type:'event_date'});}
        }
        continue;
      }
      if(['nav-feed-json/v1','nav-feed-index-query/v1','public-html-links/v1','public-rendered-html/v1'].includes(source.extraction_method??''))continue;
      if(/(career|karriere|stilling|jobb-hos-oss|\/jobs?\/)/i.test(source.source_url)&&this.attribution(job,source,'hiring').accepted){const match=/(?:we are (?:currently )?fully staffed|vi er (?:for tiden )?fullt? bemannet|ingen ledige stillinger|no (?:current |open )?(?:vacancies|positions))/i.exec(source.text);if(match){const start=Math.max(source.text.lastIndexOf('\n',match.index),match.index-100,0),next=source.text.indexOf('\n',match.index+match[0].length),end=Math.min(source.text.length,next<0?match.index+500:next),span=source.text.slice(start,end).trim();if(span.length>=10)this.verify(job.id,{field:'hiring',value:span,quote:span,snapshot_id:source.id,effective_date:null});}}

      const structuredHiring=recruitmentPositions(source.text);if(structuredHiring.recognized&&this.attribution(job,source,'hiring').accepted)for(const position of structuredHiring.positions)this.verify(job.id,{field:'hiring',value:position.title,quote:position.quote,snapshot_id:source.id,effective_date:null});
      if(!structuredHiring.recognized&&(isRecruiter(source.source_url)||/(career|karriere|stilling|jobb-hos-oss|\/jobs?\/)/i.test(source.source_url))&&source.text.length<=3000&&source.text.length>=35){
        this.verify(job.id,{field:'hiring',value:source.text,quote:source.text,snapshot_id:source.id,effective_date:null});
      }
      if(this.attribution(job,source,'official_website').accepted){const quote=source.text.slice(0,Math.min(1000,source.text.length));
      if(quote.length>=10)this.verify(job.id,{field:'official_website',value:source.source_url,quote,snapshot_id:source.id,effective_date:null});
        if(/^\/(?:(?:en|no|nb|nn)\/)?(?:about|about-us|om-oss)?\/?$/i.test(new URL(source.source_url).pathname)){
          const metadata=source.text.match(/\[Page metadata description\]\n([^\n]+)/)?.[1];
          if(metadata&&!/(privacy|personvern|cookie|informasjonskaps|all rights reserved)/i.test(metadata)&&(namesEntity(metadata,name,'000000000')||hasOrganisationNumber(source.text,job.organisation_number))){
            const alternatives=descriptionRepresentationProblem(metadata)?completeDescriptionParagraphs(source.text,metadata).filter(p=>namesEntity(p,name,'000000000')):[metadata];
            for(const value of alternatives)this.verify(job.id,{field:'business_description',value,quote:value,snapshot_id:source.id,effective_date:null});
          }
        }
      }
      if(!this.attribution(job,source,'company_owned_profiles').accepted)continue;
      for(const url of linksIn(source.text).filter(link=>profileUrl(link)&&this.accountMatches(job,source,link))){
        const position=source.text.indexOf(url),span=source.text.slice(Math.max(0,position-100),position+url.length+80);
        this.verify(job.id,{field:'company_owned_profiles',value:url,quote:span,snapshot_id:source.id,effective_date:null});
      }
    }
  }
  previousCandidates(job:Job){
    const rows=this.store.db.prepare('SELECT j.body FROM jobs j JOIN profiles p ON p.org=j.org AND p.run=j.run WHERE j.org=? AND j.run<>? AND json_extract(j.body,\'$.review_only\') IS NOT 1 ORDER BY p.completed DESC LIMIT 1').all(job.organisation_number,job.run_id);
    const prior=rows[0];if(!prior||typeof prior.body!=='string')return this.store.candidates(job.organisation_number).slice(0,3);
    const priorJob=JSON.parse(prior.body),sources=this.store.evidenceView(priorJob.id),identity=this.identity(job)??{};
    const rank=(url:string)=>onDomain(domain(url),['proff.no'])&&/\/selskap\//.test(new URL(url).pathname)?0:onDomain(domain(url),['purehelp.no'])?1:onDomain(domain(url),['gulesider.no','1881.no'])?2:onDomain(domain(url),['proff.no'])?3:9;
    const directories=sources.filter(s=>s.source_class!=='public_registry'&&isDirectory(s.source_url)&&hasOrganisationNumber(s.text,job.organisation_number)).sort((a,b)=>rank(a.source_url)-rank(b.source_url));
    const sites=sources.filter(s=>s.source_class!=='public_registry'&&ownership(s,identity,sources).accepted).sort((a,b)=>a.source_url.length-b.source_url.length);
    const hiring=sources.filter(s=>s.source_class!=='public_registry'&&isRecruiter(s.source_url)&&hiringAttribution(s,identity,sources).accepted).sort((a,b)=>a.source_url.length-b.source_url.length);
    const previous=this.store.profile(job.organisation_number,priorJob.run_id),references=new Map(previous?.evidence.map(e=>[e.id,e])??[]);
    const relevant=previous?.claims.filter(c=>c.availability==='available'&&researchFields.some(field=>field===c.field))??[];
    const proofURLs=new Set(relevant.flatMap(c=>c.evidence_ids.map(id=>references.get(id))).filter((e):e is Evidence=>Boolean(e&&e.source_class!=='public_registry')).map(e=>e.source_url));
    const proofDirectories=directories.filter(s=>proofURLs.has(s.source_url));
    const deep=['hiring','company_owned_profiles','public_activity','business_description','locations'].flatMap(field=>relevant.filter(c=>c.field===field).flatMap(c=>{const e=references.get(c.evidence_ids[0]??'');return e&&e.source_class!=='public_registry'?[e.source_url]:[];}));
    return [...new Set([...[...proofDirectories.slice(0,2),...directories.slice(0,1),...sites.slice(0,1),...hiring.slice(0,1)].map(s=>s.source_url),...deep,...this.store.candidates(job.organisation_number)])].slice(0,7);
  }
  async fallbackDiscovery(job:Job,reserveMs=0){
    if(this.navCatalogue){try{this.navCatalogueHiring(job);}catch(error){this.store.event(job.run_id,job.organisation_number,'fallback','NAV index unavailable: '+errorMessage(error));}}
    else if(this.navFeed){try{await this.navHiring(job);}catch(error){this.store.event(job.run_id,job.organisation_number,'fallback','NAV fallback unavailable: '+errorMessage(error));}}
    const prior=this.previousCandidates(job);this.store.event(job.run_id,job.organisation_number,'fallback',`Re-fetching ${prior.length} prior discovery URLs; no old response or claim reused`);
    const seeds=[...new Set([...(prior.length?prior:[`https://www.proff.no/bransjes%C3%B8k?q=${job.organisation_number}`]),`https://www.purehelp.no/m/company/details/${job.organisation_number}`])];
    for(const url of seeds){if(!this.researchTime(job,reserveMs))break;try{let source:Snapshot;try{const page=await this.read(job.id,url);source=this.store.source(job.id,page.snapshot_id);}catch{if(!this.researchTime(job,reserveMs,40000))continue;source=await this.publicNavigation(job,url,false,false);}const links=websiteLinks(source.text,source.source_url);
      for(const link of links.filter(link=>onDomain(domain(link),['proff.no'])&&/\/selskap\//.test(new URL(link).pathname)&&link!==source.source_url).slice(0,1)){if(!this.researchTime(job,reserveMs))break;await this.read(job.id,link);}
      if(isDirectory(source.source_url)&&hasOrganisationNumber(source.text,job.organisation_number))for(const link of links.filter(link=>!isDirectory(link)&&!isRecruiter(link)&&!onDomain(domain(link),restrictedDomains)&&brandDomain(link,String(this.identity(job)?.navn??''))).slice(0,1)){if(!this.researchTime(job,reserveMs))break;await this.read(job.id,link);}
    }catch(error){this.store.event(job.run_id,job.organisation_number,'fallback','Directory/site refresh unavailable: '+errorMessage(error));}}
  }
  async navHiring(job:Job){
    if(!this.navFeed?.manifest.complete)throw new Error('NAV header collection incomplete');const identity=this.identity(job)??{};
    const workplaces=this.store.evidenceView(job.id).find(s=>s.source_url.startsWith('https://data.brreg.no/enhetsregisteret/api/underenheter?'));
    const subunits=workplaces?normalizeWorkplaces(JSON.parse(workplaces.text),job.organisation_number).locations:[];
    const candidates=this.navFeed.candidates(String(identity.navn??''),subunits.map(s=>String(s.name??''))).slice(0,20);let matches=0;
    for(const header of candidates){try{const entry=z.object({url:z.string(),text:z.string(),retrieved_at:z.string()}).parse(await this.call(job,'nav:'+header.url,'public_feed',0,()=>this.navFeed!.entry(header.url)));
      const source=snapshot({source_url:entry.url,text:entry.text,source_class:'external',organisation_number:job.organisation_number,run_id:job.run_id,extraction_method:'nav-feed-json/v1'},entry.retrieved_at);this.store.saveSnapshot(job.id,source);
      const match=navEmployerOrg(JSON.parse(source.text),job.organisation_number,subunits.map(s=>String(s.organisation_number)),source.retrieved_at);if(!match)continue;
      const value=match.ad.json.title,needle=JSON.stringify(value),start=source.text.indexOf(needle),quote=source.text.slice(Math.max(0,start-9),start+needle.length);
      if(this.verify(job.id,{field:'hiring',value,quote,snapshot_id:source.id,effective_date:null}).accepted)matches++;
    }catch(error){this.store.event(job.run_id,job.organisation_number,'fallback','NAV candidate unreadable: '+errorMessage(error));}}
    this.store.event(job.run_id,job.organisation_number,'fallback',`NAV feed: ${candidates.length} candidate ads checked; ${matches} exact employer-org matches. Name-based candidate filtering does not prove absence.`);
  }
  navCatalogueHiring(job:Job){
    if(!this.navCatalogue)throw new Error('NAV catalogue missing');
    const workplaces=this.store.evidenceView(job.id).find(s=>s.source_url.startsWith('https://data.brreg.no/enhetsregisteret/api/underenheter?'));
    const subunits=workplaces?normalizeWorkplaces(JSON.parse(workplaces.text),job.organisation_number).locations.map(s=>String(s.organisation_number)):[];
    const sealed=sealNavCatalogue(this.navCatalogue),id=sealed.sha256;this.store.saveCatalogue(id,sealed.catalogue);
    const query=navQuery(sealed.catalogue,job.organisation_number,subunits),text=JSON.stringify({catalogue_sha256:id,result:query});
    const source=this.save(job,'https://pam-stilling-feed.nav.no/api/v1/feed',text,'external');source.extraction_method='nav-feed-index-query/v1';this.store.db.prepare('UPDATE snapshots SET body=? WHERE id=? AND job=?').run(JSON.stringify(source),source.id,job.id);
    const checked=this.verify(job.id,{field:'hiring',value:id,quote:JSON.stringify('catalogue_sha256')+':'+JSON.stringify(id),snapshot_id:source.id,effective_date:null});
    if(!checked.accepted)throw new Error(checked.reason);
    this.store.event(job.run_id,job.organisation_number,'fallback',`NAV exact-employer query: ${query.active_ads_attributed} attributed active ads; source scope and unknown-employer records disclosed`);
  }
  accountMatches(job:Job,source:Snapshot,url:string){
    const identity=this.identity(job),name=String(identity?.navn??'');
    const owner=ownership(source,identity??{},this.store.evidenceView(job.id)),primary=owner.accepted&&owner.scope==='company_host'&&/^\/(?:(?:no|nb|nn|en)\/?)?$/.test(new URL(source.source_url).pathname)&&(hasOrganisationNumber(source.text,job.organisation_number)||this.store.evidenceView(job.id).some(s=>s.source_url===source.source_url&&namesEntity(s.text.slice(0,1200),name,job.organisation_number)));
    const declared=owner.accepted&&owner.scope==='company_host'&&exactOrganizationAccounts(source,name).some(u=>{try{return canonicalProfile(u)===canonicalProfile(url);}catch{return false;}});
    return declared||profileMatches(url,name,primary?source.source_url:undefined);
  }
  async read(jobId: string, value: string,sections:'full'|'navigation'='full',searchCandidate=false) {
    const job = this.store.job(jobId), url = permittedContentUrl(value.replace(/^http:\/\//i,'https://')).toString();
    const host=new URL(url).hostname;
    if(onDomain(host,restrictedDomains)){this.store.event(job.run_id,job.organisation_number,'blocked','Restricted platform content requires a separately licensed connector');throw new Error('Restricted platform content requires a separately licensed connector. Verify outbound links from a company-owned page instead.');}
    if(isPublicPdfUrl(url))return this.readPublicDocument(job,value);
    if(sections==='navigation')return {...this.sourceContext(job,await this.publicNavigation(job,url),12000),usage:this.store.usage(jobId)};
    const saved=this.store.evidenceView(jobId).find(s=>s.source_class!=='public_registry'&&s.source_url===url&&!['exa-navigation-and-links/v2','public-html-links/v1','public-rendered-html/v1'].includes(s.extraction_method??''));
    if(saved)return {...this.sourceContext(job,saved,10000),usage:this.store.usage(jobId)};
    if(this.directWeb()){const acquire=async()=>{const navigation=await this.publicNavigation(job,url,false,false);const extracted=this.store.evidenceView(job.id).find(s=>s.source_url===navigation.source_url&&['public-html-text-and-links/v5','public-html-text-and-links/v4','public-html-text-and-links/v3','public-rendered-text-and-links/v4','public-rendered-text-and-links/v3','public-rendered-text-and-links/v2'].includes(s.extraction_method??''));if(!extracted)throw Error('No independently retrieved readable source');return{snapshot_id:extracted.id};};const saved=(searchCandidate?await acquire():await this.call(job,'public-content:'+url,'contents',0,acquire)) as {snapshot_id:string};return {...this.sourceContext(job,this.store.source(job.id,saved.snapshot_id),10000),usage:this.store.usage(job.id)};}
    const response = await this.exa(job, 'contents', { urls: [url], text:{maxCharacters:50000,verbosity:'full',includeSections:['header','navigation','body','footer','metadata']},extras:{links:200},maxAgeHours: 0 }, 0.001, 'contents');
    const result = response.results.find(r => r.text && publicUrl(r.url));
    if (!result?.text) throw new Error('No readable source content returned');
    const source = this.ingest(job,result);
    this.seedProposals(job);
    return {...this.sourceContext(job,source,10000),usage:this.store.usage(job.id)};
  }
  async readPublicDocument(job:Job,value:string){
    const url=publicPdfUrl(permittedContentUrl(value).toString()),requestedPage=/^#page=(\d+)$/.exec(new URL(value).hash)?.[1],key='public-pdf:'+url.toString();
    if(!this.store.call(job.id,key)){
      const count=Number(this.store.db.prepare("SELECT count(*) AS n FROM calls WHERE job=? AND key LIKE 'public-pdf:%'").get(job.id)?.n??0);
      if(count>=Math.min(2,this.settings.maxPages))throw Error('Per-company public PDF document admission limit reached');
    }
    const record=await this.call(job,key,'contents',0,async()=>{
      const network:PublicNetwork|undefined=this.runtime?(host,signal,perform)=>this.runtime!.network(host,signal,perform):undefined;
      const result=await this.preservePublicDocument(this.store,job,url.toString(),resolve(dirname(this.settings.db),'public-documents'),this.runtime?.companySignal(job)??this.signal(job),network);
      if(result.status==='parse_failed')throw Error('Public PDF text unavailable: '+result.parse_error);
      return {snapshot_ids:result.pages.map(page=>page.id),document_id:result.document_id,raw_sha256:result.raw_sha256,raw_path:result.raw_path,page_count:result.page_count,status:result.status};
    }) as {snapshot_ids:string[];document_id:string;raw_sha256:string;page_count:number;status:string};
    const pages=record.snapshot_ids.map(id=>this.store.source(job.id,id));
    const selected=(requestedPage?pages.find(page=>page.document?.page_number===Number(requestedPage)):pages.find(page=>documentAttribution(page,this.identity(job)??{},pages).support[0]?.id===page.id))??pages[0];
    if(!selected)throw Error('Public PDF has no preserved pages');
    this.seedProposals(job);
    return {...this.sourceContext(job,selected,10000),document_id:record.document_id,document_status:record.status,document_pages:pages.map(page=>({snapshot_id:page.id,source_url:page.source_url,page_number:page.document!.page_number,text_bytes:Buffer.byteLength(page.text)})),usage:this.store.usage(job.id)};
  }
  async publicNavigation(job:Job,value:string,requireVerified=true,followLinks=true){
    const url=permittedContentUrl(value),sources=this.store.evidenceView(job.id);
    if(requireVerified&&!sources.some(s=>s.source_class!=='public_registry'&&s.source_url===url.toString()&&this.attribution(job,s,'official_website').accepted))throw new Error('Verify this company page before requesting its HTML navigation');
    const responseSchema=z.object({url:z.string(),status:z.number(),text:z.string(),content_type:z.string(),raw_sha256:z.string().nullish(),retrieved_at:z.string().nullish(),redirect_chain:z.array(z.string()).optional()});
    const robotsUrl=new URL('/robots.txt',url).toString();
    const robots=responseSchema.parse(await this.publicCall(job,robotsUrl,()=>this.websiteRequest(robotsUrl,0,this.signal(job))));
    if(!([404,410].includes(robots.status)||(robots.status===200&&robotsAllowed(robots.text,url.pathname+url.search))))throw new Error('Website robots policy blocks this page or could not be confirmed');
    const response=responseSchema.parse(await this.publicCall(job,'html:'+url.toString(),()=>this.websiteRequest(url.toString(),0,this.signal(job))));
    if(response.status!==200||!/html/i.test(response.content_type))throw new Error(`Website HTML unavailable (${response.status})`);
    const final=permittedContentUrl(response.url);
    if(final.hostname.replace(/^www\./,'')!==url.hostname.replace(/^www\./,''))throw Error('Cross-domain redirect requires separate company verification');
    if(final.origin!==url.origin){const finalRobotsUrl=new URL('/robots.txt',final).toString(),finalRobots=responseSchema.parse(await this.publicCall(job,finalRobotsUrl,()=>this.websiteRequest(finalRobotsUrl,0,this.signal(job))));if(!([404,410].includes(finalRobots.status)||finalRobots.status===200&&robotsAllowed(finalRobots.text,final.pathname+final.search)))throw Error('Final website robots policy blocks this page or could not be confirmed');}
    else if(robots.status===200&&!robotsAllowed(robots.text,final.pathname+final.search))throw Error('Website robots policy blocks redirected path');
    const source=this.save(job,publicUrl(response.url).toString(),response.text,'external');
    if(response.raw_sha256&&response.retrieved_at)source.transport={raw_sha256:response.raw_sha256,retrieved_at:response.retrieved_at,final_url:response.url,...(response.redirect_chain?{redirect_chain:response.redirect_chain}:{})};
    source.extraction_method='public-html-links/v1';this.store.db.prepare('UPDATE snapshots SET body=? WHERE id=? AND job=?').run(JSON.stringify(source),source.id,job.id);
    let render:Awaited<ReturnType<typeof renderPublic>>|undefined;let html=source.text;
    if(this.directWeb()&&javascriptShell(html,htmlText(html))&&brandDomain(source.source_url,String(this.identity(job)?.navn??''))){
      try{render=await this.renderPublic(response,robots,this.runtime?.companySignal(job)??this.signal(job),this.websiteRequest);html=render.html;const dom=this.save(job,render.url,html,'external');dom.extraction_method='public-rendered-html/v1';dom.rendering={input_snapshot_id:source.id,dom_sha256:render.dom_sha256,resources:render.resources,elapsed_ms:render.elapsed_ms,blocked_requests:render.blocked_requests};this.store.db.prepare('UPDATE snapshots SET body=? WHERE id=? AND job=?').run(JSON.stringify(dom),dom.id,job.id);this.store.operation(job.run_id,job.organisation_number,{stage:'public_render',elapsed_ms:render.elapsed_ms,resources:render.resources.length,blocked_requests:render.blocked_requests});}catch(error){this.store.event(job.run_id,job.organisation_number,'render_failed',errorMessage(error));}
    }
    const links=websiteLinks(html,source.source_url),text=htmlText(html);
    const extracted=this.save(job,source.source_url,text+'\n\n[Links extracted from this page]\n'+links.join('\n'),'external');extracted.extraction_method=render?'public-rendered-text-and-links/v4':'public-html-text-and-links/v5';if(render)extracted.rendering={input_snapshot_id:source.id,dom_sha256:render.dom_sha256,resources:render.resources,elapsed_ms:render.elapsed_ms,blocked_requests:render.blocked_requests};this.store.db.prepare('UPDATE snapshots SET body=? WHERE id=? AND job=?').run(JSON.stringify(extracted),extracted.id,job.id);
    this.seedProposals(job);
    if(followLinks)await this.followCompanyLinks(job,extracted);
    return source;
  }
  async followCompanyLinks(job:Job,source:Snapshot,reserveMs=0){
    const links=websiteLinks(source.text,source.source_url);
    const candidates=links.filter(link=>/(career|karriere|ledige|stilling|vacanc|job|kontakt|contact|impressum|legal|team|om[-_]?oss|about|personvern|privacy|vilkar|vilkår|terms|nyheter|aktuelt|news|investor|tjenest|services?|produkt|product|tilbud|[aå]pningstid|opening|baerekraft|bærekraft|sustainab|selskapsadress|selskaper|our-companies|companies|locations|avdeling)/i.test(decodeURIComponent(new URL(link).pathname))&&!/\.(pdf|png|jpe?g|webp|gif|svg|zip|css|js)$/i.test(new URL(link).pathname)&&!onDomain(domain(link),restrictedDomains)&&(domain(link)===domain(source.source_url)||isRecruiter(link)));
    const verifiedAtEntry=this.attribution(job,source,'official_website').accepted;
    const rank=(link:string)=>{const path=decodeURIComponent(new URL(link).pathname);return !verifiedAtEntry&&/(impressum|legal)/i.test(path)?-2:!verifiedAtEntry&&/(privacy|personvern|terms|vilkar|vilkår)/i.test(path)?-1:/(kontakt|contact|impressum|legal)/i.test(path)?0:/(career|karriere|ledige|stilling|vacanc|job)/i.test(path)?1:/(tjenest|services?|produkt|product|tilbud)/i.test(path)?2:/([aå]pningstid|opening)/i.test(path)?3:/(nyheter|aktuelt|news)/i.test(path)?4:5;};
    const identityProbes=verifiedAtEntry?[]:[...candidates.filter(link=>/(?:contact|kontakt)/i.test(new URL(link).pathname)).slice(0,1),...candidates.filter(identityDiscoveryLink).slice(0,2)];
    const priorities=verifiedAtEntry?[0,1,2,3,4,5]:[-2,-1,0,1,2,3,4,5];
    const selected=[...new Set([...priorities.flatMap(r=>candidates.find(link=>rank(link)===r)??[]),...candidates])].slice(0,6);
    // Keep bounded contact/about/group probes reachable after an operator mismatch.
    let conflictLogged=false;
    for(const link of [...new Set([...(verifiedAtEntry?[]:selected.filter(link=>rank(link)===-2)),...identityProbes,...selected])]){if(!this.researchTime(job,reserveMs,15000))break;const verified=verifiedAtEntry||this.attribution(job,source,'official_website').accepted;const conflict=verified?undefined:conflictingPublisherExpansion(source.source_url,this.identity(job)??{},currentSourceVersions(this.store.evidenceView(job.id)));if(conflict&&!identityProbes.includes(link)){if(!conflictLogged)this.store.event(job.run_id,job.organisation_number,'candidate_expansion_stopped',conflict.reason+'; snapshot '+conflict.snapshot_id);conflictLogged=true;continue;}try{await this.read(job.id,link);}catch{}}
    if(this.attribution(job,source,'official_website').accepted){
      const documents=links.filter(link=>relevantPdfCandidate(link,this.identity(job)??{},[domain(source.source_url)])&&domain(link)===domain(source.source_url)&&/(?:rapport|report|annual|[åa]rs|statement|redegj|certif|godkjen|prospekt|jobb|stilling)/i.test(decodeURIComponent(new URL(link).pathname))).slice(0,1);
      for(const link of documents){if(!this.researchTime(job,reserveMs,40000))break;try{await this.read(job.id,link);}catch(error){this.store.event(job.run_id,job.organisation_number,'public_pdf','Document unavailable: '+errorMessage(error));}}
    }
  }
  inspect(jobId: string, sourceId: string, needle: string) {
    const source = this.store.source(jobId, sourceId);
    const position = source.text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
    return { snapshot_id: source.id, excerpt: position < 0 ? null : source.text.slice(Math.max(0, position - 1000), position + needle.length + 2500) };
  }
  verify(jobId: string, input: Proposal): { accepted: boolean; reason: string; claim?: Claim; evidence?: Evidence;support?:Evidence[] } {
    const proposal=proposalSchema.parse(input);if(proposalAfterCutoff(proposal.effective_date,this.publicationCutoffs.get(jobId)??process.env.SIGNALPOST_EVIDENCE_CUTOFF))return{accepted:false,reason:'Claim date is after the declared evidence cutoff'};const source=this.store.source(jobId,proposal.snapshot_id),restriction=publicationRestriction(source,currentSourceVersions(this.store.evidenceView(jobId)));if(restriction)return{accepted:false,reason:'Source access policy: '+restriction.reason};
    const reviews=(this.store.extractionCache('assisted-source-bound-publication-decisions/v1:'+jobId)??[])as{field:string;value_sha256:string;source_sha256:string;action:string;reason:string;qualifiers?:Record<string,unknown>}[];if(!Array.isArray(reviews))return{accepted:false,reason:'Malformed source-bound review decisions require repair before publication'};
    const applies=(r:typeof reviews[number],values:Set<string>)=>r.field===proposal.field&&r.source_sha256===source.content_sha256&&(values.has(r.value_sha256)||proposal.field==='official_website'&&typeof r.qualifiers?.rejected_domain_relationship_host==='string'&&new URL(proposal.value).hostname.replace(/^www\./,'')===r.qualifiers.rejected_domain_relationship_host);
    const matching=reviews.filter(r=>applies(r,new Set([hash(proposal.value)]))),rejected=matching.find(r=>r.action==='reject');if(rejected){this.store.db.prepare('DELETE FROM verified_proposals WHERE job=? AND key=?').run(jobId,hash(canonical(proposal)));return{accepted:false,reason:'Source-bound assistant review: '+rejected.reason};}
    const result=this.verifyUnreviewed(jobId,proposal);
    // Review decisions bind the published value. URL canonicalisation and other
    // admitted representation changes must not bypass a withdrawal by hashing
    // only the raw proposal spelling.
    const values=new Set([hash(proposal.value),...(typeof result.claim?.value==='string'?[hash(result.claim.value)]:[])]),normalizedReviews=reviews.filter(r=>applies(r,values)),normalizedRejection=normalizedReviews.find(r=>r.action==='reject');
    if(normalizedRejection){this.store.db.prepare('DELETE FROM verified_proposals WHERE job=? AND key=?').run(jobId,hash(canonical(proposal)));return{accepted:false,reason:'Source-bound assistant review: '+normalizedRejection.reason};}
    if(result.accepted&&result.claim)for(const review of normalizedReviews.filter(r=>r.action==='qualify'))result.claim.qualifiers={...result.claim.qualifiers,...review.qualifiers};return result;
  }
  private verifyUnreviewed(jobId: string, input: Proposal): { accepted: boolean; reason: string; claim?: Claim; evidence?: Evidence;support?:Evidence[] } {
    const proposal = proposalSchema.parse(input), job = this.store.job(jobId);
    const source = this.store.source(jobId, proposal.snapshot_id);
    if(proposal.field==='public_reputation')return verifyReputationObservation(this,job,source,proposal);
    const catalogue=exactEntityServiceCatalogues(source,this.identity(job)??{}).find(c=>proposal.field==='business_description'&&c.literal_block===proposal.value&&c.literal_block===proposal.quote);
    if(catalogue){if(proposal.effective_date!==null)return{accepted:false,reason:'An undated entity service catalogue cannot create an event/publication date'};const item=evidenceFor(source,proposal.quote),support=proposal.quote===catalogue.identity_quote?[]:[evidenceFor(source,catalogue.identity_quote)];this.store.saveProposal(jobId,hash(canonical(proposal)),proposal);return{accepted:true,reason:'Structured service catalogue is directly attached to the exact legal name and NO:orgnr, with each service also literally present in the dedicated business page',claim:{field:proposal.field,value:proposal.value,availability:'available',confidence:null,evidence_ids:[item.id,...support.map(e=>e.id)],qualifiers:{attribution:'structured-exact-entity-catalogue',source_scope:proposal.field==='business_description'?'entity_declared_service_catalogue':'network_published_business_representation',host_ownership_established:false,administrative_account_control_established:false,approval_independently_established:false,services:catalogue.services,observed_at:source.retrieved_at}},evidence:item,support};}
    const approval=officialApprovalAreas(source,this.identity(job)??{});if(approval&&proposal.field==='business_description'){
      const area=approval.rows.find(r=>r.quote===proposal.value&&r.quote===proposal.quote);if(!area||proposal.effective_date!==null)return{accepted:false,reason:'Official approval claims must be exact enterprise-specific role/category/class rows; validity periods remain separate, not generic project examples or publication dates'};
      const item=evidenceFor(source,area.quote),support=[evidenceFor(source,approval.period_quote)];this.store.saveProposal(jobId,hash(canonical(proposal)),proposal);return{accepted:true,reason:'Exact legal organisation and actual DiBK enterprise approval row with retained validity interval',claim:{field:'business_description',value:area.quote,availability:'available',confidence:null,evidence_ids:[item.id,...support.map(e=>e.id)],qualifiers:{attribution:'official-approval-register',source_scope:'official_reported_competence',approval_valid_from:approval.valid_from,approval_valid_until:approval.valid_until,approval_current_at_observation:approval.current_at_observation,observed_at:source.retrieved_at,completion_of_projects_established:false,current_services_independently_established:false}},evidence:item,support};
    }

    if(['public-html-links/v1','public-rendered-html/v1'].includes(source.extraction_method??''))return {accepted:false,reason:'Raw HTML must be extracted before supporting published claims'};
    if (!source.text.includes(proposal.quote)) return { accepted: false, reason: 'Quote is absent from the preserved source' };
    const ownPressroom=proposal.field==='company_owned_profiles'&&proposal.value===source.source_url&&Boolean(exactPressroomSubject(source,this.identity(job)??{},this.store.evidenceView(job.id)));
    const quotedProfile=proposal.field==='company_owned_profiles'&&profileUrl(proposal.value)&&linksIn(proposal.quote).some(link=>profileUrl(link)&&canonicalProfile(link)===canonicalProfile(proposal.value));
    if (proposal.field !== 'official_website' && !proposal.quote.includes(proposal.value)&&!quotedProfile&&!ownPressroom) return { accepted: false, reason: 'Extractive values must occur in the quote; social URLs may use equivalent canonical spelling' };
    if(source.extraction_method==='nav-feed-index-query/v1'){
      if(proposal.field!=='hiring'||proposal.effective_date!==null)return {accepted:false,reason:'NAV counts require an exact derived query receipt'};
      const receipt=z.object({catalogue_sha256:z.string(),result:z.unknown()}).parse(JSON.parse(source.text));
      const cacheKey=receipt.catalogue_sha256+':'+this.store.artifactRevision('catalogue',receipt.catalogue_sha256),sealed=this.verifiedNavCatalogues.get(cacheKey)??sealNavCatalogue(this.store.catalogue(receipt.catalogue_sha256));
      if(sealed.sha256!==receipt.catalogue_sha256)return {accepted:false,reason:'NAV catalogue hash mismatch'};
      this.verifiedNavCatalogues.set(cacheKey,sealed);const catalogue=sealed.catalogue;
      const workplaces=this.store.evidenceView(job.id).find(s=>s.source_url.startsWith('https://data.brreg.no/enhetsregisteret/api/underenheter?'));
      const subunits=workplaces?normalizeWorkplaces(JSON.parse(workplaces.text),job.organisation_number).locations.map(s=>String(s.organisation_number)):[];
      const pointer=proposal.value===receipt.catalogue_sha256&&proposal.quote===JSON.stringify('catalogue_sha256')+':'+JSON.stringify(receipt.catalogue_sha256);if(!pointer&&(proposal.quote!==source.text||proposal.value!==source.text))return{accepted:false,reason:'NAV proposal must be a complete receipt or its exact catalogue pointer'};
      const query=navQuery(catalogue,job.organisation_number,subunits);if(canonical(query)!==canonical(receipt.result))return {accepted:false,reason:'NAV exact-organisation query does not match the complete index'};
      const item=evidenceFor(source,source.text),anchor=this.identitySource(job),support=[...(anchor?this.proofEvidence(job,anchor,source.source_url):[]),...(workplaces?[evidenceFor(workplaces,workplaces.text)]:[])];this.store.saveProposal(jobId,hash(canonical(proposal)),proposal);
      return {accepted:true,reason:'Derived count recomputed from complete NAV feed index using exact employer/subunit orgs',claim:{field:'hiring',value:query,availability:'available',confidence:null,evidence_ids:[item.id,...support.map(e=>e.id)],reporting_period:null,qualifiers:{attribution:'nav-complete-index-exact-org',hiring_kind:query.active_ads_attributed?'source_scoped_active_ads':'source_scoped_no_attributed_ads',observed_at:query.observed_at,company_wide_absence_established:false,catalogue_sha256:receipt.catalogue_sha256}},evidence:item,support};
    }
    if(source.extraction_method==='nav-feed-json/v1'){
      if(proposal.field!=='hiring'||!source.source_url.startsWith('https://pam-stilling-feed.nav.no/api/v1/feedentry/'))return {accepted:false,reason:'NAV feed supports exact-employer hiring only'};
      const workplaces=this.store.evidenceView(job.id).find(s=>s.source_url.startsWith('https://data.brreg.no/enhetsregisteret/api/underenheter?'));
      const subunits=workplaces?normalizeWorkplaces(JSON.parse(workplaces.text),job.organisation_number).locations.map(s=>String(s.organisation_number)):[];
      const match=navEmployerOrg(JSON.parse(source.text),job.organisation_number,subunits,source.retrieved_at);
      if(!match||proposal.value!==match.ad.json.title||proposal.effective_date!==null)return {accepted:false,reason:'NAV advertisement needs active status, valid dates and exact employer or verified registered subunit organisation number'};
      const item=evidenceFor(source,proposal.quote),anchor=this.identitySource(job),support=[...(anchor?this.proofEvidence(job,anchor,source.source_url):[]),...(workplaces&&match.binding==='registered_subunit_parent'?[evidenceFor(workplaces,workplaces.text)]:[])];
      for(const [key,value]of Object.entries({status:match.ad.status,expires:match.ad.json.expires,orgnr:match.ad.json.employer.orgnr,name:match.ad.json.employer.name})){const pattern=new RegExp('"'+key+'"\\s*:\\s*'+JSON.stringify(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));const span=pattern.exec(source.text)?.[0];if(span)support.push(evidenceFor(source,span));}
      this.store.saveProposal(jobId,hash(canonical(proposal)),proposal);
      return {accepted:true,reason:'NAV active ad bound by employer organisation number',claim:{field:'hiring',value:proposal.value,availability:'available',confidence:null,evidence_ids:[item.id,...support.map(e=>e.id)],reporting_period:null,qualifiers:{attribution:'nav-'+match.binding,hiring_kind:'active_vacancy_at_observation',employer:match.ad.json.employer.name,observed_at:source.retrieved_at,expires_at:match.ad.json.expires,vacancy_url:'https://arbeidsplassen.nav.no/stillinger/stilling/'+match.ad.json.uuid,complete_vacancy_count:false}},evidence:item,support};
    }
    const attribution:Attribution=source.source_class==='fixture'?{accepted:job.mode==='demo',kind:'fixture',support:[],reason:'Fixture'}:this.attribution(job,source,proposal.field);
    if(!attribution.accepted)return {accepted:false,reason:attribution.reason};
    const documentReportYear=source.document?attribution.support.map(s=>/(?:rapporterings[åa]ret|reporting\s+year|[åa]rsrapport)\s*[:\n]?\s*(20\d{2})/i.exec(s.text)?.[1]).find(Boolean):undefined;
    if(source.document){
      const legalName=String(this.identity(job)?.navn??''),valueFold=' '+fold(proposal.value)+' ',prefix=fold(legalName.split(/\s+og\s+/i)[0]??''),named=hasOrganisationNumber(proposal.value,job.organisation_number)||valueFold.includes(' '+fold(legalName)+' '),documentAlias=prefix.split(' ').length>=2&&prefix.length>=12&&valueFold.includes(' '+prefix+' ');
      const position=source.text.indexOf(proposal.value),before=source.text.slice(Math.max(0,position-180),position),selfDescription=/(?:viktigste merker,? produkter og tjenester|beskrivelse av virksomhetens struktur|beskrivelse av virksomheten|description of (?:the )?(?:company|business)|principal (?:activities|products)|main (?:activities|products))\s*$/i.test(before);
      if(proposal.field==='business_description'&&(!named&&!selfDescription||/(?:antall\s+(?:ansatte|[åa]rsverk)|number\s+of\s+employees|\b(?:omsetning|revenue|equity|assets|sum driftsinntekter)\b)/i.test(proposal.value)))return {accepted:false,reason:'PDF description must be the report subject\'s labelled business description; historical headcounts and financial statistics are separate facts'};
      if(proposal.field==='locations'&&(!addressMatch(proposal.value,this.identity(job)??{})||!/(?:adresse hovedkontor|headquarters address|registered office|bes[øo]ksadresse)\s*:?\s*$/i.test(before)))return {accepted:false,reason:'A document location must be the subject\'s explicitly labelled registered/headquarters address, with its report context retained'};
      if(proposal.field==='public_activity'&&!named&&!documentAlias)return {accepted:false,reason:'A report event must name its verified subject or a distinctive full-name prefix; other companies mentioned in a report are not the subject'};
      if(proposal.field==='public_activity'&&/(?:plan- og bygningsloven|SAK10|forskrift|lov av)/i.test(proposal.quote)&&!/(?:vedtok|vedtatt|lanser|announced|[åa]pnet|[åa]pna|launched|established)/i.test(proposal.value))return {accepted:false,reason:'A statutory citation date is not the company\'s event or certification award date'};
      const expiry=/(?:gyldig til|valid until|expires?(?: on)?)\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2})/i.exec(source.text),expiryDate=expiry?supportedDates(expiry[0])[0]:undefined;
      if(expiryDate&&expiryDate<source.retrieved_at.slice(0,10)&&proposal.field!=='public_activity')return {accepted:false,reason:'An expired PDF certificate cannot establish current approval, services or locations'};
    }
    if(attribution.scope==='explicit_entity_facts'){
      const legalName=String(this.identity(job)?.navn??''),fullLegal=hasOrganisationNumber(proposal.value,job.organisation_number)||(' '+fold(proposal.value)+' ').includes(' '+fold(legalName)+' ');
      if(attribution.kind==='shared-legal-practice-explicit-entity'?!fullLegal:!namesEntity(proposal.value,legalName,job.organisation_number))return{accepted:false,reason:'A registered shared-host fact must explicitly identify this exact legal entity in its published value; footer mentions do not qualify'};
    }
    if(attribution.scope==='partner_subject'&&(proposal.field!=='business_description'||!partnerSubjectParagraphs(source,this.identity(job)??{}).some(p=>p.includes(proposal.value)&&p.includes(proposal.quote))))return{accepted:false,reason:'Partner facts must stay inside a target-named service paragraph; navigation, network services and host ownership are excluded'};
    if(attribution.scope==='entity_page'){
      if(proposal.field==='official_website'&&attribution.kind!=='exact-entity-declared-pressroom'){const claimed=new URL(proposal.value),observed=new URL(source.source_url);if(claimed.pathname.replace(/\/$/,'')!==observed.pathname.replace(/\/$/,''))return{accepted:false,reason:'Entity-specific page proof cannot promote a parent root or another page to this entity website'};}
      else if(attribution.kind!=='exact-entity-declared-pressroom'&&proposal.field!=='company_owned_profiles'&&!namesEntity(proposal.quote,String(this.identity(job)?.navn??''),job.organisation_number))return{accepted:false,reason:'Facts on a shared host must identify this exact entity in their quoted context'};
    }
    if(proposal.field==='locations'&&openingHoursStatement(proposal.value))return{accepted:false,reason:'Opening hours alone are business details, not a location'};
    if(['business_description','hiring','locations'].includes(proposal.field)&&(/\[Links extracted from this page\]|\[Structured data from this page\]/.test(proposal.value)||proposal.value.length>1200&&proposal.value.split('\n').length>18))return{accepted:false,reason:'A navigation, structured-data or whole-page dump is not a scoped material claim; select the actual statement or listing'};
    if(proposal.field==='business_description'&&source.source_class!=='fixture'){
      const representationProblem=descriptionRepresentationProblem(proposal.value);if(representationProblem)return{accepted:false,reason:representationProblem};
      if(/\b\d[\d., ]*\s+(?:[\p{L}-]+\s+){0,4}(?:employees|ansatte|medarbeidere)\b/iu.test(proposal.value)||attribution.scope==='entity_page'&&!namesEntity(proposal.value,String(this.identity(job)?.navn??''),'000000000')&&/\b(?:group|gruppen|konsern|parent|\d+\s+(?:countries|land|offices|kontorer|barnehager|subsidiaries))\b/i.test(proposal.value))return{accepted:false,reason:'Unqualified headcounts and parent/group statistics are outside scoped business-description claims; official employee values remain separate'};

      if(/^(?:denne (?:nett)?side|dette nettsted|this (?:web)?site).{0,40}(?:eies|drives|owned|operated)/i.test(proposal.value)||/^(?:virksomheten|selskapet|foretaket).{0,40}registrert.{0,35}næringskode/i.test(proposal.value))return{accepted:false,reason:'Website ownership clauses and registry classification boilerplate are not business descriptions'};
      if(fold(proposal.value).split(' ').length<4&&namesEntity(proposal.value,String(this.identity(job)?.navn??''),'000000000')&&!/\b(er|tilbyr|leverer|produserer|driver|offers|provides|builds|operates)\b/i.test(proposal.value))return{accepted:false,reason:'A company or branch heading alone is not a business description'};
    }

    if(proposal.field==='official_website'&&/(?:^|\/)(?:login|logginn|signin|sign-in|innlogging)(?:[./]|$)/i.test(new URL(proposal.value).pathname))return{accepted:false,reason:'A sign-in portal is not the public company website'};
    const declaredPressroomWebsite=attribution.kind==='exact-entity-declared-pressroom'&&proposal.field==='official_website'&&source.text.split('\n').some(line=>{try{return /^(?:https?:\/\/)?www\.[a-z0-9.-]+(?:\/)?$/i.test(line.trim())&&hostOf(line.startsWith('http')?line:'https://'+line.trim())===hostOf(proposal.value);}catch{return false;}});
    if(proposal.field==='official_website'&&attribution.kind==='exact-entity-declared-pressroom'&&!declaredPressroomWebsite)return{accepted:false,reason:'A pressroom is a company profile; only its literal separately declared company URL can establish a website relationship'};
    if (proposal.field === 'official_website' && !declaredPressroomWebsite && hostOf(proposal.value) !== hostOf(source.source_url)) return { accepted: false, reason: 'Website claim does not match the verified source host' };
    if(proposal.field==='official_website'&&/\.(pdf|csv|json|png|jpg|zip)$/i.test(new URL(proposal.value).pathname))return {accepted:false,reason:'A document or download is not the official company website'};
    if(proposal.field==='company_owned_profiles'&&!ownPressroom&&(!profileUrl(proposal.value)||!this.accountMatches(job,source,proposal.value)||!linksIn(source.text).some(link=>{try{return profileUrl(link)&&canonicalProfile(link)===canonicalProfile(proposal.value);}catch{return false;}})))return {accepted:false,reason:'A company profile must be a matching social account URL explicitly linked by the attributed company page, not a directory entry or share link'};
    if(proposal.field==='hiring'&&/^(?:åpen søknad|open application)\s+(?:hvis|if)\b/i.test(proposal.value.trim()))return{accepted:false,reason:'A mid-sentence invitation fragment is not a complete hiring statement; select the full literal invitation'};
    if(proposal.field==='hiring'&&!proposal.historical_hiring&&/\/(arkiv|archives?|archiv)(\/|$)/i.test(new URL(source.source_url).pathname))return {accepted:false,reason:'An archived recruitment page cannot establish current hiring information'};
    const structuredHiring=proposal.field==='hiring'?recruitmentPositions(source.text):undefined;if(structuredHiring?.recognized&&!structuredHiring.positions.some(p=>proposal.value===p.title&&proposal.quote.includes(p.title)&&!/(?:blankStateTitle|blankStateBody|\"labels\")/.test(proposal.value+proposal.quote)))return{accepted:false,reason:'Structured careers data must cite an actual position; empty-state UI templates and whole-feed JSON are not hiring claims'};
    const hiringAt=new Date(source.retrieved_at),quoteHiring=proposal.field==='hiring'?hiringState(proposal.quote,hiringAt):undefined,valueHiring=proposal.field==='hiring'?hiringState(proposal.value,hiringAt):undefined;
    const scopedRecruitment=proposal.field==='hiring'&&attribution.kind==='recruitment-registered-subunit'?registeredRecruitmentSubjects(source,proposal.quote,this.identity(job)??{},this.store.evidenceView(job.id)):[];if(attribution.kind==='recruitment-registered-subunit'&&!scopedRecruitment.length)return{accepted:false,reason:'This quoted listing does not identify a registered target subunit and its registered city'};
    const independentPolicy=Boolean(quoteHiring&&valueHiring&&quoteHiring.kind===valueHiring.kind&&['open_application','explicit_no_open_roles','self_reported_fully_staffed'].includes(quoteHiring.kind)&&!isRecruiter(source.source_url));
    const hiring=proposal.field==='hiring'?(independentPolicy||['dated_vacancy','undated_vacancy'].includes(quoteHiring?.kind??'')||quoteHiring?.expired?quoteHiring:{...hiringState(source.text,hiringAt),kind:valueHiring?.kind==='careers_or_vacancy_information'&&quoteHiring?.kind==='careers_or_vacancy_information'?quoteHiring.kind:hiringState(source.text,hiringAt).kind}):undefined;
    if(hiring?.kind==='unverified_yearless_deadline')return{accepted:false,reason:'A yearless deadline on an older dated advert does not establish current hiring; no expiry year is invented'};
    if(hiring?.expired&&!proposal.historical_hiring)return {accepted:false,reason:'The vacancy is expired or its application deadline has passed; it cannot support current hiring'};
    if(proposal.field==='hiring'&&(isRecruiter(source.source_url)||attribution.kind==='recruitment-employer-and-identity')&&!namesEntity(proposal.quote,String(this.identity(job)?.navn??''),job.organisation_number))return {accepted:false,reason:'The hiring quote must bind the role or policy to this exact employer, not a different employer elsewhere on a multi-company jobs page'};
    const linkedRoles=proposal.quote.length>=80&&(/ledige stillinger/i.test(proposal.quote)||/\/(locations|jobs|stillinger)\//i.test(source.source_url))&&/https:\/\/[^\s]+\/(jobs|stillinger)\/[0-9a-f-]+/i.test(proposal.quote);
    const employment=/(stilling|ledig|medarbeider|arbeidsgiver|rekrutt|career|recruit|employee|hiring|vacanc|lærling|elektriker|tømrer|medarbeid|åpen søknad|open application|join (?:us|our team)|work (?:with|for) us)/i.test(proposal.quote)||/(career|karriere|\/jobs?\/|stillinger)/i.test(new URL(source.source_url).pathname);
    if(proposal.field==='hiring'&&!employment&&!linkedRoles)return {accepted:false,reason:'Application or contact text needs explicit employment/recruitment context; grants, bookings and building applications are not hiring'};
    const staffingStatement=proposal.field==='hiring'&&(hiringState(proposal.quote,hiringAt).kind==='self_reported_fully_staffed'||independentPolicy&&quoteHiring?.kind==='open_application'&&/(vil du jobbe hos oss|send(?:\s+(?:oss|gjerne|en|din|åpen)){0,5}\s+søknad|welcome.{0,20}applications|send.{0,20}application)/i.test(proposal.quote));
    if(proposal.field==='hiring'&&((proposal.quote.length<35&&!staffingStatement)||(!linkedRoles&&!staffingStatement&&!/(søknad|application|apply|søk(?!nad)|ser etter|vi trenger|stilling som|hiring|looking for|vacanc|ingen (ledige|utlyste)|no (open |current )?(positions|jobs)|alle stillinger.{0,10}besatt|recruit)/i.test(proposal.quote))))return {accepted:false,reason:'Hiring evidence must describe a role, recruitment policy or explicit vacancy state; a careers navigation link alone is insufficient'};
    if (proposal.effective_date !== null && !supportedTemporalDate(proposal.quote,proposal.effective_date)) return { accepted: false, reason: 'Date must be supported by the quoted source at its stated precision; never invent a day for a year-only announcement' };
    if(proposal.field==='public_activity'&&source.source_class!=='fixture'&&(!proposal.effective_date||!supportedTemporalDate(proposal.quote,proposal.effective_date)))return{accepted:false,reason:'Public activity requires a supported source date with its role and precision preserved'};
    if(proposal.field==='public_activity'&&/^\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\s+(av|by)\s+[^\n]+\s*$/iu.test(proposal.value))return {accepted:false,reason:'A date and author byline alone do not describe a company event'};
    if(proposal.field==='public_activity'&&source.source_class!=='fixture'&&attribution.scope!=='document_subject'&&!(attribution.scope==='company_host'&&/\b(?:we|our|us|vi|oss|vår|vårt|våre)\b/i.test(proposal.value))&&!namesEntity(proposal.value,String(this.identity(job)?.navn??''),job.organisation_number))return {accepted:false,reason:'The activity itself must identify this exact entity; a group footer cannot attribute another company event'};
    if(['entity_page','explicit_entity_facts','document_subject','third_party_contact','partner_subject','registered_subunit'].includes(attribution.scope??'')&&source.source_class!=='fixture'&&source.source_class!=='external'){source.source_class='external';this.store.db.prepare('UPDATE snapshots SET body=? WHERE id=? AND job=?').run(JSON.stringify(source),source.id,jobId);}
    if(!['entity_page','explicit_entity_facts','document_subject','third_party_contact','partner_subject','registered_subunit'].includes(attribution.scope??'')&&source.source_class!=='fixture'&&source.source_class!=='company_owned'&&!['recruitment-employer-and-identity','exact-org-directory-profile'].includes(attribution.kind)){
      source.source_class='company_owned';this.store.db.prepare('UPDATE snapshots SET body=? WHERE id=? AND job=?').run(JSON.stringify(source),source.id,jobId);
    }
    const item = evidenceFor(source, proposal.quote),anchor=this.identitySource(job);
    const proofSources=[...new Map([source,...attribution.support,...(anchor?[anchor]:[])].map(s=>[s.id,s])).values()];
    const support=proofSources.flatMap(s=>this.proofEvidence(job,s,source.source_url)).filter(e=>e.id!==item.id);
    this.store.saveProposal(jobId,hash(canonical(proposal)),proposal);
    const contextualLocation=proposal.field==='locations'?locationContext(source.text,proposal.value,proposal.quote):{};
    const locationScope=proposal.field!=='locations'?{}:Object.keys(contextualLocation).length?contextualLocation:/\b(?:postboks|postbox|p\.?\s*o\.?\s*box)\b/i.test(proposal.value)?{location_kind:'postal_contact',operating_location_established:false}:/\/(?:eiendommer|properties|portfolio)(?:[/.]|$)/i.test(new URL(source.source_url).pathname)?{location_kind:'property_portfolio',operating_location_established:false}:!/(?:kontor|butikk|lager|fabrikk|besøk|adresse|located|based|office|warehouse|facility|headquarters)/i.test(proposal.value)&&/\b(?:område|region|nær|near|nærmeste|i [^.!?]+ og [^.!?]+)\b/i.test(proposal.value)?{location_kind:'area_description',operating_location_established:false}:{};
    const groupBoilerplate=proposal.field==='hiring'&&isRecruiter(source.source_url)?proposal.value.search(/\n## (Om |About )/i):-1;
    const value=proposal.field==='company_owned_profiles'?canonicalProfile(proposal.value):groupBoilerplate>35?proposal.value.slice(0,groupBoilerplate).trim():proposal.value;
    return { accepted: true, reason: attribution.reason, claim: { field: proposal.field, value, availability: 'available', confidence: null, evidence_ids: [item.id,...support.map(e=>e.id)], reporting_period: proposal.effective_date,qualifiers:{...temporalDateQualifiers(proposal.effective_date,proposal.date_type),attribution:attribution.kind,source_scope:attribution.scope??(['recruitment-employer-and-identity','exact-org-directory-profile'].includes(attribution.kind)?'third_party_record':'company_host'),...locationScope,...(proposal.field==='business_description'?{...comparativeMarketingScope(proposal.value),...(openingHoursStatement(proposal.value)?{statement_kind:'publisher_reported_weekly_hours',current_operational_hours_established:false,hours_scope:'as_stated_on_cited_page'}:{}),...(/certif|sertif|godkjent.{0,60}(?:ASC|ISO)|\b(?:ASC|ISO)[- ](?:standard|\d)/i.test(proposal.value)?{qualification_assertion_scope:'publisher_reported',certification_independently_verified:false}:{})}:{}),...(declaredPressroomWebsite?{source_scope:'independently_declared_website_relationship',destination_content_verified:false,destination_access_restricted:Boolean(knownAccessRestriction(proposal.value))}:{}),...(ownPressroom?{source_scope:'company_declared_pressroom',host_ownership_established:false}:{}),...(scopedRecruitment.length?{employer_subunit_organisation_numbers:scopedRecruitment.map(s=>s.organisation_number),legal_employer_organisation_number:job.organisation_number,chain_wide_jobs_established:false}:{}),...(attribution.scope==='partner_subject'?{publisher_reported:true,current_certification_independently_verified:false,host_ownership_established:false}:{}),...(attribution.scope==='third_party_contact'?{location_kind:'secondary_contact',operating_location_established:false,contact_record_current_status_unverified:true}:{}),...(source.document?{document_subject_only:true,document_reporting_year:documentReportYear??null,current_status_established:false,...(proposal.field==='locations'?{operating_location_established:false,location_kind:'historical_document_contact'}:{}),document_page:source.document.page_number,document_raw_sha256:source.document.raw_sha256}:{}),validation_policy:validationPolicy,...(hiring?{hiring_kind:proposal.historical_hiring?'historical_'+hiring.kind:hiring.kind,observed_at:source.retrieved_at,...(proposal.historical_hiring?{historical_hiring:true,current_vacancy_established:false}:hiring.kind==='undated_vacancy'?{current_vacancy_established:false,currentness:'Undated advertised role; current open status is unknown'}:{})}:{}),...(proposal.field==='hiring'?recruitmentSourceConflict(source.text):{})} }, evidence: item,support };
  }
  publicRolesSource(job:Job,source:Snapshot):Snapshot{
    if(source.extraction_method==='registry-public-roles-projection/v1')return source;
    const existing=this.store.evidenceView(job.id).find(s=>s.derivation?.input_snapshot_id===source.id&&s.extraction_method==='registry-public-roles-projection/v1');
    if(existing)return existing;
    const projection=snapshot({source_url:source.source_url+'#projection=public-roles-v1',text:JSON.stringify(normalizeRoles(JSON.parse(source.text))),source_class:'public_registry',organisation_number:job.organisation_number,run_id:job.run_id,extraction_method:'registry-public-roles-projection/v1',derivation:{kind:'privacy_filtered_registry_projection',input_snapshot_id:source.id,input_content_sha256:source.content_sha256,fields_removed:['person.fodselsdato','person.foedselsdato'],generated_at:now()}},source.retrieved_at);
    this.store.saveSnapshot(job.id,projection);return projection;
  }
  proofEvidence(job:Job,source:Snapshot,target:string){
    if(source.source_class==='public_registry'&&/\/roller(?:$|[?#])/.test(source.source_url))source=this.publicRolesSource(job,source);
    if(job.mode==='demo')return [];
    if(source.source_class==='public_registry'&&source.text.length<=6000)return [evidenceFor(source,source.text)];
    const orgPattern=new RegExp(job.organisation_number.split('').join('[ \\t.\\u00a0]*'));
    const spans=new Set<string>();
    const add=(index:number,radius=700)=>{if(index>=0)spans.add(source.text.slice(Math.max(0,index-radius),Math.min(source.text.length,index+radius)));};
    add(source.text.search(orgPattern));
    const identity=this.identity(job),name=String(identity?.navn??'').replace(/\s+(AS|ASA|ANS|DA)$/i,'');add(source.text.toLocaleLowerCase('nb').indexOf(name.toLocaleLowerCase('nb')));
    const address=identity?.forretningsadresse as Record<string,unknown>|undefined;
    if(address?.postnummer)add(source.text.indexOf(String(address.postnummer)));
    add(source.text.search(/(?:tel:|telefon|phone|\+47)/i));
    for(const link of linksIn(source.text)){try{if(domain(link)===domain(target)){add(source.text.indexOf(link),400);break;}}catch{}}
    if(!spans.size)spans.add(source.text.slice(0,1400));
    return [...spans].map(span=>evidenceFor(source,span));
  }
  finalize(job: Job, baseline: Awaited<ReturnType<ResearchService['registry']>>, proposals: Proposal[], extraErrors: Envelope['errors'] = []): Envelope {
    const claims = [...baseline.claims], evidence = [...baseline.evidence], errors = [...baseline.errors, ...extraErrors];
    const allProposals=[...new Map([...proposals,...this.store.proposals(job.id).map(p=>proposalSchema.parse(p))].map(p=>[canonical(p),p])).values()];
    for (const proposal of allProposals) {
      try {
        const check = this.verify(job.id, proposal);
        if (check.accepted && check.claim && check.evidence) {
          claims.push(check.claim); evidence.push(check.evidence,...(check.support??[]));
        }
        else {errors.push({ code: 'claim_rejected', message: `${proposal.field}: ${check.reason}` });if(check.reason.startsWith('Source access policy:')&&!claims.some(c=>c.field===proposal.field&&c.availability==='blocked'))claims.push({field:proposal.field,value:null,availability:'blocked',confidence:null,evidence_ids:[],qualifiers:{reason:check.reason,source_url:this.store.source(job.id,proposal.snapshot_id).source_url}});}
      } catch (error) { errors.push({ code: 'claim_rejected', message: errorMessage(error) }); }
    }
    const reviewed=(this.store.extractionCache('assisted-source-bound-publication-decisions/v1:'+job.id)??[])as{field:string;source_sha256:string;value_sha256:string;action:string;availability?:'ambiguous'|'blocked';reason:string;receipt_sha256:string}[],current=currentSourceVersions(this.store.evidenceView(job.id));
    for(const decision of reviewed.filter(r=>r.action==='reject'&&r.availability&&current.some(s=>s.content_sha256===r.source_sha256)))if(!claims.some(c=>c.field===decision.field&&c.qualifiers?.withdrawn_value_sha256===decision.value_sha256))claims.push({field:decision.field,value:null,availability:decision.availability!,confidence:null,evidence_ids:[],qualifiers:{reason:decision.reason,publication_review:'source_bound_assistant_review',publication_review_receipt_sha256:decision.receipt_sha256,evaluation_assisted:true,withdrawn_value_sha256:decision.value_sha256,withdrawn_source_sha256:decision.source_sha256}});
    if(this.providerBlock&&!errors.some(e=>e.code==='web_provider_blocked'))errors.push({code:'web_provider_blocked',message:this.providerBlock});
    for (const field of researchFields) if (!claims.some(c => c.field === field)) claims.push({ field, value: null, availability:job.mode==='registry'?'not_applicable':this.providerBlock?'blocked':this.store.usage(job.id).searches>0||this.store.usage(job.id).pages>0||this.store.evidenceView(job.id).some(s=>s.source_class!=='public_registry')?'ambiguous':'failed', confidence: null, evidence_ids: [],qualifiers:{reason:this.providerBlock??'No sufficiently attributed evidence was found within the research budget; this is not proof of absence'} });
    // Canonical aliases within one host are one web property. Different verified
    // company domains/products must not disappear merely because another URL is shorter.
    const websites=new Map<string,Claim>();
    for(const c of claims.filter(c=>c.field==='official_website'&&c.availability==='available').sort((a,b)=>String(a.value).length-String(b.value).length)){
      const host=new URL(String(c.value)).hostname.replace(/^www\./,'');if(!websites.has(host))websites.set(host,c);
    }
    for(let i=claims.length-1;i>=0;i--)if(claims[i]!.field==='official_website'&&claims[i]!.availability==='available'&&websites.get(new URL(String(claims[i]!.value)).hostname.replace(/^www\./,''))!==claims[i])claims.splice(i,1);
    const usage = this.store.usage(job.id);
    const billing=modelBilling(this.store,job.id,job.mode);
    const result: Envelope = {
      organisation_number: job.organisation_number,
      run: { run_id: job.run_id, started_at: job.started_at, completed_at: now(), terminal_status: claims.some(c => c.availability === 'available') ? claims.some(c => ['failed','ambiguous','blocked'].includes(c.availability)) ? 'partial' : 'completed' : 'failed', mode: job.mode },
      claims: [...new Map(claims.map(c => [`${c.field}\n${canonical(c.value)}`, c])).values()], evidence: [...new Map(evidence.map(e => [e.id,e])).values()], changes: [], errors,
      operations: { requests: usage.requests, runtime_ms: Date.now() - Date.parse(job.started_at), third_party_cost_usd: billing.cost===null||this.settings.exaTransport==='connector'?null:usage.cost+billing.cost, known_exa_cost_usd: usage.cost, model_cost_usd:billing.cost, cost_complete:this.settings.exaTransport!=='connector'&&billing.cost!==null&&this.store.uncertainCosts(job.id)===0&&!(this.store.modelUsage(job.id) as {incomplete?:boolean}|undefined)?.incomplete,model_billing:billing.basis,...(this.settings.exaTransport==='connector'?{exa_billing:'Provider USD cost not reported'}:{}) },
    };
    if(billing.input!==undefined)result.operations.model_input_tokens=billing.input;
    if(billing.output!==undefined)result.operations.model_output_tokens=billing.output;
    const rates=modelRates(process.env.SIGNALPOST_MODEL??'gpt-6-luna',process.env.SIGNALPOST_MODEL_PROVIDER??'chatgpt');
    for(const c of result.claims)c.qualifiers={...c.qualifiers,validation_policy:validationPolicy};
    result.operations.model_api_equivalent_usd=this.store.modelUsage(job.id)?(rates?apiEquivalent(this.store.modelUsage(job.id),rates):null):0;
    result.operations.model_api_equivalent_basis=rates?{...rates,semantics:'input inclusive of cache read/write; legacy counts conservatively uncached; estimate distinct from subscription charge'}:null;
    if(this.settings.exaTransport==='openai'){const receipts=this.store.db.prepare('SELECT body FROM operation_metrics WHERE run=? AND org=?').all(job.run_id,job.organisation_number).map(r=>JSON.parse(String(r.body))).filter(r=>r.stage==='native_search_receipt'),calls=this.store.db.prepare("SELECT state FROM calls WHERE job=? AND kind='search'").all(job.id),complete=calls.every(c=>c.state==='completed')&&receipts.length===calls.length&&receipts.every(nativeReceiptComplete),fee=receipts.reduce((n,r)=>n+Number(r.known_search_api_equivalent_usd??0),0);result.operations.known_search_api_equivalent_usd=fee;result.operations.search_api_equivalent_usd=complete?fee:null;result.operations.estimated_third_party_cost_usd=complete&&result.operations.third_party_cost_usd!==null?result.operations.third_party_cost_usd+fee:null;result.operations.third_party_cost_usd=null;result.operations.model_cost_usd=null;result.operations.cost_complete=false;result.operations.model_billing='Configured token-rate estimate only; actual OpenAI invoice USD not reported';}
    result.operations.model_usage_complete=!(this.store.modelUsage(job.id) as {incomplete?:boolean}|undefined)?.incomplete;
    result.changes = materialChanges(this.store.previous(job.organisation_number, job.run_id), result);
    result.claim_history=updateClaimLedger(this.store,result);result.synthesis=synthesize(result);
    this.store.saveProfile(result);
    return result;
  }
}

let shared: ResearchService | undefined;
export function service(): ResearchService { return shared ??= new ResearchService(new Store(config().db)); }
