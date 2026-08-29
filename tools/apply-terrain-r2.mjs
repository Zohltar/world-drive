import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const write=(p,s)=>fs.writeFileSync(p,s,'utf8');
function once(source,needle,replacement,label){
  const at=source.indexOf(needle);
  if(at<0)throw new Error(`Terrain R2 missing anchor: ${label}`);
  if(source.indexOf(needle,at+needle.length)>=0)throw new Error(`Terrain R2 ambiguous anchor: ${label}`);
  return source.slice(0,at)+replacement+source.slice(at+needle.length);
}
function syntax(path){
  const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  if(r.status!==0)throw new Error(`${path} syntax:\n${r.stderr||r.stdout}`);
}

const basePath='src/terrain-p925.js';
const imageryPath='src/imagery.js';
const mainPath='src/main.js';
let base=read(basePath);
let imagery=read(imageryPath);
let main=read(mainPath);

if(base.includes('Terrain R2 — cheap road-visual override')){
  console.log('Terrain R2 already applied');
  process.exit(0);
}

base=once(
  base,
  `  function renderedTerrainHeight(x,z){\n    const natural=heightAt(x,z)-.15;\n    const departureSafe=startPadHeight(x,z,natural);\n    return activeRoadProfile.length\n      ?refinedRoadVisualHeight(x,z,departureSafe)\n      :departureSafe;\n  }`,
  `  function renderedTerrainHeight(x,z){\n    const natural=heightAt(x,z)-.15;\n    const departureSafe=startPadHeight(x,z,natural);\n    return activeRoadProfile.length\n      ?refinedRoadVisualHeight(x,z,departureSafe)\n      :departureSafe;\n  }\n\n  // Terrain R2 — cheap road-visual override for the satellite sampler. Most\n  // imagery vertices are nowhere near a road, so reject them with one spatial\n  // hash lookup and keep P9.17's fast ground interpolation. Only vertices in a\n  // road-effect cell pay for the authoritative refined earthwork height.\n  function roadVisualHeightAt(x,z){\n    if(!activeRoadProfile.length||!roadSegmentIndex.size)return null;\n    const bucket=roadSegmentIndex.get(\n      roadCellKey(\n        Math.floor(x/roadIndexCellSize),\n        Math.floor(z/roadIndexCellSize)\n      )\n    );\n    if(!bucket?.length)return null;\n\n    const natural=heightAt(x,z)-.15;\n    const departureSafe=startPadHeight(x,z,natural);\n    const sample=nearestRoadSample(x,z,departureSafe);\n    if(!sample)return null;\n    const visualInner=Math.max(roadBedOptions.roadHalfWidth-.15,5.20);\n    const visualOuter=Math.max(\n      visualInner+1,\n      roadBedOptions.terrainCutHalfWidth+roadBedOptions.blendWidth\n    );\n    if(sample.distance2>=visualOuter*visualOuter)return null;\n    return refinedRoadVisualHeight(x,z,departureSafe);\n  }`,
  'road visual height API'
);

base=once(
  base,
  `    renderHeightAt:renderedTerrainHeight,\n    rebuildGround,`,
  `    renderHeightAt:renderedTerrainHeight,\n    roadVisualHeightAt,\n    rebuildGround,`,
  'export road visual height API'
);

imagery=once(
  imagery,
  `  let fastGroundSamples=0;\n  let fallbackGroundSamples=0;`,
  `  let fastGroundSamples=0;\n  let roadVisualSamples=0;\n  let fallbackGroundSamples=0;`,
  'road visual sample counter'
);
imagery=once(
  imagery,
  `  function fastRenderedGroundHeight(absx,absz){\n    const mesh=resolveGroundMesh();`,
  `  function fastRenderedGroundHeight(absx,absz){\n    // Terrain R2: the coarse ground mesh intentionally contains a wider hidden\n    // safety excavation than the visible road earthwork. Near roads, sample the\n    // authoritative refined surface so satellite geometry cannot sit underneath\n    // and expose a green procedural wedge. Everywhere else retain the fast grid.\n    const roadVisual=options?.sampleRoadVisualHeight?.(absx,absz);\n    if(Number.isFinite(roadVisual)){\n      roadVisualSamples++;\n      return roadVisual;\n    }\n\n    const mesh=resolveGroundMesh();`,
  'imagery road visual override'
);
imagery=once(
  imagery,
  `    p917FastGroundSamples:fastGroundSamples,\n    p917FallbackGroundSamples:fallbackGroundSamples,`,
  `    p917FastGroundSamples:fastGroundSamples,\n    terrainR2RoadVisualSamples:roadVisualSamples,\n    p917FallbackGroundSamples:fallbackGroundSamples,`,
  'imagery road visual diagnostics'
);

main=once(
  main,
  `  sampleTerrainHeight:(x,z)=>terrainService.renderHeightAt(x,z),\n  scene,`,
  `  sampleTerrainHeight:(x,z)=>terrainService.renderHeightAt(x,z),\n  sampleRoadVisualHeight:(x,z)=>terrainService.roadVisualHeightAt?.(x,z),\n  scene,`,
  'main imagery road visual sampler'
);

write(basePath,base);
write(imageryPath,imagery);
write(mainPath,main);
syntax(basePath);
syntax(imageryPath);
syntax(mainPath);
console.log('Terrain R2 patch applied');
