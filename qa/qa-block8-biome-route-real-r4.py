#!/usr/bin/env python3
"""Prepare bounded tiles for the actual stored circuit polylines, then test HTTP/JS."""
import argparse
import importlib.util
import json
import subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def module(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',required=True,type=Path)
    p.add_argument('--atlas',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
    runner=ROOT/'qa/qa-block8-biome-route-real-r4.mjs'
    subprocess.run(['node',str(runner),'--plan',str(a.output)],check=True,cwd=ROOT)
    plan=json.loads((a.output/'route-plan.json').read_text())
    refine=module('route_refine',ROOT/'tools/biomes/build-local-refinement.py')
    oracle=module('route_oracle',ROOT/'qa/qa-block8-biome-source-parity-r1.py')
    atlas=json.loads((a.atlas/'manifest.json').read_text())
    addresses=[tuple(xy) for xy in plan['addresses']]
    index=refine.SourceIndex.from_archive(a.source,atlas,addresses)
    refine.write_tiles(index,addresses,a.output)
    expectations=[]
    for route in plan['routes']:
        slots,_=oracle.source_slots(index.tree,index.slots,route['coordinates'])
        expectations.append([index.records[int(slot)]['id'] if slot else None for slot in slots])
    (a.output/'route-source-expectations.json').write_text(json.dumps(expectations))
    subprocess.run(['node',str(runner),'--evaluate',str(a.output)],check=True,cwd=ROOT)
