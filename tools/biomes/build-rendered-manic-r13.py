#!/usr/bin/env python3
"""R13 rendered Manic package from the exact accepted R10 package.
Standard library only; no downloads or geometry changes. Gzip tile bytes are
preserved. Only the revision-bearing manifest pages/root and launcher change.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import tempfile
import zipfile

R10_SHA='560c91b174f9d24b091c03a214fd9bd70fd58fce5702a59565d871f3d56d669b'
REVISION='resolve2017-r13-manic-rendered'
INSTALL=Path('public/local-data/biomes/pilot-r13')
PREFIX='public/local-data/biomes/pilot-r10/'
LAUNCHER='''// Fixed finite R13 source root. Import has no activation side effect.
const directory=__DIRECTORY__;
const baseUrl=new URL('./',import.meta.url).href;
function api(){const a=globalThis.WorldDriveDiagnostics?.forest?.visualPilot;
 if(!a)throw new Error('Pilote visuel absent de cette page : ouvrir le jeu de la candidate à jour, pas la galerie; vérifier le port Vite puis recharger complètement.');return a;}
export function start({season='summer'}={}){return api().start({profile:'r13-manic-boreal',directory,baseUrl,season});}
export function stop(){return api().stop();}
export function season(value){return api().season(value);}
export function snapshot(){return {visualPilot:api().snapshot(),framePacing:globalThis.WorldDriveFramePacing?.()??null};}
'''
README='''World Drive R13 - pilote VISUEL boréal, Manic-2 → Manic-5.
Copier seulement public/local-data/biomes/pilot-r13/ au même endroit dans le dépôt.
Garder R9/R10/R12. Mettre à jour la candidate, relancer npm run dev et recharger le jeu.
Choisir normalement 389 · Manic-2 → Manic-5, puis dans la console du jeu :
await (await import('/local-data/biomes/pilot-r13/start.mjs')).start({season:'summer'})
WorldDriveDiagnostics.forest.visualPilot.snapshot()
Vérifier pilot: r13-manic-boreal, modifiedChunks > 0, modifiedInstances > 0,
proofsCompleted > 0 et error: null. Le conifère ÉTÉ est identique à la forêt R4.
WorldDriveDiagnostics.forest.visualPilot.season('winter')
HIVER : conifères enneigés uniquement. Sol, route, météo et adhérence inchangés.
Fermer la console et rouler quelques kilomètres; surveiller fluidité et changements tardifs.
Capturer AVANT arrêt :
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
WorldDriveDiagnostics.forest.visualPilot.season('summer')
WorldDriveDiagnostics.forest.visualPilot.stop()
Un changement de trajet arrête le pilote; redémarrage explicite requis.
Ce n'est pas un mélange d'espèces, une couverture mondiale ou une saison automatique.
Aucun Python à installer, aucune fusion ou mise à jour de main.
'''
def sha(raw):return hashlib.sha256(raw).hexdigest()
def encoded(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf-8')

def build(source,output):
    source,output=Path(source),Path(output)
    if source.is_symlink() or not source.is_file() or source.stat().st_size!=55499:
        raise ValueError('Exact regular R10 input package required')
    raw=source.read_bytes()
    if sha(raw)!=R10_SHA:raise ValueError('R10 input digest mismatch')
    if output.exists() or output.is_symlink():raise FileExistsError('Fresh output required')
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='r13-',dir=output.parent) as tmp:
        work=Path(tmp)/'result';package=work/INSTALL;package.mkdir(parents=True)
        with zipfile.ZipFile(source) as z:
            names=z.namelist()
            if len(names)!=len(set(names)):raise ValueError('Duplicate zip entry')
            for entry in z.infolist():
                if not entry.filename.startswith(PREFIX):continue
                name=entry.filename[len(PREFIX):]
                if not re.fullmatch(r'(?:\d+-\d+\.json\.gz|batch-\d+-\d+\.json|directory\.json|ATTRIBUTION\.txt|pilot-manifest\.json|start\.mjs)',name):
                    raise ValueError('Unexpected package entry')
                if entry.file_size>2*1024*1024:raise ValueError('Input entry size bound')
                if name not in ['start.mjs','pilot-manifest.json']:(package/name).write_bytes(z.read(entry))
        directory=json.loads((package/'directory.json').read_text())
        if directory['revision']!='resolve2017-r10-manic':raise ValueError('R10 source revision')
        old_directory_sha=sha((package/'directory.json').read_bytes())
        directory['revision']=REVISION
        for descriptor in directory['batches']:
            path=package/descriptor['file'];body=path.read_bytes()
            if len(body)!=descriptor['jsonBytes'] or sha(body)!=descriptor['sha256']:raise ValueError('R10 page identity')
            page=json.loads(body)
            if page['revision']!='resolve2017-r10-manic':raise ValueError('R10 page revision')
            page['revision']=REVISION;body=encoded(page);path.write_bytes(body)
            descriptor.update(jsonBytes=len(body),sha256=sha(body))
        (package/'directory.json').write_bytes(encoded(directory))
        (package/'start.mjs').write_text(LAUNCHER.replace('__DIRECTORY__',json.dumps(directory,ensure_ascii=True,separators=(',',':'))),encoding='utf-8')
        (package/'ATTRIBUTION.txt').write_text((package/'ATTRIBUTION.txt').read_text(encoding='utf-8')+
            '\nR13: R10 gzip tiles unchanged; revision-bearing pages and opt-in visual launcher repackaged.\n',encoding='utf-8')
        tiles=sorted(package.glob('*.json.gz'))
        if len(tiles)!=26 or len(directory['batches'])!=2:raise ValueError('Finite R13 footprint changed')
        summary={'schema':'world-drive-rendered-manic-r13','profile':'r13-manic-boreal','revision':REVISION,
            'defaultEnabled':False,'sourcePackageR10Sha256':R10_SHA,'sourceDirectorySha256':old_directory_sha,
            'source':directory['source'],'catalogSha256':directory['catalogSha256'],'tiles':len(tiles),
            'pages':len(directory['batches']),'tileGzipBytes':sum(p.stat().st_size for p in tiles),
            'tileBytesUnchanged':True,'existingPlacementsOnly':True,'worldwideCoverage':False,
            'files':{p.name:{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(package.iterdir())}}
        (package/'pilot-manifest.json').write_bytes(encoded(summary)+b'\n')
        (work/'README-PILOT.txt').write_text(README,encoding='utf-8')
        archive=work/'world-drive-biome-pilot-r13.zip'
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            for path in sorted([*package.iterdir(),work/'README-PILOT.txt']):
                info=zipfile.ZipInfo(path.relative_to(work).as_posix(),(2026,9,18,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
                z.writestr(info,path.read_bytes())
        summary.update(zipBytes=archive.stat().st_size,zipSha256=sha(archive.read_bytes()))
        (work/'build-report.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
        work.rename(output)
    print(json.dumps({k:summary[k] for k in ('tiles','pages','zipBytes','zipSha256')}))
    return summary
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--r10-zip',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();build(a.r10_zip,a.output)
