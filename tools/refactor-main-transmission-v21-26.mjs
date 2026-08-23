import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','transmission-controller.js');

const raw=fs.readFileSync(mainPath,'utf8');
const eol=raw.includes('\r\n')?'\r\n':'\n';
let main=raw.replace(/\r\n/g,'\n');

const transmissionImport="import { createTransmissionController } from './transmission-controller.js';";

if(main.includes(transmissionImport)&&fs.existsSync(modulePath)){
  console.log('V21.26 TRANSMISSION REFACTOR: already applied');
  process.exit(0);
}
if(main.includes(transmissionImport)||fs.existsSync(modulePath)){
  throw new Error('V21.26 transmission refactor: partial previous application detected. Restore the generated files before retrying.');
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`V21.26 transmission refactor: ${label} not found. No files changed.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    throw new Error(`V21.26 transmission refactor: ${label} is ambiguous. No files changed.`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

const startMarker='function activeTransmissionProfile(){';
const endMarker='// V21.21: generalized vehicle dynamics math lives in vehicle-dynamics.js.';
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start);
if(start<0||end<0||end<=start){
  throw new Error('V21.26 transmission refactor: transmission block markers not found. No files changed.');
}

const legacyBlock=main.slice(start,end);
for(const required of [
  'function activeTransmissionProfile(){',
  'function effectiveEngineRedlineRpm(',
  'function transmissionRedlineSpeedKmh(',
  'function resetTransmissionState(){',
  'function requestManualShift(direction){',
  'function desiredTransmissionGear(',
  'function updateTransmission(dt,requestedThrottle,onPavement=true){',
  "transmissionMode==='automatic'",
  'revLimiterActive=true;',
  'computeTransmissionState('
]){
  if(!legacyBlock.includes(required)){
    throw new Error(`V21.26 transmission refactor: expected behavior missing: ${required}. No files changed.`);
  }
}

const stateNames=[
  'transmissionGear',
  'transmissionPendingGear',
  'transmissionShiftTimer',
  'transmissionShiftDuration',
  'transmissionShiftStartRpm',
  'transmissionShiftEndRpm',
  'engineRpm',
  'transmissionShifting',
  'transmissionProfileKey',
  'revLimiterActive',
  'revLimiterPhase',
  'transmissionMode',
  'manualShiftRequest'
];

let moduleBlock=legacyBlock;
for(const name of stateNames){
  moduleBlock=moduleBlock.replace(new RegExp(`\\b${name}\\b`,'g'),`state.${name}`);
}
moduleBlock=moduleBlock
  .replace(/\bspeed\b/g,'getSpeed()')
  .replace(/\blongitudinalAccel\b/g,'getLongitudinalAccel()');

const moduleLines=[];
moduleLines.push('export function createTransmissionController({');
for(const name of [
  'vehicleSystem',
  'VEHICLE',
  'computeGearRedlineSpeeds',
  'computeTransmissionState',
  'physicsClamp',
  'physicsSmoothstep01',
  'toast',
  'getSpeed',
  'getLongitudinalAccel',
  'vehicleReverseLimitMps',
  'state'
])moduleLines.push(`  ${name},`);
moduleLines.push('}){');
for(const line of moduleBlock.trimEnd().split('\n'))moduleLines.push(`  ${line}`);
moduleLines.push('');
moduleLines.push('  return {');
moduleLines.push('    activeTransmissionProfile,');
moduleLines.push('    effectiveEngineRedlineRpm,');
moduleLines.push('    transmissionRedlineSpeedKmh,');
moduleLines.push('    resetTransmissionState,');
moduleLines.push('    requestManualShift,');
moduleLines.push('    desiredTransmissionGear,');
moduleLines.push('    updateTransmission');
moduleLines.push('  };');
moduleLines.push('}');
moduleLines.push('');
const moduleSource=moduleLines.join('\n');

const facade=[
  '// ---------- transmission controller facade ----------',
  'let transmissionController=null;',
  'function activeTransmissionProfile(...args){return transmissionController.activeTransmissionProfile(...args);}',
  'function effectiveEngineRedlineRpm(...args){return transmissionController.effectiveEngineRedlineRpm(...args);}',
  'function transmissionRedlineSpeedKmh(...args){return transmissionController.transmissionRedlineSpeedKmh(...args);}',
  'function resetTransmissionState(...args){return transmissionController.resetTransmissionState(...args);}',
  'function requestManualShift(...args){return transmissionController.requestManualShift(...args);}',
  'function desiredTransmissionGear(...args){return transmissionController.desiredTransmissionGear(...args);}',
  'function updateTransmission(...args){return transmissionController.updateTransmission(...args);}',
  ''
].join('\n');

// Replace the ownership block before inserting anything earlier in main.js.
main=main.slice(0,start)+facade+main.slice(end);

const vehicleAnchor='const VEHICLE=vehicleSystem.physics;';
const stateBridgeLines=[];
stateBridgeLines.push(vehicleAnchor);
stateBridgeLines.push('const transmissionStateBridge={};');
stateBridgeLines.push('Object.defineProperties(transmissionStateBridge,{');
for(const name of stateNames){
  stateBridgeLines.push(`  ${name}:{get:()=>${name},set:value=>{${name}=value;}},`);
}
stateBridgeLines.push('});');
stateBridgeLines.push('transmissionController=createTransmissionController({');
stateBridgeLines.push('  vehicleSystem,');
stateBridgeLines.push('  VEHICLE,');
stateBridgeLines.push('  computeGearRedlineSpeeds,');
stateBridgeLines.push('  computeTransmissionState,');
stateBridgeLines.push('  physicsClamp,');
stateBridgeLines.push('  physicsSmoothstep01,');
stateBridgeLines.push('  toast,');
stateBridgeLines.push('  getSpeed:()=>speed,');
stateBridgeLines.push('  getLongitudinalAccel:()=>longitudinalAccel,');
stateBridgeLines.push('  vehicleReverseLimitMps,');
stateBridgeLines.push('  state:transmissionStateBridge');
stateBridgeLines.push('});');
main=replaceOnce(main,vehicleAnchor,stateBridgeLines.join('\n'),'vehicle physics anchor');

const importAnchor="import { createEnvironmentController } from './environment-controller.js';";
main=replaceOnce(main,importAnchor,`${importAnchor}\n${transmissionImport}`,'environment import anchor');

for(const heavyPattern of [
  'function activeTransmissionProfile(){',
  'function effectiveEngineRedlineRpm(\n',
  'function transmissionRedlineSpeedKmh(\n',
  'function resetTransmissionState(){',
  'function requestManualShift(direction){',
  'function desiredTransmissionGear(\n',
  'function updateTransmission(dt,requestedThrottle,onPavement=true){'
]){
  if(main.includes(heavyPattern)){
    throw new Error(`V21.26 transmission refactor: legacy implementation remains in main.js: ${heavyPattern}`);
  }
}

for(const required of [
  'function updateTransmission(dt,requestedThrottle,onPavement=true){',
  'state.transmissionGear',
  'state.engineRpm',
  'state.revLimiterActive',
  'state.transmissionMode',
  'getSpeed()',
  'getLongitudinalAccel()',
  'computeTransmissionState('
]){
  if(!moduleSource.includes(required)){
    throw new Error(`V21.26 transmission refactor: generated module lost behavior: ${required}`);
  }
}

const tempMain=path.join(root,'tools','__v21_26_transmission_main_check__.mjs');
const tempModule=path.join(root,'tools','__v21_26_transmission_module_check__.mjs');
function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){
    throw new Error(`Syntax check failed for ${path.basename(file)}:\n${result.stderr||result.stdout}`);
  }
}

try{
  fs.writeFileSync(tempMain,main,'utf8');
  fs.writeFileSync(tempModule,moduleSource,'utf8');
  syntaxCheck(tempMain);
  syntaxCheck(tempModule);
}finally{
  fs.rmSync(tempMain,{force:true});
  fs.rmSync(tempModule,{force:true});
}

const outputMain=eol==='\n'?main:main.replace(/\n/g,eol);
const outputModule=eol==='\n'?moduleSource:moduleSource.replace(/\n/g,eol);
fs.writeFileSync(modulePath,outputModule,'utf8');
fs.writeFileSync(mainPath,outputMain,'utf8');

const beforeLines=raw.split(/\r?\n/).length;
const afterLines=outputMain.split(/\r?\n/).length;
const moduleLinesCount=outputModule.split(/\r?\n/).length;
console.log('V21.26 TRANSMISSION REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines`);
console.log(`transmission-controller.js: ${moduleLinesCount} lines`);
console.log('Extracted: automatic/manual gearbox, shift timing, effective redline and rev-limiter behavior with live main-state bridge.');
