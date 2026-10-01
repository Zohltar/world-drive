#!/usr/bin/env python3
"""Pinned capture/independent oracle/packager contracts; no native browser claim."""
import argparse
import copy
import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import zipfile
import numpy as np
import shapely
from shapely.strtree import STRtree
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def run(pilot=None):
    builder=load('r10_builder',ROOT/'tools/biomes/build-long-road-pilot-r10.py')
    capture=load('r10_capture',ROOT/'tools/biomes/capture-manic-route-r10.py')
    oracle=load('r10_oldoracle',ROOT/'qa/qa-block8-biome-source-parity-r1.py')
    fixture=ROOT/'qa/fixtures/biomes/manic-r10';raw=gzip.decompress((fixture/'response.json.gz').read_bytes())
    data,info=capture.validate(raw);assert info['pointCount']==1497
    failures=0
    for alter in [lambda d:d.update(code='NoRoute'),lambda d:d['routes'][0]['geometry'].update(coordinates=[[0,0],[1,1]]),
        lambda d:d['routes'][0].update(distance=1),lambda d:d['routes'][0]['geometry']['coordinates'].reverse(),
        lambda d:d['routes'][0]['geometry']['coordinates'][3].__setitem__(0,True)]:
        invalid=copy.deepcopy(data);alter(invalid)
        try:capture.validate(json.dumps(invalid).encode())
        except (ValueError,TypeError):failures+=1
        else:raise AssertionError('Invalid captured source accepted')
    assert failures==5
    outer=shapely.Polygon([(0,0),(4,0),(4,4),(0,4)],holes=[[(1,1),(2,1),(2,2),(1,2)]])
    inner=shapely.box(3,3,5,5)
    pts=np.array([(0,0),(1,1),(1.5,1.5),(3.5,3.5),(4,4),(5,5),(10,10)])
    for geoms,slots in [([outer,inner],[1,2]),([inner,outer],[2,1]),([],[])]:
        tree=STRtree(geoms);slots=np.array(slots,dtype=np.uint16)
        before=[g.wkb for g in tree.geometries];shapely.prepare(tree.geometries)
        assert before==[g.wkb for g in tree.geometries],'source geometry changed'
        assert np.array_equal(builder.prepared_source_slots(tree,slots,pts),oracle.source_slots(tree,slots,pts)[0])
    try:builder.prepared_source_slots(STRtree([]),np.array([],dtype=np.uint16),np.zeros((1745,2)))
    except ValueError:pass
    else:raise AssertionError('Oracle bound missing')
    with tempfile.TemporaryDirectory() as t:
        output=Path(t)/'existing';output.mkdir();(output/'keep').write_text('keep')
        try:builder.build(Path(t)/'missing',Path(t),fixture,output)
        except FileExistsError:pass
        else:raise AssertionError('Output overwritten')
        assert (output/'keep').read_text()=='keep'
    if pilot:
        pilot=Path(pilot);r=json.loads((pilot/'build-report.json').read_text());p=pilot/'public/local-data/biomes/pilot-r10'
        assert r['tiles']==26 and r['uniqueCandidateChunks']==383 and r['windows']==800
        assert r['unresolvedCells']==0 and r['sourceInvalidGeometryIds']==[]
        for name,entry in r['files'].items():
            b=(p/name).read_bytes();assert len(b)==entry['bytes'] and builder.sha(b)==entry['sha256']
        zpath=pilot/'world-drive-biome-pilot-r10.zip';assert builder.sha(zpath.read_bytes())==r['zipSha256']
        with zipfile.ZipFile(zpath) as z:
            for item in z.infolist():
                assert '..' not in Path(item.filename).parts and not item.filename.startswith('/')
                assert z.read(item)==(pilot/item.filename).read_bytes()
        assert (pilot/'source-route/response.json.gz').read_bytes()==(fixture/'response.json.gz').read_bytes()
    print(json.dumps({'status':'PASS','groups':7,'invalidCaptureCases':failures,'oracleDirectionsAgree':True,'packageChecked':bool(pilot)}))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pilot',type=Path);run(p.parse_args().pilot)
