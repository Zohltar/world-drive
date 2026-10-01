#!/usr/bin/env python3
"""Pinned package reproducibility, fail-closed checks and explicit-only launcher."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pilot', ROOT / 'tools/biomes/package-diagnostic-pilot.py')
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)

def main(source):
    checks = []
    with tempfile.TemporaryDirectory(prefix='pilot-r9-') as td:
        work = Path(td)
        first = pilot.build(source, work / 'one')
        second = pilot.build(source, work / 'two')
        assert first == second
        checks.append('deterministic manifest and ZIP')
        output = work / 'one' / pilot.INSTALL
        for name in pilot.PINS:
            assert (source / name).read_bytes() == (output / name).read_bytes()
        checks.append('all source geometry/gzip/attribution bytes preserved')
        with zipfile.ZipFile(work / 'one/world-drive-biome-pilot-r9.zip') as z:
            assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in z.namelist())
            assert len(z.namelist()) == 11
        checks.append('safe finite archive paths')
        mutations = {
            'missing': lambda p: (p / '582-534.json.gz').unlink(),
            'extra': lambda p: (p / 'extra.json').write_text('{}'),
            'digest': lambda p: (p / '582-534.json.gz').write_bytes(b'x' * 1327),
            'size': lambda p: (p / 'directory.json').write_bytes(b'x' * 131073),
            'symlink': lambda p: ((p / '582-534.json.gz').unlink(), (p / '582-534.json.gz').symlink_to(source / '582-534.json.gz')),
        }
        for label, mutate in mutations.items():
            bad = work / label
            shutil.copytree(source, bad)
            mutate(bad)
            try:
                pilot.build(bad, work / (label + '-out'))
            except ValueError:
                assert not (work / (label + '-out')).exists()
            else:
                raise AssertionError(label)
            checks.append(label + ' rejected before output')
        try:
            pilot.build(source, work / 'one')
        except FileExistsError:
            pass
        else:
            raise AssertionError('overwrite allowed')
        checks.append('existing destination preserved')
        js = r'''import assert from 'node:assert/strict';
const file=process.argv[1];let starts=0,stops=0;
const original=globalThis.WorldDriveDiagnostics;
const api={start:async config=>{starts++;assert.equal(config.directory.source.id,'RESOLVE-ECOREGIONS-2017');return {status:'enabled'};},stop:()=>{stops++;},snapshot:()=>({enabled:starts>stops})};
globalThis.WorldDriveDiagnostics={forest:{biomes:api},framePacing:{snapshot:()=>({fps:12})}};
const m=await import(file);assert.equal(starts,0);assert.equal(stops,0);
assert.equal((await m.start()).status,'enabled');assert.equal(starts,1);
assert.equal(m.snapshot().framePacing.fps,12);m.stop();assert.equal(stops,1);
api.start=async()=>{throw new Error('propagated');};await assert.rejects(m.start(),/propagated/);
delete globalThis.WorldDriveDiagnostics;await assert.rejects(m.start(),/Load the World Drive/);
globalThis.WorldDriveDiagnostics=original;console.log('PASS explicit launcher; no auto start; no swallowed failure');'''
        subprocess.run(['node', '--input-type=module', '-e', js, (output / 'start.mjs').as_uri()], check=True)
        checks.append('launcher import inert; start/stop/report and errors explicit')
    print(json.dumps({'status': 'PASS', 'groups': len(checks), 'checks': checks}, indent=2))

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--pilot', required=True, type=Path)
    main(p.parse_args().pilot.resolve())
