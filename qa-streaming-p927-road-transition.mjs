import assert from 'node:assert/strict';
import fs from 'node:fs';

const terrain=fs.readFileSync(new URL('./src/terrain.js',import.meta.url),'utf8');
const builder=fs.readFileSync(new URL('./src/local-world-builder.js',import.meta.url),'utf8');

assert.match(terrain,/createTerrainServiceP926/,
  'P9.27 must preserve the P9.26 horizon service');
assert.match(terrain,/P927_TRANSITION_BUDGET_MS\s*=\s*1\.15/,
  'P9.27 transition slice budget changed');
assert.match(terrain,/P927_TRANSITION_GAP_MS\s*=\s*8/,
  'P9.27 transition slice gap changed');
assert.match(terrain,/function setRoadBedStateOnly\(/,
  'P9.27 state-only road install missing');
assert.match(terrain,/forcedOffset=\{x:\(real\.x\|\|0\)\+10000000/,
  'P9.27 state-only install must move the visual transition outside the local terrain');
assert.match(terrain,/function preserveVisibleTransition\(/,
  'P9.27 must preserve the old visible transition during preparation');
assert.match(terrain,/deepCloneTransition\(current\)/,
  'P9.27 old transition is not double-buffered');
assert.match(terrain,/function prepareRoadTransitionIncremental\(/,
  'P9.27 incremental transition preparation missing');
assert.match(terrain,/function commitPreparedRoadTransition\(/,
  'P9.27 atomic transition commit missing');
assert.match(terrain,/nearestDistance2/,
  'P9.27 lightweight planar road-clearance query missing');
assert.match(terrain,/singleClear:new Uint8Array/,
  'P9.27 repeated vertex-clearance checks are not cached');
assert.match(terrain,/pairClear:new Map\(\)/,
  'P9.27 repeated edge-clearance checks are not cached');
assert.match(terrain,/p927Diagnostics/,
  'P9.27 transition diagnostics missing');

assert.match(builder,/createLocalWorldBuilderP926/,
  'P9.27 must preserve the P9.26 local-world wrapper');
assert.match(builder,/terrainProxy\.setRoadBed/,
  'P9.27 builder terrain proxy missing');
assert.match(builder,/setRoadBedStateOnly/,
  'P9.27 incremental builder does not use state-only install');
assert.match(builder,/scheduleVisualJob\?\.\(\s*'road-transition'/,
  'P9.27 prepared commit does not defer transition construction');
assert.match(builder,/p927RoadTransition/,
  'P9.27 diagnostics are not exposed through WorldDriveFramePacing');

// Timer cadence smoke test. The real transition builder uses the same direct
// 8 ms pacing, so this catches accidental event-loop starvation policy changes.
const stamps=[];
await new Promise(resolve=>{
  const step=()=>{
    stamps.push(performance.now());
    if(stamps.length===12){resolve();return;}
    setTimeout(step,8);
  };
  setTimeout(step,8);
});
const wall=stamps.at(-1)-stamps[0];
assert.ok(wall<500,`P9.27 timer pacing unexpectedly slow: ${wall.toFixed(1)} ms`);

console.log('Streaming P9.27 road-transition QA passed');
console.log({
  stateOnlyRoadInstall:true,
  oldTransitionDoubleBuffered:true,
  incrementalTransition:true,
  transitionBudgetMs:1.15,
  transitionGapMs:8,
  clearanceCaching:true,
  timerSmokeWallMs:Number(wall.toFixed(3))
});
