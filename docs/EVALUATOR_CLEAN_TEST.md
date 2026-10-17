# Clean Linux evaluator execution — 16 October 2026

The engine at `371cb6d3977dab6814149f2ed0644b5a157193a4` passed **101 tests**, TypeScript checking and a Linux production build. Its pinned Node 26.8.2 Linux aarch64 image was built from an isolated checkout using a directory context, so `.dockerignore` applied. Image preflight confirmed no `.env`, company database, previous answers, or URL-enriched benchmark sample. Runtime source fingerprints match the benchmark engine.

The live conformance run used the general batch command with a supplied frozen registry CSV, five bare-number input rows, four distinct companies and one duplicate. Fresh native Linux volumes held SQLite and Eve state, with two workers, 4 CPUs and 4GB memory. Five rows returned in order; the duplicate was identical, four distinct final model sessions completed, and no company recorded a research error. Identity evidence used the frozen CSV hash without substituting live identity data. The run took **382.440 seconds**.

External access was tested: **14 successful searches**, **27 operations with separately fetched full text**, no account-blocked operations, and the known official-site control passed. Exact employer-ID controls found **17, 1, 2 active NAV ads** respectively (20 total). This separate control set is not added to the 100-company denominator. The receipt audit checked 28 completed source operations and 107 full-fetch snapshots with zero mechanical failures. Unsuccessful source operations remain in the ledger. Mechanical consistency does not independently measure semantic precision or recall.

Per the user's instruction, models used the existing Codex subscription. The optional image adds pinned Codex CLI 0.162.1; its auth file was mounted read-only, copied into a private disposable runtime directory, and never exported. The stopped container was removed. No credential was baked into the image or source archive. Evaluator-owned paid model API authentication has not been live-tested.

The API account had returned HTTP 402 from exhausted Exa credits, and the public keyless MCP endpoint returned a quota error. Those attempts are diagnostic and do not establish working external coverage. The passing run instead used the already connected Exa app through an authenticated loopback relay at source revision `371cb6d3977dab6814149f2ed0644b5a157193a4`. It dispatched automatic registry-derived queries and source URLs, with no hand-filled company answers. Search highlights are discovery metadata only. Fetched HTML, company/run scope and source receipts were retained and checked. Provider-default freshness applies; USD charges and upstream crawl times are **unreported**, not zero. The relay and active Codex dispatchers run on the host, outside the runner's 4 CPU /4GB cap. This local mode requires an active dispatcher; it is not a standalone evaluator API fallback.

A semantic match review found that an earlier parser could merge a metadata-bearing company-directory page into an unrelated website. That interrupted v17 run and its historical controls are excluded from improvement claims. Regression tests now separate publishers with Author/Published metadata, reject unknown URL boundaries, and prevent a namesake website borrowing another publisher's organisation number. The real failing receipt also replays correctly under the fix. Group footers cannot attribute a parent company's event to the requested legal entity. Company HTML discovery excludes PDF/office downloads, and document redirects are discarded before receipt storage; unrelated document extraction is not retried. Official registry financial JSON and report-link metadata remain available.

The company test received a declared global public NAV catalogue. Every company query was recomputed using legal or registered subunit identifiers. Positive counts are scoped to NAV; Finn is excluded, and zero never establishes company-wide absence. The shared source contains public ads, not prior company answers or remembered websites.

A separate empty-source-cache Linux test automatically bootstrapped NAV in **18.301 minutes**, using **11,058 requests**, retaining **10,546 records**, with zero collection failures and a passing raw-source audit. That first-use test used runtime `af40fe1ad4d26fbfef01c7f07bafc25e4cdff1e6`. Both collector modules and the runtime helper declarations they import match the current engine; complete domain/attribution file hashes differ in metadata types and expired-vacancy classification. The scoped compatibility proof is included. First-use time is separate from reuse/refresh time.

This was a fresh isolated Linux container on the same host, not a separate physical computer. Checks and limitations are retained in `verification/evaluator-clean/`; full local receipts are in `out/evaluator-clean-371cb6d-connector/`. Raw global ads, account auth and source-transport secrets are excluded from the release. Nothing was submitted.

## Reproduce

Build from an isolated directory checkout, not a tar stream (tar build input does not apply `.dockerignore`):

```sh
docker build -f Dockerfile.evaluator -t signalpost-evaluator:clean .
docker build -f Dockerfile.evaluator-codex -t signalpost-evaluator:clean-codex .
```

Supply frozen registry/input files and fresh native volumes at runtime. The README documents the general command with evaluator-owned API credentials and the optional subscription workflow. For connected desktop validation, start `scripts/exa-connector-relay.ts`, run `scripts/pump-exa-connector.js` inside active Codex tool sessions, and use the private generated runtime environment file. That file and Codex auth must never enter an image or archive. Production API mode remains separate and requires working evaluator-owned provider access.
