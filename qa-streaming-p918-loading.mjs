import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createStreamingCoordinator} from './src/streaming-coordinator.js';

const imagerySource=fs.readFileSync(new URL('./src/imagery.js',import.meta.url),'utf8');
assert.match(imagerySource,/p918PrefetchTilesPerProbe\s*:\s*1/,
  'P9.18 one-tile route-ahead imagery prefetch missing');
assert.match(imagerySource,/service\.loadTile\(tile\.x,tile\.y\)/,
  'P9.18 prefetch must warm only the centre tile');

let runtime={
  gameStarted:true,menuOpen:false,speed:25,
  absX:0,absZ:0,heading:0,worldOffset:{x:0,z:0}
};
let imageryGuards=0;
const imagery={
  enabled:true,center:{x:0,z:0},loading:false,
  prefetchAt:()=>Promise.resolve(true),
  deferCommits(){imageryGuards++;},
  shiftOrigin(){},realignToOrigin(){},invalidateGeometry(){},diagnostics:()=>({})
};
const elevation={center:{x:0,z:0},loading:false,prefetchAt:()=>Promise.resolve(true)};
const noop={center:{x:0,z:0},loading:false,prefetchAt:()=>Promise.resolve(true)};

const coordinator=createStreamingCoordinator({
  createWorldStreaming:()=>({prefetchDirectional(){},reset(){},setDistanceScale(){},preloadRoute(){}}),
  toLatLon:()=>({lat:0,lon:0}),
  nearestRoute:()=>({cum:1000,angle:0}),
  routePointAtCum:cum=>({x:cum,z:0,angle:0}),
  routePointAtFraction:()=>({x:0,z:0}),
  getRouteLength:()=>20000,getRoutePointCount:()=>100,
  elevationService:elevation,
  waterData:{...noop,generation:0},
  sceneryData:{...noop,query:()=>''},
  imageryService:imagery,
  getRoadMetadataState:()=>({center:{x:0,z:0},loading:false}),
  signData:{...noop,query:()=>''},
  loadElevationAround:()=>Promise.resolve(),loadWaterAround:()=>Promise.resolve(),
  loadSceneryAround:()=>Promise.resolve(),buildImageryMosaic:()=>Promise.resolve(true),
  loadRoadMetadataAround:()=>Promise.resolve(),loadGeographicSignsAround:()=>Promise.resolve(),
  fetchCached:()=>Promise.resolve(),streamedWorldGroups:[],
  ground:{position:{x:0,z:0}},
  terrainService:{shiftRoadBedOrigin(){},resetRoadBedOrigin(){}},
  camera:{position:{x:0,z:0}},camTarget:{x:0,z:0},car:{position:{x:0,z:0}},
  resetStreamedWorldOrigins(){},rebuildLocalWorld(){},applyImageryToGround(){},
  markStaticShadowsDirty(){},getRuntimeState:()=>runtime,
  setWorldOffset:value=>{runtime={...runtime,worldOffset:value};}
});

// A tab/debugger pause must back loading off briefly but never become the max
// gameplay frame or increment gameplay hitchCount.
coordinator.recordFrame(30167.4,1000);
let diag=coordinator.diagnostics();
assert.equal(diag.suspendedFrames,1);
assert.equal(diag.maxFrameMs,0);
assert.equal(diag.hitchCount,0);
assert.equal(imageryGuards,1);

// Non-driving/menu frames are ignored as well.
runtime={...runtime,menuOpen:true};
coordinator.recordFrame(80,1100);
runtime={...runtime,menuOpen:false};
diag=coordinator.diagnostics();
assert.equal(diag.ignoredNonDrivingFrames,1);
assert.equal(diag.maxFrameMs,0);

// Normal driving telemetry is retained.
coordinator.recordFrame(24,2000);
diag=coordinator.diagnostics();
assert.equal(diag.maxFrameMs,24);
assert.equal(diag.hitchCount,1);
assert.equal(diag.frameBins.over16_7Ms,1);
assert.equal(diag.frameBins.over25Ms,0);

console.log('Streaming P9.18 loading QA passed');
console.log({
  routeAheadImageryTilesPerProbe:1,
  suspendedFrames:diag.suspendedFrames,
  ignoredNonDrivingFrames:diag.ignoredNonDrivingFrames,
  maxGameplayFrameMs:diag.maxFrameMs,
  gameplayHitches:diag.hitchCount,
  imageryCommitGuards:imageryGuards
});
