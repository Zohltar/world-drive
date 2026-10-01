#!/usr/bin/env python3
"""Independent GEOS source-vs-raster QA, authoring only; never loaded by the game.

Cell-center parity is an assertion. Off-center differences measure resolution
loss and are reported without pretending to be ecological ground truth.
"""
import argparse
import gzip
import hashlib
import importlib.util
import json
import tempfile
import time
from pathlib import Path

import numpy as np
import shapefile
import shapely
from shapely.geometry import shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA = 'be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60'


def source_slots(tree, geometry_slots, coordinates):
    """Return the highest record slot on overlaps, matching the documented importer.
    GEOS point-in-polygon is independent from rasterio's scan conversion.
    """
    positions = np.asarray(coordinates, dtype=np.float64)
    result = np.zeros(len(positions), dtype=np.uint16)
    if not len(positions):
        return result, 0
    pairs = tree.query(shapely.points(positions[:, 0], positions[:, 1]), predicate='covered_by')
    if not pairs.size:
        return result, 0
    point_indices, geometry_indices = pairs
    np.maximum.at(result, point_indices, geometry_slots[geometry_indices])
    # Distinct ecoregions, not multipolygon parts, count as overlap ambiguity.
    unique_pairs = np.unique(np.column_stack((point_indices, geometry_slots[geometry_indices])), axis=0)
    hit_counts = np.bincount(unique_pairs[:, 0], minlength=len(positions))
    return result, int(np.count_nonzero(hit_counts > 1))


def samples():
    rng = np.random.default_rng(20260917)
    groups = {'global-uniform-latlon': np.column_stack((rng.uniform(-179.99, 179.99, 6000), rng.uniform(-89.99, 89.99, 6000)))}
    # Sensitivity probes, NOT samples of an actual driven polyline or world-area-weighted accuracy.
    for name, bounds in [('baffin-coast', (-66, 66.5, -62, 68.5)),
                         ('jamaica-coast', (-78.5, 17.5, -76, 18.7)),
                         ('yungas-region', (-68.1, -16.5, -67.4, -15.9))]:
        x0, y0, x1, y1 = bounds
        groups[name] = np.column_stack((rng.uniform(x0, x1, 2000), rng.uniform(y0, y1, 2000)))
    groups['yungas-transect-diagnostic-only'] = np.array([
        (-67.95 + i * .00125, -16.33 + i * .001) for i in range(201)])
    return groups


def self_test():
    outer = shapely.Polygon([(0, 0), (4, 0), (4, 4), (0, 4)], holes=[[(1, 1), (2, 1), (2, 2), (1, 2)]])
    second = shapely.box(3, 3, 5, 5)
    coordinates = [(0.5, 0.5), (1.5, 1.5), (3.5, 3.5), (4.5, 4.5), (-1, -1)]
    expected = [1, 0, 2, 2, 0]
    for geometries, slots in [([outer, second], [1, 2]), ([second, outer], [2, 1])]:
        got, overlap = source_slots(STRtree(geometries), np.array(slots, dtype=np.uint16), coordinates)
        assert got.tolist() == expected, (got, expected)
        assert overlap == 1
    assert source_slots(STRtree([]), np.array([], dtype=np.uint16), [(-1, -1)])[0].tolist() == [0]
    first, second = samples(), samples()
    assert sum(len(v) for v in first.values()) == 12201
    for name in first:
        assert np.array_equal(first[name], second[name])
    got, _ = source_slots(STRtree([shapely.box(10, 1, 11, 2)]), np.array([1], dtype=np.uint16), [(10.5, 1.5), (1.5, 10.5)])
    assert got.tolist() == [1, 0], 'Longitude/latitude order drifted'
    print('PASS independent source oracle self-test: holes, no-data, overlap, record order, sample reproducibility')


def main(archive, atlas_root, output):
    start = time.perf_counter()
    with archive.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != SOURCE_SHA:
        raise ValueError('The source ZIP differs from the pinned real-data experiment')
    paths = [atlas_root / name for name in ('0.1', '0.05')]
    manifests = [json.loads((p / 'manifest.json').read_text()) for p in paths]
    for manifest, step in zip(manifests, (.1, .05)):
        assert manifest['schema'] == 'world-drive-biome-atlas-v1' and manifest['crs'] == 'EPSG:4326'
        assert manifest['cellDegrees'] == step
        assert manifest['width'] == round(360 / step) and manifest['height'] == round(180 / step)
    catalog = manifests[0]['records']
    if any(m['source']['sha256'] != digest or m['records'] != catalog for m in manifests):
        raise ValueError('Atlas catalog/source mismatch')
    slot_by_id = {r['id']: i for i, r in enumerate(catalog) if r}
    spec = importlib.util.spec_from_file_location('builder', ROOT / 'tools/biomes/build-resolve-atlas.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    geometries, slots, invalid_ids = [], [], set()
    with tempfile.TemporaryDirectory() as tmp:
        path = builder.extract_source(archive, Path(tmp))
        encoding = builder.source_encoding(path)['encoding']
        with shapefile.Reader(str(path), encoding=encoding, encodingErrors='strict') as reader:
            for item in reader.iterShapeRecords():
                fields = item.record.as_dict()
                eco_id = int(fields['ECO_ID'])
                geometry = shape(item.shape.__geo_interface__)
                if not geometry.is_valid:
                    invalid_ids.add(eco_id)
                # Explode multipart regions for a bounded spatial search. No geometry
                # repair, dilation or simplification is applied to the source oracle.
                parts = list(geometry.geoms) if geometry.geom_type == 'MultiPolygon' else [geometry]
                geometries.extend(parts)
                slots.extend([slot_by_id[eco_id]] * len(parts))
    tree = STRtree(geometries)
    slots = np.array(slots, dtype=np.uint16)
    groups = samples()
    truths = {name: source_slots(tree, slots, positions) for name, positions in groups.items()}
    biomes = np.array([r['biome'] if r else 0 for r in catalog], dtype=np.uint8)
    controls = [('original-Baffin-control', -64, 67.5), ('interior-Baffin-control', -75, 70),
                ('Manic-5', -68.8, 50.8), ('Montreal', -73.6, 45.5), ('Borneo', 114, .5),
                ('Sahara', 10, 24), ('Tibetan-plateau', 88, 32)]
    control_truth, _ = source_slots(tree, slots, [(lon, lat) for _, lon, lat in controls])
    report = {'sourceSha256': digest, 'sourceRecords': len(catalog) - 1, 'sourcePolygonParts': len(slots),
              'sourceInvalidGeometryIds': sorted(invalid_ids), 'shapelyVersion': shapely.__version__,
              'sourceControls': [{'name': name, 'longitude': lon, 'latitude': lat, 'sourceRecord': catalog[int(slot)]}
                  for (name, lon, lat), slot in zip(controls, control_truth)], 'resolutions': [],
              'method': 'GEOS exact source point-in-polygon versus rasterio cell-centre atlas; highest ECO_ID overlap policy',
              'limitations': ['Source agreement is not current land cover or ecological field validation',
                             'Uniform-latitude samples are not area weighted',
                             'Regional boxes/transect are sensitivity probes, not real driven route polylines',
                             'Source-invalid geometries are reported, not silently repaired',
                             'No runtime, browser or GPU benchmark']}
    mismatch_total = 0
    for directory, manifest in zip(paths, manifests):
        width, height, step = manifest['width'], manifest['height'], manifest['cellDegrees']
        with gzip.open(directory / 'cells.u16le.gz', 'rb') as stream:
            raw = stream.read(width * height * 2 + 1)
        if len(raw) != width * height * 2 or hashlib.sha256(raw).hexdigest() != manifest['cellSha256']:
            raise ValueError('Decoded atlas length/checksum mismatch')
        grid = np.frombuffer(raw, dtype='<u2').reshape(height, width)
        resolution = {'cellDegrees': step, 'cellSha256': manifest['cellSha256'], 'groups': []}
        for name, positions in groups.items():
            cols = np.floor((positions[:, 0] + 180) / 360 * width).astype(int)
            rows = np.floor((90 - positions[:, 1]) / 180 * height).astype(int)
            actual = grid[rows, cols]
            centers = np.column_stack((-180 + (cols + .5) * step, 90 - (rows + .5) * step))
            expected_centers, center_overlaps = source_slots(tree, slots, centers)
            truth, exact_overlaps = truths[name]
            wrong_centers = np.flatnonzero(actual != expected_centers)
            mismatch_total += len(wrong_centers)
            known = truth != 0
            result = {'name': name, 'samples': len(positions), 'centerMismatches': len(wrong_centers),
                      'offCenterEcoregionDifferences': int(np.count_nonzero(actual != truth)),
                      'offCenterBiomeDifferences': int(np.count_nonzero(biomes[actual] != biomes[truth])),
                      'knownSourceSamples': int(known.sum()),
                      'knownSourceMissingInRaster': int(np.count_nonzero(known & (actual == 0))),
                      'noDataSourceAssignedInRaster': int(np.count_nonzero(~known & (actual != 0))),
                      'exactOverlapSamples': exact_overlaps, 'centerOverlapSamples': center_overlaps,
                      'centerMismatchExamples': [{'longitude': float(centers[i, 0]), 'latitude': float(centers[i, 1]),
                          'actual': catalog[int(actual[i])], 'expected': catalog[int(expected_centers[i])]} for i in wrong_centers[:10]]}
            resolution['groups'].append(result)
        report['resolutions'].append(resolution)
    report['cellCenterParityPassed'] = mismatch_total == 0
    report['seconds'] = time.perf_counter() - start
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if mismatch_total:
        raise AssertionError(f'{mismatch_total} cell-centre mismatches; investigate importer, do not certify')
    print('PASS independent source-polygon cell-centre parity at both resolutions')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--atlases', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        if not all((args.source, args.atlases, args.output)):
            parser.error('--source, --atlases and --output are required')
        main(args.source, args.atlases, args.output)
