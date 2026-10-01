#!/usr/bin/env python3
"""Offline finite Yungas rendered pilot; unchanged source-polygon builders.
No network, game route replacement or writes into installed public data.
"""
import argparse
import base64
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile
import numpy as np
import shapely
ROOT=Path(__file__).resolve().parents[2]
INSTALL=Path('public/local-data/biomes/pilot-r15')
REVISION='resolve2017-r15-yungas-rendered'
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def encoded(v):
    return json.dumps(v,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf8')
def sha(b):
    return hashlib.sha256(b).hexdigest()
LAUNCHER='''// Fixed finite R15 root. Import has no activation side effect.
const directory=__DIRECTORY__;
const baseUrl=new URL('./',import.meta.url).href;
function api(){const a=globalThis.WorldDriveDiagnostics?.forest?.visualPilot;
 if(!a)throw new Error('Pilote visuel absent : ouvrir le jeu de la candidate à jour, vérifier le port Vite et recharger complètement.');return a;}
export function start({season='summer'}={}){return api().start({profile:'r15-yungas-tropical',directory,baseUrl,season});}
export function stop(){return api().stop();}
export function snapshot(){return {visualPilot:api().snapshot(),framePacing:globalThis.WorldDriveFramePacing?.()??null};}
'''
README='''World Drive R15 - pilote VISUEL Yungas, feuillu tropical approuvé.
Copier seulement public/local-data/biomes/pilot-r15/ au même endroit dans le dépôt.
Garder R9/R10/R12/R13/R14. Mettre à jour la candidate, relancer npm run dev et recharger le JEU.
Choisir Chuspipata → Yolosa · Yungas, puis dans la console :
await (await import('/local-data/biomes/pilot-r15/start.mjs')).start()
WorldDriveDiagnostics.forest.visualPilot.snapshot()
Vérifier pilot: r15-yungas-tropical, modifiedChunks/modifiedInstances/proofsCompleted > 0 et error: null.
Les zones prouvées utilisent le feuillu tropical, à couronne large.
ÉTÉ uniquement : aucune variante hiver de cet arbre n'a été approuvée.
La demande winter est refusée sans détruire la présentation été.
Le pilote ne change ni positions, ni densité R4, ni exclusions, ni sol, ni route, ni météo.
Ce test ne reproduit ni les espèces locales précises, ni un étagement réel par altitude.
Fermer la console et rouler quelques kilomètres; surveiller fluidité et changements tardifs.
Capture AVANT arrêt :
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
Retour à la forêt d'origine : WorldDriveDiagnostics.forest.visualPilot.stop()
Un changement de trajet arrête le pilote. Pas de nouveau test Manic/Nord/Laguna/galerie demandé.
Les captures automatisées utilisent un terrain de repli sans imagerie satellite : ce n'est pas de la neige.
Aucune installation de Python nécessaire. Aucun hiver automatique ou changement d'adhérence.
'''

def build(source,atlas,output):
    if output.exists() or output.is_symlink():raise FileExistsError('Fresh output required')
    for p in [source,atlas/'manifest.json']:
        if not p.is_file() or p.is_symlink():raise ValueError('Regular input required')
    output.parent.mkdir(parents=True,exist_ok=True)
    refine=load('r15_refine',ROOT/'tools/biomes/build-local-refinement.py')
    partition=load('r15_partition',ROOT/'tools/biomes/partition-refinement-batches.py')
    oracle=load('r15_oracle',ROOT/'tools/biomes/build-long-road-pilot-r10.py')
    route_file=ROOT/'qa/fixtures/biomes/yungas-r15/response.json.gz'
    receipt_file=route_file.with_name('receipt.json')
    if any(not p.is_file() or p.is_symlink() for p in [route_file,receipt_file]):raise ValueError('Regular route fixture required')
    raw=gzip.decompress(route_file.read_bytes())
    if sha(raw)!='511da11b27aa74d91237f45f13c84170a57fb0653107a7d7ffc6374e2c871ddb' or sha(receipt_file.read_bytes())!='bb1863c7a1bb245bc4cdf43ff8826e3b872796c8faaa1730bb722e70b229debd':raise ValueError('Pinned Yungas fixture changed')
    capture=load('r15_capture',ROOT/'tools/biomes/capture-yungas-route-r15.py')
    response,route_info=capture.validate(raw);route=response['routes'][0]['geometry']['coordinates']
    if route_info['pointCount']!=1754 or route_info['coordinatesSha256']!='66b8c80b3f66e88daa040ad6c508b5c92bf2c75d28b0ce02f76ef7cb9eaba95f':raise ValueError('Pinned route geometry changed')
    addresses=refine.select_tiles(route,padding=1)
    if len(addresses)>20:raise ValueError('Finite pilot footprint grew')
    with tempfile.TemporaryDirectory(prefix='r15-',dir=output.parent) as tmp:
        work=Path(tmp)/'result';work.mkdir()
        catalog=json.loads((atlas/'manifest.json').read_text())
        index=refine.SourceIndex.from_archive(source,catalog,addresses)
        tiles=work/'authoring';manifest=refine.write_tiles(index,addresses,tiles)
        package=work/INSTALL;summary=partition.build([tiles],package,REVISION)
        directory=json.loads((package/'directory.json').read_text())
        (package/'start.mjs').write_text(LAUNCHER.replace('__DIRECTORY__',json.dumps(directory,ensure_ascii=True,separators=(',',':'))),encoding='utf8')
        (work/'README-PILOT.txt').write_text(README,encoding='utf8')
        # Independent original-polygon oracle, never the generated tile output.
        sample_file=work/'oracle-points.jsonl'
        with sample_file.open('w') as f:
            subprocess.run(['node','tools/biomes/rendered-yungas-points-r15.mjs'],cwd=ROOT,stdout=f,check=True)
        shapely.prepare(index.tree.geometries)
        expected={};region_counts={};points_count=0;samples=[]
        for line in sample_file.read_text().splitlines():
            row=json.loads(line);samples.append({k:row[k] for k in ['key','cx','cz','anchorIndex']})
            if any(refine.tile_address(*p) not in addresses for p in row['points']):raise AssertionError('Oracle sample escaped data pack')
            slots=oracle.prepared_source_slots(index.tree,index.slots,row['points'])
            ids=np.array([index.records[int(s)]['id'] if int(s)>0 else 0 for s in slots],dtype='<u2')
            expected[row['key']]=base64.b64encode(ids.tobytes()).decode('ascii')
            for value,count in zip(*np.unique(ids,return_counts=True)):region_counts[str(int(value))]=region_counts.get(str(int(value)),0)+int(count)
            points_count+=len(ids)
        (work/'source-expectations.json').write_bytes(encoded(expected))
        (work/'oracle-plan.json').write_bytes(encoded({'origin':{'lat':-16.29911,'lon':-67.81891},'coordinates':route,'samples':samples}))
        sample_file.unlink();shutil.rmtree(tiles)
        summary.update(schema='world-drive-rendered-pilot-r15',modelId='preview-tropical',supportedSeasons=['summer'],revision=REVISION,autoStart=False,
            routeSha256=sha(raw),routeVertices=1754,routeReceiptSha256=sha(receipt_file.read_bytes()),routeLengthMeters=route_info['lengthMeters'],sourceSha256=refine.SOURCE_SHA,
            geometryScope='Homogeneous exact source ecoregion 444 only; existing placements/density, summer-only model',
            oracleChunks=len(expected),oracleCandidates=points_count,oracleEcoregionCounts=region_counts,
            tileGzipBytes=sum(x['gzipBytes'] for x in manifest['tiles']),unresolvedCells=sum(x['unresolvedCells'] for x in manifest['tiles']),
            files={p.name:{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(package.iterdir())})
        (package/'pilot-manifest.json').write_bytes(encoded(summary)+b'\n')
        archive=work/'world-drive-biome-pilot-r15.zip'
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            for p in sorted([*package.iterdir(),work/'README-PILOT.txt']):
                info=zipfile.ZipInfo(p.relative_to(work).as_posix(),(2026,9,18,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
                z.writestr(info,p.read_bytes())
        summary.update(zipBytes=archive.stat().st_size,zipSha256=sha(archive.read_bytes()))
        (work/'build-report.json').write_text(json.dumps(summary,indent=2)+'\n')
        work.rename(output)
    print(json.dumps({k:summary[k] for k in ['tiles','batches','oracleChunks','oracleCandidates','zipBytes','zipSha256']},indent=2))
    return summary
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['source','atlas','output']:p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();build(a.source,a.atlas,a.output)
