#!/usr/bin/env python3
"""Package ONLY the hash-pinned R8 two-circuit diagnostic pilot, offline.

No game code or installed public data is overwritten. Input is the pilot/ folder
from the verified R8 artifact; output is a fresh directory plus a reproducible ZIP.
The static launcher is imported explicitly; importing it does not start anything.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

SOURCE_SHA = 'be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60'
SOURCE_COMMIT = 'c89e094e8120de30664d4211a41aae6b75fd7d31'
INSTALL = Path('public/local-data/biomes/pilot-r9')
PINS = {
    '1869-396.json.gz': (311, 'fcad58d2595c2e990a9a28783605db8a6e45634f8aaed27eeb533807090bb87c'),
    '1870-396.json.gz': (309, '88f6ead2ade79a1bc5054aaf9fcfd07828acd1dcd6fd190dcef4f33f1d3970d3'),
    '582-534.json.gz': (1327, '4488161289ffb240bdd1fb485451ac304d252d54b4965811f522084e690e8bf9'),
    'ATTRIBUTION.txt': (380, '4681a67a7ebc1629296fb2da153200dd546e1d561d57ee17873d6cd578dee39a'),
    'batch-186-39.json': (421, '9189382b0aae1cc2442e95f695c96672f131cd4d1317cce71a0a10f95ca7edb7'),
    'batch-187-39.json': (421, '88dea658cecd500a33be059e1c1b6d7f77000130c9b241c6deb332a2750333ac'),
    'batch-58-53.json': (419, '8a4766bbe11d685fa82b1d465ef2d4061578026fd96b5896d02bd27c57ba2e20'),
    'directory.json': (69881, 'da7952e0beb7af527f32202823c23422b51ff6ed3b19c71148d1ad542886c31f'),
}
LAUNCHER = '''// Trusted, finite, offline-packaged R9 pilot. No automatic activation.
const directory = __PINNED_DIRECTORY__;
const baseUrl = new URL('./', import.meta.url).href;
function api() {
  const value = globalThis.WorldDriveDiagnostics?.forest?.biomes;
  if (!value || typeof value.start !== 'function') {
    throw new Error('Load the World Drive biome candidate game before starting this diagnostic pilot.');
  }
  return value;
}
export async function start() {
  return api().start({directory, baseUrl});
}
export function stop() { return api().stop(); }
export function snapshot() {
  return {
    pilot: 'r9-two-circuit-diagnostic-only',
    coverage: 'Finite Laguna Seca / Nordschleife source tiles; NOT worldwide or whole-forest coverage',
    biomes: api().snapshot(),
    framePacing: globalThis.WorldDriveDiagnostics?.framePacing?.snapshot?.() ?? null
  };
}
'''
README = '''World Drive — pilote diagnostic R9 (candidate seulement)

Copier le dossier public/ de cette archive à la racine du dépôt de la candidate.
Ne pas remplacer d'autres fichiers. Le jeu doit être servi par HTTP (npm run dev),
jamais ouvert comme un fichier local. Pour une compilation de production, copier
avant npm run build; le sous-dossier est alors conservé dans dist/local-data/.

Choisir Laguna Seca ou la Nordschleife avec le menu habituel, puis dans la console :

await (await import('/local-data/biomes/pilot-r9/start.mjs')).start()
WorldDriveDiagnostics.forest.biomes.snapshot()
WorldDriveFramePacing()

Pour arrêter : WorldDriveDiagnostics.forest.biomes.stop()

Rien ne démarre automatiquement, même à l'import du module. Le pilote ne change ni
les arbres, ni la densité, ni les exclusions, ni le streaming R4. Il observe le
chunk courant et jusqu'à trois chunks devant le véhicule, pas toute la forêt.
Les trois tuiles source sont régionales : hors couverture, les données manquantes
restent explicites. Ce paquet ne couvre PAS Manic-2 → Manic-5 ni le monde entier.
Une donnée géographique prête ne certifie pas les FPS ou la végétation actuelle.
Les données RESOLVE Ecoregions 2017 sont attribuées dans ATTRIBUTION.txt.
'''

def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def build(pilot: Path, output: Path) -> dict:
    pilot, output = Path(pilot), Path(output)
    if not pilot.is_dir() or pilot.is_symlink():
        raise ValueError('Pilot must be a real directory')
    if output.exists():
        raise FileExistsError('Output must not exist; no overwrite is permitted')
    if {p.name for p in pilot.iterdir()} != set(PINS):
        raise ValueError('Pilot contains missing or undeclared files')
    payload = {}
    for name, (size, digest) in PINS.items():
        path = pilot / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size != size:
            raise ValueError(f'Invalid pinned file size/type: {name}')
        raw = path.read_bytes()
        if len(raw) != size or sha(raw) != digest:
            raise ValueError(f'Pinned digest mismatch: {name}')
        payload[name] = raw
    directory = json.loads(payload['directory.json'])
    if directory['source']['sha256'] != SOURCE_SHA:
        raise ValueError('Source identity mismatch')
    # Geometry and compressed tiles are never decoded or rewritten by packaging.
    text = json.dumps(directory, ensure_ascii=True, separators=(',', ':'))
    payload['start.mjs'] = LAUNCHER.replace('__PINNED_DIRECTORY__', text).encode()
    manifest = {
        'schema': 'world-drive-diagnostic-pilot-package-v1',
        'sourceCommit': SOURCE_COMMIT, 'sourceRun': 35287102949,
        'sourceArtifact': 10524961567, 'sourceSha256': SOURCE_SHA,
        'autoStart': False, 'diagnosticOnly': True, 'fineTiles': 3,
        'worldwideCoverage': False, 'renderingActivated': False,
        'files': {k: {'bytes': len(v), 'sha256': sha(v)} for k, v in sorted(payload.items())},
    }
    payload['pilot-manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    output.mkdir(parents=True)
    install = output / INSTALL
    install.mkdir(parents=True)
    for name, raw in payload.items():
        (install / name).write_bytes(raw)
    (output / 'README-PILOT.txt').write_text(README, encoding='utf-8')
    archive = output / 'world-drive-biome-pilot-r9.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in sorted([*install.iterdir(), output / 'README-PILOT.txt']):
            info = zipfile.ZipInfo(path.relative_to(output).as_posix(), (2026, 9, 17, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, path.read_bytes())
    return {**manifest, 'zipBytes': archive.stat().st_size, 'zipSha256': sha(archive.read_bytes())}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pilot', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    report = build(args.pilot, args.output)
    print(json.dumps(report, indent=2))
