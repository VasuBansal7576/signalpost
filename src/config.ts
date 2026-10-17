import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

export function loadEnv() {
  if(process.env.SIGNALPOST_KEYLESS==='1'){enforceKeyless();return;}
  for (const path of ['.env', '.env.local']) if (existsSync(path)) process.loadEnvFile(path);
}
export type Settings={db:string;exaKey?:string|undefined;maxExaUsd:number;maxSearches:number;maxPages:number;searchResults?:number;exaTransport?:'api'|'mcp'|'connector'|'codex'|'openai';exaRelayUrl?:string|undefined;exaRelayToken?:string|undefined;exaBlockedReason?:string|undefined};
export function config():Settings {
  return {
    db: resolve(process.env.SIGNALPOST_DB ?? 'data/signalpost.sqlite'),
    exaTransport:z.enum(['api','mcp','connector','codex','openai']).parse(process.env.SIGNALPOST_EXA_TRANSPORT??'api'),
    exaKey: process.env.EXA_API_KEY,
    exaBlockedReason:z.string().trim().min(1).max(500).optional().parse(process.env.SIGNALPOST_EXA_BLOCKED_REASON),
    exaRelayUrl:process.env.SIGNALPOST_EXA_RELAY_URL,exaRelayToken:process.env.SIGNALPOST_EXA_RELAY_TOKEN,
    maxExaUsd: z.coerce.number().finite().min(0).parse(process.env.SIGNALPOST_MAX_EXA_USD ?? '10'),
    maxSearches: z.coerce.number().int().min(0).max(20).parse(process.env.SIGNALPOST_MAX_SEARCHES_PER_COMPANY ?? '6'),
    maxPages: z.coerce.number().int().min(0).max(50).parse(process.env.SIGNALPOST_MAX_PAGES_PER_COMPANY ?? '12'),
    searchResults:z.coerce.number().int().min(1).max(8).parse(process.env.SIGNALPOST_SEARCH_RESULTS??'4'),
  };
}

/** Keyless mode cannot fall through to any paid/keyed provider or local relay. */
export function enforceKeyless(){
 if(process.env.SIGNALPOST_EXA_TRANSPORT==='openai')throw Error('OpenAI API discovery cannot combine with keyless subscription mode');
 for(const name of Object.keys(process.env))if(/(?:API_KEY|API_TOKEN|ACCESS_TOKEN|SECRET_KEY)$/.test(name)||/^(?:EXA|FIRECRAWL|ANTHROPIC|AI_GATEWAY|OPENAI_BASE_URL|OPENAI_API_BASE|SIGNALPOST_EXA_RELAY|SIGNALPOST_ESCALATION)/.test(name))delete process.env[name];
 process.env.SIGNALPOST_MODEL_PROVIDER='chatgpt';process.env.SIGNALPOST_MODEL='gpt-6-luna';process.env.SIGNALPOST_EXA_TRANSPORT='codex';delete process.env.SIGNALPOST_EXA_BLOCKED_REASON;
}
