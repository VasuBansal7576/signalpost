# Actual fresh 100 then 1,000 executions — 17 October 2026

Both requested executions have finished, in order. All 1,100 unique inputs have terminal outputs. **The quality gates remain failed; the system is not ready for a quality-certified scale launch.** No external service keys or new credit purchases were used. The existing Codex login supplied native search/inference, with public HTTPS for evidence. The production model was `gpt-6-luna`.

## Actual measurements

| Measurement | Fresh 100 | Separate fresh 1,000 |
|---|---:|---:|
| Terminal outputs / unique inputs | 100 / 100 | 1,000 / 1,000 |
| Completed / partial / failed profile labels | 0 / 100 / 0 | 0 / 1,000 / 0 |
| Total campaign wall time | 10m 49s | 1h 47m 54s |
| Company p50 | 4m 18s | 7m 11s |
| Company p95 | 5m 36s | 15m 41s |
| Known model API-equivalent estimate | $0.47336002 | $4.33172710 |
| Known native-search equivalent | $4.37000000 | $39.14000000 |
| Known combined subtotal | **$4.84336002** | **$43.47172710** |
| Exact total API equivalent | Unknown | Unknown |
| Company usage records flagged incomplete | 1 | 85 |
| Public network request admissions, whole campaign | 2,225 | 19,998 |
| Calls with retained usage accounting | 577 | 5,263 |
| Distinct companies reaching registry phase | 100 | 1,000 |
| Distinct companies reaching web-research phase | 97 | 975 |
| Companies with all admitted extraction packets completed | 96 / 97 | 949 / 974 |
| Uncompleted admitted text spans | 25 | 140 |

The 25 companies without a verified registry identity in the 1,000 batch skipped web research and retain explicit errors. No input was silently dropped. The final 1,000 export has zero companies without a registry phase record. Profile status `partial` records unresolved fields; it is not a precision/recall score. Company timings start at job creation, include intervening queue/downtime, and exclude waiting before initial preparation. The campaign wall time includes interruptions, mitigation and recovery.

API equivalents use the repo's recorded 16 October rate table, with measured cache/token details. They are estimates distinct from a cash bill. Missing usage remains unknown. Subscription fees, shared-account credit consumption, the assistant's work and independent reference research are not measured cash costs. Diagnostic attempts and live probes are retained separately and are excluded from this two-batch subtotal. The runtime resource ledger can include reservations; it must not be substituted for an exact bill.

## Population and actual quality

These are companies with populated fields under the existing report policy. **They are not recall percentages**: no complete independent reference exists for all 1,000 companies. Registered activity is not counted as a current business description, and source-scoped zero job observations are not counted as positive hiring.

| Field | Out of 100 | Out of 1,000 |
|---|---:|---:|
| Legal name | 97 | 975 |
| Financial record | 98 | 975 |
| Available financial-history entries | 99 | 988 |
| Registered roles | 98 | 983 |
| Registered workplaces | 79 | 761 |
| Verified website | 6 | 75 |
| Business description | 5 | 76 |
| Locations under existing population policy | 5 | 69 |
| Company-owned profiles | 3 | 31 |
| Positive source-scoped hiring observations | 0 | 9 |
| Dated public activity | 0 | 8 |
| Public reputation | 0 | 2 |

Location population does not independently certify operating premises. Financial-history entries do not establish that every historical statement was independently audited. Source financial inconsistencies remain warnings with reported values preserved.

Bounded independent checks went beyond schema/quote matching:

- **Pro Elektro:** own-site offerings and website were missed. Generic registered electrical activity does not represent heating, lighting, EV charging and home controls.
- **EASY:** registry identity failure skipped web research. Four hotel subunits were retained, while independent operator-specific hotel amenities/site facts were missed.
- **Milepelen:** website, accommodation, restaurant, catering, meetings and venue were represented; opening hours were omitted.
- **GT Logistikk:** own pages were saved and extraction proposed services/site. An ungrounded verifier counterquote discarded that output. The current registered business address does represent the contact-address reference across fields; it is not scored missing just because external `locations` is empty.
- **Hurtig-Gutta:** own-site timeouts/HTTP 403 and PDF failures blocked acquisition. This is a fetching failure. A different similarly named host was read, but no wrong-host positive was observed in the bounded output view.
- **Telemarkrøye:** site, Arctic-char description and contact address were represented. RAS/fry, grow-out and history details were omitted despite five preserved sources and a completed extraction packet with zero omitted/uncompleted spans. The company's certification assertion is not independent sentiment.
- **ROIF:** useful exactly scoped NAV/subunit hiring output was retained. **Macky's:** brand/operator attribution remained unscored; no wrong-brand positive was observed. Apprenticeship approval in another reference case was not treated as a vacancy. A Moniker source-policy concern was excluded from scored opportunities.

The 1,000 diagnostic reference was frozen before output inspection: 25 opportunities across three of five preselected operating-company cases. It is targeted, incomplete across the seven families, agent-reviewed, and not human/official gold. Full-cohort precision, family-weighted recall, synthesis score and official challenge score remain **unmeasured**. [100 findings](../out/requested-verification-20261017-v2/bounded-independent-findings.json), [1,000 findings](../out/requested-verification-20261017-v2/bounded-independent-1000-findings.json).

Local acceptance fails on latency, complete usage, unfinished extraction, missing independent family denominators and concrete coverage losses. Passing 349 regression tests does not override these measured failures. No quality certificate was issued.

## Failures, fixes and preserved work

A first diagnostic 100 exposed an actual provider HTTP 400: the strict extraction wire schema omitted optional properties from `required`. It was stopped and retained. Required nullable wire fields, conversion back to the domain shape, sanitized provider failures and a generated-schema regression fixed transport compatibility before the corrected fresh 100/1,000 selections. [Diagnostic](../out/requested-verification-20261017-v1/DIAGNOSTIC-FAILED.json).

The 1,000 campaign then had these interruptions:

1. At 200 saved profiles, the original process ended by signal during observed memory/disk pressure. Its exact signal/cause was not retained. Increasing to 64 workers had no proven resource margin; this was an execution mistake. Recovery used 32 workers. An inactive old generated database was compressed losslessly, recovering about 4.6 GiB with SHA verification and a restore command. Four temporarily archived historical result files were restored byte-for-byte. Current evidence and the active old UI database were retained.
2. A continuation reached 580 profiles, then was no longer alive after a turn interruption. No final exit receipt survived; the exact cause is unknown.
3. The next process exited 1 at **876 saved profiles**, after 89m39s of campaign wall time, with an unhandled Node 26 / built-in Undici HTTP/2 idle-reaper `UND_ERR_INFO`. The original 90-minute measurement failed and never produced a final 1,000 report. [Actual failed measurement and 876 envelopes](../out/requested-verification-20261017-v2/1000/failed-measurement.json).
4. A pinned HTTP/1.1 dispatcher avoided the failing protocol path. A real local TLS/ALPN test went red with HTTP/2 before the mitigation and green with HTTP/1.1 plus stream-abort containment afterward. TLS verification remains enabled in production. This contains the documented [Undici issue #5936](https://github.com/nodejs/undici/issues/5936); it is not a claim to have fixed Node's upstream race. Only the remaining 124 profiles were processed, within a separately declared two-hour overall completion bound. The final process exited 0 in a stable source version. **All 876 previously saved profiles are byte-for-byte unchanged.**

Completed companies and durable possibly billed attempts were not deliberately replayed. Pending/uncertain paid calls remain recorded. Interrupted unpaid public GETs have a once-only, separately recorded continuation. Active company budgets were renewed for unfinished work; all campaign time remains visible. This is a recovered execution with explicit source transitions, not an unchanged-runtime blind scale pass. Three source manifests preserve the initial, resume and HTTP/1.1 versions.

The account-summary-only conclusion that execution was unavailable was also incorrect. A normal existing-login probe succeeded; the preserved stop was explicitly cleared on the renewed user request. There was no new credit purchase, reset, external key or research-backend substitution.

## Freshness, cache and verification scope

The 100 and 1,000 inputs are disjoint and exclude prior selected/researched company IDs. Both started with empty per-batch databases and caches. Continuations reuse the same durable receipts/cache rather than restart the cohort. Company ID freshness does not prove unseen publisher hosts.

The shared NAV catalogue is a declared frozen snapshot completed **16 October 2026, 17:24:14 UTC**, queried afresh per legal unit/subunit. It is not a claim of a newly downloaded feed on 17 October. Current batch setup used no NAV authentication. HTTP raw blobs, source hashes, extraction version and per-company evidence are retained. Cache and memory counters in the final 1,000 report describe its last process segment; the shared resource ledger retains whole-campaign admissions. These are local live-registry runs, not an official evaluator-supplied frozen-bulk/cutoff qualification run.

Exports parse as JSONL with LF delimiters, preserve input order and unique IDs, and have zero dangling evidence IDs. The temporary Python summary parser incorrectly split Unicode paragraph separators; it was corrected to split actual LF delimiters. Output data did not need repair. These checks establish export integrity, not semantic accuracy.

## Reviewable artifacts

- [100 outputs](../out/requested-verification-20261017-v2/100/results.jsonl), [report](../out/requested-verification-20261017-v2/100/report.json), [process receipt](../out/requested-verification-20261017-v2/100/process-result.json), [computed summary](../out/requested-verification-20261017-v2/100/execution-summary.json).
- [1,000 outputs](../out/requested-verification-20261017-v2/1000/results.jsonl), [report](../out/requested-verification-20261017-v2/1000/report.json), [completion receipt](../out/requested-verification-20261017-v2/1000/completion-process-result.json), [computed summary](../out/requested-verification-20261017-v2/1000/execution-summary.json).
- [Cohort provenance](../out/requested-verification-20261017-v2/cohort-provenance.json), [failed measurement](../out/requested-verification-20261017-v2/1000/failed-measurement.json), [disk recovery/restore metadata](../out/requested-verification-20261017-v2/disk-recovery.json).
- [1,000 reference seal](../out/requested-verification-20261017-v2/independent-1000-reference-seal.json), [regression log](../out/requested-verification-20261017-v2/regression.log), [HTTP/1.1 frozen source](../out/requested-verification-20261017-v2/frozen-runtime-http1/manifest.json).
