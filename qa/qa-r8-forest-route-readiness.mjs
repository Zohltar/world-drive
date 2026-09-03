import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRouteLifecycle} from '../src/routing/route-lifecycle.js';

const source=fs.readFileSync(new URL('../src/routing/route-lifecycle.js',import.meta.url),'utf8');
assert.match(source,/const routeChangeNeedsForestReady=!!getState\(\)\.gameStarted;/,
  'route-change forest readiness capture missing');
assert.match(source,/typeof sceneryRenderer\.whenInitialForestReady==='function'/,
  'route lifecycle no longer uses the existing forest readiness owner');
assert.match(source,/await sceneryRenderer\.whenInitialForestReady\(\)\.catch\(\(\)=>false\);/,
  'in-game route reveal must await the existing P9.35 readiness gate');
assert.doesNotMatch(source,/minChunks\s*:|minFrontChunks\s*:|minFrontLead\s*:|timeoutMs\s*:/,
  'route lifecycle must not duplicate or retune P9.35 forest thresholds');

function deferred(){
  let resolve;
  const promise=new Promise(r=>{resolve=r;});
  return {promise,resolve};
}

function classList(){
  const values=new Set(['hidden']);
  return {
    add:value=>values.add(value),
    remove:value=>values.delete(value),
    contains:value=>values.has(value)
  };
}

function makeHarness({gameStarted}){
  const state={
    gameStarted,
    autopilot:false,
    routeStart:{lat:0,lon:0,name:'A'},
    routeEnd:{lat:0,lon:.004,name:'B'},
    routeWaypoints:[],
    absX:0,
    absZ:0,
    worldOffset:{x:0,z:0}
  };
  const route=[];
  const segments=[];
  const loading={classList:classList()};
  const loadingText={textContent:''};
  const routingStatus={textContent:''};
  const statusEl={textContent:''};
  const bridgeStatus={textContent:''};
  const signStatus={textContent:''};
  const forestGate=deferred();
  let forestWaits=0;
  let finalPlacements=0;

  const noop=()=>{};
  const serviceReset={reset:noop};
  const rendererClear={clear:noop};
  const sceneryRenderer={
    clearForestCache:noop,
    clear:noop,
    whenInitialForestReady(){
      forestWaits++;
      return forestGate.promise;
    }
  };

  const lifecycle=createRouteLifecycle({
    version:'test',
    getState:()=>state,
    setState:patch=>Object.assign(state,patch),
    validLatLon:()=>true,
    geoDist:()=>1000,
    toast:noop,
    setAutopilot:noop,
    resetStreamingCoordinator:noop,
    waterData:serviceReset,
    skidMarks:{clear:noop},
    route,
    segments,
    bridgeManager:{reset:noop,resetCounter:noop},
    bridgeStatus,
    waterRenderer:rendererClear,
    sceneryData:serviceReset,
    elevationService:serviceReset,
    imageryService:{enabled:false,reset:noop},
    signData:serviceReset,
    resetMinimapSignReadout:noop,
    signStatus,
    updateRoadMetaHUD:noop,
    clearActiveRoadProfile:noop,
    terrainService:{clearRoadBed:noop,clearHorizon:noop},
    clearGroup:group=>{group.children.length=0;},
    roadGroup:{children:[]},
    forestGroup:{children:[]},
    infrastructureGroup:{children:[]},
    signGroup:{children:[]},
    sceneryRenderer,
    resetRunChallenge:noop,
    loading,
    loadingText,
    routingStatus,
    statusEl,
    setBootProgress:noop,
    routingService:{
      async fetchRoute(){
        return {
          provider:'mock',
          coordinates:[[0,0],[.002,0],[.004,0]]
        };
      }
    },
    toWorld:(lat,lon)=>({x:lon*100000,z:lat*100000}),
    prepMap:noop,
    placeAt:(frac,options)=>{if(options?.finalizeOnly)finalPlacements++;},
    loadWaterAround:async()=>({ok:true}),
    preloadRoute:noop,
    loadElevationAround:async()=>true,
    primeInitialTerrainPreloadBuffer:async()=>{},
    buildImageryMosaic:async()=>{},
    onElevationFallback:noop,
    onImageryFallback:noop,
    promiseWithTimeout:promise=>Promise.resolve(promise),
    hasPendingWorld:()=>false,
    cancelVisualJob:noop,
    commitLocalWorldRefresh:()=>true,
    prefetchRouteAhead:noop,
    loadSceneryAround:async()=>true,
    onSceneryUnavailable:noop,
    loadRoadMetadataAround:async()=>true,
    loadGeographicSignsAround:async()=>true
  });

  return {
    lifecycle,
    loading,
    forestGate,
    get forestWaits(){return forestWaits;},
    get finalPlacements(){return finalPlacements;}
  };
}

const routeChange=makeHarness({gameStarted:true});
let routeChangeResolved=false;
const routeChangePromise=routeChange.lifecycle.createRequestedRoute(
  {lat:0,lon:0,name:'A'},
  {lat:0,lon:.004,name:'B'}
).then(value=>{routeChangeResolved=true;return value;});

for(let i=0;i<50&&routeChange.forestWaits===0;i++){
  await new Promise(resolve=>setImmediate(resolve));
}
assert.equal(routeChange.forestWaits,1,
  'in-game route change never reached forest readiness gate');
assert.equal(routeChangeResolved,false,
  'in-game route resolved before forest readiness');
assert.equal(routeChange.loading.classList.contains('hidden'),false,
  'loading overlay hid before forest readiness');

routeChange.forestGate.resolve(true);
assert.equal(await routeChangePromise,true,'in-game route failed after forest readiness');
assert.equal(routeChange.loading.classList.contains('hidden'),true,
  'loading overlay remained visible after forest readiness');
assert.equal(routeChange.finalPlacements,1,
  'issue #6 final placement refresh was lost');

const initial=makeHarness({gameStarted:false});
const initialResult=await initial.lifecycle.createRequestedRoute(
  {lat:0,lon:0,name:'A'},
  {lat:0,lon:.004,name:'B'}
);
assert.equal(initialResult,true,'initial route startup failed');
assert.equal(initial.forestWaits,0,
  'initial route duplicated the startup UI P9.35 wait');
assert.equal(initial.loading.classList.contains('hidden'),true,
  'initial startup should preserve existing hidden loading behavior');

console.log('R8 FOREST ROUTE READINESS QA: PASS',{
  routeChangeWaits:routeChange.forestWaits,
  initialRouteWaits:initial.forestWaits,
  p935ThresholdsRetuned:false,
  finalPlacementPreserved:routeChange.finalPlacements===1
});
