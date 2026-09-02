# Geofabrik / offline OSM prototype

Goal: move hydrography, bridges and scenery off the live Overpass critical path by preprocessing regional OpenStreetMap extracts into small World Drive tiles.

## Source

Primary source: Geofabrik `.osm.pbf` regional extracts. For Quebec, the current file is `quebec-latest.osm.pbf`. The PBF keeps the original OSM tagging model, unlike the free shapefile catalogue which intentionally omits some OSM feature classes.

Generated data must keep OpenStreetMap / ODbL attribution. The tile builder writes attribution into `manifest.json`.

## Why PBF + preprocessing

The game should not parse a 1+ GB PBF at route startup. The offline build pipeline does the heavy work once:

```text
Geofabrik PBF
  -> osmium tags-filter
  -> osmium export geojsonseq
  -> World Drive 16 km tiles
  -> public/world-data/osm/<region>/
```

Runtime will eventually fetch only the few tiles around the current route/vehicle. Overpass remains available as a fallback during migration.

## Requirements

- Node.js (already required by World Drive)
- `osmium-tool` available as `osmium` in the shell

Verify:

```powershell
osmium --version
```

If using WSL, run the whole preprocessing command from WSL against the mounted World Drive checkout.

## Quebec quick start

Download + verify the Geofabrik PBF:

```powershell
powershell -ExecutionPolicy Bypass -File tools/geofabrik/download-quebec.ps1
```

Build local World Drive tiles:

```powershell
node tools/geofabrik/build-world-tiles.mjs `
  --pbf world-data/source/quebec-latest.osm.pbf `
  --region quebec `
  --out public/world-data/osm/quebec `
  --overwrite
```

Default tile size is 16 km. Override with `--tile-km 8`, `--tile-km 24`, etc.

The source PBF and generated runtime tiles are intentionally ignored by Git. They are local/generated data, not repository source.

## Output format v1

```text
public/world-data/osm/quebec/
  manifest.json
  tiles-index.jsonl
  oversize.jsonl          # only when a feature spans too many tiles
  tiles/
    <x>/
      <y>.jsonl
```

Each tile record is compact JSON:

```json
{
  "v": 1,
  "id": "way/123",
  "k": ["waterway", "bridge"],
  "g": {"type":"LineString","coordinates":[...]},
  "t": {"waterway":"river","bridge":"yes","name":"..."}
}
```

`k` can contain:

- `water`
- `waterway`
- `bridge`
- `building`
- `landuse`
- `power`
- `dam`
- `barrier`
- `sign`

Geometry stays WGS84 lon/lat so the game can reuse its current geographic conversion. Tile indexing uses EPSG:3857 meters only to obtain stable fixed-size cells.

## Oversize features

A very large polygon can cross hundreds of tiles. To avoid pathological duplication, a feature exceeding `--max-tiles-per-feature` (default 256) goes to `oversize.jsonl`. Runtime support for oversize records is intentionally deferred until the normal tile path is validated.

## Prototype boundary

This first lot does **not** replace `water-data.js`, `scenery-data.js`, signs or Overpass in production. It provides:

1. deterministic preprocessing;
2. a compact tile format;
3. an offline tile reader module;
4. QA proving tile creation/loading.

Only after a real Quebec extract is built and measured should we wire hydro/scenery to this source.
