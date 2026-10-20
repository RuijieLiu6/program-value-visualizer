// Program Value Visualizer — starting stacks from a short concept brief.
// Pure functions, no page code: used by the Ask AI tab (with or without AI) and by Node tests.
// A stack is a starting point for early design, never a recommendation of one design.
import { evaluate, sampleTower } from './econ_core.js';

const val = o => (o && typeof o.value === 'number' ? o.value : null);
const r1 = x => Math.round(x * 10) / 10;

export const PRIORITIES = {
  public: 'Public life & civic',
  homes: 'Homes',
  work: 'Workplaces',
  visitors: 'Hotel & visitors',
  culture: 'Culture & learning',
  viability: 'Financial viability',
};
export const PLATES = {
  compact: { podium_plate_m2: 3000, tower_plate_m2: 1500, top_plate_m2: 900 },
  medium: { podium_plate_m2: 4000, tower_plate_m2: 2000, top_plate_m2: 1100 },
  large: { podium_plate_m2: 5000, tower_plate_m2: 2600, top_plate_m2: 1500 },
};
const MECH_EVERY = 20;

// ---------- planning guide: the tool's own rules, compact, for the assistant ----------
export function planningGuide(data) {
  const fam = data.families;
  const programmes = [...data.programmes.values()].map(p => {
    const row = p.value_status === 'linked' ? data.rows.get(p.value_ref) : null;
    return {
      id: p.id, name: p.name, family: p.family_id, fits: p.fits.join(''), intensity: fam.get(p.family_id)?.intensity ?? null,
      code: (p.occupancy_group || []).join('/') || null,
      earns: row?.earns_by ?? p.earns_by ?? (p.value_status === 'zero' ? 'none' : null),
      value_m2: row ? row.value_per_m2_gfa.value : 0,
      basis: row?.value_basis === 'no_income' || (row && row.value_per_m2_gfa.value === 0) ? 'no income' : row?.value_basis ?? 'none',
    };
  });
  return {
    fits_legend: { B: 'below grade', G: 'ground / podium', L: 'low tower (up to ~60 m)', M: 'mid', H: 'high', T: 'top / crown', S: 'seam (mechanical, transfer, belt)' },
    families: [...fam.values()].map(f => ({ id: f.family_id, name: f.name, intensity: f.intensity })),
    rules: [
      'Retail and restaurants (T1-T4 rows) keep value only at level 1 (level 2 a little); above level 2 they earn nothing.',
      'Homes earn a height premium per floor above the podium (condo about 0.7%/floor, rental 0.3%); office 0.2%; hotel select-service none.',
      'Office plates work best low in the tower (large plates, near transit and the street). Office and hotel count as non-residential for the 9.0 FSR rule (hotel both ways).',
      'Put a mechanical floor (SB2) about every 20 floors; refuge or belt floors (SB3, SB4) can share it. Plant floors pay no DCL/ACC and are left out of FSR.',
      'Activity intensity jump of 3 or more between neighbouring floors (e.g. a public deck, 4, above homes, 1) asks for a buffer floor (any SB programme, e.g. SB9 resident amenity).',
      'Childcare (CH1) needs about 14 m2 of sunny outdoor play per child next to the room: level 2 or a terrace.',
      'B2/B3 occupancies (urgent care, hospital, long-term care) above storey 3 trigger the strictest smoke-control and evacuation rules: keep them low.',
      'F1 (high-hazard industrial) is not allowed with A, B or C occupancies.',
      'Heavy, crowded or public uses (pools, halls, gyms, markets) go low (podium) or on seams; parking and storage below grade.',
      'Public floors (earns none) cost money every year; someone must pay (cross-subsidy, CAC endowment, ticketed deck, City or partner).',
      'A ticketed observation deck (LE1) at the crown is one total value, spread over the deck area: it does not grow with area.',
    ],
    vtc_brief: data.brief?.rules?.length ? { min_nonres_fsr: data.brief.rules.find(r => r.id === 'min_nonres_fsr')?.fsr ?? null, site_area_m2: val(data.brief.site?.area_m2), height_m: data.brief.height_m ? [data.brief.height_m.min, data.brief.height_m.max] : null } : null,
    programmes,
  };
}

// ---------- apply_stack: validate a stack and turn it into floors ----------
const RANGE = { height_m: [40, 500], podium_floors: [0, 12], podium_plate_m2: [200, 20000], tower_plate_m2: [200, 10000], top_plate_m2: [200, 10000], below_grade: [0, 8] };
const DEFAULT_TOWER = { height_m: 280, podium_floors: 4, below_grade: 3, ...PLATES.medium };

/** Validate a stack and build its floors. Throws a readable Error on bad input. Does not touch any page state. */
export function stackToFloors(stack, data) {
  if (!stack || typeof stack !== 'object') throw new Error('stack must be an object with tower and bands');
  const t = { ...DEFAULT_TOWER };
  for (const [k, [lo, hi]] of Object.entries(RANGE)) {
    const v = stack.tower?.[k];
    if (v === undefined || v === null) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`tower.${k} must be a number from ${lo} to ${hi}`);
    t[k] = k === 'podium_floors' || k === 'below_grade' ? Math.round(n) : n;
  }
  const bands = Array.isArray(stack.bands) ? stack.bands : null;
  if (!bands || !bands.length) throw new Error('bands must list at least one band');
  if (bands.length > 60) throw new Error('at most 60 bands');
  const clean = bands.map((b, k) => {
    const where = `band ${k + 1}`;
    const from = Number(b?.from_level), to = Number(b?.to_level);
    if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error(`${where}: from_level and to_level must be whole numbers`);
    if (from > to) throw new Error(`${where}: from_level is above to_level`);
    if (from < -8 || to > 200) throw new Error(`${where}: levels must be from -8 to 200`);
    if (!Array.isArray(b.mix) || !b.mix.length) throw new Error(`${where}: mix must list at least one programme`);
    if (b.mix.length > 8) throw new Error(`${where}: at most 8 programmes on a floor`);
    const mix = b.mix.map(m => {
      const id = String(m?.programme_id ?? '').trim().toUpperCase();
      if (!data.programmes.has(id)) throw new Error(`${where}: unknown programme "${id.slice(0, 12)}"`);
      const share = Number(m.share);
      if (!Number.isFinite(share) || share < 0 || share > 1) throw new Error(`${where}: share of ${id} must be from 0 to 1`);
      return { programme_id: id, share };
    });
    const s = mix.reduce((a, m) => a + m.share, 0);
    if (Math.abs(s - 1) > 0.02) throw new Error(`${where}: shares add up to ${r1(s * 100)}%, not 100%`);
    return { from, to, mix: mix.map(m => ({ ...m, share: m.share / s })) };
  });
  const floors = sampleTower({ height: t.height_m, podiumFloors: t.podium_floors, belowGrade: t.below_grade, podiumPlate: t.podium_plate_m2, towerPlate: t.tower_plate_m2, topPlate: t.top_plate_m2, mechEvery: MECH_EVERY });
  const covered = new Set(), filled = [], keptMech = [];
  const isMech = f => f.mix.length === 1 && f.mix[0].programme_id === 'SB2';
  for (const f of floors) {
    // last band wins; a plant floor from the generator stays unless a one-level band names it
    let hit = null;
    for (const b of clean) if (f.level >= b.from && f.level <= b.to && (!isMech(f) || b.from === b.to)) hit = b;
    if (hit) { f.mix = hit.mix.map(m => ({ ...m })); covered.add(f.level); }
    else if (isMech(f)) keptMech.push(f.level);
  }
  for (const f of floors) {
    if (covered.has(f.level) || isMech(f)) continue;
    if (f.level < 0) { filled.push({ level: f.level, how: 'parking and storage (default below grade)' }); continue; }
    // nearest band above grade
    let best = null, bd = Infinity;
    for (const b of clean) { if (b.to < 1) continue; const d = f.level < b.from ? b.from - f.level : f.level - b.to; if (d < bd) { bd = d; best = b; } }
    if (best) { f.mix = best.mix.map(m => ({ ...m })); filled.push({ level: f.level, how: `copied from the nearest band (L${best.from}–L${best.to})` }); }
  }
  const outside = clean.filter(b => !floors.some(f => f.level >= b.from && f.level <= b.to)).map(b => `L${b.from}–L${b.to}`);
  return { floors, tower: t, bands: clean, filled, keptMech, outside, maxLevel: Math.max(...floors.map(f => f.level)) };
}

// ---------- rule-based starter (no AI) ----------
function zoneShares(prio) {
  const z = { office: 0.35, hotel: 0.17, rental: 0.18, condo: 0.30 };
  if (prio.has('homes')) { z.office -= 0.08; z.hotel -= 0.04; z.rental += 0.06; z.condo += 0.06; }
  if (prio.has('work')) { z.office += 0.12; z.rental -= 0.06; z.condo -= 0.06; }
  if (prio.has('visitors')) { z.hotel += 0.10; z.office -= 0.05; z.rental -= 0.05; }
  if (prio.has('viability')) { z.condo += z.rental * 0.5; z.rental *= 0.5; }
  const s = Object.values(z).reduce((a, b) => a + Math.max(0, b), 0);
  for (const k of Object.keys(z)) z[k] = Math.max(0, z[k]) / s;
  return z;
}
const MIX = {
  parking: [{ programme_id: 'AM7', share: 0.7 }, { programme_id: 'AM8', share: 0.3 }],
  ground: [{ programme_id: 'SE1', share: 0.55 }, { programme_id: 'SE4', share: 0.15 }, { programme_id: 'AM4', share: 0.3 }],
  office: [{ programme_id: 'WK1', share: 1 }],
  hotel: [{ programme_id: 'ST2', share: 1 }],
  rental: [{ programme_id: 'LV4', share: 0.8 }, { programme_id: 'LV5', share: 0.2 }],
  condo: [{ programme_id: 'LV1', share: 1 }],
  mech: [{ programme_id: 'SB2', share: 1 }],
  buffer: [{ programme_id: 'SB9', share: 1 }],
};

/**
 * A deterministic starting stack from the concept answers.
 * answers: { concept?, height_m?, priorities?: [keys of PRIORITIES] (max 3), must_have?: [programme ids],
 *            meet_fsr?: bool, hotel_nonres?: bool, plates?: 'compact'|'medium'|'large' }
 * Returns { tower, bands: [{from_level, to_level, mix, zone, reason}], fsr, notes }.
 */
export function starterStack(answers = {}, data, settings = {}) {
  const prio = new Set((answers.priorities || []).filter(p => p in PRIORITIES).slice(0, 3));
  const height = Math.min(500, Math.max(40, Number(answers.height_m) || 280));
  const tower = { height_m: height, podium_floors: 4, below_grade: 3, ...(PLATES[answers.plates] || PLATES.medium) };
  const base = sampleTower({ height, podiumFloors: tower.podium_floors, belowGrade: tower.below_grade, podiumPlate: tower.podium_plate_m2, towerPlate: tower.tower_plate_m2, topPlate: tower.top_plate_m2, mechEvery: MECH_EVERY });
  const above = base.filter(f => f.level >= 1), top = Math.max(...above.map(f => f.level));
  const crownFrom = top - 1, bufferLevel = crownFrom - 1;
  const mechLevels = above.filter(f => f.mix[0].programme_id === 'SB2' && f.mix.length === 1 && f.level < bufferLevel).map(f => f.level);
  const towerLevels = above.filter(f => f.level > tower.podium_floors && f.level < bufferLevel && !mechLevels.includes(f.level)).map(f => f.level);
  const meetFsr = answers.meet_fsr ?? !!data.brief?.rules?.length;
  const hotelNonres = answers.hotel_nonres ?? true;

  const l2 = prio.has('public') ? { mix: [{ programme_id: 'GP5', share: 0.6 }, { programme_id: 'CH1', share: 0.4 }], why: 'community hall and childcare: public uses low, easy to reach from the street; childcare at level 2 can have its outdoor play on the podium roof (about 14 m² a child)' }
    : prio.has('culture') ? { mix: [{ programme_id: 'GP6', share: 0.6 }, { programme_id: 'CH1', share: 0.4 }], why: 'gallery and childcare: cultural space low and visible; childcare at level 2 next to podium-roof play space' }
    : { mix: [{ programme_id: 'SE3', share: 0.6 }, { programme_id: 'CH1', share: 0.4 }], why: 'market hall and childcare: busy uses low, retail still earns at level 2; childcare next to podium-roof play space' };
  const podium = prio.has('culture') ? { mix: [{ programme_id: 'LN3', share: 0.7 }, { programme_id: 'GP6', share: 0.3 }], why: 'institute floors and gallery in the podium: large plates and many visitors stay near the street' }
    : prio.has('public') ? { mix: [{ programme_id: 'WK1', share: 0.6 }, { programme_id: 'GP5', share: 0.2 }, { programme_id: 'MP1', share: 0.2 }], why: 'offices with community rooms and a gym: large podium plates, busy uses kept low' }
    : { mix: [{ programme_id: 'WK1', share: 0.8 }, { programme_id: 'GP5', share: 0.2 }], why: 'offices with meeting and community rooms on the large podium plates, close to transit at grade' };
  const crown = prio.has('public') && !prio.has('viability') ? { mix: [{ programme_id: 'LE2', share: 0.6 }, { programme_id: 'LE3', share: 0.4 }], why: 'free public deck with a sky restaurant: the view becomes a public legacy; the restaurant helps pay for it' }
    : { mix: [{ programme_id: 'LE1', share: 0.7 }, { programme_id: 'LE3', share: 0.3 }], why: 'ticketed observation deck and sky restaurant: the view is the most valuable thing at the top, and tickets can fund public floors' };

  let shares = zoneShares(prio);
  const build = z => {
    const n = towerLevels.length, cut = [];
    let acc = 0;
    for (const k of ['office', 'hotel', 'rental', 'condo']) { acc += z[k]; cut.push([k, Math.round(acc * n)]); }
    const zoneOf = i => cut.find(([, c]) => i < c)?.[0] ?? 'condo';
    const runs = [];
    towerLevels.forEach((lv, i) => {
      const zn = zoneOf(i), last = runs[runs.length - 1];
      if (last && last.zone === zn) last.to = lv; else runs.push({ zone: zn, from: lv, to: lv });
    });
    return runs;
  };
  const WHY = {
    office: 'offices low in the tower: large plates, short lift runs and nearest to transit; counts as non-residential for the 9.0 FSR rule',
    hotel: 'hotel between work and homes: separate lift zone and lobby; non-residential when the City counts hotel that way',
    rental: 'rental homes in the middle: rents respond less to height than sale prices (about 0.3% a floor)',
    condo: 'condos high: sale prices rise with height (about 0.7% a floor in the pack), so homes high create the most value',
  };
  const assemble = runs => {
    const bands = [
      { from_level: -tower.below_grade, to_level: -1, mix: MIX.parking, zone: 'parking', reason: 'parking and storage below grade: no daylight needed, left out of FSR' },
      { from_level: 1, to_level: 1, mix: MIX.ground, zone: 'ground', reason: 'shops, a café and the lobby at grade: retail keeps its value only at street level' },
      { from_level: 2, to_level: 2, mix: l2.mix, zone: 'level 2', reason: l2.why },
    ];
    if (tower.podium_floors >= 3) bands.push({ from_level: 3, to_level: tower.podium_floors, mix: podium.mix, zone: 'podium', reason: podium.why });
    for (const r of runs) bands.push({ from_level: r.from, to_level: r.to, mix: r.zone === 'office' && prio.has('culture') ? [{ programme_id: 'WK1', share: 0.7 }, { programme_id: 'LN3', share: 0.3 }] : MIX[r.zone], zone: r.zone, reason: WHY[r.zone] });
    bands.push({ from_level: bufferLevel, to_level: bufferLevel, mix: MIX.buffer, zone: 'buffer', reason: 'resident amenity floor as a buffer: it separates the busy public crown from the homes below (intensity rule)' });
    bands.push({ from_level: crownFrom, to_level: top, mix: crown.mix, zone: 'crown', reason: crown.why });
    for (const lv of mechLevels) bands.push({ from_level: lv, to_level: lv, mix: MIX.mech, zone: 'mechanical', reason: `plant floor on a seam: about every ${MECH_EVERY} floors, can double as a refuge or belt floor; pays no DCL/ACC` });
    return bands;
  };
  // must-have programmes: add a 20% share in the band where they usually fit
  const placeMust = bands => {
    const target = p => {
      const f = p.fits;
      // care uses with B2/B3 occupancy stay at or below storey 3 (strictest rules above it)
      if ((p.occupancy_group || []).some(g => g === 'B2' || g === 'B3')) { for (const z of ['level 2', 'podium', 'ground']) { const b = bands.find(x => x.zone === z); if (b) return b; } }
      const pick = zones => { for (const z of zones) { const b = bands.find(x => x.zone === z); if (b) return b; } return null; };
      if (f.includes('T')) return pick(['crown']);
      if (f.includes('G')) return pick(['level 2', 'podium', 'ground']);
      if (f.includes('L')) return pick(['office', 'podium', 'hotel']);
      if (f.includes('M')) return pick(['hotel', 'rental', 'office']);
      if (f.includes('H')) return pick(['condo', 'rental']);
      if (f.includes('B')) return pick(['parking']);
      if (f.includes('S')) return pick(['buffer', 'mechanical']);
      return pick(['podium', 'level 2']);
    };
    const placed = [];
    for (const id of (answers.must_have || []).map(x => String(x).toUpperCase()).filter(x => data.programmes.has(x)).slice(0, 6)) {
      const p = data.programmes.get(id), b = target(p);
      if (!b || b.mix.some(m => m.programme_id === id)) continue;
      b.mix = [...b.mix.map(m => ({ ...m, share: m.share * 0.8 })), { programme_id: id, share: 0.2 }];
      b.reason += `; includes ${p.name} (${id}) as asked, where it usually fits (${p.fits.join('/')})`;
      placed.push({ id, band: `L${b.from_level}–L${b.to_level}` });
    }
    return placed;
  };
  const S = { ...settings, hotelAsNonResidential: hotelNonres };
  let bands, placed, result, steps = 0;
  const run = () => { bands = assemble(build(shares)); placed = placeMust(bands); result = evaluate(stackToFloors({ tower, bands }, data).floors, data, S); };
  run();
  const notes = [];
  if (meetFsr && result.fsr.requiredNonres) {
    // shift homes to workplaces (or hotel) until the non-residential minimum is met, where the area allows
    while (result.fsr.pass === false && (shares.rental + shares.condo) > 0.001 && steps < 40) {
      const take = Math.min(0.03, shares.rental > 0 ? shares.rental : shares.condo);
      if (shares.rental > 0) shares.rental -= take; else shares.condo -= take;
      if (prio.has('visitors') && hotelNonres) shares.hotel += take; else shares.office += take;
      steps++; run();
    }
    if (steps) notes.push(`Moved about ${Math.round(steps * 3)}% of the tower from homes to ${prio.has('visitors') && hotelNonres ? 'hotel' : 'offices'} to meet the 9.0 FSR non-residential rule.`);
    if (result.fsr.pass === false) notes.push('The 9.0 FSR non-residential rule cannot be met with this height and plate size: try larger plates or a taller tower.');
  }
  return { tower, bands, placed, notes, fsr: result.fsr, verdict: result.verdict, priorities: [...prio], meetFsr, hotelNonres };
}

// ---------- plain-language explanation (template; also the no-AI fallback) ----------
const M = x => `${x < 0 ? '−' : ''}C$${Math.abs(x / 1e6).toFixed(0)} M`;
function reasonFor(mix, from, to, data, podiumTop) {
  const ids = mix.map(m => m.programme_id), p = id => data.programmes.get(id);
  const fam = new Set(ids.map(id => p(id)?.family_id));
  if (to < 0) return 'below grade: no daylight needed, left out of FSR';
  if (ids.includes('SB2')) return 'plant floor on a seam, about every 20 floors';
  if (fam.has('SE') && from <= 2) return 'shops and food at grade: retail keeps its value only at street level';
  if (fam.has('SE')) return 'shops above level 2 earn little in this tool: worth checking';
  if (fam.has('LV')) return from > podiumTop + 10 ? 'homes high: sale and rent rise with height' : 'homes low in the tower: less height premium';
  if (fam.has('WK')) return from <= 25 ? 'offices low: large plates, near transit; non-residential for the FSR rule' : 'offices high: smaller premium than homes, worth comparing';
  if (fam.has('ST')) return 'hotel: own lift zone; counts as non-residential when the City counts it so';
  if (fam.has('LE')) return 'view-based use at the top: the view is the asset';
  if (ids.some(id => ['B2', 'B3'].some(g => (p(id)?.occupancy_group || []).includes(g))) && from > 3) return 'care use above storey 3: strictest smoke-control and evacuation rules apply';
  if (fam.has('SB')) return 'support floor: services or a buffer between different uses';
  if (from <= podiumTop) return 'busy or public use in the podium, close to the street';
  return 'a use placed by the designer';
}
/** Group floors into bands of identical mix (consecutive levels). */
export function bandsFromFloors(floors) {
  const out = [];
  for (const f of [...floors].sort((a, b) => a.level - b.level)) {
    const key = f.mix.map(m => `${m.programme_id}:${Math.round(m.share * 100)}`).join(';'), last = out[out.length - 1];
    if (last && last.key === key && f.level === last.to + 1) last.to = f.level; else out.push({ key, from: f.level, to: f.level, mix: f.mix });
  }
  return out;
}
/**
 * Short explanation in the agreed format: intent; bands base to crown with reasons; FSR both ways;
 * money; 2-3 alternative moves; reminder. stack (optional) carries bands with reasons and notes.
 */
export function explainStack(result, data, { floors, stack = null, concept = '', label = '' } = {}) {
  const fname = id => data.programmes.get(id)?.name ?? id;
  const podiumTop = result.settings.podiumTopFloor;
  const lines = [];
  if (label) lines.push(label);
  const prio = stack?.priorities?.map(k => PRIORITIES[k].toLowerCase()) ?? [];
  lines.push(`Intent: ${concept ? `“${concept.trim().slice(0, 200)}” — ` : ''}${prio.length ? `a stack that leads with ${prio.join(', ')}` : 'a stack read from the floors on screen'}, ${Math.round(result.height)} m tall.`);
  lines.push('', 'From the basement to the crown:');
  const bands = stack ? [...stack.bands].sort((a, b) => a.from_level - b.from_level).filter((b, i, arr) => !(b.zone === 'mechanical' && arr.some(o => o !== b && o.zone === 'mechanical' && o.from_level < b.from_level)))
    : bandsFromFloors(floors).map(b => ({ from_level: b.from, to_level: b.to, mix: b.mix, reason: reasonFor(b.mix, b.from, b.to, data, podiumTop) }));
  const mechList = stack ? stack.bands.filter(b => b.zone === 'mechanical').map(b => `L${b.from_level}`) : [];
  for (const b of bands) {
    const mix = b.mix.map(m => `${fname(m.programme_id)}${b.mix.length > 1 ? ` ${Math.round(m.share * 100)}%` : ''}`).join(', ');
    const lv = b.from_level === b.to_level ? `L${b.from_level}` : `L${b.from_level}–L${b.to_level}`;
    lines.push(`• ${b.zone === 'mechanical' && mechList.length > 1 ? `Plant floors (${mechList.join(', ')})` : lv}: ${mix} — ${b.reason}.`);
  }
  const f = result.fsr;
  if (f.requiredNonres) lines.push('', `FSR: non-residential ${(f.nonresFsrWithHotel ?? 0).toFixed(1)} with hotel counted as non-residential, ${(f.nonresFsrWithoutHotel ?? 0).toFixed(1)} without; the brief asks for ${f.minNonresFsr}. ${f.pass ? 'Meets it' : 'Short of it'} as hotel is counted now${f.tightWithHotel || f.tightWithoutHotel ? ' (provisional: within 10%)' : ''}.`);
  // money by band
  const net = bands.map(b => ({ b, net: result.floors.filter(x => x.level >= b.from_level && x.level <= b.to_level).reduce((s, x) => s + x.net, 0) }));
  const pos = net.filter(x => x.net > 0).sort((a, b) => b.net - a.net).slice(0, 2), neg = net.filter(x => x.net < 0).sort((a, b) => a.net - b.net).slice(0, 2);
  const nm = x => (x.b.from_level === x.b.to_level ? `L${x.b.from_level}` : `L${x.b.from_level}–L${x.b.to_level}`) + ` (${fname(x.b.mix[0].programme_id)})`;
  const t = result.totals;
  lines.push('', `Money: ${pos.length ? `${pos.map(x => `${nm(x)} (${M(x.net)})`).join(' and ')} create the most value` : 'no band creates value at these prices'}; ${neg.length ? `${neg.map(x => `${nm(x)} (${M(x.net)})`).join(' and ')} need support from the rest` : 'no band loses money'}. Residual land value after CAC ${M(t.rlvAfterCac)} against a land price of ${t.landPrice == null ? 'not set' : M(t.landPrice)}${t.landEstimated ? ' (estimated)' : ''}: ${{ works: 'Works', marginal: 'Marginal', doesnt_work: "Doesn't work", needs_land: 'land price needed', incomplete: 'incomplete' }[result.verdict]}.`);
  // alternatives
  const alt = [];
  if (f.requiredNonres && !f.pass) alt.push('Turn a few floors of homes into offices or hotel to meet the 9.0 FSR non-residential rule.');
  if (t.rlvAfterCac < 0 || result.verdict !== 'works') alt.push('Give more of the upper tower to condos (they gain most from height), or fewer free public floors.');
  if (result.items.some(i => i.earnsBy === 'public')) alt.push('Name who pays for the public floors (City ledger tab): a ticketed deck or a CAC endowment changes the result.');
  alt.push('Try another height or plate size and compare the verdict.');
  lines.push('', 'Moves to try:', ...alt.slice(0, 3).map(a => `• ${a}`));
  if (stack?.notes?.length) lines.push('', ...stack.notes);
  lines.push('', 'Indicative early-design estimate: a starting point to edit, not a recommendation of one design.');
  return lines.join('\n');
}
