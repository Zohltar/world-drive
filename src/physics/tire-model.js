import { surfaceFrictionProfile } from './surface-friction.js';

// World Drive V21.27 — pure per-wheel tire/contact-patch foundation.
//
// This module is intentionally NOT connected to driving-runtime.js yet. It can
// be tested and calibrated in isolation before replacing the proven V21.26
// handling. Coordinates used by the pure math helpers are vehicle-local:
//   +X = vehicle right
//   +Z = vehicle forward
//   +yaw = rotation that turns +Z toward +X
// Steering angle is measured from +Z toward +X.

const DEG=Math.PI/180;

const TIRE_PROFILES={
  'touring-all-season':{
    id:'touring-all-season',
    label:'Touring quatre-saisons',
    peakMu:0.94,
    slideMu:0.76,
    corneringStiffnessNPerRad:76000,
    longitudinalStiffnessN:82000,
    loadSensitivityExponent:.90,
    referenceLoadN:3800,
    rollingRadiusM:.32,
    wheelInertiaKgM2:1.25,
    peakSlipAngleRad:8.0*DEG,
    peakSlipRatio:.12
  },
  'performance-summer':{
    id:'performance-summer',
    label:'Performance été',
    peakMu:1.10,
    slideMu:0.88,
    corneringStiffnessNPerRad:92000,
    longitudinalStiffnessN:98000,
    loadSensitivityExponent:.89,
    referenceLoadN:3700,
    rollingRadiusM:.33,
    wheelInertiaKgM2:1.35,
    peakSlipAngleRad:7.0*DEG,
    peakSlipRatio:.11
  },
  'vintage-performance':{
    id:'vintage-performance',
    label:'Performance routier vintage',
    peakMu:0.96,
    slideMu:0.77,
    corneringStiffnessNPerRad:70000,
    longitudinalStiffnessN:76000,
    loadSensitivityExponent:.88,
    referenceLoadN:3650,
    rollingRadiusM:.34,
    wheelInertiaKgM2:1.30,
    peakSlipAngleRad:9.0*DEG,
    peakSlipRatio:.13
  },
  'ev-touring':{
    id:'ev-touring',
    label:'Touring EV charge élevée',
    peakMu:0.98,
    slideMu:0.79,
    corneringStiffnessNPerRad:86000,
    longitudinalStiffnessN:93000,
    loadSensitivityExponent:.88,
    referenceLoadN:5000,
    rollingRadiusM:.35,
    wheelInertiaKgM2:1.55,
    peakSlipAngleRad:7.5*DEG,
    peakSlipRatio:.115
  },
  'narrow-eco':{
    id:'narrow-eco',
    label:'Éco étroit',
    peakMu:0.84,
    slideMu:0.68,
    corneringStiffnessNPerRad:61000,
    longitudinalStiffnessN:68000,
    loadSensitivityExponent:.91,
    referenceLoadN:3300,
    rollingRadiusM:.32,
    wheelInertiaKgM2:1.05,
    peakSlipAngleRad:9.5*DEG,
    peakSlipRatio:.13
  },
  'race-slick':{
    id:'race-slick',
    label:'Slick compétition',
    peakMu:1.68,
    slideMu:1.34,
    corneringStiffnessNPerRad:145000,
    longitudinalStiffnessN:155000,
    loadSensitivityExponent:.84,
    referenceLoadN:3000,
    rollingRadiusM:.33,
    wheelInertiaKgM2:.95,
    peakSlipAngleRad:5.5*DEG,
    peakSlipRatio:.09
  },
  'truck-highway':{
    id:'truck-highway',
    label:'Camion routier',
    peakMu:0.88,
    slideMu:0.70,
    corneringStiffnessNPerRad:165000,
    longitudinalStiffnessN:180000,
    loadSensitivityExponent:.86,
    referenceLoadN:18000,
    rollingRadiusM:.51,
    wheelInertiaKgM2:5.8,
    peakSlipAngleRad:7.5*DEG,
    peakSlipRatio:.11
  }
};

export const TIRE_PROFILE_CATALOG=Object.freeze(
  Object.fromEntries(
    Object.entries(TIRE_PROFILES).map(([id,profile])=>[
      id,
      Object.freeze({...profile})
    ])
  )
);

// Initial V21.27 calibration map. This is metadata only in Phase 1; the V21.26
// runtime does not consume it yet. Later vehicle profiles may own tireProfile
// directly once the new solver becomes authoritative.
export const VEHICLE_TIRE_PROFILE=Object.freeze({
  id4:'ev-touring',
  wrx:'performance-summer',
  civic:'touring-all-season',
  sonata:'touring-all-season',
  f1_2010:'race-slick',
  countach_80:'vintage-performance',
  semi_6x4:'truck-highway',
  i3_2017:'narrow-eco'
});

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}

function smoothstep01(value){
  const t=clamp(finite(value,0),0,1);
  return t*t*(3-2*t);
}

export function tireProfile(id='touring-all-season'){
  return TIRE_PROFILE_CATALOG[id]||TIRE_PROFILE_CATALOG['touring-all-season'];
}

export function tireProfileForVehicle(vehicleId,vehiclePhysics=null){
  const explicit=vehiclePhysics?.tireProfile;
  if(explicit&&TIRE_PROFILE_CATALOG[explicit])return tireProfile(explicit);
  return tireProfile(VEHICLE_TIRE_PROFILE[vehicleId]||'touring-all-season');
}

// Real tire friction is load-sensitive: vertical load can rise faster than the
// available tire force. exponent < 1 means effective mu falls as Fz increases.
export function loadSensitiveMu({baseMu=1,normalLoadN=0,referenceLoadN=4000,exponent=.90}={}){
  const fz=Math.max(1,finite(normalLoadN,0));
  const ref=Math.max(1,finite(referenceLoadN,4000));
  const exp=clamp(finite(exponent,.90),.65,1.05);
  return Math.max(.05,finite(baseMu,1)*Math.pow(fz/ref,exp-1));
}

export function effectiveTireFriction({
  tire='touring-all-season',
  surface='asphalt-dry',
  normalLoadN=4000
}={}){
  const profile=typeof tire==='string'?tireProfile(tire):tireProfile(tire?.id);
  const surfaceProfile=typeof surface==='string'?surfaceFrictionProfile(surface):surfaceFrictionProfile(surface?.id);
  const peak=loadSensitiveMu({
    baseMu:profile.peakMu*surfaceProfile.peakScale,
    normalLoadN,
    referenceLoadN:profile.referenceLoadN,
    exponent:profile.loadSensitivityExponent
  });
  const slide=loadSensitiveMu({
    baseMu:profile.slideMu*surfaceProfile.slideScale,
    normalLoadN,
    referenceLoadN:profile.referenceLoadN,
    exponent:profile.loadSensitivityExponent
  });
  return {peak,slide,profile,surface:surfaceProfile};
}

// Velocity at a wheel contact point from rigid-body translation + yaw.
export function contactPatchVelocity({
  bodyVx=0,
  bodyVz=0,
  yawRate=0,
  localX=0,
  localZ=0,
  steerAngle=0
}={}){
  const vx=finite(bodyVx)+finite(yawRate)*finite(localZ);
  const vz=finite(bodyVz)-finite(yawRate)*finite(localX);
  const delta=finite(steerAngle);
  const s=Math.sin(delta),c=Math.cos(delta);
  const longitudinal=vx*s+vz*c;
  const lateral=vx*c-vz*s;
  return {bodyX:vx,bodyZ:vz,longitudinal,lateral};
}

export function slipState({
  longitudinalSpeed=0,
  lateralSpeed=0,
  wheelOmega=0,
  radiusM=.32,
  minimumReferenceSpeed=1.0
}={}){
  const vLong=finite(longitudinalSpeed);
  const vLat=finite(lateralSpeed);
  const radius=Math.max(.05,finite(radiusM,.32));
  const treadSpeed=finite(wheelOmega)*radius;
  const reference=Math.max(
    Math.abs(vLong),
    Math.abs(treadSpeed),
    Math.max(.25,finite(minimumReferenceSpeed,1))
  );
  const slipRatio=(treadSpeed-vLong)/reference;
  const slipAngle=Math.atan2(vLat,Math.max(.35,Math.abs(vLong)));
  return {slipRatio,slipAngle,treadSpeed,referenceSpeed:reference};
}

// Lightweight brush-inspired force approximation. Linear stiffness creates the
// initial force demand; a combined-friction ellipse caps Fx/Fy. Beyond peak slip
// the available mu blends toward sliding friction instead of dropping abruptly.
export function resolveTireForces({
  tire='touring-all-season',
  surface='asphalt-dry',
  normalLoadN=4000,
  longitudinalSpeed=0,
  lateralSpeed=0,
  wheelOmega=0,
  steerAngle=0,
  localX=0,
  localZ=0
}={}){
  const profile=typeof tire==='string'?tireProfile(tire):tireProfile(tire?.id);
  const fz=Math.max(0,finite(normalLoadN));
  if(fz<=1){
    return {
      fxWheel:0,fyWheel:0,forceX:0,forceZ:0,yawMomentNm:0,
      slipRatio:0,slipAngle:0,utilization:0,saturated:false,mu:0
    };
  }

  const slip=slipState({
    longitudinalSpeed,
    lateralSpeed,
    wheelOmega,
    radiusM:profile.rollingRadiusM
  });
  const friction=effectiveTireFriction({tire:profile,surface,normalLoadN:fz});

  const fxDemand=profile.longitudinalStiffnessN*slip.slipRatio;
  const fyDemand=-profile.corneringStiffnessNPerRad*slip.slipAngle;

  const slipSeverity=Math.hypot(
    slip.slipRatio/Math.max(.02,profile.peakSlipRatio),
    slip.slipAngle/Math.max(1*DEG,profile.peakSlipAngleRad)
  );
  const slideBlend=smoothstep01((slipSeverity-1)/1.25);
  const mu=friction.peak+(friction.slide-friction.peak)*slideBlend;
  const capacity=Math.max(1,mu*fz);
  const demandMagnitude=Math.hypot(fxDemand,fyDemand);
  const scale=demandMagnitude>capacity?capacity/demandMagnitude:1;
  const fxWheel=fxDemand*scale;
  const fyWheel=fyDemand*scale;

  const delta=finite(steerAngle);
  const s=Math.sin(delta),c=Math.cos(delta);
  const forceX=fxWheel*s+fyWheel*c;
  const forceZ=fxWheel*c-fyWheel*s;
  const yawMomentNm=finite(localZ)*forceX-finite(localX)*forceZ;

  return {
    fxWheel,
    fyWheel,
    forceX,
    forceZ,
    yawMomentNm,
    slipRatio:slip.slipRatio,
    slipAngle:slip.slipAngle,
    treadSpeed:slip.treadSpeed,
    utilization:demandMagnitude/capacity,
    saturated:demandMagnitude>capacity,
    slideBlend,
    mu,
    peakMu:friction.peak,
    slideMu:friction.slide,
    normalLoadN:fz,
    capacityN:capacity
  };
}
