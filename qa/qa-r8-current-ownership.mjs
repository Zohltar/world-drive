import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const src=path.join(root,'src');
const read=name=>fs.readFileSync(path.join(src,name),'utf8');

const required=[
  'world-streaming.js',
  'streaming-coordinator.js',
  'streaming-coordinator-p913.js',
  'streaming/streaming-coordinator-p913.js',
  'local-world-builder.js',
  'local-world-builder-p926.js',
  'local-world/local-world-builder-p926.js',
  'local-world-builder-p925.js',
  'terrain.js',
  'terrain-p926.js',
  'terrain/terrain-p926.js',
  'terrain/terrain-p925.js',
  'terrain-p925.js',
  'imagery.js',
  'imagery/imagery-p913.js',
  'elevation.js',
  'world-scene.js',
  'routing/route-lifecycle.js'
];
for(const name of required){
  assert.equal(fs.existsSync(path.join(src,name)),true,`R8 owner missing: src/${name}`);
}

const worldStreaming=read('world-streaming.js');
const coordinator=read('streaming-coordinator.js');
const coordinatorFacade=read('streaming-coordinator-p913.js');
const coordinatorP913=read('streaming/streaming-coordinator-p913.js');
const builder=read('local-world-builder.js');
const builderP926Facade=read('local-world-builder-p926.js');
const builderP926=read('local-world/local-world-builder-p926.js');
const builderP925=read('local-world-builder-p925.js');
const terrain=read('terrain.js');
const terrainP926Facade=read('terrain-p926.js');
const terrainP926=read('terrain/terrain-p926.js');
const terrainP925Bridge=read('terrain/terrain-p925.js');
const terrainP925=read('terrain-p925.js');
const imagery=read('imagery.js');
const imageryP913=read('imagery/imagery-p913.js');
const elevation=read('elevation.js');
const worldScene=read('world-scene.js');
const routeLifecycle=read('routing/route-lifecycle.js');

assert.match(worldStreaming,/unified world streaming policy/);
assert.match(worldStreaming,/Owns WHEN visible services refresh and WHEN route-ahead caches prefetch/);
assert.match(worldStreaming,/export function createWorldStreaming\s*\(/);

assert.match(coordinator,/createStreamingCoordinator as createStreamingCoordinatorP913/);
assert.match(coordinator,/from ['"]\.\/streaming-coordinator-p913\.js['"]/);
assert.doesNotMatch(coordinator,/\.\/streaming\/streaming-coordinator-p913\.js/);
assert.match(coordinator,/Periodic refreshes use the incremental local-world builder/);
assert.match(coordinator,/forced boot\/route\/reset refreshes keep the proven P9\.13 synchronous path/);
assert.match(coordinatorFacade,/export\s*\{\s*createStreamingCoordinator\s*\}\s*from\s*['"]\.\/streaming\/streaming-coordinator-p913\.js['"]/);
assert.match(coordinatorP913,/export function createStreamingCoordinator\s*\(/);

// Local-world current owner keeps the stable root P9.26 path; the historical
// horizon wrapper implementation is nested while sensitive P9.25 stays root.
assert.match(builder,/createLocalWorldBuilder as createLocalWorldBuilderP926/);
assert.match(builder,/from ['"]\.\/local-world-builder-p926\.js['"]/);
assert.match(builderP926Facade,/export\s*\{\s*createLocalWorldBuilder\s*\}\s*from\s*['"]\.\/local-world\/local-world-builder-p926\.js['"]/);
assert.match(builderP926,/from ['"]\.\.\/local-world-builder-p925\.js['"]/);
assert.match(builderP926,/rebuildHorizonIncremental/);
assert.match(builderP926,/p926Horizon/);
assert.match(builderP925,/export function createLocalWorldBuilder\s*\(/);
assert.match(builder,/road-transition/);

// Terrain current P9.27 owner keeps the stable root P9.26 path. P9.26 itself
// lives under src/terrain/, while a thin sibling bridge preserves its original
// import and leaves sensitive P9.25 implementation at the root owner.
assert.match(terrain,/createTerrainService as createTerrainServiceP926/);
assert.match(terrain,/from ['"]\.\/terrain-p926\.js['"]/);
assert.doesNotMatch(terrain,/\.\/terrain\/terrain-p926\.js/);
assert.match(terrainP926Facade,/export\s*\{\s*createTerrainService\s*\}\s*from\s*['"]\.\/terrain\/terrain-p926\.js['"]/);
assert.match(terrainP926,/createTerrainService as createTerrainServiceP925/);
assert.match(terrainP926,/from ['"]\.\/terrain-p925\.js['"]/);
assert.match(terrainP925Bridge,/export\s*\{\s*createTerrainService\s*\}\s*from\s*['"]\.\.\/terrain-p925\.js['"]/);
assert.match(terrainP925,/export function createTerrainService\s*\(/);
assert.match(terrain,/P927_TRANSITION_BUDGET_MS/);
assert.match(terrainP926,/P926_HORIZON_BUDGET_MS/);

assert.match(imagery,/createImageryService as createImageryServiceP913/);
assert.match(imagery,/export function createImageryService\s*\(/);
assert.match(imageryP913,/satellite-terrain-chunks/);
assert.match(imageryP913,/function invalidateGeometry\s*\(/);

assert.match(elevation,/export function createElevationService\s*\(/);
assert.match(worldScene,/export function createWorldScene\s*\(/);
assert.match(routeLifecycle,/commitLocalWorldRefresh\(\)/);

console.log('R8 CURRENT OWNERSHIP BASELINE: PASS',{
  policy:'world-streaming',
  scheduler:'streaming-coordinator -> root facade -> streaming/P9.13 sync base',
  localWorld:'local-world-builder -> root P9.26 facade -> local-world/P9.26 -> root P9.25',
  terrain:'terrain P9.27 -> root P9.26 facade -> terrain/P9.26 -> thin terrain/P9.25 bridge -> root P9.25',
  imagery:'imagery -> imagery/P9.13 satellite chunks',
  startup:'forced synchronous local-world commit'
});
