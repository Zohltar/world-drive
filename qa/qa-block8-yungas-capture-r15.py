"""Pinned original route validation and rejection tests; never fetch the network."""
import copy
import gzip
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
with patch('urllib.request.urlopen',side_effect=AssertionError('Import must be inert')) as network:
    spec=importlib.util.spec_from_file_location('capture_r15',ROOT/'tools/biomes/capture-yungas-route-r15.py')
    C=importlib.util.module_from_spec(spec);spec.loader.exec_module(C)
    assert network.call_count==0
raw=gzip.decompress((ROOT/'qa/fixtures/biomes/yungas-r15/response.json.gz').read_bytes())
data,info=C.validate(raw)
assert C.sha(raw)=='511da11b27aa74d91237f45f13c84170a57fb0653107a7d7ffc6374e2c871ddb'
assert info['pointCount']==1754 and abs(info['lengthMeters']-28153.429947659195)<.01
passed=['import is network inert','pinned real road, both legs and waypoint']
def reject(name,change):
    d=copy.deepcopy(data);change(d)
    try:C.validate(json.dumps(d).encode())
    except (ValueError,TypeError):passed.append(name);return
    raise AssertionError(name+' accepted')
def pts(d):return d['routes'][0]['geometry']['coordinates']
reject('reversed route',lambda d:pts(d).reverse())
reject('wrong endpoints',lambda d:pts(d).__setitem__(0,[-67.90,-16.38]))
reject('missing historic-road waypoint',lambda d:d['routes'][0]['geometry'].__setitem__('coordinates',[p for p in pts(d) if C.distance(p,C.POINTS[1])>600]))
reject('out-of-envelope point',lambda d:pts(d).__setitem__(100,[0,0]))
reject('boolean coordinate',lambda d:pts(d).__setitem__(100,[True,-16.2]))
reject('nonfinite coordinate',lambda d:pts(d).__setitem__(100,[float('nan'),-16.2]))
reject('short invented route',lambda d:d['routes'][0]['geometry'].__setitem__('coordinates',C.POINTS))
reject('discontinuous interior',lambda d:pts(d).__setitem__(100,[-67.94,-16.39]))
reject('wrong geometry type',lambda d:d['routes'][0]['geometry'].__setitem__('type','Polygon'))
reject('inconsistent reported length',lambda d:d['routes'][0].__setitem__('distance',1))
reject('no route returned',lambda d:d.__setitem__('code','NoRoute'))
for value in [b'',b'X'*(C.MAX_BYTES+1),'not bytes']:
    try:C.validate(value)
    except ValueError:passed.append('bounded response/type');continue
    raise AssertionError('bad response accepted')
print(json.dumps({'status':'PASS','groups':len(passed),'tests':passed,'route':info}))
