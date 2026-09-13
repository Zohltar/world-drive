import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {createDrivingRuntime} from '../src/driving-runtime-base.js';
import {
  clampDynamics,
  computeGradeAcceleration,
  estimateWheelGripUsage,
  lateralDynamicsEnvelope,
  longitudinalTractionLimit,
  steeringCommand,
  advanceSteeringRack,
  yawResponseRate,
  laneKeepAssistCommand
} from '../src/physics/vehicle-dynamics.js';
import {combinedBrakeForceAllocation} from '../src/physics/longitudinal-control.js';

const G=9.80665;
const vehicle=createVehicleSystem({initialId:'wrx'}).physics;
const longitudinalLimit=vehicle.longitudinalAccelLimit;
const lateralLimit=vehicle.lateralAccelLimit;
const targetLateral=.741*G;
const fullBrake=-longitudinalLimit;
const contacts=[];

for(let axleIndex=0;axleIndex<vehicle.axles.length;axleIndex++){
  const axle=vehicle.axles[axleIndex];
  for(const side of ['left','right'])contacts.push({
    axleIndex,
    front:axle.positionM>=0,
    side,
    contact:true,
    contactFactor:1
  });
}

function allocation(input={}){
  return combinedBrakeForceAllocation({
    serviceBrakeAccel:fullBrake,
    longitudinalLimit,
    requestedLateralAccel:targetLateral,
    lateralLimit,
    absEnabled:true,
    airborne:false,
    enabled:true,
    ...input
  },{});
}

function gripAt(brakeAccel){
  return estimateWheelGripUsage({
    requestedLatAccel:targetLateral,
    signedLatAccel:targetLateral,
    latLimit:lateralLimit,
    longitudinalAccel:brakeAccel,
    propulsionAccel:0,
    serviceBrakeAccel:brakeAccel,
    surfaceMu:longitudinalLimit/G,
    throttle:-1,
    handbrake:false,
    airborne:false,
    vehicle,
    speedAbs:20,
    contacts,
    previousUsage:[0,0,0,0],
    dt:.05
  },{});
}

const straight=allocation({requestedLateralAccel:0});
assert.equal(straight.acceleration,fullBrake,'straight-line ABS braking must retain full longitudinal authority');
assert.equal(straight.forceScale,1,'straight-line ABS braking must not be rescaled');

const moderate=allocation({serviceBrakeAccel:-.35*G});
assert.equal(moderate.acceleration,-.35*G,'feasible 0.35 g trail braking must remain untouched');
assert.equal(moderate.forceScale,1,'a feasible combined request must not be rescaled');

const noAbs=allocation({absEnabled:false});
assert.equal(noAbs.acceleration,fullBrake,'no-ABS profiles must retain direct pedal/brake ownership');

const airborne=allocation({airborne:true});
assert.equal(airborne.acceleration,fullBrake,'airborne state must not synthesize a tire-force allocation');

const disabled=allocation({enabled:false});
assert.equal(disabled.acceleration,fullBrake,'disabled/off-road allocation must preserve the established path');

const combined=allocation();
const expectedScale=1/Math.hypot(1,targetLateral/lateralLimit);
assert.ok(Math.abs(combined.forceScale-expectedScale)<1e-12,'combined g-g force scale drifted');
assert.ok(Math.abs(combined.acceleration-fullBrake*expectedScale)<1e-12,'combined brake acceleration is not vector-scaled');
assert.ok(combined.acceleration<-.70*G&&combined.acceleration>-.82*G,
  `full brake in the 0.741 g Laguna trim should retain about 0.76 g longitudinally, got ${combined.acceleration/G} g`);

const legacyGrip=gripAt(fullBrake);
const allocatedGrip=gripAt(combined.acceleration);
assert.ok(legacyGrip.frontLateral>.99&&legacyGrip.rearLateral>.99,
  'baseline no longer reproduces four-wheel saturation under longitudinal-priority braking');
assert.ok(allocatedGrip.netLateralAccel>legacyGrip.netLateralAccel*3,
  'combined allocation did not materially restore lateral tire force');
assert.ok(allocatedGrip.trajectoryLateralCapacityAccel>legacyGrip.trajectoryLateralCapacityAccel*3,
  'combined allocation did not materially restore momentum-direction authority');
assert.ok(allocatedGrip.frictionYawAccel>.15,
  'combined trail braking did not preserve load-transfer yaw into the turn');
assert.ok(allocatedGrip.frontLateral<.99,
  'combined allocation still saturates the front axle like the longitudinal-priority baseline');

const fleetSystem=createVehicleSystem({initialId:'wrx'});
const fleet=[];
for(const profile of fleetSystem.list()){
  fleetSystem.select(profile.id);
  const candidate=fleetSystem.physics;
  const candidateLongitudinal=Math.max(.1,Number(candidate.longitudinalAccelLimit)||G);
  const candidateLateral=Math.max(.1,Number(candidate.lateralAccelLimit)||G);
  const enabled=candidate.vehicleClass!=='tractor';
  const result=combinedBrakeForceAllocation({
    serviceBrakeAccel:-candidateLongitudinal,
    longitudinalLimit:candidateLongitudinal,
    requestedLateralAccel:candidateLateral*.70,
    lateralLimit:candidateLateral,
    absEnabled:candidate.absEnabled!==false,
    airborne:false,
    enabled
  },{});
  assert.ok(Number.isFinite(result.acceleration)&&Number.isFinite(result.forceScale),
    `${profile.id}: non-finite combined brake allocation`);
  assert.ok(Math.abs(result.acceleration)<=candidateLongitudinal+1e-9,
    `${profile.id}: combined allocation exceeded the straight braking limit`);
  if(!enabled||candidate.absEnabled===false){
    assert.equal(result.forceScale,1,`${profile.id}: protected non-ABS/tractor path was rescaled`);
  }else{
    assert.ok(result.forceScale<1&&result.forceScale>.70,
      `${profile.id}: ABS passenger combined allocation escaped the expected g-g envelope`);
  }
  fleet.push({id:profile.id,forceScale:Number(result.forceScale.toFixed(3))});
}

// Exercise the actual driving-runtime ordering. The frame begins in the valid
// R=43.5 m Laguna trim and receives a full keyboard-equivalent service-brake
// command. Capture the exact brake object after the runtime allocates it and
// the value passed into both tire solvers.
function runtimeIntegrationProbe(){
  const radius=43.5;
  const speed=Math.sqrt(targetLateral*radius);
  const steerAngle=3.70*Math.PI/180;
  const beta=-2.62*Math.PI/180;
  const maxSteer=steeringCommand({vehicle,speedAbs:speed,input:1}).maxRoadWheelAngle;
  let state={
    absX:0,absZ:0,heading:0,speed,
    steer:steerAngle/maxSteer,
    longitudinalAccel:0,visualSteer:steerAngle,currentSteerAngle:steerAngle,
    countachBrakeLightRequested:false,countachReverseLightRequested:false,
    lateralGripUsage:0,velocityHeading:beta,dynamicYawRate:speed/radius,
    wheelGripUsage:[0,0,0,0],wheelSlipLevels:[0,0,0,0],
    wheelLateralUsage:[0,0,0,0],wheelLongitudinalUsage:[0,0,0,0],
    frontSlipAmount:0,rearSlipAmount:0,currentOnPavementForInstruments:true,
    driveHudAccumulator:0,minimapAccumulator:0,gripSolverAccumulator:0,
    worldStreamingAccumulator:0,lastContactModeText:'Route',roadContact:true
  };
  const roadFrame={y:0,pitch:0,roll:0,angle:0,px:0,pz:0,distance:0};
  const dummyElements=new Map();
  const dollar=id=>{
    if(!dummyElements.has(id))dummyElements.set(id,{textContent:''});
    return dummyElements.get(id);
  };
  let capturedBrake=null;
  let capturedGripArgs=null;
  let capturedGripResult=null;
  const traction=(args,out)=>{
    const result=longitudinalTractionLimit(args,out);
    if(args.mode==='brake')capturedBrake=result;
    return result;
  };
  const grip=(args,out)=>{
    capturedGripArgs={...args};
    capturedGripResult=estimateWheelGripUsage(args,out);
    return capturedGripResult;
  };
  const holdSteeringCommand=()=>({
    target:steerAngle/maxSteer,
    maxRoadWheelAngle:maxSteer,
    inputSlewRate:100,
    returnSlewRate:100,
    inputRate:100,
    returnRate:100
  });
  const runtime=createDrivingRuntime({
    getState:()=>state,
    setState:next=>{state={...state,...next};},
    getFlags:()=>({assist:false,autopilot:false,menuOpen:false,maxSpeedKmh:999,maxSpeedMps:999}),
    getRouteLength:()=>3600,
    getWorldOffset:()=>({x:0,z:0}),
    nearestRouteForVehicle:()=>({d:0,cum:220,angle:0,px:state.absX,pz:state.absZ}),
    autopilotControl:()=>({throttle:0,turn:0,hand:false}),
    keyboardActionDown:action=>action==='brake',
    gamepadState:{connected:false,throttle:0,brake:0,steer:0,hand:false},
    updateTransmission:()=>0,
    getServiceBrakeInput:()=>1,
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
    angleDelta:(target,current)=>Math.atan2(Math.sin(target-current),Math.cos(target-current)),
    steeringCommand:holdSteeringCommand,
    advanceSteeringRack,
    lateralDynamicsEnvelope,
    estimateWheelGripUsage:grip,
    yawResponseRate,
    recenterIfNeeded(){},updateRunChallenge(){},terrainFrameAt:()=>({y:0}),
    ROAD_SURFACE_OFFSET:0,TIRE_VISUAL_CLEARANCE:0,setFastWheelRoadSupport(){},
    car:{position:{x:0,y:0,z:0},rotation:{set(){}}},
    skidMarks:{updateLocal(){}},
    xzToLL:()=>({lat:0,lon:0}),elevationService:{elevationAt:()=>0},altitudeEl:{textContent:''},
    updatePassedSignReadout(){},drawMap(){},worldStreaming:{updateVisible(){}},$:dollar,
    DRIVE_HUD_INTERVAL:999,MINIMAP_INTERVAL:999,GRIP_SOLVER_INTERVAL:1/120,WORLD_STREAMING_INTERVAL:999
  });

  runtime.update(1/120);
  const firstFrame={
    brakeAccel:capturedBrake.acceleration,
    forceScale:capturedBrake.combinedGripScale,
    tireSolverBrakeAccel:capturedGripArgs.serviceBrakeAccel,
    loadTransferAccel:runtime.physicsShadowDiagnostics().longitudinalLoadTransferAccel
  };
  assert.ok(firstFrame.forceScale<.78&&firstFrame.forceScale>.70,
    `driving runtime did not apply combined braking: ${capturedBrake?.combinedGripScale}`);
  assert.ok(Math.abs(firstFrame.tireSolverBrakeAccel-firstFrame.brakeAccel)<1e-10,
    'aggregate tire solver did not receive allocated brake acceleration');
  assert.ok(Math.abs(firstFrame.loadTransferAccel-firstFrame.brakeAccel)<1e-10,
    'per-wheel tire solver/load transfer did not receive allocated brake acceleration');
  assert.ok(state.speed<speed,'allocated trail brake did not decelerate the runtime vehicle');
  let maxFourWheelSlide=Math.min(state.frontSlipAmount,state.rearSlipAmount);
  let maxFrontSlip=state.frontSlipAmount;
  let maxRearSlip=state.rearSlipAmount;
  let minTrajectoryCapacity=capturedGripResult.trajectoryLateralCapacityAccel;
  for(let frame=1;frame<120;frame++){
    runtime.update(1/120);
    maxFourWheelSlide=Math.max(maxFourWheelSlide,Math.min(state.frontSlipAmount,state.rearSlipAmount));
    maxFrontSlip=Math.max(maxFrontSlip,state.frontSlipAmount);
    maxRearSlip=Math.max(maxRearSlip,state.rearSlipAmount);
    minTrajectoryCapacity=Math.min(minTrajectoryCapacity,capturedGripResult.trajectoryLateralCapacityAccel);
  }
  assert.ok(maxFourWheelSlide<.40,
    `one-second Laguna trail braking reverted to four-wheel sliding: ${maxFourWheelSlide}`);
  assert.ok(Math.abs(state.dynamicYawRate*180/Math.PI)<40,
    `one-second Laguna trail braking produced an unstable yaw rate: ${state.dynamicYawRate*180/Math.PI} deg/s`);
  const report={
    firstBrakeG:Number((Math.abs(firstFrame.brakeAccel)/G).toFixed(3)),
    firstForceScale:Number(firstFrame.forceScale.toFixed(3)),
    tireSolverBrakeG:Number((Math.abs(firstFrame.tireSolverBrakeAccel)/G).toFixed(3)),
    loadTransferBrakeG:Number((Math.abs(firstFrame.loadTransferAccel)/G).toFixed(3)),
    finalSpeedKmh:Number((state.speed*3.6).toFixed(1)),
    maxFourWheelSlide:Number(maxFourWheelSlide.toFixed(3)),
    maxFrontSlip:Number(maxFrontSlip.toFixed(3)),
    maxRearSlip:Number(maxRearSlip.toFixed(3)),
    minTrajectoryCapacityG:Number((minTrajectoryCapacity/G).toFixed(3)),
    finalYawDegS:Number((state.dynamicYawRate*180/Math.PI).toFixed(1))
  };
  return report;
}

const runtimeProbe=runtimeIntegrationProbe();

console.log('PHYSICS COMBINED TRAIL-BRAKING R1 QA: PASS',{
  targetLateralG:Number((targetLateral/G).toFixed(3)),
  unallocatedBrakeG:Number((Math.abs(fullBrake)/G).toFixed(3)),
  allocatedBrakeG:Number((Math.abs(combined.acceleration)/G).toFixed(3)),
  forceScale:Number(combined.forceScale.toFixed(3)),
  legacy:{
    netLateralG:Number((legacyGrip.netLateralAccel/G).toFixed(3)),
    capacityG:Number((legacyGrip.trajectoryLateralCapacityAccel/G).toFixed(3)),
    frontSlip:Number(legacyGrip.frontLateral.toFixed(3)),
    rearSlip:Number(legacyGrip.rearLateral.toFixed(3))
  },
  allocated:{
    netLateralG:Number((allocatedGrip.netLateralAccel/G).toFixed(3)),
    capacityG:Number((allocatedGrip.trajectoryLateralCapacityAccel/G).toFixed(3)),
    yawAccel:Number(allocatedGrip.frictionYawAccel.toFixed(3)),
    frontSlip:Number(allocatedGrip.frontLateral.toFixed(3)),
    rearSlip:Number(allocatedGrip.rearLateral.toFixed(3))
  },
  fleet,
  runtimeProbe
});
