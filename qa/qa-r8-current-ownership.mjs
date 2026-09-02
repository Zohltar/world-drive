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
  'local-world-builder.js',
  'local-world-builder-p926.js',
  'local-world-builder-p925.js',
  'terrain.js',
  'terrain-p926.js',
  'terrain-p925.js',
  'imagery.js',
  'imagery-p913.js',
  'elevation.js',
  'world-scene.js',
  'routing/route-lifecycle.js'
];
for(const name of required){
  assert.equal(fs.existsSync(path.join(src,name)),true,`R8 owner missing: src/${name}`);
}

const worldStreaming=read('world-streaming.js');
const coordinator=read('streaming-coordinator.js');
const coordinatorP913=read('streaming-coordinator-p913.js');
const builder=read('local-world-builder.js');
const builderP926=read('local-world-builder-p926.js');
const builderP925=read('local-world-builder-p925.js');
const terrain=read('terrain.js');
const terrainP926=read('terrain-p926.js');
const terrainP925=read('terrain-p925.js');
const imagery=read('imagery.js');
const imageryP913=read('imagery-p913.js');
const elevation=read('elevation.js');
const worldScene=read('world-scene.js');
const routeLifecycle=read('routing/route-lifecycle.js');

// R8 policy boundary: world-streaming decides WHEN; individual services decide HOW.
assert.match(worldStreaming,/unified world streaming policy/);
assert.match(worldStreaming,/Owns WHEN visible services refresh and WHEN route-ahead caches prefetch/);
assert.match(worldStreaming,/export function createWorldStreaming\s*\(/);

// R8 scheduler boundary: periodic prepared refreshes wrap the proven synchronous P9.13 base.
assert.match(coordinator,/createStreamingCoordinator as createStreamingCoordinatorP913/);
assert.match(coordinator,/Periodic refreshes use the incremental local-world builder/);
assert.match(coordinator,/forced boot\/route\/reset refreshes keep the proven P9\.13 synchronous path/);
assert.match(coordinatorP913,/export function createStreamingCoordinator\s*\(/);

// Local-world preparation is a deliberate layered chain: P9.37/38 -> P9.26 -> P9.25.
assert.match(builder,/createLocalWorldBuilder as createLocalWorldBuilderP926/);
assert.match(builderP926,/createLocalWorldBuilder as createLocalWorldBuilderP925/);
assert.match(builderP925,/export function createLocalWorldBuilder\s*\(/);
assert.match(builder,/road-transition/);
assert.match(builderP926,/rebuildHorizonIncremental/);

// Terrain is likewise layered: P9.27 transition -> P9.26 horizon -> P9.25 near-ground/road-bed base.
assert.match(terrain,/createTerrainService as createTerrainServiceP926/);
assert.match(terrainP926,/createTerrainService as createTerrainServiceP925/);
assert.match(terrainP925,/export function createTerrainService\s*\(/);
assert.match(terrain,/P927_TRANSITION_BUDGET_MS/);
assert.match(terrainP926,/P926_HORIZON_BUDGET_MS/);

// Imagery remains separate satellite geometry over the procedural/terrain underlay.
assert.match(imagery,/createImageryService as createImageryServiceP913/);
assert.match(imagery,/export function createImageryService\s*\(/);
assert.match(imageryP913,/satellite-terrain-chunks/);
assert.match(imageryP913,/function invalidateGeometry\s*\(/);

// Elevation and static scene composition remain separate owners.
assert.match(elevation,/export function createElevationService\s*\(/);
assert.match(worldScene,/export function createWorldScene\s*\(/);

// Route startup still commits through the forced/synchronous local-world path.
// This matters for issue #2: P9.27 is not assumed to own the initial boot commit.
assert.match(routeLifecycle,/commitLocalWorldRefresh\(\)/);

// Historical V21.21/V21.25 streaming scripts are intentionally not authoritative here.
// R8 baseline coverage is supplied by current P9.17-P9.27 tests in its focused workflow.

console.log('R8 CURRENT OWNERSHIP BASELINE: PASS',{
  policy:'world-streaming',
  scheduler:'streaming-coordinator -> P9.13 sync base',
  localWorld:'local-world-builder -> P9.26 -> P9.25',
  terrain:'terrain P9.27 -> P9.26 -> P9.25',
  imagery:'imagery -> P9.13 satellite chunks',
  startup:'forced synchronous local-world commit'
});
