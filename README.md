# Program Value Visualizer

A free browser tool for early tall-building design in Vancouver. You set which programmes (uses) sit on each floor and what share of the plate each takes. The tool estimates what each floor is worth and what it costs, adds City charges and a normal developer profit, and answers one question:

> After paying for construction, City charges and a normal developer profit, is there enough money left to pay for the land?

It gives a verdict (**Works / Marginal / Doesn't work**), shows which floors create value and which need support from others, and shows separately what the City receives.

**Every number is an indicative early-design estimate.** It is not a feasibility study, an appraisal or a compliance check, and the tool says so on every screen and export.

Status: **G0, set-up only.** Nothing is built yet. See [Roadmap](#roadmap).

---

## Who it is for

- Teams entering design competitions for tall buildings in Vancouver.
- Architecture students working on tall buildings.
- Vancouver practices testing early high-rise options.

No account and no install: it runs as a static web page (静态网页) in a browser.

## Principles

1. **Every default has a source.** Each number carries its source, date and grade:
   - **A**: primary or professional 2025–26 source;
   - **B**: secondary or older source;
   - **C**: arithmetic or assumption.

   You can overwrite any value. Hover over a value to see where it comes from.
2. **Neutral.** The tool has no preferred design. Defaults are a plain sample tower and published market data. Your inputs stay in your browser; nothing is uploaded.
3. **Transparent method.** The calculation is a set of pure functions (纯函数) with tests, documented in `docs/method.md`, and can be checked by hand.
4. **Honest about gaps.** Values nobody has sourced yet are shown as "user to supply", never guessed.

## How the calculation works (summary)

For each floor and each programme on it:

1. **Area.** GFA = plate × share. Net area = GFA × efficiency (实用率) for that height band. Skipped when the input is already net.
2. **Value.**
   - Uses that are sold: net × price × height premium × (1 − selling cost).
   - Uses that are rented or operated: net × net operating income ÷ cap rate (资本化率) × height premium.
3. **Cost.** Hard cost (by programme, from a published cost guide) + tall-building premium + soft costs + financing + City charges + leasing and fit-out where relevant.
4. **Public running cost.** Yearly cost of free public floors, turned into a capital sum, unless someone else pays.
5. **Profit.** Developer profit as a share of cost.
6. **Residual land value** (剩余地价) = value − cost − profit. Compared with the land price you enter.

Results: the verdict, a bar per floor (value minus cost), a City payback ledger (development charges, amenity charges, in-kind space), and a sensitivity chart (敏感性分析) for rents, cap rates, sale prices, costs and height premium.

## Structure

| Folder | Contents |
| --- | --- |
| `core/` | Calculation engine (no page code), data schema, data validator |
| `catalogue/` | Activity-based programme catalogue: families and programmes, no prices |
| `packs/vancouver-2026/` | Vancouver market values, construction costs, City charges, assumptions, sources |
| `briefs/` | Optional rule sets. `vtc-2026/` holds the public Vancouver Tall Challenge brief (site area, minimum non-residential floor area, height range); `none/` means no brief. |
| `app/` | The web page |
| `basemap/` | Vancouver context model for the map view, with attribution |
| `templates/` | Floor-list templates (CSV and JSON) |
| `tests/` | Automated tests (`node --test`) |
| `docs/` | Method, data change log, limitations, decisions |

## Floor input

The tool reads a plain floor list. You can make one with the built-in generator, or export it from Rhino, Grasshopper or a spreadsheet:

```json
{ "floors": [ { "level": 12, "elevation_m": 48.6, "height_m": 4.2,
                "area_m2": 1850, "area_basis": "gross",
                "mix": [ { "programme_id": "O1", "share": 0.8 },
                         { "programme_id": "T4", "share": 0.2 } ] } ] }
```

`area_basis` is `gross` (core included; the efficiency curve applies) or `net` (core already removed).

## Data sources and attribution

The full list with pages and dates goes in `packs/vancouver-2026/sources.md`. Planned sources:
- construction costs: Altus Group, *Canadian Cost Guide 2026*;
- office market: CBRE, *Canada Office Figures Q3 2026*;
- hotel market: Cushman & Wakefield, *Canada Hospitality Innsights Q2 2026*;
- City charges: City of Vancouver development cost levy and amenity cost charge bulletins.

Only cited figures are included, never the reports themselves.

Map context: © OpenStreetMap contributors (ODbL); terrain from NASA SRTM.

## Limitations

- Order-of-magnitude estimates for comparing early options only.
- Market data is a snapshot in time; check the date on every value.
- Building-code checks are a designer's reading of the code, not advice; confirm with a code consultant.
- Map building heights are partly estimated and the vertical datum is unverified; the map is visual context, not survey data.

## Roadmap

| Phase | Work |
| --- | --- |
| G0 | Set-up: folders, git, this README |
| G1 | Data: catalogue, Vancouver pack, brief, validator, cross-check against sources |
| G2 | Engine and tests |
| G3 | Web page: floor input, mix editor, verdict, ledger, sensitivity, exports |
| G4 | Map view from the Vancouver context model |
| G5 | Independent review of numbers and sources |
| G6 | Release: neutrality and licence check, documentation |

## Licence

To be decided before release (G6).
