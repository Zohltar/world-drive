import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','road-furniture.js');
const mainCheck=path.join(root,'src','__main_road_furniture_check__.mjs');
const moduleCheck=path.join(root,'src','__road_furniture_check__.mjs');

function die(message){
  console.error(`V21.25 road-furniture refactor: ${message}`);
  process.exit(1);
}
function count(text,needle){
  return text.split(needle).length-1;
}
function syntaxCheck(filePath,content,label){
  fs.writeFileSync(filePath,content,'utf8');
  try{
    const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
    if(result.status!==0)die(`${label} syntax check failed:\n${result.stderr||result.stdout}`);
  }finally{
    try{fs.unlinkSync(filePath);}catch{}
  }
}

if(!fs.existsSync(mainPath))die('src/main.js missing.');
let main=fs.readFileSync(mainPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';
const beforeLines=main.split(/\r?\n/).length;

const already=
  main.includes("from './road-furniture.js'")&&
  main.includes('createRoadFurnitureSystem({')&&
  !main.includes('// ---------- V5.1.2 signs + enhanced bridge furniture ----------');
if(already){
  if(!fs.existsSync(modulePath))die('main.js references road-furniture.js but the module is missing.');
  console.log('V21.25 road-furniture refactor: already applied; nothing to do.');
  process.exit(0);
}

const startMarker='// ---------- V5.1.2 signs + enhanced bridge furniture ----------';
const endMarker='// Build only a corridor around the current location, preserving every source polyline curve.';
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start+startMarker.length);
if(start<0||end<0)die('road furniture block markers not found. No files changed.');

for(const required of [
  'function makeSignTexture(',
  'function addRoadSignAt(',
  'function addBridgeRailFromProfile(',
  'function addEnhancedBridgeFurniture(){',
  'function addCurrentRoadSigns(){',
  'function refreshRoadSignsOnly(){'
]){
  if(!main.slice(start,end).includes(required))die(`expected road furniture member missing: ${required}. No files changed.`);
}

const block=main.slice(start,end);
const module=[
  '// World Drive V21.25 — road furniture presentation.',
  '// Owns visible road signs and enhanced bridge furniture; route/physics state stays in main.js.',
  '',
  'export function createRoadFurnitureSystem({',
  '  THREE,',
  '  signGroup,',
  '  infrastructureGroup,',
  '  routePointAtCum,',
  '  bridgeHeightAtCum,',
  '  roadHeightAt,',
  '  terrainAbs,',
  '  nearestRoute,',
  '  resetStaticGroupOrigin,',
  '  clearGroup,',
  '  freezeStaticMatrices,',
  '  addGeographicRoadSigns,',
  '  getState,',
  '  setRoadGuideSign',
  '}){',
  "  if(!THREE)throw new Error('road furniture requires THREE');",
  "  if(!signGroup||!infrastructureGroup)throw new Error('road furniture requires scene groups');",
  "  if(typeof getState!=='function')throw new Error('road furniture requires getState');",
  '',
  '  let activeRoadProfile=[];',
  '  let bridgeSpans=[];',
  '  let worldOffset={x:0,z:0};',
  '  let activeRoadMeta={confidence:0,ref:null,name:null};',
  '  let absX=0,absZ=0,routeLength=0;',
  '  let currentRoadGuideSign=null;',
  '',
  '  function syncState(){',
  '    const state=getState()||{};',
  '    activeRoadProfile=Array.isArray(state.activeRoadProfile)?state.activeRoadProfile:[];',
  '    bridgeSpans=Array.isArray(state.bridgeSpans)?state.bridgeSpans:[];',
  '    worldOffset=state.worldOffset||worldOffset;',
  '    activeRoadMeta=state.activeRoadMeta||activeRoadMeta;',
  '    absX=Number(state.absX)||0;',
  '    absZ=Number(state.absZ)||0;',
  '    routeLength=Math.max(0,Number(state.routeLength)||0);',
  '  }',
  '',
  block,
  '',
  '  return Object.freeze({',
  '    addRoadSignAt(...args){',
  '      syncState();',
  '      return addRoadSignAt(...args);',
  '    },',
  '    addEnhancedBridgeFurniture(){',
  '      syncState();',
  '      return addEnhancedBridgeFurniture();',
  '    },',
  '    refreshRoadSignsOnly(){',
  '      syncState();',
  '      const result=refreshRoadSignsOnly();',
  '      setRoadGuideSign?.(currentRoadGuideSign);',
  '      return result;',
  '    }',
  '  });',
  '}',
  ''
].join(eol);

const replacement=[
  '// ---------- road furniture facade ----------',
  'const roadFurniture=createRoadFurnitureSystem({',
  '  THREE,',
  '  signGroup,',
  '  infrastructureGroup,',
  '  routePointAtCum,',
  '  bridgeHeightAtCum,',
  '  roadHeightAt,',
  '  terrainAbs,',
  '  nearestRoute,',
  '  resetStaticGroupOrigin,',
  '  clearGroup,',
  '  freezeStaticMatrices,',
  '  addGeographicRoadSigns:()=>addGeographicRoadSigns(),',
  '  getState:()=>({',
  '    activeRoadProfile,',
  '    bridgeSpans,',
  '    worldOffset,',
  '    activeRoadMeta,',
  '    absX,',
  '    absZ,',
  '    routeLength',
  '  }),',
  '  setRoadGuideSign:value=>{currentRoadGuideSign=value;}',
  '});',
  'const addRoadSignAt=(...args)=>roadFurniture.addRoadSignAt(...args);',
  'const addEnhancedBridgeFurniture=()=>roadFurniture.addEnhancedBridgeFurniture();',
  'const refreshRoadSignsOnly=()=>roadFurniture.refreshRoadSignsOnly();',
  '',
  endMarker
].join(eol);

main=main.slice(0,start)+replacement+main.slice(end+endMarker.length);

const importAnchor="import { createMinimapSystem } from './minimap.js';";
if(count(main,importAnchor)!==1)die('minimap import anchor missing/duplicated. No files changed.');
main=main.replace(importAnchor,importAnchor+eol+"import { createRoadFurnitureSystem } from './road-furniture.js';");

// Remove the long-disabled bridge deck compatibility stub if it is truly orphaned.
const deprecatedBridge=/\nfunction addBridgeStructures\(\)\{\s*\/\/ Deprecated visual deck layer remains disabled: road ribbon is the ONLY roadway\.\s*return;\s*\}\s*\n/;
if(count(main,'addBridgeStructures(')===1&&deprecatedBridge.test(main)){
  main=main.replace(deprecatedBridge,eol);
}

for(const stale of [
  startMarker,
  'const signPoleMat=',
  'const bridgeRailMat=',
  'function makeSignTexture(',
  'function addBridgeRailFromProfile(',
  'function addCurrentRoadSigns(){'
]){
  if(main.includes(stale))die(`stale road furniture implementation remains in main.js: ${stale}. No files changed.`);
}
for(const required of [
  "from './road-furniture.js'",
  'const roadFurniture=createRoadFurnitureSystem({',
  'const addRoadSignAt=(...args)=>roadFurniture.addRoadSignAt(...args);',
  'const addEnhancedBridgeFurniture=()=>roadFurniture.addEnhancedBridgeFurniture();',
  'const refreshRoadSignsOnly=()=>roadFurniture.refreshRoadSignsOnly();'
]){
  if(!main.includes(required))die(`main road furniture facade missing: ${required}. No files changed.`);
}
for(const required of [
  'export function createRoadFurnitureSystem({',
  'function makeSignTexture(',
  'function addRoadSignAt(',
  'function addEnhancedBridgeFurniture(){',
  'function refreshRoadSignsOnly(){',
  'setRoadGuideSign?.(currentRoadGuideSign);'
]){
  if(!module.includes(required))die(`road-furniture.js generation missing: ${required}. No files changed.`);
}

syntaxCheck(mainCheck,main,'transformed main.js');
syntaxCheck(moduleCheck,module,'generated road-furniture.js');

fs.writeFileSync(modulePath,module,'utf8');
fs.writeFileSync(mainPath,main,'utf8');

const afterLines=main.split(/\r?\n/).length;
console.log('V21.25 ROAD FURNITURE REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines`);
console.log(`road-furniture.js: ${module.split(/\r?\n/).length} lines`);
console.log('Extracted: road signs, road-name guide rendering, bridge rails/underside/fascias/piers.');