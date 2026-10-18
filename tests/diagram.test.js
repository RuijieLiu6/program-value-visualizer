// Word-stack diagram layout and SVG; reading a concept diagram (generic made-up schemes only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexData, evaluate, sampleTower } from '../core/econ_core.js';
import { wordStackLayout, wordStackSVG, CHAR_W, shortName } from '../core/wordstack.js';
import { normaliseDiagramRead, validateDiagramBands, floorsFromBands, readPrompt, floorHeightFor } from '../core/diagram_read.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const P = 'packs/vancouver-2026/';
const data = indexData({
  families: J('catalogue/families.json'), programmes: J('catalogue/programmes.json'),
  values: J(P + 'values.json'), costs: J(P + 'costs.json'), charges: J(P + 'charges.json'),
  assumptions: J(P + 'assumptions.json'), codeRules: J(P + 'code_rules.json'), sources: J(P + 'sources.json'),
  brief: J('briefs/none/brief.json'),
});
const result = evaluate(sampleTower(), data, {});

function wellFormed(svg) {
  const stack = [], re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/g;
  let pos = 0, m;
  while ((m = re.exec(svg))) {
    if (svg.slice(pos, m.index).includes('<')) return 'stray <';
    pos = re.lastIndex;
    if (m[4]) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return `bad close ${m[2]}`; } else stack.push(m[2]);
  }
  if (stack.length) return `unclosed ${stack.at(-1)}`;
  return svg.slice(pos).includes('<') ? 'trailing <' : null;
}

test('layout: bands are contiguous floors grouped by main programme, from the basement up, at true scale', () => {
  const L = wordStackLayout(result, data);
  assert.ok(L.bands.length >= 6 && L.bands.length < result.floors.length);
  const levels = result.floors.map(f => f.level).sort((a, b) => a - b);
  for (let k = 1; k < L.bands.length; k++) assert.equal(levels.indexOf(L.bands[k].fromLevel), levels.indexOf(L.bands[k - 1].toLevel) + 1, 'no floor skipped between bands');
  for (const b of L.bands) assert.ok(Math.abs((b.y1 - b.y0) - (b.z1 - b.z0) * L.k) < 0.01, 'height on scale');
  const fam = wordStackLayout(result, data, { groupBy: 'family' });
  assert.ok(fam.bands.length <= L.bands.length);
});

test('layout: word size grows with area in every band, the main word is largest, and every word fits the band width', () => {
  for (const opts of [{}, { labels: 'tenure' }, { showArea: true }, { width: 360 }]) {
    const L = wordStackLayout(result, data, opts);
    for (const b of L.bands) {
      const ws = [...b.words].sort((a, c) => c.gfa - a.gfa);
      assert.ok(ws[0].dominant);
      for (let k = 1; k < ws.length; k++) assert.ok(ws[k].size <= ws[k - 1].size + 1e-9 || ws[k].size <= 5 + 1e-9, `${ws[k].text} larger than ${ws[k - 1].text}`);
      for (const w of ws) assert.ok(w.x + w.text.length * w.size * CHAR_W <= L.pad.left + L.colW + 0.5, `${w.text} overflows in ${JSON.stringify(opts)}`);
    }
  }
});

test('SVG is well formed, escapes text, has elevation tags, a ground line and the estimate label', () => {
  const L = wordStackLayout(result, data);
  const svg = wordStackSVG(L, { families: data.families, title: 'Test <tower> & co' });
  assert.equal(wellFormed(svg), null);
  assert.match(svg, /TEST &lt;TOWER&gt; &amp; CO/);
  assert.match(svg, /±0\.0 m/);
  assert.match(svg, /\+\d+\.\d m/);
  assert.match(svg, /Indicative early-design estimate/);
  assert.ok(!/NaN|undefined/.test(svg));
  assert.equal(wellFormed(wordStackSVG(L, { colour: 'ink', showArea: true, embedFont: false })), null);
  assert.equal(shortName('WK1', data), 'Offices');
});

const reading = { height_m: 120, bands: [
  { from_m: -7, to_m: 0, label_text: 'PARKING', programmes: [{ text: 'PARKING', programme_id: 'AM7', share: 1, confidence: 0.9 }] },
  { from_m: 0, to_m: 12, label_text: 'LOBBY MARKET', programmes: [{ text: 'MARKET', programme_id: 'SE3', share: 0.6, confidence: 0.8 }, { text: 'LOBBY', programme_id: 'AM4', share: 0.4, confidence: 0.9 }] },
  { from_m: 12, to_m: 60, label_text: 'OFFICE', programmes: [{ text: 'OFFICE', programme_id: 'WK1', share: 1, confidence: 0.95 }] },
  { from_m: 60, to_m: 66, label_text: 'PLANT', programmes: [{ text: 'PLANT', programme_id: 'SB2', share: 1, confidence: 0.7 }] },
  { from_m: 66, to_m: 120, label_text: 'HOMES', programmes: [{ text: 'HOMES', programme_id: 'LV4', share: 1, confidence: 0.85 }] },
], unreadable: [], notes: 'A generic made-up scheme.' };

test('reading: the normaliser keeps bad model output editable instead of failing', () => {
  const n = normaliseDiagramRead({ bands: [{ from_m: 30, to_m: 10, programmes: [{ text: 'GYM', programme_id: 'ZZ1', share: 2 }, { text: 'SPA', programme_id: 'h5', share: 2 }] }, { from_m: 20, to_m: 40, programmes: [] }] }, data);
  assert.equal(n.bands[0].from_m, 10);                               // swapped
  assert.equal(n.bands[0].programmes[0].programme_id, null);         // unknown id left to pick
  assert.ok(Math.abs(n.bands[0].programmes.reduce((a, p) => a + p.share, 0) - 1) < 1e-9);
  assert.ok(n.issues.some(x => x.includes('overlap')));
  assert.ok(n.issues.some(x => x.includes('no programme')));
  assert.deepEqual(normaliseDiagramRead(null, data).bands, []);
});

test('reading: the strict validator rejects bad ids, overlapping bands and shares that do not add up', () => {
  const b = JSON.parse(JSON.stringify(reading.bands)).map(x => ({ ...x }));
  assert.equal(validateDiagramBands(b, data).length, 5);
  const bad = (mut, re) => { const c = JSON.parse(JSON.stringify(reading.bands)); mut(c); assert.throws(() => validateDiagramBands(c, data), re); };
  bad(c => { c[2].programmes[0].programme_id = 'NOPE'; }, /needs a programme/);
  bad(c => { c[3].from_m = 50; }, /overlap/);
  bad(c => { c[1].programmes[0].share = 0.3; }, /add up to 70%/);
  bad(c => { c[2].to_m = 10; }, /top must be above/);
  bad(c => { c[2].programmes = []; }, /add a programme/);
  assert.throws(() => validateDiagramBands([], data), /at least one band/);
});

test('reading: floors keep band boundaries at the read heights, with taller lobby and plant floors', () => {
  const { floors, height_m } = floorsFromBands(reading.bands, data, {});
  assert.equal(height_m, 120);
  const top = f => Math.round((f.elevation_m + f.height_m) * 100) / 100;
  for (const z of [0, 12, 60, 66, 120]) assert.ok(floors.some(f => Math.abs(top(f) - z) < 0.02) || z === 0, `boundary ${z} m kept`);
  assert.ok(floors.some(f => f.level === -1) && floors.some(f => f.level === 1));
  assert.equal(floors.find(f => f.level === 1).elevation_m, 0);
  const h = id => floors.find(f => f.mix[0].programme_id === id).height_m;
  assert.ok(h('SE3') > h('WK1') && h('WK1') > h('LV4'));
  assert.ok(floorHeightFor([{ programme_id: 'SB5', share: 1 }], data, 50) === 6);
  const r = evaluate(floors, data, {});
  assert.ok(Math.abs(r.height - 120) < 0.01);
  // gaps are closed, not left empty
  const gap = JSON.parse(JSON.stringify(reading.bands)); gap[2].to_m = 55;
  const g = floorsFromBands(gap, data, {});
  assert.ok(g.notes.some(n => n.includes('Gap')));
});

test('reading prompt carries the compact catalogue and asks for JSON with confidence', () => {
  const p = readPrompt(data);
  assert.ok(p.includes('WK3|') && p.includes('SB5|') && p.includes('"confidence"'));
  assert.ok(p.length < 30000);
});

test('tower outline: every word sits inside its band of the tower silhouette, and the outline narrows with smaller plates', () => {
  const r = evaluate(sampleTower(), data, {});
  const L = wordStackLayout(r, data, { shape: 'tower' });
  assert.equal(L.shape, 'tower');
  assert.ok(L.outline && L.outline.startsWith('M'));
  for (const b of L.bands) for (const w of b.words) {
    assert.ok(w.x >= b.rx0 - 0.5, `${w.text} starts left of the tower`);
    assert.ok(w.x + w.text.length * w.size * CHAR_W <= Math.max(b.rx1, b.rx0 + 12) + 1, `${w.text} runs past the tower edge`);
  }
  const podium = L.bands.find(b => b.toLevel <= 2), crown = L.bands[L.bands.length - 1];
  assert.ok(crown.rx1 - crown.rx0 < podium.rx1 - podium.rx0, 'crown narrower than podium');
  const bar = wordStackLayout(r, data, { shape: 'bar' });
  assert.equal(bar.outline, null);
  assert.ok(wordStackSVG(L).includes('<path d="M'));
});
