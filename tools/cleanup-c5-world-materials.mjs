import fs from 'node:fs';

// C5.1 candidate materializer: composition-only extraction, no material tuning.
const mainPath='src/main.js';
let main=fs.readFileSync(mainPath,'utf8');
const importAnchor="import { createLocalWorldBuilder } from './local-world-builder.js';";
const importBlock=`${importAnchor}\nimport {\n  createWorldMaterials,\n  ROAD_SURFACE_OFFSET,\n  TIRE_VISUAL_CLEARANCE,\n  WHEEL_RADIUS,\n  TIRE_HALF_WIDTH,\n  ROAD_WHEEL_CONTACT_HALF_WIDTH\n} from './world-materials.js';`;
if(!main.includes("from './world-materials.js'")){
  if(!main.includes(importAnchor))throw new Error('C5.1 local-world import anchor missing');
  main=main.replace(importAnchor,importBlock);
}

const startMarker='// ---------- Materials ----------';
const endMarker="const waterStatus=$('waterStatus');";
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start);
if(start<0||end<0||end<=start)throw new Error('C5.1 material block markers missing');

const outside=main.slice(0,start)+main.slice(end);
for(const internal of ['makeRoadSurfaceTextures','asphaltTextures','shoulderTextures','makeWaterTexture','waterStencil']){
  if(outside.includes(internal))throw new Error(`C5.1 internal material helper is used outside extraction block: ${internal}`);
}
for(const publicName of [
  'roadMat','shoulderMat','roadEdgeMat','roadUnderMat','lineYellow','lineWhite',
  'treeTrunkMat','treeMat','waterTex','waterMat','riverMat','coastWaterMat',
  'ROAD_SURFACE_OFFSET','TIRE_VISUAL_CLEARANCE','WHEEL_RADIUS','TIRE_HALF_WIDTH','ROAD_WHEEL_CONTACT_HALF_WIDTH'
]){
  if(!outside.includes(publicName))throw new Error(`C5.1 extracted binding has no outside consumer: ${publicName}`);
}

const replacement=`// ---------- world materials facade ----------\nconst {\n  roadMat,\n  shoulderMat,\n  roadEdgeMat,\n  roadUnderMat,\n  lineYellow,\n  lineWhite,\n  treeTrunkMat,\n  treeMat,\n  waterTex,\n  waterMat,\n  riverMat,\n  coastWaterMat\n}=createWorldMaterials({THREE,renderer,documentRef:document});\n\n`;
main=main.slice(0,start)+replacement+main.slice(end);
main=main.replace(/[ \t]+$/gm,'').trimEnd()+'\n';
fs.writeFileSync(mainPath,main);

console.log('C5.1 world-material extraction materialized',{
  mainLines:main.split(/\r?\n/).length,
  module:'src/world-materials.js'
});
