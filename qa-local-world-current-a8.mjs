import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const exists=relative=>fs.existsSync(path.join(root,relative));
const syntax=relative=>{
  const result=spawnSync(process.execPath,['--check',relative],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${relative} syntax failed:\n${result.stderr||result.stdout}`);
};

assert.equal(exists('qa/V21_26_LOCAL_WORLD_REFACTOR_QA.mjs'),false,
  'stale V21.26 local-world implementation QA returned');

for(const file of [
  'src/main.js','src/local-world-builder.js','src/local-world-builder-p926.js',
  'src/local-world-builder-p925.js','qa/V21_26_ENVIRONMENT_REFACTOR_QA.mjs'
])syntax(file);

const main=read('src/main.js');
const entry=read('src/local-world-builder.js');
const p926=read('src/local-world-builder-p926.js');
const p925=read('src/local-world-builder-p925.js');
const environmentQa=read('qa/V21_26_ENVIRONMENT_REFACTOR_QA.mjs');

// The public entry is now composition/performance policy. Historical V21.26
// orchestration lives below it and must not be forced back into this file.
assert.match(main,/import \{ createLocalWorldBuilder \} from '\.\/local-world-builder\.js';/,
  'main must consume the canonical local-world entry');
assert.match(main,/localWorldBuilder=createLocalWorldBuilder\(\{/,
  'main must initialize the canonical local-world builder');
assert.match(entry,/from '\.\/local-world-builder-p926\.js'/,
  'canonical entry must preserve the active P9.26 horizon layer');
assert.match(p926,/from '\.\/local-world-builder-p925\.js'/,
  'P9.26 layer must preserve the active P9.25 prepared-world owner');

// Useful V21.26 orchestration invariants are retained against their CURRENT
// owner instead of requiring them to be textually present in the public entry.
for(const marker of [
  'function roadBedOptionsForProfile',
  'terrainService.setRoadBed(terrainProfile,roadBedOptionsForProfile(profile))',
  'function buildRoadMeshes(profile)',
  'rebuildLocalWater();',
  "scheduleVisualJob('scenery',rebuildLocalScenery,220)",
  'addEnhancedBridgeFurniture();',
  'refreshRoadSignsOnly();',
  'freezeStaticMatrices(roadGroup);',
  'freezeStaticMatrices(forestGroup);',
  'freezeStaticMatrices(infrastructureGroup);',
  'freezeStaticMatrices(signGroup);',
  "scheduleVisualJob('horizon',rebuildHorizon,260)",
  'markStaticShadowsDirty();'
])assert.ok(p925.includes(marker),`current P9.25 orchestration invariant missing: ${marker}`);

// Current ownership added after V21.26 must remain authoritative.
for(const marker of [
  'P937_ROAD_PREP_GAP_MS=8',
  'prepareRoadStage',
  'p937RoadStage',
  'P938_PRESERVE_FOREST_DURING_PREPARED_COMMIT=true',
  'preserveForestDuringPreparedCommit=true',
  'clearGroupForBuilder',
  'freezeStaticMatricesForBuilder'
])assert.ok(entry.includes(marker),`current P9.37/P9.38 ownership marker missing: ${marker}`);

for(const qa of [
  'qa-streaming-p923-prepared-refresh.mjs',
  'qa-streaming-p923-scheduler.mjs',
  'qa-streaming-p924-frame-budget.mjs',
  'qa-streaming-p925-scenery-and-prep.mjs',
  'qa-streaming-p926-horizon.mjs',
  'qa-streaming-p927-road-transition.mjs',
  'qa-p937-combined-frame-pacing.mjs',
  'qa-p938-forest-retention.mjs'
])assert.ok(exists(qa),`current local-world/frame-pacing QA missing: ${qa}`);

assert.doesNotMatch(environmentQa,/V21_26_LOCAL_WORLD_REFACTOR_QA/,
  'environment QA still chains the stale local-world meta-regression');

// No active QA/workflow may resurrect the retired test by filename.
const offenders=[];
function walk(dir){
  for(const entryName of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
    const rel=path.join(dir,entryName.name).replaceAll('\\','/');
    if(entryName.isDirectory()){
      if(['node_modules','.git','dist'].includes(entryName.name))continue;
      walk(rel);
      continue;
    }
    if(rel==='qa-local-world-current-a8.mjs')continue;
    if(!/\.(?:mjs|js|yml|yaml)$/.test(rel))continue;
    const source=read(rel);
    if(source.includes('V21_26_LOCAL_WORLD_REFACTOR_QA'))offenders.push(rel);
  }
}
for(const dir of ['qa','.github'])if(exists(dir))walk(dir);
assert.deepEqual(offenders,[],`retired local-world QA is still referenced: ${offenders.join(', ')}`);

console.log('CLEANUP A8 CURRENT LOCAL-WORLD QA: PASS',{
  ownership:['local-world-builder.js','local-world-builder-p926.js','local-world-builder-p925.js'],
  retainedOrchestration:['road-bed','road-meshes','hydro','scenery','furniture','signs','horizon','shadows'],
  currentPolicies:['P9.23 prepared terrain','P9.25 frame budget','P9.26 horizon','P9.37 road prebuild','P9.38 forest retention'],
  staleMetaQaRemoved:true
});
