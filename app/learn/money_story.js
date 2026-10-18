// Program Value Visualizer — the Tower Money Book: how the money works in a tall building, in plain language
// for designers with no finance background, with illustrations and small things to try. The same module runs as a standalone guide page ("book" mode)
// and inside the tool's Help ("guide" mode, one chapter at a time, with "Show me" buttons).
// The last chapters use the tool's real calculator, so the book and the tool always agree.
import { evaluate } from '../../core/econ_core.js';
import { moneySteps, toySteps, moneyStackHTML, MONEY_STACK_CSS } from '../../core/money_steps.js';
import { sym, trafficLight } from './symbols.js';

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
/** Example amounts in millions of Canadian dollars: 12 -> "C$12 M", 1.5 -> "C$1.5 M". */
const cm = x => `${x < 0 ? '−' : ''}C$${Math.abs(x) < 10 && Math.abs(x) % 1 ? Math.abs(x).toFixed(1) : Math.round(Math.abs(x)).toLocaleString('en-CA')} M`;
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
/** Each chapter: id, title, picture (scene name), paragraphs, an optional "try it" builder, and where it lives in the tool. */
export const CHAPTERS = [
  { id: 'stack', title: 'A tower is a stack of floors, each with its own money', scene: 'stack',
    text: ['For money purposes, think of a tower as a stack of floors. Each floor can hold a different use: shops at street level, offices, a hotel, apartments, a lookout at the top.',
      'Every floor has two numbers: what it is worth once finished {coin}, and what it costs to build {brick}.',
      'Add the floors up and you know whether the tower as a whole pays for itself. Some floors make money and carry others that lose it.'],
    design: 'Your stacking diagram is already a financial model: changing what a floor holds changes the balance of the whole tower.',
    tryIt: 'stack', tool: { s: 'coin', text: 'The Section on the left is your stack. Click a floor, then choose its use in the Floors tab.', tab: 'floors' } },
  { id: 'earn', title: 'Five ways a floor earns its value', scene: 'earn',
    text: ['{sale} **For sale.** Condominiums sold to individual buyers, usually before construction starts. The money arrives once.',
      '{rent} **For rent.** Offices, shops and rental apartments. Tenants pay rent every month for decades, and the owner keeps the building.',
      '{operate} **Operated.** A hotel or a ticketed lookout sells rooms or tickets every day and pays staff to run it. The income is higher but less certain.',
      '{public} **Public.** A library, a childcare centre or a free public floor. The city gains, the owner earns nothing, and someone must fund its running costs every year.',
      '{support} **Support.** Lifts, mechanical floors and plant rooms. Every tower needs them, and they earn nothing.'],
    design: 'The same floor plate can be worth very different amounts depending on how it earns, not only on what it is.',
    tryIt: 'quiz', tool: { s: 'sale', text: 'Every use in the programme picker carries one of these five tags, with the same symbol.', tab: 'floors' } },
  { id: 'tree', title: 'How rent becomes value: the cap rate', scene: 'tree',
    text: ['A rented floor is not sold once. It earns every year. So how much is it worth today?',
      'Investors answer with a required return. If a floor earns C$1 million a year after running costs, and buyers want 5% a year back, they pay C$20 million for it.',
      'That 5% is the **capitalisation rate, or cap rate**. The rule is simple: **annual net income ÷ cap rate = value**.',
      'A lower cap rate means investors see less risk, so the same income is worth more. In this tool, Vancouver rental apartments use about 4.25% and Class A offices about 5.4%.'],
    design: 'Anything that raises dependable rent (efficient plates, daylight, flexible floors) raises the building’s value directly.',
    tryIt: 'tree', tool: { s: 'tree', text: 'The tool values every rented or operated floor this way: rent, less vacancy and running costs, divided by the cap rate. Method & sources lists each cap rate and its source.', tab: 'about' } },
  { id: 'height', title: 'Height adds value to some uses and not others', scene: 'height',
    text: ['Buyers pay more for views. In this tool a condominium gains about 0.7% in value for every floor above the podium.',
      'Retail works the other way round. Shops depend on people walking past, so they earn at street level and almost nothing above the second floor.',
      'Offices gain a little with height, and a mid-market hotel gains about nothing.'],
    design: 'Put homes high and active retail at grade; offices and hotels work well in the lower and middle tower.',
    tryIt: 'height', tool: { s: 'coin', text: 'The bars beside the section show the result per floor: green floors earn more than they cost, red floors need support from the others.', tab: 'floors' } },
  { id: 'costs', title: 'Construction cost comes in four parts', scene: 'costs',
    text: ['{brick} **Hard cost.** Structure, envelope, building services, interiors and labour. The largest part.',
      '{plans} **Soft cost.** Design and engineering fees, permits, insurance, legal and marketing. About a quarter of the hard cost here.',
      '{clock} **Finance cost.** Interest on the construction loan over roughly six years of design and building. Here about a fifth of hard plus soft cost.',
      '{city} **City charges.** Development cost levies (DCL) and amenity cost charges (ACC), charged per square metre to fund pipes, parks, transit and community facilities.',
      'Towers taller than 250 m cost about 15% more per floor, for structure, wind and vertical transport.'],
    design: 'Height, structure and slenderness drive hard cost; each extra floor has to earn more than it costs to build.',
    tryIt: 'floorCost', tool: { s: 'brick', text: 'The Verdict tab adds these costs up for your tower; the City ledger shows the City charges.', tab: 'verdict' } },
  { id: 'profit', title: 'The developer’s profit', scene: 'profit',
    text: ['A tower takes six years or more, and the risks are large: prices can fall, and costs and interest rates can rise.',
      'A developer only takes that risk for a margin. This tool uses 15% of total cost {piggy}, the City of Vancouver’s own benchmark. Lenders look for it before they fund a project.',
      'Profit is part of the cost of getting a building built, not an extra. If a scheme cannot pay it, the result is at best “Marginal”.'],
    design: 'A scheme that only works if the developer earns less than this is unlikely to be built.',
    tool: { s: 'piggy', text: 'Assumptions → Developer profit on cost. The Verdict tab shows it in the money stack.', tab: 'assume' } },
  { id: 'land', title: 'What is left pays for the land: residual land value', scene: 'land',
    text: ['Now put it together. Start with what the finished floors are worth, the **gross development value** {coin}. Subtract every cost {brick} {plans} {clock} {city} and the developer’s profit {piggy}.',
      'What remains is the most anyone could pay for the land and still build this scheme. It is the **residual land value** {land}.',
      'Compare it with the land price. Enough: **Works**. Within 10%, or relying on condo presales in a weak market: **Marginal**. Short: **Doesn’t work**.'],
    design: 'To a developer, a design is worth the land value it creates. This is the number your scheme should improve.',
    tryIt: 'waterfall', tool: { s: 'land', text: 'The Verdict tab shows this money stack and verdict for your tower. Without a land price, the tool estimates one: site area × the FSR current zoning allows × a land rate.', tab: 'verdict' } },
  { id: 'city', title: 'What the City takes, and why', scene: 'city',
    text: ['When the City allows a taller or denser building than current zoning permits (a rezoning), the land becomes worth more.',
      'The City captures much of that increase through a **community amenity contribution (CAC)** {city}: in this tool, 75% of the increase above the land’s value under current zoning. It funds parks, childcare and affordable housing.',
      'Under the 2026 policy, rezonings for employment uses only (no housing) pay no CAC.',
      '{public} Public floors handed to the City cost money to run every year. A scheme must show who pays: the other floors, a fund from the CAC, deck revenue, or the City.'],
    design: 'Public amenity is part of the deal: design it in from the start, and say how its running cost is covered.',
    tryIt: 'cac', tool: { s: 'city', text: 'The City ledger tab shows everything the City receives, and who pays for the public floors.', tab: 'city' } },
  { id: 'presales', title: 'Why condos must sell before construction', scene: 'presales',
    text: ['Before a lender funds the construction of condominiums {bank}, it wants proof of demand: usually 60–70% of the units sold in advance {house}. These are **presales**.',
      'In 2026 Vancouver’s presale market is weak, and few buyers commit years ahead. A condo scheme can add up on paper and still be only “Marginal”.',
      'Rental, office and hotel space need no presales, but on 2026 numbers most of it earns less than it costs to build.'],
    design: 'A mix that relies on condos depends on the presale market; rental or hotel floors spread that risk.',
    tryIt: 'presales', tool: { s: 'bank', text: 'Assumptions → Condo presale market (weak in 2026, or normal). Market scenarios show what a stronger year changes.', tab: 'assume' } },
  { id: 'fsr', title: 'The competition rule: 9 FSR of non-residential space', scene: 'fsr',
    text: ['**Floor space ratio (FSR)** is total floor area divided by site area. FSR 9 means nine site-sized layers of floor.',
      'The Vancouver Tall Challenge requires at least 9 FSR of non-residential, high-employment space: offices, hotel, retail, education, health.',
      'On 2026 numbers most office space costs more to build than it is worth. That makes this rule the hardest part of making the scheme pay.'],
    design: 'Look for non-residential uses that earn (hotel, medical, education), and check how the hotel is classified.',
    tryIt: 'fsr', tool: { s: 'check', text: 'The Verdict tab’s Brief check shows your non-residential FSR, counting the hotel both ways.', tab: 'verdict' } },
  { id: 'leverage', title: 'Small changes, large swings', scene: 'leverage',
    text: ['The money left for land is a thin margin between two large numbers: value and cost.',
      'If value is C$100 million and costs plus profit are C$92 million, the land gets C$8 million. A 10% rise in prices makes that C$18 million; a 10% fall leaves nothing.',
      'That is why the Sensitivity tab shows which inputs to check first.'],
    design: 'Treat a scheme that works by a thin margin as fragile, and test it against the weaker cases.',
    tryIt: 'leverage', tool: { s: 'coins', text: 'The Sensitivity tab changes one input at a time and shows how far the land value moves.', tab: 'sens' } },
  { id: 'play', title: 'Try it: test a 40-storey tower', scene: null,
    text: ['This uses the tool’s own calculator and its 2026 Vancouver numbers.',
      'Choose the use of each zone of a 40-storey tower. Watch the money stack and the verdict, then switch the presale market to see what a stronger year changes.'],
    design: 'Notice which zones carry the tower and which need its support.',
    tryIt: 'play', tool: { s: 'crane', text: 'Your own tower works the same way. Presets and Find a mix that works give you starting points.', tab: 'verdict' } },
  { id: 'tool', title: 'Finding your way around the tool', scene: null,
    text: ['Every symbol in this guide appears in the tool with the same meaning.'],
    tryIt: 'map', tool: null },
];

// ---------- "try it" builders ----------
const TRY = {
  stack(ctx) {
    const uses = [['Shops', 'rent', '#e2a33b'], ['Offices', 'rent', '#3f6e9a'], ['Hotel', 'operate', '#8457c9'], ['Rental homes', 'rent', '#3f8f6a'], ['Condos', 'sale', '#3b74d1'], ['Community', 'public', '#e07b32'], ['Plant', 'support', '#8d98a3'], ['Lookout', 'operate', '#2a9fb2']];
    const say = { rent: 'earns rent every month', sale: 'is sold once, usually before construction', operate: 'sells rooms or tickets every day', public: 'earns nothing and costs money to run every year', support: 'keeps the tower running and earns nothing' };
    const floors = [0, 1, 1, 2, 3, 4, 4, 7];
    const note = h('p', { class: 'tmb-note', 'aria-live': 'polite' }, 'Click a floor to change its use.');
    const box = h('div', { class: 'tmb-stack', role: 'group', 'aria-label': 'A stack of eight floors' });
    const draw = () => {
      box.replaceChildren(...floors.map((u, k) => ({ u, k })).reverse().map(({ u, k }) => {
        const [name, how, col] = uses[u];
        return h('button', { type: 'button', class: 'tmb-floor', style: `--fc:${col}`, 'aria-label': `Level ${k + 1}: ${name}. Change its use.`, onclick: () => { floors[k] = (floors[k] + 1) % uses.length; draw(); note.innerHTML = rich(`Level ${k + 1} is now **${uses[floors[k]][0].toLowerCase()}**: it ${say[uses[floors[k]][1]]} {${uses[floors[k]][1]}}.`); } },
          h('span', { class: 'tmb-fl-n' }, `${k + 1}`), h('span', { html: sym(how, 18) }), name);
      }));
    };
    draw();
    return h('div', {}, box, note);
  },
  quiz() {
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
    const check = h('button', { type: 'button', onclick: () => { const ok = rows.filter(r => r.s.value === r.ans).length; res.textContent = ok === rows.length ? 'All five correct.' : `${ok} of 5 correct. Compare with the five descriptions above and try again.`; } }, 'Check');
    return h('div', { class: 'tmb-quiz' }, rows.map(r => r.el), h('div', { class: 'tmb-row' }, check, res));
  },
  tree() {
    let perYear = 1, rate = 0.05;
    const out = h('div', { class: 'tmb-big', 'aria-live': 'polite' }), pile = h('div', { class: 'tmb-pile', 'aria-hidden': 'true' });
    const draw = () => {
      const worth = perYear / rate;
      out.innerHTML = rich(`{tree} ${cm(perYear)} a year ÷ ${(rate * 100).toFixed(2)}% = **${cm(worth)}** value today`);
      pile.innerHTML = Array.from({ length: Math.min(60, Math.round(worth)) }, () => sym('coin', 16)).join('');
    };
    const a = slider(uid('tree-y'), 'Net income per year (after vacancy and running costs):', 0.2, 3, 0.1, perYear, cm, v => { perYear = v; draw(); });
    const b = slider(uid('tree-r'), 'Cap rate:', 0.03, 0.09, 0.0025, rate, v => `${(v * 100).toFixed(2)}%`, v => { rate = v; draw(); });
    a.sync(); b.sync();
    return h('div', {}, a.el, b.el, out, pile, h('p', { class: 'tmb-note' }, 'Each coin icon above stands for C$1 million of value. Lower the cap rate and watch the value rise.'));
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
    const uses = { condo: ['Condos', [['LV1', 1]]], office: ['Offices', [['WK1', 1]]], hotel: ['Hotel', [['ST2', 1]]] };
    const out = h('div', { 'aria-live': 'polite' });
    const draw = key => {
      const r = evaluate(plainTower(60, uses[key][1]), ctx.data, { podiumTopFloor: 4, siteAreaM2: null, minNonresFsr: null });
      const it = r.items.find(i => i.level === 30);
      const ms = { steps: [
        { key: 'value', sym: 'coin', label: 'Value of this floor', amount: it.value },
        { key: 'hard', sym: 'brick', label: 'Hard cost', amount: -it.hard },
        { key: 'soft', sym: 'plans', label: 'Soft cost', amount: -it.soft },
        { key: 'finance', sym: 'clock', label: 'Finance cost', amount: -it.finance },
        { key: 'charges', sym: 'city', label: 'City charges', amount: -it.chargeTotal },
        { key: 'profit', sym: 'piggy', label: 'Developer’s profit', amount: -it.profit }], left: it.net_contribution, land: null, verdict: it.net_contribution >= 0 ? 'works' : 'doesnt_work' };
      out.innerHTML = moneyStackHTML(ms, { fmt: x => M(x), sym: n => sym(n, 22), leftLabel: 'What this floor contributes to land value' });
    };
    const id = uid('fc');
    const sel = h('select', { id }, Object.entries(uses).map(([k, [n]]) => h('option', { value: k }, n)));
    sel.addEventListener('change', () => draw(sel.value)); draw('condo');
    return h('div', {}, h('div', { class: 'tmb-row' }, h('label', { for: id }, 'One floor (1,500 m², floor 30 of 60) of'), sel), out, h('p', { class: 'tmb-note' }, 'Real 2026 numbers from the tool. The office floor comes out negative: it costs more to build than it is worth.'));
  },
  waterfall() {
    const st = { worth: 100, build: 45, land: 10 };
    const out = h('div', { 'aria-live': 'polite' }), light = h('div', { class: 'tmb-verdict' });
    const draw = () => {
      const t = toySteps(st);
      out.innerHTML = moneyStackHTML(t, { fmt: x => cm(x), sym: n => sym(n, 22) });
      light.innerHTML = `${trafficLight(t.verdict, 40)}<div><b>${VERDICT[t.verdict]}</b><br>${esc(t.left >= st.land ? `Residual land value ${cm(t.left)}; the land costs ${cm(st.land)}: the scheme can pay for it.` : t.left > 0 ? `Residual land value ${cm(t.left)}, but the land costs ${cm(st.land)}.` : 'The residual is negative: the scheme cannot pay anything for the land.')}</div>`;
    };
    const a = slider(uid('wf-w'), 'Gross development value:', 60, 160, 1, st.worth, cm, v => { st.worth = v; draw(); });
    const b = slider(uid('wf-b'), 'Hard cost:', 20, 80, 1, st.build, cm, v => { st.build = v; draw(); });
    const c = slider(uid('wf-l'), 'Land price:', 0, 40, 1, st.land, cm, v => { st.land = v; draw(); });
    a.sync(); b.sync(); c.sync();
    return h('div', {}, h('div', { class: 'tmb-sliders' }, a.el, b.el, c.el), out, light, h('p', { class: 'tmb-note' }, 'Soft cost is a quarter of hard cost, finance is about a fifth of both, City charges are fixed at C$5 M here, and profit is 15% of all costs. These are the tool’s own ratios.'));
  },
  cac() {
    const out = h('div', { class: 'tmb-split', 'aria-live': 'polite' });
    const s = slider(uid('cac'), 'Increase in land value from the rezoning:', 0, 100, 1, 40, cm, v => {
      const city = v * 0.75, kept = v - city;
      out.innerHTML = `<span class="tmb-split-city" style="flex:${city || 0.0001}">${sym('city', 18)} CAC ${esc(cm(city))}</span><span class="tmb-split-kept" style="flex:${kept || 0.0001}">${sym('land', 18)} Land ${esc(cm(kept))}</span>`;
    }); s.sync();
    return h('div', {}, s.el, out, h('p', { class: 'tmb-note' }, 'The City takes 75% of the increase as a CAC; the remaining 25% stays with the land.'));
  },
  presales() {
    const row = h('div', { class: 'tmb-houses', 'aria-hidden': 'true' }), say = h('div', { class: 'tmb-verdict', 'aria-live': 'polite' });
    const s = slider(uid('ps'), 'Share of units presold:', 0, 10, 1, 4, v => `${v * 10}%`, v => {
      row.innerHTML = Array.from({ length: 10 }, (_, k) => `<span class="tmb-house${k < v ? ' sold' : ''}">${sym('house', 26)}</span>`).join('');
      const verdict = v >= 7 ? 'works' : v >= 6 ? 'marginal' : 'doesnt_work';
      say.innerHTML = `${trafficLight(verdict, 36)}<div><b>${v >= 7 ? 'Lenders will fund construction' : v >= 6 ? 'Some lenders will fund it' : 'No construction loan yet'}</b><br>${esc(v >= 6 ? 'Enough buyers have committed for construction to start.' : 'Too few units are sold: without the loan, construction cannot start.')}</div>`;
    }); s.sync();
    return h('div', {}, s.el, row, say);
  },
  fsr() {
    const st = { total: 12, homes: 6 };
    const pic = h('div', { class: 'tmb-layers', 'aria-hidden': 'true' }), say = h('p', { class: 'tmb-note', 'aria-live': 'polite' });
    const draw = () => {
      st.homes = Math.min(st.homes, st.total);
      const jobs = st.total - st.homes;
      pic.innerHTML = Array.from({ length: st.total }, (_, k) => `<span class="tmb-layer ${k < jobs ? 'jobs' : 'homes'}"></span>`).reverse().join('') + '<span class="tmb-layer site"></span>';
      say.innerHTML = rich(`Non-residential FSR ${jobs}, residential FSR ${st.homes}. The brief requires 9 non-residential: ${jobs >= 9 ? '{check} met.' : '{cross} not met.'}`);
    };
    const a = slider(uid('fsr-t'), 'Total FSR of the tower:', 5, 16, 1, st.total, v => `${v}`, v => { st.total = v; b.input.max = v; draw(); });
    const b = slider(uid('fsr-h'), 'Residential FSR:', 0, 16, 1, st.homes, v => `${v}`, v => { st.homes = v; draw(); });
    a.sync(); b.sync();
    return h('div', { class: 'tmb-fsr' }, h('div', {}, a.el, b.el, say), pic);
  },
  leverage() {
    const out = h('div', { class: 'tmb-big', 'aria-live': 'polite' });
    const s = slider(uid('lev'), 'Change in prices:', -20, 20, 1, 0, v => `${v > 0 ? '+' : ''}${v}%`, v => {
      const worth = 100 * (1 + v / 100), left = worth - 92;
      out.innerHTML = rich(`{coin} Value ${cm(worth)} − costs and profit C$92 M = **${left < 0 ? 'nothing (' + cm(left) + ')' : cm(left)}** for the land ${v ? `(${left > 8 ? '+' : ''}${Math.round((left - 8) / 8 * 100)}% from C$8 M)` : ''}`);
    }); s.sync();
    return h('div', {}, s.el, out, h('p', { class: 'tmb-note' }, 'A 10% change in prices moves the residual land value by more than 100%.'));
  },
  play(ctx) {
    if (!ctx.data) return h('p', { class: 'tmb-note' }, 'The calculator data could not load, so the playground is off.');
    const pick = { ground: 'shops', low: 'office', mid: 'rental', high: 'condo', top: 'deck' };
    let market = 'weak';
    const sec = h('div', { class: 'tmb-play-sec', 'aria-hidden': 'true' }), stack = h('div'), say = h('div', { class: 'tmb-verdict', 'aria-live': 'polite' });
    const draw = () => {
      const fl = playTower(pick), r = evaluate(fl, ctx.data, { ...PLAY_SETTINGS, presaleMarket: market });
      const maxNet = Math.max(1, ...r.floors.map(f => Math.abs(f.net)));
      sec.innerHTML = [...r.floors].reverse().map(f => `<span class="tmb-pf"><span class="tmb-pf-box ${PLAY_USES[pick[PLAY_ZONES.find(z => f.level >= z.from && f.level <= z.to).id]].s}"></span><span class="tmb-pf-bar ${f.net >= 0 ? 'pos' : 'neg'}" style="width:${(Math.abs(f.net) / maxNet * 48).toFixed(1)}%"></span></span>`).join('');
      stack.innerHTML = moneyStackHTML(moneySteps(r), { fmt: x => cm(x / 1e6), sym: n => sym(n, 22) });
      say.innerHTML = `${trafficLight(r.verdict, 40)}<div><b>${VERDICT[r.verdict]}</b><br>${esc(r.reasons.slice(0, 2).join(' '))}</div>`;
    };
    const zones = PLAY_ZONES.map(z => {
      const id = uid(`pz-${z.id}`);
      const s = h('select', { id }, z.options.map(o => h('option', { value: o, selected: pick[z.id] === o }, PLAY_USES[o].name)));
      s.addEventListener('change', () => { pick[z.id] = s.value; draw(); });
      return h('div', { class: 'tmb-zone' }, h('label', { for: id }, z.name), s);
    });
    const mid = uid('pm');
    const mk = h('select', { id: mid }, h('option', { value: 'weak' }, 'Weak (2026)'), h('option', { value: 'normal' }, 'Normal (a stronger year)'));
    mk.addEventListener('change', () => { market = mk.value; draw(); });
    draw();
    return h('div', { class: 'tmb-play' },
      h('div', { class: 'tmb-play-ctl' }, [...zones].reverse(), h('div', { class: 'tmb-zone' }, h('label', { for: mid }, 'Presale market'), mk)),
      h('div', { class: 'tmb-play-out' }, h('div', { class: 'tmb-play-top' }, sec, say), stack,
        h('p', { class: 'tmb-note' }, 'The land price is the tool’s estimate for this footprint (C$57 M). The bars beside the section show what each floor earns (green) or loses (red) after its costs and profit.')));
  },
  map(ctx) {
    const parts = [
      ['coin', 'Top bar', 'The verdict, Presets, Find a mix that works, and Help.', 'verdict'],
      ['crane', 'Section', 'Your tower drawn to scale; the bars show which floors make or lose money.', 'floors'],
      ['sale', 'Floors', 'Set the use of each floor. Every use carries its tag: for sale, for rent, operated, public, support.', 'floors'],
      ['land', 'Verdict', 'The money stack, the land price and the verdict; the Brief check for the 9.0 FSR rule.', 'verdict'],
      ['city', 'City ledger', 'Everything the City receives, and who pays for public floors.', 'city'],
      ['coins', 'Sensitivity', 'Which inputs move the residual land value most.', 'sens'],
      ['plans', 'Assumptions', 'Every input the tool uses, with its source, and the market scenarios.', 'assume'],
      ['tree', 'Method & sources', 'How each value is calculated (income ÷ cap rate, sale price × area) and where each number comes from.', 'about'],
    ];
    return h('div', { class: 'tmb-map' }, parts.map(([s, name, text, tab]) => h('div', { class: 'tmb-map-item' }, h('span', { html: sym(s, 28) }), h('div', {}, h('b', {}, name), h('div', { class: 'tmb-note' }, text)),
      ctx.onGoto ? h('button', { type: 'button', class: 'tmb-show', onclick: () => ctx.onGoto(tab) }, 'Show me') : null)));
  },
};

// ---------- rendering ----------
function chapterEl(c, n, ctx, SCENES) {
  const pic = c.scene && SCENES[c.scene] ? h('figure', { class: 'tmb-pic', html: SCENES[c.scene]() }) : null;
  const tryBox = c.tryIt && TRY[c.tryIt] ? TRY[c.tryIt](ctx) : null;
  const tool = c.tool ? h('div', { class: 'tmb-tool' }, h('span', { html: sym(c.tool.s, 22) }), h('div', {}, h('b', {}, 'In the tool. '), c.tool.text),
    ctx.onGoto && c.tool.tab ? h('button', { type: 'button', class: 'tmb-show', onclick: () => ctx.onGoto(c.tool.tab) }, 'Show me') : null) : null;
  return h('section', { class: `tmb-ch${pic ? '' : ' tmb-wide'}`, id: `tmb-${c.id}`, 'aria-labelledby': `tmb-${c.id}-h` },
    pic,
    h('div', { class: 'tmb-body' },
      h('p', { class: 'tmb-kicker' }, `Chapter ${n}`),
      h('h2', { id: `tmb-${c.id}-h` }, c.title),
      c.text.map(para),
      c.design ? h('p', { class: 'tmb-design' }, h('b', {}, 'For your design. '), c.design) : null,
      tryBox ? h('div', { class: 'tmb-try' }, h('p', { class: 'tmb-try-h' }, 'Try it'), tryBox) : null,
      tool));
}

/** The symbol key: every symbol once, with what it means. Shown at the start of the book. */
export const SYMBOL_KEY = [
  ['coin', 'Value of the finished floors'], ['brick', 'Hard cost (construction)'], ['plans', 'Soft cost (design, permits)'], ['clock', 'Finance cost (interest)'],
  ['city', 'City charges and contributions'], ['piggy', 'Developer profit'], ['land', 'Land'],
  ['sale', 'For sale'], ['rent', 'For rent'], ['operate', 'Operated'], ['public', 'Public'], ['support', 'Support'],
]
const keyEl = () => h('div', { class: 'tmb-key', role: 'list', 'aria-label': 'Symbol key' }, SYMBOL_KEY.map(([s, t]) => h('span', { role: 'listitem', class: 'tmb-key-i' }, h('span', { html: sym(s, 22) }), t)));

/**
 * Render the book into root.
 * mode 'book': every chapter in order with a contents list. mode 'guide': one chapter at a time (for the tool's Help).
 * data: indexed calculator data (indexData) for the real-number chapters. onGoto(tab): "Show me" in the tool.
 */
export async function renderMoneyStory(root, { data = null, mode = 'book', onGoto = null, start = 0, bookUrl = null } = {}) {
  const SCENES = await scenesReady;
  const ctx = { data, onGoto };
  if (!document.getElementById('tmb-style')) document.head.append(h('style', { id: 'tmb-style' }, MONEY_STACK_CSS + STORY_CSS));
  root.classList.add('tmb');
  if (mode === 'book') {
    const toc = h('nav', { class: 'tmb-toc', 'aria-label': 'Chapters' }, h('ol', {}, CHAPTERS.map(c => h('li', {}, h('a', { href: `#tmb-${c.id}` }, c.title)))));
    root.replaceChildren(keyEl(), toc, ...CHAPTERS.map((c, k) => chapterEl(c, k + 1, ctx, SCENES)));
    return;
  }
  let at = Math.max(0, Math.min(CHAPTERS.length - 1, start));
  const holder = h('div');
  const sel = h('select', { id: 'tmb-ch-sel', 'aria-label': 'Chapter' }, CHAPTERS.map((c, k) => h('option', { value: k }, `${k + 1}. ${c.title}`)));
  const prev = h('button', { type: 'button' }, '← Back'), next = h('button', { type: 'button', class: 'primary' }, 'Next →');
  const show = k => { at = k; sel.value = String(k); prev.disabled = k === 0; next.disabled = k === CHAPTERS.length - 1; holder.replaceChildren(chapterEl(CHAPTERS[k], k + 1, ctx, SCENES)); holder.scrollIntoView?.({ block: 'nearest' }); };
  prev.addEventListener('click', () => show(at - 1)); next.addEventListener('click', () => show(at + 1)); sel.addEventListener('change', () => show(Number(sel.value)));
  root.replaceChildren(
    h('p', { class: 'tmb-intro' }, 'How the money works in a tall building, in 13 short illustrated chapters. No finance background needed; the same symbols appear in the tool.', bookUrl ? [' ', h('a', { href: bookUrl, target: '_blank', rel: 'noopener' }, 'Open the full guide')] : null),
    keyEl(), h('div', { class: 'tmb-nav' }, prev, sel, next), holder);
  show(at);
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
.tmb-isym svg,.tmb-key-i svg{display:inline-block}
@media (max-width:720px){.tmb-ch{grid-template-columns:minmax(0,1fr)}.tmb-pic{position:static}.tmb-play{grid-template-columns:minmax(0,1fr)}.tmb-play-top{grid-template-columns:96px minmax(0,1fr)}.tmb-fsr{grid-template-columns:minmax(0,1fr) 100px}.tmb-bar-row{grid-template-columns:20px 62px minmax(0,1fr)}.tmb-bar-amt{grid-column:2/4;text-align:left}}
@media (prefers-reduced-motion:reduce){.tmb *{transition:none!important}}
`;
