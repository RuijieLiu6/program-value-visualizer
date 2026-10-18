// Program Value Visualizer — the Tower Money Book: how the money works in a tall building, with illustrations
// and small things to try, in two editions (editions.js): the Designer edition, in plain adult language with the
// real terms, and the simpler Starter edition, in everyday words and pretend coins. Readers switch at any chapter.
// The same module runs as a standalone guide page ("book" mode)
// and inside the tool's Help ("guide" mode, one chapter at a time, with "Show me" buttons).
// The last chapters use the tool's real calculator, so the book and the tool always agree.
import { evaluate } from '../../core/econ_core.js';
import { moneySteps, toySteps, moneyStackHTML, MONEY_STACK_CSS } from '../../core/money_steps.js';
import { sym, trafficLight } from './symbols.js';
import { EDITIONS, EDITION_IDS } from './editions.js';

const scenesReady = import('./scenes.js').then(m => m.SCENES).catch(() => ({}));

// ---------- tiny DOM helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
/** Text with {symbol} tokens and **bold**: escaped, then symbols inlined. */
const rich = text => esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\{([a-z]+)\}/g, (_, n) => { try { return `<span class="tmb-isym">${sym(n, 18)}</span>`; } catch (e) { return ''; } });
const para = t => h('p', { html: rich(t) });
/** The same escaping and {symbol}/**bold** markup, for the book page's masthead. */
export const richText = rich;
/** Swap step labels by key (the Starter edition's everyday words); null keeps them. */
const relabel = (ms, labels) => labels ? { ...ms, steps: ms.steps.map(s => ({ ...s, label: labels[s.key] || s.label })) } : ms;
const M = x => `C$${(x / 1e6).toFixed(1)} M`;
const VERDICT = { works: 'Works', marginal: 'Marginal', doesnt_work: 'Doesn’t work', needs_land: 'Land price needed', incomplete: 'Incomplete' };
const slider = (id, label, min, max, step, value, unit, oninput) => {
  const out = h('output', { for: id, class: 'tmb-out' });
  const i = h('input', { type: 'range', id, min, max, step, value });
  const sync = () => { out.textContent = unit(Number(i.value)); oninput(Number(i.value)); };
  i.addEventListener('input', sync);
  return { el: h('div', { class: 'tmb-slider' }, h('label', { for: id }, label, ' ', out), i), sync, input: i };
};
let uidN = 0; const uid = p => `${p}-${++uidN}`;

// ---------- real-calculator helpers ----------
const mixOf = pairs => pairs.map(([programme_id, share]) => ({ programme_id, share }));
/** A plain tower of n floors, all one use (for reading one floor in a real building context). */
function plainTower(n, pairs, plate = 1500, f2f = 4) {
  return Array.from({ length: n }, (_, k) => ({ level: k + 1, elevation_m: k * f2f, height_m: f2f, area_m2: plate, area_basis: 'gross', mix: mixOf(pairs) }));
}
const PLAY_ZONES = [
  { id: 'ground', name: 'Street (floor 1)', from: 1, to: 1, options: ['shops', 'food'] },
  { id: 'low', name: 'Low (2–12)', from: 2, to: 12, options: ['office', 'hotel', 'rental', 'condo', 'public'] },
  { id: 'mid', name: 'Middle (13–26)', from: 13, to: 26, options: ['office', 'hotel', 'rental', 'condo'] },
  { id: 'high', name: 'High (27–38)', from: 27, to: 38, options: ['condo', 'rental', 'office', 'hotel'] },
  { id: 'top', name: 'Top (39–40)', from: 39, to: 40, options: ['deck', 'skybar', 'penthouse', 'public'] },
];
const PLAY_USES = {
  shops: { name: 'Shops and lobby', mix: [['SE1', 0.6], ['AM4', 0.4]], s: 'rent' },
  food: { name: 'Food hall and lobby', mix: [['SE3', 0.7], ['AM4', 0.3]], s: 'rent' },
  office: { name: 'Offices', mix: [['WK1', 1]], s: 'rent' },
  hotel: { name: 'Hotel', mix: [['ST2', 1]], s: 'operate' },
  rental: { name: 'Rental homes', mix: [['LV4', 1]], s: 'rent' },
  condo: { name: 'Condos (sold)', mix: [['LV1', 1]], s: 'sale' },
  penthouse: { name: 'Penthouses (sold)', mix: [['LV2', 1]], s: 'sale' },
  public: { name: 'Community rooms (free)', mix: [['GP5', 0.6], ['CH1', 0.4]], s: 'public' },
  deck: { name: 'Ticketed lookout', mix: [['LE1', 1]], s: 'operate' },
  skybar: { name: 'Sky restaurant', mix: [['LE3', 1]], s: 'rent' },
};
/** The playground tower: 40 floors, 1,600 m² at the street and 1,300 m² above. */
export function playTower(pick) {
  const fl = []; let z = 0;
  for (let lv = 1; lv <= 40; lv++) {
    const zone = PLAY_ZONES.find(zz => lv >= zz.from && lv <= zz.to), use = PLAY_USES[pick[zone.id]] || PLAY_USES[zone.options[0]];
    const hh = lv === 1 ? 6 : 3.8;
    fl.push({ level: lv, elevation_m: Math.round(z * 100) / 100, height_m: hh, area_m2: lv === 1 ? 1600 : 1300, area_basis: 'gross', mix: mixOf(use.mix) });
    z += hh;
  }
  return fl;
}
export const PLAY_SETTINGS = { podiumTopFloor: 1, siteAreaM2: null, minNonresFsr: null };

// ---------- chapters ----------
/** Each chapter: id, title, picture (scene name), paragraphs, an optional "try it" builder, and where it lives in the tool.
 *  The words live in editions.js (Designer and Starter editions); these are the Designer edition's, the default. */
export const CHAPTERS = EDITIONS.designer.chapters;

// ---------- "try it" builders ----------
// ctx.w holds the edition's words and number format (editions.js); the sums are the same in both editions.
const TRY = {
  stack(ctx) {
    const W = ctx.w.stack;
    const uses = [['Shops', 'rent', '#e2a33b'], ['Offices', 'rent', '#3f6e9a'], ['Hotel', 'operate', '#8457c9'], ['Rental homes', 'rent', '#3f8f6a'], ['Condos', 'sale', '#3b74d1'], ['Community', 'public', '#e07b32'], ['Plant', 'support', '#8d98a3'], ['Lookout', 'operate', '#2a9fb2']];
    const floors = [0, 1, 1, 2, 3, 4, 4, 7];
    const note = h('p', { class: 'tmb-note', 'aria-live': 'polite' }, W.note);
    const box = h('div', { class: 'tmb-stack', role: 'group', 'aria-label': 'A stack of eight floors' });
    const draw = () => {
      box.replaceChildren(...floors.map((u, k) => ({ u, k })).reverse().map(({ u, k }) => {
        const [name, how, col] = uses[u];
        return h('button', { type: 'button', class: 'tmb-floor', style: `--fc:${col}`, 'aria-label': W.aria(k + 1, name), onclick: () => { floors[k] = (floors[k] + 1) % uses.length; draw(); const [n2, how2] = uses[floors[k]]; note.innerHTML = rich(W.now(k + 1, n2.toLowerCase(), W.say[how2], how2)); } },
          h('span', { class: 'tmb-fl-n' }, `${k + 1}`), h('span', { html: sym(how, 18) }), name);
      }));
    };
    draw();
    return h('div', {}, box, note);
  },
  quiz(ctx) {
    const W = ctx.w.quiz;
    const items = [['Offices', 'rent'], ['Condos', 'sale'], ['Hotel', 'operate'], ['Childcare', 'public'], ['Lift machine room', 'support']];
    const opts = [['', 'Pick one…'], ['sale', 'For sale'], ['rent', 'For rent'], ['operate', 'Operated'], ['public', 'Public'], ['support', 'Support']];
    const res = h('p', { class: 'tmb-note', 'aria-live': 'polite' });
    const rows = items.map(([name, ans], k) => {
      const id = uid('quiz');
      const s = h('select', { id }, opts.map(([v, t]) => h('option', { value: v }, t)));
      const mark = h('span', { class: 'tmb-mark' });
      s.addEventListener('change', () => { mark.innerHTML = s.value ? sym(s.value === ans ? 'check' : 'cross', 18, s.value === ans ? 'right' : 'try again') : ''; });
      return { el: h('div', { class: 'tmb-quiz-row' }, h('label', { for: id }, name), s, mark), s, ans };
    });
    const check = h('button', { type: 'button', onclick: () => { const ok = rows.filter(r => r.s.value === r.ans).length; res.textContent = ok === rows.length ? W.all : W.some(ok); } }, 'Check');
    return h('div', { class: 'tmb-quiz' }, rows.map(r => r.el), h('div', { class: 'tmb-row' }, check, res));
  },
  tree(ctx) {
    const W = ctx.w.tree;
    let perYear = W.start, rate = 0.05;
    const out = h('div', { class: 'tmb-big', 'aria-live': 'polite' }), pile = h('div', { class: 'tmb-pile', 'aria-hidden': 'true' });
    const draw = () => {
      const worth = perYear / rate;
      out.innerHTML = rich(W.line(perYear, rate, worth));
      pile.innerHTML = Array.from({ length: Math.min(60, W.pile(worth)) }, () => sym('coin', 16)).join('');
    };
    const a = slider(uid('tree-y'), W.label, W.min, W.max, W.step, perYear, W.unit, v => { perYear = v; draw(); });
    const b = slider(uid('tree-r'), 'Cap rate:', 0.03, 0.09, 0.0025, rate, v => `${(v * 100).toFixed(2)}%`, v => { rate = v; draw(); });
    a.sync(); b.sync();
    return h('div', {}, a.el, b.el, out, pile, h('p', { class: 'tmb-note' }, W.note));
  },
  height(ctx) {
    if (!ctx.data) return null;
    const uses = [['Condos', [['LV1', 1]], 'sale'], ['Offices', [['WK1', 1]], 'rent'], ['Shops', [['SE1', 1]], 'rent']];
    const runs = uses.map(([n, mix]) => evaluate(plainTower(70, mix), ctx.data, { podiumTopFloor: 4, siteAreaM2: null, minNonresFsr: null }));
    const bars = h('div', { class: 'tmb-bars' }), max = Math.max(...runs.flatMap(r => r.items.map(i => i.value / i.gfa)));
    const draw = lv => bars.replaceChildren(...uses.map(([n, , s], k) => {
      const it = runs[k].items.find(i => i.level === lv), v = it.value / it.gfa;
      return h('div', { class: 'tmb-bar-row' }, h('span', { html: sym(s, 18) }), h('span', { class: 'tmb-bar-name' }, n), h('span', { class: 'tmb-bar-track' }, h('span', { class: `tmb-bar ${s}`, style: `width:${(v / max * 100).toFixed(1)}%` })), h('span', { class: 'tmb-bar-amt' }, `C$${Math.round(v).toLocaleString('en-CA')}/m²`));
    }));
    const s = slider(uid('ht'), 'Floor number:', 1, 70, 1, 30, v => `${v}`, draw); s.sync();
    return h('div', {}, s.el, bars, h('p', { class: 'tmb-note' }, 'What one square metre of each use is worth on that floor, from the tool’s calculator (after selling and leasing costs).'));
  },
  floorCost(ctx) {
    if (!ctx.data) return null;
    const W = ctx.w.floor, L = W.labels;
    const uses = { condo: ['Condos', [['LV1', 1]]], office: ['Offices', [['WK1', 1]]], hotel: ['Hotel', [['ST2', 1]]] };
    const out = h('div', { 'aria-live': 'polite' });
    const draw = key => {
      const r = evaluate(plainTower(60, uses[key][1]), ctx.data, { podiumTopFloor: 4, siteAreaM2: null, minNonresFsr: null });
      const it = r.items.find(i => i.level === 30);
      const ms = { steps: [
        { key: 'value', sym: 'coin', label: L.value, amount: it.value },
        { key: 'hard', sym: 'brick', label: L.hard, amount: -it.hard },
        { key: 'soft', sym: 'plans', label: L.soft, amount: -it.soft },
        { key: 'finance', sym: 'clock', label: L.finance, amount: -it.finance },
        { key: 'charges', sym: 'city', label: L.charges, amount: -it.chargeTotal },
        { key: 'profit', sym: 'piggy', label: L.profit, amount: -it.profit }], left: it.net_contribution, land: null, verdict: it.net_contribution >= 0 ? 'works' : 'doesnt_work' };
      out.innerHTML = moneyStackHTML(ms, { fmt: x => M(x), sym: n => sym(n, 22), leftLabel: W.left });
    };
    const id = uid('fc');
    const sel = h('select', { id }, Object.entries(uses).map(([k, [n]]) => h('option', { value: k }, n)));
    sel.addEventListener('change', () => draw(sel.value)); draw('condo');
    return h('div', {}, h('div', { class: 'tmb-row' }, h('label', { for: id }, 'One floor (1,500 m², floor 30 of 60) of'), sel), out, h('p', { class: 'tmb-note' }, W.note));
  },
  waterfall(ctx) {
    const W = ctx.w.waterfall, amt = ctx.w.amt;
    const st = { worth: 100, build: 45, land: 10 };
    const out = h('div', { 'aria-live': 'polite' }), light = h('div', { class: 'tmb-verdict' });
    const draw = () => {
      const t = toySteps(st);
      out.innerHTML = moneyStackHTML(relabel(t, W.labels), { fmt: x => amt(x), sym: n => sym(n, 22), leftLabel: ctx.w.stackLeft });
      light.innerHTML = `${trafficLight(t.verdict, 40)}<div><b>${VERDICT[t.verdict]}</b><br>${esc(t.left >= st.land ? W.enough(t.left, st.land) : t.left > 0 ? W.short(t.left, st.land) : W.none)}</div>`;
    };
    const a = slider(uid('wf-w'), W.worth, 60, 160, 1, st.worth, amt, v => { st.worth = v; draw(); });
    const b = slider(uid('wf-b'), W.build, 20, 80, 1, st.build, amt, v => { st.build = v; draw(); });
    const c = slider(uid('wf-l'), W.land, 0, 40, 1, st.land, amt, v => { st.land = v; draw(); });
    a.sync(); b.sync(); c.sync();
    return h('div', {}, h('div', { class: 'tmb-sliders' }, a.el, b.el, c.el), out, light, h('p', { class: 'tmb-note' }, W.note));
  },
  cac(ctx) {
    const W = ctx.w.cac, amt = ctx.w.amt;
    const out = h('div', { class: 'tmb-split', 'aria-live': 'polite' });
    const s = slider(uid('cac'), W.label, 0, 100, 1, 40, amt, v => {
      const city = v * 0.75, kept = v - city;
      out.innerHTML = `<span class="tmb-split-city" style="flex:${city || 0.0001}">${sym('city', 18)} ${esc(W.city)} ${esc(amt(city))}</span><span class="tmb-split-kept" style="flex:${kept || 0.0001}">${sym('land', 18)} ${W.kept ? esc(W.kept) + ' ' : ''}${esc(amt(kept))}</span>`;
    }); s.sync();
    return h('div', {}, s.el, out, h('p', { class: 'tmb-note' }, W.note));
  },
  presales(ctx) {
    const W = ctx.w.presales;
    const row = h('div', { class: 'tmb-houses', 'aria-hidden': 'true' }), say = h('div', { class: 'tmb-verdict', 'aria-live': 'polite' });
    const s = slider(uid('ps'), W.label, 0, 10, 1, 4, W.unit, v => {
      row.innerHTML = Array.from({ length: 10 }, (_, k) => `<span class="tmb-house${k < v ? ' sold' : ''}">${sym('house', 26)}</span>`).join('');
      const verdict = v >= 7 ? 'works' : v >= 6 ? 'marginal' : 'doesnt_work';
      say.innerHTML = `${trafficLight(verdict, 36)}<div><b>${esc(W.head[v >= 7 ? 0 : v >= 6 ? 1 : 2])}</b><br>${esc(v >= 6 ? W.enough : W.few)}</div>`;
    }); s.sync();
    return h('div', {}, s.el, row, say);
  },
  fsr(ctx) {
    const W = ctx.w.fsr;
    const st = { total: 12, homes: 6 };
    const pic = h('div', { class: 'tmb-layers', 'aria-hidden': 'true' }), say = h('p', { class: 'tmb-note', 'aria-live': 'polite' });
    const draw = () => {
      st.homes = Math.min(st.homes, st.total);
      const jobs = st.total - st.homes;
      pic.innerHTML = Array.from({ length: st.total }, (_, k) => `<span class="tmb-layer ${k < jobs ? 'jobs' : 'homes'}"></span>`).reverse().join('') + '<span class="tmb-layer site"></span>';
      say.innerHTML = rich(W.say(jobs, st.homes, jobs >= 9));
    };
    const a = slider(uid('fsr-t'), W.total, 5, 16, 1, st.total, v => `${v}`, v => { st.total = v; b.input.max = v; draw(); });
    const b = slider(uid('fsr-h'), W.homes, 0, 16, 1, st.homes, v => `${v}`, v => { st.homes = v; draw(); });
    a.sync(); b.sync();
    return h('div', { class: 'tmb-fsr' }, h('div', {}, a.el, b.el, say), pic);
  },
  leverage(ctx) {
    const W = ctx.w.leverage;
    const out = h('div', { class: 'tmb-big', 'aria-live': 'polite' });
    const s = slider(uid('lev'), 'Change in prices:', -20, 20, 1, 0, v => `${v > 0 ? '+' : ''}${v}%`, v => {
      const worth = 100 * (1 + v / 100), left = worth - 92;
      out.innerHTML = rich(W.line(worth, left, v ? `${left > 8 ? '+' : ''}${Math.round((left - 8) / 8 * 100)}%` : ''));
    }); s.sync();
    return h('div', {}, s.el, out, h('p', { class: 'tmb-note' }, W.note));
  },
  play(ctx) {
    if (!ctx.data) return h('p', { class: 'tmb-note' }, 'The calculator data could not load, so the playground is off.');
    const W = ctx.w.play;
    const pick = { ground: 'shops', low: 'office', mid: 'rental', high: 'condo', top: 'deck' };
    let market = 'weak';
    const sec = h('div', { class: 'tmb-play-sec', 'aria-hidden': 'true' }), stack = h('div'), say = h('div', { class: 'tmb-verdict', 'aria-live': 'polite' });
    const draw = () => {
      const fl = playTower(pick), r = evaluate(fl, ctx.data, { ...PLAY_SETTINGS, presaleMarket: market });
      const maxNet = Math.max(1, ...r.floors.map(f => Math.abs(f.net)));
      sec.innerHTML = [...r.floors].reverse().map(f => `<span class="tmb-pf"><span class="tmb-pf-box ${PLAY_USES[pick[PLAY_ZONES.find(z => f.level >= z.from && f.level <= z.to).id]].s}"></span><span class="tmb-pf-bar ${f.net >= 0 ? 'pos' : 'neg'}" style="width:${(Math.abs(f.net) / maxNet * 48).toFixed(1)}%"></span></span>`).join('');
      stack.innerHTML = moneyStackHTML(relabel(moneySteps(r), ctx.w.stackLabels), { fmt: ctx.w.playAmt, sym: n => sym(n, 22), leftLabel: ctx.w.stackLeft });
      say.innerHTML = `${trafficLight(r.verdict, 40)}<div><b>${VERDICT[r.verdict]}</b><br>${esc(r.reasons.slice(0, 2).join(' '))}</div>`;
    };
    const zones = PLAY_ZONES.map(z => {
      const id = uid(`pz-${z.id}`);
      const s = h('select', { id }, z.options.map(o => h('option', { value: o, selected: pick[z.id] === o }, PLAY_USES[o].name)));
      s.addEventListener('change', () => { pick[z.id] = s.value; draw(); });
      return h('div', { class: 'tmb-zone' }, h('label', { for: id }, z.name), s);
    });
    const mid = uid('pm');
    const mk = h('select', { id: mid }, h('option', { value: 'weak' }, W.weak), h('option', { value: 'normal' }, W.normal));
    mk.addEventListener('change', () => { market = mk.value; draw(); });
    draw();
    return h('div', { class: 'tmb-play' },
      h('div', { class: 'tmb-play-ctl' }, [...zones].reverse(), h('div', { class: 'tmb-zone' }, h('label', { for: mid }, 'Presale market'), mk)),
      h('div', { class: 'tmb-play-out' }, h('div', { class: 'tmb-play-top' }, sec, say), stack,
        h('p', { class: 'tmb-note' }, W.note)));
  },
  map(ctx) {
    return h('div', { class: 'tmb-map' }, ctx.w.map.map(([s, name, text, tab]) => h('div', { class: 'tmb-map-item' }, h('span', { html: sym(s, 28) }), h('div', {}, h('b', {}, name), h('div', { class: 'tmb-note' }, text)),
      ctx.onGoto ? h('button', { type: 'button', class: 'tmb-show', onclick: () => ctx.onGoto(tab) }, 'Show me') : null)));
  },
};

// ---------- rendering ----------
function chapterEl(c, n, ctx, SCENES) {
  const E = ctx.E;
  const pic = c.scene && SCENES[c.scene] ? h('figure', { class: 'tmb-pic', html: SCENES[c.scene]() }) : null;
  const tryBox = c.tryIt && TRY[c.tryIt] ? TRY[c.tryIt](ctx) : null;
  const tool = c.tool ? h('div', { class: 'tmb-tool' }, h('span', { html: sym(c.tool.s, 22) }), h('div', {}, h('b', {}, 'In the tool. '), c.tool.text),
    ctx.onGoto && c.tool.tab ? h('button', { type: 'button', class: 'tmb-show', onclick: () => ctx.onGoto(c.tool.tab) }, 'Show me') : null) : null;
  return h('section', { class: `tmb-ch${pic ? '' : ' tmb-wide'}`, id: `tmb-${c.id}`, 'aria-labelledby': `tmb-${c.id}-h` },
    pic,
    h('div', { class: 'tmb-body' },
      h('div', { class: 'tmb-kick-row' }, h('p', { class: 'tmb-kicker' }, `Chapter ${n}`),
        h('button', { type: 'button', class: 'tmb-swap', onclick: () => ctx.swap(c.id) }, E.switchChapter)),
      h('h2', { id: `tmb-${c.id}-h`, tabindex: '-1' }, c.title),
      c.text.map(para),
      c.design ? h('p', { class: 'tmb-design' }, h('b', {}, E.designLabel), c.design) : null,
      tryBox ? h('div', { class: 'tmb-try' }, h('p', { class: 'tmb-try-h' }, 'Try it'), tryBox) : null,
      tool));
}

/** The symbol key: every symbol once, with what it means (Designer edition; each edition has its own words). */
export const SYMBOL_KEY = EDITIONS.designer.key;
const keyEl = E => h('div', { class: 'tmb-key', role: 'list', 'aria-label': 'Symbol key' }, E.key.map(([s, t]) => h('span', { role: 'listitem', class: 'tmb-key-i' }, h('span', { html: sym(s, 22) }), t)));

// The reader's edition is a per-viewer convenience: remembered in this browser when storage allows, never required.
const STORE = 'pvv-money-book-edition';
const storedEdition = () => { try { const v = localStorage.getItem(STORE); return EDITIONS[v] ? v : null; } catch (e) { return null; } };
const rememberEdition = id => { try { localStorage.setItem(STORE, id); } catch (e) { /* storage blocked: the switch still works for this visit */ } };

/**
 * Render the book into root.
 * mode 'book': every chapter in order with a contents list. mode 'guide': one chapter at a time (for the tool's Help).
 * data: indexed calculator data (indexData) for the real-number chapters. onGoto(tab): "Show me" in the tool.
 * edition: 'designer' or 'starter' (default: the reader's last choice, else Designer). onEdition(E) runs on the
 * first draw and on every switch, so a page can match its own masthead.
 */
export async function renderMoneyStory(root, { data = null, mode = 'book', onGoto = null, start = 0, bookUrl = null, edition = null, onEdition = null } = {}) {
  const SCENES = await scenesReady;
  if (!document.getElementById('tmb-style')) document.head.append(h('style', { id: 'tmb-style' }, MONEY_STACK_CSS + STORY_CSS));
  root.classList.add('tmb');
  let ed = EDITIONS[edition] ? edition : storedEdition() || 'designer';
  let at = Math.max(0, Math.min(CHAPTERS.length - 1, start));
  const otherOf = id => EDITION_IDS.find(x => x !== id);

  const switcher = E => h('div', { class: 'tmb-ed' },
    h('div', { class: 'tmb-ed-btns', role: 'group', 'aria-label': 'Edition' }, EDITION_IDS.map(id => h('button', { type: 'button', class: 'tmb-ed-b', 'data-ed': id, 'aria-pressed': String(id === ed), onclick: () => setEdition(id) }, EDITIONS[id].name))),
    h('p', { class: 'tmb-ed-about' }, E.about, ' ', E.other));

  /** Switch edition. From a chapter's link, stay on that chapter; from the switch, keep focus on it. */
  function setEdition(id, chapterId = null) {
    if (id === ed || !EDITIONS[id]) return;
    ed = id; rememberEdition(id);
    draw();
    onEdition?.(EDITIONS[ed]);
    if (chapterId) {
      const sec = root.querySelector(`#tmb-${chapterId}`);
      sec?.scrollIntoView?.({ block: 'start' });
      sec?.querySelector('h2')?.focus({ preventScroll: true });
    } else root.querySelector(`.tmb-ed-b[data-ed="${id}"]`)?.focus();
  }

  function draw() {
    const E = EDITIONS[ed], chapters = E.chapters;
    const ctx = { data, onGoto, E, w: E.words, swap: chapterId => setEdition(otherOf(ed), chapterId) };
    if (mode === 'book') {
      const toc = h('nav', { class: 'tmb-toc', 'aria-label': 'Chapters' }, h('ol', {}, chapters.map(c => h('li', {}, h('a', { href: `#tmb-${c.id}` }, c.title)))));
      root.replaceChildren(switcher(E), keyEl(E), toc, ...chapters.map((c, k) => chapterEl(c, k + 1, ctx, SCENES)));
      return;
    }
    const holder = h('div');
    const sel = h('select', { id: 'tmb-ch-sel', 'aria-label': 'Chapter' }, chapters.map((c, k) => h('option', { value: k }, `${k + 1}. ${c.title}`)));
    const prev = h('button', { type: 'button' }, '← Back'), next = h('button', { type: 'button', class: 'primary' }, 'Next →');
    const show = k => { at = k; sel.value = String(k); prev.disabled = k === 0; next.disabled = k === chapters.length - 1; holder.replaceChildren(chapterEl(chapters[k], k + 1, ctx, SCENES)); holder.scrollIntoView?.({ block: 'nearest' }); };
    prev.addEventListener('click', () => show(at - 1)); next.addEventListener('click', () => show(at + 1)); sel.addEventListener('change', () => show(Number(sel.value)));
    root.replaceChildren(
      h('p', { class: 'tmb-intro' }, E.guideIntro, bookUrl ? [' ', h('a', { href: bookUrl, target: '_blank', rel: 'noopener' }, E.openBook)] : null),
      switcher(E), keyEl(E), h('div', { class: 'tmb-nav' }, prev, sel, next), holder);
    show(at);
  }

  draw();
  onEdition?.(EDITIONS[ed]);
}

const STORY_CSS = `
.tmb{--tmb-serif:var(--book-serif,var(--display,Georgia,serif));display:flex;flex-direction:column;gap:22px;color:var(--ink,#1d2730)}
.tmb-key{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--muted,#5d6973)}
.tmb-key-i{display:inline-flex;align-items:center;gap:5px}
.tmb-toc ol{margin:0;padding-left:20px;columns:2 260px;column-gap:28px;font-size:14px}
.tmb-toc a{color:inherit;text-decoration-color:var(--line,#d5dad7);text-underline-offset:3px}
.tmb-ch{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:22px 28px;align-items:start;padding-block:22px;border-top:1px solid var(--line,#d5dad7)}
.tmb-ch.tmb-wide{grid-template-columns:minmax(0,1fr)}
.tmb-pic{margin:0;position:sticky;top:12px}
.tmb-pic svg{display:block;width:100%;height:auto;border-radius:4px}
.tmb-body{display:flex;flex-direction:column;gap:10px;min-width:0;max-width:66ch}
.tmb-body p{margin:0;line-height:1.6}
.tmb-kicker{font:500 11px/1 var(--mono,monospace)!important;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#5d6973)}
.tmb .tmb-body h2{font:600 clamp(22px,3vw,30px)/1.15 var(--tmb-serif);letter-spacing:-.01em;margin:0;text-wrap:balance}
.tmb-isym{display:inline-block;vertical-align:-4px;margin-right:2px;line-height:0}
.tmb-try{border:1px solid var(--line,#d5dad7);border-radius:var(--radius,6px);padding:12px 14px;display:flex;flex-direction:column;gap:10px;background:var(--sheet,#fff)}
.tmb-try-h{font:600 11px/1 var(--mono,monospace)!important;letter-spacing:.1em;text-transform:uppercase;color:var(--accent,#1f5f8b)}
.tmb-design{font-size:14px;padding-left:12px;border-left:3px solid var(--sym-coin,#f0c13b)}
.tmb-tool{display:flex;gap:10px;align-items:center;font-size:13.5px;padding:10px 12px;border-left:3px solid var(--accent,#1f5f8b);background:var(--accent-soft,#e2edf5);border-radius:4px}
.tmb-tool > span{line-height:0;flex:none}
.tmb-show{margin-left:auto;flex:none}
.tmb-note{font-size:12.5px;color:var(--muted,#5d6973)}
.tmb-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tmb-slider{display:flex;flex-direction:column;gap:4px;font-size:13px}
.tmb-slider input{width:100%}
.tmb-sliders{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px 14px}
.tmb-out{font:600 13px var(--mono,monospace);color:var(--ink,#1d2730)}
.tmb-big{font-size:16px;line-height:1.6}
.tmb-pile{display:flex;flex-wrap:wrap;gap:2px;min-height:18px}
.tmb-stack{display:flex;flex-direction:column;gap:3px;max-width:320px}
.tmb-floor{display:flex;align-items:center;gap:8px;text-align:left;border:0;border-left:6px solid var(--fc);background:color-mix(in srgb,var(--fc) 18%,var(--sheet,#fff));padding:6px 10px;border-radius:3px;font-size:13px;color:inherit}
.tmb-floor:hover{background:color-mix(in srgb,var(--fc) 30%,var(--sheet,#fff))}
.tmb-floor > span{line-height:0}
.tmb-fl-n{font:500 11px var(--mono,monospace)!important;color:var(--muted,#5d6973);min-width:16px;line-height:1!important}
.tmb-quiz{display:flex;flex-direction:column;gap:6px}
.tmb-quiz-row{display:grid;grid-template-columns:minmax(0,1fr) auto 22px;gap:8px;align-items:center;font-size:13.5px}
.tmb-mark{line-height:0}
.tmb-bars{display:flex;flex-direction:column;gap:6px}
.tmb-bar-row{display:grid;grid-template-columns:20px 70px minmax(0,1fr) auto;gap:8px;align-items:center;font-size:13px}
.tmb-bar-row > span:first-child{line-height:0}
.tmb-bar-track{height:14px;background:color-mix(in srgb,var(--line,#d5dad7) 45%,transparent);border-radius:3px;position:relative}
.tmb-bar{position:absolute;inset:2px auto 2px 0;border-radius:2px;background:var(--sym-coin,#f0c13b)}
.tmb-bar-amt{font:500 12px var(--mono,monospace);font-variant-numeric:tabular-nums;min-width:96px;text-align:right}
.tmb-verdict{display:flex;gap:10px;align-items:center;font-size:13.5px;line-height:1.45}
.tmb-verdict svg{flex:none}
.tmb-split{display:flex;gap:2px;height:30px;font-size:12.5px;border-radius:4px;overflow:hidden}
.tmb-split span{display:flex;align-items:center;gap:5px;padding:0 8px;white-space:nowrap;overflow:hidden;min-width:0}
.tmb-split-city{background:color-mix(in srgb,var(--sym-city,#5b7b95) 30%,var(--sheet,#fff))}
.tmb-split-kept{background:color-mix(in srgb,var(--sym-land,#4f9b5a) 28%,var(--sheet,#fff))}
.tmb-split svg{flex:none}
.tmb-houses{display:flex;flex-wrap:wrap;gap:4px}
.tmb-house{line-height:0;opacity:.4;position:relative}
.tmb-house.sold{opacity:1}
.tmb-house.sold::after{content:"";position:absolute;right:-2px;top:-2px;width:9px;height:9px;border-radius:50%;background:var(--sym-sale,#3b74d1);border:1.5px solid var(--sheet,#fff)}
.tmb-fsr{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:14px;align-items:end}
.tmb-layers{display:flex;flex-direction:column;gap:2px;align-items:center}
.tmb-layer{display:block;width:90px;height:7px;border-radius:1px}
.tmb-layer.jobs{background:var(--sym-plans,#4f7cac)}
.tmb-layer.homes{background:var(--sym-sale,#3b74d1);opacity:.45}
.tmb-layer.site{width:120px;height:9px;background:var(--sym-land,#4f9b5a);margin-top:3px}
.tmb-play{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:16px}
.tmb-play-ctl{display:flex;flex-direction:column;gap:8px}
.tmb-zone{display:flex;flex-direction:column;gap:3px;font-size:12.5px}
.tmb-zone select{width:100%}
.tmb-play-out{display:flex;flex-direction:column;gap:12px;min-width:0}
.tmb-play-top{display:grid;grid-template-columns:120px minmax(0,1fr);gap:14px;align-items:center}
.tmb-play-sec{display:flex;flex-direction:column;gap:1px}
.tmb-pf{display:flex;align-items:center;gap:2px;height:4px}
.tmb-pf-box{width:46px;height:4px;flex:none;background:var(--sym-support,#8d98a3)}
.tmb-pf-box.sale{background:var(--sym-sale,#3b74d1)}.tmb-pf-box.rent{background:var(--sym-rent,#2f9a5e)}.tmb-pf-box.operate{background:var(--sym-operate,#8457c9)}.tmb-pf-box.public{background:var(--sym-public,#e07b32)}
.tmb-pf-bar{height:3px}.tmb-pf-bar.pos{background:var(--good,#2f7d4f)}.tmb-pf-bar.neg{background:var(--bad,#b23b3b)}
.tmb-map{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}
.tmb-map-item{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line,#d5dad7);border-radius:var(--radius,6px);padding:10px 12px;font-size:13.5px}
.tmb-map-item > span{line-height:0;flex:none}
.tmb-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tmb-nav select{flex:1;min-width:0}
.tmb-intro{margin:0;font-size:14px}
.tmb-ed{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:10px 12px;border:1px solid var(--line,#d5dad7);border-radius:var(--radius,6px);background:var(--sheet,#fff)}
.tmb-ed-btns{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--line,#d5dad7);border-radius:999px;flex:none}
.tmb .tmb-ed-b{border:0;border-radius:999px;padding:5px 12px;background:transparent;color:inherit;font-size:13px;line-height:1.3}
.tmb .tmb-ed-b[aria-pressed="true"]{background:var(--accent,#1f5f8b);color:var(--sheet,#fff)}
.tmb-ed-about{margin:0;font-size:13px;color:var(--muted,#5d6973);flex:1 1 280px}
.tmb-kick-row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px}
.tmb .tmb-swap{border:0;background:none;padding:0;color:var(--accent,#1f5f8b);font-size:12.5px;text-decoration:underline;text-underline-offset:3px}
.tmb .tmb-body h2:focus{outline:none}
.tmb .tmb-body h2:focus-visible{outline:2px solid var(--accent,#1f5f8b);outline-offset:3px}
.tmb-isym svg,.tmb-key-i svg{display:inline-block}
@media (max-width:720px){.tmb-ch{grid-template-columns:minmax(0,1fr)}.tmb-pic{position:static}.tmb-play{grid-template-columns:minmax(0,1fr)}.tmb-play-top{grid-template-columns:96px minmax(0,1fr)}.tmb-fsr{grid-template-columns:minmax(0,1fr) 100px}.tmb-bar-row{grid-template-columns:20px 62px minmax(0,1fr)}.tmb-bar-amt{grid-column:2/4;text-align:left}}
@media (prefers-reduced-motion:reduce){.tmb *{transition:none!important}}
`;
