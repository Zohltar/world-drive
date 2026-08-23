import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','route-lifecycle.js');

assert.ok(fs.existsSync(modulePath),'src/route-lifecycle.js missing — run tools/refactor-main-route-lifecycle-v21-26.mjs first');

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
const lifecycle=fs.readFileSync(modulePath,'utf8').replace(/\r\n/g,'\n');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${path.basename(file)} syntax failed:\n${result.stderr||result.stdout}`);
}
syntaxCheck(mainPath);
syntaxCheck(modulePath);

assert.match(main,/import \{ createRouteLifecycle \} from '\.\/route-lifecycle\.js';/,'main.js missing route lifecycle import');
assert.match(main,/routeLifecycle=createRouteLifecycle\(\{/,'main.js missing route lifecycle initialization');
assert.match(main,/const WorldDrive=routeLifecycle\.worldDrive;/,'main.js missing WorldDrive compatibility facade');
assert.match(main,/function resetWorldCaches\(\)\{return routeLifecycle\.resetWorldCaches\(\);\}/,'main.js resetWorldCaches facade is not narrow');
assert.match(main,/async function createRequestedRoute\(start,end,waypoints=\[\]\)\{\s*return routeLifecycle\.createRequestedRoute\(start,end,waypoints\);\s*\}/s,'main.js createRequestedRoute facade is not narrow');
assert.match(main,/async function loadRoute\(\)\{return routeLifecycle\.loadRoute\(\);\}/,'main.js loadRoute facade is not narrow');

for(const pattern of [
  /loadingText\.textContent='Préchargement du terrain en avance…';/,
  /const WorldDrive=\{/,
  /route\.push\(\{x:p\.x,z:p\.z,lat,lon,cum\}\);/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns route lifecycle behavior: ${pattern}`);
  assert.match(lifecycle,pattern,`route-lifecycle.js missing extracted route behavior: ${pattern}`);
}

// The lifecycle now receives route preloading as an injected dependency.
// Validate the extracted call rather than the old main.js object-qualified spelling.
assert.doesNotMatch(main,/worldStreaming\.preloadRoute\(absX,absZ\);/,'main.js still owns direct route preload orchestration');
assert.match(lifecycle,/preloadRoute\(position\.absX,position\.absZ\);/,'route-lifecycle.js missing injected route preload orchestration');

for(const pattern of [
  /export function createRouteLifecycle\s*\(\{/,
  /function resetWorldCaches\(\)\{/,
  /async function loadRoute\(\)\{/,
  /async function createRequestedRoute\(start,end,waypoints=\[\]\)\{/,
  /worldDrive\.route\.generation\+\+;/,
  /worldDrive\.streaming\.generation\+\+;/,
  /loadWaterAround\(position\.absX,position\.absZ\)/,
  /await primeInitialTerrainPreloadBuffer\(\)\.catch\(\(\)=>\{\}\);/,
  /hasPendingWorld\(\)/,
  /prefetchRouteAhead\(\);/,
  /loadRoadMetadataAround\(position\.absX,position\.absZ\)\.catch\(\(\)=>\{\}\);/,
  /loadGeographicSignsAround\(position\.absX,position\.absZ\)\.catch\(\(\)=>\{\}\);/
]){
  assert.match(lifecycle,pattern,`route-lifecycle.js missing expected orchestration: ${pattern}`);
}

const lifecycleInit=main.indexOf('routeLifecycle=createRouteLifecycle({');
const drivingMarker=main.indexOf('// ---------- Driving ----------');
const plannerInit=main.indexOf('const routePlannerUi=createRoutePlannerUi({');
assert.ok(lifecycleInit>=0&&drivingMarker>lifecycleInit,'route lifecycle must initialize before the driving declarations that follow its old block');
assert.ok(plannerInit>lifecycleInit,'route lifecycle must initialize before route planner UI consumes createRequestedRoute');

const { createRouteLifecycle }=await import(`${pathToFileURL(modulePath).href}?qa=${Date.now()}`);
assert.equal(typeof createRouteLifecycle,'function','createRouteLifecycle export missing');

const state={
  autopilot:true,
  gameStarted:true,
  absX:10,
  absZ:20,
  speed:12,
  steer:.3,
  autopilotSteer:.2,
  routeStart:{lat:0,lon:0,name:'Old start'},
  routeEnd:{lat:0,lon:.5,name:'Old end'},
  routeWaypoints:[],
  origin:{lat:0,lon:0},
  routeLength:999,
  vehicleNearestHint:4,
  vehicleNearestLastX:1,
  vehicleNearestLastZ:2,
  currentRoadGuideSign:'old',
  activeRoadMeta:{surface:'gravel'},
  lastRoadMetaCenter:{x:1,z:2},
  roadMetaLoading:true
};
const getState=()=>state;
const setState=patch=>Object.assign(state,patch);
const calls=[];
const service=name=>({reset(){calls.push(`${name}.reset`);}});
const route=[{x:1,z:1}];
const segments=[{len:1}];
const bridgeStatus={textContent:'5'};
const signStatus={textContent:'8'};
const loadingText={textContent:''};
const routingStatus={textContent:''};
const statusEl={textContent:''};
const hidden=new Set();
const loading={classList:{
  add(value){hidden.add(value);calls.push(`loading.add:${value}`);},
  remove(value){hidden.delete(value);calls.push(`loading.remove:${value}`);}
}};

const controller=createRouteLifecycle({
  version:'21.26',
  getState,
  setState,
  validLatLon:(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon),
  geoDist:()=>1000,
  toast:text=>calls.push(`toast:${text}`),
  setAutopilot:(enabled,message)=>{state.autopilot=enabled;calls.push(`autopilot:${enabled}:${message}`);},
  resetStreamingCoordinator:()=>calls.push('streaming.reset'),
  waterData:service('waterData'),
  skidMarks:{clear(){calls.push('skidMarks.clear');}},
  route,
  segments,
  bridgeManager:{reset(){calls.push('bridgeManager.reset');},resetCounter(){calls.push('bridgeManager.resetCounter');}},
  bridgeStatus,
  waterRenderer:{clear(){calls.push('waterRenderer.clear');}},
  sceneryData:service('sceneryData'),
  elevationService:service('elevationService'),
  imageryService:{enabled:true,reset(){calls.push('imageryService.reset');}},
  signData:service('signData'),
  resetMinimapSignReadout:()=>calls.push('minimap.resetSignReadout'),
  signStatus,
  updateRoadMetaHUD:()=>calls.push('roadMeta.hud'),
  clearActiveRoadProfile:()=>calls.push('roadProfile.clear'),
  terrainService:{clearRoadBed(){calls.push('terrain.clearRoadBed');},clearHorizon(){calls.push('terrain.clearHorizon');}},
  clearGroup:group=>calls.push(`clearGroup:${group.name}`),
  roadGroup:{name:'road'},
  forestGroup:{name:'forest'},
  infrastructureGroup:{name:'infra'},
  signGroup:{name:'sign'},
  sceneryRenderer:{clear(){calls.push('sceneryRenderer.clear');}},
  resetRunChallenge:()=>calls.push('challenge.reset'),
  loading,
  loadingText,
  routingStatus,
  statusEl,
  setBootProgress:(...args)=>calls.push(`boot:${args.join(':')}`),
  routingService:{async fetchRoute({points,start}){
    calls.push(`routing.fetch:${points.length}:${start.name}`);
    return {provider:'QA router',coordinates:[[0,0],[.2,0],[.4,0]]};
  }},
  toWorld:(lat,lon)=>({x:lon*1000,z:lat*1000}),
  prepMap:()=>calls.push('map.prep'),
  placeAt:frac=>{calls.push(`placeAt:${frac}`);state.absX=100;state.absZ=200;},
  loadWaterAround:async(x,z)=>{calls.push(`hydro:${x}:${z}`);return true;},
  preloadRoute:(x,z)=>calls.push(`preloadRoute:${x}:${z}`),
  loadElevationAround:async(x,z)=>{calls.push(`elevation:${x}:${z}`);return true;},
  primeInitialTerrainPreloadBuffer:async()=>calls.push('terrain.prime'),
  buildImageryMosaic:async(x,z)=>calls.push(`imagery:${x}:${z}`),
  onElevationFallback:()=>calls.push('elevation.fallback'),
  onImageryFallback:()=>calls.push('imagery.fallback'),
  promiseWithTimeout:async promise=>promise,
  hasPendingWorld:()=>true,
  cancelVisualJob:key=>calls.push(`visual.cancel:${key}`),
  commitLocalWorldRefresh:()=>calls.push('world.commit'),
  prefetchRouteAhead:()=>calls.push('route.prefetch'),
  loadSceneryAround:async(x,z)=>{calls.push(`scenery:${x}:${z}`);return true;},
  onSceneryUnavailable:()=>calls.push('scenery.unavailable'),
  loadRoadMetadataAround:async(x,z)=>{calls.push(`roadmeta:${x}:${z}`);return true;},
  loadGeographicSignsAround:async(x,z)=>{calls.push(`signs:${x}:${z}`);return true;}
});

const start={lat:1,lon:2,name:'Start'};
const end={lat:3,lon:4,name:'End'};
const ok=await controller.createRequestedRoute(start,end,[{lat:2,lon:3,name:'Via'}]);
assert.equal(ok,true,'valid route creation should succeed');
assert.equal(controller.worldDrive.version,'21.26','WorldDrive version facade changed');
assert.equal(controller.worldDrive.route.generation,1,'route generation did not increment');
assert.equal(controller.worldDrive.streaming.generation,1,'streaming generation did not increment');
assert.equal(state.autopilot,false,'route creation did not disable autopilot');
assert.equal(state.speed,0,'route creation did not zero speed');
assert.equal(state.steer,0,'route creation did not zero steering');
assert.equal(state.autopilotSteer,0,'route creation did not zero autopilot steering');
assert.deepEqual(state.routeStart,start,'route start changed');
assert.deepEqual(state.routeEnd,end,'route end changed');
assert.equal(state.routeWaypoints.length,1,'waypoint forwarding changed');
assert.deepEqual(state.origin,{lat:1,lon:2},'route origin changed');
assert.equal(route.length,3,'route geometry point count changed');
assert.equal(segments.length,2,'route segment count changed');
assert.equal(state.routeLength,400,'route cumulative length changed');
assert.equal(routingStatus.textContent,'QA router','routing provider HUD changed');
assert.match(statusEl.textContent,/Trajet chargé · 0\.4 km · 3 points/,'route status HUD changed');
assert.equal(bridgeStatus.textContent,'0','bridge status was not reset');
assert.equal(signStatus.textContent,'0','sign status was not reset');
assert.ok(hidden.has('hidden'),'loading overlay was not hidden after successful route creation');

for(const expected of [
  'streaming.reset','waterData.reset','skidMarks.clear','bridgeManager.reset','waterRenderer.clear',
  'sceneryData.reset','elevationService.reset','imageryService.reset','bridgeManager.resetCounter',
  'signData.reset','minimap.resetSignReadout','roadMeta.hud','roadProfile.clear','terrain.clearRoadBed',
  'sceneryRenderer.clear','terrain.clearHorizon','map.prep','placeAt:0','hydro:100:200',
  'preloadRoute:100:200','elevation:100:200','terrain.prime','imagery:100:200',
  'visual.cancel:world-rebuild','world.commit','route.prefetch','scenery:100:200','roadmeta:100:200','signs:100:200'
]){
  assert.ok(calls.includes(expected),`route lifecycle smoke missing call: ${expected}`);
}

const invalid=await controller.createRequestedRoute({lat:NaN,lon:0},{lat:1,lon:1});
assert.equal(invalid,false,'invalid coordinates should be rejected');
assert.equal(controller.worldDrive.route.generation,2,'generation bump ordering changed for invalid route request');
assert.ok(calls.includes('toast:Coordonnées invalides'),'invalid route feedback changed');

const mainLines=main.split('\n').length;
assert.ok(mainLines<3425,`main.js is still unexpectedly large after route lifecycle extraction: ${mainLines} lines`);

const regression=spawnSync(process.execPath,['qa/V21_26_TRANSMISSION_REFACTOR_QA.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(regression.status,0,`prior V21.26 refactors regressed:\n${regression.stderr||regression.stdout}`);

console.log('V21.26 ROUTE LIFECYCLE REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; route-lifecycle.js: ${lifecycle.split('\n').length} lines`);
console.log('route reset / generation / routing geometry / initial hydro-terrain-imagery preload orchestration verified');
