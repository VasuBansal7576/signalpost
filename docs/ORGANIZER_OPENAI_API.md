# Explicit organizer OpenAI API route (experimental)

This route uses organizer-provided runtime environment configuration. No personal Codex login, Exa credential, relay, credential file or alternate endpoint is used. It has been tested with mocked HTTP only. No real API key has been entered and no live OpenAI API request has verified model/tool entitlement, discovery quality or end-to-end organizer portability.

Use Node24+, Poppler and pinned dependencies. Configure the following in the organizer runtime. OPENAI_API_KEY must already be supplied securely by that runtime; never commit or print it. Choose a model that supports both Responses web_search and the structured-output extraction used by this project, and supply current model/tool prices explicitly.

```sh
export SIGNALPOST_EXA_TRANSPORT=openai
export SIGNALPOST_MODEL_PROVIDER=openai
export SIGNALPOST_MODEL="$ORGANIZER_MODEL"
export SIGNALPOST_SEARCH_USD_PER_CALL="$DECLARED_WEB_SEARCH_FEE_USD"
export SIGNALPOST_MODEL_INPUT_USD_PER_MILLION="$DECLARED_INPUT_RATE"
export SIGNALPOST_MODEL_OUTPUT_USD_PER_MILLION="$DECLARED_OUTPUT_RATE"
export SIGNALPOST_MODEL_CACHE_READ_USD_PER_MILLION="$DECLARED_CACHE_READ_RATE"
export SIGNALPOST_MODEL_CACHE_WRITE_USD_PER_MILLION="$DECLARED_CACHE_WRITE_RATE"
export SIGNALPOST_EVIDENCE_CUTOFF="$OFFICIAL_CUTOFF"
npm run doctor
npm run batch -- --evaluator --organisations "$INPUT_JSONL" --bulk "$FROZEN_REGISTRY_CSV" --expected-count "$INPUT_COUNT" --run-id "$RUN_ID" --db data/evaluator.sqlite --cache data/evaluator-cache --output out/envelopes.jsonl --report out/report.json --workers 2 --registry-workers 1 --provider-workers 1 --extraction-workers 1 --review-workers 1 --network-workers 2 --per-host-workers 1 --timeout-seconds "$BATCH_SECONDS" --company-timeout-seconds 240
```

Do not combine with --keyless or SIGNALPOST_KEYLESS=1. Evaluator mode does not load local .env files. Missing key/model/fee/rates fail before discovery admission. An explicitly declared zero tool fee is allowed; blank is rejected. Doctor checks configuration presence/consistency, not remote credentials or model entitlement.

Discovery sends POST only to https://api.openai.com/v1/responses with redirects rejected, store:false, one required web_search tool, max_tool_calls:1, max_output_tokens:1024, live access, approximate Norwegian location and bounded blocked domains. Only the complete web_search_call.action.sources list becomes URL candidates; generated prose and citation annotations cannot become evidence. The existing URL policy, robots checks, direct public-page retrieval, ownership/quote verification, source hashes, retrieval/render limits and concurrency controls apply before publication. Tool outputs are untrusted data.

Each call has a45second timeout and256KB response limit, admitted once through the existing network guard. Calls reserve token/tool estimates in the resource ledger. Errors do not retry automatically or select another provider; durable uncertain calls retain unknown usage/exposure. A rejected/incomplete/multi-call response supplies no candidates. Missing usage stays incomplete. Actual invoice USD is not reported by this adapter: profile model_cost_usd and third_party_cost_usd are null and cost_complete is false; token/tool API equivalents and estimated_third_party_cost_usd remain explicitly estimates when complete. Estimates do not certify account billing.

Official request contract references (checked2026-10-17): [web search guide](https://developers.openai.com/api/docs/guides/tools-web-search), [Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create.md). Model/account availability and prices must be verified by the organizer. This narrow adapter does not resolve low historical coverage, final-version fresh100 proof, clean Linux installation or license/source-rights limitations described in README and reports.
