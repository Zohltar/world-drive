import {createDrivingRuntime} from './src/driving-runtime-base.js';
import {createVehicleSystem} from './src/vehicles/vehicle-system.js';
import {
  clampDynamics,
  computeGradeAcceleration,
  longitudinalTractionLimit,
  steeringCommand,
  advanceSteeringRack,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage,
  yawResponseRate,
  limitMomentumHeadingDelta,
  laneKeepAssistCommand
} from './src/vehicle-dynamics.js';
import {angleDelta} from './src/routing.js';

const DEG=180/Math.PI;

const PROBES={
  id4:{x:.86,z:1.22},
  wrx:{x:.86,z:1.25},
  civic:{x:1.80*.47,z:2.70*.5},
  sonata:{x:1.86*.47,z:2.80*.5},
  i3_2017:{x:1.78*.47,z:2.57*.5},
  f1_2010:{x:.88,z:1.48},
  countach_80:{x:.885,z:1.225}
};

function contactsFor(id){
  const p=PROBES[id];
  return [
    {localX:-p.x,localZ:-p.z,front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
    {localX:-p.x,localZ: p.z,front:true, side:'left',axleIndex:0,contact:true,contactFactor:1},
    {localX: p.x,localZ:-p.z,front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
    {localX: p.x,localZ: p.z,front:true, side:'right',axleIndex:0,contact:true,contactFactor:1}
  ];
}

function initialState(speed){
  return {
    absX:0,absZ:0,heading:0,speed,steer:0,longitudinalAccel:0,visualSteer:0,currentSteerAngle:0,
    countachBrakeLightRequested:false,countachReverseLightRequested:false,lateralGripUsage:0,
    velocityHeading:0,dynamicYawRate:0,wheelGripUsage:[0,0,0,0],wheelSlipLevels:[0,0,0,0],
    wheelLateralUsage:[0,0,0,0],wheelLongitudinalUsage:[0,0,0,0],frontSlipAmount:0,rearSlipAmount:0,
    currentOnPavementForInstruments:true,driveHudAccumulator:0,minimapAccumulator:0,gripSolverAccumulator:0,
    worldStreamingAccumulator:0,lastContactModeText:'Route',roadContact:true
  };
}

function flatFrame(state){return {y:0,pitch:0,roll:0,angle:0,px:state.absX,pz:state.absZ,distance:0};}

function buildRuntime(id,scenario){
  const system=createVehicleSystem({initialId:id});
  const VEHICLE=system.physics;
  let state=initialState(scenario.initialSpeed);
  let time=0;
  const contacts=contactsFor(id);
  const dummyEls=new Map();
  const dollar=key=>{if(!dummyEls.has(key))dummyEls.set(key,{textContent:''});return dummyEls.get(key);};
  const car={position:{x:0,y:0,z:0},rotation:{set(){}}};
  const controls=action=>{
    if(action==='steerLeft')return scenario.steer(time,state);
    if(action==='steerRight')return false;
    if(action==='handbrake')return scenario.handbrake(time,state);
    if(action==='accelerate')return scenario.accelerate(time,state);
    if(action==='brake'||action==='clutch')return false;
    return false;
  };
  const presentation={
    airborne:false,wheelContacts:contacts,
    updateSuspensionVisuals(){},updateWheels(){}
  };
  const truck={
    active:false,
    longitudinalScales(){return {driveAccelScale:1,serviceBrakeScale:1,rollingResistanceAccel:0,aeroDragCoeff:0};},
    driveAccelScaleForSpeed(){return 1;},tractorYawScale(){return 1;},setBrakeLights(){}
  };
  const runtime=createDrivingRuntime({
    getState:()=>state,
    setState:next=>{state={...state,...next};},
    getFlags:()=>({assist:false,autopilot:false,menuOpen:false,maxSpeedKmh:999,maxSpeedMps:999/3.6}),
    getRouteLength:()=>10000,getWorldOffset:()=>({x:0,z:0}),
    nearestRouteForVehicle:()=>({d:0,cum:500,angle:0,px:state.absX,pz:state.absZ}),
    autopilotControl:()=>({throttle:0,turn:0,hand:false}),
    keyboardActionDown:controls,
    gamepadState:{connected:false,throttle:0,brake:0,steer:0,hand:false,clutch:false},
    updateTransmission:(dt,input)=>input,
    getServiceBrakeInput:()=>0,
    vehiclePresentation:presentation,
    vehicleVisuals:{updateBrakeLights(){},headlightLevel:0},
    truckTrailerSystem:truck,
    roadSurfaceGrip:()=>1,getVehicleId:()=>id,VEHICLE,
    vehicleTopSpeedKmh:()=>VEHICLE.topSpeedKmh||250,
    activeTransmissionProfile:()=>system.active.audio,
    effectiveEngineRedlineRpm:()=>7000,transmissionRedlineSpeedKmh:()=>200,
    vehicleReverseLimitMps:()=>-(VEHICLE.reverseTopSpeedKmh||45)/3.6,
    physicsClamp:clampDynamics,longitudinalTractionLimit,computeGradeAcceleration,
    physicsRoadFrameScratch:{},dynamicsScratch:{drive:{},brake:{},handbrake:{},grade:{},steering:{},lateral:{},grip:{}},
    roadProfileFrameAtCum:()=>flatFrame(state),ensureRoadProfileNear:()=>flatFrame(state),roadFrameAt:()=>flatFrame(state),
    terrainAbs:()=>0,routePointAtCum:()=>({x:state.absX,z:state.absZ,angle:0}),laneKeepAssistCommand,angleDelta,
    steeringCommand,advanceSteeringRack,lateralDynamicsEnvelope,estimateWheelGripUsage,yawResponseRate,limitMomentumHeadingDelta,
    recenterIfNeeded(){},updateRunChallenge(){},terrainFrameAt:()=>({y:0,pitch:0,roll:0}),ROAD_SURFACE_OFFSET:0,
    TIRE_VISUAL_CLEARANCE:0,setFastWheelRoadSupport(){},car,
    skidMarks:{updateLocal(){}},xzToLL:()=>({lat:0,lon:0}),elevationService:{elevationAt:()=>0},altitudeEl:{textContent:''},
    updatePassedSignReadout(){},drawMap(){},worldStreaming:{updateVisible(){}},$:dollar,
    DRIVE_HUD_INTERVAL:999,MINIMAP_INTERVAL:999,GRIP_SOLVER_INTERVAL:1/120,WORLD_STREAMING_INTERVAL:999
  });
  return {
    step(dt){time+=dt;runtime.update(dt);return state;},
    get state(){return state;},get time(){return time;},diagnostics:runtime.physicsShadowDiagnostics,VEHICLE
  };
}

function wrappedDelta(h){return Math.atan2(Math.sin(h),Math.cos(h));}

function run(id,scenario){
  const sim=buildRuntime(id,scenario);
  const dt=1/120;
  let maxHeading=0,maxSlip=0;
  const milestones={};
  let reversalCount=0,lastYawSign=0;
  for(let i=0;i<Math.ceil(scenario.duration/dt);i++){
    const s=sim.step(dt);
    const hd=Math.abs(s.heading)*DEG;
    const slip=Math.abs(wrappedDelta(s.velocityHeading-s.heading))*DEG;
    maxHeading=Math.max(maxHeading,hd);maxSlip=Math.max(maxSlip,slip);
    const ys=Math.sign(s.dynamicYawRate);
    if(lastYawSign&&ys&&ys!==lastYawSign)reversalCount++;
    if(ys)lastYawSign=ys;
    for(const deg of [45,75,85,90,95,120,150,170]){
      if(!milestones[deg]&&hd>=deg)milestones[deg]={t:+sim.time.toFixed(3),speed:+(s.speed*3.6).toFixed(2),yaw:+(s.dynamicYawRate*DEG).toFixed(1),slip:+slip.toFixed(1)};
    }
    if(Math.abs(s.speed)<.08&&sim.time>1)break;
  }
  const s=sim.state;
  return {
    id,scenario:scenario.name,maxHeading:+maxHeading.toFixed(1),maxSlip:+maxSlip.toFixed(1),
    finalSpeedKmh:+(s.speed*3.6).toFixed(1),finalYawDegS:+(s.dynamicYawRate*DEG).toFixed(1),
    finalSlip:+Math.abs(wrappedDelta(s.velocityHeading-s.heading)*DEG).toFixed(1),reversalCount,milestones
  };
}

const scenarios=[
  {
    name:'HB_RELEASE_60KPH',initialSpeed:60/3.6,duration:5,
    steer:()=>true,handbrake:t=>t>=.18&&t<.58,accelerate:()=>false
  },
  {
    name:'HB_HELD_60KPH',initialSpeed:60/3.6,duration:5,
    steer:()=>true,handbrake:t=>t>=.18&&t<3.0,accelerate:()=>false
  },
  {
    name:'HB_RELEASE_THROTTLE_60KPH',initialSpeed:60/3.6,duration:5,
    steer:()=>true,handbrake:t=>t>=.18&&t<.58,accelerate:t=>t>.58
  },
  {
    name:'JTURN_43KPH',initialSpeed:-12,duration:5,
    steer:()=>true,handbrake:()=>false,accelerate:()=>false
  }
];

const ids=['id4','i3_2017','wrx','civic','sonata','countach_80'];
for(const scenario of scenarios){
  console.log(`\n=== ${scenario.name} ===`);
  const rows=ids.map(id=>run(id,scenario));
  if(scenario.name==='HB_HELD_60KPH'){
    for(const targetId of ['id4','i3_2017']){
      const row=rows.find(r=>r.id===targetId);
      const cross=row?.milestones?.[120];
      if(!cross||cross.t>=3.0){
        throw new Error(`${targetId} failed to cross 120deg while handbrake remained applied: ${JSON.stringify(row)}`);
      }
      const at90=row?.milestones?.[90];
      if(!at90||Math.abs(at90.yaw)<75){
        throw new Error(`${targetId} yaw collapsed near 90deg: ${JSON.stringify(row)}`);
      }
    }
  }
  console.table(rows.map(r=>({id:r.id,maxHeading:r.maxHeading,maxSlip:r.maxSlip,finalSpeedKmh:r.finalSpeedKmh,finalYawDegS:r.finalYawDegS,reversalCount:r.reversalCount})));
  for(const r of rows)console.log(r.id,JSON.stringify(r.milestones));
}
