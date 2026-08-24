import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const geometryPath=path.join(root,'src','physics','steering-geometry.js');
const presentationPath=path.join(root,'src','vehicle-presentation.js');
const wrxPath=path.join(root,'src','wrx-glb.js');

function fail(message){
  console.error(`V21.27 ACKERMANN WHEEL INTEGRATION: ABORTED\n${message}`);
  process.exit(1);
}

function readEditable(filePath){
  const raw=fs.readFileSync(filePath,'utf8');
  const eol=raw.includes('\r\n')?'\r\n':'\n';
  return {raw,eol,lf:raw.replace(/\r\n/g,'\n')};
}

function restoreEol(lf,eol){
  return eol==='\r\n'?lf.replace(/\n/g,'\r\n'):lf;
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)fail(`Missing ${label} anchor.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    fail(`Ambiguous ${label} anchor (matched more than once).`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

function syntaxCheck(filePath){
  const result=spawnSync(process.execPath,['--check',filePath],{encoding:'utf8'});
  if(result.status!==0){
    throw new Error(result.stderr||result.stdout||`Syntax check failed: ${filePath}`);
  }
}

const geometryFile=readEditable(geometryPath);
const presentationFile=readEditable(presentationPath);
const wrxFile=readEditable(wrxPath);

let geometry=geometryFile.lf;
let presentation=presentationFile.lf;
let wrx=wrxFile.lf;

const alreadyApplied=
  geometry.includes('export function ackermannAngleForSide')&&
  presentation.includes("ackermannAngleForSide(geometry,side)")&&
  wrx.includes("ackermannAngleForSide(geometry,side)");

if(alreadyApplied){
  console.log('V21.27 ACKERMANN WHEEL INTEGRATION: ALREADY APPLIED');
  process.exit(0);
}

if(
  geometry.includes('export function ackermannAngleForSide')||
  presentation.includes("ackermannAngleForSide(geometry,side)")||
  wrx.includes("ackermannAngleForSide(geometry,side)")
){
  fail('Partial Ackermann integration detected. Refusing to stack another patch.');
}

geometry += `\n// Maps one physical wheel side to the inner/outer Ackermann angle.\n// World Drive convention: positive steering is a right turn, therefore the\n// right front wheel is inside for positive angles and the left is inside for\n// negative angles. Accept both string and numeric (-1/+1) side metadata.\nexport function ackermannAngleForSide(geometry,side='left'){\n  const turnSign=Math.sign(finite(geometry?.turnSign,0));\n  if(!turnSign)return 0;\n  const normalizedSide=\n    side==='right'||Number(side)>0\n      ?'right'\n      :'left';\n  const inside=\n    turnSign>0\n      ?normalizedSide==='right'\n      :normalizedSide==='left';\n  return finite(\n    inside\n      ?geometry?.innerAngle\n      :geometry?.outerAngle,\n    0\n  );\n}\n`;

presentation=replaceOnce(
  presentation,
  "import { aerodynamicLoad, fitWheelSupportPlane } from './vehicle-dynamics.js';\n",
  "import { aerodynamicLoad, fitWheelSupportPlane } from './vehicle-dynamics.js';\nimport { ackermannSteeringAngles, ackermannAngleForSide } from './physics/steering-geometry.js';\n",
  'vehicle-presentation import'
);

const oldPresentationWheels=`  function updateWheels(dt,speed,visualSteer){\n    for(const w of wheels){\n      if(w.vehicleId&&w.vehicleId!==vehicleSystem.activeId)continue;\n\n      // Tire/rim roll independently inside the steering/suspension pivot.\n      w.tire.rotation.x-=speed*dt/.38;\n      w.rim.rotation.x-=speed*dt/.38;\n\n      const targetWheelYaw=\n        w.front\n          ?visualSteer\n          :0;\n\n      w.pivot.rotation.y+=\n        (targetWheelYaw-w.pivot.rotation.y)*\n        (1-Math.exp(-dt*12));\n\n      if(!Number.isFinite(w.visualCamber)){\n        w.visualCamber=0;\n      }\n\n      const targetCamber=-wheelPlaneRoll;\n\n      w.visualCamber+=\n        (targetCamber-w.visualCamber)*\n        (1-Math.exp(-dt*18));\n\n      w.pivot.rotation.z=w.visualCamber;\n    }\n  }`;

const newPresentationWheels=`  function updateWheels(dt,speed,visualSteer){\n    const vehicle=getDrivingState()?.VEHICLE||{};\n    const geometry=ackermannSteeringAngles({\n      wheelbase:vehicle.wheelbase,\n      trackWidth:vehicle.trackWidth,\n      centerAngle:visualSteer\n    });\n\n    for(const w of wheels){\n      if(w.vehicleId&&w.vehicleId!==vehicleSystem.activeId)continue;\n\n      // Tire/rim roll independently inside the steering/suspension pivot.\n      w.tire.rotation.x-=speed*dt/.38;\n      w.rim.rotation.x-=speed*dt/.38;\n\n      const side=\n        w.side!==undefined\n          ?w.side\n          :(Number(w.pivot?.position?.x)<0?'left':'right');\n      const targetWheelYaw=\n        w.front\n          ?ackermannAngleForSide(geometry,side)\n          :0;\n\n      w.pivot.rotation.y+=\n        (targetWheelYaw-w.pivot.rotation.y)*\n        (1-Math.exp(-dt*12));\n\n      if(!Number.isFinite(w.visualCamber)){\n        w.visualCamber=0;\n      }\n\n      const targetCamber=-wheelPlaneRoll;\n\n      w.visualCamber+=\n        (targetCamber-w.visualCamber)*\n        (1-Math.exp(-dt*18));\n\n      w.pivot.rotation.z=w.visualCamber;\n    }\n  }`;

presentation=replaceOnce(
  presentation,
  oldPresentationWheels,
  newPresentationWheels,
  'vehicle-presentation updateWheels'
);

wrx=
  "import { ackermannSteeringAngles, ackermannAngleForSide } from './physics/steering-geometry.js';\n\n"+
  wrx;

const oldWrxWheels=`  function animateWheels(dt,speed,steerAngle){\n    if(!wheelControllers.length)return;\n    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));\n    const wheelRadius=.317;\n\n    // +Z is forward, therefore positive rotation around +X gives the correct\n    // rolling direction for a wheel whose axle lies along local X.\n    wheelSpin+=Number(speed||0)*safeDt/wheelRadius;\n    if(Math.abs(wheelSpin)>Math.PI*2048)wheelSpin%=Math.PI*2;\n\n    spinQuaternion.setFromAxisAngle(spinAxis,wheelSpin);\n    steerQuaternion.setFromAxisAngle(steerAxis,Number(steerAngle)||0);\n\n    for(const wheel of wheelControllers){\n      wheel.spinPivot.quaternion.copy(spinQuaternion);\n      if(wheel.front)wheel.steerPivot.quaternion.copy(steerQuaternion);\n      else wheel.steerPivot.quaternion.identity();\n    }\n  }`;

const newWrxWheels=`  function animateWheels(dt,speed,steerAngle){\n    if(!wheelControllers.length)return;\n    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));\n    const wheelRadius=.317;\n    const physics=vehicleSystem?.active?.physics||{};\n    const geometry=ackermannSteeringAngles({\n      wheelbase:physics.wheelbase||2.65,\n      trackWidth:physics.trackWidth||1.56,\n      centerAngle:Number(steerAngle)||0\n    });\n\n    // +Z is forward, therefore positive rotation around +X gives the correct\n    // rolling direction for a wheel whose axle lies along local X.\n    wheelSpin+=Number(speed||0)*safeDt/wheelRadius;\n    if(Math.abs(wheelSpin)>Math.PI*2048)wheelSpin%=Math.PI*2;\n\n    spinQuaternion.setFromAxisAngle(spinAxis,wheelSpin);\n\n    for(const wheel of wheelControllers){\n      wheel.spinPivot.quaternion.copy(spinQuaternion);\n      if(wheel.front){\n        const side=wheel.side<0?'left':'right';\n        const wheelSteer=ackermannAngleForSide(geometry,side);\n        steerQuaternion.setFromAxisAngle(steerAxis,wheelSteer);\n        wheel.steerPivot.quaternion.copy(steerQuaternion);\n      }else{\n        wheel.steerPivot.quaternion.identity();\n      }\n    }\n  }`;

wrx=replaceOnce(
  wrx,
  oldWrxWheels,
  newWrxWheels,
  'WRX animateWheels'
);

const backups=[
  [geometryPath,geometryFile.raw],
  [presentationPath,presentationFile.raw],
  [wrxPath,wrxFile.raw]
];

try{
  fs.writeFileSync(geometryPath,restoreEol(geometry,geometryFile.eol),'utf8');
  fs.writeFileSync(presentationPath,restoreEol(presentation,presentationFile.eol),'utf8');
  fs.writeFileSync(wrxPath,restoreEol(wrx,wrxFile.eol),'utf8');
  syntaxCheck(geometryPath);
  syntaxCheck(presentationPath);
  syntaxCheck(wrxPath);
}catch(error){
  for(const [filePath,raw] of backups)fs.writeFileSync(filePath,raw,'utf8');
  fail(`Generated source failed syntax check and was restored.\n${error?.message||error}`);
}

console.log('V21.27 ACKERMANN WHEEL INTEGRATION: APPLIED');
console.log('WRX visible front wheels + generic physical wheel pivots now use inner/outer Ackermann angles.');
console.log('Chassis trajectory / V21.26 handling remains unchanged.');
