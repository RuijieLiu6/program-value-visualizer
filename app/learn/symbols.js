// Program Value Visualizer — the money symbols shared by the tool and the Tower Money Book.
// Each symbol is a small "sticker": a coloured shape with a dark outline, readable on light and dark pages.
// Colours come from CSS custom properties (--sym-*) with fallbacks, so a page can theme them.
// Pure strings: no DOM needed (also used in Node tests).

const INK = 'var(--sym-ink, #1d2730)';
const C = {
  coin: 'var(--sym-coin, #f0c13b)', brick: 'var(--sym-brick, #c8643b)', plans: 'var(--sym-plans, #4f7cac)',
  clock: 'var(--sym-clock, #9b87c9)', city: 'var(--sym-city, #5b7b95)', piggy: 'var(--sym-piggy, #e88fa8)',
  land: 'var(--sym-land, #4f9b5a)', flag: 'var(--sym-flag, #d9534f)', paper: 'var(--sym-paper, #fbfaf6)',
  sale: 'var(--sym-sale, #3b74d1)', rent: 'var(--sym-rent, #2f9a5e)', operate: 'var(--sym-operate, #8457c9)',
  public: 'var(--sym-public, #e07b32)', support: 'var(--sym-support, #8d98a3)', tree: 'var(--sym-tree, #56a865)',
  good: 'var(--sym-good, #3fc07a)', warn: 'var(--sym-warn, #f2b632)', bad: 'var(--sym-bad, #e5534b)', off: 'var(--sym-off, #4b5660)',
};
const st = (fill, sw = 1.8) => `style="fill:${fill};stroke:${INK};stroke-width:${sw};stroke-linejoin:round;stroke-linecap:round"`;
const line = (sw = 1.6) => `style="fill:none;stroke:${INK};stroke-width:${sw};stroke-linecap:round;stroke-linejoin:round"`;

const DRAW = {
  // money in
  coin: () => `<circle cx="16" cy="16" r="12" ${st(C.coin)}/><circle cx="16" cy="16" r="8.2" ${line(1.2)}/><path d="M18.6 12.4c-.6-.9-1.6-1.3-2.7-1.3-1.6 0-2.8.8-2.8 2.1 0 2.9 5.8 1.5 5.8 4.6 0 1.3-1.3 2.2-3 2.2-1.2 0-2.3-.5-2.9-1.4M16 9.6v1.5M16 20v1.6" ${line(1.5)}/>`,
  coins: () => `<ellipse cx="16" cy="24" rx="10" ry="3.6" ${st(C.coin)}/><path d="M6 24v-3.5" ${line()}/><path d="M26 24v-3.5" ${line()}/><ellipse cx="16" cy="20.5" rx="10" ry="3.6" ${st(C.coin)}/><path d="M6 20.5V17M26 20.5V17" ${line()}/><ellipse cx="16" cy="17" rx="10" ry="3.6" ${st(C.coin)}/><path d="M6 17v-3.5M26 17v-3.5" ${line()}/><ellipse cx="16" cy="13.5" rx="10" ry="3.6" ${st(C.coin)}/>`,
  tree: () => `<path d="M16 29v-9" ${line(2.4)}/><path d="M16 22l-4-3M16 21l4-4" ${line(1.6)}/><circle cx="16" cy="11" r="8.5" ${st(C.tree)}/><circle cx="12" cy="10" r="2.4" ${st(C.coin, 1.2)}/><circle cx="19.5" cy="8.5" r="2.4" ${st(C.coin, 1.2)}/><circle cx="17" cy="14.5" r="2.4" ${st(C.coin, 1.2)}/><circle cx="25" cy="27" r="2.6" ${st(C.coin, 1.2)}/>`,
  // money out
  brick: () => `<rect x="3.5" y="8" width="25" height="17" rx="1.5" ${st(C.brick)}/><path d="M3.5 13.7h25M3.5 19.3h25M11 8v5.7M21 8v5.7M7 13.7v5.6M16 13.7v5.6M25 13.7v5.6M11 19.3V25M21 19.3V25" ${line(1.3)}/>`,
  plans: () => `<rect x="5" y="5" width="20" height="23" rx="1.5" ${st(C.plans)}/><path d="M9 10h12M9 14h12M9 18h7" style="fill:none;stroke:${C.paper};stroke-width:1.6;stroke-linecap:round"/><path d="M21 27l7-7 2 2-7 7h-2z" ${st(C.coin, 1.4)}/>`,
  clock: () => `<circle cx="16" cy="17" r="11" ${st(C.clock)}/><path d="M16 10.5V17l4.5 3" ${line(2)}/><path d="M11 4.5h10" ${line(2)}/><path d="M16 4.5V6" ${line(2)}/>`,
  city: () => `<path d="M4 12L16 5l12 7z" ${st(C.city)}/><rect x="5.5" y="12" width="21" height="2.5" ${st(C.city, 1.4)}/><path d="M8.5 14.5v9M13 14.5v9M19 14.5v9M23.5 14.5v9" ${line(2)}/><rect x="4" y="23.5" width="24" height="3.5" ${st(C.city, 1.4)}/>`,
  piggy: () => `<ellipse cx="15" cy="17" rx="10.5" ry="8" ${st(C.piggy)}/><rect x="24" y="14.5" width="4.5" height="5" rx="2" ${st(C.piggy, 1.4)}/><path d="M9 9.5l2 3.5M10 24.5v3M19 24.5v3" ${line(1.8)}/><circle cx="20" cy="14.5" r="1" style="fill:${INK}"/><path d="M12 11.5h5" ${line(2)}/><circle cx="14.5" cy="5.5" r="3" ${st(C.coin, 1.3)}/>`,
  // the land
  land: () => `<path d="M2.5 24l6-6h21l-6 6z" ${st(C.land)}/><path d="M16 21V6" ${line(1.8)}/><path d="M16 6l8 2.5-8 2.5z" ${st(C.flag, 1.4)}/>`,
  // how a floor earns (same colours as the tenure tags)
  sale: () => `<path d="M4 15.5L15.5 4H27v11.5L15.5 27z" ${st(C.sale)}/><circle cx="21.5" cy="9.5" r="2.2" ${st(C.paper, 1.4)}/>`,
  rent: () => `<circle cx="10" cy="16" r="6.5" ${st(C.rent)}/><circle cx="10" cy="16" r="2.3" ${st(C.paper, 1.3)}/><path d="M16.5 16H28M24 16v4.5M28 16v3.5" ${line(2.4)}/>`,
  operate: () => `<path d="M6 23a10 10 0 0 1 20 0z" ${st(C.operate)}/><path d="M4 23h24v3H4z" ${st(C.operate, 1.4)}/><path d="M16 13v-3M13.5 10h5" ${line(1.8)}/>`,
  public: () => `<circle cx="11" cy="10" r="4" ${st(C.public, 1.5)}/><circle cx="22" cy="11" r="3.5" ${st(C.public, 1.5)}/><path d="M3.5 27c0-5 3.3-9 7.5-9s7.5 4 7.5 9z" ${st(C.public, 1.5)}/><path d="M16.5 27c.6-4.4 3-7.5 5.5-7.5 3.5 0 6.5 3.4 6.5 7.5z" ${st(C.public, 1.5)}/>`,
  support: () => `<path d="M16 4.5l2.3 3 3.6-1.2.6 3.8 3.7.9-1.2 3.6 3 2.4-3 2.4 1.2 3.6-3.7.9-.6 3.8-3.6-1.2-2.3 3-2.3-3-3.6 1.2-.6-3.8-3.7-.9 1.2-3.6-3-2.4 3-2.4L5.8 9.9l3.7-.9.6-3.8 3.6 1.2z" ${st(C.support, 1.4)}/><circle cx="16" cy="16" r="4" ${st(C.paper, 1.4)}/>`,
  // people and places in the story
  house: () => `<path d="M5 15L16 6l11 9" ${st(C.paper)}/><rect x="8" y="14" width="16" height="13" ${st(C.paper)}/><rect x="14" y="19" width="4.5" height="8" ${st(C.sale, 1.3)}/>`,
  bank: () => `<rect x="5" y="6" width="22" height="21" rx="2.5" ${st(C.support)}/><circle cx="16" cy="16.5" r="6" ${st(C.paper, 1.5)}/><path d="M16 10.5v12M10 16.5h12M11.8 12.3l8.4 8.4M20.2 12.3l-8.4 8.4" ${line(1.1)}/>`,
  crane: () => `<path d="M9 28V6M9 6h19M9 6L4 10h5M9 10l6-4" ${line(2)}/><path d="M24 6v7" ${line(1.4)}/><rect x="21" y="13" width="6" height="4" ${st(C.brick, 1.3)}/><rect x="5" y="26" width="8" height="3" ${st(C.support, 1.3)}/>`,
  check: () => `<circle cx="16" cy="16" r="12" ${st(C.good)}/><path d="M10.5 16.5l3.6 3.6 7.5-8" style="fill:none;stroke:${C.paper};stroke-width:3;stroke-linecap:round;stroke-linejoin:round"/>`,
  cross: () => `<circle cx="16" cy="16" r="12" ${st(C.bad)}/><path d="M11.5 11.5l9 9M20.5 11.5l-9 9" style="fill:none;stroke:${C.paper};stroke-width:3;stroke-linecap:round"/>`,
};

/** Names of every symbol, so pages and tests can list them. */
export const SYMBOL_NAMES = Object.keys(DRAW);

/**
 * One symbol as an SVG string. size in px; label gives it a text alternative, otherwise it is decorative.
 * Unknown names throw, so a typo shows up in tests rather than as an empty space.
 */
export function sym(name, size = 24, label = '') {
  const d = DRAW[name];
  if (!d) throw new Error(`unknown symbol ${name}`);
  const a11y = label ? `role="img" aria-label="${String(label).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="sym sym-${name}" viewBox="0 0 32 32" width="${size}" height="${size}" ${a11y}>${d()}</svg>`;
}

/** A traffic light that shows a verdict: works = green, marginal = amber, anything else = red. */
export function trafficLight(verdict, size = 28) {
  const on = verdict === 'works' ? 0 : verdict === 'marginal' ? 1 : verdict === 'needs_land' || verdict === 'incomplete' ? -1 : 2;
  const lamp = (i, col) => `<circle cx="16" cy="${8.2 + i * 7.8}" r="3.4" style="fill:${on === i ? col : C.off}"/>`;
  return `<svg class="sym sym-light" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" focusable="false"><rect x="9.5" y="2" width="13" height="28" rx="4.5" style="fill:var(--sym-light-body, #24303a)"/>${lamp(0, C.good)}${lamp(1, C.warn)}${lamp(2, C.bad)}</svg>`;
}

/** Which symbol stands for each way a floor earns (keys match the tool's tenure tags). */
export const TENURE_SYMBOL = { sale: 'sale', rent: 'rent', operate: 'operate', public: 'public', support: 'support' };
