# Signalpost

Evidence-bound Norwegian company research agent. This is a sanitized source snapshot with a fresh public history; private development histories, runtime state, credentials and original unsanitized fixtures are excluded. Runtime source corresponds to isolated repair0f056c5; public commit identity is separate.

## Status

Development implementation, **not demonstrated to meet challenge qualification**. Fresh100 completed100/100 partial profiles in29m15s on earlier sourcee558e5a. Populated company counts: business6, website7, operating locations4, profiles2, hiring2, activity2, reputation0. Mechanical integrity checks passed, but independent semantic precision/recall is unmeasured. Two extraction failures and incomplete usage/cost are retained in `reports/`. Fresh1000 was not run. Later acquisition and compact-wire experiments use exposed cases and are separately labelled development; they do not upgrade the earlier100 score or certify this source.

## Install and run

Node24+ and Poppler (`pdftotext`) are required. Dependencies are pinned.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

One evaluator command (runtime-supplied inputs, registry snapshot, model/source configuration and credentials):

```sh
npm run batch -- --evaluator --organisations "$INPUT_JSONL" --bulk "$FROZEN_REGISTRY_CSV" --expected-count "$INPUT_COUNT" --run-id "$RUN_ID" --db data/evaluator.sqlite --cache data/evaluator-cache --output out/envelopes.jsonl --report out/report.json --workers 2 --registry-workers 1 --provider-workers 1 --extraction-workers 1 --review-workers 1 --network-workers 2 --per-host-workers 1 --timeout-seconds "$BATCH_SECONDS" --company-timeout-seconds 240
```

Supply `SIGNALPOST_EVIDENCE_CUTOFF` and explicitly configure model/provider and permitted discovery transport in the environment. `--evaluator` does not load local.env files. The tested local included-subscription route adds `--keyless`; it needs the entrant's existing local Codex broker runtime and **does not establish a portable organizer authentication path**. No personal authentication is included. The API adapter exists but clean Linux/organizer authentication and a full official frozen-registry run remain unverified. Do not assume the default paid discovery configuration has credentials or that it is authorized.

## Verification and limitations

Final source: typecheck/macOS build pass; serial broad suite416passed/6skipped, plus two local-server tests passed with normal local permissions.54focused regressions pass. Independent acquisition/wire source reviews closed their reported findings. A clean dependency install/Linux build was not repeated for this release. See `docs/ACQUISITION_SCHEDULING.md`, `docs/EXTRACTION_WIRE_BUDGET.md`, `docs/LOCAL_SUBSCRIPTION_RUNTIME.md` and reports.

The100 report is actual historical fresh execution ofe558e5a, not the new wire/source revision. Live pages are not a historical archive; the evidence cutoff constrains explicit claim dates. Missing results and source-scoped zeros are distinct. Source snippets are candidates until direct retrieval and ownership checks; semantic review remains fail-closed.

## License and source rights

Project code: MIT. Dependencies have separate licenses; the installed runtime is **not exclusively MIT**. In particular eve transitively requires node-liblzma2.2.0 (LGPL-3.0). See `docs/DEPENDENCY_LICENSES.json`, `docs/THIRD_PARTY_NOTICES.md` and the included license text. Built-runtime redistribution compliance and publisher-fixture republication rights are not independently cleared. Fixtures are sanitized development material; no official score or complete legal clearance is claimed.
