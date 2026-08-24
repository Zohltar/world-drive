import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const src=path.join(root,'src');
const mainPath=path.join(src,'main.js');
const modulePath=path.join(src,'streaming-coordinator.js');
const routeLifecyclePath=path.join(src,'route-lifecycle.js');

assert.equal(fs.existsSync(mainPath),true,'src/main.js missing');
assert.equal(fs.existsSync(modulePath),true,'src/streaming-coordinator.js missing — run tools/refactor-main-streaming-v21-25.mjs first');

const main=fs.readFileSync(mainPath,'utf8');
const streaming=fs.readFileSync(modulePath,'utf8');
const routeLifecycle=fs.existsSync(routeLifecyclePath)
  ?fs.readFileSync(routeLifecyclePath,'utf8')
  :'';

for(const pattern of [
  /const HITCH_FREE_STREAMING=\{/,
  /const streamRefreshState=\{/,
  /const deferredVisualJobs=new Map\(\);/,
  /function shiftRenderedWorldForOrigin\s*\(/,
  /const TERRAIN_PRELOAD_BUFFER=\{/,
  /const aheadStreamingBuckets=new Set\(\);/,
  /const terrainPreloadQueue=\[\];/,
  /let nextAheadStreamingAt=0;/,
  /let nextDirectionalPrefetchAt=0;/,
  /streamRefreshState\./,
  /deferredVisualJobs\./
]){
  assert.doesNotMatch(main,pattern,`main.js still owns extracted streaming state: ${pattern}`);
}

for(const pattern of [
  /from '\.\/streaming-coordinator\.js'/,
  /let streamingCoordinator=null;/,
  /function markStreamWorldRefresh\(reason='stream'\)/,
  /function scheduleVisualJob\(key,job,timeout=180\)/,
  /function commitLocalWorldRefresh\(\)/,
  /function scheduleLocalWorldRefresh\(options=\{\}\)/,
  /function recenterIfNeeded\(absx,absz,force=false\)/,
  /streamingCoordinator=createStreamingCoordinator\s*\(/,
  /const worldStreaming=streamingCoordinator\.worldStreaming;/,
  /streamingCoordinator\?\.recordFrame\(rawFrameMs,now\);/,
  /streamingCoordinator\?\.updateFrame\(now\);/,
  /streamingCoordinator\?\.policy\.perfConsoleLogging/
]){
  assert.match(main,pattern,`main.js missing streaming facade/integration: ${pattern}`);
}

// V21.26 route-lifecycle extraction moved route-reset ownership out of main.js.
// Preserve the historical assertion when that module is absent; otherwise
// require the injected reset callback in main and the reset call in the module.
if(routeLifecycle){
  assert.doesNotMatch(
    main,
    /streamingCoordinator\?\.reset\(\);/,
    'main.js still owns route-reset streaming orchestration after route lifecycle extraction'
  );
  assert.match(
    main,
    /resetStreamingCoordinator:\(\)=>streamingCoordinator\?\.reset\(\)/,
    'main.js missing injected streaming reset callback for route lifecycle'
  );
  assert.match(
    routeLifecycle,
    /resetStreamingCoordinator\(\);/,
    'route-lifecycle.js missing streaming coordinator reset'
  );
}else{
  assert.match(
    main,
    /streamingCoordinator\?\.reset\(\);/,
    'main.js missing historical streaming reset integration'
  );
}

for(const pattern of [
  /export function createStreamingCoordinator\s*\(/,
  /const policy=\{/,
  /const state=\{/,
  /const deferredVisualJobs=new Map\(\);/,
  /const terrainPreloadPolicy=\{/,
  /const worldStreaming=createWorldStreaming\s*\(/,
  /function markWorldRefresh\s*\(/,
  /function scheduleVisualJob\s*\(/,
  /function shiftRenderedWorldForOrigin\s*\(/,
  /function commitWorldRefresh\s*\(/,
  /function scheduleWorldRefresh\s*\(/,
  /function recenterIfNeeded\s*\(/,
  /function refillTerrainPreloadBuffer\s*\(/,
  /function prefetchRouteAhead\s*\(/,
  /async function primeInitialTerrainPreloadBuffer\s*\(/,
  /function refreshCurrentImagerySooner\s*\(/,
  /function updateFrame\s*\(/,
  /function recordFrame\s*\(/,
  /function reset\s*\(/,
  /function diagnostics\s*\(/
]){
  assert.match(streaming,pattern,`streaming-coordinator.js missing expected behavior: ${pattern}`);
}

const syntaxFiles=[mainPath,modulePath];
if(routeLifecycle)syntaxFiles.push(routeLifecyclePath);
for(const filePath of syntaxFiles){
  const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout||`${path.basename(filePath)} syntax check failed`);
}

const imported=await import(`${pathToFileURL(modulePath).href}?qa=${Date.now()}`);
assert.equal(typeof imported.createStreamingCoordinator,'function','createStreamingCoordinator export missing');

let runtime={
  absX:0,
  absZ:0,
  heading:0,
  speed:0,
  gameStarted:false,
  menuOpen:false,
  worldOffset:{x:0,z:0}
};
let rebuilds=0;
let worldResets=0;
let terrainReset=0;
let terrainShift=[0,0];
let imageryShift=[0,0];

const group={
  position:{x:0,z:0},
  updates:0,
  updateMatrix(){this.updates++;}
};
const ground={
  position:{x:0,z:0},
  updates:0,
  updateMatrix(){this.updates++;}
};
const camera={position:{x:10,z:20}};
const camTarget={x:2,z:3};
const car={position:{x:4,z:5}};

const fakeWorldStreaming={
  reset(){worldResets++;},
  preloadRoute(){},
  prefetchDirectional(){},
  setDistanceScale(){}
};
const createWorldStreaming=options=>{
  assert.equal(typeof options.getRouteLength,'function','world streaming wiring lost getRouteLength');
  assert.equal(typeof options.elevation.prefetch,'function','world streaming elevation prefetch wiring missing');
  assert.equal(typeof options.signs.load,'function','world streaming sign loader wiring missing');
  return fakeWorldStreaming;
};

const serviceBase={center:{x:0,z:0},loading:false};
const elevationService={...serviceBase,prefetchAt:()=>Promise.resolve(true)};
const waterData={...serviceBase,generation:0,prefetchAt:()=>Promise.resolve(true)};
const sceneryData={...serviceBase,query:()=>''};
const imageryService={
  ...serviceBase,
  enabled:false,
  prefetchAt:()=>Promise.resolve(true),
  shiftOrigin(x,z){imageryShift=[x,z];},
  realignToOrigin(){},
  invalidateGeometry(){}
};
const signData={...serviceBase,query:()=>''};
const terrainService={
  shiftRoadBedOrigin(x,z){terrainShift=[x,z];},
  resetRoadBedOrigin(){terrainReset++;}
};

const coordinator=imported.createStreamingCoordinator({
  createWorldStreaming,
  toLatLon:(x,z)=>({lat:z,lon:x}),
  nearestRoute:(x,z)=>({cum:Math.max(0,z),angle:0,d:0,px:x,pz:z}),
  routePointAtCum:cum=>({x:0,z:cum,angle:0,cum}),
  routePointAtFraction:f=>({x:0,z:f*100,angle:0,cum:f*100}),
  getRouteLength:()=>100,
  getRoutePointCount:()=>2,
  elevationService,
  waterData,
  sceneryData,
  imageryService,
  getRoadMetadataState:()=>({center:{x:0,z:0},loading:false}),
  signData,
  loadElevationAround:()=>Promise.resolve(true),
  loadWaterAround:()=>Promise.resolve(true),
  loadSceneryAround:()=>Promise.resolve(true),
  buildImageryMosaic:()=>Promise.resolve(true),
  loadRoadMetadataAround:()=>Promise.resolve(true),
  loadGeographicSignsAround:()=>Promise.resolve(true),
  fetchCached:()=>Promise.resolve({data:null}),
  streamedWorldGroups:[group],
  ground,
  terrainService,
  camera,
  camTarget,
  car,
  resetStreamedWorldOrigins:()=>{},
  rebuildLocalWorld:()=>{rebuilds++;},
  applyImageryToGround:()=>{},
  markStaticShadowsDirty:()=>{},
  getRuntimeState:()=>runtime,
  setWorldOffset:value=>{runtime={...runtime,worldOffset:value};}
});

assert.equal(coordinator.worldStreaming,fakeWorldStreaming,'coordinator must expose worldStreaming instance');
assert.equal(coordinator.policy.softRecenterDistance,520,'soft recenter policy changed');
assert.equal(coordinator.policy.hardWorldRefreshDistance,1450,'hard refresh policy changed');
assert.equal(coordinator.policy.urgentWorldRefreshDistance,2200,'urgent refresh policy changed');
assert.equal(coordinator.policy.calmSpeed,4.5,'calm-speed policy changed');

const stateRef=coordinator.state;
coordinator.markWorldRefresh('dem');
assert.equal(coordinator.state,stateRef,'stream refresh state identity must remain stable');
assert.equal(stateRef.pendingWorld,true,'markWorldRefresh must set pending flag');
assert.equal(stateRef.reasons.has('dem'),true,'markWorldRefresh must retain reason');

coordinator.recordFrame(28,1234);
assert.equal(stateRef.hitchCount,1,'hitch accounting changed');
assert.equal(stateRef.maxFrameMs,28,'max hitch duration changed');
assert.equal(stateRef.lastHitchAt,1234,'last hitch timestamp changed');

const shifted=coordinator.recenterIfNeeded(600,0,false);
assert.equal(shifted,true,'soft recenter should trigger above 520 m');
assert.deepEqual(runtime.worldOffset,{x:600,z:0},'world offset callback not updated');
assert.equal(group.position.x,-600,'streamed group did not shift with floating origin');
assert.equal(ground.position.x,-600,'ground did not shift with floating origin');
assert.deepEqual(terrainShift,[600,0],'terrain road-bed origin did not shift');
assert.deepEqual(imageryShift,[600,0],'imagery origin did not shift');
assert.equal(camera.position.x,-590,'camera did not follow floating-origin shift');
assert.equal(car.position.x,-596,'vehicle render position did not follow floating-origin shift');
assert.equal(rebuilds,0,'soft recenter below hard threshold must not rebuild immediately');

const forced=coordinator.recenterIfNeeded(650,0,true);
assert.equal(forced,true,'forced recenter should always run');
assert.equal(rebuilds,1,'forced recenter must rebuild immediately');
assert.ok(terrainReset>=1,'forced rebuild must reset terrain road-bed origin');
assert.equal(stateRef.pendingWorld,false,'commitWorldRefresh must clear pending flag');
assert.equal(stateRef.reasons.size,0,'commitWorldRefresh must clear pending reasons');

coordinator.markWorldRefresh('test');
coordinator.reset();
assert.equal(worldResets,1,'coordinator reset must reset worldStreaming');
assert.equal(stateRef.pendingWorld,false,'coordinator reset must clear pending refresh');
assert.equal(stateRef.reasons.size,0,'coordinator reset must clear pending reasons');
assert.equal(stateRef.hitchCount,1,'route reset should preserve accumulated hitch diagnostics');

const diagnostics=coordinator.diagnostics();
assert.equal(diagnostics.hitchCount,1,'diagnostics lost hitch count');
assert.deepEqual(diagnostics.worldOffset,{x:650,z:0},'diagnostics lost current world offset');

const mainLines=main.split(/\r?\n/).length;
const moduleLines=streaming.split(/\r?\n/).length;
assert.ok(mainLines<5700,`main.js is still unexpectedly large after streaming extraction: ${mainLines} lines`);

console.log('V21.25 STREAMING REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; streaming-coordinator.js: ${moduleLines} lines`);
console.log(`floating origin / hitch state / reset / world-stream wiring: verified${routeLifecycle?' · route-lifecycle reset ownership accepted':''}`);
