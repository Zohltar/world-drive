#!/usr/bin/env python3
"""Cross-language refinement QA against ORIGINAL source polygons, not clipped tiles.
Build and decode stay in the harness. The JS query itself performs no I/O.
"""
import argparse
import gzip
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import box, Polygon
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


refine = module('local_refinement_builder', ROOT / 'tools/biomes/build-local-refinement.py')
oracle = module('source_oracle', ROOT / 'qa/qa-block8-biome-source-parity-r1.py')


def evaluate(directory, coordinates):
    path, output = directory / 'qa-points.json', directory / 'js-evaluation.json'
    path.write_text(json.dumps(coordinates))
    subprocess.run(['node', str(ROOT / 'qa/qa-block8-biome-refinement-r2.mjs'), '--evaluate',
                    str(directory), str(path), str(output)], check=True, cwd=ROOT)
    return json.loads(output.read_text())


def self_test():
    records = [None, dict(id=1, biome=1, name='Synthetic tropical', realm='Test'),
               dict(id=2, biome=13, name='Synthetic desert', realm='Test')]
    source = dict(id='RESOLVE-ECOREGIONS-2017', license='CC-BY-4.0', sha256='a' * 64)
    polygon = Polygon([(0.0003, -.0003), (.0059, -.0003), (.0059, -.0059), (.0003, -.0059)],
                      holes=[[(.002, -.002), (.004, -.002), (.004, -.004), (.002, -.004)]])
    other = box(.005, -.005, .009, -.001)
    shapes, slots = [polygon, other], [1, 2]
    positions = [[.001, -.001], [.003, -.003], [.0055, -.003], [.008, -.003], [.01, -.01],
                 [.002, -.003], [.00625, -.0025], [.00625-1e-8, -.0025], [.00625+1e-8, -.0025]]
    index = refine.SourceIndex(shapes, slots, records, source)
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        m = refine.write_tiles(index, [(1800, 900)], root)
        tile = refine.build_tile(index, 1800, 900)
        assert refine.canonical(tile) == refine.canonical(refine.build_tile(index, 1800, 900))
        reversed_index = refine.SourceIndex(shapes[::-1], slots[::-1], records, source)
        assert refine.canonical(tile) == refine.canonical(refine.build_tile(reversed_index, 1800, 900))
        actual = evaluate(root, positions)
        expected, _ = oracle.source_slots(index.tree, index.slots, positions)
        assert [r['slot'] for r in actual['results']] == expected.tolist(), (actual, expected)
        # Invalid source geometry is reported, never repaired or silently ignored.
        invalid = Polygon([(.001,-.001),(.005,-.005),(.005,-.001),(.001,-.005),(.001,-.001)])
        bad = refine.SourceIndex([invalid], [1], records, source)
        t = refine.build_tile(bad, 1800, 900)
        assert t['cellSlots'][0] == -2 and t['cellReasons'][0] == 1
        # Invalid bowtie bbox intersects this tile, but its triangles do not.
        disjoint_invalid = Polygon([(-1,1),(1,1),(-1,-1),(1,-1),(-1,1)])
        t = refine.build_tile(refine.SourceIndex([disjoint_invalid], [2], records, source), 1807, 899)
        assert t['cellSlots'].count(-2) == 0
        # Excessive local geometry preserves uncertainty instead of overrunning query budget.
        theta = np.linspace(0, 2*np.pi, 600, endpoint=False)
        complex_polygon = Polygon(np.column_stack((.003+.002*np.cos(theta), -.003+.002*np.sin(theta))))
        t = refine.build_tile(refine.SourceIndex([complex_polygon], [1], records, source), 1800, 900)
        assert t['cellSlots'][0] == -2 and t['cellReasons'][0] == 3
        # A tiny island survives even though the coarse cell's centre misses it.
        tiny = box(.0001, -.0002, .0002, -.0001)
        tiny_index = refine.SourceIndex([tiny], [1], records, source)
        refine.write_tiles(tiny_index, [(1800, 900)], root)
        r = evaluate(root, [[.00015, -.00015], [.001, -.001]])['results']
        assert [v['slot'] for v in r] == [1, 0]
        # Polygons across the seam are represented by their existing split source parts.
        seam = refine.SourceIndex([box(-180,9.9,-179.99,10.1), box(179.99,9.9,180,10.1)], [1,1], records, source)
        seam_points = [[-179.999,10.01],[179.999,10.01],[-180,10.01],[180,10.01]]
        refine.write_tiles(seam, refine.select_tiles(seam_points), root)
        r = evaluate(root, seam_points)['results']
        assert [v['slot'] for v in r] == [1,1,1,1]
    assert refine.tile_address(-180, 90) == (0,0)
    assert refine.tile_address(180, -90) == (0,1799)
    assert len(refine.select_tiles([[-180, 0]],padding=1)) == 9
    for p in [[True,0],[float('nan'),0],[181,0],[0,91]]:
        try:
            refine.tile_address(*p)
            raise AssertionError('Invalid point accepted')
        except ValueError:
            pass
    try:
        refine.select_tiles([[i,0] for i in range(-179,179)])
        raise AssertionError('Unbounded tile selection accepted')
    except ValueError:
        pass
    print('PASS R2 builder: polygon/hole/overlap/seam/tiny island, reproducibility, invalid topology and complexity bounds')


def real_groups():
    rng = np.random.default_rng(20260918)
    groups = {}
    for name, bounds in [('baffin-local',(-64.10,67.40,-63.90,67.60)),
                         ('jamaica-local',(-78.10,18.35,-77.80,18.55)),
                         ('yungas-local',(-68.00,-16.40,-67.65,-16.10))]:
        x0,y0,x1,y1 = bounds
        groups[name] = np.column_stack((rng.uniform(x0,x1,2000),rng.uniform(y0,y1,2000)))
    groups['original-yungas-transect'] = oracle.samples()['yungas-transect-diagnostic-only']
    groups['original-baffin'] = np.array([[-64.,67.5]])
    # Exact local cell and tile seams near Baffin; guard numerical ownership.
    groups['baffin-cell-seams'] = np.array([[-64 + i/160 + dx,67.5 + j/160 + dy]
        for i in range(-2,3) for j in range(-2,3) for dx,dy in [(0,0),(-1e-8,0),(1e-8,0),(0,-1e-8),(0,1e-8)]])
    return groups


def main(source_path, atlas_root, output):
    start = time.perf_counter()
    atlas = json.loads((atlas_root/'0.1/manifest.json').read_text())
    groups = real_groups()
    points = np.concatenate(list(groups.values())).tolist()
    addresses = refine.select_tiles(points)
    index = refine.SourceIndex.from_archive(source_path, atlas, addresses)
    print('Selected source parts loaded:',len(index.geometries),'invalid parts:',int(np.count_nonzero(~index.valid)),flush=True)
    pack = refine.write_tiles(index, addresses, output)
    report = dict(sourceSha256=refine.SOURCE_SHA, tiles=len(addresses),
                  tileJsonBytes=sum(e['jsonBytes'] for e in pack['tiles']),
                  tileGzipBytes=sum(e['gzipBytes'] for e in pack['tiles']),
                  manifestBytes=(output/'manifest.json').stat().st_size,
                  unresolvedCells=sum(e['unresolvedCells'] for e in pack['tiles']),
                  selectedInvalidSourceFeatures=len(index.invalid_features),
                  selectedInvalidSourceParts=int(np.count_nonzero(~index.valid)), groups=[],
                  sourceAgreementOnly=True, gameRuntimeChanged=False,
                  limitations=['Source-polygon agreement is not ecological field or treeline validation',
                    'Three local sensitivity footprints, not global coverage or driven polylines',
                    'Invalid source parts fail closed when touching a tile or when disjointness cannot be established; no repair',
                    'Clipped-cell boundaries use a 1e-11 degree arithmetic tolerance',
                    'No production loader, palette activation, transition blending or GPU benchmark'])
    actual = evaluate(output,points)
    grids = {}
    for resolution in ('0.1','0.05'):
        path = atlas_root/resolution
        m = json.loads((path/'manifest.json').read_text())
        assert m['records'] == atlas['records'] and m['source']['sha256'] == refine.SOURCE_SHA
        raw = gzip.decompress((path/'cells.u16le.gz').read_bytes())
        assert hashlib.sha256(raw).hexdigest() == m['cellSha256']
        grids[resolution] = (np.frombuffer(raw,dtype='<u2').reshape(m['height'],m['width']),m)
    biome_by_slot = np.array([r['biome'] if r else 0 for r in atlas['records']])
    offset, failures = 0, []
    for name, coordinates in groups.items():
        expected, overlaps = oracle.source_slots(index.tree, index.slots, coordinates)
        results = actual['results'][offset:offset+len(coordinates)]
        values = np.array([r['slot'] if r['slot'] is not None else -1 for r in results])
        unresolved = values == -1
        wrong = (~unresolved) & (values != expected)
        item = dict(name=name,samples=len(coordinates),resolved=int((~unresolved).sum()),
                    unresolved=int(unresolved.sum()),sourceEcoregionMismatches=int(wrong.sum()),
                    sourceOverlapSamples=overlaps,coarseBiomeDifferences={})
        for key,(grid,m) in grids.items():
            x=np.floor((coordinates[:,0]+180)/360*m['width']).astype(int)
            y=np.floor((90-coordinates[:,1])/180*m['height']).astype(int)
            item['coarseBiomeDifferences'][key]=int(np.count_nonzero(biome_by_slot[grid[y,x]] != biome_by_slot[expected]))
        if name=='original-baffin':
            item['expectedRecord']=atlas['records'][int(expected[0])]
            assert item['expectedRecord']['id']==415
        report['groups'].append(item)
        if wrong.any() or unresolved.any():
            for i in np.flatnonzero(wrong | unresolved)[:10]:
                failures.append(dict(group=name,point=coordinates[i].tolist(),expected=int(expected[i]),actual=results[int(i)]))
        offset += len(coordinates)
    report.update(queries=actual['diagnostics'],loads=actual['loads'],loadMs=actual['loadMs'],
                  query100kWithAssertionsMs=actual['query100kWithAssertionsMs'],failures=failures,
                  seconds=time.perf_counter()-start)
    (output/'precision-qa.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2,ensure_ascii=False),flush=True)
    assert not failures, 'Refinement source parity/coverage gate failed; inspect precision-qa.json'
    print('PASS R2 real local refinement and original Baffin/Yungas gates')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--self-test',action='store_true')
    p.add_argument('--source',type=Path)
    p.add_argument('--atlases',type=Path)
    p.add_argument('--output',type=Path)
    a=p.parse_args()
    if a.self_test:
        self_test()
    elif all((a.source,a.atlases,a.output)):
        main(a.source,a.atlases,a.output)
    else:
        p.error('--self-test or --source --atlases --output required')
