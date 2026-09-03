import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT=process.cwd();
const SRC=path.join(ROOT,'src');

// Phase O conclusion: existing P9/V21/Mx runtime names are retained only where
// they still encode a compatibility boundary, implementation lineage or active
// branding contract. This gate prevents NEW milestone/version-stamped runtime
// filenames while preserving the accepted historical set for traceability.
const NAMING_POLICY=Object.freeze({
  compatibilityFacades:Object.freeze([
    'src/local-world-builder-p926.js',
    'src/streaming-coordinator-p913.js',
    'src/terrain-p926.js',
    'src/v21-menu.js'
  ]),
  protectedLineageOwners:Object.freeze([
    'src/local-world-builder-p925.js',
    'src/terrain-p925.js'
  ]),
  implementationLineage:Object.freeze([
    'src/imagery/imagery-p913.js',
    'src/local-world/local-world-builder-p926.js',
    'src/multiplayer/multiplayer-client-m3.js',
    'src/multiplayer/multiplayer-visuals-m3.js',
    'src/multiplayer/multiplayer-visuals-v18.js',
    'src/road/road-furniture-p930.js',
    'src/road/road-furniture-p937.js',
    'src/scenery/scenery-renderer-p9.js',
    'src/scenery/scenery-renderer-p933.js',
    'src/streaming/streaming-coordinator-p913.js',
    'src/terrain/terrain-p925.js',
    'src/terrain/terrain-p926.js',
    'src/vehicles/vehicle-presentation-v21.29.js'
  ]),
  activeBrandingAssets:Object.freeze([
    'src/ui/v21-menu.js',
    'src/v21-ui.css'
  ])
});

const HISTORICAL_GLOBALS=Object.freeze([
  '__WORLD_DRIVE_P923_LOCAL_WORLD__',
  '__WORLD_DRIVE_P928_RECORD_HITCH__',
  '__WORLD_DRIVE_P929_FOREST__',
  '__WORLD_DRIVE_P931_FOREST__',
  '__WORLD_DRIVE_P933_FOREST_READY__',
  '__WORLD_DRIVE_P933_FOREST_STATUS__',
  '__WORLD_DRIVE_P934_FOREST__',
  '__WORLD_DRIVE_P934_FOREST_READY__',
  '__WORLD_DRIVE_P934_FOREST_STATUS__',
  '__WORLD_DRIVE_P935_FOREST_READY__',
  '__WORLD_DRIVE_P935_FOREST_STATUS__',
  '__WORLD_DRIVE_P936_FOREST__',
  '__WORLD_DRIVE_P940_FOREST__',
  '__WORLD_DRIVE_P941_FOREST__',
  '__WORLD_DRIVE_P941_FRAME_RUNTIME_STATE__'
]);

function walk(dir,out=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const child=path.join(dir,entry.name);
    if(entry.isDirectory())walk(child,out);
    else out.push(child);
  }
  return out;
}
const rel=file=>path.relative(ROOT,file).replaceAll('\\','/');

const historicalFilePattern=/(?:^|[-_.])p\d+(?:\.\d+)?(?:[-_.]|$)|(?:^|[-_.])v\d+(?:\.\d+)*(?:[-_.]|$)|(?:^|[-_.])m\d+(?:[-_.]|$)/i;
const actualHistoricalPaths=walk(SRC)
  .map(rel)
  .filter(file=>/\.(?:js|mjs|cjs|css)$/i.test(file))
  .filter(file=>historicalFilePattern.test(path.posix.basename(file)))
  .sort();
const classified=Object.values(NAMING_POLICY).flat();
const duplicates=classified.filter((name,index)=>classified.indexOf(name)!==index).sort();
const accepted=[...new Set(classified)].sort();

assert.deepEqual(duplicates,[],`Phase O naming policy duplicates: ${duplicates.join(', ')}`);
assert.equal(accepted.length,21,`Phase O accepted historical runtime path count drift: ${accepted.length}`);
assert.deepEqual(
  actualHistoricalPaths,
  accepted,
  'Phase O historical runtime filename boundary changed. New P9/V21/Mx runtime names require explicit policy review; existing lineage names must not disappear through an unreviewed rename.'
);

const sourceText=walk(SRC)
  .filter(file=>/\.(?:js|mjs|cjs)$/i.test(file))
  .map(file=>fs.readFileSync(file,'utf8'))
  .join('\n');
const actualHistoricalGlobals=[...new Set(
  [...sourceText.matchAll(/__WORLD_DRIVE_P\d+_[A-Z0-9_]+__/g)].map(match=>match[0])
)].sort();
assert.deepEqual(
  actualHistoricalGlobals,
  [...HISTORICAL_GLOBALS].sort(),
  'Phase O historical compatibility/diagnostic/runtime-state global boundary changed. Additions require explicit compatibility review.'
);

// These are not migration targets: their current QAs explicitly rely on the
// lineage semantics. The assertions keep the reason for KEEP NAME executable.
const presentation=fs.readFileSync(path.join(SRC,'vehicles/vehicle-presentation.js'),'utf8');
assert.ok(
  presentation.includes("from './vehicle-presentation-v21.29.js'"),
  'Phase O: vehicle-presentation V21.29 historical layer boundary drift'
);
const multiplayer=fs.readFileSync(path.join(SRC,'multiplayer.js'),'utf8');
const multiplayerVisuals=fs.readFileSync(path.join(SRC,'multiplayer-visuals.js'),'utf8');
assert.ok(multiplayer.includes("import('./multiplayer/multiplayer-client-m3.js')"),'Phase O: M3 multiplayer client compatibility layer drift');
assert.ok(multiplayerVisuals.includes("import('./multiplayer/multiplayer-visuals-m3.js')"),'Phase O: M3 multiplayer visual compatibility layer drift');

console.log('PHASE O HISTORICAL NAMING BOUNDARY QA: PASS',{
  historicalRuntimePaths:accepted.length,
  compatibilityFacades:NAMING_POLICY.compatibilityFacades.length,
  protectedLineageOwners:NAMING_POLICY.protectedLineageOwners.length,
  implementationLineage:NAMING_POLICY.implementationLineage.length,
  activeBrandingAssets:NAMING_POLICY.activeBrandingAssets.length,
  historicalCompatibilityGlobals:HISTORICAL_GLOBALS.length,
  policy:'KEEP existing lineage; reject new milestone/version-stamped runtime names'
});
