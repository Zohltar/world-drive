import assert from 'node:assert/strict';
import {createRouteLifecycle} from '../src/routing/route-lifecycle.js';

function deferred(){
  let resolve;
  const promise=new Promise(res=>{resolve=res;});
  return {promise,resolve};
}
function classList(){
  const values=new Set(['hidden']);
  return {add:v=>values.add(v),remove:v=>values.delete(v),contains:v=>values.has(v)};
}

const state={
  gameStarted:true,
  autopilot:false,
  routeStart:{lat:0,lon:0,name:'Old'},
  routeEnd:{lat:0,lon:.004,name:'Old end'},
  routeWaypoints:[],origin:{lat:0,lon:0},absX:0,absZ:0,routeLength:0,
  vehicleNearestHint:-1,vehicleNearestLastX:Infinity,vehicleNearestLastZ:Infinity
};
const route=[];
const segments=[];
const loading={classList:classList()};
const routingStatus={textContent:''};
const statusEl={textContent:''};
const loadingText={textContent:''};
const toasts=[];
const switches=[];
const forestWaits=[];
const bForestGate=deferred();
const forestGroup={userData:{}};
let forestWaitIndex=0;
forestGroup.userData.worldDriveSwitchForestRouteCache=key=>{
  const restored=switches.includes(key);
  switches.push(key);
  return {restored,key,slots:Math.min(2,new Set(switches).size)};
};

const noop=()=>{};
const resetService={reset:noop};
const coordsA=[[10,0],[10.002,0],[10.004,0]];
const coordsB=[[20,0],[20.002,0],[20.004,0]];

const lifecycle=createRouteLifecycle({
  version:'route-generation-r3-p935',
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
  sceneryRenderer:{
    clearForestCache:noop,
    clear:noop,
    whenInitialForestReady(){
      forestWaitIndex++;
      forestWaits.push({index:forestWaitIndex,route:state.routeStart.name});
      if(forestWaitIndex===2)return bForestGate.promise;
      return Promise.resolve(true);
    }
  },
  resetRunChallenge:noop,
  loading,loadingText,routingStatus,statusEl,
  setBootProgress:noop,
  routingService:{
    async fetchRoute({start}){
      return {provider:`Router ${start.name}`,coordinates:start.name.startsWith('B')?coordsB:coordsA};
    }
  },
  toWorld:(lat,lon)=>({x:lon*100000,z:lat*100000}),
  prepMap:noop,
  placeAt:()=>{state.absX=route[0]?.x??0;state.absZ=route[0]?.z??0;},
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
  commitLocalWorldRefresh:()=>false,
  prefetchRouteAhead:noop,
  loadSceneryAround:async()=>true,
  onSceneryUnavailable:noop,
  loadRoadMetadataAround:async()=>true,
  loadGeographicSignsAround:async()=>true
});

const startA={lat:0,lon:10,name:'A initial'};
const endA={lat:0,lon:10.004,name:'A end'};
const startB={lat:0,lon:20,name:'B pending'};
const endB={lat:0,lon:20.004,name:'B end'};
const startAReturn={lat:0,lon:10,name:'A return'};

assert.equal(await lifecycle.createRequestedRoute(startA,endA),true,'initial A failed');
assert.equal(switches.length,1,'initial A did not claim a forest slot');
const keyA=switches[0];
assert.equal(forestWaits.length,1,'initial A did not pass P9.35 readiness');

let bResolved=false;
const bPromise=lifecycle.createRequestedRoute(startB,endB).then(value=>{bResolved=true;return value;});
for(let i=0;i<100&&forestWaits.length<2;i++)await new Promise(resolve=>setImmediate(resolve));
assert.equal(forestWaits.length,2,'B never reached P9.35 forest readiness');
assert.equal(bResolved,false,'B completed before its forest readiness gate');
assert.equal(switches.length,2,'B did not switch to its forest slot before P9.35');
const keyB=switches[1];
assert.notEqual(keyB,keyA,'A and B unexpectedly share a route fingerprint');

const aReturnPromise=lifecycle.createRequestedRoute(startAReturn,endA);
assert.equal(await aReturnPromise,true,'rapid return to A failed');
assert.equal(switches.length,3,'return A did not switch forest ownership');
assert.equal(switches[2],keyA,'return A did not restore the original A forest key');
assert.equal(state.routeStart.name,'A return','A return did not remain authoritative');
const toastCountAfterA=toasts.length;
const routeSnapshot=route.map(point=>point.x);

bForestGate.resolve(true);
assert.equal(await bPromise,false,'B did not stop as stale after late P9.35 completion');
assert.equal(state.routeStart.name,'A return','stale B reclaimed route state after A return');
assert.deepEqual(route.map(point=>point.x),routeSnapshot,'stale B changed A geometry after forest gate');
assert.equal(toasts.length,toastCountAfterA,'stale B emitted late feedback after A return');
assert.equal(switches.length,3,'stale B switched forest ownership after A return');

console.log('POST-REFACTOR ROUTE GENERATION P9.35 R3 QA: PASS',{
  switchSequence:['A','B','A'],
  restoredOriginalAKey:switches[2]===switches[0],
  bStoppedAfterLateForestReady:true,
  generation:lifecycle.worldDrive.route.generation
});
