import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const checkPath=path.join(root,'src','__main_road_init_check__.mjs');

function die(message){
  console.error(`V21.25 road init repair: ${message}`);
  process.exit(1);
}
function syntaxCheck(content){
  fs.writeFileSync(checkPath,content,'utf8');
  try{
    const result=spawnSync(process.execPath,['--check',checkPath],{cwd:root,encoding:'utf8'});
    if(result.status!==0)die(`main.js syntax check failed:\n${result.stderr||result.stdout}`);
  }finally{
    try{fs.unlinkSync(checkPath);}catch{}
  }
}

if(!fs.existsSync(mainPath))die('src/main.js missing');
let main=fs.readFileSync(mainPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';

if(!main.includes("from './road-geometry.js'")){
  die('road geometry extraction is not applied');
}

const replacements=[
  [
    'const buildRoadProfile=()=>roadGeometry.buildProfile();',
    'function buildRoadProfile(){return roadGeometry.buildProfile();}'
  ],
  [
    'const setActiveRoadProfile=profile=>roadGeometry.setProfile(profile);',
    'function setActiveRoadProfile(profile){return roadGeometry.setProfile(profile);}'
  ],
  [
    'const clearActiveRoadProfile=()=>roadGeometry.clearProfile();',
    'function clearActiveRoadProfile(){return roadGeometry.clearProfile();}'
  ],
  [
    'const rebuildRoadProfileSpatialIndex=()=>roadGeometry.rebuildIndex();',
    'function rebuildRoadProfileSpatialIndex(){return roadGeometry.rebuildIndex();}'
  ],
  [
    'const buildLateralBand=(...args)=>roadGeometry.buildLateralBand(...args);',
    'function buildLateralBand(...args){return roadGeometry.buildLateralBand(...args);}'
  ],
  [
    'const buildRibbon=(...args)=>roadGeometry.buildRibbon(...args);',
    'function buildRibbon(...args){return roadGeometry.buildRibbon(...args);}'
  ],
  [
    'const buildOffsetRibbon=(...args)=>roadGeometry.buildOffsetRibbon(...args);',
    'function buildOffsetRibbon(...args){return roadGeometry.buildOffsetRibbon(...args);}'
  ],
  [
    'const buildRoadVolume=(...args)=>roadGeometry.buildRoadVolume(...args);',
    'function buildRoadVolume(...args){return roadGeometry.buildRoadVolume(...args);}'
  ],
  [
    'const roadFrameAt=(...args)=>roadGeometry.roadFrameAt(...args);',
    'function roadFrameAt(...args){return roadGeometry.roadFrameAt(...args);}'
  ],
  [
    'const roadProfileFrameAtCum=(...args)=>roadGeometry.roadProfileFrameAtCum(...args);',
    'function roadProfileFrameAtCum(...args){return roadGeometry.roadProfileFrameAtCum(...args);}'
  ],
  [
    'const roadHeightAt=(...args)=>roadGeometry.roadHeightAt(...args);',
    'function roadHeightAt(...args){return roadGeometry.roadHeightAt(...args);}'
  ],
  [
    'const roadSurfaceAt=(...args)=>roadGeometry.roadSurfaceAt(...args);',
    'function roadSurfaceAt(...args){return roadGeometry.roadSurfaceAt(...args);}'
  ]
];

let changed=0;
for(const [before,after] of replacements){
  const hasBefore=main.includes(before);
  const hasAfter=main.includes(after);
  if(hasBefore&&hasAfter)die(`both old and repaired facade exist: ${before}`);
  if(hasBefore){
    main=main.replace(before,after);
    changed++;
  }else if(!hasAfter){
    die(`road facade member missing: ${before}`);
  }
}

for(const [before,after] of replacements){
  if(main.includes(before))die(`TDZ-prone facade remains: ${before}`);
  if(!main.includes(after))die(`hoisted facade missing: ${after}`);
}

syntaxCheck(main);

if(changed){
  fs.writeFileSync(mainPath,main,'utf8');
  console.log(`V21.25 ROAD GEOMETRY INIT REPAIR: APPLIED (${changed} facade functions)`);
}else{
  console.log('V21.25 ROAD GEOMETRY INIT REPAIR: already applied');
}
console.log('Road callbacks are function declarations again; road math is unchanged.');
