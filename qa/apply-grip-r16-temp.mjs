import fs from 'node:fs';
const path='src/driving-runtime-base.js';
let source=fs.readFileSync(path,'utf8');

const anchor=`export function driftKinematicCoupling({sideslipRad=0,forceCoupledSlide=0}={}){\n  const sideslip=Math.max(0,Math.min(Math.PI*.5,Math.abs(Number(sideslipRad)||0)));\n  const slide=Math.max(0,Math.min(1,Number(forceCoupledSlide)||0));\n  // Bicycle-model yaw is valid near the no-slip region, but it must stop acting\n  // like stability control once the chassis is far from its momentum vector.\n  // Near 90 degrees only 6% of the kinematic yaw target remains; angular inertia\n  // and measured tire-force imbalance dominate instead.\n  const sideT=smoothstep01((sideslip-.30)/.85);\n  const forceT=\n    smoothstep01((slide-.12)/.68)*\n    driftForceSideslipGate(sideslip);\n  return 1-.94*Math.max(sideT,forceT);\n}\n`;
const replacement=anchor+`\n// Grip R16 — front-axle saturation is understeer, not reverse steering.\n// The legacy grip estimator expresses lost front lateral force as an opposing\n// yaw moment. In the near/bicycle transition that moment was integrated as an\n// independent yaw acceleration, so a FWD car on throttle could cross through\n// zero yaw and point opposite the steering command. The already-scaled bicycle\n// yaw target owns ordinary understeer; genuine drift/countersteer remains owned\n// by the per-wheel physical solver blended later.\nexport function legacyGripYawAcceleration({frictionYawAccel=0,yawRate=0,frontSlip=0,rearSlip=0}={}){\n  const accel=Number(frictionYawAccel)||0;\n  const targetYaw=Number(yawRate)||0;\n  const front=Math.max(0,Number(frontSlip)||0);\n  const rear=Math.max(0,Number(rearSlip)||0);\n  const frontDominated=front>rear+.06;\n  if(frontDominated&&Math.abs(targetYaw)>.01&&accel*targetYaw<0)return 0;\n  return accel;\n}\n`;
if(!source.includes(anchor))throw new Error('Grip R16 helper anchor missing');
source=source.replace(anchor,replacement);

const oldBlend=`    const authoritativeYawAccel=blendDriftForce(\n      frictionYawAccel,\n      physicalTireYawAccel,\n      driftPhysicalAuthority\n    );`;
const newBlend=`    const legacyYawAccel=legacyGripYawAcceleration({\n      frictionYawAccel,\n      yawRate,\n      frontSlip:targetFrontSlip,\n      rearSlip:targetRearSlip\n    });\n    const authoritativeYawAccel=blendDriftForce(\n      legacyYawAccel,\n      physicalTireYawAccel,\n      driftPhysicalAuthority\n    );`;
if(!source.includes(oldBlend))throw new Error('Grip R16 blend anchor missing');
source=source.replace(oldBlend,newBlend);
fs.writeFileSync(path,source);
console.log('Applied Grip R16 front-understeer yaw fix');
