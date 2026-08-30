// Grip R8 — braking tire control used by the per-wheel solver.
//
// Two physical invariants live here:
// 1) ABS service braking must keep a rolling tire near its peak longitudinal
//    slip instead of allowing the wheel integrator to cross into a lock.
// 2) Once a tire is genuinely locked, kinetic friction opposes the actual
//    contact-patch ground velocity. Its direction is no longer tied to the
//    steering angle because a non-rolling tire has no preferred rolling axis.

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}

export function regulateAbsWheelOmega({
  nextOmega=0,
  longitudinalSpeed=0,
  radiusM=.32,
  peakSlipRatio=.11,
  serviceBrakeTorqueNm=0,
  handbrakeTorqueNm=0,
  absEnabled=true,
  minimumSpeed=2
}={}){
  const omega=finite(nextOmega,0);
  const vLong=finite(longitudinalSpeed,0);
  const radius=Math.max(.05,finite(radiusM,.32));
  const serviceBraking=Math.abs(finite(serviceBrakeTorqueNm,0))>.01;
  const handbraking=Math.abs(finite(handbrakeTorqueNm,0))>.01;
  if(!absEnabled||!serviceBraking||handbraking||Math.abs(vLong)<Math.max(.5,finite(minimumSpeed,2))){
    return {omega,active:false,targetOmega:omega,targetSlipRatio:0};
  }

  const targetSlip=clamp(Math.abs(finite(peakSlipRatio,.11)),.05,.20);
  // With the solver convention slip=(tread-vLong)/|vLong|, braking slip is
  // negative while travelling forward and positive while travelling reverse.
  // Multiplying vLong by (1-targetSlip) gives the correct tread speed in both.
  const targetOmega=vLong*(1-targetSlip)/radius;
  let regulated=omega;
  let active=false;

  if(vLong>0&&regulated<targetOmega){regulated=targetOmega;active=true;}
  else if(vLong<0&&regulated>targetOmega){regulated=targetOmega;active=true;}

  return {omega:regulated,active,targetOmega,targetSlipRatio:targetSlip};
}

export function lockedTireGroundForce({
  bodyX=0,
  bodyZ=0,
  normalLoadN=0,
  slideMu=.75,
  lateralScale=1,
  steerAngle=0,
  localX=0,
  localZ=0
}={}){
  const vx=finite(bodyX,0);
  const vz=finite(bodyZ,0);
  const speed=Math.hypot(vx,vz);
  const fz=Math.max(0,finite(normalLoadN,0));
  if(speed<.20||fz<=1){
    return {forceX:0,forceZ:0,fxWheel:0,fyWheel:0,yawMomentNm:0,mu:0,lateralScale:1};
  }

  const mu=clamp(Math.abs(finite(slideMu,.75)),.05,2.5);
  const crossScale=clamp(Math.abs(finite(lateralScale,1)),.05,1);
  const magnitude=mu*fz;
  const delta=finite(steerAngle,0);
  const sinD=Math.sin(delta),cosD=Math.cos(delta);

  // Grip R20 — a fully locked tire still has directional tread/carcass friction.
  // Preserve full kinetic braking along the tire's rolling axis, while allowing
  // a handbrake-locked rear tire to have lower cross-tread sliding authority.
  // lateralScale=1 reproduces the previous isotropic R8 force exactly.
  const vLong=vx*sinD+vz*cosD;
  const vLat=vx*cosD-vz*sinD;
  const fxWheel=-magnitude*(vLong/speed);
  const fyWheel=-magnitude*crossScale*(vLat/speed);
  const forceX=fxWheel*sinD+fyWheel*cosD;
  const forceZ=fxWheel*cosD-fyWheel*sinD;
  const yawMomentNm=finite(localZ,0)*forceX-finite(localX,0)*forceZ;

  return {forceX,forceZ,fxWheel,fyWheel,yawMomentNm,mu,lateralScale:crossScale};
}
