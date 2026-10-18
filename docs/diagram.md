# Programme diagrams: word-stack export and reading a concept diagram

## The genre, and what was taken from it

The programme word-stack is a vertical section where each band of floors is written as its programme words. The words are sized by how much of the building each use takes. The genre comes from OMA/AMO's programme diagrams:
- the Downtown Athletic Club section in *Delirious New York* (1978): a tower as a stack of independent "worlds", one per floor;
- the Seattle Central Library: programme clusters sorted into stacked platforms, with looser uses in between;
- CCTV and the Hyperbuilding: very large programmes shown as stacked, labelled parts.

Sources read (summaries): World Architecture on *Retroactive Manhattanism*; OASE 48 "Diagramming the contemporary"; project pages for the Seattle Central Library (OMA + LMN; REX).

**Principles taken, not the look:**
1. The section is a stack of slices, each with its own life. A band is a run of floors with the same main programme.
2. The drawing is to true vertical scale, so the height of a band means something.
3. Typography carries the quantity: the main programme of a band fills the width, and minor ones are smaller.
4. Elevations are written on one side; one strong ground line.

**The look is this tool's own:**
- light paper (#f6f3ec);
- ink, or the activity-family colours darkened for paper;
- a condensed bold display face (Oswald, with Archivo Narrow, Barlow Condensed and Arial Narrow as fallbacks);
- mono elevation tags.

There is no black background and no team colours. Tests and examples use only generic made-up schemes.

## Layout rules (`core/wordstack.js`)

- **Bands:** contiguous floors grouped by their main programme, or by family. "Tenure groups" writes For sale / For rent / Operated / Public / Support instead of names.
- **Word size:**
  - The main word is fitted to the column width and limited by the band height.
  - The other words share one scale, `size = s × √area`. So within a band, size never decreases as area grows, and each stays below the main word.
  - The scale shrinks until the words fit the band's width and height, down to 5 px.
- **Fit:** text width is estimated at 0.56 em per character, which is generous for Oswald Bold caps. In the browser, every word was measured inside the column.
- **Export:** SVG (with a Google Fonts import, for files opened elsewhere) and PNG drawn on a canvas at 3× with the page's loaded font. Both are offered through the downloads capability. Without it, the SVG is copied to the clipboard.

## Reading a concept diagram (`core/diagram_read.js`)

1. **Send.** The image goes to Claude through `sample.json(prompt, {images: [file]})` on the viewer's own account, after `sample.limits().images` confirms images can be sent. The prompt carries a compact catalogue (id | name | family | tenure) and asks for bands with elevations, words, mapped ids, shares and confidence.
2. **Normalise** (lenient, never throws):
   - swaps upside-down bands;
   - leaves unknown ids blank for the user to pick;
   - scales shares to 100%;
   - lists overlaps and gaps.
3. **Review.** An editable table: elevations, words read, the programme picker, share and confidence. Unsure rows are highlighted. Nothing changes until "Apply to section".
4. **Validate** (strict): ids must be in the catalogue, bands must not overlap, and shares must add to 100%.
5. **Build floors** (`floorsFromBands`):
   - Band boundaries stay at the read elevations.
   - Floor-to-floor height comes from the band's main programme: 6.0 m for lobby, public, retail at grade and transfer; 5.0 m for plant; 4.2 m for office; 3.2 m for homes and hotel.
   - Plates come from the concept card's plate size.
   - Gaps are closed by stretching the band below.
   - One Undo reverses the whole step.
6. **Explain.** The explanation follows ("why this reads as …", then the usual format), or the rule-based template without AI.

Without images, the upload button is hidden. "Type bands yourself" opens the same table, empty, so the word-stack export still works from typed bands.

**Capabilities the published page needs:**
- `sample: {images: true}` for Ask AI and diagram reading;
- `downloads: true` for exports.
