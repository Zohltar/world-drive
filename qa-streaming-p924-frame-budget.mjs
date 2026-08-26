import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createStreamingCoordinator} from './src/streaming-coordinator.js';

const localWorld=fs.readFileSync(
  new URL('./src/local-world-builder.js',import.meta.url),'utf8'
);
const coordinatorSource=fs.readFileSync(
  new URL('./src/streaming-coordinator.js',import.meta.url),'utf8'
);

assert.match(localWorld,/P924_PREP_BUDGET_MS\s*=\s*1\.15/,
  'P9.24 terrain slice budget must stay at 1.15 ms');
assert.match(localWorld,/P924_PREP_GAP_MS\s*=\s*8/,
  'P9.24 preparation slices must be frame-spaced');
assert.match(localWorld,/setTimeout\(dispatch,P924_PREP_GAP_MS\)/,
  'P9.24 must prevent back-to-back idle slices in one frame window');
assert.match(localWorld,/scheduleVisualJob\('bridge-furniture'/,
  'bridge furniture must be deferred off the prepared commit frame');
assert.match(localWorld,/scheduleVisualJob\('road-signs'/,
  'road signs must be deferred off the prepared commit frame');
assert.match(coordinatorSource,/PREPARED_START_QUIET_MS\s*=\s*160/,
  'P9.24 moving preparation quiet window missing');

let runtime={
  gameStarted:true,
  menuOpen:false,
  speed:28,
  absX:1600,
  absZ:0,
  heading:0,
  worldOffset:{x:1600,z:0}
};
let prepareCalls=0;
let commitCalls=0;
let legacyRebuilds=0;

const imagery={
  enabled:true,
  center:{x:0,z:0},
  loading:false,
  prefetchAt:()=>Promise.resolve(true),
  deferCommits(){},
  shiftOrigin(){},
  realignToOrigin(){},
  invalidateGeometry(){},
  diagnostics:()=>({})
};
const elevation={center:{x:0,z:0},loading:false,prefetchAt:()=>Promise.resolve(true)};
const noop={center:{x:0,z:0},loading:false,prefetchAt:()=>Promise.resolve(true)};

const coordinator=createStreamingCoordinator({
  createWorldStreaming:()=>({
    prefetchDirectional(){},reset(){},setDistanceScale(){},preloadRoute(){}
  }),
  toLatLon:()=>({lat:0,lon:0}),
  nearestRoute:()=>({cum:1000,angle:0}),
  routePointAtCum:cum=>({x:cum,z:0,angle:0}),
  routePointAtFraction:()=>({x:0,z:0}),
  getRouteLength:()=>20000,
  getRoutePointCount:()=>100,
  elevationService:elevation,
  waterData:{...noop,generation:0},
  sceneryData:{...noop,query:()=>''},
  imageryService:imagery,
  getRoadMetadataState:()=>({center:{x:0,z:0},loading:false}),
  signData:{...noop,query:()=>''},
  loadElevationAround:()=>Promise.resolve(),
  loadWaterAround:()=>Promise.resolve(),
  loadSceneryAround:()=>Promise.resolve(),
  buildImageryMosaic:()=>Promise.resolve(true),
  loadRoadMetadataAround:()=>Promise.resolve(),
  loadGeographicSignsAround:()=>Promise.resolve(),
  fetchCached:()=>Promise.resolve(),
  streamedWorldGroups:[],
  ground:{position:{x:0,z:0}},
  terrainService:{shiftRoadBedOrigin(){},resetRoadBedOrigin(){}},
  camera:{position:{x:0,z:0}},
  camTarget:{x:0,z:0},
  car:{position:{x:0,z:0}},
  resetStreamedWorldOrigins(){},
  rebuildLocalWorld(){legacyRebuilds++;},
  prepareLocalWorld:async()=>{
    prepareCalls++;
    return {offset:{...runtime.worldOffset},meta:{preparedOffset:{...runtime.worldOffset}}};
  },
  commitPreparedLocalWorld:()=>{
    commitCalls++;
    return {
      totalMs:2,
      profilePoints:10,
      terrainProfilePoints:5,
      phases:{resetClear:.2,roadProfile:.1,terrainRoadBed:.2,roadMeshes:.5,water:.2,furniture:.1,finalize:.1},
      terrain:null,
      p923:{groundCommitMs:.1}
    };
  },
  cancelLocalWorldPreparation(){},
  applyImageryToGround(){},
  markStaticShadowsDirty(){},
  getRuntimeState:()=>runtime,
  setWorldOffset:value=>{runtime={...runtime,worldOffset:value};}
});

// The old scheduler refused a non-urgent refresh while speed was above calmSpeed.
// P9.24 must begin the cheap prepared path at ordinary driving speed as soon as
// the normal hard refresh distance is reached and the short quiet window exists.
coordinator.state.lastHitchAt=0;
coordinator.markWorldRefresh('recenter');
assert.equal(coordinator.scheduleWorldRefresh({urgent:false}),true,
  'P9.24 did not schedule preparation while moving');

await new Promise(resolve=>setTimeout(resolve,230));

const diag=coordinator.diagnostics();
assert.equal(prepareCalls,1,'moving prepared refresh did not start');
assert.equal(commitCalls,1,'moving prepared refresh did not commit');
assert.equal(legacyRebuilds,0,'moving prepared refresh fell back to legacy rebuild');
assert.equal(diag.p923.preparedCommits,1);
assert.equal(diag.p923.p924PreparedStartQuietMs,160);

console.log('Streaming P9.24 frame-budget QA passed');
console.log({
  sliceBudgetMs:1.15,
  sliceGapMs:8,
  preparedStartQuietMs:diag.p923.p924PreparedStartQuietMs,
  movingSpeedMps:runtime.speed,
  prepareCalls,
  commitCalls,
  legacyRebuilds
});
