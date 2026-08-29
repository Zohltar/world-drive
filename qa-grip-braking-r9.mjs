import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  serviceBrakeAcceleration,
  shouldAutoClutchForServiceBrake,
  brakeWouldCrossZero
} from './src/physics/longitudinal-control.js';
import {bodyRelativeLongitudinalSpeed} from './src/driving-runtime-base.js';
import {createPerWheelShadowSolver} from './src/physics/per-wheel-shadow-solver.js';

const DEG=Math.PI/180;
const BRAKE=8.8;

assert.equal(serviceBrakeAcceleration({serviceBrake:1,speed:20,maxBrakeAccel:BRAKE}),-BRAKE,'forward brake must oppose positive momentum');
assert.equal(serviceBrakeAcceleration({serviceBrake:1,speed:-20,maxBrakeAccel:BRAKE}),BRAKE,'reverse brake must oppose negative momentum');
assert.equal(serviceBrakeAcceleration({serviceBrake:.5,speed:-20,maxBrakeAccel:BRAKE}),BRAKE*.5,'reverse brake must scale with pedal');
assert.equal(serviceBrakeAcceleration({serviceBrake:1,speed:20,maxBrakeAccel:BRAKE,airborne:true}),0,'airborne service brake cannot decelerate chassis through tire force');

// At 90 degrees into a J-turn, body-longitudinal speed is ~zero while the car
// still has large real momentum. Legacy code treated this as standstill, dropped
// the brake channel and could auto-clutch. R9 must use actual speed magnitude.
const jTurn={speed:20,heading:90*DEG,velocityHeading:0};
const jBody=bodyRelativeLongitudinalSpeed(jTurn);
assert.ok(Math.abs(jBody)<1e-8,`90deg J-turn body speed should be ~0, got ${jBody}`);
assert.equal(serviceBrakeAcceleration({serviceBrake:1,speed:jTurn.speed,maxBrakeAccel:BRAKE}),-BRAKE,'J-turn service brake must remain active across 90 degrees');
assert.equal(shouldAutoClutchForServiceBrake({serviceBrake:1,speed:jTurn.speed}),false,'fast sideways J-turn must not trigger stationary auto-clutch');
assert.equal(shouldAutoClutchForServiceBrake({serviceBrake:1,speed:.1}),true,'true near-stop braking may auto-clutch');

// At 180 degrees the chassis sees rearward body motion, but the scalar momentum
// is still positive. Service brake must keep removing that momentum instead of
// becoming reverse/forward drivetrain torque.
const post180={speed:20,heading:Math.PI,velocityHeading:0};
assert.ok(bodyRelativeLongitudinalSpeed(post180)<0,'post-180 sample must be rearward relative to chassis');
assert.equal(serviceBrakeAcceleration({serviceBrake:1,speed:post180.speed,maxBrakeAccel:BRAKE}),-BRAKE,'post-180 brake direction must follow momentum, not body axis');
assert.equal(brakeWouldCrossZero({previousSpeed:1,nextSpeed:-.1,serviceBrake:1}),true,'service brake must clamp at zero rather than reverse vehicle');
assert.equal(brakeWouldCrossZero({previousSpeed:1,nextSpeed:-.1,serviceBrake:0}),false);

// Reverse braking must also reach the physical per-wheel ABS path, not be
// disguised as positive engine torque. A symmetric straight reverse stop should
// produce force opposite reverse travel and essentially no yaw moment.
const vehicle={
  id:'wrx',massKg:1510,wheelbase:2.65,trackWidth:1.56,
  frontWeightBias:.58,cgHeight:.50,yawInertiaScale:.96,
  drivetrain:'AWD',driveBiasFront:.45,brakeBiasFront:.62,
  absEnabled:true,tireProfile:'performance-summer'
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
const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
let reverse=null;
for(let i=0;i<16;i++){
  reverse=solver.advance(1/120,{
    vehicleId:'wrx',vehicle,contacts,
    speed:-20,heading:0,velocityHeading:0,yawRate:0,
    centerSteerAngle:0,longitudinalAccel:BRAKE,lateralAccel:0,
    requestedDriveAccel:0,requestedBrakeAccel:BRAKE,
    handbrake:false,surfaceId:'asphalt-dry'
  });
}
assert.ok(reverse.bodyVz<0,'reverse scenario must travel rearward in body frame');
assert.ok(reverse.predictedAccelZ>0,'reverse service-brake tire force must oppose rearward travel');
assert.ok(Math.abs(reverse.predictedYawAccel)<.05,`symmetric reverse braking invented yaw ${reverse.predictedYawAccel}`);
assert.ok(reverse.wheels.filter(w=>w.absActive).length>=2,'reverse service braking must engage ABS rather than drivetrain torque');
assert.ok(reverse.wheels.every(w=>!w.locked),'ABS-equipped WRX must not lock during straight reverse service braking');

// Integration contract: wrapper keeps brake independent, base consumes that
// channel, and no body-speed sign branch may translate the brake into throttle.
const wrapper=fs.readFileSync(new URL('./src/driving-runtime.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const base=fs.readFileSync(new URL('./src/driving-runtime-base.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
assert.match(wrapper,/getServiceBrakeInput:/,'wrapper must expose independent service brake to base runtime');
assert.doesNotMatch(wrapper,/if\(bodySpeed<-\.15\)[\s\S]{0,220}return serviceBrake/,'legacy reverse-brake-as-throttle adapter remains');
assert.match(wrapper,/shouldAutoClutchForServiceBrake\(/,'stationary clutch must use real speed helper');
assert.match(base,/serviceBrakeAcceleration\(/,'base runtime must compute signed brake force independently');
assert.match(base,/getServiceBrakeInput/,'base runtime must consume service brake channel');
assert.doesNotMatch(base,/if\(driveThrottle<0\)[\s\S]{0,160}preDriveBodyLongitudinalSpeed>.15/,'negative drivetrain command still doubles as service brake');

console.log('GRIP R9 BRAKE / REVERSE / J-TURN QA: PASS',{
  jTurnBodySpeed:jBody,
  forwardBrake:serviceBrakeAcceleration({serviceBrake:1,speed:20,maxBrakeAccel:BRAKE}),
  reverseBrake:serviceBrakeAcceleration({serviceBrake:1,speed:-20,maxBrakeAccel:BRAKE}),
  reverseTireAccelZ:reverse.predictedAccelZ,
  reverseYawAccel:reverse.predictedYawAccel,
  reverseAbsWheels:reverse.wheels.filter(w=>w.absActive).length
});
