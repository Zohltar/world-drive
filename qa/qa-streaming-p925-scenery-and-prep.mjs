import assert from 'node:assert/strict';
import fs from 'node:fs';

const localWorld=fs.readFileSync(
  new URL('../src/local-world-builder-p925.js',import.meta.url),'utf8'
);
const coordinator=fs.readFileSync(
  new URL('../src/streaming-coordinator.js',import.meta.url),'utf8'
);

assert.match(localWorld,/const P924_PREP_BUDGET_MS=1\.15/,
  'P9.25 must preserve the proven 1.15 ms preparation budget');
assert.match(localWorld,/const P924_PREP_GAP_MS=8/,
  'P9.25 must preserve the 8 ms inter-slice gap');
assert.match(localWorld,/const dispatch=\(\)=>callback\(\{didTimeout:true,timeRemaining:\(\)=>0\}\)/,
  'P9.25 direct timer dispatch missing');
const prepScheduler=localWorld.slice(
  localWorld.indexOf('function schedulePreparationSlice'),
  localWorld.indexOf('export function createLocalWorldBuilder')
);
const prepSchedulerCode=prepScheduler.replace(/\/\/.*$/gm,'');
assert.doesNotMatch(
  prepSchedulerCode,
  /requestIdleCallback\s*\(/,
  'P9.25 preparation slices must not wait on requestIdleCallback'
);
assert.match(localWorld,/function refreshSceneryOnly\(\)/,
  'P9.25 scenery-only builder path missing');
assert.match(localWorld,/scheduleVisualJob\('scenery',rebuildLocalScenery,140\)/,
  'P9.25 scenery-only path must remain deferred');

assert.match(coordinator,/function markWorldRefresh\(reason='stream'\)/,
  'P9.25 coordinator refresh classifier missing');
assert.match(coordinator,/if\(reason==='scenery'\)/,
  'P9.25 scenery reason bypass missing');
assert.match(coordinator,/builder\.refreshSceneryOnly\(\)/,
  'P9.25 scenery reason does not call the lightweight builder path');
assert.match(coordinator,/markWorldRefresh,/,
  'P9.25 wrapper must expose its classified markWorldRefresh');
assert.match(coordinator,/p925SceneryBypass:true/,
  'P9.25 scenery bypass diagnostics missing');

const GAP_MS=8;
const stamps=[];
await new Promise(resolve=>{
  const step=()=>{
    stamps.push(performance.now());
    if(stamps.length>=12){resolve();return;}
    setTimeout(step,GAP_MS);
  };
  setTimeout(step,GAP_MS);
});
const wall=stamps.at(-1)-stamps[0];
assert.ok(wall<500,
  `direct preparation timer unexpectedly slow: ${wall.toFixed(1)} ms for 11 gaps`);

console.log('Streaming P9.25 scenery/preparation QA passed');
console.log({
  preparationBudgetMs:1.15,
  preparationGapMs:8,
  directTimer:true,
  sceneryBypassesWorldTerrain:true,
  timerSmokeWallMs:Number(wall.toFixed(3))
});
