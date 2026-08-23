import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','minimap.js');
const mainCheckPath=path.join(root,'src','__main_minimap_refactor_check__.mjs');
const moduleCheckPath=path.join(root,'src','__minimap_check__.mjs');

function die(message){
  console.error(`V21.25 minimap refactor: ${message}`);
  process.exit(1);
}

function count(text,needle){
  let total=0;
  let offset=0;
  while(true){
    const index=text.indexOf(needle,offset);
    if(index<0)return total;
    total++;
    offset=index+needle.length;
  }
}

function requireCount(text,needle,expected,label=needle){
  const found=count(text,needle);
  if(found!==expected){
    die(`${label}: expected ${expected}, found ${found}. No files were changed.`);
  }
}

function range(text,startMarker,endMarker,label){
  const start=text.indexOf(startMarker);
  if(start<0)die(`${label}: start marker not found. No files were changed.`);
  const end=text.indexOf(endMarker,start+startMarker.length);
  if(end<0)die(`${label}: end marker not found. No files were changed.`);
  return {start,end,text:text.slice(start,end)};
}

function syntaxCheck(filePath,content,label){
  fs.writeFileSync(filePath,content,'utf8');
  try{
    const checked=spawnSync(process.execPath,['--check',filePath],{
      cwd:root,
      encoding:'utf8'
    });
    if(checked.status!==0){
      die(`${label} failed syntax check:\n${checked.stderr||checked.stdout}`);
    }
  }finally{
    try{fs.unlinkSync(filePath);}catch{}
  }
}

if(!fs.existsSync(mainPath))die('src/main.js not found.');

let main=fs.readFileSync(mainPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';
const beforeLines=main.split(/\r?\n/).length;
const beforeBytes=Buffer.byteLength(main,'utf8');

const alreadyRefactored=
  main.includes("from './minimap.js'")&&
  main.includes('createMinimapSystem({')&&
  !main.includes('// ---------- transient sign readout on minimap ----------');

if(alreadyRefactored){
  if(!fs.existsSync(modulePath)){
    die('main.js is already refactored but src/minimap.js is missing.');
  }
  console.log('V21.25 minimap refactor: already applied; nothing to do.');
  process.exit(0);
}

requireCount(main,"import { createInstrumentCluster } from './instrument-cluster.js';",1,'instrument import anchor');
requireCount(main,'// ---------- transient sign readout on minimap ----------',1,'sign readout block');
requireCount(main,'// ---------- minimap ----------',1,'minimap block');
requireCount(main,'// ---------- directional world prefetch ----------',1,'minimap block end');
requireCount(main,'function updatePassedSignReadout(nr){',1,'updatePassedSignReadout');
requireCount(main,'function prepMap(){',1,'prepMap');
requireCount(main,'function drawMap(cum=0){',1,'drawMap');

const startMarker='// ---------- transient sign readout on minimap ----------';
const endMarker='// ---------- directional world prefetch ----------';
const block=range(main,startMarker,endMarker,'sign readout + minimap block');

let extracted=block.text;
extracted=extracted.replace(
  'function updatePassedSignReadout(nr){',
  `function updatePassedSignReadout(nr){${eol}  syncMinimapState();`
);
extracted=extracted.replace(
  'function prepMap(){',
  `function prepMap(){${eol}  syncMinimapState();`
);
extracted=extracted.replace(
  'function drawMap(cum=0){',
  `function drawMap(cum=0){${eol}  syncMinimapState();`
);

if(count(extracted,'syncMinimapState();')!==3){
  die('failed to inject minimap state synchronization. No files were changed.');
}

const moduleHeader=[
  '// World Drive V21.25 — minimap and transient road-sign readout.',
  '// Extracted mechanically from main.js. Runtime route/sign state remains owned by main.js.',
  '',
  'export function createMinimapSystem({',
  '  routePointAt,',
  '  multiplayer,',
  '  llToXZ,',
  '  getState',
  '}){',
  "  if(typeof routePointAt!=='function')throw new Error('minimap requires routePointAt');",
  "  if(!multiplayer||typeof multiplayer.getPeers!=='function')throw new Error('minimap requires multiplayer');",
  "  if(typeof llToXZ!=='function')throw new Error('minimap requires llToXZ');",
  "  if(typeof getState!=='function')throw new Error('minimap requires getState');",
  '',
  "  const $=id=>document.getElementById(id);",
  '  let route=[];',
  '  let routeLength=0;',
  '  let geographicSigns=[];',
  "  let ROUTE_START={name:'Départ'};",
  "  let ROUTE_END={name:'Arrivée'};",
  '',
  '  function syncMinimapState(){',
  '    const state=getState()||{};',
  '    route=Array.isArray(state.route)?state.route:[];',
  '    routeLength=Number(state.routeLength)||0;',
  '    geographicSigns=Array.isArray(state.geographicSigns)?state.geographicSigns:[];',
  "    ROUTE_START=state.routeStart||{name:'Départ'};",
  "    ROUTE_END=state.routeEnd||{name:'Arrivée'};",
  '  }',
  ''
].join(eol);

const moduleFooter=[
  '',
  '  return Object.freeze({',
  '    prepMap,',
  '    drawMap,',
  '    updatePassedSignReadout',
  '  });',
  '}',
  '',
  ''
].join(eol);

const moduleContent=moduleHeader+extracted+moduleFooter;

const replacement=[
  '// ---------- minimap + transient sign readout ----------',
  'const minimapSystem=createMinimapSystem({',
  '  routePointAt,',
  '  multiplayer,',
  '  llToXZ,',
  '  getState:()=>({',
  '    route,',
  '    routeLength,',
  '    geographicSigns,',
  '    routeStart:ROUTE_START,',
  '    routeEnd:ROUTE_END',
  '  })',
  '});',
  'const {',
  '  prepMap,',
  '  drawMap,',
  '  updatePassedSignReadout',
  '}=minimapSystem;',
  '',
  endMarker
].join(eol);

// Replace the large block before inserting imports so the original offsets stay valid.
main=main.slice(0,block.start)+replacement+main.slice(block.end+endMarker.length);

const importAnchor="import { createInstrumentCluster } from './instrument-cluster.js';";
main=main.replace(
  importAnchor,
  importAnchor+eol+"import { createMinimapSystem } from './minimap.js';"
);

for(const stale of [
  '// ---------- transient sign readout on minimap ----------',
  '// ---------- minimap ----------',
  'const signReadout={',
  "const mc=$('minimap')",
  'function signDisplayCum(',
  'function signReadoutText(',
  'function updatePassedSignReadout(nr){',
  'function prepMap(){',
  'function drawMap(cum=0){'
]){
  if(main.includes(stale)){
    die(`post-transform stale minimap code remains: ${stale}. No files were changed.`);
  }
}

for(const required of [
  "from './minimap.js'",
  'const minimapSystem=createMinimapSystem({',
  'routeStart:ROUTE_START,',
  'routeEnd:ROUTE_END',
  'prepMap,',
  'drawMap,',
  'updatePassedSignReadout'
]){
  if(!main.includes(required)){
    die(`post-transform minimap integration missing: ${required}. No files were changed.`);
  }
}

for(const required of [
  'export function createMinimapSystem({',
  'function syncMinimapState(){',
  'function updatePassedSignReadout(nr){',
  'function prepMap(){',
  'function drawMap(cum=0){',
  'return Object.freeze({'
]){
  if(!moduleContent.includes(required)){
    die(`generated minimap module missing: ${required}. No files were changed.`);
  }
}

syntaxCheck(mainCheckPath,main,'transformed main.js');
syntaxCheck(moduleCheckPath,moduleContent,'generated minimap.js');

// All validation passed. Mutate the working tree only now.
fs.writeFileSync(modulePath,moduleContent,'utf8');
fs.writeFileSync(mainPath,main,'utf8');

const afterLines=main.split(/\r?\n/).length;
const afterBytes=Buffer.byteLength(main,'utf8');
const moduleLines=moduleContent.split(/\r?\n/).length;

console.log('V21.25 MINIMAP REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines (${beforeBytes} -> ${afterBytes} bytes)`);
console.log(`minimap.js: ${moduleLines} lines extracted`);
console.log('Extracted: minimap rendering, LAN peer markers, transient sign readout.');
console.log('Next: node qa/V21_25_MINIMAP_REFACTOR_QA.mjs');
