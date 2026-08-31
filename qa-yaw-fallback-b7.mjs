import assert from 'node:assert/strict';
import fs from 'node:fs';
import {blendDriftForce} from './src/physics/drift-force-coupling.js';
import {createVehicleSystem} from './src/vehicle-system.js';

function referenceFallback({
  frictionYawAccel=0,yawRate=0,frontSlip=0,rearSlip=0,
  frontForceScale=1,rearForceScale=1
}={}){
  const accel=Number(frictionYawAccel)||0;
  const targetYaw=Number(yawRate)||0;
  const front=Math.max(0,Number(frontSlip)||0);
  const rear=Math.max(0,Number(rearSlip)||0);
  const frontScale=Number.isFinite(Number(frontForceScale))?Math.max(0,Math.min(1,Number(frontForceScale))):1;
  const rearScale=Number.isFinite(Number(rearForceScale))?Math.max(0,Math.min(1,Number(rearForceScale))):1;
  const frontSlipDominated=front>rear+.06;
  const frontForceDominated=frontScale<rearScale-.015;
  if((frontSlipDominated||frontForceDominated)&&Math.abs(targetYaw)>.01&&accel*targetYaw<0)return 0;
  return accel;
}

const yaw=await import('./src/physics/yaw-authority.js');
const runtime=await import('./src/driving-runtime-base.js');
assert.equal(
  runtime.gripLossFallbackYawAcceleration,
  yaw.gripLossFallbackYawAcceleration,
  'runtime export must expose the B7 fallback owner'
);

let seed=0xb700cafe;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const range=(a,b)=>a+(b-a)*rnd();
let maxError=0;
for(let i=0;i<30000;i++){
  const args={
    frictionYawAccel:range(-12,12),
    yawRate:range(-5,5),
    frontSlip:range(0,1),
    rearSlip:range(0,1),
    frontForceScale:range(0,1),
    rearForceScale:range(0,1)
  };
  const expected=referenceFallback(args);
  const actual=yaw.gripLossFallbackYawAcceleration(args);
  const error=Math.abs(actual-expected);
  maxError=Math.max(maxError,error);
  assert.ok(error<1e-15,`fallback equivalence sample ${i}: ${error}`);
}

// R16/R21 safety: front-dominated loss can reduce authority but cannot invent
// counter-yaw against a valid bicycle steering target.
assert.equal(yaw.gripLossFallbackYawAcceleration({
  frictionYawAccel:-3.1,yawRate:.8,frontSlip:.85,rearSlip:.10,
  frontForceScale:.55,rearForceScale:.92
}),0);
assert.equal(yaw.gripLossFallbackYawAcceleration({
  frictionYawAccel:2.4,yawRate:.8,frontSlip:.20,rearSlip:.75,
  frontForceScale:.90,rearForceScale:.58
}),2.4);

// B7 audit showed that the fallback is materially required at low physical
// authority on RWD cars. Prove the owner keeps it there and that blendDriftForce
// progressively hands the same moment to the physical per-wheel solver.
for(const id of ['countach_80','i3_2017']){
  const system=createVehicleSystem({initialId:id});
  const vehicle=system.physics;
  assert.notEqual(vehicle.legacyDriftAssist,false,`${id}: fallback unexpectedly disabled`);
  const friction=id==='countach_80'?4.151399351951763:3.7211774755000664;
  const low=yaw.advanceYawAuthority({
    yawRate:.5,dynamicYawRate:0,dt:1/120,yawResponse:7,
    requestedLatAccel:4,latLimit:9,frontSlipAmount:.4,rearSlipAmount:1,
    airborne:false,useLegacyDriftAssist:true,drivetrain:'RWD',
    powerCorneringLoad:.5,steer:1,powerOversteerYaw:vehicle.powerOversteerYaw??.035,
    speedAbs:15,speed:15,steeringTravelSpeed:15,handbrake:false,
    currentSideslip:0,frictionYawAccel:friction,rearLateralForceLoss:0,
    physicalTireYawAccel:7,targetFrontSlip:.4,targetRearSlip:1,
    frontLateralForceScale:.85,rearLateralForceScale:.55
  });
  assert.ok(low.driftPhysicalAuthority<1e-9,`${id}: low-slip case unexpectedly physical-authoritative`);
  assert.ok(Math.abs(low.fallbackYawAccel-friction)<1e-12,`${id}: low-authority fallback lost`);
  assert.ok(Math.abs(low.authoritativeYawAccel-friction)<1e-12,`${id}: fallback not authoritative at low slip`);

  const blendedHalf=blendDriftForce(friction,7,.5);
  assert.ok(blendedHalf>Math.min(friction,7)&&blendedHalf<Math.max(friction,7),`${id}: force blend does not hand off progressively`);
  assert.equal(blendDriftForce(friction,7,1),7,`${id}: full R7 authority must own yaw`);
}

const f1=createVehicleSystem({initialId:'f1_2010'}).physics;
assert.equal(f1.legacyDriftAssist,false,'F1 must remain opted out of aggregate fallback');
const f1Yaw=yaw.advanceYawAuthority({
  yawRate:.8,dynamicYawRate:0,dt:1/120,yawResponse:8,
  requestedLatAccel:8,latLimit:12,frontSlipAmount:.2,rearSlipAmount:.2,
  airborne:false,useLegacyDriftAssist:f1.legacyDriftAssist!==false,
  drivetrain:'RWD',speedAbs:60,speed:60,steeringTravelSpeed:60,
  currentSideslip:0,frictionYawAccel:4,physicalTireYawAccel:5,
  targetFrontSlip:.2,targetRearSlip:.2
});
assert.equal(f1Yaw.fallbackYawAccel,0,'F1 R23 regained aggregate fallback yaw');

const ownerSource=fs.readFileSync('src/physics/yaw-authority.js','utf8');
const runtimeSource=fs.readFileSync('src/driving-runtime-base.js','utf8');
assert.doesNotMatch(ownerSource,/legacyGripYawAcceleration/,'misleading B7 pre-audit helper name remains in yaw owner');
assert.doesNotMatch(runtimeSource,/legacyGripYawAcceleration/,'misleading B7 compatibility export remains');
assert.match(ownerSource,/retained aggregate grip-loss yaw fallback/,'fallback regime is not documented');
assert.match(ownerSource,/progressively replaces it with the physical per-wheel yaw moment/,'R7 handoff is not documented');

console.log('CLEANUP B7 GRIP-LOSS FALLBACK QA: PASS',{
  samples:30000,
  maxError,
  retainedLowAuthority:true,
  progressiveR7Handoff:true,
  f1OptOut:true
});
