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

const terrainP925Source=fs.readFileSync(
  new URL('../src/terrain-p925.js',import.meta.url),'utf8'
);
const localWorldSource=fs.readFileSync(
  new URL('../src/local-world-builder.js',import.meta.url),'utf8'
);
const worldSceneSource=fs.readFileSync(
  new URL('../src/terrain/world-scene.js',import.meta.url),'utf8'
);

// Block 3 permanent source contract: the presentation worker is retired, but
// the authoritative terrain/road-bed state machinery remains intact.
assert.match(terrainP925Source,/function gradedHeight\(/,
  'Block 3 must preserve authoritative road-bed grading');
assert.match(terrainP925Source,/function renderedTerrainHeight\(/,
  'Block 3 must preserve visible terrain height authority');
assert.match(terrainP925Source,/roadSegmentIndex/,
  'Block 3 must preserve the road spatial index');
assert.match(
  terrainP925Source,
  /function rebuildRoadBedVisual\(\)\{[\s\S]*?if\(activeRoadProfile\.length<2\)\{[\s\S]*?return false;[\s\S]*?\}[\s\S]*?return true;[\s\S]*?const offset=getWorldOffset\(\);/,
  'Block 3 synchronous transition retirement guard missing'
);
assert.doesNotMatch(localWorldSource,/scheduleVisualJob\?\.\(\s*'road-transition'/,
  'Block 3 must not schedule the retired P9.27 road-transition visual job');
assert.doesNotMatch(worldSceneSource,/road-terrain-transition/,
  'Block 3 world scene must not retain retired transition interception');
assert.doesNotMatch(worldSceneSource,/scene\.add\s*=\s*function/,
  'Block 3 must not monkey-patch scene.add for the retired layer');

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
  diagnostics:()=>({mock:'block3-retired-transition'})
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

// Keep the independent P9.26 horizon worker out of this focused benchmark so
// its large incremental build cannot obscure the retired transition contract.
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

// Runtime gate 1: forced/startup rebuild keeps terrain state and performs no
// transition allocation. The diagnostic phase remains for compatibility, but
// it now measures only the retirement guard/cleanup call.
const fullReport=builder.rebuild();
assert.ok(fullReport&&Number.isFinite(fullReport.totalMs),
  'Block 3 full rebuild did not return timing diagnostics');
assert.equal(scene.getObjectByName('road-terrain-transition'),undefined,
  'Block 3 full rebuild allocated the retired road transition mesh');
assert.equal(scene.getObjectByName('road-terrain-transition-p927-hold'),undefined,
  'Block 3 full rebuild retained a P9.27 transition hold mesh');

const terrainAfterFull=terrainService.diagnostics();
assert.ok(Number.isFinite(terrainAfterFull.last?.roadTransition),
  'Block 3 must preserve terrain phase telemetry shape');
assert.equal(terrainService.p927Diagnostics().transitionPreparations,0,
  'Full rebuild unexpectedly entered the P9.27 transition preparation path');
assert.equal(terrainService.p927Diagnostics().transitionCommits,0,
  'Full rebuild unexpectedly committed P9.27 transition geometry');

// Issue #4 regression gate: road-state authority must still grade the visible
// terrain even though the separate presentation ribbon is gone. Scan the real
// profile and require a meaningful cut relative to untouched DEM at some point.
let maxVisibleReduction=0;
for(const point of profile){
  const natural=naturalHeight(point.x,point.z)-.15;
  const rendered=terrainService.renderHeightAt(point.x,point.z);
  assert.ok(Number.isFinite(rendered),'Rendered road terrain height became non-finite');
  assert.ok(rendered<=natural+1e-6,
    'Road terrain authority raised visible terrain above the natural DEM');
  maxVisibleReduction=Math.max(maxVisibleReduction,natural-rendered);
}
assert.ok(maxVisibleReduction>.1,
  'Block 3 accidentally removed road-bed/refined terrain grading authority');

coordinator.resetTelemetry();
coordinator.state.lastHitchAt=-Infinity;

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
    coordinator.state.lastHitchAt=-Infinity;
    coordinator.markWorldRefresh('recenter');
    assert.equal(coordinator.scheduleWorldRefresh({urgent:false}),true,
      `Prepared world refresh ${i+1} did not schedule`);

    await waitFor(
      ()=>coordinator.diagnostics().p923.preparedCommits===beforeWorld+1,
      `prepared world commit ${i+1}`
    );
    // Give any accidentally scheduled visual job enough time to become visible
    // in diagnostics; correct Block 3 runtime schedules none.
    await wait(40);
  }
}finally{
  clearInterval(frameProbe);
}

coordinator.cancelVisualJob?.('post-world-imagery');
const transitionDiag=terrainService.p927Diagnostics();
const streamDiag=coordinator.diagnostics();
const builderDiag=builder.p923Diagnostics();

assert.equal(transitionDiag.stateOnlyInstalls,REFRESH_COUNT,
  'Prepared refreshes must retain the P9.27 state-only road install');
assert.equal(transitionDiag.transitionPreparations,0,
  'Retired P9.27 transition geometry was still prepared');
assert.equal(transitionDiag.transitionCommits,0,
  'Retired P9.27 transition geometry was still committed');
assert.equal(transitionDiag.transitionDiscards,0,
  'Retired P9.27 transition unexpectedly entered discard accounting');
assert.equal(streamDiag.visualJobs['road-transition'],undefined,
  'Retired road-transition visualJobs activity is still present');
assert.equal(streamDiag.p923.preparedCommits,REFRESH_COUNT,
  'Coordinator prepared-world commit count does not match the benchmark');
assert.equal(builderDiag.preparedCommits,REFRESH_COUNT,
  'Local-world builder prepared commit count does not match the benchmark');
assert.equal(scene.getObjectByName('road-terrain-transition'),undefined,
  'Prepared refresh recreated the retired transition mesh');
assert.equal(scene.getObjectByName('road-terrain-transition-p927-hold'),undefined,
  'Prepared refresh recreated the retired transition hold mesh');
assert.ok(streamDiag.frameBins.gameplayFrames>0,
  'Frame probe did not capture any event-loop frames');
assert.ok(Number.isFinite(streamDiag.p923.maxPreparedCommitMs),
  'Prepared world max commit timing missing');
assert.ok(Number.isFinite(streamDiag.localWorldPhases?.p923?.groundCommitMs),
  'Prepared local-world ground commit timing missing');

console.log('POST-REFACTOR ROAD TRANSITION RETIREMENT R1: PASS');
console.log({
  routeProfile:'deterministic mountain profile',
  profilePoints:profile.length,
  refreshes:REFRESH_COUNT,
  issue4Gate:{
    transitionMeshes:0,
    maxVisibleRoadTerrainReductionM:Number(maxVisibleReduction.toFixed(3)),
    roadBedAuthorityPreserved:true
  },
  fullRebuild:{
    totalMs:Number(fullReport.totalMs.toFixed(3)),
    terrainRoadBedMs:Number(fullReport.phases.terrainRoadBed.toFixed(3)),
    retiredTransitionPhaseMs:terrainAfterFull.last.roadTransition,
    transitionMeshAllocated:false,
    baselineLegacyTransitionMs:21.352
  },
  preparedTransition:{
    stateOnlyInstalls:transitionDiag.stateOnlyInstalls,
    preparations:transitionDiag.transitionPreparations,
    commits:transitionDiag.transitionCommits,
    visualJobRuns:0,
    baselineLastPrepareWallMs:88.551,
    baselineLastPrepareCpuMs:8.904
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
  },
  sceneAddInterceptor:false
});