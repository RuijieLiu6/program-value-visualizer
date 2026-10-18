// Data validator for Program Value Visualizer.
// Usage: node core/validate_data.js [projectRoot]
// Errors break the data (exit 1). Warnings are things a person should look at.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { recomputeValue, FT2_PER_M2 } from './econ_core.js';
export { recomputeValue, FT2_PER_M2 };
const UNITS = new Set([
  'CAD/ft2', 'CAD/ft2/yr', 'CAD/ft2/month', 'CAD/m2', 'CAD/m2/yr', 'ratio', 'ratio/floor', 'ratio/yr',
  'CAD/key', 'CAD/key/yr', 'CAD/night', 'm2/key', 'CAD/stall', 'CAD/stall/month', 'm2/stall', 'm2',
  'visitors/yr', 'CAD/visitor', 'CAD', 'CAD/yr', 'years', 'm', 'CAD/permit', 'CAD/space', 'count', 'boolean',
]);
const GRADES = new Set(['A', 'B', 'C']);
const FITS = new Set(['B', 'G', 'L', 'M', 'H', 'T', 'S']);
const GROUPS = new Set(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'C', 'D', 'E', 'F1', 'F2', 'F3']);
const EARNS = new Set(['sell', 'lease', 'operate', 'public', 'support']);
const METHODS = new Set(['sale', 'income', 'per_key', 'visitors', 'per_stall_sale', 'per_stall_income', 'stated', 'none', 'user']);
const STATUS = new Set(['linked', 'zero', 'new', 'excluded']);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const RECOMPUTE_TOLERANCE = 0.05;

const readJSON = (root, rel, errors) => {
  const file = path.join(root, rel);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { errors.push({ code: 'json', where: rel, msg: e.message }); return null; }
};

function checkSourced(obj, where, ctx) {
  const { errors, sourceIds } = ctx;
  for (const k of ['unit', 'source', 'grade', 'as_of']) if (!(k in obj)) errors.push({ code: 'missing_field', where, msg: `missing ${k}` });
  if (obj.unit && !UNITS.has(obj.unit)) errors.push({ code: 'bad_unit', where, msg: obj.unit });
  if (obj.grade && !GRADES.has(obj.grade)) errors.push({ code: 'bad_grade', where, msg: obj.grade });
  if (obj.source && !sourceIds.has(obj.source)) errors.push({ code: 'unknown_source', where, msg: obj.source });
  if (obj.source === 'assumption' && obj.grade !== 'C') errors.push({ code: 'assumption_grade', where, msg: 'assumptions must be grade C' });
  if (obj.as_of && !ISO.test(obj.as_of)) errors.push({ code: 'bad_date', where, msg: obj.as_of });
  if (obj.value === null && obj.needs_user_value !== true) errors.push({ code: 'null_without_flag', where, msg: 'null value must set needs_user_value' });
  if (obj.range) {
    const [lo, hi] = obj.range;
    if (!(lo <= hi)) errors.push({ code: 'bad_range', where, msg: `${lo} > ${hi}` });
    if (typeof obj.value === 'number' && (obj.value < lo - 1e-9 || obj.value > hi + 1e-9)) errors.push({ code: 'value_outside_range', where, msg: `${obj.value} not in [${lo}, ${hi}]` });
  }
}

// Any object with a "value" key and a "unit" key is a sourced number.
function walkSourced(node, where, ctx) {
  if (Array.isArray(node)) { node.forEach((x, i) => walkSourced(x, `${where}[${i}]`, ctx)); return; }
  if (!node || typeof node !== 'object') return;
  if ('value' in node && ('unit' in node || 'source' in node)) checkSourced(node, where, ctx);
  for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') walkSourced(v, `${where}.${k}`, ctx);
}

export function validate(root) {
  const errors = [], warnings = [];
  const pack = readJSON(root, 'packs/vancouver-2026/pack.json', errors);
  const P = rel => `packs/vancouver-2026/${rel}`;
  const files = pack?.files || {};
  const sources = readJSON(root, P(files.sources || 'sources.json'), errors);
  const values = readJSON(root, P(files.values || 'values.json'), errors);
  const costs = readJSON(root, P(files.costs || 'costs.json'), errors);
  const charges = readJSON(root, P(files.charges || 'charges.json'), errors);
  const assumptions = readJSON(root, P(files.assumptions || 'assumptions.json'), errors);
  const codeRules = readJSON(root, P(files.code_rules || 'code_rules.json'), errors);
  const families = readJSON(root, 'catalogue/families.json', errors);
  const programmes = readJSON(root, 'catalogue/programmes.json', errors);
  const brief = readJSON(root, 'briefs/vtc-2026/brief.json', errors);
  if (errors.length) return { errors, warnings, stats: {} };

  const sourceIds = new Set(sources.sources.map(s => s.id));
  if (sourceIds.size !== sources.sources.length) errors.push({ code: 'duplicate_id', where: 'sources', msg: 'duplicate source id' });
  const ctx = { errors, sourceIds };

  // ---- catalogue ----
  const famIds = new Set();
  for (const f of families.families) {
    const w = `families.${f.family_id}`;
    if (famIds.has(f.family_id)) errors.push({ code: 'duplicate_id', where: w, msg: f.family_id });
    famIds.add(f.family_id);
    for (const k of ['family_id', 'name', 'colour']) if (!f[k]) errors.push({ code: 'missing_field', where: w, msg: k });
    if (f.intensity !== null && !(Number.isInteger(f.intensity) && f.intensity >= 1 && f.intensity <= 5)) errors.push({ code: 'bad_intensity', where: w, msg: String(f.intensity) });
    if (!/^#[0-9a-f]{6}$/i.test(f.colour || '')) errors.push({ code: 'bad_colour', where: w, msg: f.colour });
  }
  const valueRows = new Map(values.rows.map(r => [r.id, r]));
  const progIds = new Set();
  for (const p of programmes.programmes) {
    const w = `programmes.${p.id}`;
    if (progIds.has(p.id)) errors.push({ code: 'duplicate_id', where: w, msg: p.id });
    progIds.add(p.id);
    if (!famIds.has(p.family_id)) errors.push({ code: 'unknown_family', where: w, msg: p.family_id });
    if (!p.id.startsWith(p.family_id)) errors.push({ code: 'id_family_mismatch', where: w, msg: `${p.id} vs ${p.family_id}` });
    for (const f of p.fits || []) if (!FITS.has(f)) errors.push({ code: 'bad_fits', where: w, msg: f });
    if (!(p.fits?.length) && !p.fits_text) errors.push({ code: 'missing_field', where: w, msg: 'fits or fits_text' });
    for (const g of p.occupancy_group || []) if (!GROUPS.has(g)) errors.push({ code: 'bad_group', where: w, msg: g });
    if (!STATUS.has(p.value_status)) errors.push({ code: 'bad_status', where: w, msg: p.value_status });
    if (p.value_status === 'linked' && !valueRows.has(p.value_ref)) errors.push({ code: 'unknown_value_ref', where: w, msg: p.value_ref });
    if (p.value_hint && !valueRows.has(p.value_hint)) errors.push({ code: 'unknown_value_ref', where: w, msg: `hint ${p.value_hint}` });
    if (['new', 'excluded'].includes(p.value_status) && p.needs_user_value !== true) errors.push({ code: 'null_without_flag', where: w, msg: 'new/excluded must set needs_user_value' });
    if (!GRADES.has(p.grade)) errors.push({ code: 'bad_grade', where: w, msg: p.grade });
  }
  const expected = programmes.meta?.programme_count;
  if (expected !== programmes.programmes.length) errors.push({ code: 'count_mismatch', where: 'programmes', msg: `${programmes.programmes.length} rows, meta says ${expected}` });

  // ---- values ----
  const chargeClasses = new Set(Object.keys(charges.classes));
  for (const r of values.rows) {
    const w = `values.${r.id}`;
    if (!EARNS.has(r.earns_by)) errors.push({ code: 'bad_earns_by', where: w, msg: r.earns_by });
    if (!METHODS.has(r.method)) errors.push({ code: 'bad_method', where: w, msg: r.method });
    if (!chargeClasses.has(r.city_charge_class)) errors.push({ code: 'unknown_charge_class', where: w, msg: r.city_charge_class });
    if (!r.value_per_m2_gfa) { errors.push({ code: 'missing_field', where: w, msg: 'value_per_m2_gfa' }); continue; }
    if (r.method === 'user' && r.value_per_m2_gfa.value !== null) errors.push({ code: 'user_with_value', where: w, msg: 'method user must have a null value' });
    const re = recomputeValue(r);
    const stated = r.value_per_m2_gfa.value;
    if (re !== null && Number.isNaN(re)) errors.push({ code: 'missing_input', where: w, msg: `inputs incomplete for method ${r.method}` });
    else if (re !== null && stated) {
      const diff = (re - stated) / stated;
      if (Math.abs(diff) > RECOMPUTE_TOLERANCE) warnings.push({ code: 'recompute_drift', where: w, msg: `inputs give ${Math.round(re)}, default is ${stated} (${(diff * 100).toFixed(1)}%)`, recomputed: re, stated });
    }
  }

  // ---- costs ----
  const lineIds = new Set();
  for (const l of costs.lines) {
    const w = `costs.${l.id}`;
    lineIds.add(l.id);
    for (const [ft, m] of [['low_ft2', 'low_m2'], ['high_ft2', 'high_m2']]) {
      const conv = l[ft] * FT2_PER_M2;
      if (Math.abs(conv - l[m]) > Math.max(0.005 * conv, 5.0001)) errors.push({ code: 'bad_conversion', where: `${w}.${m}`, msg: `${l[ft]} ft2 x 10.764 = ${conv.toFixed(1)}, file says ${l[m]}` });
    }
    if (!(l.low_ft2 <= l.high_ft2)) errors.push({ code: 'bad_range', where: w, msg: 'low > high' });
  }
  for (const [kind, map] of Object.entries({ by_value_row: costs.cost_map.by_value_row, by_programme: costs.cost_map.by_programme })) {
    for (const [id, refs] of Object.entries(map)) {
      if (kind === 'by_value_row' && !valueRows.has(id)) errors.push({ code: 'unknown_value_ref', where: `cost_map.${kind}.${id}`, msg: id });
      if (kind === 'by_programme' && !progIds.has(id)) errors.push({ code: 'unknown_programme', where: `cost_map.${kind}.${id}`, msg: id });
      for (const ref of refs || []) if (!lineIds.has(ref)) errors.push({ code: 'unknown_cost_line', where: `cost_map.${kind}.${id}`, msg: ref });
    }
  }
  for (const r of values.rows) if (!(r.id in costs.cost_map.by_value_row)) warnings.push({ code: 'no_cost_mapping', where: `values.${r.id}`, msg: 'no cost_map entry' });

  // ---- charges, assumptions, code rules, brief: every sourced number ----
  walkSourced(sources, 'sources', ctx);
  walkSourced(values, 'values', ctx);
  walkSourced(costs, 'costs', ctx);
  walkSourced(charges, 'charges', ctx);
  walkSourced(assumptions, 'assumptions', ctx);
  walkSourced(brief, 'brief', ctx);
  for (const rule of codeRules.rules) if (rule.source && !sourceIds.has(rule.source)) errors.push({ code: 'unknown_source', where: `code_rules.${rule.id}`, msg: rule.source });
  if (brief.source && !sourceIds.has(brief.source)) errors.push({ code: 'unknown_source', where: 'brief', msg: brief.source });
  const area = brief.site?.area_m2?.value, dims = brief.site?.width_m * brief.site?.length_m;
  if (area && dims && Math.abs(area - dims) / dims > 0.01) errors.push({ code: 'brief_area', where: 'brief.site', msg: `${area} vs ${dims.toFixed(1)}` });

  const stats = {
    families: families.families.length, programmes: programmes.programmes.length, value_rows: values.rows.length,
    cost_lines: costs.lines.length, sources: sources.sources.length,
    user_to_supply: programmes.programmes.filter(p => p.needs_user_value).length + values.rows.filter(r => r.value_per_m2_gfa?.value === null).length,
  };
  return { errors, warnings, stats };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const { errors, warnings, stats } = validate(root);
  console.log('Program Value Visualizer — data check');
  console.log(Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join(' · '));
  for (const w of warnings) console.log(`WARN  ${w.where}: ${w.msg}`);
  for (const e of errors) console.log(`ERROR ${e.where}: [${e.code}] ${e.msg}`);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}
