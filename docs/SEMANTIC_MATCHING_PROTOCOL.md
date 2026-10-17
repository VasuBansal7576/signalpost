# Assisted matching within the preserved readable source pool

Only begin after the all-1,000 source-span gate passes. This is source-subset assisted evaluation, not human gold, full-web recall or an official score. Corrupt compressed snapshots remain separate acquisition failures. Later discovery/recovered PDFs are outside this frozen external reference pool. No model-client/provider calls, network calls or external keys.

Read every assigned company packet, its identity, all reference candidates and source-context annotations, and both original/fixed claims. Resolve cross-source binding/currentness corrections before treating a candidate as true. A candidate's existing label is evidence to review, never an automatic verdict. Retrieve the preserved source text locally when context is insufficient; keep uncertainty rather than guess. Exact aliases are not independent confirmations.

Write one JSON receipt per organisation in `out/semantic-verification/manual-matching-v2/reviews/<org>.json`:

```json
{
  "org": "123456789",
  "packet_sha256": "...",
  "review_origin": "normal_assistant_semantic_matching_no_sdk",
  "reviewer": "agent name",
  "complete": true,
  "references": [{"id":"r0","verdict":"eligible","reason":"exact entity, scope and source support","fact_ids":["g0"]}],
  "facts": [{"id":"g0","reference_ids":["r0"],"family":"official_website","fact":"Canonical company-owned website ...","scope":"exact legal entity","original":{"status":"represented","claim_ids":["c0"],"reason":"..."},"fixed":{"status":"missing","claim_ids":[],"reason":"..."}}],
  "fixed_claims": [{"id":"c0","verdict":"supported","entity":"correct","reason":"..."}],
  "limits": []
}
```

Every candidate reference must receive exactly one disposition: `eligible`, `uncertain` or `ineligible`. Eligible references map to one or more fact IDs; other dispositions map to none. Every fixed published external-family claim with `precision_in_scope:true` receives exactly one judgment: `supported`, `ambiguous`, `unsupported` or `source_scoped_absence`; entity is `correct`, `wrong` or `unresolved`.

Facts must be atomized by meaning and deduplicated across URLs/snapshots. A composite reference can map to multiple atomic facts; duplicate references can map to the same fact. Different jobs, dates, services, roles, offices and ownership scopes are different facts. Preserve exact-period/date-role distinctions. Do not count each quotation or paraphrase as another fact. Map `public_profiles` references to `company_owned_profiles`.

For each eligible fact match both outputs with `represented`, `partial`, `missing` or `uncertain`, citing actual claim IDs and a short semantic reason. Merely sharing a word, source, URL host or nonempty field does not establish representation. Partial matches receive no full-fact credit. Assess source/field/entity/scope/temporal correctness of the claim as represented, including qualifiers. Correctly typed postal/contact/venue facts must not become operating offices; store their true scope. A source-scoped NAV zero is not evidence that a company has no vacancies elsewhere. An aggregate count with four links cannot represent every additional identifiable vacancy.

Descriptions must represent substantive actual offerings; ignore navigation, unrelated brand products, project-only copy presented as a whole business, geographic scenery and clipped metadata as full descriptions. Separate open applications, expired adverts and current vacancies. A public outbound social link supports that account relationship, not unseen platform content. Group staff, offices, reviews and offerings do not transfer to the target subsidiary. Historical positive facts can be retained only with their actual date and scope; unresolved currentness stays uncertain.

For zero eligible references preserve an unknown opportunity denominator; do not infer web-wide absence or perfect coverage. Assess any fixed published positive claims separately. The aggregator may produce per-family `.7 company recall + .3 fact recall` only when all 1,000 receipts pass structural admission. Those are assisted readable-subset metrics, never the official pooled score. Structural admission is not a semantic-quality test. Keep all disagreements, unsupported claims, missed facts and source-acquisition gaps inspectable.

The v2 packets also include registered_address, workplaces, registry_activity, registered_purpose and registered_website as crossfield matching context (`precision_in_scope:false`). A fact already correctly represented in one of those claims can be matched by its claim ID; do not invent a miss because it is outside an external extraction field. Their source fidelity was checked separately across all1000, so they do not enter this external-claim precision denominator. Distinguish already-published registered contact from missing postal contact, generic purpose from actual offerings, and a registry website candidate from established ownership. The superseded v1 packet projection omitted this context and is not scoreable.

Calibration during the first receipts (retain these meanings across shards):

- An actual named investment portfolio can describe a holding company's real investment activity at the stated historical period; generic statutory permission to invest cannot. A static ownership snapshot or undated accountant-client relationship is not a dated public event.
- Distinct verified company web properties are separate facts; canonical www/redirect/path aliases are duplicates. An explicit official group-hosted page about the exact legal unit can be eligible with that limited scope, without claiming the unit owns the host or operates all parent services. A subsidiary/tenant/client mention alone is insufficient.
- A correct URL published only as a registry website candidate is partial for the stronger established-official-site relationship. Crossfield matching depends on meaning, not just the presence/name of a field.
- A company developer profile and an app product listing are different objects. Exact developer/provider identity plus an explicit website link can support a developer-declared web-property relationship; unseen destination content remains unknown.
- Explicit no-vacancy statements are not positive hiring-opportunity facts. Published source-scoped negative observations receive their own precision disposition and cannot establish web-wide absence.

The new fixed-claim accuracy fraction is representation-level, conservatively judging compound excerpts as a whole. It must not be called fully atomized official precision. Reference opportunity recall uses explicitly atomized/deduplicated facts. No aggregate is admitted until all1,000 semantic receipts are structurally complete; those checks validate bookkeeping, never semantic truth.

The V2 projection omitted available claims such as `group_structure`. Frozen
`contexts/<org>.json` now supplies every omitted available original/fixed claim,
with stable `x<full-profile-index>` IDs. Packet IDs and hashes remain unchanged.
Reviewers must assess supplemental values for crossfield meaning before asserting
`context_impact_reviewed: true` and the exact `context_sha256` in each receipt.
Existing receipts require an impact review; mechanical copying of attestations is
not admission. Fact matches may cite c or x IDs; precision still covers the seven
external families only. Aggregate metrics remain blocked until all1000 context
impact reviews are admitted. Numerical financial tables can be indexed as off-family
because they were separately verified and do not express external research facts;
full values remain available in immutable sidecars. Leadership, group relationships,
status, dates, names and other meaningful context must be read for relevant overlaps.

For strict `company_owned_profiles` opportunities, a generic group/chain account
linked from a subsidiary/store page is insufficient to establish the exact legal
company's own outward account. Preserve shared-brand channel context separately
unless explicit account-to-target evidence exists. A dedicated authoritative
fund/target page hosted by a registered manager/group can still qualify as an
official representation URL with that narrow scope; this does not transfer generic
group social accounts, operations, offices or events. Exact foreign enterprise
activity for a NUF can qualify when the registered foreign-entity bridge is proven;
it is never automatically a Norwegian-branch acquisition or event.

Final calibration: explicit legal-Organization `sameAs`, or an equivalent exact legal publisher plus a direct business-account declaration, may support the declared account relationship. Neither proves exclusive account control or unseen platform content. The semantic truth judgment and identified source-policy admissibility are separate: a supported statement using prohibited evidence is not a challenge permitted-evidence success. Primary evidence host matters; an ordinary declared destination URL is not copied destination content. Policy corrections preserve before-receipts and a new freeze manifest.

The all1,000 original-vs-V12 comparison is complete with4105eligiblecandidate-poolfacts. Repairs on this cohort are evaluation-assisted development. Source-bound literal proposals must pass production attribution and a second actual-source meaning check; mechanical admission and receipt hashing alone do not establish repaired accuracy.
