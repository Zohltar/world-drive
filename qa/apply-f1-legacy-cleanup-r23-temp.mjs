import fs from 'node:fs';

// 1) Runtime: F1 opts out of the three pre-R7/R16 synthetic drift/yaw helpers.
const runtimePath='src/driving-runtime-base.js';
let r=fs.readFileSync(runtimePath,'utf8');
let old=`    if(drivetrain==='RWD'&&powerCorneringLoad>.05&&!airborneNow){\n`;
let replacement=`    const useLegacyDriftAssist=VEHICLE?.legacyDriftAssist!==false;\n    if(useLegacyDriftAssist&&drivetrain==='RWD'&&powerCorneringLoad>.05&&!airborneNow){\n`;
if(!r.includes(old))throw new Error('R23 RWD yaw anchor missing');
r=r.replace(old,replacement);
old=`    const legacyYawAccel=legacyGripYawAcceleration({\n      frictionYawAccel,\n      yawRate,\n      frontSlip:targetFrontSlip,\n      rearSlip:targetRearSlip,\n      frontForceScale:frontLateralForceScale,\n      rearForceScale:rearLateralForceScale\n    });\n`;
replacement=`    const legacyYawAccel=useLegacyDriftAssist\n      ?legacyGripYawAcceleration({\n        frictionYawAccel,\n        yawRate,\n        frontSlip:targetFrontSlip,\n        rearSlip:targetRearSlip,\n        frontForceScale:frontLateralForceScale,\n        rearForceScale:rearLateralForceScale\n      })\n      :0;\n`;
if(!r.includes(old))throw new Error('R23 legacy yaw anchor missing');
r=r.replace(old,replacement);
old=`        const legacyForceTrajectoryYawRate=netLateralAccel/signedSpeedForCurvature;\n        // Grip R7: once sideslip is real, the momentum vector follows the SUM of\n        // the four actual tire-force vectors. Countersteer can therefore rotate\n        // the chassis and bend momentum in different directions, as it should.\n        const forceTrajectoryYawRate=blendDriftForce(\n          legacyForceTrajectoryYawRate,\n          physicalTrajectoryYawRate,\n          driftPhysicalAuthority\n        );\n`;
replacement=`        const legacyForceTrajectoryYawRate=netLateralAccel/signedSpeedForCurvature;\n        // Grip R7/R23: once sideslip is real, the momentum vector follows the SUM\n        // of the four actual tire-force vectors. Vehicles that explicitly opt out\n        // of legacy drift assist (currently the F1) use that physical trajectory\n        // directly instead of blending back toward the pre-R7 curvature estimate.\n        const forceTrajectoryYawRate=useLegacyDriftAssist\n          ?blendDriftForce(\n            legacyForceTrajectoryYawRate,\n            physicalTrajectoryYawRate,\n            driftPhysicalAuthority\n          )\n          :physicalTrajectoryYawRate;\n`;
if(!r.includes(old))throw new Error('R23 trajectory yaw anchor missing');
r=r.replace(old,replacement);
fs.writeFileSync(runtimePath,r);

// 2) Grip estimator: do not add heuristic RWD lateral-grip loss when the profile
// explicitly requests physical drift ownership.
const dynamicsBasePath='src/vehicle-dynamics-base.js';
let d=fs.readFileSync(dynamicsBasePath,'utf8');
old=`  const powerOversteerGripLoss=drivetrain==='RWD'?safeNumber(vehicle?.powerOversteerGripLoss,.07):0;\n`;
replacement=`  const powerOversteerGripLoss=\n    drivetrain==='RWD'&&vehicle?.legacyDriftAssist!==false\n      ?safeNumber(vehicle?.powerOversteerGripLoss,.07)\n      :0;\n`;
if(!d.includes(old))throw new Error('R23 power grip-loss anchor missing');
d=d.replace(old,replacement);
fs.writeFileSync(dynamicsBasePath,d);

// 3) F1 profile: explicit physical drift ownership + remove steering/drift fields
// that belonged to abandoned base steering / synthetic oversteer semantics.
const vehiclePath='src/vehicle-system.js';
let v=fs.readFileSync(vehiclePath,'utf8');
old=`      drivetrain:'RWD',\n      vehicleClass:'racecar',\n`;
replacement=`      drivetrain:'RWD',\n      vehicleClass:'racecar',\n      // Grip R23 — F1 yaw/drift is owned by bicycle response near no-slip and\n      // the physical per-wheel solver once slip develops. Do not mix in the\n      // historical synthetic RWD/legacy yaw helpers.\n      legacyDriftAssist:false,\n`;
const f1Start=v.indexOf("  f1_2010:{");
const countachStart=v.indexOf("  countach_80:{",f1Start);
if(f1Start<0||countachStart<0)throw new Error('R23 F1 profile range missing');
let f1=v.slice(f1Start,countachStart);
if(!f1.includes(old))throw new Error('R23 F1 class anchor missing');
f1=f1.replace(old,replacement);
f1=f1.replace(`      maxSteerHigh:0.115,\n`,``);
f1=f1.replace(`      steeringInputExponent:1.72,\n`,``);
f1=f1.replace(`      // Cap full-lock road-wheel angle to a fraction of the tire+aero lateral\n      // envelope. This keeps steering alone below breakaway while still\n      // allowing throttle, braking, curbs or loose surfaces to consume the\n      // remaining friction circle and create real slip.\n      // The V21.21.24 0.66 reserve made long fast bends unnecessarily hard.\n      // With finite rack travel we can safely use more of the real aero/tire\n      // envelope while still retaining margin for bumps, braking and throttle.\n      steeringGripEnvelopeFraction:0.82,\n`,``);
f1=f1.replace(`      // High-downforce RWD: only subtle throttle-on rear slip.\n      powerOversteerGripLoss:0.018,\n      powerOversteerYaw:0.010,\n\n`,``);
f1=f1.replace(`      // Grip belongs in the tire/aero envelope below, not in the geometric\n      // bicycle yaw equation. The previous 1.72 multiplier made the chassis\n      // request 72% more yaw than the wheel angle geometrically implied.\n`, `      // Grip belongs in the tire/aero envelope below, not in the geometric\n      // bicycle yaw equation. Historical steering multipliers are intentionally\n      // absent; R13/R22.1 own analog input shaping.\n`);
v=v.slice(0,f1Start)+f1+v.slice(countachStart);
fs.writeFileSync(vehiclePath,v);

console.log('GRIP R23 F1 LEGACY CLEANUP PATCH: PASS');
