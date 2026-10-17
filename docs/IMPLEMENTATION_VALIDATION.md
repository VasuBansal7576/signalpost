# Architecture implementation and validation

**Current status supersedes the historical stage below:** the keyless 100/1,000 acquisitions are complete, but semantic verification has found material defects and remains incomplete. See [the source-context audit, implementation repairs and explicit limits](SEMANTIC_VERIFICATION.md). Exa credits are not the current route; all new subscription SDK/native admissions are stopped after quota errors. Historical version-specific claims below describe their own runs.

Status: architecture implemented. Version 6 completed the 100-company full-discovery run; its larger attempt was stopped after upstream Exa credits were exhausted. Version 7 fixes credit-error recognition and the legacy worker cap, and verifies explicitly declared provider-outage behavior on fresh inputs. Full-source 1,000-company verification is blocked by Exa credits. Do not describe outage verification as a successful full-source challenge run. Fingerprints and original outputs are preserved in the separate versioned run directories.

## Implemented

| Concern | Runtime implementation | Evidence |
| --- | --- | --- |
| Shared limits / latency | `src/runtime.ts`; bounded registry/research pipeline, per-host/global admission, Retry-After, deadline propagation, finalisation reserve, transactional resource reservations, stage queue/execution percentiles | Runtime regressions; live stage/resource reports |
| Local subscription / compact models | `src/model.ts`; one streamed structured extraction, no tools, short source aliases, exact-entity evidence packet, configured optional escalation, independent quote/date checks | Real subscription responses and recorded token usage; compact-model tests |
| API equivalent vs real bills | `src/pricing.ts`; dated per-call token/cache rate cards, conservative exposure reservation, incomplete-usage handling; fixed subscription and source charges separate | Actual token counters and primary pricing sources; no credit purchase |
| Source and extraction caches | `src/cache.ts`; immutable compressed source text, conditional GET/304, single-flight, error exclusion, entity/proof/source/prompt/model/cutoff cache keys and revalidation | HTTP/cache tests and live hit/miss counters |
| Scope and provenance | Retained identity, ownership, employer/subunit, directory, group/franchise, financial-normalisation and source-span rules | Existing tests plus copied-database source audits |
| Complete discovery policy | Registry seeds, deterministic directories, independent careers despite NAV zeros, attributed-site dated activity, profile recovery, six-search/twelve-page/four-result defaults | Explicit discovery regression tests and frozen final wrapper configuration |
| Claim history and synthesis | `src/claim-ledger.ts`; source/period/scope keys, lossless consolidation, immutable observations, current/stale projection, processing corrections; evidence-linked company brief | Multi-fact/stale/correction regressions and visible UI checks |
| Dashboard | Existing financial comparison/scope/year/source inspection/export retained; added brief, freshness history, model API-equivalent and latency disclosure | Local API checks; desktop/mobile browser rendering with no page errors, using labelled fictional data |
| Freshness and reproducibility | Frozen random disjoint 100/1,000 identifiers, prior-state exclusion, independent input/universe audit, no overwrite, source/runtime fingerprints, audit on backup copies | `selection-manifest.json`, `freshness-audit.json`, run manifests and final verification files |

## Preflight

- Node 26; pinned existing dependencies retained.
- TypeScript check passes.
- Full test suite: **150 passed, zero failed**. Baseline was 109 passing tests.
- Eve build passes.
- Dashboard API and desktop/mobile browser checks pass. UI screenshots in `out/architecture-ui-check/` are explicitly fictional demonstrations, not live benchmark evidence.
- Actual local subscription extraction was exercised successfully. A paid alternate-provider API test is not claimed.

## Preserved diagnostics

Earlier live attempts are retained as diagnostics, with original output/fingerprint evidence and an explicit `DIAGNOSTIC.md`. They were gracefully interrupted, not accepted as completed scale benchmarks:

1. Version 1 exposed the local relay inheriting the public-publisher host limit. The adapter now shares global admission; publisher limits remain.
2. Version 2 exposed reduced discovery policy and NAV-zero suppression of broader careers discovery. The retained source audit passed 1,698 evidence-reference checks and 1,915 financial-value comparisons; admission was stopped, so scale acceptance deliberately fails.
3. Version 3 was interrupted after a regression proved duplicate history keys could lose complementary same-field facts. Source-aware grouping and exact-text snapshot reuse fix it.

4. Version 4 was interrupted during recovery review because the compact path needed a durable pending-attempt sentinel before external inference. An added hard-crash regression confirms uncertain requests cannot be repeated automatically.

5. Version 5 completed 100 companies after a real interruption/recovery and passed mechanical audit. Assisted source review exposed shared-parent/collection/directory and field-scope errors. Its 1,000-company attempt was cancelled as a diagnostic; no scale pass is claimed.

Version 6 uses new independent inputs and the full discovery policy. Its 100-company run is the uninterrupted full-discovery measurement below. The 1,000-company attempt was stopped after actual 402 responses; its exact frozen output is diagnostic, not scale acceptance. It also revealed the existing CLI silently limited the wrapper's requested 32 workers to 16. Version 7 allows up to 64 application workers, reports actual workers, and retains shared network/model/resource limits.

Automatic approval review rejected draining the stopped Exa queue because it would continue futile requests after known quota exhaustion. That queue was left untouched and its relay stopped. Version 7's `--source-block-receipt` requires a retained actual connector HTTP 402 receipt, records its hash/time, and pre-blocks Exa without any upstream source request. It does not turn the source outage into company-level absence. Registry, NAV, permitted direct HTML, extraction, ordered output and mechanical audits can still be verified; full-source coverage, source latency and challenge recall cannot.

## Acceptance and interpretation

The frozen version 6 **100-company** run completed uninterrupted, with unchanged runtime fingerprints and all mechanical checks passing. Wrapper wall time was **1,087,971 ms (18m 7.971s)**. Nineteen completed Luna calls reported 50,214 input / 4,399 output tokens, **$0.0072209 API equivalent**, no uncertain calls and complete usage. Model receipt latency was p50 **3,725 ms**, p95 **5,362 ms**. The fixed subscription fee is excluded.

Company runtime includes registry preparation and the ready queue: p50 **474,242 ms**, p95 **598,283 ms**. The separately measured web-research execution was p50 **152,948 ms**, p95 **209,020 ms**; its queue was p50 **306,887 ms**, p95 **422,471 ms**. The 300-second budget concerns active preparation/research, not time spent ready in the pipeline. This distinction matters more than model latency for the observed end-to-end experience. Per-job runtime starts when that registry job is created; it excludes earlier waiting for a registry producer. Batch wrapper wall time includes the entire submitted batch. Queue/execution percentiles are reported separately and must not be added as if the same companies occupy each percentile.

The run retained 100 financial, leadership and financial-history results; populated coverage includes revenue 71, workplaces 65, websites 17, business descriptions 16, locations 10, owned profiles 8, hiring information 4 and public activity 0. These are coverage counts, not independently labelled recall or precision. The connected source bill remains unknown. A separate standard-search/text-content list-rate scenario is **$5.214**, using 477 retained search-tool attempts and 1,875 requested content pages; it is not the actual charge or a measured API transport bill.

Assisted source inspection covered the 17 published website bindings and populated external fact values. It is development review, not blind independent labelling. INSOFT AS uses the public name “InSoft Norge AS” on the source; the registered address and email agree, but the naming difference remains a review caveat. A source's legal/contact street address does not independently establish a staffed operating office. Exact excerpts can also retain redundant or truncated promotional wording. Mechanical acceptance does not resolve those semantic/UX limitations. No public-activity recall claim is justified by zero published results.

The four populated hiring results must **not** be described as four companies currently hiring. Masterpiece's careers page explicitly says it is fully staffed; Uvdal's preserved vacancy has a July deadline and is retained only as careers/vacancy information, not a dated live vacancy. Sunnfjord's external vacancy carries an 18 October 2026 deadline. Catalogue positives and source-scoped zero-ad observations remain separate from these page observations; an absent year or relative deadline cannot establish current vacancy status.

Model cost figures measure the runner's company-extraction calls. They exclude development, operator/review-assistant inference, supplemental experiments and the fixed subscription fee. The connected-source dispatcher is a local research adapter; its operational dependency and unreported upstream billing prevent treating these numbers as a complete standalone production bill. The API transport removes the interactive dispatcher dependency but was not measured with funded source credentials here.

A final accepted run requires exact ordered terminal counts, unchanged runtime, unchanged frozen output during audit, valid evidence hashes/spans, correct source financial amounts/scope/period/currency, resource limits and no interrupted batch admission. All unresolved fields remain explicit. Available hiring source checks and positive vacancies/careers information are counted separately.

Mechanical acceptance does not establish semantic precision, recall or the organiser's qualification score. External populated claim review is sampled separately; it is not model self-grading. A paired local-model experiment can compare identical saved evidence packets, actual latency/tokens and mechanically accepted spans, but cannot justify an upgrade without independent labels. Supplemental model experiments are excluded from batch cost/time totals.

Fresh companies are previously unseen identifiers; this is distinct from source-provider forced-live crawl freshness. The company/cache/model state is empty per batch; global NAV source mode and setup are declared. The standalone API path remains configurable. The local connected Exa relay requires the live desktop dispatcher and is not presented as an evaluator dependency.

Exa API credit was unavailable and the keyless endpoint had a long quota reset. No purchase, recharge or billing-plan change was made. The already connected source service reports no USD charge, so its actual bill is unknown. A separate list-rate scenario may use measured search attempts and requested fetch pages, labelled as a reference calculation rather than a paid-API measurement. Source receipts rejected by automatic approval review are excluded without retry, with only failure status retained. Full raw evidence remains local and is not added to release artifacts or submitted.

## Completed measurements

| Frozen run | Companies | Wrapper wall | Model calls | Model API equivalent | Model p50 / p95 | Verification scope |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| v6 full discovery | 100 | 18m 7.971s | 19 | $0.0072209 | 3.725s / 5.362s | Mechanical audit passed; before the credit-parser / worker-cap fixes |
| v7 known Exa outage | 100 | 3m 35.112s | 2 | $0.0004212 | 3.818s / 3.818s | Mechanical audit passed; full-source verification false |
| v7 known Exa outage | 1,000 | 35m 3.416s | 38 | $0.0083149 | 2.969s / 7.610s | Mechanical audit passed; full-source verification false |

All completed measurements have complete model usage and unchanged runtime fingerprints. Both v7 inputs independently passed the fresh-input audit: 1,100 previously unseen identifiers, zero prior research overlap and zero cross-batch overlap. The v7 outage proof audit confirms unchanged actual 402 receipt hashes, matching reported reasons, zero Exa operations, and actual 16/32 research workers. No queue was drained after the automatic-review rejection.

The 1,000-company audit checked **13,469 evidence references**, **2,790 financial records** and **18,886 amounts against preserved source values**, with zero audit failures or withdrawn claims. It produced 1,000 ordered terminal envelopes without stopped admission. Available financials: 995; leadership/registered roles: 999; report history: 1,000; revenue: 804; workplaces: 782; websites: 38; business descriptions: 32; locations: 14; owned profiles: 19; populated hiring information: 4; public activity: 0. These are source-outage coverage counts, not full-source recall or proof of challenge qualification.

The 1,000-company run used **8,642 physical runner requests** against a 50,000 cap and observed maximum process RSS **971,536 KiB**, below the configured 2,048 MiB admission limit. It reported 30 financial-normalization warnings and five unavailable annual-account responses; missing values remained explicit. Company-job runtime p50/p95 was 25.767s/32.611s, excluding waiting for a registry producer. Registry pacing dominates the 35-minute batch wall. This does not predict full-source 1,000-company latency.

Cold extraction-cache hits were zero, as expected. The outage 1,000-company run recorded 1,058 coalesced public-HTML GET observations. No live 304 or warm extraction-cache saving is claimed; those paths have regression coverage. See the raw reports for distinct registry, direct-HTML, logical, physical and model-provider counts.

The current dashboard was checked against a backup of the full-discovery 100-company data at 1440px desktop and 390px mobile: company brief, claim history and source inspection work, with no page errors or body overflow. Artifacts are in `out/architecture-ui-check-final/`. Original result hashes still match their frozen reports after the audits, replay and model experiment.

## Model choice and conditional ablation

Five identical hash-matched saved packets were extracted through the local subscription by both models, with no new source calls and no errors. Each model used 11,911 input tokens:

| Model | Output tokens | API-equivalent total, five calls | Call p50 / p95 | Mechanically accepted proposals |
| --- | ---: | ---: | ---: | ---: |
| Luna | 1,341 | $0.0018616 | 4.047s / 4.709s | 15 |
| Sol | 1,685 | $0.0406720 | 3.992s / 7.511s | 19 |

Both covered 12 accepted company/field combinations, with different fields on individual companies. Sol cost about 21.8 times as much on this small sample. Extra accepted excerpts are not independent semantic-quality labels. These five cases do not establish a winner or justify automatic escalation; Luna remains primary and escalation stays opt-in. The experiment is excluded from batch cost/time totals.

The no-model replay re-seeded exactly the saved full-discovery evidence on an isolated copy, with zero network/model calls. Business-description coverage was 16 with the model versus 8 without; locations 10 versus 0. Websites remained 17, profiles 8 and hiring information 4. This is a conditional extraction comparison; it does not measure a different acquisition policy, end-to-end speedup, semantic precision or recall. Originals were not repaired or overwritten.

Across recorded architecture-batch diagnostics and completed runs, the known completed extraction-call subtotal is **$0.0370959 API equivalent**. One model call in the interrupted v6 larger attempt has incomplete usage, so the complete diagnostic model total remains unknown. This subtotal excludes separate probes/paired experiments, development/operator-assistant inference, subscription fees and source bills. The complete connected-source bill remains unknown. See `out/architecture-fresh-20261016-v7/diagnostic-cost-subtotal.json`.

## Keyless completion and remaining gates

The earlier Exa credit block was bypassed through a different authorized architecture: local Codex native search, public HTTPS evidence, compact subscription extraction and a declared frozen NAV catalogue. No external keys, external bearer tokens, purchases or challenge submission were used in the strict runs. Both disjoint fresh acquisitions finished; 100 companies took 8m 39.417s and 1,000 took 1h 12m 36.570s. Both pass mechanical consistency checks and strict credential-boundary checks. The 100-company equivalent total is $4.94147746. The 1,000-company known subtotal is $51.28209228; three native responses lack complete usage, so the exact total and original full-source verification gate remain unresolved. Do not substitute later successful probes for those original receipts.

See [the keyless report](KEYLESS_VERIFICATION.md) for original results, preserved failures and separate recovery/reprocessing. All 181 final tests, type checking and the production build pass. Independent labelled semantic precision/recall, full individual-fact noninferiority, official score and clean-evaluator authentication remain unestablished.


The final v5 reprocessing/recovery completed separately on all 1,000 companies in 9m 31.394s. An exact comparison retained every originally published available field/value pair (zero losses), with websites increasing from 118 to 119 and locations from 94 to 95. Twelve public requests, three imported successful discovery probes and one new extraction add $0.03242306 in known equivalent usage. The cumulative known subtotal becomes $51.31451534; the exact total remains unknown. This processing time excludes the earlier discovery-probe wall and is not a second cold benchmark. Original failed/unknown receipts and original output hashes remain intact. Final credential/provenance checks pass; the complete-usage gate remains false.


The final v5 offline mechanical audit passes all 1,000 ordered outputs: 17,324 evidence references, 2,798 financial records and 18,778 financial amounts checked, 1,531 web claims revalidated, zero failures/withdrawals, and zero source acquisition during audit. Final API and desktop/mobile dashboard checks also pass on an isolated 1,000-company backup. Complete usage and official/semantic gates remain separate and unresolved as stated above.
