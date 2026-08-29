import assert from 'node:assert/strict';
import {createPerWheelShadowSolver} from './src/physics/per-wheel-shadow-solver.js';
import {
  regulateAbsWheelOmega,
  lockedTireGroundForce
} from './src/physics/braking-tire-control.js';

const DEG=Math.PI/180;

// A service-braked rolling wheel with ABS must not be allowed to integrate all
// the way to zero angular speed while the car is still moving quickly.
{
  const radius=.33;
  const v=30;
  const regulated=regulateAbsWheelOmega({
    nextOmega:0,
    longitudinalSpeed:v,
    radiusM:radius,
    peakSlipRatio:.11,
    serviceBrakeTorqueNm:-2500,
    handbrakeTorqueNm:0,
    absEnabled:true
  });
  assert.equal(regulated.active,true,'ABS should intervene before a high-speed service-brake lock');
  assert.ok(regulated.omega>0,'ABS-regulated wheel must remain rotating forward');
  const slip=(regulated.omega*radius-v)/v;
  assert.ok(Math.abs(slip+.11)<1e-9,`ABS target slip should stay at tire peak, got ${slip}`);
}

// A genuinely locked tire slides on the ground. Its friction vector must oppose
// actual contact-patch motion, not rotate with steering lock. With straight
// body motion there can be no artificial left/right force merely because the
// wheel is pointed 33 degrees right.
{
  const locked=lockedTireGroundForce({
    bodyX:0,
    bodyZ:30,
    normalLoadN:5000,
    slideMu:.85,
    steerAngle:33*DEG,
    localX:0,
    localZ:1.1
  });
  assert.ok(Math.abs(locked.forceX)<1e-9,`locked tire invented lateral force ${locked.forceX}`);
  assert.ok(locked.forceZ<0,'locked tire friction must oppose forward motion');
  assert.ok(Math.abs(locked.yawMomentNm)<1e-9,'centered locked tire must not invent steering yaw');
}

const vehicle={
  id:'wrx',
  massKg:1510,
  wheelbase:2.65,
  trackWidth:1.56,
  frontWeightBias:.58,
  cgHeight:.50,
  yawInertiaScale:.96,
  drivetrain:'AWD',
  driveBiasFront:.45,
  brakeBiasFront:.62,
  absEnabled:true,
  tireProfile:'performance-summer'
};
const frontZ=(1-vehicle.frontWeightBias)*vehicle.wheelbase;
const rearZ=-vehicle.frontWeightBias*vehicle.wheelbase;
const halfTrack=vehicle.trackWidth/2;
const contacts=[
  {front:false,axleIndex:1,side:'left',localX:-halfTrack,localZ:rearZ,contact:true,contactFactor:1},
  {front:true,axleIndex:0,side:'left',localX:-halfTrack,localZ:frontZ,contact:true,contactFactor:1},
  {front:false,axleIndex:1,side:'right',localX:halfTrack,localZ:rearZ,contact:true,contactFactor:1},
  {front:true,axleIndex:0,side:'right',localX:halfTrack,localZ:frontZ,contact:true,contactFactor:1}
];

// User repro: high speed + heavy service braking + full steering lock to the
// right. R7 can promote these per-wheel forces during saturation, so the tire
// solver must never generate a left-yaw reversal from front wheel lock.
const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
let result=null;
for(let i=0;i<72;i++){
  result=solver.advance(1/120,{
    vehicleId:'wrx',vehicle,contacts,
    speed:30,
    heading:0,
    velocityHeading:0,
    yawRate:0,
    centerSteerAngle:33*DEG,
    longitudinalAccel:-8.5,
    lateralAccel:6,
    requestedDriveAccel:0,
    requestedBrakeAccel:-9.5,
    handbrake:false,
    surfaceId:'asphalt-dry'
  });
}

assert.equal(result?.wheelCount,4,'hard-braking QA must resolve all four tires');
const front=result.wheels.filter(w=>w.front);
assert.equal(front.length,2,'hard-braking QA must identify both front tires');
assert.ok(front.every(w=>!w.locked),'ABS-equipped WRX front tires must not stay locked under service braking');
assert.ok(front.some(w=>w.absActive),'ABS telemetry should show front-wheel intervention in this repro');
assert.ok(result.predictedAccelX>0,`right steering under ABS braking must still generate rightward tire force, got ${result.predictedAccelX}`);
assert.ok(result.predictedYawAccel>0,`right steering under ABS braking must not yaw the chassis left, got ${result.predictedYawAccel}`);

console.log('GRIP R8 HARD-BRAKING STEERING QA: PASS');
console.log(JSON.stringify({
  predictedAccelX:result.predictedAccelX,
  predictedAccelZ:result.predictedAccelZ,
  predictedYawAccel:result.predictedYawAccel,
  front:front.map(w=>({
    side:w.side,
    locked:w.locked,
    absActive:w.absActive,
    slipRatio:w.slipRatio,
    slipAngleDeg:w.slipAngle/DEG,
    forceX:w.forceX,
    forceZ:w.forceZ
  }))
},null,2));
