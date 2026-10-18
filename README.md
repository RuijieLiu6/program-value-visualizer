# Program Value Visualizer

A free browser tool for early tall-building design in Vancouver. You set which programmes (uses) sit on each floor and what share of the plate each takes. The tool estimates what each floor is worth and what it costs, adds City charges and a normal developer profit, and answers one question:

> After paying for construction, City charges and a normal developer profit, is there enough money left to pay for the land?

It gives a verdict (**Works / Marginal / Doesn't work**), shows which floors create value and which need support from others, and shows separately what the City receives.

**Every number is an indicative early-design estimate.** It is not a feasibility study, an appraisal or a compliance check, and the tool says so on every screen and export.

Status: **working prototype (G4).** Engine, Vancouver 2026 data pack, web page and downtown map are built and tested (116 tests). See [Roadmap](#roadmap).

Run it on your computer: `python3 scripts/serve_local.py`, then open http://localhost:8020/. The **Tower Money Book** (how tower money works, in pictures; a Designer edition in plain adult language and a simpler Starter edition) is at http://localhost:8020/money-book.html and in the tool's Help → “How the money works”. The Ask AI panel works only when the page is opened on claude.ai. New to the tool? Press **Help** in the header for a short guide and a guided tour (“Show me”).

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
2. **Neutral.** The tool has no preferred design. Defaults are a plain sample tower and published market data. Your floors and settings stay in your browser. The page loads its fonts from Google Fonts; Ask AI sends the current scheme summary to Claude only when you ask a question.
3. **Transparent method.** The calculation is a set of pure functions (纯函数) with tests, documented in `docs/method.md` with a hand-worked check, and reviewed (`docs/critique_r1.md`, `docs/critique_r2.md`).
4. **Honest about gaps.** You never have to invent a price. Uses with no published Vancouver figure carry a **typical estimate**: taken from a similar use, or from a quick 2025–26 search. Each is grade C, gives its basis and a range, and is marked "typical estimate" wherever it appears. Type your own number to replace it. Every programme's default, basis (sourced / researched / analogy / earns nothing), source and derivation is listed in `docs/value_defaults.md`.

## How the calculation works (summary)

For each floor and each programme on it:

1. **Area.** GFA = plate × share. Net area = GFA × efficiency (实用率) for that height band. Skipped when the input is already net.
2. **Value.**
   - Uses that are sold: net × price × height premium × (1 − selling cost).
   - Uses that are rented or operated: net × net operating income ÷ cap rate (资本化率) × height premium.
3. **Cost.** Hard cost (by programme, from a published cost guide) + tall-building premium + soft costs + financing + City charges + leasing and fit-out where relevant.
4. **Public running cost.** Yearly cost of free public floors, turned into a capital sum, unless someone else pays.
5. **Profit.** Developer profit as a share of cost.
6. **Residual land value** (剩余地价) = value − cost − profit. Compared with the land price: yours, or an estimate (site area × current-zoning FSR × land rate per buildable m²) you can edit.

Results:
- the verdict: Works / Marginal / Doesn't work, or Land price needed / Incomplete;
- a bar per floor (value minus cost);
- a City payback ledger: development charges, amenity charges, in-kind space;
- a sensitivity chart (敏感性分析) for rents, cap rates, sale prices, costs and height premium;
- a map of downtown: buildings by height, with an estimate of the neighbouring roofs around a point you click. It can feed the condo "above neighbours" bonus.

## Structure

| Folder | Contents |
| --- | --- |
| `core/` | Calculation engine and base-map reader (no page code), data schema, data validator |
| `catalogue/` | Activity-based programme catalogue: families and programmes, no prices |
| `packs/vancouver-2026/` | Vancouver market values, construction costs, City charges, assumptions, sources |
| `briefs/` | Optional rule sets. `vtc-2026/` holds the public Vancouver Tall Challenge brief (site area, minimum non-residential floor area, height range); `none/` means no brief. |
| `app/` | The web page; `app/icons/` draws an original isometric icon for each programme (no external icon set) |
| `basemap/` | Downtown Vancouver base map for the Map tab (about 1 MB), with attribution; built by `scripts/build_basemap.py` |
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

The full list with pages and dates is in `packs/vancouver-2026/sources.json`; the page-by-page cross-check is in `docs/data_changes.md`. Every tooltip shows the source's own publication date and the date the figure was collected ("as of"). Main sources:
- construction costs: Altus Group, *Canadian Cost Guide 2026*;
- office market: CBRE, *Canada Office Figures Q3 2026*;
- hotel market: Cushman & Wakefield, *Canada Hospitality Innsights Q2 2026*;
- City charges: City of Vancouver development cost levy and amenity cost charge bulletins.

Only cited figures are included, never the reports themselves.

Map context: © OpenStreetMap contributors (ODbL); terrain from NASA SRTM (public domain). See `basemap/README.md`.

## Limitations

- Order-of-magnitude estimates for comparing early options only.
- Market data is a snapshot in time; check the date on every value.
- Building-code checks are a designer's reading of the code, not advice; confirm with a code consultant.
- Map building heights are partly estimated and the vertical datum is unverified; the map is visual context, not survey data.

## Roadmap

| Phase | Work |
| --- | --- |
| G0 | Set-up: folders, git, this README (done) |
| G1 | Data: catalogue, Vancouver pack, brief, validator, cross-check against sources (done) |
| G2 | Engine and tests (done) |
| G3 | Web page: floor input, mix editor, verdict, ledger, sensitivity, exports, Ask AI (done; review round 1 fixed) |
| G4 | Map view of downtown with neighbouring-roof estimate (done; review round 2 items closed or deferred in `docs/critique_r2.md`) |
| G5 | Independent review of numbers and sources |
| G6 | Release: neutrality and licence check, documentation |

## Licence

To be decided before release (G6).
