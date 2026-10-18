// Programme icons: one spec per catalogue id, and each drawing is a well-formed SVG string.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawIcon, SPECS } from '../app/icons/icon_specs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const progs = J('catalogue/programmes.json').programmes;
const colour = Object.fromEntries(J('catalogue/families.json').families.map(f => [f.family_id, f.colour]));

/** Minimal well-formedness check: tags nest and close, attributes are quoted, no NaN or undefined leaks in. */
function wellFormed(svg) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/g;
  let pos = 0, m;
  while ((m = re.exec(svg))) {
    if (svg.slice(pos, m.index).includes('<')) return `stray "<" before ${m[0].slice(0, 30)}`;
    pos = re.lastIndex;
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) { if (stack.pop() !== name) return `</${name}> does not close the open tag`; }
    else stack.push(name);
  }
  if (svg.slice(pos).includes('<')) return 'unparsed tag at the end';
  if (stack.length) return `unclosed <${stack.at(-1)}>`;
  return null;
}

test('every catalogue programme has an icon spec, and no spec is orphaned', () => {
  const ids = new Set(progs.map(p => p.id));
  assert.equal(ids.size, 112);
  for (const id of ids) assert.equal(typeof SPECS[id], 'function', `no spec for ${id}`);
  for (const id of Object.keys(SPECS)) assert.ok(ids.has(id), `spec ${id} has no programme`);
});

test('drawIcon returns a well-formed, deterministic SVG for every programme', () => {
  for (const p of progs) {
    const svg = drawIcon(p.id, colour[p.family_id], 64);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100" width="64" height="64"/, p.id);
    assert.ok(svg.endsWith('</svg>'), p.id);
    assert.equal(wellFormed(svg), null, `${p.id}: ${wellFormed(svg)}`);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), `${p.id} has a bad number`);
    assert.ok(!/\sid="/.test(svg), `${p.id} uses an id, which would clash when 112 icons share a page`);
    assert.equal(drawIcon(p.id, colour[p.family_id], 64), svg, `${p.id} is not deterministic`);
  }
});

test('the Floors tab uses the visual picker, not a programme <select>', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');
  assert.match(app, /function programmePicker\(\)/);
  assert.ok(!app.includes("id: 'pickProg'"), 'old programme select still present');
  assert.match(app, /role: 'listbox'/);
  assert.match(app, /e\.key === 'Escape'/);
  assert.match(app, /“Add a programme…”/);   // Help step 3 mentions it
});
