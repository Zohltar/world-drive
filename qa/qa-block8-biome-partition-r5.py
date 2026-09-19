#!/usr/bin/env python3
"""Standard-library packaging regression tests; synthetic data only."""
import gzip
import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('pack',ROOT/'tools/biomes/partition-refinement-batches.py')
pack=importlib.util.module_from_spec(spec);spec.loader.exec_module(pack)
encode=pack.encoded

def main():
    with tempfile.TemporaryDirectory() as temp:
        root=Path(temp);inputs=[]
        records=[None,dict(id=1,biome=1,name='MOCK forêt',realm='Test')]
        source=dict(id='RESOLVE-ECOREGIONS-2017',license='CC-BY-4.0',sha256='a'*64)
        cat=pack.digest(encode(records))
        for part in range(2):
            d=root/f'input{part}';d.mkdir();inputs.append(d);tiles=[]
            for i in range(part*100,min(150,(part+1)*100)):
                x=1800+i;y=900
                raw=encode(dict(schema=pack.SCHEMA,sourceSha256=source['sha256'],catalogSha256=cat,tileX=x,tileY=y))
                zipped=gzip.compress(raw,mtime=0);name=f'{x}-{y}.json.gz';(d/name).write_bytes(zipped)
                tiles.append(dict(x=x,y=y,file=name,sha256=pack.digest(raw),jsonBytes=len(raw),gzipBytes=len(zipped)))
            (d/'manifest.json').write_bytes(encode(dict(schema=pack.SCHEMA,source=source,records=records,catalogSha256=cat,tiles=tiles)))
        report=pack.build(inputs,root/'a','test-r5');assert report['tiles']==150 and report['batches']==15
        pack.build(list(reversed(inputs)),root/'b','test-r5')
        assert {p.name:p.read_bytes() for p in (root/'a').iterdir()}=={p.name:p.read_bytes() for p in (root/'b').iterdir()}
        for d in inputs:
            for file in d.glob('*.gz'):assert file.read_bytes()==(root/'a'/file.name).read_bytes()
        def refuses(fn):
            try:fn()
            except (ValueError,KeyError,OSError):return
            raise AssertionError('Expected fail-closed rejection')
        refuses(lambda:pack.build(inputs,root/'a','test-r5'))
        refuses(lambda:pack.build(inputs,root/'bad-revision','../r'))
        path=inputs[0]/'manifest.json';original=path.read_bytes()
        for field,value in [('file','../1800-900.json.gz'),('sha256','b'*64),('jsonBytes',1),('gzipBytes',1),('x',True)]:
            m=json.loads(original);m['tiles'][0][field]=value;path.write_bytes(encode(m))
            refuses(lambda:pack.build(inputs,root/'rejected','test-r5'));assert not (root/'rejected').exists()
        path.write_bytes(original)
        m=json.loads(original);m['source']['sha256']='c'*64;path.write_bytes(encode(m));refuses(lambda:pack.build(inputs,root/'identity','test-r5'));path.write_bytes(original)
        m=json.loads(original);m['catalogSha256']='c'*64;path.write_bytes(encode(m));refuses(lambda:pack.build(inputs,root/'catalog','test-r5'));path.write_bytes(original)
        m=json.loads(original);m['tiles']*=2;path.write_bytes(encode(m));refuses(lambda:pack.build(inputs,root/'oversize','test-r5'));path.write_bytes(original)
        print('PASS R5 packer: 150 tiles/15 pages, reproducible order, byte-preserving copies, 10 rejection cases')
if __name__=='__main__':main()
