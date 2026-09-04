import assert from 'node:assert/strict';
import fs from 'node:fs';

const terrain=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');
const terrainP925=fs.readFileSync(new URL('../src/terrain-p925.js',import.meta.url),'utf8');
const builder=fs.readFileSync(new URL('../src/local-world-builder.js',import.meta.url),'utf8');

// P9.27's state-only road install remains protected because prepared local-world
// refreshes still need to install authoritative road-bed state without forcing
// a second synchronous ground commit. Only the retired presentation worker is
// removed from normal runtime ownership in Block 3.
assert.match(terrain,/createTerrainServiceP926/,
  'P9.27 must preserve the P9.26 horizon service');
assert.match(terrain,/function setRoadBedStateOnly\(/,
  'P9.27 state-only road install missing');
assert.match(terrain,/forcedOffset=\{x:\(real\.x\|\|0\)\+10000000/,
  'P9.27 state-only install bypass offset changed');
assert.match(terrain,/p927Diagnostics/,
  'P9.27 diagnostics missing');
assert.match(terrain,/stateOnlyInstalls/,
  'P9.27 state-only install diagnostics missing');

// Historical transition implementation remains available for rollback/reference
// until Block 3 is fully certified, but the P9.25 entry point returns before any
// visual allocation and the prepared builder no longer schedules it.
assert.match(terrainP925,/function rebuildRoadBedVisual\(/,
  'Historical road-transition implementation unexpectedly disappeared');
assert.match(
  terrainP925,
  /function rebuildRoadBedVisual\(\)\{[\s\S]*?if\(activeRoadProfile\.length<2\)\{[\s\S]*?return false;[\s\S]*?\}[\s\S]*?return true;[\s\S]*?const offset=getWorldOffset\(\);/,
  'P9.25 transition retirement guard missing'
);
assert.match(terrain,/function prepareRoadTransitionIncremental\(/,
  'Historical P9.27 incremental transition helper unexpectedly disappeared');
assert.match(terrain,/function commitPreparedRoadTransition\(/,
  'Historical P9.27 commit helper unexpectedly disappeared');

assert.match(builder,/createLocalWorldBuilderP926/,
  'P9.27 must preserve the P9.26 local-world wrapper');
assert.match(builder,/terrainProxy\.setRoadBed/,
  'P9.27 builder terrain proxy missing');
assert.match(builder,/setRoadBedStateOnly/,
  'P9.27 incremental builder does not use state-only install');
assert.doesNotMatch(builder,/scheduleVisualJob\?\.\(\s*'road-transition'/,
  'Block 3 must not schedule retired P9.27 transition construction');
assert.match(builder,/p927RoadTransition/,
  'P9.27 diagnostics are not exposed through local-world diagnostics');

console.log('Streaming P9.27 retired road-transition compatibility QA passed');
console.log({
  stateOnlyRoadInstall:true,
  preparedTransitionScheduled:false,
  synchronousTransitionAllocated:false,
  historicalHelpersRetained:true,
  diagnosticsRetained:true
});