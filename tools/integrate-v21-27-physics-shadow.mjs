import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const runtimePath=path.join(root,'src','driving-runtime.js');
const mainPath=path.join(root,'src','main.js');
const solverPath=path.join(root,'src','physics','per-wheel-shadow-solver.js');

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

function readNormalized(filePath){
  const raw=fs.readFileSync(filePath,'utf8');
  return {
    raw,
    eol:raw.includes('\r\n')?'\r\n':'\n',
    text:raw.replace(/\r\n/g,'\n')
  };
}

function restoreEol(text,eol){
  return eol==='\r\n'?text.replace(/\n/g,'\r\n'):text;
}

const runtimeFile=readNormalized(runtimePath);
const mainFile=readNormalized(mainPath);
const solverFile=readNormalized(solverPath);
let runtime=runtimeFile.text;
let main=mainFile.text;
let solver=solverFile.text;

const solverLockMarker='V21.27.2 — brake-hold equilibrium at zero wheel speed.';
const runtimeApplied=
  runtime.includes("createPerWheelShadowSolver")&&
  runtime.includes('physicsShadow.advance(dt,{')&&
  runtime.includes('physicsShadowDiagnostics:()=>physicsShadow.diagnostics()');
const mainApplied=
  main.includes('getVehicleId:()=>vehicleSystem.activeId')&&
  main.includes('window.WorldDrivePhysicsShadow=');
const solverLockApplied=solver.includes(solverLockMarker);

if(runtimeApplied&&mainApplied&&solverLockApplied){
  console.log('V21.27 PHYSICS SHADOW INTEGRATION: ALREADY APPLIED');
  process.exit(0);
}

// Repair the wheel rotational model first. A brake is a resisting torque, not a
// motor: once omega reaches zero it may hold the wheel there if its available
// torque can balance the tire reaction. Without this equilibrium, a locked rear
// wheel could chatter numerically through zero and spin backwards on the next
// 120 Hz step.
if(!solverLockApplied){
  solver=replaceOnce(
    solver,
    `      const inputTorqueNm=driveTorqueNm+serviceBrakeTorqueNm+handbrakeTorqueNm;\n      const reactionTorqueNm=-force.fxWheel*tire.rollingRadiusM;\n      const previousOmega=state.omega;\n      state.omega+=(inputTorqueNm+reactionTorqueNm)/Math.max(.05,tire.wheelInertiaKgM2)*step;\n\n      // A pure brake must stop at zero rather than numerically powering the wheel\n      // backwards after crossing zero during one 120 Hz step.\n      const hasDrive=Math.abs(driveTorqueNm)>.01;\n      const brakingOnly=!hasDrive&&(Math.abs(serviceBrakeTorqueNm)+Math.abs(handbrakeTorqueNm)>.01);\n      if(brakingOnly&&previousOmega!==0&&Math.sign(previousOmega)!==Math.sign(state.omega)){\n        state.omega=0;\n      }`,
    `      const reactionTorqueNm=-force.fxWheel*tire.rollingRadiusM;\n      const previousOmega=state.omega;\n      const wheelInertia=Math.max(.05,tire.wheelInertiaKgM2);\n      const hasDrive=Math.abs(driveTorqueNm)>.01;\n      const brakeTorqueCapacityNm=\n        Math.abs(serviceBrakeTorqueNm)+\n        Math.abs(handbrakeTorqueNm);\n      const brakingOnly=!hasDrive&&brakeTorqueCapacityNm>.01;\n      const nonBrakeTorqueNm=driveTorqueNm+reactionTorqueNm;\n      const signedBrakeTorqueNm=serviceBrakeTorqueNm+handbrakeTorqueNm;\n      const predictedOmega=\n        previousOmega+\n        (nonBrakeTorqueNm+signedBrakeTorqueNm)/wheelInertia*step;\n\n      // V21.27.2 — brake-hold equilibrium at zero wheel speed.\n      // A brake may decelerate a rotating wheel to zero, but it must never act\n      // like a motor and drive that wheel backwards. At omega=0 the brake can\n      // statically balance tire reaction torque up to its available capacity.\n      if(brakingOnly){\n        const crossedZero=\n          previousOmega!==0&&\n          Math.sign(previousOmega)!==Math.sign(predictedOmega);\n        const canHoldAtZero=\n          Math.abs(previousOmega)<1e-9&&\n          brakeTorqueCapacityNm+1e-6>=Math.abs(nonBrakeTorqueNm);\n\n        state.omega=\n          crossedZero||canHoldAtZero\n            ?0\n            :predictedOmega;\n      }else{\n        state.omega=predictedOmega;\n      }`,
    'rear wheel lock equilibrium'
  );
}

if(!runtimeApplied){
  if(runtime.includes('physicsShadow.advance(dt,{')){
    fail('Partial driving-runtime shadow integration detected.');
  }

  if(!runtime.includes("import { createPerWheelShadowSolver } from './physics/per-wheel-shadow-solver.js';")){
    runtime=
      "import { createPerWheelShadowSolver } from './physics/per-wheel-shadow-solver.js';\n\n"+
      runtime;
  }

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
}

if(!mainApplied){
  if(main.includes('window.WorldDrivePhysicsShadow=')){
    fail('Partial main shadow integration detected.');
  }

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
}

try{
  fs.writeFileSync(runtimePath,restoreEol(runtime,runtimeFile.eol),'utf8');
  fs.writeFileSync(mainPath,restoreEol(main,mainFile.eol),'utf8');
  fs.writeFileSync(solverPath,restoreEol(solver,solverFile.eol),'utf8');
  syntaxCheck(runtimePath);
  syntaxCheck(mainPath);
  syntaxCheck(solverPath);
}catch(error){
  fs.writeFileSync(runtimePath,runtimeFile.raw,'utf8');
  fs.writeFileSync(mainPath,mainFile.raw,'utf8');
  fs.writeFileSync(solverPath,solverFile.raw,'utf8');
  fail(`Generated source failed syntax check and was restored.\n${error?.message||error}`);
}

console.log('V21.27 PHYSICS SHADOW INTEGRATION: APPLIED');
console.log('CRLF/LF safe · rear brake lock equilibrium enabled.');
console.log('Authoritative handling unchanged; 120 Hz per-wheel diagnostics enabled.');
console.log('DevTools: WorldDrivePhysicsShadow()');
