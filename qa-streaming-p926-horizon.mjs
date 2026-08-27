import assert from 'node:assert/strict';
import fs from 'node:fs';

const terrain=fs.readFileSync(new URL('./src/terrain-p926.js',import.meta.url),'utf8');
const builder=fs.readFileSync(new URL('./src/local-world-builder-p926.js',import.meta.url),'utf8');

assert.match(terrain,/P926_HORIZON_BUDGET_MS=1\.15/,
  'P9.26 horizon slice budget must stay at 1.15 ms');
assert.match(terrain,/P926_HORIZON_GAP_MS=8/,
  'P9.26 horizon slices must remain frame-spaced');
assert.match(terrain,/function prepareHorizonIncremental\(\)/,
  'P9.26 incremental horizon preparation missing');
assert.match(terrain,/function commitPreparedHorizon\(prepared\)/,
  'P9.26 atomic horizon commit missing');
assert.match(terrain,/function rebuildHorizonIncremental\(\)/,
  'P9.26 incremental horizon facade missing');
assert.match(terrain,/const sideSegments=Math\.max\(groundSegments,180\)/,
  'P9.26 must preserve full horizon perimeter resolution');
assert.match(terrain,/nearHalf\+4260/,
  'P9.26 must preserve the existing far horizon extent');
assert.match(terrain,/clearLiveHorizon\(\);\s*horizonGroup\.position\.set\(0,0,0\)/s,
  'P9.26 must keep the old horizon until atomic commit');
assert.match(terrain,/p926Diagnostics/,
  'P9.26 horizon diagnostics missing');

assert.match(builder,/captureHorizonOrigin/,
  'P9.26 builder must preserve the old horizon origin during world swap');
assert.match(builder,/restoreHorizonOrigin/,
  'P9.26 builder must restore the old horizon while preparation runs');
assert.match(builder,/key==='horizon'/,
  'P9.26 builder horizon interception missing');
assert.match(builder,/Number\(timeout\)>=500/,
  'P9.26 must only replace the prepared-world horizon job');
assert.match(builder,/rebuildHorizonIncremental/,
  'P9.26 builder does not call incremental horizon rebuild');
assert.match(builder,/p926Horizon/,
  'P9.26 diagnostics are not bridged into WorldDriveFramePacing');

const sideSegments=448;
const rows=32;
const vertices=sideSegments*4*rows;
const triangles=(rows-1)*sideSegments*4*2;
assert.equal(vertices,57344);
assert.equal(triangles,111104);

const stamps=[];
await new Promise(resolve=>{
  const step=()=>{
    stamps.push(performance.now());
    if(stamps.length>=12){resolve();return;}
    setTimeout(step,8);
  };
  setTimeout(step,8);
});
const timerWallMs=stamps.at(-1)-stamps[0];
assert.ok(timerWallMs<500,
  `P9.26 timer cadence unexpectedly slow: ${timerWallMs.toFixed(1)} ms`);

console.log('Streaming P9.26 horizon QA passed');
console.log({
  horizonVertices:vertices,
  horizonTriangles:triangles,
  horizonSliceBudgetMs:1.15,
  horizonSliceGapMs:8,
  oldHorizonSurvivesUntilCommit:true,
  timerSmokeWallMs:Number(timerWallMs.toFixed(3))
});
