#!/usr/bin/env python3
"""Build bounded, source-coordinate local refinement tiles OFFLINE.
No game imports, network, geometry repair, snapping or nearest-land fill.
Pinned build environment: numpy 2.2.6, rasterio 1.4.3, pyshp 2.3.1, shapely 2.1.2.
"""
import argparse
import gzip
import hashlib
import importlib.util
import json
import math
import tempfile
import time
from pathlib import Path

import numpy as np
import shapefile
import shapely
from shapely.geometry import shape, box
from shapely.strtree import STRtree

SCHEMA = 'world-drive-biome-refinement-v1'
SOURCE_SHA = 'be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60'
DIVISIONS = 16
SCALE = 10 * DIVISIONS
MAX_TILES = 128
MAX_CELL_EDGES = 512
MAX_TILE_POINTS = 32768
MAX_JSON_BYTES = 2 * 1024 * 1024
# cellSlots: >=0 is an exactly uniform record slot; -1 vector; -2 unresolved.
# Reasons: 1 invalid source part; 2 clipping/topology; 3 complexity; 4 degenerate contact.


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def catalog_digest(records):
    return hashlib.sha256(canonical(records)).hexdigest()


def tile_address(lon, lat):
    if (isinstance(lon, bool) or isinstance(lat, bool)
            or not isinstance(lon, (int, float)) or not isinstance(lat, (int, float))
            or not math.isfinite(lon) or not math.isfinite(lat)
            or not -180 <= lon <= 180 or not -90 <= lat <= 90):
        raise ValueError('Expected finite longitude/latitude in WGS84 bounds')
    gx = min(57600 - 1, math.floor(((lon if lon != 180 else -180) + 180) * SCALE))
    gy = min(28800 - 1, math.floor((90 - lat) * SCALE))
    return gx // DIVISIONS, gy // DIVISIONS


def select_tiles(points, padding=0):
    if not isinstance(points, list) or len(points) > 100000 or not points:
        raise ValueError('Expected 1..100000 authoring sample points')
    if type(padding) is not int or not 0 <= padding <= 1:
        raise ValueError('padding must be 0 or 1 tile')
    tiles = set()
    for point in points:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise ValueError('Each authoring point must be [longitude, latitude]')
        x, y = tile_address(*point)
        for dy in range(-padding, padding + 1):
            for dx in range(-padding, padding + 1):
                if 0 <= y + dy < 1800:
                    tiles.add(((x + dx) % 3600, y + dy))
        if len(tiles) > MAX_TILES:
            raise ValueError('Authoring batch exceeds 128 tiles; split the route into bounded batches')
    return sorted(tiles, key=lambda t: (t[1], t[0]))


class SourceIndex:
    """Offline-only spatial index. Original source parts remain available to QA."""
    def __init__(self, geometries, slots, records, source, invalid_features=()):
        self.geometries = list(geometries)
        self.slots = np.asarray(slots, dtype=np.uint16)
        self.records = records
        self.source = source
        self.catalog_sha = catalog_digest(records)
        self.tree = STRtree(self.geometries)
        self.invalid_features = sorted(invalid_features)
        self.valid = np.asarray([g.is_valid for g in self.geometries], dtype=bool)

    @classmethod
    def from_archive(cls, archive, manifest, addresses):
        if manifest.get('source', {}).get('id') != 'RESOLVE-ECOREGIONS-2017':
            raise ValueError('Expected the RESOLVE atlas catalog')
        if manifest['source'].get('license') != 'CC-BY-4.0':
            raise ValueError('Expected attributed CC-BY-4.0 source')
        with archive.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        if digest != SOURCE_SHA or manifest['source'].get('sha256') != digest:
            raise ValueError('Pinned source/catalog SHA-256 mismatch')
        records = manifest['records']
        if not records or records[0] is not None or len(records) > 4096:
            raise ValueError('Invalid record catalog')
        slot_by_id = {r['id']: i for i, r in enumerate(records) if r}
        if len(slot_by_id) != len(records) - 1:
            raise ValueError('Duplicate catalog record')
        module_path = Path(__file__).with_name('build-resolve-atlas.py')
        spec = importlib.util.spec_from_file_location('resolve_builder', module_path)
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        if not addresses or len(addresses) > MAX_TILES:
            raise ValueError('Source scan requires a bounded tile batch')
        footprints = [box(*cell_bounds(x, y, 0, 15)[:2],
                          cell_bounds(x, y, 15, 0)[2], cell_bounds(x, y, 15, 0)[3])
                      for x, y in addresses]
        footprint_tree = STRtree(footprints)
        scan_bounds = (min(g.bounds[0] for g in footprints), min(g.bounds[1] for g in footprints),
                       max(g.bounds[2] for g in footprints), max(g.bounds[3] for g in footprints))
        geometries, slots, observed = [], [], set()
        with tempfile.TemporaryDirectory() as temporary:
            path = builder.extract_source(archive, Path(temporary))
            encoding = builder.source_encoding(path)['encoding']
            with shapefile.Reader(str(path), encoding=encoding, encodingErrors='strict') as reader:
                for feature_index, item in enumerate(reader.iterRecords()):
                    fields = item.as_dict()
                    record = dict(id=int(fields['ECO_ID']), biome=int(fields['BIOME_NUM']),
                                  name=str(fields['ECO_NAME']), realm=str(fields['REALM']))
                    slot = slot_by_id.get(record['id'])
                    if slot is None or records[slot] != record:
                        raise ValueError('Source metadata disagrees with atlas catalog')
                    if builder.re.sub(r'[^a-z0-9]', '', str(fields.get('LICENSE', '')).lower()) != 'ccby40':
                        raise ValueError('Unlicensed source record')
                    observed.add(record['id'])
                    source_shape = reader.shape(feature_index, bbox=scan_bounds)
                    if source_shape is None or not len(footprint_tree.query(box(*source_shape.bbox))):
                        continue
                    g = shape(source_shape.__geo_interface__)
                    parts = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
                    if any(p.geom_type != 'Polygon' for p in parts):
                        raise ValueError('Expected source polygons')
                    for part in parts:
                        if len(footprint_tree.query(box(*part.bounds))):
                            geometries.append(part)
                            slots.append(slot)
        if observed != set(slot_by_id):
            raise ValueError('Atlas catalog has missing/extra source records')
        result = cls(geometries, slots, records, manifest['source'])
        result.invalid_features = sorted({records[int(s)]['id'] for s, valid in zip(result.slots, result.valid) if not valid})
        return result


def components(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'):
        return [p for child in g.geoms for p in components(child)]
    # Lines/points from exact edge/corner contacts are not silently discarded.
    raise ValueError('Degenerate source contact')


def cell_bounds(tx, ty, cx, cy):
    gx, gy = tx * DIVISIONS + cx, ty * DIVISIONS + cy
    return (-180 + gx / SCALE, 90 - (gy + 1) / SCALE,
            -180 + (gx + 1) / SCALE, 90 - gy / SCALE)


def build_tile(index, tx, ty):
    if type(tx) is not int or type(ty) is not int or not 0 <= tx < 3600 or not 0 <= ty < 1800:
        raise ValueError('Invalid tile address')
    west, _, _, north = cell_bounds(tx, ty, 0, 0)
    _, south, east, _ = cell_bounds(tx, ty, 15, 15)
    area = box(west, south, east, north)
    local, local_slots, hazards, hazard_reasons = [], [], [], []
    candidates = sorted(map(int, index.tree.query(area)), key=lambda i: (int(index.slots[i]), i))
    for i in candidates:
        original = index.geometries[i]
        if not index.valid[i]:
            # A globally invalid part's bounding box can cover an unrelated route.
            # Disjoint source geometry is not an uncertainty in this tile. No
            # repair is attempted; predicate failure still makes the tile unsafe.
            try:
                if not original.intersects(area):
                    continue
            except shapely.errors.GEOSException:
                pass
            hazards.append(box(*original.bounds).intersection(area))
            hazard_reasons.append(1)
            continue
        try:
            cut = shapely.intersection(original, area, grid_size=0)
            parts = components(cut)
            local.extend(parts)
            local_slots.extend([int(index.slots[i])] * len(parts))
        except ValueError:
            hazards.append(original.intersection(area))
            hazard_reasons.append(4)
        except shapely.errors.GEOSException:
            hazards.append(box(*original.bounds).intersection(area))
            hazard_reasons.append(2)
    local_tree, hazard_tree = STRtree(local), STRtree(hazards)
    tile = dict(schema=SCHEMA, crs='EPSG:4326', sourceSha256=index.source['sha256'],
                catalogSha256=index.catalog_sha, tileX=tx, tileY=ty,
                divisions=DIVISIONS, cellSlots=[], cellReasons=[], cellPolygonOffsets=[0],
                polygonSlots=[], polygonRingOffsets=[0], ringPointOffsets=[0], coordinates=[])
    for cy in range(DIVISIONS):
        for cx in range(DIVISIONS):
            area = box(*cell_bounds(tx, ty, cx, cy))
            danger = hazard_tree.query(area, predicate='intersects')
            reason, label, encoded = 0, 0, []
            if len(danger):
                reason, label = min(hazard_reasons[int(i)] for i in danger), -2
            else:
                ids = sorted(map(int, local_tree.query(area, predicate='intersects')),
                             key=lambda i: (local_slots[i], i))
                # A sole polygon covering the complete closed cell is exactly uniform.
                if len(ids) == 1 and local[ids[0]].covers(area):
                    label = local_slots[ids[0]]
                else:
                    try:
                        for i in ids:
                            cut = shapely.intersection(local[i], area, grid_size=0)
                            for polygon in components(cut):
                                if not polygon.is_valid:
                                    raise shapely.errors.GEOSException('Invalid clipped polygon')
                                polygon = shapely.normalize(polygon)
                                rings = [list(polygon.exterior.coords)] + [list(r.coords) for r in polygon.interiors]
                                encoded.append((local_slots[i], rings))
                        edges = sum(len(r) - 1 for _, rings in encoded for r in rings)
                        points = sum(len(r) for _, rings in encoded for r in rings)
                        if edges > MAX_CELL_EDGES or len(tile['coordinates']) // 2 + points > MAX_TILE_POINTS:
                            label, reason, encoded = -2, 3, []
                        else:
                            label = -1 if encoded else 0
                    except ValueError:
                        label, reason, encoded = -2, 4, []
                    except shapely.errors.GEOSException:
                        label, reason, encoded = -2, 2, []
            tile['cellSlots'].append(label)
            tile['cellReasons'].append(reason)
            for slot, rings in encoded:
                tile['polygonSlots'].append(slot)
                for ring in rings:
                    tile['coordinates'].extend(v for xy in ring for v in xy[:2])
                    tile['ringPointOffsets'].append(len(tile['coordinates']) // 2)
                tile['polygonRingOffsets'].append(len(tile['ringPointOffsets']) - 1)
            tile['cellPolygonOffsets'].append(len(tile['polygonSlots']))
    raw = canonical(tile)
    if len(raw) > MAX_JSON_BYTES:
        raise ValueError('Tile JSON exceeds bounded decode contract')
    return tile


def write_tiles(index, addresses, output):
    if not 0 < len(addresses) <= MAX_TILES:
        raise ValueError('Expected a bounded authoring batch')
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    for x, y in addresses:
        tile = build_tile(index, x, y)
        raw = canonical(tile)
        packed = gzip.compress(raw, compresslevel=9, mtime=0)
        name = f'{x}-{y}.json.gz'
        (output / name).write_bytes(packed)
        entries.append(dict(x=x, y=y, file=name, jsonBytes=len(raw), gzipBytes=len(packed),
                            sha256=hashlib.sha256(raw).hexdigest(),
                            unresolvedCells=tile['cellSlots'].count(-2),
                            vectorCells=tile['cellSlots'].count(-1)))
    manifest = dict(schema=SCHEMA, source=index.source, catalogSha256=index.catalog_sha,
                    records=index.records, tiles=entries,
                    limits=dict(maxTilesPerBuild=MAX_TILES, divisions=DIVISIONS,
                                maxCellEdges=MAX_CELL_EDGES, maxTilePoints=MAX_TILE_POINTS,
                                maxJsonBytes=MAX_JSON_BYTES),
                    selectedInvalidGeometryIds=index.invalid_features,
                    selectedInvalidSourceParts=int(np.count_nonzero(~index.valid)),
                    modifications='Local closed-cell polygon intersection in double precision; no repair/snap/fill',
                    placementAuthority=False, elevationApplied=False)
    (output / 'manifest.json').write_bytes(canonical(manifest) + b'\n')
    (output / 'ATTRIBUTION.txt').write_text(
        'RESOLVE Ecoregions 2017; Dinerstein et al. (2017), doi:10.1093/biosci/bix014.\n'
        'CC-BY-4.0 https://creativecommons.org/licenses/by/4.0/\n'
        f"Source: {index.source.get('url', '')}\nSHA-256: {index.source['sha256']}\n"
        'Modified: bounded local source-polygon clipping, no geometry repair or snapping.\n'
        'Regional context, not current land cover, treeline or placement permission.\n', encoding='utf-8')
    return manifest


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--atlas', type=Path, required=True, help='R1 atlas directory; its record catalog is preserved')
    p.add_argument('--points', type=Path, required=True, help='JSON array of [longitude,latitude] authoring samples')
    p.add_argument('--padding', type=int, choices=[0, 1], default=0)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    if a.points.stat().st_size > 8 * 1024 * 1024:
        p.error('Authoring point file exceeds 8 MiB')
    addresses = select_tiles(json.loads(a.points.read_text()), a.padding)
    started = time.perf_counter()
    index = SourceIndex.from_archive(a.source, json.loads((a.atlas / 'manifest.json').read_text()), addresses)
    manifest = write_tiles(index, addresses, a.output)
    print(json.dumps(dict(tiles=len(addresses), gzipBytes=sum(e['gzipBytes'] for e in manifest['tiles']),
                         unresolvedCells=sum(e['unresolvedCells'] for e in manifest['tiles']),
                         seconds=time.perf_counter()-started), indent=2))
