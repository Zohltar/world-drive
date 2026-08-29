import fs from 'node:fs';

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`Grip R5 missing anchor: ${label}`);
  if(source.indexOf(needle,first+needle.length)>=0)throw new Error(`Grip R5 ambiguous anchor: ${label}`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

const runtimePath='src/driving-runtime-base.js';
const dynamicsPath='src/vehicle-dynamics-base.js';
let runtime=fs.readFileSync(runtimePath,'utf8').replace(/\r\n/g,'\n');
let dynamics=fs.readFileSync(dynamicsPath,'utf8').replace(/\r\n/g,'\n');

if(runtime.includes('Grip R5 — physical off-road sideslip friction')){
  console.log('Grip R5 already applied');
  process.exit(0);
}

runtime=replaceOnce(
  runtime,
  `import { createPerWheelShadowSolver } from './physics/per-wheel-shadow-solver.js';\n`,
  `import { createPerWheelShadowSolver } from './physics/per-wheel-shadow-solver.js';\nimport { effectiveTireFriction, tireProfileForVehicle } from './physics/tire-model.js';\n`,
  'runtime tire-model import'
);

runtime=replaceOnce(
  runtime,
  `function smoothstep01(value){\n  const t=Math.max(0,Math.min(1,Number(value)||0));\n  return t*t*(3-2*t);\n}\n`,
  `function smoothstep01(value){\n  const t=Math.max(0,Math.min(1,Number(value)||0));\n  return t*t*(3-2*t);\n}\n\nconst GRAVITY=9.80665;\n\n// Grip R5 — physical off-road sideslip friction. The V21.27 tire/surface model\n// already knows the tire compound and dirt peak/sliding friction; use that same\n// model for the authoritative terrain path instead of a steering-demand proxy.\nexport function offroadTireFriction({vehicleId='unknown',vehicle={}}={}){\n  const tire=tireProfileForVehicle(vehicleId,vehicle);\n  const massKg=Math.max(250,Number(vehicle?.massKg)||1500);\n  const normalLoadN=massKg*GRAVITY/4;\n  return effectiveTireFriction({tire,surface:'dirt',normalLoadN});\n}\n\nexport function offroadSideslipFriction({\n  speed=0,heading=0,velocityHeading=0,slideMu=.45,airborne=false\n}={}){\n  const signedSpeed=Number(speed)||0;\n  const speedAbs=Math.abs(signedSpeed);\n  if(airborne||speedAbs<.35)return {speedDecel:0,momentumYawRate:0,slideGate:0,sideslipRad:0};\n\n  // velocityHeading parameterizes the signed scalar speed. Convert it to the\n  // actual direction of travel before resolving velocity in the chassis frame.\n  const travelHeading=(Number(velocityHeading)||0)+(signedSpeed<0?Math.PI:0);\n  let delta=travelHeading-(Number(heading)||0);\n  delta=Math.atan2(Math.sin(delta),Math.cos(delta));\n  const lateral=Math.sin(delta);\n  const longitudinal=Math.cos(delta);\n  const sideslip=Math.atan2(Math.abs(lateral),Math.abs(longitudinal));\n\n  // Below the tire's normal slip-angle region there is no sliding work. Once\n  // the tire is genuinely skidding, kinetic dirt friction opposes contact-patch\n  // lateral velocity. This is continuous and has no 90-degree branch.\n  const slideGate=smoothstep01((sideslip-.10)/.32);\n  const speedGate=smoothstep01((speedAbs-.6)/2.4);\n  const frictionAccel=GRAVITY*Math.max(.08,Math.min(1.20,Number(slideMu)||.45))*slideGate*speedGate;\n\n  // Work done by lateral friction removes kinetic energy at a rate proportional\n  // to the lateral fraction of velocity. The perpendicular component bends the\n  // momentum vector toward the nearest chassis travel axis. At exactly 90 deg\n  // it only slows the vehicle — it cannot create an artificial rotation wall.\n  const speedDecel=frictionAccel*Math.abs(lateral);\n  const momentumYawRate=\n    -frictionAccel*Math.sign(lateral||0)*longitudinal/Math.max(.50,speedAbs);\n\n  return {speedDecel,momentumYawRate,slideGate,sideslipRad:sideslip};\n}\n`,
  'runtime helper insertion'
);

runtime=replaceOnce(
  runtime,
  `    const onPavement=!!(nr&&nr.d<8.5);\n    currentOnPavementForInstruments=onPavement;\n    const preDriveBodyLongitudinalSpeed=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});`,
  `    const onPavement=!!(nr&&nr.d<8.5);\n    currentOnPavementForInstruments=onPavement;\n    const offroadFrictionModel=!onPavement&&!airborneNow\n      ?offroadTireFriction({vehicleId:getVehicleId?.()||'unknown',vehicle:VEHICLE})\n      :null;\n    const offroadSlipForce=offroadFrictionModel\n      ?offroadSideslipFriction({speed,heading,velocityHeading,slideMu:offroadFrictionModel.slide,airborne:airborneNow})\n      :{speedDecel:0,momentumYawRate:0,slideGate:0,sideslipRad:0};\n    const preDriveBodyLongitudinalSpeed=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});`,
  'offroad force sample'
);

runtime=replaceOnce(
  runtime,
  `    }else if(!throttle&&Math.abs(gradeForce.acceleration)<.04)speed=0;\n\n    if(hand&&!airborneNow){`,
  `    }else if(!throttle&&Math.abs(gradeForce.acceleration)<.04)speed=0;\n\n    // Grip R5: terrain lateral scrub is real dissipative work, independent of\n    // steering input or the legacy fourWheelSlide telemetry.\n    if(!onPavement&&!airborneNow&&offroadSlipForce.speedDecel>1e-5&&Math.abs(speed)>.05){\n      accel-=Math.sign(speed)*offroadSlipForce.speedDecel;\n    }\n\n    if(hand&&!airborneNow){`,
  'offroad speed dissipation'
);

runtime=replaceOnce(
  runtime,
  `    const lateralEnvelope=lateralDynamicsEnvelope({vehicle:VEHICLE,speed:steeringTravelSpeed,steerAngle,steerInput:steer,driveThrottle,onPavement,surfaceGrip,awdOffroadGripBonus,rearSlipAmount:0,airborne:airborneNow},dynamicsScratch.lateral);`,
  `    const lateralEnvelope=lateralDynamicsEnvelope({vehicle:VEHICLE,speed:steeringTravelSpeed,steerAngle,steerInput:steer,driveThrottle,onPavement,surfaceGrip,awdOffroadGripBonus,offroadPeakMu:offroadFrictionModel?.peak,rearSlipAmount:0,airborne:airborneNow},dynamicsScratch.lateral);`,
  'offroad peak mu bridge'
);

runtime=replaceOnce(
  runtime,
  `    if(!airborneNow&&fourWheelSlide>.01&&speedAbs>6){\n      const scrubDecel=1.0+fourWheelSlide*3.2,scrubDelta=scrubDecel*dt;`,
  `    if(onPavement&&!airborneNow&&fourWheelSlide>.01&&speedAbs>6){\n      const scrubDecel=1.0+fourWheelSlide*3.2,scrubDelta=scrubDecel*dt;`,
  'legacy four-wheel scrub road-only'
);

runtime=replaceOnce(
  runtime,
  `    }else{\n      let attemptedTrajectoryDelta=0;\n      const forceDominatedDrift=`,
  `    }else{\n      let attemptedTrajectoryDelta=0;\n      // The perpendicular component of real terrain sliding friction bends the\n      // momentum vector. This is force-derived, not a synthetic body-axis lock.\n      if(!onPavement&&!airborneNow){\n        attemptedTrajectoryDelta+=offroadSlipForce.momentumYawRate*dt;\n      }\n      const forceDominatedDrift=`,
  'offroad momentum force'
);

dynamics=replaceOnce(
  dynamics,
  `export function lateralDynamicsEnvelope({vehicle,speed=0,steerAngle=0,steerInput=0,driveThrottle=0,onPavement=true,surfaceGrip=1,awdOffroadGripBonus=1,rearSlipAmount=0,airborne=false}={},out=null){`,
  `export function lateralDynamicsEnvelope({vehicle,speed=0,steerAngle=0,steerInput=0,driveThrottle=0,onPavement=true,surfaceGrip=1,awdOffroadGripBonus=1,offroadPeakMu=null,rearSlipAmount=0,airborne=false}={},out=null){`,
  'lateral envelope signature'
);

dynamics=replaceOnce(
  dynamics,
  `  const offroadGripBlend=clampDynamics((speedAbs-8)/18,0,1),roadGripMultiplier=safeNumber(vehicle?.roadGripMultiplier,1);\n  const effectiveOffroadGrip=Math.min(.96,safeNumber(vehicle?.offroadGrip,.60)*Math.max(.5,safeNumber(awdOffroadGripBonus,1)));\n  const effectiveGrip=onPavement?safeNumber(surfaceGrip,1)*roadGripMultiplier:1+(effectiveOffroadGrip-1)*offroadGripBlend;`,
  `  const roadGripMultiplier=safeNumber(vehicle?.roadGripMultiplier,1);\n  const suppliedOffroadPeak=Number(offroadPeakMu);\n  const effectiveOffroadGrip=clampDynamics(\n    Number.isFinite(suppliedOffroadPeak)?suppliedOffroadPeak:safeNumber(vehicle?.offroadGrip,.60),\n    .18,.95\n  );\n  // Grip R5: steering geometry itself is not weakened by loose terrain. The\n  // friction limit below decides whether the requested curvature is attainable.\n  // AWD is deliberately absent here: drive layout does not raise passive Fy.\n  const effectiveGrip=onPavement?safeNumber(surfaceGrip,1)*roadGripMultiplier:1;`,
  'offroad grip geometry cleanup'
);

dynamics=replaceOnce(
  dynamics,
  `  const offroadLatLimit=(speedAbs<10?7.0:3.8)*Math.max(.5,safeNumber(awdOffroadGripBonus,1));`,
  `  // Grip R5: continuous Coulomb-style lateral ceiling. The old 7.0 -> 3.8\n  // m/s^2 branch at 10 m/s created a nonphysical handling discontinuity.\n  const offroadLatLimit=effectiveOffroadGrip*GRAVITY;`,
  'offroad hard threshold removal'
);

dynamics=replaceOnce(
  dynamics,
  `  result.effectiveGrip=effectiveGrip;result.roadLatLimit=roadLatLimit;result.offroadLatLimit=offroadLatLimit;`,
  `  result.effectiveGrip=effectiveGrip;result.roadLatLimit=roadLatLimit;result.offroadLatLimit=offroadLatLimit;result.offroadPeakMu=effectiveOffroadGrip;`,
  'offroad diagnostics'
);

fs.writeFileSync(runtimePath,runtime,'utf8');
fs.writeFileSync(dynamicsPath,dynamics,'utf8');
console.log('Grip R5 patch applied');
