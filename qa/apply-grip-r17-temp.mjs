import fs from 'node:fs';
const path='src/driving-runtime-base.js';
let source=fs.readFileSync(path,'utf8');

const projectionAnchor=`export function bodyAxisDriveProjection({heading=0,velocityHeading=0}={}){\n  const delta=(Number(velocityHeading)||0)-(Number(heading)||0);\n  return Math.cos(delta);\n}\n`;
const projectionReplacement=projectionAnchor+`\n// Grip R17 — when body-axis propulsion opposes the current momentum strongly\n// enough to cross zero in the scalar speed integrator, reconstruct that one\n// step as a 2-D vector impulse. Away from an exact 180-degree cancellation the\n// body force still has a perpendicular component, so the vehicle must retain\n// momentum instead of snapping velocityHeading onto the chassis at ~90 deg.\nexport function resolveOpposingDriveMomentumCrossing({\n  previousSpeed=0,velocityHeading=0,heading=0,nonDriveDeltaSpeed=0,\n  bodyDriveAccel=0,dt=0\n}={}){\n  const previous=Number(previousSpeed)||0;\n  const vh=Number(velocityHeading)||0;\n  const bodyHeading=Number(heading)||0;\n  const step=Math.max(0,Number(dt)||0);\n  const baseSpeed=previous+(Number(nonDriveDeltaSpeed)||0);\n  const driveImpulse=(Number(bodyDriveAccel)||0)*step;\n  const vx=Math.sin(vh)*baseSpeed+Math.sin(bodyHeading)*driveImpulse;\n  const vz=Math.cos(vh)*baseSpeed+Math.cos(bodyHeading)*driveImpulse;\n  const magnitude=Math.hypot(vx,vz);\n  if(magnitude<1e-7)return {speed:0,velocityHeading:bodyHeading,stopped:true};\n  const representationSign=Math.sign(previous||bodyDriveAccel||1);\n  return {\n    speed:representationSign*magnitude,\n    velocityHeading:Math.atan2(vx*representationSign,vz*representationSign),\n    stopped:false\n  };\n}\n`;
if(!source.includes(projectionAnchor))throw new Error('R17 projection helper anchor missing');
source=source.replace(projectionAnchor,projectionReplacement);

const oldDrive=`    let requestedDriveAccel=0,requestedBrakeAccel=0;\n\n    if(driveThrottle>0){\n      const performanceTop=vehicleTopSpeedKmh()/3.6;\n      const speedRatio=Math.min(1,Math.max(0,Math.abs(speed)/performanceTop));\n      const powerTaper=truckTrailerSystem.active?1:1-.38*speedRatio;\n      requestedDriveAccel=\n        VEHICLE.accel*\n        driveThrottle*\n        powerTaper*\n        driveAxisProjection;\n    }else if(driveThrottle<0){\n      // Negative drivetrain command now means reverse propulsion only. Service\n      // braking never enters this branch.\n      requestedDriveAccel=\n        VEHICLE.reverseAccel*\n        driveThrottle*\n        driveAxisProjection;\n    }\n`;
const newDrive=`    let requestedBodyDriveAccel=0,requestedBrakeAccel=0;\n\n    if(driveThrottle>0){\n      const performanceTop=vehicleTopSpeedKmh()/3.6;\n      const speedRatio=Math.min(1,Math.max(0,Math.abs(speed)/performanceTop));\n      const powerTaper=truckTrailerSystem.active?1:1-.38*speedRatio;\n      // Grip R17: selector D always requests forward BODY-axis tire force.\n      // Projection onto the current momentum is applied only after traction is\n      // resolved; it must never reverse wheel torque beyond 90 degrees.\n      requestedBodyDriveAccel=\n        VEHICLE.accel*\n        driveThrottle*\n        powerTaper;\n    }else if(driveThrottle<0){\n      // Negative drivetrain command means reverse BODY-axis propulsion only.\n      requestedBodyDriveAccel=\n        VEHICLE.reverseAccel*\n        driveThrottle;\n    }\n`;
if(!source.includes(oldDrive))throw new Error('R17 drive request anchor missing');
source=source.replace(oldDrive,newDrive);

const oldForce=`    const driveForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedDriveAccel,surfaceMu:longitudinalMu,mode:'drive',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.drive);\n    const brakeForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedBrakeAccel,surfaceMu:longitudinalMu,mode:'brake',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.brake);\n    let accel=driveForce.acceleration+brakeForce.acceleration;`;
const newForce=`    const driveForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedBodyDriveAccel,surfaceMu:longitudinalMu,mode:'drive',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.drive);\n    const brakeForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedBrakeAccel,surfaceMu:longitudinalMu,mode:'brake',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.brake);\n    const appliedBodyDriveAccel=driveForce.acceleration;\n    const driveMomentumAccel=appliedBodyDriveAccel*driveAxisProjection;\n    let accel=driveMomentumAccel+brakeForce.acceleration;`;
if(!source.includes(oldForce))throw new Error('R17 traction anchor missing');
source=source.replace(oldForce,newForce);

const oldCross=`    if(\n      (opposingBodyTravel||serviceBrakeCrossedZero)&&\n      Math.abs(previousSpeed)>.02&&\n      Math.sign(speed)!==Math.sign(previousSpeed)\n    ){\n      // Neither engine opposition nor a service brake can teleport through zero\n      // into motion in the opposite direction during one integration step.\n      speed=0;\n      velocityHeading=heading;\n    }`;
const newCross=`    const crossedSignedSpeed=\n      Math.abs(previousSpeed)>.02&&\n      Math.sign(speed)!==Math.sign(previousSpeed);\n    if(serviceBrakeCrossedZero&&crossedSignedSpeed){\n      // A service brake can genuinely remove all translational momentum.\n      speed=0;\n      velocityHeading=heading;\n    }else if(opposingBodyTravel&&crossedSignedSpeed){\n      // Grip R17: drivetrain force is a BODY-axis vector. Near a J-turn's\n      // 90-degree region its perpendicular impulse survives even when the old\n      // scalar projection crosses zero, so preserve that vector momentum.\n      const resolved=resolveOpposingDriveMomentumCrossing({\n        previousSpeed,velocityHeading,heading,\n        nonDriveDeltaSpeed:(accel-driveMomentumAccel)*dt,\n        bodyDriveAccel:appliedBodyDriveAccel,dt\n      });\n      speed=resolved.speed;\n      velocityHeading=resolved.velocityHeading;\n    }`;
if(!source.includes(oldCross))throw new Error('R17 zero-cross anchor missing');
source=source.replace(oldCross,newCross);

const oldGrip=`        propulsionAccel:driveForce.acceleration,serviceBrakeAccel:brakeForce.acceleration,`;
const newGrip=`        propulsionAccel:appliedBodyDriveAccel,serviceBrakeAccel:brakeForce.acceleration,`;
if(!source.includes(oldGrip))throw new Error('R17 grip propulsion anchor missing');
source=source.replace(oldGrip,newGrip);

const oldSolver=`      requestedDriveAccel,requestedBrakeAccel,handbrake:hand,surfaceId:onPavement?'asphalt-dry':'dirt'`;
const newSolver=`      requestedDriveAccel:appliedBodyDriveAccel,requestedBrakeAccel,handbrake:hand,surfaceId:onPavement?'asphalt-dry':'dirt'`;
if(!source.includes(oldSolver))throw new Error('R17 per-wheel drive anchor missing');
source=source.replace(oldSolver,newSolver);

if(source.includes('requestedDriveAccel=\n        VEHICLE.accel'))throw new Error('legacy projected drive request remains');
fs.writeFileSync(path,source);
console.log('Applied Grip R17 body-axis drivetrain / EV maneuver fix');
