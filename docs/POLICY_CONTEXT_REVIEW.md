# Source-context review of policy changes

This review covers all **74 diagnostic claims** selected from the original 531 external string claims: all 29 rejected by the baseline current-policy probe, plus all 45 accepted claims whose earlier assisted verdict was unsupported or ambiguous. It reviews saved full source context, identity records and exact quotes. Earlier model labels are hypotheses; they are not official or human gold. Original run data was opened read-only. No external keys or new paid services were used.

The case-by-case artifact is [policy-context-review.json](../out/semantic-verification/policy-context-review.json). Every row retains its original claim ID/value/quote/source URL and adds a disposition, explanation, full-context artifact path and SHA-256, and latest-source rebinding result where available. All 74 rows have explicit outcomes; uncertainty is retained rather than converted to a supported verdict.

## Formerly supported claims rejected by the probe

The 13 losses have four distinct explanations:

| Claims | Companies | Source-context conclusion |
| --- | --- | --- |
| 7 | Espevik999589952 (2); NIF947975072; REISEbazaar994868160; Tiger935183286; Elektro1624/Skilbredd832863432 (2) | Exact value survives in the latest canonical source. A read-only rebind probe passes all seven. These are source-version regressions, not unsupported facts. |
| 2 | Grønsand997438116 website and Facebook | Proper corrections. Current source identifies a different operator. The earlier supported labels were wrong; brand/address similarity must not restore them. |
| 2 | ABCFysioterapi912889963 and SentrumFysioterapiVoss920297455 contact addresses | Retain explicit third-party contact records with publisher attribution and unresolved operating-location status. Rejecting directory ownership is correct; discarding identity-bound contact facts loses legitimate coverage. |
| 2 | Privatfly986556761 description and website | Registry-listed host, exact-org seller terms and official historical legal name establish the same entity. Historical copyright wording is being mistaken for another operator. Rebinding alone resolves only the stale source gate. |

Privatfly's current registered legal name is PRIVATFLY NO OLIMB DA. Registry historical names include PRIVATFLY NO OLIMB OG BRODERSEN DA (2004–2021). Saved `/salgsbetingelser/` names the current seller and exact organisation number986556761. Its ©2015 footer uses the former Olimb/Brodersen name. This is corroborated historical identity, not comparable to Grønsand's positively different current operator. The description comes from a dated2023 self-report and includes a promotional “leading” assertion: retain its time and attributed nature. The old Bygdøyallé seller address must not become a fresh operating-office claim against the current Årvollveien registered address.

## Accepted claims earlier labelled unsupported

Of these 17 claims, **six have meaningful scope corrections**: postal contact (Trolladalen and PB12), care-of address (Moafjæra), service areas (Norge/Sverige and Andersen&Knoph municipalities), and event venue (QualityHotelMaritim). The new non-operating-location qualifiers make the underlying facts useful without inventing physical offices. These cannot all receive operating-location recall credit.

**Ten description claims still need extraction/field corrections**, even when some words are true. They include two ArcticQuest descriptions and two Eierskifte descriptions. Truncated metadata, project/menu inventories and an event description are passing lexical verification as business descriptions. Full source bodies contain better subject statements for Vegglifjell, SenjaMontessoriskole, SmartOrg, Braafjord, HafslundBilservice, ArcticQuest and Andersen&Knoph. An Eierskiftedagene2026 course belongs in activities with its actual event date. Metadata publication dates from unrelated page objects must not date the event. These defects should be fixed by re-extracting complete, relevant source spans, not by declaring the old spans good because they are literal substrings.

The remaining accepted claim is an **ownership error**: GaweMedisinskeKlinikk912973808 was assigned `https://novelaklinikken.no/klinikk/gawe-medisinske-klinikk/` as its official website. Novelaklinikken describes its profiles as collaborating salons/clinics and satellites. The specific profile names Gawe and matches its registered Drotningsvikveien132/5179Godvik address, so secondary contact/description is supportable. A generic `klinikk` match inside `novelaklinikken` does not establish ownership.

## General binding changes supported by the evidence

1. **Rebind surviving evidence without discarding history.** Canonical source replacement should map an old exact fact to the current readable snapshot when it actually survives. Preserve old snapshot provenance and record the new evidence span; do not assert freshness solely from text survival.
2. **Separate ownership from record subject.** An explicitly headed external record with the full legal name or exact organisation number, plus matching registered street/locality, may support a typed `third_party_contact` fact. Its publisher remains external. Set `operating_location_established=false` until independently established. Record whether it is unclaimed, source-reported or municipal. Never promote that page/host to `official_website` or `company_owned_profile` from subject binding alone.
3. **Use narrow subject sections.** ABC's unclaimed listing explicitly asks the reader to confirm the visiting address. Voss municipality independently lists SentrumFysioterapi at the same registered address within its private-institutes section. The clinic section can support the contact fact; publisher footer, other listed clinics and municipal address cannot.
4. **Require distinctive ownership evidence.** Generic words such as clinic/klinikk/medical/studio cannot alone establish brand ownership from host overlap. A collaborating-partner profile can support its named subject without transferring partner-network services or host ownership.
5. **Permit corroborated historical legal identity.** Current exact-org seller/owner text plus registry-listed host and official historical legal name can explain a legacy copyright. A differing current exact organisation number remains stronger negative evidence. Brand continuity alone does not merge distinct operators.
6. **Normalize labelled Norwegian organisation numbers consistently.** TKGruppen target918276157 is accepted even though preserved `/brukervilkar` explicitly says the website owner is TKGruppenAS, organisation number **NO987747897MVA**. The parser misses optional `NO` after the label. The rule must recognize it and preserve the conflict. No refetch is needed: the stored terms also restrict unauthorized automated collection.

## Accepted ambiguous claims: concrete remaining issues

All 28 rows are individually documented in the artifact. They are not automatically false:

- Eight descriptions contain business/brand history preceding current incorporation. Keep self-reported brand history separate from legal formation; do not reject real offerings or independently assert promotional rankings. This covers Daia, Belships, Surfd, MagnarLarsen, Storo (three descriptions) and Joymo. Repeated descriptions are not additional recall facts.
- NAVIC general offerings need the named Norwegian engineering entity's scope; FarvatnVenture offerings name a separate legal affiliate; SafeBemanning's branches page is a shared-brand page, not sufficient ownership proof for SAFE BEMANNING BYGG AS.
- Eivindvik's six claims need per-activity legal-operator resolution. The property entity has registered1084; the brand site reports1082 and explicitly says EivindvikBryggeHandleriAS takes over retail from2026. This is concrete evidence against treating all brand operations as the property's own. It does not prove every site fact false.
- Sommerfelt contact-page claim **Nansetgata98** conflicts with the exact-org contact block **89**, the dedicated service-centre's explicit visiting invitation at89, and registry89. Prefer89, retain source conflict. MagnarLarsen's footer3740 conflicts with dedicated `BESØKSADRESSE`3734 and registry3734; prefer the scoped contact record. Proteket's lab detail0485 conflicts with its own contact JSON-LD0484 and registry0484; preserve the uncertainty.
- NordTaksering claims presence in five cities but the same paragraph says its employees are all co-located. Do not infer five staffed offices. SagaRobotics' foreign office contacts are explicit on the exact-org site but do not prove which legal entity employs/operates each foreign site.
- BilDirekte old contact metadata conflicts with registry and the home page reports transfer of its moped-car business to Mopedbilnorge. Joymo policy's old registered-office address conflicts with the current registry. Retain provenance/date rather than silently declaring current operating sites.
- Caplist's capability statement appears alongside a prominent2026 NexusConnect acquisition/customer-migration notice. Its offering needs transition/historical context. Autopro's hiring passage is real but undated: careers/vacancy information is defensible, currently-open position count is not established.

This diagnostic is not a new full1,000-company precision/recall score. It identifies policy regressions, corrected scope and residual errors in the exact original corpus. Source-backed assistance does not replace independent official/human gold, and absence of a claim is not evidence that the fact is absent.
