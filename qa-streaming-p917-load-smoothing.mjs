import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createStreamingCoordinator} from './src/streaming-coordinator.js';

const imagerySource=fs.readFileSync(new URL('./src/imagery.js',import.meta.url),'utf8');
const mainSource=fs.readFileSync(new URL('./src/main.js',import.meta.url),'utf8');

assert.match(mainSource,/chunkSegments\s*:\s*96/,
  'QA baseline changed: satellite chunk resolution is no longer 96');
assert.match(imagerySource,/fastRenderedGroundHeight/,
  'P9.17 fast live-ground imagery sampler missing');
assert.match(imagerySource,/fx\+fz<=1/,
  'P9.17 sampler must match PlaneGeometry triangle interpolation');
assert.match(imagerySource,/PREFETCH_COOLDOWN_MS\s*=\s*420/,
  'P9.17 satellite prefetch cooldown missing');
assert.match(imagerySource,/prefetchBusy\|\|/,
  'P9.17 satellite prefetch serialization missing');

let runtime={
  gameStarted:true,
  menuOpen:false,
  speed:25,
  absX:0,
  absZ:0,
  heading:0,
  worldOffset:{x:0,z:0}
};
let directionalPrefetches=0;
let imageryGuards=0;
let elevationPrefetches=0;

const imagery={
  enabled:true,
  center:{x:0,z:0},
  loading:false,
  prefetchAt:()=>Promise.resolve(true),
  deferCommits(){imageryGuards++;},
  shiftOrigin(){},
  realignToOrigin(){},
  invalidateGeometry(){},
  diagnostics:()=>({})
};
const elevation={
  center:{x:0,z:0},
  loading:false,
  prefetchAt(){elevationPrefetches++;return Promise.resolve(true);}
};
const noopService={center:{x:0,z:0},loading:false,prefetchAt:()=>Promise.resolve(true)};
const water={...noopService,generation:0};
const scenery={...noopService,query:()=>''};
const signs={...noopService,query:()=>''};

const coordinator=createStreamingCoordinator({
  createWorldStreaming:()=>({
    prefetchDirectional(){directionalPrefetches++;},
    reset(){},
    setDistanceScale(){},
    preloadRoute(){}
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
  rebuildLocalWorld(){},
  applyImageryToGround(){},
  markStaticShadowsDirty(){},
  getRuntimeState:()=>runtime,
  setWorldOffset:value=>{runtime={...runtime,worldOffset:value};}
});

assert.ok(coordinator.policy.quietWindowMs>=420,
  'P9.17 world-refresh quiet window not applied');
assert.ok(coordinator.policy.imageryRefreshCooldownMs>=2200,
  'P9.17 imagery refresh cooldown not applied');

coordinator.recordFrame(16,1000);
assert.equal(imageryGuards,1,
  'a 16 ms frame must defer satellite commits');
assert.equal(coordinator.updateFrame(1200),false,
  'background streaming must back off immediately after a slow frame');
assert.equal(directionalPrefetches,0,
  'directional prefetch ran inside the adaptive cooldown');

coordinator.updateFrame(1500);
assert.equal(directionalPrefetches,1,
  'background streaming did not resume after the adaptive cooldown');

const diag=coordinator.diagnostics();
assert.equal(diag.p917.hitchFrameMs,12);
assert.equal(diag.p917.backgroundCooldownMs,460);
assert.ok(diag.p917.adaptiveDeferrals>=1);

console.log('Streaming P9.17 load-smoothing QA passed');
console.log({
  satelliteChunkSegments:96,
  samplesPerSatelliteChunk:(96+1)**2,
  hitchFrameMs:diag.p917.hitchFrameMs,
  backgroundCooldownMs:diag.p917.backgroundCooldownMs,
  imageryCommitGuards:imageryGuards,
  adaptiveDeferrals:diag.p917.adaptiveDeferrals,
  directionalPrefetches,
  elevationPrefetches
});
