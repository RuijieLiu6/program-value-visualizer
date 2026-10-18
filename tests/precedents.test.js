// Precedent presets and market scenarios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexData, evaluate, sampleTower, defaultSettings } from '../core/econ_core.js';
import { applyPreset, applyScenario, scenarioItems, scenarioLabel, presetStrip } from '../core/precedents.js';
import { optimiseMix } from '../core/optimiser.js';
import { validate } from '../core/validate_data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const P = 'packs/vancouver-2026/';
const raw = {
  families: J('catalogue/families.json'), programmes: J('catalogue/programmes.json'),
  values: J(P + 'values.json'), costs: J(P + 'costs.json'), charges: J(P + 'charges.json'),
  assumptions: J(P + 'assumptions.json'), codeRules: J(P + 'code_rules.json'), sources: J(P + 'sources.json'),
};
const data = indexData({ ...raw, brief: J('briefs/vtc-2026/brief.json') });
const prec = J('catalogue/precedents.json');
const forms = { 30: sampleTower({ height: 125 }), 60: sampleTower({ height: 255 }), 90: sampleTower({ height: 380 }) };
const above = fl => fl.filter(f => f.level >= 1);
const main = mix => [...mix].sort((a, b) => b.share - a.share)[0].programme_id;

test('the file holds 10-12 sourced presets; the validator accepts it', () => {
  assert.ok(prec.presets.length >= 10 && prec.presets.length <= 12);
  assert.deepEqual(validate(ROOT).errors, []);
  for (const p of prec.presets) { assert.ok(p.sources.length && p.relied_on.length && p.why); }
});

test('presets map onto forms of about 30, 60 and 90 floors with geometry unchanged', () => {
  for (const [n, form] of Object.entries(forms)) {
    assert.ok(Math.abs(above(form).length - Number(n)) <= 4, `${n}: ${above(form).length}`);
    for (const p of prec.presets) {
      const { floors } = applyPreset(form, p, data);
      assert.deepEqual(floors.map(f => [f.level, f.elevation_m, f.height_m, f.area_m2]), form.map(f => [f.level, f.elevation_m, f.height_m, f.area_m2]));
      for (const f of floors) {
        assert.ok(Math.abs(f.mix.reduce((a, m) => a + m.share, 0) - 1) < 1e-9);
        for (const m of f.mix) assert.ok(data.programmes.has(m.programme_id));
      }
      assert.ok(floors.filter(f => f.level < 0).every(f => main(f.mix) === 'AM7'));
      const l1 = floors.find(f => f.level === 1);
      assert.ok(l1.mix.some(m => ['SE', 'AM'].includes(data.programmes.get(m.programme_id).family_id)), `${p.id} L1`);
      // the crown takes the preset's top band, unless it is a plant floor
      const top = above(floors).at(-1), topBand = p.bands.at(-1);
      assert.ok(topBand.mix.some(m => m.programme_id === main(top.mix)), `${p.id} at ${n} floors: top ${main(top.mix)}`);
      // plant floors about every 20 floors when the preset lists none
      if (!p.bands.some(b => b.mix.some(m => m.programme_id === 'SB2')) && above(form).length > 25) assert.ok(floors.some(f => main(f.mix) === 'SB2'), p.id);
      assert.ok(evaluate(floors, data, {}).verdict !== 'incomplete', p.id);
    }
  }
});

test('locked floors are kept and order follows the preset bands', () => {
  const form = forms[60].map(f => (f.level === 30 ? { ...f, locked: true, mix: [{ programme_id: 'LN4', share: 1 }] } : f));
  const p = prec.presets.find(x => x.id === 'lotte-world-tower');
  const { floors, notes } = applyPreset(form, p, data);
  assert.equal(floors.find(f => f.level === 30).mix[0].programme_id, 'LN4');
  assert.ok(notes.some(n => n.includes('Locked')));
  const ab = above(floors).filter(f => !f.locked);
  const idx = id => ab.findIndex(f => main(f.mix) === id);
  assert.ok(idx('WK1') < idx('LV2') && idx('LV2') < idx('ST1') && idx('ST1') < idx('LE1'));
});

test('scenarios overlay the settings without touching the defaults, and turning them off restores them', () => {
  const base = defaultSettings(data), before = JSON.stringify(base);
  const strong = scenarioItems({ kind: 'market', id: 'strong_2021' }, data, prec);
  const s = applyScenario(base, strong);
  assert.equal(JSON.stringify(base), before, 'defaults not mutated');
  assert.equal(s.presaleMarket, 'normal');
  assert.ok(s.valueScale.R4 > 1);
  const off = applyScenario(base, scenarioItems(null, data, prec));
  assert.deepEqual(off, { ...base, valueScale: { ...(base.valueScale || {}) } });
  assert.equal(scenarioLabel({ kind: 'market', id: 'strong_2021' }, data, prec), 'Strong market (about 2021)');
  assert.match(scenarioLabel({ kind: 'precedent', id: 'living-shangri-la' }, data, prec), /Living Shangri-La/);
  // the scenario changes the result; without it the 2026 result is back
  const fl = applyPreset(sampleTower(), prec.presets[0], data).floors;
  const a = evaluate(fl, data, {}), b = evaluate(fl, data, applyScenario(defaultSettings(data), prec.presets[0].context.items)), c = evaluate(fl, data, {});
  assert.notEqual(a.verdict + a.totals.rlvAfterCac, b.verdict + b.totals.rlvAfterCac);
  assert.equal(c.totals.rlvAfterCac, a.totals.rlvAfterCac);
  // multiplicative value scales compose with the user's own
  assert.equal(applyScenario({ valueScale: { R4: 2 } }, [{ setting: 'valueScale.R4', to: 1.5 }]).valueScale.R4, 3);
});

test('the verdict says when the brief FSR rule is not met (money-only verdict)', () => {
  const fl = applyPreset(sampleTower(), prec.presets[0], data).floors;
  const r = evaluate(fl, data, {});
  assert.ok(r.reasons.some(x => x.includes('FSR non-residential rule')));
});

test('a seeded optimiser keeps more of the preset than an unseeded one', () => {
  const none = indexData({ ...raw, brief: J('briefs/none/brief.json') });
  const p = prec.presets.find(x => x.id === 'shangri-la-toronto');
  const seed = applyPreset(sampleTower(), p, none).floors;
  const same = fl => fl.filter((f, k) => main(f.mix) === main(seed[k].mix)).length;
  const free = optimiseMix(seed, none, {}, { polishPasses: 1 });
  const seeded = optimiseMix(seed, none, {}, { polishPasses: 1, seed: seed.map(f => ({ level: f.level, mix: f.mix })), seedPenaltyShare: 0.2 });
  assert.ok(same(seeded.best.floors) >= same(free.best.floors));
});

test('page: one Undo restores floors and scenario; the scenario is labelled in the header', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');
  const fn = app.slice(app.indexOf('function applyPresetToPage'), app.indexOf('function relyPanel'));
  assert.equal((fn.match(/pushHistory\(\)/g) || []).length, 1);
  assert.match(app, /scenario: state\.scenario, precedent: state\.precedent \}\)\); if \(history/);
  assert.match(app, /state\.scenario = o\.scenario \?\? null/);
  assert.match(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /id="scenarioChip"/);
  assert.equal(presetStrip(prec.presets[0], data).length, prec.presets[0].bands.length);
});

test('validator rejects broken presets: gaps, unknown ids, shares, unknown settings', () => {
  const broken = mutate => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvv-'));
    for (const d of ['catalogue', 'packs', 'briefs']) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
    const f = path.join(dir, 'catalogue/precedents.json'), j = JSON.parse(fs.readFileSync(f, 'utf8'));
    mutate(j.presets[0]); fs.writeFileSync(f, JSON.stringify(j));
    const r = validate(dir); fs.rmSync(dir, { recursive: true, force: true }); return r.errors.map(e => e.code);
  };
  assert.ok(broken(p => { p.bands[1].from += 0.05; }).includes('bands_gap'));
  assert.ok(broken(p => { p.bands[0].mix[0].programme_id = 'XX1'; }).includes('unknown_programme'));
  assert.ok(broken(p => { p.bands[0].mix[0].share = 0.5; }).includes('share_sum'));
  assert.ok(broken(p => { p.context.items[0].setting = 'magic'; }).includes('bad_setting'));
  assert.ok(broken(p => { p.sources = ['nowhere']; }).includes('unknown_source'));
});
