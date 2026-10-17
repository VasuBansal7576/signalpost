# Financial normalization

`src/financials.ts` maps Brreg key figures into a deterministic `financials.records` collection. It processes every returned record, validates the organisation number, sorts by reporting period, and retains original record IDs and evidence references.

| Normalized metric | Registry JSON path |
|---|---|
| revenue | resultatregnskapResultat.driftsresultat.driftsinntekter.sumDriftsinntekter |
| operating_result | resultatregnskapResultat.driftsresultat.driftsresultat |
| profit_before_tax | resultatregnskapResultat.ordinaertResultatFoerSkattekostnad |
| annual_result | resultatregnskapResultat.aarsresultat |
| assets | eiendeler.sumEiendeler |
| equity | egenkapitalGjeld.egenkapital.sumEgenkapital |
| liabilities | egenkapitalGjeld.gjeldOversikt.sumGjeld |

`SELSKAP` records are individual-company statements; `KONSERN` records are consolidated group statements. Unknown types remain explicit and are excluded from convenience metrics. A group statement never substitutes for a missing company statement. The latest valid reporting period is selected independently for each scope; conflicting records in that period produce `ambiguous` convenience values instead of an arbitrary revision choice.

Every metric carries amount, availability, and source path. Convenience claims additionally carry currency, period start/end, scope, record ID and unit. Amounts retain reported currency units. There is no currency conversion, thousands multiplier, inferred missing line, or calculation of missing profit. A reported zero is a value; an absent or invalid line is not converted to zero. Negative amounts remain negative. Numeric strings are accepted only in unambiguous decimal form and within JavaScript's safe numeric range.

A balance cross-check compares reported assets with reported equity plus liabilities. Mismatches are disclosed; source amounts are preserved. This check is not a financial-statement audit and does not rewrite the register. Invalid dates, missing currency and wrong-entity records stay visible as warnings/abstentions.

`financial_history` lists available annual-report years and document URLs, paced below 30 request starts/minute. PDF contents are not inferred from the existence of a link. The UI supports company/group scope, period selection, side-by-side company comparisons, and the original financial-record excerpt.

Related current official sources: https://github.com/brreg/regnskapsregister-api and https://data.brreg.no/ . These are registry key figures and source-preserving transformations, not financial advice.
