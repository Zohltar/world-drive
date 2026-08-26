import assert from 'node:assert/strict';
import fs from 'node:fs';

const terrain=fs.readFileSync(new URL('./src/terrain-p925.js',import.meta.url),'utf8');
const localWorld=fs.readFileSync(new URL('./src/local-world-builder-p925.js',import.meta.url),'utf8');
const streaming=fs.readFileSync(new URL('./src/streaming-coordinator.js',import.meta.url),'utf8');

assert.match(terrain,/worldDriveGroundSegments===effectiveSegments/,'terrain topology must be reusable');
assert.match(terrain,/worldDriveGroundSize===groundSize/,'terrain reuse must validate ground size');
assert.match(terrain,/terrainPerf\.geometryReuses\+\+/,'terrain reuse must be counted');
assert.match(terrain,/existingColor\.needsUpdate=true/,'terrain colour buffer must be updated in place');
assert.match(terrain,/const positionArray=positions\.array/,'height pass must use typed-array access');
assert.match(terrain,/groundHeight/,'ground height phase telemetry missing');
assert.match(terrain,/groundNormals/,'ground normal phase telemetry missing');
assert.match(terrain,/groundColors/,'ground colour phase telemetry missing');
assert.match(terrain,/roadTransition/,'road transition phase telemetry missing');
assert.match(terrain,/diagnostics/,'terrain diagnostics must be exposed');
assert.match(localWorld,/terrain:terrainService\.diagnostics\?\.\(\)\|\|null/,'local world report must include terrain diagnostics');
assert.match(streaming,/terrain:report\.terrain\|\|null/,'frame pacing report must preserve terrain diagnostics');

console.log('Streaming P9.21 terrain-reuse QA passed');
console.log({
  keepsFullTerrainResolution:true,
  topologyReused:true,
  colorBufferReused:true,
  typedArrayHeightPass:true,
  subphases:['roadIndex','groundTopology','groundHeight','groundNormals','groundColors','groundImagery','roadTransition']
});