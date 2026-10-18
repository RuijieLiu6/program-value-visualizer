import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexData, evaluate, sensitivity, sampleTower, defaultSettings } from '../core/econ_core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const P = 'packs/vancouver-2026/';
const data = indexData({
  families: J('catalogue/families.json'), programmes: J('catalogue/programmes.json'),
  values: J(P + 'values.json'), costs: J(P + 'costs.json'), charges: J(P + 'charges.json'),
  assumptions: J(P + 'assumptions.json'), codeRules: J(P + 'code_rules.json'), sources: J(P + 'sources.json'),
  brief: J('briefs/vtc-2026/brief.json'),
});
const near = (actual, expected, tol = 0.02) => assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * tol, `${actual.toFixed(0)} not within ${tol * 100}% of ${expected}`);

// ---------- T1: a hand-worked two-floor check with pinned inputs (arithmetic in docs/method.md) ----------
const t1Settings = {
  podiumTopFloor: 8, softCost: 0.25, financeFactor: 0.20, profitOnCost: 0.15, officeLeasingCost: 0.15,
  programme: {
    LV1: { valuePerNetM2: 15069.6 * 0.95, efficiency: 0.78, premiumPerFloor: 0.007, hardCostPerM2: 4600 * 1.15, chargePerM2: 460 },
    WK1: { valuePerNetM2: 538.2 * 0.85 / 0.054, efficiency: 0.76, premiumPerFloor: 0.002, hardCostPerM2: 4465 * 1.15 + 860, chargePerM2: 315 },
  },
};

test('T1 hand-worked condo floor 50 (700 m2) within 2%', () => {
  const r = evaluate([{ level: 50, elevation_m: 200, height_m: 3.2, area_m2: 700, area_basis: 'gross', mix: [{ programme_id: 'LV1', share: 1 }] }], data, t1Settings);
  const i = r.items[0];
  near(i.value, 10.11e6);
  near(i.cost, 5.88e6);
  near(i.net_contribution, 3.36e6);
});

test('T1 hand-worked office floor 20 (2,300 m2) within 2%', () => {
  const r = evaluate([{ level: 20, elevation_m: 80, height_m: 4.2, area_m2: 2300, area_basis: 'gross', mix: [{ programme_id: 'WK1', share: 1 }] }], data, t1Settings);
  const i = r.items[0];
  near(i.value, 12.89e6);
  near(i.cost, 21.41e6);
  near(i.net_contribution, -11.73e6);
});

// ---------- T2: rules ----------
const fl = (level, mix, extra = {}) => ({ level, elevation_m: (level - 1) * 4, height_m: 4, area_m2: 1500, area_basis: 'gross', mix, ...extra });

test('T2 programme outside its fits gives a warning', () => {
  // Street retail (fits G) on level 30
  const floors = [fl(1, [{ programme_id: 'SE1', share: 1 }]), ...Array.from({ length: 30 }, (_, k) => fl(k + 2, [{ programme_id: 'WK1', share: 1 }]))];
  floors[29] = fl(30, [{ programme_id: 'SE1', share: 1 }]);
  const r = evaluate(floors, data, { podiumTopFloor: 2 });
  assert.ok(r.rules.some(x => x.type === 'fits' && x.level === 30));
});

test('T2 programme above its max_floor gives a warning', () => {
  const custom = indexData({ ...data.raw, programmes: { ...data.raw.programmes, programmes: data.raw.programmes.programmes.map(p => p.id === 'CH1' ? { ...p, max_floor: 2 } : p) } });
  const r = evaluate([fl(1, [{ programme_id: 'SE1', share: 1 }]), fl(2, [{ programme_id: 'WK1', share: 1 }]), fl(3, [{ programme_id: 'CH1', share: 1 }])], custom, {});
  assert.ok(r.rules.some(x => x.type === 'max_floor' && x.level === 3));
});

test('T2 intensity jump of 3 or more between neighbours asks for a buffer', () => {
  // Move & Play (5) directly under Live (1)
  const r = evaluate([fl(1, [{ programme_id: 'MP1', share: 1 }]), fl(2, [{ programme_id: 'LV4', share: 1 }])], data, {});
  assert.ok(r.rules.some(x => x.type === 'buffer'));
  // a mechanical floor between them removes the prompt
  const r2 = evaluate([fl(1, [{ programme_id: 'MP1', share: 1 }]), fl(2, [{ programme_id: 'SB2', share: 1 }]), fl(3, [{ programme_id: 'LV4', share: 1 }])], data, {});
  assert.ok(!r2.rules.some(x => x.type === 'buffer'));
});

test('T2 F1 occupancy with A/B/C occupancies is blocked', () => {
  const custom = indexData({ ...data.raw, programmes: { ...data.raw.programmes, programmes: data.raw.programmes.programmes.map(p => p.id === 'MK3' ? { ...p, occupancy_group: ['F1'] } : p) } });
  const r = evaluate([fl(1, [{ programme_id: 'MK3', share: 1 }]), fl(2, [{ programme_id: 'LV4', share: 1 }])], custom, {});
  assert.ok(r.rules.some(x => x.type === 'f1' && x.severity === 'block'));
});

test('T2 9.0 FSR non-residential check reports both hotel readings', () => {
  const floors = Array.from({ length: 40 }, (_, k) => fl(k + 1, [{ programme_id: k < 20 ? 'WK1' : 'ST2', share: 1 }], { area_m2: 3000 }));
  const r = evaluate(floors, data, {});
  assert.equal(r.fsr.minNonresFsr, 9.0);
  assert.ok(Math.abs(r.fsr.nonresWithHotel - 120000) < 1);
  assert.ok(Math.abs(r.fsr.nonresWithoutHotel - 60000) < 1);
  assert.equal(r.fsr.passWithHotel, true);   // 120,000 >= 103,212
  assert.equal(r.fsr.passWithoutHotel, false);
  assert.equal(r.fsr.pass, true);            // default: hotel counted as non-residential
  const r2 = evaluate(floors, data, { hotelAsNonResidential: false });
  assert.equal(r2.fsr.pass, false);
});

test('mix shares that do not add to 100% are reported', () => {
  const r = evaluate([fl(1, [{ programme_id: 'SE1', share: 0.6 }])], data, {});
  assert.ok(r.rules.some(x => x.type === 'mix_sum'));
});

// ---------- sample tower and invariants ----------
test('sample tower evaluates with sensible totals', () => {
  const floors = sampleTower();
  const r = evaluate(floors, data, {});
  assert.ok(r.height >= 244 && r.height <= 305, `height ${r.height}`);
  assert.ok(r.totals.gdv > 0 && r.totals.cost > 0);
  assert.ok(Math.abs(r.totals.profit - r.totals.cost * 0.15) < 1);
  assert.ok(['works', 'marginal', 'doesnt_work'].includes(r.verdict));
  // per-floor (value - cost - profit) adds up to RLV before CAC, apart from public running cost and the flat permit fee
  const sumNet = r.floors.reduce((s, f) => s + f.net, 0);
  const flat = r.totals.charges - r.items.reduce((s, i) => s + i.chargeTotal, 0);
  assert.ok(Math.abs(sumNet - (r.totals.rlvBeforeCac + r.totals.publicDeduction + flat * 1.15)) < 1);
  // the ledger total is at least the cash charges
  assert.ok(r.ledger.total >= r.ledger.dcl + r.ledger.utilitiesDcl);
});

test('office floors lose money and condo floors make money at default prices', () => {
  const r = evaluate([fl(20, [{ programme_id: 'WK1', share: 1 }], { area_m2: 2300, elevation_m: 80 }), fl(50, [{ programme_id: 'LV1', share: 1 }], { area_m2: 700, elevation_m: 200 })], data, { podiumTopFloor: 8 });
  const office = r.items.find(i => i.programme_id === 'WK1'), condo = r.items.find(i => i.programme_id === 'LV1');
  assert.ok(office.net_contribution < 0);
  assert.ok(condo.net_contribution > 0);
});

test('CAC is zero for an employment-only building and when the lift is negative', () => {
  const office = Array.from({ length: 10 }, (_, k) => fl(k + 1, [{ programme_id: 'WK1', share: 1 }]));
  const r = evaluate(office, data, {});
  assert.equal(r.employmentOnly, true);
  assert.equal(r.totals.cac, 0);
});

test('public running cost is subtracted unless the City or a partner pays', () => {
  const floors = [fl(1, [{ programme_id: 'LN4', share: 1 }]), fl(2, [{ programme_id: 'LV1', share: 1 }])];
  const a = evaluate(floors, data, { publicRunningCostPerM2: 100, publicPayer: 'cross_subsidy' });
  const b = evaluate(floors, data, { publicRunningCostPerM2: 100, publicPayer: 'city_or_partner' });
  assert.ok(Math.abs(a.totals.publicDeduction - 1500 * 100 / 0.05) < 1);
  assert.equal(b.totals.publicDeduction, 0);
  assert.ok(a.totals.rlvBeforeCac < b.totals.rlvBeforeCac);
});

test('sensitivity returns six tests sorted by swing', () => {
  const s = sensitivity(sampleTower(), data, {});
  assert.equal(s.tests.length, 6);
  for (let k = 1; k < s.tests.length; k++) assert.ok(s.tests[k - 1].swing >= s.tests[k].swing);
  for (const t of s.tests) assert.ok(t.low <= t.high);
});

test('defaults come from the pack', () => {
  const d = defaultSettings(data);
  assert.equal(d.softCost, 0.25);
  assert.equal(d.profitOnCost, 0.15);
  assert.equal(d.siteAreaM2, 11468);
  assert.equal(d.landPrice, null);
});

// ---------- review round 1 fixes ----------
test('empty building is incomplete, not "works"', () => {
  assert.equal(evaluate([], data, {}).verdict, 'incomplete');
});

test('a building with no priced programme is incomplete', () => {
  const r = evaluate([fl(1, [{ programme_id: 'SE6', share: 1 }])], data, { programme: { SE6: { valuePerM2Gfa: 8000 } }, landPrice: 0 });
  assert.equal(r.verdict, 'incomplete');
});

test('unknown programme ids make the verdict incomplete', () => {
  const r = evaluate([fl(1, [{ programme_id: 'ZZ9', share: 1 }]), fl(2, [{ programme_id: 'WK1', share: 1 }])], data, {});
  assert.equal(r.verdict, 'incomplete');
});

test('no land price gives "needs land" with the land budget, or "doesn\'t work" when even free land fails', () => {
  const condo = Array.from({ length: 30 }, (_, k) => fl(k + 30, [{ programme_id: 'LV1', share: 1 }], { area_m2: 900, elevation_m: 120 + k * 3.2 }));
  const r = evaluate(condo, data, { presaleMarket: 'normal', podiumTopFloor: 5 });
  assert.equal(r.verdict, 'needs_land');
  const office = Array.from({ length: 10 }, (_, k) => fl(k + 1, [{ programme_id: 'WK1', share: 1 }]));
  assert.equal(evaluate(office, data, {}).verdict, 'doesnt_work');
});

test('items without a cost line are flagged as estimated', () => {
  const r = evaluate([fl(1, [{ programme_id: 'CH1', share: 0.5 }, { programme_id: 'WK1', share: 0.5 }])], data, {});
  assert.ok(r.rules.some(x => x.type === 'cost_estimated' && x.text.startsWith('CH1')));
});

test('deck value is one total, spread over the deck area drawn', () => {
  const small = evaluate([fl(60, [{ programme_id: 'LE1', share: 1 }], { area_m2: 500 })], data, {});
  const big = evaluate([fl(60, [{ programme_id: 'LE1', share: 1 }], { area_m2: 3000 })], data, {});
  assert.ok(Math.abs(small.totals.gdv - big.totals.gdv) < 1);
  assert.ok(Math.abs(big.totals.gdv - 45000 * 3000) < 1);
});

test('City charges escalate 3% a year from 2026 to 2029', () => {
  const one = [fl(5, [{ programme_id: 'WK1', share: 1 }], { area_m2: 1000 })];
  const a = evaluate(one, data, { permitDate: '2026-10-01' }).ledger.dcl;
  const b = evaluate(one, data, { permitDate: '2028-10-01' }).ledger.dcl;
  const c = evaluate(one, data, { permitDate: '2031-10-01' }).ledger.dcl;
  assert.ok(Math.abs(a - 214890) < 1);
  assert.ok(Math.abs(b / a - 1.03 ** 2) < 1e-9);
  assert.ok(Math.abs(c / a - 1.03 ** 3) < 1e-9);   // capped at 2029
  const off = evaluate(one, data, { permitDate: '2028-10-01', applyEscalation: false }).ledger.dcl;
  assert.ok(Math.abs(off - a) < 1);
});

test('private lobbies are support space, not public floors', () => {
  const r = evaluate([fl(1, [{ programme_id: 'AM2', share: 0.2 }, { programme_id: 'LV1', share: 0.8 }])], data, { publicRunningCostPerM2: 300 });
  assert.equal(r.totals.publicDeduction, 0);
});

test('sensitivity multiplies user value overrides instead of replacing them', () => {
  const floors = Array.from({ length: 10 }, (_, k) => fl(k + 1, [{ programme_id: 'WK1', share: 1 }]));
  const a = sensitivity(floors, data, {}).tests.find(t => t.id === 'cap_rate');
  const b = sensitivity(floors, data, { valueScale: { O1: 2 } }).tests.find(t => t.id === 'cap_rate');
  assert.ok(Math.abs(a.high - b.high) > 1);
});
