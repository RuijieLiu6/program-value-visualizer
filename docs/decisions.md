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
