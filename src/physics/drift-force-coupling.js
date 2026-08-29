// Grip R7 — promote the V21.27 per-wheel tire forces during real drift.
// The bicycle model remains useful in the small-slip linear region, but once
// chassis sideslip grows the actual tire force vector must decide how momentum
// and yaw evolve. This is especially important under countersteer.

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function clamp01(value){
  return Math.max(0,Math.min(1,finite(value,0)));
}

function smoothstep01(value){
  const t=clamp01(value);
  return t*t*(3-2*t);
}

export function driftTireForceAuthority({sideslipRad=0,forceCoupledSlide=0}={}){
  const beta=Math.abs(finite(sideslipRad,0));

  // A bicycle model is a small-slip approximation. Begin handing authority to
  // per-wheel forces around 5.7 degrees of chassis sideslip and make them fully
  // authoritative by roughly 25 degrees. Existing axle saturation can bring the
  // physical solver in slightly earlier without creating an on/off transition.
  const sideslipAuthority=smoothstep01((beta-.10)/.34);
  const saturationAuthority=smoothstep01((finite(forceCoupledSlide,0)-.08)/.58)*.82;
  return Math.max(sideslipAuthority,saturationAuthority);
}

export function tireForceTrajectoryYawRate({bodyVx=0,bodyVz=0,accelX=0,accelZ=0}={}){
  const vx=finite(bodyVx,0);
  const vz=finite(bodyVz,0);
  const ax=finite(accelX,0);
  const az=finite(accelZ,0);
  const speed2=vx*vx+vz*vz;
  if(speed2<2.25)return 0;

  // d(atan2(vx,vz))/dt. Because a rigid rotation of coordinates preserves this
  // cross product, body-frame tire forces can bend the world momentum heading
  // directly without a synthetic steering-direction assumption.
  return (vz*ax-vx*az)/speed2;
}

export function blendDriftForce(legacyValue=0,physicalValue=0,authority=0){
  const t=clamp01(authority);
  return finite(legacyValue,0)+(finite(physicalValue,0)-finite(legacyValue,0))*t;
}
