import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRouteLifecycle} from '../src/routing/route-lifecycle.js';

const source=fs.readFileSync(new URL('../src/routing/route-lifecycle.js',import.meta.url),'utf8');

assert.match(source,/function ownsRouteGeneration\(generation\)\{/,
  'route lifecycle generation ownership helper missing');
assert.match(source,/async function loadRouteForGeneration\(routeGeneration\)\{/,
  'token-aware internal route loader missing');
assert.match(source,/if\(!ownsRouteGeneration\(routeGeneration\)\)return false;/,
  'stale route geometry must stop before authoritative mutation');
assert.match(source,/async function loadRoute\(\)\{\s*return loadRouteForGeneration\(worldDrive\.route\.generation\);\s*\}/s,
  'public loadRoute facade contract changed');
assert.match(source,/if\(!completed&&ownsRouteGeneration\(routeGeneration\)\)\{/,
  'routing failsafe is not generation-owned');
assert.match(source,/const routeLoaded=await loadRouteForGeneration\(routeGeneration\);/,
  'route creation does not pass its captured generation to the route loader');
assert.match(source,/const stopIfStale=\(\)=>\{[\s\S]*?clearTimeout\(failsafe\);[\s\S]*?return true;/,
  'stale route completion helper must clear its own failsafe and stop quietly');
assert.match(source,/catch\(error\)\{\s*if\(!ownsRouteGeneration\(routeGeneration\)\)\{[\s\S]*?return false;\s*\}/s,
  'stale route errors must not publish failure UI');

function deferred(){
  let resolve;
  let reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

function classList(){
  const values=new Set(['hidden']);
  return {
    add:value=>values.add(value),
    remove:value=>values.delete(value),
    contains:value=>values.has(value)
  };
}

const realSetTimeout=globalThis.setTimeout;
const realClearTimeout=globalThis.clearTimeout;
const timers=[];
globalThis.setTimeout=(fn,ms)=>{
  const timer={fn,ms,cleared:false};
  timers.push(timer);
  return timer;
};
globalThis.clearTimeout=timer=>{
  if(timer)timer.cleared=true;
};

try{
  const state={
    gameStarted:false,
    autopilot:false,
    routeStart:{lat:0,lon:0,name:'Old A'},
    routeEnd:{lat:0,lon:.004,name:'Old B'},
    routeWaypoints:[],
    origin:{lat:0,lon:0},
    absX:0,
    absZ:0,
    routeLength:0,
    vehicleNearestHint:-1,
    vehicleNearestLastX:Infinity,
    vehicleNearestLastZ:Infinity
  };
  const route=[];
  const segments=[];
  const loading={classList:classList()};
  const loadingText={textContent:''};
  const routingStatus={textContent:''};
  const statusEl={textContent:''};
  const bridgeStatus={textContent:''};
  const signStatus={textContent:''};
  const requests=new Map();
  const toasts=[];
  const authoritative=[];
  const boot=[];
  const noop=()=>{};
  const resetService={reset:noop};

  const lifecycle=createRouteLifecycle({
    version:'route-generation-r1',
    getState:()=>state,
    setState:patch=>Object.assign(state,patch),
    validLatLon:(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon),
    geoDist:()=>1000,
    toast:text=>toasts.push(text),
    setAutopilot:noop,
    resetStreamingCoordinator:noop,
    waterData:resetService,
    skidMarks:{clear:noop},
    route,
    segments,
    bridgeManager:{reset:noop,resetCounter:noop},
    bridgeStatus,
    waterRenderer:{clear:noop},
    sceneryData:resetService,
    elevationService:resetService,
    imageryService:{enabled:false,reset:noop},
    signData:resetService,
    resetMinimapSignReadout:noop,
    signStatus,
    updateRoadMetaHUD:noop,
    clearActiveRoadProfile:noop,
    terrainService:{clearRoadBed:noop,clearHorizon:noop},
    clearGroup:noop,
    roadGroup:{},
    forestGroup:{},
    infrastructureGroup:{},
    signGroup:{},
    sceneryRenderer:{clearForestCache:noop,clear:noop},
    resetRunChallenge:noop,
    loading,
    loadingText,
    routingStatus,
    statusEl,
    setBootProgress:(...args)=>boot.push(args),
    routingService:{
      fetchRoute({start}){
        const gate=deferred();
        requests.set(start.name,gate);
        return gate.promise;
      }
    },
    toWorld:(lat,lon)=>({x:lon*100000,z:lat*100000}),
    prepMap:()=>authoritative.push(`map:${state.routeStart.name}`),
    placeAt:()=>{
      authoritative.push(`place:${state.routeStart.name}`);
      state.absX=route[0]?.x??0;
      state.absZ=route[0]?.z??0;
    },
    loadWaterAround:async()=>({ok:true}),
    preloadRoute:()=>authoritative.push(`preload:${state.routeStart.name}`),
    loadElevationAround:async()=>true,
    primeInitialTerrainPreloadBuffer:async()=>{},
    buildImageryMosaic:async()=>{},
    onElevationFallback:()=>authoritative.push('elevation-fallback'),
    onImageryFallback:()=>authoritative.push('imagery-fallback'),
    promiseWithTimeout:promise=>Promise.resolve(promise),
    hasPendingWorld:()=>false,
    cancelVisualJob:key=>authoritative.push(`cancel:${key}`),
    commitLocalWorldRefresh:()=>false,
    prefetchRouteAhead:()=>authoritative.push(`prefetch:${state.routeStart.name}`),
    loadSceneryAround:async()=>true,
    onSceneryUnavailable:()=>authoritative.push('scenery-fallback'),
    loadRoadMetadataAround:async()=>true,
    loadGeographicSignsAround:async()=>true
  });

  const startA={lat:0,lon:10,name:'Route A'};
  const endA={lat:0,lon:10.004,name:'End A'};
  const startB={lat:0,lon:20,name:'Route B'};
  const endB={lat:0,lon:20.004,name:'End B'};

  const promiseA=lifecycle.createRequestedRoute(startA,endA);
  assert.ok(requests.has('Route A'),'route A did not reach the router');
  const failsafeA=timers.find(timer=>timer.ms===15000);
  assert.ok(failsafeA,'route A failsafe was not created');

  const promiseB=lifecycle.createRequestedRoute(startB,endB);
  assert.ok(requests.has('Route B'),'route B did not reach the router');
  assert.equal(lifecycle.worldDrive.route.generation,2,
    'route generation did not advance for the newer request');

  const failsafes=timers.filter(timer=>timer.ms===15000);
  assert.equal(failsafes.length,2,'each route request must retain its own failsafe');
  const failsafeB=failsafes[1];

  requests.get('Route B').resolve({
    provider:'Router B',
    coordinates:[[20,0],[20.002,0],[20.004,0]]
  });

  assert.equal(await promiseB,true,'newer route B should complete successfully');
  assert.equal(failsafeB.cleared,true,'newer route B failsafe was not cleared');
  assert.deepEqual(state.routeStart,startB,'newer route B did not remain active');
  assert.deepEqual(state.routeEnd,endB,'newer route B end changed');
  assert.equal(routingStatus.textContent,'Router B','newer route provider HUD changed');
  assert.match(statusEl.textContent,/Trajet chargé · 0\.4 km · 3 points/,
    'newer route status HUD changed');
  assert.equal(route.length,3,'newer route point count changed');
  assert.equal(segments.length,2,'newer route segment count changed');
  assert.equal(route[0].x,2000000,'newer route geometry is not authoritative');
  assert.ok(Math.abs(state.routeLength-400)<1e-6,'newer route length changed');
  assert.deepEqual(
    authoritative,
    ['map:Route B','place:Route B','preload:Route B','cancel:world-rebuild','prefetch:Route B'],
    'stale or unrelated route work reached authoritative post-route commits'
  );
  assert.deepEqual(toasts,['Trajet prêt · terrain préchargé'],
    'newer route completion feedback changed');

  const bSnapshot={
    routingStatus:routingStatus.textContent,
    status:statusEl.textContent,
    loadingHidden:loading.classList.contains('hidden'),
    toastCount:toasts.length,
    routeX:route.map(point=>point.x)
  };

  // Route A is still blocked in routing. Its old timeout fires after B is already
  // authoritative; it must not hide/show or overwrite B's UI or emit a toast.
  failsafeA.fn();
  assert.equal(routingStatus.textContent,bSnapshot.routingStatus,
    'stale route A timeout overwrote route B provider UI');
  assert.equal(statusEl.textContent,bSnapshot.status,
    'stale route A timeout overwrote route B status UI');
  assert.equal(loading.classList.contains('hidden'),bSnapshot.loadingHidden,
    'stale route A timeout changed route B loading overlay');
  assert.equal(toasts.length,bSnapshot.toastCount,
    'stale route A timeout emitted user feedback');

  requests.get('Route A').resolve({
    provider:'Router A',
    coordinates:[[10,0],[10.002,0],[10.004,0]]
  });

  assert.equal(await promiseA,false,'stale route A should stop quietly');
  assert.equal(failsafeA.cleared,true,'stale route A did not clear its failsafe');
  assert.deepEqual(state.routeStart,startB,'stale route A overwrote active route start');
  assert.deepEqual(state.routeEnd,endB,'stale route A overwrote active route end');
  assert.equal(routingStatus.textContent,bSnapshot.routingStatus,
    'stale route A overwrote route B provider after resolving');
  assert.equal(statusEl.textContent,bSnapshot.status,
    'stale route A overwrote route B status after resolving');
  assert.deepEqual(route.map(point=>point.x),bSnapshot.routeX,
    'stale route A overwrote route B geometry');
  assert.equal(toasts.length,bSnapshot.toastCount,
    'stale route A emitted misleading completion/failure feedback');
  assert.equal(authoritative.filter(call=>call.includes('Route A')).length,0,
    'stale route A reached an authoritative post-routing action');

  assert.ok(boot.some(args=>args[0]==='route'&&args[1]==='loading'),
    'route boot progress contract disappeared');

  console.log('POST-REFACTOR ROUTE GENERATION R1 QA: PASS',{
    generation:lifecycle.worldDrive.route.generation,
    activeRoute:state.routeStart.name,
    staleResult:false,
    newerResult:true,
    staleTimeoutIgnored:true,
    authoritativeCalls:authoritative.length
  });
}finally{
  globalThis.setTimeout=realSetTimeout;
  globalThis.clearTimeout=realClearTimeout;
}
