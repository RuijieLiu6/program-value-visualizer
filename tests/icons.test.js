// Programme icons and money symbols: one GPT-drawn glyph per id, drawn as well-formed SVG; Phosphor button icons resolve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLYPHS } from '../app/icons/glyphs.js';
import { glyphTile, glyphBare, tileColour, hasGlyph, INK } from '../app/icons/glyph_icons.js';
import { UI_ICONS, uiIcon } from '../app/icons/ui_icons.js';
import { SYMBOL_NAMES } from '../app/learn/symbols.js';

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

test('every catalogue programme and money symbol has a glyph, and no glyph is orphaned', () => {
  const ids = new Set(progs.map(p => p.id));
  assert.equal(ids.size, 112);
  for (const id of ids) assert.ok(hasGlyph(id), `no glyph for ${id}`);
  for (const n of SYMBOL_NAMES) assert.ok(hasGlyph(n), `no glyph for symbol ${n}`);
  for (const id of Object.keys(GLYPHS)) assert.ok(ids.has(id) || SYMBOL_NAMES.includes(id), `glyph ${id} is not used`);
  for (const [id, d] of Object.entries(GLYPHS)) assert.match(d, /^M[\d\s.,lcmzLCMZ-]+$/, `${id} path has unexpected commands`);
});

test('glyph tiles and bare glyphs are well-formed SVG with no ids or bad numbers', () => {
  for (const p of progs) {
    const svg = glyphTile(p.id, tileColour(colour[p.family_id]), 64);
    assert.match(svg, /^<svg class="gtile" viewBox="0 0 256 256" width="64" height="64" aria-hidden="true"/, p.id);
    assert.equal(wellFormed(svg), null, `${p.id}: ${wellFormed(svg)}`);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), `${p.id} has a bad number`);
    assert.ok(!/\sid="/.test(svg), `${p.id} uses an id, which would clash when 112 icons share a page`);
    assert.equal(wellFormed(glyphBare(p.id, 14)), null, p.id);
  }
  assert.match(glyphTile('MP1', '#fff', '100%', 'Gym <1>'), /role="img" aria-label="Gym &lt;1&gt;"/);
  assert.throws(() => glyphTile('nope', '#fff'), /unknown glyph/);
});

test('tile colours keep the ink readable (contrast 5.5:1 or better) for every family', () => {
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const lum = c => { const [r, g, b] = hex(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  for (const [fid, c] of Object.entries(colour)) {
    const t = tileColour(c);
    assert.match(t, /^#[0-9a-f]{6}$/, fid);
    assert.ok((lum(t) + 0.05) / (lum(INK) + 0.05) >= 5.5, `${fid}: ${t}`);
  }
});

test('every button and tab icon named in app.js exists in the Phosphor set', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');
  const block = name => app.slice(app.indexOf(`const ${name} = {`), app.indexOf('};', app.indexOf(`const ${name} = {`)));
  const names = [...block('TAB_ICONS').matchAll(/:\s*'([a-z-]+)'/g), ...block('BUTTON_ICONS').matchAll(/:\s*'([a-z-]+)'/g)].map(m => m[1]);
  assert.ok(names.length >= 40);
  for (const n of names) { assert.ok(UI_ICONS[n], `missing Phosphor icon ${n}`); assert.equal(wellFormed(uiIcon(n)), null, n); }
  assert.ok(!app.includes('icon_specs'), 'old isometric icon module still imported');
});

test('the Floors tab uses the visual picker, not a programme <select>', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');
  assert.match(app, /function programmePicker\(\)/);
  assert.ok(!app.includes("id: 'pickProg'"), 'old programme select still present');
  assert.match(app, /role: 'listbox'/);
  assert.match(app, /e\.key === 'Escape'/);
  assert.match(app, /“Add a programme…”/);   // Help step 3 mentions it
});
