// Grip R9 — independent longitudinal driver controls.
// Service braking is not reverse propulsion: it always removes kinetic energy
// from the current signed momentum, regardless of chassis orientation.

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function clamp01(value){
  return Math.max(0,Math.min(1,finite(value,0)));
}

export function serviceBrakeAcceleration({
  serviceBrake=0,
  speed=0,
  maxBrakeAccel=0,
  airborne=false,
  stopSpeed=.02
}={}){
  const pedal=clamp01(serviceBrake);
  const v=finite(speed,0);
  const capacity=Math.max(0,Math.abs(finite(maxBrakeAccel,0)));
  if(airborne||pedal<=0||capacity<=0||Math.abs(v)<=Math.max(0,finite(stopSpeed,.02)))return 0;
  return -Math.sign(v)*capacity*pedal;
}

// Trail Braking R1 — preserve the direction of a combined tire-force request.
//
// The scalar traction limiter runs before the lateral tire solver. Applying its
// full longitudinal result directly would therefore give braking first claim
// on the friction circle and leave steering only the small residual. ABS road
// cars instead send a feasible combined request into the tire solver: when the
// normalized longitudinal/lateral vector exceeds the g-g envelope, both axes
// share the same scale. The existing per-wheel solver then owns load transfer,
// combined slip and the resulting yaw moment.
export function combinedBrakeForceAllocation({
  serviceBrakeAccel=0,
  longitudinalLimit=0,
  requestedLateralAccel=0,
  lateralLimit=0,
  absEnabled=true,
  airborne=false,
  enabled=true
}={},out=null){
  const result=out||{};
  const acceleration=finite(serviceBrakeAccel,0);
  const longitudinalCapacity=Math.max(0,Math.abs(finite(longitudinalLimit,0)));
  const lateralCapacity=Math.max(0,Math.abs(finite(lateralLimit,0)));
  const longitudinalUtilization=longitudinalCapacity>1e-6
    ?Math.abs(acceleration)/longitudinalCapacity
    :0;
  const lateralUtilization=lateralCapacity>1e-6
    ?Math.min(1,Math.abs(finite(requestedLateralAccel,0))/lateralCapacity)
    :0;
  const combinedUtilization=Math.hypot(longitudinalUtilization,lateralUtilization);
  const forceScale=
    enabled&&absEnabled&&!airborne&&Math.abs(acceleration)>1e-8&&combinedUtilization>1
      ?1/combinedUtilization
      :1;

  result.acceleration=acceleration*forceScale;
  result.unallocatedAcceleration=acceleration;
  result.longitudinalLimit=longitudinalCapacity;
  result.lateralLimit=lateralCapacity;
  result.longitudinalUtilization=longitudinalUtilization;
  result.lateralUtilization=lateralUtilization;
  result.combinedUtilization=combinedUtilization;
  result.forceScale=forceScale;
  result.limited=forceScale<1-1e-8;
  return result;
}

export function shouldAutoClutchForServiceBrake({
  serviceBrake=0,
  speed=0,
  speedThreshold=.35
}={}){
  return clamp01(serviceBrake)>.04&&Math.abs(finite(speed,0))<Math.max(.05,finite(speedThreshold,.35));
}

export function brakeWouldCrossZero({previousSpeed=0,nextSpeed=0,serviceBrake=0}={}){
  const before=finite(previousSpeed,0);
  const after=finite(nextSpeed,0);
  return clamp01(serviceBrake)>.04&&Math.abs(before)>.02&&Math.sign(before)!==Math.sign(after);
}
