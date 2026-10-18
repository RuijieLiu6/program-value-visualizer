// Program Value Visualizer — reading a concept diagram (a section of programme words) into floors.
// Pure functions: the prompt text, a lenient normaliser for what the model returns, a strict
// validator for what the user confirms, and the floor builder. No page code, no images kept.

/** Compact catalogue for the reading prompt: one line per programme. */
export function catalogueLines(data) {
  return [...data.programmes.values()].map(p => {
    const row = p.value_status === 'linked' ? data.rows.get(p.value_ref) : null;
    const tenure = { sell: 'sale', lease: 'rent', operate: 'operated', public: 'public', support: 'support' }[row?.earns_by ?? p.earns_by] ?? (p.value_status === 'zero' ? 'support' : '');
    return `${p.id}|${p.name}|${p.family_id}|${tenure}`;
  }).join('\n');
}

export function readPrompt(data) {
  return `The image is a concept diagram of a tall building: a vertical section where bands of floors are labelled with programme words (uses). Read it and return JSON only.
Return: {"height_m": number, "bands": [{"from_m": number, "to_m": number, "label_text": "words in the band as written", "programmes": [{"text": "a word as written", "programme_id": "ID from the catalogue", "share": 0-1, "confidence": 0-1}]}], "unreadable": ["words or parts you could not read"], "notes": "one or two sentences"}
Rules:
- Bands go from the lowest to the highest. Use elevation tags (like +24.0 m) for from_m and to_m when the diagram has them; otherwise estimate from the drawing's proportions and the overall height. Below-ground bands have negative elevations. Bands must not overlap.
- Map each programme word to the closest catalogue id below (for example LOBBY -> AM4, FOOD COURT -> SE3, CO-WORKING -> WK3, TRANSFER -> SB5, SHARED KITCHEN -> LV8, OFFICE -> WK1, HOTEL -> ST2, APARTMENTS -> LV4 or LV1, MECHANICAL -> SB2).
- Estimate each word's share of its band from its size or emphasis: the largest word gets the largest share. Shares in a band add up to 1.
- confidence is how sure you are of the word AND the mapping. Use a low value rather than guessing silently.
Catalogue (id|name|family|tenure):
${catalogueLines(data)}`;
}

const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : Number.isFinite(Number(x)) && x !== '' && x !== null ? Number(x) : null);

/**
 * Lenient: turn whatever the model returned into editable review rows, never throwing.
 * Unknown ids become null (to be picked), shares are normalised per band, problems are listed.
 */
export function normaliseDiagramRead(raw, data) {
  const issues = [];
  const bandsIn = Array.isArray(raw?.bands) ? raw.bands : [];
  if (!bandsIn.length) issues.push('No bands were read from the image.');
  const bands = bandsIn.slice(0, 60).map((b, k) => {
    let from = num(b?.from_m), to = num(b?.to_m);
    if (from == null || to == null) issues.push(`Band ${k + 1}: elevations missing; please type them.`);
    if (from != null && to != null && from > to) { [from, to] = [to, from]; issues.push(`Band ${k + 1}: elevations were upside down and have been swapped.`); }
    const progs = (Array.isArray(b?.programmes) ? b.programmes : []).slice(0, 8).map(p => {
      const id = String(p?.programme_id ?? '').trim().toUpperCase();
      const known = data.programmes.has(id);
      return { text: String(p?.text ?? '').slice(0, 60), programme_id: known ? id : null, share: Math.max(0, num(p?.share) ?? 0), confidence: Math.max(0, Math.min(1, num(p?.confidence) ?? 0.5)), flag: known ? null : `“${id || '?'}” is not a catalogue id: pick one` };
    });
    const s = progs.reduce((a, p) => a + p.share, 0);
    if (progs.length) {
      if (s > 0) progs.forEach(p => { p.share = p.share / s; }); else progs.forEach(p => { p.share = 1 / progs.length; });
      if (Math.abs(s - 1) > 0.02) issues.push(`Band ${k + 1}: shares added up to ${Math.round(s * 100)}%; scaled to 100%.`);
    } else issues.push(`Band ${k + 1}: no programme words read.`);
    return { from_m: from, to_m: to, label_text: String(b?.label_text ?? '').slice(0, 120), programmes: progs };
  }).sort((a, b) => (a.from_m ?? 0) - (b.from_m ?? 0));
  for (let k = 1; k < bands.length; k++) if (bands[k].from_m != null && bands[k - 1].to_m != null && bands[k].from_m < bands[k - 1].to_m - 0.05) issues.push(`Bands ${k} and ${k + 1} overlap (${bands[k - 1].to_m} m above ${bands[k].from_m} m): fix the elevations.`);
  const height = num(raw?.height_m) ?? (bands.length ? Math.max(...bands.map(b => b.to_m ?? 0)) : null);
  return { height_m: height, bands, unreadable: (Array.isArray(raw?.unreadable) ? raw.unreadable : []).map(String).slice(0, 20), notes: String(raw?.notes ?? '').slice(0, 400), issues };
}

/** Strict: the confirmed bands must be complete before anything changes. Throws a readable Error. Returns cleaned bands. */
export function validateDiagramBands(bands, data) {
  if (!Array.isArray(bands) || !bands.length) throw new Error('add at least one band');
  if (bands.length > 60) throw new Error('at most 60 bands');
  const out = bands.map((b, k) => {
    const where = `band ${k + 1}`;
    const from = num(b.from_m), to = num(b.to_m);
    if (from == null || to == null) throw new Error(`${where}: type both elevations`);
    if (!(to > from)) throw new Error(`${where}: the top must be above the bottom`);
    if (from < -40 || to > 600) throw new Error(`${where}: elevations must be from −40 m to 600 m`);
    if (to - from > 400) throw new Error(`${where}: a band over 400 m tall is not a band`);
    const progs = (b.programmes || []).filter(p => p);
    if (!progs.length) throw new Error(`${where}: add a programme`);
    const mix = progs.map(p => {
      const id = String(p.programme_id ?? '').toUpperCase();
      if (!data.programmes.has(id)) throw new Error(`${where}: “${p.text || id || '?'}” needs a programme from the catalogue`);
      const share = num(p.share);
      if (share == null || share < 0 || share > 1) throw new Error(`${where}: share of ${id} must be from 0 to 100%`);
      return { programme_id: id, share };
    });
    const s = mix.reduce((a, m) => a + m.share, 0);
    if (Math.abs(s - 1) > 0.02) throw new Error(`${where}: shares add up to ${Math.round(s * 100)}%, not 100%`);
    return { from_m: from, to_m: to, mix: mix.map(m => ({ ...m, share: m.share / s })) };
  }).sort((a, b) => a.from_m - b.from_m);
  for (let k = 1; k < out.length; k++) if (out[k].from_m < out[k - 1].to_m - 0.05) throw new Error(`bands overlap between ${out[k].from_m} m and ${out[k - 1].to_m} m`);
  return out;
}

/** Floor-to-floor height by the band's main programme: taller for lobbies, public, transfer and plant floors. */
export function floorHeightFor(mix, data, fromM) {
  const main = [...mix].sort((a, b) => b.share - a.share)[0].programme_id, fam = data.programmes.get(main)?.family_id;
  if (main === 'SB5' || main === 'SB4') return 6.0;
  if (fam === 'SB') return 5.0;
  if (['AM', 'GP', 'LE', 'MP'].includes(fam) || (fam === 'SE' && fromM < 12)) return fromM < 0 ? 3.5 : 6.0;
  if (['LV', 'ST', 'RR'].includes(fam)) return 3.2;
  return fromM < 0 ? 3.5 : 4.2;
}

/**
 * Build floors from confirmed bands, keeping each band's boundaries at the read heights.
 * Gaps between bands are closed by stretching the lower band (listed in notes).
 * plates: { podium_plate_m2, tower_plate_m2, top_plate_m2, podium_top_m }.
 */
export function floorsFromBands(bandsIn, data, plates = {}) {
  const bands = validateDiagramBands(bandsIn, data).map(b => ({ ...b }));
  const notes = [];
  for (let k = 1; k < bands.length; k++) if (bands[k].from_m > bands[k - 1].to_m + 0.05) { notes.push(`Gap ${bands[k - 1].to_m}–${bands[k].from_m} m closed by extending the band below.`); bands[k - 1].to_m = bands[k].from_m; }
  const P = { podium_plate_m2: 4000, tower_plate_m2: 2000, top_plate_m2: 1100, podium_top_m: 24, ...plates };
  const top = bands[bands.length - 1].to_m, ground = Math.max(0, bands[0].from_m);
  const plateAt = z => (z < P.podium_top_m ? P.podium_plate_m2 : Math.round(P.tower_plate_m2 - (P.tower_plate_m2 - P.top_plate_m2) * Math.min(1, Math.max(0, (z - P.podium_top_m) / Math.max(1, top - P.podium_top_m)))));
  const raw = [];
  for (const b of bands) {
    const f2f = floorHeightFor(b.mix, data, b.from_m), n = Math.max(1, Math.round((b.to_m - b.from_m) / f2f)), hh = (b.to_m - b.from_m) / n;
    for (let i = 0; i < n; i++) { const z = b.from_m + i * hh; raw.push({ elevation_m: Math.round(z * 100) / 100, height_m: Math.round(hh * 100) / 100, area_m2: plateAt(z), area_basis: 'gross', mix: b.mix.map(m => ({ ...m })) }); }
  }
  if (raw.length > 400) throw new Error('more than 400 floors');
  // number floors: level 1 starts at the lowest floor at or above ground; below it -1, -2, ...
  const firstAbove = raw.findIndex(f => f.elevation_m >= ground - 0.01);
  if (firstAbove < 0) throw new Error('at least one band must be above ground');
  const floors = raw.map((f, i) => ({ level: i >= firstAbove ? i - firstAbove + 1 : i - firstAbove, ...f }));
  return { floors, notes, height_m: top };
}
