# Decisions log

| Date | Question | Decision |
| --- | --- | --- |
| 17 Oct 2026 | Purpose | A general, neutral, browser-based tool for early tall-building economics in Vancouver: competition teams, architecture students and local practices. |
| 17 Oct 2026 | Form | Standalone static web page; no account, no upload. |
| 17 Oct 2026 | Name | "Program Value Visualizer" (working name). |
| 17 Oct 2026 | Existing tools | Searched the local tool library, GitHub and npm. Nothing open does floor-by-floor programme mixes with Vancouver charges in a browser; commercial tools are closed. Built from scratch. |
| 17 Oct 2026 | Neutrality | No defaults taken from any one design team; the sample tower is generic. Release includes a neutrality check (G6). |
| 17 Oct 2026 | Source documents | Licensed reports are never committed (`*.pdf` in `.gitignore`); only cited figures with publisher, page and date. |
| 17 Oct 2026 | Hosting and licence | Open; decided before release. |
| 18 Oct 2026 | Mechanical floors and City charges | Whole floors of plant, refuge or structure pay no DCL or ACC, matching the FSR check (grade C reading). Core, parking and storage keep the cautious commercial rate. |
| 18 Oct 2026 | Childcare cost | Turnkey cost per space ÷ an editable m² per space (16 m², grade C), treated as all-in hard + soft cost. |
| 18 Oct 2026 | Row grades | A value row's grade is its weakest key input; the validator enforces it. |
| 18 Oct 2026 | Map (G4) | Lightweight 2D plan of downtown (about 1 MB) instead of embedding a 3D viewer. No site marked; OpenStreetMap and NASA SRTM credited under the map. |
| 18 Oct 2026 | Unpriced programmes | Give every programme a typical estimate (grade C, basis and range shown, marked in the page) instead of asking users for prices. Public and support uses stay at zero. |
| 18 Oct 2026 | Help | A Help button opens a short guide (question, five steps, verdicts, grades, limits) with an optional guided tour. It opens once on a first visit. |
| 18 Oct 2026 | Programme icons and picker | Each of the 112 programmes has an original isometric icon, drawn in the browser by `app/icons/` (no external icon set, no licence) and cached per id. The Floors tab picks programmes from a picture grid with family chips, search and keyboard control instead of two drop-downs. |
| 18 Oct 2026 | Research pass on defaults | Typical estimates split into researched (a 2025–26 figure found by search) and analogy (nothing usable found). Both are grade C and shown apart in the picker and programme card. Four assumption rows (H1, O3, O6, A4) were rebuilt from researched figures. |
| 18 Oct 2026 | Land values | When the user types none, both land values are estimated: site area × current-zoning FSR (Area A, 11.0) × C$3,230 per buildable m², × (1 + premium, 0%). Editable and graded; typed values always win. |
| 18 Oct 2026 | Concept starter | The assistant plans a starting stack in one `apply_stack` call from the tool's own planning guide, then explains it in a fixed neutral format. A deterministic rule-based starter covers no-AI views. Both are starting points, not recommendations. |
| 18 Oct 2026 | Programme diagrams | A word-stack section export (true scale, words sized by area) drawn in the tool's own style, after OMA/AMO principles, not any team's look. Concept diagrams are read by Claude, reviewed in an editable table, validated, then applied with one Undo. See docs/diagram.md. |
| 18 Oct 2026 | Optimiser | “Find a mix that works” keeps the form and searches uses with the real engine. It uses dynamic programming over the floors (FSR minimum and hotel-key cap as state), four strategies and a whole-building polish. It reports honestly when nothing works and what would flip it. Fits are hard, except where the FSR rule cannot otherwise be met, and the report says so. |
