import fs from 'node:fs';

const mainPath='src/main.js';
let main=fs.readFileSync(mainPath,'utf8');

const importAnchor="} from './world-materials.js';";
const importBlock=`${importAnchor}\nimport { createSkyLighting } from './sky-lighting.js';`;
if(!main.includes("from './sky-lighting.js'")){
  if(!main.includes(importAnchor))throw new Error('C5.2 world-materials import anchor missing');
  main=main.replace(importAnchor,importBlock);
}

const startMarker='const hemi=new THREE.HemisphereLight(0xd6ecff,0x4e6345,2.15);';
const endMarker='const world=new THREE.Group(),';
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start);
if(start<0||end<0||end<=start)throw new Error('C5.2 sky-lighting block markers missing');

const outside=main.slice(0,start)+main.slice(end);
for(const internal of ['createCrescentMoonTexture','moonTexture']){
  if(outside.includes(internal))throw new Error(`C5.2 internal sky helper used outside extraction block: ${internal}`);
}
for(const publicName of [
  'hemi','sun','moonLight','moonMaterial','moonSprite','moonDirection','updateMoonSkyPosition'
]){
  if(!outside.includes(publicName))throw new Error(`C5.2 extracted binding has no outside consumer: ${publicName}`);
}

const replacement=`// ---------- sky lighting facade ----------\nconst {\n  hemi,\n  sun,\n  moonLight,\n  moonMaterial,\n  moonSprite,\n  moonDirection,\n  updateMoonSkyPosition\n}=createSkyLighting({THREE,scene,camera,documentRef:document});\n\n`;

main=main.slice(0,start)+replacement+main.slice(end);
main=main.replace(/[ \t]+$/gm,'').trimEnd()+'\n';
fs.writeFileSync(mainPath,main);

console.log('C5.2 sky-lighting extraction materialized',{
  mainLines:main.split(/\r?\n/).length,
  module:'src/sky-lighting.js'
});
