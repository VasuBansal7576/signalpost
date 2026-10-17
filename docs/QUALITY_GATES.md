# Enforced quality admission and bounded verification

The latest [coverage repair](COVERAGE_REPAIR_20261017.md) retains two failed fresh 12-company pilots and a separately labelled v19 preserved-source regression. It does not issue a quality certificate or unlock scaling. Final tests/typecheck/build pass; independent fresh all-family qualification remains incomplete.

By default the CLI denies a real batch larger than20 rows without passing pilot evidence, larger than100 without passing100-company evidence, and larger than1,000 without passing1,000-company evidence. Registry-only mode cannot bypass scale admission. Fictional demo mode remains explicit and cannot produce accepted quality evidence. Admission runs before database/cache/source setup. The dashboard refuses unqualified scale launches before queuing jobs; scale verification uses the bounded runner.

**Current status: no fresh quality gate has passed.** The initial 12-company preflight was blocked, but interpreting account summary usage as proof that normal provider calls were unavailable was incorrect. A normal existing-login native-search and structured-output probe succeeded; the preserved guard was explicitly cleared after the user renewed the run request. No external key or new credit purchase was used. The actual fresh 100-company run finished with poor coverage and incomplete usage; the separate 1,000-company campaign has now saved all 1,000 outputs after recovery, with quality still failed. [Actual receipts and findings](FRESH_RUNS_20261017.md) supersede the earlier capacity-blocked conclusion. Neither execution nor default gate code establishes production readiness.

`--verification-only --verification-selection <selection.json>` is an explicit uncertified measurement lane for exactly 100 or 1,000 fresh companies, added for the user-requested executions. It requires a new empty database/cache/output, frozen selection hash, strict keyless full research, ordinary admission controls and bounded execution. It cannot create semantic certification or release-quality admission. Its measurement ceilings are 20/90 minutes and model/search exposure $0.10/$0.06 per company; exceeding stricter engineering acceptance criteria remains a failed result. An explicit `--verification-resume <receipt.json>` may continue the same unfinished cohort only when the prior PID is gone, input/run identity matches and saved profile hashes are unchanged. Possibly billed attempts cannot be automatically replayed. After an expired, sealed failed 1,000 measurement, an explicitly marked completion phase has a two-hour total campaign cap; it cannot turn the failed measurement into a passing quality artifact. The actual HTTP/2 failure and 124-company completion are retained separately in the linked report.

## The admission contract

The following are explicit local engineering thresholds, not organizer rules or a prediction of its score. They are frozen in `qualityPolicy` and included in the runtime fingerprint. Changing them invalidates prior evidence.

| Gate | Required evidence |
|---|---|
| Cohorts | Pilot12–20 companies, then exactly100, then exactly1,000. Fresh IDs against retained jobs and earlier selections; independent company-host overlap checks. |
| Registry | Exact registry identity/name anchor for every company; financials, leadership, workplaces, financial history and group structure must be available or have an explicit absence/not-applicable state. Failed/unmeasured families block. |
| Reference independence | Source-backed atomic opportunities frozen before production starts; exact target, field, scope and literal source quote/hash. Every company and all seven external families must have completed reference investigation. Unknown remains unknown. |
| Accuracy | Every available claim receives exactly one contextual judgment. At least50 external representations, precision≥98%, Wilson95% lower bound≥90%. No known unsupported/ambiguous publication or material entity/financial/policy error is admitted. |
| Coverage | At least two reference opportunities per external family; each family's70% company/30% fact recall≥80%, and individual-fact recall≥70%. Partial matches receive no full-fact credit. No denominator means unmeasured and blocked. |
| Proof | Every available claim's evidence belongs to the exact company/snapshot, with matching URL/class/hash and literal quote. Retained source restrictions are checked for published and reference sources. |
| Extraction | No omitted source spans, unfinished admitted packets or uncertain model attempts. |
| Cost | Complete native-search/token receipts; combined API-equivalent≤$0.10/company. Enforced reservation ceilings split into≤$0.05 model and≤$0.05 search/company. Unknown usage does not become zero. Fixed subscription, machine and ordinary assistant research costs remain separate. |
| Latency | Company p95≤90seconds. Batch ceilings: pilot10min,100companies20min,1,000companies45min. These are engineering budgets, not asserted official deadlines. |
| Synthesis/UX | Every company brief reviewed; sources inspectable, unknowns visible and material qualifications retained. |
| Integrity | Code, scripts, UI, dependency lock, behavior configuration, policy, input, reference, output, report, source index and prior-research inventory are bound by hashes. A current pass is recomputed; a `passed:true` file is not authorization. |

Passing a small set authorizes the next experiment only. It does not statistically prove population accuracy, establish exhaustive internet recall, choose a universally optimal model, resolve unlogged host exposure or qualify the official evaluator route. The precision interval assumes independent observations; correlated claims weaken that interpretation. Two opportunities per family provide an admission floor, not broad field calibration. These limits remain visible when scaling evidence is reported.

## Preventing another repair loop

- Parent watchdog terminates a stalled runner and its process group, escalating to kill after five seconds.
- An exclusive attempt marker prevents overwriting/replaying a fresh cohort. Existing databases, caches, results, reviews and logs are rejected.
- The pilot campaign permits at most two disjoint fresh attempts within30minutes. Its durable state cannot reset itself on expiry or corruption.
- Run plus review must finish within30min for the pilot,45min for100, and60min for1,000. A late completed repair is development work, not a passing frozen test.
- Changing code/configuration invalidates the predecessor pass. A repaired failed cohort cannot be relabeled as fresh.
- No automatic scaling: the100 run requires a pilot artifact;1,000 requires the100 artifact and its passing predecessor chain.

This is an operational guard against accidental drift, not a security boundary against someone deliberately editing the repository or inventing reviewer labels. Independent judgments still need actual source reading. The evaluator rejects incomplete/duplicate decisions, recomputes metrics and checks source fidelity; it cannot mechanically prove that a reviewer interpreted every source correctly.

## Commands and artifact contract

```sh
# Creates a new selection and the known prior-company/host inventory; no network.
npm run quality:select -- --output out/quality-pilot-NEW --count 12 --seed YOUR-SEED
```

Before acquisition, an independent reviewer completes `reference.json` using `referenceSchema` in [quality-gate.ts](../src/quality-gate.ts). It must contain all company/family investigation states, atomic reference facts and preserved bodies in `sources/<text-SHA256>.txt`. Every source requires explicit provenance (including transcript versus publisher raw bytes) and a dated permitted-policy review with its primary URL and reasoning. Unknown permission cannot parse as admissible truth. File hashes, quotes, family completeness and retained restrictions are checked before any provider work. Reviewers must not see production answers while constructing the reference. Publisher raw-byte hashes and readable transcript hashes are distinct; retained built-in-web transcripts are not upstream raw-response proofs.

```sh
npm run quality:run -- --directory out/quality-pilot-NEW
npm run quality:claims -- --directory out/quality-pilot-NEW
# Independent output reviewer then supplies review.json per reviewSchema:
# all claim judgments, all reference matches, every synthesis and UX checks.
npm run quality:evaluate -- --directory out/quality-pilot-NEW

# Only after the predecessor genuinely passes, prepare and review a disjoint reference:
npm run quality:select -- --output out/quality-100-NEW --count 100 --seed NEXT-SEED
npm run quality:run -- --directory out/quality-100-NEW --evidence out/quality-pilot-NEW
# After100 passes and a new reference is frozen:
npm run quality:select -- --output out/quality-1000-NEW --count 1000 --seed FINAL-SEED
npm run quality:run -- --directory out/quality-1000-NEW --evidence out/quality-100-NEW
```

Each run preserves input/selection/freshness, the exclusive attempt marker, runner log, actual process result, database, result JSONL, report, source bodies/index and sealed manifest. `quality:claims` exports full available claims for review. `quality:evaluate` writes `quality-result.json`, but the next CLI launch recomputes the complete predecessor chain against the current build and configuration. An invalid/missing artifact exits nonzero. The legacy mechanical verifier now reports acquisition mechanics separately and cannot emit full quality certification.

Host inventory covers `verified_hosts` and every published official/registered website in discovered local databases. It does not claim to capture every unlogged assistant read or unpublished candidate page. Company-host overlap is recomputed from company-owned snapshots and official/registered website claims, including production snapshots that retain an external class after attribution; a declared zero alone is insufficient. Shared global registry/feed hosts do not act as company-owned website anchors.

## Fresh preparation performed on17October

Directory: `out/quality-fresh-20261017-v1/`.

- Twelve IDs across seven industry groups;8,911 prior researched/selected IDs excluded. Known prior company-host inventory:501.
- Input SHA256: `304fbf81041ff7d2a7761a87405b85db9de16160ce6d2a798bde6ebe64d860c4`.
- `preflight.json`: stopped before acquisition, zero network/model calls; accuracy, coverage, API-equivalent and production latency are null; scale admission false.
- `capacity.json`: sanitized account-capacity observation; no personal account identifier or credentials retained.
- `independent-reference.md/json`:26 atomic research opportunities across five companies, plus one separate certificate-context fact. Seven companies and entire profile/reputation families remain incomplete. This is partial primary-source preparation, not a valid `reference.json` or completed benchmark.
- Five hash-addressed readable source transcripts are preserved separately from publisher raw bytes. Policy/provenance work remains open.

The production system has not earned quality certification. Actual 100/1,000 measurement execution is recorded separately; failed gates and incomplete independent references remain failed or unmeasured. The earlier zero-call preflight is retained as history and does not replace those executions.

## Implementation validation

The frozen final test suite passes343tests in17.68seconds, including real CLI/dashboard rejection before company work, stale/invalid semantic evidence, unknown usage, source-policy provenance, exact-company reference matching, host overlap, worker cancellation and campaign exhaustion. Typecheck and production build pass. The dashboard integration test uses loopback access, temporary stores and an active provider-stop fixture. Synthetic passing fixtures validate the gate implementation; they are not production accuracy evidence. Logs are retained in `out/quality-fresh-20261017-v1/tests.log`.
