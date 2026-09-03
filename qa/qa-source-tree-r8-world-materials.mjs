import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const exists=relative=>fs.existsSync(path.join(root,relative));

for(const relative of ['src/world-materials.js','src/terrain/world-materials.js']){
  assert.equal(exists(relative),true,`R8 world-materials path missing: ${relative}`);
}

const facade=read('src/world-materials.js');
const implementation=read('src/terrain/world-materials.js');
const main=read('src/main.js');

assert.ok(facade.length<500,'R8 world-materials root facade stopped being thin');
assert.match(facade,/from ['"]\.\/terrain\/world-materials\.js['"]/,'root facade does not target nested implementation');
for(const name of [
  'createWorldMaterials',
  'ROAD_SURFACE_OFFSET',
  'TIRE_VISUAL_CLEARANCE',
  'WHEEL_RADIUS',
  'TIRE_HALF_WIDTH',
  'ROAD_WHEEL_CONTACT_HALF_WIDTH'
]){
  assert.match(facade,new RegExp(`\\b${name}\\b`),`root facade stopped exporting ${name}`);
}

assert.match(implementation,/export function createWorldMaterials\s*\(/,'nested world-materials implementation missing factory');
assert.match(implementation,/export const ROAD_SURFACE_OFFSET=\.10/,'nested road surface offset owner missing');
assert.match(implementation,/export const TIRE_VISUAL_CLEARANCE=\.018/,'nested tire clearance owner missing');
assert.match(implementation,/export const WHEEL_RADIUS=\.38/,'nested wheel radius owner missing');
assert.match(implementation,/export const TIRE_HALF_WIDTH=\.135/,'nested tire width owner missing');
assert.match(implementation,/export const ROAD_WHEEL_CONTACT_HALF_WIDTH=8\.5/,'nested wheel contact owner missing');
assert.match(implementation,/function makeRoadSurfaceTextures\s*\(/,'nested procedural road texture owner missing');
assert.match(implementation,/function makeWaterTexture\s*\(/,'nested procedural water texture owner missing');

assert.match(main,/from ['"]\.\/world-materials\.js['"]/,'main stopped using the stable root world-materials facade');
assert.doesNotMatch(main,/terrain\/world-materials\.js/,'main bypasses the stable world-materials facade');

const publicModule=await import('../src/world-materials.js');
const nestedModule=await import('../src/terrain/world-materials.js');
assert.equal(publicModule.createWorldMaterials,nestedModule.createWorldMaterials,'root facade factory does not resolve to nested implementation');
for(const [name,value] of [
  ['ROAD_SURFACE_OFFSET',.10],
  ['TIRE_VISUAL_CLEARANCE',.018],
  ['WHEEL_RADIUS',.38],
  ['TIRE_HALF_WIDTH',.135],
  ['ROAD_WHEEL_CONTACT_HALF_WIDTH',8.5]
]){
  assert.equal(publicModule[name],value,`public world-material constant changed: ${name}`);
  assert.equal(publicModule[name],nestedModule[name],`root facade constant diverged from nested owner: ${name}`);
}

console.log('SOURCE TREE R8 WORLD MATERIALS QA: PASS',{
  facade:'src/world-materials.js',
  implementation:'src/terrain/world-materials.js',
  mainUsesStableFacade:true,
  constantsPreserved:true
});
