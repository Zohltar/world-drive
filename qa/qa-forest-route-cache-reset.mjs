import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRouteLifecycle} from '../src/route-lifecycle.js';

let forestCacheClears=0;
let ordinarySceneryClears=0;
const clearOrder=[];
const state={
  autopilot:false,
  gameStarted:false,
  routeStart:{lat:0,lon:0},
  routeEnd:{lat:1,lon:1},
  routeWaypoints:[]
};

const route=[];
const segments=[];
const noop=()=>{};
const textNode={textContent:''};

const lifecycle=createRouteLifecycle({
  version:'qa',
  getState:()=>state,
  setState:patch=>Object.assign(state,patch),
  validLatLon:()=>true,
  geoDist:()=>1000,
  toast:noop,
  setAutopilot:noop,
  resetStreamingCoordinator:noop,
  waterData:{reset:noop},
  skidMarks:{clear:noop},
  route,
  segments,
  bridgeManager:{reset:noop,resetCounter:noop},
  bridgeStatus:textNode,
  waterRenderer:{clear:noop},
  sceneryData:{reset:noop},
  elevationService:{reset:noop},
  imageryService:{reset:noop,enabled:false},
  signData:{reset:noop},
  resetMinimapSignReadout:noop,
  signStatus:textNode,
  updateRoadMetaHUD:noop,
  clearActiveRoadProfile:noop,
  terrainService:{clearRoadBed:noop,clearHorizon:noop},
  clearGroup:group=>clearOrder.push(group),
  roadGroup:'road',
  forestGroup:'forest',
  infrastructureGroup:'infra',
  signGroup:'sign',
  sceneryRenderer:{
    clearForestCache(){forestCacheClears++;clearOrder.push('forest-cache');},
    clear(){ordinarySceneryClears++;clearOrder.push('scenery-clear');}
  },
  resetRunChallenge:noop,
  loading:{classList:{add:noop,remove:noop}},
  loadingText:textNode,
  routingStatus:textNode,
  statusEl:textNode,
  setBootProgress:noop,
  routingService:{fetchRoute:async()=>({coordinates:[[0,0],[.01,.01]],provider:'qa'})},
  toWorld:(lat,lon)=>({x:lon*1000,z:lat*1000}),
  prepMap:noop,
  placeAt:noop,
  loadWaterAround:async()=>({ok:true}),
  preloadRoute:noop,
  loadElevationAround:async()=>true,
  primeInitialTerrainPreloadBuffer:async()=>{},
  buildImageryMosaic:async()=>{},
  onElevationFallback:noop,
  onImageryFallback:noop,
  promiseWithTimeout:async promise=>promise,
  hasPendingWorld:()=>false,
  cancelVisualJob:noop,
  commitLocalWorldRefresh:noop,
  prefetchRouteAhead:noop,
  loadSceneryAround:async()=>{},
  onSceneryUnavailable:noop,
  loadRoadMetadataAround:async()=>{},
  loadGeographicSignsAround:async()=>{}
});

lifecycle.resetWorldCaches();
assert.equal(forestCacheClears,1,'route reset must purge persistent forest cache exactly once');
assert.equal(ordinarySceneryClears,1,'ordinary scenery clear must still run');
assert.ok(
  clearOrder.indexOf('forest-cache')<clearOrder.indexOf('forest'),
  'forest streamer cache must be purged before legacy forestGroup cleanup'
);

const scenerySource=fs.readFileSync('./src/scenery/scenery-renderer-p9.js','utf8');
assert.match(scenerySource,/function clearForestCache\(\)/,'scenery renderer must expose a route-change forest purge');
assert.match(scenerySource,/forestStreamer\.setAssets\(null\);[\s\S]*forestStreamer\.clearAll\(\);/,'route purge must suspend the streamer and clear its active/LRU state');
assert.match(scenerySource,/forestAssetsActivated=false;/,'forest assets must be reactivated only after the new route rebuild');

console.log('Forest route-cache reset QA passed');
console.log({
  forestCacheClears,
  ordinarySceneryClears,
  purgeBeforeForestGroupClear:true,
  streamerSuspendedDuringRouteSwap:true
});
