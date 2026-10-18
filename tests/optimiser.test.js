// "Find a mix that works": constraints, determinism, honesty and speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexData, evaluate, sampleTower, defaultSettings } from '../core/econ_core.js';
import { optimiseMix, breaches, optimiserDefaults, runStrategy } from '../core/optimiser.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const P = 'packs/vancouver-2026/';
const raw = {
  families: J('catalogue/families.json'), programmes: J('catalogue/programmes.json'),
  values: J(P + 'values.json'), costs: J(P + 'costs.json'), charges: J(P + 'charges.json'),
  assumptions: J(P + 'assumptions.json'), codeRules: J(P + 'code_rules.json'), sources: J(P + 'sources.json'),
};
const vtc = indexData({ ...raw, brief: J('briefs/vtc-2026/brief.json') });
const none = indexData({ ...raw, brief: J('briefs/none/brief.json') });
const geom = f => `${f.level}|${f.elevation_m}|${f.height_m}|${f.area_m2}|${f.area_basis}`;
const keys = (r, data) => r.items.reduce((a, i) => a + (['H1', 'H2', 'H3'].includes(i.rowId) ? i.net / (data.rows.get(i.rowId).inputs?.m2_per_key?.value || 60) : 0), 0);

const vtcRun = optimiseMix(sampleTower(), vtc);
const noneRun = optimiseMix(sampleTower(), none);

test('pack caps exist and are grade C with ranges', () => {
  const o = raw.assumptions.optimiser;
  for (const k of ['max_hotel_keys', 'max_deck_floors', 'max_luxury_condo_share', 'min_band_floors', 'switch_penalty_share', 'inclusionary_share']) { assert.equal(o[k].grade, 'C', k); assert.ok(o[k].range, k); }
  assert.equal(o.inclusionary_share.source, 'city-contributions-2026');
  assert.equal(optimiserDefaults(none).inclusionary, false);
});

test('constraints are never broken: FSR minimum, hotel keys, deck floors, luxury share, F1, geometry', () => {
  for (const [run, data] of [[vtcRun, vtc], [noneRun, none]]) {
    for (const s of run.strategies.filter(x => x.feasible)) {
      const r = s.result;
      assert.deepEqual(breaches(r, data, run.options, null, s.floors), [], s.strategy.id);
      assert.ok(keys(r, vtc) <= run.options.maxHotelKeys + 0.5);
      assert.ok(s.floors.filter(f => f.mix.some(m => m.programme_id === 'LE1')).length <= run.options.maxDeckFloors);
      assert.ok(!r.rules.some(x => x.type === 'f1'));
      assert.deepEqual(s.floors.map(geom), sampleTower().map(geom));
    }
  }
  const b = vtcRun.best.result;
  assert.equal(b.fsr.pass, true, 'VTC best meets the 9.0 FSR rule');
});

test('locked floors are never touched', () => {
  const floors = sampleTower().map(f => (f.level >= 10 && f.level <= 12 ? { ...f, locked: true, mix: [{ programme_id: 'LN4', share: 1 }] } : f));
  const run = optimiseMix(floors, none);
  for (const lv of [10, 11, 12]) assert.deepEqual(run.best.floors.find(f => f.level === lv).mix, [{ programme_id: 'LN4', share: 1 }]);
  for (const s of run.strategies.filter(x => x.feasible)) for (const lv of [10, 11, 12]) assert.equal(s.floors.find(f => f.level === lv).mix[0].programme_id, 'LN4');
});

test('deterministic: the same input gives the same stack', () => {
  const again = optimiseMix(sampleTower(), vtc);
  assert.equal(JSON.stringify(again.best.floors), JSON.stringify(vtcRun.best.floors));
  assert.equal(again.report, vtcRun.report);
});

test('never worse than the current stack when the current stack meets the rules', () => {
  const cur = noneRun.current;
  assert.deepEqual(breaches(cur, none, noneRun.options, null, sampleTower()), []);
  const rank = { works: 4, marginal: 3, needs_land: 2, doesnt_work: 1, incomplete: 0 };
  const b = noneRun.best.result;
  assert.ok(rank[b.verdict] > rank[cur.verdict] || (rank[b.verdict] === rank[cur.verdict] && b.totals.rlvAfterCac - b.totals.landPrice >= cur.totals.rlvAfterCac - cur.totals.landPrice));
});

test('the employment-only strategy has no housing and CAC 0', () => {
  for (const run of [vtcRun, noneRun]) {
    const e = run.strategies.find(s => s.strategy.id === 'employment');
    assert.ok(e.feasible);
    assert.equal(e.result.totals.cac, 0);
    assert.equal(e.result.employmentOnly, true);
  }
});

test('honest: no strategy claims Works unless the full engine says so; infeasible forms say so', () => {
  for (const [run, data] of [[vtcRun, vtc], [noneRun, none]]) for (const s of run.strategies.filter(x => x.feasible)) assert.equal(evaluate(s.floors, data, {}).verdict, s.result.verdict);
  assert.notEqual(vtcRun.best.result.verdict, 'works');
  assert.match(vtcRun.report, /may not work/);
  assert.match(vtcRun.report, /9\.0 FSR rule forces/);
  // a stubby tower cannot reach 9.0 FSR non-residential on the competition site
  const small = sampleTower({ height: 60, podiumFloors: 2, belowGrade: 1 });
  const run = optimiseMix(small, vtc);
  assert.equal(run.best, null);
  assert.match(run.report, /No mix meets the rules/);
  for (const r of [vtcRun, noneRun, run]) assert.match(r.report, /starting point, not a recommendation/);
});

test('speed: about 100 floors in under a second', () => {
  const tall = sampleTower({ height: 420 });
  assert.ok(tall.length >= 100, String(tall.length));
  const t = Date.now();
  const run = optimiseMix(tall, none, {}, { polishPasses: 1 });
  const ms = Date.now() - t;
  assert.ok(run.best);
  assert.ok(ms < 1000, `${ms} ms`);
});

test('works on imported forms: net basis, odd floor heights, gaps in levels', () => {
  const floors = [];
  let z = 0;
  floors.push({ level: -1, elevation_m: -4, height_m: 4, area_m2: 2600, area_basis: 'net', mix: [{ programme_id: 'AM7', share: 1 }] });
  for (let lv = 1; lv <= 45; lv++) { const h = lv === 1 ? 7.1 : [3.7, 4.05, 3.35][lv % 3]; floors.push({ level: lv, elevation_m: Math.round(z * 100) / 100, height_m: h, area_m2: lv <= 3 ? 2400 : 1250 + (lv % 4) * 15, area_basis: 'net', mix: [{ programme_id: 'WK1', share: 1 }] }); z += h; }
  const run = optimiseMix(floors, none);
  assert.ok(run.best);
  assert.deepEqual(run.best.floors.map(geom), floors.map(geom));
  assert.ok(run.best.floors.every(f => Math.abs(f.mix.reduce((a, m) => a + m.share, 0) - 1) < 1e-9));
});

test('strategy with no deck has no deck; no-sale strategy has no condos for sale', () => {
  const nd = noneRun.strategies.find(s => s.strategy.id === 'no_deck');
  assert.ok(!nd.floors.some(f => f.mix.some(m => m.programme_id === 'LE1')));
  const ns = noneRun.strategies.find(s => s.strategy.id === 'no_sale');
  assert.equal(ns.result.marketDependent, false);
  const off = runStrategy(sampleTower(), none, defaultSettings(none), { ...optimiserDefaults(none), allowSale: false }, { id: 'all', name: 'All' });
  assert.equal(off.result.marketDependent, false);
});
