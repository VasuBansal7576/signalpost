# Independent review of published web claims

The frozen 1,000-company output contains **531 individual published external string claims across 123 companies**: 205 descriptions, 119 websites, 112 locations, 71 profiles, 17 recruitment strings and seven dated activities. The other 877 companies have no published external string in these fields. This review does not treat that as proof that no such facts exist.

Every one of the 531 claims received an independent semantic judgment against its **complete saved cited readable pages and legal registry identity**. This is separate from the producer’s extraction prompt and `verify()` implementation. It checks what text means, which entity it concerns and how it has been represented. It does not just check that a quote occurs in a source.

The adjudicated result, including three subsequent primary-source/context corrections, is **468 supported, 33 ambiguous and 30 unsupported for the claimed field or entity scope**. These are agent assessments, **not human gold labels, an official challenge score or exhaustive web recall**. Of the 30 unsupported representations, 11 are demonstrated entity, ownership or recruitment-state errors; 19 are field or presentation errors, including navigation dumps, postal addresses, service areas and an event venue. Reporting all 30 as invented facts would be misleading.

| Field | Claims | Supported | Ambiguous | Unsupported for field/scope |
|---|---:|---:|---:|---:|
| Business description | 205 | 177 | 15 | 13 |
| Official website | 119 | 108 | 3 | 8 |
| Locations | 112 | 95 | 11 | 6 |
| Company-owned profiles | 71 | 68 | 3 | 0 |
| Recruitment information | 17 | 13 | 1 | 3 |
| Dated public activity | 7 | 7 | 0 | 0 |

The initial adjudication was 470/33/28. The original receipts and labels are preserved. `published-judgment-corrections.json` changes Grønsand’s website to unsupported (different legal operator), its Facebook ownership to ambiguous, and TK Gruppen’s website to unsupported (the legal terms name a different organization). `published/corrected-all-claims.json` and `status.json` apply those corrections without rewriting the model responses. The supported fraction is **468/531 = 88.14%** for this explicitly bounded set of external strings. This is not all-field company accuracy.

## Demonstrated defects

- **RENOVAI AS, 931445774:** `renovai.com` displays a Spaceship domain-sale checkout. The profile published the checkout’s marketing text as RENOVAI’s business description. A third-party directory had already conflated the same parked domain with the company. A company number in that directory is not enough to authenticate the current site or its offerings. [Saved-source URL](https://renovai.com/).
- **GRØNSAND AS, 997438116:** the venue site identifies **GRØNSAND GJESTEGÅRD AS**, a separate operator. A fresh unauthenticated [primary registry check](https://data.brreg.no/enhetsregisteret/api/enheter/919378875) confirms operator 919378875, the venue address and the same homepage. Both companies listing one homepage does not transfer the operator’s offerings to the property company.
- **BLUESTREAM AS, 934586301:** the about page explicitly describes two legal entities, assigning Miami operations to Bluestream LLC and Scandinavian advisory work to Bluestream AS. A practice-wide description was published as an unqualified AS description. [About page](https://www.bluestreamfl.com/about).
- **JOYMO AS, 916959311:** recruitment JSON has real populated open-application positions and an unused `blankStateTitle` saying no positions are open. The producer treated that template string as the actual state and published `explicit_no_open_roles`. Structured state must outrank incidental template text.
- **ABC FYSIOTERAPI AS, 912889963; SENTRUM FYSIOTERAPI VOSS AS, 920297455; ACTIO BEGRAVELSESBYRÅ AS, 984019807:** unclaimed or automatically processed directory listings were published as official websites. The first two invite the clinic to claim the listing; the last explicitly says the company is not active on the directory. A listing’s own `MedicalClinic.url` is not proof that the clinic owns that website.
- **ROGNSTAD VVS AS, 979938217:** a landlord’s tenant page was published as the company’s official website. Its copyright identifies Rognstad Eiendom, and the body explicitly points readers to `www.rognstad.no` for the plumbing company. **GAWE MEDISINSKE KLINIKK AS, 912973808** similarly received a collaborating clinic’s profile as its official website.

## Useful facts put in the wrong fields

Vestlandsforsking’s literal **Postadresse**, Engelsborg Media’s **PB 12**, and Frol Bygdealmenning’s **care-of accountant address** do not establish operating sites. EnergiRike’s Quality Hotel Maritim is a dated conference venue. Borg Radonsikring’s Norway/Sweden coverage and Andersen & Knoph’s listed service municipalities are service areas. Preserve those facts with their actual types; do not inflate physical-office coverage.

Several company descriptions and two hiring strings contain full navigation, link lists or truncated SEO excerpts even though the same saved pages contain concise substantive paragraphs. These are real field-quality failures, but not evidence that every phrase in them is false. Coor’s customer login portal should be stored separately from its explicitly stated public homepage. Brekke & Strand’s blog is genuinely company-owned; preferring its canonical homepage is a canonicalisation improvement rather than a wrong-entity finding.

## Ambiguities that must stay visible

The remaining 33 claims include conflicting postcodes or street numbers on the same site, stale registered-office text, a possible landlord/operator distinction, group offices that are not mapped to the Norwegian AS, and business-origin dates that predate the current legal entity. An old brand may legitimately predate incorporation. Different registered and visiting addresses are also legitimate. Neither situation alone proves a false claim.

For example, Checkpoint Charlie explicitly labels its visiting address. Schema.org `PostalAddress` is an ordinary address datatype, not a postal-only label. The audit corrected those model false positives instead of removing useful source-supported contact locations.

Caplist’s saved homepage announces its 2026 acquisition and customer migration to Nexus Connect; the published description misses that material transition. Jacob’s Auto Supply’s undated vacancy remains recruitment information with unresolved freshness, rather than a verified live vacancy.

## Evidence and reproduction

Input: `out/keyless-final-reprocessing-1000-v5/results.jsonl`, SHA-256 `2e878890d1d65b2492faaef149a2d32a2fa61c6417a7ac3f1a1b9ffa7c8e7af4`.

The independent reviewer used `gpt-6-sol` through the existing local Codex subscription, with no tools, no external API keys, no retries, full source packets and durable per-company attempts. All 123 calls completed with reported usage: **2,262,761 input tokens, 181,656 output tokens; $6.342082 API-equivalent**, using the repository’s recorded 2026-10-16 rates. This is an API-equivalent estimate, not a new API invoice. Parallel wall time was **389,993 ms**; individual calls ranged from 3,888 to 27,079 ms. Public follow-up consisted of six unauthenticated registry GET attempts to resolve suspected legal-entity conflicts; no paid search provider was used.

119 original responses passed their exact output contract; four completed responses copied a source ID incorrectly. Original responses remain unchanged. Eight quoted references were reanchored offline by exact full-source substring, with every repair recorded. No model attempt was repeated. There are no unresolved judgment rows after that evidence repair.

All **71 model-flagged claims were inspected in full source context by the reviewing agent**. Eleven model flags were corrected to supported. The agent also identified an additional unsupported location-field representation the model had accepted. The model’s 270 fully anchored potential-omission suggestions are saved separately: they are useful candidates for coverage recovery, not a verified missing-fact denominator or gold set.

The original review commands are below. **Do not start new SDK calls while `subscription-admission-guard.json` remains active.** Existing receipts and local adjudication files can be inspected without new calls.

Original source-backed review commands:

```sh
SIGNALPOST_KEYLESS=1 node --max-old-space-size=1024 --import tsx scripts/semantic-published-review.ts --concurrency 4
node out/semantic-verification/published/manual-adjudications.mjs
node out/semantic-verification/published/finalize-review.mjs
node --import tsx --test tests/semantic-published-review.test.ts
```

The reviewer skips existing attempts, including uncertain attempts; inspect them instead of deleting receipts to repeat an unknown call. The original input and database are opened read-only and were not modified by this workstream.

Machine-readable artifacts under `out/semantic-verification/published/`:

- `all-claims.json`: all 531 claims, original claim indices, stable claim IDs, model and adjudicated verdicts, exact source quotes, IDs, hashes and URLs.
- `adjudicated-findings.json`: the original 61 unsupported or ambiguous representations, with reasons and reproducible source identity.
- `manual-adjudications.json`: all inspected flags and additional source-inspection findings, including corrected model false positives.
- `adjudicated-summary.json`: counts, usage, timing, completeness and explicit limitations.
- `source-id-repairs.json`: eight exact-text source-reference repairs, preserving original outputs.
- `potential-missing.json`: 270 anchored but unvalidated omission candidates.
- `<org>.packet.json` and `<org>.json`: exact full reviewer input and original model response/usage receipt.
- `entity-919378875.json`, `entity-919296585.json`, `entity-987747897.json`: separately timestamped public primary follow-ups. The last returns HTTP 404, leaving TK Gruppen’s conflicting ownership number unresolved.

This document identifies the defects and proposed general corrections. Production fixes and a fresh validation of corrected outputs belong to the coordinating workstream; this review does not silently claim that implementing a guard proves whole-web accuracy or coverage.

## Validated recovery candidates and quality taxonomy

`validated-missing-facts.json` contains **145 independently inspected, source-anchored enrichment or replacement candidates across 78 companies**. This is not a count of 145 independent lost facts: some replace a poor description, add detail to an already-covered field, or canonicalise an existing URL. The file contains literal source quotes and values, old V5 snapshot IDs, content hashes, identity proof, scope and date semantics. `all-270-suggestion-decisions.json` accounts for every model suggestion: 127 source-context validated suggestions, 68 outside the current research fields, 48 already present as registry facts, five exact equivalent fragments, and 22 deferred for ambiguity, redundancy or insufficient context. Additional blind-reference foundation facts and manually inspected AtB, Vendanor and Joymo facts bring the candidate count to 145.

Notable recoveries include Vestlandsforsking’s substantive research description, explicit Campus Sogndal base, five owned profile links and dated announcements; four additional Norwegian Brekke & Strand office addresses; Sweco’s explicitly listed Norwegian office cities; owned profiles missed on many sites; concise AtB role responsibilities; the two actual Joymo open-application records; and Vendanor’s substantive manufacturing and service paragraphs. Vendanor’s career page supports an open application, without establishing a specific live vacancy. An apparent Instagram omission for Elektro 1624 was deferred because the handle names another brand and ownership is unclear.

RENOVAI’s original search receipts already contain `renov.ai` as an alternative candidate, but its original HTTP ledger records a DNS failure. No preserved readable replacement primary site exists. A search URL alone cannot authenticate a current official website. The unrelated international Renovai company must not be substituted for the Norwegian AS.

The quality taxonomy separates:

1. **Entity and ownership:** exact legal entity, subsidiary/branch, shared brand, operator versus property owner, directory/partner subject versus publisher ownership, and explicitly unresolved identity conflicts.
2. **Meaning and field:** actual offering versus menu or scenery; operating site versus registered, contact, postal, service-area, venue or project location; active vacancy versus open application, apprenticeship information, source-scoped no ads or a template string.
3. **Time:** observation date, report/publication date, event occurrence date, appointment effective date, scheduled future event and unknown freshness. A year-only acquisition remains year precision; no day or month is invented.
4. **Evidence strength:** publisher-declared information, official registry fact, exact legal identity binding, explicitly owned profile link, corroborated fact and unresolved conflict. A first-party assertion is evidence of what the publisher says; it is not automatic independent corroboration of a certification or every real-world fact.
5. **Representation quality:** exact factual error, wrong field/scope, ambiguity, truncation/noise, duplicate fact and canonical URL improvement. These must not be mixed into one fabricated-fact rate.

A defensible gold protocol should freeze the source cutoff, company universe and source packets before scoring. Two reviewers should independently label atomic fact propositions without seeing producer outputs; disagreements and insufficient evidence require adjudication. References must carry exact entity, predicate, value, scope, date precision and source identity. Match output against meaning, including canonical profile aliases and valid paraphrases, rather than counting raw strings or duplicate quotes. Report precision separately for legal identity, financial interpretation, offerings, operating sites, profiles, recruitment and dated activity. Report both fact-level and company-field coverage.

Recall measured against such a set is **reference-opportunity recall within the declared source universe**. It is not whole-web recall. An unavailable site, exhausted retrieval budget, missing identity proof and a searched-but-unresolved company are different states. They must not be relabeled “no facts exist.” The 877 companies without published external strings particularly require independent coverage sampling and source discovery; inspecting only the published positives cannot establish their recall.

Corrections developed from this 1,000-company set are now evaluation-informed development. Replaying the same set proves repair and checks for regressions; it does not create a fresh blind test. Keep an additional untouched cohort or obtain organizer evaluation before claiming generalisation or an official score.
