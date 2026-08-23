import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const runtimePath=path.join(root,'src','driving-runtime.js');

assert.ok(fs.existsSync(runtimePath),'src/driving-runtime.js missing — run tools/refactor-main-driving-v21-26.mjs first');

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
const runtimeSource=fs.readFileSync(runtimePath,'utf8').replace(/\r\n/g,'\n');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(result.status,0,`${path.basename(file)} syntax failed:\n${result.stderr||result.stdout}`);
}

syntaxCheck(mainPath);
syntaxCheck(runtimePath);

assert.match(main,/import \{ createDrivingRuntime \} from '\.\/driving-runtime\.js';/,'main.js missing driving runtime import');
assert.match(main,/let drivingRuntime=null;\s*function updateDrive\(dt\)\{\s*drivingRuntime\?\.update\(dt\);\s*\}/s,'main.js missing narrow updateDrive facade');
assert.doesNotMatch(main,/const driveForce=longitudinalTractionLimit/,'legacy longitudinal updateDrive implementation still remains in main.js');
assert.doesNotMatch(main,/HIGH-SPEED LATERAL FORCE BUILDUP/,'legacy lateral/yaw updateDrive implementation still remains in main.js');
assert.match(runtimeSource,/const driveForce=longitudinalTractionLimit/,'driving-runtime.js missing longitudinal dynamics');
assert.match(runtimeSource,/HIGH-SPEED LATERAL FORCE BUILDUP/,'driving-runtime.js missing lateral/yaw dynamics');
assert.match(runtimeSource,/syncState\(\);\s*recenterIfNeeded\(absX,absZ\);\s*const worldOffset=getWorldOffset\(\);/s,'driving runtime must synchronize current state before floating-origin recenter');
assert.match(runtimeSource,/setFastWheelRoadSupport\(onRoad,roadFrame,centerRoadSurfaceY,absX,absZ\)/,'driving runtime must pass current local position into fast wheel support');
assert.match(main,/function setFastWheelRoadSupport\(active,roadFrame,centerY,centerX=absX,centerZ=absZ\)/,'main fast wheel support facade was not made position-explicit');

const initIndex=main.indexOf('drivingRuntime=createDrivingRuntime({');
const worldStreamingIndex=main.indexOf('const worldStreaming=streamingCoordinator.worldStreaming;');
const minimapIndex=main.indexOf('const minimapSystem=createMinimapSystem({');
assert.ok(initIndex>worldStreamingIndex,'driving runtime initialized before worldStreaming');
assert.ok(initIndex>minimapIndex,'driving runtime initialized before minimap/sign dependencies');

const mainLines=main.split('\n').length;
assert.ok(mainLines<4700,`main.js still unexpectedly large after driving extraction: ${mainLines} lines`);

const { createDrivingRuntime }=await import(`${pathToFileURL(runtimePath).href}?qa=${Date.now()}`);
assert.equal(typeof createDrivingRuntime,'function','createDrivingRuntime export missing');

const initialState={
  absX:0,
  absZ:0,
  heading:0,
  speed:0,
  steer:0,
  longitudinalAccel:0,
  visualSteer:0,
  currentSteerAngle:0,
  countachBrakeLightRequested:false,
  countachReverseLightRequested:false,
  lateralGripUsage:0,
  velocityHeading:0,
  dynamicYawRate:0,
  wheelGripUsage:[0,0,0,0],
  wheelSlipLevels:[0,0,0,0],
  wheelLateralUsage:[0,0,0,0],
  wheelLongitudinalUsage:[0,0,0,0],
  frontSlipAmount:0,
  rearSlipAmount:0,
  currentOnPavementForInstruments:true,
  driveHudAccumulator:0,
  minimapAccumulator:0,
  gripSolverAccumulator:.05,
  worldStreamingAccumulator:0,
  lastContactModeText:'',
  roadContact:true
};

let liveState={...initialState};
let stateWrites=0;
const hud=new Map();
const $=id=>{
  if(!hud.has(id))hud.set(id,{textContent:''});
  return hud.get(id);
};
const roadFrame={
  x:0,z:0,px:0,pz:0,y:0,
  angle:0,pitch:0,roll:0,distance:0
};
const physicsClamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const angleDelta=(target,current)=>{
  let d=(target-current+Math.PI)%(Math.PI*2)-Math.PI;
  if(d<-Math.PI)d+=Math.PI*2;
  return d;
};
const gripResult={
  smoothed:[0,0,0,0],
  slip:[0,0,0,0],
  lateralUsage:[0,0,0,0],
  longitudinalUsage:[0,0,0,0],
  frontLateral:0,
  rearLateral:0,
  frictionYawAccel:0,
  netLateralAccel:0,
  rearLateralForceScale:1,
  trajectoryLateralCapacityAccel:8
};
const dynamicsScratch={
  drive:{},brake:{},handbrake:{},grade:{},steering:{},lateral:{},
  grip:{...gripResult}
};

const runtime=createDrivingRuntime({
  getState:()=>({...liveState}),
  setState:next=>{liveState={...next};stateWrites++;},
  getFlags:()=>({assist:false,autopilot:false,menuOpen:false,maxSpeedKmh:200,maxSpeedMps:200/3.6}),
  getRouteLength:()=>1000,
  getWorldOffset:()=>({x:0,z:0}),
  nearestRouteForVehicle:()=>({i:0,t:0,px:0,pz:0,d:0,angle:0,cum:0,len:100}),
  autopilotControl:()=>({throttle:0,turn:0,hand:false}),
  keyboardActionDown:()=>false,
  gamepadState:{connected:false,throttle:0,brake:0,steer:0,hand:false},
  updateTransmission:(_dt,throttle)=>throttle,
  vehiclePresentation:{
    airborne:false,
    wheelContacts:[],
    updateSuspensionVisuals(){},
    updateWheels(){}
  },
  vehicleVisuals:{updateBrakeLights(){}},
  truckTrailerSystem:{
    active:false,
    setBrakeLights(){},
    longitudinalScales:()=>({driveAccelScale:1,serviceBrakeScale:1,rollingResistanceAccel:0,aeroDragCoeff:0}),
    driveAccelScaleForSpeed:()=>1,
    tractorYawScale:()=>1
  },
  roadSurfaceGrip:()=>1,
  VEHICLE:{
    drivetrain:'AWD',
    accel:4,
    brake:8,
    reverseAccel:2.5,
    longitudinalAccelLimit:8,
    offroadGrip:.6,
    offroadDrag:.25,
    rolling:.02,
    aero:.0005,
    topSpeedKmh:200
  },
  vehicleTopSpeedKmh:()=>200,
  activeTransmissionProfile:()=>({type:'ev'}),
  effectiveEngineRedlineRpm:()=>6500,
  transmissionRedlineSpeedKmh:()=>200,
  vehicleReverseLimitMps:()=>-10,
  physicsClamp,
  longitudinalTractionLimit:({requestedAccel})=>({acceleration:requestedAccel}),
  computeGradeAcceleration:()=>({acceleration:0}),
  physicsRoadFrameScratch:{},
  dynamicsScratch,
  roadProfileFrameAtCum:()=>roadFrame,
  ensureRoadProfileNear:()=>roadFrame,
  roadFrameAt:()=>roadFrame,
  terrainAbs:()=>0,
  routePointAtCum:cum=>({x:0,z:cum,cum,angle:0}),
  laneKeepAssistCommand:()=>({input:0}),
  angleDelta,
  steeringCommand:()=>({target:0,maxRoadWheelAngle:.5,inputSlewRate:10,returnSlewRate:10,inputRate:10,returnRate:10}),
  advanceSteeringRack:({target})=>target,
  lateralDynamicsEnvelope:()=>({
    yawRate:0,
    drivetrain:'AWD',
    powerCorneringLoad:0,
    requestedLatAccel:0,
    latLimit:8,
    signedLatAccel:0
  }),
  estimateWheelGripUsage:()=>gripResult,
  yawResponseRate:()=>8,
  limitMomentumHeadingDelta:({attemptedDelta})=>attemptedDelta,
  recenterIfNeeded:()=>false,
  updateRunChallenge(){},
  terrainFrameAt:()=>({y:0}),
  ROAD_SURFACE_OFFSET:.1,
  TIRE_VISUAL_CLEARANCE:.018,
  setFastWheelRoadSupport(){},
  car:{position:{x:0,y:0,z:0},rotation:{set(){}}},
  skidMarks:{updateLocal(){}},
  xzToLL:()=>({lat:0,lon:0}),
  elevationService:{elevationAt:()=>0},
  altitudeEl:{textContent:''},
  updatePassedSignReadout(){},
  drawMap(){},
  worldStreaming:{updateVisible(){}},
  $,
  DRIVE_HUD_INTERVAL:.10,
  MINIMAP_INTERVAL:.20,
  GRIP_SOLVER_INTERVAL:.05,
  WORLD_STREAMING_INTERVAL:.12
});

runtime.update(1/60);

assert.ok(stateWrites>=2,`expected mid-frame + end-frame state synchronization, got ${stateWrites}`);
for(const key of ['absX','absZ','heading','speed','steer','longitudinalAccel','velocityHeading','dynamicYawRate']){
  assert.ok(Number.isFinite(liveState[key]),`${key} became non-finite in driving runtime smoke test`);
}
assert.equal(liveState.currentOnPavementForInstruments,true,'road contact state changed unexpectedly in smoke test');
assert.equal(hud.get('contactMode')?.textContent,'Route','road/terrain contact HUD did not update through extracted runtime');

console.log('V21.26 DRIVING REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; driving-runtime.js: ${runtimeSource.split('\n').length} lines`);
console.log('updateDrive ownership: extracted; state synchronization, floating-origin ordering and smoke runtime verified');
