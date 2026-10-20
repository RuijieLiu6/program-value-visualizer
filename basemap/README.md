# Downtown Vancouver base map

The Map tab draws downtown Vancouver in plan: building footprints coloured by height, water, parks, roads, the shoreline, terrain bands and place names. Click a point and the tool lists the buildings around it and estimates how high their roofs are. That estimate can feed the condo "above neighbouring roofs" bonus.

**Visual context only.** It is not a survey, a parcel map or a zoning record. No site is marked: the Vancouver Tall Challenge site is hypothetical.

## Files

| File | Contents |
| --- | --- |
| `vancouver_downtown.bin` | Little-endian typed arrays, about 1 MB |
| `vancouver_downtown.json` | Extent, coding, byte offsets, counts, labels, attribution, caveats |

`scripts/build_basemap.py` makes both files from a local copy of a Vancouver view-study context model (`generated_assets/context/unified_*.bin`):

```
python3 scripts/build_basemap.py "<path to generated_assets/context>"
```

What it keeps:
- the downtown peninsula, False Creek and the edge of Stanley Park: model x −2,600 to 1,800 m, y −1,700 to 1,600 m;
- 5,247 buildings, each as a roof outline with:
  - its height,
  - where the height comes from (measured, floor count or estimated by type),
  - its ground level,
  - its OpenStreetMap way id;
- terrain, water, parks, roads, shoreline and place names.

Plan coordinates are int16 steps of 0.25 m from the extent centre. Model (0, 0) is at 49.2827° N, 123.1207° W, with +y north. The source model's equirectangular mapping is stored in the manifest, so the tool can show a point's latitude and longitude.

## Neighbouring roofs

`core/basemap.js` `neighbourRoofs(map, x, y, radius)`:
- Neighbours are buildings whose footprint centroid is within the radius (150 m by default; 50–600 m).
- A building that contains the point is left out, because the scheme would replace it.
- It reports the tallest, 90th-percentile and median roof, measured two ways:
  - the building's own height;
  - its roof level above the ground at the point: neighbour ground + height − ground here, from SRTM.
- The second one is offered for the condo bonus, because floor elevations in the tool are measured from the scheme's own grade.
- Grade C.

## Attribution and licences

- Building footprints and heights, water, parks, roads, coastline and place names: **© OpenStreetMap contributors**, Open Database Licence (ODbL), https://www.openstreetmap.org/copyright.
- Terrain and ground levels: **NASA SRTM** 1 arc-second, via Open Topo Data; public domain.

The Map tab shows both credits under the map. The `.bin` file is a derived database of OpenStreetMap data, so it stays under ODbL when it is shared.

## Limits

- Heights are partly estimated:
  - of the 5,247 buildings, 24% are measured;
  - 45% come from floor counts;
  - 30% are estimated by building type.
- Ground levels use SRTM (EGM96 heights, sampled about every 60 m). The vertical datum of the source model is unverified.
- Footprints are roof outlines of simple extrusions, so podiums and setbacks may be simplified.
- No Rhino files, studio documents or view-cone data are included.
