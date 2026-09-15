import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {createDrivingRuntime} from '../src/driving-runtime-base.js';
import {
  advanceSteeringRack,
  clampDynamics,
  computeGradeAcceleration,
  estimateWheelGripUsage,
  laneKeepAssistCommand,
  lateralDynamicsEnvelope,
  longitudinalTractionLimit,
  steeringCommand,
  yawResponseRate
} from '../src/physics/vehicle-dynamics.js';

const G=9.80665;
const RAD_TO_DEG=180/Math.PI;
const vehicle=createVehicleSystem({initialId:'wrx'}).physics;
const contacts=[];
for(let axleIndex=0;axleIndex<vehicle.axles.length;axleIndex++){
  const axle=vehicle.axles[axleIndex];
  const halfTrack=Number(axle.trackWidth||vehicle.trackWidth||1.56)/2;
  contacts.push({
    axleIndex,front:axle.positionM>=0,side:'left',contact:true,contactFactor:1,
    localX:-halfTrack,localZ:axle.positionM
  });
  contacts.push({
    axleIndex,front:axle.positionM>=0,side:'right',contact:true,contactFactor:1,
    localX:halfTrack,localZ:axle.positionM
  });
}

function angleDelta(target,current){
  return Math.atan2(Math.sin(target-current),Math.cos(target-current));
}

function runTurnIn({brakeLeadSec=0,brakePedal=1,turnInput=.38,startKmh=64,frameRate=120}={}){
  const dt=1/frameRate;
  let state={
    absX:0,absZ:0,heading:0,speed:startKmh/3.6,
    steer:0,longitudinalAccel:0,visualSteer:0,currentSteerAngle:0,
    countachBrakeLightRequested:false,countachReverseLightRequested:false,
    lateralGripUsage:0,velocityHeading:0,dynamicYawRate:0,
    wheelGripUsage:[0,0,0,0],wheelSlipLevels:[0,0,0,0],
    wheelLateralUsage:[0,0,0,0],wheelLongitudinalUsage:[0,0,0,0],
    frontSlipAmount:0,rearSlipAmount:0,currentOnPavementForInstruments:true,
    driveHudAccumulator:0,minimapAccumulator:0,gripSolverAccumulator:0,
    worldStreamingAccumulator:0,lastContactModeText:'Route',roadContact:true
  };
  const controls={braking:false,turning:false};
  const gamepadState={connected:true,throttle:0,brake:0,steer:0,hand:false};
  const roadFrame={y:0,pitch:0,roll:0,angle:0,px:0,pz:0,distance:0};
  const dummyElements=new Map();
  const dollar=id=>{
    if(!dummyElements.has(id))dummyElements.set(id,{textContent:''});
    return dummyElements.get(id);
  };
  let capturedBrake=null;
  const traction=(args,out)=>{
    const result=longitudinalTractionLimit(args,out);
    if(args.mode==='brake')capturedBrake=result;
    return result;
  };
  const runtime=createDrivingRuntime({
    getState:()=>state,
    setState:next=>{state={...state,...next};},
    getFlags:()=>({assist:false,autopilot:false,menuOpen:false,maxSpeedKmh:999,maxSpeedMps:999}),
    getRouteLength:()=>3600,
    getWorldOffset:()=>({x:0,z:0}),
    nearestRouteForVehicle:()=>({d:0,cum:220,angle:0,px:state.absX,pz:state.absZ}),
    autopilotControl:()=>({throttle:0,turn:0,hand:false}),
    keyboardActionDown:()=>false,
    gamepadState,
    updateTransmission:()=>0,
    getServiceBrakeInput:()=>controls.braking?brakePedal:0,
    vehiclePresentation:{airborne:false,wheelContacts:contacts,updateSuspensionVisuals(){},updateWheels(){}},
    vehicleVisuals:{updateBrakeLights(){}},
    truckTrailerSystem:{
      active:false,setBrakeLights(){},
      longitudinalScales:()=>({driveAccelScale:1,serviceBrakeScale:1,rollingResistanceAccel:0,aeroDragCoeff:0}),
      driveAccelScaleForSpeed:()=>1,
      tractorYawScale:()=>1
    },
    roadSurfaceGrip:()=>1,
    getVehicleId:()=>vehicle.id||'wrx',
    VEHICLE:vehicle,
    vehicleTopSpeedKmh:()=>vehicle.topSpeedKmh,
    activeTransmissionProfile:()=>({type:'combustion'}),
    effectiveEngineRedlineRpm:()=>6500,
    transmissionRedlineSpeedKmh:()=>200,
    vehicleReverseLimitMps:()=>-15,
    physicsClamp:clampDynamics,
    longitudinalTractionLimit:traction,
    computeGradeAcceleration,
    physicsRoadFrameScratch:{},
    dynamicsScratch:{
      drive:{axleLoads:[]},brake:{axleLoads:[]},brakeLateral:{},combinedBrake:{},
      handbrake:{axleLoads:[]},grade:{},steering:{},lateral:{},
      grip:{axleLoads:[],_lateralTransfer:[],raw:[],smoothed:[],slip:[],lateralSlip:[],lateralUsage:[],longitudinalUsage:[]}
    },
    roadProfileFrameAtCum:()=>roadFrame,
    ensureRoadProfileNear:()=>roadFrame,
    roadFrameAt:()=>roadFrame,
    terrainAbs:()=>0,
    routePointAtCum:()=>({x:state.absX,z:state.absZ,angle:0}),
    laneKeepAssistCommand,
    angleDelta,
    steeringCommand,
    advanceSteeringRack,
    lateralDynamicsEnvelope,
    estimateWheelGripUsage,
    yawResponseRate,
    recenterIfNeeded(){},updateRunChallenge(){},terrainFrameAt:()=>({y:0}),
    ROAD_SURFACE_OFFSET:0,TIRE_VISUAL_CLEARANCE:0,setFastWheelRoadSupport(){},
    car:{position:{x:0,y:0,z:0},rotation:{set(){}}},
    skidMarks:{updateLocal(){}},
    xzToLL:()=>({lat:0,lon:0}),elevationService:{elevationAt:()=>0},altitudeEl:{textContent:''},
    updatePassedSignReadout(){},drawMap(){},worldStreaming:{updateVisible(){}},$:dollar,
    DRIVE_HUD_INTERVAL:999,MINIMAP_INTERVAL:999,GRIP_SOLVER_INTERVAL:1/120,WORLD_STREAMING_INTERVAL:999
  });

  for(let frame=0;frame<30;frame++)runtime.update(dt);
  controls.braking=brakePedal>.001;
  gamepadState.brake=controls.braking?brakePedal:0;
  for(let frame=0;frame<Math.round(brakeLeadSec*frameRate);frame++)runtime.update(dt);
  controls.turning=true;
  gamepadState.steer=-turnInput;

  const timeline=[];
  const totalFrames=Math.round(.75*frameRate);
  let previousTrajectory=state.velocityHeading;
  for(let frame=0;frame<totalFrames;frame++){
    runtime.update(dt);
    const physical=runtime.physicsShadowDiagnostics();
    const envelope=lateralDynamicsEnvelope({
      vehicle,speed:state.speed,steerAngle:state.currentSteerAngle,steerInput:state.steer,
      driveThrottle:0,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,
      rearSlipAmount:0,airborne:false
    },{});
    const attainableYaw=envelope.requestedLatAccel>envelope.latLimit
      ?envelope.yawRate*envelope.latLimit/envelope.requestedLatAccel
      :envelope.yawRate;
    const trajectoryYaw=angleDelta(state.velocityHeading,previousTrajectory)/dt;
    previousTrajectory=state.velocityHeading;
    const front=physical.wheels.filter(wheel=>wheel.front);
    const rear=physical.wheels.filter(wheel=>!wheel.front);
    const loadWeightedUtil=wheels=>{
      const load=wheels.reduce((sum,wheel)=>sum+wheel.normalLoadN,0);
      return load>1?wheels.reduce((sum,wheel)=>sum+wheel.utilization*wheel.normalLoadN,0)/load:0;
    };
    timeline.push({
      t:(frame+1)*dt,
      speedKmh:state.speed*3.6,
      steerDeg:state.currentSteerAngle*RAD_TO_DEG,
      requestedLateralG:envelope.requestedLatAccel/G,
      attainableYawDegS:attainableYaw*RAD_TO_DEG,
      chassisYawDegS:state.dynamicYawRate*RAD_TO_DEG,
      trajectoryYawDegS:trajectoryYaw*RAD_TO_DEG,
      frontSlip:state.frontSlipAmount,
      rearSlip:state.rearSlipAmount,
      brakeG:Math.abs(capturedBrake?.acceleration||0)/G,
      brakeGripScale:physical.serviceBrakeGripScale,
      frontBrakeShare:Number(physical.serviceBrakeShares?.find((_,index)=>vehicle.axles[index]?.positionM>=0)||0),
      frontUtil:loadWeightedUtil(front),
      rearUtil:loadWeightedUtil(rear),
      physicalYawAccel:Number(physical.predictedYawAccel)||0,
      sideslipDeg:angleDelta(state.velocityHeading,state.heading)*RAD_TO_DEG
    });
  }

  const sampleAt=seconds=>timeline[Math.min(timeline.length-1,Math.max(0,Math.round(seconds*frameRate)-1))];
  return {
    brakeLeadSec,brakePedal,turnInput,startKmh,frameRate,
    samples:[.05,.10,.20,.35,.50,.75].map(seconds=>({
      seconds,
      ...Object.fromEntries(Object.entries(sampleAt(seconds)).filter(([key])=>key!=='t').map(([key,value])=>[
        key,Number(value.toFixed(3))
      ]))
    })),
    timeline
  };
}

const coast=runTurnIn({brakePedal:0});
const simultaneous=runTurnIn({brakeLeadSec:0,brakePedal:1});
const brakeFirst=runTurnIn({brakeLeadSec:.20,brakePedal:1});
const aggressiveBrakeFirst=runTurnIn({startKmh:100,turnInput:1,brakeLeadSec:.20,brakePedal:1});
const tightLowSpeed=runTurnIn({startKmh:50,turnInput:1,brakeLeadSec:.20,brakePedal:1});
const tightLowSpeedCoast=runTurnIn({startKmh:50,turnInput:1,brakePedal:0});
const tightLowSpeed60=runTurnIn({startKmh:50,turnInput:1,brakeLeadSec:.20,brakePedal:1,frameRate:60});
const tightLowSpeed30=runTurnIn({startKmh:50,turnInput:1,brakeLeadSec:.20,brakePedal:1,frameRate:30});

const reports=[
  coast,simultaneous,brakeFirst,aggressiveBrakeFirst,tightLowSpeed,
  tightLowSpeedCoast,tightLowSpeed60,tightLowSpeed30
];
for(const report of reports){
  for(const point of report.timeline){
    for(const value of Object.values(point))assert.ok(Number.isFinite(value),'turn-in probe produced non-finite telemetry');
  }
}

const pointAt=(report,seconds)=>
  report.timeline[Math.min(
    report.timeline.length-1,
    Math.max(0,Math.round(seconds*report.frameRate)-1)
  )];
const yawAuthority=point=>
  Math.abs(point.chassisYawDegS)/Math.max(.1,Math.abs(point.attainableYawDegS));

const moderateTurnIn=pointAt(simultaneous,.35);
assert.ok(moderateTurnIn.brakeG>.20,
  `moderate simultaneous turn-in lost all braking: ${moderateTurnIn.brakeG} g`);
assert.ok(yawAuthority(moderateTurnIn)>.90,
  `moderate simultaneous turn-in did not build expected yaw: ${yawAuthority(moderateTurnIn)}`);
assert.ok(Math.max(moderateTurnIn.frontSlip,moderateTurnIn.rearSlip)<.15,
  'moderate simultaneous turn-in produced axle breakaway');

// At full steering demand the lateral-first allocator eventually releases all
// service-brake pressure. A held pedal must not keep selecting brake-specific
// axle-slip telemetry after longitudinal tire force has reached zero. Before
// R3 this left frontSlip near 1, rearSlip at 0, ABS feedback pinned at 0.20 and
// chassis yaw at only ~47% of the friction-limited target indefinitely.
for(const report of [tightLowSpeed,aggressiveBrakeFirst,tightLowSpeed60,tightLowSpeed30]){
  const released=pointAt(report,.75);
  assert.ok(released.brakeG<.01,
    `${report.startKmh} km/h @ ${report.frameRate} Hz did not release infeasible brake force: ${released.brakeG} g`);
  assert.ok(released.brakeGripScale>.95,
    `${report.startKmh} km/h @ ${report.frameRate} Hz kept ABS feedback pinned after brake release: ${released.brakeGripScale}`);
  assert.ok(Math.abs(released.frontSlip-released.rearSlip)<.08,
    `${report.startKmh} km/h @ ${report.frameRate} Hz retained pedal-only front-slip mode: front=${released.frontSlip} rear=${released.rearSlip}`);
  assert.ok(yawAuthority(released)>.74,
    `${report.startKmh} km/h @ ${report.frameRate} Hz retained excessive understeer after brake release: ${yawAuthority(released)}`);
  assert.ok(Math.abs(released.sideslipDeg)<3,
    `${report.startKmh} km/h @ ${report.frameRate} Hz became unstable after brake release: ${released.sideslipDeg} deg`);
}

const summarize=(report,seconds)=>{
  const point=pointAt(report,seconds);
  return {
    frameRate:report.frameRate,
    speedKmh:Number(point.speedKmh.toFixed(1)),
    brakeG:Number(point.brakeG.toFixed(3)),
    frontSlip:Number(point.frontSlip.toFixed(3)),
    rearSlip:Number(point.rearSlip.toFixed(3)),
    yawAuthority:Number(yawAuthority(point).toFixed(3)),
    sideslipDeg:Number(point.sideslipDeg.toFixed(2)),
    brakeGripScale:Number(point.brakeGripScale.toFixed(3))
  };
};

console.log('PHYSICS TRAIL-BRAKING TURN-IN R3 QA: PASS',{
  moderateSimultaneous:summarize(simultaneous,.35),
  tightRelease:[tightLowSpeed,tightLowSpeed60,tightLowSpeed30].map(report=>summarize(report,.75)),
  highwayRelease:summarize(aggressiveBrakeFirst,.75)
});
