import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','road-geometry.js');
const mainCheck=path.join(root,'src','__main_road_geometry_check__.mjs');
const moduleCheck=path.join(root,'src','__road_geometry_check__.mjs');

function die(message){
  console.error(`V21.25 road-geometry refactor: ${message}`);
  process.exit(1);
}
function count(text,needle){return text.split(needle).length-1;}
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
const beforeBytes=Buffer.byteLength(main,'utf8');

const already=
  main.includes("from './road-geometry.js'")&&
  main.includes('createRoadGeometrySystem({')&&
  !main.includes('// ---------- continuous road ribbon ----------');
if(already){
  if(!fs.existsSync(modulePath))die('main.js references road-geometry.js but the module is missing.');
  console.log('V21.25 road-geometry refactor: already applied; nothing to do.');
  process.exit(0);
}

const startMarker='// ---------- continuous road ribbon ----------';
const endMarker='function terrainFrameAt(x,z,heading){';
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start+startMarker.length);
if(start<0||end<0)die('road geometry block markers not found. No files changed.');

let block=main.slice(start,end);
for(const required of [
  'function roadLateralFrame(points,i){',
  'function buildLateralBand(',
  'function buildRibbon(',
  'function buildOffsetRibbon(',
  'function buildRoadVolume(profile){',
  'function buildRoadProfile(){',
  'let activeRoadProfile=[];',
  'function rebuildRoadProfileSpatialIndex(){',
  'function roadFrameAt(x,z,out=null){',
  'function roadProfileFrameAtCum(cum,out=null){',
  'function roadHeightAt(x,z){',
  'function roadSurfaceAt(x,z,out=null){'
]){
  if(!block.includes(required))die(`expected road geometry member missing: ${required}. No files changed.`);
}

// The extracted module owns one stable profile array. Main and presentation
// systems keep a reference to this array while setProfile()/clearProfile()
// mutate its contents, avoiding stale references across streamed rebuilds.
block=block.replace('let activeRoadProfile=[];','const activeRoadProfile=[];');
if(!block.includes('const activeRoadProfile=[];')){
  die('failed to convert activeRoadProfile to stable module storage. No files changed.');
}

const moduleHeader=[
  '// World Drive V21.25 — road profile, surface queries and visible road mesh geometry.',
  '// Owns local road-profile/index state; main.js remains the world/physics orchestrator.',
  '',
  'export function createRoadGeometrySystem({',
  '  THREE,',
  '  roadEdgeMat,',
  '  roadUnderMat,',
  '  ROAD_SURFACE_OFFSET,',
  '  terrainAbs,',
  '  nearestRoute,',
  '  bridgeHeightAtCum,',
  '  bridgeManager,',
  '  getState',
  '}){',
  "  if(!THREE)throw new Error('road geometry requires THREE');",
  "  if(typeof terrainAbs!=='function')throw new Error('road geometry requires terrainAbs');",
  "  if(typeof nearestRoute!=='function')throw new Error('road geometry requires nearestRoute');",
  "  if(typeof bridgeHeightAtCum!=='function')throw new Error('road geometry requires bridgeHeightAtCum');",
  "  if(!bridgeManager||typeof bridgeManager.isNearApproach!=='function')throw new Error('road geometry requires bridgeManager');",
  "  if(typeof getState!=='function')throw new Error('road geometry requires getState');",
  '',
  '  let absX=0;',
  '  let absZ=0;',
  '  let routeLength=0;',
  '  let segments=[];',
  '  let worldOffset={x:0,z:0};',
  '',
  '  function syncState(){',
  '    const state=getState()||{};',
  '    absX=Number(state.absX)||0;',
  '    absZ=Number(state.absZ)||0;',
  '    routeLength=Math.max(0,Number(state.routeLength)||0);',
  '    segments=Array.isArray(state.segments)?state.segments:[];',
  '    worldOffset=state.worldOffset||worldOffset;',
  '  }',
  ''
].join(eol);

const moduleFooter=[
  '',
  '  function setProfile(nextProfile){',
  '    activeRoadProfile.length=0;',
  '    if(Array.isArray(nextProfile)){',
  '      for(const point of nextProfile)activeRoadProfile.push(point);',
  '    }',
  '    rebuildRoadProfileSpatialIndex();',
  '    return activeRoadProfile;',
  '  }',
  '',
  '  function clearProfile(){',
  '    activeRoadProfile.length=0;',
  '    rebuildRoadProfileSpatialIndex();',
  '  }',
  '',
  '  return Object.freeze({',
  '    profile:activeRoadProfile,',
  '    buildProfile(){syncState();return buildRoadProfile();},',
  '    setProfile,',
  '    clearProfile,',
  '    rebuildIndex:rebuildRoadProfileSpatialIndex,',
  '    buildLateralBand(...args){syncState();return buildLateralBand(...args);},',
  '    buildRibbon(...args){syncState();return buildRibbon(...args);},',
  '    buildOffsetRibbon(...args){syncState();return buildOffsetRibbon(...args);},',
  '    buildRoadVolume(...args){syncState();return buildRoadVolume(...args);},',
  '    roadFrameAt,',
  '    roadProfileFrameAtCum,',
  '    roadHeightAt,',
  '    roadSurfaceAt',
  '  });',
  '}',
  ''
].join(eol);

const module=moduleHeader+block+moduleFooter;

const replacement=[
  '// ---------- road geometry facade ----------',
  'const roadGeometry=createRoadGeometrySystem({',
  '  THREE,',
  '  roadEdgeMat,',
  '  roadUnderMat,',
  '  ROAD_SURFACE_OFFSET,',
  '  terrainAbs,',
  '  nearestRoute,',
  '  bridgeHeightAtCum,',
  '  bridgeManager,',
  '  getState:()=>({absX,absZ,routeLength,segments,worldOffset})',
  '});',
  'const activeRoadProfile=roadGeometry.profile;',
  'const buildRoadProfile=()=>roadGeometry.buildProfile();',
  'const setActiveRoadProfile=profile=>roadGeometry.setProfile(profile);',
  'const clearActiveRoadProfile=()=>roadGeometry.clearProfile();',
  'const rebuildRoadProfileSpatialIndex=()=>roadGeometry.rebuildIndex();',
  'const buildLateralBand=(...args)=>roadGeometry.buildLateralBand(...args);',
  'const buildRibbon=(...args)=>roadGeometry.buildRibbon(...args);',
  'const buildOffsetRibbon=(...args)=>roadGeometry.buildOffsetRibbon(...args);',
  'const buildRoadVolume=(...args)=>roadGeometry.buildRoadVolume(...args);',
  'const roadFrameAt=(...args)=>roadGeometry.roadFrameAt(...args);',
  'const roadProfileFrameAtCum=(...args)=>roadGeometry.roadProfileFrameAtCum(...args);',
  'const roadHeightAt=(...args)=>roadGeometry.roadHeightAt(...args);',
  'const roadSurfaceAt=(...args)=>roadGeometry.roadSurfaceAt(...args);',
  '',
  endMarker
].join(eol);

main=main.slice(0,start)+replacement+main.slice(end+endMarker.length);

// Streamed world rebuilds now update the stable module profile rather than
// replacing main.js ownership. Keep the local `profile` variable for terrain
// road-bed and visible mesh construction so behavior is byte-for-byte equivalent.
const setProfilePattern=/const profile=buildRoadProfile\(\);\s*activeRoadProfile=profile;\s*rebuildRoadProfileSpatialIndex\(\);/;
if(!setProfilePattern.test(main)){
  die('active road profile assignment site not found. No files changed.');
}
main=main.replace(
  setProfilePattern,
  `const profile=buildRoadProfile();${eol} setActiveRoadProfile(profile);`
);

const clearProfilePattern=/activeRoadProfile=\[\];\s*rebuildRoadProfileSpatialIndex\(\);/;
if(!clearProfilePattern.test(main)){
  die('active road profile reset site not found. No files changed.');
}
main=main.replace(clearProfilePattern,'clearActiveRoadProfile();');

const preferredImport="import { createRoadFurnitureSystem } from './road-furniture.js';";
const fallbackImport="import { createMinimapSystem } from './minimap.js';";
const importAnchor=main.includes(preferredImport)?preferredImport:fallbackImport;
if(count(main,importAnchor)!==1)die('road geometry import anchor missing/duplicated. No files changed.');
main=main.replace(importAnchor,importAnchor+eol+"import { createRoadGeometrySystem } from './road-geometry.js';");

for(const stale of [
  startMarker,
  'function roadLateralFrame(points,i){',
  'function buildRoadProfile(){',
  'const ROAD_PROFILE_INDEX_CELL=48;',
  'function evaluateRoadProfileSegmentInto(',
  'activeRoadProfile=profile;',
  'activeRoadProfile=[];'
]){
  if(main.includes(stale))die(`stale road geometry implementation remains in main.js: ${stale}. No files changed.`);
}

for(const required of [
  "from './road-geometry.js'",
  'const roadGeometry=createRoadGeometrySystem({',
  'const activeRoadProfile=roadGeometry.profile;',
  'const buildRoadProfile=()=>roadGeometry.buildProfile();',
  'const buildRibbon=(...args)=>roadGeometry.buildRibbon(...args);',
  'const roadFrameAt=(...args)=>roadGeometry.roadFrameAt(...args);',
  'setActiveRoadProfile(profile);',
  'clearActiveRoadProfile();',
  'function terrainFrameAt(x,z,heading){'
]){
  if(!main.includes(required))die(`main road geometry facade missing: ${required}. No files changed.`);
}

for(const required of [
  'export function createRoadGeometrySystem({',
  'const activeRoadProfile=[];',
  'function buildRoadProfile(){',
  'function rebuildRoadProfileSpatialIndex(){',
  'function roadFrameAt(x,z,out=null){',
  'function roadProfileFrameAtCum(cum,out=null){',
  'function roadSurfaceAt(x,z,out=null){',
  'function setProfile(nextProfile){',
  'profile:activeRoadProfile'
]){
  if(!module.includes(required))die(`road-geometry.js generation missing: ${required}. No files changed.`);
}

syntaxCheck(mainCheck,main,'transformed main.js');
syntaxCheck(moduleCheck,module,'generated road-geometry.js');

// All structural and syntax checks passed. Only now mutate the working tree.
fs.writeFileSync(modulePath,module,'utf8');
fs.writeFileSync(mainPath,main,'utf8');

const afterLines=main.split(/\r?\n/).length;
const afterBytes=Buffer.byteLength(main,'utf8');
console.log('V21.25 ROAD GEOMETRY REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines (${beforeBytes} -> ${afterBytes} bytes)`);
console.log(`road-geometry.js: ${module.split(/\r?\n/).length} lines`);
console.log('Extracted: road profile generation, camber, spatial index, surface queries and road mesh builders.');