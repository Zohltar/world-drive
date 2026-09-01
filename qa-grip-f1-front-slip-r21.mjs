import {createDrivingRuntime,gripLossFallbackYawAcceleration} from './src/driving-runtime-base.js';
import {createVehicleSystem} from './src/vehicles/vehicle-system.js';
import {
  clampDynamics,computeGradeAcceleration,longitudinalTractionLimit,
  steeringCommand,advanceSteeringRack,lateralDynamicsEnvelope,estimateWheelGripUsage,
  yawResponseRate,limitMomentumHeadingDelta,laneKeepAssistCommand
} from './src/physics/vehicle-dynamics.js';
import {angleDelta} from './src/routing.js';

const DEG=180/Math.PI;
const PROBES={f1_2010:{x:.88,z:1.48},wrx:{x:.86,z:1.25},countach_80:{x:.885,z:1.225}};
function contactsFor(id){const p=PROBES[id];return [
  {localX:-p.x,localZ:-p.z,front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {localX:-p.x,localZ:p.z,front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {localX:p.x,localZ:-p.z,front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {localX:p.x,localZ:p.z,front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];}
function initialState(speed){return {absX:0,absZ:0,heading:0,speed,steer:0,longitudinalAccel:0,visualSteer:0,currentSteerAngle:0,countachBrakeLightRequested:false,countachReverseLightRequested:false,lateralGripUsage:0,velocityHeading:0,dynamicYawRate:0,wheelGripUsage:[0,0,0,0],wheelSlipLevels:[0,0,0,0],wheelLateralUsage:[0,0,0,0],wheelLongitudinalUsage:[0,0,0,0],frontSlipAmount:0,rearSlipAmount:0,currentOnPavementForInstruments:true,driveHudAccumulator:0,minimapAccumulator:0,gripSolverAccumulator:0,worldStreamingAccumulator:0,lastContactModeText:'Route',roadContact:true};}
function flatFrame(s){return {y:0,pitch:0,roll:0,angle:0,px:s.absX,pz:s.absZ,distance:0};}

function run(id,initialKmh){
  const system=createVehicleSystem({initialId:id}); const VEHICLE=system.physics;
  let state=initialState(initialKmh/3.6),time=0,lastGrip={},lastLat={}; const contacts=contactsFor(id);
  const dummy=new Map(); const $=k=>{if(!dummy.has(k))dummy.set(k,{textContent:''});return dummy.get(k);};
  const controls=a=>a==='steerLeft'&&time>=.20;
  const presentation={airborne:false,wheelContacts:contacts,updateSuspensionVisuals(){},updateWheels(){}};
  const truck={active:false,longitudinalScales(){return {driveAccelScale:1,serviceBrakeScale:1,rollingResistanceAccel:0,aeroDragCoeff:0};},driveAccelScaleForSpeed(){return 1;},tractorYawScale(){return 1;},setBrakeLights(){}};
  const latProbe=(args,out)=>{const r=lateralDynamicsEnvelope(args,out);lastLat={yawRate:r.yawRate,requestedLatAccel:r.requestedLatAccel,latLimit:r.latLimit};return r;};
  const gripProbe=(args,out)=>{const r=estimateWheelGripUsage(args,out);lastGrip={front:r.frontLateral,rear:r.rearLateral,frictionYawAccel:r.frictionYawAccel,frontScale:r.frontLateralForceScale,rearScale:r.rearLateralForceScale,aeroGripScale:r.aeroGripScale};return r;};
  const runtime=createDrivingRuntime({
    getState:()=>state,setState:n=>{state={...state,...n};},getFlags:()=>({assist:false,autopilot:false,menuOpen:false,maxSpeedKmh:999,maxSpeedMps:999/3.6}),
    getRouteLength:()=>10000,getWorldOffset:()=>({x:0,z:0}),nearestRouteForVehicle:()=>({d:0,cum:500,angle:0,px:state.absX,pz:state.absZ}),autopilotControl:()=>({throttle:0,turn:0,hand:false}),keyboardActionDown:controls,gamepadState:{connected:false,throttle:0,brake:0,steer:0,hand:false,clutch:false},updateTransmission:(dt,input)=>input,getServiceBrakeInput:()=>0,
    vehiclePresentation:presentation,vehicleVisuals:{updateBrakeLights(){},headlightLevel:0},truckTrailerSystem:truck,roadSurfaceGrip:()=>1,getVehicleId:()=>id,VEHICLE,vehicleTopSpeedKmh:()=>VEHICLE.topSpeedKmh||350,activeTransmissionProfile:()=>system.active.audio,effectiveEngineRedlineRpm:()=>12000,transmissionRedlineSpeedKmh:()=>350,vehicleReverseLimitMps:()=>-20,
    physicsClamp:clampDynamics,longitudinalTractionLimit,computeGradeAcceleration,physicsRoadFrameScratch:{},dynamicsScratch:{drive:{},brake:{},handbrake:{},grade:{},steering:{},lateral:{},grip:{}},roadProfileFrameAtCum:()=>flatFrame(state),ensureRoadProfileNear:()=>flatFrame(state),roadFrameAt:()=>flatFrame(state),terrainAbs:()=>0,routePointAtCum:()=>({x:state.absX,z:state.absZ,angle:0}),laneKeepAssistCommand,angleDelta,steeringCommand,advanceSteeringRack,lateralDynamicsEnvelope:latProbe,estimateWheelGripUsage:gripProbe,yawResponseRate,limitMomentumHeadingDelta,recenterIfNeeded(){},updateRunChallenge(){},terrainFrameAt:()=>({y:0,pitch:0,roll:0}),ROAD_SURFACE_OFFSET:0,TIRE_VISUAL_CLEARANCE:0,setFastWheelRoadSupport(){},car:{position:{x:0,y:0,z:0},rotation:{set(){}}},skidMarks:{updateLocal(){}},xzToLL:()=>({lat:0,lon:0}),elevationService:{elevationAt:()=>0},altitudeEl:{textContent:''},updatePassedSignReadout(){},drawMap(){},worldStreaming:{updateVisible(){}},$,DRIVE_HUD_INTERVAL:999,MINIMAP_INTERVAL:999,GRIP_SOLVER_INTERVAL:1/120,WORLD_STREAMING_INTERVAL:999
  });
  const dt=1/120,rows=[]; let worst=null;
  for(let i=0;i<2.5/dt;i++){
    time+=dt;runtime.update(dt);
    if(time<.22)continue;
    const frontDominated=(lastGrip.front||0)>(lastGrip.rear||0)+.03 || (lastGrip.frontScale??1)<(lastGrip.rearScale??1)-.015;
    const fallback=gripLossFallbackYawAcceleration({frictionYawAccel:lastGrip.frictionYawAccel,yawRate:lastLat.yawRate,frontSlip:lastGrip.front,rearSlip:lastGrip.rear,frontForceScale:lastGrip.frontScale,rearForceScale:lastGrip.rearScale});
    const sample={t:time,kmh:state.speed*3.6,steerDeg:state.currentSteerAngle*DEG,bicycleYaw:(lastLat.yawRate||0)*DEG,dynYaw:state.dynamicYawRate*DEG,front:lastGrip.front||0,rear:lastGrip.rear||0,frontScale:lastGrip.frontScale??1,rearScale:lastGrip.rearScale??1,rawFallback:(lastGrip.frictionYawAccel||0)*DEG,filteredFallback:fallback*DEG,sideslip:angleDelta(state.velocityHeading,state.heading)*DEG,frontDominated};
    if(frontDominated&&(!worst||sample.dynYaw<worst.dynYaw))worst=sample;
    if(i%30===0)rows.push(sample);
  }
  return {id,initialKmh,worst,rows};
}

const reports=[];
for(const speed of [180,220,260,300])reports.push(run('f1_2010',speed));
for(const speed of [180,220]){reports.push(run('wrx',speed));reports.push(run('countach_80',speed));}
for(const r of reports){
  console.log(`\n${r.id} ${r.initialKmh} km/h worst front-dominated`,r.worst);
  console.table(r.rows.map(x=>({t:+x.t.toFixed(2),kmh:+x.kmh.toFixed(0),steer:+x.steerDeg.toFixed(1),bike:+x.bicycleYaw.toFixed(0),dyn:+x.dynYaw.toFixed(0),front:+x.front.toFixed(2),rear:+x.rear.toFixed(2),fScale:+x.frontScale.toFixed(2),rScale:+x.rearScale.toFixed(2),raw:+x.rawFallback.toFixed(0),filtered:+x.filteredFallback.toFixed(0),slip:+x.sideslip.toFixed(1)})));
}
const highSpeedF1=reports.filter(r=>r.id==='f1_2010'&&r.initialKmh>=220);
for(const r of highSpeedF1){
  if(!r.worst)throw new Error(`F1 ${r.initialKmh}: no front-force-dominated sample captured`);
  if(r.worst.rawFallback*r.worst.bicycleYaw>=0)throw new Error(`F1 ${r.initialKmh}: test did not exercise opposing front-loss yaw`);
  if(Math.abs(r.worst.filteredFallback)>1e-6)throw new Error(`F1 ${r.initialKmh}: front-loss fallback counter-yaw escaped R21 filter: ${JSON.stringify(r.worst)}`);
  if(r.worst.dynYaw<-.5)throw new Error(`F1 ${r.initialKmh}: chassis yaw reversed against steering: ${JSON.stringify(r.worst)}`);
}
// R21 must not erase small balanced axle-force differences on other RWD cars.
for(const r of reports.filter(r=>r.id!=='f1_2010')){
  for(const x of r.rows){
    if(Math.abs(x.frontScale-x.rearScale)<.015&&Math.abs(x.rawFallback)>1e-6&&Math.abs(x.filteredFallback)<1e-9){
      throw new Error(`${r.id}: balanced fallback yaw was incorrectly suppressed: ${JSON.stringify(x)}`);
    }
  }
}
console.log('GRIP R21 F1 HIGH-SPEED FRONT-SLIP QA: PASS',highSpeedF1.map(r=>({speed:r.initialKmh,worst:r.worst})));