import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicle-system.js';
import {
  GRAVITY,
  vehicleLayout,
  steeringCommand,
  longitudinalTractionLimit,
  lateralDynamicsEnvelope
} from '../src/vehicle-dynamics.js';
import {
  combinationDynamics,
  createTrailerState,
  stepTrailerArticulation
} from '../src/truck-trailer.js';

const approx=(a,b,t=1e-8)=>Math.abs(a-b)<=t;
const deg=r=>r*180/Math.PI;

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));

const fleet=createVehicleSystem({initialId:'wrx'});
const ids=fleet.list().map(v=>v.id);
assert.equal(ids.length,8,'V21.23.0 fleet should contain 7 cars + truck');
assert.ok(ids.includes('semi_6x4'),'truck profile missing from selector registry');

const truck=createVehicleSystem({initialId:'semi_6x4'});
const v=truck.physics;
const trailer=truck.active.trailer;
const layout=vehicleLayout(v);

assert.equal(v.vehicleClass,'tractor');
assert.equal(v.drivetrain,'RWD');
assert.equal(v.massKg,8600);
assert.equal(v.wheelbase,5.45);
assert.equal(v.reverseTopSpeedKmh,18);
assert.equal(layout.axles.length,3,'tractor must preserve all three axles');
assert.equal(layout.axles.reduce((s,a)=>s+a.wheelCount,0),10,'6x4 tractor should expose 10 tire contacts');
assert.ok(approx(layout.axles.reduce((s,a)=>s+a.staticLoadFraction,0),1));
assert.ok(approx(layout.axles.reduce((s,a)=>s+a.driveShare,0),1));
assert.ok(approx(layout.axles.reduce((s,a)=>s+a.brakeShare,0),1));
assert.equal(layout.axles[0].steerFactor,1);
assert.equal(layout.axles[0].driveShare,0);
assert.ok(layout.axles[1].driveShare>0&&layout.axles[2].driveShare>0);

assert.equal(trailer.type,'dry-van');
assert.equal(trailer.lengthM,16.15);
assert.equal(trailer.axleCount,2);
assert.equal(trailer.wheelCount,8);
assert.equal(trailer.massKg,18500);

const combo=combinationDynamics({tractor:v,trailer});
assert.equal(combo.totalMassKg,27100);
assert.ok(combo.driveAccelScale>.30&&combo.driveAccelScale<.50,'loaded combination must accelerate much slower than bobtail');
assert.ok(combo.serviceBrakeScale>.80&&combo.serviceBrakeScale<=1,'trailer air brakes should support but not outperform tractor braking');
assert.ok(combo.rollingResistanceAccel>0&&combo.aeroDragCoeff>0);

// Low-speed tractor geometry: similar wheel angle to a real road tractor but
// much longer wheelbase than the WRX, therefore a substantially larger radius.
const truckSteer=steeringCommand({vehicle:v,speedAbs:0,input:1});
const truckRadius=v.wheelbase/Math.tan(truckSteer.maxRoadWheelAngle);
const wrx=createVehicleSystem({initialId:'wrx'}).physics;
const wrxSteer=steeringCommand({vehicle:wrx,speedAbs:0,input:1});
const wrxRadius=wrx.wheelbase/Math.tan(wrxSteer.maxRoadWheelAngle);
assert.ok(truckRadius>6.5&&truckRadius<9.5,`tractor turn radius ${truckRadius.toFixed(2)} m`);
assert.ok(truckRadius>wrxRadius*1.6,'tractor must turn materially wider than WRX');
assert.ok(v.yawInertiaKgM2>wrx.yawInertiaKgM2*20,'truck yaw inertia must be radically larger than car');
assert.ok(v.lateralAccelLimit/GRAVITY<.46,'loaded tractor base lateral envelope should be truck-like');

// Loaded longitudinal calibration.
const driveRequest=v.accel*combo.driveAccelScale;
const roadMu=Math.max(.25,v.longitudinalAccelLimit/GRAVITY);
const deliveredDrive=longitudinalTractionLimit({
  vehicle:v,requestedAccel:driveRequest,surfaceMu:roadMu,mode:'drive',airborne:false,speedAbs:0
}).acceleration;
const brakeRequest=-v.brake*combo.serviceBrakeScale;
const deliveredBrake=longitudinalTractionLimit({
  vehicle:v,requestedAccel:brakeRequest,surfaceMu:roadMu,mode:'brake',airborne:false,speedAbs:25
}).acceleration;
assert.ok(deliveredDrive>.55&&deliveredDrive<1.05,`loaded launch accel ${deliveredDrive.toFixed(3)} m/s2`);
assert.ok(Math.abs(deliveredBrake)>4.2&&Math.abs(deliveredBrake)<5.4,`loaded braking ${deliveredBrake.toFixed(3)} m/s2`);

// High-speed steering/yaw remains finite and below the truck lateral limit.
for(const kph of [20,50,80,105]){
  const speed=kph/3.6;
  const steer=steeringCommand({vehicle:v,speedAbs:speed,input:1});
  const env=lateralDynamicsEnvelope({
    vehicle:v,speed,steerAngle:steer.maxRoadWheelAngle*steer.target,
    steerInput:steer.target,driveThrottle:.5,onPavement:true,surfaceGrip:1,
    awdOffroadGripBonus:1,rearSlipAmount:0,airborne:false
  });
  assert.ok(Number.isFinite(env.yawRate)&&Number.isFinite(env.latLimit));
  assert.ok(env.latLimit<=v.lateralAccelLimit+1e-9);
}

function simulateStraight({reverse=false,initialDeg=5,seconds=10,speed=8}){
  const tractorHeading=0;
  let hitchX=0,hitchZ=0;
  const state=createTrailerState({
    heading:-initialDeg*Math.PI/180,
    hitchX,hitchZ
  });
  const dt=.01;
  const signedSpeed=reverse?-Math.abs(speed):Math.abs(speed);
  const samples=[];
  for(let t=0;t<seconds;t+=dt){
    hitchX+=Math.sin(tractorHeading)*signedSpeed*dt;
    hitchZ+=Math.cos(tractorHeading)*signedSpeed*dt;
    stepTrailerArticulation({state,hitchX,hitchZ,tractorHeading,dt,trailer});
    samples.push(Math.abs(state.articulation));
  }
  return {state,samples};
}

// Forward motion is self-stabilizing.
const forward=simulateStraight({reverse:false,initialDeg:12,seconds:8,speed:9});
assert.ok(Math.abs(deg(forward.state.articulation))<1,'forward trailer must converge behind tractor');

// Reverse motion is naturally unstable: a small initial angle grows without a
// scripted reverse-specific yaw term.
const reverse=simulateStraight({reverse:true,initialDeg:3,seconds:10,speed:3});
assert.ok(Math.abs(deg(reverse.state.articulation))>15,'reverse articulation should grow naturally');

// Physical articulation stop prevents the trailer from rotating through cab.
const reverseLong=simulateStraight({reverse:true,initialDeg:18,seconds:40,speed:4});
assert.ok(Math.abs(reverseLong.state.articulation)<=trailer.maxArticulationRad+1e-10);
assert.ok(reverseLong.state.jackknifeRatio<=1+1e-12);

// Circular forward path: trailer must articulate and track, not stay welded to tractor.
{
  const radius=18;
  const speed=7;
  const dt=.01;
  let theta=0;
  let hitchX=0,hitchZ=0;
  let state=createTrailerState({heading:0,hitchX,hitchZ});
  let maxArt=0;
  for(let t=0;t<12;t+=dt){
    theta+=speed/radius*dt;
    const tractorHeading=theta;
    hitchX=radius*(1-Math.cos(theta));
    hitchZ=radius*Math.sin(theta);
    stepTrailerArticulation({state,hitchX,hitchZ,tractorHeading,dt,trailer});
    maxArt=Math.max(maxArt,Math.abs(state.articulation));
  }
  assert.ok(deg(maxArt)>8,'trailer should articulate in a sustained turn');
  assert.ok(deg(maxArt)<60,'normal forward turn should remain below jackknife range');
}

// Static integration checks: truck module is wired into the same vehicle loop,
// with a truck-specific reverse cap and no hard-coded four-wheel reset left in
// placeAt/resetToRoad.
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(main,/createTruckTrailerSystem/);
assert.match(main,/truckTrailerSystem\.longitudinalScales\(\)/);
assert.match(main,/truckTrailerSystem\.update\(/);
assert.match(main,/truckTrailerSystem\.adjustCamera\(/);
assert.match(main,/vehicleReverseLimitMps\(\)/);
assert.match(main,/version:'21\.23\.0-candidate'/);
assert.doesNotMatch(main,/function resetToRoad\(\)[^]*wheelGripUsage=\[0,0,0,0\]/);

console.log('V21.23.0 TRUCK + TRAILER QA: PASS');
console.table({
  tractorMassKg:v.massKg,
  trailerMassKg:trailer.massKg,
  combinationMassKg:combo.totalMassKg,
  tractorAxles:layout.axles.length,
  tractorTireContacts:layout.axles.reduce((s,a)=>s+a.wheelCount,0),
  trailerAxles:trailer.axleCount,
  trailerWheels:trailer.wheelCount,
  parkingTurnRadiusM:truckRadius.toFixed(2),
  yawInertiaRatioVsWRX:(v.yawInertiaKgM2/wrx.yawInertiaKgM2).toFixed(1),
  loadedLaunchAccelMs2:deliveredDrive.toFixed(2),
  loadedBrakeAccelMs2:Math.abs(deliveredBrake).toFixed(2),
  forwardResidualArticulationDeg:Math.abs(deg(forward.state.articulation)).toFixed(3),
  reverseArticulationDeg:Math.abs(deg(reverse.state.articulation)).toFixed(1)
});
