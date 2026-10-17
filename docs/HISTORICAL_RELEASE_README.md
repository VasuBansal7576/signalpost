# Signalpost

Norwegian company intelligence from organisation numbers, registry records and attributed public sources. This is an isolated audit repair of the active Signalpost implementation, based on source revision `e8d1aaf79ceeff7314f734d979d966f83ef99deb` plus its inventoried working files. It has not been submitted or published.

Current validation and remaining blockers are in [the repair report](docs/AUDIT_REPAIRS.md). Historical measurements in the other documents are identified by their original runs; they do not qualify this revision. Fresh 100/1,000-company semantic proof and organizer-runtime authentication remain unverified.

## Install and validate

Node 24+ is required. Dependencies are pinned by `package-lock.json`; use `npm ci`. PDF extraction additionally requires Poppler (`pdfinfo`, `pdftotext`), included in `Dockerfile.evaluator`.

```sh
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build
npm run demo
```

The demo uses visibly fictional evidence. Development regression fixtures include saved real source excerpts and known failure cases; they are not an evaluation holdout. The runtime never auto-imports fixture or benchmark answers. No smoke results, raw source caches, databases, credentials or personal login are included in the package.

## Evaluator command

Use an organizer-approved provider/runtime and its declared resource limits. The explicit evaluator lane accepts arbitrary batch sizes and does not require local development quality certificates or load local `.env` files. Authentication must be supplied by the evaluator; a personal subscription login must not be copied into the image.

```sh
npm run batch -- --evaluator \
  --organisations "$INPUT_JSONL" --bulk "$FROZEN_REGISTRY_CSV" \
  --expected-count "$INPUT_COUNT" --run-id "$RUN_ID" \
  --db data/evaluator.sqlite --cache data/evaluator-cache \
  --output out/envelopes.jsonl --profiles-output out/profiles.jsonl \
  --report out/report.json --workers 2 --registry-workers 2 \
  --network-workers 4 --per-host-workers 1 \
  --provider-workers 2 --extraction-workers 2 --review-workers 1 \
  --queue-bytes 33554432 \
  --timeout-seconds 3600 --company-timeout-seconds 240
```

For the API route, set `SIGNALPOST_MODEL_PROVIDER=openai`, `SIGNALPOST_MODEL` and evaluator-supplied `OPENAI_API_KEY`; configure verified model prices if absent from the rate card. External discovery requires its own organizer-authorized route. This audit did not invoke paid API discovery or inference, purchase credits, or validate fresh API authentication. The API route now runs the same separate semantic publication check as the subscription route.

For an already authorized local included-subscription run, pass `--keyless` and omit external keys. It uses the existing normal provider adapter and guarded public HTTPS. The normal broker needs permission to initialize its existing Codex SQLite runtime. A restricted-sandbox startup failure was reproduced before HTTP; approved normal execution then completed a search and a fresh GT Logistikk run. See [local subscription runtime requirements](docs/LOCAL_SUBSCRIPTION_RUNTIME.md). Fresh cohort receipts remain separate from semantic qualification. No provider fallback was attempted. Ordinary development batches retain staged quality admission unless `--evaluator` is explicitly selected. This flag permits execution and does not certify quality.

Inputs may be bare nine-digit numbers or JSONL objects with `organisation_number`, `organisasjonsnummer` or `orgnr`; gzip is detected by contents. Duplicates preserve output order and share research. Frozen registry identities remain authoritative when supplied, and absent rows cannot silently use live identities. Every valid input receives a terminal envelope with explicit unresolved fields.

## Evidence and recovery

Each claim links to a preserved source span, source hash and retrieval time. Independent legal-entity attribution and a separate full-context semantic review precede publication of model proposals. Failed or uncertain attempts are retained, with automatic repetition disabled. Completion is checked for every admitted extraction packet rather than inferred from a partial aggregate. Complete matching semantic output receipts can be recovered without another provider call; partial or mismatched receipts cannot authorize facts.

Leadership public evidence is a labelled normalized projection with its own hash and explicit lineage to a private original response. Birth dates remain outside public evidence and the raw role-response viewer is restricted. Other preserved sources still require appropriate source-specific minimization and access policies. This is data minimization, not a claim that the challenge expressly prohibits birth dates.

`SIGNALPOST_EVIDENCE_CUTOFF` enforces one claim-date admission rule for fresh, cached and saved proposals. This is not a historical archive: undated pages fetched today are not proved to have existed at a past cutoff.

Model cost completeness is separate from the fixed subscription charge. Missing usage remains unknown. Conservative token reservations are settled with measured usage; uncertain calls retain conservative exposure. Historical replay time does not measure fresh acquisition latency.

## Offline audit tools

The read-only replay tool checks a checkpointed historical database, source hashes, exported spans, input order and public projection lineage. It republishes only historically accepted candidates through current checks. It performs no acquisition or new semantic judgments and never constitutes fresh 100/1,000-company proof.

```sh
node --max-old-space-size=1536 --import tsx scripts/replay-saved-cohort.ts \
  --source /path/to/saved-run --output /path/to/new-replay --max-seconds 600
```

See [source/licence policy](docs/SOURCE_POLICY.md), [architecture](docs/ARCHITECTURE.md), and [historical README](docs/HISTORICAL_README_20261017.md) for context. Historical packaging helpers can produce old benchmark review bundles; they are not the release procedure for this repair.
