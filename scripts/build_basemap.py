"""Build the downtown Vancouver base map used by the Map tab.

Reads the unified context model of a local copy of the Vancouver view-study context
(generated_assets/context/unified_*.bin + unified_manifest.json) and writes a small
plan-view subset of downtown to basemap/:

    basemap/vancouver_downtown.bin    little-endian typed arrays (layout in the .json)
    basemap/vancouver_downtown.json   extent, layers, byte offsets, attribution, caveats

Usage: python3 scripts/build_basemap.py "<path to generated_assets/context>"

Only geometry is copied: building footprints (roof outlines), heights and their height
source, ground level, water, parks, roads, shoreline, terrain and place labels.
Building footprints, water, parks, roads and coastline come from OpenStreetMap
(c) OpenStreetMap contributors, ODbL. Terrain comes from NASA SRTM.
"""
import array
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "basemap"
NAME = "vancouver_downtown"
# Downtown peninsula, False Creek and the edge of Stanley Park, in model metres (x east, y north).
EXTENT = (-2600.0, -1700.0, 1800.0, 1600.0)
Q = 0.25                                   # plan quantum, metres per int16 step
CX, CY = (EXTENT[0] + EXTENT[2]) / 2, (EXTENT[1] + EXTENT[3]) / 2
# Model (0, 0) and the plan mapping of the source model (equirectangular; checked against OSM to about 0.1 m).
ANCHOR = {"latitude": 49.2827, "longitude": -123.1207, "m_per_deg_lat": 110574.0,
          "m_per_deg_lon": 111320.0 * math.cos(math.radians(49.2827)), "north": "+y"}


def inside(x, y):
    return EXTENT[0] <= x <= EXTENT[2] and EXTENT[1] <= y <= EXTENT[3]


def qx(x):
    return int(round((x - CX) / Q))


def qy(y):
    return int(round((y - CY) / Q))


def read_mesh(src, spec):
    b = (src / spec["file"]).read_bytes()
    pos = array.array("f")
    pos.frombytes(b[spec["positions"]["byte_offset"]:spec["positions"]["byte_offset"] + spec["positions"]["count"] * 12])
    idx = None
    if "indices" in spec:
        idx = array.array("I")
        o = spec["indices"]["byte_offset"]
        idx.frombytes(b[o:o + spec["indices"]["count"] * 4])
    return pos, idx


def triangles_2d(src, spec):
    """Triangles whose centroid is inside the extent, as int16 x, y triples."""
    pos, idx = read_mesh(src, spec)
    out = array.array("h")
    n = len(idx) if idx is not None else len(pos) // 3
    for t in range(0, n, 3):
        vs = [idx[t + k] if idx is not None else t + k for k in range(3)]
        xs = [pos[3 * v] for v in vs]
        ys = [pos[3 * v + 1] for v in vs]
        if inside(sum(xs) / 3, sum(ys) / 3):
            for x, y in zip(xs, ys):
                out.extend((qx(x), qy(y)))
    return out


def terrain_3d(src, spec):
    """Terrain triangles inside the extent: int16 x, y and int16 z in decimetres."""
    pos, idx = read_mesh(src, spec)
    out = array.array("h")
    for t in range(0, len(idx), 3):
        vs = [idx[t + k] for k in range(3)]
        xs = [pos[3 * v] for v in vs]
        ys = [pos[3 * v + 1] for v in vs]
        if inside(sum(xs) / 3, sum(ys) / 3):
            for v in vs:
                out.extend((qx(pos[3 * v]), qy(pos[3 * v + 1]), int(round(pos[3 * v + 2] * 10))))
    return out


def segments_2d(src, spec):
    pos, _ = read_mesh(src, spec)
    out = array.array("h")
    for s in range(0, len(pos) // 3, 2):
        x0, y0, x1, y1 = pos[3 * s], pos[3 * s + 1], pos[3 * s + 3], pos[3 * s + 4]
        if inside((x0 + x1) / 2, (y0 + y1) / 2):
            out.extend((qx(x0), qy(y0), qx(x1), qy(y1)))
    return out


def roof_rings(pos, idx, off, cnt):
    """Outline rings of a building from its upward-facing faces (boundary edges of the roof)."""
    edges = {}
    key = lambda v: (round(pos[3 * v], 2), round(pos[3 * v + 1], 2))
    for t in range(off, off + cnt, 3):
        a, b, c = idx[t], idx[t + 1], idx[t + 2]
        P = [(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]) for v in (a, b, c)]
        ux, uy, uz = (P[1][k] - P[0][k] for k in range(3))
        vx, vy, vz = (P[2][k] - P[0][k] for k in range(3))
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        nl = math.sqrt(nx * nx + ny * ny + nz * nz)
        if nl == 0 or nz / nl < 0.9:
            continue
        ks = [key(a), key(b), key(c)]
        for i in range(3):
            e = (ks[i], ks[(i + 1) % 3])
            if e[0] == e[1]:
                continue
            if (e[1], e[0]) in edges:
                edges[(e[1], e[0])] -= 1
                if not edges[(e[1], e[0])]:
                    del edges[(e[1], e[0])]
            else:
                edges[e] = edges.get(e, 0) + 1
    nxt = {}
    for (p, q) in edges:
        nxt.setdefault(p, []).append(q)
    rings = []
    while nxt:
        start = next(iter(nxt))
        ring, p = [start], start
        for _ in range(100000):
            qs = nxt.get(p)
            if not qs:
                break
            q = qs.pop()
            if not qs:
                del nxt[p]
            if q == start:
                break
            ring.append(q)
            p = q
        ring = simplify(ring)
        if len(ring) >= 3:
            rings.append(ring)
    return rings


def simplify(ring):
    """Drop points that sit on a straight line between their neighbours (within 5 cm)."""
    out = []
    n = len(ring)
    for i in range(n):
        a, b, c = ring[i - 1], ring[i], ring[(i + 1) % n]
        cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        base = math.hypot(c[0] - a[0], c[1] - a[1]) or 1
        if abs(cross) / base > 0.05:
            out.append(b)
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = pathlib.Path(sys.argv[1]).expanduser()
    man = json.loads((src / "unified_manifest.json").read_text())
    files = man["files"]
    bidx = json.loads((src / man["buildings_index"]).read_text())
    cols = bidx["columns"]
    pos, idx = read_mesh(src, files["buildings"])

    height, ground, source, osm, ring0, pt0, pts = (array.array(t) for t in ("H", "h", "B", "I", "I", "I", "h"))
    ring0.append(0)
    pt0.append(0)
    kept = 0
    for i in range(bidx["count"]):
        bb = cols["bbox"][i]
        if not inside((bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2):
            continue
        rings = roof_rings(pos, idx, cols["index_offset"][i], cols["index_count"][i])
        if not rings:
            continue
        for r in rings:
            for (x, y) in r:
                pts.extend((qx(x), qy(y)))
            pt0.append(len(pts) // 2)
        ring0.append(len(pt0) - 1)
        height.append(min(65535, int(round(cols["height_m"][i] * 10))))
        ground.append(int(round(bb[2] * 10)))
        source.append(int(cols["height_source"][i]))
        osm.append(int(str(cols["osm_id"][i])[1:]))
        kept += 1

    layers = {
        "b_height_dm": height, "b_ground_dm": ground, "b_height_source": source, "b_osm_way": osm,
        "b_ring_start": ring0, "r_point_start": pt0, "points": pts,
        "terrain": terrain_3d(src, files["terrain"]),
        "water": triangles_2d(src, files["water"]),
        "parks": triangles_2d(src, files["parks"]),
        "roads": segments_2d(src, files["roads"]),
        "shoreline": segments_2d(src, files["shoreline"]),
    }
    blob = bytearray()
    spec = {}
    for name, arr in layers.items():
        while len(blob) % 4:
            blob.append(0)
        spec[name] = {"dtype": {"H": "uint16", "h": "int16", "B": "uint8", "I": "uint32"}[arr.typecode],
                      "byte_offset": len(blob), "count": len(arr)}
        if sys.byteorder != "little":
            arr.byteswap()
        blob += arr.tobytes()
    OUT.mkdir(exist_ok=True)
    (OUT / f"{NAME}.bin").write_bytes(bytes(blob))

    labels = [l for l in json.loads((src / "labels.json").read_text()) if inside(l["x"], l["y"])]
    manifest = {
        "name": "Downtown Vancouver base map",
        "file": f"{NAME}.bin", "byte_length": len(blob),
        "generator": "scripts/build_basemap.py",
        "source_model": {"generated_at": man.get("generated_at"), "generator": man.get("generator"),
                         "note": "Unified Vancouver context model of a local view-study project (OpenStreetMap-derived buildings, SRTM terrain)."},
        "units": "metres; x east, y north; model (0, 0) at the anchor below",
        "anchor": ANCHOR,
        "extent_m": list(EXTENT), "centre_m": [CX, CY], "quantum_m": Q,
        "coding": {
            "plan": "int16 x, y: model = centre + value * quantum",
            "terrain": "int16 x, y, z per vertex, three vertices per triangle; z in decimetres (EGM96 heights)",
            "water, parks": "int16 x, y per vertex, three vertices per triangle",
            "roads, shoreline": "int16 x0, y0, x1, y1 per segment",
            "buildings": "building i has rings b_ring_start[i] .. b_ring_start[i+1]; ring j has points r_point_start[j] .. r_point_start[j+1]; heights and ground in decimetres",
        },
        "height_source_codes": {"0": "measured (OSM height tag)", "1": "from floor count", "2": "estimated by building type", "3": "unknown"},
        "layers": spec,
        "counts": {"buildings": kept, "rings": len(pt0) - 1, "points": len(pts) // 2,
                   "terrain_triangles": len(layers["terrain"]) // 9, "water_triangles": len(layers["water"]) // 6,
                   "park_triangles": len(layers["parks"]) // 6, "road_segments": len(layers["roads"]) // 4,
                   "shoreline_segments": len(layers["shoreline"]) // 4},
        "labels": [{"text": l["text"], "x": round(l["x"], 1), "y": round(l["y"], 1)} for l in labels],
        "attribution": [
            {"text": "© OpenStreetMap contributors", "licence": "ODbL", "url": "https://www.openstreetmap.org/copyright",
             "covers": "building footprints and heights, water, parks, roads, coastline, place names"},
            {"text": "Terrain: NASA SRTM 1 arc-second (via Open Topo Data)", "licence": "public domain", "url": "https://www.earthdata.nasa.gov/data/instruments/srtm",
             "covers": "ground levels and terrain"},
        ],
        "caveats": [
            "Visual context only: not a survey, parcel map or zoning record.",
            "Building heights are partly estimated: each building says whether its height was measured, taken from its floor count, or estimated from its type.",
            "Ground levels use SRTM (EGM96, sampled about every 60 m); the vertical datum of the source model is unverified.",
            "Footprints are roof outlines of simple extrusions; podiums and setbacks may be simplified.",
        ],
    }
    (OUT / f"{NAME}.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
    print(f"{kept} buildings, {len(blob) / 1e6:.2f} MB -> {OUT / (NAME + '.bin')}")
    print(json.dumps(manifest["counts"]))


if __name__ == "__main__":
    main()
