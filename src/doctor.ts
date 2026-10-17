import { spawnSync } from 'node:child_process';
import { config, loadEnv } from './config.ts';
import { modelRates } from './pricing.ts';
import { openaiSearchConfiguration } from './openai-search.ts';
loadEnv();
const settings = config();
const provider=process.env.SIGNALPOST_MODEL_PROVIDER??(process.env.OPENAI_API_KEY?'openai':'chatgpt');
const auth=provider==='chatgpt'||settings.exaTransport==='codex'?spawnSync('codex',['login','status'],{encoding:'utf8'}):undefined;
let apiDiscoveryConfigured=true;
if(settings.exaTransport==='openai'){try{const api=openaiSearchConfiguration();apiDiscoveryConfigured=Boolean(modelRates(api.model,'openai'));}catch{apiDiscoveryConfigured=false;}}
const checks = {
  api_discovery_configured:settings.exaTransport==='openai'?apiDiscoveryConfigured:null,
  node: process.version, node_supported: Number(process.versions.node.split('.')[0]) >= 24,
  exa_relay_configured:Boolean(settings.exaRelayUrl&&settings.exaRelayToken),exa_key_present: Boolean(settings.exaKey), exa_transport:settings.exaTransport??'api', codex_installed: auth?!auth.error:null,
  codex_chatgpt_login: auth?/logged in using chatgpt/i.test(auth.stdout + auth.stderr):null,
  model: process.env.SIGNALPOST_MODEL ?? 'gpt-6-luna', database: settings.db, exa_run_budget_usd: settings.maxExaUsd,
  model_provider:provider,model_api_key_present:provider==='openai'?Boolean(process.env.OPENAI_API_KEY):provider==='gateway'?Boolean(process.env.AI_GATEWAY_API_KEY):provider==='anthropic'?Boolean(process.env.ANTHROPIC_API_KEY):null,
};
console.log(JSON.stringify(checks, null, 2));
if (!checks.node_supported || !apiDiscoveryConfigured || (settings.exaTransport==='connector'&&!checks.exa_relay_configured)|| ((settings.exaTransport??'api')==='api'&&!checks.exa_key_present) || (provider==='chatgpt'?!checks.codex_chatgpt_login:!checks.model_api_key_present)) process.exitCode = 1;
