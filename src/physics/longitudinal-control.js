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
