import fs from 'node:fs';

const mainPath='src/main.js';
let main=fs.readFileSync(mainPath,'utf8');

const importAnchor="import { createSkyLighting } from './sky-lighting.js';";
const importBlock=`${importAnchor}\nimport {\n  createWorldScene,\n  freezeStaticMatrices,\n  resetStaticGroupOrigin,\n  NEAR_TERRAIN_SIZE,\n  NEAR_TERRAIN_SEGMENTS\n} from './world-scene.js';`;
if(!main.includes("from './world-scene.js'")){
  if(!main.includes(importAnchor))throw new Error('C5.3 sky-lighting import anchor missing');
  main=main.replace(importAnchor,importBlock);
}

const startMarker='const world=new THREE.Group(),';
const endMarker='// Local rendering origin follows the car to avoid large-coordinate precision loss.';
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start);
if(start<0||end<0||end<=start)throw new Error('C5.3 world-scene block markers missing');

const outside=main.slice(0,start)+main.slice(end);
for(const publicName of [
  'terrainDetailGroup','waterGroup','infrastructureGroup','signGroup','sceneryInfrastructureGroup',
  'buildingGroup','roadGroup','forestGroup','sceneryForestGroup','horizonGroup','streamedWorldGroups',
  'groundMat','ground','resetStreamedWorldOrigins','freezeStaticMatrices','resetStaticGroupOrigin',
  'NEAR_TERRAIN_SIZE','NEAR_TERRAIN_SEGMENTS'
]){
  if(!outside.includes(publicName))throw new Error(`C5.3 extracted binding has no outside consumer: ${publicName}`);
}

const replacement=`// ---------- world render scene facade ----------\nconst {\n  world,\n  terrainDetailGroup,\n  waterGroup,\n  infrastructureGroup,\n  signGroup,\n  sceneryInfrastructureGroup,\n  buildingGroup,\n  roadGroup,\n  forestGroup,\n  sceneryForestGroup,\n  horizonGroup,\n  streamedWorldGroups,\n  groundMat,\n  ground,\n  resetStreamedWorldOrigins\n}=createWorldScene({THREE,scene});\n\n`;

main=main.slice(0,start)+replacement+main.slice(end);
main=main.replace(/[ \t]+$/gm,'').trimEnd()+'\n';
fs.writeFileSync(mainPath,main);

console.log('C5.3 world-scene extraction materialized',{
  mainLines:main.split(/\r?\n/).length,
  module:'src/world-scene.js',
  streamingGroupContract:'public'
});
