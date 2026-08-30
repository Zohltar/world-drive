// World Drive Cleanup B4 — authoritative momentum-direction math and state evolution.
//
// This module owns physical decisions that change velocityHeading. The global
// storage itself stays in the application/runtime state so placement, save/load
// and multiplayer serialization remain explicit observers/initializers rather
// than alternate physics authorities.

import {blendDriftForce} from './drift-force-coupling.js';

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}

export function momentumAngleDelta(target,current){
  return Math.atan2(
    Math.sin(finite(target)-finite(current)),
    Math.cos(finite(target)-finite(current))
  );
}

export function bodyRelativeLongitudinalSpeed({speed=0,heading=0,velocityHeading=0}={}){
  const v=finite(speed);
  const bodyDelta=finite(velocityHeading)-finite(heading);
  return v*Math.cos(bodyDelta);
}

export function bodyRelativeLateralSpeed({speed=0,heading=0,velocityHeading=0}={}){
  const v=finite(speed);
  const bodyDelta=finite(velocityHeading)-finite(heading);
  return v*Math.sin(bodyDelta);
}

export function bodyRelativeMomentumTargetHeading({speed=0,heading=0,velocityHeading=0}={}){
  const v=finite(speed);
  const h=finite(heading);
  const vh=finite(velocityHeading);
  if(Math.abs(v)<1e-8)return h;
  const bodyLong=bodyRelativeLongitudinalSpeed({speed:v,heading:h,velocityHeading:vh});
  const speedSign=Math.sign(v||1);
  const bodySign=Math.sign(bodyLong||v||1);
  if(bodySign===speedSign)return h;
  return h+Math.PI;
}

export function bodyRelativeSteeringSpeed({speed=0,heading=0,velocityHeading=0,handbrake=false}={}){
  const v=finite(speed);
  const speedAbs=Math.abs(v);
  if(speedAbs<1e-8)return 0;
  if(handbrake)return Math.sign(v||1)*speedAbs;
  return bodyRelativeLongitudinalSpeed({speed:v,heading,velocityHeading});
}

export function travelAxisSideslip({heading=0,velocityHeading=0}={}){
  let delta=finite(velocityHeading)-finite(heading);
  delta=Math.atan2(Math.sin(delta),Math.cos(delta));
  return Math.atan2(Math.abs(Math.sin(delta)),Math.abs(Math.cos(delta)));
}

export function shouldCanonicalizeMomentumHeading({speedAbs=0}={}){
  // R18: sideways momentum stays meaningful at walking speed. Collapse only
  // when translation is essentially stopped.
  return Math.max(0,Math.abs(finite(speedAbs)))<.12;
}

export function bodyAxisDriveProjection({heading=0,velocityHeading=0}={}){
  return Math.cos(finite(velocityHeading)-finite(heading));
}

export function resolveOpposingDriveMomentumCrossing({
  previousSpeed=0,velocityHeading=0,heading=0,nonDriveDeltaSpeed=0,
  bodyDriveAccel=0,dt=0
}={}){
  const previous=finite(previousSpeed);
  const vh=finite(velocityHeading);
  const bodyHeading=finite(heading);
  const step=Math.max(0,finite(dt));
  const baseSpeed=previous+finite(nonDriveDeltaSpeed);
  const driveImpulse=finite(bodyDriveAccel)*step;
  const vx=Math.sin(vh)*baseSpeed+Math.sin(bodyHeading)*driveImpulse;
  const vz=Math.cos(vh)*baseSpeed+Math.cos(bodyHeading)*driveImpulse;
  const magnitude=Math.hypot(vx,vz);
  if(magnitude<1e-7)return {speed:0,velocityHeading:bodyHeading,stopped:true};
  const representationSign=Math.sign(previous||bodyDriveAccel||1);
  return {
    speed:representationSign*magnitude,
    velocityHeading:Math.atan2(vx*representationSign,vz*representationSign),
    stopped:false
  };
}

export function limitMomentumHeadingDelta({
  attemptedDelta=0,speedAbs=0,lateralCapacityAccel=0,dt=0,airborne=false
}={}){
  const desired=finite(attemptedDelta);
  if(airborne||Math.abs(desired)<1e-12)return 0;
  const step=Math.max(0,finite(dt));
  if(step<=0)return 0;
  const v=Math.max(1.25,Math.abs(finite(speedAbs)));
  const aLat=Math.max(0,finite(lateralCapacityAccel));
  const maxDelta=(aLat/v)*step;
  return clamp(desired,-maxDelta,maxDelta);
}

export function advanceMomentumDirection({
  velocityHeading=0,heading=0,speed=0,speedAbs=Math.abs(Number(speed)||0),dt=0,
  airborne=false,frontSlipAmount=0,rearSlipAmount=0,forceCoupledSlide=0,
  frictionTrajectoryLoss=0,offroadMomentumYawRate=0,onPavement=true,
  driftPhysicalAuthority=0,driftKinematicScale=1,useLegacyDriftAssist=true,
  netLateralAccel=0,physicalTrajectoryYawRate=0,trajectoryLateralCapacityAccel=0
}={}){
  const h=finite(heading);
  const v=finite(speed);
  const vAbs=Math.max(0,Math.abs(finite(speedAbs,Math.abs(v))));
  const step=Math.max(0,finite(dt));
  let next=Number(velocityHeading);

  if(!Number.isFinite(next)||shouldCanonicalizeMomentumHeading({speedAbs:vAbs}))next=h;

  const trajectoryRearSlip=Math.max(0,finite(rearSlipAmount)-finite(frontSlipAmount)*.45);
  const lowSpeedNoSlip=
    !airborne&&vAbs<8.5&&finite(forceCoupledSlide)<.18&&
    finite(frontSlipAmount)<.16&&finite(rearSlipAmount)<.16;
  const target=bodyRelativeMomentumTargetHeading({speed:v,heading:h,velocityHeading:next});

  if(lowSpeedNoSlip){
    if(vAbs<2.5)next=target;
    else{
      const lowSpeedLockT=1-clamp((vAbs-2.5)/6.0,0,1);
      const lowSpeedFollowRate=34+lowSpeedLockT*48;
      next+=momentumAngleDelta(target,next)*(1-Math.exp(-step*lowSpeedFollowRate));
    }
    return next;
  }

  let attemptedTrajectoryDelta=0;
  if(!onPavement&&!airborne){
    attemptedTrajectoryDelta+=finite(offroadMomentumYawRate)*step;
  }

  const forceDominatedDrift=
    !airborne&&vAbs>4&&
    (finite(driftPhysicalAuthority)>.12||finite(driftKinematicScale,1)<.88);

  if(forceDominatedDrift){
    const signedSpeedForCurvature=Math.abs(v)>.5?v:Math.sign(v||1)*.5;
    const legacyForceTrajectoryYawRate=finite(netLateralAccel)/signedSpeedForCurvature;
    const forceTrajectoryYawRate=useLegacyDriftAssist
      ?blendDriftForce(
        legacyForceTrajectoryYawRate,
        finite(physicalTrajectoryYawRate),
        finite(driftPhysicalAuthority)
      )
      :finite(physicalTrajectoryYawRate);
    attemptedTrajectoryDelta+=forceTrajectoryYawRate*step;
  }else{
    const velocityFollowRate=airborne
      ?0
      :((2.8-1.45*finite(frictionTrajectoryLoss))+27.2*Math.pow(1-clamp(trajectoryRearSlip,0,1),2));
    attemptedTrajectoryDelta+=momentumAngleDelta(target,next)*(1-Math.exp(-step*velocityFollowRate));
  }

  next+=limitMomentumHeadingDelta({
    attemptedDelta:attemptedTrajectoryDelta,
    speedAbs:vAbs,
    lateralCapacityAccel:Math.max(0,finite(trajectoryLateralCapacityAccel)),
    dt:step,
    airborne
  });
  return next;
}
