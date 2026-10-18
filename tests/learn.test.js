// Tower Money Book: symbols, the money stack, chapters, illustrations and the playground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexData, evaluate, sampleTower } from '../core/econ_core.js';
import { moneySteps, toySteps, moneyStackHTML } from '../core/money_steps.js';
import { sym, SYMBOL_NAMES, trafficLight } from '../app/learn/symbols.js';
import { CHAPTERS, SYMBOL_KEY, playTower, PLAY_SETTINGS } from '../app/learn/money_story.js';

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

function wellFormed(svg) {
  const stack = [], re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/g;
  let pos = 0, m;
  while ((m = re.exec(svg))) {
    if (svg.slice(pos, m.index).includes('<')) return `stray < before ${m[0].slice(0, 40)}`;
    pos = re.lastIndex;
    if (m[4]) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return `bad close ${m[2]}`; } else stack.push(m[2]);
  }
  if (stack.length) return `unclosed ${stack.at(-1)}`;
  return svg.slice(pos).includes('<') ? 'trailing <' : null;
}

test('every money symbol is a well-formed SVG; unknown names throw; labels give a text alternative', () => {
  assert.ok(SYMBOL_NAMES.length >= 18);
  for (const n of SYMBOL_NAMES) {
    const s = sym(n, 24);
    assert.equal(wellFormed(s), null, n);
    assert.match(s, /aria-hidden="true"/);
  }
  assert.match(sym('coin', 20, 'Coins <in>'), /role="img" aria-label="Coins &lt;in&gt;"/);
  assert.throws(() => sym('nope'), /unknown symbol/);
  for (const v of ['works', 'marginal', 'doesnt_work', 'needs_land']) assert.equal(wellFormed(trafficLight(v)), null);
  for (const [s] of SYMBOL_KEY) assert.ok(SYMBOL_NAMES.includes(s), s);
});

const condoTower = playTower({ ground: 'shops', low: 'condo', mid: 'condo', high: 'condo', top: 'public' });
test('the money stack adds up exactly to the residual after CAC (with public upkeep and CAC present)', () => {
  const runs = [
    evaluate(sampleTower(), vtc, {}),
    evaluate(condoTower, none, { ...PLAY_SETTINGS, landValueCurrentZoning: 1e6, publicRunningCostPerM2: 120, publicPayer: 'cross_subsidy' }),
    evaluate(condoTower, none, { ...PLAY_SETTINGS, landValueCurrentZoning: 1e6, publicRunningCostPerM2: 120, publicPayer: 'cac_endowment' }),
  ];
  for (const r of runs) {
    const ms = moneySteps(r);
    const sum = ms.steps.reduce((a, s) => a + s.amount, 0);
    assert.ok(Math.abs(sum - r.totals.rlvAfterCac) < 1, `${sum} vs ${r.totals.rlvAfterCac}`);
    assert.equal(ms.land, r.totals.landPrice);
    const html = moneyStackHTML(ms, { fmt: x => `${(x / 1e6).toFixed(0)}`, sym: n => sym(n, 20) });
    assert.equal(wellFormed(html), null);
    for (const s of ms.steps) assert.ok(html.includes(s.label.replace(/’/g, '&#39;').replace(/'/g, '&#39;')) || html.includes(s.label), s.label);
  }
  assert.ok(moneySteps(runs[1]).steps.some(s => s.key === 'cac'), 'CAC step shows when there is a CAC');
  assert.ok(moneySteps(runs[1]).steps.some(s => s.key === 'public'), 'public upkeep step shows when it is charged');
});

test('the worked example uses the tool’s own ratios and verdict rule', () => {
  const t = toySteps({ worth: 100, build: 45, land: 10 });
  const soft = 45 * 0.25, fin = (45 + soft) * 0.195, cost = 45 + soft + fin + 5;
  assert.ok(Math.abs(t.left - (100 - cost - cost * 0.15)) < 1e-9);
  assert.equal(t.verdict, t.left >= 10 ? 'works' : (10 - t.left) / 10 <= 0.1 ? 'marginal' : 'doesnt_work');
  assert.equal(toySteps({ worth: 60, build: 80, land: 10 }).verdict, 'doesnt_work');
  assert.equal(toySteps({ worth: 160, build: 30, land: 5 }).verdict, 'works');
  // the finance share matches the pack (rate x years x share borrowed)
  const f = raw.assumptions.finance;
  assert.ok(Math.abs(f.rate.value * f.build_years.value * f.draw_factor.value - 0.195) < 1e-9);
});

test('13 chapters, in order, each with a title, short sentences and a way into the tool', () => {
  assert.equal(CHAPTERS.length, 13);
  assert.equal(new Set(CHAPTERS.map(c => c.id)).size, 13);
  for (const c of CHAPTERS) {
    assert.ok(c.title && c.text.length >= 1, c.id);
    for (const t of c.text) {
      for (const [, n] of t.matchAll(/\{([a-z]+)\}/g)) assert.ok(SYMBOL_NAMES.includes(n), `${c.id}: {${n}}`);
      for (const sentence of t.replace(/\*\*/g, '').split(/(?<=[.!?:])\s+/)) assert.ok(sentence.split(/\s+/).length <= 32, `${c.id}: long sentence “${sentence.slice(0, 60)}…”`);
    }
    if (c.tool) assert.ok(['floors', 'verdict', 'city', 'sens', 'assume', 'about', 'map', 'ai'].includes(c.tool.tab), c.id);
  }
  assert.deepEqual(CHAPTERS.slice(0, 7).map(c => c.id), ['stack', 'earn', 'tree', 'height', 'costs', 'profit', 'land']);
  // written for adults with no finance background: real terms, defined once, a design takeaway, no pretend money
  const all = CHAPTERS.flatMap(c => [c.title, ...c.text, c.design || '', c.tool?.text || '']).join(' ').replace(/\{[a-z]+\}/g, '');
  for (const term of ['cap rate', 'gross development value', 'residual land value', 'community amenity contribution', 'presales', 'Floor space ratio', 'Hard cost', 'Soft cost', 'Finance cost']) assert.ok(all.toLowerCase().includes(term.toLowerCase()), term);
  assert.ok(!/\bcoins?\b|thank-you|pretend/i.test(all), 'childish wording left');
  assert.ok(CHAPTERS.filter(c => c.design).length >= 11, 'design takeaways');
});

test('every chapter picture exists, is well formed, themed through tokens and safe to draw twice', async () => {
  const { SCENES, SCENE_NAMES } = await import('../app/learn/scenes.js');
  for (const c of CHAPTERS.filter(x => x.scene)) assert.ok(SCENE_NAMES.includes(c.scene), c.scene);
  for (const n of SCENE_NAMES) {
    const a = SCENES[n](), b = SCENES[n]();
    assert.equal(wellFormed(a), null, n);
    assert.match(a, /^<svg[^>]*viewBox="0 0 360 240"/, n);
    assert.match(a, /<title id="[^"]+">[^<]{10,}<\/title>/, n);
    assert.ok(!/\s(fill|stroke)="#[0-9a-f]{3,6}"/i.test(a), `${n}: literal colour attribute`);
    const ids = s => [...s.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(ids(a).filter(id => ids(b).includes(id)).length, 0, `${n}: ids repeat between two drawings`);
    assert.ok(a.length < 9000, `${n}: ${a.length} characters`);
  }
});

test('the playground tower runs on the real calculator and shows the presale lesson', () => {
  const pick = { ground: 'shops', low: 'office', mid: 'rental', high: 'condo', top: 'deck' };
  const fl = playTower(pick);
  assert.equal(fl.length, 40);
  const weak = evaluate(fl, none, { ...PLAY_SETTINGS, presaleMarket: 'weak' }), normal = evaluate(fl, none, { ...PLAY_SETTINGS, presaleMarket: 'normal' });
  assert.equal(weak.verdict, 'marginal');
  assert.equal(normal.verdict, 'works');
  const allOffice = evaluate(playTower({ ground: 'shops', low: 'office', mid: 'office', high: 'office', top: 'skybar' }), none, PLAY_SETTINGS);
  assert.equal(allOffice.verdict, 'doesnt_work');
});

test('the tool uses the same money stack, symbols and Help book', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');
  assert.match(app, /moneyStackHTML\(moneySteps\(r\)/);
  assert.match(app, /trafficLight\(r\.verdict/);
  assert.match(app, /html: sym\(t\.key, 12\)/);
  assert.match(app, /renderMoneyStory\(moneyView, \{ data, mode: 'guide'/);
  const page = fs.readFileSync(path.join(ROOT, 'money-book.html'), 'utf8');
  assert.match(page, /<title>Tower Money Book<\/title>/);
  assert.match(page, /renderMoneyStory\(document\.getElementById\('book'\), \{ data, mode: 'book' \}\)/);
});
