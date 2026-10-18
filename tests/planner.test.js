// Concept starter: rule-based stack, apply_stack validation, planning guide, explanation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexData, evaluate } from '../core/econ_core.js';
import { starterStack, stackToFloors, planningGuide, explainStack, bandsFromFloors } from '../core/planner.js';

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
const mixAt = (floors, lv) => floors.find(f => f.level === lv).mix.map(m => m.programme_id);
const fam = (data, id) => data.programmes.get(id).family_id;

test('starter: retail at level 1, a deck or top use at the crown, plant about every 20 floors, homes above offices', () => {
  const st = starterStack({ priorities: ['homes'], meet_fsr: false }, none);
  const { floors } = stackToFloors(st, none);
  const top = Math.max(...floors.map(f => f.level));
  assert.ok(mixAt(floors, 1).includes('SE1'));
  assert.ok(mixAt(floors, top).some(id => fam(none, id) === 'LE'));
  const mech = floors.filter(f => f.mix.length === 1 && f.mix[0].programme_id === 'SB2').map(f => f.level);
  assert.ok(mech.length >= 2);
  for (let k = 1; k < mech.length; k++) assert.ok(mech[k] - mech[k - 1] >= 15 && mech[k] - mech[k - 1] <= 25, `plant floors ${mech}`);
  const lv = floors.filter(f => f.mix.some(m => fam(none, m.programme_id) === 'LV')).map(f => f.level);
  const wk = floors.filter(f => f.level > 4 && f.mix.some(m => fam(none, m.programme_id) === 'WK')).map(f => f.level);
  assert.ok(lv.length && wk.length && Math.min(...lv) > Math.max(...wk), 'homes sit above offices');
  assert.ok(floors.filter(f => f.level < 0).every(f => f.mix[0].programme_id === 'AM7'));
});

test('starter: meets the 9.0 FSR non-residential rule when asked, where the area allows', () => {
  const st = starterStack({ meet_fsr: true }, vtc);
  assert.equal(st.fsr.pass, true);
  const r = evaluate(stackToFloors(st, vtc).floors, vtc, { hotelAsNonResidential: true });
  assert.ok(r.fsr.nonresWithHotel >= r.fsr.requiredNonres);
  // too small to meet it: says so instead of pretending
  const small = starterStack({ meet_fsr: true, height_m: 150, plates: 'compact' }, vtc);
  if (!small.fsr.pass) assert.ok(small.notes.some(n => n.includes('cannot be met')));
});

test('starter: priorities and must-haves change the stack; care uses stay low', () => {
  const pub = starterStack({ priorities: ['public'], meet_fsr: false }, none);
  assert.ok(pub.bands.find(b => b.zone === 'level 2').mix.some(m => m.programme_id === 'GP5'));
  const must = starterStack({ must_have: ['CH3', 'MP2'], meet_fsr: false }, none);
  assert.deepEqual(must.placed.map(p => p.id).sort(), ['CH3', 'MP2']);
  const ch3 = must.bands.find(b => b.mix.some(m => m.programme_id === 'CH3'));
  assert.ok(ch3.to_level <= 4, 'B2 care use kept at or below the podium');
  assert.ok(must.bands.every(b => b.reason && b.reason.length > 10));
});

test('apply_stack validation rejects bad ids, shares, levels and towers before anything is built', () => {
  const ok = { tower: { height_m: 200 }, bands: [{ from_level: 1, to_level: 40, mix: [{ programme_id: 'WK1', share: 1 }] }] };
  assert.ok(stackToFloors(ok, none).floors.length > 40);
  const bad = [
    [{ ...ok, bands: [{ from_level: 1, to_level: 5, mix: [{ programme_id: 'XX9', share: 1 }] }] }, /unknown programme/],
    [{ ...ok, bands: [{ from_level: 1, to_level: 5, mix: [{ programme_id: 'WK1', share: 0.6 }] }] }, /add up to 60%/],
    [{ ...ok, bands: [{ from_level: 1, to_level: 5, mix: [{ programme_id: 'WK1', share: -1 }, { programme_id: 'LV1', share: 2 }] }] }, /share of WK1/],
    [{ ...ok, bands: [{ from_level: 9, to_level: 5, mix: [{ programme_id: 'WK1', share: 1 }] }] }, /above to_level/],
    [{ ...ok, bands: [{ from_level: 1.5, to_level: 5, mix: [{ programme_id: 'WK1', share: 1 }] }] }, /whole numbers/],
    [{ ...ok, bands: [{ from_level: 1, to_level: 500, mix: [{ programme_id: 'WK1', share: 1 }] }] }, /from -8 to 200/],
    [{ ...ok, tower: { height_m: 2000 } }, /height_m/],
    [{ ...ok, bands: [] }, /at least one band/],
  ];
  for (const [s, re] of bad) assert.throws(() => stackToFloors(s, none), re);
});

test('apply_stack: later bands win, plant floors stay unless named, gaps copy the nearest band, input is not mutated', () => {
  const s = { tower: { height_m: 120, podium_floors: 2 }, bands: [{ from_level: 1, to_level: 10, mix: [{ programme_id: 'WK1', share: 1 }] }, { from_level: 5, to_level: 6, mix: [{ programme_id: 'ST2', share: 1 }] }, { from_level: 20, to_level: 25, mix: [{ programme_id: 'LV1', share: 1 }] }] };
  const copy = JSON.stringify(s);
  const b = stackToFloors(s, none);
  assert.equal(JSON.stringify(s), copy);
  assert.deepEqual(mixAt(b.floors, 5), ['ST2']);
  assert.deepEqual(mixAt(b.floors, 12), ['WK1']);   // nearer to 1-10 than to 20-25
  assert.deepEqual(mixAt(b.floors, 18), ['LV1']);
  assert.ok(b.filled.length > 0);
  assert.ok(b.keptMech.includes(22));                 // generator plant floor (podium 2 + 20)
});

test('planning guide lists every programme with fits, value and basis, and the code rules', () => {
  const g = planningGuide(vtc);
  assert.equal(g.programmes.length, 112);
  assert.ok(g.programmes.every(p => 'fits' in p && 'value_m2' in p && 'basis' in p));
  for (const w of ['level 1', 'every 20 floors', '14 m2', 'B2/B3', 'F1']) assert.ok(g.rules.some(r => r.includes(w)), w);
  assert.equal(g.vtc_brief.min_nonres_fsr, 9);
  assert.ok(JSON.stringify(g).length < 40000, 'guide stays compact');
});

test('explanation: intent, bands base to crown with reasons, FSR both ways, money, moves, reminder', () => {
  const st = starterStack({ concept: 'A generic test tower', priorities: ['work'] }, vtc);
  const fl = stackToFloors(st, vtc).floors, r = evaluate(fl, vtc, {});
  const text = explainStack(r, vtc, { stack: st, floors: fl, concept: 'A generic test tower' });
  for (const w of ['Intent:', 'From the basement to the crown:', 'with hotel counted as non-residential', 'without', 'Money:', 'Moves to try:', 'not a recommendation of one design']) assert.ok(text.includes(w), w);
  const plain = explainStack(r, vtc, { floors: fl });
  assert.ok(plain.includes('L1'));
  assert.ok(bandsFromFloors(fl).length < fl.length);
});

test('page: Undo after apply_stack is one step (a single pushHistory) and the fallback is labelled', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');
  const fn = app.slice(app.indexOf('function applyStackToPage'), app.indexOf('const PLAN_TOOLS'));
  assert.equal((fn.match(/pushHistory\(\)/g) || []).length, 1);
  assert.ok(fn.indexOf('stackToFloors') < fn.indexOf('pushHistory'), 'validates before touching history');
  assert.match(app, /Rule-based starter \(no AI\)/);
  assert.match(app, /modelTier: 'default'/);
});
