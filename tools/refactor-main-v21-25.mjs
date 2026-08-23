import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const cssPath=path.join(root,'src','v21-ui.css');
const syntaxCheckPath=path.join(root,'src','__main_refactor_check__.mjs');

function die(message){
  console.error(`V21.25 main refactor: ${message}`);
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

function range(text,startMarker,endMarker,{includeEnd=false,label='range'}={}){
  const start=text.indexOf(startMarker);
  if(start<0)die(`${label}: start marker not found. No files were changed.`);
  const endStart=text.indexOf(endMarker,start+startMarker.length);
  if(endStart<0)die(`${label}: end marker not found. No files were changed.`);
  const end=includeEnd?endStart+endMarker.length:endStart;
  return {start,end,text:text.slice(start,end)};
}

function extractTemplate(block,assignment,label){
  const marker=`${assignment}=`+'`';
  const start=block.indexOf(marker);
  if(start<0)die(`${label}: CSS template start not found. No files were changed.`);
  const contentStart=start+marker.length;
  const end=block.indexOf('`;',contentStart);
  if(end<0)die(`${label}: CSS template end not found. No files were changed.`);
  return block.slice(contentStart,end);
}

if(!fs.existsSync(mainPath))die('src/main.js not found.');

let main=fs.readFileSync(mainPath,'utf8');
const beforeBytes=Buffer.byteLength(main,'utf8');
const beforeLines=main.split(/\r?\n/).length;

const alreadyRefactored=
  main.includes("from './route-challenge.js'")&&
  main.includes("import './v21-ui.css'")&&
  !main.includes('function installV21BaseStyle(){');

if(alreadyRefactored){
  if(!fs.existsSync(cssPath))die('main.js is already refactored but src/v21-ui.css is missing.');
  console.log('V21.25 main refactor: already applied; nothing to do.');
  process.exit(0);
}

// Validate every structural marker BEFORE touching the working tree.
requireCount(main,"import * as THREE from 'three';",1,'THREE import anchor');
requireCount(main,'// ---------- V21.20.1 desktop Overpass transport ----------',1,'desktop Overpass block');
requireCount(main,'installDesktopOverpassTransport();',1,'desktop Overpass installer call');
requireCount(main,'// Default test route. V4 can replace these coordinates at runtime.',1,'route preset block');
requireCount(main,'const MANIC2=',1,'MANIC2 preset');
requireCount(main,'function installV21BaseStyle(){',1,'V21 UI style injector');
requireCount(main,'installV21BaseStyle();',2,'V21 UI style installer calls');
requireCount(main,"const instrumentClusterStyle=document.createElement('style');",1,'instrument style injector');
requireCount(main,'// ---------- competitive route challenge ----------',1,'route challenge block');
requireCount(main,'const routingService=createRoutingService({',1,'routing service anchor');
requireCount(main,'V21.21.26 alpha · initialisation du monde',1,'legacy boot version');
requireCount(main,"'World Drive V21.21.26'",2,'legacy window/loading title');
requireCount(main,'V21.21.1 ALPHA',1,'legacy menu version');
requireCount(main,"version:'21.24.0-candidate'",1,'legacy WorldDrive facade version');

// Extract CSS exactly as it exists today. This preserves cascade behavior while
// removing several hundred lines of presentation data from the engine module.
const baseStyleRange=range(
  main,
  'function installV21BaseStyle(){',
  'function createV21BootOverlay(){',
  {label:'V21 base style function'}
);
const baseCss=extractTemplate(baseStyleRange.text,'style.textContent','V21 base CSS');

const instrumentStyleRange=range(
  main,
  "const instrumentClusterStyle=document.createElement('style');",
  'document.head.appendChild(instrumentClusterStyle);',
  {includeEnd:true,label:'instrument cluster style block'}
);
const instrumentCss=extractTemplate(
  instrumentStyleRange.text,
  'instrumentClusterStyle.textContent',
  'instrument cluster CSS'
);

const extractedCss=`/* World Drive V21.25 UI\n * Extracted mechanically from main.js. Keep presentation here; keep engine logic in JS.\n */\n${baseCss.trim()}\n\n/* Instrument cluster layout */\n${instrumentCss.trim()}\n`;

// New module dependencies. desktop-overpass-transport installs itself only in
// the Electron renderer, so no platform statement remains in main.js.
const importAnchor="import * as THREE from 'three';\n";
const extractedImports=`import './v21-ui.css';\nimport './desktop-overpass-transport.js';\nimport {\n  MANIC2,\n  MANIC5,\n  R169_START,\n  R169_END,\n  R132_START,\n  R132_END,\n  YUNGAS_START,\n  YUNGAS_END,\n  YUNGAS_WAYPOINTS\n} from './route-presets.js';\nimport { createRouteChallenge } from './route-challenge.js';\nimport {\n  WORLD_DRIVE_VERSION,\n  WORLD_DRIVE_VERSION_LABEL,\n  WORLD_DRIVE_TITLE\n} from './version.js';\n";
main=main.replace(importAnchor,importAnchor+extractedImports);

// 1) Platform-specific Overpass transport.
{
  const block=range(
    main,
    '// ---------- V21.20.1 desktop Overpass transport ----------',
    'installDesktopOverpassTransport();',
    {includeEnd:true,label:'desktop Overpass block'}
  );
  main=main.slice(0,block.start)+main.slice(block.end);
}

// 2) Built-in route data.
{
  const block=range(
    main,
    '// Default test route. V4 can replace these coordinates at runtime.',
    'let ROUTE_START={...MANIC2};',
    {label:'route preset block'}
  );
  main=main.slice(0,block.start)+main.slice(block.end);
}

// 3) CSS injection. CSS was extracted above; only the logic remains.
{
  const block=range(
    main,
    'function installV21BaseStyle(){',
    'function createV21BootOverlay(){',
    {label:'V21 base style function'}
  );
  main=main.slice(0,block.start)+main.slice(block.end);
  main=main.replace(/^\s*installV21BaseStyle\(\);\s*\r?\n/gm,'');
}

// 4) Competitive route challenge state/UI. main.js retains tiny wrappers so
// every existing call site keeps the exact same names.
{
  const block=range(
    main,
    '// ---------- competitive route challenge ----------',
    'const routingService=createRoutingService({',
    {label:'route challenge block'}
  );

  const replacement=`// ---------- competitive route challenge ----------\nconst routeChallenge=createRouteChallenge({\n  getSpeed:()=>speed,\n  getRouteLength:()=>routeLength,\n  toast\n});\nconst resetRunChallenge=()=>routeChallenge.reset();\nconst updateRunChallenge=(onRoad,nr)=>routeChallenge.update(onRoad,nr);\n\n`;

  main=main.slice(0,block.start)+replacement+main.slice(block.end);
}

// 5) Instrument-cluster layout CSS.
{
  const block=range(
    main,
    "const instrumentClusterStyle=document.createElement('style');",
    'document.head.appendChild(instrumentClusterStyle);',
    {includeEnd:true,label:'instrument cluster style block'}
  );
  main=main.slice(0,block.start)+main.slice(block.end);
}

// main.js now uses the centralized version source directly instead of relying
// on version.js's temporary MutationObserver compatibility normalizer.
main=main.replace(
  'V21.21.26 alpha · initialisation du monde',
  '${WORLD_DRIVE_VERSION_LABEL} · initialisation du monde'
);
main=main.replaceAll("'World Drive V21.21.26'",'WORLD_DRIVE_TITLE');
main=main.replace(
  'V21.21.1 ALPHA',
  '${WORLD_DRIVE_VERSION_LABEL.toUpperCase()}'
);
main=main.replace(
  "version:'21.24.0-candidate'",
  'version:WORLD_DRIVE_VERSION'
);

// Post-transform structural assertions.
for(const stale of [
  'function installV21BaseStyle(){',
  "const instrumentClusterStyle=document.createElement('style');",
  'function installDesktopOverpassTransport(){',
  'const MANIC2=',
  'const runChallenge={',
  'V21.21.26',
  'V21.21.1 ALPHA',
  '21.24.0-candidate'
]){
  if(main.includes(stale))die(`post-transform stale block remains: ${stale}. No files were changed.`);
}

for(const required of [
  "import './v21-ui.css';",
  "import './desktop-overpass-transport.js';",
  "from './route-presets.js';",
  "from './route-challenge.js';",
  'WORLD_DRIVE_VERSION_LABEL',
  'const routeChallenge=createRouteChallenge({'
]){
  if(!main.includes(required))die(`post-transform requirement missing: ${required}. No files were changed.`);
}

// Syntax-check the transformed module before replacing main.js. --check parses
// imports without resolving them, which is exactly what we need here.
try{
  fs.writeFileSync(syntaxCheckPath,main,'utf8');
  const checked=spawnSync(process.execPath,['--check',syntaxCheckPath],{
    cwd:root,
    encoding:'utf8'
  });
  if(checked.status!==0){
    die(`transformed main.js failed syntax check:\n${checked.stderr||checked.stdout}`);
  }
}finally{
  try{fs.unlinkSync(syntaxCheckPath);}catch{}
}

// All validation succeeded: now and only now mutate the working tree.
fs.writeFileSync(cssPath,extractedCss,'utf8');
fs.writeFileSync(mainPath,main,'utf8');

const afterBytes=Buffer.byteLength(main,'utf8');
const afterLines=main.split(/\r?\n/).length;
const cssLines=extractedCss.split(/\r?\n/).length;

console.log('V21.25 MAIN REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines (${beforeBytes} -> ${afterBytes} bytes)`);
console.log(`v21-ui.css: ${cssLines} lines extracted`);
console.log('Extracted: desktop Overpass transport, route presets, route challenge, UI CSS.');
console.log('Next: node qa/V21_25_MAIN_REFACTOR_QA.mjs');
