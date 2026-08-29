import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const path='src/physics/per-wheel-shadow-solver.js';
let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
function once(needle,replacement,label){
  const at=source.indexOf(needle);
  if(at<0)throw new Error(`Grip R8 missing anchor: ${label}`);
  if(source.indexOf(needle,at+needle.length)>=0)throw new Error(`Grip R8 ambiguous anchor: ${label}`);
  source=source.slice(0,at)+replacement+source.slice(at+needle.length);
}

if(source.includes('Grip R8 — ABS service braking')){
  console.log('Grip R8 already applied');
  process.exit(0);
}

once(
  "import { ackermannSteeringAngles } from './steering-geometry.js';\n",
  "import { ackermannSteeringAngles } from './steering-geometry.js';\nimport { regulateAbsWheelOmega, lockedTireGroundForce } from './braking-tire-control.js';\n",
  'braking tire control import'
);

once(
  `// World Drive V21.27 — non-authoritative per-wheel shadow solver.\n//\n// This solver deliberately runs beside the proven V21.26 handling. It computes\n// contact-patch slip, tire forces, wheel angular speed and chassis force/moment\n// diagnostics, but it NEVER writes vehicle position, heading or speed.`,
  `// World Drive V21.27 per-wheel solver, selectively promoted by Grip R7.\n//\n// It began as a non-authoritative shadow solver. Grip R7 now uses its physical\n// force/moment outputs during real drift and tire saturation, while ordinary\n// small-slip driving still retains the established bicycle-model response.`,
  'stale shadow-only header'
);

once(
  `  driveTorqueNm,\n  serviceBrakeTorqueNm,\n  handbrakeTorqueNm\n}){`,
  `  driveTorqueNm,\n  serviceBrakeTorqueNm,\n  handbrakeTorqueNm,\n  absEnabled=false\n}){`,
  'wheel integration abs argument'
);

once(
  `  const brakeTorqueNm=finite(serviceBrakeTorqueNm)+finite(handbrakeTorqueNm);\n  const hasDrive=Math.abs(finite(driveTorqueNm))>.01;\n  const brakingOnly=!hasDrive&&Math.abs(brakeTorqueNm)>.01;\n  const dt=Math.max(0,finite(step,0));`,
  `  const brakeTorqueNm=finite(serviceBrakeTorqueNm)+finite(handbrakeTorqueNm);\n  const hasDrive=Math.abs(finite(driveTorqueNm))>.01;\n  const brakingOnly=!hasDrive&&Math.abs(brakeTorqueNm)>.01;\n  const absEligible=!!absEnabled&&\n    Math.abs(finite(serviceBrakeTorqueNm))>.01&&\n    Math.abs(finite(handbrakeTorqueNm))<=.01&&\n    Math.abs(finite(patch?.longitudinal))>=2;\n  const dt=Math.max(0,finite(step,0));`,
  'abs eligibility state'
);

once(
  `    return {force:forceAtOmega(state.omega),locked:false};`,
  `    return {force:forceAtOmega(state.omega),locked:false,absActive:false};`,
  'airborne/no-load wheel return'
);

once(
  `  if(brakingOnly&&Math.abs(previousOmega)<.35){`,
  `  if(brakingOnly&&!absEligible&&Math.abs(previousOmega)<.35){`,
  'pre-integration lock guard'
);

once(
  `      return {force:forceAtLock,locked:true};`,
  `      return {force:forceAtLock,locked:true,absActive:false};`,
  'first locked return'
);

once(
  `  let nextOmega=(previousOmega+dt*(externalTorque+roadDriveTorque)/inertia)/Math.max(1e-9,denominator);\n\n  if(brakingOnly&&Math.abs(previousOmega)>.001&&Math.sign(previousOmega)!==Math.sign(nextOmega)){\n    nextOmega=0;\n  }`,
  `  let nextOmega=(previousOmega+dt*(externalTorque+roadDriveTorque)/inertia)/Math.max(1e-9,denominator);\n\n  // Grip R8 — ABS service braking regulates wheel angular speed around the\n  // tire's declared peak slip ratio. The old code only implemented EBD despite\n  // the absEnabled flag, so an ABS-equipped road car could still lock its front\n  // wheels during trail braking and feed a reversed force vector into Grip R7.\n  const absRegulation=regulateAbsWheelOmega({\n    nextOmega,\n    longitudinalSpeed:patch.longitudinal,\n    radiusM:radius,\n    peakSlipRatio:tire?.peakSlipRatio,\n    serviceBrakeTorqueNm,\n    handbrakeTorqueNm,\n    absEnabled:absEligible\n  });\n  nextOmega=absRegulation.omega;\n\n  if(brakingOnly&&!absRegulation.active&&Math.abs(previousOmega)>.001&&Math.sign(previousOmega)!==Math.sign(nextOmega)){\n    nextOmega=0;\n  }`,
  'abs wheel speed regulation'
);

once(
  `  if(brakingOnly&&Math.abs(state.omega)<.35){`,
  `  if(brakingOnly&&!absEligible&&Math.abs(state.omega)<.35){`,
  'post-integration lock guard'
);

once(
  `      return {force:forceAtLock,locked:true};`,
  `      return {force:forceAtLock,locked:true,absActive:false};`,
  'second locked return'
);

once(
  `  return {force:forceAtOmega(state.omega),locked:false};\n}`,
  `  return {force:forceAtOmega(state.omega),locked:false,absActive:absRegulation.active};\n}`,
  'normal wheel return'
);

once(
  `    locked:!!wheel.locked,\n    slipRatio:wheel.slipRatio,`,
  `    locked:!!wheel.locked,\n    absActive:!!wheel.absActive,\n    slipRatio:wheel.slipRatio,`,
  'abs wheel telemetry'
);

once(
  `        driveTorqueNm,\n        serviceBrakeTorqueNm,\n        handbrakeTorqueNm\n      });\n      const force=integrated.force;`,
  `        driveTorqueNm,\n        serviceBrakeTorqueNm,\n        handbrakeTorqueNm,\n        absEnabled:vehicle?.absEnabled!==false\n      });\n      let force=integrated.force;\n      if(integrated.locked){\n        // Grip R8 — a locked tire is sliding, so kinetic friction opposes the\n        // actual contact-patch velocity in the chassis frame. The old wheel-\n        // axis brush calculation could rotate a large braking force sideways\n        // with steering lock and yaw the car opposite the driver's command.\n        const groundSlide=lockedTireGroundForce({\n          bodyX:patch.bodyX,\n          bodyZ:patch.bodyZ,\n          normalLoadN,\n          slideMu:force?.slideMu,\n          steerAngle,\n          localX,\n          localZ\n        });\n        force={\n          ...force,\n          ...groundSlide,\n          slideBlend:1,\n          saturated:true,\n          utilization:Math.max(1,finite(force?.utilization,1))\n        };\n      }`,
  'locked tire ground force integration'
);

once(
  `        wheelOmega:state.omega,\n        locked:integrated.locked,\n        ...force`,
  `        wheelOmega:state.omega,\n        locked:integrated.locked,\n        absActive:integrated.absActive,\n        ...force`,
  'abs state serialization input'
);

fs.writeFileSync(path,source,'utf8');
const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
if(check.status!==0)throw new Error(check.stderr||check.stdout);
console.log('Grip R8 braking solver patch applied');
