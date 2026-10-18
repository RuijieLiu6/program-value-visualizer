// Program Value Visualizer — page script. All maths lives in core/econ_core.js.
import { drawIcon, SPECS } from './icons/icon_specs.js';
import { wordStackLayout, wordStackSVG, inkOf, FONT_STACK } from '../core/wordstack.js';
import { readPrompt, normaliseDiagramRead, floorsFromBands } from '../core/diagram_read.js';
import { optimiseMix, optimiserDefaults } from '../core/optimiser.js';
import { applyPreset, applyScenario, scenarioItems, scenarioLabel, presetStrip } from '../core/precedents.js';
import { moneySteps, moneyStackHTML, MONEY_STACK_CSS } from '../core/money_steps.js';
import { sym, trafficLight } from './learn/symbols.js';
import { renderMoneyStory } from './learn/money_story.js';
import { PRIORITIES, PLATES, planningGuide, stackToFloors, starterStack, explainStack } from '../core/planner.js';
import { parseBasemap, neighbourRoofs, insideBuilding, toLatLon } from '../core/basemap.js';
import { TYPICAL_BASES, indexData, evaluate, sensitivity, sampleTower, defaultSettings, recomputeValue, sourceDates, childcareHardRate, LABEL } from '../core/econ_core.js';

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
// replaceChildren prints null/false as text; drop empty children first
const put = (el, ...kids) => el.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const M = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${x < 0 ? '−' : ''}C$${(Math.abs(x) / 1e6).toFixed(d)} M`);
const N = x => (x == null || !Number.isFinite(x) ? '—' : Math.round(x).toLocaleString('en-CA'));
const pct = (x, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const VERDICT = { works: 'Works', marginal: 'Marginal', doesnt_work: "Doesn't work", needs_land: 'Land price needed', incomplete: 'Incomplete' };

let raw = null, data = null, result = null, sens = null;
let state = { floors: [], settings: {}, brief: 'vtc-2026', sel: null, mapSite: null, scenario: null, precedent: null };
const history = [];
let activeTab = 'verdict', pickFamily = null, pickProgramme = null, editMix = null;

// ---------- storage (per-viewer convenience only) ----------
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ floors: state.floors, settings: state.settings, brief: state.brief, mapSite: state.mapSite, scenario: state.scenario, precedent: state.precedent })); } catch (e) { /* storage unavailable */ } };
const load = () => { try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (s && Array.isArray(s.floors) && s.floors.length) return s; } catch (e) { /* ignore */ } return null; };
function pushHistory() { history.push(JSON.stringify({ floors: state.floors, settings: state.settings, brief: state.brief, scenario: state.scenario, precedent: state.precedent })); if (history.length > 40) history.shift(); $('#undoBtn').disabled = false; }
function undo() { const s = history.pop(); if (!s) return; const o = JSON.parse(s); state.floors = o.floors; state.settings = o.settings; state.scenario = o.scenario ?? null; state.precedent = o.precedent ?? null; if (o.brief && o.brief !== state.brief) { state.brief = o.brief; buildData(); $('#briefSel').value = o.brief; } editMix = null; $('#undoBtn').disabled = !history.length; refresh(); }

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
    out.push({ level, elevation_m: elev, height_m: height, area_m2: area, area_basis: f.area_basis === 'net' ? 'net' : 'gross', mix, ...(Array.isArray(f.tags) && f.tags.includes('seam') ? { tags: ['seam'] } : {}), ...(f.locked === true ? { locked: true } : {}) });
  });
  return out;
}
// Ranges for settings typed by people or the assistant: [min, max]
const RANGES = { landPrice: [0, 5e9], landValueCurrentZoning: [0, 5e9], podiumTopFloor: [0, 40], neighbourRoofM: [0, 400], siteAreaM2: [100, 200000], minNonresFsr: [0, 40],
  profitOnCost: [0, 0.4], softCost: [0, 0.6], financeRate: [0, 0.2], buildYears: [1, 12], drawFactor: [0, 1], supertallPremium: [0, 0.6], supertallThresholdM: [0, 600], cacShare: [0, 1],
  publicRunningCostPerM2: [0, 2000], landFsr: [0, 30], landRatePerM2: [0, 50000], landPremium: [0, 1], childcareM2PerSpace: [5, 60], officeTenantAllowance: [0, 5000], officeLeasingCost: [0, 0.5], hotelFfePerKey: [0, 500000] };
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
  const precedents = await get('catalogue/precedents.json').catch(() => ({ presets: [] }));
  raw = { families, programmes, values, costs, charges, assumptions, codeRules, sources, precedents, briefs: { 'vtc-2026': vtc, none } };
}
function buildData() { data = indexData({ ...raw, brief: raw.briefs[state.brief] }); }
/** The user's settings with the active scenario overlaid (the overlay is labelled everywhere it shows). */
const effSettings = () => (state.scenario ? applyScenario(state.settings, scenarioItems(state.scenario, data, raw.precedents)) : state.settings);
const settingsFull = () => ({ ...defaultSettings(data), ...effSettings() });
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
function recompute() { result = evaluate(state.floors, data, effSettings()); sens = null; }
function refresh() { recompute(); save(); renderTop(); renderSection(); renderTab(); }
function renderTop() {
  const v = result.verdict, el = $('#topVerdict');
  el.className = `pill ${v}`; el.textContent = VERDICT[v];
  const label = scenarioLabel(state.scenario, data, raw.precedents), chip = $('#scenarioChip');
  chip.hidden = !label;
  if (label) put(chip, `Scenario: ${label}`, h('button', { 'aria-label': 'Turn the scenario off', title: 'Back to the 2026 defaults', onclick: () => setScenario(null) }, '×'));
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
    s += `<g class="floor" data-level="${esc(f.level)}" data-tip="${esc(tip)}"><rect class="slab" x="${x0.toFixed(2)}" y="${y0.toFixed(2)}" width="${w.toFixed(2)}" height="${hh.toFixed(2)}" fill="var(--line-2)"/>${segs}${f.locked ? `<rect x="${(x0 + 0.6).toFixed(2)}" y="${(y0 + 0.6).toFixed(2)}" width="${Math.max(0, w - 1.2).toFixed(2)}" height="${Math.max(0, hh - 1.2).toFixed(2)}" fill="none" stroke="var(--ink)" stroke-width="0.9" stroke-dasharray="3 2"><title>locked</title></rect>` : ''}${bar}<rect x="20" y="${y0.toFixed(2)}" width="${W - 26}" height="${hh.toFixed(2)}" fill="transparent"/>${label}</g>`;
  }
  if (sel) {
    const inSel = floors.filter(f => f.level >= sel[0] && f.level <= sel[1]);
    if (inSel.length) { const yt = y(Math.max(...inSel.map(f => f.elevation_m + f.height_m))), yb = y(Math.min(...inSel.map(f => f.elevation_m))); s += `<rect class="sel" x="22" y="${yt - 1}" width="${W - 30}" height="${yb - yt + 2}" rx="2"/>`; }
  }
  svg.setAttribute('viewBox', `0 0 ${W} ${H.toFixed(0)}`);
  svg.innerHTML = s;
  const fams = [...new Set(state.floors.flatMap(f => f.mix.map(m => prog(m.programme_id)?.family_id)))].filter(Boolean);
  put($('#legend'), ...fams.map(id => h('span', {}, h('i', { style: `background:${famColour(id)}` }), data.families.get(id).name)),
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

/** A label with one of the money symbols in front (the same symbols as the Tower Money Book). */
const withSym = (name, text, size = 16) => [h('span', { class: 'ksym', 'aria-hidden': 'true', html: sym(name, size) }), text];
function kpi(k, v, cls = '', tip = null, big = false) { return h('div', { class: `kpi${big ? ' big' : ''}`, 'data-tip': tip }, h('span', { class: 'k' }, k), h('span', { class: `v ${cls}` }, v)); }
const signCls = x => (x < 0 ? 'neg' : x > 0 ? 'pos' : '');

const TYPICAL_TIP = 'A typical estimate is a starting number so you do not need to know prices. Grade C: check it before relying on it, or type your own.';
const typicalBadge = (basis = 'researched') => h('span', { class: `typ ${basis}`, tabindex: '0', 'data-tip': (BASIS_TIP[basis] || '') + TYPICAL_TIP }, basis === 'analogy' ? 'typical · analogy' : basis === 'researched' ? 'typical · researched' : 'typical estimate');
const rowOf = id => { const p = prog(id); return p?.value_status === 'linked' ? data.rows.get(p.value_ref) : null; };
const isTypical = id => TYPICAL_BASES.has(rowOf(id)?.value_basis);
const BASIS_TIP = { researched: 'Researched: built from a 2025–26 Vancouver, BC or Canadian figure found by web search, with stated assumptions. ', analogy: 'Analogy: no usable figure was found, so it borrows from a similar use. ' };
function numField(id, label, value, { step = 'any', min, max, onchange, src, unit, placeholder, badge } = {}) {
  const inp = h('input', { id, type: 'number', step, min, max, value: value ?? '', placeholder });
  inp.addEventListener('change', () => { if (inp.value === '') return onchange(null); let v = Number(inp.value); if (!Number.isFinite(v)) { toast(`${label}: enter a number`); return; } if (min != null && v < Number(min)) v = Number(min); if (max != null && v > Number(max)) v = Number(max); inp.value = v; onchange(v); });
  return h('div', { class: 'field' }, h('label', { for: id }, label, unit ? h('span', {}, `(${unit})`) : null, src ? gradeTag(src.grade) : null, src ? srcTag(src) : null, badge || null), inp);
}
function setSetting(k, v) { let c; try { c = checkSetting(k, v); } catch (e) { toast(e.message); renderTab(); return false; } pushHistory(); if (c === null) delete state.settings[k]; else state.settings[k] = c; refresh(); return true; }

// ---------- land: typed values or the default estimate ----------
function landBlock(r, S, A) {
  const L = r.land, E = A.land.estimate || {};
  const round = x => (x == null ? null : Math.round(x / 1e5) * 1e5);
  const money = x => (x == null ? '' : Math.round(x).toLocaleString('en-CA'));
  // "407,500,000", "$407.5M", "407.5 m" or "2.1b" -> dollars; '' -> null (back to the estimate)
  const parseMoney = txt => {
    const t = String(txt).trim().toLowerCase().replace(/[$,\s]|c\$/g, '');
    if (!t) return null;
    const m = t.match(/^(\d+(?:\.\d+)?)(k|m|b)?$/);
    if (!m) throw new Error('Land values: enter a number such as 407,500,000 or 407.5M');
    return Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1);
  };
  const canEstimate = L.siteAreaM2 > 0 && S.landFsr > 0 && S.landRatePerM2 > 0;
  const czEst = canEstimate ? L.currentZoningEstimate : null;
  const priceEst = L.currentZoningValue != null ? L.currentZoningValue * (1 + num0(S.landPremium)) : null;
  const siteTxt = L.siteAreaM2 > 0 ? `${L.footprintProxy ? 'largest ground-floor plate' : 'site'} ${N(L.siteAreaM2)} m²` : '';
  const field = (id, key, label, est, src, how) => {
    const typed = S[key] != null;
    const inp = h('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'money', value: money(typed ? S[key] : round(est)), placeholder: canEstimate ? '' : 'enter a site area to estimate' });
    inp.addEventListener('change', () => {
      let v; try { v = parseMoney(inp.value); } catch (e) { toast(e.message); inp.value = money(typed ? S[key] : round(est)); return; }
      if (v != null && est != null && !typed && Math.abs(v - round(est)) < 1) return;   // unchanged estimate: keep it an estimate
      setSetting(key, v);
    });
    const chip = typed ? h('span', { class: 'est yours', tabindex: '0', 'data-tip': 'You typed this value. “Enter estimated value” brings the estimate back.' }, 'Your value')
      : est != null ? h('span', { class: 'est', tabindex: '0', 'data-tip': 'Estimated by the tool. Type your own number to override it.' }, 'Estimated') : null;
    const btn = est == null ? null : typed
      ? h('button', { class: 'use-est', onclick: () => setSetting(key, null) }, 'Enter estimated value')
      : h('button', { class: 'use-est', disabled: true, 'aria-label': 'The estimated value is in use' }, 'Estimated ✓');
    return h('div', { class: 'field land-field' },
      h('label', { for: id }, label, h('span', {}, '(C$)'), src ? gradeTag(src.grade) : null, src ? srcTag(src) : null, chip, btn),
      inp,
      h('p', { class: 'note land-arith' }, est == null ? 'No estimate: enter a site area in Assumptions (or add a level-1 floor).'
        : `${typed ? 'Estimate would be' : 'Estimate'}: ${how} = ${M(est)}`));
  };
  return h('div', { class: 'land' },
    h('h4', { style: 'margin:0' }, 'Land'),
    h('div', { class: 'grid2' },
      field('landPrice', 'landPrice', 'Land price', priceEst, A.land.price, `current-zoning value × (1 + ${Math.round(num0(S.landPremium) * 100)}% premium)`),
      field('landZoning', 'landValueCurrentZoning', 'Land value under current zoning (for CAC)', czEst, A.land.value_under_current_zoning, `${siteTxt} × FSR ${S.landFsr} × C$${N(S.landRatePerM2)}/m²`)),
    L.footprintProxy ? h('p', { class: 'note' }, h('b', {}, 'No site area is set, so the largest ground-floor plate stands in for it: enter the site area in Assumptions.')) : null,
    h('div', { class: 'grid3' },
      numField('landFsr', 'Current-zoning FSR', S.landFsr, { step: 0.1, min: 0, max: 30, src: E.current_zoning_fsr, onchange: v => setSetting('landFsr', v) }),
      numField('landRate', 'Land rate per buildable m²', S.landRatePerM2, { step: 50, min: 0, unit: 'C$/m²', src: E.rate_per_buildable_m2, onchange: v => setSetting('landRatePerM2', v) }),
      numField('landPrem', 'Purchase premium', S.landPremium, { step: 0.01, min: 0, max: 1, unit: 'share', src: E.purchase_premium, onchange: v => setSetting('landPremium', v) })),
    h('p', { class: 'note' }, 'Order of magnitude only: an appraiser would value the actual site. Hover “source” for where each default comes from.'));
}
const num0 = x => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

// ---------- Verdict tab ----------
function renderVerdict() {
  const r = result, t = r.totals, S = settingsFull(), A = data.assumptions;
  const el = $('#tab-verdict');
  const optBtn = h('div', { class: 'toolbar opt-bar' }, h('button', { class: 'primary', onclick: () => openOptimiser() }, 'Find a mix that works'), h('button', { onclick: openPresets }, 'Presets'), h('span', { class: 'note' }, 'search uses for your form, or start from a built tower'));
  const verdict = h('div', { class: `verdict ${r.verdict}` },
    h('span', { class: 'label-strip' }, 'Verdict'), h('h3', { class: 'v-head' }, h('span', { 'aria-hidden': 'true', html: trafficLight(r.verdict, 30) }), VERDICT[r.verdict]),
    h('ul', {}, r.reasons.map(x => h('li', {}, x)), r.marketDependent ? h('li', {}, 'Market-dependent: the scheme relies on condo presales.') : null),
    h('span', { class: 'note' }, 'Works = residual land value covers the land price at the target profit, presales are reachable and every public floor has a payer. Marginal = within 10% of the land price, or 10–15% profit, or relies on a weak presale market. Land price needed = enter a land price to compare.'));
  const land = landBlock(r, S, A);
  const stack = h('div', { class: 'money-stack' },
    h('div', { class: 'ms-head' }, h('h4', { style: 'margin:0' }, 'Where the money goes'), h('button', { class: 'linkish', onclick: () => openHelp('money', 6) }, 'How to read this')),
    h('div', { html: moneyStackHTML(moneySteps(r), { fmt: x => `C$${Math.round(x / 1e6).toLocaleString('en-CA')} M`, sym: n => sym(n, 22) }) }));
  const kpis = h('div', { class: 'kpis' },
    kpi(withSym('coin', 'Gross development value'), M(t.gdv), '', 'Sum of floor values after selling and leasing costs'),
    kpi(withSym('brick', 'Total cost (before profit)'), M(t.cost), '', `Hard ${M(t.hard)} · soft ${M(t.soft)} · finance ${M(t.finance)} · City charges ${M(t.charges)}`),
    kpi(withSym('piggy', 'Developer profit'), M(t.profit), '', `${pct(S.profitOnCost, 0)} of total cost`),
    kpi(withSym('public', 'Public running cost (capitalised)'), M(t.publicDeduction), '', 'Subtracted from value unless the City or a partner pays'),
    kpi('Residual land value before CAC', M(t.rlvBeforeCac), signCls(t.rlvBeforeCac)),
    kpi(withSym('city', 'CAC (share of land lift)'), M(t.cac), '', r.employmentOnly ? 'Zero: 100% employment rezoning' : `${pct(S.cacShare, 0)} of the lift above the current-zoning land value`),
    kpi(withSym('land', 'Residual land value after CAC'), M(t.rlvAfterCac), signCls(t.rlvAfterCac), 'What is left to pay for the land', true),
    kpi(t.landEstimated ? 'Land price (estimated)' : 'Land price', t.landPrice == null ? 'not set' : M(t.landPrice), '', t.landEstimated ? 'Estimate: site area × current-zoning FSR × land rate. Type a land price above to override.' : null));
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
      h('td', {}, h('span', { class: 'nm', style: 'display:inline-flex;gap:8px;align-items:center' }, familyIcon(k), data.families.get(k)?.name)),
      h('td', { class: 'num' }, N(v.gfa)), h('td', { class: 'num' }, M(v.value)), h('td', { class: 'num' }, M(v.cost)), h('td', { class: `num ${signCls(v.net)}` }, M(v.net)))))));
  put(el, optBtn, scenarioBanner(), verdict, relyPanel(), stack, land, kpis, h('h4', { style: 'margin:0' }, 'Brief check'), fsr, h('p', { class: 'note' }, f.note), h('h4', { style: 'margin:0' }, 'Where value is made and lost'), famTbl, rulesBlock(), warningsBlock());
}
/** A family's icon is its first programme's icon; a colour swatch if it has none. */
function familyIcon(famId) { const first = [...data.programmes.values()].find(p => p.family_id === famId); return first && iconSvg(first.id) ? iconEl(first.id, 26) : h('i', { class: 'sw', style: `background:${famColour(famId)}` }); }
function rulesBlock() {
  const rs = result.rules, order = { block: 0, error: 1, warning: 2, info: 3 };
  const sorted = [...rs].sort((a, b) => order[a.severity] - order[b.severity]);
  const box = h('div', { class: 'rules' });
  const show = n => put(box, ...sorted.slice(0, n).map(r => h('div', { class: `rule ${r.severity}` }, h('b', {}, r.severity), h('span', {}, r.text))),
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
    put(el, h('p', { class: 'note' }, 'Select one floor or a range in the section (shift-click), then set which programmes share the plate.'),
      h('p', { class: 'note' }, 'Not sure where to start? ', h('button', { class: 'linkish', onclick: () => { showTab('ai'); document.getElementById('concept')?.scrollIntoView({ block: 'start' }); } }, 'Start from your concept'), ' (Ask AI tab) arranges a starting stack and explains it.'), floorTable());
    return;
  }
  if (!editMix) editMix = fl[0].mix.map(m => ({ ...m }));
  const sum = editMix.reduce((s, m) => s + m.share, 0);
  const mixed = fl.some(f => JSON.stringify(f.mix) !== JSON.stringify(fl[0].mix));
  const head = h('div', { class: 'toolbar' }, h('strong', {}, `L${state.sel[0]}${state.sel[1] !== state.sel[0] ? '–L' + state.sel[1] : ''} · ${fl.length} floor${fl.length > 1 ? 's' : ''} · ${N(fl.reduce((s, f) => s + f.area_m2, 0))} m²`),
    h('button', { onclick: () => { state.sel = null; editMix = null; renderSection(); renderFloors(); } }, 'Clear selection'),
    (() => { const all = fl.every(f => f.locked); return h('button', { 'aria-pressed': String(all), title: 'Locked floors are kept as they are by “Find a mix that works”', onclick: () => { pushHistory(); fl.forEach(f => { if (all) delete f.locked; else f.locked = true; }); refresh(); } }, all ? 'Unlock these floors' : 'Lock these floors'); })());
  const rows = h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, editMix.map((m, k) => {
    const p = prog(m.programme_id);
    const inp = h('input', { id: `share-${k}`, type: 'number', min: 0, max: 100, step: 1, value: Math.round(m.share * 1000) / 10, 'aria-label': `Share of ${p?.name}` });
    inp.addEventListener('change', () => { editMix[k].share = Math.max(0, Number(inp.value) || 0) / 100; renderFloors(); });
    return h('div', { class: 'mix-row' }, h('div', { class: 'nm' }, iconEl(m.programme_id, 28), h('span', { class: 'mix-name', title: `${p?.name} (${m.programme_id})` }, p?.name), tenureTag(m.programme_id), idTag(m.programme_id), isTypical(m.programme_id) && !state.settings.programme?.[m.programme_id]?.valuePerM2Gfa ? h('span', { class: `typ small ${rowOf(m.programme_id).value_basis}`, 'data-tip': (BASIS_TIP[rowOf(m.programme_id).value_basis] || '') + TYPICAL_TIP }, rowOf(m.programme_id).value_basis) : null), inp,
      h('button', { 'aria-label': 'Remove', onclick: () => { editMix.splice(k, 1); renderFloors(); } }, '×'));
  }));
  const sumNote = h('div', { class: Math.abs(sum - 1) < 0.005 ? 'note' : 'neg' }, `Shares add up to ${(sum * 100).toFixed(1)}%${Math.abs(sum - 1) < 0.005 ? '.' : ' — must be 100%.'}`);
  const actions = h('div', { class: 'toolbar' },
    h('button', { onclick: () => { const s = editMix.reduce((a, m) => a + m.share, 0); if (s > 0) editMix.forEach(m => { m.share = m.share / s; }); renderFloors(); } }, 'Scale to 100%'),
    h('button', { class: 'primary', disabled: Math.abs(sum - 1) > 0.005 || !editMix.length, onclick: applyMix }, `Apply to ${fl.length} floor${fl.length > 1 ? 's' : ''}`),
    h('button', { onclick: () => { editMix = fl[0].mix.map(m => ({ ...m })); renderFloors(); } }, 'Reset'));
  // geometry
  const geo = h('div', { class: 'grid2' },
    numField('fArea', 'Plate area each floor', fl.length === 1 ? fl[0].area_m2 : null, { step: 10, min: 10, unit: 'm²', placeholder: 'mixed', onchange: v => { if (v) { pushHistory(); fl.forEach(f => { f.area_m2 = v; }); refresh(); } } }),
    h('div', { class: 'field' }, h('label', { for: 'fBasis' }, 'Area basis'), (() => { const s = h('select', { id: 'fBasis' }, h('option', { value: 'gross', selected: fl[0].area_basis !== 'net' }, 'gross (core included)'), h('option', { value: 'net', selected: fl[0].area_basis === 'net' }, 'net (core removed)')); s.addEventListener('change', () => { pushHistory(); fl.forEach(f => { f.area_basis = s.value; }); refresh(); }); return s; })()));
  put(el, head, mixed ? h('p', { class: 'note' }, `These floors have different mixes. Showing L${fl[0].level}; Apply replaces the mix on every selected floor.`) : null, h('h4', { style: 'margin:0' }, 'Programme mix'), rows, sumNote, programmePicker(), actions,
    pickProgramme ? programmeCard(pickProgramme) : (editMix[0] ? programmeCard(editMix[0].programme_id) : null),
    h('details', {}, h('summary', {}, 'Floor size and area basis'), geo), floorTable());
}
// ---------- programme icons and the visual picker ----------
const iconCache = new Map();
/** SVG markup for one programme's icon, drawn once and cached. Decorative: the name is always shown next to it. */
function iconSvg(id) {
  if (!iconCache.has(id)) {
    let s = '';
    try { if (SPECS[id]) s = drawIcon(id, famColour(prog(id)?.family_id), 100).replace(' width="100" height="100"', ' width="100%" height="100%"').replace(' role="img"', ' aria-hidden="true" focusable="false"'); } catch (e) { s = ''; }
    iconCache.set(id, s);
  }
  return iconCache.get(id);
}
const iconEl = (id, px) => h('span', { class: 'picon', 'aria-hidden': 'true', style: `width:${px}px;height:${px}px`, html: iconSvg(id) });
/** How a programme gets its value: sourced, typical estimate, or no income. */
function valueKind(id) {
  const p = prog(id), row = p?.value_status === 'linked' ? data.rows.get(p.value_ref) : null;
  if (p?.value_status === 'zero' || row?.value_per_m2_gfa?.value === 0) return 'none';
  return TYPICAL_BASES.has(row?.value_basis) ? row.value_basis : 'sourced';
}
const KIND_LABEL = { sourced: 'sourced', researched: 'researched', analogy: 'analogy', none: 'no income' };
/** How the owner earns from a programme, as a plain tag: sold once, rented out, run as a business, given to the public, or building support. */
const TENURE = { sell: ['sale', 'For sale'], lease: ['rent', 'For rent'], operate: ['operate', 'Operated'], public: ['public', 'Public'], support: ['support', 'Support'] };
function tenureOf(id) {
  const p = prog(id), row = p?.value_status === 'linked' ? data.rows.get(p.value_ref) : null;
  const t = TENURE[row?.earns_by ?? p?.earns_by] ?? TENURE.public;
  return { key: t[0], label: t[1] };
}
const tenureTag = id => { const t = tenureOf(id); return h('span', { class: `tenure ${t.key}`, title: `How it earns: ${t.label.toLowerCase()}` }, h('span', { class: 'tsym', 'aria-hidden': 'true', html: sym(t.key, 12) }), t.label); };
const idTag = id => h('span', { class: 'pid', title: 'Programme code' }, id);
let pickerOpen = false, pickerQuery = '';
function addProgramme(id) {
  pickProgramme = id;
  const left = Math.max(0, 1 - editMix.reduce((s, m) => s + m.share, 0));
  if (!editMix.some(m => m.programme_id === id)) editMix.push({ programme_id: id, share: left || 0 });
  pickerOpen = false; renderFloors();
  document.querySelector('#pickerBtn')?.focus();
}
function programmePicker() {
  const cur = pickProgramme ? prog(pickProgramme) : null;
  const trigger = h('button', { id: 'pickerBtn', class: 'picker-btn', 'aria-haspopup': 'true', 'aria-expanded': String(pickerOpen), 'aria-controls': 'pickerPanel',
    onclick: () => { pickerOpen = !pickerOpen; renderFloors(); if (pickerOpen) document.querySelector('#pickerSearch')?.focus(); } },
    cur ? iconEl(cur.id, 28) : h('span', { class: 'picon empty', 'aria-hidden': 'true' }, '+'),
    h('span', { class: 'pb-text' }, cur ? h('b', {}, cur.name) : 'Add a programme…', cur ? ' ' : null, cur ? tenureTag(cur.id) : null, cur ? ' ' : null, cur ? idTag(cur.id) : null), h('span', { class: 'caret', 'aria-hidden': 'true' }, pickerOpen ? '▴' : '▾'));
  if (!pickerOpen) return h('div', { class: 'picker' }, trigger);

  const tiles = [...data.programmes.values()].map(p => {
    const kind = valueKind(p.id), fam = data.families.get(p.family_id);
    const t = h('button', { class: 'ptile', role: 'option', tabindex: '-1', 'data-id': p.id, 'data-fam': p.family_id, 'aria-selected': String(p.id === pickProgramme),
      'aria-label': `${p.name}, ${tenureOf(p.id).label.toLowerCase()}, ${fam?.name}, value ${KIND_LABEL[kind]}, code ${p.id}`, title: `${p.name} (${p.id})`,
      'data-search': `${p.id} ${p.name} ${fam?.name || ''} ${(p.users || []).join(' ')}`.toLowerCase(), onclick: () => addProgramme(p.id) },
      iconEl(p.id, 64), h('span', { class: 'pt-name' }, p.name, p.unconventional ? ' ★' : ''),
      h('span', { class: 'pt-tags' }, tenureTag(p.id), h('span', { class: `pt-kind ${kind}` }, KIND_LABEL[kind])), h('span', { class: 'pt-id' }, p.id));
    return t;
  });
  const grid = h('div', { class: 'pgrid', role: 'listbox', 'aria-label': 'Programmes' }, tiles);
  const empty = h('p', { class: 'note', hidden: true }, 'No programme matches. Try another word or family.');
  const visible = () => tiles.filter(t => !t.hidden);
  const setRoving = el => { for (const t of tiles) t.tabIndex = -1; if (el) el.tabIndex = 0; };
  const filter = () => {
    const q = pickerQuery.trim().toLowerCase();
    for (const t of tiles) t.hidden = !((!pickFamily || t.dataset.fam === pickFamily) && (!q || q.split(/\s+/).every(w => t.dataset.search.includes(w))));
    const v = visible(); empty.hidden = v.length > 0;
    setRoving(v.find(t => t.dataset.id === pickProgramme) || v[0]);
    for (const c of chips.querySelectorAll('button')) c.setAttribute('aria-pressed', String((c.dataset.fam || null) === pickFamily));
  };
  const chip = (famId, label, colour) => h('button', { class: 'fchip', 'data-fam': famId || '', 'aria-pressed': 'false', style: colour ? `--fc:${colour}` : null,
    onclick: e => { pickFamily = famId; filter(); e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } }, colour ? h('i', { class: 'sw', style: `background:${colour}` }) : null, label);
  const chips = h('div', { class: 'fchips', role: 'group', 'aria-label': 'Activity family' }, chip(null, 'All'), [...data.families.values()].map(f => chip(f.family_id, f.name, f.colour)));
  const search = h('input', { id: 'pickerSearch', type: 'search', placeholder: 'Search: gym, hotel, school…', value: pickerQuery, 'aria-label': 'Search programmes', autocomplete: 'off' });
  search.addEventListener('input', () => { pickerQuery = search.value; filter(); });
  search.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || (e.key === 'Enter' && visible().length)) { e.preventDefault(); if (e.key === 'Enter' && visible().length === 1) addProgramme(visible()[0].dataset.id); else visible()[0]?.focus(); } });
  grid.addEventListener('keydown', e => {
    const v = visible(), i = v.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = Math.max(1, v.filter(t => t.offsetTop === v[0].offsetTop).length);
    const go = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: v.length - 1 }[e.key];
    if (go != null) { e.preventDefault(); if (e.key === 'ArrowUp' && i - cols < 0) { search.focus(); return; } const t = v[Math.max(0, Math.min(v.length - 1, go))]; setRoving(t); t.focus(); t.scrollIntoView({ block: 'nearest' }); }
  });
  const panel = h('div', { id: 'pickerPanel', class: 'picker-panel', role: 'dialog', 'aria-label': 'Choose a programme' },
    h('div', { class: 'pp-head' }, search, h('button', { 'aria-label': 'Close the programme list', onclick: () => { pickerOpen = false; renderFloors(); document.querySelector('#pickerBtn')?.focus(); } }, '×')),
    chips, h('div', { class: 'pp-legend note' }, h('span', { class: 'pt-kind sourced' }, 'sourced'), ' pack figure · ', h('span', { class: 'pt-kind researched' }, 'researched'), ' typical, from a 2025–26 figure · ', h('span', { class: 'pt-kind analogy' }, 'analogy'), ' typical, from a similar use · ', h('span', { class: 'pt-kind none' }, 'no income'), ' cost only'),
    grid, empty);
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); pickerOpen = false; renderFloors(); document.querySelector('#pickerBtn')?.focus(); } });
  filter();
  return h('div', { class: 'picker' }, trigger, panel);
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
  return h('div', { class: 'panel' }, h('div', { class: 'ph' }, iconEl(p.id, 64), h('h2', {}, p.name), tenureTag(p.id), idTag(p.id), p.unconventional ? h('span', { class: 'grade' }, '★ unconventional') : null),
    h('div', { class: 'pb' },
      h('div', { class: 'note' }, `${fam.name}${fam.intensity ? ' · intensity ' + fam.intensity : ''} · fits ${p.fits.join(', ') || p.fits_text} · code group ${(p.occupancy_group || []).join(', ') || '—'} · users ${(p.users || []).join(', ')}`),
      row ? h('div', { class: 'note' }, `Value row ${row.id}: ${row.name} · earns by ${row.earns_by} · method ${row.method}`) : h('div', { class: 'note' }, p.value_status === 'zero' ? 'Earns nothing: cost only.' : 'No sourced value yet: enter your own below.'),
      h('div', { class: 'grid2' },
        numField(`pv-${id}`, 'Value per m² GFA (before height premium; office before leasing costs)', o.valuePerM2Gfa ?? (row ? row.value_per_m2_gfa.value : (p.value_status === 'zero' ? 0 : null)), { step: 100, unit: 'C$/m²', placeholder: 'user to supply', src: row?.value_per_m2_gfa, badge: TYPICAL_BASES.has(row?.value_basis) && o.valuePerM2Gfa == null ? typicalBadge(row.value_basis) : null, onchange: v => setO('valuePerM2Gfa', v) }),
        numField(`pc-${id}`, 'Hard cost per m² (before tall premium)', o.hardCostPerM2 ?? (baseCost || null), { step: 50, unit: 'C$/m²', placeholder: 'floor average', src: costSrc, badge: lines.some(l => l.value_basis === 'typical') && o.hardCostPerM2 == null ? typicalBadge('cost') : null, onchange: v => setO('hardCostPerM2', v) }),
        numField(`pe-${id}`, 'Efficiency (net ÷ gross)', o.efficiency ?? null, { step: 0.01, min: 0.3, max: 1, placeholder: 'from pack', onchange: v => setO('efficiency', v) })),
      (TYPICAL_BASES.has(row?.value_basis) || row?.value_basis === 'no_income') && o.valuePerM2Gfa == null ? h('p', { class: 'note typ-note' }, `${row.value_per_m2_gfa.note} Range ${N(row.value_per_m2_gfa.range?.[0])}–${N(row.value_per_m2_gfa.range?.[1])} C$/m². Type your own number to replace it.`) : null,
      driftNote,
      o && Object.keys(o).length ? h('button', { onclick: () => { pushHistory(); delete state.settings.programme[id]; refresh(); } }, 'Use pack defaults') : null,
      h('p', { class: 'note' }, 'A hard cost you type here replaces the pack rate including the tall-building premium. Leave a field empty to use the pack.')));
}
function floorTable() {
  const rows = [...result.floors].sort((a, b) => b.level - a.level);
  return h('details', { open: !state.sel }, h('summary', {}, `All floors (${rows.length})`), h('div', { class: 'tbl', style: 'max-height:420px;overflow:auto' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Level'), h('th', { class: 'num' }, 'Elev. m'), h('th', { class: 'num' }, 'Area m²'), h('th', {}, 'Mix'), h('th', { class: 'num' }, 'Value'), h('th', { class: 'num' }, 'Cost+profit'), h('th', { class: 'num' }, 'Net'))),
    h('tbody', {}, rows.map(f => h('tr', { style: 'cursor:pointer', onclick: () => { state.sel = [f.level, f.level]; editMix = null; renderSection(); renderFloors(); } },
      h('td', {}, `L${f.level}`, state.floors.find(x => x.level === f.level)?.locked ? h('span', { class: 'lock-tag', title: 'Locked' }, ' locked') : null), h('td', { class: 'num' }, f.elevation_m.toFixed(1)), h('td', { class: 'num' }, N(f.area_m2)),
      h('td', { title: f.items.map(i => `${i.programme_id} ${Math.round(i.share * 100)}%`).join(' · ') }, f.items.map(i => `${Math.round(i.share * 100)}% ${i.name}`).join(' · ')),
      h('td', { class: 'num' }, M(f.value)), h('td', { class: 'num' }, M(f.cost + f.profit)), h('td', { class: `num ${signCls(f.net)}` }, M(f.net))))))));
}

// ---------- City ledger tab ----------
function renderCity() {
  const r = result, L = r.ledger, t = r.totals, S = settingsFull(), A = data.assumptions, C = data.charges;
  const line = (k, v, tip, s = 'city') => h('tr', { 'data-tip': tip }, h('td', {}, withSym(s, k)), h('td', { class: 'num' }, M(v, 2)));
  const tbl = h('div', { class: 'tbl' }, h('table', {}, h('tbody', {},
    line('Vancouver DCL', L.dcl, srcText(C.components.dcl.rates.residential)),
    line('Utilities DCL', L.utilitiesDcl, srcText(C.components.utilities_dcl.rates.residential)),
    line('Amenity Cost Charge', L.acc, srcText(C.components.acc.steps[0].rates.residential)),
    L.other ? line('Other charges you entered', L.other) : null,
    line('CAC, cash', L.cac, srcText(C.cac.share_of_lift)),
    L.cacEndowment ? line('CAC kept as an endowment for public floors', L.cacEndowment) : null,
    line('Build cost of in-kind public space (childcare, library, community, transit, social housing, free floors)', L.inKindBuildCost, null, 'public'),
    h('tr', {}, h('th', {}, 'Total to the public'), h('th', { class: 'num' }, M(L.total, 2))))));
  const payer = h('select', { id: 'payer' }, [['cross_subsidy', 'Cross-subsidy inside the building'], ['cac_endowment', 'Endowment from the CAC'], ['ticketed_deck', 'Ticketed deck pays for free floors'], ['city_or_partner', 'City or a partner runs and pays']].map(([v, l]) => h('option', { value: v, selected: S.publicPayer === v }, l)));
  payer.addEventListener('change', () => setSetting('publicPayer', payer.value));
  const run = h('div', { class: 'grid2' },
    numField('runCost', 'Running cost of public floors', S.publicRunningCostPerM2, { step: 10, min: 0, unit: 'C$/m²/yr', placeholder: 'user to supply', src: A.public_running_cost.cost_per_m2_year, onchange: v => setSetting('publicRunningCostPerM2', v) }),
    h('div', { class: 'field' }, h('label', { for: 'payer' }, 'Who pays'), payer));
  put(el('#tab-city'), 
    h('p', { class: 'note' }, 'What the City and public receive from this tower, separate from whether it pays back the investors. Charges use rates for a permit on ' + S.permitDate + '.'),
    r.land.currentZoningEstimated && !r.employmentOnly ? h('p', { class: 'note' }, `The CAC is measured from the estimated land value under current zoning (${M(r.land.currentZoningValue)}: site area × current-zoning FSR × land rate). Enter your own on the Verdict tab.`) : null,
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
    // the map ships as base64 text, a type every host (including claude.ai artifacts) serves
    const name = manifest.file_b64 || manifest.file;
    const buf = await fetch('basemap/' + name).then(async r => {
      if (!r.ok) throw new Error(`${name}: ${r.status}`);
      if (!manifest.file_b64) return r.arrayBuffer();
      const bin = atob((await r.text()).trim()), out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out.buffer;
    });
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
    put(box, h('p', { class: 'note' }, mapView.error ? `Could not load the base map: ${mapView.error}` : 'Loading the downtown base map (about 1 MB)…'));
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
      put(info, h('p', { class: 'note' }, 'Click the map to place a study point. The tool lists the buildings around it and estimates how high their roofs are, which can feed the condo “above neighbouring roofs” bonus. No site is marked: the brief’s site is hypothetical.'));
      return;
    }
    const ll = toLatLon(man, nb.x, nb.y), tower = result.height;
    const useVal = nb.aboveSiteGround.max ?? nb.height.max;
    const f0 = x => (x == null ? '—' : `${x.toFixed(0)} m`);
    put(info, 
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
  put(box, 
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
  if (!sens) sens = sensitivity(state.floors, data, effSettings());
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
  put($('#tab-sens'), 
    h('p', { class: 'note' }, 'How far the residual land value moves when one input changes at a time. The widest bars are the numbers to check first.'),
    h('div', { class: 'tbl', html: `<svg class="tornado" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Tornado chart of residual land value after CAC">${s}</svg>` }),
    h('p', { class: 'note' }, 'Condo height premium spans the two Vancouver studies: about 0.1%/floor when unit quality is controlled (UBC) and up to 1.5%/floor in raw sales data (Roomvu). Deck visitors only matter if the scheme has a ticketed deck (LE1).'),
    sens.land ? h('p', { class: 'note' }, `${sens.land.label} (C$${N(sens.land.lowRate.rate)}–${N(sens.land.highRate.rate)}/m²): the estimated land price runs ${M(sens.land.lowRate.landPrice, 0)}–${M(sens.land.highRate.landPrice, 0)} and the headroom over land (residual after CAC − land) ${M(sens.land.lowRate.headroom, 0)} to ${M(sens.land.highRate.headroom, 0)}. Verdict: ${VERDICT[sens.land.lowRate.verdict]} at the low rate, ${VERDICT[sens.land.highRate.verdict]} at the high rate. Not on the chart: it moves the land price, not only the residual.`) : null);
}

// ---------- Assumptions tab ----------
function renderAssume() {
  const S = settingsFull(), A = data.assumptions, Co = data.costs.other, Ch = data.charges;
  const f = (id, label, key, src, opts = {}) => numField(id, label, S[key], { ...opts, src, onchange: v => setSetting(key, v) });
  const sel = (id, label, key, options, src) => { const s = h('select', { id }, options.map(([v, l]) => h('option', { value: String(v), selected: String(S[key]) === String(v) }, l))); s.addEventListener('change', () => setSetting(key, s.value === 'true' ? true : s.value === 'false' ? false : s.value)); return h('div', { class: 'field' }, h('label', { for: id }, label, src ? gradeTag(src.grade) : null, src ? srcTag(src) : null), s); };
  const brief = data.brief;
  put($('#tab-assume'), 
    (() => { const sel = h('select', { id: 'aScenario' }, h('option', { value: '' }, '2026 now (default)'), Object.entries(data.assumptions.scenarios || {}).filter(([, v]) => v?.label && v.items?.length).map(([k, v]) => h('option', { value: k, selected: state.scenario?.kind === 'market' && state.scenario.id === k }, v.label)), state.scenario?.kind === 'precedent' ? h('option', { value: '__p', selected: true, disabled: true }, scenarioLabel(state.scenario, data, raw.precedents)) : null);
      sel.addEventListener('change', () => setScenario(sel.value ? { kind: 'market', id: sel.value } : null));
      return h('div', { class: 'field' }, h('label', { for: 'aScenario' }, 'Market scenario (an optional, labelled overlay on these defaults)'), sel); })(),
    scenarioBanner(),
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
  const typRows = [...data.rows.values()].filter(r => TYPICAL_BASES.has(r.value_basis) || r.value_basis === 'no_income');
  const typLines = data.raw.costs.typical_lines || [];
  put($('#tab-about'), 
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
    h('h4', { style: 'margin:0' }, 'Typical estimates'),
    h('p', { class: 'note' }, 'Some uses have no figure in the pack’s main sources. So that you never have to invent a price, each has a typical estimate (grade C). “Researched” ones are built from a 2025–26 Vancouver, BC or Canadian figure found by web search; “analogy” ones borrow from a similar use because nothing usable was found. Both are marked wherever they appear. Type your own number in Floors to replace one. The full table of all 112 programmes is in docs/value_defaults.md.'),
    h('details', {}, h('summary', {}, `Values (${typRows.length}) and hard costs (${typLines.length})`),
      h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Row'), h('th', { class: 'num' }, 'C$/m² GFA'), h('th', {}, 'Basis'))),
        h('tbody', {}, typRows.map(r => h('tr', {}, h('td', {}, r.name, ' ', idTag(r.id)), h('td', { class: 'num' }, N(r.value_per_m2_gfa.value)), h('td', { class: 'note' }, h('span', { class: `pt-kind ${r.value_basis === 'no_income' ? 'none' : r.value_basis}` }, r.value_basis === 'no_income' ? 'no income' : r.value_basis), ' ', r.value_per_m2_gfa.note.replace(/^Typical estimate \(\w+\): |^Earns nothing: /, '')))),
          typLines.map(l => h('tr', {}, h('td', {}, `Hard cost · ${l.name}`), h('td', { class: 'num' }, N(l.default_m2.value)), h('td', { class: 'note' }, l.default_m2.note.replace(/^Typical estimate: /, '')))))))),
    h('h4', { style: 'margin:0' }, 'Open data gaps'),
    h('p', { class: 'note' }, 'Luxury hotel ADR; deck visitor numbers; supertall cost premium; Metro Vancouver and TransLink charges; efficiency curve vs CTBUH data; land price; downtown parking rates; public floor running cost. The typical estimates above should be replaced by sourced figures over time.'));
}

// ---------- import / export ----------
async function offerFile(filename, text, type) {
  const dl = window.claude ? await window.claude.use('downloads').catch(() => null) : null;
  const blob = text instanceof Blob ? text : new Blob([text], { type });
  if (dl) { try { await dl.save({ filename, data: blob }); } catch (e) { /* declined */ } return; }
  if (!window.claude) { const a = h('a', { href: URL.createObjectURL(blob), download: filename }); document.body.append(a); a.click(); a.remove(); return; }
  if (text instanceof Blob) { toast('Saving files is not available in this view. Try the SVG: it can be copied to the clipboard.'); return; }
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
- Values with value_basis "researched" or "analogy" are typical estimates (grade C), not the pack's sourced figures: say which when you use one. "no_income" means the use earns nothing for the owner.
- Use the tools to read the current scheme before answering questions about it. Quote numbers from tool results, with their source and grade when you have them. Never invent prices.
- When the user asks for a change (programme mix, assumptions, user-supplied values), make it with the tools, then report how the verdict and residual land value moved. Changes can be undone with the Undo button.
- Programmes are chosen by id from the catalogue (use find_programmes). Shares on a floor must add up to 1.
- Keep answers short and plain: a few sentences or a short list. Explain terms like residual land value, cap rate or CAC in one line when they first come up.
- Be neutral: suggest options and trade-offs; do not push one design.`;
function summaryForAI() {
  const t = result.totals, f = result.fsr;
  return { verdict: VERDICT[result.verdict], reasons: result.reasons, height_m: +result.height.toFixed(1), floors: state.floors.length,
    totals_cad_millions: Object.fromEntries(['gfa', 'gdv', 'cost', 'profit', 'publicDeduction', 'rlvBeforeCac', 'cac', 'rlvAfterCac'].map(k => [k, k === 'gfa' ? Math.round(t[k]) : +(t[k] / 1e6).toFixed(1)])),
    scenario: scenarioLabel(state.scenario, data, raw.precedents) ?? '2026 defaults', precedent: state.precedent,
    land: { price_cad: result.totals.landPrice, price_estimated: result.totals.landEstimated, current_zoning_value_cad: result.land.currentZoningValue, current_zoning_estimated: result.land.currentZoningEstimated,
      estimate_basis: result.land.siteAreaM2 ? `${result.land.footprintProxy ? 'largest level-1 plate (no site area set)' : 'site area'} ${Math.round(result.land.siteAreaM2)} m2 x FSR ${result.land.fsr} x C$${result.land.rate}/m2 x (1 + ${result.land.premium})` : 'no site area' }, fsr: { nonres_with_hotel: Math.round(f.nonresWithHotel), nonres_without_hotel: Math.round(f.nonresWithoutHotel), required: f.requiredNonres ? Math.round(f.requiredNonres) : null, pass: f.pass ?? null },
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
      value_row: row ? { id: row.id, name: row.name, earns_by: row.earns_by, value_per_m2_gfa: row.value_per_m2_gfa.value, value_basis: row.value_basis, source: srcText(row.value_per_m2_gfa) } : null,
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
  { name: 'set_assumption', description: 'Change one project assumption. name is one of: landPrice, landValueCurrentZoning, podiumTopFloor, neighbourRoofM, siteAreaM2, profitOnCost, softCost, financeRate, buildYears, supertallPremium, cacShare, publicRunningCostPerM2, childcareM2PerSpace, landFsr (current-zoning FSR for the land estimate, 0-30), landRatePerM2 (C$ per buildable m2, 0-50000), landPremium (0-1), publicPayer (cross_subsidy|cac_endowment|ticketed_deck|city_or_partner), presaleMarket (weak|normal), hotelAsNonResidential (true|false). value null resets it.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, value: {} }, required: ['name'] }, execute: ({ name, value }) => {
    const ok = ['landPrice', 'landValueCurrentZoning', 'podiumTopFloor', 'neighbourRoofM', 'siteAreaM2', 'profitOnCost', 'softCost', 'financeRate', 'buildYears', 'supertallPremium', 'cacShare', 'publicRunningCostPerM2', 'childcareM2PerSpace', 'landFsr', 'landRatePerM2', 'landPremium', 'publicPayer', 'presaleMarket', 'hotelAsNonResidential'];
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
// ---------- Start from your concept: AI planner and rule-based starter ----------
const EXPLAIN_FORMAT = `Write the explanation short and plain, in this order:
1. One line: the intent.
2. Band by band from the basement to the crown, one line each: levels, uses, and the reason (where it fits on the section, intensity buffer, a code flag, or a value pattern such as the height premium for homes, retail value only at grade, offices low near transit, heavy and public uses low or on seams).
3. FSR: the non-residential result with hotel counted both ways, against the 9.0 rule if the brief applies.
4. Money: which bands create value and which need support from the rest, and the verdict against the land price (say if the land price is estimated).
5. Two or three alternative moves the user could try.
6. Close with: an indicative early-design estimate and a starting point to edit, not a recommendation of one design.
Stay neutral: offer options, never impose a style. No markdown headings; plain lines and "• " bullets.`;
const PLANNER_RULES = `You are planning a starting programme stack for a tall building in Vancouver, inside Program Value Visualizer.
Steps (you have only a few tool rounds):
1. Call get_planning_guide once and reason from its rules and programme list (fits, intensity, code flags, values), not from memory.
2. Propose a stack that answers the user's concept and priorities, then call apply_stack ONCE with the whole tower and all bands (below grade to the crown, plant floors about every 20 floors, a buffer floor where the intensity jumps by 3 or more).
3. Read the summary apply_stack returns. Call apply_stack one more time ONLY if the 9.0 FSR non-residential rule is asked for and fails, or a blocking rule appears. Otherwise do not call more tools.
4. Then write the explanation.
${EXPLAIN_FORMAT}`;
let conceptAnswers = null;
function stackSummary(extra = {}) {
  const fam = {}; for (const i of result.items) { const k = data.families.get(i.family_id)?.name; fam[k] = (fam[k] || 0) + i.net_contribution / 1e6; }
  const f = result.fsr;
  return { ...extra, verdict: VERDICT[result.verdict], reasons: result.reasons, height_m: +result.height.toFixed(1), floors: state.floors.length,
    totals_cad_millions: Object.fromEntries(['gdv', 'cost', 'rlvAfterCac', 'landPrice'].map(k => [k, t1(result.totals[k])])), land_estimated: result.totals.landEstimated,
    fsr: { nonres_fsr_hotel_as_nonres: f.nonresFsrWithHotel != null ? +f.nonresFsrWithHotel.toFixed(2) : null, nonres_fsr_hotel_as_res: f.nonresFsrWithoutHotel != null ? +f.nonresFsrWithoutHotel.toFixed(2) : null, required: f.minNonresFsr ?? null, pass: f.pass ?? null, counting_hotel_as_nonres: f.usingHotelAsNonResidential },
    top_rules: result.rules.filter(r => r.severity !== 'info').slice(0, 8).map(r => `${r.severity}: ${r.text}`),
    net_by_family_cad_millions: Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, +v.toFixed(1)])) };
}
const t1 = x => (x == null ? null : +(x / 1e6).toFixed(1));
/** Replace the floors with a stack in one step: one Undo reverses it. Throws on bad input before anything changes. */
function applyStackToPage(stack, { hotelNonres } = {}) {
  const built = stackToFloors(stack, data);
  pushHistory();
  state.floors = built.floors; state.sel = null; editMix = null;
  if (hotelNonres != null) state.settings.hotelAsNonResidential = !!hotelNonres;
  refresh();
  return built;
}
const PLAN_TOOLS = [
  { name: 'list_precedents', description: 'Precedent towers that can be mapped onto the current form: id, name, city, height, floors, year, why it worked, what it relied on, and its optional market context.', execute: () => (raw.precedents?.presets || []).map(p => ({ id: p.id, name: p.name, city: p.city, height_m: p.height_m, floors: p.floors, year: p.year_complete ?? p.status, why: p.why, relied_on: p.relied_on, context: p.context ? { label: p.context.label, items: p.context.items.map(i => `${i.setting} -> ${i.to} (grade ${i.grade}): ${i.note}`) } : null, bands: p.bands.map(b => `${Math.round(b.from * 100)}-${Math.round(b.to * 100)}%: ${b.mix.map(m => `${m.programme_id} ${Math.round(m.share * 100)}%`).join(', ')}`) })) },
  { name: 'apply_precedent', description: 'Map a precedent onto the current floors (geometry unchanged; level 1 retail and lobby, parking below grade, locked floors kept). with_context: true also turns on its labelled market scenario. One Undo reverses it. Returns the new summary.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, with_context: { type: 'boolean' } }, required: ['id'] },
    execute: ({ id, with_context }) => { const p = precedentById(String(id)); if (!p) throw new Error('unknown precedent id'); const b = applyPresetToPage(p, !!with_context); return { applied: p.name, notes: b.notes, ...summaryForAI() }; } },
  { name: 'optimise_mix', description: 'Find a mix that works for the current building form: keeps floors, heights, plates and locked floors; searches uses floor by floor with the full calculator under the brief FSR rule and market caps; compares strategies (all uses, no sale condos, employment only, no deck). Returns verdict, headroom, strategies and a report. apply: true puts the best stack on the section (one Undo reverses it).', inputSchema: { type: 'object', properties: { apply: { type: 'boolean' }, respectFsr: { type: 'boolean' }, allowSale: { type: 'boolean' }, allowDeck: { type: 'boolean' }, keepPublic: { type: 'boolean' }, inclusionary: { type: 'boolean' }, maxHotelKeys: { type: 'number' } } },
    execute: ({ apply, ...o }) => {
      const clean = {};
      for (const k of ['respectFsr', 'allowSale', 'allowDeck', 'keepPublic', 'inclusionary']) if (typeof o[k] === 'boolean') clean[k] = o[k];
      if (o.maxHotelKeys != null) { const n = Number(o.maxHotelKeys); if (!Number.isFinite(n) || n < 0 || n > 2000) throw new Error('maxHotelKeys must be 0-2000'); clean.maxHotelKeys = n; }
      const res = runOptimiser({ ...optimiserDefaults(data), ...clean });
      const applied = apply ? applyOptimised(res) : false;
      return { ...optSummary(res), applied };
    } },
  { name: 'get_planning_guide', description: 'The tool’s own planning rules and the full programme catalogue: id, name, family, fits (B G L M H T S), intensity, code group, how it earns, value per m2 GFA and its basis (sourced / researched / analogy / no income). Read this before proposing a stack.', execute: () => planningGuide(data) },
  { name: 'apply_stack', description: 'Replace the whole building in one step (one Undo reverses it). tower: {height_m 40-500, podium_floors 0-12, podium_plate_m2, tower_plate_m2, top_plate_m2, below_grade 0-8}. bands: [{from_level, to_level, mix: [{programme_id, share}]}] from below grade (negative levels) to the crown; shares add up to 1; a later band wins where bands overlap. The generator puts a plant floor (SB2) about every 20 floors: it stays unless a one-level band names that level. Floors no band covers copy the nearest band. Returns verdict, totals, FSR both ways, top rules and net value by family.', inputSchema: { type: 'object', properties: { tower: { type: 'object', properties: { height_m: { type: 'number' }, podium_floors: { type: 'number' }, podium_plate_m2: { type: 'number' }, tower_plate_m2: { type: 'number' }, top_plate_m2: { type: 'number' }, below_grade: { type: 'number' } } }, bands: { type: 'array', items: { type: 'object', properties: { from_level: { type: 'number' }, to_level: { type: 'number' }, mix: { type: 'array', items: { type: 'object', properties: { programme_id: { type: 'string' }, share: { type: 'number' } }, required: ['programme_id', 'share'] } } }, required: ['from_level', 'to_level', 'mix'] } } }, required: ['tower', 'bands'] },
    execute: input => { const b = applyStackToPage(input, { hotelNonres: conceptAnswers?.hotel_nonres }); return stackSummary({ floors_filled_from_nearest_band: b.filled.length, plant_floors_kept: b.keptMech, bands_outside_the_tower: b.outside }); } },
];
const FAIL_COPY = { not_granted: 'Ask AI is turned off for this page.', sampling_disabled: 'Claude is not available for this account.', rate_limited: 'Too many questions just now. Try again in a minute.', refused: 'Claude declined that request.', tools_unavailable: 'This view cannot let the assistant change the scheme.', session_expired: 'Please sign in again.', cancelled: 'Stopped.' };
/** Run one assistant call with progress lines; resolves the final text or null (with the reason shown). */
async function runAssistant(prompt, tools, ui, { label }) {
  const { msgs, status, stop } = ui;
  const bubble = h('div', { class: 'msg ai' }, 'Thinking…'); msgs.append(bubble); msgs.scrollTop = msgs.scrollHeight;
  const wrapped = tools.map(t => ({ ...t, execute: (input, ctx) => { msgs.insertBefore(h('div', { class: 'msg tool' }, `→ ${t.name}${t.name === 'apply_stack' ? ' (one Undo reverses it)' : ''}`), bubble); return t.execute(input || {}, ctx); } }));
  aiState = 'busy'; stop.hidden = false; status.textContent = `${label} Each run uses your own Claude usage; it can take a minute.`;
  chatCtl = new AbortController();
  try {
    const { text, truncated } = await sample([{ role: 'user', content: prompt }], { signal: chatCtl.signal, tools: wrapped, modelTier: 'default', cache: false, onText: ({ text }) => { bubble.textContent = text; msgs.scrollTop = msgs.scrollHeight; } });
    bubble.textContent = text; status.textContent = truncated ? 'The answer was cut short.' : '';
    return text;
  } catch (e) {
    bubble.textContent = e.text || ''; if (!bubble.textContent) bubble.remove();
    status.textContent = FAIL_COPY[e.code] ?? 'Something went wrong.';
    return { failed: e.code || 'error' };
  } finally { aiState = 'idle'; stop.hidden = true; }
}
function showStarter(answers, ui, why) {
  const st = starterStack(answers, data, state.settings);
  applyStackToPage(st, { hotelNonres: st.hotelNonres });
  const text = explainStack(result, data, { stack: st, floors: state.floors, concept: answers.concept, label: `Rule-based starter (no AI)${why ? ` — ${why}` : ''}. One Undo reverses it.` });
  ui.msgs.append(h('div', { class: 'msg ai starter' }, text)); ui.msgs.scrollTop = ui.msgs.scrollHeight;
}
async function planFromConcept(answers, ui, { useAI }) {
  conceptAnswers = answers;
  ui.msgs.append(h('div', { class: 'msg user' }, `Plan a starting stack: ${answers.concept || '(no concept text)'} · ${answers.height_m} m · ${answers.priorities.map(k => PRIORITIES[k]).join(', ') || 'no priorities'}${answers.must_have.length ? ' · must have ' + answers.must_have.join(', ') : ''} · 9.0 FSR ${answers.meet_fsr ? 'yes' : 'no'} · hotel ${answers.hotel_nonres ? 'non-residential' : 'residential'} · ${answers.plates} plates`));
  if (!useAI || !sample) { showStarter(answers, ui, sample ? '' : 'Ask AI is not available here'); return; }
  const prompt = `${RULES}\n\n${PLANNER_RULES}\n\nUser's answers (JSON):\n${JSON.stringify({ ...answers, plate_sizes_m2: PLATES[answers.plates], brief: state.brief === 'vtc-2026' ? 'Vancouver Tall Challenge 2026' : 'none' })}\n\nCurrent building summary before planning (JSON):\n${JSON.stringify(summaryForAI())}`;
  const out = await runAssistant(prompt, [...PLAN_TOOLS, ...AI_TOOLS.filter(t => ['get_results', 'get_floors'].includes(t.name))], ui, { label: 'Planning a starting stack…' });
  if (out && out.failed && out.failed !== 'cancelled') showStarter(answers, ui, 'the assistant could not run');
}
async function explainCurrent(ui) {
  ui.msgs.append(h('div', { class: 'msg user' }, 'Explain my current stack'));
  if (!sample) { ui.msgs.append(h('div', { class: 'msg ai starter' }, explainStack(result, data, { floors: state.floors, label: 'Rule-based explanation (no AI).' }))); return; }
  const prompt = `${RULES}\n\nExplain the arrangement that is on screen now, using get_results and get_floors (one or two rounds), then write:\n${EXPLAIN_FORMAT}\n\nCurrent summary (JSON):\n${JSON.stringify(summaryForAI())}`;
  const out = await runAssistant(prompt, AI_TOOLS.filter(t => ['get_results', 'get_floors', 'get_programme'].includes(t.name)), ui, { label: 'Reading the current stack…' });
  if (out && out.failed && out.failed !== 'cancelled') ui.msgs.append(h('div', { class: 'msg ai starter' }, explainStack(result, data, { floors: state.floors, label: 'Rule-based explanation (no AI).' })));
}
function conceptCard(ui) {
  const brief = data.brief, hr = brief?.height_m;
  const a = conceptAnswers || { concept: '', height_m: 280, priorities: [], must_have: [], meet_fsr: !!brief?.rules?.length, hotel_nonres: true, plates: 'medium' };
  const concept = h('textarea', { id: 'cConcept', rows: 2, placeholder: 'e.g. A vertical neighbourhood: homes above a public podium, with a free view for the city.', style: 'width:100%' }); concept.value = a.concept;
  const hOut = h('output', { for: 'cHeight', class: 'mono' }, `${a.height_m} m`);
  const height = h('input', { id: 'cHeight', type: 'range', min: 150, max: 330, step: 1, value: a.height_m, style: 'width:100%' });
  height.addEventListener('input', () => { hOut.textContent = `${height.value} m`; });
  const prio = new Set(a.priorities);
  const prioBox = h('div', { class: 'chips', role: 'group', 'aria-label': 'Priorities, up to 3' }, Object.entries(PRIORITIES).map(([k, label]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(prio.has(k)), class: 'prio' }, label);
    b.addEventListener('click', () => { if (prio.has(k)) prio.delete(k); else if (prio.size < 3) prio.add(k); else { toast('Pick up to 3 priorities.'); return; } b.setAttribute('aria-pressed', String(prio.has(k))); });
    return b;
  }));
  const must = [...a.must_have];
  const mustChips = h('div', { class: 'chips must' });
  const drawMust = () => put(mustChips, must.map(id => h('span', { class: 'mchip' }, iconEl(id, 20), `${prog(id)?.name} (${id})`, h('button', { type: 'button', 'aria-label': `Remove ${prog(id)?.name}`, onclick: () => { must.splice(must.indexOf(id), 1); drawMust(); } }, '×'))));
  drawMust();
  const mustSel = h('select', { id: 'cMust', 'aria-label': 'Add a must-have programme' }, h('option', { value: '' }, 'Add a must-have programme (optional)…'),
    [...data.families.values()].map(f => h('optgroup', { label: f.name }, [...data.programmes.values()].filter(p => p.family_id === f.family_id).map(p => h('option', { value: p.id }, p.name)))));
  mustSel.addEventListener('change', () => { const id = mustSel.value; mustSel.value = ''; if (id && !must.includes(id)) { if (must.length >= 6) { toast('Up to 6 must-haves.'); return; } must.push(id); drawMust(); } });
  const yn = (id, label, on) => { const s = h('select', { id }, h('option', { value: 'yes', selected: on }, 'yes'), h('option', { value: 'no', selected: !on }, 'no')); return [h('label', { for: id }, label), s]; };
  const [fsrL, fsrS] = yn('cFsr', 'Meet the 9.0 FSR non-residential rule?', a.meet_fsr);
  const [hotL, hotS] = yn('cHotel', 'Count hotel as non-residential?', a.hotel_nonres);
  const plates = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Floor plates' }, Object.entries({ compact: 'Compact (tower ~1,500 m²)', medium: 'Medium (~2,000 m²)', large: 'Large (~2,600 m²)' }).map(([k, label]) => {
    const r = h('input', { type: 'radio', name: 'cPlates', value: k, id: `cPl-${k}`, checked: a.plates === k, class: 'sr' });
    return h('label', { for: `cPl-${k}`, class: 'radio-chip' }, r, label);
  }));
  const answers = () => ({ concept: concept.value.trim().slice(0, 500), height_m: Number(height.value), priorities: [...prio], must_have: [...must], meet_fsr: fsrS.value === 'yes', hotel_nonres: hotS.value === 'yes', plates: plates.querySelector('input:checked')?.value || 'medium' });
  const busy = () => aiState === 'busy';
  const go = useAI => { if (busy()) return; planFromConcept(answers(), ui, { useAI }); };
  const aiBtn = h('button', { class: 'primary', id: 'cPlanAI', onclick: () => go(true) }, 'Plan it with AI');
  const ruleBtn = h('button', { id: 'cPlanRule', onclick: () => go(false) }, 'Rule-based starter (no AI)');
  return h('details', { class: 'concept', id: 'concept', open: true },
    h('summary', {}, h('strong', {}, 'Start from your concept')),
    h('p', { class: 'note' }, 'Answer a few questions. The assistant arranges a starting stack, puts it on the section and explains why. One Undo reverses it. Without AI, a rule-based starter does the same from fixed rules.'),
    h('div', { class: 'field' }, h('label', { for: 'cConcept' }, 'Your concept in one or two sentences'), concept),
    h('div', { class: 'field' }, h('label', { for: 'cHeight' }, 'Height ', hOut, hr ? h('span', { class: 'note' }, ` · brief: ${hr.min}–${hr.max} m`) : null), height),
    h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Priorities (up to 3)'), prioBox),
    h('div', { class: 'field' }, h('label', { for: 'cMust' }, 'Must-have programmes'), mustSel, mustChips),
    h('div', { class: 'grid2' }, h('div', { class: 'field' }, fsrL, fsrS), h('div', { class: 'field' }, hotL, hotS)),
    h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Floor plates'), plates),
    h('div', { class: 'toolbar' }, aiBtn, ruleBtn));
}

// ---------- Concept diagram: read (AI) or type bands, review, apply ----------
let imageLimits = null;
const PROG_OPTIONS = () => [...data.families.values()].map(f => h('optgroup', { label: f.name }, [...data.programmes.values()].filter(p => p.family_id === f.family_id).map(p => h('option', { value: p.id }, `${p.name} (${p.id})`))));
/** Replace the floors with ones built from diagram bands: one Undo reverses it. Validates first. */
function applyDiagramFloors(bands, plates) {
  const built = floorsFromBands(bands, data, plates);
  pushHistory();
  state.floors = built.floors; state.sel = null; editMix = null;
  refresh();
  return built;
}
function reviewPanel(read, ui, { source }) {
  const box = h('div', { class: 'review', id: 'review' });
  const rows = read.bands.map(b => ({ ...b, programmes: b.programmes.map(p => ({ ...p })) }));
  const draw = () => {
    const tbody = h('tbody', {}, rows.flatMap((b, bi) => {
      const prs = b.programmes.length ? b.programmes : [{ text: '', programme_id: null, share: 1, confidence: 1 }];
      if (!b.programmes.length) b.programmes = prs;
      return prs.map((p, pi) => {
        const sel = h('select', { 'aria-label': `Programme for “${p.text || 'word'}” in band ${bi + 1}` }, h('option', { value: '' }, 'Pick a programme…'), PROG_OPTIONS());
        sel.value = p.programme_id || '';
        sel.addEventListener('change', () => { p.programme_id = sel.value || null; p.flag = null; p.confidence = Math.max(p.confidence, 0.9); draw(); });
        const share = h('input', { type: 'number', min: 0, max: 100, step: 1, value: Math.round(p.share * 100), 'aria-label': 'Share %', class: 'num-in' });
        share.addEventListener('change', () => { p.share = Math.max(0, Math.min(100, Number(share.value) || 0)) / 100; });
        const elev = (k, label) => { const i = h('input', { type: 'number', step: 0.1, value: b[k] ?? '', 'aria-label': `${label}, band ${bi + 1}`, class: 'num-in' }); i.addEventListener('change', () => { b[k] = i.value === '' ? null : Number(i.value); }); return i; };
        const low = !p.programme_id || p.confidence < 0.6;
        return h('tr', { class: low ? 'low' : null },
          pi === 0 ? h('td', { rowspan: prs.length }, h('b', {}, `${bi + 1}`), h('div', { class: 'elev' }, elev('from_m', 'From m'), '–', elev('to_m', 'To m'), ' m'),
            h('div', { class: 'toolbar' }, h('button', { type: 'button', onclick: () => { b.programmes.push({ text: '', programme_id: null, share: 0, confidence: 1 }); draw(); } }, '+ word'), h('button', { type: 'button', onclick: () => { rows.splice(bi, 1); draw(); } }, 'Remove band'))) : null,
          h('td', {}, p.text || '—'),
          h('td', { class: 'prog-cell' }, p.programme_id ? iconEl(p.programme_id, 22) : null, sel, p.flag ? h('div', { class: 'note neg' }, p.flag) : null),
          h('td', {}, share, '%'),
          h('td', {}, h('span', { class: `conf${low ? ' low' : ''}`, title: 'How sure the reading is' }, `${Math.round(p.confidence * 100)}%`), pi > 0 ? h('button', { type: 'button', 'aria-label': 'Remove word', onclick: () => { b.programmes.splice(pi, 1); draw(); } }, '×') : null));
      });
    }));
    put(box,
      h('h4', { style: 'margin:0' }, source === 'ai' ? 'Check what was read before it changes anything' : 'Type your bands'),
      source === 'ai' ? h('p', { class: 'note' }, 'Rows in orange are unsure or need a programme. Fix elevations, mappings and shares, then apply. Nothing changes until you press Apply.') : h('p', { class: 'note' }, 'One row per band: bottom and top elevation in metres (negative below ground), then the programmes and their shares.'),
      read.issues?.length ? h('ul', { class: 'note neg' }, read.issues.map(x => h('li', {}, x))) : null,
      read.unreadable?.length ? h('p', { class: 'note' }, 'Could not read: ', read.unreadable.join(' · ')) : null,
      read.notes ? h('p', { class: 'note' }, read.notes) : null,
      h('div', { class: 'tbl' }, h('table', { class: 'review-tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Band, from–to'), h('th', {}, 'Words read'), h('th', {}, 'Programme'), h('th', {}, 'Share'), h('th', {}, 'Sure'))), tbody)),
      h('div', { class: 'toolbar' },
        h('button', { type: 'button', onclick: () => { const last = rows[rows.length - 1]; rows.push({ from_m: last?.to_m ?? 0, to_m: (last?.to_m ?? 0) + 20, label_text: '', programmes: [{ text: '', programme_id: null, share: 1, confidence: 1 }] }); draw(); } }, '+ band'),
        h('button', { class: 'primary', type: 'button', onclick: () => apply() }, 'Apply to section'),
        h('button', { type: 'button', onclick: () => box.remove() }, 'Cancel')));
  };
  const apply = async () => {
    let built;
    try { built = applyDiagramFloors(rows, { ...PLATES[conceptAnswers?.plates || 'medium'] }); } catch (e) { toast(e.message); return; }
    box.remove();
    ui.msgs.append(h('div', { class: 'msg user' }, `Applied ${rows.length} band${rows.length > 1 ? 's' : ''} from ${source === 'ai' ? 'the diagram' : 'my table'} (${built.floors.length} floors, ${Math.round(built.height_m)} m). One Undo reverses it.${built.notes.length ? ' ' + built.notes.join(' ') : ''}`));
    if (sample) {
      const prompt = `${RULES}\n\nThe user just applied a stack ${source === 'ai' ? 'read from their concept diagram' : 'they typed as bands'}. Using get_results and get_floors, start with one line "Why this reads as …" (what kind of tower the stack makes), then:\n${EXPLAIN_FORMAT}\n\nCurrent summary (JSON):\n${JSON.stringify(summaryForAI())}`;
      const out = await runAssistant(prompt, AI_TOOLS.filter(t => ['get_results', 'get_floors', 'get_programme'].includes(t.name)), ui, { label: 'Explaining the stack…' });
      if (!(out && out.failed)) return;
    }
    ui.msgs.append(h('div', { class: 'msg ai starter' }, explainStack(result, data, { floors: state.floors, label: `Rule-based explanation (no AI) of the ${source === 'ai' ? 'diagram' : 'typed'} stack.` })));
  };
  draw();
  return box;
}
async function readDiagram(file, ui, host) {
  if (!imageLimits) return;
  if (!imageLimits.mediaTypes.includes(file.type)) { toast(`Use ${imageLimits.mediaTypes.map(t => t.split('/')[1].toUpperCase()).join(', ')}.`); return; }
  if (file.size > imageLimits.maxInputBytes) { toast(`That image is over ${Math.round(imageLimits.maxInputBytes / 1e6)} MB.`); return; }
  ui.msgs.append(h('div', { class: 'msg user' }, `Read my concept diagram (${file.name})`));
  const bubble = h('div', { class: 'msg ai' }, 'Reading the diagram… this can take a minute.'); ui.msgs.append(bubble);
  aiState = 'busy'; ui.stop.hidden = false; chatCtl = new AbortController();
  try {
    const raw = await sample.json(readPrompt(data), { images: [file], modelTier: 'default', signal: chatCtl.signal, cache: false });
    const read = normaliseDiagramRead(raw, data);
    bubble.textContent = `Read ${read.bands.length} band${read.bands.length === 1 ? '' : 's'}${read.height_m ? `, about ${Math.round(read.height_m)} m tall` : ''}. Check the table below before applying.`;
    host.querySelector('#review')?.remove(); host.append(reviewPanel(read, ui, { source: 'ai' }));
    host.querySelector('#review')?.scrollIntoView({ block: 'start' });
  } catch (e) {
    bubble.textContent = FAIL_COPY[e.code] ?? (e.code === 'images_unavailable' ? 'Images cannot be sent from this view.' : 'The diagram could not be read. Try a clearer image, or type the bands yourself.');
  } finally { aiState = 'idle'; ui.stop.hidden = true; }
}
function diagramCard(ui) {
  const host = h('div', { class: 'concept diagram-card' });
  const file = h('input', { type: 'file', id: 'diagramFile', class: 'sr', accept: 'image/png,image/jpeg,image/webp' });
  file.addEventListener('change', () => { const f = file.files[0]; file.value = ''; if (f && aiState !== 'busy') readDiagram(f, ui, host); });
  const upBtn = h('label', { for: 'diagramFile', class: 'drop up-btn', hidden: true }, 'Upload concept diagram', file);
  const upNote = h('p', { class: 'note', hidden: true }, 'The image is sent to Claude on your own account to read the bands and words. Nothing changes until you check the table and press Apply.');
  const manual = h('button', { type: 'button', onclick: () => { host.querySelector('#review')?.remove(); host.append(reviewPanel({ bands: [{ from_m: 0, to_m: 6, label_text: '', programmes: [{ text: '', programme_id: 'SE1', share: 1, confidence: 1 }] }], issues: [], unreadable: [], notes: '' }, ui, { source: 'manual' })); } }, 'Type bands yourself');
  put(host, h('strong', {}, 'From a concept diagram'), h('p', { class: 'note' }, 'A section diagram of programme words (bands with elevations) can be read and put on the section, or type the bands yourself.'), h('div', { class: 'toolbar' }, upBtn, manual), upNote);
  if (sample?.limits) sample.limits().then(l => { imageLimits = l?.images || null; if (imageLimits) { upBtn.hidden = false; upNote.hidden = false; file.accept = imageLimits.mediaTypes.join(','); } }).catch(() => {});
  return host;
}

function renderAI() {
  const box = $('#tab-ai');
  if (box.dataset.ready) { return; }
  box.dataset.ready = '1';
  const msgs = h('div', { class: 'msgs', id: 'msgs', 'aria-live': 'polite' });
  const ta = h('textarea', { id: 'aiIn', rows: 3, placeholder: 'Ask about this scheme, or ask for a change: “Why does the office lose money?” “Swap floors 20–30 to market rental and compare.”', style: 'width:100%' });
  const send = h('button', { class: 'primary', id: 'aiSend' }, 'Ask');
  const stop = h('button', { id: 'aiStop', hidden: true }, 'Stop');
  const status = h('div', { class: 'note', id: 'aiStatus' });
  const ui = { msgs, status, stop };
  const diagramSlot = h('div', { id: 'diagramSlot' });
  const explainBtn = h('button', { class: 'explain', onclick: () => { if (aiState !== 'busy') explainCurrent(ui); } }, 'Explain my current stack');
  const optChip = h('button', { class: 'explain', onclick: () => openOptimiser() }, 'Find a mix that works');
  const presetChip = h('button', { class: 'explain', onclick: openPresets }, 'Start from a precedent');
  const chips = h('div', { class: 'chips' }, explainBtn, optChip, presetChip, ['Explain the verdict in plain words', 'Which floors lose the most money, and why?', 'How could this scheme meet the 9.0 FSR non-residential rule?', 'What are the weakest numbers in the data?'].map(q => h('button', { onclick: () => { ta.value = q; ask(); } }, q)));
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
    const tools = [...AI_TOOLS, ...PLAN_TOOLS].map(t => ({ ...t, execute: (input, ctx) => { msgs.insertBefore(h('div', { class: 'msg tool' }, `→ ${t.name}`), bubble); return t.execute(input || {}, ctx); } }));
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
  put(box, 
    conceptCard(ui), diagramSlot,
    h('p', { class: 'note' }, 'Ask questions about the current scheme or ask for changes. The assistant reads the same numbers you see and can edit the floor mix and assumptions (Undo reverses any change). It uses your own Claude account.'),
    chips, h('div', { class: 'chat' }, msgs, ta, h('div', { class: 'toolbar' }, send, stop, h('span', { class: 'note' }, '⌘/Ctrl + Enter to send')), status));
  put(diagramSlot, diagramCard(ui));
  if (window.claude) window.claude.use('sample').then(s => { sample = s; put(diagramSlot, diagramCard(ui)); if (!s) status.textContent = 'Ask AI is not available in this view.'; }).catch(() => { status.textContent = 'Ask AI is not available in this view.'; });
  else status.textContent = 'Ask AI works when this tool is opened on claude.ai. Everything else works here.';
}

// ---------- Programme word-stack diagram: preview and export ----------
const diagramOpts = { colour: 'family', labels: 'names', groupBy: 'programme', showArea: false, shape: 'tower', proportion: 'fit' };
function diagramLayout() { return wordStackLayout(result, data, { groupBy: diagramOpts.groupBy, labels: diagramOpts.labels, showArea: diagramOpts.showArea, shape: diagramOpts.shape, proportion: diagramOpts.proportion }); }
function diagramSVG(embedFont = true) { return wordStackSVG(diagramLayout(), { colour: diagramOpts.colour, showArea: diagramOpts.showArea, families: data.families, embedFont, title: `Programme section · ${Math.round(result.height)} m` }); }
/** Draw the same layout on a canvas (PNG export): the page has the display font loaded, an SVG image would not. */
async function diagramPNG(scale = 3) {
  try { await document.fonts.load(`700 40px Oswald`); await document.fonts.load(`500 13px Oswald`); } catch (e) { /* fall back to the next font in the stack */ }
  const L = diagramLayout(), W = L.width, H = Math.ceil(L.height);
  const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
  const g = c.getContext('2d'); g.scale(scale, scale);
  const PAPER = '#f6f3ec', INK = '#1d2730', RULE = '#b9b2a4', MUTED = '#6b6458', x1 = W - L.pad.right;
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  g.fillStyle = INK; g.font = `500 13px ${FONT_STACK}`; g.fillText(`PROGRAMME SECTION · ${Math.round(result.height)} M`, L.pad.left, 24);
  const tag = (txt, yy) => { g.font = "9px 'IBM Plex Mono', Menlo, monospace"; g.fillStyle = MUTED; g.textAlign = 'right'; g.fillText(txt, W - 8, yy); g.textAlign = 'left'; };
  if (L.outline) { const p2 = new Path2D(L.outline); g.fillStyle = '#ece5d6'; g.fill(p2); g.strokeStyle = INK; g.lineWidth = 1; g.lineJoin = 'round'; g.stroke(p2); }
  for (const b of L.bands) {
    const ra = L.outline ? b.rx0 : L.pad.left, rb = L.outline ? b.rx1 : x1;
    g.strokeStyle = L.outline ? INK : RULE; g.lineWidth = L.outline ? 0.8 : 0.6; g.beginPath(); g.moveTo(ra, b.y0); g.lineTo(rb, b.y0); g.stroke();
    if (L.outline) { g.strokeStyle = RULE; g.lineWidth = 0.5; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(rb, b.y0); g.lineTo(x1 + 6, b.y0); g.stroke(); g.setLineDash([]); }
    tag(`${b.z1 >= 0 ? '+' : '−'}${Math.abs(b.z1).toFixed(1)} m`, b.y0 + 3);
    for (const w of b.words) {
      g.font = `700 ${w.size}px ${FONT_STACK}`; g.fillStyle = diagramOpts.colour === 'family' ? inkOf(data.families.get(w.family)?.colour) : INK; g.fillText(w.text, w.x, w.y);
      if (diagramOpts.showArea) { const ww = g.measureText(w.text).width; g.font = "9px 'IBM Plex Mono', Menlo, monospace"; g.fillStyle = MUTED; g.fillText(`${Math.round(w.gfa).toLocaleString('en-CA')} m²`, w.x + ww + 4, w.y); }
    }
  }
  g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(L.pad.left, L.ground); g.lineTo(x1, L.ground); g.stroke();
  tag('±0.0 m', L.ground + 3);
  g.font = "9px 'IBM Plex Mono', Menlo, monospace"; g.fillStyle = MUTED; g.fillText('Indicative early-design estimate · Program Value Visualizer', L.pad.left, H - 14);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
function openDiagram() {
  const dlg = $('#diagram');
  const preview = h('div', { class: 'dg-preview' });
  const draw = () => { preview.innerHTML = diagramSVG(false); };
  const seg = (key, label, options) => h('div', { class: 'field' }, h('span', { class: 'flabel' }, label), h('div', { class: 'chips', role: 'radiogroup', 'aria-label': label }, options.map(([v, l]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(diagramOpts[key] === v), class: 'prio' }, l);
    b.addEventListener('click', () => { diagramOpts[key] = v; b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
    return b;
  })));
  put(dlg, h('div', { class: 'help dg' },
    h('div', { class: 'help-head' }, h('h2', { id: 'diagramTitle' }, 'Programme diagram'), h('button', { class: 'close', 'aria-label': 'Close', onclick: () => dlg.close() }, '×')),
    h('p', { class: 'note' }, 'Your floors drawn to true height, inside the tower’s own outline (each floor as wide as its plate). Each band is written as its programmes; a word is larger when it takes more floor area. Elevations at the right.'),
    h('div', { class: 'dg-tools' },
      seg('shape', 'Shape', [['tower', 'Tower outline'], ['bar', 'Straight bar']]),
      seg('proportion', 'Width', [['fit', 'Fit width'], ['true', 'True proportion']]),
      seg('colour', 'Colour', [['family', 'By family'], ['ink', 'Ink only']]),
      seg('labels', 'Words', [['names', 'Programme names'], ['tenure', 'Tenure groups']]),
      seg('groupBy', 'Bands by', [['programme', 'Main programme'], ['family', 'Family']]),
      seg('showArea', 'Areas', [[false, 'Hide'], [true, 'Show m²']])),
    preview,
    h('div', { class: 'toolbar' },
      h('button', { class: 'primary', onclick: () => offerFile('programme-section.svg', diagramSVG(true), 'image/svg+xml') }, 'Download SVG'),
      h('button', { onclick: async () => { const blob = await diagramPNG(3); offerFile('programme-section.png', blob, 'image/png'); } }, 'Download PNG (3×)'),
      h('button', { onclick: () => dlg.close() }, 'Close'))));
  draw();
  dlg.showModal();
}

// ---------- Find a mix that works ----------
let optOpts = null, lastOpt = null;
const VERDICT_RANK_UI = { works: 4, marginal: 3, needs_land: 2, doesnt_work: 1, incomplete: 0 };
function runOptimiser(o) {
  const res = optimiseMix(state.floors, data, effSettings(), o);
  lastOpt = res;
  return res;
}
/** Put the optimiser's stack on the section: one Undo reverses it. */
function applyOptimised(res) {
  if (!res?.best || res.best.keptCurrent) return false;
  const byLevel = new Map(res.best.floors.map(f => [f.level, f.mix]));
  pushHistory();
  state.floors = state.floors.map(f => (byLevel.has(f.level) ? { ...f, mix: byLevel.get(f.level).map(m => ({ ...m })) } : f));
  state.sel = null; editMix = null; refresh();
  return true;
}
function optSummary(res) {
  const b = res.best, r = b?.result, head = x => (x ? +(((x.totals.rlvAfterCac) - (x.totals.landPrice ?? 0)) / 1e6).toFixed(1) : null);
  return {
    verdict: r ? VERDICT[r.verdict] : 'no feasible mix', headroom_cad_millions: head(r), strategy: b?.strategy.name ?? null, kept_current: !!b?.keptCurrent,
    current: { verdict: VERDICT[res.current.verdict], headroom_cad_millions: head(res.current) },
    strategies: res.strategies.map(s => ({ name: s.strategy.name, feasible: s.feasible, verdict: s.result ? VERDICT[s.result.verdict] : null, headroom_cad_millions: head(s.result), cac_cad_millions: s.result ? +(s.result.totals.cac / 1e6).toFixed(1) : null })),
    report: res.report, ms: res.ms,
  };
}
function openOptimiser(seedOpts = null) {
  const dlg = $('#optimise');
  const D = optimiserDefaults(data);
  const o = { ...(optOpts || D) };
  delete o.seed; delete o.seedLabel;
  if (seedOpts?.seed) { o.seed = seedOpts.seed; o.seedLabel = seedOpts.seedLabel; lastOpt = null; }
  const brief = data.brief?.rules?.some(r => r.id === 'min_nonres_fsr');
  const check = (key, label, note) => { const i = h('input', { type: 'checkbox', id: `op-${key}`, checked: !!o[key] }); i.addEventListener('change', () => { o[key] = i.checked; }); return h('label', { for: `op-${key}`, class: 'chk' }, i, ' ', label, note ? h('span', { class: 'note' }, ` — ${note}`) : null); };
  const numIn = (key, label, step, min, max, unit, src) => numField(`op-${key}`, label, o[key], { step, min, max, unit, src, onchange: v => { o[key] = v == null ? D[key] : v; } });
  const A = data.assumptions.optimiser || {};
  const out = h('div', { class: 'opt-out' });
  const runBtn = h('button', { class: 'primary', onclick: () => {
    runBtn.disabled = true; runBtn.textContent = 'Searching…';
    setTimeout(() => {   // let the button repaint first
      try { optOpts = o; const res = runOptimiser(o); showResult(res); } catch (e) { put(out, h('p', { class: 'neg' }, e.message)); }
      runBtn.disabled = false; runBtn.textContent = 'Search again';
    }, 30);
  } }, 'Find a mix');
  const showResult = res => {
    const b = res.best, r = b?.result, cur = res.current;
    const hr = x => (x ? x.totals.rlvAfterCac - (x.totals.landPrice ?? 0) : null);
    const kpis = h('div', { class: 'kpis' },
      kpi('Best found', r ? VERDICT[r.verdict] : 'No mix meets the rules', r ? (r.verdict === 'works' ? 'pos' : r.verdict === 'doesnt_work' ? 'neg' : '') : 'neg'),
      kpi('Headroom over land', r ? M(hr(r)) : '—', r ? signCls(hr(r)) : '', 'Residual land value after CAC − land price'),
      kpi('Current stack', `${VERDICT[cur.verdict]} · ${M(hr(cur))}`),
      kpi('Strategy', b ? b.strategy.name : '—'));
    const tbl = h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Strategy'), h('th', {}, 'Verdict'), h('th', { class: 'num' }, 'Headroom'), h('th', { class: 'num' }, 'CAC'))),
      h('tbody', {}, res.strategies.map(s => h('tr', { class: b && s.strategy.id === b.strategy.id ? 'chosen' : null }, h('td', {}, s.strategy.name), h('td', {}, s.result ? VERDICT[s.result.verdict] : 'not possible'), h('td', { class: `num ${signCls(s.headroom)}` }, s.result ? M(s.headroom) : '—'), h('td', { class: 'num' }, s.result ? M(s.result.totals.cac) : '—'))))));
    const apply = h('button', { class: 'primary', disabled: !b || b.keptCurrent, onclick: () => { if (applyOptimised(res)) { dlg.close(); toast('Mix applied. Undo reverses it.'); } } }, b?.keptCurrent ? 'The current stack is already the best' : 'Apply to section');
    put(out, kpis, tbl, h('pre', { class: 'opt-report' }, res.report), h('p', { class: 'note' }, `Searched ${res.strategies.length} strategies in ${res.ms} ms. Nothing changes until you press Apply; one Undo reverses it.`), h('div', { class: 'toolbar' }, apply, h('button', { onclick: () => dlg.close() }, 'Close')));
  };
  put(dlg, h('div', { class: 'help opt' },
    h('div', { class: 'help-head' }, h('h2', { id: 'optTitle' }, 'Find a mix that works'), h('button', { class: 'close', 'aria-label': 'Close', onclick: () => dlg.close() }, '×')),
    o.seedLabel ? h('p', { class: 'scenario-note' }, h('b', {}, 'Seeded from '), o.seedLabel, ': moving away from its uses costs a penalty, so its character stays.') : null,
    scenarioBanner(true),
    h('p', { class: 'note' }, 'Keeps your building form (floors, heights, plates) and searches for the uses that give the best verdict and the most headroom over the land price, within the brief and market caps. Each floor is scored with the full calculator; a step-by-step search picks the stack; whole buildings are then checked again.'),
    h('details', { open: !lastOpt }, h('summary', {}, 'Options'),
      h('div', { class: 'opt-grid' },
        check('respectFsr', 'Meet the brief’s 9.0 FSR non-residential rule', brief ? `hotel counts as ${settingsFull().hotelAsNonResidential ? 'non-residential' : 'residential'} (Assumptions)` : 'no brief rule'),
        check('allowSale', 'Allow condos for sale'),
        check('allowDeck', 'Allow a ticketed observation deck'),
        check('keepPublic', 'Keep the public and civic floors you have'),
        check('inclusionary', 'Keep a share of housing as below-market rental', 'optional policy proxy')),
      h('p', { class: 'note' }, 'Locked floors (Floors tab) are never changed. Below grade becomes parking; plant floors stay.'),
      h('div', { class: 'grid3' },
        numIn('inclusionaryShare', 'Below-market share', 0.05, 0, 0.4, 'share', A.inclusionary_share),
        numIn('maxHotelKeys', 'Most hotel keys', 10, 0, 2000, 'keys', A.max_hotel_keys),
        numIn('maxDeckFloors', 'Most deck floors', 1, 0, 3, null, A.max_deck_floors),
        numIn('maxLuxuryShare', 'Luxury share of sale housing', 0.05, 0, 1, 'share', A.max_luxury_condo_share),
        numIn('minBand', 'Shortest run of one use', 1, 1, 8, 'floors', A.min_band_floors),
        numIn('switchPenaltyShare', 'Penalty per change of use', 0.005, 0, 0.1, 'of a floor', A.switch_penalty_share))),
    h('div', { class: 'toolbar' }, runBtn, h('span', { class: 'note' }, 'Takes about a second.')),
    out));
  if (lastOpt) showResult(lastOpt);
  dlg.showModal();
}

// ---------- Precedent presets and market scenarios ----------
const precedentById = id => (raw.precedents?.presets || []).find(p => p.id === id) || null;
function setScenario(sc) { pushHistory(); state.scenario = sc; refresh(); }
function scenarioBanner(compact = false) {
  const label = scenarioLabel(state.scenario, data, raw.precedents);
  if (!label) return null;
  return h('div', { class: 'scenario-note' }, h('b', {}, 'Scenario: '), label, compact ? null : ' — an optional overlay, not the 2026 defaults. ', h('button', { class: 'linkish', onclick: () => setScenario(null) }, 'Turn off'));
}
/** A tiny section of a preset: bands coloured by the family of their main use. */
function presetMini(p, w = 30, hgt = 96) {
  const strip = presetStrip(p, data);
  return h('span', { class: 'mini-sec', 'aria-hidden': 'true', html: `<svg viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}">${strip.map(s => `<rect x="2" y="${(hgt - 2 - s.to * (hgt - 4)).toFixed(1)}" width="${w - 4}" height="${Math.max(1, (s.to - s.from) * (hgt - 4) - 0.6).toFixed(1)}" fill="${esc(famColour(s.family))}"/>`).join('')}<line x1="0" x2="${w}" y1="${hgt - 2}" y2="${hgt - 2}" stroke="currentColor" stroke-width="1"/></svg>` });
}
function applyPresetToPage(p, withContext) {
  const built = applyPreset(state.floors, p, data, { podiumTopFloor: settingsFull().podiumTopFloor });
  pushHistory();
  state.floors = built.floors; state.precedent = p.id; state.sel = null; editMix = null;
  if (withContext && p.context) state.scenario = { kind: 'precedent', id: p.id };
  else if (state.scenario?.kind === 'precedent') state.scenario = null;
  refresh();
  return built;
}
function relyPanel() {
  const p = state.precedent ? precedentById(state.precedent) : null;
  if (!p) return null;
  const on = state.scenario?.kind === 'precedent' && state.scenario.id === p.id;
  const ctxBox = p.context ? h('label', { class: 'chk' }, (() => { const i = h('input', { type: 'checkbox', checked: on }); i.addEventListener('change', () => setScenario(i.checked ? { kind: 'precedent', id: p.id } : null)); return i; })(), ' Use this precedent’s market context', h('span', { class: 'note' }, ` (${p.context.label}): `), p.context.items.map(it => h('span', { class: 'note', 'data-tip': `${it.note} · grade ${it.grade}` }, `${it.setting} → ${it.to}; `))) : null;
  return h('div', { class: 'rely' },
    h('div', { class: 'rely-head' }, presetMini(p, 22, 60), h('div', {}, h('strong', {}, `From a precedent: ${p.name}`), h('div', { class: 'note' }, `${p.city} · ${p.height_m} m · ${p.floors} floors · ${p.year_complete ?? p.status}`)),
      h('button', { class: 'linkish', style: 'margin-left:auto', onclick: () => { state.precedent = null; save(); renderTab(); } }, 'Hide')),
    h('p', { class: 'note' }, p.why),
    h('div', {}, h('b', {}, 'What this precedent relied on'), h('ul', { class: 'note' }, p.relied_on.map(x => h('li', {}, x)))),
    p.approximation ? h('p', { class: 'note' }, `Mapping: ${p.approximation}`) : null,
    ctxBox,
    h('div', { class: 'toolbar' }, h('button', { onclick: () => openOptimiser({ seed: state.floors.map(f => ({ level: f.level, mix: f.mix })), seedLabel: p.name }) }, 'Polish with Find a mix that works')));
}
function openPresets() {
  const dlg = $('#presets');
  const list = raw.precedents?.presets || [];
  const card = p => {
    const withCtx = p.context ? h('input', { type: 'checkbox', id: `pc-${p.id}` }) : null;
    return h('div', { class: 'pcard' },
      presetMini(p),
      h('div', { class: 'pcard-body' },
        h('strong', {}, p.name), h('div', { class: 'note' }, `${p.city} · ${p.height_m} m · ${p.floors} floors · ${p.year_complete ?? p.status}`),
        h('p', { class: 'pwhy' }, p.why),
        h('div', { class: 'toolbar' },
          h('button', { class: 'primary', onclick: () => { applyPresetToPage(p, withCtx?.checked); dlg.close(); showTab('verdict'); toast(`${p.name} applied to your floors. Undo reverses it.`); } }, 'Apply to my tower'),
          withCtx ? h('label', { for: `pc-${p.id}`, class: 'chk small' }, withCtx, ' with its market context') : null)));
  };
  const sel = h('select', { id: 'mktSel', 'aria-label': 'Market scenario' }, h('option', { value: '' }, '2026 now (default)'), Object.entries(data.assumptions.scenarios || {}).filter(([k, v]) => v?.label && v.items?.length).map(([k, v]) => h('option', { value: k, selected: state.scenario?.kind === 'market' && state.scenario.id === k }, v.label)));
  sel.addEventListener('change', () => setScenario(sel.value ? { kind: 'market', id: sel.value } : null));
  put(dlg, h('div', { class: 'help presets' },
    h('div', { class: 'help-head' }, h('h2', { id: 'presetsTitle' }, 'Start from a precedent'), h('button', { class: 'close', 'aria-label': 'Close', onclick: () => dlg.close() }, '×')),
    h('p', { class: 'note' }, 'Stacks of built or approved towers, mapped onto your floors by height (your geometry stays). Each card says what made it work. Its market context is optional and always labelled; it never changes the 2026 defaults by itself.'),
    h('div', { class: 'field' }, h('label', { for: 'mktSel' }, 'Market scenario'), sel),
    h('div', { class: 'pgallery' }, list.map(card)),
    h('p', { class: 'note' }, `Sources and floor ranges: catalogue/precedents.json and docs/precedents.md. ${raw.precedents?.meta?.not_included || ''}`)));
  dlg.showModal();
}

// ---------- Help guide and "Show me" tour ----------
const HELP_KEY = 'pvv-help-seen';
/** The standalone Tower Money Book page (set once it is published; null hides the link). */
const BOOK_URL = 'https://claude.ai/artifact/B3GNW8SaozeMKDPdN5gpHP';
function openHelp(view = 'use', chapter = 0) {
  const dlg = $('#help');
  const step = (n, title, ...body) => h('li', {}, h('strong', {}, title), ' ', ...body);
  const pill = (cls, t) => h('span', { class: `pill ${cls}` }, t);
  put(dlg, h('div', { class: 'help' },
    h('div', { class: 'help-head' }, h('h2', { id: 'helpTitle' }, 'How this tool works'), h('button', { class: 'close', 'aria-label': 'Close help', onclick: () => dlg.close() }, '×')),
    h('p', {}, 'It answers one question: after paying for construction, City charges and a normal developer profit, ', h('b', {}, 'is there enough money left to pay for the land?')),
    h('p', { class: 'note' }, 'You do not need to know any prices. Every use (programme) already has a number. You can change any of them.'),
    h('h3', {}, 'Five steps'),
    h('ol', { class: 'help-steps' },
      step(1, 'Start with a tower.', 'A sample tower opens by default. Or answer a few questions in “Start from your concept” (Ask AI tab): it arranges a starting stack and explains why, with AI or with fixed rules. You can also set the height and plate sizes under the section, or import your floors from a CSV or JSON file.'),
      step(2, 'Select floors.', 'Click a floor in the section (the tower drawing). Shift-click a second floor to select a range.'),
      step(3, 'Set the mix.', 'In the Floors tab, press “Add a programme…” and pick from the picture list (filter by family or search; arrow keys and Enter work too). It joins the mix. Set each share (they must add to 100%), then press Apply. The programme card shows its value and cost per m². Type your own number there if you know better.'),
      step(4, 'Read the verdict.', 'The Verdict tab compares what the building is worth with what it costs. Enter a land price, or read the land budget: what the scheme could pay for the land. “Find a mix that works” keeps your floors and searches the uses that give the best result, and says plainly when nothing works. “Presets” starts from a built tower (Living Shangri-La, Lotte World Tower and others) and shows what it relied on.'),
      step(5, 'Check, then ask.', 'The City ledger shows what the City receives. Sensitivity shows which numbers move the result most. The Map shows the neighbouring roofs around a point you click. “Diagram” (above the section) exports a programme word-stack drawing as SVG or PNG. Method & sources shows where every number comes from. Ask AI (on claude.ai) explains the result and can edit the scheme for you.')),
    h('h3', {}, 'What the verdict means'),
    h('ul', { class: 'help-list' },
      h('li', {}, pill('works', 'Works'), ' There is enough money for the land at a normal profit (15%).'),
      h('li', {}, pill('marginal', 'Marginal'), ' Close: within 10% of the land price, a thin profit, or it relies on condo presales in a weak market.'),
      h('li', {}, pill('doesnt_work', "Doesn't work"), ' Not enough money, or it loses money even if the land were free.'),
      h('li', {}, pill('needs_land', 'Land price needed'), ' Enter a land price to get a verdict; until then the tool shows the land budget.'),
      h('li', {}, pill('incomplete', 'Incomplete'), ' No floors yet, or nothing on them has a cost.')),
    h('h3', {}, 'How sure is each number?'),
    h('ul', { class: 'help-list' },
      h('li', {}, gradeTag('A'), ' From a professional 2025–26 report, checked on the page.'),
      h('li', {}, gradeTag('B'), ' From a secondary or older source.'),
      h('li', {}, gradeTag('C'), ' Arithmetic or an assumption.'),
      h('li', {}, h('span', { class: 'typ researched' }, 'typical · researched'), ' A starting number built from a 2025–26 Vancouver, BC or Canadian figure found by search. Grade C.'),
      h('li', {}, h('span', { class: 'typ analogy' }, 'typical · analogy'), ' No usable figure was found, so it borrows from a similar use. Grade C: the weakest numbers in the tool.'),
      h('li', {}, 'Hover or tap “source” next to a number to see where it comes from and when it was published.')),
    h('h3', {}, 'Limits'),
    h('p', { class: 'note' }, 'Every result is an indicative early-design estimate. It is for comparing early options. It is not a feasibility study, an appraisal or a compliance check. Market data is a snapshot from 2026, and the map is visual context, not survey data.'),
    h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: () => { dlg.close(); startTour(); } }, 'Show me'), h('button', { onclick: () => dlg.close() }, 'Close'))));
  // two views: using the tool, and the Tower Money Book (same symbols as the tool)
  const box = dlg.querySelector('.help'), head = box.firstChild;
  const useView = h('div', { class: 'help-view', id: 'helpUse', role: 'tabpanel' }); while (head.nextSibling) useView.append(head.nextSibling);
  const moneyView = h('div', { class: 'help-view', id: 'helpMoney', role: 'tabpanel', hidden: true });
  useView.prepend(h('p', { class: 'help-promo' }, h('span', { 'aria-hidden': 'true', html: sym('coins', 22) }), 'New to development finance? ', h('button', { class: 'linkish', onclick: () => setView('money') }, 'Read “How the money works”'), ': 13 short illustrated chapters in plain language, with the same symbols as the tool.'));
  const tabBtn = (v, label) => h('button', { role: 'tab', class: 'help-tab', 'data-view': v, 'aria-selected': 'false', onclick: () => setView(v) }, label);
  const tabs = h('div', { class: 'help-tabs', role: 'tablist', 'aria-label': 'Help' }, tabBtn('use', 'Using the tool'), tabBtn('money', 'How the money works'));
  let rendered = false;
  const setView = (v, ch = 0) => {
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.view === v));
    useView.hidden = v !== 'use'; moneyView.hidden = v !== 'money';
    if (v === 'money' && (!rendered || ch)) { rendered = true; renderMoneyStory(moneyView, { data, mode: 'guide', start: ch, bookUrl: BOOK_URL, onGoto: tab => { dlg.close(); showTab(tab); } }); }
  };
  head.after(tabs); box.append(useView, moneyView);
  setView(view, chapter);
  dlg.showModal();
  try { localStorage.setItem(HELP_KEY, '1'); } catch (e) { /* storage unavailable */ }
}
const TOUR = [
  { sel: '#section', tab: null, title: '1 · The section', text: 'Your tower, drawn to scale. Each band is a floor, coloured by its main use. The bars on the right show value minus cost: green floors earn money, red floors need support from others. Click a floor to select it.' },
  { sel: '#tabs button[data-tab="floors"]', tab: 'floors', title: '2 · Floors', text: 'Here you set the mix of the selected floors: pick a programme, set its share, press Apply. Every programme already has a value and cost; type your own to replace them.' },
  { sel: '#tab-verdict .verdict', tab: 'verdict', title: '3 · The verdict', text: 'Works, Marginal or Doesn\'t work: does the building leave enough money for the land? Enter a land price below it, or read the land budget.' },
  { sel: '#tabs button[data-tab="city"]', tab: 'city', title: '4 · City ledger', text: 'What the City and the public receive: development charges, amenity charges, community contributions and in-kind space.' },
  { sel: '#tabs button[data-tab="sens"]', tab: 'sens', title: '5 · Sensitivity', text: 'Which numbers move the result most. Check the widest bars first.' },
  { sel: '#tabs button[data-tab="map"]', tab: 'map', title: '6 · Map', text: 'Downtown Vancouver by building height. Click a point to estimate the neighbouring roofs.' },
  { sel: '#tabs button[data-tab="ai"]', tab: 'ai', title: '7 · Ask AI', text: 'On claude.ai, ask questions in plain words or ask for changes. Undo reverses anything it does.' },
  { sel: '#helpBtn', tab: 'verdict', title: 'That is it', text: 'Open Help again any time. Every number shows its source and grade when you hover or tap “source”.' },
];
let tourAt = -1;
function startTour() { tourAt = 0; showTourStep(); }
function endTour() { tourAt = -1; document.querySelector('.tour-ring')?.remove(); document.querySelector('.tour-card')?.remove(); window.removeEventListener('resize', showTourStep); }
function showTourStep() {
  if (tourAt < 0) return;
  const s = TOUR[tourAt];
  if (s.tab && activeTab !== s.tab) showTab(s.tab);
  const el = document.querySelector(s.sel);
  if (!el) { if (tourAt < TOUR.length - 1) { tourAt++; return showTourStep(); } return endTour(); }
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  let ring = document.querySelector('.tour-ring'), card = document.querySelector('.tour-card');
  if (!ring) { ring = h('div', { class: 'tour-ring', 'aria-hidden': 'true' }); document.body.append(ring); }
  if (!card) { card = h('div', { class: 'tour-card', role: 'dialog', 'aria-live': 'polite', 'aria-label': 'Guided tour' }); document.body.append(card); window.addEventListener('resize', showTourStep); }
  const last = tourAt === TOUR.length - 1;
  put(card, h('strong', {}, s.title), h('p', {}, s.text),
    h('div', { class: 'toolbar' },
      tourAt > 0 ? h('button', { onclick: () => { tourAt--; showTourStep(); } }, 'Back') : null,
      h('button', { class: 'primary', onclick: () => { if (last) endTour(); else { tourAt++; showTourStep(); } } }, last ? 'Done' : 'Next'),
      !last ? h('button', { onclick: endTour }, 'Skip') : null,
      h('span', { class: 'note' }, `${tourAt + 1} / ${TOUR.length}`)));
  card.querySelector('button.primary').focus({ preventScroll: true });
  const place = () => {
    const r = el.getBoundingClientRect(), pad = 6;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    const cw = card.offsetWidth, ch = card.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    if (vw < 600) { Object.assign(card.style, { left: '12px', right: '12px', top: 'auto', bottom: '12px' }); return; }
    const below = r.bottom + 12 + ch < vh, top = below ? r.bottom + 12 : Math.max(12, r.top - ch - 12);
    Object.assign(card.style, { right: 'auto', bottom: 'auto', left: `${Math.min(vw - cw - 12, Math.max(12, r.left))}px`, top: `${Math.min(vh - ch - 12, top)}px` });
  };
  place(); setTimeout(place, 350);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && tourAt >= 0) endTour(); });
document.addEventListener('scroll', () => { if (tourAt >= 0) { const s = TOUR[tourAt], el = document.querySelector(s.sel), ring = document.querySelector('.tour-ring'); if (el && ring) { const r = el.getBoundingClientRect(); ring.style.left = `${r.left - 6}px`; ring.style.top = `${r.top - 6}px`; } } }, { passive: true });

// ---------- boot ----------
async function boot() {
  wireTips();
  try { await loadData(); } catch (e) { put($('#tab-verdict'), h('p', { class: 'neg' }, 'Could not load the data pack: ' + e.message)); return; }
  const saved = load();
  if (saved) { state.brief = raw.briefs[saved.brief] ? saved.brief : 'vtc-2026'; const ms = saved.mapSite; if (ms && Number.isFinite(ms.x) && Number.isFinite(ms.y) && Math.abs(ms.x) < 1e5 && Math.abs(ms.y) < 1e5) state.mapSite = { x: ms.x, y: ms.y };
    const sc = saved.scenario; if (sc && ['market', 'precedent'].includes(sc.kind) && typeof sc.id === 'string') state.scenario = { kind: sc.kind, id: sc.id };
    if (typeof saved.precedent === 'string') state.precedent = saved.precedent; }
  buildData();
  if (saved) { try { state.floors = normaliseFloors(saved.floors); state.settings = saved.settings && typeof saved.settings === 'object' ? saved.settings : {}; evaluate(state.floors, data, state.settings); } catch (e) { state.floors = []; state.settings = {}; } }
  if (!state.floors.length) state.floors = sampleTower();
  $('#briefSel').value = state.brief;
  $('#briefSel').addEventListener('change', e => { pushHistory(); state.brief = e.target.value; buildData(); refresh(); });
  $('#undoBtn').addEventListener('click', undo);
  $('#helpBtn').addEventListener('click', () => openHelp());
  if (!document.getElementById('ms-style')) document.head.append(h('style', { id: 'ms-style' }, MONEY_STACK_CSS));
  $('#diagramBtn').addEventListener('click', openDiagram);
  $('#presetsBtn').addEventListener('click', openPresets);
  $('#optTopBtn').addEventListener('click', openOptimiser);
  let seen = false; try { seen = !!localStorage.getItem(HELP_KEY); } catch (e) { seen = true; }
  $('#themeBtn').addEventListener('click', () => { const r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; if (activeTab === 'map') renderMap(); });
  $('#section').addEventListener('click', onSectionClick);
  for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));
  $('#genBtn').addEventListener('click', () => { pushHistory(); state.floors = sampleTower({ height: +$('#gHeight').value, podiumFloors: +$('#gPodium').value, podiumPlate: +$('#gPodiumPlate').value, towerPlate: +$('#gTowerPlate').value, topPlate: +$('#gTopPlate').value, belowGrade: +$('#gBelow').value }); state.sel = null; editMix = null; refresh(); });
  $('#fileIn').addEventListener('change', e => importFile(e.target.files[0]));
  $('#tmplBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(TEMPLATE); toast('CSV template copied.'); } catch (e) { toast('Copy failed; the columns are listed below the buttons.'); } });
  refresh();
  if (!seen) openHelp();   // first visit: show the guide once
}
boot();
