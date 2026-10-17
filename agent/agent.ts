import { defineAgent } from 'eve';
import { chatgpt, openai } from 'eve/models/openai';

const provider=process.env.SIGNALPOST_MODEL_PROVIDER ?? (process.env.OPENAI_API_KEY?'openai':'chatgpt');
if(!['chatgpt','openai','gateway'].includes(provider))throw new Error('Unknown SIGNALPOST_MODEL_PROVIDER');
const model=process.env.SIGNALPOST_MODEL ?? 'gpt-6-luna-fast';

export default defineAgent({
  build: {externalDependencies:['playwright-core']},
  defaultTools: false,
  tool: false,
  model:provider==='openai'?openai(model):provider==='gateway'?(model.includes('/')?model:`openai/${model}`):chatgpt(model),
  reasoning:'low',
  modelContextWindowTokens:40_000,
  limits: { maxInputTokensPerSession: 160_000, maxOutputTokensPerSession: 8_000, sessionTimeoutMs: 180_000 },
});
