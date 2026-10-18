// Review round 2: childcare cost, below-grade premium, mechanical charges, O6 leasing, source dates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexData, evaluate, sourceDates, childcareHardRate, defaultSettings } from '../core/econ_core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const P = 'packs/vancouver-2026/';
const data = indexData({
  families: J('catalogue/families.json'), programmes: J('catalogue/programmes.json'),
  values: J(P + 'values.json'), costs: J(P + 'costs.json'), charges: J(P + 'charges.json'),
  assumptions: J(P + 'assumptions.json'), codeRules: J(P + 'code_rules.json'), sources: J(P + 'sources.json'),
  brief: J('briefs/vtc-2026/brief.json'),
});
const fl = (level, mix, extra = {}) => ({ level, elevation_m: (level - 1) * 4, height_m: 4, area_m2: 1600, area_basis: 'gross', mix, ...extra });
const altus = id => data.lines.get(id).default_m2.value;
// a tower taller than 250 m so the tall-building premium is on
const tall = (extra = []) => [...extra, ...Array.from({ length: 65 }, (_, k) => fl(k + 1, [{ programme_id: 'WK1', share: 1 }]))];

test('childcare is costed from the turnkey figure per space, not the project average', () => {
  const S = defaultSettings(data);
  const rate = childcareHardRate(data, S);
  assert.ok(Math.abs(rate - 175400 / 16 / 1.25) < 1e-6);
  const r = evaluate([fl(1, [{ programme_id: 'SE1', share: 0.5 }, { programme_id: 'CH1', share: 0.5 }])], data, {});
  const ch = r.items.find(i => i.programme_id === 'CH1');
  assert.equal(ch.costEstimated, false);
  assert.equal(ch.costBasis, 'childcare_turnkey');
  assert.ok(Math.abs(ch.hardRate - rate) < 1e-6);
  assert.equal(ch.childcareSpaces, 50);                       // 800 m2 / 16 m2
  assert.ok(!r.rules.some(x => x.type === 'cost_estimated' && x.text.startsWith('CH1')));
  assert.ok(r.rules.some(x => x.type === 'childcare' && /50 spaces/.test(x.text) && /700 m²/.test(x.text)));
});

test('more m2 per space lowers the childcare cost per m2 and the space count', () => {
  const a = evaluate([fl(1, [{ programme_id: 'CH1', share: 1 }])], data, {}).items[0];
  const b = evaluate([fl(1, [{ programme_id: 'CH1', share: 1 }])], data, { childcareM2PerSpace: 20 }).items[0];
  assert.ok(b.hardRate < a.hardRate);
  assert.equal(b.childcareSpaces, 80);
  assert.ok(Math.abs(a.hard - b.hard * 20 / 16) < 1);
});

test('the tall-building premium is not applied below grade', () => {
  const r = evaluate(tall([fl(-1, [{ programme_id: 'AM7', share: 1 }], { elevation_m: -3.5, height_m: 3.5 })]), data, {});
  assert.ok(r.supertall);
  const base = r.items.find(i => i.level === -1), office = r.items.find(i => i.level === 10);
  const parking = altus('parking_underground');
  assert.ok(Math.abs(base.hardRate - parking) < 1e-6, `below grade ${base.hardRate} vs ${parking}`);
  assert.ok(Math.abs(office.hardRate - (altus('office_a_31_60') * 1.15 + 860)) < 1e-6);
});

test('mechanical, refuge and structural floors pay no DCL or ACC; core stays on the cautious rate', () => {
  const r = evaluate([fl(1, [{ programme_id: 'SE1', share: 1 }]), fl(2, [{ programme_id: 'SB2', share: 1 }]), fl(3, [{ programme_id: 'SB4', share: 1 }]), fl(4, [{ programme_id: 'SB1', share: 1 }])], data, {});
  for (const lv of [2, 3]) {
    const i = r.items.find(x => x.level === lv);
    assert.equal(i.chargeClass, 'excluded_mechanical');
    assert.equal(i.chargeTotal, 0);
  }
  const core = r.items.find(x => x.level === 4);
  assert.equal(core.chargeClass, 'unknown');
  assert.ok(core.chargeTotal > 0);
});

test('O6 education floors get the same leasing cost and tenant allowance as office', () => {
  const r = evaluate([fl(10, [{ programme_id: 'LN5', share: 1 }])], data, {});
  const i = r.items[0];
  assert.equal(i.rowId, 'O6');
  assert.ok(i.leasing > 0 && Math.abs(i.leasing - i.grossValue * 0.15) < 1e-6);
  assert.ok(Math.abs(i.hardRate - (altus('office_a_31_60') + 860)) < 1e-6);
});

test('an O6 programme with its own complete cost line pays leasing but no tenant allowance', () => {
  const i = evaluate([fl(10, [{ programme_id: 'LN3', share: 1 }])], data, {}).items[0];
  assert.ok(i.leasing > 0);
  assert.ok(Math.abs(i.hardRate - altus('uni_teaching')) < 1e-6);
});

test('source dates give the publication date next to "as of"', () => {
  const o1 = data.rows.get('O1').value_per_m2_gfa;
  const d = sourceDates(o1, data.sources);
  assert.equal(d.published, '2026-Q3');
  assert.equal(d.text, 'published 2026-Q3 · as of 2026-10-17');
  const old = sourceDates(data.assumptions.height_premium.groups.condo.per_floor, data.sources);
  assert.equal(old.published, '2019');
  const a = sourceDates(data.costs.other.soft_cost, data.sources);
  assert.equal(a.isAssumption, true);
  assert.equal(a.text, 'as of 2026-10-17');
  const ubc = sourceDates({ source: 'ubc-vertical-status', as_of: '2026-10-17' }, data.sources);
  assert.match(ubc.text, /published date not stated/);
});
