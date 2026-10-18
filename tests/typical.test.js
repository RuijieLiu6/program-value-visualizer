// Typical estimates: every programme has a number; typical values are grade C, flagged, and overridable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexData, evaluate } from '../core/econ_core.js';
import { validate } from '../core/validate_data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const P = 'packs/vancouver-2026/';
const data = indexData({
  families: J('catalogue/families.json'), programmes: J('catalogue/programmes.json'),
  values: J(P + 'values.json'), costs: J(P + 'costs.json'), charges: J(P + 'charges.json'),
  assumptions: J(P + 'assumptions.json'), codeRules: J(P + 'code_rules.json'), sources: J(P + 'sources.json'),
  brief: J('briefs/vtc-2026/brief.json'),
});
const fl = (level, mix) => ({ level, elevation_m: (level - 1) * 4, height_m: 4, area_m2: 1000, area_basis: 'gross', mix });
function broken(rel, mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvv-'));
  for (const d of ['catalogue', 'packs', 'briefs']) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  const file = path.join(dir, rel);
  const j = JSON.parse(fs.readFileSync(file, 'utf8')); mutate(j); fs.writeFileSync(file, JSON.stringify(j));
  const r = validate(dir); fs.rmSync(dir, { recursive: true, force: true });
  return r.errors.map(e => e.code);
}

test('every one of the 112 programmes resolves to a number, so nobody has to type a value', () => {
  for (const p of data.programmes.values()) {
    const r = evaluate([fl(10, [{ programme_id: p.id, share: 1 }])], data, {});
    const i = r.items[0];
    assert.ok(Number.isFinite(i.value), `${p.id} value`);
    assert.ok(!i.flags.includes('user_value_missing'), `${p.id} still asks for a value`);
    assert.equal(p.needs_user_value, false, `${p.id} needs_user_value`);
  }
});

test('the programmes and rows that had no value now carry typical estimates', () => {
  const was = ['MP1', 'MP4', 'MP5', 'MP7', 'MP8', 'MP9', 'GP1', 'GP3', 'GP9', 'LE4', 'LE5', 'LE6', 'SE6', 'AM11', 'AM12', 'MK1', 'MK2', 'MK3', 'MK4', 'MK5', 'MK6', 'MK7', 'LN1', 'LN2', 'CH3', 'CH5', 'CH6', 'GS3', 'GS4', 'GS7', 'ST4', 'ST5', 'RR4'];
  assert.equal(was.length, 33);
  for (const id of was) {
    const row = data.rows.get(data.programmes.get(id).value_ref);
    assert.ok(['researched', 'analogy', 'no_income'].includes(row.value_basis), id);
  }
  for (const id of ['R3', 'R8', 'R9', 'O4', 'A5', 'H4', 'H5']) {
    const row = data.rows.get(id);
    assert.ok(['researched', 'analogy', 'no_income'].includes(row.value_basis), id);
    assert.equal(row.value_per_m2_gfa.grade, 'C');
    assert.match(row.value_per_m2_gfa.note, /^(Typical estimate \((researched|analogy)\)|Earns nothing): /);
  }
  // public and support rows stay at zero
  for (const id of ['A5', 'GP1t', 'AM12t', 'LN1t', 'GS7t', 'AM11t']) assert.equal(data.rows.get(id).value_per_m2_gfa.value, 0, id);
});

test('typical values are marked on results and listed in an info rule; a typed value replaces them', () => {
  const r = evaluate([fl(5, [{ programme_id: 'MP1', share: 0.5 }, { programme_id: 'WK1', share: 0.5 }])], data, {});
  const mp = r.items.find(i => i.programme_id === 'MP1'), wk = r.items.find(i => i.programme_id === 'WK1');
  assert.equal(mp.valueBasis, 'researched');
  assert.equal(wk.valueBasis, 'sourced');
  assert.ok(r.rules.some(x => x.type === 'typical' && x.text.includes('MP1') && !x.text.includes('WK1')));
  const o = evaluate([fl(5, [{ programme_id: 'MP1', share: 1 }])], data, { programme: { MP1: { valuePerM2Gfa: 5000 } } }).items[0];
  assert.equal(o.valueBasis, 'user');
  assert.ok(Math.abs(o.grossValue - 1000 * 5000) < 1, String(o.grossValue));   // 1,000 m2 GFA x C$5,000/m2 GFA, no premium group
});

test('typical cost lines fill gaps where Altus has no line', () => {
  const i = evaluate([fl(5, [{ programme_id: 'MK7', share: 1 }])], data, {}).items[0];
  assert.equal(i.costBasis, 'typical');
  assert.equal(i.costEstimated, false);
  assert.equal(i.hardRate, data.lines.get('typ_data_room').default_m2.value);
  const a = evaluate([fl(5, [{ programme_id: 'WK1', share: 1 }])], data, {}).items[0];
  assert.equal(a.costBasis, 'altus');
});

test('validator: typical values must be grade C with a note; every programme must resolve', () => {
  assert.ok(broken(P + 'values.json', d => { d.rows.find(r => r.id === 'MP1t').value_per_m2_gfa.grade = 'B'; }).includes('typical_not_flagged'));
  assert.ok(broken(P + 'values.json', d => { const r = d.rows.find(x => x.id === 'MP4t'); r.value_basis = 'researched'; }).includes('researched_without_source'));
  assert.ok(broken(P + 'values.json', d => { d.rows.find(r => r.id === 'GP1t').value_per_m2_gfa.value = 500; }).includes('no_income_with_value'));
  assert.ok(broken(P + 'values.json', d => { delete d.rows.find(r => r.id === 'R9').value_per_m2_gfa.note; }).includes('typical_not_flagged'));
  assert.ok(broken(P + 'costs.json', d => { d.typical_lines[0].default_m2.grade = 'A'; }).includes('typical_not_flagged'));
  assert.ok(broken('catalogue/programmes.json', d => { const p = d.programmes.find(x => x.id === 'MP1'); p.value_status = 'new'; p.value_ref = null; p.needs_user_value = true; }).includes('unresolved_value'));
  assert.ok(broken(P + 'values.json', d => { d.rows.find(r => r.id === 'R1').value_basis = 'guess'; }).includes('bad_value_basis'));
});

test('research pass: researched rows cite a dated source, analogy rows say nothing usable was found', () => {
  const rows = [...data.rows.values()];
  const researched = rows.filter(r => r.value_basis === 'researched'), analogy = rows.filter(r => r.value_basis === 'analogy');
  assert.equal(researched.length, 24);
  assert.equal(analogy.length, 11);
  for (const r of researched) {
    const src = data.sources.get(r.value_per_m2_gfa.source);
    assert.ok(src && src.id !== 'assumption' && src.url, `${r.id} source`);
    assert.ok(['page-read', 'summary', 'pdf-read'].includes(src.checked), `${r.id} checked`);
  }
  for (const r of analogy) assert.match(r.value_per_m2_gfa.note, /No .*found|No evidence found/, r.id);
  // the four pack rows that were really assumptions are now researched
  for (const id of ['H1', 'O3', 'O6', 'A4']) assert.equal(data.rows.get(id).value_basis, 'researched', id);
});

test('docs/value_defaults.md lists all 112 programmes with their current value (regenerate with scripts/value_defaults_table.mjs)', () => {
  const md = fs.readFileSync(path.join(ROOT, 'docs/value_defaults.md'), 'utf8');
  const lines = md.split('\n').filter(l => /^\| [A-Z]+\d+ \|/.test(l));
  assert.equal(lines.length, 112);
  for (const l of lines) {
    const [, id, , val] = l.split('|').map(c => c.trim());
    const p = data.programmes.get(id), row = p.value_status === 'linked' ? data.rows.get(p.value_ref) : null;
    assert.equal(Number(val.replace(/,/g, '')), row ? row.value_per_m2_gfa.value : 0, `${id} is out of date`);
  }
});
