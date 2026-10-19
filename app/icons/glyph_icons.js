// Program Value Visualizer — draw a glyph from glyphs.js as a coloured tile (programme icons, money symbols)
// or bare in the text colour (inside small tags). Pure strings: no DOM needed (also used in Node tests).
import { GLYPHS, GLYPH_BOX } from './glyphs.js';

export const INK = '#1f1d1b';
export const hasGlyph = id => Object.hasOwn(GLYPHS, id);

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const lum = c => { const [r, g, b] = hex(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const toHsl = c => {
  const [r, g, b] = hex(c).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = 60 * (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4); }
  return [h, s, l];
};
const fromHsl = (h, s, l) => { const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return toHex([f(0), f(8), f(4)].map(v => v * 255)); };

const tileCache = new Map();
/**
 * Tile colour for a family (or symbol) colour: same hue, brightened to a saturated, light tone so the
 * near-black glyph reads at 5.5:1 or better. Near-greys become a warm grey-beige.
 */
export function tileColour(c) {
  if (!/^#[0-9a-f]{6}$/i.test(c || '')) return '#d9d2c4';
  if (!tileCache.has(c)) {
    let [h, s, l] = toHsl(c);
    if (s < 0.15) { h = 38; s = 0.2; l = 0.78; } else { s = Math.max(s, 0.72); l = 0.6; }
    let out = fromHsl(h, s, l);
    while (contrast(out, INK) < 5.5 && l < 0.92) { l += 0.02; out = fromHsl(h, s, l); }
    tileCache.set(c, out);
  }
  return tileCache.get(c);
}

const a11y = label => label ? `role="img" aria-label="${String(label).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))}"` : 'aria-hidden="true" focusable="false"';

/** A glyph on a rounded tile. fill is any CSS colour (a var() works); size in px or '100%'. */
export function glyphTile(id, fill, size = 48, label = '', cls = 'gtile') {
  const d = GLYPHS[id];
  if (!d) throw new Error(`unknown glyph ${id}`);
  return `<svg class="${cls}" viewBox="0 0 ${GLYPH_BOX} ${GLYPH_BOX}" width="${size}" height="${size}" ${a11y(label)}><rect width="${GLYPH_BOX}" height="${GLYPH_BOX}" rx="54" style="fill:${fill}"/><path d="${d}" style="fill:${INK}"/></svg>`;
}

/** The glyph alone, cropped close and filled with the text colour, for small inline tags. */
export function glyphBare(id, size = 14, label = '', cls = 'gbare') {
  const d = GLYPHS[id];
  if (!d) throw new Error(`unknown glyph ${id}`);
  return `<svg class="${cls}" viewBox="36 36 184 184" width="${size}" height="${size}" fill="currentColor" ${a11y(label)}><path d="${d}"/></svg>`;
}
