// Grip R6 — pure vertical/airborne dynamics helpers.
// Keep crest separation and landing contact decisions outside presentation code
// so they can be tested independently from Three.js and rendering.

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

export function horizontalTravelDirection({speed=0,heading=0,velocityHeading=null}={}){
  const signedSpeed=finite(speed,0);
  const fallbackHeading=finite(heading,0);
  const momentumHeading=Number.isFinite(Number(velocityHeading))?Number(velocityHeading):fallbackHeading;
  const directionSign=signedSpeed<0?-1:1;
  return {
    x:Math.sin(momentumHeading)*directionSign,
    z:Math.cos(momentumHeading)*directionSign,
    speedAbs:Math.abs(signedSpeed),
    heading:momentumHeading+(directionSign<0?Math.PI:0)
  };
}

export function crestLaunchDecision({
  speedAbs=0,
  supportOriginY=0,
  futureSupportY=0,
  supportVerticalVelocity=0,
  predictionTime=.075,
  downwardAccel=9.80665,
  minimumMovingSpeed=.35,
  gapTolerance=.002,
  accelerationTolerance=.18
}={}){
  const speed=Math.max(0,finite(speedAbs,0));
  const origin=finite(supportOriginY,0);
  const future=Number(futureSupportY);
  const supportVy=finite(supportVerticalVelocity,0);
  const time=Math.max(.015,Math.min(.16,finite(predictionTime,.075)));
  const down=Math.max(0,finite(downwardAccel,9.80665));
  const predictedBallisticY=origin+supportVy*time-.5*down*time*time;
  const predictedGap=Number.isFinite(future)?predictedBallisticY-future:-Infinity;
  const requiredSupportAccel=Number.isFinite(future)
    ?2*(future-origin-supportVy*time)/(time*time)
    :Infinity;
  const canLaunch=
    speed>Math.max(0,finite(minimumMovingSpeed,.35))&&
    predictedGap>Math.max(0,finite(gapTolerance,.002))&&
    requiredSupportAccel<-(down+Math.max(0,finite(accelerationTolerance,.18)));
  return {canLaunch,predictedBallisticY,predictedGap,requiredSupportAccel};
}

export function airborneLandingDecision({
  nextY=0,
  supportY=0,
  verticalVelocity=0,
  supportVerticalVelocity=0
}={}){
  const y=Number(nextY);
  const support=Number(supportY);
  if(!Number.isFinite(y)||!Number.isFinite(support))return false;
  const relativeVerticalVelocity=finite(verticalVelocity,0)-finite(supportVerticalVelocity,0);
  return y<=support&&relativeVerticalVelocity<=0;
}
