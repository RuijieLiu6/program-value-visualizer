// Program Value Visualizer — the money symbols shared by the tool and the Tower Money Book.
// Tile colours come from CSS custom properties (--sym-tile-*) with fallbacks, so a page can theme them.
// Pure strings: no DOM needed (also used in Node tests).
import { glyphTile, glyphBare, tileColour } from '../icons/glyph_icons.js';

// Traffic-light lamp colours (themeable).
const C = { good: 'var(--sym-good, #3fc07a)', warn: 'var(--sym-warn, #f2b632)', bad: 'var(--sym-bad, #e5534b)', off: 'var(--sym-off, #4b5660)' };
// Each symbol is a GPT-drawn glyph (app/icons/glyphs.js) on a tile in its own colour, brightened so the ink reads.
const SYM_COLOUR = {
  coin: 'coin', coins: 'coin', tree: 'tree', brick: 'brick', plans: 'plans', clock: 'clock', city: 'city', piggy: 'piggy',
  land: 'land', sale: 'sale', rent: 'rent', operate: 'operate', public: 'public', support: 'support',
  house: '#e8dcc0', bank: 'support', crane: 'brick', check: 'good', cross: 'bad',
};
const BASE = {
  coin: '#f0c13b', brick: '#c8643b', plans: '#4f7cac', clock: '#9b87c9', city: '#5b7b95', piggy: '#e88fa8', land: '#4f9b5a',
  sale: '#3b74d1', rent: '#2f9a5e', operate: '#8457c9', public: '#e07b32', support: '#8d98a3', tree: '#56a865', good: '#3fc07a', bad: '#e5534b',
};
const tileFill = name => { const k = SYM_COLOUR[name]; return k.startsWith('#') ? tileColour(k) : `var(--sym-tile-${k}, ${tileColour(BASE[k])})`; };

/** Names of every symbol, so pages and tests can list them. */
export const SYMBOL_NAMES = Object.keys(SYM_COLOUR);

/**
 * One symbol as an SVG string. size in px; label gives it a text alternative, otherwise it is decorative.
 * { bare: true } draws the glyph alone in the text colour, for small tags. Unknown names throw, so a typo
 * shows up in tests rather than as an empty space.
 */
export function sym(name, size = 24, label = '', { bare = false } = {}) {
  if (!SYM_COLOUR[name]) throw new Error(`unknown symbol ${name}`);
  return bare ? glyphBare(name, size, label, `sym sym-${name} sym-bare`) : glyphTile(name, tileFill(name), size, label, `sym sym-${name}`);
}

/** A traffic light that shows a verdict: works = green, marginal = amber, anything else = red. */
export function trafficLight(verdict, size = 28) {
  const on = verdict === 'works' ? 0 : verdict === 'marginal' ? 1 : verdict === 'needs_land' || verdict === 'incomplete' ? -1 : 2;
  const lamp = (i, col) => `<circle cx="16" cy="${8.2 + i * 7.8}" r="3.4" style="fill:${on === i ? col : C.off}"/>`;
  return `<svg class="sym sym-light" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" focusable="false"><rect x="9.5" y="2" width="13" height="28" rx="4.5" style="fill:var(--sym-light-body, #24303a)"/>${lamp(0, C.good)}${lamp(1, C.warn)}${lamp(2, C.bad)}</svg>`;
}

/** Which symbol stands for each way a floor earns (keys match the tool's tenure tags). */
export const TENURE_SYMBOL = { sale: 'sale', rent: 'rent', operate: 'operate', public: 'public', support: 'support' };
