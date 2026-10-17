import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'eve/client';
import { researchOutputSchema, researchResultSchema, type Proposal } from './domain.ts';
import type { Store, Job } from './store.ts';
import { ResearchService } from './service.ts';
import { retryIdleCreation } from './idle-retry.ts';
import { parseModelOutput } from './model-output.ts';
import { resilientFirstTurn } from './model-turn.ts';
import {commitExtraction} from './extraction.ts';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to allocate local eve port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
export async function startEve(logPath: string, host?: string) {
  let child: ChildProcess | undefined;
  if (!host) {
    const port = await freePort();
    host = `http://127.0.0.1:${port}`;
    await mkdir(dirname(resolve(logPath)), { recursive: true });
    const log = await open(logPath, 'a', 0o600);
    child = spawn(resolve('node_modules/.bin/eve'), ['dev', '--no-ui', '--no-default-extensions', '--host', '127.0.0.1', '--port', String(port), '--resume'], {
      cwd: process.cwd(), env: { ...process.env, EVE_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', log.fd, log.fd],
    });
    child.on('error', () => {});
    await log.close();
  } else {
    const url = new URL(host);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('--eve-url must refer to a local server when using a Codex subscription');
  }
  const client = new Client({ host });
  try {
    const deadline = Date.now() + 90_000;
    while (true) {
      if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`eve exited with code ${child.exitCode}; inspect ${logPath}`);
      try { await client.health(); break; } catch {
        if (Date.now() >= deadline) throw new Error(`eve did not become ready; inspect ${logPath}`);
        await delay(400);
      }
    }
  } catch (error) { child?.kill('SIGTERM'); throw error; }
  return {
    client,
    async stop() {
      if (!child || child.exitCode !== null) return;
      const exited = new Promise<void>(resolve => child?.once('exit', () => resolve()));
      child.kill('SIGTERM');
      const timer = setTimeout(() => child?.kill('SIGKILL'), 5000);
      timer.unref(); await exited; clearTimeout(timer);
    },
  };
}
export async function researchWithEve(client: Client, store: Store, job: Job, timeoutMs: number): Promise<Proposal[]> {
  const signal = AbortSignal.timeout(timeoutMs);
  const saved = store.modelResult(job.id);
  if (saved) return researchResultSchema.parse(saved).claims;
  const receipt = store.receipt(job.id);
  let session = receipt ? client.sessions.attach(receipt) : (await retryIdleCreation(()=>client.sessions.create({signal}),signal)).session;
  if (receipt) throw new Error(`Interrupted eve session ${receipt}; inspect its history before starting a new run-id`);
  store.saveReceipt(job.id, session.state.sessionId);
  try {
    const result = await resilientFirstTurn(
      ()=>session.send(`Research job_id ${job.id}. Extract only from the already preserved sources. Call research_context once, inspect at most four local windows, then submit_research once with the supported claims (or an empty array). Do not browse or request network access. Your completed extraction must be persisted before the final response.`, { outputSchema: researchOutputSchema, signal }),
      {
        sessionId:()=>session.state.sessionId,
        snapshot:async()=>(await session.snapshot({signal})).events,
        retire:async()=>{await session.reset({reason:'Inspecting an empty session after transport failure',signal});},
        replaceEmpty:async()=>{session=(await retryIdleCreation(()=>client.sessions.create({signal}),signal)).session;store.saveReceipt(job.id,session.state.sessionId);store.event(job.run_id,job.organisation_number,'model_recovery','Replacement empty session: '+session.state.sessionId);},
        follow:()=>session.stream({startIndex:0,signal}),
        cancel:()=>session.cancel({signal:AbortSignal.timeout(3000)}),
        note:message=>store.event(job.run_id,job.organisation_number,'model_recovery',session.state.sessionId+': '+message),
      },store,job.id,signal,
    );
    const committed=store.modelResult(job.id);
    if(committed!==undefined){await session.reset({reason:'Validated extraction already persisted',signal:AbortSignal.timeout(3000)}).catch(()=>{});return researchResultSchema.parse(committed).claims;}
    if (result.status === 'failed' || result.inputRequests.length) throw new Error(`eve session ended ${result.status} without a committed extraction`);
    if(result.data===undefined)throw new Error('Model returned no structured or committed extraction');
    const parsed=parseModelOutput(result.data,(index,reason)=>store.event(job.run_id,job.organisation_number,'model_output_rejected',`Proposal ${index}: ${reason}`));
    const data=commitExtraction(new ResearchService(store),job.id,parsed.claims);
    // A successful turn normally parks its conversation for another message.
    // The structured result is the completion boundary for this batch job.
    await session.reset({ reason: 'Company research result persisted', signal: AbortSignal.timeout(3000) }).catch(() => {});
    return data.claims;
  } catch (error) {
    await session.cancel({ signal: AbortSignal.timeout(3000) }).catch(() => {});
    const committed=store.modelResult(job.id);
    if(committed!==undefined){store.event(job.run_id,job.organisation_number,'model_recovery','Using validated extraction committed before conversation cleanup');return researchResultSchema.parse(committed).claims;}
    throw error;
  }
}
