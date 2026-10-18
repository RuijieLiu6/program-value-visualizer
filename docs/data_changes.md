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

## 6. Round 2 changes (18 October 2026)

| File | Change |
| --- | --- |
| `costs.json` | `childcare_m2_per_space` added: 16 m², grade C, range 12–22. `childcare_turnkey_per_space` now applies to row C1. `office_leasing_cost` and `office_tenant_allowance` list the rows they apply to (O1, O2, O3, O6). |
| `charges.json` | New class `excluded_mechanical`: no DCL, Utilities DCL or ACC (grade C reading). |
| `programmes.json` | SB2–SB8 (mechanical, refuge, belt, transfer, damper, break tank, roof plant) use `excluded_mechanical`. |
| `values.json` | R4, O1 and H2 value grades B → C (weakest key input). O1 rent input B → C, O1 vacancy input C → B. Grade notes added to R1, R4, O1 and H2. |
| `basemap/` | New: downtown Vancouver base map (OpenStreetMap, NASA SRTM). See `basemap/README.md`. |

Values themselves did not change. The modelled results change only through the engine rules listed in `docs/critique_r2.md`.

## 7. Typical estimates (18 October 2026)

Every programme now has a number, so users do not need to know prices.
- Programmes that had no value (status `new`, 32, or `excluded`, 1) now link to their own value row, named after the programme with `t` added (for example `MP1t`).
- Rows R3, R8, R9, O4, A5, H4 and H5 changed from `user` to a priced method.
- Each of these is `value_basis: "typical"`: grade C, a note naming the analogy or search result, and a range.
- All original rows are `value_basis: "sourced"`.
- Where Altus has no line, `costs.json` `typical_lines` adds a grade C hard cost per m² (`typ_*`). Rows A1, A2, A4, C4 and C5 now also map to a cost line.
- The validator fails any programme that does not resolve to a value, and any typical value or line that is not grade C with a note.

| Row | Use | C$/m² GFA | Basis |
| --- | --- | --- | --- |
| R3 | Branded residence (hotel-serviced) | 14,700 | Analogy: market condo (R1) + 30% brand premium. Premiums are global averages; Vancouver evidence is thin. |
| R8 | Seniors / assisted living | 6,200 | Operated like a hotel: high fees, high care costs (65% of revenue). |
| R9 | Co-living / micro units | 7,300 | Analogy: market rental (R4) with higher rent per ft2, more shared space and higher running costs. |
| H4 | Conference, ballroom, meeting rooms | 2,200 | Hotel conference space often just supports room income. Event venue (A4) is 6,000 for comparison. |
| H5 | Spa and hotel wellness | 4,800 | Analogy: leased wellness space, between fitness (MP1) and clinic (O5). |
| O4 | Lab / life-science office | 6,200 | Analogy: Class A office with a lab rent premium and a higher cap rate. |
| A5 | Gallery / museum / cultural venue | 0 | Usually a cultural amenity run by a non-profit: no income to the owner, cost only. Enter a value if a paying operator leases it. |
| MP1t | Fitness club / gym | 4,100 | Lease like the medical clinic row (O5) but at a fitness operator's lower rent. |
| MP4t | Sky sports court | 2,300 | Large low-rent area leased to a sports operator. |
| MP5t | Climbing / bouldering wall | 2,600 | Leased to a climbing-gym operator; low rent per ft2 on a tall volume. |
| MP7t | Dance, yoga, martial-arts studios | 3,600 | Small studio tenants; rent a little below fitness clubs. |
| MP8t | Small ice rink / skate deck | 1,300 | Seasonal operation with modest income; rent-equivalent of the operator's surplus. |
| MP9t | Indoor kids' play / family centre | 3,000 | Leased to a family-entertainment operator. |
| GP1t | Theatre / concert hall | 0 | Usually a cultural amenity run by a non-profit: no income to the owner, cost only. Enter a value if a commercial operator pays rent. |
| GP3t | Cinema | 3,200 | Leased to a cinema chain like a large retail tenant above grade. |
| GP9t | Esports / gaming arena | 2,400 | Young market: leased to an operator with higher vacancy risk. |
| LE4t | Edge walk / glass floor / sky bridge | 9,700 | Small, high-ticket attraction: about $100 a year of operator surplus per ft2. Very uncertain; works only with a deck that draws visitors. |
| LE5t | Immersive / digital attraction | 3,500 | Leased to an attraction operator (dark floor, no daylight needed). |
| LE6t | Planetarium / observatory | 0 | Usually a science or cultural amenity: no income to the owner, cost only. |
| SE6t | Night market / pop-up flex hall | 2,500 | Like a food hall (T3) but let part-time: 25% of the year empty. |
| AM11t | Drone / parcel landing pad | 0 | No established market: treated as a building service with no income. |
| AM12t | Fire hall / ambulance station | 0 | Delivered to the City as an in-kind amenity: no income to the owner, cost only. |
| MK1t | Artist studios | 2,100 | Below-market studio rent, a little under industrial rents. |
| MK2t | Maker space / fab lab | 2,800 | Analogy: industrial-flex space at the regional industrial rent. |
| MK3t | Stacked light industrial / production | 4,200 | Analogy: new industrial space at the regional rent and cap rate. |
| MK4t | Film / TV sound stage or LED volume | 4,000 | Leased to a studio operator; needs clear height and acoustic isolation. |
| MK5t | Recording and media studios | 4,300 | Small acoustic suites leased to media tenants. |
| MK6t | Commercial / community kitchen | 3,700 | Leased like a restaurant (T4) above grade, without street exposure. |
| MK7t | Edge data room | 5,600 | Powered space at a premium rent; much floor goes to cooling and power rooms. |
| LN1t | Elementary school | 0 | Public school space is usually delivered in-kind or sold to the school board at about cost: no profit, cost only. Enter a purchase price if one is agreed. |
| LN2t | Secondary school / college | 0 | Public school or college space: usually delivered in-kind or sold at about cost. Enter a value if a private college leases it (compare O6). |
| CH3t | Urgent care / day surgery | 6,600 | Analogy: medical clinic (O5) with a higher rent for surgical fit-out. |
| CH5t | Long-term care | 3,000 | Mostly provincially funded beds: thin margin, so low value per m2. |
| CH6t | Vertical hospital wing | 0 | A health-authority facility: delivered in-kind or sold at about cost. No income to the owner, cost only. |
| GS3t | Urban farm / hydroponic floor | 1,400 | Leased to a growing operator at a low rent; needs water and floor loading. |
| GS4t | Greenhouse crown | 1,400 | Leased glasshouse (growing, events or garden visits) at a low rent. |
| GS7t | Wind turbines / solar crown | 0 | Energy savings are not counted as value here: treated as building plant. |
| ST4t | Hostel / budget stay | 6,700 | Budget hotel: about $160 a room night across private rooms and dorms, 30% NOI margin. |
| ST5t | Artist or researcher residency | 4,500 | Analogy: student housing (R7) at a lower, subsidised rent. |
| RR4t | Columbarium / memorial floor | 6,000 | Niches sold over many years: high value per m2 but slow and uncertain. |

| Typical cost line | C$/m² | Basis |
| --- | --- | --- |
| typ_specialty_attraction (Specialty attraction structure (glass floor, cantilever, sky bridge)) | 12,000 | No Altus line. Set a little above the Altus performing-arts line (11,520) for structural glass and cantilevers. |
| typ_roof_pad (Rooftop landing pad and its structure) | 4,000 | No Altus line. Structural deck, edge protection and services on a roof. |
| typ_heavy_floor (Stacked industrial floor (heavy loads, freight lift)) | 5,000 | No Altus line. Office shell (4,465) plus about 10% for heavier floors and freight lifts. |
| typ_sound_stage (Sound stage / LED volume) | 7,500 | No Altus line. Clear span, double height, acoustic isolation and heavy power. |
| typ_acoustic_suite (Acoustic studio suites) | 7,000 | No Altus line. Office shell plus room-in-room acoustic construction. |
| typ_data_room (Edge data room (power and cooling)) | 15,000 | No Altus line. Power, cooling and backup per m2 of floor; varies widely with power density. |
| typ_hospital (Hospital wing) | 14,000 | No Altus line in this pack. Set above the Altus complex-care (5,545) and university-lab (12,515) lines. |
| typ_glass_crown (Greenhouse / glass crown) | 9,000 | No Altus line. Glazed roof structure with growing services. |
| typ_energy_crown (Wind turbine / solar crown) | 6,000 | No Altus line. Structure and equipment for a turbine or solar crown, per m2 of crown floor. |
| typ_observation_deck (Observation deck (glazed, high-traffic)) | 10,000 | No Altus line. Near the Altus museum/gallery line (9,445), plus glazing and visitor lifts at height. |
| typ_transit_concourse (Transit concourse / station link) | 8,000 | No Altus line. Public circulation built to transit standards (finishes, wayfinding, fire separation). |

New sources (all `summary`, read as search results on 18 Oct 2026):
- Knight Frank branded-residence premium, about 30% (secondary coverage, global);
- liv.rent micro-suite listing, $1,180/month for 200 ft²;
- CBRE Vancouver industrial Q2 2026, $19.14/ft²;
- Lee & Associates Vancouver industrial Q2 2026, 4.40% cap rate.

Searches found no 2026 Vancouver figure for lab rents, seniors housing fees or seniors cap rates. Those rows use analogies, and their notes say so.
