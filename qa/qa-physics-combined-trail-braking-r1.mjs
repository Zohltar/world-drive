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
    vehicle,
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
const globalRemainingScale=Math.sqrt(1-(targetLateral/lateralLimit)**2);
assert.ok(combined.forceScale<globalRemainingScale&&combined.forceScale>.45,
  `axle-aware combined allocation escaped its expected range: ${combined.forceScale}`);
assert.equal(combined.axleLimited,true,'Laguna full-brake trim did not exercise the axle-aware capacity limit');
assert.ok(Math.abs(combined.acceleration)<=combined.axleCombinedCapacityAccel+1e-6,
  'combined brake acceleration exceeded the available axle capacity');
assert.ok(Math.hypot(
  Math.abs(combined.acceleration)/longitudinalLimit,
  targetLateral/lateralLimit
)<=1+1e-12,'combined brake allocation remains outside the g-g envelope');
assert.ok(combined.acceleration<-.45*G&&combined.acceleration>-.55*G,
  `full brake in the 0.741 g Laguna trim should retain about 0.49 g longitudinally, got ${combined.acceleration/G} g`);

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
assert.ok(allocatedGrip.rearLateral<.75,
  `combined allocation still drives the rear axle to breakaway: ${allocatedGrip.rearLateral}`);

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
    vehicle:candidate,
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
    assert.ok(result.forceScale<1&&result.forceScale>.30,
      `${profile.id}: ABS passenger combined allocation escaped the expected g-g envelope`);
  }
  fleet.push({id:profile.id,forceScale:Number(result.forceScale.toFixed(3))});
}

// Exercise the actual driving-runtime ordering. The frame begins in the valid
// R=43.5 m Laguna trim and receives a full keyboard-equivalent service-brake
// command. Capture the exact brake object after the runtime allocates it and
// the value passed into both tire solvers.
function runtimeIntegrationProbe({
  frameRate=120,
  scenario='Laguna R43.5',
  radius=43.5,
  steerDeg=3.70,
  brakePedal=.25
}={}){
  const frameDt=1/frameRate;
  const speed=Math.sqrt(targetLateral*radius);
  const steerAngle=steerDeg*Math.PI/180;
  const maxSteer=steeringCommand({vehicle,speedAbs:speed,input:1}).maxRoadWheelAngle;
  const initialLateral=lateralDynamicsEnvelope({
    vehicle,
    speed,
    steerAngle,
    steerInput:steerAngle/maxSteer,
    driveThrottle:0,
    onPavement:true,
    surfaceGrip:1,
    awdOffroadGripBonus:1,
    rearSlipAmount:0,
    airborne:false
  },{});
  let state={
    absX:0,absZ:0,heading:0,speed,
    steer:steerAngle/maxSteer,
    longitudinalAccel:0,visualSteer:steerAngle,currentSteerAngle:steerAngle,
    countachBrakeLightRequested:false,countachReverseLightRequested:false,
    lateralGripUsage:0,velocityHeading:0,dynamicYawRate:initialLateral.yawRate,
    wheelGripUsage:[0,0,0,0],wheelSlipLevels:[0,0,0,0],
    wheelLateralUsage:[0,0,0,0],wheelLongitudinalUsage:[0,0,0,0],
    frontSlipAmount:0,rearSlipAmount:0,currentOnPavementForInstruments:true,
    driveHudAccumulator:0,minimapAccumulator:0,gripSolverAccumulator:0,
    worldStreamingAccumulator:0,lastContactModeText:'Route',roadContact:true
  };
  let braking=false;
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
    keyboardActionDown:action=>action==='brake'&&braking,
    gamepadState:{connected:false,throttle:0,brake:0,steer:0,hand:false},
    updateTransmission:()=>0,
    getServiceBrakeInput:()=>braking?brakePedal:0,
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

  // Enter the brake phase from the runtime's own settled small-slip corner,
  // not from a synthetic state whose physical and bicycle yaw targets differ.
  for(let frame=0;frame<Math.round(frameRate*.75);frame++)runtime.update(frameDt);
  braking=true;
  runtime.update(frameDt);
  const firstFrame={
    brakeAccel:capturedBrake.acceleration,
    forceScale:capturedBrake.combinedGripScale,
    tireSolverBrakeAccel:capturedGripArgs.serviceBrakeAccel,
    loadTransferAccel:runtime.physicsShadowDiagnostics().longitudinalLoadTransferAccel
  };
  assert.equal(firstFrame.forceScale,1,
    `removed ABS still rescaled direct service braking: ${capturedBrake?.combinedGripScale}`);
  assert.ok(Math.abs(firstFrame.tireSolverBrakeAccel-firstFrame.brakeAccel)<1e-10,
    'aggregate tire solver did not receive allocated brake acceleration');
  assert.ok(Math.abs(firstFrame.loadTransferAccel-firstFrame.brakeAccel)<1e-10,
    'per-wheel tire solver/load transfer did not receive allocated brake acceleration');
  assert.ok(state.speed<speed,'allocated trail brake did not decelerate the runtime vehicle');
  let maxFourWheelSlide=Math.min(state.frontSlipAmount,state.rearSlipAmount);
  let maxFrontSlip=state.frontSlipAmount;
  let maxRearSlip=state.rearSlipAmount;
  let maxSideslipRad=Math.abs(Math.atan2(
    Math.sin(state.velocityHeading-state.heading),
    Math.cos(state.velocityHeading-state.heading)
  ));
  let minTrajectoryCapacity=capturedGripResult.trajectoryLateralCapacityAccel;
  const timeline=[];
  const captureFrames=new Set([
    0,
    Math.max(1,Math.round(frameRate*.05)),
    Math.max(1,Math.round(frameRate*.125)),
    Math.max(1,Math.round(frameRate*.25)),
    Math.max(1,Math.round(frameRate*.50)),
    Math.max(1,Math.round(frameRate*.75)),
    frameRate-1
  ]);
  const captureFrame=frame=>{
    const physical=runtime.physicsShadowDiagnostics();
    const frontWheels=(physical.wheels||[]).filter(wheel=>wheel.front);
    const rearWheels=(physical.wheels||[]).filter(wheel=>!wheel.front);
    const maxUtil=wheels=>wheels.reduce((maximum,wheel)=>Math.max(maximum,Number(wheel.utilization)||0),0);
    timeline.push({
      frame,
      speedKmh:Number((state.speed*3.6).toFixed(1)),
      brakeG:Number((Math.abs(capturedBrake.acceleration)/G).toFixed(3)),
      requestedLateralG:Number((capturedGripArgs.requestedLatAccel/G).toFixed(3)),
      yawDegS:Number((state.dynamicYawRate*180/Math.PI).toFixed(1)),
      sideslipDeg:Number((((state.velocityHeading-state.heading)*180/Math.PI)).toFixed(1)),
      frontSlip:Number(state.frontSlipAmount.toFixed(3)),
      rearSlip:Number(state.rearSlipAmount.toFixed(3)),
      aggregateFrontForceScale:Number(capturedGripResult.frontLateralForceScale.toFixed(3)),
      aggregateRearForceScale:Number(capturedGripResult.rearLateralForceScale.toFixed(3)),
      physicalFrontUtil:Number(maxUtil(frontWheels).toFixed(3)),
      physicalRearUtil:Number(maxUtil(rearWheels).toFixed(3)),
      physicalFrontSlipAngleDeg:Number((frontWheels.reduce((maximum,wheel)=>Math.max(maximum,Math.abs(Number(wheel.slipAngle)||0)),0)*180/Math.PI).toFixed(2)),
      physicalRearSlipAngleDeg:Number((rearWheels.reduce((maximum,wheel)=>Math.max(maximum,Math.abs(Number(wheel.slipAngle)||0)),0)*180/Math.PI).toFixed(2)),
      physicalYawAccel:Number((physical.predictedYawAccel||0).toFixed(3)),
      frontBrakeShare:Number((physical.serviceBrakeShares?.find((_,index)=>vehicle.axles[index]?.positionM>=0)||0).toFixed(3)),
      absActiveWheels:(physical.wheels||[]).filter(wheel=>wheel.absActive).length
    });
  };
  captureFrame(0);
  for(let frame=1;frame<frameRate;frame++){
    runtime.update(frameDt);
    maxFourWheelSlide=Math.max(maxFourWheelSlide,Math.min(state.frontSlipAmount,state.rearSlipAmount));
    maxFrontSlip=Math.max(maxFrontSlip,state.frontSlipAmount);
    maxRearSlip=Math.max(maxRearSlip,state.rearSlipAmount);
    maxSideslipRad=Math.max(maxSideslipRad,Math.abs(Math.atan2(
      Math.sin(state.velocityHeading-state.heading),
      Math.cos(state.velocityHeading-state.heading)
    )));
    minTrajectoryCapacity=Math.min(minTrajectoryCapacity,capturedGripResult.trajectoryLateralCapacityAccel);
    if(captureFrames.has(frame))captureFrame(frame);
  }
  assert.ok(maxFourWheelSlide<.05,
    `partial no-ABS trail braking produced four-wheel slide: ${maxFourWheelSlide}`);
  assert.ok(maxRearSlip<.12,
    `partial no-ABS trail braking broke the rear axle away: ${maxRearSlip}`);
  assert.ok(maxFrontSlip<.05,
    `partial no-ABS trail braking produced excessive front push: ${maxFrontSlip}`);
  assert.ok(maxSideslipRad*180/Math.PI<2.5,
    `partial no-ABS trail braking produced excessive chassis sideslip: ${maxSideslipRad*180/Math.PI} deg`);
  const configuredFrontShare=vehicle.axles.find(axle=>axle.positionM>=0)?.brakeShare||0;
  const initialFrontShare=timeline[0]?.frontBrakeShare||0;
  assert.ok(Math.abs(initialFrontShare-configuredFrontShare)<1e-9,
    `no-ABS runtime replaced mechanical brake bias: ${initialFrontShare}`);
  assert.ok(timeline.every(point=>point.absActiveWheels===0),
    'removed ABS still regulated a wheel during the runtime probe');
  const finalTargetYaw=Math.abs(lateralDynamicsEnvelope({
    vehicle,
    speed:state.speed,
    steerAngle,
    steerInput:steerAngle/maxSteer,
    driveThrottle:0,
    onPavement:true,
    surfaceGrip:1,
    awdOffroadGripBonus:1,
    rearSlipAmount:0,
    airborne:false
  },{}).yawRate);
  assert.ok(Math.abs(state.dynamicYawRate-finalTargetYaw)*180/Math.PI<4,
    `one-second Laguna trail braking did not settle near the steering yaw target: actual=${state.dynamicYawRate*180/Math.PI} target=${finalTargetYaw*180/Math.PI} deg/s`);
  if(Math.abs(capturedGripArgs.requestedLatAccel)<.08*G){
    assert.ok(Math.abs(capturedBrake.acceleration)>.90*longitudinalLimit,
      `straight-line brake authority did not return after lateral demand cleared: ${capturedBrake.acceleration/G} g`);
  }
  const report={
    scenario,
    frameRate,
    brakePedal,
    firstBrakeG:Number((Math.abs(firstFrame.brakeAccel)/G).toFixed(3)),
    firstForceScale:Number(firstFrame.forceScale.toFixed(3)),
    tireSolverBrakeG:Number((Math.abs(firstFrame.tireSolverBrakeAccel)/G).toFixed(3)),
    loadTransferBrakeG:Number((Math.abs(firstFrame.loadTransferAccel)/G).toFixed(3)),
    finalSpeedKmh:Number((state.speed*3.6).toFixed(1)),
    finalBrakeG:Number((Math.abs(capturedBrake.acceleration)/G).toFixed(3)),
    finalRequestedLateralG:Number((Math.abs(capturedGripArgs.requestedLatAccel)/G).toFixed(3)),
    maxFourWheelSlide:Number(maxFourWheelSlide.toFixed(3)),
    maxFrontSlip:Number(maxFrontSlip.toFixed(3)),
    maxRearSlip:Number(maxRearSlip.toFixed(3)),
    maxSideslipDeg:Number((maxSideslipRad*180/Math.PI).toFixed(2)),
    minTrajectoryCapacityG:Number((minTrajectoryCapacity/G).toFixed(3)),
    finalYawDegS:Number((state.dynamicYawRate*180/Math.PI).toFixed(1)),
    timeline
  };
  return report;
}

const runtimeProbes=[120,60,30].map(frameRate=>runtimeIntegrationProbe({frameRate}));
runtimeProbes.push(runtimeIntegrationProbe({
  frameRate:120,
  scenario:'Laguna R18.8',
  radius:18.8,
  steerDeg:8.33
}));
const runtimeProbe=runtimeProbes[0];

console.log('PHYSICS COMBINED TRAIL-BRAKING R2 QA: PASS',JSON.stringify({
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
  runtimeProbe,
  frameRateSummary:runtimeProbes.map(report=>({
    scenario:report.scenario,
    frameRate:report.frameRate,
    finalSpeedKmh:report.finalSpeedKmh,
    finalBrakeG:report.finalBrakeG,
    maxFourWheelSlide:report.maxFourWheelSlide,
    maxFrontSlip:report.maxFrontSlip,
    maxRearSlip:report.maxRearSlip,
    maxSideslipDeg:report.maxSideslipDeg,
    finalYawDegS:report.finalYawDegS
  }))
},null,2));
