// Program Value Visualizer — page script. All maths lives in core/econ_core.js.
import { parseBasemap, neighbourRoofs, insideBuilding, toLatLon } from '../core/basemap.js';
import { indexData, evaluate, sensitivity, sampleTower, defaultSettings, recomputeValue, sourceDates, childcareHardRate, LABEL } from '../core/econ_core.js';

const STORE_KEY = 'pvv-project-v1';
const PACK = 'packs/vancouver-2026/';
const $ = sel => document.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const M = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${x < 0 ? '−' : ''}C$${(Math.abs(x) / 1e6).toFixed(d)} M`);
const N = x => (x == null || !Number.isFinite(x) ? '—' : Math.round(x).toLocaleString('en-CA'));
const pct = (x, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const VERDICT = { works: 'Works', marginal: 'Marginal', doesnt_work: "Doesn't work", needs_land: 'Land price needed', incomplete: 'Incomplete' };

let raw = null, data = null, result = null, sens = null;
let state = { floors: [], settings: {}, brief: 'vtc-2026', sel: null, mapSite: null };
const history = [];
let activeTab = 'verdict', pickFamily = null, pickProgramme = null, editMix = null;

// ---------- storage (per-viewer convenience only) ----------
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ floors: state.floors, settings: state.settings, brief: state.brief, mapSite: state.mapSite })); } catch (e) { /* storage unavailable */ } };
const load = () => { try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (s && Array.isArray(s.floors) && s.floors.length) return s; } catch (e) { /* ignore */ } return null; };
function pushHistory() { history.push(JSON.stringify({ floors: state.floors, settings: state.settings, brief: state.brief })); if (history.length > 40) history.shift(); $('#undoBtn').disabled = false; }
function undo() { const s = history.pop(); if (!s) return; const o = JSON.parse(s); state.floors = o.floors; state.settings = o.settings; if (o.brief && o.brief !== state.brief) { state.brief = o.brief; buildData(); $('#briefSel').value = o.brief; } editMix = null; $('#undoBtn').disabled = !history.length; refresh(); }

// ---------- input checks ----------
const finite = (x, name) => { const n = typeof x === 'string' && x.trim() === '' ? NaN : Number(x); if (!Number.isFinite(n)) throw new Error(`${name} must be a number`); return n; };
/** Validate floors from any source (file, saved state, AI). Returns clean floors or throws with a readable message. */
function normaliseFloors(list) {
  if (!Array.isArray(list) || !list.length) throw new Error('no floors found');
  if (list.length > 400) throw new Error('more than 400 floors');
  const seen = new Set(), out = [];
  list.forEach((f, k) => {
    const where = `floor ${k + 1}`;
    if (!f || typeof f !== 'object') throw new Error(`${where} is not a floor`);
    const level = Math.round(finite(f.level, `${where}: level`));
    if (seen.has(level)) throw new Error(`level ${level} appears twice`);
    seen.add(level);
    const area = finite(f.area_m2, `L${level}: area_m2`), height = finite(f.height_m, `L${level}: height_m`), elev = finite(f.elevation_m, `L${level}: elevation_m`);
    if (area <= 0 || area > 100000) throw new Error(`L${level}: area_m2 must be between 0 and 100,000`);
    if (height <= 0 || height > 30) throw new Error(`L${level}: height_m must be between 0 and 30`);
    if (!Array.isArray(f.mix) || !f.mix.length) throw new Error(`L${level}: mix must list at least one programme`);
    let mix = f.mix.map(m => {
      const id = String(m?.programme_id ?? '').trim().toUpperCase();
      if (!prog(id)) throw new Error(`L${level}: unknown programme "${id.slice(0, 12)}"`);
      const share = finite(m.share, `L${level}: share of ${id}`);
      if (share < 0) throw new Error(`L${level}: share of ${id} is negative`);
      return { programme_id: id, share };
    });
    const sum = mix.reduce((a, m) => a + m.share, 0);
    if (sum > 1.5 && Math.abs(sum - 100) < 1.5) mix = mix.map(m => ({ ...m, share: m.share / 100 }));   // percentages
    out.push({ level, elevation_m: elev, height_m: height, area_m2: area, area_basis: f.area_basis === 'net' ? 'net' : 'gross', mix, ...(Array.isArray(f.tags) && f.tags.includes('seam') ? { tags: ['seam'] } : {}) });
  });
  return out;
}
// Ranges for settings typed by people or the assistant: [min, max]
const RANGES = { landPrice: [0, 5e9], landValueCurrentZoning: [0, 5e9], podiumTopFloor: [0, 40], neighbourRoofM: [0, 400], siteAreaM2: [100, 200000], minNonresFsr: [0, 40],
  profitOnCost: [0, 0.4], softCost: [0, 0.6], financeRate: [0, 0.2], buildYears: [1, 12], drawFactor: [0, 1], supertallPremium: [0, 0.6], supertallThresholdM: [0, 600], cacShare: [0, 1],
  publicRunningCostPerM2: [0, 2000], childcareM2PerSpace: [5, 60], officeTenantAllowance: [0, 5000], officeLeasingCost: [0, 0.5], hotelFfePerKey: [0, 500000] };
const ENUMS = { publicPayer: ['cross_subsidy', 'cac_endowment', 'ticketed_deck', 'city_or_partner'], presaleMarket: ['weak', 'normal'], employmentOnly: ['auto', true, false], hotelAsNonResidential: [true, false], applyEscalation: [true, false] };
function checkSetting(k, v) {
  if (v === null || v === undefined || v === '') return null;
  if (ENUMS[k]) { const hit = ENUMS[k].find(e => String(e) === String(v)); if (hit === undefined) throw new Error(`${k} must be one of ${ENUMS[k].join(', ')}`); return hit; }
  if (k === 'permitDate') { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error('permitDate must be YYYY-MM-DD'); return String(v); }
  const n = finite(v, k), r = RANGES[k];
  if (r && (n < r[0] || n > r[1])) throw new Error(`${k} must be between ${r[0]} and ${r[1]}`);
  return n;
}
function checkMoney(v, name) { if (v === null || v === undefined || v === '') return null; const n = finite(v, name); if (n < 0 || n > 1e6) throw new Error(`${name} must be between 0 and 1,000,000`); return n; }

// ---------- data ----------
async function loadData() {
  const get = p => fetch(p).then(r => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); });
  const [families, programmes, values, costs, charges, assumptions, codeRules, sources, vtc, none] = await Promise.all([
    get('catalogue/families.json'), get('catalogue/programmes.json'), get(PACK + 'values.json'), get(PACK + 'costs.json'), get(PACK + 'charges.json'),
    get(PACK + 'assumptions.json'), get(PACK + 'code_rules.json'), get(PACK + 'sources.json'), get('briefs/vtc-2026/brief.json'), get('briefs/none/brief.json')]);
  raw = { families, programmes, values, costs, charges, assumptions, codeRules, sources, briefs: { 'vtc-2026': vtc, none } };
}
function buildData() { data = indexData({ ...raw, brief: raw.briefs[state.brief] }); }
const settingsFull = () => ({ ...defaultSettings(data), ...state.settings });
const famColour = id => data.families.get(id)?.colour || '#999';
const prog = id => data.programmes.get(id);

// ---------- source tooltips ----------
function srcText(o) {
  if (!o) return '';
  const s = data.sources.get(o.source);
  const who = s ? (s.id === 'assumption' ? 'Author assumption / arithmetic' : `${s.title}${s.publisher ? ', ' + s.publisher : ''}`) : o.source;
  const checked = s && s.checked !== 'n/a' ? ` · checked: ${s.checked}` : '';
  return `${who}${checked} · grade ${o.grade} · ${sourceDates(o, data.sources).text}${o.note ? '\n' + o.note : ''}${s?.note && s.id !== 'assumption' ? '\nSource note: ' + s.note : ''}`;
}
const srcTag = o => o ? h('span', { class: 'src', tabindex: '0', 'data-tip': srcText(o) }, 'source') : null;
const gradeTag = g => g ? h('span', { class: `grade ${g}`, 'data-tip': { A: 'A: primary or professional 2025–26 source', B: 'B: secondary or older source', C: 'C: our arithmetic or an assumption' }[g] }, g) : null;
function wireTips() {
  const tip = $('#tip');
  const show = el => { tip.textContent = el.getAttribute('data-tip'); tip.hidden = false; const r = el.getBoundingClientRect(); const x = Math.min(window.innerWidth - 336, Math.max(8, r.left)); tip.style.left = x + 'px'; tip.style.top = Math.min(window.innerHeight - tip.offsetHeight - 8, r.bottom + 6) + 'px'; };
  document.addEventListener('mouseover', e => { const el = e.target.closest?.('[data-tip]'); if (el) show(el); else tip.hidden = true; });
  document.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); if (el) show(el); });
  document.addEventListener('focusout', () => { tip.hidden = true; });
}

// ---------- recompute and render ----------
function recompute() { result = evaluate(state.floors, data, state.settings); sens = null; }
function refresh() { recompute(); save(); renderTop(); renderSection(); renderTab(); }
function renderTop() {
  const v = result.verdict, el = $('#topVerdict');
  el.className = `pill ${v}`; el.textContent = VERDICT[v];
  el.setAttribute('data-tip', result.reasons.join('\n'));
}

// ---------- section drawing ----------
function renderSection() {
  const svg = $('#section'), floors = [...state.floors].sort((a, b) => a.level - b.level);
  if (!floors.length) { svg.innerHTML = ''; return; }
  const top = Math.max(...floors.map(f => f.elevation_m + f.height_m)), bottom = Math.min(0, ...floors.map(f => f.elevation_m));
  const ky = 2.4, W = 430, padT = 16, padB = 22, H = (top - bottom) * ky + padT + padB;
  const maxSide = Math.max(...floors.map(f => Math.sqrt(f.area_m2))), kx = 190 / maxSide, cx = 150, axis = 352;
  const byLevel = new Map(result.floors.map(f => [f.level, f]));
  const maxNet = Math.max(1, ...result.floors.map(f => Math.abs(f.net)));
  const y = z => padT + (top - z) * ky;
  let s = `<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`;
  s += `<line x1="20" x2="${W - 6}" y1="${y(0)}" y2="${y(0)}" stroke="var(--ink)" stroke-width="1"/><text x="${W - 8}" y="${y(0) - 3}" text-anchor="end">grade ±0</text>`;
  s += `<line x1="${axis}" x2="${axis}" y1="${padT - 6}" y2="${H - padB + 4}" stroke="var(--line)" stroke-width="1"/>`;
  s += `<text x="${axis}" y="${H - 6}" text-anchor="middle">value − cost − profit</text>`;
  const sel = state.sel;
  for (const f of floors) {
    const r = byLevel.get(f.level), w = Math.sqrt(f.area_m2) * kx, x0 = cx - w / 2, y0 = y(f.elevation_m + f.height_m), hh = Math.max(1, f.height_m * ky - 0.6);
    let x = x0, segs = '';
    for (const m of f.mix) { const p = prog(m.programme_id), ww = w * m.share; segs += `<rect x="${x.toFixed(2)}" y="${y0.toFixed(2)}" width="${Math.max(0, ww).toFixed(2)}" height="${hh.toFixed(2)}" fill="${famColour(p?.family_id)}"/>`; x += ww; }
    const net = r ? r.net : 0, bl = net / maxNet * 72;
    const bar = `<rect x="${(bl < 0 ? axis + bl : axis).toFixed(2)}" y="${y0.toFixed(2)}" width="${Math.abs(bl).toFixed(2)}" height="${hh.toFixed(2)}" fill="${net < 0 ? 'var(--bad)' : 'var(--good)'}" opacity=".85"/>`;
    const label = (f.level % 10 === 0 || f.level === 1 || f.level === floors[floors.length - 1].level || f.level === floors[0].level) ? `<text x="${x0 - 6}" y="${(y0 + hh * 0.8).toFixed(2)}" text-anchor="end">L${esc(f.level)}</text>` : '';
    const tip = `L${f.level} · ${f.elevation_m.toFixed(1)} m · ${N(f.area_m2)} m² ${f.area_basis}\n${f.mix.map(m => `${Math.round(m.share * 100)}% ${prog(m.programme_id)?.name || m.programme_id}`).join('\n')}\nvalue ${M(r?.value)} · cost ${M(r?.cost)} · profit ${M(r?.profit)}\nnet ${M(net)}`;
    s += `<g class="floor" data-level="${esc(f.level)}" data-tip="${esc(tip)}"><rect class="slab" x="${x0.toFixed(2)}" y="${y0.toFixed(2)}" width="${w.toFixed(2)}" height="${hh.toFixed(2)}" fill="var(--line-2)"/>${segs}${bar}<rect x="20" y="${y0.toFixed(2)}" width="${W - 26}" height="${hh.toFixed(2)}" fill="transparent"/>${label}</g>`;
  }
  if (sel) {
    const inSel = floors.filter(f => f.level >= sel[0] && f.level <= sel[1]);
    if (inSel.length) { const yt = y(Math.max(...inSel.map(f => f.elevation_m + f.height_m))), yb = y(Math.min(...inSel.map(f => f.elevation_m))); s += `<rect class="sel" x="22" y="${yt - 1}" width="${W - 30}" height="${yb - yt + 2}" rx="2"/>`; }
  }
  svg.setAttribute('viewBox', `0 0 ${W} ${H.toFixed(0)}`);
  svg.innerHTML = s;
  const fams = [...new Set(state.floors.flatMap(f => f.mix.map(m => prog(m.programme_id)?.family_id)))].filter(Boolean);
  $('#legend').replaceChildren(...fams.map(id => h('span', {}, h('i', { style: `background:${famColour(id)}` }), data.families.get(id).name)),
    h('span', {}, h('i', { style: 'background:var(--good)' }), 'creates value'), h('span', {}, h('i', { style: 'background:var(--bad)' }), 'needs support'));
  $('#sectionNote').textContent = sel ? `Selected L${sel[0]}${sel[1] !== sel[0] ? '–L' + sel[1] : ''}. Edit the mix in Floors.` : 'Click a floor; shift-click to select a range.';
}
function onSectionClick(e) {
  const g = e.target.closest('g.floor'); if (!g) return;
  const lv = Number(g.dataset.level);
  if (e.shiftKey && state.sel) state.sel = [Math.min(state.sel[0], lv), Math.max(state.sel[1], lv)];
  else state.sel = [lv, lv];
  editMix = null;
  renderSection(); showTab('floors');
}

// ---------- tabs ----------
function showTab(t) {
  activeTab = t;
  for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
  for (const p of document.querySelectorAll('.tabpanel')) p.hidden = p.id !== `tab-${t}`;
  renderTab();
}
function renderTab() {
  ({ verdict: renderVerdict, floors: renderFloors, city: renderCity, map: renderMap, sens: renderSens, assume: renderAssume, ai: renderAI, about: renderAbout })[activeTab]();
}

function kpi(k, v, cls = '', tip = null, big = false) { return h('div', { class: `kpi${big ? ' big' : ''}`, 'data-tip': tip }, h('span', { class: 'k' }, k), h('span', { class: `v ${cls}` }, v)); }
const signCls = x => (x < 0 ? 'neg' : x > 0 ? 'pos' : '');

function numField(id, label, value, { step = 'any', min, max, onchange, src, unit, placeholder } = {}) {
  const inp = h('input', { id, type: 'number', step, min, max, value: value ?? '', placeholder });
  inp.addEventListener('change', () => { if (inp.value === '') return onchange(null); let v = Number(inp.value); if (!Number.isFinite(v)) { toast(`${label}: enter a number`); return; } if (min != null && v < Number(min)) v = Number(min); if (max != null && v > Number(max)) v = Number(max); inp.value = v; onchange(v); });
  return h('div', { class: 'field' }, h('label', { for: id }, label, unit ? h('span', {}, `(${unit})`) : null, src ? gradeTag(src.grade) : null, src ? srcTag(src) : null), inp);
}
function setSetting(k, v) { let c; try { c = checkSetting(k, v); } catch (e) { toast(e.message); renderTab(); return false; } pushHistory(); if (c === null) delete state.settings[k]; else state.settings[k] = c; refresh(); return true; }

// ---------- Verdict tab ----------
function renderVerdict() {
  const r = result, t = r.totals, S = settingsFull(), A = data.assumptions;
  const el = $('#tab-verdict');
  const verdict = h('div', { class: `verdict ${r.verdict}` },
    h('span', { class: 'label-strip' }, 'Verdict'), h('h3', {}, VERDICT[r.verdict]),
    h('ul', {}, r.reasons.map(x => h('li', {}, x)), r.marketDependent ? h('li', {}, 'Market-dependent: the scheme relies on condo presales.') : null),
    h('span', { class: 'note' }, 'Works = residual land value covers the land price at the target profit, presales are reachable and every public floor has a payer. Marginal = within 10% of the land price, or 10–15% profit, or relies on a weak presale market. Land price needed = enter a land price to compare.'));
  const land = h('div', { class: 'grid2' },
    numField('landPrice', 'Land price', S.landPrice, { step: 100000, min: 0, unit: 'C$', placeholder: 'user to supply', src: A.land.price, onchange: v => setSetting('landPrice', v) }),
    numField('landZoning', 'Land value under current zoning (for CAC)', S.landValueCurrentZoning, { step: 100000, min: 0, unit: 'C$', placeholder: 'user to supply', src: A.land.value_under_current_zoning, onchange: v => setSetting('landValueCurrentZoning', v) }));
  const ag = r.fsr.totalGfa;
  const hint = h('p', { class: 'note' }, `For scale only: prime downtown land was about C$2,000–2,700 per buildable m² in 2014 (an old figure; values have moved). At that rate this scheme's ${N(ag)} m² above grade would be about ${M(ag * 2000, 0)}–${M(ag * 2700, 0)}.`);
  const kpis = h('div', { class: 'kpis' },
    kpi('Gross development value', M(t.gdv), '', 'Sum of floor values after selling and leasing costs'),
    kpi('Total cost (before profit)', M(t.cost), '', `Hard ${M(t.hard)} · soft ${M(t.soft)} · finance ${M(t.finance)} · City charges ${M(t.charges)}`),
    kpi('Developer profit', M(t.profit), '', `${pct(S.profitOnCost, 0)} of total cost`),
    kpi('Public running cost (capitalised)', M(t.publicDeduction), '', 'Subtracted from value unless the City or a partner pays'),
    kpi('Residual land value before CAC', M(t.rlvBeforeCac), signCls(t.rlvBeforeCac)),
    kpi('CAC (share of land lift)', M(t.cac), '', r.employmentOnly ? 'Zero: 100% employment rezoning' : `${pct(S.cacShare, 0)} of the lift above the current-zoning land value`),
    kpi('Residual land value after CAC', M(t.rlvAfterCac), signCls(t.rlvAfterCac), 'What is left to pay for the land', true),
    kpi('Land price', S.landPrice == null ? 'not set' : M(S.landPrice)));
  const f = r.fsr;
  const fsr = h('div', { class: 'tbl' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Floor area check'), h('th', { class: 'num' }, 'm²'), h('th', { class: 'num' }, 'FSR'), h('th', {}, 'Result'))),
    h('tbody', {},
      h('tr', {}, h('td', {}, 'Total above grade (counted)'), h('td', { class: 'num' }, N(f.totalGfa)), h('td', { class: 'num' }, f.fsr ? f.fsr.toFixed(2) : '—'), h('td', {}, '')),
      h('tr', {}, h('td', {}, 'Non-residential, hotel counted as non-residential'), h('td', { class: 'num' }, N(f.nonresWithHotel)), h('td', { class: 'num' }, f.nonresFsrWithHotel?.toFixed(2) ?? '—'), h('td', {}, f.requiredNonres ? (f.passWithHotel ? h('span', { class: f.tightWithHotel ? '' : 'pos' }, f.tightWithHotel ? 'meets, but within 10% (provisional)' : 'meets') : h('span', { class: 'neg' }, 'short')) : '')),
      h('tr', {}, h('td', {}, 'Non-residential, hotel counted as residential'), h('td', { class: 'num' }, N(f.nonresWithoutHotel)), h('td', { class: 'num' }, f.nonresFsrWithoutHotel?.toFixed(2) ?? '—'), h('td', {}, f.requiredNonres ? (f.passWithoutHotel ? h('span', { class: f.tightWithoutHotel ? '' : 'pos' }, f.tightWithoutHotel ? 'meets, but within 10% (provisional)' : 'meets') : h('span', { class: 'neg' }, 'short')) : '')),
      f.requiredNonres ? h('tr', {}, h('td', {}, `Required: ${f.minNonresFsr} FSR × ${N(f.siteAreaM2)} m² site`), h('td', { class: 'num' }, N(f.requiredNonres)), h('td', { class: 'num' }, f.minNonresFsr.toFixed(2)), h('td', {}, `using ${f.usingHotelAsNonResidential ? 'hotel = non-residential' : 'hotel = residential'}`)) : null)));
  // by family
  const fam = {};
  for (const i of r.items) { const k = i.family_id; fam[k] ??= { gfa: 0, value: 0, cost: 0, net: 0 }; fam[k].gfa += i.gfa; fam[k].value += i.value; fam[k].cost += i.cost + i.profit; fam[k].net += i.net_contribution; }
  const famTbl = h('div', { class: 'tbl' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Activity family'), h('th', { class: 'num' }, 'GFA m²'), h('th', { class: 'num' }, 'Value'), h('th', { class: 'num' }, 'Cost + profit'), h('th', { class: 'num' }, 'Net'))),
    h('tbody', {}, Object.entries(fam).sort((a, b) => b[1].net - a[1].net).map(([k, v]) => h('tr', {},
      h('td', {}, h('span', { class: 'nm', style: 'display:inline-flex;gap:6px;align-items:center' }, h('i', { class: 'sw', style: `background:${famColour(k)}` }), data.families.get(k)?.name)),
      h('td', { class: 'num' }, N(v.gfa)), h('td', { class: 'num' }, M(v.value)), h('td', { class: 'num' }, M(v.cost)), h('td', { class: `num ${signCls(v.net)}` }, M(v.net)))))));
  el.replaceChildren(verdict, land, hint, kpis, h('h4', { style: 'margin:0' }, 'Brief check'), fsr, h('p', { class: 'note' }, f.note), h('h4', { style: 'margin:0' }, 'Where value is made and lost'), famTbl, rulesBlock(), warningsBlock());
}
function rulesBlock() {
  const rs = result.rules, order = { block: 0, error: 1, warning: 2, info: 3 };
  const sorted = [...rs].sort((a, b) => order[a.severity] - order[b.severity]);
  const box = h('div', { class: 'rules' });
  const show = n => box.replaceChildren(...sorted.slice(0, n).map(r => h('div', { class: `rule ${r.severity}` }, h('b', {}, r.severity), h('span', {}, r.text))),
    sorted.length > n ? h('button', { onclick: () => show(sorted.length) }, `Show all ${sorted.length}`) : null);
  show(8);
  return h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, h('h4', { style: 'margin:0' }, `Design checks (${rs.length})`), rs.length ? box : h('p', { class: 'note' }, 'No rule flags.'),
    h('p', { class: 'note' }, 'Code checks are a designer’s reading of the 2025 Vancouver Building By-law for early stacking. Confirm with a code consultant.'));
}
function warningsBlock() { return result.warnings.length ? h('div', { class: 'rules' }, result.warnings.map(w => h('div', { class: 'rule info' }, h('b', {}, 'note'), h('span', {}, w)))) : null; }

// ---------- Floors tab ----------
function selectedFloors() { const s = state.sel; return s ? state.floors.filter(f => f.level >= s[0] && f.level <= s[1]) : []; }
function programmeDefaults(id) {
  const p = prog(id), row = p?.value_status === 'linked' ? data.rows.get(p.value_ref) : null;
  const o = state.settings.programme?.[id] || {};
  const m = data.costs.cost_map, refs = (id in m.by_programme ? m.by_programme[id] : row ? m.by_value_row[row.id] : null) || [];
  const lines = refs.map(r => data.lines.get(r)).filter(Boolean);
  return { p, row, o, lines };
}
function renderFloors() {
  const el = $('#tab-floors'), fl = selectedFloors();
  if (!fl.length) {
    el.replaceChildren(h('p', { class: 'note' }, 'Select one floor or a range in the section (shift-click), then set which programmes share the plate.'), floorTable());
    return;
  }
  if (!editMix) editMix = fl[0].mix.map(m => ({ ...m }));
  const sum = editMix.reduce((s, m) => s + m.share, 0);
  const mixed = fl.some(f => JSON.stringify(f.mix) !== JSON.stringify(fl[0].mix));
  const head = h('div', { class: 'toolbar' }, h('strong', {}, `L${state.sel[0]}${state.sel[1] !== state.sel[0] ? '–L' + state.sel[1] : ''} · ${fl.length} floor${fl.length > 1 ? 's' : ''} · ${N(fl.reduce((s, f) => s + f.area_m2, 0))} m²`),
    h('button', { onclick: () => { state.sel = null; editMix = null; renderSection(); renderFloors(); } }, 'Clear selection'));
  const rows = h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, editMix.map((m, k) => {
    const p = prog(m.programme_id);
    const inp = h('input', { id: `share-${k}`, type: 'number', min: 0, max: 100, step: 1, value: Math.round(m.share * 1000) / 10, 'aria-label': `Share of ${p?.name}` });
    inp.addEventListener('change', () => { editMix[k].share = Math.max(0, Number(inp.value) || 0) / 100; renderFloors(); });
    return h('div', { class: 'mix-row' }, h('div', { class: 'nm' }, h('i', { class: 'sw', style: `background:${famColour(p?.family_id)}` }), h('span', { title: p?.name }, `${m.programme_id} · ${p?.name}`)), inp,
      h('button', { 'aria-label': 'Remove', onclick: () => { editMix.splice(k, 1); renderFloors(); } }, '×'));
  }));
  const sumNote = h('div', { class: Math.abs(sum - 1) < 0.005 ? 'note' : 'neg' }, `Shares add up to ${(sum * 100).toFixed(1)}%${Math.abs(sum - 1) < 0.005 ? '.' : ' — must be 100%.'}`);
  // picker
  const famSel = h('select', { id: 'pickFam', 'aria-label': 'Activity family' }, h('option', { value: '' }, 'Activity family…'),
    [...data.families.values()].map(f => h('option', { value: f.family_id, selected: f.family_id === pickFamily }, `${f.name}${f.intensity ? ' · intensity ' + f.intensity : ''}`)));
  famSel.addEventListener('change', () => { pickFamily = famSel.value || null; pickProgramme = null; renderFloors(); });
  const progs = [...data.programmes.values()].filter(p => !pickFamily || p.family_id === pickFamily);
  const progSel = h('select', { id: 'pickProg', 'aria-label': 'Programme' }, h('option', { value: '' }, 'Programme…'),
    progs.map(p => h('option', { value: p.id, selected: p.id === pickProgramme }, `${p.id} ${p.unconventional ? '★ ' : ''}${p.name}${p.needs_user_value ? ' (value: user to supply)' : ''}`)));
  progSel.addEventListener('change', () => { pickProgramme = progSel.value || null; renderFloors(); });
  const addBtn = h('button', { onclick: () => { if (!pickProgramme) return; const left = Math.max(0, 1 - editMix.reduce((s, m) => s + m.share, 0)); editMix.push({ programme_id: pickProgramme, share: left || 0 }); renderFloors(); } }, 'Add');
  const actions = h('div', { class: 'toolbar' },
    h('button', { onclick: () => { const s = editMix.reduce((a, m) => a + m.share, 0); if (s > 0) editMix.forEach(m => { m.share = m.share / s; }); renderFloors(); } }, 'Scale to 100%'),
    h('button', { class: 'primary', disabled: Math.abs(sum - 1) > 0.005 || !editMix.length, onclick: applyMix }, `Apply to ${fl.length} floor${fl.length > 1 ? 's' : ''}`),
    h('button', { onclick: () => { editMix = fl[0].mix.map(m => ({ ...m })); renderFloors(); } }, 'Reset'));
  // geometry
  const geo = h('div', { class: 'grid2' },
    numField('fArea', 'Plate area each floor', fl.length === 1 ? fl[0].area_m2 : null, { step: 10, min: 10, unit: 'm²', placeholder: 'mixed', onchange: v => { if (v) { pushHistory(); fl.forEach(f => { f.area_m2 = v; }); refresh(); } } }),
    h('div', { class: 'field' }, h('label', { for: 'fBasis' }, 'Area basis'), (() => { const s = h('select', { id: 'fBasis' }, h('option', { value: 'gross', selected: fl[0].area_basis !== 'net' }, 'gross (core included)'), h('option', { value: 'net', selected: fl[0].area_basis === 'net' }, 'net (core removed)')); s.addEventListener('change', () => { pushHistory(); fl.forEach(f => { f.area_basis = s.value; }); refresh(); }); return s; })()));
  el.replaceChildren(head, mixed ? h('p', { class: 'note' }, `These floors have different mixes. Showing L${fl[0].level}; Apply replaces the mix on every selected floor.`) : null, h('h4', { style: 'margin:0' }, 'Programme mix'), rows, sumNote, h('div', { class: 'picker' }, famSel, progSel, addBtn), actions,
    pickProgramme ? programmeCard(pickProgramme) : (editMix[0] ? programmeCard(editMix[0].programme_id) : null),
    h('details', {}, h('summary', {}, 'Floor size and area basis'), geo), floorTable());
}
function applyMix() {
  pushHistory();
  const mix = editMix.map(m => ({ programme_id: m.programme_id, share: m.share }));
  for (const f of selectedFloors()) f.mix = mix.map(m => ({ ...m }));
  refresh();
}
function programmeCard(id) {
  const { p, row, o, lines } = programmeDefaults(id);
  if (!p) return null;
  const fam = data.families.get(p.family_id);
  const setO = (k, v) => { try { v = k === 'efficiency' ? (v == null ? null : Math.min(1, Math.max(0.3, finite(v, 'efficiency')))) : checkMoney(v, k); } catch (e) { toast(e.message); return; } pushHistory(); state.settings.programme = { ...(state.settings.programme || {}) }; const cur = { ...(state.settings.programme[id] || {}) }; if (v == null) delete cur[k]; else cur[k] = v; if (Object.keys(cur).length) state.settings.programme[id] = cur; else delete state.settings.programme[id]; refresh(); };
  const turnkey = data.costs.other.childcare_turnkey_per_space;
  const childcare = !lines.length && row && turnkey?.applies_to_rows?.includes(row.id) ? childcareHardRate(data, settingsFull()) : null;
  const baseCost = childcare ?? lines.filter(l => !l.add_on).reduce((s, l) => s + l.default_m2.value, 0);
  const costSrc = childcare != null ? { ...turnkey, grade: 'C', note: `C$${N(turnkey.value)} per space ÷ ${settingsFull().childcareM2PerSpace} m² per space ÷ (1 + soft cost). ${turnkey.note}` } : lines[0]?.default_m2;
  const drift = row ? recomputeValue(row) : null;
  const driftNote = drift != null && row?.value_per_m2_gfa?.value && Math.abs(drift / row.value_per_m2_gfa.value - 1) > 0.05 ? h('p', { class: 'note neg' }, `This default (${N(row.value_per_m2_gfa.value)}) does not follow from its own inputs (${N(drift)}); see Method & sources.`) : null;
  return h('div', { class: 'panel' }, h('div', { class: 'ph' }, h('i', { class: 'sw', style: `background:${famColour(p.family_id)}` }), h('h2', {}, `${p.id} · ${p.name}`), p.unconventional ? h('span', { class: 'grade' }, '★ unconventional') : null),
    h('div', { class: 'pb' },
      h('div', { class: 'note' }, `${fam.name}${fam.intensity ? ' · intensity ' + fam.intensity : ''} · fits ${p.fits.join(', ') || p.fits_text} · code group ${(p.occupancy_group || []).join(', ') || '—'} · users ${(p.users || []).join(', ')}`),
      row ? h('div', { class: 'note' }, `Value row ${row.id}: ${row.name} · earns by ${row.earns_by} · method ${row.method}`) : h('div', { class: 'note' }, p.value_status === 'zero' ? 'Earns nothing: cost only.' : 'No sourced value yet: enter your own below.'),
      h('div', { class: 'grid2' },
        numField(`pv-${id}`, 'Value per m² GFA (before height premium; office before leasing costs)', o.valuePerM2Gfa ?? (row ? row.value_per_m2_gfa.value : (p.value_status === 'zero' ? 0 : null)), { step: 100, unit: 'C$/m²', placeholder: 'user to supply', src: row?.value_per_m2_gfa, onchange: v => setO('valuePerM2Gfa', v) }),
        numField(`pc-${id}`, 'Hard cost per m² (before tall premium)', o.hardCostPerM2 ?? (baseCost || null), { step: 50, unit: 'C$/m²', placeholder: 'floor average', src: costSrc, onchange: v => setO('hardCostPerM2', v) }),
        numField(`pe-${id}`, 'Efficiency (net ÷ gross)', o.efficiency ?? null, { step: 0.01, min: 0.3, max: 1, placeholder: 'from pack', onchange: v => setO('efficiency', v) })),
      driftNote,
      o && Object.keys(o).length ? h('button', { onclick: () => { pushHistory(); delete state.settings.programme[id]; refresh(); } }, 'Use pack defaults') : null,
      h('p', { class: 'note' }, 'A hard cost you type here replaces the pack rate including the tall-building premium. Leave a field empty to use the pack.')));
}
function floorTable() {
  const rows = [...result.floors].sort((a, b) => b.level - a.level);
  return h('details', { open: !state.sel }, h('summary', {}, `All floors (${rows.length})`), h('div', { class: 'tbl', style: 'max-height:420px;overflow:auto' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Level'), h('th', { class: 'num' }, 'Elev. m'), h('th', { class: 'num' }, 'Area m²'), h('th', {}, 'Mix'), h('th', { class: 'num' }, 'Value'), h('th', { class: 'num' }, 'Cost+profit'), h('th', { class: 'num' }, 'Net'))),
    h('tbody', {}, rows.map(f => h('tr', { style: 'cursor:pointer', onclick: () => { state.sel = [f.level, f.level]; editMix = null; renderSection(); renderFloors(); } },
      h('td', {}, `L${f.level}`), h('td', { class: 'num' }, f.elevation_m.toFixed(1)), h('td', { class: 'num' }, N(f.area_m2)),
      h('td', {}, f.items.map(i => `${i.programme_id} ${Math.round(i.share * 100)}%`).join(' · ')),
      h('td', { class: 'num' }, M(f.value)), h('td', { class: 'num' }, M(f.cost + f.profit)), h('td', { class: `num ${signCls(f.net)}` }, M(f.net))))))));
}

// ---------- City ledger tab ----------
function renderCity() {
  const r = result, L = r.ledger, t = r.totals, S = settingsFull(), A = data.assumptions, C = data.charges;
  const line = (k, v, tip) => h('tr', { 'data-tip': tip }, h('td', {}, k), h('td', { class: 'num' }, M(v, 2)));
  const tbl = h('div', { class: 'tbl' }, h('table', {}, h('tbody', {},
    line('Vancouver DCL', L.dcl, srcText(C.components.dcl.rates.residential)),
    line('Utilities DCL', L.utilitiesDcl, srcText(C.components.utilities_dcl.rates.residential)),
    line('Amenity Cost Charge', L.acc, srcText(C.components.acc.steps[0].rates.residential)),
    L.other ? line('Other charges you entered', L.other) : null,
    line('CAC, cash', L.cac, srcText(C.cac.share_of_lift)),
    L.cacEndowment ? line('CAC kept as an endowment for public floors', L.cacEndowment) : null,
    line('Build cost of in-kind public space (childcare, library, community, transit, social housing, free floors)', L.inKindBuildCost),
    h('tr', {}, h('th', {}, 'Total to the public'), h('th', { class: 'num' }, M(L.total, 2))))));
  const payer = h('select', { id: 'payer' }, [['cross_subsidy', 'Cross-subsidy inside the building'], ['cac_endowment', 'Endowment from the CAC'], ['ticketed_deck', 'Ticketed deck pays for free floors'], ['city_or_partner', 'City or a partner runs and pays']].map(([v, l]) => h('option', { value: v, selected: S.publicPayer === v }, l)));
  payer.addEventListener('change', () => setSetting('publicPayer', payer.value));
  const run = h('div', { class: 'grid2' },
    numField('runCost', 'Running cost of public floors', S.publicRunningCostPerM2, { step: 10, min: 0, unit: 'C$/m²/yr', placeholder: 'user to supply', src: A.public_running_cost.cost_per_m2_year, onchange: v => setSetting('publicRunningCostPerM2', v) }),
    h('div', { class: 'field' }, h('label', { for: 'payer' }, 'Who pays'), payer));
  el('#tab-city').replaceChildren(
    h('p', { class: 'note' }, 'What the City and public receive from this tower, separate from whether it pays back the investors. Charges use rates for a permit on ' + S.permitDate + '.'),
    tbl,
    h('h4', { style: 'margin:0' }, 'Public floors cost money every year'),
    run,
    h('div', { class: 'kpis' }, kpi('Public floor area', `${N(r.items.filter(i => i.earnsBy === 'public').reduce((s, i) => s + i.gfa, 0))} m²`), kpi('Running cost per year', M(t.publicRunningPerYear, 2)), kpi('Capitalised at ' + pct(S.publicCapRate, 0), M(t.publicCapitalised)), kpi('Taken off value', M(t.publicDeduction))),
    h('p', { class: 'note' }, 'Not included yet: Metro Vancouver and TransLink regional charges. DCL treatment of social housing, civic and parking floor area is not confirmed (cautious rates used). Rental ACC waivers apply only to 100%-rental projects.'));
}
const el = s => document.querySelector(s);

// ---------- Map tab (G4: downtown context, neighbouring roofs) ----------
const BASEMAP = 'basemap/vancouver_downtown.json';
const HEIGHT_BINS = [20, 40, 80, 120, 160];              // m; six colour steps, low to high
const mapView = { map: null, loading: null, error: null, paths: null, k: null, cx: 0, cy: 0, hover: null, radius: 150 };
async function loadBasemap() {
  if (mapView.map || mapView.loading) return mapView.loading;
  mapView.loading = (async () => {
    const manifest = await fetch(BASEMAP).then(r => { if (!r.ok) throw new Error(`${BASEMAP}: ${r.status}`); return r.json(); });
    const buf = await fetch('basemap/' + manifest.file).then(r => { if (!r.ok) throw new Error(`${manifest.file}: ${r.status}`); return r.arrayBuffer(); });
    mapView.map = parseBasemap(manifest, buf);
    mapView.paths = buildMapPaths(mapView.map);
    const [x0, y0, x1, y1] = manifest.extent_m; mapView.cx = (x0 + x1) / 2; mapView.cy = (y0 + y1) / 2;
  })().catch(e => { mapView.error = e.message; mapView.loading = null; });
  return mapView.loading;
}
/** Path2D objects in model metres, built once; the canvas transform does pan and zoom. */
function buildMapPaths(map) {
  const { layers: L, X, Y } = map;
  const tri = arr => { const p = new Path2D(); for (let k = 0; k + 5 < arr.length; k += 6) { p.moveTo(X(arr[k]), Y(arr[k + 1])); p.lineTo(X(arr[k + 2]), Y(arr[k + 3])); p.lineTo(X(arr[k + 4]), Y(arr[k + 5])); p.closePath(); } return p; };
  const seg = arr => { const p = new Path2D(); for (let k = 0; k + 3 < arr.length; k += 4) { p.moveTo(X(arr[k]), Y(arr[k + 1])); p.lineTo(X(arr[k + 2]), Y(arr[k + 3])); } return p; };
  // terrain tinted in 10 m bands so the slope of the peninsula reads
  const t = L.terrain, terrain = new Map();
  for (let k = 0; k + 8 < t.length; k += 9) {
    const z = (t[k + 2] + t[k + 5] + t[k + 8]) / 30, band = Math.min(5, Math.max(0, Math.floor(z / 10)));
    if (!terrain.has(band)) terrain.set(band, new Path2D());
    const p = terrain.get(band); p.moveTo(X(t[k]), Y(t[k + 1])); p.lineTo(X(t[k + 3]), Y(t[k + 4])); p.lineTo(X(t[k + 6]), Y(t[k + 7])); p.closePath();
  }
  const bins = HEIGHT_BINS.map(() => new Path2D()); bins.push(new Path2D());
  for (const b of map.buildings) {
    const bin = HEIGHT_BINS.findIndex(v => b.height < v), p = bins[bin < 0 ? HEIGHT_BINS.length : bin];
    for (const ring of b.rings) { ring.forEach(([x, y], k) => (k ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); }
  }
  return { terrain, water: tri(L.water), parks: tri(L.parks), roads: seg(L.roads), shore: seg(L.shoreline), bins };
}
function buildingPath(b) { const p = new Path2D(); for (const ring of b.rings) { ring.forEach(([x, y], k) => (k ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); } return p; }
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function drawMap(canvas) {
  const map = mapView.map; if (!map || !canvas.isConnected) return;
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const [x0, y0, x1, y1] = map.manifest.extent_m;
  if (!mapView.k) mapView.k = Math.min(W / (x1 - x0), H / (y1 - y0));
  const k = mapView.k, ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = cssVar('--map-sea'); ctx.fillRect(0, 0, W, H);
  // model -> screen: x right, y up
  ctx.setTransform(dpr * k, 0, 0, -dpr * k, dpr * (W / 2 - mapView.cx * k), dpr * (H / 2 + mapView.cy * k));
  const P = mapView.paths, px = 1 / k;
  for (const [band, p] of [...P.terrain].sort((a, b) => a[0] - b[0])) { ctx.fillStyle = cssVar(`--map-land-${band}`); ctx.fill(p); }
  ctx.fillStyle = cssVar('--map-park'); ctx.fill(P.parks);
  ctx.fillStyle = cssVar('--map-sea'); ctx.fill(P.water);
  ctx.strokeStyle = cssVar('--map-road'); ctx.lineWidth = 0.8 * px; ctx.stroke(P.roads);
  ctx.strokeStyle = cssVar('--map-shore'); ctx.lineWidth = 1 * px; ctx.stroke(P.shore);
  P.bins.forEach((p, i) => { ctx.fillStyle = cssVar(`--map-b${i}`); ctx.fill(p, 'evenodd'); });
  ctx.strokeStyle = cssVar('--map-outline'); ctx.lineWidth = 0.4 * px; P.bins.forEach(p => ctx.stroke(p));
  const site = state.mapSite, nb = mapView.nb;
  if (site && nb) {
    ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 1.6 * px;
    for (const i of nb.neighbours) ctx.stroke(buildingPath(map.buildings[i]));
    ctx.setLineDash([6 * px, 4 * px]); ctx.beginPath(); ctx.arc(site.x, site.y, nb.radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    if (nb.tallest) { ctx.lineWidth = 3 * px; ctx.strokeStyle = cssVar('--warn'); ctx.stroke(buildingPath(map.buildings[nb.tallest.i])); }
    ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.arc(site.x, site.y, 5 * px, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = cssVar('--sheet'); ctx.lineWidth = 1.5 * px; ctx.stroke();
  }
  if (mapView.hover != null) { ctx.strokeStyle = cssVar('--ink'); ctx.lineWidth = 1.4 * px; ctx.stroke(buildingPath(map.buildings[mapView.hover])); }
  // labels in screen space
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `500 11px ${cssVar('--body') || 'sans-serif'}`; ctx.textAlign = 'center';
  for (const l of map.manifest.labels) {
    const sx = W / 2 + (l.x - mapView.cx) * k, sy = H / 2 - (l.y - mapView.cy) * k;
    if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
    ctx.lineWidth = 3; ctx.strokeStyle = cssVar('--map-halo'); ctx.strokeText(l.text, sx, sy); ctx.fillStyle = cssVar('--ink'); ctx.fillText(l.text, sx, sy);
  }
  // scale bar
  const target = 120 / k, step = [50, 100, 200, 250, 500, 1000, 2000].find(s => s >= target * 0.6) || 2000, len = step * k;
  ctx.fillStyle = cssVar('--ink'); ctx.fillRect(12, H - 16, len, 3); ctx.textAlign = 'left'; ctx.fillText(`${step} m`, 12, H - 22);
  ctx.textAlign = 'right'; ctx.fillText('N ↑', W - 10, 18);
}
function mapModelAt(canvas, ev) {
  const r = canvas.getBoundingClientRect(), k = mapView.k;
  return { x: mapView.cx + (ev.clientX - r.left - r.width / 2) / k, y: mapView.cy - (ev.clientY - r.top - r.height / 2) / k };
}
function buildingAt(x, y) { const m = mapView.map; if (!m) return null; for (const b of m.buildings) if (insideBuilding(b, x, y)) return b; return null; }
function wireMap(canvas, redrawInfo) {
  let drag = null, raf = 0;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => drawMap(canvas)); };
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, cx: mapView.cx, cy: mapView.cy, moved: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) { mapView.cx = drag.cx - dx / mapView.k; mapView.cy = drag.cy + dy / mapView.k; redraw(); }
      return;
    }
    const { x, y } = mapModelAt(canvas, e), b = buildingAt(x, y), hv = b ? b.i : null;
    if (hv !== mapView.hover) { mapView.hover = hv; redraw(); }
    const tip = $('#tip');
    if (b) { tip.textContent = `Building · ${b.height.toFixed(0)} m tall (${['measured', 'from floor count', 'estimated by type', 'unknown'][b.source]})\nGround ≈ ${b.ground.toFixed(0)} m (SRTM) · OpenStreetMap way ${b.osmWay}`; tip.hidden = false; tip.style.left = Math.min(window.innerWidth - 336, e.clientX + 12) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; }
    else tip.hidden = true;
  });
  canvas.addEventListener('pointerleave', () => { mapView.hover = null; $('#tip').hidden = true; redraw(); });
  canvas.addEventListener('pointerup', e => {
    const d = drag; drag = null;
    if (d && !d.moved) { const { x, y } = mapModelAt(canvas, e); setMapSite(x, y); redrawInfo(); redraw(); }
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const before = mapModelAt(canvas, e), f = Math.exp(-e.deltaY * 0.0015);
    mapView.k = Math.min(20, Math.max(0.05, mapView.k * f));
    const after = mapModelAt(canvas, e);
    mapView.cx += before.x - after.x; mapView.cy += before.y - after.y; redraw();
  }, { passive: false });
  new ResizeObserver(redraw).observe(canvas);
  return redraw;
}
function setMapSite(x, y) {
  state.mapSite = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  mapView.nb = neighbourRoofs(mapView.map, state.mapSite.x, state.mapSite.y, mapView.radius);
  save();
}
function renderMap() {
  const box = $('#tab-map');
  if (!mapView.map) {
    box.replaceChildren(h('p', { class: 'note' }, mapView.error ? `Could not load the base map: ${mapView.error}` : 'Loading the downtown base map (about 1 MB)…'));
    if (!mapView.error) loadBasemap().then(() => { if (activeTab === 'map') renderMap(); });
    return;
  }
  const map = mapView.map, man = map.manifest, S = settingsFull();
  if (state.mapSite && !mapView.nb) mapView.nb = neighbourRoofs(map, state.mapSite.x, state.mapSite.y, mapView.radius);
  const canvas = h('canvas', { class: 'map', role: 'img', 'aria-label': 'Plan of downtown Vancouver: buildings coloured by height. Click to place a study point.' });
  const info = h('div', { class: 'mapinfo' });
  const zoom = f => { mapView.k = Math.min(20, Math.max(0.05, mapView.k * f)); redraw(); };
  const legend = h('div', { class: 'legend' }, ['< 20', '20–40', '40–80', '80–120', '120–160', '≥ 160'].map((t, i) => h('span', {}, h('i', { style: `background:var(--map-b${i})` }), `${t} m`)));
  const radius = numField('mapRadius', 'Neighbour radius', mapView.radius, { step: 10, min: 50, max: 600, unit: 'm', onchange: v => {
    const r = Math.min(600, Math.max(50, Number(v) || 150)); mapView.radius = r;
    if (state.mapSite) mapView.nb = neighbourRoofs(map, state.mapSite.x, state.mapSite.y, r);
    fillInfo(); redraw(); } });
  const tools = h('div', { class: 'toolbar' },
    h('button', { onclick: () => zoom(1.4), 'aria-label': 'Zoom in' }, '+'), h('button', { onclick: () => zoom(1 / 1.4), 'aria-label': 'Zoom out' }, '−'),
    h('button', { onclick: () => { mapView.k = null; const [x0, y0, x1, y1] = man.extent_m; mapView.cx = (x0 + x1) / 2; mapView.cy = (y0 + y1) / 2; redraw(); } }, 'Fit downtown'),
    state.mapSite ? h('button', { onclick: () => { state.mapSite = null; mapView.nb = null; save(); renderMap(); } }, 'Clear point') : null);
  const credits = h('p', { class: 'note credits' }, man.attribution.flatMap((a, i) => [i ? ' · ' : '', h('a', { href: a.url, target: '_blank', rel: 'noopener' }, a.text), ` (${a.licence})`]));
  function fillInfo() {
    const nb = mapView.nb;
    if (!state.mapSite || !nb) {
      info.replaceChildren(h('p', { class: 'note' }, 'Click the map to place a study point. The tool lists the buildings around it and estimates how high their roofs are, which can feed the condo “above neighbouring roofs” bonus. No site is marked: the brief’s site is hypothetical.'));
      return;
    }
    const ll = toLatLon(man, nb.x, nb.y), tower = result.height;
    const useVal = nb.aboveSiteGround.max ?? nb.height.max;
    const f0 = x => (x == null ? '—' : `${x.toFixed(0)} m`);
    info.replaceChildren(
      h('div', { class: 'kpis' },
        kpi('Buildings within ' + nb.radius + ' m', String(nb.count), '', `Measured ${nb.bySource.measured} · from floor count ${nb.bySource.levels} · estimated by type ${nb.bySource.estimated}`),
        kpi('Tallest neighbour', f0(nb.height.max), '', 'Its own height above its ground (OpenStreetMap)'),
        kpi('Tallest roof above this point’s ground', f0(nb.aboveSiteGround.max), '', 'Neighbour ground + height − ground here (SRTM). Use this one for the condo bonus: floor elevations in the tool are above your grade.'),
        kpi('90th percentile / median', `${f0(nb.height.p90)} / ${f0(nb.height.median)}`)),
      h('p', { class: 'note' }, `Point ${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)} · ground ≈ ${nb.siteGround == null ? '—' : nb.siteGround.toFixed(0) + ' m (SRTM)'}${nb.onSite.length ? ` · ${nb.onSite.length} building on the point left out (it would be replaced)` : ''}. ` +
        (tower > 0 && useVal != null ? `Your tower (${tower.toFixed(0)} m) ${tower > useVal ? `rises ${(tower - useVal).toFixed(0)} m above` : `stays ${(useVal - tower).toFixed(0)} m below`} the tallest neighbouring roof.` : '')),
      h('div', { class: 'toolbar' },
        useVal != null ? h('button', { class: 'primary', onclick: () => setSetting('neighbourRoofM', Math.round(useVal)) }, `Use ${Math.round(useVal)} m for the condo bonus`) : null,
        nb.aboveSiteGround.p90 != null ? h('button', { onclick: () => setSetting('neighbourRoofM', Math.round(nb.aboveSiteGround.p90)) }, `Use the 90th percentile (${Math.round(nb.aboveSiteGround.p90)} m)`) : null,
        h('span', { class: 'note' }, `Now: ${S.neighbourRoofM == null ? 'off' : S.neighbourRoofM + ' m'}`), gradeTag('C')),
      h('p', { class: 'note' }, 'Grade C: heights come from OpenStreetMap and are partly estimated; ground levels from SRTM. Floors at or above this height get the condo “above neighbours” bonus (Assumptions tab).'));
  }
  fillInfo();
  box.replaceChildren(
    h('p', { class: 'note' }, 'Downtown Vancouver in plan, buildings coloured by height. Drag to pan, scroll or use +/− to zoom, hover for a building, click to place a study point.'),
    h('div', { class: 'toolbar map-tools' }, tools, radius), legend,
    h('div', { class: 'mapwrap' }, canvas), credits, info,
    h('details', {}, h('summary', {}, 'About this map'), h('ul', { class: 'note' }, man.caveats.map(c => h('li', {}, c)),
      h('li', {}, `${N(man.counts.buildings)} buildings; ${man.file} is ${(man.byte_length / 1e6).toFixed(1)} MB. Built by scripts/build_basemap.py.`))));
  const redraw = wireMap(canvas, fillInfo);
  redraw();
}
const themeQuery = matchMedia('(prefers-color-scheme: dark)');
themeQuery.addEventListener?.('change', () => { if (activeTab === 'map') renderMap(); });

// ---------- Sensitivity tab ----------
function renderSens() {
  if (!sens) sens = sensitivity(state.floors, data, state.settings);
  const tests = sens.tests, base = sens.base;
  const lo0 = Math.min(base, ...tests.map(t => t.low)), hi0 = Math.max(base, ...tests.map(t => t.high)), padV = (hi0 - lo0) * 0.22 || 1;
  const lo = lo0 - padV, hi = hi0 + padV;
  const W = 640, rowH = 34, padL = 210, padR = 20, H = tests.length * rowH + 50;
  const xs = v => padL + (v - lo) / Math.max(1, hi - lo) * (W - padL - padR);
  let s = `<line class="axis" x1="${xs(base)}" x2="${xs(base)}" y1="14" y2="${H - 24}" stroke-dasharray="3 3"/>`;
  s += `<text x="${xs(base)}" y="10" text-anchor="middle">base ${esc(M(base, 0))}</text>`;
  tests.forEach((t, k) => {
    const y = 22 + k * rowH;
    s += `<text x="${padL - 8}" y="${y + 15}" text-anchor="end">${esc(t.label)}</text>`;
    s += `<rect x="${xs(t.low)}" y="${y + 3}" width="${Math.max(1, xs(base) - xs(t.low))}" height="18" fill="var(--bad)" opacity=".8"/>`;
    s += `<rect x="${xs(base)}" y="${y + 3}" width="${Math.max(1, xs(t.high) - xs(base))}" height="18" fill="var(--good)" opacity=".8"/>`;
    s += `<text x="${xs(t.low) - 4}" y="${y + 16}" text-anchor="end" style="font-size:10px;fill:var(--muted)">${esc(M(t.low, 0))}</text>`;
    s += `<text x="${xs(t.high) + 4}" y="${y + 16}" style="font-size:10px;fill:var(--muted)">${esc(M(t.high, 0))}</text>`;
  });
  s += `<text x="${(padL + W - padR) / 2}" y="${H - 6}" text-anchor="middle" style="fill:var(--muted)">Residual land value after CAC</text>`;
  $('#tab-sens').replaceChildren(
    h('p', { class: 'note' }, 'How far the residual land value moves when one input changes at a time. The widest bars are the numbers to check first.'),
    h('div', { class: 'tbl', html: `<svg class="tornado" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Tornado chart of residual land value after CAC">${s}</svg>` }),
    h('p', { class: 'note' }, 'Condo height premium spans the two Vancouver studies: about 0.1%/floor when unit quality is controlled (UBC) and up to 1.5%/floor in raw sales data (Roomvu). Deck visitors only matter if the scheme has a ticketed deck (LE1).'));
}

// ---------- Assumptions tab ----------
function renderAssume() {
  const S = settingsFull(), A = data.assumptions, Co = data.costs.other, Ch = data.charges;
  const f = (id, label, key, src, opts = {}) => numField(id, label, S[key], { ...opts, src, onchange: v => setSetting(key, v) });
  const sel = (id, label, key, options, src) => { const s = h('select', { id }, options.map(([v, l]) => h('option', { value: String(v), selected: String(S[key]) === String(v) }, l))); s.addEventListener('change', () => setSetting(key, s.value === 'true' ? true : s.value === 'false' ? false : s.value)); return h('div', { class: 'field' }, h('label', { for: id }, label, src ? gradeTag(src.grade) : null, src ? srcTag(src) : null), s); };
  const brief = data.brief;
  $('#tab-assume').replaceChildren(
    h('h4', { style: 'margin:0' }, 'Project'),
    h('div', { class: 'grid2' },
      f('aPodium', 'Podium top floor (height premium starts above it)', 'podiumTopFloor', null, { step: 1, min: 0 }),
      f('aNeighbour', 'Neighbouring roofs height (condo bonus above it)', 'neighbourRoofM', A.height_premium.above_neighbours_bonus, { step: 1, min: 0, unit: 'm', placeholder: 'off' }),
      f('aSite', 'Site area', 'siteAreaM2', brief?.site?.area_m2, { step: 1, min: 0, unit: 'm²', placeholder: 'enter site area' }),
      f('aFsr', 'Minimum non-residential FSR', 'minNonresFsr', null, { step: 0.1, min: 0, placeholder: 'none' }),
      sel('aHotel', 'Hotel counts as', 'hotelAsNonResidential', [[true, 'non-residential (City practice)'], [false, 'residential']]),
      sel('aPermit', 'Building permit date (sets charge rates)', 'permitDate', [...Ch.components.acc.steps.map(s => [s.from, `from ${s.from}`]), ['2028-09-30', 'from 2028-09-30'], ['2029-09-30', 'from 2029-09-30']]),
      sel('aEsc', 'City charges rise 3% a year to 2029', 'applyEscalation', [[true, 'apply'], [false, 'ignore']], Ch.escalation)),
    h('h4', { style: 'margin:0' }, 'Costs'),
    h('div', { class: 'grid2' },
      f('aTall', 'Tall-building premium on hard cost', 'supertallPremium', Co.supertall_premium, { step: 0.01, min: 0, max: 1, unit: 'share' }),
      f('aTallH', 'Premium applies above height', 'supertallThresholdM', null, { step: 1, unit: 'm' }),
      f('aSoft', 'Soft costs (share of hard)', 'softCost', Co.soft_cost, { step: 0.01, min: 0, max: 1 }),
      f('aTA', 'Office tenant allowance', 'officeTenantAllowance', Co.office_tenant_allowance, { step: 10, unit: 'C$/m²' }),
      f('aLease', 'Office leasing costs (share of value)', 'officeLeasingCost', Co.office_leasing_cost, { step: 0.01, min: 0, max: 1 }),
      f('aFfe', 'Luxury hotel FF&E per key', 'hotelFfePerKey', Co.hotel_ffe_per_key, { step: 5000, unit: 'C$' }),
      f('aChild', 'Childcare floor area per space (turns the turnkey cost per space into C$/m²)', 'childcareM2PerSpace', Co.childcare_m2_per_space, { step: 1, min: 5, unit: 'm²' })),
    h('h4', { style: 'margin:0' }, 'Finance, profit and the City'),
    h('div', { class: 'grid2' },
      f('aRate', 'Construction loan rate', 'financeRate', A.finance.rate, { step: 0.0025, min: 0, max: 0.3 }),
      f('aYears', 'Build period', 'buildYears', A.finance.build_years, { step: 0.5, min: 1, unit: 'years' }),
      f('aDraw', 'Average share of cost borrowed', 'drawFactor', A.finance.draw_factor, { step: 0.05, min: 0, max: 1 }),
      f('aProfit', 'Developer profit on cost', 'profitOnCost', A.profit_on_cost, { step: 0.01, min: 0, max: 0.5 }),
      f('aCac', 'CAC share of land lift', 'cacShare', Ch.cac.share_of_lift, { step: 0.05, min: 0, max: 1 }),
      sel('aEmp', '100% employment rezoning (no CAC)', 'employmentOnly', [['auto', 'detect (no housing = yes)'], [true, 'yes'], [false, 'no']], Ch.cac.employment_only_exempt),
      sel('aPresale', 'Condo presale market', 'presaleMarket', [['weak', 'weak (as in 2026)'], ['normal', 'normal']], A.presales.lender_requirement)),
    h('div', { class: 'toolbar' },
      h('button', { onclick: () => { pushHistory(); const keep = state.settings.programme; state.settings = keep ? { programme: keep } : {}; refresh(); } }, 'Reset project assumptions'),
      h('button', { onclick: exportCSV }, 'Export floor results (CSV)'),
      h('button', { onclick: exportProject }, 'Save project (JSON)'),
      h('label', { class: 'drop', for: 'projIn', style: 'cursor:pointer' }, 'Open project (JSON)', h('input', { id: 'projIn', type: 'file', accept: '.json,application/json', class: 'sr', onchange: e => importFile(e.target.files[0]) }))),
    h('p', { class: 'note' }, `Finance cost = rate × years × share borrowed = ${pct(S.financeRate * S.buildYears * S.drawFactor)} of hard + soft cost. Hover “source” for where each default comes from.`));
}

// ---------- Method & sources tab ----------
function renderAbout() {
  const drift = [...data.rows.values()].map(r => ({ r, re: recomputeValue(r) })).filter(x => x.re != null && x.r.value_per_m2_gfa.value && Math.abs(x.re / x.r.value_per_m2_gfa.value - 1) > 0.05);
  const srcs = [...data.sources.values()].filter(s => s.id !== 'assumption');
  $('#tab-about').replaceChildren(
    h('p', {}, LABEL),
    h('h4', { style: 'margin:0' }, 'How the numbers are made'),
    h('ol', { class: 'note', style: 'margin:0;padding-left:20px' },
      h('li', {}, 'Area: GFA = plate × share. Net = GFA × efficiency (office and residential use the height-band curve).'),
      h('li', {}, 'Value: net area × value per net m² × height premium (linear per floor above the podium). Retail keeps value only at grade. Office value is shown after 15% leasing costs.'),
      h('li', {}, 'Cost: Altus 2026 Vancouver hard cost (+ tall-building premium above 250 m on floors above grade, + tenant allowance on office-type shells, + luxury hotel FF&E) + soft cost + finance + City charges. Childcare has no Altus line: its cost comes from a turnkey cost per space ÷ floor area per space (grade C).'),
      h('li', {}, 'City charges: whole floors of plant, refuge or structure pay no DCL or ACC (normally excluded from counted floor area, like the FSR check; grade C). Core, parking and storage stay on the cautious commercial rate.'),
      h('li', {}, 'Public running cost ÷ 5% is taken off value unless the City or a partner pays.'),
      h('li', {}, 'Profit = 15% of total cost. Residual land value = value − cost − profit; CAC = share × (residual − land value under current zoning), zero for 100% employment rezonings.'),
      h('li', {}, 'Verdict compares the residual after CAC with your land price.')),
    h('h4', { style: 'margin:0' }, 'Data pack'),
    h('p', { class: 'note' }, `Vancouver 2026 pack · ${data.programmes.size} programmes in ${data.families.size} activity families · ${data.rows.size} value rows · ${data.lines.size} Altus cost lines · ${srcs.length} sources. Every default carries source, date and grade (A primary 2025–26, B secondary or older, C arithmetic or assumption).`),
    drift.length ? h('div', { class: 'rules' }, h('strong', {}, 'Defaults that do not follow from their own inputs (kept as published, flagged):'), drift.map(x => h('div', { class: 'rule warning' }, h('b', {}, x.r.id), h('span', {}, `${x.r.name}: default ${N(x.r.value_per_m2_gfa.value)}, inputs give ${N(x.re)} C$/m² GFA`)))) : null,
    h('h4', { style: 'margin:0' }, 'Sources'),
    h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Source'), h('th', {}, 'Published'), h('th', {}, 'How checked'))),
      h('tbody', {}, srcs.map(s => h('tr', { 'data-tip': s.note || '' }, h('td', {}, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title) : s.title, s.publisher ? h('span', { class: 'note' }, ` · ${s.publisher}`) : null), h('td', {}, s.published || '—'), h('td', {}, s.checked)))))),
    h('h4', { style: 'margin:0' }, 'Open data gaps (user to supply)'),
    h('p', { class: 'note' }, 'Luxury hotel ADR; deck visitor numbers; supertall cost premium; Metro Vancouver and TransLink charges; efficiency curve vs CTBUH data; land price; values for branded residences, seniors housing, co-living, labs, galleries, conference and spa; downtown parking rates; public floor running cost.'));
}

// ---------- import / export ----------
async function offerFile(filename, text, type) {
  const dl = window.claude ? await window.claude.use('downloads').catch(() => null) : null;
  const blob = new Blob([text], { type });
  if (dl) { try { await dl.save({ filename, data: blob }); } catch (e) { /* declined */ } return; }
  if (!window.claude) { const a = h('a', { href: URL.createObjectURL(blob), download: filename }); document.body.append(a); a.click(); a.remove(); return; }
  try { await navigator.clipboard.writeText(text); toast('Saving files is not available here; copied to the clipboard instead.'); } catch (e) { toast('Saving files is not available in this view.'); }
}
function toast(msg) { const t = $('#tip'); t.textContent = msg; t.hidden = false; t.style.left = '16px'; t.style.top = '16px'; setTimeout(() => { t.hidden = true; }, 4000); }
function exportCSV() {
  const rows = [['# ' + LABEL], ['level', 'elevation_m', 'height_m', 'area_m2', 'area_basis', 'programme_id', 'programme', 'share', 'gfa_m2', 'net_m2', 'value_cad', 'hard_cad', 'soft_cad', 'finance_cad', 'city_charges_cad', 'profit_cad', 'net_contribution_cad']];
  for (const i of result.items) { const f = state.floors.find(x => x.level === i.level); rows.push([i.level, f.elevation_m, f.height_m, f.area_m2, f.area_basis, i.programme_id, `"${i.name.replace(/"/g, '""')}"`, i.share, i.gfa.toFixed(1), i.net.toFixed(1), Math.round(i.value), Math.round(i.hard), Math.round(i.soft), Math.round(i.finance), Math.round(i.chargeTotal), Math.round(i.profit), Math.round(i.net_contribution)]); }
  offerFile('program-value-floors.csv', rows.map(r => r.join(',')).join('\n'), 'text/csv');
}
function exportProject() { offerFile('program-value-project.json', JSON.stringify({ app: 'program-value-visualizer', version: 1, label: LABEL, brief: state.brief, floors: state.floors, settings: state.settings }, null, 2), 'application/json'); }
function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (!lines.length) throw new Error('the file is empty');
  const head = lines.shift().split(',').map(x => x.trim().replace(/^"|"$/g, '').toLowerCase());
  const ix = k => head.indexOf(k);
  for (const k of ['level', 'elevation_m', 'height_m', 'area_m2', 'mix']) if (ix(k) < 0) throw new Error(`missing column "${k}"`);
  return lines.map((l, n) => {
    const c = l.split(',').map(x => x.trim().replace(/^"|"$/g, ''));
    if (c.length < head.length) throw new Error(`row ${n + 2} has ${c.length} cells; expected ${head.length}`);
    const mix = c[ix('mix')].split(';').filter(Boolean).map(p => { const [id, s] = p.split(':'); return { programme_id: (id || '').trim().toUpperCase(), share: s }; });
    return { level: c[ix('level')], elevation_m: c[ix('elevation_m')], height_m: c[ix('height_m')], area_m2: c[ix('area_m2')], area_basis: ix('area_basis') >= 0 ? c[ix('area_basis')] : 'gross', mix };
  });
}
async function importFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    let floors, settings = null, brief = null;
    if (file.name.toLowerCase().endsWith('.json')) { const j = JSON.parse(text); floors = Array.isArray(j) ? j : j.floors; settings = j.settings && typeof j.settings === 'object' ? j.settings : null; brief = raw.briefs[j.brief] ? j.brief : null; }
    else floors = parseCSV(text);
    floors = normaliseFloors(floors);
    const clean = {};
    if (settings) {
      for (const [k, v] of Object.entries(settings)) { if (k === 'programme' || k === 'valueScale') continue; try { const c = checkSetting(k, v); if (c !== null && (k in RANGES || k in ENUMS || k === 'permitDate')) clean[k] = c; } catch (e) { /* drop bad setting */ } }
      if (settings.programme && typeof settings.programme === 'object') {
        clean.programme = {};
        for (const [pid, o] of Object.entries(settings.programme)) { if (!prog(pid) || !o || typeof o !== 'object') continue; const c = {}; try { if (o.valuePerM2Gfa != null) c.valuePerM2Gfa = checkMoney(o.valuePerM2Gfa, 'value'); if (o.hardCostPerM2 != null) c.hardCostPerM2 = checkMoney(o.hardCostPerM2, 'hard cost'); if (o.efficiency != null) c.efficiency = Math.min(1, Math.max(0.3, finite(o.efficiency, 'efficiency'))); } catch (e) { continue; } if (Object.keys(c).length) clean.programme[pid] = c; }
      }
    }
    evaluate(floors, data, settings ? clean : state.settings);   // throws before anything changes if the scheme cannot be evaluated
    pushHistory();
    if (brief && brief !== state.brief) { state.brief = brief; buildData(); $('#briefSel').value = brief; }
    state.floors = floors; if (settings) state.settings = clean; state.sel = null; editMix = null; refresh();
    toast(`Loaded ${floors.length} floors.`);
  } catch (e) { toast('Could not read that file: ' + e.message); }
}
const TEMPLATE = 'level,elevation_m,height_m,area_m2,area_basis,mix\n-1,-3.5,3.5,4000,gross,AM7:0.7;AM8:0.3\n1,0,6,4000,gross,SE1:0.6;AM4:0.4\n2,6,4.2,2000,gross,WK1:1\n3,10.2,4.2,2000,gross,WK1:0.8;CH2:0.2\n4,14.4,3.2,1200,gross,LV4:0.8;LV5:0.2\n';

// ---------- Ask AI ----------
let sample = null, chatTurns = [], chatCtl = null, aiState = 'idle';
const RULES = `You are the assistant inside Program Value Visualizer, a browser tool for early design of tall buildings in Vancouver. It estimates, floor by floor, the value, cost, City charges and developer profit of a programme mix, and the residual land value left for the land.
Rules:
- Every number is an indicative early-design estimate, never a feasibility study, appraisal or compliance check. Say so when you give a verdict.
- Use the tools to read the current scheme before answering questions about it. Quote numbers from tool results, with their source and grade when you have them. Never invent prices.
- When the user asks for a change (programme mix, assumptions, user-supplied values), make it with the tools, then report how the verdict and residual land value moved. Changes can be undone with the Undo button.
- Programmes are chosen by id from the catalogue (use find_programmes). Shares on a floor must add up to 1.
- Keep answers short and plain: a few sentences or a short list. Explain terms like residual land value, cap rate or CAC in one line when they first come up.
- Be neutral: suggest options and trade-offs; do not push one design.`;
function summaryForAI() {
  const t = result.totals, f = result.fsr;
  return { verdict: VERDICT[result.verdict], reasons: result.reasons, height_m: +result.height.toFixed(1), floors: state.floors.length,
    totals_cad_millions: Object.fromEntries(['gfa', 'gdv', 'cost', 'profit', 'publicDeduction', 'rlvBeforeCac', 'cac', 'rlvAfterCac'].map(k => [k, k === 'gfa' ? Math.round(t[k]) : +(t[k] / 1e6).toFixed(1)])),
    land_price_cad: settingsFull().landPrice, fsr: { nonres_with_hotel: Math.round(f.nonresWithHotel), nonres_without_hotel: Math.round(f.nonresWithoutHotel), required: f.requiredNonres ? Math.round(f.requiredNonres) : null, pass: f.pass ?? null },
    rules: result.rules.slice(0, 10).map(r => r.text), rule_count: result.rules.length };
}
const AI_TOOLS = [
  { name: 'get_results', description: 'Current verdict, totals (C$ millions), FSR check and the first design-rule flags, plus net value by activity family.', execute: () => {
    const fam = {}; for (const i of result.items) { const k = data.families.get(i.family_id)?.name; fam[k] = (fam[k] || 0) + i.net_contribution / 1e6; }
    return { ...summaryForAI(), net_by_family_cad_millions: Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, +v.toFixed(1)])) }; } },
  { name: 'get_floors', description: 'Floors in a level range (max 40): level, elevation, plate area, mix (programme id and share) and net value in C$ millions.', inputSchema: { type: 'object', properties: { from_level: { type: 'number' }, to_level: { type: 'number' } } }, execute: ({ from_level, to_level }) => {
    const lo = Number(from_level ?? -99), hi = Number(to_level ?? 999);
    return result.floors.filter(f => f.level >= lo && f.level <= hi).slice(0, 40).map(f => ({ level: f.level, elevation_m: f.elevation_m, area_m2: Math.round(f.area_m2), mix: f.items.map(i => `${i.programme_id}:${+i.share.toFixed(3)}`).join(';'), net_cad_millions: +(f.net / 1e6).toFixed(2) })); } },
  { name: 'find_programmes', description: 'Search the programme catalogue by words or activity family id (MP GP LE SE AM MK WK LN CH GS ST LV RR SB). Returns up to 25: id, name, family, where it fits, value per m2 GFA (null = user to supply).', inputSchema: { type: 'object', properties: { query: { type: 'string' }, family_id: { type: 'string' } } }, execute: ({ query, family_id }) => {
    const q = String(query || '').toLowerCase(), fam = String(family_id || '').toUpperCase();
    return [...data.programmes.values()].filter(p => (!fam || p.family_id === fam) && (!q || p.name.toLowerCase().includes(q) || p.id.toLowerCase() === q)).slice(0, 25).map(p => {
      const row = p.value_status === 'linked' ? data.rows.get(p.value_ref) : null;
      return { id: p.id, name: p.name, family: data.families.get(p.family_id).name, fits: p.fits.join(''), value_per_m2_gfa: state.settings.programme?.[p.id]?.valuePerM2Gfa ?? (row ? row.value_per_m2_gfa.value : (p.value_status === 'zero' ? 0 : null)) }; }); } },
  { name: 'get_programme', description: 'Details for one programme id: value per m2 GFA with source and grade, hard cost lines, efficiency, code group, fits, notes.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, execute: ({ id }) => {
    const { p, row, o, lines } = programmeDefaults(String(id).toUpperCase()); if (!p) throw new Error('unknown programme id');
    return { id: p.id, name: p.name, family: data.families.get(p.family_id).name, fits: p.fits_text, code_groups: p.occupancy_group, value_status: p.value_status,
      value_row: row ? { id: row.id, name: row.name, earns_by: row.earns_by, value_per_m2_gfa: row.value_per_m2_gfa.value, source: srcText(row.value_per_m2_gfa) } : null,
      user_overrides: o, hard_cost_lines: lines.map(l => ({ category: l.altus_category, low_m2: l.low_m2, high_m2: l.high_m2, add_on: l.add_on })) }; } },
  { name: 'set_mix', description: 'Set the programme mix for every floor from from_level to to_level. mix is a list of {programme_id, share}; shares must add up to 1. Returns the new summary.', inputSchema: { type: 'object', properties: { from_level: { type: 'number' }, to_level: { type: 'number' }, mix: { type: 'array', items: { type: 'object', properties: { programme_id: { type: 'string' }, share: { type: 'number' } }, required: ['programme_id', 'share'] } } }, required: ['from_level', 'to_level', 'mix'] }, execute: ({ from_level, to_level, mix }) => {
    const lo = Number(from_level), hi = Number(to_level);
    const m = (Array.isArray(mix) ? mix : []).map(x => ({ programme_id: String(x?.programme_id ?? '').toUpperCase(), share: Number(x?.share) }));
    if (!m.length) throw new Error('mix is empty');
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('from_level and to_level must be numbers');
    for (const x of m) { if (!prog(x.programme_id)) throw new Error(`unknown programme ${x.programme_id}`); if (!Number.isFinite(x.share) || x.share < 0) throw new Error(`share of ${x.programme_id} must be a number of 0 or more`); }
    const s = m.reduce((a, x) => a + x.share, 0); if (Math.abs(s - 1) > 0.02) throw new Error(`shares add up to ${s}, not 1`);
    const fl = state.floors.filter(f => f.level >= lo && f.level <= hi); if (!fl.length) throw new Error('no floors in that range');
    pushHistory(); fl.forEach(f => { f.mix = m.map(x => ({ ...x, share: x.share / s })); }); state.sel = [lo, hi]; editMix = null; refresh();
    return { changed_floors: fl.length, ...summaryForAI() }; } },
  { name: 'set_assumption', description: 'Change one project assumption. name is one of: landPrice, landValueCurrentZoning, podiumTopFloor, neighbourRoofM, siteAreaM2, profitOnCost, softCost, financeRate, buildYears, supertallPremium, cacShare, publicRunningCostPerM2, childcareM2PerSpace, publicPayer (cross_subsidy|cac_endowment|ticketed_deck|city_or_partner), presaleMarket (weak|normal), hotelAsNonResidential (true|false). value null resets it.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, value: {} }, required: ['name'] }, execute: ({ name, value }) => {
    const ok = ['landPrice', 'landValueCurrentZoning', 'podiumTopFloor', 'neighbourRoofM', 'siteAreaM2', 'profitOnCost', 'softCost', 'financeRate', 'buildYears', 'supertallPremium', 'cacShare', 'publicRunningCostPerM2', 'childcareM2PerSpace', 'publicPayer', 'presaleMarket', 'hotelAsNonResidential'];
    if (!ok.includes(name)) throw new Error('not an assumption you can change here');
    checkSetting(name, value);   // throws a readable error for bad values
    setSetting(name, value); return summaryForAI(); } },
  { name: 'set_programme_value', description: 'Enter a user value for a programme id (for programmes marked user to supply, or to test your own figure): value_per_m2_gfa and/or hard_cost_per_m2 in C$. null clears it.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, value_per_m2_gfa: { type: ['number', 'null'] }, hard_cost_per_m2: { type: ['number', 'null'] } }, required: ['id'] }, execute: ({ id, value_per_m2_gfa, hard_cost_per_m2 }) => {
    const pid = String(id).toUpperCase(); if (!prog(pid)) throw new Error('unknown programme id');
    const vv = value_per_m2_gfa === undefined ? undefined : checkMoney(value_per_m2_gfa, 'value_per_m2_gfa');
    const hv = hard_cost_per_m2 === undefined ? undefined : checkMoney(hard_cost_per_m2, 'hard_cost_per_m2');
    pushHistory(); state.settings.programme = { ...(state.settings.programme || {}) }; const cur = { ...(state.settings.programme[pid] || {}) };
    if (vv !== undefined) { if (vv === null) delete cur.valuePerM2Gfa; else cur.valuePerM2Gfa = vv; }
    if (hv !== undefined) { if (hv === null) delete cur.hardCostPerM2; else cur.hardCostPerM2 = hv; }
    state.settings.programme[pid] = cur; refresh(); return summaryForAI(); } },
];
function renderAI() {
  const box = $('#tab-ai');
  if (box.dataset.ready) { return; }
  box.dataset.ready = '1';
  const msgs = h('div', { class: 'msgs', id: 'msgs', 'aria-live': 'polite' });
  const ta = h('textarea', { id: 'aiIn', rows: 3, placeholder: 'Ask about this scheme, or ask for a change: “Why does the office lose money?” “Swap floors 20–30 to market rental and compare.”', style: 'width:100%' });
  const send = h('button', { class: 'primary', id: 'aiSend' }, 'Ask');
  const stop = h('button', { id: 'aiStop', hidden: true }, 'Stop');
  const status = h('div', { class: 'note', id: 'aiStatus' });
  const chips = h('div', { class: 'chips' }, ['Explain the verdict in plain words', 'Which floors lose the most money, and why?', 'How could this scheme meet the 9.0 FSR non-residential rule?', 'What are the weakest numbers in the data?'].map(q => h('button', { onclick: () => { ta.value = q; ask(); } }, q)));
  const ask = async () => {
    const q = ta.value.trim(); if (!q || aiState === 'busy') return;
    if (!sample) { status.textContent = 'Ask AI works when this tool is opened on claude.ai.'; return; }
    msgs.append(h('div', { class: 'msg user' }, q)); ta.value = '';
    const bubble = h('div', { class: 'msg ai' }, 'Thinking…'); msgs.append(bubble); msgs.scrollTop = msgs.scrollHeight;
    chatTurns.push({ role: 'user', content: q });
    const turns = [{ role: 'user', content: RULES + '\n\nCurrent scheme summary (JSON):\n' + JSON.stringify(summaryForAI()) }, ...chatTurns.slice(-10)];
    if (turns[1]?.role === 'assistant') turns.splice(1, 1);
    aiState = 'busy'; send.disabled = true; stop.hidden = false; status.textContent = 'Each question uses your own Claude usage. The first one asks your permission.';
    chatCtl = new AbortController();
    const tools = AI_TOOLS.map(t => ({ ...t, execute: (input, ctx) => { msgs.insertBefore(h('div', { class: 'msg tool' }, `→ ${t.name}`), bubble); return t.execute(input || {}, ctx); } }));
    try {
      const { text, truncated } = await sample(turns, { signal: chatCtl.signal, tools, onText: ({ text }) => { bubble.textContent = text; msgs.scrollTop = msgs.scrollHeight; } });
      bubble.textContent = text; chatTurns.push({ role: 'assistant', content: text });
      status.textContent = truncated ? 'The answer was cut short. Ask for less at a time.' : '';
    } catch (e) {
      bubble.textContent = e.text || '';
      const copy = { not_granted: 'Ask AI is turned off for this page.', sampling_disabled: 'Claude is not available for this account.', rate_limited: 'Too many questions just now. Try again in a minute.', refused: 'Claude declined that question. Try asking it another way.', tools_unavailable: 'This view cannot let the assistant change the scheme.', session_expired: 'Please sign in again.', cancelled: '' }[e.code];
      status.textContent = copy ?? 'Something went wrong. Try again.';
      if (!bubble.textContent) bubble.remove();
      chatTurns.pop();
    } finally { aiState = 'idle'; send.disabled = false; stop.hidden = true; }
  };
  send.addEventListener('click', ask);
  stop.addEventListener('click', () => chatCtl?.abort());
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(); });
  box.replaceChildren(
    h('p', { class: 'note' }, 'Ask questions about the current scheme or ask for changes. The assistant reads the same numbers you see and can edit the floor mix and assumptions (Undo reverses any change). It uses your own Claude account.'),
    chips, h('div', { class: 'chat' }, msgs, ta, h('div', { class: 'toolbar' }, send, stop, h('span', { class: 'note' }, '⌘/Ctrl + Enter to send')), status));
  if (window.claude) window.claude.use('sample').then(s => { sample = s; if (!s) status.textContent = 'Ask AI is not available in this view.'; }).catch(() => { status.textContent = 'Ask AI is not available in this view.'; });
  else status.textContent = 'Ask AI works when this tool is opened on claude.ai. Everything else works here.';
}

// ---------- boot ----------
async function boot() {
  wireTips();
  try { await loadData(); } catch (e) { $('#tab-verdict').replaceChildren(h('p', { class: 'neg' }, 'Could not load the data pack: ' + e.message)); return; }
  const saved = load();
  if (saved) { state.brief = raw.briefs[saved.brief] ? saved.brief : 'vtc-2026'; const ms = saved.mapSite; if (ms && Number.isFinite(ms.x) && Number.isFinite(ms.y) && Math.abs(ms.x) < 1e5 && Math.abs(ms.y) < 1e5) state.mapSite = { x: ms.x, y: ms.y }; }
  buildData();
  if (saved) { try { state.floors = normaliseFloors(saved.floors); state.settings = saved.settings && typeof saved.settings === 'object' ? saved.settings : {}; evaluate(state.floors, data, state.settings); } catch (e) { state.floors = []; state.settings = {}; } }
  if (!state.floors.length) state.floors = sampleTower();
  $('#briefSel').value = state.brief;
  $('#briefSel').addEventListener('change', e => { pushHistory(); state.brief = e.target.value; buildData(); refresh(); });
  $('#undoBtn').addEventListener('click', undo);
  $('#themeBtn').addEventListener('click', () => { const r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; if (activeTab === 'map') renderMap(); });
  $('#section').addEventListener('click', onSectionClick);
  for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));
  $('#genBtn').addEventListener('click', () => { pushHistory(); state.floors = sampleTower({ height: +$('#gHeight').value, podiumFloors: +$('#gPodium').value, podiumPlate: +$('#gPodiumPlate').value, towerPlate: +$('#gTowerPlate').value, topPlate: +$('#gTopPlate').value, belowGrade: +$('#gBelow').value }); state.sel = null; editMix = null; refresh(); });
  $('#fileIn').addEventListener('change', e => importFile(e.target.files[0]));
  $('#tmplBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(TEMPLATE); toast('CSV template copied.'); } catch (e) { toast('Copy failed; the columns are listed below the buttons.'); } });
  refresh();
}
boot();
