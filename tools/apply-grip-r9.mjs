import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

function patchFile(path,edits){
  let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
  for(const {needle,replacement,label} of edits){
    const at=source.indexOf(needle);
    if(at<0)throw new Error(`Grip R9 missing anchor in ${path}: ${label}`);
    if(source.indexOf(needle,at+needle.length)>=0)throw new Error(`Grip R9 ambiguous anchor in ${path}: ${label}`);
    source=source.slice(0,at)+replacement+source.slice(at+needle.length);
  }
  fs.writeFileSync(path,source,'utf8');
  const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  if(check.status!==0)throw new Error(`${path} syntax error\n${check.stderr||check.stdout}`);
}

const basePath='src/driving-runtime-base.js';
const wrapperPath='src/driving-runtime.js';
const baseSource=fs.readFileSync(basePath,'utf8');
if(baseSource.includes('Grip R9 — service brake is an independent force channel')){
  console.log('Grip R9 already applied');
  process.exit(0);
}

patchFile(basePath,[
  {
    label:'longitudinal control import',
    needle:"} from './physics/drift-force-coupling.js';\n",
    replacement:"} from './physics/drift-force-coupling.js';\nimport { serviceBrakeAcceleration, brakeWouldCrossZero } from './physics/longitudinal-control.js';\n"
  },
  {
    label:'service brake getter argument',
    needle:'  autopilotControl,keyboardActionDown,gamepadState,updateTransmission,\n',
    replacement:'  autopilotControl,keyboardActionDown,gamepadState,updateTransmission,getServiceBrakeInput,\n'
  },
  {
    label:'independent brake input',
    needle:`    const preDriveBodyLongitudinalSpeed=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});\n    const driveAxisProjection=bodyAxisDriveProjection({heading,velocityHeading});\n    const driveThrottle=updateTransmission(dt,throttle,onPavement);\n\n    const brakeRequested=hand||(throttle<-.04&&preDriveBodyLongitudinalSpeed>.15);`,
    replacement:`    const preDriveBodyLongitudinalSpeed=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});\n    const driveAxisProjection=bodyAxisDriveProjection({heading,velocityHeading});\n    const driveThrottle=updateTransmission(dt,throttle,onPavement);\n    // Grip R9 — service brake is an independent force channel. The legacy\n    // signed-throttle adapter used body-relative speed to decide whether the\n    // same input meant braking or reverse propulsion; around 90 degrees of a\n    // J-turn that projection crosses zero while real momentum is still large.\n    const fallbackServiceBrake=Math.max(0,-(Number(throttle)||0));\n    const serviceBrakeInput=physicsClamp(\n      Number(typeof getServiceBrakeInput==='function'?getServiceBrakeInput():fallbackServiceBrake)||0,\n      0,\n      1\n    );\n\n    const brakeRequested=hand||serviceBrakeInput>.04;`
  },
  {
    label:'separate drive and brake acceleration',
    needle:`    if(driveThrottle>0){\n      const performanceTop=vehicleTopSpeedKmh()/3.6;\n      const speedRatio=Math.min(1,Math.max(0,Math.abs(speed)/performanceTop));\n      const powerTaper=truckTrailerSystem.active?1:1-.38*speedRatio;\n      requestedDriveAccel=\n        VEHICLE.accel*\n        driveThrottle*\n        powerTaper*\n        driveAxisProjection;\n    }else if(driveThrottle<0){\n      if(preDriveBodyLongitudinalSpeed>.15){\n        requestedBrakeAccel=VEHICLE.brake*driveThrottle;\n      }else{\n        requestedDriveAccel=\n          VEHICLE.reverseAccel*\n          driveThrottle*\n          driveAxisProjection;\n      }\n    }\n\n    requestedDriveAccel*=truckTrailerSystem.active?truckTrailerSystem.driveAccelScaleForSpeed(Math.abs(speed)):combination.driveAccelScale;\n    requestedBrakeAccel*=combination.serviceBrakeScale;`,
    replacement:`    if(driveThrottle>0){\n      const performanceTop=vehicleTopSpeedKmh()/3.6;\n      const speedRatio=Math.min(1,Math.max(0,Math.abs(speed)/performanceTop));\n      const powerTaper=truckTrailerSystem.active?1:1-.38*speedRatio;\n      requestedDriveAccel=\n        VEHICLE.accel*\n        driveThrottle*\n        powerTaper*\n        driveAxisProjection;\n    }else if(driveThrottle<0){\n      // Negative drivetrain command now means reverse propulsion only. Service\n      // braking never enters this branch.\n      requestedDriveAccel=\n        VEHICLE.reverseAccel*\n        driveThrottle*\n        driveAxisProjection;\n    }\n\n    requestedBrakeAccel=serviceBrakeAcceleration({\n      serviceBrake:serviceBrakeInput,\n      speed,\n      maxBrakeAccel:VEHICLE.brake,\n      airborne:airborneNow\n    });\n    requestedDriveAccel*=truckTrailerSystem.active?truckTrailerSystem.driveAccelScaleForSpeed(Math.abs(speed)):combination.driveAccelScale;\n    requestedBrakeAccel*=combination.serviceBrakeScale;`
  },
  {
    label:'brake zero crossing',
    needle:`    const opposingBodyTravel=\n      (driveThrottle>.04&&preDriveBodyLongitudinalSpeed<-.15)||\n      (driveThrottle<-.04&&preDriveBodyLongitudinalSpeed>.15);\n    speed+=accel*dt;\n    if(\n      opposingBodyTravel&&\n      Math.abs(previousSpeed)>.02&&\n      Math.sign(speed)!==Math.sign(previousSpeed)\n    ){\n      speed=0;\n      velocityHeading=heading;\n    }`,
    replacement:`    const opposingBodyTravel=\n      (driveThrottle>.04&&preDriveBodyLongitudinalSpeed<-.15)||\n      (driveThrottle<-.04&&preDriveBodyLongitudinalSpeed>.15);\n    speed+=accel*dt;\n    const serviceBrakeCrossedZero=brakeWouldCrossZero({\n      previousSpeed,\n      nextSpeed:speed,\n      serviceBrake:serviceBrakeInput\n    });\n    if(\n      (opposingBodyTravel||serviceBrakeCrossedZero)&&\n      Math.abs(previousSpeed)>.02&&\n      Math.sign(speed)!==Math.sign(previousSpeed)\n    ){\n      // Neither engine opposition nor a service brake can teleport through zero\n      // into motion in the opposite direction during one integration step.\n      speed=0;\n      velocityHeading=heading;\n    }`
  }
]);

patchFile(wrapperPath,[
  {
    label:'stationary clutch helper import',
    needle:"import {createCivilTrafficSystem} from './civil-traffic.js';\n",
    replacement:"import {createCivilTrafficSystem} from './civil-traffic.js';\nimport {shouldAutoClutchForServiceBrake} from './physics/longitudinal-control.js';\n"
  },
  {
    label:'real speed stationary clutch',
    needle:'    const stationaryBrakeClutch=combustion&&serviceBrake>.04&&Math.abs(bodySpeed)<.35;\n',
    replacement:`    const stationaryBrakeClutch=combustion&&shouldAutoClutchForServiceBrake({\n      serviceBrake,\n      speed:Number(state?.speed)||0\n    });\n`
  },
  {
    label:'remove brake as signed throttle adapter',
    needle:`    if(serviceBrake>.04){\n      if(combustion&&clutchHeld){\n        clutchWasHeld=true;\n        clutchReleaseTimer=0;\n        clutchShockMultiplier=1;\n      }\n      if(bodySpeed<-.15){\n        const accel=Math.max(.1,Number(args.VEHICLE?.accel)||1);\n        const brake=Math.max(accel,Number(args.VEHICLE?.brake)||accel);\n        return serviceBrake*(brake/accel);\n      }\n      if(bodySpeed>.15)return -serviceBrake;\n      return 0;\n    }\n\n    if(!combustion){`,
    replacement:`    // Grip R9 — keep serviceBrake independent all the way into the\n    // chassis. Do not convert it back into positive/negative engine throttle.\n    if(serviceBrake>.04&&combustion&&clutchHeld){\n      clutchWasHeld=true;\n      clutchReleaseTimer=0;\n      clutchShockMultiplier=1;\n    }\n\n    if(!combustion){`
  },
  {
    label:'pass brake getter to base runtime',
    needle:`    setState:setStateWithAuthoritativeLights,\n    updateTransmission:updateTransmissionWithBodySpeed,\n    longitudinalTractionLimit:longitudinalTractionWithPersistentWheelspin,`,
    replacement:`    setState:setStateWithAuthoritativeLights,\n    updateTransmission:updateTransmissionWithBodySpeed,\n    getServiceBrakeInput:()=>Math.max(0,Math.min(1,Number(readTransmissionRuntimeState()?.serviceBrake)||0)),\n    longitudinalTractionLimit:longitudinalTractionWithPersistentWheelspin,`
  }
]);

console.log('Grip R9 independent braking runtime patch applied');
