#!/usr/bin/env python3
"""R13 repackaging integrity/negative cases. No source reinterpretation."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import zipfile
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r13_packager',ROOT/'tools/biomes/build-rendered-manic-r13.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def run(source):
    with tempfile.TemporaryDirectory(prefix='r13-builder-qa-') as tmp:
        root=Path(tmp);first=m.build(source,root/'first');second=m.build(source,root/'second')
        a=(root/'first/world-drive-biome-pilot-r13.zip').read_bytes()
        assert a==(root/'second/world-drive-biome-pilot-r13.zip').read_bytes()
        with zipfile.ZipFile(source) as old,zipfile.ZipFile(root/'first/world-drive-biome-pilot-r13.zip') as new:
            assert len(new.namelist())==len(set(new.namelist()))
            original=[x for x in old.namelist() if x.startswith(m.PREFIX) and x.endswith('.json.gz')]
            assert len(original)==26
            for name in original:assert old.read(name)==new.read(name.replace('/pilot-r10/','/pilot-r13/'))
            prefix='public/local-data/biomes/pilot-r13/'
            directory=json.loads(new.read(prefix+'directory.json'))
            assert directory['revision']==m.REVISION
            for d in directory['batches']:
                raw=new.read(prefix+d['file']);assert len(raw)==d['jsonBytes'] and m.sha(raw)==d['sha256']
                assert json.loads(raw)['revision']==m.REVISION
            manifest=json.loads(new.read(prefix+'pilot-manifest.json'))
            for name,d in manifest['files'].items():
                raw=new.read(prefix+name);assert len(raw)==d['bytes'] and m.sha(raw)==d['sha256']
            assert 'r13-manic-boreal' in new.read(prefix+'start.mjs').decode()
        try:m.build(source,root/'first')
        except FileExistsError:pass
        else:raise AssertionError('Existing output overwritten')
        corrupt=bytearray(Path(source).read_bytes());corrupt[-1]^=1;(root/'corrupt.zip').write_bytes(corrupt)
        try:m.build(root/'corrupt.zip',root/'bad')
        except ValueError:pass
        else:raise AssertionError('Corrupt accepted input accepted')
        assert not (root/'bad').exists()
        report={'status':'PASS','groups':5,'unchangedGzipTiles':26,'revisionBoundPages':len(directory['batches']),
            'reproducible':True,'rejectsCorruption':True,'noOverwrite':True,'zipBytes':len(a),'zipSha256':hashlib.sha256(a).hexdigest()}
        print(json.dumps(report));return report
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--r10-zip',type=Path,required=True);p.add_argument('--output',type=Path)
    a=p.parse_args();report=run(a.r10_zip)
    if a.output:a.output.write_text(json.dumps(report,indent=2)+'\n')
