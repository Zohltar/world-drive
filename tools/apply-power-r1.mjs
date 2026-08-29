import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

function patchFile(path,edits){
  let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
  for(const [from,to,label] of edits){
    const count=source.split(from).length-1;
    if(count!==1)throw new Error(`${path}: ${label} anchor count ${count}`);
    source=source.replace(from,to);
  }
  fs.writeFileSync(path,source);
}

patchFile('src/vehicle-system.js',[
  [
`      longitudinalAccelLimit:9.47,\n      bodyLength:4.60,`,
`      longitudinalAccelLimit:9.47,\n      // Power R1 — road-speed capability is separate from the theoretical\n      // sixth-gear redline used for physical gearing/RPM.\n      powertrainTopSpeedKmh:225,\n      bodyLength:4.60,`,
'WRX top-speed override'
  ],
  [
`      accel:6.36,\n      brake:10.42,\n      reverseAccel:3.5,\n      rolling:0.34,\n      aero:0.0010,`,
`      // accel remains the fallback for legacy/non-torque paths. Power R1\n      // derives forward acceleration from crank torque and gearing instead.\n      accel:6.36,\n      brake:10.42,\n      reverseAccel:3.5,\n      // Physical resistance calibration for the torque-driven WRX path.\n      rolling:0.18,\n      aero:0.00032,`,
'WRX road resistance'
  ],
  [
`      profile:'boxer-turbo',\n      idleRpm:850,\n      redlineRpm:6700,\n      gearCount:6,\n\n      // V20.6 mechanical gearbox calibration.\n      // 225 km/h = top-gear redline at the reference RPM/ratio.\n      referenceRedlineRpm:6700,\n      referenceTopGearRedlineKmh:225,\n      referenceTopGearRatio:1,\n      gearRatios:[4.3,2.443182,1.706349,1.360759,1.168478,1],`,
`      profile:'boxer-turbo',\n      idleRpm:850,\n      redlineRpm:6100,\n      gearCount:6,\n\n      // Power R1 — 2024 WRX VB 2.4T / 6MT physical powertrain. Subaru rates\n      // 258 lb-ft (~350 Nm) from 2000-5200 rpm and 271 hp at 5600 rpm.\n      powertrainModel:'torque',\n      peakPowerHp:271,\n      peakPowerRpm:5600,\n      peakTorqueNm:350,\n      torqueCurveNm:[\n        [850,180],\n        [1200,230],\n        [1600,300],\n        [2000,350],\n        [5200,350],\n        [5600,345],\n        [6100,300]\n      ],\n      finalDriveRatio:4.111,\n      driveWheelRadiusM:0.3265,\n      drivetrainEfficiency:0.82,\n      launchClutchRpm:2000,\n      launchClutchFadeMps:5.5,\n\n      // Real close-ratio 6MT gearing. The theoretical 6th-gear redline speed\n      // remains separate from the vehicle road-speed cap above.\n      referenceRedlineRpm:6100,\n      referenceTopGearRedlineKmh:274,\n      referenceTopGearRatio:0.667,\n      gearRatios:[3.455,1.947,1.367,1.029,0.825,0.667],`,
'WRX torque and gearing profile'
  ]
]);

patchFile('src/driving-runtime-base.js',[
  [
`import { serviceBrakeAcceleration, brakeWouldCrossZero } from './physics/longitudinal-control.js';`,
`import { serviceBrakeAcceleration, brakeWouldCrossZero } from './physics/longitudinal-control.js';\nimport { torqueDrivenAcceleration } from './physics/powertrain-force.js';`,
'powertrain import'
  ],
  [
`  autopilotControl,keyboardActionDown,gamepadState,updateTransmission,getServiceBrakeInput,\n  vehiclePresentation,vehicleVisuals,truckTrailerSystem,roadSurfaceGrip,getVehicleId,`,
`  autopilotControl,keyboardActionDown,gamepadState,updateTransmission,getServiceBrakeInput,\n  getTransmissionGear,getEngineRpm,\n  vehiclePresentation,vehicleVisuals,truckTrailerSystem,roadSurfaceGrip,getVehicleId,`,
'powertrain state callbacks'
  ],
  [
`    if(driveThrottle>0){\n      const performanceTop=vehicleTopSpeedKmh()/3.6;\n      const speedRatio=Math.min(1,Math.max(0,Math.abs(speed)/performanceTop));\n      const powerTaper=truckTrailerSystem.active?1:1-.38*speedRatio;\n      requestedDriveAccel=\n        VEHICLE.accel*\n        driveThrottle*\n        powerTaper*\n        driveAxisProjection;\n    }else if(driveThrottle<0){`,
`    if(driveThrottle>0){\n      const transmissionProfile=activeTransmissionProfile?.()||{};\n      const torqueDrive=torqueDrivenAcceleration({\n        vehicle:VEHICLE,\n        profile:transmissionProfile,\n        gear:typeof getTransmissionGear==='function'?getTransmissionGear():1,\n        rpm:typeof getEngineRpm==='function'?getEngineRpm():transmissionProfile.idleRpm,\n        throttle:driveThrottle,\n        speedAbs:Math.abs(speed)\n      });\n      if(torqueDrive.active){\n        // Crank torque -> gear/final drive -> tire force -> chassis acceleration.\n        // Traction limiting remains authoritative immediately below.\n        requestedDriveAccel=torqueDrive.acceleration*driveAxisProjection;\n      }else{\n        const performanceTop=vehicleTopSpeedKmh()/3.6;\n        const speedRatio=Math.min(1,Math.max(0,Math.abs(speed)/performanceTop));\n        const powerTaper=truckTrailerSystem.active?1:1-.38*speedRatio;\n        requestedDriveAccel=\n          VEHICLE.accel*\n          driveThrottle*\n          powerTaper*\n          driveAxisProjection;\n      }\n    }else if(driveThrottle<0){`,
'authoritative torque drive path'
  ]
]);

patchFile('src/main.js',[
  [
`  if(profile.type==='combustion'){\n    return transmissionRedlineSpeedKmh(\n      profile,\n      Number(profile.redlineRpm)||6500\n    );\n  }`,
`  if(profile.type==='combustion'){\n    const redlineTop=transmissionRedlineSpeedKmh(\n      profile,\n      Number(profile.redlineRpm)||6500\n    );\n    const roadCap=Number(VEHICLE.powertrainTopSpeedKmh);\n    return Number.isFinite(roadCap)&&roadCap>20\n      ?Math.min(redlineTop,roadCap)\n      :redlineTop;\n  }`,
'combustion road-speed cap'
  ],
  [
`  updateTransmission,\n  vehiclePresentation,`,
`  updateTransmission,\n  getTransmissionGear:()=>transmissionGear,\n  getEngineRpm:()=>engineRpm,\n  vehiclePresentation,`,
'powertrain runtime callbacks'
  ]
]);

for(const path of ['src/vehicle-system.js','src/driving-runtime-base.js','src/main.js','src/physics/powertrain-force.js']){
  const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
console.log('Power R1 torque-model runtime patch applied');
