// World Drive V21.27.3 — first authoritative chassis bridge for the WRX.
//
// Scope is intentionally narrow: longitudinal speed is still owned by the
// proven V21.26 engine/brake/grade/drag model. Lateral momentum direction and
// chassis yaw are integrated from the per-wheel contact-patch solver instead of
// the legacy bicycle/drift helpers. This lets us validate real tire-force drift
// before replacing every longitudinal subsystem at once.

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}

function normalizeAngle(value){
  let a=finite(value,0);
  while(a>Math.PI)a-=Math.PI*2;
  while(a<-Math.PI)a+=Math.PI*2;
  return a;
}

export function angleDifference(target,current){
  return normalizeAngle(finite(target)-finite(current));
}

export function createWrxAuthorityController({
  minimumSpeedMps=2.0,
  maxYawRateRad=2.8,
  maxYawAccelRad=12,
  maxLateralAccel=22,
  maxSideslipRad=.88
}={}){
  const minSpeed=Math.max(.5,finite(minimumSpeedMps,2));
  const maxYawRate=Math.max(.5,finite(maxYawRateRad,2.8));
  const maxYawAccel=Math.max(1,finite(maxYawAccelRad,12));
  const maxLatAccel=Math.max(2,finite(maxLateralAccel,22));
  const maxSideslip=Math.max(.20,finite(maxSideslipRad,.88));

  let appliedFrames=0;
  let lastResult={
    applied:false,
    reason:'not-run',
    heading:0,
    velocityHeading:0,
    dynamicYawRate:0,
    yawAccel:0,
    lateralAccel:0,
    sideslipRad:0
  };

  function apply({
    enabled=true,
    vehicleId='unknown',
    airborne=false,
    autopilot=false,
    dt=0,
    speed=0,
    heading=0,
    velocityHeading=heading,
    dynamicYawRate=0,
    physics=null
  }={}){
    const h=normalizeAngle(heading);
    const vh=Number.isFinite(Number(velocityHeading))
      ?normalizeAngle(velocityHeading)
      :h;
    const yawRate=finite(dynamicYawRate,0);
    const speedMps=finite(speed,0);
    const safeDt=clamp(finite(dt,0),0,.05);

    let reason='applied';
    if(!enabled)reason='disabled';
    else if(vehicleId!=='wrx')reason='non-wrx';
    else if(airborne)reason='airborne';
    else if(autopilot)reason='autopilot-fallback';
    else if(Math.abs(speedMps)<minSpeed)reason='low-speed-fallback';
    else if(!physics||physics.shadow!==true)reason='missing-physics';

    if(reason!=='applied'){
      lastResult={
        applied:false,
        reason,
        heading:h,
        velocityHeading:vh,
        dynamicYawRate:yawRate,
        yawAccel:0,
        lateralAccel:0,
        sideslipRad:angleDifference(vh,h)
      };
      return lastResult;
    }

    // These are safety envelopes, not handling coefficients. Ordinary tire
    // forces stay far inside them; they only prevent a bad diagnostic sample or
    // malformed contact from exploding the experimental chassis state.
    const yawAccel=clamp(
      finite(physics.predictedYawAccel,0),
      -maxYawAccel,
      maxYawAccel
    );
    const lateralAccel=clamp(
      finite(physics.predictedAccelX,0),
      -maxLatAccel,
      maxLatAccel
    );

    const nextYawRate=clamp(
      yawRate+yawAccel*safeDt,
      -maxYawRate,
      maxYawRate
    );

    // Trapezoidal angular integration avoids a one-step phase lead while keeping
    // the actual tire moment fully authoritative.
    const nextHeading=normalizeAngle(
      h+(yawRate+nextYawRate)*.5*safeDt
    );

    // Linear momentum rotates from the NET lateral tire force. Because heading
    // is integrated independently from yaw moment, rear lock can rotate the body
    // faster than momentum and sideslip emerges naturally.
    const signedReferenceSpeed=
      Math.abs(speedMps)>=minSpeed
        ?speedMps
        :Math.sign(speedMps||1)*minSpeed;
    const momentumYawRate=lateralAccel/signedReferenceSpeed;
    let nextVelocityHeading=normalizeAngle(
      vh+momentumYawRate*safeDt
    );

    // Catastrophic-state guard only. ~50 degrees of sideslip is already a deep
    // spin; beyond that the current 2D bridge can become numerically ambiguous.
    // Full 4-wheel chassis integration can later remove this transitional cap.
    const rawSideslip=angleDifference(nextVelocityHeading,nextHeading);
    if(Math.abs(rawSideslip)>maxSideslip){
      nextVelocityHeading=normalizeAngle(
        nextHeading+Math.sign(rawSideslip)*maxSideslip
      );
    }

    appliedFrames++;
    lastResult={
      applied:true,
      reason:'applied',
      heading:nextHeading,
      velocityHeading:nextVelocityHeading,
      dynamicYawRate:nextYawRate,
      yawAccel,
      lateralAccel,
      sideslipRad:angleDifference(nextVelocityHeading,nextHeading),
      appliedFrames
    };
    return lastResult;
  }

  function reset(){
    appliedFrames=0;
    lastResult={
      applied:false,
      reason:'reset',
      heading:0,
      velocityHeading:0,
      dynamicYawRate:0,
      yawAccel:0,
      lateralAccel:0,
      sideslipRad:0
    };
  }

  function diagnostics(){
    return {...lastResult,appliedFrames};
  }

  return {apply,reset,diagnostics};
}
