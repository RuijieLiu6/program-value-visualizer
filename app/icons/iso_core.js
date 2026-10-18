// Isometric drawing kit for programme icons: a floor plate, boxes, cylinders, people and trees,
// drawn as thin-line axonometric diagrams in a 100 x 100 viewBox. No dependencies.

const U = 5.4;               // px per model unit; the floor plate is 10 x 10 units
const CX = 50, OY = 38;      // screen position of model point (0, 0, 0)
const KS = U / 5;            // scale for figures drawn in px
const KP = KS * 1.3;         // people a little larger so activities read at small sizes
const C30 = 0.8660254, S30 = 0.5;
export const INK = '#1f2430', PERSON = '#7d8790', WHITE = '#fff7e8';
export const WATER = '#4cc3e6', GREEN = '#3fb67b', WOOD = '#f4a259', RED = '#ef476f', DARK = '#2b2d42', GLASS = '#bfe9f6', GOLD = '#ffd166';
export const PALETTE = ['#ef476f', '#118ab2', '#06d6a0', '#ffd166', '#8338ec', '#f78c6b', '#3a86ff', '#ff9f1c'];
const SKIN = ['#f1c27d', '#c68642', '#8d5524', '#ffdbac', '#e0ac69'];
const PANTS = ['#2b2d42', '#3a86ff', '#264653', '#6d597a'];
const GREYS = { '#7d8790': null, '#959ea6': null, '#8a949c': null, '#9aa3ab': 'senior', '#c3cad0': 'coat', '#5f6a73': 'uniform', '#c9d1d7': null, '#aeb7be': null };

const r1 = n => Math.round(n * 100) / 100;
export function P(x, y, z = 0) { return [r1(CX + (x - y) * C30 * U), r1(OY + (x + y) * S30 * U - z * U)]; }
const pts = arr => arr.map(p => p.join(',')).join(' ');

function hex(c) { const m = c.replace('#', ''); return [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16)); }
function toHex(rgb) { return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
export function shade(c, k) { if (!c.startsWith('#')) return c; const [r, g, b] = hex(c); return toHex([r * (1 - k), g * (1 - k), b * (1 - k)]); }
export function tint(c, k) { if (!c.startsWith('#')) return c; const [r, g, b] = hex(c); return toHex([r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k]); }

/** One drawing: collects shapes with a depth key, then paints back to front. */
export class Iso {
  constructor(accent, seed = 0) { this.a = accent; this.items = []; this.seq = 0; this.seed = seed; }
  add(depth, svg) { this.items.push({ depth, seq: this.seq++, svg }); return this; }

  // ---- primitives ----
  poly(points3, fill, { stroke = INK, sw = 0.85, depth = null, dash = null, op = 1 } = {}) {
    const d = depth ?? Math.max(...points3.map(p => p[0] + p[1])) + Math.max(...points3.map(p => p[2] || 0)) * 0.01;
    return this.add(d, `<polygon points="${pts(points3.map(p => P(...p)))}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${op < 1 ? ` fill-opacity="${op}"` : ''}/>`);
  }
  line(a, b, { stroke = INK, sw = 0.85, dash = null, depth = null, cap = 'round' } = {}) {
    const d = depth ?? Math.max(a[0] + a[1], b[0] + b[1]) + 0.05;
    const [x1, y1] = P(...a), [x2, y2] = P(...b);
    return this.add(d, `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="${cap}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
  }
  /** Box from (x,y,z) with size (w,d,h). Draws top and the two faces toward the viewer. */
  box(x, y, z, w, d, h, fill = WHITE, { stroke = INK, sw = 0.85, depth = null, op = 1, top = null } = {}) {
    const dep = depth ?? (x + w / 2) + (y + d / 2) + z * 0.02;
    const T = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
    const L = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
    const R = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
    const f = (p, c) => `<polygon points="${pts(p.map(q => P(...q)))}" fill="${c}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`;
    return this.add(dep, (h > 0 ? f(L, shade(fill, 0.1)) + f(R, shade(fill, 0.22)) : '') + f(T, top ?? fill));
  }
  /** Horizontal circle (ellipse on screen) at height z. */
  disc(x, y, z, r, fill = WHITE, { stroke = INK, sw = 0.85, depth = null } = {}) {
    const [cx, cy] = P(x, y, z);
    return this.add(depth ?? x + y + z * 0.02, `<ellipse cx="${cx}" cy="${cy}" rx="${r1(r * U * 1.2247)}" ry="${r1(r * U * 0.7071)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
  }
  /** Vertical cylinder. */
  cyl(x, y, z, r, h, fill = WHITE, { stroke = INK, sw = 0.85, depth = null } = {}) {
    const [cx, cb] = P(x, y, z), ct = cb - h * U, rx = r1(r * U * 1.2247), ry = r1(r * U * 0.7071);
    const side = `<path d="M${r1(cx - rx)},${ct} L${r1(cx - rx)},${cb} A${rx},${ry} 0 0 0 ${r1(cx + rx)},${cb} L${r1(cx + rx)},${ct} Z" fill="${shade(fill, 0.14)}" stroke="${stroke}" stroke-width="${sw}"/>`;
    const top = `<ellipse cx="${cx}" cy="${r1(ct)}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    return this.add(depth ?? x + y + z * 0.02, side + top);
  }
  _who(fill) {
    const n = this.people = (this.people || 0) + 1;
    const role = fill in GREYS ? GREYS[fill] : 'custom';
    const shirt = role === 'coat' ? '#ffffff' : role === 'uniform' ? '#2b2d42' : role === 'custom' ? fill : PALETTE[(n * 5 + this.seed) % PALETTE.length];
    const skin = SKIN[(n * 2 + this.seed) % SKIN.length], pants = PANTS[(n + this.seed) % PANTS.length], hair = role === 'senior' ? '#e8e8e8' : (n % 3 ? '#2b2d42' : '#7a4b2a');
    return { shirt, skin, pants, hair };
  }
  /** Standing person in colour (s = scale, 1 = adult). */
  person(x, y, z = 0, { s = 1, fill = PERSON, depth = null, arm = 0 } = {}) {
    const [px, py] = P(x, y, z), k = s * 1.15 * KP, c = this._who(fill);
    const q = (dx, dy) => `${r1(px + dx * k)},${r1(py + dy * k)}`;
    const o = `stroke="${INK}" stroke-width="${r1(0.5 * Math.max(0.7, s))}" stroke-linejoin="round"`;
    const legs = `<path d="M${q(-1.5, -3.8)} L${q(1.5, -3.8)} L${q(1.2, 0)} L${q(0.2, 0)} L${q(0, -2.6)} L${q(-0.2, 0)} L${q(-1.2, 0)} Z" fill="${c.pants}" ${o}/>`;
    const torso = `<path d="M${q(-2, -7.6)} Q${q(0, -8.7)} ${q(2, -7.6)} L${q(1.7, -3.6)} L${q(-1.7, -3.6)} Z" fill="${c.shirt}" ${o}/>`;
    const armSvg = arm ? `<path d="M${q(1.7, -7)} L${q(1.9 + 1.6 * arm, -10.6)}" stroke="${c.shirt}" stroke-width="${r1(1.3 * k)}" stroke-linecap="round" fill="none"/><circle cx="${r1(px + (1.9 + 1.6 * arm) * k)}" cy="${r1(py - 10.8 * k)}" r="${r1(0.6 * k)}" fill="${c.skin}"/>` : '';
    const head = `<circle cx="${r1(px)}" cy="${r1(py - 9.9 * k)}" r="${r1(1.7 * k)}" fill="${c.skin}" ${o}/><path d="M${q(-1.7, -10.1)} A${r1(1.7 * k)},${r1(1.7 * k)} 0 0 1 ${q(1.7, -10.1)} Z" fill="${c.hair}"/>`;
    return this.add(depth ?? x + y + 0.3, legs + torso + armSvg + head);
  }
  /** Seated person in colour (seat height z). */
  sitter(x, y, z = 0.9, { s = 1, fill = PERSON, depth = null } = {}) {
    const [px, py] = P(x, y, z), k = s * 1.15 * KP, c = this._who(fill);
    const q = (dx, dy) => `${r1(px + dx * k)},${r1(py + dy * k)}`;
    const o = `stroke="${INK}" stroke-width="${r1(0.5 * Math.max(0.7, s))}" stroke-linejoin="round"`;
    const legs = `<path d="M${q(-1.6, -0.6)} L${q(3.6, -0.6)} L${q(3.6, 2.6)} L${q(2.5, 2.6)} L${q(2.5, 0.7)} L${q(-1.6, 0.6)} Z" fill="${c.pants}" ${o}/>`;
    const torso = `<path d="M${q(-1.9, -6.6)} Q${q(0, -7.7)} ${q(1.9, -6.6)} L${q(1.6, -0.6)} L${q(-1.6, -0.6)} Z" fill="${c.shirt}" ${o}/>`;
    const head = `<circle cx="${r1(px)}" cy="${r1(py - 8.9 * k)}" r="${r1(1.65 * k)}" fill="${c.skin}" ${o}/><path d="M${q(-1.65, -9.1)} A${r1(1.65 * k)},${r1(1.65 * k)} 0 0 1 ${q(1.65, -9.1)} Z" fill="${c.hair}"/>`;
    return this.add(depth ?? x + y + 0.35, legs + torso + head);
  }
  lying(x, y, z, { fill = PERSON, depth = null } = {}) {   // person lying along +x
    const a = P(x, y, z + 0.35), b = P(x + 2.6, y, z + 0.35), c = this._who(fill);
    return this.add(depth ?? x + y + 1.4, `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${INK}" stroke-width="4.2" stroke-linecap="round"/><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${c.shirt}" stroke-width="3.2" stroke-linecap="round"/><circle cx="${r1(a[0] - 2)}" cy="${r1(a[1] - 1.6)}" r="1.9" fill="${c.skin}" stroke="${INK}" stroke-width="0.5"/>`);
  }
  tree(x, y, z = 0, { s: s0 = 1, fill = GREEN, depth = null } = {}) {
    const [px, py] = P(x, y, z), s = s0 * KS;
    return this.add(depth ?? x + y + 0.2, `<line x1="${px}" y1="${py}" x2="${px}" y2="${r1(py - 6 * s)}" stroke="${shade(WOOD, 0.35)}" stroke-width="${r1(1.2 * s)}" stroke-linecap="round"/><circle cx="${px}" cy="${r1(py - 9 * s)}" r="${r1(4.2 * s)}" fill="${fill}" stroke="${INK}" stroke-width="0.6"/><circle cx="${r1(px - 1.4 * s)}" cy="${r1(py - 10.3 * s)}" r="${r1(1.4 * s)}" fill="${tint(fill, 0.35)}"/>`);
  }
  plant(x, y, z = 0, { depth = null } = {}) {
    this.cyl(x, y, z, 0.45, 0.6, WOOD, { depth: depth ?? x + y });
    const [px, py] = P(x, y, z + 0.6);
    return this.add((depth ?? x + y) + 0.01, `<circle cx="${px}" cy="${r1(py - 2.6)}" r="2.6" fill="${GREEN}" stroke="${INK}" stroke-width="0.5"/>`);
  }
  /** Vertical panel standing on the line (x1,y1)-(x2,y2) from z to z+h. */
  wall(x1, y1, x2, y2, z, h, fill = WHITE, opts = {}) {
    return this.poly([[x1, y1, z], [x2, y2, z], [x2, y2, z + h], [x1, y1, z + h]], fill, { depth: Math.max(x1 + y1, x2 + y2) - 0.5, ...opts });
  }
  text(x, y, z, str, { size = 6, fill = INK, weight = 700, depth = 99 } = {}) {
    const [px, py] = P(x, y, z);
    return this.add(depth, `<text x="${px}" y="${py}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${str}</text>`);
  }
  /** A small flat badge in screen space (top right corner) to tell close cousins apart. */
  badge(str, fill = this.a) {
    return this.add(1000, `<g><rect x="70" y="4" width="26" height="13" rx="6.5" fill="${fill}" stroke="${INK}" stroke-width="0.6"/><text x="83" y="13.4" font-family="Helvetica, Arial, sans-serif" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">${str}</text></g>`);
  }

  // ---- composites ----
  /** The floor plate every icon stands on, tinted with the family colour. */
  slab({ w = 10, d = 10, fill = null } = {}) {
    const f = fill ?? tint(this.a, 0.32);
    const [sx, sy] = P(w / 2 + 0.6, d / 2 + 0.6, -0.7);
    this.add(-101, `<ellipse cx="${sx}" cy="${sy}" rx="47" ry="26" fill="${INK}" fill-opacity="0.09"/>`);
    return this.box(0, 0, -0.6, w, d, 0.6, f, { depth: -100 });
  }
  chair(x, y, z = 0, fill = WHITE) { this.box(x, y, z, 0.9, 0.9, 0.8, fill); return this.box(x, y, z + 0.8, 0.9, 0.2, 0.9, fill, { depth: x + y + 0.2 }); }
  table(x, y, w, d, z = 0, fill = WOOD) {
    this.line([x + 0.2, y + 0.2, z], [x + 0.2, y + 0.2, z + 1.5]); this.line([x + w - 0.2, y + d - 0.2, z], [x + w - 0.2, y + d - 0.2, z + 1.5], { depth: x + y + w + d });
    this.line([x + w - 0.2, y + 0.2, z], [x + w - 0.2, y + 0.2, z + 1.5]); this.line([x + 0.2, y + d - 0.2, z], [x + 0.2, y + d - 0.2, z + 1.5]);
    return this.box(x, y, z + 1.5, w, d, 0.25, fill, { depth: x + y + (w + d) / 2 + 0.01 });
  }
  roundTable(x, y, r = 1, z = 0, fill = WOOD) { this.line([x, y, z], [x, y, z + 1.5], { depth: x + y }); return this.disc(x, y, z + 1.5, r, fill, { depth: x + y + 0.01 }); }
  bed(x, y, w = 2.2, d = 3.2, fill = WHITE, cover = null) {
    this.box(x, y, 0, w, d, 0.8, fill);
    this.box(x + 0.15, y + 0.9, 0.8, w - 0.3, d - 1, 0.25, cover ?? tint(this.a, 0.35), { depth: x + y + (w + d) / 2 + 0.05 });
    return this.box(x + 0.25, y + 0.15, 0.8, w - 0.5, 0.6, 0.35, WHITE, { depth: x + y + 0.9 });
  }
  bunk(x, y, fill = WHITE) {
    for (const [a, b] of [[x, y], [x + 1.6, y], [x, y + 3], [x + 1.6, y + 3]]) this.line([a, b, 0], [a, b, 3.4], { depth: a + b - 0.2 });
    this.box(x, y, 0.6, 1.6, 3, 0.4, fill); this.box(x, y, 2.4, 1.6, 3, 0.4, tint(this.a, 0.4));
    return this;
  }
  sofa(x, y, w = 3, fill = null) {
    const f = fill ?? tint(this.a, 0.3);
    this.box(x, y, 0, w, 1.2, 0.7, f); this.box(x, y, 0.7, w, 0.35, 0.8, f, { depth: x + y + w / 2 + 0.1 });
    return this;
  }
  desk(x, y, w = 2.4, d = 1.2, screen = true) {
    this.table(x, y, w, d, 0, WHITE);
    if (screen) this.wall(x + 0.6, y + 0.3, x + w - 0.6, y + 0.3, 1.75, 1.1, DARK, { depth: x + y + w / 2 + 0.2 });
    return this;
  }
  shelf(x, y, w = 3, d = 0.8, h = 3.2, fill = WHITE, lines = 3, colours = null) {
    this.box(x, y, 0, w, d, h, fill);
    for (let i = 1; i <= lines; i++) this.line([x, y + d, h * i / (lines + 1)], [x + w, y + d, h * i / (lines + 1)], { depth: x + y + w / 2 + d + 0.01 });
    if (colours) colours.forEach((c, i) => this.box(x + 0.2 + i * (w - 0.4) / colours.length, y + d - 0.02, h * 1 / (lines + 1), (w - 0.4) / colours.length - 0.15, 0.05, h / (lines + 1) * 0.8, c, { sw: 0.4, depth: x + y + w / 2 + d + 0.02 }));
    return this;
  }
  car(x, y, fill) {
    this.box(x, y, 0.3, 2, 4, 1.1, fill);
    this.box(x + 0.15, y + 1, 1.4, 1.7, 2, 0.9, tint(fill, 0.45), { depth: x + y + 3.1 });
    this.disc(x + 2, y + 0.9, 0.3, 0.45, DARK, { depth: x + y + 3.2 }); this.disc(x + 2, y + 3.1, 0.3, 0.45, DARK, { depth: x + y + 5.2 });
    return this;
  }
  bike(x, y) {
    const [a1, a2] = [[x, y, 0.9], [x, y + 2.2, 0.9]];
    this.add(x + y + 1.5, ['', ''].map((_, i) => { const [cx, cy] = P(x, y + i * 2.2, 0.9); return `<ellipse cx="${cx}" cy="${cy}" rx="3.1" ry="4.4" fill="none" stroke="${INK}" stroke-width="0.8" transform="rotate(-30 ${cx} ${cy})"/>`; }).join(''));
    this.line(a1, [x, y + 1.1, 1.9], { sw: 1, depth: x + y + 1.6 }); this.line([x, y + 1.1, 1.9], a2, { sw: 1, depth: x + y + 1.6 });
    return this.line([x, y + 0.2, 2.1], [x, y + 1.6, 2.1], { stroke: this.a, sw: 1.2, depth: x + y + 1.7 });
  }
  seatsRows(x, y, cols, rows, fill = null, step = 1.1) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.box(x + c * step, y + r * 1.3, r * 0.35, 0.8, 0.8, 0.6, fill ?? tint(this.a, 0.25));
    return this;
  }
  stairs(x, y, w, n, run = 0.8, rise = 0.55, fill = WHITE) {
    for (let i = 0; i < n; i++) this.box(x, y + (n - 1 - i) * run, 0, w, run, (i + 1) * rise, fill, { depth: x + y + (n - i) * run * 0.6 });
    return this;
  }
  railing(x1, y1, x2, y2, z = 0, h = 1.4) {
    this.wall(x1, y1, x2, y2, z, h, GLASS, { op: 0.55 });
    return this.line([x1, y1, z + h], [x2, y2, z + h], { sw: 1, depth: Math.max(x1 + y1, x2 + y2) });
  }
  canopy(x, y, w, d, h, fill) {   // four posts with a pyramid roof
    for (const [a, b] of [[x, y], [x + w, y], [x, y + d], [x + w, y + d]]) this.line([a, b, 0], [a, b, h], { depth: a + b - 0.1 });
    const apex = [x + w / 2, y + d / 2, h + 1.6];
    this.poly([[x, y + d, h], [x + w, y + d, h], apex], shade(fill, 0.1), { depth: x + y + w + d - 0.5 });
    this.poly([[x + w, y, h], [x + w, y + d, h], apex], shade(fill, 0.22), { depth: x + y + w + d - 0.4 });
    return this;
  }
  render(size = 100, bg = true) {
    const body = this.items.sort((a, b) => a.depth - b.depth || a.seq - b.seq).map(i => i.svg).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img">${bg ? '<rect x="1" y="1" width="98" height="98" rx="12" fill="#fffaf2" stroke="#ece4d6" stroke-width="1"/>' : ''}${body}</svg>`;
  }
}
