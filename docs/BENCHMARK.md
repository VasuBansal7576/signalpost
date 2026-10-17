# Cold-input benchmark — 16 October 2026

Run `cold-100-20261016-v9` used the unchanged official 100-company sample as **bare registry-number strings only**, with an empty company database. No remembered company URLs, previous profiles, bulk identity data or hand-filled company answers were supplied. The complete outputs remain unchanged after collection, auditing and review preparation. This is a local review; nothing has been submitted or published.

The run returned 100 profiles in 19.62 minutes. All 100 retain partial status because requested web fields remain unresolved. There are 99 saved final model results: one session reached Eve's 160K input-token guardrail. Its verified facts were retained and unsupported fields stayed unresolved. The guardrail was not manually approved and no selected company was rescued after the batch. One unsupported hiring quote was rejected.

## Actual populated coverage

| Field | Companies |
|---|---:|
| Verified official website | 17/100 |
| Business description | 16/100 |
| Normalized financial statements | 100/100 |
| Annual-report availability | 100/100 |
| Current leadership | 100/100 |
| Registered workplaces | 100/100 |
| Hiring / recruitment information | 1/100 |
| Company profiles | 7/100 |
| Dated public activity | 0/100 |

There are 13 unique social-account URLs across seven companies and 14 companies with website-sourced locations. Only seven companies had registry-listed websites; **15 verified websites were discovered for companies whose registry record contained none**. A registry-listed brand/group URL alone does not establish the individual entity's official website. These are measured findings, not comprehensive recall or proof that unresolved companies lack websites, accounts or vacancies.

441 of 900 tracked field cells are populated. NAV source checks are excluded from positive hiring coverage when they return zero ads. Annual-report availability counts links and years; it does not mean every linked PDF was extracted.

## Source and input conditions

The runtime was frozen at `7ad78ee5e16ba5a3089cfdb8c4a242ac2764dc57`. Six workers used 240-second company deadlines, a 3,600-second batch deadline, at most four Exa searches and eight extra Contents pages per company, bounded public-HTML navigation, and a $10 application reservation cap. Exa's authenticated API used existing credit; the model used the existing Codex subscription. API searches and Contents requested maxAgeHours=0; direct HTML respected robots. No new account, payment method, credit purchase or recharge was used.

The company database began with zero jobs, profiles, snapshots, candidate URLs, catalogues and model results. It ended with 100 jobs, 100 profiles, 3369 snapshots and zero remembered candidate URLs. All 100 session receipts belong to this run. The input SHA-256 is `4583a56436b0c86a67a6c7a2b1e95edf7f4ad905cbd0c6913de7ee59bb991c20`; the result-file SHA-256 is `2164cc1a50babd0fbd21a896c70bc2081a6529bfa4e99af225bb45fd42078e23`.

The **shared global NAV public-source catalogue** existed before the company run and refreshed automatically in 7.946 seconds using 29 requests. It is separate from company answers. Its as-of timestamp is `2026-10-16T05:35:36.703Z`. Every company query was recomputed from fresh legal/subunit identifiers. This is a cold company database with a refreshed shared source, not a first-ever cold NAV bootstrap.

The NAV raw-source audit checked 511 feed pages and all 10,397 retained ad records, with no failures. 134 raw records lacked a usable employer ID; company queries additionally apply expiry/status filters. Finn ads are excluded. All 100 exact-identifier queries completed and attributed zero active ads. One separately attributed recruitment-information source was found. No company-wide no-hiring claim was published. The audited catalogue hash is bound to the company-query source hash.

## Timing, requests and cost

| Measurement | Result |
|---|---:|
| Complete run, including source refresh | 1176.914 s |
| Company runtime median / p95 | 61.518 / 113.436 s |
| Company / shared NAV / total source requests | 1367 / 29 / 1396 |
| Provider-reported Exa cost | $2.997 |
| Uncertain Exa reservation | $0.010 |
| Conservative application total | $3.007 |
| Reported model input / output tokens | 5,717,009 / 48,100 |
| Parent maximum RSS | 731,728 KiB |
| Peak sampled runner + child RSS sum | 1,343,248 KiB |

The fixed model subscription fee is excluded; this is not a free-production-cost claim or a paid-model API benchmark. Token totals contain reported completed steps; interrupted-session usage may be incomplete. Uncertain billed source calls were not blindly repeated. RSS sums can count shared pages more than once. Earlier URL-seeded timings and costs are not a controlled cold-discovery comparison.

## Financials and verification

All 277 returned statements retain reported periods, currency, units, company/group scope, zero/negative amounts and original source paths. Missing lines stay missing. Latest company-metric coverage is revenue 73, operating result 98, profit before tax 95, annual result/assets 100, equity 98 and liabilities 91. Company and consolidated statements remain separate.

The automatic audit ran on a SQLite backup copy and checked **2,055 evidence references, 277 statements, 1,842 numeric amounts and 162 web/derived claims**, with no failures or withdrawals. The original result-file hash was checked before and after auditing. The audit wrapper's path-resolution defect was fixed before this run. Mechanical source consistency and attribution checks are not independently labelled semantic precision/recall or an official qualification score.

All 63 tests, typechecking and the production build passed before the run. Final dashboard API checks passed for all 100 profiles, inspection, original-source hashing, export, credential isolation and launch validation. Desktop and 390px mobile interactions were checked. The investor film uses captures from this run and exports metrics directly from the audited results; mismatched runs or numbers block its export.

## Reproduce and inspect

Run `npm run benchmark:cold -- --run-id YOUR_NEW_UNIQUE_RUN_ID` with the local Exa credential and Codex login configured. The wrapper refuses existing output/database paths, records input/runtime fingerprints, executes every input once, audits a database copy and refuses a modified result export. `--input PATH` supports another set of exactly 100 distinct bare-number strings. Use the general batch command in the README for arbitrary sizes or evaluator-owned model credentials.

The original local database and raw receipts remain available for source verification. `out/cold-100-20261016-v9/` contains the report, immutable results, cold-input proof, all-company coverage CSV, both audits and runtime manifest. The `submission/` directory is a local review copy, not a sent submission. Its offline import discloses that full raw-source caches are excluded.

The earlier URL-seeded diagnostic is retained in [the historical report](BENCHMARK_SEEDED_DIAGNOSTIC.md). No prior company answers from it were imported into this run.
