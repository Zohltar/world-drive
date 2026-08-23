import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','instrument-cluster.js');
const mainCheckPath=path.join(root,'src','__main_instrument_refactor_check__.mjs');
const moduleCheckPath=path.join(root,'src','__instrument_cluster_check__.mjs');

function die(message){console.error(`V21.25 instrument refactor: ${message}`);process.exit(1)}
function count(text,needle){let total=0,offset=0;while(true){const index=text.indexOf(needle,offset);if(index<0)return total;total++;offset=index+needle.length}}
function requireCount(text,needle,expected,label=needle){const found=count(text,needle);if(found!==expected)die(`${label}: expected ${expected}, found ${found}. No files were changed.`)}
function range(text,startMarker,endMarker,label){const start=text.indexOf(startMarker);if(start<0)die(`${label}: start marker not found. No files were changed.`);const end=text.indexOf(endMarker,start+startMarker.length);if(end<0)die(`${label}: end marker not found. No files were changed.`);return {start,end,text:text.slice(start,end)}}
function syntaxCheck(filePath,content,label){fs.writeFileSync(filePath,content,'utf8');try{const checked=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});if(checked.status!==0)die(`${label} failed syntax check:\n${checked.stderr||checked.stdout}`)}finally{try{fs.unlinkSync(filePath)}catch{}}}

if(!fs.existsSync(mainPath))die('src/main.js not found.');
let main=fs.readFileSync(mainPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';
const beforeLines=main.split(/\r?\n/).length;
const beforeBytes=Buffer.byteLength(main,'utf8');

const alreadyRefactored=main.includes("from './instrument-cluster.js'")&&main.includes('createInstrumentCluster({')&&!main.includes('// ---------- V20.7 unified instrument cluster ----------');
if(alreadyRefactored){if(!fs.existsSync(modulePath))die('main.js is already refactored but src/instrument-cluster.js is missing.');console.log('V21.25 instrument refactor: already applied; nothing to do.');process.exit(0)}

requireCount(main,"import { createRouteChallenge } from './route-challenge.js';",1,'import anchor');
requireCount(main,'// ---------- V20.7 unified instrument cluster ----------',1,'instrument block');
requireCount(main,'// ---------- compass ----------',1,'compass block');
requireCount(main,'// ---------- transient sign readout on minimap ----------',1,'instrument block end');
requireCount(main,'function drawSpeedometer(){',1,'drawSpeedometer');
requireCount(main,'function drawCompass(){',1,'drawCompass');
requireCount(main,'function setGameControlsHidden(hidden){',1,'setGameControlsHidden');

const endMarker='// ---------- transient sign readout on minimap ----------';
const block=range(main,'// ---------- V20.7 unified instrument cluster ----------',endMarker,'instrument + compass block');
let extracted=block.text;
extracted=extracted.replace('function drawSpeedometer(){',`function drawSpeedometer(){${eol}  syncInstrumentState();`);
extracted=extracted.replace('function drawCompass(){',`function drawCompass(){${eol}  syncInstrumentState();`);
if(count(extracted,'syncInstrumentState();')!==2)die('failed to inject runtime state synchronization. No files were changed.');

const moduleHeader=[
'// World Drive V21.25 — instrument cluster and compass presentation.',
'// Extracted mechanically from main.js. Runtime state stays owned by main.js.',
'',
'export function createInstrumentCluster({',
'  physicsClamp,',
'  activeTransmissionProfile,',
'  effectiveEngineRedlineRpm,',
'  vehicleTopSpeedKmh,',
'  vehicleSystem,',
'  getState',
'}){',
"  if(typeof physicsClamp!=='function')throw new Error('instrument cluster requires physicsClamp');",
"  if(typeof activeTransmissionProfile!=='function')throw new Error('instrument cluster requires activeTransmissionProfile');",
"  if(typeof effectiveEngineRedlineRpm!=='function')throw new Error('instrument cluster requires effectiveEngineRedlineRpm');",
"  if(typeof vehicleTopSpeedKmh!=='function')throw new Error('instrument cluster requires vehicleTopSpeedKmh');",
"  if(!vehicleSystem)throw new Error('instrument cluster requires vehicleSystem');",
"  if(typeof getState!=='function')throw new Error('instrument cluster requires getState');",
'',
'  const $=id=>document.getElementById(id);',
'',
'  let currentOnPavementForInstruments=true;',
'  let engineRpm=0;',
'  let speed=0;',
'  let transmissionShifting=false;',
'  let transmissionGear=1;',
'  let revLimiterActive=false;',
"  let transmissionMode='automatic';",
'  let heading=0;',
'',
'  function syncInstrumentState(){',
'    const state=getState()||{};',
'    currentOnPavementForInstruments=!!state.currentOnPavementForInstruments;',
'    engineRpm=Number(state.engineRpm)||0;',
'    speed=Number(state.speed)||0;',
'    transmissionShifting=!!state.transmissionShifting;',
'    const requestedGear=Number(state.transmissionGear);',
'    transmissionGear=Number.isFinite(requestedGear)?requestedGear:1;',
'    revLimiterActive=!!state.revLimiterActive;',
"    transmissionMode=state.transmissionMode==='manual'?'manual':'automatic';",
'    heading=Number(state.heading)||0;',
'  }',
''
].join(eol);
const moduleFooter=['','  return Object.freeze({','    setGameControlsHidden,','    drawSpeedometer,','    drawCompass','  });','}','',''].join(eol);
const moduleContent=moduleHeader+extracted+moduleFooter;

const importAnchor="import { createRouteChallenge } from './route-challenge.js';";
main=main.replace(importAnchor,importAnchor+eol+"import { createInstrumentCluster } from './instrument-cluster.js';");

const replacement=[
'// ---------- instrument cluster + compass ----------',
'const instrumentCluster=createInstrumentCluster({',
'  physicsClamp,',
'  activeTransmissionProfile,',
'  effectiveEngineRedlineRpm,',
'  vehicleTopSpeedKmh,',
'  vehicleSystem,',
'  getState:()=>({',
'    currentOnPavementForInstruments,',
'    engineRpm,',
'    speed,',
'    transmissionShifting,',
'    transmissionGear,',
'    revLimiterActive,',
'    transmissionMode,',
'    heading',
'  })',
'});',
'const {',
'  setGameControlsHidden,',
'  drawSpeedometer,',
'  drawCompass',
'}=instrumentCluster;',
'',
endMarker
].join(eol);
main=main.slice(0,block.start)+replacement+main.slice(block.end+endMarker.length);

for(const stale of ['// ---------- V20.7 unified instrument cluster ----------','function drawGaugeBezel(','function drawTachometer(','function drawSpeedGauge(','function rebuildCompassTape(','function headingDeg()']){if(main.includes(stale))die(`post-transform stale instrument code remains: ${stale}. No files were changed.`)}
for(const required of ["from './instrument-cluster.js'",'const instrumentCluster=createInstrumentCluster({','currentOnPavementForInstruments,','drawSpeedometer,','drawCompass']){if(!main.includes(required))die(`post-transform integration missing: ${required}. No files were changed.`)}
for(const required of ['export function createInstrumentCluster({','function drawSpeedometer(){','function drawCompass(){','syncInstrumentState();','return Object.freeze({']){if(!moduleContent.includes(required))die(`generated instrument module missing: ${required}. No files were changed.`)}

syntaxCheck(mainCheckPath,main,'transformed main.js');
syntaxCheck(moduleCheckPath,moduleContent,'generated instrument-cluster.js');
fs.writeFileSync(modulePath,moduleContent,'utf8');
fs.writeFileSync(mainPath,main,'utf8');

const afterLines=main.split(/\r?\n/).length;
const afterBytes=Buffer.byteLength(main,'utf8');
const moduleLines=moduleContent.split(/\r?\n/).length;
console.log('V21.25 INSTRUMENT REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines (${beforeBytes} -> ${afterBytes} bytes)`);
console.log(`instrument-cluster.js: ${moduleLines} lines extracted`);
console.log('Extracted: speedometer/instrument cluster, controls visibility, compass.');
console.log('Next: node qa/V21_25_INSTRUMENT_REFACTOR_QA.mjs');
