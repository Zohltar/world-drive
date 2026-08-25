import assert from 'node:assert/strict';
import {
  GRAVITY,
  dynamicAxleLoads,
  steeringCommand,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage
} from '../src/vehicle-dynamics.js';
import {
  combinationDynamics,
  createTrailerState,
  stepTrailerArticulation
} from '../src/truck-trailer.js';

const TRACTOR={
  drivetrain:'RWD',vehicleClass:'tractor',massKg:8600,cgHeight:1.18,trackWidth:2.04,
  frontWeightBias:.35,brakeBiasFront:.28,driveBiasFront:0,yawInertiaScale:1.34,
  longitudinalAccelLimit:5.6,wheelbase:5.45,maxSteerLow:.64,maxSteerHigh:.095,
  parkingSteerBoost:.38,steeringInputExponent:1.16,steeringResponseLow:2.15,
  steeringResponseMid:2.45,steeringResponseHigh:2.70,steeringCenterToFullTimeSec:1.05,
  steeringReturnToCenterTimeSec:.78,roadGripMultiplier:.94,lateralAccelLimit:4.15,
  accel:2.05,brake:5.20,reverseAccel:1.05,offroadGrip:.48,
  axles:[
    {id:'steer',positionM:2.12,staticLoadFraction:.35,steerFactor:1,driveShare:0,brakeShare:.28,trackWidth:2.04,wheelCount:2},
    {id:'drive-1',positionM:-2.72,staticLoadFraction:.33,steerFactor:0,driveShare:.50,brakeShare:.36,trackWidth:1.86,wheelCount:4},
    {id:'drive-2',positionM:-4.02,staticLoadFraction:.32,steerFactor:0,driveShare:.50,brakeShare:.36,trackWidth:1.86,wheelCount:4}
  ]
};

const TRAILER={
  massKg:18500,kingpinToCenterM:7.05,kingpinToAxlesM:11.75,axleCount:2,wheelCount:8,
  brakeDecel:4.80,tireCorneringResponse:3.6,maxArticulationRad:1.43,
  rollingResistanceAccel:.035,aeroDragCoeff:.000025
};

const combo=combinationDynamics({tractor:TRACTOR,trailer:TRAILER});
assert.equal(combo.totalMassKg,27100,'loaded combination mass must remain 27.1 t');
assert(combo.serviceBrakeScale>.90&&combo.serviceBrakeScale<1.01,'trailer brakes must contribute without boosting braking above tractor calibration');

// 1) Multi-axle load transfer: under a representative 0.4 g stop, the steer
// axle gains load while both tandem axles remain materially loaded.
const loads=dynamicAxleLoads(TRACTOR,-.4*GRAVITY,[]);
assert.equal(loads.length,3,'tractor must retain three physical axles');
assert(loads[0]>.35,'steer axle must gain vertical load under braking');
assert(loads[1]>.20&&loads[2]>.18,'both tandem axles must remain loaded under braking');
assert(Math.abs(loads.reduce((a,b)=>a+b,0)-1)<1e-6,'dynamic axle load fractions must conserve total load');

// 2) Ten wheel contacts feed the generalized per-wheel ABS/EBD solver.
const contacts=[];
for(const axle of TRACTOR.axles){
  const perSide=Math.max(1,axle.wheelCount/2);
  const axleIndex=TRACTOR.axles.indexOf(axle);
  for(const side of ['left','right']){
    for(let i=0;i<perSide;i++)contacts.push({front:axleIndex===0,side,axleIndex,contact:true,contactFactor:1});
  }
}
assert.equal(contacts.length,10,'6x4 tractor must expose ten tire contacts to QA');
const grip={};
estimateWheelGripUsage({
  requestedLatAccel:2.2,signedLatAccel:2.2,latLimit:TRACTOR.lateralAccelLimit,
  longitudinalAccel:-.38*GRAVITY,propulsionAccel:0,serviceBrakeAccel:-.38*GRAVITY,
  surfaceMu:TRACTOR.longitudinalAccelLimit/GRAVITY,throttle:0,handbrake:false,
  airborne:false,vehicle:TRACTOR,speedAbs:20,contacts,previousUsage:new Array(10).fill(0),dt:1/60
},grip);
assert(grip.serviceBrakeAbsEnabled===true,'road tractor must use ABS/EBD');
assert.equal(grip.longitudinalUsage.length,10,'all tractor tires must receive per-wheel utilization');
assert(Math.max(...grip.longitudinalUsage)<1.02,'ABS/EBD must avoid a manufactured wheel lock in moderate trail braking');

// 3) Steering/yaw remains heavy-truck-like. At 72 km/h the requested yaw must
// be much calmer than a passenger car and remain below the calibrated lateral envelope.
const speed=20;
const steering=steeringCommand({vehicle:TRACTOR,speedAbs:speed,input:.75});
const env=lateralDynamicsEnvelope({vehicle:TRACTOR,speed,steerAngle:steering.maxRoadWheelAngle*.75,steerInput:.75,onPavement:true,surfaceGrip:1});
assert(Math.abs(env.yawRate)<.55,'loaded tractor must not rotate with passenger-car yaw authority');
assert(env.latLimit<=TRACTOR.lateralAccelLimit*TRACTOR.roadGripMultiplier+1e-6,'tractor lateral envelope must respect profile grip');

// 4) Trailer articulation remains physical in forward and reverse operation.
function runTrailer({speedMps,tractorYawRate,seconds=3}){
  const dt=1/120;
  let tractorHeading=0,hitchX=0,hitchZ=0;
  const state=createTrailerState({heading:0,hitchX:0,hitchZ:0});
  for(let t=0;t<seconds;t+=dt){
    tractorHeading+=tractorYawRate*dt;
    hitchX+=Math.sin(tractorHeading)*speedMps*dt;
    hitchZ+=Math.cos(tractorHeading)*speedMps*dt;
    stepTrailerArticulation({state,hitchX,hitchZ,tractorHeading,dt,trailer:TRAILER});
  }
  return state;
}
const forward=runTrailer({speedMps:12,tractorYawRate:.10,seconds:4});
assert(Math.abs(forward.articulation)<.55,'forward highway turn must not approach jackknife');
assert(forward.jackknifeRatio<.40,'forward articulation must remain comfortably stable');
const reverse=runTrailer({speedMps:-3.5,tractorYawRate:.12,seconds:5});
assert(reverse.jackknifeRatio>forward.jackknifeRatio,'reverse articulation must remain naturally less stable than forward travel');
assert(reverse.jackknifeRatio<=1,'jackknife ratio must stay bounded');
assert(Math.abs(reverse.articulation)<=TRAILER.maxArticulationRad+1e-9,'fifth-wheel articulation hard limit must remain enforced');

console.table({
  combination:{mass_kg:combo.totalMassKg,brake_scale:+combo.serviceBrakeScale.toFixed(3)},
  braking:{steer_axle:+loads[0].toFixed(3),drive1:+loads[1].toFixed(3),drive2:+loads[2].toFixed(3),max_brake_util:+Math.max(...grip.longitudinalUsage).toFixed(3)},
  steering:{road_wheel_deg:+(steering.maxRoadWheelAngle*180/Math.PI).toFixed(1),yaw_deg_s:+(Math.abs(env.yawRate)*180/Math.PI).toFixed(1),lat_g:+(env.latLimit/GRAVITY).toFixed(2)},
  trailer:{forward_art_deg:+(Math.abs(forward.articulation)*180/Math.PI).toFixed(1),reverse_art_deg:+(Math.abs(reverse.articulation)*180/Math.PI).toFixed(1),reverse_jackknife:+reverse.jackknifeRatio.toFixed(2)}
});
console.log('V21.28 TRUCK + TRAILER PHYSICS QA: PASS');
