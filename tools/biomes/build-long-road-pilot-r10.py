#!/usr/bin/env python3
"""Offline finite Manic route pilot, reusing source-coordinate R2 and R5 pages.
No runtime modifications, network, source repair, nearest-land fill or overwrite.
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

ROOT = Path(__file__).resolve().parents[2]
INSTALL = Path('public/local-data/biomes/pilot-r10')
RESPONSE_SHA = '0d3378137bf9bc3a96ffd6185bb5aaf1a6f47261e31b28038969c03425ed8e0c'
MAX_TILES = 512


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def prepared_source_slots(tree, geometry_slots, coordinates):
    """Exact source GEOS oracle; prepares original polygons, never tile output.
    Predicate direction keeps each prepared polygon as covers' first argument.
    No source coordinate edit, repair, dilation or raster/tile classifier reuse.
    At most one 1,744-point chunk is queried at a time.
    """
    positions = np.asarray(coordinates, dtype=np.float64)
    if len(positions) > 1744:
        raise ValueError('Oracle chunk point bound exceeded')
    result = np.zeros(len(positions), dtype=np.uint16)
    if not len(positions):
        return result
    points = shapely.points(positions[:, 0], positions[:, 1])
    pairs = tree.query(points)
    if pairs.size:
        pi, gi = pairs
        inside = shapely.covers(tree.geometries[gi], points[pi])
        np.maximum.at(result, pi[inside], geometry_slots[gi[inside]])
    return result


def build(source, atlas, fixture, output):
    source, atlas, fixture, output = map(Path, (source, atlas, fixture, output))
    if output.exists() or output.is_symlink():
        raise FileExistsError('Output must not exist; existing pilots are never overwritten')
    for p in [source, atlas/'manifest.json', fixture/'response.json.gz', fixture/'receipt.json']:
        if p.is_symlink() or not p.is_file():
            raise ValueError('Expected regular authoring inputs')
    output.parent.mkdir(parents=True, exist_ok=True)
    refine = load('r10_refine', ROOT/'tools/biomes/build-local-refinement.py')
    partition = load('r10_partition', ROOT/'tools/biomes/partition-refinement-batches.py')
    oracle = load('r10_oracle', ROOT/'qa/qa-block8-biome-source-parity-r1.py')
    packager = load('r10_launcher', ROOT/'tools/biomes/package-diagnostic-pilot.py')
    with tempfile.TemporaryDirectory(prefix='biome-r10-', dir=output.parent) as tmp:
        work = Path(tmp)/'result'
        work.mkdir()
        plan_path = work/'route-plan.json'
        subprocess.run(['node',str(ROOT/'tools/biomes/long-road-plan-r10.mjs'),'--plan',str(fixture),str(plan_path)],check=True,cwd=ROOT)
        plan = json.loads(plan_path.read_text())
        addresses = [tuple(xy) for xy in plan['addresses']]
        if not 1 <= len(addresses) <= MAX_TILES:
            raise ValueError('Finite tile inventory exceeded')
        catalog = json.loads((atlas/'manifest.json').read_text())
        point_file = work/'candidate-points.jsonl'
        with point_file.open('w') as stream:
            subprocess.run(['node',str(ROOT/'tools/biomes/long-road-plan-r10.mjs'),'--samples',str(plan_path)],check=True,stdout=stream,cwd=ROOT)
        expected = {c['key']:np.full(1744,65535,dtype='<u2') for c in plan['chunks']}
        batches, tile_entries, invalid_ids = [], [], set()
        oracle_cross_checks = 0
        for first in range(0,len(addresses),128):
            batch = addresses[first:first+128]
            selected = set(batch)
            index = refine.SourceIndex.from_archive(source,catalog,batch)
            shapely.prepare(index.tree.geometries)
            print(f"R10 source prepared for {len(batch)} tiles",flush=True)
            directory = work/f'authoring-{first//128}'
            manifest = refine.write_tiles(index,batch,directory)
            batches.append(directory);tile_entries.extend(manifest['tiles']);invalid_ids.update(index.invalid_features)
            with point_file.open() as stream:
                for line in stream:
                    sample = json.loads(line)
                    points = np.asarray(sample['points'],dtype=float)
                    mask = np.array([refine.tile_address(*p) in selected for p in points],dtype=bool)
                    if mask.any():
                        slots = prepared_source_slots(index.tree,index.slots,points[mask])
                        # Cross-check both predicate directions on source points
                        # spread over every chunk, not just the departure tile.
                        control = points[mask][::218]
                        original,_ = oracle.source_slots(index.tree,index.slots,control)
                        assert np.array_equal(original,prepared_source_slots(index.tree,index.slots,control))
                        oracle_cross_checks += len(control)
                        expected[sample['key']][mask] = slots
        if any(np.any(slots==65535) for slots in expected.values()):
            raise AssertionError('A requested full forest chunk escaped the provisioned continuous corridor')
        package = work/INSTALL
        packaging = partition.build(batches,package,'resolve2017-r10-manic')
        directory = json.loads((package/'directory.json').read_text())
        launcher = packager.LAUNCHER.replace('__PINNED_DIRECTORY__',json.dumps(directory,ensure_ascii=True,separators=(',',':')))
        launcher = launcher.replace('R9 pilot','R10 pilot').replace('r9-two-circuit-diagnostic-only','r10-manic-diagnostic-only')
        launcher = launcher.replace('Finite Laguna Seca / Nordschleife source tiles; NOT worldwide or whole-forest coverage',
            'Finite Manic-2 to Manic-5 routed corridor; NOT worldwide or whole-forest coverage')
        (package/'start.mjs').write_text(launcher,encoding='utf-8')
        payload = {p.name:{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(package.iterdir())}
        summary = {'schema':'world-drive-long-road-pilot-r10','diagnosticOnly':True,'autoStart':False,
            'renderingActivated':False,'worldwideCoverage':False,'sourceSha256':refine.SOURCE_SHA,
            'routeProvenance':plan['routeProvenance'],'sourceCaptureRun':35345189578,'sourceCaptureArtifact':10545883468,
            'routeLengthMeters':plan['totalMeters'],'windows':len(plan['windows']),'sampleStepMeters':plan['stepMeters'],
            'uniqueCandidateChunks':len(plan['chunks']),'candidatesPerChunk':1744,
            'authoringBatches':len(batches),'maxTilesPerAuthoringBatch':128,**packaging,
            'tileGzipBytes':sum(e['gzipBytes'] for e in tile_entries),'tileJsonBytes':sum(e['jsonBytes'] for e in tile_entries),
            'oraclePredicateCrossChecks':oracle_cross_checks,
            'unresolvedCells':sum(e['unresolvedCells'] for e in tile_entries),'sourceInvalidGeometryIds':sorted(invalid_ids),
            'files':payload,'placementAuthority':False,
            'limitations':['Routed snapshot, not a GPS driving trace; live provider may choose another route',
                'Source agreement is not current tree cover','Awaited replay does not certify real-time high-speed readiness',
                'Diagnostic current plus up to three forward chunks, not the entire forest']}
        if summary['tileGzipBytes']>8*1024*1024:
            raise ValueError('Finite pilot compressed-data limit')
        (package/'pilot-manifest.json').write_bytes(encoded(summary)+b'\n')
        # Route data has its own ODbL attribution; biome source remains CC-BY-4.0.
        source_dir=work/'source-route';source_dir.mkdir()
        for name in ['response.json.gz','receipt.json']:
            shutil.copyfile(fixture/name,source_dir/name)
        (source_dir/'ATTRIBUTION.txt').write_text('Route geometry: OpenStreetMap contributors, ODbL-1.0.\n'
            'https://www.openstreetmap.org/copyright\nhttps://opendatacommons.org/licenses/odbl/1-0/\n'
            'OSRM routed response retained without coordinate edits; see receipt.json for date, URL and hashes.\n'
            'This source route is NOT installed as an authoritative gameplay route.\n',encoding='utf-8')
        readme='''World Drive — pilote diagnostic R10 : Manic-2 -> Manic-5

Candidate seulement; aucune activation des nouvelles palettes ou des arbres.
Copier uniquement public/local-data/biomes/pilot-r10/ au même emplacement dans
le dépôt. Ne pas remplacer le reste de public/; conserver le pilote R9 intact.
Relancer Vite après le pull. Aucun Python à installer ou à exécuter sur le PC.
Choisir Manic-2 -> Manic-5 dans le jeu, puis activer explicitement dans la console :

await (await import('/local-data/biomes/pilot-r10/start.mjs')).start()

Avant de rouler : WorldDriveDiagnostics.forest.biomes.snapshot()
Vérifier phase observed, freshCurrentChunk true, loaded > 0, published > 0.
Fermer DevTools pendant la conduite. Sauvegarder avant d'arrêter :
copy(JSON.stringify({biomes:WorldDriveDiagnostics.forest.biomes.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
Arrêt : WorldDriveDiagnostics.forest.biomes.stop()

La couverture correspond au tracé routé conservé dans source-route/, avec un
couloir borné. Un détour hors couloir reste explicitement indisponible; aucune
forêt par défaut n'est imposée. Le jeu continue d'utiliser ses routeurs habituels.
Ne pas considérer les essais en rejeu accéléré comme une certification des FPS.
Les données source de biomes et de route ont des attributions distinctes.
'''
        (work/'README-PILOT.txt').write_text(readme,encoding='utf-8')
        (work/'source-expectations.json').write_bytes(encoded({key:base64.b64encode(v.tobytes()).decode('ascii') for key,v in expected.items()}))
        point_file.unlink()
        for batch in batches:
            shutil.rmtree(batch)
        archive=work/'world-drive-biome-pilot-r10.zip'
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            for p in sorted([*package.iterdir(),*source_dir.iterdir(),work/'README-PILOT.txt']):
                info=zipfile.ZipInfo(p.relative_to(work).as_posix(),(2026,9,18,0,0,0))
                info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
                z.writestr(info,p.read_bytes())
        summary.update(zipBytes=archive.stat().st_size,zipSha256=sha(archive.read_bytes()))
        (work/'build-report.json').write_text(json.dumps(summary,indent=2)+'\n')
        work.rename(output)
    print(json.dumps({k:summary[k] for k in ['tiles','batches','windows','uniqueCandidateChunks','tileGzipBytes','unresolvedCells','zipBytes','zipSha256']},indent=2))
    return summary


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['source','atlas','fixture','output']:
        parser.add_argument('--'+name,required=True,type=Path)
    a=parser.parse_args();build(a.source,a.atlas,a.fixture,a.output)
