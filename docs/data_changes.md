# Data cross-check and change log

17 October 2026. Every figure in the Vancouver 2026 pack that can be checked against a report on file was read on the page given. The checks were done on text extracted from the PDFs, and the hotel cap-rate chart was also checked by eye. Sources are listed in `packs/vancouver-2026/sources.json`.

## 1. Checked against the reports

### Altus Group, 2026 Canadian Cost Guide (costs as at 31 Jan 2026, p.4)

All 31 Vancouver lines in `costs.json` match the report: private sector p.5, public sector p.6. C$/m² = C$/ft² × 10.764, rounded to the nearest 10. The validator re-checks every conversion.

Lines added from the report that the earlier cost table did not use: secondary school, budget hotel, ice arena, municipal office, independent/supportive living, office Class A 5–30 storeys, office fit-out Class B.

Scope notes taken from the report and shown in the tool:
- above-grade work including foundations; below-grade work is priced with the parking line (p.7);
- excludes site development and unique-architecture premiums (p.12);
- excludes VAT and tariff impacts;
- zoning floor area can understate cost by up to 12% (p.9).

### CBRE, Figures | Canada Office | Q3 2026

| Figure | Pack value | Report | Page | Result |
| --- | --- | --- | --- | --- |
| Downtown overall vacancy | 13.1% | 13.1% | 10, 13 | Match |
| Downtown trophy vacancy | 10.5% | 10.5% | 10, 13 | Match |
| Downtown Class A vacancy | 9.8% | 9.8% | 10, 13 | Match |
| Downtown Class B/C vacancy | 18.0% (used as O2 vacancy) | 18.0% | 10, 13 | Match |
| Downtown Class A net rent | $43.26/ft² | $43.26/ft² | 10, 13 | Match |
| "Highest in over 22 years" | note | stated | 13 | Match |
| Downtown under construction | none | 0 ft² | 13 | Match |

### Cushman & Wakefield, Canada Hospitality Innsights Q2 2026

| Figure | Pack value | Report | Page | Result |
| --- | --- | --- | --- | --- |
| Vancouver full-service downtown cap rate | 5.00–6.50% (H1 uses 5.75%) | 5.00–6.50% | 10 (chart, checked by eye) | Match |
| Vancouver select-service cap rate | 6.00–7.50% (H2, H3 use 7.0%) | 6.00–7.50% | 10 | Match |
| Luxury ADR growth, national, H1 2026 | note | +9.0% | 1 | Match |
| Hotel pipeline | note | about 48,000 rooms, up about 10% (CoStar) | 1 | Match |
| Income generally supports development costs | note | stated | 1 | Match |
| Vancouver ADR level | $284 (H2) | **not given**; only ADR growth of about 8–10% in H1 2026 | 4–5 | Not checkable here; see §3 |

### Vancouver Tall Challenge brief (Buildner)

| Figure | Pack value | Brief | Page | Result |
| --- | --- | --- | --- | --- |
| Site | about 79.2 × 144.8 m = 11,468 m² | "approximately 79.2 m × 144.8 m" | 15 | Match |
| Tower height | 244–305 m | "within the 244–305 m range" | 19 | Match |
| Non-residential minimum | 9.0 FSR | "minimum of 9.0 FSR of non-residential, high-employment floor area" | 19 | Match |
| Overall FSR | no cap | "no overall FSR (FAR) limit" | 19 | Match |
| Land price | none | hypothetical site; no price given | 15 | Land is a user input |
| Hotel classification | reported both ways | not stated in the brief | — | Grade C until a City source is cited |

## 2. Defaults that do not follow from their own inputs

The validator recomputes each value row from the market inputs stored with it. These four differ by more than 5%. The defaults were **kept as published** and flagged for correction at the source. Users see the warning in the tool.

| Row | Default (C$/m² GFA) | From its inputs | Difference | Likely reason |
| --- | --- | --- | --- | --- |
| H1 Luxury hotel | 10,000 | 11,542 | +15% | Default set conservatively inside the 7,000–12,000 range |
| O5 Medical clinic | 6,000 | 6,739 | +12% | A vacancy allowance (about 10%) seems to have been applied but not recorded |
| O6 Education / institute | 5,500 | 6,106 | +11% | Same as O5 |
| A3 Sky restaurant | 9,000 | 8,446 | −6% | Rounded up |

## 3. Figures with no report on file (weaker evidence)

- **CBRE Q2 2026 cap rates** (office, multifamily, retail; used in R4, R5, O1, O2, T1). The report was read online when the pack was compiled; there is no local copy to re-check.
- **Vancouver hotel ADR $284 and occupancy 78.4%** (CoStar 2025, from a search summary). C&W shows Vancouver ADR up about 8–10% in H1 2026, so the 2026 figure may be higher.
- **O2 Class B office rent ($28/ft²)**: the source list cites "Cresa Q1 2026", but the link points to a Cresa *industrial* report. **Unresolved: find the right source before relying on O2.**
- Condo prices, rents and retail rents come from broker and news pages read as search summaries. Retail figures date from 2022–2024.

## 4. Known inconsistencies

- **Efficiency.** The height-band curve gives office floors 1–20 an efficiency of 0.80, but the hand-worked check (test T1) used 0.76. The engine uses the curve; the acceptance test pins 0.76 so the published numbers reproduce.
- **Two efficiency figures per row.** Value rows store the efficiency used to derive their published value. The engine applies the height curve to office and residential rows instead, so their values per m² GFA change with height, as intended.
- **Deck ticket.** A1 assumes $45 per visitor; the Vancouver Lookout adult ticket is about $20. Deck value is a ceiling, not a central estimate.

## 5. Open data gaps (shown in the tool as "user to supply")

Luxury hotel ADR; deck visitor numbers; supertall cost premium; Metro Vancouver and TransLink charges; DCL treatment of social, civic and parking area; efficiency curve vs CTBUH data; land price; values for branded residences, seniors housing, co-living, labs, galleries, conference space and hotel spa; downtown monthly parking rates; public floor running cost per m².
