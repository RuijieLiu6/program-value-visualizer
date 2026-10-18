# Review round 1

18 October 2026. One independent reviewer, with no prior context, ran the tests and read the engine, data and page. It ranked findings BLOCKER / MAJOR / MINOR. Outcomes below. Tests after fixes: 34 pass, validator 0 errors.

| # | Rank | Finding | Outcome |
| --- | --- | --- | --- |
| 1 | BLOCKER | Imported project JSON could inject script through floor levels drawn into the section | **Fixed.** One validator (`normaliseFloors`) for CSV, JSON and saved state; SVG values escaped; the import is checked in full before anything changes. Tested with a hostile file: rejected, no script ran. |
| 2 | BLOCKER | An empty or unpriced building returned “Works” | **Fixed.** New verdict “Incomplete”; every averaged cost is flagged. |
| 3 | MAJOR | “Works” with no land price (compared with zero) | **Fixed.** “Land price needed” shows the land budget; a negative residual says “even with free land”. |
| 4 | MAJOR | Private lobbies, bike rooms and loading were counted as public floors | **Fixed.** Now support space. |
| 5 | MAJOR | Deck value was fixed per m², so value grew with deck area at constant visitors | **Fixed.** One total spread over the deck area drawn, with a fragility note. |
| 6 | MAJOR | A typed “value per m² GFA” came back changed by the curve, premium and leasing | **Clarified.** The field label states it is before the height premium and office leasing costs. |
| 7 | MAJOR | AI tools and number fields accepted NaN, negatives and out-of-range values | **Fixed.** Range and enum checks on every setting; shares must be ≥ 0; values must be finite and ≥ 0. |
| 8 | MAJOR | Import edge cases: percent shares, blank cells, quoted cells, partial state on error | **Fixed.** Percentages convert; blanks and short rows give readable errors; nothing changes until the file passes. |
| 9 | MAJOR | 3%/yr charge escalation was never applied | **Fixed.** Applied from 2026 to 2029 (toggle in Assumptions). The base year is the pack author's reading (grade C). |
| 10 | MAJOR | The FSR check was optimistic (gross plates, parking counted) | **Fixed.** Parking, storage and waste are excluded; a pass within 10% shows as provisional, with a note. |
| 11 | MAJOR | Office defaults lean optimistic; O2's source is unresolved | **Partly.** O2 downgraded to grade C. O1 kept as published (new trophy floor); its range already shows 5,700 at the Class A average rent. |
| 12 | MAJOR | Childcare and other unlisted uses were costed at the project average | **Flagged.** A cost-estimated warning names each one; the per-space childcare figure is still not wired up (open). |
| — | MINOR | Sensitivity replaced user value overrides; hard-coded constants | **Fixed.** Overrides are multiplied; constants are read from the pack. |
| — | MINOR | Undo missed brief changes; stale mix after undo | **Fixed.** |
| — | MINOR | CSV export could not be re-imported; no label on JSON | **Fixed.** Area columns added; label in both. |
| — | MINOR | Land hint used GFA including basements | **Fixed.** Above-grade only. |
| — | MINOR | Local launch file tracked; wording pointing at one author | **Fixed.** Untracked; wording made neutral. |
| — | MINOR | Supertall premium applied to basements; mechanical floors pay commercial charges; O6 premium without leasing | Open. Noted for the next round. |
| — | MINOR | Grades of R1, R4 and O1 rest partly on C inputs; older sources dated at collection | Open. Show each source's own date (next round). |
