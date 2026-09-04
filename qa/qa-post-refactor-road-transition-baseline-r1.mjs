import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createTerrainService} from '../src/terrain.js';
import {createLocalWorldBuilder} from '../src/local-world-builder.js';
import {createStreamingCoordinator} from '../src/streaming-coordinator.js';

const REFRESH_COUNT=3;
const GROUND_SIZE=420;
const GROUND_SEGMENTS=32;
const ORIGIN_X=1600;

const worldSceneSource=fs.readFileSync(
  new URL('../src/terrain/world-scene.js',import.meta.url),
  'utf8'
);
assert.match(worldSceneSource,/road-terrain-transition/,
  'Block 3 baseline requires the retired transition presentation contract');
assert.match(worldSceneSource,/group\.visible=false/,
  'Block 3 baseline requires the transition to remain hidden in production');

const scene=new THREE.Scene();
const world=new THREE.Group();
const roadGroup=new THREE.Group();
const forestGroup=new THREE.Group();
const infrastructureGroup=new THREE.Group();
const signGroup=new THREE.Group();
const horizonGroup=new THREE.Group();
world.add(roadGroup,forestGroup,infrastructureGroup,signGroup,horizonGroup);
scene.add(world);

const ground=new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE,GROUND_SIZE,GROUND_SEGMENTS,GROUND_SEGMENTS),
  new THREE.MeshStandardMaterial({vertexColors:true})
);
ground.geometry.rotateX(-Math.PI/2);
ground.rotation.set(0,0,0);
ground.renderOrder=-5;
ground.geometry.userData.worldDriveGroundSegments=GROUND_SEGMENTS;
ground.geometry.userData.worldDriveGroundSize=GROUND_SIZE;
scene.add(ground);

let runtime={
  gameStarted:true,
  menuOpen:false,
  speed:18,
  absX:ORIGIN_X,
  absZ:0,
  heading:0,
  worldOffset:{x:ORIGIN_X,z:0}
};

function naturalHeight(x,z){
  const localX=x-ORIGIN_X;
  return 18*Math.sin(localX/88)+7*Math.sin(z/37)+4*Math.sin((localX+z)/51);
}

const elevation={
  center:{x:ORIGIN_X,z:0},
  loading:false,
  relativeWorldHeight:(x,z)=>naturalHeight(x,z),
  relativeElevationAt:()=>0,
  prefetchAt:()=>Promise.resolve(true),
  diagnostics:()=>({mock:'block3-baseline'})
};

const profile=[];
let cum=0;
for(let i=0;i<81;i++){
  const x=ORIGIN_X-150+i*3.75;
  const z=34*Math.sin(i*.17)+11*Math.sin(i*.057);
  const y=naturalHeight(x,z)+.55*Math.sin(i*.11);
  if(profile.length){
    const previous=profile[profile.length-1];
    cum+=Math.hypot(x-previous.x,z-previous.z);
  }
  profile.push({x,z,y,cum,roll:.025*Math.sin(i*.09)});
}

const terrainService=createTerrainService({
  THREE,
  elevation,
  ground,
  horizonGroup,
  getWorldOffset:()=>runtime.worldOffset,
  applyImagery(){},
  groundSize:GROUND_SIZE,
  groundSegments:GROUND_SEGMENTS
});

// Block 3 measures transition work only. Keep the independent P9.26 horizon
// worker out of this benchmark so its large incremental build cannot obscure
// the retired road-transition cost we are trying to quantify.
const builderTerrain={...terrainService,rebuildHorizonIncremental:undefined};

const noopService={
  center:{x:0,z:0},loading:false,
  prefetchAt:()=>Promise.resolve(true),
  query:()=>''
};
const imagery={
  ...noopService,
  enabled:true,
  deferCommits(){},shiftOrigin(){},realignToOrigin(){},invalidateGeometry(){},
  diagnostics:()=>({mock:true})
};
const water={...noopService,generation:0};
const scenery={...noopService};
const signs={...noopService};

let builder=null;
const coordinator=createStreamingCoordinator({
  createWorldStreaming:()=>({
    prefetchDirectional(){},reset(){},setDistanceScale(){},preloadRoute(){}
  }),
  toLatLon:()=>({lat:0,lon:0}),
  nearestRoute:()=>({cum:profile[Math.floor(profile.length/2)].cum,angle:0}),
  routePointAtCum:value=>({x:ORIGIN_X+value,z:0,angle:0}),
  routePointAtFraction:fraction=>profile[Math.max(0,Math.min(profile.length-1,Math.round((profile.length-1)*fraction)))],
  getRouteLength:()=>profile.at(-1).cum,
  getRoutePointCount:()=>profile.length,
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
  ground,
  terrainService,
  camera:{position:{x:0,z:0}},
  camTarget:{x:0,z:0},
  car:{position:{x:0,z:0}},
  resetStreamedWorldOrigins(){},
  rebuildLocalWorld:()=>builder?.rebuild(),
  prepareLocalWorld:()=>builder?.prepareIncremental(),
  commitPreparedLocalWorld:prepared=>builder?.commitPrepared(prepared),
  cancelLocalWorldPreparation:()=>builder?.cancelPreparation(),
  applyImageryToGround(){},
  markStaticShadowsDirty(){},
  getRuntimeState:()=>runtime,
  setWorldOffset:value=>{runtime={...runtime,worldOffset:value};}
});

function clearGroup(group){
  while(group?.children?.length)group.remove(group.children[0]);
}

builder=createLocalWorldBuilder({
  THREE,
  resetStreamedWorldOrigins(){},
  terrainService:builderTerrain,
  ground,
  clearGroup,
  roadGroup,forestGroup,infrastructureGroup,signGroup,
  sceneryRenderer:{
    clear(){},
    forestStats:()=>({routeCacheKey:null})
  },
  getBridgeFeatureCount:()=>0,
  rebuildBridgeSpans(){},
  buildRoadProfile:()=>profile,
  setActiveRoadProfile(){},
  buildRoadVolume:()=>null,
  buildLateralBand:()=>null,
  buildRibbon:()=>null,
  buildOffsetRibbon:()=>null,
  shoulderMat:null,roadMat:null,lineYellow:null,lineWhite:null,
  ROAD_SURFACE_OFFSET:.1,
  getWorldOffset:()=>runtime.worldOffset,
  rebuildLocalWater(){},
  scheduleVisualJob:(...args)=>coordinator.scheduleVisualJob(...args),
  rebuildLocalScenery(){},
  addEnhancedBridgeFurniture(){},
  refreshRoadSignsOnly(){},
  freezeStaticMatrices(){},
  rebuildHorizon(){},
  markStaticShadowsDirty(){}
});

function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function waitFor(predicate,label,timeoutMs=10000){
  const started=performance.now();
  while(performance.now()-started<timeoutMs){
    if(predicate())return true;
    await wait(20);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

// Baseline path 1: forced/startup rebuild. This is the synchronous P9.25
// transition builder that still allocates and installs road-terrain-transition.
const fullReport=builder.rebuild();
assert.ok(fullReport&&Number.isFinite(fullReport.totalMs),
  'Block 3 full rebuild baseline did not return timing diagnostics');
const terrainAfterFull=terrainService.diagnostics();
const legacyTransitionMs=terrainAfterFull.last?.roadTransition;
assert.ok(Number.isFinite(legacyTransitionMs),
  'Block 3 legacy road-transition timing is missing');
assert.ok(scene.getObjectByName('road-terrain-transition'),
  'Block 3 baseline expected the retired transition mesh to still be allocated');
assert.equal(terrainService.p927Diagnostics().transitionPreparations,0,
  'Full rebuild unexpectedly entered the P9.27 prepared transition path');

// Reset coordinator-only telemetry after the full rebuild so the prepared
// refresh measurements below describe exactly the three requested refreshes.
coordinator.resetTelemetry();
coordinator.state.lastHitchAt=-Infinity;

// A lightweight event-loop frame probe runs while the real incremental work is
// happening. It is observational only: no thresholds are enforced because CI
// runner load is not a gameplay performance contract.
let frameProbeLast=performance.now();
const frameProbe=setInterval(()=>{
  const now=performance.now();
  const frameMs=now-frameProbeLast;
  frameProbeLast=now;
  coordinator.recordFrame(frameMs,now);
},8);

try{
  for(let i=0;i<REFRESH_COUNT;i++){
    const beforeWorld=coordinator.diagnostics().p923.preparedCommits;
    const beforeTransition=terrainService.p927Diagnostics().transitionCommits;
    coordinator.state.lastHitchAt=-Infinity;
    coordinator.markWorldRefresh('recenter');
    assert.equal(coordinator.scheduleWorldRefresh({urgent:false}),true,
      `Prepared world refresh ${i+1} did not schedule`);

    await waitFor(
      ()=>coordinator.diagnostics().p923.preparedCommits===beforeWorld+1,
      `prepared world commit ${i+1}`
    );
    await waitFor(
      ()=>terrainService.p927Diagnostics().transitionCommits===beforeTransition+1,
      `road-transition commit ${i+1}`
    );
  }
}finally{
  clearInterval(frameProbe);
}

// Let the final probe/post-world timer settle before taking the snapshot.
await wait(40);
coordinator.cancelVisualJob?.('post-world-imagery');

const transitionDiag=terrainService.p927Diagnostics();
const streamDiag=coordinator.diagnostics();
const builderDiag=builder.p923Diagnostics();
const roadVisual=streamDiag.visualJobs['road-transition'];

assert.equal(transitionDiag.stateOnlyInstalls,REFRESH_COUNT,
  'Prepared refreshes did not use the state-only road install exactly once each');
assert.equal(transitionDiag.transitionPreparations,REFRESH_COUNT,
  'Retired P9.27 transition was not prepared exactly once per prepared refresh');
assert.equal(transitionDiag.transitionCommits,REFRESH_COUNT,
  'Retired P9.27 transition was not committed exactly once per prepared refresh');
assert.equal(streamDiag.p923.preparedCommits,REFRESH_COUNT,
  'Coordinator prepared-world commit count does not match the benchmark');
assert.equal(builderDiag.preparedCommits,REFRESH_COUNT,
  'Local-world builder prepared commit count does not match the benchmark');
assert.equal(roadVisual?.runs,REFRESH_COUNT,
  'visualJobs did not record the road-transition activity for every refresh');
assert.ok(Number.isFinite(transitionDiag.maxSliceMs),
  'P9.27 max slice timing missing');
assert.ok(Number.isFinite(transitionDiag.maxCommitMs),
  'P9.27 max commit timing missing');
assert.ok(Number.isFinite(transitionDiag.last?.prepareWallMs),
  'P9.27 preparation wall timing missing');
assert.ok(streamDiag.frameBins.gameplayFrames>0,
  'Frame probe did not capture any event-loop frames');
assert.ok(Number.isFinite(streamDiag.p923.maxPreparedCommitMs),
  'Prepared world max commit timing missing');
assert.ok(Number.isFinite(streamDiag.localWorldPhases?.p923?.groundCommitMs),
  'Prepared local-world ground commit timing missing');

const visualAsyncUndercountMs=Math.max(
  0,
  Number(transitionDiag.last.prepareWallMs||0)-Number(roadVisual?.lastMs||0)
);

console.log('POST-REFACTOR ROAD TRANSITION BASELINE R1: PASS');
console.log({
  routeProfile:'deterministic mountain profile',
  profilePoints:profile.length,
  refreshes:REFRESH_COUNT,
  retiredPresentationHidden:true,
  fullRebuild:{
    totalMs:Number(fullReport.totalMs.toFixed(3)),
    terrainRoadBedMs:Number(fullReport.phases.terrainRoadBed.toFixed(3)),
    legacyTransitionMs:Number(legacyTransitionMs.toFixed(3)),
    transitionMeshAllocated:true
  },
  preparedTransition:{
    stateOnlyInstalls:transitionDiag.stateOnlyInstalls,
    preparations:transitionDiag.transitionPreparations,
    commits:transitionDiag.transitionCommits,
    discards:transitionDiag.transitionDiscards,
    maxSliceMs:transitionDiag.maxSliceMs,
    maxCommitMs:transitionDiag.maxCommitMs,
    lastPrepareWallMs:Number((transitionDiag.last?.prepareWallMs||0).toFixed(3)),
    lastPrepareCpuMs:Number((transitionDiag.last?.prepareCpuMs||0).toFixed(3)),
    vertices:transitionDiag.last?.vertices||0,
    triangles:transitionDiag.last?.triangles||0
  },
  visualJobs:{
    roadTransition:roadVisual,
    asyncTimingUndercountMs:Number(visualAsyncUndercountMs.toFixed(3))
  },
  frameProbe:{
    hitchCount:streamDiag.hitchCount,
    maxFrameMs:Number(streamDiag.maxFrameMs.toFixed(3)),
    bins:streamDiag.frameBins
  },
  preparedWorld:{
    lastCommitMs:streamDiag.p923.lastPreparedCommitMs,
    maxCommitMs:streamDiag.p923.maxPreparedCommitMs,
    lastPrepareWallMs:streamDiag.p923.lastPrepareWallMs,
    maxPrepareWallMs:streamDiag.p923.maxPrepareWallMs,
    localWorldTotalMs:streamDiag.localWorldPhases.totalMs,
    groundCommitMs:Number(streamDiag.localWorldPhases.p923.groundCommitMs.toFixed(3))
  }
});