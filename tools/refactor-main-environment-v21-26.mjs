import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','environment-controller.js');

const raw=fs.readFileSync(mainPath,'utf8');
const eol=raw.includes('\r\n')?'\r\n':'\n';
let main=raw.replace(/\r\n/g,'\n');

const environmentImport="import { createEnvironmentController } from './environment-controller.js';";

if(main.includes(environmentImport)&&fs.existsSync(modulePath)){
  console.log('V21.26 ENVIRONMENT REFACTOR: already applied');
  process.exit(0);
}
if(main.includes(environmentImport)||fs.existsSync(modulePath)){
  throw new Error('V21.26 environment refactor: partial previous application detected. Restore the branch before retrying.');
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`V21.26 environment refactor: ${label} not found. No files changed.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    throw new Error(`V21.26 environment refactor: ${label} is ambiguous. No files changed.`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

const startMarker='const DISPLAY_DISTANCE_PROFILES={';
const endMarker='// ---------- V21 menu facade ----------';
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start);

if(start<0||end<0||end<=start){
  throw new Error('V21.26 environment refactor: environment block markers not found. No files changed.');
}

const legacyBlock=main.slice(start,end);
for(const required of [
  "low:{",
  "medium:{",
  "high:{",
  'function applyDisplayDistanceProfile(',
  "const timeSlider=$('timeSlider'),timeLabel=$('timeLabel');",
  'let timeOfDay=12;',
  'function setTimeOfDay(hour)',
  "timeSlider.addEventListener('input',e=>setTimeOfDay(e.target.value));",
  'vehicleVisuals.updateAutomaticHeadlights(daylight);',
  'updateMoonSkyPosition();'
]){
  if(!legacyBlock.includes(required)){
    throw new Error(`V21.26 environment refactor: expected behavior missing: ${required}. No files changed.`);
  }
}

const dependencyNames=[
  'THREE',
  '$',
  'appSettings',
  'camera',
  'scene',
  'worldStreaming',
  'queueSettingsSave',
  'hemi',
  'sun',
  'moonLight',
  'moonMaterial',
  'moonSprite',
  'vehicleVisuals',
  'moonDirection',
  'updateMoonSkyPosition'
];

const moduleLines=[];
moduleLines.push('export function createEnvironmentController({');
for(const name of dependencyNames)moduleLines.push(`  ${name},`);
moduleLines.push('}){');
for(const line of legacyBlock.trimEnd().split('\n'))moduleLines.push(`  ${line}`);
moduleLines.push('');
moduleLines.push('  return {');
moduleLines.push('    applyDisplayDistanceProfile,');
moduleLines.push('    setTimeOfDay,');
moduleLines.push('    timeSlider,');
moduleLines.push('    timeLabel,');
moduleLines.push('    getTimeOfDay:()=>timeOfDay');
moduleLines.push('  };');
moduleLines.push('}');
moduleLines.push('');
const moduleSource=moduleLines.join('\n');

const initLines=[];
initLines.push('// ---------- display distance + time of day facade ----------');
initLines.push('const environmentController=createEnvironmentController({');
for(const name of dependencyNames){
  initLines.push(`  ${name},`);
}
initLines.push('});');
initLines.push('const {');
initLines.push('  applyDisplayDistanceProfile,');
initLines.push('  setTimeOfDay,');
initLines.push('  timeSlider,');
initLines.push('  timeLabel,');
initLines.push('  getTimeOfDay');
initLines.push('}=environmentController;');
initLines.push('');

// Replace first; source indices above refer to the untouched main.js.
main=main.slice(0,start)+initLines.join('\n')+main.slice(end);

// vehicle-presentation still consumes the current clock value through its
// getDrivingState callback. Keep the object property name stable while reading
// the state from the newly extracted controller.
main=replaceOnce(
  main,
  '    timeOfDay\n  }),\n  ROAD_WHEEL_CONTACT_HALF_WIDTH',
  '    timeOfDay:getTimeOfDay()\n  }),\n  ROAD_WHEEL_CONTACT_HALF_WIDTH',
  'vehicle-presentation time-of-day bridge'
);

const importAnchor="import { createDrivingRuntime } from './driving-runtime.js';";
main=replaceOnce(
  main,
  importAnchor,
  `${importAnchor}\n${environmentImport}`,
  'driving runtime import anchor'
);

for(const legacyPattern of [
  'const DISPLAY_DISTANCE_PROFILES={',
  'function applyDisplayDistanceProfile(',
  "const timeSlider=$('timeSlider'),timeLabel=$('timeLabel');",
  'let timeOfDay=12;',
  'function setTimeOfDay(hour)',
  "timeSlider.addEventListener('input',e=>setTimeOfDay(e.target.value));"
]){
  if(main.includes(legacyPattern)){
    throw new Error(`V21.26 environment refactor: legacy ownership remains in main.js: ${legacyPattern}`);
  }
}

for(const required of [
  'function applyDisplayDistanceProfile(',
  'function setTimeOfDay(hour)',
  'vehicleVisuals.updateAutomaticHeadlights(daylight);',
  'updateMoonSkyPosition();'
]){
  if(!moduleSource.includes(required)){
    throw new Error(`V21.26 environment refactor: generated module lost behavior: ${required}`);
  }
}

if(!main.includes('timeOfDay:getTimeOfDay()')){
  throw new Error('V21.26 environment refactor: vehicle-presentation time-of-day bridge missing.');
}

const tempMain=path.join(root,'tools','__v21_26_environment_main_check__.mjs');
const tempModule=path.join(root,'tools','__v21_26_environment_module_check__.mjs');

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

console.log('V21.26 ENVIRONMENT REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines`);
console.log(`environment-controller.js: ${moduleLinesCount} lines`);
console.log('Extracted: display-distance profiles plus sun/moon/daylight/headlight time-of-day controller.');