Historical documentation copied before the isolated audit repairs. Its measurements and readiness claims describe prior revisions, not the repaired package.

# Signalpost

**Storage cleanup:** obsolete experiment folders, caches and one-off repair tools were deleted. [Retained evidence and source restore commands](verification/storage-cleanup-20261017.json) are recorded separately; older reports can reference intentionally removed intermediates.

**Latest coverage repair, 17 October 2026:** discovery, public fetching/parsing, per-claim entailment and extraction/identity losses were repaired with 373 passing regressions. Two fresh 12-company diagnostics remained below quality gates; subsequent preserved-source regressions recovered 25/28 reference facts across four failures, up from 5/28. The final code has no passing fresh quality certificate. No 100/1,000 rerun was started. [Repairs, measured cost/latency and remaining failures](docs/COVERAGE_REPAIR_20261017.md).

**Actual fresh executions, 17 October 2026:** the requested 100-company run saved 100/100 outputs in **10m49s**, followed by a separate 1,000-company campaign saving 1,000/1,000 in **1h47m54s**, including failures and checkpoint recovery. Known API-equivalent subtotals are **$4.84336002** and **$43.47172710**; exact totals remain unknown because 1 and 85 company usage records are incomplete. No external service keys or new credit purchases were used. [Actual reports, outputs and source-level findings](docs/FRESH_RUNS_20261017.md).

**Quality gates remain failed.** All outputs are partial. The 1,000 batch has 75 populated websites, 76 business descriptions, eight dated-activity fields and two reputation fields; these are population counts, not recall. Independent checks found acquired facts omitted and valid proposals discarded. Whole-cohort semantic accuracy/recall and official qualification remain unmeasured. Default production admission is still enforced. The explicit `--verification-only` lane measures uncertified cohorts; checked recovery cannot certify them. [Quality admission](docs/QUALITY_GATES.md).

The original 1,000 measurement exited 1 at 876 saved profiles on a Node/Undici HTTP/2 idle-reaper error. A regression-tested HTTP/1.1 transport completed only the remaining 124; the original 876 profiles are byte-for-byte unchanged. The failed measurement and all source transitions are retained. Validation at that completion: **349 tests, typecheck and production build pass**. These checks do not override the measured quality failures.

Earlier assisted development-cohort reviews are documented separately in [semantic verification](docs/SEMANTIC_VERIFICATION.md). Their repaired reference-fact totals describe that earlier cohort. The account-summary-only capacity inference was corrected after a normal live existing-login probe succeeded.

Keyless local research uses the existing Codex subscription for native search and extraction, and direct public website retrieval; it skips local API-key environment files and cannot fall through to Exa. The bounded verification command is `npm run quality:run -- --directory out/your-frozen-cohort`. See [keyless verification and evaluator limitations](docs/KEYLESS_VERIFICATION.md). Native search-tool API-equivalent cost is separate from model-token equivalent cost. Matched development probes are not fresh holdouts or an official qualification run.
Company intelligence for Norway using **eve, native Codex search and public sources**, with code-controlled registry collection, financial normalization, an evidence store and an interactive local dashboard.

Architecture and historical 15–16 October verification: [architecture and commands](docs/ARCHITECTURE.md). The older full-discovery 100-company run passed mechanical audit. The prior Exa-backed 1,000-company run was blocked by exhausted credits. A separate strict keyless route now uses the existing Codex subscription and public HTTPS; its fresh 100/1,000-company verification is recorded separately in [the keyless report](docs/KEYLESS_VERIFICATION.md). Those earlier keyless acquisitions finished; their mechanical checks and three incomplete native-search records describe the earlier cohort. The older outage-only run does not replace those measurements. See [validation evidence and limitations](docs/IMPLEMENTATION_VALIDATION.md).

## Open the workspace

Requires Node 24+ and Python 3 for the optional public sample selector. Public PDF text extraction also requires Poppler (`pdfinfo` and `pdftotext`); the evaluator image installs `poppler-utils`. Absolute executable overrides are `SIGNALPOST_PDFINFO_PATH` and `SIGNALPOST_PDFTOTEXT_PATH`. Parser versions are retained with page evidence. Scanned PDFs without text remain explicitly unavailable; OCR coverage has not been established.

```sh
npm ci
npm run import:smoke # recorded 100-company live benchmark; no API calls
# Or: npm run demo  # visibly fictional evidence, also offline
SIGNALPOST_KEYLESS=1 npm run dashboard # http://127.0.0.1:4317
```

The imported review includes recorded facts, bounded excerpts and source hashes; full raw-source caches are deliberately excluded, so offline review does not pretend to re-verify those hashes. The original local live workspace retains the full source viewer. Official batch execution never auto-imports this smoke data.

The dashboard shows live run progress, searchable/filterable companies, field coverage, source requests and costs. Separate hiring source checks from vacancies/careers signals with dedicated filters, or filter for company profiles. Select two or three companies to compare financials. Open a company to switch statement scope/year, inspect exact evidence, verify source hashes, review changes or diagnose issues. The layout works on desktop and mobile. Demo runs are visibly marked as fictional.

The live runner accepts organisation numbers alone: it resolves registry identity, prepares or refreshes the shared NAV source (strict keyless mode only reuses its declared frozen snapshot, without bearer-token authentication), discovers company/recruitment/profile pages, verifies matches and extracts facts. First-use NAV setup can take several minutes; progress is visible. Shared-source failures remain explicit and other research continues.

For the authorized keyless route, use an existing local Codex login (`codex login status`) and explicitly set keyless mode. No external API key is required or loaded. The shared NAV catalogue retains its declared original cutoff; missing catalogue state is reported unavailable. The dashboard inherits keyless mode for new runs.

```sh
npm run batch -- --keyless --organisations examples/live-company.jsonl \
  --output out/live/results.jsonl --run-id live-001 --timeout-seconds 600 \
  --company-timeout-seconds 90 --max-requests 100 \
  --max-model-equivalent-usd 0.05 --max-search-equivalent-usd 0.05
SIGNALPOST_KEYLESS=1 npm run dashboard
```

The historical 16 October 100-company acquisition took 8m 39s at $4.94147746 API equivalent. The separate 1,000-company acquisition took 1h 12m 37s; known completed usage is $51.28209228 equivalent, with the exact total unknown. External API charges were $0; the existing subscription and local machine costs are separate. Results remain partial where source evidence is unresolved. See [full results and limitations](docs/KEYLESS_VERIFICATION.md).

## Legacy evaluator configuration — outside strict keyless execution

The older configurable API path is retained below for reference; it was not used for the strict keyless measurements and is outside the current no-external-keys instruction. Official clean-evaluator authentication for the native subscription route remains unconfirmed. Do not export personal Codex credentials. An organizer-approved runtime is required before claiming official portability.

```sh
export SIGNALPOST_MODEL_PROVIDER=openai
export SIGNALPOST_MODEL="$EVALUATION_MODEL" # API model available to the supplied key
export OPENAI_API_KEY='<evaluator-supplied key>'
export EXA_API_KEY='<evaluation key>'
# If the provider does not report USD cost, set its verified token rates:
export SIGNALPOST_MODEL_INPUT_USD_PER_MILLION='<input rate>'
export SIGNALPOST_MODEL_OUTPUT_USD_PER_MILLION='<output rate>'

npm run batch -- \
  --organisations "$INPUT_JSONL" --bulk "$FROZEN_REGISTRY_CSV" \
  --expected-count "$INPUT_COUNT" \
  --profiles-output out/profiles.jsonl --output out/envelopes.jsonl \
  --report out/report.json --run-id "$RUN_ID" --workers 6 \
  --company-timeout-seconds 240 --timeout-seconds 3600
```

`SIGNALPOST_MODEL_PROVIDER=gateway` supports Vercel AI Gateway with `AI_GATEWAY_API_KEY` and a provider-qualified model ID. `chatgpt` uses eve's local Codex broker. The live benchmark uses the local subscription; the independent API configuration is compiled and billing-tested, but a paid model API smoke test is not claimed without an evaluator key. The compact default uses bounded attributed evidence packets and one streamed structured extraction; the older Eve tool path remains available with `--model-transport eve`.

The example allows one hour for source setup and company research. First-ever NAV collection is part of that budget; a current shared source is reused. Set the actual time/resource limits supplied by the evaluator rather than assuming this example is the competition limit.

The command accepts arbitrary batch sizes, nine-digit organisation numbers or JSONL objects using `organisation_number`, `organisasjonsnummer` or `orgnr`. Gzip is detected by file contents, including when the filename ends in `.csv`. Frozen CSV identity is authoritative; absent rows do not silently use a live replacement. Duplicate input rows retain their order and share underlying research. Every valid input row receives a terminal envelope, including failed research. `--registry-only` collects official data without Exa or a model.

## What is published

Profiles contain `organisation_number`, `run`, `claims`, `evidence`, `changes`, `errors`, and `operations`. Claim availability distinguishes available, not available, blocked, not applicable, ambiguous and failed. Unresolved values stay null; absent employee counts and financial lines never become zero. Uncalibrated confidence is null. A partial profile is an honest result with unresolved fields, not a silently dropped company.

Financials retain all returned periods, reported currency/units and separate company/group scopes. Latest-period metrics, balance warnings and annual-report history are explicit. Current leadership excludes deregistered roles and omits birth dates from normalized values. Registered workplaces retain unknown employee counts. See [financial normalization](docs/FINANCIAL_NORMALIZATION.md).

Model proposals require an exact preserved quote, an extractive value and exact-entity attribution. Websites missing from the registry can be verified through legal IDs, matching name/address/brand domains, or corroborated exact-org directory links. Hiring uses exact employer/subunit IDs in a complete NAV feed index plus separately attributed recruitment pages. Company profiles use actual outbound social-account links on company pages or exact-org directory records with matching legal name and street/locality. Source checks and positive recruitment signals are counted separately. A registry-listed franchise/group domain alone does not justify publishing claims about the individual operator. A date/author byline alone is not an event. Source quotes, hashes and extraction methods are inspectable. These are mechanical safeguards; semantic precision/recall must be measured independently. See [reliable fallback rules](docs/RELIABLE_FALLBACKS.md) for source limits and NAV setup. Measured external coverage and unknowns are reported explicitly; populated coverage is not independently measured recall. Empty registry collections are observed absence and do not count as populated findings.

## Evidence, refresh, and recovery

SQLite stores source text, SHA-256 hashes, request receipts, verified proposals, model results/usage, profiles and activity. It lives at `data/signalpost.sqlite` by default (`SIGNALPOST_DB` overrides it). Evidence hashes cover preserved response text, not original publisher HTML. Source pages are untrusted data. The compact default exposes no model tools. The optional Eve transport retains bounded research tools; shell, file, general web-search and delegation tools are disabled.

For a new run-id, live sources are requested afresh; within the same job, identical calls reuse recorded responses. An uncertain pending/failed billed call is not silently repeated. Verified proposals are preserved even if a later model turn fails. An interrupted model receipt without a saved final result requires inspection before another model run.

Refresh compares supported values with the last known supported facts. New evidence IDs or retrieval times do not create business-change events; a failed fetch does not erase a prior supported fact. Use the same database across refreshes or `--previous-snapshot previous/results.jsonl`. A deterministic financial refresh regression and a 100-company offline replay test cover this behavior.

## Cost and limits

Defaults are six Exa searches and twelve additional Contents requests per company, with a $10 reservation budget per run-id. Quoted company-name website discovery, unrestricted careers discovery, identity corroboration and missing-profile discovery run before the model; a missing website or employee count never skips profile discovery. Final link recovery also runs after a failed model turn. Fresh full-page search content is preserved, provider-relative and Markdown navigation links are resolved against their observed page, and repeated reads reuse that job’s response. The cold benchmark starts with bare registry numbers and refuses an existing company database or output directory. It uses no remembered company URLs or earlier company answers. The managed global NAV source is separate: it is reused when current or automatically refreshed, then queried afresh for each company. Direct HTML navigation is separately recorded and respects robots. Reservations precede calls and returned Exa costs replace estimates; failed/uncertain calls retain conservative reservations. Reports distinguish provider-reported cost from uncertain reservations. These are application controls, not an Exa account spending limit. No recharge or paid plan is enabled. A new run-id has a new budget. Earlier URL-seeded diagnostic costs do not establish cold-discovery cost or throughput.

Reports separate Exa usage from model cost. Local subscription runs incur zero incremental model API charge; the fixed subscription fee is excluded and token usage is reported. API model cost uses provider-reported USD or explicitly configured token rates; blank rates remain unknown. Compact-call API-equivalent estimates separate inclusive ordinary input, cache reads/writes and output at the recorded rate card. Legacy configured-rate billing excludes cache discounts. The report includes p50/p95 runtime, request counts, coverage, token counts, parent-process maximum RSS and sampled process-tree RSS. RSS sums can double-count shared pages.

See [the source and licence policy](docs/SOURCE_POLICY.md). Secrets, raw caches, SQLite stores and model traces are ignored by Git and excluded from the release. Every official run starts from its supplied inputs; the smoke outputs are not lookup answers for future batches.

## Verify and reproduce the benchmark

```sh
npm run typecheck
npm test
npm run build
npm run check:dashboard # with the dashboard running

npm run benchmark:cold -- --run-id YOUR_NEW_UNIQUE_RUN_ID
```

The cold wrapper accepts exactly the 100 bare numbers in `benchmark/registry-numbers-100.jsonl`, in the unchanged official sample order. It forces the authenticated Exa API and existing Codex subscription provider, records an empty-database proof plus input/runtime hashes, runs all 100 once, and audits a SQLite backup copy. It asserts that the audit did not alter the result export. Existing database/output paths are rejected rather than resumed or overwritten. Raw local evidence remains inspectable in the original database; audits never silently repair published answers in place.

For arbitrary input batches or evaluator-owned model credentials, use the general command above. Get the official universe from https://www.builderr.ai/signalpost-company-universe-2025.jsonl.gz and the bulk snapshot, when explicitly required for evaluation, from https://data.brreg.no/enhetsregisteret/api/enheter/lastned/csv . The cold benchmark does not use bulk identity. Exact manifests and source hashes are in `benchmark/`, the run's `out/` directory and the local `submission/` review. See [the benchmark report](docs/BENCHMARK.md) for measured coverage and source conditions. A local audit is not an official qualification score. Nothing is submitted by these commands.

The dashboard binds to `127.0.0.1`; set `SIGNALPOST_UI_PORT` for another local port. Launch requests require a same-origin token, and API responses never contain credentials. `npm run dev` opens eve's development interface with bundled extensions disabled. A just-bash environment satisfies eve's build requirements; its shell is not exposed to the agent.

Dependency note: `guarded-fetch` is overridden to a compatible patched release. The pinned just-bash tree retains an upstream `sprintf-js` precision DoS advisory; optional shell tools are disabled. Dependencies and their licences are listed with the submission.

[Submission requirements](docs/submission-requirements.md) · [Minimal output contract](docs/OUTPUT_CONTRACT.md) · [eve](https://github.com/vercel/eve) · [Exa](https://exa.ai/docs/reference/search) · [Brreg](https://data.brreg.no/)

## Legacy Exa hosted transport — disabled by strict keyless mode

Outside strict keyless mode only, set `SIGNALPOST_EXA_TRANSPORT=mcp` to use Exa's official hosted keyless MCP service without an API key or paid credit. The client discovers advertised tools before calling them, paces requests and preserves responses in the same evidence pipeline. Advanced searches request fresh text (`maxAgeHours=0`); MCP fetch uses the provider's freshness defaults. These conditions are recorded in the benchmark report. Keyless access is free and rate-limited, not an unlimited production-cost claim. The default API transport is unchanged. See [Exa's documentation](https://exa.ai/docs/get-started/exa-mcp).

### Clean Linux verification

The optional Docker workflow installs pinned dependencies, runs the tests and production build, then performs the complete 100-company cold benchmark with 4 CPUs and 4GB memory. Store SQLite and Eve state on Docker-managed Linux volumes; export results after the container stops. The wrapper below creates fresh volumes and refuses existing run output or volume names.

```sh
docker build --no-cache \
  --build-arg SIGNALPOST_SOURCE_COMMIT="$(git rev-parse HEAD)" \
  -f Dockerfile.evaluator -t signalpost-evaluator:clean .
docker build -f Dockerfile.evaluator-codex -t signalpost-evaluator:clean-codex .
node scripts/run-clean-linux-benchmark.mjs \
  --run-id YOUR_NEW_LOWERCASE_RUN_ID \
  --output out/YOUR_NEW_REVIEW_DIRECTORY
```

When using the source ZIP without Git metadata, use the `code_commit` in `submission/run-manifest.json` as `SIGNALPOST_SOURCE_COMMIT` in the build command. The cold wrapper also records the complete runtime file fingerprints.

This local subscription test supplies the Exa credential and Codex auth file only at runtime. If present, it copies only the declared shared public NAV source into the new source volume; if absent, the runner bootstraps automatically. Company storage and model sessions start empty. The stopped container is removed after export, including its private runtime auth copy. Native volumes remain identified in the run metadata for integrity checking. Use the general batch command above with evaluator-owned model credentials for official execution. No command in this workflow sends a submission. See the measured [clean Linux controls and limitations](docs/EVALUATOR_CLEAN_TEST.md).

### Connected Exa local validation

`SIGNALPOST_EXA_TRANSPORT=connector` is an optional desktop validation adapter for an already connected Exa service. It requires an authenticated loopback relay and an active Codex tool dispatcher; the normal evaluator API mode remains independent of this adapter. Search highlights remain discovery metadata; only separately fetched full text or robots-approved HTML can support claims. Company/run scope, publisher boundaries, source bytes and usable HTML tool receipts are checked. PDF/office-document downloads are excluded from this company-HTML adapter; document redirects are discarded before receipt storage. The connector exposes neither forced-live crawling nor USD charges, so results explicitly report provider-default freshness and unknown provider cost. It is not an API-authentication or free-production-cost claim. The local relay/dispatcher runs outside the container resource cap and is declared separately. No credit purchases or submissions are performed.
