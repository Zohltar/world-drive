import assert from 'node:assert/strict';
import {createStreamingCoordinator} from '../src/streaming-coordinator.js';

const performanceDescriptor=Object.getOwnPropertyDescriptor(globalThis,'performance');
const idleDescriptor=Object.getOwnPropertyDescriptor(globalThis,'requestIdleCallback');
const originalWarn=console.warn;
let now=0;

Object.defineProperty(globalThis,'performance',{
  configurable:true,
  value:{now:()=>now}
});
Object.defineProperty(globalThis,'requestIdleCallback',{
  configurable:true,
  value:callback=>{callback({didTimeout:false,timeRemaining:()=>50});return 1;}
});
console.warn=()=>{};

let runtime={
  gameStarted:true,
  menuOpen:false,
  speed:0,
  absX:0,
  absZ:0,
  heading:0,
  worldOffset:{x:0,z:0}
};

const imagery={
  enabled:true,
  center:{x:0,z:0},
  loading:false,
  prefetchAt:()=>Promise.resolve(true),
  deferCommits(){},shiftOrigin(){},realignToOrigin(){},invalidateGeometry(){},
  diagnostics:()=>({})
};
const elevation={center:{x:0,z:0},loading:false,prefetchAt:()=>Promise.resolve(true)};
const noop={center:{x:0,z:0},loading:false,prefetchAt:()=>Promise.resolve(true)};

try{
  const coordinator=createStreamingCoordinator({
    createWorldStreaming:()=>({prefetchDirectional(){},reset(){},setDistanceScale(){},preloadRoute(){}}),
    toLatLon:()=>({lat:0,lon:0}),
    nearestRoute:()=>({cum:0,angle:0}),
    routePointAtCum:cum=>({x:cum,z:0,angle:0}),
    routePointAtFraction:()=>({x:0,z:0}),
    getRouteLength:()=>1000,
    getRoutePointCount:()=>10,
    elevationService:elevation,
    waterData:{...noop,generation:0},
    sceneryData:{...noop,query:()=>''},
    imageryService:imagery,
    getRoadMetadataState:()=>({center:{x:0,z:0},loading:false}),
    signData:{...noop,query:()=>''},
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
    camera:{position:{x:0,z:0}},camTarget:{x:0,z:0},car:{position:{x:0,z:0}},
    resetStreamedWorldOrigins(){},rebuildLocalWorld(){},applyImageryToGround(){},markStaticShadowsDirty(){},
    getRuntimeState:()=>runtime,
    setWorldOffset:value=>{runtime={...runtime,worldOffset:value};}
  });

  now=100;
  assert.equal(coordinator.scheduleVisualJob('sync-ok',()=>{now+=7;return 42;}),true);
  let job=coordinator.diagnostics().visualJobs['sync-ok'];
  assert.deepEqual({
    runs:job.runs,lastMs:job.lastMs,settledRuns:job.settledRuns,
    succeededRuns:job.succeededRuns,failedRuns:job.failedRuns,inFlight:job.inFlight,
    lastWallMs:job.lastWallMs,lastOutcome:job.lastOutcome
  },{
    runs:1,lastMs:7,settledRuns:1,succeededRuns:1,failedRuns:0,inFlight:0,
    lastWallMs:7,lastOutcome:'sync-return'
  });

  now=150;
  assert.equal(coordinator.scheduleVisualJob('sync-throw',()=>{now+=3;throw new Error('sync boom');}),true);
  job=coordinator.diagnostics().visualJobs['sync-throw'];
  assert.equal(job.lastMs,3);
  assert.equal(job.lastWallMs,3);
  assert.equal(job.settledRuns,1);
  assert.equal(job.succeededRuns,0);
  assert.equal(job.failedRuns,1);
  assert.equal(job.inFlight,0);
  assert.equal(job.lastOutcome,'sync-throw');

  let resolveAsync;
  now=200;
  assert.equal(coordinator.scheduleVisualJob('async-resolve',()=>{
    now+=2;
    return new Promise(resolve=>{resolveAsync=resolve;});
  }),true);
  job=coordinator.diagnostics().visualJobs['async-resolve'];
  assert.equal(job.runs,1);
  assert.equal(job.lastMs,2,'async invocation CPU time must stay synchronous');
  assert.equal(job.settledRuns,0,'async job settled before its Promise resolved');
  assert.equal(job.inFlight,1);

  now=235;
  resolveAsync('ok');
  await Promise.resolve();
  await Promise.resolve();
  job=coordinator.diagnostics().visualJobs['async-resolve'];
  assert.equal(job.lastMs,2,'legacy visual-job timing must remain synchronous');
  assert.equal(job.lastWallMs,35,'async wall time must reach Promise settlement');
  assert.equal(job.maxWallMs,35);
  assert.equal(job.avgWallMs,35);
  assert.equal(job.settledRuns,1);
  assert.equal(job.succeededRuns,1);
  assert.equal(job.failedRuns,0);
  assert.equal(job.inFlight,0);
  assert.equal(job.lastOutcome,'async-resolve');
  assert.equal(job.lastSettledAt,235);

  coordinator.recordFrame(25,235);
  const attribution=coordinator.diagnostics().p939HitchAttribution.last;
  assert.equal(attribution.source,'visual:async-resolve');
  assert.equal(attribution.candidateMs,2,
    'P9.39 hitch attribution must use synchronous visual CPU time, not async wall wait');

  let rejectAsync;
  now=300;
  assert.equal(coordinator.scheduleVisualJob('async-reject',()=>{
    now+=1;
    return new Promise((resolve,reject)=>{rejectAsync=reject;});
  }),true);
  job=coordinator.diagnostics().visualJobs['async-reject'];
  assert.equal(job.lastMs,1);
  assert.equal(job.inFlight,1);
  assert.equal(job.settledRuns,0);

  now=341;
  rejectAsync(new Error('async boom'));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  job=coordinator.diagnostics().visualJobs['async-reject'];
  assert.equal(job.lastWallMs,41);
  assert.equal(job.settledRuns,1);
  assert.equal(job.succeededRuns,0);
  assert.equal(job.failedRuns,1);
  assert.equal(job.inFlight,0);
  assert.equal(job.lastOutcome,'async-reject');
  assert.equal(job.lastSettledAt,341);

  console.log('PASS Block 4 async visual-job timing QA');
  console.log({
    syncMs:coordinator.diagnostics().visualJobs['sync-ok'].lastMs,
    asyncResolve:coordinator.diagnostics().visualJobs['async-resolve'],
    asyncReject:coordinator.diagnostics().visualJobs['async-reject'],
    hitchCandidateMs:attribution.candidateMs
  });
}finally{
  console.warn=originalWarn;
  if(performanceDescriptor)Object.defineProperty(globalThis,'performance',performanceDescriptor);
  else delete globalThis.performance;
  if(idleDescriptor)Object.defineProperty(globalThis,'requestIdleCallback',idleDescriptor);
  else delete globalThis.requestIdleCallback;
}
