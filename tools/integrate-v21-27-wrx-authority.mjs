import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const runtimePath=path.join(root,'src','driving-runtime.js');
const mainPath=path.join(root,'src','main.js');

function fail(message){
  console.error(`V21.27 WRX AUTHORITY INTEGRATION: ABORTED\n${message}`);
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

const runtimeFile=readEditable(runtimePath);
const mainFile=readEditable(mainPath);
let runtime=runtimeFile.lf;
let main=mainFile.lf;

const alreadyApplied=
  runtime.includes("createWrxAuthorityController")&&
  runtime.includes('wrxAuthority.apply({')&&
  runtime.includes('setPhysicsAuthorityEnabled')&&
  main.includes('window.WorldDrivePhysicsAuthority=');

if(alreadyApplied){
  console.log('V21.27 WRX AUTHORITY INTEGRATION: ALREADY APPLIED');
  process.exit(0);
}

if(
  runtime.includes('wrxAuthority.apply({')||
  runtime.includes('setPhysicsAuthorityEnabled')||
  main.includes('window.WorldDrivePhysicsAuthority=')
){
  fail('Partial WRX authority integration detected. Refusing to stack another patch.');
}

if(!runtime.includes("createPerWheelShadowSolver")){
  fail('V21.27 shadow integration is required first.');
}
if(!main.includes('window.WorldDrivePhysicsShadow=')){
  fail('V21.27 shadow diagnostics hook is required first.');
}

runtime=replaceOnce(
  runtime,
  "import { createPerWheelShadowSolver } from './physics/per-wheel-shadow-solver.js';\n",
  "import { createPerWheelShadowSolver } from './physics/per-wheel-shadow-solver.js';\nimport { createWrxAuthorityController } from './physics/wrx-authority-controller.js';\n",
  'WRX authority import'
);

runtime=replaceOnce(
  runtime,
  `  const physicsShadow=createPerWheelShadowSolver({hz:120,maxSubSteps:8});\n\n  function update(dt){`,
  `  const physicsShadow=createPerWheelShadowSolver({hz:120,maxSubSteps:8});\n  const wrxAuthority=createWrxAuthorityController();\n  let wrxPhysicsAuthorityEnabled=true;\n  let wrxAuthorityLateralAccel=0;\n\n  function update(dt){`,
  'WRX authority initialization'
);

const oldShadow=`    // V21.27.2 shadow simulation. The new contact-patch model receives the\n    // exact wheel contacts and current chassis motion, then runs independently\n    // at 120 Hz. Its result is intentionally ignored by the authoritative\n    // V21.26 integrator until calibration/QA says otherwise.\n    physicsShadow.advance(dt,{\n      vehicleId:getVehicleId?.()||'unknown',\n      vehicle:VEHICLE,\n      contacts:vehiclePresentation?.wheelContacts||[],\n      speed,\n      heading,\n      velocityHeading,\n      yawRate:dynamicYawRate,\n      centerSteerAngle:steerAngle,\n      longitudinalAccel,\n      lateralAccel:signedLatAccel,\n      requestedDriveAccel,\n      requestedBrakeAccel,\n      handbrake:hand,\n      surfaceId:onPavement?'asphalt-dry':'dirt'\n    });`;

const newShadow=`    // V21.27.3 — the per-wheel solver remains independently inspectable, but\n    // its lateral force and yaw moment may now become authoritative for the WRX.\n    // Capture the PRE-legacy chassis state so the old drift/yaw helpers can be\n    // cleanly discarded later in this frame when WRX authority is active.\n    const authorityVehicleId=getVehicleId?.()||'unknown';\n    const authorityStart={\n      heading,\n      velocityHeading,\n      dynamicYawRate\n    };\n    const wrxAuthorityCandidate=\n      wrxPhysicsAuthorityEnabled&&\n      authorityVehicleId==='wrx'&&\n      !airborneNow&&\n      !autopilot&&\n      speedAbs>=2;\n\n    const physicsStep=physicsShadow.advance(dt,{\n      vehicleId:authorityVehicleId,\n      vehicle:VEHICLE,\n      contacts:vehiclePresentation?.wheelContacts||[],\n      speed,\n      heading:authorityStart.heading,\n      velocityHeading:authorityStart.velocityHeading,\n      yawRate:authorityStart.dynamicYawRate,\n      centerSteerAngle:steerAngle,\n      longitudinalAccel,\n      lateralAccel:wrxAuthorityCandidate\n        ?wrxAuthorityLateralAccel\n        :signedLatAccel,\n      requestedDriveAccel,\n      requestedBrakeAccel,\n      handbrake:hand,\n      surfaceId:onPavement?'asphalt-dry':'dirt'\n    });`;

runtime=replaceOnce(runtime,oldShadow,newShadow,'shadow authority bridge');

runtime=replaceOnce(
  runtime,
  `    absX+=\n      Math.sin(\n        velocityHeading\n      )*\n      speed*\n      dt;`,
  `    // V21.27.3 — WRX-only lateral/yaw authority. All legacy lateral work\n    // above still runs for telemetry/skid/audio compatibility, but its chassis\n    // heading and momentum result is discarded here. The new per-wheel tire\n    // forces therefore control actual WRX rotation without deleting the proven\n    // fallback path used by every other vehicle.\n    const authorityResult=wrxAuthority.apply({\n      enabled:wrxPhysicsAuthorityEnabled,\n      vehicleId:authorityVehicleId,\n      airborne:airborneNow,\n      autopilot,\n      dt,\n      speed,\n      heading:authorityStart.heading,\n      velocityHeading:authorityStart.velocityHeading,\n      dynamicYawRate:authorityStart.dynamicYawRate,\n      physics:physicsStep\n    });\n\n    if(authorityResult.applied){\n      heading=authorityResult.heading;\n      velocityHeading=authorityResult.velocityHeading;\n      dynamicYawRate=authorityResult.dynamicYawRate;\n      wrxAuthorityLateralAccel=authorityResult.lateralAccel;\n    }else{\n      wrxAuthorityLateralAccel=0;\n    }\n\n    absX+=\n      Math.sin(\n        velocityHeading\n      )*\n      speed*\n      dt;`,
  'WRX authoritative state application'
);

runtime=replaceOnce(
  runtime,
  `  return {\n    update,\n    physicsShadowDiagnostics:()=>physicsShadow.diagnostics()\n  };`,
  `  return {\n    update,\n    physicsShadowDiagnostics:()=>physicsShadow.diagnostics(),\n    physicsAuthorityDiagnostics:()=>({\n      enabled:wrxPhysicsAuthorityEnabled,\n      vehicleId:getVehicleId?.()||'unknown',\n      ...wrxAuthority.diagnostics(),\n      shadow:physicsShadow.diagnostics()\n    }),\n    setPhysicsAuthorityEnabled:value=>{\n      wrxPhysicsAuthorityEnabled=!!value;\n      wrxAuthorityLateralAccel=0;\n      wrxAuthority.reset();\n      return {\n        enabled:wrxPhysicsAuthorityEnabled,\n        vehicleId:getVehicleId?.()||'unknown'\n      };\n    }\n  };`,
  'driving-runtime authority API'
);

main=replaceOnce(
  main,
  `// V21.27.2 diagnostics only. Safe to inspect from DevTools; values do not\n// feed back into the authoritative V21.26 vehicle integrator.\nwindow.WorldDrivePhysicsShadow=()=>\n  drivingRuntime?.physicsShadowDiagnostics?.()||null;`,
  `// V21.27 per-wheel diagnostics remain available independently of whether the\n// WRX experimental authority bridge is enabled.\nwindow.WorldDrivePhysicsShadow=()=>\n  drivingRuntime?.physicsShadowDiagnostics?.()||null;\n\n// Emergency/test switch for the first authoritative WRX phase.\n//   WorldDrivePhysicsAuthority()      -> diagnostics\n//   WorldDrivePhysicsAuthority(false) -> immediate V21.26 lateral fallback\n//   WorldDrivePhysicsAuthority(true)  -> re-enable WRX tire-force authority\nwindow.WorldDrivePhysicsAuthority=enabled=>{\n  if(enabled===undefined){\n    return drivingRuntime?.physicsAuthorityDiagnostics?.()||null;\n  }\n  return drivingRuntime?.setPhysicsAuthorityEnabled?.(!!enabled)||null;\n};`,
  'main authority diagnostics hook'
);

const backups=[
  [runtimePath,runtimeFile.raw],
  [mainPath,mainFile.raw]
];

try{
  fs.writeFileSync(runtimePath,restoreEol(runtime,runtimeFile.eol),'utf8');
  fs.writeFileSync(mainPath,restoreEol(main,mainFile.eol),'utf8');
  syntaxCheck(runtimePath);
  syntaxCheck(mainPath);
}catch(error){
  for(const [filePath,raw] of backups)fs.writeFileSync(filePath,raw,'utf8');
  fail(`Generated source failed syntax check and was restored.\n${error?.message||error}`);
}

console.log('V21.27 WRX AUTHORITY INTEGRATION: APPLIED');
console.log('WRX lateral momentum + yaw now use per-wheel tire forces above 2 m/s.');
console.log('Longitudinal speed remains on the V21.26 model for this transition step.');
console.log('Other vehicles and WRX autopilot/airborne/low-speed states keep the V21.26 fallback.');
console.log('Emergency fallback: WorldDrivePhysicsAuthority(false)');
