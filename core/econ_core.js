// Program Value Visualizer — calculation engine.
// Pure functions, no page code: runs in the browser and in Node tests.
// Every result is an indicative early-design estimate, not a feasibility study.

export const LABEL = 'Indicative early-design estimate — not a feasibility study, appraisal or compliance check.';
const SALE_ROWS = new Set(['R1', 'R2', 'R3']);
const RESIDENTIAL_ROWS = new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'S2']);
const HOTEL_ROWS = new Set(['H1', 'H2', 'H3', 'H4', 'H5']);
const OFFICE_ROWS = new Set(['O1', 'O2', 'O3']);
const NO_FSR_PROGRAMMES = new Set(['SB1', 'SB2', 'SB3', 'SB4', 'SB5', 'SB6', 'SB7', 'SB8', 'SB10', 'SB11', 'AM7', 'AM8', 'AM9']);

export const FT2_PER_M2 = 10.764;

/** Recompute a value row from its inputs. Returns null when the method has no formula. */
export function recomputeValue(row) {
  const v = k => (row.inputs?.[k] ? row.inputs[k].value : undefined);
  const n = k => v(k) ?? 0;
  switch (row.method) {
    case 'sale': return v('sale_price_per_ft2_net') * FT2_PER_M2 * v('efficiency') * (1 - n('selling_cost'));
    case 'income': {
      const rentYr = v('rent_per_ft2_net_year') ?? (v('rent_per_ft2_net_month') * 12);
      const net = rentYr * (1 - n('vacancy')) * (1 - n('leakage')) * (1 - n('opex_ratio')) - n('opex_per_ft2_year');
      return net * FT2_PER_M2 / v('cap_rate') * v('efficiency');
    }
    case 'per_key': return v('noi_per_key') / v('cap_rate') / v('m2_per_key');
    case 'visitors': return v('visitors_per_year') * v('ticket_price') * (1 + n('fnb_uplift')) * v('operating_margin') / v('cap_rate') / v('deck_area_m2');
    case 'per_stall_sale': return v('price_per_stall') / v('m2_per_stall');
    case 'per_stall_income': return v('rate_per_stall_month') * 12 * v('utilisation') * v('operating_margin') / v('cap_rate') / v('m2_per_stall');
    case 'none': return 0;
    default: return null;
  }
}

const num = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const val = o => (o && typeof o.value === 'number' ? o.value : null);

/** Index the raw JSON files into one object the engine can use. */
export function indexData(raw) {
  const { families, programmes, values, costs, charges, assumptions, codeRules, brief, sources } = raw;
  return {
    raw,
    families: new Map(families.families.map(f => [f.family_id, f])),
    programmes: new Map(programmes.programmes.map(p => [p.id, p])),
    rows: new Map(values.rows.map(r => [r.id, r])),
    lines: new Map(costs.lines.map(l => [l.id, l])),
    costs, charges, assumptions, codeRules, brief, sources: new Map((sources?.sources || []).map(s => [s.id, s])),
  };
}

/** Default project settings, all editable in the tool. */
export function defaultSettings(data) {
  const a = data.assumptions, b = data.brief;
  return {
    podiumTopFloor: 4,
    neighbourRoofM: null,              // height of neighbouring roofs for the condo "above neighbours" bonus
    siteAreaM2: val(b?.site?.area_m2) ?? null,
    minNonresFsr: b?.rules?.find(r => r.id === 'min_nonres_fsr')?.fsr ?? null,
    heightRange: b?.height_m ? [b.height_m.min, b.height_m.max] : null,
    hotelAsNonResidential: (b?.hotel_classification?.default ?? 'non_residential') === 'non_residential',
    supertallPremium: val(data.costs.other.supertall_premium),
    supertallThresholdM: data.costs.other.supertall_premium.applies_above_height_m,
    softCost: val(data.costs.other.soft_cost),
    financeFactor: null,               // null = rate x years x draw factor
    financeRate: val(a.finance.rate), buildYears: val(a.finance.build_years), drawFactor: val(a.finance.draw_factor),
    officeLeasingCost: val(data.costs.other.office_leasing_cost),
    officeTenantAllowance: val(data.costs.other.office_tenant_allowance),
    hotelFfePerKey: val(data.costs.other.hotel_ffe_per_key),
    profitOnCost: val(a.profit_on_cost),
    permitDate: data.charges.default_permit_date,
    applyEscalation: true,             // City charges rise 3%/yr to 2029 (pack)
    landPrice: val(a.land.price),
    landValueCurrentZoning: val(a.land.value_under_current_zoning),
    cacShare: val(data.charges.cac.share_of_lift),
    employmentOnly: 'auto',            // 'auto' | true | false
    publicRunningCostPerM2: val(a.public_running_cost.cost_per_m2_year),
    publicCapRate: val(a.public_running_cost.capitalisation_rate),
    publicPayer: 'cross_subsidy',      // cross_subsidy | cac_endowment | ticketed_deck | city_or_partner
    presaleMarket: 'weak',             // 'weak' | 'normal'
    premiumScale: 1,                   // sensitivity multiplier on condo height premium
    programme: {},                     // per-programme overrides: { O1: { valuePerNetM2, valuePerM2Gfa, efficiency, hardCostPerM2, premiumPerFloor, chargePerM2 } }
    valueScale: {},                    // per value-row multipliers used by sensitivity: { O1: 1.2 }
    hardCostScale: 1,
  };
}

// ---------- lookups ----------
function premiumGroup(data, rowId) {
  const g = data.assumptions.height_premium.groups;
  for (const [name, grp] of Object.entries(g)) if (grp.rows.includes(rowId)) return { name, perFloor: val(grp.per_floor) };
  return null;
}
function curveEfficiency(data, rowId, level) {
  const c = data.assumptions.efficiency_curve;
  const kind = c.applies_to.office.includes(rowId) ? 'office' : c.applies_to.residential.includes(rowId) ? 'residential' : null;
  if (!kind) return null;
  const bands = c.bands;
  const lv = Math.max(1, level);
  const band = bands.find(b => lv >= b.from_floor && lv <= b.to_floor) || bands[bands.length - 1];
  return { value: val(band[kind]), beyond: lv > bands[bands.length - 1].to_floor };
}
function retailFactor(data, rowId, level) {
  const r = data.assumptions.height_premium.retail_floor_factor;
  if (!r.rows.includes(rowId)) return null;
  if (level <= 0) return val(r.below_grade);
  if (level === 1) return val(r.level_1);
  if (level === 2) return val(r.level_2);
  return val(r.above_level_2);
}
function escalationFactor(data, baseYear, permitDate, on) {
  const e = data.charges.escalation;
  if (!on || !e || !baseYear) return 1;
  const year = Number(String(permitDate).slice(0, 4));
  const steps = Math.max(0, Math.min(year, e.until_year) - baseYear);
  return Math.pow(1 + val(e), steps);
}
function chargeRates(data, cls, permitDate, escalate = false) {
  const C = data.charges, c = C.classes[cls] || C.classes.unknown;
  const kind = c.utilities_dcl === 'residential' ? 'residential' : 'commercial';
  const fD = escalationFactor(data, C.components.dcl.escalation_base_year, permitDate, escalate);
  const fU = escalationFactor(data, C.components.utilities_dcl.escalation_base_year, permitDate, escalate);
  const dcl = c.dcl ? val(C.components.dcl.rates[kind]) * fD : 0;
  const util = (val(C.components.utilities_dcl.rates[c.utilities_dcl]) ?? 0) * fU;
  let acc = 0;
  if (c.acc === 'residential' || c.acc === 'commercial') {
    const steps = C.components.acc.steps.filter(s => s.from <= permitDate);
    const step = steps.length ? steps[steps.length - 1] : null;
    acc = step ? val(step.rates[c.acc]) * escalationFactor(data, Number(step.from.slice(0, 4)), permitDate, escalate) : 0;
  }
  return { dcl: num(dcl), util: num(util), acc: num(acc), flat: c.acc === 'flat_per_permit' };
}
function baseHardCost(data, programmeId, rowId) {
  const m = data.costs.cost_map;
  const refs = (programmeId in m.by_programme ? m.by_programme[programmeId] : m.by_value_row[rowId]) || null;
  if (!refs) return null;
  let base = 0, found = false;
  for (const ref of refs) {
    const l = data.lines.get(ref);
    if (!l || l.add_on) continue;     // add-ons have no default; user can add them through hardCostPerM2
    base += val(l.default_m2); found = true;
  }
  return found ? { base, lines: refs } : null;
}

/** Floor position bands: B below grade, G podium, L low (<= 60 m), M mid, H high, T top, S seam (tagged). */
export function floorBands(floor, ctx) {
  const bands = new Set();
  if (floor.level <= 0) { bands.add('B'); return bands; }
  if (floor.level <= ctx.podiumTopFloor) bands.add('G');
  const top = floor.elevation_m + floor.height_m;
  if (floor.elevation_m < 60) bands.add('L');
  else if (top <= ctx.height * 2 / 3) bands.add('M');
  else bands.add('H');
  if (floor.level > ctx.maxLevel - 3) bands.add('T');
  if ((floor.tags || []).includes('seam')) bands.add('S');
  return bands;
}

/** Resolve what one mix item is worth per m2, with its sources. */
function resolveItem(data, settings, item, floor) {
  const p = data.programmes.get(item.programme_id);
  const o = settings.programme[item.programme_id] || {};
  const flags = [];
  if (!p) return { error: `unknown programme ${item.programme_id}` };
  const rowId = p.value_status === 'linked' ? p.value_ref : null;
  const row = rowId ? data.rows.get(rowId) : null;
  // value per m2 of GFA (default) and the efficiency it was derived with
  let valuePerM2Gfa = o.valuePerM2Gfa ?? (row ? val(row.value_per_m2_gfa) : (p.value_status === 'zero' ? 0 : null));
  if (valuePerM2Gfa === null && o.valuePerNetM2 === undefined) flags.push('user_value_missing');
  const rowEff = row?.inputs?.efficiency ? val(row.inputs.efficiency) : 1;
  const curve = rowId ? curveEfficiency(data, rowId, floor.level) : null;
  let efficiency = o.efficiency ?? (curve ? curve.value : rowEff);
  if (curve?.beyond && o.efficiency === undefined) flags.push('efficiency_beyond_curve');
  const valuePerNetM2 = o.valuePerNetM2 ?? (valuePerM2Gfa === null ? 0 : valuePerM2Gfa / (rowEff || 1));
  const earnsBy = row?.earns_by ?? p.earns_by ?? (p.value_status === 'zero' ? 'public' : 'unknown');
  const pg = rowId ? premiumGroup(data, rowId) : null;
  const premiumPerFloor = o.premiumPerFloor ?? (pg ? pg.perFloor * (pg.name === 'condo' ? settings.premiumScale : 1) : 0);
  const rf = rowId ? retailFactor(data, rowId, floor.level) : null;
  const hc = baseHardCost(data, item.programme_id, rowId);
  const chargeClass = row?.city_charge_class ?? (earnsBy === 'support' ? 'unknown' : (p.value_status === 'zero' ? 'unknown' : 'commercial'));
  return { p, row, rowId, valuePerNetM2, efficiency, earnsBy, premiumPerFloor, retailFactor: rf, hc, o, flags, chargeClass,
    scale: settings.valueScale[rowId] ?? 1 };
}

/**
 * Evaluate a building.
 * floors: [{ level, elevation_m, height_m, area_m2, area_basis: 'gross'|'net', mix: [{ programme_id, share }], tags? }]
 */
export function evaluate(floorsIn, data, settingsIn = {}) {
  const settings = { ...defaultSettings(data), ...settingsIn, programme: { ...(settingsIn.programme || {}) }, valueScale: { ...(settingsIn.valueScale || {}) } };
  const floors = [...floorsIn].sort((a, b) => a.level - b.level);
  const above = floors.filter(f => f.level >= 1);
  const height = above.length ? Math.max(...above.map(f => f.elevation_m + f.height_m)) : 0;
  const maxLevel = above.length ? Math.max(...above.map(f => f.level)) : 0;
  const ctx = { podiumTopFloor: settings.podiumTopFloor, height, maxLevel };
  const supertall = height > settings.supertallThresholdM;
  const financeFactor = settings.financeFactor ?? settings.financeRate * settings.buildYears * settings.drawFactor;
  const warnings = [], rules = [], errors = [];
  const items = [];
  const floorOut = [];
  let flatPermitFee = false;

  for (const f of floors) {
    const shareSum = f.mix.reduce((s, m) => s + num(m.share), 0);
    if (f.mix.length && Math.abs(shareSum - 1) > 0.005) rules.push({ type: 'mix_sum', level: f.level, severity: 'error', text: `L${f.level}: shares add up to ${(shareSum * 100).toFixed(0)}%, not 100%.` });
    const bands = floorBands(f, ctx);
    const fo = { level: f.level, elevation_m: f.elevation_m, height_m: f.height_m, area_m2: f.area_m2, bands: [...bands], items: [], value: 0, cost: 0, profit: 0, net: 0, gfa: 0 };
    for (const m of f.mix) {
      const r = resolveItem(data, settings, m, f);
      if (r.error) { warnings.push(r.error); errors.push(r.error); continue; }
      // area
      let gfa, net;
      if (f.area_basis === 'net') { net = f.area_m2 * m.share; gfa = net / (r.efficiency > 0 ? r.efficiency : 1); }
      else { gfa = f.area_m2 * m.share; net = gfa * r.efficiency; }
      // value
      const premium = 1 + r.premiumPerFloor * Math.max(0, f.level - settings.podiumTopFloor);
      let bonus = 1;
      const bonusDef = data.assumptions.height_premium.above_neighbours_bonus;
      if (settings.neighbourRoofM != null && bonusDef.rows.includes(r.rowId) && f.elevation_m >= settings.neighbourRoofM) bonus = 1 + val(bonusDef);
      const floorFactor = r.retailFactor ?? 1;
      if (r.retailFactor === 0) rules.push({ type: 'retail_height', level: f.level, severity: 'warning', text: `L${f.level}: ${r.p.name} above level 2 earns nothing (retail floor rule).` });
      let gross = net * r.valuePerNetM2 * premium * bonus * floorFactor * r.scale;
      const leasing = OFFICE_ROWS.has(r.rowId) ? gross * settings.officeLeasingCost : 0;
      const value = gross - leasing;
      // cost
      let hardRate = r.o.hardCostPerM2 ?? null, costEstimated = false;
      if (hardRate === null && r.hc) {
        hardRate = r.hc.base * (supertall ? 1 + settings.supertallPremium : 1);
        if (OFFICE_ROWS.has(r.rowId)) hardRate += settings.officeTenantAllowance;
      }
      if (hardRate === null) costEstimated = true;   // filled in below from the floor or project average
      const keys = r.rowId === 'H1' ? net / val(r.row.inputs.m2_per_key) : 0;
      const ffe = keys * settings.hotelFfePerKey;
      const rates = chargeRates(data, r.chargeClass, settings.permitDate, settings.applyEscalation);
      if (rates.flat) flatPermitFee = true;
      const chargeRate = r.o.chargePerM2 ?? (rates.dcl + rates.util + rates.acc);
      const it = { level: f.level, programme_id: m.programme_id, name: r.p.name, family_id: r.p.family_id, rowId: r.rowId, earnsBy: r.earnsBy,
        share: m.share, gfa, net, efficiency: r.efficiency, premium, value, grossValue: gross, leasing, hardRate, costEstimated, ffe,
        chargeRate, charges: { dcl: gfa * (r.o.chargePerM2 != null ? 0 : rates.dcl), util: gfa * (r.o.chargePerM2 != null ? 0 : rates.util), acc: gfa * (r.o.chargePerM2 != null ? 0 : rates.acc), override: r.o.chargePerM2 != null ? gfa * r.o.chargePerM2 : 0 },
        chargeClass: r.chargeClass, flags: r.flags, fits: r.p.fits, bands: [...bands], occupancy: r.p.occupancy_group || [] };
      items.push(it); fo.items.push(it);
      // rules: fits
      if (r.p.fits?.length && !r.p.fits.some(x => bands.has(x)))
        rules.push({ type: 'fits', level: f.level, severity: 'warning', text: `L${f.level}: ${r.p.name} usually fits ${r.p.fits.join('/')} (this floor is ${[...bands].join('/')}).` });
      if (r.p.max_floor != null && f.level > r.p.max_floor)
        rules.push({ type: 'max_floor', level: f.level, severity: 'warning', text: `L${f.level}: ${r.p.name} is above its maximum floor (${r.p.max_floor}).` });
      if (r.flags.includes('user_value_missing'))
        rules.push({ type: 'user_value', level: f.level, severity: 'info', text: `L${f.level}: ${r.p.name} has no sourced value — enter one (counted as 0 until then).` });
    }
    floorOut.push(fo);
  }

  // ticketed deck: total visitor income (row value x its reference deck area) spread over the deck area actually drawn
  const deckItems = items.filter(i => i.rowId && data.rows.get(i.rowId)?.method === 'visitors' && settings.programme[i.programme_id]?.valuePerM2Gfa == null);
  if (deckItems.length) {
    const row = data.rows.get(deckItems[0].rowId);
    const total = val(row.value_per_m2_gfa) * val(row.inputs.deck_area_m2) * (settings.valueScale[row.id] ?? 1);
    const deckGfa = deckItems.reduce((s, i) => s + i.gfa, 0);
    for (const i of deckItems) { i.grossValue = total * i.gfa / deckGfa; i.value = i.grossValue; }
    rules.push({ type: 'deck', level: null, severity: 'info', text: `Ticketed deck: ${Math.round(val(row.inputs.visitors_per_year)).toLocaleString('en-CA')} visitors a year (an assumption, no visitor study) give one total value, spread over the ${Math.round(deckGfa).toLocaleString('en-CA')} m² of deck drawn. The most fragile number in the tool.` });
  }

  // costs for items without a priced line: floor average, then project average
  const priced = items.filter(i => !i.costEstimated);
  const projAvg = priced.length ? priced.reduce((s, i) => s + i.hardRate * i.gfa, 0) / Math.max(1e-9, priced.reduce((s, i) => s + i.gfa, 0)) : 0;
  for (const fo of floorOut) {
    const fp = fo.items.filter(i => !i.costEstimated);
    const avg = fp.length ? fp.reduce((s, i) => s + i.hardRate * i.gfa, 0) / Math.max(1e-9, fp.reduce((s, i) => s + i.gfa, 0)) : projAvg;
    for (const i of fo.items) if (i.costEstimated) i.hardRate = avg;
  }
  const estimated = new Map();
  for (const i of items) if (i.costEstimated) { const e = estimated.get(i.programme_id) || { name: i.name, gfa: 0, levels: [] }; e.gfa += i.gfa; e.levels.push(i.level); estimated.set(i.programme_id, e); }
  for (const [pid, e] of estimated) rules.push({ type: 'cost_estimated', level: e.levels[0], severity: 'warning', text: `${pid} ${e.name}: no published cost line, so it is costed at the floor or project average (${e.levels.length} floor${e.levels.length > 1 ? 's' : ''}). Enter a hard cost in Floors.` });
  for (const i of items) {
    i.hard = i.gfa * i.hardRate * settings.hardCostScale + i.ffe;
    i.soft = i.hard * settings.softCost;
    i.finance = (i.hard + i.soft) * financeFactor;
    i.chargeTotal = i.charges.dcl + i.charges.util + i.charges.acc + i.charges.override;
    i.cost = i.hard + i.soft + i.finance + i.chargeTotal;
    i.profit = i.cost * settings.profitOnCost;
    i.net_contribution = i.value - i.cost - i.profit;
  }

  // public running cost
  const publicItems = items.filter(i => i.earnsBy === 'public');
  const publicGfa = publicItems.reduce((s, i) => s + i.gfa, 0);
  const runningPerYear = publicGfa * num(settings.publicRunningCostPerM2);
  const runningCapitalised = settings.publicCapRate ? runningPerYear / settings.publicCapRate : 0;
  if (publicGfa > 0 && settings.publicRunningCostPerM2 == null) warnings.push('Public floors have no running cost entered (counted as 0).');

  // totals
  const sum = k => items.reduce((s, i) => s + i[k], 0);
  const grossValue = sum('grossValue'), leasing = sum('leasing');
  let gdv = sum('value');
  const hard = sum('hard'), soft = sum('soft'), finance = sum('finance'), chargesTotal = sum('chargeTotal') + (flatPermitFee ? val(data.charges.components.acc.flat_per_permit) : 0);
  const cost = hard + soft + finance + chargesTotal;
  const profit = cost * settings.profitOnCost;
  let publicDeduction = 0, endowment = 0;
  if (settings.publicPayer === 'cross_subsidy' || settings.publicPayer === 'ticketed_deck') publicDeduction = runningCapitalised;
  if (settings.publicPayer === 'cac_endowment') endowment = runningCapitalised;
  const rlvBefore = gdv - publicDeduction - cost - profit;
  // CAC
  const hasResidential = items.some(i => RESIDENTIAL_ROWS.has(i.rowId));
  const employmentOnly = settings.employmentOnly === 'auto' ? !hasResidential : !!settings.employmentOnly;
  let cacBase = settings.landValueCurrentZoning, cacBaseNote = null;
  if (cacBase == null) { cacBase = settings.landPrice ?? 0; cacBaseNote = settings.landPrice != null ? 'Land value under current zoning not set: land price used instead.' : 'Land value under current zoning not set: CAC lift measured from zero.'; }
  const lift = rlvBefore - cacBase;
  const cacGross = employmentOnly ? 0 : Math.max(0, settings.cacShare * lift);
  let cacCash = cacGross;
  if (endowment > 0) { const fromCac = Math.min(cacCash, endowment); cacCash -= fromCac; publicDeduction += endowment - fromCac; }
  const rlvAfter = gdv - publicDeduction - cost - profit - cacGross;
  if (cacBaseNote && !employmentOnly) warnings.push(cacBaseNote);

  // verdict
  const land = settings.landPrice;
  const saleGfa = items.filter(i => SALE_ROWS.has(i.rowId)).reduce((s, i) => s + i.gfa, 0);
  const marketDependent = saleGfa > 0;
  const marginAtLand = cost ? (gdv - publicDeduction - cost - cacGross - num(land)) / cost : 0;
  const reasons = [];
  let verdict;
  const totalGfa = items.reduce((s, i) => s + i.gfa, 0);
  const missingValues = new Set(items.filter(i => i.flags.includes('user_value_missing')).map(i => i.programme_id));
  if (!totalGfa || !priced.length || errors.length) {
    verdict = 'incomplete';
    if (!totalGfa) reasons.push('No floor area yet: add floors and a programme mix.');
    else if (!priced.length) reasons.push('No programme on the floors has a published cost: enter hard costs to get a verdict.');
    if (errors.length) reasons.push(`${errors.length} mix item(s) name an unknown programme.`);
  } else if (land == null) {
    if (rlvAfter < 0) { verdict = 'doesnt_work'; reasons.push('Value does not cover cost and profit, even with free land.'); }
    else { verdict = 'needs_land'; reasons.push(`The scheme could pay up to ${(rlvAfter / 1e6).toFixed(0)} million dollars for the land. Enter a land price to get a verdict.`); }
  } else {
    const shortfall = land > 0 ? (land - rlvAfter) / land : (rlvAfter >= 0 ? -1 : Infinity);
    if (rlvAfter >= land && settings.profitOnCost >= 0.15) verdict = 'works';
    else if (shortfall <= 0.10 || (marginAtLand >= 0.10 && marginAtLand < 0.15)) verdict = 'marginal';
    else verdict = 'doesnt_work';
  }
  if (missingValues.size) reasons.push(`${missingValues.size} programme(s) have no sourced value and count as 0: ${[...missingValues].join(', ')}.`);
  if (verdict === 'works' && settings.profitOnCost < 0.15) verdict = 'marginal';
  if (verdict === 'works' && marketDependent && settings.presaleMarket === 'weak') { verdict = 'marginal'; reasons.push('Relies on condo presales in a weak market (60–70% presold needed).'); }
  if (verdict === 'works' && publicGfa > 0 && !settings.publicPayer) { verdict = 'marginal'; reasons.push('A public floor has no named payer.'); }
  if (verdict === 'works') reasons.push('Residual land value covers the land price at the target profit.');
  if (verdict === 'doesnt_work' && land != null) reasons.push('Residual land value is more than 10% below the land price.');
  if (settings.publicPayer === 'ticketed_deck' && publicGfa > 0) reasons.push('Free floors are paid from ticket income inside the building (counted like a cross-subsidy).');

  // ledger (what the City receives)
  const inKind = items.filter(i => ['C1', 'C2', 'C3', 'C4', 'R6', 'A2'].includes(i.rowId) || (i.earnsBy === 'public' && i.rowId === null))
    .reduce((s, i) => s + i.hard + i.soft, 0);
  const ledger = { dcl: sum2(items, i => i.charges.dcl), utilitiesDcl: sum2(items, i => i.charges.util), acc: sum2(items, i => i.charges.acc) + (flatPermitFee ? val(data.charges.components.acc.flat_per_permit) : 0),
    other: sum2(items, i => i.charges.override), cac: cacCash, cacEndowment: cacGross - cacCash, inKindBuildCost: inKind };
  ledger.total = ledger.dcl + ledger.utilitiesDcl + ledger.acc + ledger.other + ledger.cac + ledger.cacEndowment + ledger.inKindBuildCost;

  // FSR check (brief)
  const fsr = fsrCheck(items, settings, data);

  // rules: intensity buffer, F1, high-building flags
  for (let k = 1; k < floorOut.length; k++) {
    const a = floorOut[k - 1], b = floorOut[k];
    const ia = floorIntensity(a, data), ib = floorIntensity(b, data);
    const buffered = [a, b].some(fl => fl.items.some(i => i.family_id === 'SB'));
    if (ia != null && ib != null && Math.abs(ia - ib) >= 3 && !buffered)
      rules.push({ type: 'buffer', level: b.level, severity: 'warning', text: `L${a.level}–L${b.level}: activity intensity ${ia} next to ${ib}; consider a buffer floor (mechanical, refuge or belt).` });
  }
  const groups = new Set(items.flatMap(i => i.occupancy));
  if (groups.has('F1') && [...groups].some(g => /^[ABC]/.test(g)))
    rules.push({ type: 'f1', level: null, severity: 'block', text: 'F1 (high-hazard industrial) is not allowed in a building with A, B or C occupancies.' });
  for (const i of items) {
    if (i.occupancy.some(g => g === 'B2' || g === 'B3') && i.level > 3)
      rules.push({ type: 'high_building', level: i.level, severity: 'info', text: `L${i.level}: ${i.name} (B2/B3) above the 3rd storey triggers the strictest smoke-control and evacuation rules.` });
  }
  for (const i of items) if (i.programme_id === 'CH1')
    rules.push({ type: 'childcare', level: i.level, severity: 'info', text: `L${i.level}: childcare needs about ${data.codeRules.rules.find(r => r.id === 'childcare_outdoor')?.m2_per_child ?? 14} m² of sunny outdoor play per child, contiguous with the room.` });
  if (settings.heightRange && height > 0 && (height < settings.heightRange[0] || height > settings.heightRange[1]))
    rules.push({ type: 'height', level: null, severity: 'warning', text: `Tower height ${height.toFixed(1)} m is outside the brief's ${settings.heightRange[0]}–${settings.heightRange[1]} m range.` });

  // per-floor totals
  for (const fo of floorOut) {
    for (const i of fo.items) { fo.value += i.value; fo.cost += i.cost; fo.profit += i.profit; fo.gfa += i.gfa; }
    fo.net = fo.value - fo.cost - fo.profit;
    const main = [...fo.items].sort((x, y) => y.gfa - x.gfa)[0];
    fo.family_id = main?.family_id ?? null;
  }

  return {
    label: LABEL,
    height, maxLevel, supertall, financeFactor,
    totals: { gfa: sum('gfa'), net: sum('net'), grossValue, leasing, gdv, publicRunningPerYear: runningPerYear, publicCapitalised: runningCapitalised, publicDeduction,
      hard, soft, finance, charges: chargesTotal, cost, profit, rlvBeforeCac: rlvBefore, cacLift: lift, cac: cacGross, cacCash, rlvAfterCac: rlvAfter, landPrice: land, marginAtLand },
    verdict, reasons, marketDependent, employmentOnly, ledger, fsr, floors: floorOut, items, rules, warnings: [...new Set(warnings)], settings,
  };
}
const sum2 = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

function floorIntensity(fo, data) {
  const vals = fo.items.map(i => data.families.get(i.family_id)?.intensity).filter(x => x != null);
  return vals.length ? Math.max(...vals) : null;
}

/** 9.0 FSR non-residential check, reported with hotel counted both ways. */
export function fsrCheck(items, settings, data) {
  const counted = items.filter(i => i.level >= 1 && !NO_FSR_PROGRAMMES.has(i.programme_id));
  const total = counted.reduce((s, i) => s + i.gfa, 0);
  const res = counted.filter(i => RESIDENTIAL_ROWS.has(i.rowId)).reduce((s, i) => s + i.gfa, 0);
  const hotel = counted.filter(i => HOTEL_ROWS.has(i.rowId)).reduce((s, i) => s + i.gfa, 0);
  const nonresWithHotel = total - res, nonresWithoutHotel = total - res - hotel;
  const site = settings.siteAreaM2, min = settings.minNonresFsr;
  const out = { totalGfa: total, residential: res, hotel, nonresWithHotel, nonresWithoutHotel, siteAreaM2: site, minNonresFsr: min,
    usingHotelAsNonResidential: settings.hotelAsNonResidential,
    note: 'Below-grade floors, parking, storage, waste and core/mechanical/structural floors are left out. Plates are gross (core included), so zoning floor area will be smaller: a pass within 10% is provisional. Designer\'s reading, not a zoning calculation.' };
  if (site) {
    out.fsr = total / site;
    out.nonresFsrWithHotel = nonresWithHotel / site; out.nonresFsrWithoutHotel = nonresWithoutHotel / site;
    if (min != null) {
      out.requiredNonres = min * site;
      out.passWithHotel = nonresWithHotel >= out.requiredNonres;
      out.passWithoutHotel = nonresWithoutHotel >= out.requiredNonres;
      // gross plates include the core; zoning floor area is smaller, so a pass within 10% is only provisional
      out.tightWithHotel = out.passWithHotel && nonresWithHotel < out.requiredNonres * 1.10;
      out.tightWithoutHotel = out.passWithoutHotel && nonresWithoutHotel < out.requiredNonres * 1.10;
      out.pass = settings.hotelAsNonResidential ? out.passWithHotel : out.passWithoutHotel;
    }
  }
  return out;
}

/** Tornado: residual land value after CAC at the low and high end of each test. */
export function sensitivity(floors, data, settings = {}) {
  const base = evaluate(floors, data, settings).totals.rlvAfterCac;
  const s = data.assumptions.sensitivity;
  const rowsIn = (ids) => Object.fromEntries(ids.map(id => [id, 1]));
  const cur = settings.valueScale || {};
  const scaleRows = (ids, f) => ({ valueScale: { ...cur, ...Object.fromEntries(Object.keys(rowsIn(ids)).map(id => [id, (cur[id] ?? 1) * f])) } });
  const basePremium = val(data.assumptions.height_premium.groups.condo.per_floor) || 0.007;
  const baseVisitors = val(data.rows.get('A1')?.inputs?.visitors_per_year) || 500000;
  const incomeRows = [...data.rows.values()].filter(r => r.inputs?.cap_rate && r.method !== 'user');
  const capScale = d => ({ ...cur, ...Object.fromEntries(incomeRows.map(r => { const c = val(r.inputs.cap_rate); return [r.id, (cur[r.id] ?? 1) * c / Math.max(0.005, c + d)]; })) });
  const tests = [
    { id: 'office_rent', label: `Office value ±${s.office_rent[1] * 100}%`, lo: scaleRows(['O1', 'O2', 'O3'], 1 + s.office_rent[0]), hi: scaleRows(['O1', 'O2', 'O3'], 1 + s.office_rent[1]) },
    { id: 'cap_rate', label: 'Cap rates ±1 point', lo: { valueScale: capScale(s.cap_rate_points[1]) }, hi: { valueScale: capScale(s.cap_rate_points[0]) } },
    { id: 'condo_price', label: `Condo price ±${s.condo_price[1] * 100}%`, lo: scaleRows(['R1', 'R2', 'R3'], 1 + s.condo_price[0]), hi: scaleRows(['R1', 'R2', 'R3'], 1 + s.condo_price[1]) },
    { id: 'hard_cost', label: `Hard cost ±${s.hard_cost[1] * 100}%`, lo: { hardCostScale: 1 + s.hard_cost[1] }, hi: { hardCostScale: 1 + s.hard_cost[0] } },
    { id: 'condo_premium', label: `Condo height premium ${s.condo_height_premium[0] * 100}–${s.condo_height_premium[1] * 100}%/floor`, lo: { premiumScale: s.condo_height_premium[0] / basePremium }, hi: { premiumScale: s.condo_height_premium[1] / basePremium } },
    { id: 'deck_visitors', label: `Deck visitors ${s.deck_visitors[0] / 1000}k–${s.deck_visitors[1] / 1000}k a year`, lo: scaleRows(['A1'], s.deck_visitors[0] / baseVisitors), hi: scaleRows(['A1'], s.deck_visitors[1] / baseVisitors) },
  ];
  return { base, tests: tests.map(t => {
    const lo = evaluate(floors, data, { ...settings, ...t.lo }).totals.rlvAfterCac;
    const hi = evaluate(floors, data, { ...settings, ...t.hi }).totals.rlvAfterCac;
    return { id: t.id, label: t.label, low: Math.min(lo, hi), high: Math.max(lo, hi), swing: Math.abs(hi - lo) };
  }).sort((a, b) => b.swing - a.swing) };
}

/** A neutral sample tower so the tool opens with something to look at. */
export function sampleTower({ height = 280, podiumFloors = 4, belowGrade = 3, podiumPlate = 4000, towerPlate = 2000, topPlate = 1100, f2fPodium = 6, f2fTower = 4.2, mechEvery = 20 } = {}) {
  const floors = [];
  // below grade: level -1 is the first basement
  for (let b = belowGrade; b >= 1; b--) floors.push({ level: -b, elevation_m: -b * 3.5, height_m: 3.5, area_m2: podiumPlate, area_basis: 'gross', mix: [{ programme_id: 'AM7', share: 0.7 }, { programme_id: 'AM8', share: 0.3 }] });
  let z = 0, level = 1;
  while (z < height - 1) {
    const isPodium = level <= podiumFloors;
    const h = isPodium ? f2fPodium : f2fTower;
    if (z + h > height + 0.01) break;
    const t = z / height;
    const plate = isPodium ? podiumPlate : Math.round(towerPlate - (towerPlate - topPlate) * Math.pow(Math.max(0, (z - podiumFloors * f2fPodium) / height), 1.2));
    let mix;
    if (level === 1) mix = [{ programme_id: 'SE1', share: 0.55 }, { programme_id: 'SE4', share: 0.15 }, { programme_id: 'AM4', share: 0.3 }];
    else if (level === 2) mix = [{ programme_id: 'SE3', share: 0.6 }, { programme_id: 'CH1', share: 0.4 }];
    else if (isPodium) mix = [{ programme_id: 'WK1', share: 0.8 }, { programme_id: 'GP5', share: 0.2 }];
    else if (z + 2 * h > height + 0.01) mix = [{ programme_id: 'LE1', share: 0.7 }, { programme_id: 'LE3', share: 0.3 }];
    else if ((level - podiumFloors) % mechEvery === 0) mix = [{ programme_id: 'SB2', share: 1 }];
    else if (t < 0.38) mix = [{ programme_id: 'WK1', share: 1 }];
    else if (t < 0.55) mix = [{ programme_id: 'ST2', share: 1 }];
    else if (t < 0.8) mix = [{ programme_id: 'LV4', share: 0.8 }, { programme_id: 'LV5', share: 0.2 }];
    else mix = [{ programme_id: 'LV1', share: 1 }];
    floors.push({ level, elevation_m: Math.round(z * 100) / 100, height_m: h, area_m2: plate, area_basis: 'gross', mix });
    z += h; level++;
  }
  return floors;
}
