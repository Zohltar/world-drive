import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const runtimePath=path.join(root,'src','driving-runtime.js');

const raw=fs.readFileSync(mainPath,'utf8');
const eol=raw.includes('\r\n')?'\r\n':'\n';
let main=raw.replace(/\r\n/g,'\n');

const runtimeImport="import { createDrivingRuntime } from './driving-runtime.js';";

if(main.includes(runtimeImport)&&fs.existsSync(runtimePath)){
  console.log('V21.26 DRIVING REFACTOR: already applied');
  process.exit(0);
}
if(main.includes(runtimeImport)||fs.existsSync(runtimePath)){
  throw new Error('V21.26 driving refactor: partial previous application detected. Restore the branch before retrying.');
}

function functionRange(source,signature){
  const start=source.indexOf(signature);
  if(start<0)throw new Error(`V21.26 driving refactor: ${signature} not found. No files changed.`);
  const brace=source.indexOf('{',start);
  if(brace<0)throw new Error(`V21.26 driving refactor: opening brace not found for ${signature}. No files changed.`);

  let depth=0;
  let quote=null;
  let lineComment=false;
  let blockComment=false;
  let escape=false;

  for(let i=brace;i<source.length;i++){
    const ch=source[i];
    const next=source[i+1];

    if(lineComment){
      if(ch==='\n')lineComment=false;
      continue;
    }
    if(blockComment){
      if(ch==='*'&&next==='/'){blockComment=false;i++;}
      continue;
    }
    if(quote){
      if(escape){escape=false;continue;}
      if(ch==='\\'){escape=true;continue;}
      if(ch===quote){quote=null;}
      continue;
    }

    if(ch==='/'&&next==='/'){lineComment=true;i++;continue;}
    if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}
    if(ch==="'"||ch==='"'||ch==='`'){quote=ch;continue;}

    if(ch==='{')depth++;
    else if(ch==='}'){
      depth--;
      if(depth===0)return {start,end:i+1,brace};
    }
  }
  throw new Error(`V21.26 driving refactor: closing brace not found for ${signature}. No files changed.`);
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`V21.26 driving refactor: ${label} not found. No files changed.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    throw new Error(`V21.26 driving refactor: ${label} is ambiguous. No files changed.`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

const range=functionRange(main,'function updateDrive(dt)');
const originalFunction=main.slice(range.start,range.end);
let body=originalFunction.slice(originalFunction.indexOf('{')+1,-1);

const leadingPattern=/^\s*const nr=nearestRouteForVehicle\(absX,absZ\);\s*const ap=autopilotControl\(dt,nr\);\s*/;
if(!leadingPattern.test(body)){
  throw new Error('V21.26 driving refactor: updateDrive prologue changed. No files changed.');
}
body=body.replace(leadingPattern,'');

body=body.replace(/\bv21MenuOpen\b/g,'menuOpen');

const recenterNeedle=' recenterIfNeeded(absX,absZ);';
if(body.indexOf('worldOffset')>=0&&body.indexOf('worldOffset')<body.indexOf(recenterNeedle)){
  throw new Error('V21.26 driving refactor: worldOffset is used before recenter; extraction assumptions no longer hold.');
}
body=replaceOnce(
  body,
  recenterNeedle,
  ' syncState();\n recenterIfNeeded(absX,absZ);\n const worldOffset=getWorldOffset();',
  'post-integration recenter'
);

body=replaceOnce(
  body,
  ' setFastWheelRoadSupport(onRoad,roadFrame,centerRoadSurfaceY);',
  ' setFastWheelRoadSupport(onRoad,roadFrame,centerRoadSurfaceY,absX,absZ);',
  'fast wheel road support call'
);

const stateNames=[
  'absX','absZ','heading','speed','steer',
  'longitudinalAccel','visualSteer','currentSteerAngle',
  'countachBrakeLightRequested','countachReverseLightRequested',
  'lateralGripUsage','velocityHeading','dynamicYawRate',
  'wheelGripUsage','wheelSlipLevels','wheelLateralUsage','wheelLongitudinalUsage',
  'frontSlipAmount','rearSlipAmount',
  'currentOnPavementForInstruments',
  'driveHudAccumulator','minimapAccumulator','gripSolverAccumulator','worldStreamingAccumulator',
  'lastContactModeText','roadContact'
];

const dependencyNames=[
  'getState','setState','getFlags','getRouteLength','getWorldOffset',
  'nearestRouteForVehicle','autopilotControl','keyboardActionDown','gamepadState',
  'updateTransmission','vehiclePresentation','vehicleVisuals','truckTrailerSystem',
  'roadSurfaceGrip','VEHICLE','vehicleTopSpeedKmh','activeTransmissionProfile',
  'effectiveEngineRedlineRpm','transmissionRedlineSpeedKmh','vehicleReverseLimitMps',
  'physicsClamp','longitudinalTractionLimit','computeGradeAcceleration',
  'physicsRoadFrameScratch','dynamicsScratch','roadProfileFrameAtCum',
  'ensureRoadProfileNear','roadFrameAt','terrainAbs','routePointAtCum',
  'laneKeepAssistCommand','angleDelta','steeringCommand','advanceSteeringRack',
  'lateralDynamicsEnvelope','estimateWheelGripUsage','yawResponseRate',
  'limitMomentumHeadingDelta','recenterIfNeeded','updateRunChallenge','terrainFrameAt',
  'ROAD_SURFACE_OFFSET','TIRE_VISUAL_CLEARANCE','setFastWheelRoadSupport',
  'car','skidMarks','xzToLL','elevationService','altitudeEl',
  'updatePassedSignReadout','drawMap','worldStreaming','$',
  'DRIVE_HUD_INTERVAL','MINIMAP_INTERVAL','GRIP_SOLVER_INTERVAL','WORLD_STREAMING_INTERVAL'
];

const runtimeLines=[];
runtimeLines.push('export function createDrivingRuntime({');
for(const name of dependencyNames)runtimeLines.push(`  ${name},`);
runtimeLines.push('}){');
runtimeLines.push('  function update(dt){');
runtimeLines.push('    const initialState=getState();');
runtimeLines.push('    const nr=nearestRouteForVehicle(initialState.absX,initialState.absZ);');
runtimeLines.push('    const ap=autopilotControl(dt,nr);');
runtimeLines.push('');
runtimeLines.push('    let {');
for(const name of stateNames)runtimeLines.push(`      ${name},`);
runtimeLines.push('    }=getState();');
runtimeLines.push('');
runtimeLines.push('    const {');
runtimeLines.push('      assist,');
runtimeLines.push('      autopilot,');
runtimeLines.push('      menuOpen,');
runtimeLines.push('      maxSpeedKmh,');
runtimeLines.push('      maxSpeedMps:MAX');
runtimeLines.push('    }=getFlags();');
runtimeLines.push('    const routeLength=getRouteLength();');
runtimeLines.push('');
runtimeLines.push('    const syncState=()=>setState({');
for(const name of stateNames)runtimeLines.push(`      ${name},`);
runtimeLines.push('    });');
runtimeLines.push('');
for(const line of body.split('\n'))runtimeLines.push(`   ${line}`);
runtimeLines.push('');
runtimeLines.push('    syncState();');
runtimeLines.push('  }');
runtimeLines.push('');
runtimeLines.push('  return {update};');
runtimeLines.push('}');
runtimeLines.push('');

const runtimeSource=runtimeLines.join('\n');

const keyboardImport="import { createKeyboardControls } from './keyboard-controls.js';";
main=replaceOnce(
  main,
  keyboardImport,
  `${keyboardImport}\n${runtimeImport}`,
  'keyboard controller import'
);

main=replaceOnce(
  main,
  originalFunction,
  `// ---------- driving runtime facade ----------\nlet drivingRuntime=null;\nfunction updateDrive(dt){\n  drivingRuntime?.update(dt);\n}`,
  'legacy updateDrive implementation'
);

main=replaceOnce(
  main,
  'function setFastWheelRoadSupport(active,roadFrame,centerY){',
  'function setFastWheelRoadSupport(active,roadFrame,centerY,centerX=absX,centerZ=absZ){',
  'fast wheel road support signature'
);
main=replaceOnce(
  main,
  '  fastWheelRoadSupport.centerX=absX;\n  fastWheelRoadSupport.centerZ=absZ;',
  '  fastWheelRoadSupport.centerX=centerX;\n  fastWheelRoadSupport.centerZ=centerZ;',
  'fast wheel road support center assignment'
);

const initAnchor='const promiseWithTimeout=(promise,timeoutMs)=>streamingCoordinator.promiseWithTimeout(promise,timeoutMs);';
const initLines=[];
initLines.push('');
initLines.push('// ---------- driving runtime ----------');
initLines.push('drivingRuntime=createDrivingRuntime({');
initLines.push('  getState:()=>({');
for(const name of stateNames)initLines.push(`    ${name},`);
initLines.push('  }),');
initLines.push('  setState:state=>{');
for(const name of stateNames)initLines.push(`    ${name}=state.${name};`);
initLines.push('  },');
initLines.push('  getFlags:()=>({');
initLines.push('    assist,');
initLines.push('    autopilot,');
initLines.push('    menuOpen:v21MenuOpen,');
initLines.push('    maxSpeedKmh,');
initLines.push('    maxSpeedMps:MAX');
initLines.push('  }),');
initLines.push('  getRouteLength:()=>routeLength,');
initLines.push('  getWorldOffset:()=>worldOffset,');
for(const name of dependencyNames.slice(5)){
  initLines.push(`  ${name},`);
}
initLines.push('});');
initLines.push('');

main=replaceOnce(
  main,
  initAnchor,
  `${initAnchor}\n${initLines.join('\n')}`,
  'streaming facade initialization anchor'
);

if(main.includes('// ----- V4.1 longitudinal dynamics -----')){
  throw new Error('V21.26 driving refactor: legacy driving body still remains in main.js. No files changed.');
}
if(!runtimeSource.includes('// ----- V4.1 longitudinal dynamics -----')){
  throw new Error('V21.26 driving refactor: generated driving-runtime.js is missing longitudinal dynamics.');
}
if(!runtimeSource.includes('HIGH-SPEED LATERAL FORCE BUILDUP')){
  throw new Error('V21.26 driving refactor: generated driving-runtime.js is missing lateral/yaw dynamics.');
}

const tempMain=path.join(root,'tools','__v21_26_driving_main_check__.mjs');
const tempRuntime=path.join(root,'tools','__v21_26_driving_runtime_check__.mjs');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){
    throw new Error(`Syntax check failed for ${path.basename(file)}:\n${result.stderr||result.stdout}`);
  }
}

try{
  fs.writeFileSync(tempMain,main,'utf8');
  fs.writeFileSync(tempRuntime,runtimeSource,'utf8');
  syntaxCheck(tempMain);
  syntaxCheck(tempRuntime);
}finally{
  fs.rmSync(tempMain,{force:true});
  fs.rmSync(tempRuntime,{force:true});
}

const outputMain=eol==='\n'?main:main.replace(/\n/g,eol);
const outputRuntime=eol==='\n'?runtimeSource:runtimeSource.replace(/\n/g,eol);

fs.writeFileSync(runtimePath,outputRuntime,'utf8');
fs.writeFileSync(mainPath,outputMain,'utf8');

const beforeLines=raw.split(/\r?\n/).length;
const afterLines=outputMain.split(/\r?\n/).length;
const runtimeLinesCount=outputRuntime.split(/\r?\n/).length;

console.log('V21.26 DRIVING REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines`);
console.log(`driving-runtime.js: ${runtimeLinesCount} lines`);
console.log('Extracted: per-frame player driving integration, tire/grip/yaw dynamics, road contact, suspension/skid/HUD cadence and streaming boundary update.');
