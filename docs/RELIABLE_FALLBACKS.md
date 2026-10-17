# Reliable hiring and profile fallbacks

The runner separates discovery, identity attribution and evidence extraction. Search recall alone does not establish whether a legal entity has accounts or jobs.

## Company profiles

The primary proof is an actual account URL published by an attributed company page. A fallback accepts an account linked by a specific Proff, Purehelp, Gulesider or 1881 company record when the exact organisation number, legal name, registered street/locality and account brand agree. A search-results page cannot support this profile fallback. The publisher remains an external directory; it is never relabelled company-owned. Parent-brand, personal, share and namesake accounts remain rejected.

Remembered public URLs are discovery seeds only. The page is fetched again for each fresh run. Where no remembered URL exists, exact-org directory lookup provides a bounded seed. Directory links can discover a company site; that site must independently pass ownership checks. Direct public HTML retrieval is bounded, respects robots, validates TLS and public DNS, and executes no page scripts. It resolves observed relative careers/contact links and JSON-LD sameAs URLs. Restricted social-platform pages are not fetched. Canonical account URLs preserve the original publisher link in their evidence.

Website corroboration can additionally use the legal name, registered locality, matching brand domain and a telephone also published by the exact-org trusted directory record. This handles a published street typo without fuzzy street matching. Explicit conflicting organisation numbers still fail closed. Tests reject a different phone, org, city or parent account.

## Hiring: authoritative employer identifiers

NAV's [documented feed](https://navikt.github.io/pam-stilling-feed/) is separate from its website's fuzzy, rate-limited search. A feed ad includes an employer organisation number. The published experiment token is obtained without storing it; a registered-consumer token can be used operationally. No account registration or email request is performed by this project.

A first bootstrap reads from the first available feed event, follows every page, retains the latest active head for each ad UUID, and fetches every active head's current detail. A partial recent-window scan cannot establish absence: live testing found active ads published more than six months earlier. The current-detail sweep is followed by cursor catch-up to apply updates and withdrawals that arrived during hydration. Responses, hashes, expiry, status and employer IDs are preserved. Failed/incomplete collection cannot support scoped counts.

The query matches the requested legal organisation number or a registered subunit whose parent was verified through Brreg. It checks ACTIVE status, publication time and expiry at the source observation time. A matching name never overrides a different org number. The source is shared across the batch, rather than requesting one fuzzy NAV search for each company. A raw-source audit verifies the full feed headers, every retained ad and normalized employer identifiers.

The resulting claim is a **derived NAV-source query**, not a quotation saying the company has no jobs. It records the attributed active-ad count, exact employer IDs for listed ads, observation interval, catalogue SHA-256, subunit mapping fingerprint, missing-employer-ID records and source limitations. Finn ads are excluded from NAV's feed. Zero means no active ads attributed by these identifiers in the checked NAV source; it never establishes company-wide absence. Careers pages, open applications and other recruitment platforms remain separate observations. The UI separates checked sources from vacancies/careers signals.

Raw job payloads can contain public contact data. They stay local and are excluded from the release. The local minimal derivative index contains only identifiers, titles, employer names, status/dates, source URLs and source hashes. NAV query receipts use extraction method nav-feed-index-query/v1; they are recomputed against the hashed source catalogue, rather than checked as model quotations. Cold-bootstrap time/requests and company-query time are reported separately.

## Automatic operation

The live CLI and dashboard prepare the shared NAV source automatically in `data/sources`: reuse if current, incremental refresh if stale, full bootstrap on first use. An optional path override is configuration, not a required user step. Source updates are serialized; an incomplete refresh does not replace the last complete source or support new absence claims. `INACTIVE`/`DELETED` detail tombstones observed after an active feed header remove the ad instead of crashing the refresh.

A company needs only its organisation number. Missing employee count or registry website never skips profile discovery. Missing-profile lookup runs before model extraction; final link recovery runs even if the model fails. Populated-field coverage excludes NAV zero-count receipts, which remain visible as separate source checks.

## Optional source maintenance command

```sh
node --import tsx scripts/build-nav-index.ts \
  --output data/nav-catalogue.json --raw-directory out/nav-source

npm run batch -- --organisations companies.jsonl --bulk frozen.csv.gz \
  --nav-catalogue data/nav-catalogue.json \
  --run-id fresh-batch --output out/fresh/results.jsonl
```

A complete catalogue must be collected or refreshed within one hour of starting a live batch. The cold company benchmark starts with an empty company database and bare registry numbers; it does not import remembered company URLs or previous answers. Its declared shared public NAV source is separate and each company query is recomputed from fresh legal/subunit identifiers. First-ever source bootstrap and reuse/refresh are measured separately, because rebuilding the complete global feed has a substantial setup cost.

Refresh an existing complete index with `--refresh-from data/nav-catalogue.json` on the maintenance command. The review package contains per-company query receipts and the source audit, not the global index or raw job payloads. Raw source records and their versioned hash receipts remain in the local test output for audit. Use Docker-managed native Linux volumes for live SQLite/Eve state and export only after the process stops; do not place live Linux SQLite files on a macOS bind mount.
