# Live benchmark — 15 October 2026

This v6 run is a historical URL-seeded diagnostic, not a cold-input acceptance test. The following source-workflow repair removes manual NAV preparation and profile eligibility gaps. Do not interpret v6 source-check coverage or its speed/cost as proof of a fully autonomous fresh-input run.

All 100 organisations in the unchanged official seeded sample received fresh registry/page collection with Eve and Exa, an all-company fallback recheck, a bounded profile-completion pass and exact legal/subunit-ID queries against a newly built complete NAV feed. No company failed. Unresolved fields retain partial status; no company-wide no-hiring claim is published. The result is prepared for local review only and has not been submitted.

## Coverage against the previous v5 run

| Companies out of 100 | Previous v5 | Current v6 |
|---|---:|---:|
| Official website | 15 | 16 |
| Business description | 12 | 11 |
| Company profiles | 4 / 7 accounts | 6 / 11 accounts |
| Recruitment/careers information | 1 | 1 |
| Exact NAV source query | 0 | 100 |
| Companies with attributed active NAV ads | Not established | 0 |
| Website locations | 9 | 8 |
| Public activity | 1 | 0 |

New profile matches include AIOTA AS and BLOMSTERBUTIKKEN AS; Musikk i Innlandet also gained its linked LinkedIn account. Profiles require an actual publisher link plus exact legal identity. Trusted directory records must match org number, legal name and registered street/locality; they remain external evidence. Namesake, parent, personal and share accounts are rejected. The flower shop's exact org/street also agrees with its Interflora store record. See [reliable fallback rules](RELIABLE_FALLBACKS.md).

The complete NAV source retained 10,563 active heads after cursor catch-up. All 100 legal entities and their verified registered subunits were checked; none had an attributed active ad at observation. This is a source-scoped zero. Finn is excluded, and 97 global records lacked usable employer IDs (the per-query count also applies current status/date filters). One separately attributed Sabrura Steinkjer recruitment-location page remains available; it does not establish a current vacancy count. Neither an empty index query nor an unknown field means no hiring elsewhere.

Only seven sample companies had registry-listed websites. The sample includes holdings, property companies, cooperatives and subsidiaries. Positive external recall remains limited. Current description/location/activity regressions are reported, rather than carrying old facts forward as freshly verified. Restricted social-platform pages are not scraped.

## Measured phases and costs

| Measurement | Current run |
|---|---:|
| Inputs / unique companies / outputs | 100 / 100 / 100 |
| Initial live company/model collection | 393.163 s |
| All-company fallback recheck + five explicit model follow-ups | 163.603 s |
| All-company NAV query application | 26.477 s |
| Final all-company profile-completion pass | 97.393 s |
| Sum of measured company execution phases | 680.636 s (11m 20.636s) |
| Shared cold NAV bootstrap + catch-up | 1,155.503 s (19m 15.503s) |
| Observed start-to-final-profile wall time | 2,036.052 s (33m 56.052s) |
| Company runtime median / p95 | 20.269 / 81.074 s |
| Company / shared NAV / total source requests | 817 / 11,077 / 11,894 |
| Measured Exa usage | $0.363 |
| Incremental model API charge | $0; existing subscription, fixed fee excluded |
| Model input / output tokens | 2,219,854 / 44,143 |
| Initial runner maximum RSS | 405,904 KiB |
| Initial peak sampled runner + child RSS sum | 1,528,384 KiB |

NAV bootstrap overlapped initial company collection. Wall time includes engineering inspection between phases; the measured phase sum is not a controlled production-throughput comparison. Memory/CPU cover the initial company runner, excluding the separate NAV source collector and follow-ups. RSS sums can count shared pages multiple times.

Concurrency was six initially, three in targeted fallback completion, with a 300-second initial company deadline, 2,700-second batch deadline and $0.48 total Exa reservation cap. To remain within the original free allowance, the initial run used remembered public URLs for discovery, zero index searches and fresh Contents responses (maxAgeHours=0). The final profile pass allowed one bounded targeted search for eligible entities and up to 12 Contents pages. Prior response bodies or company values were never reused as new answers. The previous $2.498 run performed broader searches; the lower $0.363 cost does not establish a cold-discovery speed or cost improvement.

Initial collection ran at `7107b60507e4d95712c9923f556d0b8f5cb3818d`. Follow-up/NAV query code was `e5cae8a94f0ca6e86f4dadc936a4039f6f366e87`; profile completion was `786ec1878c8ec2629f07398a5db2ab8c07d36fd8`. Runtime hashes and phase settings are retained in the report/manifests. A model-copied UUID typo caused one original structured-output failure; tools now bind jobs using server-side session receipts. The inspected terminal failure received an explicit corrective session. Original reports and receipts are retained; uncertain billed messages are never blindly repeated.

## Financials and verification

Legal identity, current leadership, registered workplaces, financial records and annual-report availability have supported values for all 100. There are 277 normalized statements, preserving all returned years, reported currency/units, negative/zero values and separate company/group scopes. Latest company metric coverage: revenue 73, operating result 98, profit before tax 95, annual result/assets 100, equity 98 and liabilities 91. Missing values remain missing. PDF availability is not PDF extraction.

The final mechanical audit checked 1,678 evidence references, 277 financial records and 1,842 numeric amounts, revalidating 147 web/derived claims with no failures or final withdrawals. The separate complete NAV raw-source audit checked all 10,563 retained records and all feed/catch-up pages. A regional LinkedIn canonical-spelling revalidation bug was fixed and regression-tested. Changed identity-support pages, extraction formats, newly discovered accounts and website path cleanup do not create business-change events; this run has zero such events.

These are consistency checks, not independently labelled semantic precision/recall. Previous v5 withdrawals remain in `previous-evidence-audit.json`. The output hash (canonical envelopes joined by newline) is `9b729a90d33fc8ba10d88c6f3512a0d85f8c73f5ccc7a1f04c8ffe3a44ca4f64`. Replay uses saved results without new research; exact replay and clean-install checks are recorded in `submission/verification.json`.

## Reproduction

The official sample is `random.Random(20260823).sample(universe,100)`, not a hand-picked cohort. Sample, frozen registry and universe hashes are in `submission/datasets.json`. The general runner accepts arbitrary supplied batches and never answers fresh inputs from bundled smoke results. Build/refresh the optional shared NAV index and pass `--nav-catalogue`; see [fallback reproduction](RELIABLE_FALLBACKS.md). NAV's published experiment token is temporary; raw job payloads remain local and are excluded from the review package.

The model API estimate for the observed token counts is:

```text
USD = 0.363 + 2.219854 × input_USD_per_million + 0.044143 × output_USD_per_million
```

Use verified rates for the selected evaluator model; other models can consume different tokens. Evaluator-owned API configuration is compiled and billing-tested, but no paid API end-to-end run is claimed without credentials. Only the official independent evaluation establishes qualification.
