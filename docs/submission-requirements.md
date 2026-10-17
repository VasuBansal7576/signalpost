# Submission requirements verified 15 October 2026

This note distinguishes official rules, reference implementation conventions and our readiness assessment. It does not claim that a local benchmark qualifies the entry.

## Official entry and timing

The challenge closes **21 October 2026**. Revisions close **18 October 2026**: an initial version plus at most four revised exact commit hashes. No precise cutoff time or timezone is published in the checked documents. Send the repository URL, frozen commit hash, 100-company smoke-test result/report, one run command, model/API/licence declarations, expected official-batch cost, agent name and contact details to `submit@builderr.ai`. The detailed submission section requires a 100-company smoke test; the page's older “1,000+ profiles” board label is inconsistent with that section. Precomputed profiles do not determine the competition score. [Challenge](https://www.builderr.ai/challenges/signalpost), [participant brief](https://www.builderr.ai/starter-briefs/signalpost.md)

Builderr supplies each official company batch, frozen registry snapshot, evidence cutoff, network policy and equal time/resource budget. Batch size can grow; neither 100 nor 1,000 may be hard-coded. The public documents give no numeric runtime, memory or API-dollar limit. The challenge page describes a small external API allowance and offers a model key for scoring; credentials tied to the entrant's own account are unsuitable for reproducibility. [Challenge](https://www.builderr.ai/challenges/signalpost), [evaluation contract](https://www.builderr.ai/docs/signalpost-evaluation-harness.md)

## Reproducible local sample

The official archive's `select_entry_batch.py` uses `random.Random(seed).sample(rows, count)`, default seed `20260823`, reading the complete JSONL or gzipped universe. Our copied selector and existing batch match those defaults:

```sh
python3 scripts/select_entry_batch.py \
  --universe benchmark/universe.jsonl.gz \
  --count 100 --seed 20260823 \
  --output benchmark/companies-100.jsonl
```

Local verification on 15 October found 411,160 universe rows and exact published hashes:

| Artifact | SHA-256 |
|---|---|
| Universe gzip | `1c89710e5b01f8617e86d09fbdff4a52f2f8dbbba297e74f7164b5984f5a0384` |
| Uncompressed universe | `b82d6a3e7231d1759a958c282bc4366b80ec2fab8095053d8ed7fa9cd01bc838` |
| Our default-seed 100-company JSONL | `51a96f25f79532b9ba285304d540887e0f17410907909dbe6c85c0b41b8341d3` |

The sample equals the official selector's output, with no hand-picked companies. Source: [`select_entry_batch.py` and README in the official archive](https://www.builderr.ai/signalpost-starter-kit.tar.gz); published universe hashes: [evaluation contract](https://www.builderr.ai/docs/signalpost-evaluation-harness.md).

## Envelope and financial coverage

Each input must yield exactly one terminal envelope, including failed or empty research. The starter's minimal JSONL structure is:

```text
organisation_number
run: run_id, started_at, completed_at, terminal_status
claims[]: field, value, availability, confidence, evidence_ids[]
evidence[]: id, source_url, source_class, retrieved_at,
            content_sha256, claim_span
changes[]
errors[]
operations: requests, runtime_ms, third_party_cost_usd
```

Availability values are `available`, `not_available`, `blocked`, `not_applicable`, `ambiguous`, `failed`. A real observed zero differs from an unchecked or missing source. The sample envelope demonstrates `terminal_status: completed` and numeric confidence; it is an example, not a published exhaustive JSON Schema. Source: [`OUTPUT_CONTRACT.md` in the official archive](https://www.builderr.ai/signalpost-starter-kit.tar.gz).

The brief requires identity/brand, latest annual accounts and available history, leadership/workplaces, verified website/company profiles, hiring/dated activity, claim evidence/availability, and refresh changes. [Participant brief](https://www.builderr.ai/starter-briefs/signalpost.md)

For financial normalization, the reference code retains record ID, account type, reporting period, currency, revenue, operating result, pre-tax profit, annual result, assets, equity and debt. Its history connector lists available years and annual-account PDF URLs. These are useful implementation conventions rather than an independently mandated field-name schema. Keep company versus consolidated group scope explicit, preserve reported units/currency, and attach evidence/reporting periods; never manufacture missing values. Sources: `src/norway_company_agent/official.py` in the [official archive](https://www.builderr.ai/signalpost-starter-kit.tar.gz), [evaluation contract](https://www.builderr.ai/docs/signalpost-evaluation-harness.md).

## Command and package

The starter CLI accepts `--organisations`, `--bulk`, `--profiles-output`, `--output`, `--report`, `--run-id`, `--expected-count`, `--workers`, `--checkpoint-every`, `--resume` and `--modules`. These describe the reference runner; the required behavior is one reproducible batch command, not a required Python framework. The repository must install cleanly with pinned dependencies and support previous snapshots/material-change output. Source: README and `scripts/run_competition_batch.py` in the [official archive](https://www.builderr.ai/signalpost-starter-kit.tar.gz).

Our evaluator command should use runtime-supplied paths and count:

```sh
npm run batch -- \
  --organisations "$INPUT_JSONL" --bulk "$FROZEN_REGISTRY_CSV" \
  --expected-count "$INPUT_COUNT" \
  --profiles-output out/profiles.jsonl --output out/envelopes.jsonl \
  --report out/report.json --run-id "$RUN_ID"
```

Package the smoke report, exact sample input/hash, source and cost declarations, dependency lock, previous-snapshot instructions and UI instructions with the frozen commit. Exclude `.env`, account tokens, private model traces, `node_modules`, local SQLite stores and macOS `._*` files. This exclusion list is our packaging recommendation; environment-only server-side secrets and declared caches are official requirements. [Evaluation contract](https://www.builderr.ai/docs/signalpost-evaluation-harness.md)

## Scoring and visibility

Scoring is 50 recall/coverage, 30 precision/evidence, 12 synthesis, 8 UX. Qualification requires an official score of at least 65/100 plus a valid run. Coverage combines company and individual-fact recall at 70/30 per family. Wrong-company publications and fabricated financials can invalidate a run. Ranking averages active scheduled batches; cleanly reproduced entrant failures score zero. [Evaluation contract](https://www.builderr.ai/docs/signalpost-evaluation-harness.md)

UX is assessed on desktop and mobile discovery, comparison and verification. A useful UI therefore needs searchable companies, honest unavailable states, comparable financial periods, source inspection, refresh changes and visible run progress. These UI choices are our interpretation of the published UX criterion. [Challenge](https://www.builderr.ai/challenges/signalpost)

## Source policy and remaining readiness checks

Search snippets provide candidates, not claim evidence. Exact entity attribution must precede publication; brands, parents and subsidiaries stay distinguished. Claims retain source, retrieval/effective dates, hash and extraction method. Company promotional text is not independent sentiment. Public availability or open-source scraping code does not establish permitted access; restricted platforms require permitted APIs/providers or abstention. [Source policy](https://www.builderr.ai/starter-briefs/signalpost-sources.md)

Before freezing the submission, resolve these checks against the final implementation:

1. **Evaluator model path:** support an evaluator-supplied API key/provider. Keep Codex subscription as a local option; do not ship or depend on Vasu's login.
2. **Costs:** report known Exa cost and reproducible model cost separately; `null` total cost is honest during subscription development but cannot support the final official cost estimate.
3. **Frozen identity:** prove the supplied bulk snapshot anchors every company, and disclose all external caches. Do not silently substitute today's live registry for a frozen official identity record.
4. **Source rights:** document Exa search/contents provenance, permitted publisher access assumptions and restricted-platform handling. Exa access alone does not settle publisher rights.
5. **Evidence:** record extractor version/method. Verify financial scope/period/unit and avoid treating a literal quote match as a semantic correctness audit.
6. **Refresh:** demonstrate identical-snapshot replay and a material change with both evidence versions retained; a failed fetch must not erase the last supported fact.
7. **Benchmark:** publish 100 terminal rows, completion/availability/coverage, evidence audit sample, request/cost totals and p50/p95 timings. Mark unlabelled precision/recall as unmeasured, not perfect.
8. **Release:** clean-room install/run; freeze repository URL and commit hash; replace any unknown licences, contact or model declarations. Verify all output artifacts contain no credentials.

Items above are implementation review tasks, not new official approval gates. The local smoke benchmark demonstrates operation and does not establish 65/100 qualification.
