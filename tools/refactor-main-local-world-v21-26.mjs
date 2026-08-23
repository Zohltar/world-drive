import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const builderPath=path.join(root,'src','local-world-builder.js');

const raw=fs.readFileSync(mainPath,'utf8');
const eol=raw.includes('\r\n')?'\r\n':'\n';
let main=raw.replace(/\r\n/g,'\n');

const builderImport="import { createLocalWorldBuilder } from './local-world-builder.js';";

if(main.includes(builderImport)&&fs.existsSync(builderPath)){
  console.log('V21.26 LOCAL WORLD REFACTOR: already applied');
  process.exit(0);
}
if(main.includes(builderImport)||fs.existsSync(builderPath)){
  throw new Error('V21.26 local world refactor: partial previous application detected. Restore the branch before retrying.');
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`V21.26 local world refactor: ${label} not found. No files changed.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    throw new Error(`V21.26 local world refactor: ${label} is ambiguous. No files changed.`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

function functionRange(source,signature){
  const start=source.indexOf(signature);
  if(start<0)throw new Error(`V21.26 local world refactor: ${signature} not found. No files changed.`);
  const brace=source.indexOf('{',start);
  if(brace<0)throw new Error(`V21.26 local world refactor: opening brace not found for ${signature}. No files changed.`);

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
      if(ch===quote)quote=null;
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

  throw new Error(`V21.26 local world refactor: closing brace not found for ${signature}. No files changed.`);
}

const range=functionRange(main,'function rebuildLocalWorld()');
const originalFunction=main.slice(range.start,range.end);
let body=originalFunction.slice(originalFunction.indexOf('{')+1,-1);

for(const required of [
  'terrainService.setRoadBed(profile,{',
  'const roadVolume=buildRoadVolume(profile);',
  'let seed=Math.floor(worldOffset.x/90)',
  'rebuildLocalWater();',
  "scheduleVisualJob(\n   'scenery'",
  'addEnhancedBridgeFurniture();',
  'refreshRoadSignsOnly();',
  "scheduleVisualJob(\n   'horizon'"
]){
  if(!body.includes(required)){
    throw new Error(`V21.26 local world refactor: expected behavior missing: ${required}. No files changed.`);
  }
}

// bridgeFeatures is mutable service state; keep it live through an accessor.
body=body.replace('if(bridgeFeatures.length) rebuildBridgeSpans();','if(getBridgeFeatureCount()) rebuildBridgeSpans();');
if(body.includes('bridgeFeatures')){
  throw new Error('V21.26 local world refactor: unexpected bridgeFeatures reference remains in extracted body. No files changed.');
}

const dependencyNames=[
  'THREE',
  'resetStreamedWorldOrigins',
  'terrainService',
  'clearGroup',
  'roadGroup',
  'forestGroup',
  'infrastructureGroup',
  'signGroup',
  'sceneryRenderer',
  'getBridgeFeatureCount',
  'rebuildBridgeSpans',
  'buildRoadProfile',
  'setActiveRoadProfile',
  'buildRoadVolume',
  'buildLateralBand',
  'buildRibbon',
  'buildOffsetRibbon',
  'shoulderMat',
  'roadMat',
  'lineYellow',
  'lineWhite',
  'ROAD_SURFACE_OFFSET',
  'getWorldOffset',
  'nearestRoute',
  'isWaterAt',
  'terrainAbs',
  'treeTrunkMat',
  'treeMat',
  'rebuildLocalWater',
  'scheduleVisualJob',
  'rebuildLocalScenery',
  'addEnhancedBridgeFurniture',
  'refreshRoadSignsOnly',
  'freezeStaticMatrices',
  'rebuildHorizon',
  'markStaticShadowsDirty'
];

const moduleLines=[];
moduleLines.push('export function createLocalWorldBuilder({');
for(const name of dependencyNames)moduleLines.push(`  ${name},`);
moduleLines.push('}){');
moduleLines.push('  function rebuild(){');
moduleLines.push('    const worldOffset=getWorldOffset();');
for(const line of body.split('\n'))moduleLines.push(`   ${line}`);
moduleLines.push('  }');
moduleLines.push('');
moduleLines.push('  return {rebuild};');
moduleLines.push('}');
moduleLines.push('');
const builderSource=moduleLines.join('\n');

const initLines=[];
initLines.push('let localWorldBuilder=null;');
initLines.push('function rebuildLocalWorld(){');
initLines.push('  return localWorldBuilder?.rebuild();');
initLines.push('}');
initLines.push('localWorldBuilder=createLocalWorldBuilder({');
for(const name of dependencyNames){
  if(name==='getBridgeFeatureCount'){
    initLines.push('  getBridgeFeatureCount:()=>bridgeFeatures.length,');
  }else if(name==='getWorldOffset'){
    initLines.push('  getWorldOffset:()=>worldOffset,');
  }else{
    initLines.push(`  ${name},`);
  }
}
initLines.push('});');

// Replace the function before inserting an earlier import so source offsets stay valid.
main=main.slice(0,range.start)+initLines.join('\n')+main.slice(range.end);

const importAnchor="import { createRoadGeometrySystem } from './road-geometry.js';";
main=replaceOnce(
  main,
  importAnchor,
  `${importAnchor}\n${builderImport}`,
  'road geometry import anchor'
);

for(const legacyPattern of [
  'terrainService.setRoadBed(profile,{',
  'const roadVolume=buildRoadVolume(profile);',
  'let seed=Math.floor(worldOffset.x/90)*73856093',
  'const nearTrees=[];',
  'const farTrees=[];'
]){
  if(main.includes(legacyPattern)){
    throw new Error(`V21.26 local world refactor: legacy local-world ownership remains in main.js: ${legacyPattern}`);
  }
}

for(const expected of [
  'terrainService.setRoadBed(profile,{',
  'const roadVolume=buildRoadVolume(profile);',
  'let seed=Math.floor(worldOffset.x/90)*73856093',
  'rebuildLocalWater();',
  'addEnhancedBridgeFurniture();',
  'refreshRoadSignsOnly();',
  'markStaticShadowsDirty();'
]){
  if(!builderSource.includes(expected)){
    throw new Error(`V21.26 local world refactor: generated builder lost behavior: ${expected}`);
  }
}

const tempMain=path.join(root,'tools','__v21_26_local_world_main_check__.mjs');
const tempBuilder=path.join(root,'tools','__v21_26_local_world_builder_check__.mjs');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){
    throw new Error(`Syntax check failed for ${path.basename(file)}:\n${result.stderr||result.stdout}`);
  }
}

try{
  fs.writeFileSync(tempMain,main,'utf8');
  fs.writeFileSync(tempBuilder,builderSource,'utf8');
  syntaxCheck(tempMain);
  syntaxCheck(tempBuilder);
}finally{
  fs.rmSync(tempMain,{force:true});
  fs.rmSync(tempBuilder,{force:true});
}

const outputMain=eol==='\n'?main:main.replace(/\n/g,eol);
const outputBuilder=eol==='\n'?builderSource:builderSource.replace(/\n/g,eol);

fs.writeFileSync(builderPath,outputBuilder,'utf8');
fs.writeFileSync(mainPath,outputMain,'utf8');

const beforeLines=raw.split(/\r?\n/).length;
const afterLines=outputMain.split(/\r?\n/).length;
const builderLines=outputBuilder.split(/\r?\n/).length;

console.log('V21.26 LOCAL WORLD REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines`);
console.log(`local-world-builder.js: ${builderLines} lines`);
console.log('Extracted: local road/road-bed rebuild, deterministic procedural forest, water/scenery/furniture/horizon refresh orchestration.');