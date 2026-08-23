import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const plannerPath=path.join(root,'src','route-planner-ui.js');

const raw=fs.readFileSync(mainPath,'utf8');
const eol=raw.includes('\r\n')?'\r\n':'\n';
let main=raw.replace(/\r\n/g,'\n');

const plannerImport="import { createRoutePlannerUi } from './route-planner-ui.js';";

if(main.includes(plannerImport)&&fs.existsSync(plannerPath)){
  console.log('V21.26 ROUTE PLANNER REFACTOR: already applied');
  process.exit(0);
}
if(main.includes(plannerImport)||fs.existsSync(plannerPath)){
  throw new Error('V21.26 route planner refactor: partial previous application detected. Restore the branch before retrying.');
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`V21.26 route planner refactor: ${label} not found. No files changed.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    throw new Error(`V21.26 route planner refactor: ${label} is ambiguous. No files changed.`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

const startMarker='// ---------- human-friendly place search ----------';
const endMarker="document.querySelectorAll('.sectionHead').forEach";
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start);

if(start<0||end<0||end<=start){
  throw new Error('V21.26 route planner refactor: planner block markers not found. No files changed.');
}

const legacyBlock=main.slice(start,end);
for(const required of [
  'let selectedStart={...MANIC2};',
  'function setSelectedPlace(which,p)',
  'async function searchPlaceField(which)',
  "$('buildRouteBtn').addEventListener('click',async()=>{",
  'function applyPreset(start,end,waypoints=[])',
  "button.id='presetYungasBtn'"
]){
  if(!legacyBlock.includes(required)){
    throw new Error(`V21.26 route planner refactor: expected planner behavior missing: ${required}. No files changed.`);
  }
}

const moduleBody=legacyBlock
  .replace(/\bdocument\./g,'documentRef.')
  .trimEnd();

const dependencyNames=[
  '$',
  'documentRef',
  'geocodingService',
  'createRequestedRoute',
  'toast',
  'MANIC2',
  'MANIC5',
  'R169_START',
  'R169_END',
  'R132_START',
  'R132_END',
  'YUNGAS_START',
  'YUNGAS_END',
  'YUNGAS_WAYPOINTS'
];

const moduleLines=[];
moduleLines.push('export function createRoutePlannerUi({');
for(const name of dependencyNames)moduleLines.push(`  ${name},`);
moduleLines.push('}){');
for(const line of moduleBody.split('\n'))moduleLines.push(`  ${line}`);
moduleLines.push('');
moduleLines.push('  return {');
moduleLines.push('    setSelectedPlace,');
moduleLines.push('    renderSearchResults,');
moduleLines.push('    searchPlaceField,');
moduleLines.push('    applyPreset,');
moduleLines.push('    getSelection:()=>({');
moduleLines.push('      start:{...selectedStart},');
moduleLines.push('      end:{...selectedEnd}');
moduleLines.push('    })');
moduleLines.push('  };');
moduleLines.push('}');
moduleLines.push('');
const plannerSource=moduleLines.join('\n');

const initLines=[];
initLines.push('// ---------- route planner UI facade ----------');
initLines.push('const routePlannerUi=createRoutePlannerUi({');
initLines.push('  $,');
initLines.push('  documentRef:document,');
initLines.push('  geocodingService,');
initLines.push('  createRequestedRoute,');
initLines.push('  toast,');
initLines.push('  MANIC2,');
initLines.push('  MANIC5,');
initLines.push('  R169_START,');
initLines.push('  R169_END,');
initLines.push('  R132_START,');
initLines.push('  R132_END,');
initLines.push('  YUNGAS_START,');
initLines.push('  YUNGAS_END,');
initLines.push('  YUNGAS_WAYPOINTS');
initLines.push('});');
initLines.push('');

// Replace the planner block BEFORE adding an import. The source indices above
// are relative to the untouched main.js; inserting text earlier would shift
// them and could cut the file at the wrong character boundary.
main=main.slice(0,start)+initLines.join('\n')+main.slice(end);

const importAnchor="import { createRouteChallenge } from './route-challenge.js';";
main=replaceOnce(
  main,
  importAnchor,
  `${importAnchor}\n${plannerImport}`,
  'route challenge import anchor'
);

for(const legacyPattern of [
  'let selectedStart={...MANIC2};',
  'function setSelectedPlace(which,p)',
  'async function searchPlaceField(which)',
  "$('buildRouteBtn').addEventListener('click',async()=>{",
  'function applyPreset(start,end,waypoints=[])',
  "button.id='presetYungasBtn'"
]){
  if(main.includes(legacyPattern)){
    throw new Error(`V21.26 route planner refactor: legacy planner ownership remains in main.js: ${legacyPattern}`);
  }
}

if(!plannerSource.includes('async function searchPlaceField(which)')){
  throw new Error('V21.26 route planner refactor: generated module lost place search behavior.');
}
if(!plannerSource.includes("$('buildRouteBtn').addEventListener('click',async()=>{")){
  throw new Error('V21.26 route planner refactor: generated module lost route build behavior.');
}
if(!plannerSource.includes("button.id='presetYungasBtn'")){
  throw new Error('V21.26 route planner refactor: generated module lost Yungas preset behavior.');
}

const tempMain=path.join(root,'tools','__v21_26_route_planner_main_check__.mjs');
const tempPlanner=path.join(root,'tools','__v21_26_route_planner_module_check__.mjs');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){
    throw new Error(`Syntax check failed for ${path.basename(file)}:\n${result.stderr||result.stdout}`);
  }
}

try{
  fs.writeFileSync(tempMain,main,'utf8');
  fs.writeFileSync(tempPlanner,plannerSource,'utf8');
  syntaxCheck(tempMain);
  syntaxCheck(tempPlanner);
}finally{
  fs.rmSync(tempMain,{force:true});
  fs.rmSync(tempPlanner,{force:true});
}

const outputMain=eol==='\n'?main:main.replace(/\n/g,eol);
const outputPlanner=eol==='\n'?plannerSource:plannerSource.replace(/\n/g,eol);

fs.writeFileSync(plannerPath,outputPlanner,'utf8');
fs.writeFileSync(mainPath,outputMain,'utf8');

const beforeLines=raw.split(/\r?\n/).length;
const afterLines=outputMain.split(/\r?\n/).length;
const plannerLines=outputPlanner.split(/\r?\n/).length;

console.log('V21.26 ROUTE PLANNER REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines`);
console.log(`route-planner-ui.js: ${plannerLines} lines`);
console.log('Extracted: place search, start/end selection, waypoint resolution, route build actions and route presets.');