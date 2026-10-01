#!/usr/bin/env python3
"""Offline finite Laguna Seca rendered pilot; unchanged source-polygon builders.
No network, game route replacement or writes into installed public data.
"""
import argparse
import base64
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
INSTALL=Path('public/local-data/biomes/pilot-r14')
REVISION='resolve2017-r14-laguna-rendered'
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def encoded(v):
    return json.dumps(v,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf8')
def sha(b):
    return hashlib.sha256(b).hexdigest()
LAUNCHER='''// Fixed finite R14 root. Import has no activation side effect.
const directory=__DIRECTORY__;
const baseUrl=new URL('./',import.meta.url).href;
function api(){const a=globalThis.WorldDriveDiagnostics?.forest?.visualPilot;
 if(!a)throw new Error('Pilote visuel absent : ouvrir le jeu de la candidate à jour, vérifier le port Vite et recharger complètement.');return a;}
export function start({season='summer'}={}){return api().start({profile:'r14-laguna-woodland',directory,baseUrl,season});}
export function stop(){return api().stop();}
export function snapshot(){return {visualPilot:api().snapshot(),framePacing:globalThis.WorldDriveFramePacing?.()??null};}
'''
README='''World Drive R14 - pilote VISUEL Laguna Seca, arbre de milieu sec approuvé.
Copier seulement public/local-data/biomes/pilot-r14/ au même endroit dans le dépôt.
Garder R9/R10/R12/R13. Mettre à jour la candidate, relancer npm run dev et recharger le JEU.
Choisir Laguna Seca, puis dans la console :
await (await import('/local-data/biomes/pilot-r14/start.mjs')).start()
WorldDriveDiagnostics.forest.visualPilot.snapshot()
Vérifier pilot: r14-laguna-woodland, modifiedChunks/modifiedInstances/proofsCompleted > 0 et error: null.
Les zones prouvées utilisent l'arbre de milieu sec, plus étalé que le conifère.
ÉTÉ uniquement : aucune variante hiver de cet arbre n'a été approuvée.
La demande winter est refusée sans détruire la présentation été.
Le pilote ne change ni positions, ni densité R4, ni exclusions, ni sol, ni route, ni météo.
Ce test ne reproduit donc pas encore la végétation clairsemée réelle du site.
Fermer la console et faire un tour; surveiller fluidité et changements tardifs.
Capture AVANT arrêt :
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
Retour à la forêt d'origine : WorldDriveDiagnostics.forest.visualPilot.stop()
Un changement de trajet arrête le pilote. Pas de nouveau test Manic/Nord/galerie demandé.
Les captures automatisées utilisent un terrain de repli sans imagerie satellite : ce n'est pas de la neige.
Aucune installation de Python nécessaire. Aucun hiver automatique ou changement d'adhérence.
'''

def build(source,atlas,output):
    if output.exists() or output.is_symlink():raise FileExistsError('Fresh output required')
    for p in [source,atlas/'manifest.json']:
        if not p.is_file() or p.is_symlink():raise ValueError('Regular input required')
    output.parent.mkdir(parents=True,exist_ok=True)
    refine=load('r14_refine',ROOT/'tools/biomes/build-local-refinement.py')
    partition=load('r14_partition',ROOT/'tools/biomes/partition-refinement-batches.py')
    oracle=load('r14_oracle',ROOT/'tools/biomes/build-long-road-pilot-r10.py')
    route_file=ROOT/'src/routing/circuits/laguna-seca.json'
    if sha(route_file.read_bytes())!='822a2c2d387ea300cf9cf066f3c7577f002e021064179b557254fbe39f9007fa':raise ValueError('Pinned circuit bytes changed')
    route=json.loads(route_file.read_text());route=route.get('coordinates') if isinstance(route,dict) else route
    if len(route)!=206 or route[0]!=[-121.7505173,36.586962]:raise ValueError('Authored Laguna Seca changed')
    addresses=refine.select_tiles(route,padding=1)
    if len(addresses)>9:raise ValueError('Finite pilot footprint grew')
    with tempfile.TemporaryDirectory(prefix='r14-',dir=output.parent) as tmp:
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
            subprocess.run(['node','tools/biomes/rendered-laguna-points-r14.mjs'],cwd=ROOT,stdout=f,check=True)
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
        (work/'oracle-plan.json').write_bytes(encoded({'origin':{'lat':route[0][1],'lon':route[0][0]},'coordinates':route,'samples':samples}))
        sample_file.unlink();shutil.rmtree(tiles)
        summary.update(schema='world-drive-rendered-pilot-r14',modelId='preview-woodland',supportedSeasons=['summer'],revision=REVISION,autoStart=False,
            routeSha256=sha(route_file.read_bytes()),routeVertices=206,sourceSha256=refine.SOURCE_SHA,
            geometryScope='Homogeneous exact source ecoregion 423 only; existing placements/density, summer-only model',
            oracleChunks=len(expected),oracleCandidates=points_count,oracleEcoregionCounts=region_counts,
            tileGzipBytes=sum(x['gzipBytes'] for x in manifest['tiles']),unresolvedCells=sum(x['unresolvedCells'] for x in manifest['tiles']),
            files={p.name:{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(package.iterdir())})
        (package/'pilot-manifest.json').write_bytes(encoded(summary)+b'\n')
        archive=work/'world-drive-biome-pilot-r14.zip'
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
