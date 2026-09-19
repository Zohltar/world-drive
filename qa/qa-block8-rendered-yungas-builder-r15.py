#!/usr/bin/env python3
"""R15 reproducible package and negative authoring inputs, no installed-data writes."""
import argparse
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import zipfile
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r15_builder',ROOT/'tools/biomes/build-rendered-yungas-r15.py')
B=importlib.util.module_from_spec(spec);spec.loader.exec_module(B)
def main(source,atlas,pilot,output):
    passed=[]
    def rejects(callback):
        try:callback()
        except (ValueError,FileExistsError,AssertionError):return
        raise AssertionError('Invalid input accepted')
    data=pilot/B.INSTALL;manifest=json.loads((data/'pilot-manifest.json').read_text())
    assert manifest['tiles']==15 and manifest['batches']==1 and manifest['supportedSeasons']==['summer']
    assert manifest['oracleCandidates']==462160 and manifest['oracleChunks']==265
    source_sha=B.sha(source.read_bytes())
    for name,entry in manifest['files'].items():
        p=data/name;raw=p.read_bytes();assert len(raw)==entry['bytes'] and B.sha(raw)==entry['sha256']
        if name.endswith('.gz'):assert json.loads(gzip.decompress(raw))['sourceSha256']==source_sha
    archive=pilot/'world-drive-biome-pilot-r15.zip'
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert len(z.namelist())==len(set(z.namelist()))
        assert all(n=='README-PILOT.txt' or n.startswith(B.INSTALL.as_posix()+'/') for n in z.namelist())
        for name in z.namelist():assert z.read(name)==(pilot/name).read_bytes()
    passed.append('finite file hashes, source identity and separate install directory')
    with tempfile.TemporaryDirectory(prefix='r15-builder-qa-') as tmp:
        root=Path(tmp);repeat=root/'repeat';B.build(source,atlas,repeat)
        assert archive.read_bytes()==(repeat/archive.name).read_bytes();passed.append('byte-identical repeated package')
        rejects(lambda:B.build(source,atlas,repeat));passed.append('existing output refused')
        link=root/'output-link';link.symlink_to(repeat,target_is_directory=True)
        rejects(lambda:B.build(source,atlas,link));passed.append('symlink output refused')
        link=root/'source-link';link.symlink_to(source)
        rejects(lambda:B.build(link,atlas,root/'bad-link'));assert not (root/'bad-link').exists();passed.append('symlink source refused')
        wrong=root/'wrong.zip';wrong.write_bytes(b'not the pinned source')
        rejects(lambda:B.build(wrong,atlas,root/'bad-source'));assert not (root/'bad-source').exists();passed.append('wrong source refused atomically')
    report={'status':'PASS','groups':len(passed),'tests':passed,'zipBytes':archive.stat().st_size,'zipSha256':B.sha(archive.read_bytes())}
    output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['source','atlas','pilot','output']:p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();main(a.source.resolve(),a.atlas.resolve(),a.pilot.resolve(),a.output.resolve())
