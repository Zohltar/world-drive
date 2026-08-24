import assert from 'node:assert/strict';
import {
  TIRE_PROFILE_CATALOG,
  VEHICLE_TIRE_PROFILE,
  tireProfileForVehicle,
  loadSensitiveMu,
  effectiveTireFriction,
  contactPatchVelocity,
  slipState,
  resolveTireForces
} from '../src/physics/tire-model.js';
import {
  SURFACE_FRICTION_PROFILES,
  surfaceFrictionProfile
} from '../src/physics/surface-friction.js';
import {
  turningRadiusFromSteer,
  ackermannSteeringAngles
} from '../src/physics/steering-geometry.js';
import { createFixedStepAccumulator } from '../src/physics/fixed-step.js';

const near=(actual,expected,epsilon=1e-9,message='values differ')=>{
  assert.ok(Math.abs(actual-expected)<=epsilon,`${message}: ${actual} vs ${expected}`);
};

// Catalog/schema foundations.
for(const id of [
  'touring-all-season','performance-summer','vintage-performance',
  'ev-touring','narrow-eco','race-slick','truck-highway'
]){
  assert.ok(TIRE_PROFILE_CATALOG[id],`missing tire profile ${id}`);
}
for(const id of ['asphalt-dry','asphalt-poor','asphalt-wet','gravel','dirt','grass']){
  assert.ok(SURFACE_FRICTION_PROFILES[id],`missing surface profile ${id}`);
}
for(const vehicleId of ['id4','wrx','civic','sonata','f1_2010','countach_80','semi_6x4','i3_2017']){
  assert.ok(VEHICLE_TIRE_PROFILE[vehicleId],`missing tire assignment for ${vehicleId}`);
  assert.ok(tireProfileForVehicle(vehicleId),`cannot resolve tire assignment for ${vehicleId}`);
}
assert.equal(tireProfileForVehicle('wrx').id,'performance-summer','WRX tire assignment changed');
assert.equal(tireProfileForVehicle('f1_2010').id,'race-slick','F1 tire assignment changed');
assert.equal(tireProfileForVehicle('i3_2017').id,'narrow-eco','i3 tire assignment changed');

// Surface and load sensitivity stay independent.
const dry=effectiveTireFriction({tire:'performance-summer',surface:'asphalt-dry',normalLoadN:3700});
const gravel=effectiveTireFriction({tire:'performance-summer',surface:'gravel',normalLoadN:3700});
assert.ok(dry.peak>gravel.peak,'gravel must reduce effective peak tire friction');
assert.ok(surfaceFrictionProfile('gravel').rollingResistanceScale>1,'gravel rolling resistance scale missing');
const normalMu=loadSensitiveMu({baseMu:1,normalLoadN:4000,referenceLoadN:4000,exponent:.9});
const heavyMu=loadSensitiveMu({baseMu:1,normalLoadN:8000,referenceLoadN:4000,exponent:.9});
near(normalMu,1,1e-12,'reference-load mu should remain unchanged');
assert.ok(heavyMu<normalMu,'higher tire load must reduce effective mu when exponent < 1');

// Contact-patch kinematics.
const straight=contactPatchVelocity({bodyVx:0,bodyVz:20,yawRate:0,localX:.75,localZ:1.3,steerAngle:0});
near(straight.longitudinal,20,1e-12,'straight longitudinal contact speed changed');
near(straight.lateral,0,1e-12,'straight lateral contact speed changed');
const yawing=contactPatchVelocity({bodyVx:0,bodyVz:20,yawRate:.5,localX:.75,localZ:1.3,steerAngle:0});
near(yawing.bodyX,.65,1e-12,'yaw point X velocity changed');
near(yawing.bodyZ,19.625,1e-12,'yaw point Z velocity changed');

// Slip ratio: free rolling is ~0, locked wheel is ~-1 while moving forward.
const rolling=slipState({longitudinalSpeed:20,lateralSpeed:0,wheelOmega:20/.32,radiusM:.32});
near(rolling.slipRatio,0,1e-12,'free-rolling slip ratio changed');
const locked=slipState({longitudinalSpeed:20,lateralSpeed:0,wheelOmega:0,radiusM:.32});
near(locked.slipRatio,-1,1e-12,'locked-wheel slip ratio changed');

// Combined tire force must oppose lateral contact velocity and lockup must
// consume the friction budget rather than invoking a separate drift trigger.
const lateral=resolveTireForces({
  tire:'performance-summer',surface:'asphalt-dry',normalLoadN:4000,
  longitudinalSpeed:20,lateralSpeed:2,wheelOmega:20/.33,
  steerAngle:0,localX:.75,localZ:1.3
});
assert.ok(lateral.fyWheel<0,'lateral tire force must oppose positive lateral velocity');
assert.ok(lateral.utilization>0,'lateral demand should consume tire capacity');

const rearLocked=resolveTireForces({
  tire:'performance-summer',surface:'asphalt-dry',normalLoadN:4000,
  longitudinalSpeed:20,lateralSpeed:1.5,wheelOmega:0,
  steerAngle:0,localX:.75,localZ:-1.2
});
assert.ok(rearLocked.fxWheel<0,'locked forward-moving wheel must create braking force');
assert.ok(rearLocked.saturated,'locked wheel should saturate the combined friction envelope');
assert.ok(rearLocked.slideBlend>0,'locked wheel should transition toward sliding friction');
assert.ok(Math.hypot(rearLocked.fxWheel,rearLocked.fyWheel)<=rearLocked.capacityN+1e-7,'friction ellipse exceeded');

// Ackermann: one centre steering request yields a tighter inner wheel and a
// shallower outer wheel, both sharing the same geometric turn centre.
const centerAngle=30*Math.PI/180;
const ack=ackermannSteeringAngles({wheelbase:2.70,trackWidth:1.55,centerAngle});
assert.ok(Math.abs(ack.innerAngle)>Math.abs(centerAngle),'inner Ackermann wheel must steer more than centre angle');
assert.ok(Math.abs(ack.outerAngle)<Math.abs(centerAngle),'outer Ackermann wheel must steer less than centre angle');
near(ack.centerRadius,turningRadiusFromSteer({wheelbase:2.70,centerAngle}),1e-12,'Ackermann centre radius changed');
const mirrored=ackermannSteeringAngles({wheelbase:2.70,trackWidth:1.55,centerAngle:-centerAngle});
near(mirrored.innerAngle,-ack.innerAngle,1e-12,'Ackermann sign symmetry changed');
near(mirrored.outerAngle,-ack.outerAngle,1e-12,'Ackermann sign symmetry changed');

// Fixed 120 Hz timing foundation: 60 Hz renderer = exactly two physics steps.
const stepper=createFixedStepAccumulator({hz:120,maxSubSteps:8,maxFrameTime:.10});
let steps=0;
let result=stepper.advance(1/60,dt=>{
  near(dt,1/120,1e-12,'fixed physics dt changed');
  steps++;
});
assert.equal(steps,2,'60 Hz frame must produce two 120 Hz physics steps');
assert.equal(result.steps,2,'stepper result count changed');
near(result.accumulator,0,1e-10,'60 Hz frame should leave no timing residue');

stepper.reset();
steps=0;
stepper.advance(1/144,()=>steps++);
assert.equal(steps,0,'first 144 Hz frame should not invent a full 120 Hz step');
stepper.advance(1/144,()=>steps++);
assert.equal(steps,1,'two 144 Hz frames should accumulate one 120 Hz step');

const guarded=createFixedStepAccumulator({hz:120,maxSubSteps:8,maxFrameTime:.10});
result=guarded.advance(1,()=>{});
assert.equal(result.steps,8,'spiral-of-death guard maxSubSteps changed');
assert.ok(result.droppedTime>0,'long frame should report dropped unsimulated time');

console.log('V21.27 PHYSICS FOUNDATION QA: PASS');
console.log('tire/surface separation, contact-patch slip, Ackermann geometry and 120 Hz fixed-step foundation verified');
