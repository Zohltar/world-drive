import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const runtimePath=path.join(root,'src','driving-runtime.js');
const mainPath=path.join(root,'src','main.js');

function fail(message){
  console.error(`V21.27 PHYSICS SHADOW INTEGRATION: ABORTED\n${message}`);
  process.exit(1);
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

let runtime=fs.readFileSync(runtimePath,'utf8');
let main=fs.readFileSync(mainPath,'utf8');

const alreadyApplied=
  runtime.includes("createPerWheelShadowSolver")&&
  runtime.includes('physicsShadow.advance(dt,{')&&
  runtime.includes('physicsShadowDiagnostics:()=>physicsShadow.diagnostics()')&&
  main.includes('getVehicleId:()=>vehicleSystem.activeId')&&
  main.includes('window.WorldDrivePhysicsShadow=');

if(alreadyApplied){
  console.log('V21.27 PHYSICS SHADOW INTEGRATION: ALREADY APPLIED');
  process.exit(0);
}

if(runtime.includes('physicsShadow.advance(dt,{')||main.includes('window.WorldDrivePhysicsShadow=')){
  fail('Partial shadow integration detected. Refusing to stack another patch.');
}

runtime=
  "import { createPerWheelShadowSolver } from './physics/per-wheel-shadow-solver.js';\n\n"+
  runtime;

runtime=replaceOnce(
  runtime,
  '  roadSurfaceGrip,\n  VEHICLE,',
  '  roadSurfaceGrip,\n  getVehicleId,\n  VEHICLE,',
  'driving-runtime dependency'
);

runtime=replaceOnce(
  runtime,
  '}){\n  function update(dt){',
  `}){\n  // V21.27.2 — non-authoritative 120 Hz per-wheel solver. It observes the\n  // V21.26 chassis state but never writes position, heading or speed.\n  const physicsShadow=createPerWheelShadowSolver({hz:120,maxSubSteps:8});\n\n  function update(dt){`,
  'driving-runtime initialization'
);

runtime=replaceOnce(
  runtime,
  '    wheelGripUsage=\n      perWheelGrip.smoothed;',
  `    // V21.27.2 shadow simulation. The new contact-patch model receives the\n    // exact wheel contacts and current chassis motion, then runs independently\n    // at 120 Hz. Its result is intentionally ignored by the authoritative\n    // V21.26 integrator until calibration/QA says otherwise.\n    physicsShadow.advance(dt,{\n      vehicleId:getVehicleId?.()||'unknown',\n      vehicle:VEHICLE,\n      contacts:vehiclePresentation?.wheelContacts||[],\n      speed,\n      heading,\n      velocityHeading,\n      yawRate:dynamicYawRate,\n      centerSteerAngle:steerAngle,\n      longitudinalAccel,\n      lateralAccel:signedLatAccel,\n      requestedDriveAccel,\n      requestedBrakeAccel,\n      handbrake:hand,\n      surfaceId:onPavement?'asphalt-dry':'dirt'\n    });\n\n    wheelGripUsage=\n      perWheelGrip.smoothed;`,
  'shadow-step insertion'
);

runtime=replaceOnce(
  runtime,
  '  return {update};\n}',
  `  return {\n    update,\n    physicsShadowDiagnostics:()=>physicsShadow.diagnostics()\n  };\n}`,
  'driving-runtime return'
);

const runtimeStart=main.indexOf('drivingRuntime=createDrivingRuntime({');
if(runtimeStart<0)fail('Missing main driving-runtime creation anchor.');
const runtimeEnd=main.indexOf('\n});',runtimeStart);
if(runtimeEnd<0)fail('Missing main driving-runtime creation terminator.');
let runtimeBlock=main.slice(runtimeStart,runtimeEnd+4);
if(!runtimeBlock.includes('  roadSurfaceGrip,\n  VEHICLE,')){
  fail('Missing main roadSurfaceGrip/VEHICLE dependency anchor.');
}
runtimeBlock=runtimeBlock.replace(
  '  roadSurfaceGrip,\n  VEHICLE,',
  '  roadSurfaceGrip,\n  getVehicleId:()=>vehicleSystem.activeId,\n  VEHICLE,'
);
main=main.slice(0,runtimeStart)+runtimeBlock+main.slice(runtimeEnd+4);

main=replaceOnce(
  main,
  '// ---------- main ----------',
  `// V21.27.2 diagnostics only. Safe to inspect from DevTools; values do not\n// feed back into the authoritative V21.26 vehicle integrator.\nwindow.WorldDrivePhysicsShadow=()=>\n  drivingRuntime?.physicsShadowDiagnostics?.()||null;\n\n// ---------- main ----------`,
  'main diagnostics hook'
);

const runtimeBackup=fs.readFileSync(runtimePath,'utf8');
const mainBackup=fs.readFileSync(mainPath,'utf8');

try{
  fs.writeFileSync(runtimePath,runtime,'utf8');
  fs.writeFileSync(mainPath,main,'utf8');
  syntaxCheck(runtimePath);
  syntaxCheck(mainPath);
}catch(error){
  fs.writeFileSync(runtimePath,runtimeBackup,'utf8');
  fs.writeFileSync(mainPath,mainBackup,'utf8');
  fail(`Generated source failed syntax check and was restored.\n${error?.message||error}`);
}

console.log('V21.27 PHYSICS SHADOW INTEGRATION: APPLIED');
console.log('Authoritative handling unchanged; 120 Hz per-wheel diagnostics enabled.');
console.log('DevTools: WorldDrivePhysicsShadow()');
