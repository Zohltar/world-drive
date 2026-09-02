import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
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
  'src/local-world/local-world-builder-p926.js','src/local-world-builder-p925.js',
  'qa/V21_26_ENVIRONMENT_REFACTOR_QA.mjs'
])syntax(file);

const main=read('src/main.js');
const entry=read('src/local-world-builder.js');
const p926Facade=read('src/local-world-builder-p926.js');
const p926=read('src/local-world/local-world-builder-p926.js');
const p925=read('src/local-world-builder-p925.js');
const environmentQa=read('qa/V21_26_ENVIRONMENT_REFACTOR_QA.mjs');

assert.match(main,/import \{ createLocalWorldBuilder \} from '\.\/local-world-builder\.js';/,
  'main must consume the canonical local-world entry');
assert.match(main,/localWorldBuilder=createLocalWorldBuilder\(\{/,
  'main must initialize the canonical local-world builder');
assert.match(entry,/from '\.\/local-world-builder-p926\.js'/,
  'canonical entry must preserve the stable P9.26 root path');
assert.match(p926Facade,/export\s*\{\s*createLocalWorldBuilder\s*\}\s*from\s*['"]\.\/local-world\/local-world-builder-p926\.js['"]/,
  'root P9.26 compatibility facade changed');
assert.match(p926,/from ['"]\.\.\/local-world-builder-p925\.js['"]/,
  'nested P9.26 layer must preserve the root P9.25 prepared-world owner');

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
  'qa/qa-streaming-p923-prepared-refresh.mjs',
  'qa/qa-streaming-p923-scheduler.mjs',
  'qa/qa-streaming-p924-frame-budget.mjs',
  'qa/qa-streaming-p925-scenery-and-prep.mjs',
  'qa/qa-streaming-p926-horizon.mjs',
  'qa/qa-streaming-p927-road-transition.mjs',
  'qa/qa-p937-combined-frame-pacing.mjs',
  'qa/qa-p938-forest-retention.mjs'
])assert.ok(exists(qa),`current local-world/frame-pacing QA missing: ${qa}`);

assert.doesNotMatch(environmentQa,/V21_26_LOCAL_WORLD_REFACTOR_QA/,
  'environment QA still chains the stale local-world meta-regression');

const offenders=[];
function walk(dir){
  for(const entryName of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
    const rel=path.join(dir,entryName.name).replaceAll('\\','/');
    if(entryName.isDirectory()){
      if(['node_modules','.git','dist'].includes(entryName.name))continue;
      walk(rel);
      continue;
    }
    if(rel==='qa/qa-local-world-current-a8.mjs')continue;
    if(!/\.(?:mjs|js|yml|yaml)$/.test(rel))continue;
    const source=read(rel);
    if(source.includes('V21_26_LOCAL_WORLD_REFACTOR_QA'))offenders.push(rel);
  }
}
for(const dir of ['qa','.github'])if(exists(dir))walk(dir);
assert.deepEqual(offenders,[],`retired local-world QA is still referenced: ${offenders.join(', ')}`);

console.log('CLEANUP A8 CURRENT LOCAL-WORLD QA: PASS',{
  ownership:['local-world-builder.js','local-world-builder-p926.js facade','local-world/local-world-builder-p926.js','local-world-builder-p925.js'],
  retainedOrchestration:['road-bed','road-meshes','hydro','scenery','furniture','signs','horizon','shadows'],
  currentPolicies:['P9.23 prepared terrain','P9.25 frame budget','P9.26 horizon','P9.37 road prebuild','P9.38 forest retention'],
  staleMetaQaRemoved:true
});
