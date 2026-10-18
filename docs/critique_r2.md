# Review round 2

18 October 2026. This round closes the items left open in `docs/critique_r1.md` and adds the G4 map view. Tests after the changes: 52 pass. Validator: 0 errors, and the same 4 drift warnings as before.

## Items carried over from round 1

| # | Item (round 1) | Outcome |
| --- | --- | --- |
| 12 | Childcare costed at the project average; per-space figure not wired | **Closed.** C1 (CH1) is now costed from the turnkey figure: C$175,400 per space (2023, grade B) ÷ 16 m² per space ÷ (1 + soft cost) ≈ C$8,770/m² hard, before the tall-building premium. The m² per space is a new grade C assumption (`costs.other.childcare_m2_per_space`, range 12–22, editable in Assumptions). The childcare rule now gives the number of spaces and the outdoor play area those spaces need (14 m² each). The result is grade C, and the turnkey figure is not escalated from 2023. |
| — | Supertall premium applied to basements | **Closed.** The tall-building premium now applies only to floors at level 1 and above. Below-grade floors keep the Altus base rate. |
| — | Mechanical floors pay commercial charges | **Decided:** whole floors of plant, refuge or structure (SB2–SB8) use a new charge class, `excluded_mechanical`, with no DCL, Utilities DCL or ACC. Reason: these charges are levied on floor area as the zoning by-law counts it. Such floors are normally excluded from that area, and the FSR check already leaves them out. This is the pack author's reading (grade C); to count them anyway, enter a charge per m² on the programme. Core (SB1), parking, storage and waste stay on the cautious commercial rate. |
| — | O6 has a height premium but no leasing cost | **Closed.** Leasing cost and tenant allowance now list their rows in the pack (`applies_to_rows`: O1, O2, O3, O6). O6 floors pay the 15% leasing cost. They get the tenant allowance when costed on the office shell line (LN5). LN3 and WK5 have their own complete Altus line (university teaching, municipal office), so they get no tenant allowance. |
| — | Older sources dated at collection | **Closed.** Every source tooltip now reads "published ‹source date› · as of ‹collection date›". Sources with no stated date say "published date not stated", and assumptions show "as of" only. The sources table column is now "Published". |
| — | Grades of R1, R4, O1 rest partly on C inputs | **Closed.** New rule: a value row's grade is its weakest *key* input. Selling cost, leakage, deck area and the derivation efficiency are minor inputs; the efficiency cancels out in the engine. The validator now fails any row graded better than its weakest key input. Outcomes below. |

### Row grades

| Row | Before | After | Why |
| --- | --- | --- | --- |
| R1 Market condo | B | **B** | The key input, sale price, is B (broker source). Selling cost is minor. |
| R4 Market rental | B | **C** | The rent ($4.00/ft²/month) is assumed above the observed $3.50, and the operating-cost ratio is assumed. |
| O1 Office AAA/A | B | **C** | The $50 rent is an assumption above CBRE's published $43.26. The rent input is now graded C. The vacancy input went from C to B, because it is CBRE's published trophy figure, rounded. |
| H2 Select-service hotel | B | **C** | Found by the new validator rule: NOI per key and area per key are assumptions. |

## G4 map view

- **What was added:**
  - a Map tab that draws downtown Vancouver from a 1.0 MB subset of a local context model;
  - the subset is made by `scripts/build_basemap.py` and read by `core/basemap.js`;
  - building heights, ground levels and lat/lon show on hover and on click.
- **Credits:** "© OpenStreetMap contributors (ODbL)" and the NASA SRTM credit are shown under the map, and stored in the manifest.
- **Neighbouring roofs:**
  - click a point to see the tallest, 90th-percentile and median roof within a radius you set;
  - each is given as the building's own height and as its roof level above the ground at the point;
  - one button copies the value into the condo "above neighbours" setting (grade C).
- **Neutral:** no site is marked; the competition site is hypothetical. Your study point stays in your browser and is not exported.
- **Tests:**
  - size under 15 MB;
  - both credits present;
  - every building closed, with a height and a known source;
  - point-in-footprint and ground lookup work;
  - neighbour statistics on real and hand-made maps;
  - the lat/lon anchor is right.
- **Checked in a browser** (served locally): light and dark themes, phone width (no sideways scroll), no console errors, and the button changes the setting.

## Deferred

| Item | Why it waits |
| --- | --- |
| Turnkey childcare figure escalated from 2023 to 2026 | Needs a construction-cost index choice. It is shown as 2023 in the note. |
| Check the childcare m² per space against the City guideline text | Done as a grade C assumption. Look it up at G5 (source review). |
| Mechanical-floor charge reading | Needs a City or DCL by-law citation to move above grade C (G5). |
| Map: draw the scheme's footprint and a 3D view | Out of scope for a lightweight G4. The map is plan-only. |
| Map: verify heights of the tallest neighbours | 30% of downtown heights are estimated by type. A G5 reviewer should spot-check the towers that set the bonus. |
| Publishing the map on claude.ai | The page must publish `basemap/vancouver_downtown.json` and `.bin` with it as supporting files. Until they are published, the Map tab says it could not load the base map, and the rest of the page still works. |
