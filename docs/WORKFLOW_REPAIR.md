# Organisation-number-only workflow repair

The required company input is a registry number. API credentials and a reusable public-source catalogue are application setup; company names, URLs, account handles and earlier company results are not required inputs.

The earlier URL-seeded run did not demonstrate cold-company discovery. The cold runner now requires exactly 100 distinct bare numbers, refuses existing database/output paths, records empty-store counts and fingerprints, and audits a backup copy without rewriting the original results. The complete current measurement is in [BENCHMARK.md](BENCHMARK.md).

Profile discovery previously skipped companies without a registry website or employee count. That gate was removed. Discovery runs before model extraction, and final link recovery also runs when the model fails. NAV setup is automatic: the runner reuses a current global source or refreshes it, showing source progress in the dashboard. A withdrawal racing an ACTIVE header is handled explicitly. Global public-source records remain separate from company answers.

Website discovery also had a circular gate: a candidate needed verified ownership before its contact/legal links could be inspected to establish ownership. Plausible company domains can now be inspected safely before publication, following only observed contact/about/careers links. The final attribution gate remains strict. Registry-listed email domains can support abbreviated hostnames; a directory's own footer email cannot. Support pages with another legal identifier cannot corroborate ownership.

Repeated versions of homepages crowded detailed pages out of the model's bounded context. Context now selects 14 unique canonical URLs, keeps the longest readable version, prioritizes relevant company pages, and excludes duplicate NAV receipts and archived recruitment sources. Preserved source snapshots are unchanged. Archived adverts cannot establish current hiring. Source-scoped NAV zeros remain inspectable but do not inflate populated hiring coverage.

One malformed short quote previously discarded all claims in a model response. Per-claim validation now preserves independently valid proposals while rejecting malformed ones; outer-envelope and evidence requirements remain strict. The model's declared output schema includes the same string bounds. Connection recovery reads the existing durable stream or result. It permits a replacement send only after retiring a session proven empty before and after retirement. Ambiguous model history is not blindly replayed as a new turn. Shared event IDs prevent duplicate token accounting during stream recovery.

The automatic audit wrapper also shadowed its path resolver with a Promise callback, causing the audit to use the wrong path. The callback was renamed, missing reports fail explicitly, and the complete new run exercised the corrected automatic audit. The earlier source data was preserved and separately audited on its backup copy; no company answer was edited.

The current run contains 100 fresh-company profiles, 99 final model results and one model session stopped by its 160K input-token guardrail. It was not manually approved or selectively repaired. All 100 profiles retain explicit unresolved fields. The audit passed 2,055 evidence references and 1,842 financial amounts without withdrawals. Actual external coverage and the shared-source conditions are reported rather than replaced by source-check counts.

The dashboard exposes progress, populated-field coverage, hiring source checks, filters, comparison, financial scope/period selectors and preserved-source hash verification. The narrated investor film uses the current run's actual captures and machine-exported metrics. No submission, publication or email has been performed.
