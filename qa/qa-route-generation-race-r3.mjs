import assert from 'node:assert/strict';
import {createRouteLifecycle} from '../src/routing/route-lifecycle.js';

function deferred(){
  let resolve,reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}
function classList(){
  const values=new Set(['hidden']);
  return {add:v=>values.add(v),remove:v=>values.delete(v),contains:v=>values.has(v)};
}

const realSetTimeout=globalThis.setTimeout;
const realClearTimeout=globalThis.clearTimeout;
const timers=[];
globalThis.setTimeout=(fn,ms)=>{
  const handle={fn,ms,cleared:false};
  timers.push(handle);
  return handle;
};
globalThis.clearTimeout=handle=>{if(handle)handle.cleared=true;};

try{
  const state={
    gameStarted:false,autopilot:false,
    routeStart:{lat:0,lon:0,name:'Old'},routeEnd:{lat:0,lon:.004,name:'Old end'},
    routeWaypoints:[],origin:{lat:0,lon:0},absX:0,absZ:0,routeLength:0,
    vehicleNearestHint:-1,vehicleNearestLastX:Infinity,vehicleNearestLastZ:Infinity
  };
  const route=[];
  const segments=[];
  const requests=new Map();
  const toasts=[];
  const authoritative=[];
  const loading={classList:classList()};
  const routingStatus={textContent:''};
  const statusEl={textContent:''};
  const loadingText={textContent:''};
  const noop=()=>{};
  const resetService={reset:noop};
  const forestGroup={userData:{worldDriveSwitchForestRouteCache:key=>({restored:false,key,slots:1})}};

  const lifecycle=createRouteLifecycle({
    version:'route-generation-r3-race',
    getState:()=>state,
    setState:patch=>Object.assign(state,patch),
    validLatLon:()=>true,
    geoDist:()=>1000,
    toast:text=>toasts.push(text),
    setAutopilot:noop,
    resetStreamingCoordinator:noop,
    waterData:resetService,
    skidMarks:{clear:noop},
    route,segments,
    bridgeManager:{reset:noop,resetCounter:noop},
    bridgeStatus:{textContent:''},
    waterRenderer:{clear:noop},
    sceneryData:resetService,
    elevationService:resetService,
    imageryService:{enabled:false,reset:noop},
    signData:resetService,
    resetMinimapSignReadout:noop,
    signStatus:{textContent:''},
    updateRoadMetaHUD:noop,
    clearActiveRoadProfile:noop,
    terrainService:{clearRoadBed:noop,clearHorizon:noop},
    clearGroup:noop,
    roadGroup:{},forestGroup,infrastructureGroup:{},signGroup:{},
    sceneryRenderer:{clearForestCache:noop,clear:noop},
    resetRunChallenge:noop,
    loading,loadingText,routingStatus,statusEl,
    setBootProgress:noop,
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
      state.absX=route[0]?.x??0;state.absZ=route[0]?.z??0;
    },
    loadWaterAround:async()=>({ok:true}),
    preloadRoute:()=>authoritative.push(`preload:${state.routeStart.name}`),
    loadElevationAround:async()=>true,
    primeInitialTerrainPreloadBuffer:async()=>{},
    buildImageryMosaic:async()=>{},
    onElevationFallback:noop,
    onImageryFallback:noop,
    promiseWithTimeout:promise=>Promise.resolve(promise),
    hasPendingWorld:()=>false,
    cancelVisualJob:key=>authoritative.push(`cancel:${key}`),
    commitLocalWorldRefresh:()=>false,
    prefetchRouteAhead:()=>authoritative.push(`prefetch:${state.routeStart.name}`),
    loadSceneryAround:async()=>true,
    onSceneryUnavailable:noop,
    loadRoadMetadataAround:async()=>true,
    loadGeographicSignsAround:async()=>true
  });

  const startA={lat:0,lon:10,name:'Route A'};
  const endA={lat:0,lon:10.004,name:'End A'};
  const startB={lat:0,lon:20,name:'Route B'};
  const endB={lat:0,lon:20.004,name:'End B'};

  const promiseA=lifecycle.createRequestedRoute(startA,endA);
  const failsafeA=timers.find(timer=>timer.ms===15000);
  assert.ok(requests.has('Route A')&&failsafeA,'route A did not start with its failsafe');

  const promiseB=lifecycle.createRequestedRoute(startB,endB);
  const failsafes=timers.filter(timer=>timer.ms===15000);
  assert.equal(failsafes.length,2,'each overlapping route needs its own failsafe');
  const failsafeB=failsafes[1];
  assert.equal(lifecycle.worldDrive.route.generation,2,'newer route did not advance generation');

  requests.get('Route B').resolve({provider:'Router B',coordinates:[[20,0],[20.002,0],[20.004,0]]});
  assert.equal(await promiseB,true,'newer route B failed');
  assert.equal(failsafeB.cleared,true,'B did not clear its failsafe');
  assert.deepEqual(state.routeStart,startB,'B did not remain active');
  assert.equal(routingStatus.textContent,'Router B','B provider HUD changed');
  assert.equal(route[0].x,2000000,'B geometry is not authoritative');
  const snapshot={
    status:statusEl.textContent,provider:routingStatus.textContent,
    routeX:route.map(point=>point.x),toastCount:toasts.length,
    authoritative:[...authoritative],loadingHidden:loading.classList.contains('hidden')
  };

  // Even if the stale A timer fires after B completed, it must not mutate B UI.
  failsafeA.fn();
  assert.equal(statusEl.textContent,snapshot.status,'stale A timeout overwrote B status');
  assert.equal(routingStatus.textContent,snapshot.provider,'stale A timeout overwrote B provider');
  assert.equal(toasts.length,snapshot.toastCount,'stale A timeout emitted feedback');
  assert.equal(loading.classList.contains('hidden'),snapshot.loadingHidden,'stale A timeout changed B overlay');

  requests.get('Route A').resolve({provider:'Router A',coordinates:[[10,0],[10.002,0],[10.004,0]]});
  assert.equal(await promiseA,false,'stale A did not stop quietly');
  assert.equal(failsafeA.cleared,true,'stale A did not clear its own timer');
  assert.deepEqual(state.routeStart,startB,'stale A reclaimed route state');
  assert.deepEqual(route.map(point=>point.x),snapshot.routeX,'stale A overwrote B geometry');
  assert.equal(routingStatus.textContent,snapshot.provider,'stale A overwrote B provider after resolving');
  assert.equal(statusEl.textContent,snapshot.status,'stale A overwrote B status after resolving');
  assert.equal(toasts.length,snapshot.toastCount,'stale A emitted late feedback');
  assert.deepEqual(authoritative,snapshot.authoritative,'stale A reached authoritative post-route work');

  console.log('POST-REFACTOR ROUTE GENERATION RACE R3 QA: PASS',{
    generation:lifecycle.worldDrive.route.generation,
    newerRoute:'B',staleRoute:'A',staleTimeoutIgnored:true
  });
}finally{
  globalThis.setTimeout=realSetTimeout;
  globalThis.clearTimeout=realClearTimeout;
}
