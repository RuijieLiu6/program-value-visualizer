// Default land estimate: current-zoning value and land price when the user types none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexData, evaluate, estimateLand, sensitivity, defaultSettings, sampleTower } from '../core/econ_core.js';

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
const fl = (level, mix, extra = {}) => ({ level, elevation_m: (level - 1) * 4, height_m: 4, area_m2: 2000, area_basis: 'gross', mix, ...extra });
const condo = Array.from({ length: 40 }, (_, k) => fl(k + 1, [{ programme_id: 'LV1', share: 1 }], { area_m2: k === 0 ? 3000 : 900 }));

test('pack defaults: Area A 11.0 FSR (B), C$3,230 per buildable m2 (C), 0% premium (C), each with a range', () => {
  const e = raw.assumptions.land.estimate;
  assert.deepEqual([e.current_zoning_fsr.value, e.rate_per_buildable_m2.value, e.purchase_premium.value], [11, 3230, 0]);
  assert.deepEqual([e.current_zoning_fsr.grade, e.rate_per_buildable_m2.grade, e.purchase_premium.grade], ['B', 'C', 'C']);
  for (const k of ['current_zoning_fsr', 'rate_per_buildable_m2', 'purchase_premium']) assert.equal(e[k].range.length, 2);
  assert.ok(Math.abs(e.rate_per_buildable_m2.value - 300 * 10.764) < 5);
});

test('estimate = site area x current FSR x rate; land price = that x (1 + premium)', () => {
  const S = defaultSettings(vtc);
  const e = estimateLand(S, condo);
  assert.equal(e.siteSource, 'site area');
  assert.ok(S.siteAreaM2 > 11000 && S.siteAreaM2 < 11600);   // the brief's 79.2 x 144.8 m block
  assert.ok(Math.abs(e.currentZoningEstimate - S.siteAreaM2 * 11 * 3230) < 1);
  assert.equal(e.price, e.currentZoningValue);
  const p = estimateLand({ ...S, landPremium: 0.1 }, condo);
  assert.ok(Math.abs(p.price - p.currentZoningValue * 1.1) < 1);
  const r = evaluate(condo, vtc, { presaleMarket: 'normal' });
  assert.equal(r.totals.landEstimated, true);
  assert.ok(Math.abs(r.totals.landPrice - e.price) < 1);
  assert.notEqual(r.verdict, 'needs_land');
  assert.ok(r.reasons.some(x => /^Land price estimated: \d+ million dollars \(site area .* × current FSR 11 × C\$3,230\/m²\)\. Enter your own to override\.$/.test(x)), r.reasons.join('\n'));
});

test('typed values always win: a typed current-zoning value feeds the estimated price; a typed price is used as is', () => {
  const a = evaluate(condo, vtc, { landValueCurrentZoning: 100e6, landPremium: 0.2 });
  assert.equal(a.totals.landValueCurrentZoning, 100e6);
  assert.ok(Math.abs(a.totals.landPrice - 120e6) < 1);
  assert.equal(a.totals.landEstimated, true);
  assert.equal(a.land.currentZoningEstimated, false);
  const b = evaluate(condo, vtc, { landPrice: 50e6 });
  assert.equal(b.totals.landPrice, 50e6);
  assert.equal(b.totals.landEstimated, false);
  assert.ok(!b.reasons.some(x => x.startsWith('Land price estimated')));
  assert.equal(b.land.currentZoningEstimated, true);   // CAC still uses the estimate
});

test('no brief and no site area: the largest level-1 plate stands in for the site, and says so', () => {
  const r = evaluate(condo, none, {});
  assert.equal(r.land.footprintProxy, true);
  assert.equal(r.land.siteAreaM2, 3000);
  assert.ok(r.reasons.some(x => x.includes('largest ground-floor plate')));
  // nothing to estimate from: no site area and no level 1
  const up = condo.filter(f => f.level > 1);
  const n = evaluate(up, none, {});
  assert.equal(n.totals.landPrice, null);
  assert.ok(['needs_land', 'doesnt_work'].includes(n.verdict));
});

test('CAC is measured from the estimated current-zoning value, and the warning says so', () => {
  const r = evaluate(condo, vtc, { presaleMarket: 'normal' });
  const lift = r.totals.rlvBeforeCac - r.land.currentZoningValue;
  assert.ok(Math.abs(r.totals.cacLift - lift) < 1);
  assert.ok(r.warnings.some(w => w.startsWith('CAC lift is measured from the estimated land value')));
});

test('sensitivity reports headroom over land at the low and high land rate when land is estimated', () => {
  const s = sensitivity(condo, vtc, {});
  assert.ok(s.land);
  assert.ok(s.land.lowRate.landPrice < s.land.base.landPrice && s.land.highRate.landPrice > s.land.base.landPrice);
  assert.ok(s.land.lowRate.headroom > s.land.highRate.headroom);
  assert.equal(sensitivity(condo, vtc, { landPrice: 1e8 }).land, null);
});

test('sample tower: land is now estimated, and the verdict stays "doesn\'t work" because value does not cover cost even with free land', () => {
  const r = evaluate(sampleTower(), vtc, {});
  assert.equal(r.verdict, 'doesnt_work');
  assert.equal(r.totals.landEstimated, true);
  assert.ok(r.reasons.includes('Value does not cover cost and profit, even with free land.'));
});

test('page: land fields show the estimate with a chip, the 2014 hint is gone, and Ask AI can set the three land inputs', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');
  assert.match(app, /function landBlock\(/);
  assert.ok(!app.includes('For scale only: prime downtown land'), 'old 2014 hint still shown');
  assert.match(app, /'Use estimate'/);
  for (const k of ['landFsr', 'landRatePerM2', 'landPremium']) {
    assert.match(app, new RegExp(`${k}: \\[0, \\d+\\]`), `${k} has no range check`);
    assert.ok(app.includes(`'${k}'`), `${k} not settable by Ask AI`);
  }
  assert.match(app, /price_estimated: result\.totals\.landEstimated/);
});
