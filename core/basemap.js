// Program Value Visualizer — downtown base map: parsing and neighbour-roof estimate.
// Pure functions, no page code: runs in the browser and in Node tests.
// The map is visual context, not survey data (see basemap/README.md).

const TYPES = { uint8: Uint8Array, uint16: Uint16Array, int16: Int16Array, uint32: Uint32Array };

/** Read the typed arrays of the .bin file described by its manifest. */
export function parseBasemap(manifest, buffer) {
  const L = {};
  for (const [name, s] of Object.entries(manifest.layers)) {
    const T = TYPES[s.dtype];
    if (!T) throw new Error(`basemap: unknown dtype ${s.dtype}`);
    if (s.byte_offset + s.count * T.BYTES_PER_ELEMENT > buffer.byteLength) throw new Error(`basemap: layer ${name} runs past the end of the file`);
    L[name] = new T(buffer, s.byte_offset, s.count);
  }
  const [cx, cy] = manifest.centre_m, q = manifest.quantum_m;
  const X = v => cx + v * q, Y = v => cy + v * q;
  const buildings = [];
  const n = L.b_height_dm.length;
  for (let i = 0; i < n; i++) {
    const rings = [];
    let sx = 0, sy = 0, sa = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let j = L.b_ring_start[i]; j < L.b_ring_start[i + 1]; j++) {
      const ring = [];
      for (let k = L.r_point_start[j]; k < L.r_point_start[j + 1]; k++) {
        const x = X(L.points[2 * k]), y = Y(L.points[2 * k + 1]);
        ring.push([x, y]);
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      // area-weighted centroid (shoelace)
      for (let k = 0; k < ring.length; k++) {
        const [x0, y0] = ring[k], [x1, y1] = ring[(k + 1) % ring.length], c = x0 * y1 - x1 * y0;
        sa += c; sx += (x0 + x1) * c; sy += (y0 + y1) * c;
      }
      rings.push(ring);
    }
    const area = Math.abs(sa) / 2;
    buildings.push({
      i, rings, area,
      cx: sa ? sx / (3 * sa) : (minX + maxX) / 2, cy: sa ? sy / (3 * sa) : (minY + maxY) / 2,
      bbox: [minX, minY, maxX, maxY],
      height: L.b_height_dm[i] / 10, ground: L.b_ground_dm[i] / 10, source: L.b_height_source[i], osmWay: L.b_osm_way[i],
    });
  }
  return { manifest, layers: L, buildings, X, Y };
}

/** Even-odd point in polygon over all rings of a building. */
export function insideBuilding(b, x, y) {
  if (x < b.bbox[0] || x > b.bbox[2] || y < b.bbox[1] || y > b.bbox[3]) return false;
  let inside = false;
  for (const ring of b.rings) {
    for (let k = 0, m = ring.length - 1; k < ring.length; m = k++) {
      const [xi, yi] = ring[k], [xj, yj] = ring[m];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Ground level (model z, metres) at a point, from the terrain triangles; null outside the terrain. */
export function groundAt(map, x, y) {
  const t = map.layers.terrain, { X, Y } = map;
  for (let k = 0; k + 8 < t.length; k += 9) {
    const x0 = X(t[k]), y0 = Y(t[k + 1]), x1 = X(t[k + 3]), y1 = Y(t[k + 4]), x2 = X(t[k + 6]), y2 = Y(t[k + 7]);
    const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (!d) continue;
    const a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d;
    const b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d;
    const c = 1 - a - b;
    if (a >= -1e-9 && b >= -1e-9 && c >= -1e-9) return (a * t[k + 2] + b * t[k + 5] + c * t[k + 8]) / 10;
  }
  return null;
}

const quantile = (sorted, p) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

/**
 * Neighbouring roofs around a site point.
 * Neighbours = buildings whose footprint centroid lies within `radius` metres of the point,
 * leaving out any building that contains the point (it would be replaced by the scheme).
 * Roof heights are given two ways: the building's own height above its ground, and its roof
 * level above the site's ground (they differ on a slope).
 */
export function neighbourRoofs(map, x, y, radius = 150) {
  const siteGround = groundAt(map, x, y);
  const onSite = [], near = [];
  for (const b of map.buildings) {
    if (Math.abs(b.cx - x) > radius + 200 || Math.abs(b.cy - y) > radius + 200) continue;
    if (insideBuilding(b, x, y)) { onSite.push(b); continue; }
    if (Math.hypot(b.cx - x, b.cy - y) <= radius) near.push(b);
  }
  const own = near.map(b => b.height).sort((a, b) => a - b);
  const rel = siteGround == null ? [] : near.map(b => b.ground + b.height - siteGround).sort((a, b) => a - b);
  const bySource = { measured: 0, levels: 0, estimated: 0, unknown: 0 };
  for (const b of near) bySource[['measured', 'levels', 'estimated', 'unknown'][b.source] ?? 'unknown']++;
  const tallest = near.length ? near.reduce((m, b) => (b.height > m.height ? b : m)) : null;
  return {
    x, y, radius, siteGround, count: near.length, onSite: onSite.map(b => b.i), neighbours: near.map(b => b.i),
    height: { max: own.at(-1) ?? null, p90: quantile(own, 0.9), median: quantile(own, 0.5) },
    aboveSiteGround: { max: rel.at(-1) ?? null, p90: quantile(rel, 0.9), median: quantile(rel, 0.5) },
    bySource, tallest: tallest && { i: tallest.i, height: tallest.height, osmWay: tallest.osmWay, source: tallest.source },
    grade: 'C',
    note: 'Indicative: OpenStreetMap footprints with partly estimated heights; ground from SRTM. Visual context, not survey data.',
  };
}

/** Model metres to latitude / longitude with the source model's plan mapping. */
export function toLatLon(manifest, x, y) {
  const a = manifest.anchor;
  return { lat: a.latitude + y / a.m_per_deg_lat, lon: a.longitude + x / a.m_per_deg_lon };
}
