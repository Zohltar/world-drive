import assert from 'node:assert/strict';
import {physicalCombinedAxleSlip} from '../src/driving-runtime-base.js';
import {combinedBrakeForceAllocation} from '../src/physics/longitudinal-control.js';
import {advanceYawAuthority} from '../src/physics/yaw-authority.js';

const longitudinalLimit=9.47;
const lateralLimit=9.32;

// The ABS allocator may modulate service-brake pressure, but it must never
// leave the force request outside the normalized longitudinal/lateral envelope.
for(let lateral=0;lateral<=lateralLimit*1.10;lateral+=lateralLimit/20){
  for(let brake=0;brake<=longitudinalLimit;brake+=longitudinalLimit/20){
    const result=combinedBrakeForceAllocation({
      serviceBrakeAccel:-brake,
      longitudinalLimit,
      requestedLateralAccel:lateral,
      lateralLimit,
      absEnabled:true,
      airborne:false,
      enabled:true
    },{});
    const appliedLongitudinal=Math.abs(result.acceleration)/longitudinalLimit;
    const appliedLateral=Math.min(1,lateral/lateralLimit);
    assert.ok(Math.hypot(appliedLongitudinal,appliedLateral)<=1+1e-12,
      `ABS left an infeasible combined request: long=${appliedLongitudinal} lat=${appliedLateral}`);
  }
}

// Peak ABS utilization in a straight line is not lateral handling slip.
const straightSlip=physicalCombinedAxleSlip({
  front:true,
  peakSlipAngleRad:.12,
  speedAbs:20,
  wheels:[
    {front:true,normalLoadN:4000,utilization:1.25,slipAngle:0},
    {front:true,normalLoadN:4000,utilization:1.25,slipAngle:0}
  ]
});
assert.equal(straightSlip,0,'straight ABS braking was misclassified as lateral axle slip');

const saturatedCornerSlip=physicalCombinedAxleSlip({
  front:false,
  peakSlipAngleRad:.12,
  speedAbs:20,
  wheels:[
    {front:false,normalLoadN:3000,utilization:1.18,slipAngle:.12},
    {front:false,normalLoadN:4500,utilization:1.18,slipAngle:.12}
  ]
});
assert.ok(saturatedCornerSlip>.90,
  `combined tire saturation in a corner was not exposed to handling: ${saturatedCornerSlip}`);

// The aggregate loss moment is a low-slip handoff, not an independent yaw
// controller. It can bring yaw up to the bicycle target, never drive beyond it.
const reachedTarget=advanceYawAuthority({
  yawRate:.35,
  dynamicYawRate:.42,
  dt:1/60,
  yawResponse:6,
  requestedLatAccel:5,
  latLimit:9,
  frontSlipAmount:.05,
  rearSlipAmount:.35,
  currentSideslip:.04,
  frictionYawAccel:2.5,
  rearLateralForceLoss:.35,
  targetFrontSlip:.05,
  targetRearSlip:.35,
  frontLateralForceScale:.95,
  rearLateralForceScale:.65
});
assert.equal(reachedTarget.fallbackYawAccel,0,
  'aggregate rear-loss yaw kept accelerating after the steering yaw target');
assert.ok(reachedTarget.dynamicYawRate<.42,
  'yaw above target did not begin returning toward the steering equilibrium');

const nearTarget=advanceYawAuthority({
  yawRate:.35,
  dynamicYawRate:.349,
  dt:.10,
  yawResponse:6,
  requestedLatAccel:5,
  latLimit:9,
  frontSlipAmount:.05,
  rearSlipAmount:.35,
  currentSideslip:.04,
  frictionYawAccel:5,
  rearLateralForceLoss:.35,
  targetFrontSlip:.05,
  targetRearSlip:.35,
  frontLateralForceScale:.95,
  rearLateralForceScale:.65
});
assert.ok(nearTarget.dynamicYawRate<=.35+1e-12,
  `aggregate fallback crossed the yaw target in one frame: ${nearTarget.dynamicYawRate}`);

const centeredLowSlip=advanceYawAuthority({
  yawRate:0,
  dynamicYawRate:.10,
  dt:1/60,
  yawResponse:6,
  requestedLatAccel:0,
  latLimit:9,
  frontSlipAmount:.05,
  rearSlipAmount:.35,
  currentSideslip:.04,
  frictionYawAccel:2.5,
  rearLateralForceLoss:.35,
  targetFrontSlip:.05,
  targetRearSlip:.35,
  frontLateralForceScale:.95,
  rearLateralForceScale:.65
});
assert.equal(centeredLowSlip.fallbackYawAccel,0,
  'aggregate rear-loss yaw persisted after the low-slip steering target returned to zero');

// Once actual chassis sideslip is large, the physical tire moment is still
// allowed to rotate the car beyond the small-slip bicycle equilibrium.
const physicalDrift=advanceYawAuthority({
  yawRate:.35,
  dynamicYawRate:.42,
  dt:1/60,
  yawResponse:6,
  requestedLatAccel:5,
  latLimit:9,
  frontSlipAmount:.20,
  rearSlipAmount:.85,
  currentSideslip:.50,
  frictionYawAccel:2.5,
  rearLateralForceLoss:.70,
  physicalTireYawAccel:3,
  targetFrontSlip:.20,
  targetRearSlip:.85,
  frontLateralForceScale:.80,
  rearLateralForceScale:.25
});
assert.ok(physicalDrift.driftPhysicalAuthority>.90,
  'high-sideslip physical tire authority did not engage');
assert.ok(physicalDrift.authoritativeYawAccel>2.5,
  'physical drift yaw was incorrectly clipped to the bicycle target');

console.log('PHYSICS TRAIL-BRAKING TRANSIENT R2 QA: PASS',{
  straightSlip,
  saturatedCornerSlip:Number(saturatedCornerSlip.toFixed(3)),
  targetRecoveryYawRate:Number(reachedTarget.dynamicYawRate.toFixed(4)),
  physicalDriftAuthority:Number(physicalDrift.driftPhysicalAuthority.toFixed(3))
});
