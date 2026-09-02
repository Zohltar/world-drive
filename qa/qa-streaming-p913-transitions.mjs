import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createStreamingCoordinator} from '../src/streaming-coordinator.js';

const imagerySource=fs.readFileSync(new URL('../src/imagery/imagery-p913.js',import.meta.url),'utf8');
const coordinatorSource=fs.readFileSync(new URL('../src/streaming-coordinator-p913.js',import.meta.url),'utf8');

assert.ok(/texture\.generateMipmaps\s*=\s*false/.test(imagerySource),
  'streamed satellite chunks must not generate mipmaps during road transitions');
assert.ok(/if\s*\(changed\)\s*\{\s*groundMaterial\.needsUpdate\s*=\s*true\s*;/.test(imagerySource),
  'ground material updates must be conditional');
assert.ok(/coverageMoved\s*<\s*80/.test(imagerySource),
  'car-only movement should reprioritize imagery without rebuilding coverage');
assert.ok(/function\s+deferCommits\s*\(/.test(imagerySource),
  'imagery must expose a transition commit guard');
assert.ok(/const\s+recenterOnly\s*=\s*reasons\.length\s*===\s*1\s*&&\s*reasons\[0\]\s*===\s*['"]recenter['"]/.test(coordinatorSource),
  'coordinator must distinguish recenter-only world refreshes');
assert.ok(/if\s*\(!recenterOnly\)\s*\{\s*imageryService\.invalidateGeometry\?\.\(\)\s*;/.test(coordinatorSource),
  'recenter-only refresh must not rebuild every satellite geometry');
assert.ok(/imageryService\.deferCommits\?\.\(policy\.imageryCommitGuardMs\)/.test(coordinatorSource),
  'world rebuild must guard satellite texture commits');

let runtime={
  gameStarted:true,menuOpen:false,speed:22,
  absX:0,absZ:0,heading:0,worldOffset:{x:0,z:0}
};
let rebuilds=0,guards=0,mosaics=0;
const imagery={
  enabled:true,
  center:{x:0,z:0},
  loading:false,
  prefetchAt:()=>Promise.resolve(true),
  shiftOrigin(){},realignToOrigin(){},invalidateGeometry(){},
  deferCommits(){guards++;},
  diagnostics:()=>({})
};
const noopService={center:{x:0,z:0},loading:false,prefetchAt:()=>Promise.resolve(true)};
const water={...noopService,generation:0,prefetchAt:()=>Promise.resolve(true)};
const scenery={...noopService,query:()=>''};
const signs={...noopService,query:()=>''};
const coordinator=createStreamingCoordinator({
  createWorldStreaming:()=>({
    prefetchDirectional(){},reset(){},setDistanceScale(){}
  }),
  toLatLon:()=>({lat:0,lon:0}),
  nearestRoute:()=>({cum:0,angle:0}),
  routePointAtCum:()=>({x:0,z:0,angle:0}),
  routePointAtFraction:()=>({x:0,z:0}),
  getRouteLength:()=>10000,
  getRoutePointCount:()=>10,
  elevationService:noopService,
  waterData:water,
  sceneryData:scenery,
  imageryService:imagery,
  getRoadMetadataState:()=>({center:{x:0,z:0},loading:false}),
  signData:signs,
  loadElevationAround:()=>Promise.resolve(),
  loadWaterAround:()=>Promise.resolve(),
  loadSceneryAround:()=>Promise.resolve(),
  buildImageryMosaic:()=>{mosaics++;return Promise.resolve(true);},
  loadRoadMetadataAround:()=>Promise.resolve(),
  loadGeographicSignsAround:()=>Promise.resolve(),
  fetchCached:()=>Promise.resolve(),
  streamedWorldGroups:[],
  ground:{position:{x:0,z:0}},
  terrainService:{shiftRoadBedOrigin(){},resetRoadBedOrigin(){}},
  camera:{position:{x:0,z:0}},camTarget:{x:0,z:0},car:{position:{x:0,z:0}},
  resetStreamedWorldOrigins(){},
  rebuildLocalWorld(){rebuilds++;},
  applyImageryToGround(){},markStaticShadowsDirty(){},
  getRuntimeState:()=>runtime,
  setWorldOffset:value=>{runtime={...runtime,worldOffset:value};}
});

assert.ok(coordinator.policy.imageryPriorityRefreshDistance>=850,
  'imagery priority refresh distance regressed');
assert.ok(coordinator.policy.emergencyWorldRefreshDistance<2800,
  'emergency refresh must remain inside 5.6 km terrain half-width');

coordinator.markWorldRefresh('recenter');
coordinator.commitWorldRefresh();
assert.equal(rebuilds,1,'world refresh mock did not rebuild');
assert.ok(guards>=1,'world refresh did not guard imagery commits');

await new Promise(resolve=>setTimeout(resolve,30));
console.log('Streaming P9.13 transition QA passed');
console.log({
  imageryPriorityRefreshDistance:coordinator.policy.imageryPriorityRefreshDistance,
  urgentWorldRefreshDistance:coordinator.policy.urgentWorldRefreshDistance,
  emergencyWorldRefreshDistance:coordinator.policy.emergencyWorldRefreshDistance,
  rebuilds,
  imageryCommitGuards:guards,
  deferredMosaics:mosaics
});
process.exit(0);
