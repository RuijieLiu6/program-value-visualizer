// Program Value Visualizer — "programme word-stack" section diagram.
// Pure functions (no page code): layout from evaluated floors, and an SVG string.
// The genre: a vertical section where each band of floors is written as programme words,
// the word size following how much floor area the programme takes. Drawn in this tool's
// own visual language (light paper, ink or family colours, a condensed display face).

export const FONT_STACK = "'Oswald','Archivo Narrow','Barlow Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif";
/** Average advance of an uppercase letter in a bold condensed face, as a share of the font size (kept a little generous). */
export const CHAR_W = 0.56;
const LINE = 1.02;          // line height as a share of font size (caps only, tight)
const MIN_FONT = 5;

const SHORT = {
  LV1: 'Condos', LV2: 'Penthouses', LV3: 'Branded residences', LV4: 'Rental homes', LV5: 'Below-market rental', LV6: 'Social housing', LV7: 'Student housing', LV8: 'Co-living', LV11: 'Seniors homes',
  WK1: 'Offices', WK2: 'Offices B', WK3: 'Co-working', WK4: 'Labs', WK5: 'Civic offices', WK6: 'Incubator',
  ST1: 'Luxury hotel', ST2: 'Hotel', ST3: 'Serviced apartments', ST4: 'Hostel', ST5: 'Residency',
  SE1: 'Shops', SE2: 'Grocery', SE3: 'Food hall', SE4: 'Café', AM4: 'Lobby', AM7: 'Parking', AM8: 'Public parking',
  SB1: 'Core', SB2: 'Mechanical', SB3: 'Refuge', SB4: 'Belt truss', SB5: 'Transfer', SB8: 'Roof plant', SB9: 'Amenity', SB10: 'Storage', SB11: 'Waste',
  LE1: 'Observation deck', LE2: 'Public deck', LE3: 'Sky bar', CH1: 'Childcare', CH2: 'Clinic', GP5: 'Community hall', GP6: 'Gallery', MP1: 'Gym', MP2: 'Pool', LN3: 'Campus', LN4: 'Library',
};
const TENURE = { sell: 'For sale', lease: 'For rent', operate: 'Operated', public: 'Public', support: 'Support' };
/** A short word for a programme: a curated name, else the first part of its catalogue name. */
export function shortName(id, data) {
  if (SHORT[id]) return SHORT[id];
  const n = data.programmes.get(id)?.name ?? id;
  return n.replace(/\(.*?\)/g, '').split(/ \/ |,| — | - /)[0].trim();
}
const estWidth = (text, size) => text.length * size * CHAR_W;
const elevTag = z => `${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(1)} m`;

/**
 * Lay out the diagram.
 * result: evaluate() output (its floors carry items with gfa); options:
 *   groupBy 'programme' | 'family' (what makes a band), labels 'names' | 'tenure', width (px), scale (px per m),
 *   shape 'tower' (words set inside the tower's own outline, plate width = sqrt(plate area)) | 'bar' (one straight column),
 *   proportion 'fit' (widest plate fills the column) | 'true' (same scale across as up, capped to the column).
 * Returns { width, height, colW, bands: [{ fromLevel, toLevel, z0, z1, y0, y1, key, words: [{ text, id, family, gfa, size, x, y, dominant }] }], ground, top }.
 */
export function wordStackLayout(result, data, { groupBy = 'programme', labels = 'names', width = 640, scale = null, showArea = false, shape = 'tower', proportion = 'fit' } = {}) {
  const floors = [...result.floors].filter(f => f.items.length).sort((a, b) => a.level - b.level);
  if (!floors.length) return { width, height: 200, colW: width, bands: [], ground: 100, top: 0, pad: 0 };
  const zMin = Math.min(...floors.map(f => f.elevation_m)), zMax = Math.max(...floors.map(f => f.elevation_m + f.height_m));
  const pad = { top: 46, bottom: 44, left: 18, right: 92 };
  const k = scale ?? Math.max(1.6, Math.min(4, 980 / Math.max(1, zMax - zMin)));
  const colW = width - pad.left - pad.right - (showArea ? 70 : 0);   // room for the m² figure after each word
  const y = z => pad.top + (zMax - z) * k;
  // tower outline: each floor drawn as wide as its plate (side of a square of the same area), centred on one axis
  const tower = shape === 'tower';
  const side = f => Math.sqrt(Math.max(1, f.area_m2 || f.gfa || 1));
  const maxSide = Math.max(...floors.map(side));
  const kx = tower ? Math.min(colW / maxSide, proportion === 'true' ? k : Infinity) : 0;
  const axis = pad.left + colW / 2;
  const fx = f => (tower ? [axis - side(f) * kx / 2, axis + side(f) * kx / 2] : [pad.left, pad.left + colW]);
  const INSET = tower ? 5 : 0;
  let outline = null;
  if (tower) {   // up the left edges, down the right edges
    const left = [], right = [];
    for (const f of floors) { const [a, b] = fx(f), yt = y(f.elevation_m + f.height_m), yb = y(f.elevation_m); left.push([a, yb], [a, yt]); right.push([b, yb], [b, yt]); }
    const pts = [...left, ...right.reverse()];
    outline = 'M' + pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' L') + ' Z';
  }
  const tenureOf = i => TENURE[i.earnsBy] || 'Support';
  const wordKey = i => (labels === 'tenure' ? tenureOf(i) : i.programme_id);
  const mainOf = f => {
    const by = new Map();
    for (const i of f.items) { const kk = groupBy === 'family' ? i.family_id : wordKey(i); by.set(kk, (by.get(kk) || 0) + i.gfa); }
    return [...by].sort((a, b) => b[1] - a[1])[0][0];
  };
  // contiguous floors with the same main programme (or family) form a band
  const bands = [];
  for (const f of floors) {
    const key = mainOf(f), last = bands[bands.length - 1];
    if (last && last.key === key && f.level === last.toLevel + 1) { last.toLevel = f.level; last.z1 = f.elevation_m + f.height_m; last.floors.push(f); }
    else bands.push({ key, fromLevel: f.level, toLevel: f.level, z0: f.elevation_m, z1: f.elevation_m + f.height_m, floors: [f] });
  }
  for (const b of bands) {
    b.y0 = y(b.z1); b.y1 = y(b.z0);
    const h = b.y1 - b.y0;
    // the band's text column: the narrowest floor in the band, so every word stays inside the outline
    const spans = b.floors.map(fx), x0 = Math.max(...spans.map(sp => sp[0])) + INSET, x1 = Math.min(...spans.map(sp => sp[1])) - INSET;
    const top = fx(b.floors[b.floors.length - 1]);
    b.rx0 = top[0]; b.rx1 = top[1];
    const colW = Math.max(12, x1 - x0), left0 = x0;
    const area = new Map();
    for (const f of b.floors) for (const i of f.items) {
      const kk = wordKey(i), e = area.get(kk) || { id: labels === 'tenure' ? null : i.programme_id, family: i.family_id, text: labels === 'tenure' ? tenureOf(i) : shortName(i.programme_id, data), gfa: 0 };
      e.gfa += i.gfa; area.set(kk, e);
    }
    const words = [...area.values()].sort((a, b) => b.gfa - a.gfa).map(w => ({ ...w, text: w.text.toUpperCase() }));
    const [dom, ...minor] = words;
    // the dominant word fills the column width, limited by the band height
    const minorRoom = minor.length ? 0.38 : 0;
    dom.size = Math.max(MIN_FONT, Math.min(colW / (dom.text.length * CHAR_W), (h * (1 - minorRoom) - 2) / LINE));
    dom.dominant = true;
    // minor words share one scale (size = s * sqrt(area)), so size grows with area; each stays under the dominant and inside the column
    let s = minor.length ? Math.min(...minor.map(w => Math.min(colW / (w.text.length * CHAR_W), dom.size * 0.92) / Math.sqrt(w.gfa))) : 0;
    const flow = sc => {   // greedy line wrap; returns lines of words and the block height
      const lines = []; let line = [], lw = 0;
      for (const w of minor) {
        const sz = Math.max(MIN_FONT, sc * Math.sqrt(w.gfa)), ww = estWidth(w.text, sz);
        if (line.length && lw + 6 + ww > colW) { lines.push(line); line = []; lw = 0; }
        line.push({ w, sz, ww }); lw += (line.length > 1 ? 6 : 0) + ww;
      }
      if (line.length) lines.push(line);
      return { lines, height: lines.reduce((a, l) => a + Math.max(...l.map(x => x.sz)) * LINE, 0) };
    };
    let fl = flow(s);
    for (let n = 0; minor.length && fl.height > h - dom.size * LINE - 2 && n < 40 && s * Math.sqrt(minor[minor.length - 1].gfa) > MIN_FONT; n++) { s *= 0.9; fl = flow(s); }
    // place: dominant on top, minor lines under it, block centred in the band
    const block = dom.size * LINE + fl.height;
    let cy = b.y0 + Math.max(0, (h - block) / 2);
    dom.x = left0; dom.y = cy + dom.size * 0.86; cy += dom.size * LINE;
    for (const line of fl.lines) {
      const lh = Math.max(...line.map(x => x.sz)) * LINE;
      let cx = left0;
      for (const { w, sz, ww } of line) { w.size = sz; w.x = cx; w.y = cy + lh * 0.86; cx += ww + 6; }
      cy += lh;
    }
    b.words = words;
    b.overflow = block > h + 0.5;
    delete b.floors;
  }
  return { width, height: y(zMin) + pad.bottom, colW, pad, bands, ground: y(0), top: y(zMax), zMin, zMax, k, shape: tower ? 'tower' : 'bar', outline };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Darken a #rrggbb colour so words read on light paper. */
export function inkOf(hex, k = 0.38) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#1d2730';
  const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * (1 - k)));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * SVG string for a layout. options: colour 'family' | 'ink', showArea (adds m² after each word),
 * title, footer, families (Map id -> {colour, name}), embedFont (adds a Google Fonts @import for files opened elsewhere).
 */
export function wordStackSVG(L, { colour = 'family', showArea = false, title = 'Programme section', footer = 'Indicative early-design estimate · Program Value Visualizer', families = new Map(), embedFont = true } = {}) {
  const PAPER = '#f6f3ec', INK = '#1d2730', RULE = '#b9b2a4', MUTED = '#6b6458';
  const W = L.width, H = Math.ceil(L.height), x1 = L.pad ? L.width - L.pad.right : W;
  const fill = w => (colour === 'family' ? inkOf(families.get(w.family)?.colour) : INK);
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}: programme words stacked by elevation">`);
  out.push(`<style>${embedFont ? "@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&amp;display=swap');" : ''}.w{font-family:${esc(FONT_STACK)};font-weight:700;letter-spacing:0.01em}.m{font-family:'IBM Plex Mono',Menlo,monospace;font-size:9px;fill:${MUTED}}.t{font-family:${esc(FONT_STACK)};font-weight:500;font-size:13px;letter-spacing:0.12em;fill:${INK}}</style>`);
  out.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);
  out.push(`<text class="t" x="${L.pad?.left ?? 0}" y="24">${esc(title.toUpperCase())}</text>`);
  if (L.outline) out.push(`<path d="${L.outline}" fill="#ece5d6" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`);
  for (const b of L.bands) {
    const ra = L.outline ? b.rx0 : L.pad.left, rb = L.outline ? b.rx1 : x1;
    out.push(`<line x1="${ra.toFixed(1)}" x2="${rb.toFixed(1)}" y1="${b.y0.toFixed(1)}" y2="${b.y0.toFixed(1)}" stroke="${L.outline ? INK : RULE}" stroke-width="${L.outline ? 0.8 : 0.6}"/>`);
    if (L.outline) out.push(`<line x1="${rb.toFixed(1)}" x2="${(x1 + 6).toFixed(1)}" y1="${b.y0.toFixed(1)}" y2="${b.y0.toFixed(1)}" stroke="${RULE}" stroke-width="0.5" stroke-dasharray="2 2"/>`);
    out.push(`<text class="m" x="${W - 8}" y="${(b.y0 + 3).toFixed(1)}" text-anchor="end">${esc(elevTag(b.z1))}</text>`);
    for (const w of b.words) {
      out.push(`<text class="w" x="${w.x.toFixed(1)}" y="${w.y.toFixed(1)}" font-size="${w.size.toFixed(1)}" fill="${fill(w)}">${esc(w.text)}${showArea ? `<tspan class="m" dx="4">${Math.round(w.gfa).toLocaleString('en-CA')} m²</tspan>` : ''}</text>`);
    }
  }
  // ground line and the lowest tag
  out.push(`<line x1="${L.pad.left}" x2="${x1}" y1="${L.ground.toFixed(1)}" y2="${L.ground.toFixed(1)}" stroke="${INK}" stroke-width="1.6"/>`);
  out.push(`<text class="m" x="${W - 8}" y="${(L.ground + 3).toFixed(1)}" text-anchor="end">±0.0 m</text>`);
  if (L.zMin < 0) out.push(`<text class="m" x="${W - 8}" y="${(L.height - L.pad.bottom + 3).toFixed(1)}" text-anchor="end">${esc(elevTag(L.zMin))}</text>`);
  out.push(`<text class="m" x="${L.pad.left}" y="${H - 14}">${esc(footer)}</text>`);
  out.push('</svg>');
  return out.join('');
}
