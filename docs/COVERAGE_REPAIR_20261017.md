# Coverage repair — 17 October 2026

The repo now fixes the reproduced discovery, retrieval, attribution, verifier and extraction losses. **There is no passing fresh quality certificate. Scale admission remains closed.** Two disjoint fresh 12-company pilots exposed further failures; their original outputs are retained. Subsequent work used preserved sources as development regressions, rather than another live cohort or a 100/1,000-company rerun.

## Concrete changes

- Native website search runs before speculative domain/directory work, includes current registered trading names, and ranks plausible company pages before the fetch cap. Early company-link inspection can establish identity before optional searches consume the deadline. Short discovery windows retain a bounded search opportunity and reserve extraction time.
- The public reader returns the actual canonical page after a www/apex redirect. Transient unpaid public GETs have one separately recorded retry. HTTP403 and robots denials remain blocked; canonical-destination policy is checked before publication.
- A pinned `parse5@8.0.0` parser replaces regex tag stripping for readable HTML and actual anchor extraction. Quoted `>` characters no longer leak JavaScript or invent links. Non-rendered templates are excluded; substantive body text, footer identity, metadata and JSON-LD survive. Evidence methods advance to static-v4/rendered-v3; previous evidence stays readable.
- Production semantic decisions fail closed **per proposal**. A missing/duplicate judgment or invented counterquote leaves that proposal ambiguous without discarding independently supported neighbors. Original model judgments and billing receipts are retained. Unknown IDs cannot authorize an unreviewed fact.
- Extraction explicitly inventories distinct services, production stages, locations, hours and dated developments. Link recovery finishes before extraction. Exact weekly hours, including department headings/key-drop clauses, are normalized into business details, preserving the original value/quote and journal entry. Hours remain publisher observations rather than independently established operating availability.
- Exact legal publishers can be corroborated by their current parent-bound registered trading name, brand and locality. A sole named publisher plus matching org and registered street/locality supports acronym hosts. Publisher connectors `av`/`by`, possessive spelling and `gt`/`gata` street variants no longer erase identity; wrong operators and house numbers remain blocked. A separate exact-company contact page can corroborate a homepage whose legal-name text follows long navigation.
- First-person Norwegian `oss` history statements and supported pre-2000 dates survive at their stated precision. Source-reported qualifications remain distinct from independently verified certification. Publication policy advances to **v19**, invalidating old policy-dependent extraction reuse.

The existing registry/financial route and shared-source architecture remain in use. No external service keys, Exa/Firecrawl credits or credit purchases were used. Models used the existing subscription login; source acquisition used public HTTPS.

## Fresh measurements, preserved as failures

Both pilots used new company IDs and empty production databases/caches. Each source/configuration was fixed during execution, and reference opportunities were sealed before its outputs existed. IDs exclude earlier jobs and selections. Publisher-host freshness is not certified. References were bounded agent primary-source reviews, not human/organizer gold and not complete all-family denominators.

| Measurement | First fresh 12 | Second fresh 12 |
|---|---:|---:|
| Outputs | 12/12 | 12/12 |
| Wall time | 4m36s | 4m00s |
| Company p95, including preparation/queue time | 257.8s | 223.1s |
| Combined API equivalent | Unknown | $0.51374616 |
| Known subtotal | $0.55262836 | $0.51374616 |
| Companies with incomplete usage | 1 | 0 |
| Uncompleted admitted extraction spans | 16 | 0 |
| Frozen reference opportunities | 38 on 6 companies | 42 on 6 companies |
| Fully represented / partial / missing | 18 / 2 / 18 | 17 / 3 / 22 |
| Positive web representations manually reviewed | 46 | 96 |
| Supported / ambiguous / unsupported | 44 / 1 / 1 | 81 / 11 / 4 |

These are different samples and opportunity sets: the recall percentages are **not a paired before/after estimate**. Conditional full-fact recall was47.4% and40.5%; it is not whole-cohort/all-seven-family internet recall. Every positive web representation was read with its entity, source, field, temporal and contact/assertion scope. Source-scoped zero NAV counts were excluded from precision. Registered addresses can represent contact references across fields; matching a string without its required scope does not receive full credit.

The second pilot had24 completed model attempts, complete measured usage and zero omitted/uncompleted extraction spans. Its estimated combined cost was about$0.04281/company. It still failed the90s p95, semantic precision and coverage gates, and lacked complete independent family denominators. No official score is inferred. The current v19 fixes followed these runs, so neither pilot certifies the final source version.

API equivalents use the retained rate table and actual reported usage, including cache details. They are estimates distinct from cash billing. Subscription cost, existing account-credit consumption, assistant/independent-reference work and development probes are separate; unknown usage is never priced as zero. The NAV catalogue retains its declared16 October cutoff. These are local live-registry diagnostics, not the official evaluator's frozen-bulk qualification.

## Paired evidence for the final repairs

Four failures in the second pilot were fetched successfully but excluded from extraction by attribution. Preserved-source traces identified the exact rejection and were turned into regressions:

| Case | Reproduced loss | Final development proof |
|---|---|---|
| VIM | `© … av Company AS` parsed as a different publisher; acronym host rejected | Website, manufacturing/services, customers, contact and 1991 history retained |
| Tobben | Possessive spelling/contact bridge rejected | Website, heat pumps, installation, service, hours and contact retained |
| Chang Cheng | `Storgt.14` failed registered `Storgata14` matching | Website, cuisine, takeaway, group menus, kitchen timing and 1990 history retained |
| Plassebakken | Homepage rejected after long navigation although separate contact established the company | Homepage admitted; capacity96, parent ownership, age groups/gym, nature profile and 1989 history retained |

The same28 pre-sealed opportunities on those four companies went from **5 full to 25 full,2 partial,1 missing**. This was a **known-case development replay**, not a third fresh holdout. It revalidated the complete saved per-company source collection; derived NAV receipts were excluded from this model-only regression because no catalogue was loaded. It used no web discovery or previous model answers. All admitted packets finished without omitted spans; inference and verification took31.7–41.4 seconds/company,85.1 seconds overall at concurrency2, with$0.03210920 measured model API equivalent. Those times exclude discovery and registry work.

Earlier paired probes separately reproduced the broad-summary extraction loss on Telemarkrøye:4 proposals before,15 after the inventory prompt. RAS/lake-production and the own ASC assertion survived normal publication checks; the staff name was rejected as hiring. Re-parsing the full failed marine-supplier source collection admitted2 packets and produced19 accepted proposals in48.7 seconds/$0.00950040. The own website, fisheries offerings and contact were recovered. Accepted-proposal counts are not an independent precision score.

## Remaining gate failures

The final controlled replay still omitted Tobben's **free** consultation detail. Kindergarten admissions lacked the1 March deadline; the LaVandre relationship was recovered but its13 February 2026 publication date/role was not. Low-value greetings/menu headings, staff-versus-company qualification scope and archival/currentness distinctions still need stricter publication relevance. Contradictory hours cannot establish actual current operating availability merely because both pages were quoted.

Unseen-company precision, complete seven-family recall and the final code's fresh latency/cost qualification remain unproven. The two-attempt pilot campaign was not reset. An offline admission check denied100 without passing pilot evidence and1,000 without passing100 evidence. **No larger run was started.**

## Validation and artifacts

All373 tests, typecheck and production build pass. The original18 new coverage tests fail against the preserved pre-repair source; the four later real attribution cases also went red before their fixes. Negative operator, conflicting-publisher, wrong-parent, wrong-address, robots, temporal and uncertain-paid-attempt protections pass. These regressions prove the repaired seams; they do not override failed release gates.

- [First pilot manual review](../out/coverage-fix-20261017/fresh-12/manual-review.json), [second pilot manual review](../out/coverage-fix-20261017/fresh-12-b/manual-review.json), [comparison](../out/coverage-fix-20261017/pilot-comparison.json).
- [Final paired source replay and fact matches](../out/coverage-fix-20261017/attribution-development/manual-matches.json), [outputs/receipts](../out/coverage-fix-20261017/attribution-development/results.json).
- [Original rejection traces](../out/coverage-fix-20261017/remaining-trace-diagnosis.json), [scale denial check](../out/coverage-fix-20261017/scale-admission-check.json).
- [Original regression failures](../out/coverage-fix-20261017/baseline-all-red.log), [final 373-test run](../out/coverage-fix-20261017/regression-v19.log), [typecheck](../out/coverage-fix-20261017/typecheck-v19.log), [build](../out/coverage-fix-20261017/build-v19.log).
- [Machine-readable final status](../verification/coverage-repair-20261017.json).
