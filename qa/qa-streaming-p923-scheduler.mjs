import assert from 'node:assert/strict';
import {createStreamingCoordinator} from '../src/streaming-coordinator.js';

let runtime={
  gameStarted:true,
  menuOpen:false,
  speed:0,
  absX:1600,
  absZ:0,
  heading:0,
  worldOffset:{x:1600,z:0}
};
let prepareCalls=0;
let commitCalls=0;
let legacyRebuilds=0;
let cancelCalls=0;

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
const elevation={
  center:{x:0,z:0},loading:false,
  prefetchAt:()=>Promise.resolve(true)
};
const noopService={center:{x:0,z:0},loading:false,prefetchAt:()=>Promise.resolve(true)};
const water={...noopService,generation:0};
const scenery={...noopService,query:()=>''};
const signs={...noopService,query:()=>''};

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
  waterData:water,
  sceneryData:scenery,
  imageryService:imagery,
  getRoadMetadataState:()=>({center:{x:0,z:0},loading:false}),
  signData:signs,
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
  rebuildLocalWorld(){legacyRebuilds++;return {totalMs:99,profilePoints:2,phases:{terrainRoadBed:90}};},
  prepareLocalWorld:async()=>{
    prepareCalls++;
    return {
      offset:{...runtime.worldOffset},
      meta:{preparedOffset:{...runtime.worldOffset}}
    };
  },
  commitPreparedLocalWorld:prepared=>{
    commitCalls++;
    assert.deepEqual(prepared.offset,runtime.worldOffset);
    return {
      totalMs:5,
      profilePoints:20,
      terrainProfilePoints:10,
      phases:{
        resetClear:1,
        roadProfile:.2,
        terrainRoadBed:.8,
        roadMeshes:1,
        water:.5,
        furniture:1,
        finalize:.5
      },
      terrain:{mock:true},
      p923:{groundCommitMs:.4}
    };
  },
  cancelLocalWorldPreparation(){cancelCalls++;},
  applyImageryToGround(){},
  markStaticShadowsDirty(){},
  getRuntimeState:()=>runtime,
  setWorldOffset:value=>{runtime={...runtime,worldOffset:value};}
});

assert.equal(coordinator.diagnostics().p923.enabled,true,
  'P9.23 prepared path did not enable');
coordinator.state.lastHitchAt=-Infinity;
coordinator.markWorldRefresh('recenter');
assert.equal(coordinator.scheduleWorldRefresh({urgent:false}),true,
  'P9.23 prepared refresh did not schedule');

await new Promise(resolve=>setTimeout(resolve,240));

const diag=coordinator.diagnostics();
assert.equal(prepareCalls,1,'prepared world builder was not called exactly once');
assert.equal(commitCalls,1,'prepared world commit was not called exactly once');
assert.equal(legacyRebuilds,0,'periodic refresh fell back to synchronous legacy rebuild');
assert.equal(diag.p923.preparedStarts,1);
assert.equal(diag.p923.preparedCommits,1);
assert.equal(diag.p923.preparedFailures,0);
assert.equal(diag.p923.preparedDiscards,0);
assert.deepEqual(diag.p923.lastPreparedReasons,['recenter']);
assert.equal(diag.localWorldPhases.profilePoints,20);
assert.equal(diag.localWorldPhases.terrainProfilePoints,10);
assert.ok(diag.lastWorldBuildMs>=0);

// Forced recenter remains the proven synchronous path used by boot/route reset.
runtime={...runtime,absX:2200,worldOffset:{x:1600,z:0}};
coordinator.recenterIfNeeded(2200,0,true);
assert.equal(legacyRebuilds,1,'forced recenter must retain synchronous safety path');
assert.ok(cancelCalls>=1,'forced recenter did not cancel incremental preparation state');

console.log('Streaming P9.23 scheduler QA passed');
console.log({
  prepareCalls,
  commitCalls,
  legacyRebuilds,
  preparedCommits:diag.p923.preparedCommits,
  preparedFailures:diag.p923.preparedFailures,
  preparedDiscards:diag.p923.preparedDiscards,
  preparedCommitMs:Number(diag.p923.lastPreparedCommitMs.toFixed(3))
});
