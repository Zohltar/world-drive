import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const write=(p,s)=>fs.writeFileSync(p,s,'utf8');
function once(source,needle,replacement,label){
  const at=source.indexOf(needle);
  if(at<0)throw new Error(`Terrain R1 missing anchor: ${label}`);
  if(source.indexOf(needle,at+needle.length)>=0)throw new Error(`Terrain R1 ambiguous anchor: ${label}`);
  return source.slice(0,at)+replacement+source.slice(at+needle.length);
}
function removeThrough(source,startNeedle,endNeedle,label){
  const start=source.indexOf(startNeedle);
  if(start<0)throw new Error(`Terrain R1 missing range start: ${label}`);
  const end=source.indexOf(endNeedle,start+startNeedle.length);
  if(end<0)throw new Error(`Terrain R1 missing range end: ${label}`);
  // Keep the end anchor exactly once.
  return source.slice(0,start)+source.slice(end);
}
function syntax(path){
  const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  if(r.status!==0)throw new Error(`${path} syntax:\n${r.stderr||r.stdout}`);
}

const basePath='src/terrain-p925.js';
const terrainPath='src/terrain.js';
let base=read(basePath);
let terrain=read(terrainPath);
if(base.includes('Terrain R1 — authoritative visible road earthwork')){
  console.log('Terrain R1 already applied');
  process.exit(0);
}

const oldRendered=`  function renderedTerrainHeight(x,z){\n    const natural=heightAt(x,z)-.15;\n    const departureSafe=startPadHeight(x,z,natural);\n\n    // First flatten the dedicated departure pad, then let the normal road cut\n    // win inside the asphalt corridor. This prevents the pad from ever pushing\n    // terrain through the road surface.\n    return activeRoadProfile.length\n      ?gradedHeight(x,z,departureSafe)\n      :departureSafe;\n  }`;
const newRendered=`  function groundTerrainHeight(x,z){\n    const natural=heightAt(x,z)-.15;\n    const departureSafe=startPadHeight(x,z,natural);\n\n    // The coarse near mesh remains a hidden safety excavation. It may cut wider\n    // than the visible shoulder so no 12.5 m terrain triangle can bridge through\n    // the road surface.\n    return activeRoadProfile.length\n      ?gradedHeight(x,z,departureSafe)\n      :departureSafe;\n  }\n\n  // Terrain R1 — authoritative visible road earthwork. Satellite chunks and the\n  // refined procedural shoulder now follow the same analytic surface instead of\n  // sampling the broader hidden safety cut underneath it.\n  function refinedRoadVisualHeight(x,z,naturalY){\n    if(!activeRoadProfile.length)return naturalY;\n    const sample=nearestRoadSample(x,z,naturalY);\n    if(!sample)return naturalY;\n    const roadSupportY=\n      sample.y+\n      Math.tan(sample.roll||0)*sample.signedLateral-\n      roadBedOptions.surfaceOffset;\n    const visualInner=Math.max(roadBedOptions.roadHalfWidth-.15,5.20);\n    const visualOuter=Math.max(visualInner+1,roadBedOptions.terrainCutHalfWidth+roadBedOptions.blendWidth);\n    const distance=Math.sqrt(Math.max(0,sample.distance2));\n    if(distance<=visualInner)return Math.min(naturalY,roadSupportY);\n    if(distance>=visualOuter)return naturalY;\n    const t=(distance-visualInner)/Math.max(.001,visualOuter-visualInner);\n    const rise=1-Math.pow(1-Math.max(0,Math.min(1,t)),2.35);\n    return Math.min(naturalY,roadSupportY*(1-rise)+naturalY*rise);\n  }\n\n  function renderedTerrainHeight(x,z){\n    const natural=heightAt(x,z)-.15;\n    const departureSafe=startPadHeight(x,z,natural);\n    return activeRoadProfile.length\n      ?refinedRoadVisualHeight(x,z,departureSafe)\n      :departureSafe;\n  }`;
base=once(base,oldRendered,newRendered,'visible terrain height split');
base=once(base,'      const y=renderedTerrainHeight(wx,wz);','      const y=groundTerrainHeight(wx,wz);','near ground safety height');

const oldMapBridge=`\n    if(roadBedGroup){\n      for(const mesh of roadBedGroup.children){\n        if(mesh?.material){\n          mesh.material.map=ground.material.map;\n          mesh.material.color.copy?.(\n            ground.material.color\n          );\n          mesh.material.needsUpdate=true;\n        }\n      }\n    }\n`;
base=once(base,oldMapBridge,'\n','legacy road-bed imagery map copy');

base=once(
  base,
  `  function applyRoadBedTerrainColors(geometry){\n    const positions=geometry.attributes.position;\n    if(!positions)return;`,
  `  function applyRoadBedTerrainColors(geometry){\n    const positions=geometry.attributes.position;\n    const normals=geometry.attributes.normal;\n    if(!positions)return;`,
  'road-bed normal attribute'
);
base=once(
  base,
  `      const nlen=Math.hypot(nx,ny,nz)||1;\n      nx/=nlen;ny/=nlen;nz/=nlen;\n\n      const directional=nx*lightX+ny*lightY+nz*lightZ;`,
  `      const nlen=Math.hypot(nx,ny,nz)||1;\n      nx/=nlen;ny/=nlen;nz/=nlen;\n      if(normals)normals.setXYZ(i,nx,ny,nz);\n\n      const directional=nx*lightX+ny*lightY+nz*lightZ;`,
  'natural DEM normals synchronous'
);

terrain=removeThrough(
  terrain,
  '    const accumulateNormals=async()=>{',
  "    const groundPosition=ground.geometry?.getAttribute?.('position')?.array;",
  'legacy artificial transition normals'
);
terrain=once(
  terrain,
  `        const gx=(hR-hL)/(2*eps),gz=(hU-hD)/(2*eps);let nx=-gx,ny=1,nz=-gz;const inv=1/(Math.hypot(nx,ny,nz)||1);nx*=inv;ny*=inv;nz*=inv;\n        const directional=nx*lightX+ny*lightY+nz*lightZ,slope=clamp01(1-Math.abs(ny)),altitude=clamp01((y-rangeMin)/span);`,
  `        const gx=(hR-hL)/(2*eps),gz=(hU-hD)/(2*eps);let nx=-gx,ny=1,nz=-gz;const inv=1/(Math.hypot(nx,ny,nz)||1);nx*=inv;ny*=inv;nz*=inv;\n        // Terrain R1: the refined road earthwork replaces natural ground geometry,\n        // but its lighting must retain the natural DEM normal so the helper mesh\n        // cannot reveal itself as a bright band across steep hillsides.\n        data.normals[j]=nx;data.normals[j+1]=ny;data.normals[j+2]=nz;\n        const directional=nx*lightX+ny*lightY+nz*lightZ,slope=clamp01(1-Math.abs(ny)),altitude=clamp01((y-rangeMin)/span);`,
  'natural DEM normals incremental'
);
terrain=once(terrain,'      if(!await accumulateNormals())return null;\n','','remove legacy normal pass call');
terrain=once(
  terrain,
  `        const material=ground.material.clone();material.alphaMap=null;material.alphaTest=0;material.transparent=false;material.side=THREE.DoubleSide;material.polygonOffset=true;material.polygonOffsetFactor=1;material.polygonOffsetUnits=1;`,
  `        const material=ground.material.clone();material.map=null;material.alphaMap=null;material.alphaTest=0;material.transparent=false;material.side=THREE.DoubleSide;material.polygonOffset=true;material.polygonOffsetFactor=1;material.polygonOffsetUnits=1;`,
  'chunked imagery owns earthwork texture'
);

write(basePath,base);
write(terrainPath,terrain);
syntax(basePath);
syntax(terrainPath);
console.log('Terrain R1 patch applied');
