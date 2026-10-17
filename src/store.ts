import{SealedEvidenceViews}from'./sealed-evidence-view.ts';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Envelope, Snapshot } from './domain.ts';
import { now } from './domain.ts';

const jsonRow = z.object({ body: z.string() });
export type Job = { id: string; organisation_number: string; run_id: string; started_at: string; mode: 'demo' | 'registry' | 'eve'; deadline_at?: string; session_id?: string; review_only?:boolean };
export class Store {
  readonly db: DatabaseSync;
  private evidenceViews=new SealedEvidenceViews();
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true,mode:0o700 });
    this.db = new DatabaseSync(path);
    if(path!==':memory:')chmodSync(path,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, org TEXT NOT NULL, run TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, job TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS snapshots_job ON snapshots(job);
      CREATE TABLE IF NOT EXISTS profiles(org TEXT NOT NULL, run TEXT NOT NULL, completed TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(org,run));
      CREATE TABLE IF NOT EXISTS calls(job TEXT NOT NULL, key TEXT NOT NULL, kind TEXT NOT NULL, cost REAL NOT NULL, state TEXT NOT NULL, body TEXT, PRIMARY KEY(job,key));
      CREATE TABLE IF NOT EXISTS verified_hosts(job TEXT NOT NULL, host TEXT NOT NULL, snapshot TEXT NOT NULL, PRIMARY KEY(job,host));
      CREATE TABLE IF NOT EXISTS session_receipts(job TEXT PRIMARY KEY, session TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS model_results(job TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS model_usage(job TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS model_attempts(job TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(job,provider,model));
      CREATE TABLE IF NOT EXISTS verified_proposals(job TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(job,key));
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT NOT NULL, org TEXT, at TEXT NOT NULL, stage TEXT NOT NULL, message TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS catalogues(id TEXT PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS candidate_urls(org TEXT NOT NULL,url TEXT NOT NULL,discovered TEXT NOT NULL,method TEXT NOT NULL,PRIMARY KEY(org,url));
      CREATE TABLE IF NOT EXISTS resource_ledger(run TEXT NOT NULL,resource TEXT NOT NULL,value REAL NOT NULL,PRIMARY KEY(run,resource));
      CREATE TABLE IF NOT EXISTS operation_metrics(id INTEGER PRIMARY KEY AUTOINCREMENT,run TEXT NOT NULL,org TEXT,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS extraction_cache(key TEXT PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS artifact_versions(kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(kind,id));
      CREATE TRIGGER IF NOT EXISTS snapshots_insert_version AFTER INSERT ON snapshots BEGIN INSERT INTO artifact_versions VALUES('evidence',NEW.job,1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1; END;
      CREATE TRIGGER IF NOT EXISTS snapshots_update_version AFTER UPDATE ON snapshots BEGIN INSERT INTO artifact_versions VALUES('evidence',OLD.job,1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1; INSERT INTO artifact_versions SELECT 'evidence',NEW.job,1 WHERE NEW.job<>OLD.job ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1; END;
      CREATE TRIGGER IF NOT EXISTS snapshots_delete_version AFTER DELETE ON snapshots BEGIN INSERT INTO artifact_versions VALUES('evidence',OLD.job,1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1; END;
      CREATE TRIGGER IF NOT EXISTS hosts_insert_version AFTER INSERT ON verified_hosts BEGIN INSERT INTO artifact_versions VALUES('evidence',NEW.job,1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1; END;
      CREATE TRIGGER IF NOT EXISTS hosts_update_version AFTER UPDATE ON verified_hosts BEGIN INSERT INTO artifact_versions VALUES('evidence',NEW.job,1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1; END;
      CREATE TRIGGER IF NOT EXISTS hosts_delete_version AFTER DELETE ON verified_hosts BEGIN INSERT INTO artifact_versions VALUES('evidence',OLD.job,1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1; END;
      CREATE TRIGGER IF NOT EXISTS catalogues_insert_version AFTER INSERT ON catalogues BEGIN INSERT INTO artifact_versions VALUES('catalogue',NEW.id,1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1; END;
      CREATE TRIGGER IF NOT EXISTS catalogues_update_version AFTER UPDATE ON catalogues BEGIN INSERT INTO artifact_versions VALUES('catalogue',NEW.id,1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1; END;
      CREATE TRIGGER IF NOT EXISTS catalogues_delete_version AFTER DELETE ON catalogues BEGIN INSERT INTO artifact_versions VALUES('catalogue',OLD.id,1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1; END;
      CREATE TABLE IF NOT EXISTS current_claims(org TEXT NOT NULL,key TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(org,key));
      CREATE TABLE IF NOT EXISTS claim_observations(org TEXT NOT NULL,key TEXT NOT NULL,run TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(org,key,run));
      CREATE UNIQUE INDEX IF NOT EXISTS jobs_org_run ON jobs(org,run);
    `);
  }
  close() { this.evidenceViews.clear();this.db.close(); }
  artifactRevision(kind:string,id:string){return Number(this.db.prepare('SELECT revision FROM artifact_versions WHERE kind=? AND id=?').get(kind,id)?.revision??0);}
  evidenceView(job:string){return this.evidenceViews.get(job,this.artifactRevision('evidence',job),()=>{const rows=this.db.prepare('SELECT body FROM snapshots WHERE job=? ORDER BY rowid').all(job);return{sources:rows.map(r=>JSON.parse(String(r.body)) as Snapshot),bytes:rows.reduce((n,r)=>n+Buffer.byteLength(String(r.body)),0)};});}
  evidenceViewMetrics(){return{...this.evidenceViews.metrics};}
  reserveResource(run:string,resource:string,amount:number,limit:number){
    if(!Number.isFinite(amount)||amount<0)throw Error('Invalid resource reservation');this.db.exec('BEGIN IMMEDIATE');
    try{const value=Number(this.db.prepare('SELECT value FROM resource_ledger WHERE run=? AND resource=?').get(run,resource)?.value??0);if(value+amount>limit+1e-9)throw Error(resource+' resource budget exhausted');this.db.prepare('INSERT INTO resource_ledger VALUES(?,?,?) ON CONFLICT(run,resource) DO UPDATE SET value=excluded.value').run(run,resource,value+amount);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  settleResource(run:string,resource:string,reserved:number,actual:number){if(!Number.isFinite(actual)||actual<0)throw Error('Invalid measured usage');this.db.prepare('UPDATE resource_ledger SET value=max(0,value-?+?) WHERE run=? AND resource=?').run(reserved,actual,run,resource);}
  resources(run:string){return Object.fromEntries(this.db.prepare('SELECT resource,value FROM resource_ledger WHERE run=?').all(run).map(row=>[String(row.resource),Number(row.value)]));}
  operation(run:string,org:string|null,body:unknown){this.db.prepare('INSERT INTO operation_metrics(run,org,body) VALUES(?,?,?)').run(run,org,JSON.stringify(body));}
  extractionCache(key:string):unknown{const row=this.db.prepare('SELECT body FROM extraction_cache WHERE key=?').get(key);return row?JSON.parse(String(row.body)):undefined;}
  saveExtractionCache(key:string,body:unknown){this.db.prepare('INSERT OR REPLACE INTO extraction_cache VALUES(?,?)').run(key,JSON.stringify(body));}
  externalSourceHealth(){
    const calls=this.db.prepare("SELECT kind,state,body FROM calls WHERE kind IN ('search','contents')").all();let succeeded=0,blocked=0,unpriced=0,connectorTools=0,fulltext=0;
    for(const c of calls){const b=c.body?JSON.parse(String(c.body)):{};if(c.state==='completed'){succeeded++;if(b.results?.some((r:{text?:string})=>typeof r.text==='string'&&r.text.length>=35))fulltext++;if(b.transport==='exa-connected-service'&&b.cost_reported===false){unpriced++;connectorTools+=b.connector_tool_calls??0;}}else if(/HTTP (401|402)|Exa(?: API| MCP)? access blocked/.test(String(b.error??'')))blocked++;}
    return{operations:calls.length,successful_operations:succeeded,successful_fulltext_operations:fulltext,successful_search_operations:calls.filter(c=>c.kind==='search'&&c.state==='completed').length,account_blocked_operations:blocked,unpriced_operations:unpriced,connector_tool_calls:connectorTools};
  }
  saveCatalogue(id:string,body:unknown){if(this.db.prepare('SELECT 1 FROM catalogues WHERE id=?').get(id))return;this.db.prepare('INSERT OR IGNORE INTO catalogues VALUES(?,?)').run(id,JSON.stringify(body));}
  catalogue(id:string):unknown{const row=this.db.prepare('SELECT body FROM catalogues WHERE id=?').get(id);return row?JSON.parse(jsonRow.parse(row).body):undefined;}
  latestCatalogue():unknown{const row=this.db.prepare("SELECT body FROM catalogues WHERE json_extract(body,'$.complete')=1 ORDER BY json_extract(body,'$.completed_at') DESC LIMIT 1").get();return row?JSON.parse(jsonRow.parse(row).body):undefined;}
  saveCandidate(org:string,url:string,method:string){this.db.prepare('INSERT OR REPLACE INTO candidate_urls VALUES(?,?,?,?)').run(org,url,now(),method);}
  candidates(org:string):string[]{return this.db.prepare('SELECT url FROM candidate_urls WHERE org=? ORDER BY discovered DESC').all(org).map(row=>z.object({url:z.string()}).parse(row).url);}
  saveRun(id: string, body: Record<string,unknown>) { this.db.prepare('INSERT OR REPLACE INTO runs VALUES(?,?)').run(id,JSON.stringify(body)); }
  run(id: string): Record<string,unknown>|undefined { const row=this.db.prepare('SELECT body FROM runs WHERE id=?').get(id);return row?JSON.parse(jsonRow.parse(row).body):undefined; }
  event(run: string, org: string|null, stage: string, message: string) { this.db.prepare('INSERT INTO events(run,org,at,stage,message) VALUES(?,?,?,?,?)').run(run,org,now(),stage,message.slice(0,1000)); }
  saveProposal(job:string,key:string,proposal:unknown) {this.db.prepare('INSERT OR REPLACE INTO verified_proposals VALUES(?,?,?)').run(job,key,JSON.stringify(proposal));}
  proposals(job:string):unknown[]{return this.db.prepare('SELECT body FROM verified_proposals WHERE job=?').all(job).map(row=>JSON.parse(jsonRow.parse(row).body));}
  createJob(org: string, run: string, mode: Job['mode'], deadlineAt?: string): Job {
    const existing = this.db.prepare('SELECT body FROM jobs WHERE org=? AND run=?').get(org, run);
    if (existing) return JSON.parse(jsonRow.parse(existing).body);
    const job: Job = { id: randomUUID(), organisation_number: org, run_id: run, started_at: now(), mode };
    if (deadlineAt) job.deadline_at = deadlineAt;
    this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?)').run(job.id, org, run, JSON.stringify(job));
    return job;
  }
  job(id: string): Job {
    const row = this.db.prepare('SELECT body FROM jobs WHERE id=?').get(id);
    if (!row) throw new Error('Unknown research job');
    return JSON.parse(jsonRow.parse(row).body);
  }
  jobForSession(session:string):Job{
    const row=this.db.prepare('SELECT jobs.body FROM jobs JOIN session_receipts ON session_receipts.job=jobs.id WHERE session_receipts.session=?').get(session);
    if(!row)throw new Error('This model session is not bound to a research job');return JSON.parse(jsonRow.parse(row).body);
  }
  saveSnapshot(job: string, source: Snapshot) { this.db.prepare('INSERT OR IGNORE INTO snapshots VALUES(?,?,?)').run(source.id, job, JSON.stringify(source)); }
  snapshots(job: string): Snapshot[] { return this.db.prepare('SELECT body FROM snapshots WHERE job=? ORDER BY rowid').all(job).map(r => JSON.parse(jsonRow.parse(r).body)); }
  source(job: string, id: string): Snapshot {
    const row = this.db.prepare('SELECT body FROM snapshots WHERE job=? AND id=?').get(job, id);
    if (!row) throw new Error('Snapshot does not belong to this research job');
    return JSON.parse(jsonRow.parse(row).body);
  }
  verifyHost(job: string, host: string, source: string) { this.db.prepare('INSERT OR IGNORE INTO verified_hosts VALUES(?,?,?)').run(job, host, source); }
  hostVerified(job: string, host: string): boolean { return Boolean(this.db.prepare('SELECT 1 FROM verified_hosts WHERE job=? AND host=?').get(job, host)); }
  saveProfile(profile: Envelope) { this.db.prepare('INSERT OR REPLACE INTO profiles VALUES(?,?,?,?)').run(profile.organisation_number, profile.run.run_id, profile.run.completed_at, JSON.stringify(profile)); }
  profile(org: string, run: string): Envelope | undefined { const row = this.db.prepare('SELECT body FROM profiles WHERE org=? AND run=?').get(org, run); return row ? JSON.parse(jsonRow.parse(row).body) : undefined; }
  previous(org: string, run: string): Envelope | undefined {
    const history: Envelope[] = this.db.prepare('SELECT body FROM profiles WHERE org=? AND run<>? ORDER BY completed DESC,rowid DESC').all(org, run).map(row => JSON.parse(jsonRow.parse(row).body));
    const latest = history[0];
    if (!latest) return undefined;
    const seen = new Set<string>(), claims: Envelope['claims'] = [], evidence: Envelope['evidence'] = [];
    for (const profile of history) {
      const fields = new Set(profile.claims.filter(c => c.availability === 'available' && !seen.has(c.field)).map(c => c.field));
      claims.push(...profile.claims.filter(c => fields.has(c.field) && c.availability === 'available'));
      evidence.push(...profile.evidence);
      for (const field of fields) seen.add(field);
    }
    return { ...latest, claims, evidence: [...new Map(evidence.map(e => [e.id, e])).values()] };
  }
  receipt(job: string): string | undefined { const row = this.db.prepare('SELECT session FROM session_receipts WHERE job=?').get(job); return row ? z.object({ session: z.string() }).parse(row).session : undefined; }
  saveReceipt(job: string, session: string) { this.db.prepare('INSERT OR REPLACE INTO session_receipts VALUES(?,?)').run(job, session); }
  saveModelResult(job: string, result: unknown) { this.db.prepare('INSERT OR REPLACE INTO model_results VALUES(?,?)').run(job, JSON.stringify(result)); }
  modelResult(job: string): unknown { const row = this.db.prepare('SELECT body FROM model_results WHERE job=?').get(job); return row ? JSON.parse(jsonRow.parse(row).body) : undefined; }
  modelAttempt(job:string,provider:string,model:string):Record<string,unknown>|undefined{const row=this.db.prepare('SELECT body FROM model_attempts WHERE job=? AND provider=? AND model=?').get(job,provider,model);return row?JSON.parse(String(row.body)):undefined;}
  beginModelAttempt(job:string,provider:string,model:string,details:Record<string,unknown>){this.db.prepare('INSERT INTO model_attempts VALUES(?,?,?,?)').run(job,provider,model,JSON.stringify({...details,state:'pending',started_at:now()}));}
  finishModelAttempt(job:string,provider:string,model:string,details:Record<string,unknown>){const old=this.modelAttempt(job,provider,model);if(!old)throw Error('Model attempt missing');this.db.prepare('UPDATE model_attempts SET body=? WHERE job=? AND provider=? AND model=?').run(JSON.stringify({...old,...details,finished_at:now()}),job,provider,model);}
  saveModelUsage(job:string,body:unknown){this.db.prepare('INSERT OR REPLACE INTO model_usage VALUES(?,?)').run(job,JSON.stringify(body));}
  modelUsage(job:string):unknown{const row=this.db.prepare('SELECT body FROM model_usage WHERE job=?').get(job);return row?JSON.parse(jsonRow.parse(row).body):undefined;}
  usage(job: string) {
    return z.object({ requests: z.number(), cost: z.number(), searches: z.number(), pages: z.number() }).parse(this.db.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(cost),0) AS cost, COALESCE(SUM(kind='search'),0) AS searches, COALESCE(SUM(kind='contents'),0) AS pages FROM calls WHERE job=?`).get(job));
  }
  uncertainCosts(job:string):number{return z.object({count:z.number()}).parse(this.db.prepare("SELECT COUNT(*) as count FROM calls WHERE job=? AND kind NOT IN ('registry','html','public_feed') AND (state<>'completed' OR json_extract(body,'$.costDollars.total') IS NULL)").get(job)).count;}
  call(job: string, key: string): { state: string; body: unknown } | undefined {
    const row = this.db.prepare('SELECT state,body FROM calls WHERE job=? AND key=?').get(job,key);
    if (!row) return undefined;
    const parsed = z.object({ state: z.string(), body: z.string().nullable() }).parse(row);
    return { state: parsed.state, body: parsed.body === null ? null : JSON.parse(parsed.body) };
  }
  reserve(job: string, key: string, kind: string, cost: number, maxCost: number, limit: number) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.call(job,key)) throw new Error('Request already reserved; resume from its recorded result');
      const run = this.job(job).run_id;
      const total = z.object({ total: z.number() }).parse(this.db.prepare('SELECT COALESCE(SUM(cost),0) AS total FROM calls JOIN jobs ON jobs.id=calls.job WHERE jobs.run=?').get(run)).total;
      const count = z.object({ count: z.number() }).parse(this.db.prepare('SELECT COUNT(*) AS count FROM calls WHERE job=? AND kind=?').get(job,kind)).count;
      if (total + cost > maxCost + 1e-9 || count >= limit) throw new Error('Research budget exhausted');
      this.db.prepare('INSERT INTO calls VALUES(?,?,?,?,?,NULL)').run(job,key,kind,cost,'pending');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  settle(job: string, key: string, body: unknown, state = 'completed', actualCost?: number) {
    this.db.prepare('UPDATE calls SET state=?,body=?,cost=COALESCE(?,cost) WHERE job=? AND key=?').run(state,JSON.stringify(body),actualCost ?? null,job,key);
  }
}
