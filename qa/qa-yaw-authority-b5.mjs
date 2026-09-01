import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  blendDriftForce,
  driftForceSideslipGate,
  driftTireForceAuthority
} from '../src/physics/drift-force-coupling.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=value=>{const t=Math.max(0,Math.min(1,Number(value)||0));return t*t*(3-2*t);};
function oldDriftKinematicCoupling({sideslipRad=0,forceCoupledSlide=0}={}){
  const sideslip=Math.max(0,Math.min(Math.PI*.5,Math.abs(Number(sideslipRad)||0)));
  const slide=Math.max(0,Math.min(1,Number(forceCoupledSlide)||0));
  const sideT=smooth((sideslip-.30)/.85);
  const forceT=smooth((slide-.12)/.68)*driftForceSideslipGate(sideslip);
  return 1-.94*Math.max(sideT,forceT);
}
function referenceGripLossFallbackYawAcceleration({frictionYawAccel=0,yawRate=0,frontSlip=0,rearSlip=0,frontForceScale=1,rearForceScale=1}={}){
  const accel=Number(frictionYawAccel)||0,targetYaw=Number(yawRate)||0;
  const front=Math.max(0,Number(frontSlip)||0),rear=Math.max(0,Number(rearSlip)||0);
  const frontScale=Number.isFinite(Number(frontForceScale))?Math.max(0,Math.min(1,Number(frontForceScale))):1;
  const rearScale=Number.isFinite(Number(rearForceScale))?Math.max(0,Math.min(1,Number(rearForceScale))):1;
  const frontSlipDominated=front>rear+.06,frontForceDominated=frontScale<rearScale-.015;
  if((frontSlipDominated||frontForceDominated)&&Math.abs(targetYaw)>.01&&accel*targetYaw<0)return 0;
  return accel;
}
function oldAdvance(args={}){
  let {
    yawRate=0,dynamicYawRate=0,dt=0,yawResponse=0,
    jTurnLatchedActive=false,requestedLatAccel=0,latLimit=0,
    frontSlipAmount=0,rearSlipAmount=0,airborne=false,useLegacyDriftAssist=true,
    drivetrain='AWD',powerCorneringLoad=0,steer=0,powerOversteerYaw,
    speedAbs=0,speed=0,steeringTravelSpeed=0,handbrake=false,
    currentSideslip=0,frictionYawAccel=0,rearLateralForceLoss=0,
    physicalTireYawAccel=NaN,targetFrontSlip=0,targetRearSlip=0,
    frontLateralForceScale=1,rearLateralForceScale=1
  }=args;
  if(!jTurnLatchedActive&&requestedLatAccel>latLimit&&requestedLatAccel>0)yawRate*=latLimit/requestedLatAccel;
  const frontDominance=Math.max(0,frontSlipAmount-rearSlipAmount*.55);
  const rearDominance=Math.max(0,rearSlipAmount-frontSlipAmount*.55);
  const fourWheelSlide=Math.min(frontSlipAmount,rearSlipAmount);
  if(!airborne)yawRate*=Math.max(.46,1-frontDominance*.54-fourWheelSlide*.24);
  if(useLegacyDriftAssist&&drivetrain==='RWD'&&powerCorneringLoad>.05&&!airborne){
    const powerYaw=powerOversteerYaw??.035;
    const rearSlipYaw=Math.sign(steer||1)*powerYaw*powerCorneringLoad*(.30+rearDominance*.70)*Math.min(1,speedAbs/18);
    yawRate+=rearSlipYaw*Math.sign((handbrake?speed:steeringTravelSpeed)||speed||1);
  }
  const frictionYawLoss=clamp(Math.abs(frictionYawAccel)/4.5,0,1);
  const forceCoupledSlide=clamp(Math.max(frictionYawLoss,rearLateralForceLoss),0,1);
  const driftKinematicScale=oldDriftKinematicCoupling({sideslipRad:currentSideslip,forceCoupledSlide});
  const driftPhysicalAuthority=airborne?0:driftTireForceAuthority({sideslipRad:currentSideslip,forceCoupledSlide});
  const physicalYaw=Number.isFinite(physicalTireYawAccel)?physicalTireYawAccel:frictionYawAccel;
  const yawReleaseBoost=driftKinematicScale>.82&&Math.abs(yawRate)<Math.abs(dynamicYawRate)?1.35:1;
  const yawGripResponseScale=airborne?0:driftKinematicScale*(1-.85*driftPhysicalAuthority);
  const fallbackYawAccel=useLegacyDriftAssist?referenceGripLossFallbackYawAcceleration({
    frictionYawAccel,yawRate,frontSlip:targetFrontSlip,rearSlip:targetRearSlip,
    frontForceScale:frontLateralForceScale,rearForceScale:rearLateralForceScale
  }):0;
  const authoritativeYawAccel=blendDriftForce(fallbackYawAccel,physicalYaw,driftPhysicalAuthority);
  dynamicYawRate+=authoritativeYawAccel*dt;
  dynamicYawRate+=(yawRate-dynamicYawRate)*(1-Math.exp(-dt*yawResponse*yawReleaseBoost*yawGripResponseScale));
  return {yawRate,dynamicYawRate,frontDominance,rearDominance,fourWheelSlide,frictionYawLoss,forceCoupledSlide,driftKinematicScale,driftPhysicalAuthority,physicalTireYawAccel:physicalYaw,yawReleaseBoost,yawGripResponseScale,fallbackYawAccel,authoritativeYawAccel};
}

const yaw=await import('../src/physics/yaw-authority.js');
const runtime=await import('../src/driving-runtime-base.js');
assert.equal(runtime.driftKinematicCoupling,yaw.driftKinematicCoupling,'runtime compatibility export changed');
assert.equal(runtime.gripLossFallbackYawAcceleration,yaw.gripLossFallbackYawAcceleration,'grip-loss fallback compatibility export changed');

let seed=0xb500cafe;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const range=(a,b)=>a+(b-a)*rnd();
const drives=['FWD','RWD','AWD'];
const keys=['yawRate','dynamicYawRate','frontDominance','rearDominance','fourWheelSlide','frictionYawLoss','forceCoupledSlide','driftKinematicScale','driftPhysicalAuthority','physicalTireYawAccel','yawReleaseBoost','yawGripResponseScale','fallbackYawAccel','authoritativeYawAccel'];
let maxError=0;
for(let i=0;i<30000;i++){
  const args={
    yawRate:range(-4,4),dynamicYawRate:range(-5,5),dt:range(1/240,1/20),yawResponse:range(.5,15),
    jTurnLatchedActive:rnd()<.12,requestedLatAccel:range(0,45),latLimit:range(.5,35),
    frontSlipAmount:range(0,1),rearSlipAmount:range(0,1),airborne:rnd()<.08,useLegacyDriftAssist:rnd()>.12,
    drivetrain:drives[Math.floor(rnd()*drives.length)],powerCorneringLoad:range(0,1),steer:range(-1,1),
    powerOversteerYaw:rnd()<.15?undefined:range(0,.09),speedAbs:range(0,95),speed:range(-35,70),
    steeringTravelSpeed:range(-70,70),handbrake:rnd()<.15,currentSideslip:range(-Math.PI,Math.PI),
    frictionYawAccel:range(-15,15),rearLateralForceLoss:range(0,1),
    physicalTireYawAccel:rnd()<.08?NaN:range(-40,40),targetFrontSlip:range(0,1),targetRearSlip:range(0,1),
    frontLateralForceScale:range(0,1),rearLateralForceScale:range(0,1)
  };
  const expected=oldAdvance({...args});
  const actual=yaw.advanceYawAuthority({...args});
  for(const key of keys){
    const error=Math.abs(actual[key]-expected[key]);
    maxError=Math.max(maxError,error);
    assert.ok(error<2e-12,`B5 equivalence drift sample ${i} ${key}: ${error}`);
  }
}

for(const sideslip of [0,.05,.2,.5,1.0,Math.PI/2])for(const slide of [0,.1,.4,.8,1]){
  assert.ok(Math.abs(yaw.driftKinematicCoupling({sideslipRad:sideslip,forceCoupledSlide:slide})-oldDriftKinematicCoupling({sideslipRad:sideslip,forceCoupledSlide:slide}))<1e-15);
}

const runtimeSource=fs.readFileSync('src/driving-runtime-base.js','utf8');
const ownerSource=fs.readFileSync('src/physics/yaw-authority.js','utf8');
assert.doesNotMatch(runtimeSource,/export function driftKinematicCoupling\b/,'drift kinematic coupling still locally owned by runtime');
assert.doesNotMatch(runtimeSource,/export function gripLossFallbackYawAcceleration\b/,'grip-loss fallback still locally owned by runtime');
assert.doesNotMatch(runtimeSource,/const authoritativeYawAccel=blendDriftForce/,'runtime still owns physical-vs-fallback yaw blend');
assert.match(runtimeSource,/const yawAuthority=advanceYawAuthority\(\{/,'runtime does not delegate yaw authority');
assert.match(ownerSource,/export function advanceYawAuthority\b/,'yaw owner missing authoritative integration');
assert.match(ownerSource,/const authoritativeYawAccel=blendDriftForce\(/,'yaw owner missing physical-vs-legacy blend');

console.log('CLEANUP B5 YAW-AUTHORITY QA: PASS',{samples:30000,maxError});
