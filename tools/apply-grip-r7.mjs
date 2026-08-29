import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const path='src/driving-runtime-base.js';
let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
function once(needle,replacement,label){
  const at=source.indexOf(needle);
  if(at<0)throw new Error(`Grip R7 missing anchor: ${label}`);
  if(source.indexOf(needle,at+needle.length)>=0)throw new Error(`Grip R7 ambiguous anchor: ${label}`);
  source=source.slice(0,at)+replacement+source.slice(at+needle.length);
}

if(source.includes('Grip R7 — per-wheel tire forces become authoritative')){
  console.log('Grip R7 already applied');
  process.exit(0);
}

once(
  "import { effectiveTireFriction, tireProfileForVehicle } from './physics/tire-model.js';\n",
  "import { effectiveTireFriction, tireProfileForVehicle } from './physics/tire-model.js';\nimport {\n  driftTireForceAuthority,\n  tireForceTrajectoryYawRate,\n  blendDriftForce\n} from './physics/drift-force-coupling.js';\n",
  'drift force imports'
);

once(
  `    physicsShadow.advance(dt,{\n      vehicleId:getVehicleId?.()||'unknown',vehicle:VEHICLE,contacts:vehiclePresentation?.wheelContacts||[],speed,heading,velocityHeading,\n      yawRate:dynamicYawRate,centerSteerAngle:steerAngle,longitudinalAccel,lateralAccel:physicalSignedLatAccel,\n      requestedDriveAccel,requestedBrakeAccel,handbrake:hand,surfaceId:onPavement?'asphalt-dry':'dirt'\n    });`,
  `    const physicalTireForces=physicsShadow.advance(dt,{\n      vehicleId:getVehicleId?.()||'unknown',vehicle:VEHICLE,contacts:vehiclePresentation?.wheelContacts||[],speed,heading,velocityHeading,\n      yawRate:dynamicYawRate,centerSteerAngle:steerAngle,longitudinalAccel,lateralAccel:physicalSignedLatAccel,\n      requestedDriveAccel,requestedBrakeAccel,handbrake:hand,surfaceId:onPavement?'asphalt-dry':'dirt'\n    });`,
  'capture per-wheel force result'
);

once(
  `    if(Math.abs(steerAngle)>.006&&Math.abs(yawRate)>1e-5&&frictionYawAccel*yawRate<0)frictionYawAccel=0;\n    const yawResponse=yawResponseRate({vehicle:VEHICLE,speedAbs,airborne:airborneNow});`,
  `    // Grip R7 — per-wheel tire forces become authoritative outside the small-\n    // slip bicycle-model region. The old guard above used to erase an opposing\n    // tire yaw moment whenever steering was present; that prevented countersteer\n    // from stabilizing a drift and could make both axles translate with the rack.\n    const yawResponse=yawResponseRate({vehicle:VEHICLE,speedAbs,airborne:airborneNow});`,
  'remove legacy opposing yaw suppression'
);

once(
  `    const driftKinematicScale=driftKinematicCoupling({\n      sideslipRad:currentSideslip,\n      forceCoupledSlide\n    });\n    // Keep the familiar fast settling only while the car is close to the`,
  `    const driftKinematicScale=driftKinematicCoupling({\n      sideslipRad:currentSideslip,\n      forceCoupledSlide\n    });\n    const driftPhysicalAuthority=airborneNow?0:driftTireForceAuthority({\n      sideslipRad:currentSideslip,\n      forceCoupledSlide\n    });\n    const physicalTireYawAccel=Number.isFinite(physicalTireForces?.predictedYawAccel)\n      ?physicalTireForces.predictedYawAccel\n      :frictionYawAccel;\n    const physicalTrajectoryYawRate=tireForceTrajectoryYawRate({\n      bodyVx:physicalTireForces?.bodyVx,\n      bodyVz:physicalTireForces?.bodyVz,\n      accelX:physicalTireForces?.predictedAccelX,\n      accelZ:physicalTireForces?.predictedAccelZ\n    });\n    // Keep the familiar fast settling only while the car is close to the`,
  'physical drift authority state'
);

once(
  `    const yawGripResponseScale=airborneNow?0:driftKinematicScale;\n    dynamicYawRate+=frictionYawAccel*dt;\n    dynamicYawRate+=(yawRate-dynamicYawRate)*(1-Math.exp(-dt*yawResponse*yawReleaseBoost*yawGripResponseScale));`,
  `    const yawGripResponseScale=airborneNow\n      ?0\n      :driftKinematicScale*(1-.85*driftPhysicalAuthority);\n    const authoritativeYawAccel=blendDriftForce(\n      frictionYawAccel,\n      physicalTireYawAccel,\n      driftPhysicalAuthority\n    );\n    dynamicYawRate+=authoritativeYawAccel*dt;\n    dynamicYawRate+=(yawRate-dynamicYawRate)*(1-Math.exp(-dt*yawResponse*yawReleaseBoost*yawGripResponseScale));`,
  'authoritative drift yaw force'
);

once(
  `      const forceDominatedDrift=\n        !airborneNow&&\n        speedAbs>4&&\n        (forceCoupledSlide>.10||driftKinematicScale<.88);\n      if(forceDominatedDrift){\n        const signedSpeedForCurvature=Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5;\n        const forceTrajectoryYawRate=netLateralAccel/signedSpeedForCurvature;\n        // Grip R4 — in a drift the momentum vector can only rotate because tire\n        // forces bend it. Remove the old synthetic alignment toward the nearest\n        // body axis, whose target switched at 90 degrees.\n        attemptedTrajectoryDelta+=forceTrajectoryYawRate*dt;`,
  `      const forceDominatedDrift=\n        !airborneNow&&\n        speedAbs>4&&\n        (driftPhysicalAuthority>.12||forceCoupledSlide>.10||driftKinematicScale<.88);\n      if(forceDominatedDrift){\n        const signedSpeedForCurvature=Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5;\n        const legacyForceTrajectoryYawRate=netLateralAccel/signedSpeedForCurvature;\n        // Grip R7: once sideslip is real, the momentum vector follows the SUM of\n        // the four actual tire-force vectors. Countersteer can therefore rotate\n        // the chassis and bend momentum in different directions, as it should.\n        const forceTrajectoryYawRate=blendDriftForce(\n          legacyForceTrajectoryYawRate,\n          physicalTrajectoryYawRate,\n          driftPhysicalAuthority\n        );\n        attemptedTrajectoryDelta+=forceTrajectoryYawRate*dt;`,
  'physical drift trajectory force'
);

fs.writeFileSync(path,source,'utf8');
const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
if(check.status!==0)throw new Error(check.stderr||check.stdout);
console.log('Grip R7 runtime patch applied');
