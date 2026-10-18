import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, recomputeValue } from '../core/validate_data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Copy the data into a temp folder, apply one change, validate.
function broken(rel, mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvv-'));
  for (const d of ['catalogue', 'packs', 'briefs']) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  const file = path.join(dir, rel);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(data);
  fs.writeFileSync(file, JSON.stringify(data));
  const result = validate(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  return result.errors.map(e => e.code);
}

test('real data has no errors', () => {
  const { errors, stats } = validate(ROOT);
  assert.deepEqual(errors, []);
  assert.equal(stats.programmes, 112);
  assert.equal(stats.families, 14);
});

test('missing source is caught', () => {
  assert.ok(broken('packs/vancouver-2026/values.json', d => { delete d.rows[0].value_per_m2_gfa.source; }).includes('missing_field'));
});

test('unknown source id is caught', () => {
  assert.ok(broken('packs/vancouver-2026/values.json', d => { d.rows[0].inputs.efficiency.source = 'nowhere'; }).includes('unknown_source'));
});

test('assumption must be grade C', () => {
  assert.ok(broken('packs/vancouver-2026/values.json', d => { d.rows[0].inputs.efficiency.grade = 'A'; }).includes('assumption_grade'));
});

test('broken family link is caught', () => {
  assert.ok(broken('catalogue/programmes.json', d => { d.programmes[0].family_id = 'XX'; }).includes('unknown_family'));
});

test('null value without the user flag is caught', () => {
  assert.ok(broken('packs/vancouver-2026/values.json', d => { d.rows[0].value_per_m2_gfa.value = null; }).includes('null_without_flag'));
});

test('wrong ft2 to m2 conversion is caught', () => {
  assert.ok(broken('packs/vancouver-2026/costs.json', d => { d.lines[0].low_m2 = 4500; }).includes('bad_conversion'));
});

test('value outside its range is caught', () => {
  assert.ok(broken('packs/vancouver-2026/values.json', d => { const r = d.rows.find(x => x.id === 'H1'); r.value_per_m2_gfa.value = 20000; }).includes('value_outside_range'));
});

test('linked programme pointing at a missing value row is caught', () => {
  assert.ok(broken('catalogue/programmes.json', d => { const p = d.programmes.find(x => x.value_status === 'linked'); p.value_ref = 'Z9'; }).includes('unknown_value_ref'));
});

test('programme count must match the catalogue', () => {
  assert.ok(broken('catalogue/programmes.json', d => { d.programmes.pop(); }).includes('count_mismatch'));
});

test('recompute matches hand arithmetic for key rows', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'packs/vancouver-2026/values.json'), 'utf8')).rows;
  const get = id => recomputeValue(rows.find(r => r.id === id));
  // R1: 1400 x 10.764 x 0.82 x 0.95
  assert.ok(Math.abs(get('R1') - 1400 * 10.764 * 0.82 * 0.95) < 1e-6);
  // O1: 50 x 0.9 x 0.95 x 10.764 / 0.054 x 0.78 ~ 6,647
  assert.ok(Math.abs(get('O1') - 6647) < 1);
  // A1: 500,000 x 45 x 1.2 x 0.4 / 0.08 / 3,000 = 45,000
  assert.ok(Math.abs(get('A1') - 45000) < 1e-6);
  // H2: 33,600 / 0.07 / 60 = 8,000
  assert.ok(Math.abs(get('H2') - 8000) < 1e-6);
});

// ---------- review round 2 ----------
test('a value row graded better than its weakest key input is an error', () => {
  const codes = broken('packs/vancouver-2026/values.json', d => { d.rows.find(r => r.id === 'R4').value_per_m2_gfa.grade = 'B'; });
  assert.ok(codes.includes('grade_above_inputs'));
});

test('R1, R4, O1 and H2 carry the grade of their weakest key input', () => {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'packs/vancouver-2026/values.json'), 'utf8'));
  const g = id => v.rows.find(r => r.id === id).value_per_m2_gfa.grade;
  assert.deepEqual([g('R1'), g('R4'), g('O1'), g('H2')], ['B', 'C', 'C', 'C']);
});

test('a programme naming an unknown charge class is an error', () => {
  const codes = broken('catalogue/programmes.json', d => { d.programmes.find(p => p.id === 'SB2').city_charge_class = 'nowhere'; });
  assert.ok(codes.includes('unknown_charge_class'));
});
