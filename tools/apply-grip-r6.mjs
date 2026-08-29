import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

function read(path){return fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');}
function write(path,text){fs.writeFileSync(path,text,'utf8');}
function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`Grip R6 missing anchor: ${label}`);
  if(source.indexOf(needle,first+needle.length)>=0)throw new Error(`Grip R6 ambiguous anchor: ${label}`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}
function replaceRange(source,startNeedle,endNeedle,replacement,label){
  const start=source.indexOf(startNeedle);
  if(start<0)throw new Error(`Grip R6 missing range start: ${label}`);
  const end=source.indexOf(endNeedle,start+startNeedle.length);
  if(end<0)throw new Error(`Grip R6 missing range end: ${label}`);
  return source.slice(0,start)+replacement+source.slice(end+endNeedle.length);
}
function check(path){
  const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  if(r.status!==0)throw new Error(`${path} syntax:\n${r.stderr||r.stdout}`);
}

const presentationPath='src/vehicle-presentation-v21.29.js';
const runtimePath='src/driving-runtime-base.js';
const mainPath='src/main.js';
let presentation=read(presentationPath);
let runtime=read(runtimePath);
let main=read(mainPath);

if(presentation.includes('Grip R6 — momentum-path crest separation')){
  console.log('Grip R6 already applied');
  process.exit(0);
}

presentation=replaceOnce(
  presentation,
  "import { ackermannSteeringAngles, ackermannAngleForSide } from './physics/steering-geometry.js';\n",
  "import { ackermannSteeringAngles, ackermannAngleForSide } from './physics/steering-geometry.js';\nimport { horizontalTravelDirection, crestLaunchDecision, airborneLandingDecision } from './physics/airborne-dynamics.js';\n",
  'airborne helper import'
);

presentation=replaceOnce(
  presentation,
  '    const {heading,absX,absZ,speed,longitudinalAccel,rearSlipAmount=0,VEHICLE}=getDrivingState();',
  '    const {heading,velocityHeading,absX,absZ,speed,longitudinalAccel,rearSlipAmount=0,VEHICLE}=getDrivingState();',
  'presentation driving state'
);

presentation=replaceOnce(
  presentation,
  `    }else{\n      const airAttitudeRate=1-Math.exp(-safeDt*.55);\n      wheelPlanePitch+=(targetWheelPlanePitch-wheelPlanePitch)*airAttitudeRate;\n      wheelPlaneRoll+=(targetWheelPlaneRoll-wheelPlaneRoll)*airAttitudeRate;\n    }`,
  `    }else{\n      // Grip R6 — no contact means the terrain underneath cannot torque the\n      // chassis/support plane. Preserve takeoff attitude until contact returns.\n    }`,
  'airborne ground-attitude follower'
);

const launchStart='    if(!airborne){\n      if(Math.abs(speed)<=7.5){';
const launchEnd='\n    if(airborne){\n      airborneTime+=safeDt;';
const newLaunch=`    // Grip R6 — momentum-path crest separation. Contact loss follows the\n    // actual horizontal velocity vector and gravity, not chassis heading or a\n    // gameplay minimum-speed threshold.\n    let launchedThisFrame=false;\n    if(!airborne){\n      const supportYAtCenter=(centerX,centerZ)=>{\n        const ground=groundHeightForWheel(centerX,centerZ);\n        return Number.isFinite(ground)?ground+effectiveWheelRadius+TIRE_VISUAL_CLEARANCE:NaN;\n      };\n      const travel=horizontalTravelDirection({speed,heading,velocityHeading});\n      const launchSlopeProbe=clamp(travel.speedAbs*.035,.35,1.80);\n      const supportAtTravel=distance=>supportYAtCenter(\n        absX+distance*travel.x,\n        absZ+distance*travel.z\n      );\n      const supportBehind=supportAtTravel(-launchSlopeProbe);\n      const supportAhead=supportAtTravel(launchSlopeProbe);\n      const currentCenterSupportY=supportAtTravel(0);\n      const spatialSupportVelocity=\n        Number.isFinite(supportBehind)&&Number.isFinite(supportAhead)\n          ?clamp((supportAhead-supportBehind)/(2*launchSlopeProbe)*travel.speedAbs,-22,22)\n          :filteredSupportVelocity;\n\n      const launchPredictionTime=.075;\n      const futureSupportY=supportAtTravel(travel.speedAbs*launchPredictionTime);\n      const launchOriginY=Number.isFinite(currentCenterSupportY)?currentCenterSupportY:supportY;\n      const separation=crestLaunchDecision({\n        speedAbs:travel.speedAbs,\n        supportOriginY:launchOriginY,\n        futureSupportY,\n        supportVerticalVelocity:spatialSupportVelocity,\n        predictionTime:launchPredictionTime,\n        downwardAccel:supportedDownwardAccel\n      });\n\n      if(separation.canLaunch){\n        airborne=true;\n        airborneTime=0;\n        verticalVelocity=spatialSupportVelocity;\n        launchedThisFrame=true;\n      }else{\n        car.position.y=supportY;\n        verticalVelocity=filteredSupportVelocity;\n      }\n    }\n\n    if(airborne&&!launchedThisFrame){\n      airborneTime+=safeDt;`;
presentation=replaceRange(presentation,launchStart,launchEnd,newLaunch,'legacy crest launch block');

presentation=replaceOnce(
  presentation,
  `      verticalVelocity-=airborneDownwardAccel*safeDt;\n      car.position.y+=verticalVelocity*safeDt;\n      if(airborneTime>.025&&car.position.y<=supportY&&verticalVelocity<=filteredSupportVelocity+.8){\n        const impactSpeed=Math.max(0,filteredSupportVelocity-verticalVelocity);`,
  `      verticalVelocity-=airborneDownwardAccel*safeDt;\n      const nextAirborneY=car.position.y+verticalVelocity*safeDt;\n      car.position.y=nextAirborneY;\n      if(airborneLandingDecision({\n        nextY:nextAirborneY,\n        supportY,\n        verticalVelocity,\n        supportVerticalVelocity:filteredSupportVelocity\n      })){\n        const impactSpeed=Math.max(0,filteredSupportVelocity-verticalVelocity);`,
  'legacy landing guards'
);

presentation=replaceOnce(
  presentation,
  `    const targetRoll=-wheelPlaneRoll+dynamicRoll+springRoll;\n    const targetPitch=wheelPlanePitch+dynamicPitch+springPitch;\n    const attitudeRate=airborne?2.1:7.0;\n    suspensionRoll+=(targetRoll-suspensionRoll)*(1-Math.exp(-safeDt*attitudeRate));\n    suspensionPitch+=(targetPitch-suspensionPitch)*(1-Math.exp(-safeDt*(airborne?1.8:7.2)));`,
  `    if(!airborne){\n      const targetRoll=-wheelPlaneRoll+dynamicRoll+springRoll;\n      const targetPitch=wheelPlanePitch+dynamicPitch+springPitch;\n      suspensionRoll+=(targetRoll-suspensionRoll)*(1-Math.exp(-safeDt*7.0));\n      suspensionPitch+=(targetPitch-suspensionPitch)*(1-Math.exp(-safeDt*7.2));\n    }`,
  'airborne body attitude follower'
);

runtime=replaceOnce(
  runtime,
  '    const yawGripResponseScale=driftKinematicScale;',
  '    const yawGripResponseScale=airborneNow?0:driftKinematicScale;',
  'airborne yaw kinematic damping'
);

runtime=replaceOnce(
  runtime,
  '    let frictionYawAccel=Number.isFinite(perWheelGrip.frictionYawAccel)?perWheelGrip.frictionYawAccel:0;',
  `    let frictionYawAccel=Number.isFinite(perWheelGrip.frictionYawAccel)?perWheelGrip.frictionYawAccel:0;\n    // Grip R6 — no tire contact means no residual tire yaw impulse.\n    if(airborneNow)frictionYawAccel=0;`,
  'airborne stale tire yaw'
);

main=replaceOnce(
  main,
  `  getDrivingState:()=>({\n    heading,\n    absX,`,
  `  getDrivingState:()=>({\n    heading,\n    velocityHeading,\n    absX,`,
  'presentation velocity heading feed'
);

write(presentationPath,presentation);
write(runtimePath,runtime);
write(mainPath,main);
check(presentationPath);
check(runtimePath);
check(mainPath);
console.log('Grip R6 patch applied');
