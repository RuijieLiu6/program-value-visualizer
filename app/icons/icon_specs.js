// Scene for each programme, drawn with the isometric kit. Floor plate is x, y in 0..10;
// (0,0) is the back corner, x runs down-right, y runs down-left. Tall things go at the back.
import { Iso, P, INK, PERSON, WHITE, WATER, GREEN, WOOD, RED, DARK, GLASS, GOLD, tint, shade } from './iso_core.js';

const r1 = n => Math.round(n * 100) / 100;
// ---- small screen-space symbols ----
function sym(g, kind, x, y, s = 1, fill = RED, depth = 900) {
  const t = (dx, dy) => `${r1(x + dx * s)},${r1(y + dy * s)}`;
  const paths = {
    cross: `M${t(-1.5, -4.5)} H${r1(x + 1.5 * s)} V${r1(y - 1.5 * s)} H${r1(x + 4.5 * s)} V${r1(y + 1.5 * s)} H${r1(x + 1.5 * s)} V${r1(y + 4.5 * s)} H${r1(x - 1.5 * s)} V${r1(y + 1.5 * s)} H${r1(x - 4.5 * s)} V${r1(y - 1.5 * s)} H${r1(x - 1.5 * s)} Z`,
    heart: `M${t(0, 3.6)} C${t(-5.5, 0)} ${t(-3.2, -4.8)} ${t(0, -1.8)} C${t(3.2, -4.8)} ${t(5.5, 0)} ${t(0, 3.6)} Z`,
    star: `M${t(0, -4.5)} L${t(1.3, -1.4)} L${t(4.4, -1.4)} L${t(1.9, 0.5)} L${t(2.8, 3.8)} L${t(0, 1.9)} L${t(-2.8, 3.8)} L${t(-1.9, 0.5)} L${t(-4.4, -1.4)} L${t(-1.3, -1.4)} Z`,
    shield: `M${t(0, -4.6)} L${t(3.8, -3)} C${t(3.8, 1)} ${t(2.2, 3.4)} ${t(0, 4.6)} C${t(-2.2, 3.4)} ${t(-3.8, 1)} ${t(-3.8, -3)} Z`,
    drop: `M${t(0, -4.8)} C${t(2.6, -1.4)} ${t(3.4, 0.4)} ${t(3.4, 1.6)} A${r1(3.4 * s)},${r1(3.4 * s)} 0 0 1 ${t(-3.4, 1.6)} C${t(-3.4, 0.4)} ${t(-2.6, -1.4)} ${t(0, -4.8)} Z`,
    flame: `M${t(0, -5)} C${t(3, -2)} ${t(3.6, 1)} ${t(2.2, 3.4)} C${t(1.2, 4.8)} ${t(-1.2, 4.8)} ${t(-2.2, 3.4)} C${t(-3.4, 1.4)} ${t(-2, -0.8)} ${t(-0.6, -1.8)} C${t(-0.6, -0.4)} ${t(0.4, 0.4)} ${t(0.9, 0.4)} C${t(1.2, -1.4)} ${t(0.6, -3.4)} ${t(0, -5)} Z`,
    bolt: `M${t(1, -5)} L${t(-2.6, 0.6)} L${t(-0.2, 0.6)} L${t(-1.2, 5)} L${t(2.6, -0.8)} L${t(0.2, -0.8)} Z`,
    househeart: `M${t(-4, 0)} L${t(0, -4)} L${t(4, 0)} L${t(4, 4.2)} L${t(-4, 4.2)} Z`,
    rocket: `M${t(0, -5)} C${t(2, -3)} ${t(2, 1)} ${t(1.2, 2.4)} L${t(-1.2, 2.4)} C${t(-2, 1)} ${t(-2, -3)} ${t(0, -5)} Z M${t(-1.2, 1)} L${t(-2.6, 3.2)} L${t(-1, 2.6)} Z M${t(1.2, 1)} L${t(2.6, 3.2)} L${t(1, 2.6)} Z`,
  };
  let extra = '';
  if (kind === 'househeart') extra = `<path d="M${t(0, 3.4)} C${t(-3, 1.4)} ${t(-1.8, -1.4)} ${t(0, 0.2)} C${t(1.8, -1.4)} ${t(3, 1.4)} ${t(0, 3.4)} Z" fill="#ffffff"/>`;
  return g.add(depth, `<path d="${paths[kind]}" fill="${fill}" stroke="${INK}" stroke-width="0.6" stroke-linejoin="round"/>${extra}`);
}
// a flat badge in screen space, drawn as a symbol instead of text
function symBadge(g, kind, fill) {
  g.add(1000, `<rect x="74" y="4" width="20" height="16" rx="8" fill="${fill}" stroke="${INK}" stroke-width="0.6"/>`);
  return sym(g, kind, 84, 12, 1, '#ffffff', 1001);
}
// rectangle painted on a wall that runs along y = y0 (faces +y, toward the viewer on the left)
function onWallY(g, y0, x1, x2, z1, z2, fill, opts = {}) { return g.poly([[x1, y0, z1], [x2, y0, z1], [x2, y0, z2], [x1, y0, z2]], fill, { depth: x2 + y0 - 0.3, sw: 0.5, ...opts }); }
// rectangle on a wall along x = x0 (faces +x, toward the viewer on the right)
function onWallX(g, x0, y1, y2, z1, z2, fill, opts = {}) { return g.poly([[x0, y1, z1], [x0, y2, z1], [x0, y2, z2], [x0, y1, z2]], fill, { depth: x0 + y2 - 0.3, sw: 0.5, ...opts }); }
function backWalls(g, h = 4, fill = WHITE, { left = true, right = true } = {}) {
  if (right) g.wall(0, 0, 10, 0, 0, h, fill, { depth: -50 });
  if (left) g.wall(0, 0, 0, 10, 0, h, shade(fill, 0.06), { depth: -50 });
}
function floorRect(g, x1, y1, x2, y2, fill, opts = {}) { return g.poly([[x1, y1, 0.02], [x2, y1, 0.02], [x2, y2, 0.02], [x1, y2, 0.02]], fill, { depth: -40, sw: 0.5, ...opts }); }
function stringLights(g, z = 5.2, y = 2) {
  const pts = [[0.5, y, z], [3, y + 2.5, z - 0.8], [5.5, y + 0.5, z], [8, y + 3, z - 0.8], [9.5, y + 1, z]];
  for (let i = 0; i < pts.length - 1; i++) g.line(pts[i], pts[i + 1], { sw: 0.4, depth: 200 });
  pts.forEach(p => { const [x, yy] = P(...p); g.add(201, `<circle cx="${x}" cy="${r1(yy + 1)}" r="1.1" fill="${GOLD}" stroke="${INK}" stroke-width="0.3"/>`); });
}
function apartment(g, tag = null) {
  backWalls(g, 3, WHITE);
  g.wall(5, 0, 5, 4, 0, 3, WHITE, { depth: 4 });          // partition
  g.bed(6, 0.6, 2.4, 3.2);
  g.sofa(1, 5.5, 3);
  g.box(0.4, 0.6, 0, 1, 3.6, 1.6, '#e7eaec');            // kitchen counter
  g.cyl(0.9, 1.4, 1.6, 0.3, 0.25, DARK);
  g.roundTable(6.5, 7, 0.9);
  g.person(3, 8.5);
  if (tag) g.badge(tag);
}
function sign(g, x, y, z, w, h, fill, label) {   // a sign panel facing +y with a letter
  onWallY(g, y, x, x + w, z, z + h, fill, { sw: 0.6, depth: x + y + 5 });
  const [cx, cy] = P(x + w / 2, y, z + h / 2);
  g.add(x + y + 5.1, `<text x="${cx}" y="${r1(cy + 2.4)}" font-family="Helvetica, Arial, sans-serif" font-size="7" font-weight="700" fill="#ffffff" text-anchor="middle">${label}</text>`);
}

export const SPECS = {
  // ---------- Move & Play ----------
  MP1: g => { g.box(0.8, 0.8, 0, 4.6, 0.9, 1.3); for (let i = 0; i < 4; i++) g.cyl(1.4 + i * 1.1, 1.25, 1.3, 0.38, 0.35, DARK);
    g.box(6.2, 1, 0, 1.7, 3.8, 0.45, DARK); g.line([6.4, 1.3, 0.45], [6.4, 1.3, 2.7]); g.line([7.7, 1.3, 0.45], [7.7, 1.3, 2.7]); g.box(6.3, 1.1, 2.7, 1.5, 0.5, 0.3, g.a);
    g.person(7, 3.6, 0.45, { s: 0.95 }); g.box(1.8, 4.6, 0, 1.1, 3.2, 0.8, g.a); g.person(4.6, 7.4, 0, { arm: 1 }); g.cyl(5.6, 8.6, 0, 0.35, 0.3, DARK); },
  MP2: g => { g.box(0.6, 0.6, -0.05, 8.8, 8.8, 0.05, '#e7ecee', { depth: -60 }); floorRect(g, 1.2, 1.6, 8.8, 8.4, WATER, { depth: -39 });
    for (const y of [3.3, 5, 6.7]) g.line([1.2, y, 0.03], [8.8, y, 0.03], { stroke: '#ffffff', sw: 0.8, depth: -38, dash: '2 1.4' });
    g.line([8.8, 2.4, 0], [8.8, 2.4, 1.4], { sw: 0.9 }); g.line([8.8, 3.1, 0], [8.8, 3.1, 1.4], { sw: 0.9 });
    const [hx, hy] = P(4.5, 5.8, 0.1); g.add(30, `<ellipse cx="${hx}" cy="${hy}" rx="5" ry="1.6" fill="#ffffff" fill-opacity="0.6"/><circle cx="${hx}" cy="${r1(hy - 1.6)}" r="1.7" fill="${PERSON}"/><path d="M${r1(hx + 1)},${r1(hy - 1)} q4,-4 7,-1" stroke="${PERSON}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`);
    g.person(2.4, 9.2, 0); },
  MP3: g => { g.box(5, 0.8, 0, 4, 3.4, 3, WOOD); onWallY(g, 4.2, 6, 7.3, 0, 2.2, shade(WOOD, 0.35));
    const [sx, sy] = P(7, 2, 3.4); g.add(40, `<path d="M${sx - 3},${sy} q2,-3 0,-6 M${sx + 1},${sy - 1} q2,-3 0,-6 M${sx + 5},${sy} q2,-3 0,-6" stroke="#9aa7b1" stroke-width="0.9" fill="none" stroke-linecap="round"/>`);
    g.cyl(3, 5.6, -0.05, 2.2, 0.35, '#d7e8ef'); g.disc(3, 5.6, 0.31, 1.85, WATER); g.person(6.6, 6.6, 0, { fill: '#8a949c' }); g.person(1.2, 8.8, 0); },
  MP4: g => { floorRect(g, 0.8, 0.8, 9.2, 9.2, tint(g.a, 0.45), { stroke: '#ffffff', sw: 0.9 });
    g.line([0.8, 5, 0.04], [9.2, 5, 0.04], { stroke: '#ffffff', sw: 0.9, depth: -37 }); g.disc(5, 5, 0.04, 1.4, 'none', { stroke: '#ffffff', sw: 0.9, depth: -37 });
    g.line([1.4, 5, 0], [1.4, 5, 4.6], { sw: 1.1 }); g.wall(1.2, 4.1, 1.2, 5.9, 3.7, 1.6, WHITE, { depth: 6.3 }); g.disc(2, 5, 3.9, 0.55, 'none', { stroke: RED, sw: 1, depth: 7.2 });
    g.person(4.5, 3.3, 0, { arm: 1 }); g.person(7, 6.8, 0); const [bx, by] = P(3.6, 4.6, 5.6); g.add(50, `<circle cx="${bx}" cy="${by}" r="1.5" fill="#e98a3a" stroke="${INK}" stroke-width="0.5"/>`); },
  MP5: g => { g.wall(0.5, 0.6, 9.5, 0.6, 0, 7.4, tint(WOOD, 0.4), { depth: -50 });
    const holds = [[2, 1.2, '#d1495b'], [3.4, 2.6, '#f2a541'], [5, 1.8, '#4f9bd1'], [6.4, 3.6, '#77b37d'], [4.2, 4.6, '#9c89b8'], [7.6, 5.4, '#d1495b'], [2.8, 5.8, '#f2a541'], [5.6, 6.6, '#4f9bd1'], [8.2, 2.2, '#77b37d']];
    holds.forEach(([x, z, c]) => { const [hx, hy] = P(x, 0.6, z); g.add(-49, `<ellipse cx="${hx}" cy="${hy}" rx="1.3" ry="1" fill="${c}" stroke="${INK}" stroke-width="0.35"/>`); });
    g.line([6, 0.7, 7.4], [6, 0.8, 3.6], { stroke: RED, sw: 0.6, depth: -48 }); g.person(6, 0.9, 2.6, { s: 0.85, depth: -47, arm: 1 });
    g.line([6, 0.8, 3.6], [5.4, 5, 1.2], { stroke: RED, sw: 0.6 }); g.person(5.4, 5.4, 0); g.box(1, 6, 0, 3.5, 3, 0.35, tint(g.a, 0.5)); },
  MP6: g => { g.disc(5, 5, 0.03, 4.3, g.a, { depth: -39 }); g.disc(5, 5, 0.04, 3.1, tint(g.a, 0.72), { depth: -38 });
    for (const r of [3.5, 3.9]) g.disc(5, 5, 0.035, r, 'none', { stroke: '#ffffff', sw: 0.6, depth: -38.5 });
    g.person(8.6, 5.2, 0, { arm: 0.6 }); g.person(2.2, 7.6, 0, { s: 0.95 }); g.stairs(3.4, 1, 3, 4, 0.7, 0.5, WHITE); },
  MP7: g => { g.wall(0.5, 0.6, 0.5, 9.4, 0, 4.4, GLASS, { depth: -50 }); for (const y of [2.6, 4.8, 7]) g.line([0.5, y, 0], [0.5, y, 4.4], { sw: 0.4, depth: -49 });
    [[2.4, 1.4, g.a], [2.4, 4.4, tint(g.a, 0.35)], [5.6, 2.8, tint(g.a, 0.55)]].forEach(([x, y, c]) => g.box(x, y, 0, 1.4, 2.8, 0.1, c));
    g.person(3.1, 3.6, 0.1, { arm: 1 }); g.sitter(6.2, 5, 0.1); g.person(3.1, 6.7, 0.1, { s: 0.95 }); },
  MP8: g => { floorRect(g, 0.6, 0.6, 9.4, 9.4, '#e8f5fb', { depth: -39 });
    g.box(0.6, 9.1, 0, 8.8, 0.3, 0.8, WHITE); g.box(9.1, 0.6, 0, 0.3, 8.5, 0.8, WHITE);
    const [ix, iy] = P(5, 5, 0.03); g.add(-37, `<path d="M${ix - 18},${iy} q12,-6 22,0 t20,2" stroke="#9fd0e8" stroke-width="0.9" fill="none"/><path d="M${ix - 12},${iy + 8} q12,-5 24,-1" stroke="#9fd0e8" stroke-width="0.9" fill="none"/>`);
    g.person(5, 4.2, 0, { arm: 1 }); g.person(3, 7, 0, { s: 0.75 }); },
  MP9: g => { g.box(1, 1, 0, 2, 2, 2, '#e85d75'); g.box(1, 3, 0, 2, 2, 1, GOLD); g.box(3, 1, 0, 2, 1.6, 1, '#5aa9e6'); g.box(1.4, 1.4, 2, 1.2, 1.2, 1.2, GREEN);
    g.stairs(6, 1, 1, 3, 0.6, 0.6, WHITE); g.poly([[6, 2.8, 1.8], [7, 2.8, 1.8], [7, 6, 0.1], [6, 6, 0.1]], '#f2a541', { depth: 9.5 });
    g.disc(3.6, 6.6, 0.05, 1.4, '#5aa9e6'); g.person(7.6, 8, 0); g.person(4.8, 5.4, 0, { s: 0.6 }); g.person(2.4, 7.8, 0, { s: 0.6 }); },

  // ---------- Gather & Perform ----------
  GP1: g => { g.box(0.8, 0.6, 0, 8.4, 3.2, 1, WOOD); g.box(0.8, 0.6, 1, 0.8, 0.5, 4.2, g.a); g.box(8.4, 0.6, 1, 0.8, 0.5, 4.2, g.a); g.box(0.8, 0.6, 5.2, 8.4, 0.5, 0.8, g.a, { depth: 6 });
    onWallY(g, 0.6, 1.6, 8.4, 1, 5.2, shade(g.a, 0.4), { depth: -48 }); g.person(5, 2.4, 1, { arm: 1 }); g.seatsRows(2, 5, 6, 3, tint(g.a, 0.2)); },
  GP2: g => { backWalls(g, 5.6, '#3a4651'); g.line([0.5, 0.6, 5.6], [9.5, 0.6, 5.6], { stroke: '#7d8a96', sw: 0.8, depth: -45 }); g.line([0.6, 0.5, 5.6], [0.6, 9.5, 5.6], { stroke: '#7d8a96', sw: 0.8, depth: -45 });
    [[3, 0.6], [6, 0.6], [0.6, 4]].forEach(([x, y]) => { const [lx, ly] = P(x, y, 5.4); g.add(-44, `<path d="M${lx},${ly} l-2,3 h4 z" fill="${GOLD}" stroke="${INK}" stroke-width="0.4"/><path d="M${lx - 2},${ly + 3} L${lx - 9},${ly + 26} L${lx + 9},${ly + 26} L${lx + 2},${ly + 3} Z" fill="${GOLD}" fill-opacity="0.18"/>`); });
    g.person(4, 4, 0, { arm: 1 }); g.chair(6.5, 6.5); g.chair(4, 7.5); g.chair(7.6, 4.2); },
  GP3: g => { g.wall(0.8, 0.6, 9.2, 0.6, 1, 4.6, DARK, { depth: -50 }); onWallY(g, 0.6, 1.4, 8.6, 1.5, 5, tint(WATER, 0.2), { depth: -49 });
    const [mx, my] = P(5, 0.6, 3.2); g.add(-48, `<path d="M${mx - 8},${my + 3} l5,-6 4,4 3,-3 6,5 z" fill="${GREEN}" fill-opacity="0.8"/>`);
    g.seatsRows(1.8, 3.6, 6, 4, g.a); g.sitter(4.2, 7.3, 1.6, { s: 0.9 }); },
  GP4: g => { g.wall(1, 0.6, 9, 0.6, 1.4, 3.4, WHITE, { depth: -50 }); onWallY(g, 0.6, 1.6, 8.4, 1.8, 4.4, tint(g.a, 0.55), { depth: -49 }); g.box(1.4, 1.6, 0, 0.9, 0.7, 1.7, WOOD); g.person(2.6, 2.6);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) g.chair(3 + c * 1.6, 4 + r * 1.8, 0, r === 0 ? g.a : WHITE); },
  GP5: g => { g.roundTable(5, 5.4, 1.5); [[3.2, 5.4], [5, 7.4], [6.8, 5.6], [5, 3.4]].forEach(([x, y]) => g.chair(x - 0.45, y - 0.45, 0, tint(g.a, 0.3)));
    for (let i = 0; i < 4; i++) g.box(1 + i * 1.2, 0.8, i * 0.12, 0.9, 0.9, 0.12, WHITE); g.box(1, 0.8, 0, 4.6, 0.9, 0.5, WHITE);
    g.sitter(3.2, 5.4, 0.8); g.sitter(5, 7.4, 0.8); g.person(8, 7.6, 0, { arm: 0.7 }); },
  GP6: g => { g.wall(0.6, 0.8, 9.4, 0.8, 0, 5.2, WHITE, { depth: -50 });
    [[1.4, 3.4, 1.8, 4.2, g.a], [4, 6.4, 1.4, 4.6, WATER], [7, 8.6, 2.2, 4, GOLD]].forEach(([x1, x2, z1, z2, c]) => { onWallY(g, 0.8, x1 - 0.2, x2 + 0.2, z1 - 0.2, z2 + 0.2, '#ffffff', { depth: -49, sw: 0.8 }); onWallY(g, 0.8, x1, x2, z1, z2, c, { depth: -48 }); });
    g.box(6, 5.4, 0, 1.4, 1.4, 1.8); g.cyl(6.7, 6.1, 1.8, 0.5, 1.2, tint(g.a, 0.2)); g.disc(6.7, 6.1, 3, 0.7, WHITE); g.person(3.4, 4.6); },
  GP7: g => { g.wall(0.5, 0.6, 0.5, 9.4, 0, 5.6, GLASS, { depth: -50 }); g.line([0.5, 5, 0], [0.5, 5, 5.6], { sw: 0.4, depth: -49 });
    stringLights(g, 5.6, 1.4); [[3.4, 3.2], [7.2, 3.4], [3.6, 7.4]].forEach(([x, y]) => { g.line([x, y, 0], [x, y, 1.4]); g.cyl(x, y, 1.0, 1.25, 0.5, WHITE); });
    g.person(6.6, 7, 0, { arm: 0.6 }); g.person(7.4, 6.6, 0, { fill: '#959ea6' }); },
  GP8: g => { [[1, 1], [9, 1], [1, 9], [9, 9], [5, 1], [1, 5]].forEach(([x, y]) => g.box(x - 0.25, y - 0.25, 0, 0.5, 0.5, 4.8, WHITE, { depth: x + y - 0.5 }));
    g.box(0.2, 0.2, 4.8, 9.6, 9.6, 0.5, g.a, { depth: 4 }); g.box(2.6, 6.2, 0, 3.2, 0.9, 0.7, WOOD); g.person(4.6, 4.4); g.person(6.4, 6.6, 0, { fill: '#959ea6' }); g.sitter(3.6, 6.6, 0.7); },
  GP9: g => { g.wall(0.8, 0.6, 9.2, 0.6, 0.8, 4.4, DARK, { depth: -50 }); onWallY(g, 0.6, 1.4, 8.6, 1.3, 4.8, g.a, { depth: -49 });
    for (let i = 0; i < 3; i++) { const x = 1.6 + i * 2.6; g.desk(x, 4.4, 2, 1, false); g.wall(x + 0.4, 4.6, x + 1.6, 4.6, 1.75, 1, '#5ad1e6', { depth: x + 6 }); g.sitter(x + 1, 6.6, 0.8); } },

  // ---------- Look & Experience ----------
  LE1: g => { g.railing(0.4, 9.6, 9.6, 9.6); g.railing(9.6, 0.4, 9.6, 9.6);
    g.line([7, 7, 0], [7, 7, 2.2], { sw: 1.2 }); g.box(6.4, 6.6, 2.2, 1.4, 0.7, 0.7, GOLD, { depth: 14.3 });
    g.box(1, 1, 0, 0.6, 1.6, 1.6, g.a); g.box(1, 3.2, 0, 0.6, 1.6, 1.6, g.a); g.line([1.3, 2.6, 1.2], [1.3, 3.2, 1.2], { stroke: RED, sw: 1.4 });
    g.person(5, 7.8, 0, { arm: 1 }); g.person(3, 4, 0); },
  LE2: g => { g.railing(0.4, 9.6, 9.6, 9.6); g.railing(9.6, 0.4, 9.6, 9.6);
    g.box(2, 6, 0, 3.6, 1, 0.7, WOOD); g.box(5.4, 2, 0, 1, 3.6, 0.7, WOOD); g.plant(1.6, 1.6); g.plant(8, 8);
    g.sitter(3.2, 6.6, 0.7); g.sitter(5.9, 3.4, 0.7, { fill: '#959ea6' }); g.person(8, 5, 0); },
  LE3: g => { g.railing(0.4, 9.6, 9.6, 9.6); g.railing(9.6, 0.4, 9.6, 9.6);
    g.box(1, 0.8, 0, 6.2, 1.3, 1.8, DARK, { top: WOOD }); for (const x of [2, 3.8, 5.6]) { g.cyl(x, 3, 0, 0.35, 1.2, g.a); }
    const [gx, gy] = P(4.4, 1.4, 1.8); g.add(5, `<path d="M${gx - 2.4},${gy - 5} L${gx + 2.4},${gy - 5} L${gx},${gy - 2} Z M${gx},${gy - 2} V${gy}" fill="${tint(RED, 0.3)}" stroke="${INK}" stroke-width="0.6"/>`);
    g.roundTable(6.8, 6.6, 1); g.sitter(5.4, 6.8, 0.8); g.sitter(6.8, 8.2, 0.8, { fill: '#959ea6' }); },
  LE4: g => { g.box(9.2, 3.6, -0.2, 4.6, 1.8, 0.2, GLASS, { op: 0.75, depth: 14 });
    for (const x of [10, 11.5, 13]) { g.line([x, 3.6, 0], [x, 3.6, 1.6], { depth: x + 3.5 }); g.line([x, 5.4, 0], [x, 5.4, 1.6], { depth: x + 5.6 }); }
    g.line([9.2, 3.6, 1.6], [13.8, 3.6, 1.6], { sw: 0.9, depth: 16 }); g.line([9.2, 5.4, 1.6], [13.8, 5.4, 1.6], { sw: 0.9, depth: 19.5 });
    g.person(12, 4.5, 0, { depth: 17 }); g.line([12, 4.5, 2.4], [12, 3.6, 4.8], { stroke: RED, sw: 0.6, depth: 16.5 });
    g.railing(0.4, 9.6, 9, 9.6); g.person(4, 4, 0, { arm: 1 }); g.box(1, 1, 0, 2, 2, 0.6, tint(g.a, 0.4)); },
  LE5: g => { g.slab({ fill: '#2e3944' }); g.wall(0, 0, 10, 0, 0, 5, '#26313b', { depth: -50 }); g.wall(0, 0, 0, 10, 0, 5, '#2e3944', { depth: -50 });
    onWallY(g, 0, 1, 4.4, 1, 4, '#5ad1e6', { depth: -49, op: 0.85 }); onWallY(g, 0, 5, 9, 0.6, 4.4, g.a, { depth: -49, op: 0.85 }); onWallX(g, 0, 2, 8, 1.4, 4, '#b07be0', { depth: -49, op: 0.85 });
    g.disc(5, 5, 0.03, 3, '#e86a8a', { depth: -38, stroke: 'none' }); g.disc(5, 5, 0.04, 1.8, GOLD, { depth: -37, stroke: 'none' });
    g.person(4.4, 4.6, 0, { fill: '#c9d1d7' }); g.person(6.6, 6.4, 0, { fill: '#aeb7be', arm: 1 }); },
  LE6: g => { g.cyl(5, 5, 0, 3.4, 2, WHITE); const [cx, cy] = P(5, 5, 2); const rx = 3.4 * 5 * 1.2247;
    g.add(20, `<path d="M${r1(cx - rx)},${cy} A${r1(rx)},${r1(rx)} 0 0 1 ${r1(cx + rx)},${cy} A${r1(rx)},${r1(rx * 0.577)} 0 0 1 ${r1(cx - rx)},${cy} Z" fill="${tint(g.a, 0.35)}" stroke="${INK}" stroke-width="0.7"/><path d="M${r1(cx - 2)},${r1(cy - rx + 0.5)} L${r1(cx + 2)},${r1(cy - rx + 0.5)} L${r1(cx + 3.4)},${r1(cy + 2)} L${r1(cx - 3.4)},${r1(cy + 2)} Z" fill="${DARK}"/><line x1="${cx}" y1="${r1(cy - 6)}" x2="${r1(cx + 9)}" y2="${r1(cy - 24)}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`);
    const [sx, sy] = P(1, 1, 9); g.add(21, `<path d="M${sx},${sy} l1,2.6 2.6,0.2 -2,1.6 0.8,2.6 -2.4,-1.4 -2.4,1.4 0.8,-2.6 -2,-1.6 2.6,-0.2z" fill="${GOLD}"/>`); g.person(8.6, 8.6); },

  // ---------- Shop & Eat ----------
  SE1: g => { g.box(1, 0.6, 0, 8.4, 4.4, 4.2, WHITE); onWallY(g, 5, 1.6, 5.6, 0.6, 3, GLASS, { depth: 9 }); onWallY(g, 5, 6.4, 7.8, 0, 3, shade(WOOD, 0.2), { depth: 9 });
    for (let i = 0; i < 6; i++) g.poly([[1 + i * 1.4, 5, 3.6], [2.4 + i * 1.4, 5, 3.6], [2.4 + i * 1.4, 6.8, 2.8], [1 + i * 1.4, 6.8, 2.8]], i % 2 ? WHITE : g.a, { depth: 12 + i * 0.01 });
    g.line([0.4, 8.2, 0.03], [9.6, 8.2, 0.03], { stroke: '#9aa7b1', sw: 0.6, depth: -30 }); g.person(5.4, 8, 0); g.box(5.9, 8, 0.6, 0.7, 0.4, 0.9, g.a, { depth: 14 }); },
  SE2: g => { const c = ['#d1495b', '#f2a541', '#77b37d', '#5aa9e6'];
    g.shelf(1, 1, 7, 0.9, 3, WHITE, 2, c); g.shelf(1, 4, 7, 0.9, 3, WHITE, 2, [...c].reverse());
    g.box(6.6, 6.8, 0.6, 1.6, 2.2, 1.1, 'none', { op: 1 }); for (const [x, y] of [[6.8, 7], [8, 8.8]]) g.disc(x, y, 0.25, 0.25, DARK); g.line([6.6, 9, 1.7], [6.6, 9.6, 2.4], { sw: 1 });
    g.person(4.4, 8, 0); },
  SE3: g => { g.canopy(0.8, 0.8, 2.6, 2.2, 2.6, g.a); g.canopy(4.2, 0.8, 2.6, 2.2, 2.6, '#e07a5f'); g.canopy(7.2, 3.6, 2.2, 2.6, 2.6, '#77b37d');
    g.box(1, 1, 0, 2.2, 1, 1.2, WOOD); g.box(4.4, 1, 0, 2.2, 1, 1.2, WOOD); g.box(7.4, 3.8, 0, 1, 2.2, 1.2, WOOD);
    g.table(2.2, 5.4, 3.6, 1.4); g.sitter(3, 7.4, 0.8); g.sitter(4.8, 7.4, 0.8, { fill: '#959ea6' }); g.person(6.6, 8.6); },
  SE4: g => { g.box(1, 0.8, 0, 5.4, 1.2, 1.8, WOOD, { top: '#f1e6d6' }); g.cyl(2.4, 1.3, 1.8, 0.4, 0.5, WHITE); g.cyl(4.6, 1.3, 1.8, 0.4, 0.5, g.a);
    g.roundTable(3, 5.4, 1); g.chair(1.5, 4.9); g.chair(3.6, 6.6); g.roundTable(7.2, 6.4, 1); g.chair(7.8, 7.6);
    g.sitter(1.9, 5.4, 0.8); g.person(6.2, 3.4, 0, { arm: 0.5 }); },
  SE5: g => { g.box(0.6, 0.6, 0, 4.2, 4, 2.6, WHITE); onWallY(g, 4.6, 1, 4.4, 0.4, 2.2, g.a, { depth: 6 });
    g.box(0.6, 0.6, 2.6, 9, 3, 0.3, '#e7eaec', { depth: 6.5 }); g.box(5.6, 0.6, 2.9, 4, 3, 2.4, WHITE, { depth: 7 }); onWallY(g, 3.6, 6, 9.2, 3.3, 4.8, GOLD, { depth: 10 });
    g.poly([[5.4, 4.6, 0], [6.8, 4.6, 0], [6.8, 8.6, 0], [5.4, 8.6, 0]], '#d9dde0', { depth: 9 }); g.poly([[5.2, 3.6, 2.9], [7, 3.6, 2.9], [7, 8.4, 0.1], [5.2, 8.4, 0.1]], tint(g.a, 0.4), { depth: 12.5 });
    g.person(6.2, 5.6, 1.8, { s: 0.85, depth: 13 }); g.person(2.6, 7.4, 0); },
  SE6: g => { g.canopy(0.8, 1, 2.4, 2.4, 2.2, g.a); g.canopy(4, 0.8, 2.4, 2.4, 2.2, '#e07a5f'); g.canopy(7, 2.4, 2.4, 2.4, 2.2, '#9c89b8');
    stringLights(g, 5, 4); g.person(3, 6.4); g.person(5.2, 7.8, 0, { fill: '#959ea6' }); g.person(7.2, 6.8); g.person(2, 8.6, 0, { s: 0.6 }); },
  SE7: g => { g.wall(0.6, 0.6, 5.6, 0.6, 0, 4, WHITE, { depth: -50 }); onWallY(g, 0.6, 1.4, 4.6, 1.6, 3.8, GLASS, { depth: -49 });
    g.cyl(3, 3, 0, 0.5, 0.8, DARK); g.box(2.3, 2.4, 0.8, 1.4, 1.3, 0.5, g.a); g.box(2.3, 2.4, 1.3, 1.4, 0.3, 1.4, g.a, { depth: 5.2 });
    g.box(6.2, 0.8, 0, 3, 1.2, 1.8, WHITE); g.wall(6.2, 0.6, 9.4, 0.6, 0, 4.4, WHITE, { depth: -50 }); const [cx, cy] = P(7.8, 0.6, 3.4); sym(g, 'cross', cx, cy, 0.8, '#3fae6a', -40);
    g.person(4.4, 5.6, 0, { arm: 0.5 }); g.person(7.4, 4, 0); },

  // ---------- Arrive & Move ----------
  AM1: g => { g.box(0.4, 0.6, 0.2, 9.2, 2.4, 2.6, '#e8eef2'); onWallY(g, 3, 1, 9, 1.4, 2.2, DARK, { depth: 5 }); onWallY(g, 3, 0.4, 9.6, 0.6, 1, g.a, { depth: 5 });
    g.line([0.4, 3.5, 0.03], [9.6, 3.5, 0.03], { stroke: GOLD, sw: 1.4, depth: -30 });
    for (const x of [2, 4, 6, 8]) g.box(x, 6.4, 0, 0.4, 1.4, 1.3, '#c7cdd1'); g.person(3, 5, 0); g.person(6.8, 8.6, 0, { fill: '#959ea6' }); g.box(7.3, 8.6, 0.2, 0.8, 0.5, 1, g.a, { depth: 17 }); },
  AM2: g => { backWalls(g, 4.6); onWallY(g, 0, 1.4, 3.2, 0, 3.2, shade(WOOD, 0.25), { depth: -48 }); const [kx, ky] = P(3, 0, 1.6); g.add(-47, `<circle cx="${kx}" cy="${ky}" r="0.7" fill="${GOLD}"/>`);
    onWallY(g, 0, 5.4, 6.6, 0, 3.4, '#b9c2c9', { depth: -48 }); onWallY(g, 0, 6.6, 7.8, 0, 3.4, '#aab4bc', { depth: -48 });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) onWallX(g, 0, 2 + c * 1.1, 2.9 + c * 1.1, 1.4 + r * 0.9, 2.1 + r * 0.9, tint(g.a, 0.3), { depth: -47 });
    g.person(4.6, 5.6, 0, { arm: 0.6 }); g.plant(8.4, 8); },
  AM3: g => { g.box(1, 1.4, 0, 6, 1.4, 1.9, g.a, { top: WOOD }); const [bx, by] = P(3.2, 2, 1.9);
    g.add(6, `<path d="M${bx - 2.4},${by} A2.4,2.4 0 0 1 ${bx + 2.4},${by} Z" fill="${GOLD}" stroke="${INK}" stroke-width="0.5"/><circle cx="${bx}" cy="${by - 2.8}" r="0.5" fill="${GOLD}"/>`);
    g.line([7.6, 5, 0], [7.6, 5, 3.4]); g.line([8.8, 5, 0], [8.8, 5, 3.4]); g.line([7.6, 5, 3.4], [8.8, 5, 3.4]); g.box(7.7, 5.2, 0.3, 1, 1.4, 0.3, '#c7cdd1');
    g.box(7.8, 5.4, 0.6, 0.8, 1, 1.6, '#e07a5f'); g.box(7.8, 5.4, 2.2, 0.8, 1, 0.9, GOLD);
    g.person(4.6, 6.4, 0); g.box(5.1, 6.6, 0, 0.9, 0.5, 1.6, '#3d5a80', { depth: 12.5 }); g.person(3, 1, 0, { s: 0.95, depth: 3 }); },
  AM4: g => { g.box(0.6, 0.6, 0, 0.6, 0.6, 5, WHITE); g.box(8.8, 0.6, 0, 0.6, 0.6, 5, WHITE); g.box(0.6, 0.6, 5, 8.8, 0.6, 0.6, WHITE, { depth: 5.5 });
    onWallY(g, 0.6, 1.2, 8.8, 0, 5, GLASS, { depth: -48, op: 0.6 }); g.cyl(4, 4.6, 0, 1.4, 1.6, g.a); g.box(7, 4.2, 0, 0.5, 1.8, 3.4, DARK);
    for (let i = 0; i < 4; i++) g.line([7.02, 4.4 + i * 0.4, 1.4 + i * 0.5], [7.02, 5.8, 1.4 + i * 0.5], { stroke: '#ffffff', sw: 0.5, depth: 11.7 });
    g.person(5.2, 7.4); g.person(2.6, 6.4, 0, { fill: '#959ea6' }); g.person(8, 8.4, 0, { s: 0.6 }); },
  AM5: g => { g.wall(0.4, 0.6, 9.6, 0.6, 0, 4.6, WHITE, { depth: -50 });
    for (let i = 0; i < 4; i++) { const x = 1 + i * 2.2; onWallY(g, 0.6, x, x + 1.6, 0, 3.2, '#aab4bc', { depth: -49 }); g.line([x + 0.8, 0.6, 0], [x + 0.8, 0.6, 3.2], { sw: 0.4, depth: -48 });
      const [ax, ay] = P(x + 0.8, 0.6, 3.9); g.add(-47, `<path d="M${ax - 1.6},${ay + 0.8} l1.6,-2 1.6,2 z" fill="${i % 2 ? g.a : GREEN}"/>`); }
    g.person(3, 3.4); g.person(5.6, 5.6, 0, { fill: '#959ea6' }); g.person(7.6, 3.4); g.person(2.4, 7.4); },
  AM6: g => { g.wall(0.6, 0.6, 9.4, 0.6, 0, 4, tint(WOOD, 0.45), { depth: -50 });
    for (const [x, z] of [[2, 2.6], [3.4, 2], [5, 2.8], [6.6, 2.2]]) g.line([x, 0.6, z], [x + 0.8, 0.6, z + 0.8], { sw: 0.9, depth: -49 });
    for (const y of [3, 5.4]) g.box(1, y - 0.1, 0, 7, 0.2, 0.9, '#c7cdd1'); g.bike(2.4, 2.4); g.bike(4.6, 2.4); g.bike(2.4, 4.8); g.person(7.6, 7.2, 0, { arm: 0.6 }); g.line([6.6, 7.6, 0], [6.6, 7.6, 2.4], { sw: 1 }); },
  AM7: g => { for (const x of [1, 4.2, 7.4]) g.line([x, 1.2, 0.03], [x, 6.8, 0.03], { stroke: '#ffffff', sw: 1, depth: -30 });
    g.car(1.8, 2, g.a); g.line([8.4, 8, 0], [8.4, 8, 1.6], { sw: 1.4 }); g.poly([[8.4, 8, 1.4], [3.4, 8, 1.4], [3.4, 8, 1.8], [8.4, 8, 1.8]], RED, { depth: 16.5 });
    g.text(5.8, 4.2, 0, '12', { size: 7, fill: '#ffffff', depth: -29 }); },
  AM8: g => { for (const x of [0.8, 3.8, 6.8]) g.line([x, 1, 0.03], [x, 6.2, 0.03], { stroke: '#ffffff', sw: 1, depth: -30 });
    g.car(1.3, 1.4, '#b9c2c9'); g.car(4.3, 1.4, g.a); g.line([8.4, 7.6, 0], [8.4, 7.6, 4.2], { sw: 1.2 }); sign(g, 7.6, 7.6, 4.2, 1.8, 1.8, '#2f6fb3', 'P');
    g.box(6.6, 8.2, 0, 0.7, 0.6, 1.6, '#e7eaec'); g.person(4.4, 8.6); },
  AM9: g => { g.line([1, 1.2, 0.03], [1, 6.8, 0.03], { stroke: '#ffffff', sw: 1, depth: -30 }); g.line([4.6, 1.2, 0.03], [4.6, 6.8, 0.03], { stroke: '#ffffff', sw: 1, depth: -30 });
    g.car(1.8, 2, g.a); g.box(5.6, 2.2, 0, 0.8, 0.8, 2.6, '#3fae6a'); const [px, py] = P(6, 2.2, 1.8); sym(g, 'bolt', r1(px - 1.6), py, 0.6, GOLD, 9);
    const [a, b] = [P(5.6, 2.6, 1.4), P(4, 3, 1)]; g.add(8.5, `<path d="M${a[0]},${a[1]} Q${a[0] - 4},${a[1] + 10} ${b[0]},${b[1]}" stroke="${INK}" stroke-width="0.9" fill="none"/>`); g.person(6.8, 6.6); },
  AM10: g => { g.wall(0.4, 0.6, 9.6, 0.6, 0, 4.6, WHITE, { depth: -50 }); onWallY(g, 0.6, 1, 6, 0, 3.6, '#c7cdd1', { depth: -49 });
    for (let i = 1; i < 6; i++) g.line([1, 0.6, i * 0.6], [6, 0.6, i * 0.6], { sw: 0.4, depth: -48 });
    g.box(1.2, 1.4, 0.4, 4.4, 4.4, 2.8, WHITE); g.box(1.4, 5.8, 0.4, 4, 1.6, 2, g.a); g.disc(5.6, 2.6, 0.4, 0.5, DARK, { depth: 9 }); g.disc(5.6, 6.6, 0.4, 0.5, DARK, { depth: 13 });
    for (const [x, y] of [[7, 2], [7.8, 2.6], [7.2, 3.4]]) g.box(x, y, 0, 0.9, 0.9, 0.9, WOOD); g.box(7, 6, 0, 0.9, 0.9, 1.3, '#3fae6a'); g.box(8.2, 6, 0, 0.9, 0.9, 1.3, '#2f6fb3'); g.person(7.2, 8.6); },
  AM11: g => { g.disc(5, 5.4, 0.03, 3.6, DARK, { depth: -38 }); g.disc(5, 5.4, 0.04, 3, 'none', { stroke: GOLD, sw: 0.8, depth: -37 }); g.text(5, 5.4, 0.05, 'H', { size: 10, fill: '#ffffff', depth: -36 });
    const c = [5, 5, 5.4]; for (const [dx, dy] of [[-1.4, -1.4], [1.4, 1.4], [1.4, -1.4], [-1.4, 1.4]]) { g.line(c, [c[0] + dx, c[1] + dy, c[2]], { sw: 0.9, depth: 40 }); g.disc(c[0] + dx, c[1] + dy, c[2] + 0.1, 0.7, tint(g.a, 0.4), { depth: 41, sw: 0.5 }); }
    g.box(4.6, 4.6, 5.2, 0.8, 0.8, 0.5, DARK, { depth: 40.5 }); g.line([5, 5, 5.2], [5, 5, 3.8], { sw: 0.5, depth: 40 }); g.box(4.6, 4.6, 3, 0.8, 0.8, 0.8, WOOD, { depth: 39 }); },
  AM12: g => { g.box(0.6, 0.6, 0, 8.8, 1, 6, WHITE, { depth: -50 }); onWallY(g, 1.6, 1.4, 8.6, 0, 4.8, '#c7cdd1', { depth: 1 }); for (let i = 1; i < 8; i++) g.line([1.4, 1.6, i * 0.6], [8.6, 1.6, i * 0.6], { sw: 0.35, depth: 1.5 });
    g.box(2, 2.6, 0.4, 5.6, 2.4, 2.2, RED); g.box(6.4, 2.6, 2.6, 1.2, 2.4, 1.2, RED, { depth: 9 }); g.box(2.2, 2.8, 2.6, 3.8, 2, 0.3, '#c7cdd1', { depth: 7.2 });
    g.disc(7.6, 3.2, 0.4, 0.6, DARK, { depth: 11 }); g.disc(3.2, 5, 0.4, 0.6, DARK, { depth: 9 }); g.person(5, 8, 0, { fill: '#5f6a73' }); },

  // ---------- Make & Produce ----------
  MK1: g => { g.line([3.4, 3, 0], [4, 2.6, 5]); g.line([4.6, 3, 0], [4, 2.6, 5]); g.line([4, 1.8, 0], [4, 2.6, 5]);
    g.poly([[2.8, 2.9, 1.6], [5.2, 2.9, 1.6], [5.2, 2.9, 4.6], [2.8, 2.9, 4.6]], WHITE, { depth: 6.5 });
    const [cx, cy] = P(4, 2.9, 3.1); g.add(6.6, `<circle cx="${cx - 3}" cy="${cy - 2}" r="3" fill="${g.a}"/><path d="M${cx - 6},${cy + 5} q5,-8 12,-3" stroke="#5aa9e6" stroke-width="1.6" fill="none"/><rect x="${cx + 1}" y="${cy - 6}" width="4" height="4" fill="${GOLD}"/>`);
    g.box(5.8, 5, 0, 2.6, 1.4, 1.5, WOOD); for (const [x, c] of [[6.2, RED], [6.8, '#5aa9e6'], [7.4, GOLD], [8, GREEN]]) g.disc(x, 5.7, 1.52, 0.25, c, { depth: 12, sw: 0.3 }); g.person(5, 4.4, 0, { arm: 1 }); },
  MK2: g => { g.wall(0.6, 0.6, 9.4, 0.6, 0, 4.4, tint(WOOD, 0.4), { depth: -50 }); for (let i = 0; i < 6; i++) g.line([1.4 + i * 1.3, 0.6, 2], [1.4 + i * 1.3, 0.6, 3.6], { sw: 1, depth: -49, stroke: i % 2 ? RED : DARK });
    g.table(1.4, 2.4, 6.4, 1.6, 0, WOOD); g.box(2, 2.6, 1.75, 1.8, 1.2, 1.8, 'none'); g.box(2.4, 2.9, 1.75, 1, 0.6, 0.6, g.a, { depth: 7 }); g.box(5, 2.6, 1.75, 2, 1.2, 0.7, DARK);
    g.person(4.4, 5.6, 0, { arm: 0.5 }); g.box(6.4, 6.6, 0, 1.6, 1.6, 1, '#c7cdd1'); },
  MK3: g => { g.box(0.8, 0.8, 0, 4.2, 3, 3.4, '#c7cdd1'); onWallY(g, 3.8, 1.4, 2.8, 1.4, 2.8, DARK, { depth: 6 }); g.box(1.4, 0.8, 3.4, 1, 1, 1.2, '#9aa7b1', { depth: 5 });
    for (const [x, y, z] of [[6.4, 1, 0], [6.4, 1, 1.1], [8, 1, 0]]) { g.box(x, y, z, 1.4, 1.4, 0.2, WOOD); g.box(x + 0.1, y + 0.1, z + 0.2, 1.2, 1.2, 0.8, tint(WOOD, 0.4)); }
    g.box(3, 5.6, 0.3, 2.2, 2.6, 1.6, GOLD); g.line([5.4, 5.8, 0], [5.4, 5.8, 3.6], { sw: 1.2 }); g.line([5.4, 8, 0], [5.4, 8, 3.6], { sw: 1.2 }); g.box(5.5, 6, 0.6, 1.6, 0.3, 0.12, DARK); g.box(5.5, 7.6, 0.6, 1.6, 0.3, 0.12, DARK);
    g.disc(3.6, 8.2, 0.3, 0.4, DARK, { depth: 12 }); g.person(8, 7.4); },
  MK4: g => { g.poly([[0.6, 3, 0], [3, 0.6, 0], [3, 0.6, 5], [0.6, 3, 5]], '#77b37d', { depth: -50 }); g.poly([[3, 0.6, 0], [8, 0.6, 0], [8, 0.6, 5], [3, 0.6, 5]], '#77b37d', { depth: -50 });
    g.poly([[0.6, 3, 2.4], [3, 0.6, 2.4], [3, 0.6, 5], [0.6, 3, 5]], '#86c5e6', { depth: -49, sw: 0 }); g.poly([[3, 0.6, 2.4], [8, 0.6, 2.4], [8, 0.6, 5], [3, 0.6, 5]], '#86c5e6', { depth: -49, sw: 0 });
    const [mx, my] = P(5.4, 0.6, 2.4); g.add(-48, `<path d="M${mx - 14},${my} l8,-9 6,5 5,-7 9,11 z" fill="#5c946e" stroke="${INK}" stroke-width="0.4"/>`);
    g.line([6, 6, 0], [6.6, 6.6, 2.4]); g.line([7.2, 6, 0], [6.6, 6.6, 2.4]); g.line([6.6, 7.4, 0], [6.6, 6.6, 2.4]); g.box(6.1, 6.1, 2.4, 1, 1.4, 0.9, DARK, { depth: 14 }); g.cyl(6.6, 5.9, 2.6, 0.35, 0.5, g.a, { depth: 14.1 });
    g.line([8.6, 3, 0], [8.6, 3, 4]); g.box(8.2, 2.6, 4, 0.8, 0.8, 0.8, GOLD, { depth: 11 }); g.person(4.4, 7.8); },
  MK5: g => { g.box(0.8, 0.8, 0, 4.2, 3.8, 4, tint(g.a, 0.55)); onWallY(g, 4.6, 1.6, 4.2, 1.6, 3.4, GLASS, { depth: 9 }); g.line([3, 2.6, 0], [3, 2.6, 2.6], { depth: 8 }); const [mx, my] = P(3, 2.6, 2.6); g.add(8.1, `<circle cx="${mx}" cy="${my}" r="1.2" fill="${DARK}"/>`);
    g.box(5.6, 5.4, 0, 3.4, 1.8, 1.4, DARK, { top: '#4b5a67' }); for (let i = 0; i < 6; i++) g.line([5.9 + i * 0.5, 5.6, 1.42], [5.9 + i * 0.5, 6.6, 1.42], { stroke: i % 2 ? GOLD : '#5ad1e6', sw: 0.6, depth: 13 });
    g.sitter(7, 8, 0.8); const [hx, hy] = P(7, 8, 0.8); g.add(16, `<path d="M${hx - 2.4},${r1(hy - 10)} A2.4,2.4 0 0 1 ${hx + 2.4},${r1(hy - 10)}" stroke="${RED}" stroke-width="1" fill="none"/>`); },
  MK6: g => { g.box(0.8, 0.8, 0, 8.4, 1.4, 1.8, '#d9dee2'); g.box(3, 0.6, 3.6, 3.4, 2, 1.2, '#c7cdd1', { depth: 4.5 }); g.line([3.4, 0.8, 1.8], [3.4, 0.8, 3.6], { sw: 0.4, depth: 4.4 }); g.line([6, 0.8, 1.8], [6, 0.8, 3.6], { sw: 0.4, depth: 4.4 });
    g.cyl(3.8, 1.5, 1.8, 0.6, 0.8, '#9aa7b1'); g.cyl(5.4, 1.5, 1.8, 0.5, 0.5, g.a); g.box(0.8, 3.6, 0, 1.4, 5, 1.8, '#d9dee2');
    g.person(5, 4.6, 0, { fill: '#5f6a73' }); const [hx, hy] = P(5, 4.6, 0); g.add(10, `<rect x="${hx - 2}" y="${r1(hy - 14.6)}" width="4" height="2.6" rx="1" fill="#ffffff" stroke="${INK}" stroke-width="0.4"/>`); },
  MK7: g => { for (const x of [1, 3.6, 6.2]) { g.box(x, 1.4, 0, 2, 1.4, 5, DARK); for (let i = 0; i < 6; i++) { g.line([x + 0.2, 2.8, 0.6 + i * 0.75], [x + 1.4, 2.8, 0.6 + i * 0.75], { stroke: '#4b5a67', sw: 0.5, depth: x + 3.1 }); const [lx, ly] = P(x + 1.7, 2.8, 0.6 + i * 0.75); g.add(x + 3.2, `<circle cx="${lx}" cy="${ly}" r="0.55" fill="${i % 3 ? '#5ad1e6' : '#7fd1a1'}"/>`); } }
    g.person(5, 6.8); },

  // ---------- Work ----------
  WK1: g => { g.wall(0.4, 0.4, 9.6, 0.4, 0, 4.6, GLASS, { depth: -50, op: 0.7 }); g.wall(0.4, 0.4, 0.4, 9.6, 0, 4.6, GLASS, { depth: -50, op: 0.7 });
    g.box(1, 1, 0, 3.6, 3, 3.4, GLASS, { op: 0.45 }); g.table(1.6, 1.8, 2.4, 1.2, 0, WHITE);
    g.desk(5.4, 4.6, 2.6, 1.2); g.desk(5.4, 7, 2.6, 1.2); g.sitter(6.6, 6.4, 0.8); g.plant(2, 7.6); g.person(3.4, 5.6, 0, { fill: '#959ea6' }); },
  WK2: g => { backWalls(g, 3.4, '#eceee9'); g.box(0.8, 0.8, 0, 1, 2.8, 2.2, '#b9c2c9'); g.box(0.8, 3.8, 0, 1, 1.4, 2.2, '#b9c2c9');
    g.desk(3, 2, 2.4, 1.1); g.desk(6.2, 2, 2.4, 1.1); g.desk(3, 5.6, 2.4, 1.1); g.sitter(4.2, 7.2, 0.8); g.sitter(7.4, 3.6, 0.8, { fill: '#959ea6' }); },
  WK3: g => { g.table(2, 3.4, 5.6, 1.8, 0, WOOD); for (const x of [2.6, 4.4, 6.2]) g.box(x, 3.8, 1.75, 0.9, 0.6, 0.08, DARK, { depth: x + 4.6 });
    g.sofa(1, 7.4, 3, g.a); g.box(7, 0.8, 0, 2.4, 1, 1.8, WOOD); g.cyl(7.8, 1.3, 1.8, 0.35, 0.45, WHITE);
    g.sitter(3, 6, 0.8); g.sitter(5.4, 6, 0.8, { fill: '#959ea6' }); g.sitter(4.4, 2.6, 0.8); },
  WK4: g => { g.box(0.8, 0.8, 0, 3, 1.4, 4.6, '#e7eaec'); onWallY(g, 2.2, 1.1, 3.5, 1.8, 3.8, GLASS, { depth: 4.4 });
    g.box(1, 4, 0, 6.4, 1.4, 1.9, WHITE); const fl = [[2, '#5aa9e6'], [3.4, GREEN], [4.8, g.a], [6.2, '#9c89b8']];
    fl.forEach(([x, c]) => { const [fx, fy] = P(x, 4.6, 1.9); g.add(x + 6, `<path d="M${fx - 0.8},${fy - 4} h1.6 v1.4 l2,2.6 h-5.6 l2,-2.6 z" fill="${c}" stroke="${INK}" stroke-width="0.5"/>`); });
    g.person(5, 7.4, 0, { fill: '#c3cad0' }); },
  WK5: g => { g.box(1, 1.4, 0, 6.4, 1.4, 1.9, WHITE, { top: WOOD }); g.wall(1, 1.4, 7.4, 1.4, 1.9, 1.6, GLASS, { depth: 3.8, op: 0.6 });
    g.line([8.6, 1, 0], [8.6, 1, 5.4], { sw: 0.9 }); g.poly([[8.6, 1, 5.4], [8.6, 3.2, 5.4], [8.6, 3.2, 4], [8.6, 1, 4]], g.a, { depth: 10 });
    for (const y of [5, 7.4]) g.line([4, y, 0], [4, y, 1.6], { sw: 1 }); g.line([4, 5, 1.4], [4, 7.4, 1.4], { stroke: RED, sw: 0.8 });
    g.person(3.6, 3.6); g.person(5, 6, 0, { fill: '#959ea6' }); g.person(5, 8.4); g.person(3, 0.8, 0, { depth: 2 }); },
  WK6: g => { g.wall(0.6, 0.6, 8.4, 0.6, 0.6, 4, WHITE, { depth: -50 }); const notes = [GOLD, '#e85d75', '#5aa9e6', GREEN, GOLD, '#e85d75'];
    notes.forEach((c, i) => onWallY(g, 0.6, 1.4 + (i % 3) * 1.4, 2.4 + (i % 3) * 1.4, 2.6 - Math.floor(i / 3) * 1.3, 3.5 - Math.floor(i / 3) * 1.3, c, { depth: -49, sw: 0.4 }));
    const [rx, ry] = P(7, 0.6, 2.8); sym(g, 'rocket', rx, ry, 0.9, g.a, -48);
    g.roundTable(5, 6, 1.6); g.sitter(3.2, 6.2, 0.8); g.sitter(5.2, 7.8, 0.8, { fill: '#959ea6' }); g.person(3.6, 3.4, 0, { arm: 1 }); },

  // ---------- Learn ----------
  LN1: g => { g.wall(0.6, 0.6, 9.4, 0.6, 0.8, 3.4, '#3f6d55', { depth: -50 }); const [bx, by] = P(4, 0.6, 3); g.add(-49, `<text x="${bx}" y="${by}" font-family="Helvetica" font-size="5" fill="#ffffff">ABC</text>`);
    g.box(0.8, 1.6, 0, 1, 3.8, 2, WHITE); for (let i = 0; i < 3; i++) onWallX(g, 1.8, 1.9 + i * 1.2, 2.9 + i * 1.2, 0.8, 1.6, ['#e85d75', GOLD, '#5aa9e6'][i], { depth: 5 });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { g.box(3.4 + c * 2, 3.4 + r * 2.6, 0, 1.3, 1, 1, tint(g.a, 0.3)); g.person(4 + c * 2, 5 + r * 2.6, 0, { s: 0.55 }); } },
  LN2: g => { g.wall(0.6, 0.6, 9.4, 0.6, 1, 3.4, '#3f6d55', { depth: -50 }); g.line([2, 0.6, 3], [6.4, 0.6, 3], { stroke: '#ffffff', sw: 0.7, depth: -49 }); g.line([2, 0.6, 2.2], [5, 0.6, 2.2], { stroke: '#ffffff', sw: 0.7, depth: -49 });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { g.desk(2.4 + c * 3.6, 3 + r * 3, 2, 1, false); g.sitter(3.4 + c * 3.6, 4.8 + r * 3, 0.8, { s: 0.85 }); }
    g.person(8.6, 1.8, 0, { arm: 1 }); },
  LN3: g => { g.wall(0.6, 0.6, 9.4, 0.6, 1.4, 3.8, WHITE, { depth: -50 }); onWallY(g, 0.6, 1.4, 8.6, 1.8, 4.8, tint(g.a, 0.5), { depth: -49 });
    g.stairs(1, 3.4, 8, 4, 1.4, 0.5, WHITE); for (let i = 0; i < 4; i++) g.box(1.2, 3.6 + (3 - i) * 1.4, (i + 1) * 0.5, 7.6, 0.3, 0.6, WOOD, { depth: 6 + (4 - i) * 0.9 + 0.2 });
    g.sitter(3, 6.6, 1.5, { s: 0.85 }); g.sitter(6, 8, 1, { s: 0.85, fill: '#959ea6' }); g.person(2, 1.8, 0, { arm: 1 }); },
  LN4: g => { const c1 = ['#d1495b', '#5aa9e6', GOLD, GREEN, '#9c89b8']; g.shelf(0.8, 0.8, 4, 1, 4.6, WHITE, 3, c1); g.shelf(5.4, 0.8, 4, 1, 4.6, WHITE, 3, [...c1].reverse());
    g.table(2.4, 5.2, 4, 1.8, 0, WOOD); g.line([5.6, 5.6, 1.75], [5.6, 5.6, 3.2]); g.cyl(5.6, 5.6, 3.2, 0.7, 0.5, GOLD, { depth: 12 }); g.sitter(3.6, 7.8, 0.8); g.person(8.4, 6.4); },
  LN5: g => { g.wall(0.6, 0.6, 7, 0.6, 1, 3, WHITE, { depth: -50 }); onWallY(g, 0.6, 1.2, 6.4, 1.4, 3.6, tint(g.a, 0.55), { depth: -49 });
    g.table(2, 3.4, 5.4, 2.4, 0, WOOD); for (const x of [2.6, 4.4, 6.2]) g.box(x, 3.7, 1.75, 0.9, 0.6, 0.08, DARK, { depth: x + 4.6 });
    g.sitter(3, 6.8, 0.8); g.sitter(5.4, 6.8, 0.8, { fill: '#959ea6' }); g.sitter(8.2, 4.6, 0.8); },
  LN6: g => { g.stairs(1, 1, 8, 4, 1.4, 0.6, tint(WOOD, 0.3)); g.wall(0.4, 0.4, 0.4, 9.6, 0.4, 4, WHITE, { depth: -50 }); onWallX(g, 0.4, 1.6, 8.4, 1, 3.8, tint(g.a, 0.5), { depth: -49 });
    g.sitter(3, 3.4, 1.8); g.sitter(6, 4.6, 1.2, { fill: '#959ea6' }); g.sitter(3.6, 6.2, 0.6, { s: 0.65 }); g.person(7.2, 8.4); g.person(5, 8.8, 0, { s: 0.6 }); },

  // ---------- Care & Heal ----------
  CH1: g => { floorRect(g, 5.4, 4.8, 9.6, 9.6, tint(GREEN, 0.35), { depth: -39 });
    for (const [a, b] of [[[5.4, 9.6], [9.6, 9.6]], [[9.6, 4.8], [9.6, 9.6]]]) { g.line([...a, 1.2], [...b, 1.2], { sw: 0.7, depth: 19 }); for (let t = 0; t <= 1; t += 0.2) { const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; g.line([...p, 0], [...p, 1.2], { sw: 0.5, depth: p[0] + p[1] }); } }
    g.box(1, 1, 0, 2.6, 1.6, 0.9, tint(g.a, 0.2)); g.box(1.2, 4, 0, 1, 1, 1, '#e85d75'); g.box(2.3, 4, 0, 1, 1, 0.6, GOLD); g.box(1.6, 4.2, 1, 0.8, 0.8, 0.8, '#5aa9e6');
    g.person(4.6, 3, 0); g.person(2.2, 6.6, 0, { s: 0.55 }); g.person(7.2, 7, 0, { s: 0.55 }); g.person(8.2, 6, 0, { s: 0.5, fill: '#959ea6' }); g.disc(7.2, 5.8, 0.05, 0.6, '#e98a3a', { depth: 13 }); },
  CH2: g => { g.box(1, 1, 0, 2.2, 4, 1.4, WHITE); g.box(1.1, 1.1, 1.4, 2, 1, 0.3, tint(g.a, 0.3), { depth: 3.8 });
    g.wall(4, 0.6, 4, 6, 0, 4, tint(g.a, 0.5), { depth: 3, op: 0.9 }); g.line([4, 0.6, 4], [4, 6, 4], { sw: 0.8 });
    g.desk(6, 4.4, 2.4, 1.2); g.person(6.6, 7.4, 0, { fill: '#c3cad0' }); g.sitter(2.2, 6.4, 0.8, { fill: '#959ea6' }); },
  CH3: g => { g.wall(0.6, 0.6, 9.4, 0.6, 0, 4.6, WHITE, { depth: -50 }); const [cx, cy] = P(7.6, 0.6, 3.4); sym(g, 'cross', cx, cy, 1, RED, -49);
    for (const [x, y] of [[2, 2.4], [4.4, 2.4], [2, 6.6], [4.4, 6.6]]) g.line([x, y, 0], [x, y, 1.3], { sw: 0.7 });
    g.box(1.8, 2.2, 1.3, 2.8, 4.6, 0.4, WHITE); g.lying(2.2, 3.2, 1.7); g.line([6, 2, 0], [6, 2, 3.2], { sw: 0.9 }); g.box(5.6, 1.6, 3.2, 1, 0.5, 1.2, DARK, { depth: 7.5 });
    const [mx, my] = P(6.1, 2.1, 3.8); g.add(7.6, `<path d="M${mx - 2},${my} l1,0 0.6,-1.4 0.8,2.4 0.6,-1 1.2,0" stroke="#7fd1a1" stroke-width="0.6" fill="none"/>`); g.person(6.6, 6.8, 0, { fill: '#c3cad0' }); },
  CH4: g => { g.wall(0.5, 0.6, 0.5, 9.4, 0, 4.4, GLASS, { depth: -50, op: 0.7 }); g.sofa(1.2, 2, 1.6, g.a); g.sitter(1.9, 2.6, 0.7, { fill: '#9aa3ab' });
    g.bed(5.6, 1, 2.4, 3.4); for (const [x, y] of [[4.6, 6.6], [5.6, 6.6], [4.6, 7.4], [5.6, 7.4]]) g.line([x, y, 0], [x, y, 1.8], { sw: 0.6 }); g.line([4.6, 6.6, 1.8], [5.6, 6.6, 1.8], { sw: 0.8 }); g.line([4.6, 7.4, 1.8], [5.6, 7.4, 1.8], { sw: 0.8 });
    g.person(6.6, 7.4, 0, { fill: '#9aa3ab' }); },
  CH5: g => { g.bed(2, 1.4, 2.6, 4, WHITE, tint(g.a, 0.4)); g.line([2, 2.4, 1.5], [2, 5, 1.5], { sw: 0.8, depth: 6 }); g.line([4.6, 2.4, 1.5], [4.6, 5, 1.5], { sw: 0.8, depth: 8 });
    g.lying(2.6, 2.6, 0.9); g.box(5.4, 1.4, 0, 1.2, 1.2, 1.4, WOOD); g.plant(6, 2, 1.4); g.person(6, 5.6, 0, { fill: '#c3cad0' }); },
  CH6: g => { g.wall(0.6, 0.6, 9.4, 0.6, 0, 5, WHITE, { depth: -50 }); const [cx, cy] = P(5, 0.6, 3.8); sym(g, 'cross', cx, cy, 1.2, RED, -49);
    for (const x of [1.2, 6]) { g.bed(x, 1.4, 2.4, 3.6, WHITE, tint(g.a, 0.4)); g.line([x + 2.8, 1.4, 0], [x + 2.8, 1.4, 3.6], { sw: 0.7 }); g.box(x + 2.5, 1.2, 3.6, 0.7, 0.4, 0.8, DARK, { depth: x + 3 }); }
    g.line([4.4, 6.6, 0], [4.4, 6.6, 4]); g.cyl(4.4, 6.6, 3.4, 0.35, 0.6, '#cfe6f2', { depth: 11.2 }); g.person(7, 7.4, 0, { fill: '#c3cad0' }); },
  CH7: g => { g.sofa(1.4, 2.4, 1.6, g.a); g.sofa(1.4, 6.4, 1.6, tint(g.a, 0.3)); g.roundTable(5.2, 5, 0.8); g.plant(5.2, 5, 1.75);
    g.sitter(2.1, 3, 0.7); g.sitter(2.1, 7, 0.7, { fill: '#959ea6' }); g.plant(8.4, 1.6); },
  CH8: g => { g.box(2.2, 2.4, 0, 2.2, 4.4, 1.5, WHITE, { top: tint(g.a, 0.4) }); g.lying(2.8, 3.4, 1.5); for (let i = 0; i < 3; i++) g.box(6.4, 1.4, i * 0.4, 1.6, 1.2, 0.4, [WHITE, tint(g.a, 0.4), WHITE][i]);
    g.plant(7.6, 6.6); g.person(5.4, 7.2, 0, { fill: '#959ea6' }); g.cyl(1.2, 8, 0, 0.5, 0.8, GOLD); },
  CH9: g => { g.bunk(0.8, 0.8, WHITE); g.table(4, 4.2, 4.6, 1.6, 0, WOOD); for (const x of [4.6, 5.8, 7, 8.1]) g.disc(x, 5, 1.8, 0.4, WHITE, { depth: x + 6, sw: 0.5 });
    g.cyl(8.6, 1.6, 0, 0.9, 1.6, '#9aa7b1'); g.sitter(5, 7.2, 0.8); g.sitter(7.2, 7.2, 0.8, { fill: '#959ea6' }); g.person(7, 2.6); },

  // ---------- Grow & Sustain ----------
  GS1: g => { floorRect(g, 0.6, 0.6, 9.4, 9.4, tint(GREEN, 0.4), { depth: -39 }); g.tree(2, 2, 0, { s: 1.1 }); g.tree(7.4, 1.6); g.tree(2, 7.6, 0, { s: 0.9 });
    g.box(4.6, 5.6, 0, 3, 0.9, 0.6, WOOD); g.person(6.6, 7.8); g.person(4.4, 3.6, 0, { fill: '#959ea6' }); },
  GS2: g => { for (const [x, y] of [[1, 1], [5, 1], [1, 4.6], [5, 4.6]]) { g.box(x, y, 0, 3.2, 2.4, 0.9, WOOD, { top: '#7a5a3c' }); for (let i = 0; i < 3; i++) { const [px, py] = P(x + 0.6 + i * 1, y + 1.2, 0.9); g.add(x + y + 3, `<circle cx="${px}" cy="${py - 1.6}" r="1.6" fill="${GREEN}" stroke="${INK}" stroke-width="0.35"/>`); } }
    g.person(5.6, 8.4, 0, { arm: 0.6 }); g.box(6.2, 8.2, 0.6, 0.8, 0.5, 0.7, '#5aa9e6', { depth: 15 }); },
  GS3: g => { for (const x of [1, 4.4]) { g.shelf(x, 1, 2.6, 1.2, 4.6, WHITE, 3); for (let i = 1; i <= 3; i++) { g.box(x + 0.15, 1.15, 4.6 * i / 4 - 0.02, 2.3, 0.9, 0.35, GREEN, { depth: x + 3.3 + i * 0.01, sw: 0.4 }); g.line([x + 0.2, 1.6, 4.6 * i / 4 + 0.9], [x + 2.4, 1.6, 4.6 * i / 4 + 0.9], { stroke: '#b07be0', sw: 1.2, depth: x + 3.4 }); } }
    g.person(6.2, 6.4); g.box(7.6, 4, 0, 1.4, 1.4, 1, tint(GREEN, 0.3)); },
  GS4: g => { const x0 = 1.2, y0 = 1.6, w = 7.4, d = 6, h = 3;
    g.wall(x0, y0, x0 + w, y0, 0, h, GLASS, { op: 0.6, depth: -10 }); g.wall(x0, y0, x0, y0 + d, 0, h, GLASS, { op: 0.6, depth: -10 });
    for (const [x, y] of [[3, 3.6], [5, 4.4], [6.6, 3.4], [3.8, 6]]) g.tree(x, y, 0, { s: 0.6 });
    g.poly([[x0, y0 + d, 0], [x0 + w, y0 + d, 0], [x0 + w, y0 + d, h], [x0 + w / 2, y0 + d, h + 2.4], [x0, y0 + d, h]], GLASS, { op: 0.5, depth: 30 });
    g.poly([[x0 + w, y0, 0], [x0 + w, y0 + d, 0], [x0 + w, y0 + d, h], [x0 + w, y0, h]], GLASS, { op: 0.45, depth: 30 });
    g.poly([[x0, y0, h], [x0 + w / 2, y0, h + 2.4], [x0 + w / 2, y0 + d, h + 2.4], [x0, y0 + d, h]], GLASS, { op: 0.4, depth: 29 });
    g.poly([[x0 + w / 2, y0, h + 2.4], [x0 + w, y0, h], [x0 + w, y0 + d, h], [x0 + w / 2, y0 + d, h + 2.4]], tint(GLASS, 0.2), { op: 0.55, depth: 31 }); },
  GS5: g => { g.cyl(4.6, 4.4, 0, 3, 4, WATER); for (let i = 1; i < 4; i++) { const [a, b] = [P(4.6 - 3, 4.4 + 0, i), P(4.6, 4.4, i)]; }
    g.line([1, 8.6, 0], [1, 8.6, 3]); g.line([1, 8.6, 3], [2.6, 6.6, 3]); g.line([7.6, 3.4, 4.6], [7.6, 3.4, 0], { depth: 12 });
    const [dx, dy] = P(4.6, 4.4, 6.6); sym(g, 'drop', dx, dy, 1.3, '#5aa9e6', 500); },
  GS6: g => { g.cyl(2.6, 3, 0, 1.6, 4, '#c7cdd1'); g.cyl(6.6, 2.6, 0, 1.4, 3.4, g.a);
    g.line([2.6, 5.4, 1.2], [8.4, 5.4, 1.2], { sw: 1.6, stroke: '#d1495b', depth: 9 }); g.line([2.6, 6.2, 0.8], [8.4, 6.2, 0.8], { sw: 1.6, stroke: '#5aa9e6', depth: 9.5 });
    const [fx, fy] = P(5, 7.6, 3.4); sym(g, 'flame', fx, fy, 1.2, '#f2a541', 500); },
  GS7: g => { g.line([2.6, 2.6, 0], [2.6, 2.6, 6.6], { sw: 1.2 }); const [tx, ty] = P(2.6, 2.6, 5);
    g.add(6, `<path d="M${tx - 4},${ty - 8} C${tx + 6},${ty - 5} ${tx - 6},${ty + 1} ${tx + 4},${ty + 5}" stroke="${INK}" stroke-width="1.6" fill="none"/><path d="M${tx + 4},${ty - 8} C${tx - 6},${ty - 5} ${tx + 6},${ty + 1} ${tx - 4},${ty + 5}" stroke="${g.a}" stroke-width="1.6" fill="none"/>`);
    for (const [x, y] of [[5, 4.4], [5, 7]]) { g.line([x + 0.2, y, 0], [x + 0.2, y, 0.8]); g.line([x + 3.8, y, 0], [x + 3.8, y, 1.8]); g.poly([[x, y, 0.8], [x + 4, y, 1.8], [x + 4, y + 2, 1.8], [x, y + 2, 0.8]], '#2f4d6e', { depth: x + y + 2.4 });
      g.line([x + 2, y, 1.3], [x + 2, y + 2, 1.3], { stroke: '#86a5c4', sw: 0.4, depth: x + y + 2.5 }); g.line([x, y + 1, 0.8], [x + 4, y + 1, 1.8], { stroke: '#86a5c4', sw: 0.4, depth: x + y + 2.5 }); }
    const [sx, sy] = P(9, 1, 7); g.add(7, `<circle cx="${sx}" cy="${sy}" r="3.4" fill="${GOLD}" stroke="${INK}" stroke-width="0.5"/>`); },
  GS8: g => { g.tree(2, 2, 0, { s: 1.2 }); g.tree(7.6, 2.4, 0, { s: 0.9 }); floorRect(g, 0.6, 0.6, 9.4, 9.4, tint(GREEN, 0.5), { depth: -39 });
    g.line([5, 6.4, 0], [5, 6.4, 2.6], { sw: 1 }); g.box(4.4, 5.8, 2.6, 1.2, 1.2, 1.2, WOOD, { depth: 12 }); g.poly([[4.2, 5.6, 3.8], [5, 6.4, 4.8], [5.8, 7.2, 3.8]], RED, { depth: 12.3 });
    g.box(7.2, 6.2, 0, 1.6, 0.8, 2, tint(WOOD, 0.3)); for (let i = 0; i < 4; i++) { const [hx, hy] = P(7.6 + (i % 2) * 0.8, 7, 0.6 + Math.floor(i / 2) * 0.8); g.add(15, `<circle cx="${hx}" cy="${hy}" r="0.6" fill="${DARK}"/>`); }
    for (const [x, y] of [[30, 16], [40, 11], [62, 14]]) g.add(900, `<path d="M${x - 3},${y} q1.5,-2 3,0 q1.5,-2 3,0" stroke="${INK}" stroke-width="0.8" fill="none"/>`); },

  // ---------- Stay ----------
  ST1: g => { g.wall(0.5, 0.6, 0.5, 9.4, 0, 4.6, GLASS, { depth: -50, op: 0.7 }); g.box(1.4, 0.8, 0, 3.6, 0.5, 2.6, g.a); g.bed(1.4, 1.3, 3.6, 3.8, WHITE, tint(g.a, 0.4));
    g.sofa(6.4, 1.4, 1.6, tint(g.a, 0.2)); g.cyl(7.6, 5.4, 0, 0.5, 1.4, GOLD); g.line([7.6, 5.4, 1.4], [7.4, 5.2, 2.4], { stroke: GREEN, sw: 1.2 }); g.person(4.6, 7.6); },
  ST2: g => { backWalls(g, 3.4); g.bed(1, 1, 2.4, 3.4); g.desk(5.6, 1, 2.6, 1, false); g.chair(6.4, 2.4); g.box(2.6, 6, 0, 1.6, 0.8, 2.2, '#3d5a80'); g.line([3.4, 6.4, 2.2], [3.4, 6.4, 2.8], { sw: 0.9 }); g.person(6.6, 6.6); },
  ST3: g => { backWalls(g, 3.4); g.bed(1, 1, 2.4, 3.4); g.box(5, 0.8, 0, 4.2, 1.2, 1.8, '#e7eaec'); g.cyl(6, 1.3, 1.8, 0.35, 0.35, DARK); g.cyl(7.4, 1.3, 1.8, 0.4, 0.5, g.a);
    g.roundTable(6.8, 5.6, 1); g.chair(5.3, 5.2); g.chair(7.6, 6.6); g.person(3, 7.6); },
  ST4: g => { g.bunk(1, 1); g.bunk(4.2, 1); g.box(7.6, 0.8, 0, 1.4, 4.4, 3, '#b9c2c9'); for (let i = 1; i < 3; i++) g.line([9, 0.8 + i * 1.47, 0.1], [9, 0.8 + i * 1.47, 2.9], { sw: 0.5, depth: 12 });
    g.box(2, 6.4, 0, 1, 0.7, 1.4, g.a); g.box(5, 7.4, 0, 1, 0.7, 1.4, '#e07a5f'); g.person(7.4, 7); },
  ST5: g => { backWalls(g, 3.4); g.bed(1, 1, 2.2, 3.4); g.desk(5.4, 1, 2.4, 1, false); g.shelf(8.2, 0.8, 1.2, 0.6, 3, WHITE, 3, ['#d1495b', GOLD]);
    g.line([4, 6.4, 0], [4.5, 6, 3.6]); g.line([5, 6.4, 0], [4.5, 6, 3.6]); g.poly([[3.6, 6.4, 1.2], [5.4, 6.4, 1.2], [5.4, 6.4, 3.2], [3.6, 6.4, 3.2]], tint(g.a, 0.3), { depth: 11 }); g.person(7, 6.4); },

  // ---------- Live ----------
  LV1: g => apartment(g, 'OWN'),
  LV2: g => { g.railing(0.4, 9.6, 9.6, 9.6); g.railing(9.6, 0.4, 9.6, 9.6); g.wall(0.5, 0.6, 9.4, 0.6, 0, 5, GLASS, { depth: -50, op: 0.6 });
    g.sofa(1.4, 2, 4, tint(g.a, 0.15)); g.box(1.4, 3.2, 0, 1, 2, 0.7, tint(g.a, 0.15)); g.box(6.6, 1.4, 0, 2.4, 2, 1.6, DARK); g.box(6.6, 1.4, 1.6, 2.4, 0.4, 0.8, DARK, { depth: 7.4 });
    g.line([4, 5, 5.2], [4, 5, 4.2], { sw: 0.5 }); const [cx, cy] = P(4, 5, 4.2); g.add(40, `<path d="M${cx - 3},${cy} q3,3 6,0" stroke="${GOLD}" stroke-width="1.4" fill="none"/><circle cx="${cx - 3}" cy="${cy}" r="0.7" fill="${GOLD}"/><circle cx="${cx + 3}" cy="${cy}" r="0.7" fill="${GOLD}"/><circle cx="${cx}" cy="${cy + 2.2}" r="0.7" fill="${GOLD}"/>`);
    g.tree(8, 7.6, 0, { s: 0.9 }); g.person(4.6, 7.4); },
  LV3: g => { apartment(g); g.roundTable(3.4, 3.4, 0.6); const [bx, by] = P(3.4, 3.4, 1.5); g.add(8, `<path d="M${bx - 2},${by} A2,2 0 0 1 ${bx + 2},${by} Z" fill="${GOLD}" stroke="${INK}" stroke-width="0.5"/>`); symBadge(g, 'star', GOLD); },
  LV4: g => apartment(g, 'RENT'),
  LV5: g => apartment(g, '−20%'),
  LV6: g => { apartment(g); symBadge(g, 'househeart', g.a); },
  LV7: g => { backWalls(g, 3.4); g.bed(1, 1, 2, 3.4); g.desk(4.6, 1, 2.6, 1.1); g.shelf(7.8, 0.8, 1.4, 0.7, 3.2, WHITE, 3, ['#d1495b', GOLD, '#5aa9e6']); g.sitter(5.8, 2.8, 0.8); g.box(2, 6.4, 0, 1, 0.7, 1.3, g.a); },
  LV8: g => { for (const [x, y] of [[0.8, 0.8], [3.8, 0.8], [6.8, 0.8]]) { g.box(x, y, 0, 2.6, 2.2, 3, WHITE); onWallY(g, y + 2.2, x + 0.8, x + 1.8, 0, 2.2, tint(g.a, 0.4), { depth: x + y + 3.5 }); }
    g.box(0.8, 3.8, 0, 2.2, 2.6, 3, WHITE); onWallX(g, 3, 4.6, 5.6, 0, 2.2, tint(g.a, 0.4), { depth: 9 });
    g.table(4.6, 5.4, 3.6, 1.8, 0, WOOD); g.sitter(5.4, 7.8, 0.8); g.sitter(7.2, 7.8, 0.8, { fill: '#959ea6' }); g.person(3.8, 8.4); },
  LV9: g => { backWalls(g, 3, WHITE, { left: false }); g.bed(1, 1, 2.4, 3.2); g.bed(4.4, 1, 1.6, 2.4, WHITE, '#f2a541');
    floorRect(g, 5.6, 5.6, 9.6, 9.6, tint(GREEN, 0.4), { depth: -39 }); g.railing(5.6, 9.6, 9.6, 9.6, 0, 1.1); g.railing(9.6, 5.6, 9.6, 9.6, 0, 1.1);
    g.box(2, 6, 0, 0.8, 0.8, 0.8, '#e85d75'); g.box(2.9, 6.2, 0, 0.8, 0.8, 0.5, '#5aa9e6'); g.person(7, 7.4); g.person(8.2, 6.8, 0, { s: 0.55 }); },
  LV10: g => { backWalls(g, 3.4); g.bed(1, 1, 2.2, 3.2); g.box(5.4, 5, 0, 4, 1.4, 1.6, WOOD); g.box(5.4, 5, 1.6, 4, 1.4, 0.15, '#e7eaec');
    for (let i = 0; i < 4; i++) g.poly([[5.4 + i, 6.4, 3.4], [6.4 + i, 6.4, 3.4], [6.4 + i, 7.8, 2.8], [5.4 + i, 7.8, 2.8]], i % 2 ? WHITE : g.a, { depth: 16 + i * 0.01 });
    g.person(4.4, 7.6, 0, { arm: 0.5 }); },
  LV11: g => { backWalls(g, 3.4); g.bed(1, 1, 2.4, 3.4); g.sofa(5.6, 2, 1.6, tint(g.a, 0.3)); g.sitter(6.3, 2.6, 0.7, { fill: '#9aa3ab' }); g.person(5.6, 6, 0, { fill: '#5f6a73' }); symBadge(g, 'heart', g.a); },

  // ---------- Reflect & Remember ----------
  RR1: g => { g.wall(0.6, 0.6, 9.4, 0.6, 0, 5.4, WHITE, { depth: -50 }); onWallY(g, 0.6, 4, 6, 1.2, 4.6, tint(g.a, 0.45), { depth: -49 }); const [lx, ly] = P(5, 0.6, 3.6); g.add(-48, `<circle cx="${lx}" cy="${ly}" r="5" fill="${GOLD}" fill-opacity="0.35"/>`);
    g.box(4, 1.2, 0, 2, 1, 1.2, WOOD); for (let r = 0; r < 3; r++) for (const x of [1.4, 6.2]) g.box(x, 3.4 + r * 2, 0, 2.6, 0.8, 0.8, WOOD); g.sitter(2.4, 6.2, 0.8); },
  RR2: g => { for (const [x, y, c] of [[3, 3.4, g.a], [5.6, 2.6, tint(g.a, 0.4)], [6.4, 5.6, '#9c89b8']]) g.cyl(x, y, 0, 1, 0.4, c);
    g.sitter(3, 3.4, 0.4); g.plant(8, 1.6); g.line([1.6, 7.6, 0], [1.6, 7.6, 3.2]); g.disc(1.6, 7.6, 3.2, 0.8, GOLD, { depth: 9.5 }); },
  RR3: g => { const box = [[1.6, 1.6], [8.4, 1.6], [8.4, 8.4], [1.6, 8.4]];
    for (let i = 0; i < 4; i++) { const a = box[i], b = box[(i + 1) % 4]; g.line([...a, 0], [...b, 0], { dash: '2.4 1.6', sw: 0.9, depth: 50 }); g.line([...a, 4.6], [...b, 4.6], { dash: '2.4 1.6', sw: 0.9, depth: 50 }); g.line([...a, 0], [...a, 4.6], { dash: '2.4 1.6', sw: 0.9, depth: 50 }); } },
  RR4: g => { g.wall(0.6, 0.6, 9.4, 0.6, 0, 5.4, '#e7e8ea', { depth: -50 }); for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) onWallY(g, 0.6, 1.2 + c * 1.35, 2.3 + c * 1.35, 0.6 + r * 1.2, 1.5 + r * 1.2, '#cfd3d7', { depth: -49, sw: 0.4 });
    g.line([5.2, 3, 0], [5.2, 3, 1.6], { stroke: GREEN, sw: 1 }); const [fx, fy] = P(5.2, 3, 1.6); g.add(9, `<circle cx="${fx}" cy="${fy}" r="1.6" fill="${RED}"/>`);
    g.cyl(3.2, 3.4, 0, 0.35, 1, WHITE); const [cx, cy] = P(3.2, 3.4, 1); g.add(7, `<ellipse cx="${cx}" cy="${cy - 1.6}" rx="0.8" ry="1.4" fill="${GOLD}"/>`); g.person(6.4, 6.6, 0, { fill: '#959ea6' }); },
  RR5: g => { g.slab({ fill: tint(WOOD, 0.5) }); for (let i = 1; i < 6; i++) g.line([i * 1.6, 0.2, 0.01], [i * 1.6, 9.8, 0.01], { stroke: shade(WOOD, 0.2), sw: 0.4, depth: -39 });
    const [sx, sy] = P(2, 0, 2); g.add(-60, `<circle cx="${sx + 22}" cy="${sy - 14}" r="7" fill="${GOLD}" fill-opacity="0.85"/>`);
    g.cyl(4.6, 5, 0, 1, 0.4, g.a); g.sitter(4.6, 5, 0.4); g.tree(7.6, 2.4, 0, { s: 0.9 }); },

  // ---------- Serve the building ----------
  SB1: g => { g.box(2.4, 2, 0, 2.4, 2.4, 6.6, '#d9dde0'); g.box(5, 2, 0, 2.4, 2.4, 6.6, '#d9dde0');
    for (const x of [2.4, 5]) { onWallY(g, 4.4, x + 0.5, x + 1.9, 0, 2.6, '#aab4bc', { depth: x + 4.9 }); g.line([x + 1.2, 4.4, 0], [x + 1.2, 4.4, 2.6], { sw: 0.4, depth: x + 5 }); }
    g.box(2.4, 4.4, 0, 1.6, 2.8, 0.01, 'none'); g.stairs(7.6, 5, 1.6, 4, 0.6, 0.6, WHITE); g.person(4, 7.4); },
  SB2: g => { g.box(0.8, 0.8, 0, 4.4, 2, 2.6, '#c7cdd1'); g.box(0.8, 3.4, 0, 2, 4, 2.2, '#c7cdd1');
    for (const [x, y] of [[6.6, 2], [6.6, 5.6]]) { g.cyl(x, y, 0, 1.4, 1.2, '#9aa7b1'); for (let a = 0; a < 3; a++) { const [cx, cy] = P(x, y, 1.2); const ang = a * 2.094; g.add(x + y + 0.5, `<line x1="${cx}" y1="${cy}" x2="${r1(cx + 6 * Math.cos(ang))}" y2="${r1(cy + 3.4 * Math.sin(ang))}" stroke="${INK}" stroke-width="1.1"/>`); } }
    g.box(1.4, 1.2, 2.6, 7, 0.9, 0.9, tint(g.a, 0.3), { depth: 6 }); },
  SB3: g => { floorRect(g, 0.8, 0.8, 9.2, 9.2, '#eef0ee', { depth: -39, dash: '2 1.4' }); g.person(3, 4); g.person(4.6, 5.6, 0, { fill: '#959ea6' }); g.person(6.6, 4.4); g.person(5.6, 7.6, 0, { s: 0.6 }); g.person(2.6, 7, 0, { fill: '#959ea6' });
    symBadge(g, 'shield', '#3f8a5c'); },
  SB4: g => { for (const [x, y] of [[0.8, 0.8], [9.2, 0.8], [0.8, 9.2], [9.2, 9.2]]) g.box(x - 0.3, y - 0.3, 0, 0.6, 0.6, 5.4, '#9aa7b1', { depth: x + y - 0.5 });
    const k = { sw: 2.4, stroke: shade(g.a, 0.45) }; g.line([0.8, 0.8, 0], [9.2, 0.8, 5.4], { ...k, depth: 0 }); g.line([0.8, 0.8, 5.4], [9.2, 0.8, 0], { ...k, depth: 0 }); g.line([0.8, 0.8, 0], [0.8, 9.2, 5.4], { ...k, depth: 0 }); g.line([0.8, 0.8, 5.4], [0.8, 9.2, 0], { ...k, depth: 0 });
    g.box(0.5, 0.5, 5.4, 9, 0.6, 0.6, '#9aa7b1', { depth: 1 }); g.box(0.5, 0.5, 5.4, 0.6, 9, 0.6, '#9aa7b1', { depth: 1 }); g.box(9, 0.5, 5.4, 0.6, 9, 0.6, '#9aa7b1', { depth: 14 }); g.box(0.5, 9, 5.4, 9, 0.6, 0.6, '#9aa7b1', { depth: 14 }); g.person(5, 6); },
  SB5: g => { g.box(0.6, 3.6, 2.4, 8.8, 1.6, 2, '#b9c2c9'); for (const x of [1.4, 4.6, 7.8]) g.box(x, 4, 4.4, 0.7, 0.7, 2.6, WHITE, { depth: x + 4.5 }); for (const x of [3, 6.4]) g.box(x, 4, 0, 0.7, 0.7, 2.4, WHITE, { depth: x + 4 });
    for (const x of [1.4, 4.6, 7.8]) { const [ax, ay] = P(x + 0.35, 4.35, 4.4); g.add(30, `<path d="M${ax},${ay + 1} l-1.6,-2.6 h3.2 z" fill="${RED}"/>`); } },
  SB6: g => { g.box(1.4, 1.4, 0, 0.6, 0.6, 6.4, '#9aa7b1'); g.box(8, 1.4, 0, 0.6, 0.6, 6.4, '#9aa7b1'); g.box(1.4, 1.4, 6.4, 7.2, 0.6, 0.5, '#9aa7b1', { depth: 3 });
    g.line([3.4, 1.7, 6.4], [3.8, 4.4, 3.4], { sw: 0.6 }); g.line([6.6, 1.7, 6.4], [6.2, 4.4, 3.4], { sw: 0.6 }); g.box(3.4, 3.8, 1.4, 3.2, 2.4, 2, DARK, { depth: 8 }); g.person(8, 8); },
  SB7: g => { g.box(1, 1, 0, 4.4, 4, 3.6, WATER); g.line([5.4, 2.4, 2.8], [8.6, 2.4, 2.8], { sw: 1.6, depth: 9 }); g.line([8.6, 2.4, 2.8], [8.6, 2.4, 0], { sw: 1.6, depth: 11 }); g.line([3, 5, 0.6], [3, 8.6, 0.6], { sw: 1.6, depth: 9 });
    const [gx, gy] = P(7, 2.4, 2.8); g.add(10, `<circle cx="${gx}" cy="${gy - 3}" r="2.4" fill="#ffffff" stroke="${INK}" stroke-width="0.6"/><line x1="${gx}" y1="${gy - 3}" x2="${gx + 1.4}" y2="${gy - 4.4}" stroke="${RED}" stroke-width="0.6"/>`); },
  SB8: g => { g.box(1, 1, 0, 1.6, 1.6, 4.4, '#c7cdd1'); g.box(1.4, 1.4, 4.4, 8.4, 0.8, 0.6, GOLD, { depth: 8 }); g.line([9.4, 1.8, 4.4], [9.4, 1.8, 1.6], { sw: 0.5, depth: 11 }); g.line([9.4, 3.4, 4.4], [9.4, 3.4, 1.6], { sw: 0.5, depth: 13 });
    g.box(9, 1.6, 1, 0.8, 2, 0.8, g.a, { depth: 12 }); g.box(4.6, 4.6, 0, 3, 3, 1.6, '#c7cdd1'); },
  SB9: g => { g.sofa(1, 1.4, 3.4, tint('#3d5a80', 0.4)); g.box(5.6, 1.2, 0, 3.2, 1.8, 1.5, WOOD, { top: '#3f8a5c' }); g.desk(1.4, 5.6, 2.4, 1.1); g.sitter(2.6, 7.4, 0.8); g.plant(8.4, 6.4); g.person(7, 4.6, 0, { fill: '#959ea6' }); },
  SB10: g => { for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) { g.box(1 + c * 2, 1, r * 2.2, 1.9, 1.6, 2.1, '#e7eaec', { depth: 1 + c * 2 + 1.8 + r * 0.01 }); for (let i = 1; i < 4; i++) g.line([1 + c * 2 + i * 0.47, 2.6, r * 2.2 + 0.2], [1 + c * 2 + i * 0.47, 2.6, r * 2.2 + 1.9], { sw: 0.3, depth: 1 + c * 2 + 3 }); }
    g.box(1, 4.4, 0, 2.6, 2.4, 0.4, WOOD); g.box(1.3, 4.6, 0.4, 1.8, 1.6, 1.2, tint(WOOD, 0.3)); g.person(6, 6.6); },
  SB11: g => { g.wall(0.6, 0.6, 9.4, 0.6, 0, 4.4, WHITE, { depth: -50 }); onWallY(g, 0.6, 6.4, 8.6, 1.4, 3.6, DARK, { depth: -49 });
    [['#2f6fb3', 1.4], ['#3fae6a', 3.2], ['#6b7680', 5]].forEach(([c, x]) => { g.box(x, 1.4, 0, 1.5, 1.5, 1.8, c); g.box(x - 0.05, 1.35, 1.8, 1.6, 1.6, 0.2, shade(c, 0.2)); }); g.person(5.6, 6.4); },
  SB12: g => { g.line([4.6, 4.6, 0], [4.6, 4.6, 7.6], { sw: 1.4 }); for (const z of [3, 5, 6.6]) g.line([4.2, 4.6, z], [5, 4.6, z], { sw: 0.8 });
    for (const [z, dx] of [[5.6, -1], [4, 1]]) { const [cx, cy] = P(4.6 + dx * 0.6, 4.6, z); g.add(10, `<ellipse cx="${r1(cx + dx * 4)}" cy="${cy}" rx="1.6" ry="3" fill="#ffffff" stroke="${INK}" stroke-width="0.6"/>`); }
    g.box(6.4, 1.4, 0.4, 2.8, 0.4, 2, g.a); g.line([7, 1.6, 0], [7, 1.6, 0.4]); g.line([8.6, 1.6, 0], [8.6, 1.6, 0.4]); },
};

export function drawIcon(id, accent, size = 100) {
  const seed = [...id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 97;
  const g = new Iso(accent, seed);
  if (!['LE5', 'RR5'].includes(id)) g.slab();
  SPECS[id](g);
  return g.render(size);
}
