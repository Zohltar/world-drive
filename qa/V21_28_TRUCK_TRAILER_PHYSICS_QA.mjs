import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicle-system.js';
import {GRAVITY,dynamicAxleLoads,steeringCommand,lateralDynamicsEnvelope,estimateWheelGripUsage} from '../src/vehicle-dynamics.js';
import {combinationDynamics,createTrailerState,stepTrailerArticulation} from '../src/truck-trailer.js';

const system=createVehicleSystem({initialId:'wrx'});
assert.equal(system.select('semi_6x4'),true,'truck profile must exist');
const tractor=system.physics;
assert.equal(tractor.vehicleClass,'tractor');
assert.ok(tractor.axles.length>=3,'tractor must retain multi-axle layout');

const trailer={
  massKg:18500,kingpinToCenterM:7.05,kingpinToAxlesM:11.75,axleCount:2,wheelCount:8,
  brakeDecel:4.80,tireCorneringResponse:3.6,maxArticulationRad:1.43,
  rollingResistanceAccel:.035,aeroDragCoeff:.000025
};
const combo=combinationDynamics({tractor,trailer});
assert.ok(combo.totalMassKg>tractor.massKg,'trailer must increase combination mass');
assert.ok(combo.serviceBrakeScale>0&&combo.serviceBrakeScale<=1.01,'combination braking scale must stay bounded');

const loads=dynamicAxleLoads(tractor,-.4*GRAVITY,[]);
assert.equal(loads.length,tractor.axles.length);
assert.ok(loads.every(v=>Number.isFinite(v)&&v>.01),'all tractor axles must remain materially loaded');
assert.ok(Math.abs(loads.reduce((a,b)=>a+b,0)-1)<1e-6,'dynamic axle loads must conserve total load');

const contacts=[];
for(let axleIndex=0;axleIndex<tractor.axles.length;axleIndex++){
  const axle=tractor.axles[axleIndex];
  const perSide=Math.max(1,Math.round((Number(axle.wheelCount)||2)/2));
  for(const side of ['left','right'])for(let i=0;i<perSide;i++)contacts.push({front:axleIndex===0,side,axleIndex,contact:true,contactFactor:1});
}
const grip={};
estimateWheelGripUsage({
  requestedLatAccel:2.2,signedLatAccel:2.2,latLimit:tractor.lateralAccelLimit,
  longitudinalAccel:-.38*GRAVITY,propulsionAccel:0,serviceBrakeAccel:-.38*GRAVITY,
  surfaceMu:tractor.longitudinalAccelLimit/GRAVITY,throttle:0,handbrake:false,
  airborne:false,vehicle:tractor,speedAbs:20,contacts,previousUsage:new Array(contacts.length).fill(0),dt:1/60
},grip);
assert.equal(grip.longitudinalUsage.length,contacts.length);
assert.ok(grip.longitudinalUsage.every(Number.isFinite),'truck tire solver must stay finite');

// Compare the live truck with the live WRX instead of preserving an obsolete
// absolute yaw threshold from the V21.28 steering model.
const truckSteer=steeringCommand({vehicle:tractor,speedAbs:20,input:.75});
const truckEnv=lateralDynamicsEnvelope({vehicle:tractor,speed:20,steerAngle:truckSteer.maxRoadWheelAngle*.75,steerInput:.75,onPavement:true,surfaceGrip:1});
system.select('wrx');
const car=system.physics;
const carSteer=steeringCommand({vehicle:car,speedAbs:20,input:.75});
const carEnv=lateralDynamicsEnvelope({vehicle:car,speed:20,steerAngle:carSteer.maxRoadWheelAngle*.75,steerInput:.75,onPavement:true,surfaceGrip:1});
assert.ok(Number.isFinite(truckEnv.yawRate)&&Number.isFinite(carEnv.yawRate));
assert.ok(Math.abs(truckEnv.yawRate)<Math.abs(carEnv.yawRate),'loaded tractor must remain calmer in yaw than WRX');
assert.ok(truckEnv.latLimit<carEnv.latLimit,'tractor must retain a lower lateral envelope than passenger car');

function runTrailer({speedMps,tractorYawRate,seconds=3}){
  const dt=1/120;let tractorHeading=0,hitchX=0,hitchZ=0;
  const state=createTrailerState({heading:0,hitchX:0,hitchZ:0});
  for(let t=0;t<seconds;t+=dt){
    tractorHeading+=tractorYawRate*dt;
    hitchX+=Math.sin(tractorHeading)*speedMps*dt;
    hitchZ+=Math.cos(tractorHeading)*speedMps*dt;
    stepTrailerArticulation({state,hitchX,hitchZ,tractorHeading,dt,trailer});
  }
  return state;
}
const forward=runTrailer({speedMps:12,tractorYawRate:.10,seconds:4});
const reverse=runTrailer({speedMps:-3.5,tractorYawRate:.12,seconds:5});
assert.ok(reverse.jackknifeRatio>forward.jackknifeRatio,'reverse articulation must remain less stable than forward');
assert.ok(reverse.jackknifeRatio<=1);
assert.ok(Math.abs(reverse.articulation)<=trailer.maxArticulationRad+1e-9);

console.log('V21.31 LIVE TRUCK + TRAILER PHYSICS QA: PASS');
