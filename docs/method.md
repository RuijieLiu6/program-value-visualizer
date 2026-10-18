# Method

Program Value Visualizer turns a floor-by-floor programme mix into an indicative early-design estimate. It is not a feasibility study, appraisal or compliance check. All maths is in `core/econ_core.js`. The tests in `tests/` check every step.

## Steps for each programme on each floor

1. **Area.**
   - Gross input: GFA = plate × share, and net = GFA × efficiency.
   - Net input: GFA = net ÷ efficiency.
   - Office and residential rows use the height-band efficiency curve in `assumptions.json`. Other rows use the efficiency their value was derived with.
2. **Value.**
   - Net area × value per net m² × height premium × retail floor factor.
   - Value per net m² is the pack's value per m² GFA divided by the row's derivation efficiency.
   - The height premium is linear per floor above the podium top. Condos can add a bonus above neighbouring roofs.
   - Office-type value (O1, O2, O3, O6) is net of leasing costs (15%).
   - A ticketed deck is one total (visitors × ticket × (1 + F&B) × margin ÷ cap rate), spread over the deck area you draw.
3. **Cost.**
   - Hard cost:
     - the Altus 2026 Vancouver rate, + the tall-building premium (above 250 m, on the Altus base rate only, floors at level 1 and above);
     - + the tenant allowance on office-type shells (O1, O2, O3, and O6 when it is costed on the office shell line);
     - childcare (C1) has no Altus line: turnkey cost per space ÷ m² per space ÷ (1 + soft cost), grade C;
     - + luxury hotel FF&E per key.
   - Uses with no published line are costed at the floor average, then the project average, and flagged.
   - Soft cost = share of hard cost. Finance = rate × years × share borrowed × (hard + soft).
   - City charges = (DCL + Utilities DCL + ACC) × GFA by charge class, at the permit date, rising 3% a year to 2029. Whole floors of plant, refuge or structure (SB2–SB8) pay none, because they are normally excluded from counted floor area (grade C). Core, parking and storage stay on the cautious commercial rate.
4. **Public running cost.** Yearly cost of public floors ÷ 5%. It is subtracted from value unless the City or a partner pays. With a CAC endowment, the CAC covers it first.
5. **Profit** = 15% of total cost (the City's own benchmark).
6. **Residual land value before CAC** = value − public deduction − cost − profit.
7. **CAC** = share × (residual before CAC − land value under current zoning), not below zero. It is zero for a 100% employment rezoning.
8. **Residual land value after CAC** = step 6 − CAC.

## Verdict

| Verdict | When |
| --- | --- |
| Incomplete | No floor area, nothing priced, or an unknown programme id |
| Land price needed | No land price entered and the residual after CAC is positive; the tool shows the land budget |
| Works | Residual after CAC ≥ land price at ≥ 15% profit, and the scheme does not rely on condo presales in a weak market |
| Marginal | Within 10% of the land price, or 10–15% profit, or it relies on presales in a weak market |
| Doesn't work | Anything worse, including a negative residual even with free land |

## Test T1: hand-worked two-floor check (pinned inputs)

Each line rounds its own result; the next line uses the unrounded figure.

**Condo floor 50, 700 m² plate.**
- Net = 700 × 0.78 = 546 m².
- Value = 546 × C$15,069.6 (C$1,400/ft²) × 1.294 (+0.7% × 42 floors above a podium top at floor 8) × 0.95 = **C$10.11 M**.
- Hard = 700 × 4,600 × 1.15 = C$3.70 M. Soft = 25% = C$0.93 M. Finance = 20% of (hard + soft) = C$0.93 M. Charges = 700 × 460 = C$0.32 M. Cost = **C$5.88 M**.
- Profit 15% = C$0.88 M. **Left for land and CAC ≈ +C$3.36 M.**

**Office floor 20, 2,300 m² plate.**
- Net = 2,300 × 0.76 = 1,748 m².
- Value = 1,748 × C$538.2 (C$50/ft²) × 0.85 ÷ 0.054 × 1.024 (+0.2% × 12 floors) × 0.85 (leasing) = **C$12.89 M**.
- Hard = 2,300 × (4,465 × 1.15 + 860) = C$13.79 M. Soft C$3.45 M; finance C$3.45 M; charges 2,300 × 315 = C$0.72 M. Cost = **C$21.41 M**.
- Profit C$3.21 M. **Left for land and CAC ≈ −C$11.73 M.**

The test pins efficiency at 0.76. The engine's own curve gives 0.80 for floors 1–20, so the live tool shows slightly higher office value at that height.

## Grades and typical estimates

Each value row is graded by its weakest *key* input (A best, C weakest). Selling cost, leakage, deck area and the derivation efficiency are minor inputs and do not set the grade; the efficiency cancels out in the engine. `node core/validate_data.js` fails a row graded better than that.

## Neighbouring roofs (Map tab)

- Neighbours are the buildings whose footprint centroid is within the radius of the study point; a building on the point is left out.
- The value offered for the condo bonus is the tallest neighbour's roof level above the ground at the point: neighbour ground + neighbour height − ground here.
- Sources: OpenStreetMap heights (measured, from floor count, or estimated by type) and SRTM ground.
- Grade C. Details are in `basemap/README.md`.

**Typical estimates.** Uses with no published Vancouver figure get a typical value (`value_basis: "typical"`). Some uses also get a typical hard cost per m² (`typ_*` lines). Each one:
- comes from a similar use, or from a quick 2025–26 search;
- is always grade C, with a range;
- is marked "typical estimate" in the page;
- is listed in an info rule whenever the scheme uses it.

A value the user types replaces it (`valueBasis: "user"`).
