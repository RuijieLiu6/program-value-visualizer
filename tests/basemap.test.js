// G4 base map: file size, attribution, parsing and the neighbour-roof estimate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBasemap, neighbourRoofs, insideBuilding, groundAt, toLatLon } from '../core/basemap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'basemap/vancouver_downtown.json'), 'utf8'));
const bin = fs.readFileSync(path.join(ROOT, 'basemap', manifest.file));
const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
const map = parseBasemap(manifest, buffer);

test('base map stays small (well under 15 MB) and matches its manifest', () => {
  const total = fs.readdirSync(path.join(ROOT, 'basemap')).reduce((s, f) => s + fs.statSync(path.join(ROOT, 'basemap', f)).size, 0);
  assert.ok(total < 15e6, `${total} bytes`);
  assert.equal(bin.byteLength, manifest.byte_length);
  assert.equal(map.buildings.length, manifest.counts.buildings);
});

test('base map carries the OpenStreetMap and NASA SRTM credits', () => {
  const texts = manifest.attribution.map(a => a.text).join(' | ');
  assert.match(texts, /© OpenStreetMap contributors/);
  assert.match(texts, /NASA SRTM/);
  const page = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');
  assert.match(page, /man\.attribution\.flatMap/);   // the Map tab prints the manifest credits under the map
  assert.match(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /data-tab="map"/);
});

test('every building has a closed footprint, a height and a known height source', () => {
  for (const b of map.buildings) {
    assert.ok(b.rings.length >= 1 && b.rings[0].length >= 3);
    assert.ok(b.height > 0 && b.height < 400, `building ${b.i} height ${b.height}`);
    assert.ok([0, 1, 2, 3].includes(b.source));
    assert.ok(b.area > 0);
  }
  const [x0, y0, x1, y1] = manifest.extent_m;
  assert.ok(map.buildings.every(b => b.cx > x0 - 300 && b.cx < x1 + 300 && b.cy > y0 - 300 && b.cy < y1 + 300));
});

test('a building contains its own centroid for a simple footprint and not a far point', () => {
  const b = map.buildings.find(x => x.rings[0].length === 4);
  assert.ok(insideBuilding(b, b.cx, b.cy));
  assert.ok(!insideBuilding(b, b.cx + 5000, b.cy));
});

test('ground comes from the terrain and is null outside it', () => {
  const g = groundAt(map, 0, 0);
  assert.ok(g != null && g >= 0 && g < 120, String(g));
  assert.equal(groundAt(map, 99999, 99999), null);
});

test('neighbour roofs: statistics, exclusion of the building on the site, and radius', () => {
  const b = [...map.buildings].sort((p, q) => q.height - p.height)[10];
  const r = neighbourRoofs(map, b.cx, b.cy, 150);
  assert.ok(r.onSite.includes(b.i) && !r.neighbours.includes(b.i));
  assert.ok(r.count > 0);
  assert.ok(r.height.median <= r.height.p90 && r.height.p90 <= r.height.max);
  assert.equal(r.grade, 'C');
  assert.equal(Object.values(r.bySource).reduce((s, n) => s + n, 0), r.count);
  for (const i of r.neighbours) assert.ok(Math.hypot(map.buildings[i].cx - b.cx, map.buildings[i].cy - b.cy) <= 150);
  const wide = neighbourRoofs(map, b.cx, b.cy, 400);
  assert.ok(wide.count >= r.count && wide.height.max >= r.height.max);
  const water = neighbourRoofs(map, 9000, 9000, 100);
  assert.equal(water.count, 0);
  assert.equal(water.height.max, null);
});

test('neighbour roofs on a hand-made map', () => {
  const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
  const mk = (i, x, y, h, ground = 0) => { const rings = [sq(x, y, 10)]; return { i, rings, area: 100, cx: x + 5, cy: y + 5, bbox: [x, y, x + 10, y + 10], height: h, ground, source: 0, osmWay: i }; };
  const fake = { layers: { terrain: new Int16Array([-100, -100, 0, 100, -100, 0, 0, 100, 0]) }, X: v => v, Y: v => v,
    buildings: [mk(0, -5, -5, 90), mk(1, 20, 0, 30), mk(2, 0, 40, 60, 5), mk(3, 500, 0, 200)] };
  const r = neighbourRoofs(fake, 0, 0, 100);
  assert.deepEqual(r.onSite, [0]);
  assert.deepEqual(r.neighbours.sort(), [1, 2]);
  assert.equal(r.height.max, 60);
  assert.equal(r.aboveSiteGround.max, 65);   // 5 m higher ground
  assert.equal(r.height.median, 45);
});

test('lat/lon of model (0, 0) is the anchor; north is +y', () => {
  const a = toLatLon(manifest, 0, 0), b = toLatLon(manifest, 0, 1000);
  assert.equal(a.lat, manifest.anchor.latitude);
  assert.ok(b.lat > a.lat);
  assert.ok(Math.abs(b.lat - a.lat - 1000 / 110574) < 1e-9);
});
