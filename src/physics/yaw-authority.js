// World Drive Cleanup B5 — single owner of local chassis yaw authority.
//
// Tire forces are generated elsewhere and momentum direction is owned by B4.
// This module decides how the bicycle-model target, legacy fallback and physical
// tire yaw moment share authority, then advances dynamicYawRate.

import {
  blendDriftForce,
  driftForceSideslipGate,
  driftTireForceAuthority
} from './drift-force-coupling.js';

function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}

function smoothstep01(value){
  const t=Math.max(0,Math.min(1,Number(value)||0));
  return t*t*(3-2*t);
}

export function driftKinematicCoupling({sideslipRad=0,forceCoupledSlide=0}={}){
  const sideslip=Math.max(0,Math.min(Math.PI*.5,Math.abs(Number(sideslipRad)||0)));
  const slide=Math.max(0,Math.min(1,Number(forceCoupledSlide)||0));
  const sideT=smoothstep01((sideslip-.30)/.85);
  const forceT=
    smoothstep01((slide-.12)/.68)*
    driftForceSideslipGate(sideslip);
  return 1-.94*Math.max(sideT,forceT);
}

// Cleanup B7 — retained aggregate grip-loss yaw fallback.
//
// This is not a second free-running yaw controller. estimateWheelGripUsage()
// can measure an axle-force-loss moment at 20 Hz before the high-sideslip R7
// per-wheel solver has meaningful authority. In that low-authority transition
// this filtered aggregate moment supplies missing grip-loss yaw; blendDriftForce()
// progressively replaces it with the physical per-wheel yaw moment as
// driftPhysicalAuthority rises. R16/R21 suppress front-dominated opposing
// moments so ordinary understeer cannot become counter-yaw. Profiles such as
// the F1 opt out through legacyDriftAssist=false.
export function gripLossFallbackYawAcceleration({
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

export function conditionBicycleYawTarget({
  yawRate=0,jTurnLatchedActive=false,requestedLatAccel=0,latLimit=0,
  frontSlipAmount=0,rearSlipAmount=0,airborne=false,useLegacyDriftAssist=true,
  drivetrain='AWD',powerCorneringLoad=0,steer=0,powerOversteerYaw=.035,
  speedAbs=0,speed=0,steeringTravelSpeed=0,handbrake=false
}={}){
  let target=Number(yawRate)||0;
  const requested=Number(requestedLatAccel)||0;
  const limit=Number(latLimit)||0;
  const front=Math.max(0,Number(frontSlipAmount)||0);
  const rear=Math.max(0,Number(rearSlipAmount)||0);
  const frontDominance=Math.max(0,front-rear*.55);
  const rearDominance=Math.max(0,rear-front*.55);
  const fourWheelSlide=Math.min(front,rear);

  if(!jTurnLatchedActive&&requested>limit&&requested>0)target*=limit/requested;
  if(!airborne)target*=Math.max(.46,1-frontDominance*.54-fourWheelSlide*.24);

  const powerLoad=Number(powerCorneringLoad)||0;
  if(useLegacyDriftAssist&&String(drivetrain||'AWD')==='RWD'&&powerLoad>.05&&!airborne){
    const powerYaw=Number.isFinite(Number(powerOversteerYaw))?Number(powerOversteerYaw):.035;
    const rearSlipYaw=Math.sign((Number(steer)||0)||1)*powerYaw*powerLoad*(.30+rearDominance*.70)*Math.min(1,(Number(speedAbs)||0)/18);
    target+=rearSlipYaw*Math.sign((handbrake?Number(speed)||0:Number(steeringTravelSpeed)||0)||(Number(speed)||0)||1);
  }

  return {yawRate:target,frontDominance,rearDominance,fourWheelSlide};
}

export function advanceYawAuthority({
  yawRate=0,dynamicYawRate=0,dt=0,yawResponse=0,
  jTurnLatchedActive=false,requestedLatAccel=0,latLimit=0,
  frontSlipAmount=0,rearSlipAmount=0,airborne=false,useLegacyDriftAssist=true,
  drivetrain='AWD',powerCorneringLoad=0,steer=0,powerOversteerYaw=.035,
  speedAbs=0,speed=0,steeringTravelSpeed=0,handbrake=false,
  currentSideslip=0,frictionYawAccel=0,rearLateralForceLoss=0,
  physicalTireYawAccel=NaN,targetFrontSlip=0,targetRearSlip=0,
  frontLateralForceScale=1,rearLateralForceScale=1
}={}){
  const conditioned=conditionBicycleYawTarget({
    yawRate,jTurnLatchedActive,requestedLatAccel,latLimit,frontSlipAmount,rearSlipAmount,
    airborne,useLegacyDriftAssist,drivetrain,powerCorneringLoad,steer,powerOversteerYaw,
    speedAbs,speed,steeringTravelSpeed,handbrake
  });
  const targetYawRate=conditioned.yawRate;
  const friction=Number.isFinite(Number(frictionYawAccel))?Number(frictionYawAccel):0;
  const frictionYawLoss=clamp(Math.abs(friction)/4.5,0,1);
  const forceCoupledSlide=clamp(Math.max(frictionYawLoss,Number(rearLateralForceLoss)||0),0,1);
  const driftKinematicScale=driftKinematicCoupling({
    sideslipRad:currentSideslip,
    forceCoupledSlide
  });
  const driftPhysicalAuthority=airborne?0:driftTireForceAuthority({
    sideslipRad:currentSideslip,
    forceCoupledSlide
  });
  const physicalYaw=Number.isFinite(Number(physicalTireYawAccel))?Number(physicalTireYawAccel):friction;
  const currentDynamic=Number(dynamicYawRate)||0;
  const yawReleaseBoost=
    driftKinematicScale>.82&&Math.abs(targetYawRate)<Math.abs(currentDynamic)
      ?1.35
      :1;
  const yawGripResponseScale=airborne
    ?0
    :driftKinematicScale*(1-.85*driftPhysicalAuthority);
  const fallbackYawAccel=useLegacyDriftAssist
    ?gripLossFallbackYawAcceleration({
      frictionYawAccel:friction,
      yawRate:targetYawRate,
      frontSlip:targetFrontSlip,
      rearSlip:targetRearSlip,
      frontForceScale:frontLateralForceScale,
      rearForceScale:rearLateralForceScale
    })
    :0;
  const authoritativeYawAccel=blendDriftForce(
    fallbackYawAccel,
    physicalYaw,
    driftPhysicalAuthority
  );
  const step=Number(dt)||0;
  let nextDynamicYawRate=currentDynamic+authoritativeYawAccel*step;
  nextDynamicYawRate+=(targetYawRate-nextDynamicYawRate)*(1-Math.exp(-step*(Number(yawResponse)||0)*yawReleaseBoost*yawGripResponseScale));

  return {
    yawRate:targetYawRate,
    dynamicYawRate:nextDynamicYawRate,
    frontDominance:conditioned.frontDominance,
    rearDominance:conditioned.rearDominance,
    fourWheelSlide:conditioned.fourWheelSlide,
    frictionYawLoss,forceCoupledSlide,driftKinematicScale,driftPhysicalAuthority,
    physicalTireYawAccel:physicalYaw,yawReleaseBoost,yawGripResponseScale,
    fallbackYawAccel,authoritativeYawAccel
  };
}
