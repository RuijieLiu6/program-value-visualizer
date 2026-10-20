// Program Value Visualizer — "Find a mix that works".
// For a fixed building form (levels, elevations, heights, plate areas), choose a use for each floor
// that gives the best verdict and the most headroom over the land price, within the brief and market caps.
// Pure functions: the real engine scores every candidate floor; dynamic programming over the floors
// picks the stack; a local polish re-evaluates whole buildings. A starting point, not a recommendation.
import { evaluate, floorBands, fsrClass, isSaleRow, isResidentialRow, defaultSettings } from './econ_core.js';

const val = o => (o && typeof o.value === 'number' ? o.value : null);
const VERDICT_RANK = { works: 4, marginal: 3, needs_land: 2, doesnt_work: 1, incomplete: 0 };

/** Candidate uses: a short mix each, with where they may go. Earning-oriented; public uses are kept from the user's floors. */
export const UNITS = [
  { id: 'retail', name: 'Shops and lobby', mix: [['SE1', 0.6], ['AM4', 0.4]], zone: 'ground' },
  { id: 'cafe', name: 'Café, shops and lobby', mix: [['SE4', 0.4], ['SE1', 0.3], ['AM4', 0.3]], zone: 'ground' },
  { id: 'foodhall', name: 'Food hall', mix: [['SE3', 1]], zone: 'podium' },
  { id: 'fitness', name: 'Fitness club', mix: [['MP1', 1]], zone: 'podium' },
  { id: 'cinema', name: 'Cinema', mix: [['GP3', 1]], zone: 'podium' },
  { id: 'office', name: 'Offices', mix: [['WK1', 1]] },
  { id: 'cowork', name: 'Co-working', mix: [['WK3', 1]] },
  { id: 'clinic', name: 'Medical offices', mix: [['CH2', 1]] },
  { id: 'hotel', name: 'Hotel', mix: [['ST2', 1]], hotel: true },
  { id: 'luxhotel', name: 'Luxury hotel', mix: [['ST1', 1]], hotel: true },
  { id: 'serviced', name: 'Serviced apartments', mix: [['ST3', 1]], hotel: true },
  { id: 'rental', name: 'Rental homes', mix: [['LV4', 1]], housing: true },
  { id: 'student', name: 'Student housing', mix: [['LV7', 1]], housing: true },
  { id: 'condo', name: 'Condos', mix: [['LV1', 1]], housing: true, sale: true },
  { id: 'luxcondo', name: 'Luxury condos', mix: [['LV2', 1]], housing: true, sale: true, luxury: true },
  { id: 'deck', name: 'Ticketed deck', mix: [['LE1', 1]], zone: 'crown', deck: true },
  { id: 'skybar', name: 'Sky restaurant', mix: [['LE3', 1]], zone: 'crown' },
];
const PARKING = [['AM7', 0.7], ['AM8', 0.3]], PLANT = [['SB2', 1]];
const KEYED = new Set(['H1', 'H2', 'H3']);
/** Hotel keys a floor item adds: net area / area per key (60 m2 where the row gives none). */
function keysOfItem(i, data) { if (!KEYED.has(i.rowId)) return 0; const row = data.rows.get(i.rowId); return i.net / (val(row?.inputs?.m2_per_key) || 60); }
const mixOf = pairs => pairs.map(([programme_id, share]) => ({ programme_id, share }));
const mixKey = mix => [...mix].sort((a, b) => a.programme_id.localeCompare(b.programme_id)).map(m => `${m.programme_id}:${m.share.toFixed(3)}`).join(';');

/** Option defaults, from the pack's optimiser block. */
export function optimiserDefaults(data) {
  const o = data.assumptions.optimiser || {};
  return {
    respectFsr: !!data.brief?.rules?.some(r => r.id === 'min_nonres_fsr'),
    allowSale: true, allowDeck: true, keepPublic: true, inclusionary: false,
    inclusionaryShare: val(o.inclusionary_share) ?? 0.2,
    maxHotelKeys: val(o.max_hotel_keys) ?? 450, maxDeckFloors: val(o.max_deck_floors) ?? 2,
    maxLuxuryShare: val(o.max_luxury_condo_share) ?? 0.4, minBand: val(o.min_band_floors) ?? 3,
    switchPenaltyShare: val(o.switch_penalty_share) ?? 0.01, polishPasses: 2,
  };
}

// ---------- building context ----------
function context(floors, settings) {
  const above = floors.filter(f => f.level >= 1);
  return { height: above.length ? Math.max(...above.map(f => f.elevation_m + f.height_m)) : 0, maxLevel: above.length ? Math.max(...above.map(f => f.level)) : 0, podiumTopFloor: settings.podiumTopFloor };
}
const isPlant = f => f.mix.length === 1 && f.mix[0].programme_id === 'SB2';
const isPublicFloor = (f, data) => f.mix.some(m => { const p = data.programmes.get(m.programme_id), row = p?.value_status === 'linked' ? data.rows.get(p.value_ref) : null; return p?.family_id !== 'AM' && (row?.earns_by ?? (p?.value_status === 'zero' && p?.earns_by !== 'support' ? 'public' : null)) === 'public' && m.share >= 0.3; });

/**
 * Fixed skeleton: which floors the solver may change, and what the others become.
 * Locked floors and (optionally) public floors stay as they are; below grade becomes parking;
 * plant floors stay, or are placed about every 20 floors above the podium when there are none.
 */
export function skeleton(floors, data, settings, opts) {
  const sorted = [...floors].sort((a, b) => a.level - b.level).map(f => ({ ...f, mix: f.mix.map(m => ({ ...m })) }));
  const ctx = context(sorted, settings);
  const hasPlant = sorted.some(isPlant), podium = settings.podiumTopFloor;
  const plantAt = new Set();
  if (!hasPlant && ctx.maxLevel - podium > 25) for (let lv = podium + 20; lv < ctx.maxLevel - 2; lv += 20) plantAt.add(lv);
  return sorted.map(f => {
    let role = 'free', why = null;
    if (f.locked) { role = 'fixed'; why = 'locked'; }
    else if (opts.keepPublic && isPublicFloor(f, data)) { role = 'fixed'; why = 'public floor kept'; }
    else if (f.level < 1) { role = 'fixed'; why = 'parking below grade'; f.mix = mixOf(PARKING); }
    else if (isPlant(f) || plantAt.has(f.level)) { role = 'fixed'; why = 'plant floor'; f.mix = mixOf(PLANT); }
    const bands = floorBands(f, ctx);
    const zone = f.level === 1 ? 'ground' : f.level <= podium ? 'podium' : f.level > ctx.maxLevel - 2 ? 'crown' : 'tower';
    return { floor: f, role, why, bands, zone };
  });
}

function unitAllowed(u, slot, data, opts, strat) {
  if (u.sale && (!opts.allowSale || strat.noSale)) return false;
  if (u.housing && strat.noHousing) return false;
  if (u.deck && (!opts.allowDeck || strat.noDeck)) return false;
  if (slot.zone === 'ground') return u.zone === 'ground';
  if (u.zone === 'ground') return false;
  if (u.zone === 'crown' && slot.zone !== 'crown') return false;
  if (u.deck && slot.floor.level !== slot.topLevel) return false;    // one deck at the very top: the visitor total does not grow with floors
  if (u.zone === 'podium' && slot.zone !== 'podium') return false;
  for (const [id] of u.mix) {
    const p = data.programmes.get(id);
    if (!p) return false;
    if (p.max_floor != null && slot.floor.level > p.max_floor) return false;
    if ((p.occupancy_group || []).some(g => g === 'B2' || g === 'B3') && slot.floor.level > 3) return false;
    if ((p.occupancy_group || []).includes('F1')) return false;   // never with A/B/C occupancies, which every tower has
    const relax = slot.relaxAll || (opts.relaxFits && !u.housing);
    if (!relax && p.fits?.length && !p.fits.some(b => slot.bands.has(b)) && !(slot.zone === 'crown' && u.zone === 'crown')) return false;
  }
  return true;
}
const unitMix = (u, opts) => {
  let mix = mixOf(u.mix);
  if (opts.inclusionary && u.housing) mix = [...mix.map(m => ({ ...m, share: m.share * (1 - opts.inclusionaryShare) })), { programme_id: 'LV5', share: opts.inclusionaryShare }];
  return mix;
};

// ---------- score table: the real engine, whole-building context ----------
/**
 * S[f][u]: value − cost − profit of floor f with unit u, from one evaluate per unit with every free floor set to it,
 * so height premium, retail factor, efficiency and the tall-building premium use the real building.
 * Also the non-residential FSR area and hotel keys each choice adds.
 */
export function scoreTable(slots, data, settings, opts) {
  const units = UNITS.map(u => ({ ...u, mixArr: unitMix(u, opts) }));
  const base = slots.map(s => s.floor);
  const table = slots.map(() => new Map());
  const hotelNonres = settings.hotelAsNonResidential ?? true;
  const fsrArea = (items) => items.reduce((a, i) => { const c = fsrClass(i.programme_id, data); return a + (i.level >= 1 && (c === 'nonres' || (c === 'hotel' && hotelNonres)) ? i.gfa : 0); }, 0);
  const keysOf = items => items.reduce((a, i) => a + keysOfItem(i, data), 0);
  const read = (r, k, ui) => { const fo = r.floors.find(x => x.level === slots[k].floor.level); table[k].set(ui, { s: fo.net, nonres: fsrArea(fo.items), keys: keysOf(fo.items), value: fo.value }); };
  // fixed floors: their own mix
  const r0 = evaluate(base, data, settings);
  slots.forEach((sl, k) => { if (sl.role === 'fixed') read(r0, k, -1); });
  const topLevel = slots[slots.length - 1].floor.level;
  // a free floor where nothing fits its height band may take any use (reported)
  slots.forEach(sl => { sl.relaxAll = false; if (sl.role === 'free' && !units.some(u => unitAllowed(u, { ...sl, topLevel }, data, opts, opts.strategy))) sl.relaxAll = true; });
  units.forEach((u, ui) => {
    const ok = slots.map(sl => sl.role === 'free' && unitAllowed(u, { ...sl, topLevel }, data, opts, opts.strategy));
    if (!ok.some(Boolean)) return;
    const fl = slots.map((sl, k) => (ok[k] ? { ...sl.floor, mix: u.mixArr.map(m => ({ ...m })) } : sl.floor));
    const r = evaluate(fl, data, settings);
    slots.forEach((sl, k) => { if (ok[k]) read(r, k, ui); });
  });
  // seeded run (e.g. from a precedent): moving away from the seed's main use on a floor costs a penalty, so the character stays
  if (opts.seed) {
    const seedMain = new Map(opts.seed.map(f => [f.level, [...f.mix].sort((a, b) => b.share - a.share)[0]?.programme_id]));
    const avg = table.reduce((a, m) => a + [...m.values()].reduce((b, x) => b + Math.abs(x.value), 0) / Math.max(1, m.size), 0) / Math.max(1, table.length);
    const pen = (opts.seedPenaltyShare ?? 0.05) * avg;
    slots.forEach((sl, k) => { if (sl.role !== 'free') return; const want = seedMain.get(sl.floor.level); for (const [ui, x] of table[k]) if (ui >= 0 && units[ui].mixArr[0].programme_id !== want && !units[ui].mixArr.some(m => m.programme_id === want)) x.s -= pen; });
  }
  return { units, table };
}

// ---------- DP over floors ----------
/**
 * Maximise Σ S − switch penalty − intensity-jump penalty, with the FSR non-residential minimum
 * and the hotel-keys cap as state. State: (unit on the previous floor, non-residential area in buckets, keys in buckets).
 */
export function solveDP(slots, score, data, opts, need) {
  const { units, table } = score;
  const nb = opts.bucketM2 ?? 1000, kb = 25;
  const R = need > 0 ? Math.ceil(need / nb) : 0;
  const KMAX = Math.floor(opts.maxHotelKeys / kb);
  const famInt = id => data.families.get(data.programmes.get(id)?.family_id)?.intensity ?? null;
  const intensityOf = ui => (ui < 0 ? null : Math.max(...units[ui].mixArr.map(m => famInt(m.programme_id) ?? 0)) || null);
  const avgS = Math.abs(table.reduce((a, m) => a + [...m.values()].reduce((b, x) => b + Math.abs(x.value), 0) / Math.max(1, m.size), 0) / table.length) || 1;
  const SW = opts.switchPenaltyShare * avgS, JUMP = 3 * SW + 0.02 * avgS;
  const opt = slots.map((sl, k) => [...table[k]].map(([ui, x]) => ({ ui, s: x.s, cn: Math.round(x.nonres / nb), ck: Math.ceil(x.keys / kb - 1e-9), I: sl.role === 'fixed' ? fixedInt(sl, data) : intensityOf(ui), key: sl.role === 'fixed' ? `fixed:${mixKey(sl.floor.mix)}` : units[ui].id })));
  const NN = R + 1, KK = KMAX + 1, NEG = -Infinity;
  let prev = null; const back = [];
  for (let k = 0; k < slots.length; k++) {
    const O = opt[k]; if (!O.length) return null;
    const cur = new Float64Array(O.length * NN * KK).fill(NEG), bp = new Int32Array(O.length * NN * KK).fill(-1);
    if (!prev) {
      O.forEach((o, oi) => { const n = Math.min(R, o.cn), kk = o.ck; if (kk <= KMAX) { cur[(oi * NN + n) * KK + kk] = o.s; } });
    } else {
      const P = opt[k - 1];
      for (let pi = 0; pi < P.length; pi++) for (let n = 0; n < NN; n++) for (let kk = 0; kk < KK; kk++) {
        const v = prev[(pi * NN + n) * KK + kk]; if (v === NEG) continue;
        for (let oi = 0; oi < O.length; oi++) {
          const o = O[oi], k2 = kk + o.ck; if (k2 > KMAX) continue;
          let pen = 0;
          if (P[pi].key !== o.key) { pen += SW; if (P[pi].I != null && o.I != null && Math.abs(P[pi].I - o.I) >= 3) pen += JUMP; }
          const n2 = Math.min(R, n + o.cn), idx = (oi * NN + n2) * KK + k2, nv = v + o.s - pen;
          if (nv > cur[idx]) { cur[idx] = nv; bp[idx] = (pi * NN + n) * KK + kk; }
        }
      }
    }
    back.push(bp); prev = cur;
  }
  // best end state meeting the FSR minimum
  let best = NEG, bi = -1;
  const O = opt[opt.length - 1];
  for (let oi = 0; oi < O.length; oi++) for (let kk = 0; kk < KK; kk++) { const idx = (oi * NN + R) * KK + kk; if (prev[idx] > best) { best = prev[idx]; bi = idx; } }
  if (bi < 0 || best === NEG) return null;
  const pick = new Array(slots.length);
  for (let k = slots.length - 1, idx = bi; k >= 0; k--) { const oi = Math.floor(idx / (NN * KK)); pick[k] = opt[k][oi].ui; idx = back[k][idx]; }
  return { pick, objective: best };
}
function fixedInt(sl, data) {
  const ints = sl.floor.mix.map(m => data.families.get(data.programmes.get(m.programme_id)?.family_id)?.intensity).filter(x => x != null);
  return ints.length ? Math.max(...ints) : null;
}

// ---------- assemble, check, polish ----------
function build(slots, pick, units) { return slots.map((sl, k) => (sl.role === 'fixed' || pick[k] < 0 ? { ...sl.floor, mix: sl.floor.mix.map(m => ({ ...m })) } : { ...sl.floor, mix: units[pick[k]].mixArr.map(m => ({ ...m })) })); }
function keysIn(r, data) { return r.items.reduce((a, i) => a + keysOfItem(i, data), 0); }
/** Constraint check on a whole building. Returns a list of breaches (empty = feasible). */
export function breaches(r, data, opts, slots, floors) {
  const out = [];
  if (opts.respectFsr && r.fsr.requiredNonres && !r.fsr.pass) out.push(`9.0 FSR non-residential rule not met (${Math.round(r.settings.hotelAsNonResidential ? r.fsr.nonresWithHotel : r.fsr.nonresWithoutHotel).toLocaleString('en-CA')} of ${Math.round(r.fsr.requiredNonres).toLocaleString('en-CA')} m²)`);
  const keys = keysIn(r, data); if (keys > opts.maxHotelKeys + 0.5) out.push(`hotel keys ${Math.round(keys)} over the cap of ${opts.maxHotelKeys}`);
  const deckFloors = floors.filter(f => f.mix.some(m => m.programme_id === 'LE1')).length; if (deckFloors > opts.maxDeckFloors) out.push(`${deckFloors} deck floors over the cap of ${opts.maxDeckFloors}`);
  const sale = r.items.filter(i => isSaleRow(i.rowId)), lux = sale.filter(i => i.rowId === 'R2').reduce((a, i) => a + i.gfa, 0), saleG = sale.reduce((a, i) => a + i.gfa, 0);
  if (saleG > 0 && lux / saleG > opts.maxLuxuryShare + 1e-9) out.push('luxury condos over their share of sale housing');
  if (r.rules.some(x => x.type === 'f1')) out.push('F1 occupancy with A/B/C');
  if (slots) slots.forEach((sl, k) => { if (sl.role === 'fixed' && mixKey(sl.floor.mix) !== mixKey(floors[k].mix)) out.push(`L${sl.floor.level} (fixed) was changed`); });
  return out;
}
const headroomOf = r => r.totals.rlvAfterCac - (r.totals.landPrice ?? 0);
const better = (a, b) => (VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict]) || (headroomOf(a) - headroomOf(b));
/** Runs of the same unit among free floors (the polish works on these). */
function runsOf(slots, pick) {
  const runs = [];
  slots.forEach((sl, k) => { const u = sl.role === 'fixed' ? null : pick[k], last = runs[runs.length - 1]; if (u == null) return; if (last && last.u === u && last.to === k - 1) last.to = k; else runs.push({ u, from: k, to: k }); });
  return runs;
}
/** Merge runs shorter than the minimum (outside the podium and crown) into the better neighbour. */
function enforceMinBand(slots, pick, score, opts) {
  const p = [...pick];
  for (let pass = 0; pass < 3; pass++) {
    const runs = runsOf(slots, p);
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i], len = r.to - r.from + 1;
      if (len >= opts.minBand || slots.slice(r.from, r.to + 1).every(s => s.zone !== 'tower')) continue;
      const cands = [runs[i - 1], runs[i + 1]].filter(n => n && (n.to === r.from - 1 || n.from === r.to + 1)).map(n => n.u)
        .filter(u => slots.slice(r.from, r.to + 1).every((s, j) => score.table[r.from + j].has(u)));
      if (!cands.length) continue;
      const sum = u => slots.slice(r.from, r.to + 1).reduce((a, s, j) => a + score.table[r.from + j].get(u).s, 0);
      const u = cands.sort((a, b) => sum(b) - sum(a))[0];
      for (let k = r.from; k <= r.to; k++) p[k] = u;
    }
  }
  return p;
}
function polish(slots, pick, score, data, settings, opts, startR) {
  let best = { pick: [...pick], r: startR }, evals = 0;
  const shortRun = p => runsOf(slots, p).some(r => r.to - r.from + 1 < opts.minBand && slots.slice(r.from, r.to + 1).some(s => s.zone === 'tower'));
  const startShort = shortRun(pick);
  const tryPick = p => { if (!startShort && shortRun(p)) return; const fl = build(slots, p, score.units); const r = evaluate(fl, data, settings); evals++; if (breaches(r, data, opts, slots, fl).length) return; if (better(r, best.r) > 1e-6) best = { pick: [...p], r }; };
  for (let pass = 0; pass < opts.polishPasses; pass++) {
    const before = headroomOf(best.r);
    const runs = runsOf(slots, best.pick);
    for (const run of runs) {
      // swap the run's use for its top-3 alternatives by summed score
      const alt = [...score.table[run.from].keys()].filter(u => u !== run.u && u >= 0 && slots.slice(run.from, run.to + 1).every((s, j) => score.table[run.from + j].has(u)))
        .map(u => ({ u, s: slots.slice(run.from, run.to + 1).reduce((a, sl, j) => a + score.table[run.from + j].get(u).s, 0) })).sort((a, b) => b.s - a.s).slice(0, 3);
      for (const { u } of alt) { const p = [...best.pick]; for (let k = run.from; k <= run.to; k++) p[k] = u; tryPick(p); }
      // extend or shrink by one floor at the top
      for (const k of [run.to + 1, run.to]) {
        if (k < 0 || k >= slots.length || slots[k].role === 'fixed') continue;
        const p = [...best.pick];
        if (k === run.to + 1 && score.table[k].has(run.u)) { p[k] = run.u; tryPick(p); }
        else if (k === run.to && k + 1 < slots.length && slots[k + 1].role !== 'fixed' && score.table[k].has(best.pick[k + 1])) { p[k] = best.pick[k + 1]; tryPick(p); }
      }
    }
    if (headroomOf(best.r) - before < 1) break;
  }
  return { ...best, evals };
}

// ---------- strategies, choice and report ----------
const STRATEGIES = [
  { id: 'all', name: 'All uses' },
  { id: 'no_sale', name: 'No condos for sale', noSale: true },
  { id: 'employment', name: 'Employment only (no housing, no CAC)', noHousing: true },
  { id: 'no_deck', name: 'All uses, no ticketed deck', noDeck: true, needsDeck: true },
];

/** Run one strategy: score, DP (relaxing fits only if the FSR rule cannot otherwise be met), min band, polish. */
export function runStrategy(floors, data, settings, opts, strat) {
  const o = { ...opts, strategy: strat };
  const slots = skeleton(floors, data, settings, o);
  let relaxed = false, score = scoreTable(slots, data, settings, o);
  const need = o.respectFsr && settings.siteAreaM2 && settings.minNonresFsr ? settings.minNonresFsr * settings.siteAreaM2 : 0;
  let margin = 0, dp = null, r = null, fl = null, br = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    dp = solveDP(slots, score, data, o, need + margin);
    if (!dp && !relaxed) { relaxed = true; o.relaxFits = true; score = scoreTable(slots, data, settings, o); dp = solveDP(slots, score, data, o, need + margin); }
    if (!dp) break;
    const pick = enforceMinBand(slots, dp.pick, score, o);
    fl = build(slots, pick, score.units); r = evaluate(fl, data, settings);
    br = breaches(r, data, o, slots, fl);
    if (!br.length) { const p = polish(slots, pick, score, data, settings, o, r); fl = build(slots, p.pick, score.units); r = p.r; break; }
    margin += 2000;   // bucket rounding or band merging fell short of the FSR minimum: ask for more and solve again
  }
  if (!dp || !r) return { strategy: strat, feasible: false, reason: need ? 'the 9.0 FSR non-residential minimum cannot be met on these floors with these uses' : 'no use fits these floors', relaxedFits: relaxed };
  const looseFloors = slots.filter(s => s.relaxAll).map(s => s.floor.level);
  return { strategy: strat, feasible: br.length === 0, breaches: br, floors: fl, result: r, relaxedFits: relaxed, looseFloors, slots, units: score.units, headroom: headroomOf(r) };
}

/** Group a stack into bands of identical mix for the report. */
function bandsOf(floors, data) {
  const out = [];
  for (const f of floors) { const key = mixKey(f.mix), last = out[out.length - 1]; if (last && last.key === key) { last.to = f.level; last.floors.push(f); } else out.push({ key, from: f.level, to: f.level, mix: f.mix, floors: [f] }); }
  return out;
}
const M = x => `${x < 0 ? '−' : ''}C$${Math.abs(x / 1e6).toFixed(0)} M`;
const nameOf = (mix, data) => mix.map(m => data.programmes.get(m.programme_id)?.name ?? m.programme_id).join(' + ');

/** Search for the inputs that would flip the verdict to Works (gap report). */
export function gapToWorks(floors, data, settings) {
  const base = evaluate(floors, data, settings);
  const land = base.totals.landPrice;
  // The money test: residual after CAC covers the land price. The presale cap (weak market) is reported on its own,
  // because it holds the verdict at Marginal whatever the numbers do.
  const covers = s => { const r = evaluate(floors, data, { ...settings, ...s }); return r.totals.landPrice != null ? r.totals.rlvAfterCac >= r.totals.landPrice : r.totals.rlvAfterCac >= 0; };
  const search = (mk, lo, hi) => { if (!covers(mk(hi))) return null; for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (covers(mk(mid))) hi = mid; else lo = mid; } return hi; };
  const allRows = Object.fromEntries([...data.rows.keys()].map(id => [id, 1]));
  const cut = search(x => ({ hardCostScale: 1 - x }), 0, 0.6);
  const rise = search(x => ({ valueScale: Object.fromEntries(Object.keys(allRows).map(id => [id, (settings.valueScale?.[id] ?? 1) * (1 + x)])) }), 0, 1.5);
  return {
    landThatWorks: base.totals.rlvAfterCac > 0 ? base.totals.rlvAfterCac : null, land,
    hardCostCut: cut, valueRise: rise,
    normalPresales: evaluate(floors, data, { ...settings, presaleMarket: 'normal' }).verdict,
    noCac: evaluate(floors, data, { ...settings, cacShare: 0 }).verdict,
    presaleCap: base.marketDependent && settings.presaleMarket === 'weak',
  };
}

/**
 * Find a mix that works. floors: the current form (geometry fixed). Returns the best stack, all strategies and a report.
 */
export function optimiseMix(floorsIn, data, settingsIn = {}, optsIn = {}) {
  const t0 = Date.now();
  const settings = { ...defaultSettings(data), ...settingsIn };
  const opts = { ...optimiserDefaults(data), ...optsIn };
  const floors = [...floorsIn].sort((a, b) => a.level - b.level);
  const current = evaluate(floors, data, settings);
  const strategies = STRATEGIES.filter(s => !s.needsDeck || opts.allowDeck).map(s => runStrategy(floors, data, settings, opts, s));
  const feasible = strategies.filter(s => s.feasible);
  let best = feasible.slice().sort((a, b) => better(b.result, a.result))[0] || null;
  // never hand back something worse than a stack that already meets the rules
  const curBreaches = breaches(current, data, opts, null, floors);
  const lockedMoved = best && floors.some((f, k) => f.locked && mixKey(f.mix) !== mixKey(best.floors[k].mix));
  if (!curBreaches.length && (!best || better(current, best.result) > 0 || lockedMoved)) best = { strategy: { id: 'current', name: 'Keep the current stack' }, feasible: true, floors: floors.map(f => ({ ...f, mix: f.mix.map(m => ({ ...m })) })), result: current, slots: skeleton(floors, data, settings, opts), headroom: headroomOf(current), keptCurrent: true };
  const curNote = curBreaches.length ? `The current stack breaks: ${curBreaches.join('; ')}${opts.respectFsr ? ' (untick the FSR option to search on money alone)' : ''}.\n\n` : '';
  const report = best ? curNote + reportText(best, strategies, current, data, settings, opts) : `No mix meets the rules on these floors: ${strategies.map(s => s.reason).filter(Boolean)[0] || 'every option breaks a cap'}. Try fewer floors, larger plates or a different brief setting.\n\nIndicative early-design estimate; a starting point, not a recommendation.`;
  return { best, strategies, current, report, ms: Date.now() - t0, options: opts };
}

function reportText(best, strategies, current, data, settings, opts) {
  const r = best.result, t = r.totals, L = [];
  const vName = { works: 'Works', marginal: 'Marginal', doesnt_work: "Doesn't work", needs_land: 'Land price needed', incomplete: 'Incomplete' };
  L.push(`Best found: ${vName[r.verdict]} with the “${best.strategy.name}” strategy. Residual after CAC ${M(t.rlvAfterCac)} against a land price of ${t.landPrice == null ? 'not set' : M(t.landPrice)}${t.landEstimated ? ' (estimated)' : ''}: headroom ${M(best.headroom)}. The current stack: ${vName[current.verdict]}, headroom ${M(headroomOf(current))}.`);
  L.push('', 'Strategies:');
  for (const s of strategies) L.push(`• ${s.strategy.name}: ${s.feasible ? `${vName[s.result.verdict]}, headroom ${M(s.headroom)}${s.result.totals.cac ? `, CAC ${M(s.result.totals.cac)}` : ', CAC 0'}` : `not possible (${s.reason || s.breaches?.join('; ')})`}${s.relaxedFits ? ' — non-residential uses placed outside their usual height band to meet the FSR rule' : ''}${s.looseFloors?.length ? ` — ${s.looseFloors.length} floor(s) where none of its uses usually fits` : ''}.`);
  // binding constraints
  const bind = [];
  if (opts.respectFsr && r.fsr.requiredNonres) {
    const nonresItems = r.items.filter(i => i.level >= 1 && ['nonres', ...(settings.hotelAsNonResidential ? ['hotel'] : [])].includes(fsrClass(i.programme_id, data)));
    const byUse = new Map(); for (const i of nonresItems) { const e = byUse.get(i.name) || { gfa: 0, net: 0 }; e.gfa += i.gfa; e.net += i.net_contribution; byUse.set(i.name, e); }
    const top = [...byUse].sort((a, b) => b[1].gfa - a[1].gfa)[0];
    bind.push(`the 9.0 FSR rule forces ${Math.round(r.fsr.requiredNonres).toLocaleString('en-CA')} m² of non-residential${top ? `, mostly ${top[0]} at ${top[1].net < 0 ? '−' : ''}C$${Math.abs(Math.round(top[1].net / top[1].gfa)).toLocaleString('en-CA')}/m²` : ''}`);
  }
  if (best.relaxedFits) bind.push('non-residential uses sit outside their usual height band (e.g. offices high) because the FSR rule needs them');
  const keys = keysIn(r, data); if (keys > opts.maxHotelKeys * 0.9) bind.push(`the hotel cap (${opts.maxHotelKeys} keys) is nearly reached`);
  if (r.marketDependent && settings.presaleMarket === 'weak') bind.push('condos depend on presales in a weak market, which caps the verdict at Marginal');
  if (bind.length) L.push('', `Binding: ${bind.join('; ')}.`);
  L.push('', 'Bands, base to crown:');
  const byLevel = new Map(r.floors.map(f => [f.level, f]));
  for (const b of bandsOf(best.floors, data)) {
    const net = b.floors.reduce((a, f) => a + (byLevel.get(f.level)?.net ?? 0), 0);
    const slot = best.slots.find(s => s.floor.level === b.from);
    const why = slot?.role === 'fixed' ? slot.why : b.mix.some(m => m.programme_id === 'SE1') ? 'retail earns only at grade' : b.mix.some(m => /^LV/.test(m.programme_id)) ? 'homes gain value with height' : b.mix.some(m => /^WK|^CH2/.test(m.programme_id)) ? 'non-residential area for the FSR rule, or the best earner here' : b.mix.some(m => /^ST/.test(m.programme_id)) ? 'hotel: non-residential if the City counts it so' : b.mix.some(m => m.programme_id === 'LE1') ? 'the view: one ticketed total at the top' : 'best earner on these floors';
    L.push(`• ${b.from === b.to ? `L${b.from}` : `L${b.from}–L${b.to}`}: ${nameOf(b.mix, data)} (${M(net)}) — ${why}.`);
  }
  if (r.verdict !== 'works') {
    const g = gapToWorks(best.floors, data, settings);
    L.push('', 'On current numbers this form may not work. What would flip it to Works:');
    L.push(`• Land price: ${g.landThatWorks ? `${M(g.landThatWorks)} or less (now ${g.land == null ? 'not set' : M(g.land)})` : 'none — the residual is negative even with free land'}.`);
    L.push(`• Hard cost: ${g.hardCostCut != null ? `${Math.ceil(g.hardCostCut * 100)}% lower would cover the land` : 'not even 60% lower covers the land'}.`);
    L.push(`• Values: ${g.valueRise != null ? `${Math.ceil(g.valueRise * 100)}% higher across all uses would cover the land` : 'not even 150% higher covers the land'}.`);
    if (g.presaleCap) L.push('• Even when the money covers the land, the verdict stays Marginal while the scheme relies on condo presales in a weak market (lenders want 60–70% presold).');
    L.push(`• A normal presale market: ${vName[g.normalPresales]}; no CAC: ${vName[g.noCac]}.`);
    const sug = [];
    if (opts.respectFsr && r.fsr.requiredNonres) sug.push('if the brief allows, less non-residential area (the 9.0 FSR rule is the biggest cost here)');
    sug.push('fewer floors or smaller upper plates (each extra floor costs more than it earns above the condo band)');
    sug.push('a different site or land deal');
    L.push(`Form changes to try: ${sug.join('; ')}.`);
  }
  L.push('', 'Indicative early-design estimate; a starting point, not a recommendation.');
  return L.join('\n');
}
