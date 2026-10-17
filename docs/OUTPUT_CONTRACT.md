# Minimal output contract

Emit one JSON object per input organisation number.

```json
{
  "organisation_number": "123456789",
  "run": {
    "run_id": "2026-08-24-a",
    "started_at": "2026-08-24T06:00:00Z",
    "completed_at": "2026-08-24T06:00:08Z",
    "terminal_status": "completed"
  },
  "claims": [
    {
      "field": "official_website",
      "value": "https://example.no/",
      "availability": "available",
      "confidence": 0.99,
      "evidence_ids": ["ev-1"]
    }
  ],
  "evidence": [
    {
      "id": "ev-1",
      "source_url": "https://example.no/",
      "source_class": "company_owned",
      "retrieved_at": "2026-08-24T06:00:04Z",
      "content_sha256": "...",
      "claim_span": "Example AS, organisation number 123 456 789"
    }
  ],
  "changes": [],
  "errors": [],
  "operations": {
    "requests": 4,
    "runtime_ms": 8120,
    "third_party_cost_usd": 0
  }
}
```

Allowed availability states are `available`, `not_available`, `blocked`, `not_applicable`, `ambiguous` and `failed`. A checked source that has zero jobs or zero locations is different from a source that was not checked.

## Entry-specific web qualifiers

Available web claims include an `attribution` qualifier describing their identity proof. Hiring claims additionally carry `hiring_kind` and `observed_at`: explicit no-open-roles, open-application policy, dated vacancy, or careers/vacancy information without an established active count. These states prevent a careers page from being represented as a fabricated live-job count. `company_owned_profiles` values are actual account URLs with the company-page link as evidence.

An unresolved web field remains `ambiguous` after a completed search attempt; this is distinct from a source-confirmed negative. A row remains `partial` if any field is unresolved even when registry/financial facts and some web fields are supported. Changing an unknown to `not_available` solely to make the row appear complete is not supported.

## Derived hiring-source checks

A hiring claim may contain a typed NAV query result, including `active_ads_attributed`, bounded ad references, observation interval, catalogue fingerprint, subunit mapping fingerprint, unresolved employer records and source limitations. `nav-feed-index-query/v1` evidence is explicitly a derived receipt, recomputed from the complete hashed catalogue and exact registry IDs. It is not a publisher quotation. An available source check with zero attributed ads is separate from positive vacancies/careers information; `company_wide_absence_established` remains false. The model proposal contract remains extractive strings.
