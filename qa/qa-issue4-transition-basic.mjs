import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src','terrain','world-scene.js'),'utf8').replace(/\r\n/g,'\n');

for(const pattern of [
  /'road-terrain-transition'/,
  /'road-terrain-transition-p927-hold'/,
  /const transitionBasicTint=0x6f8150;/,
  /new THREE\.MeshBasicMaterial\(/,
  /vertexColors:false/,
  /depthTest:source\?\.depthTest!==false/,
  /depthWrite:source\?\.depthWrite!==false/,
  /polygonOffset:source\?\.polygonOffset===true/,
  /'stencilWrite'/,
  /'stencilRef'/,
  /'stencilFunc'/,
  /issue4BasicTransitionMaterial:true/,
  /child\.receiveShadow=false;/,
  /child\.castShadow=false;/,
  /const originalSceneAdd=scene\.add;/,
  /normalizeTransitionBasicMaterial\(object\)/
])assert.match(source,pattern,`Issue 4 unlit transition probe missing: ${pattern}`);

assert.doesNotMatch(source,/setIndex\s*\(/,'probe must not alter transition geometry');
assert.doesNotMatch(source,/terrainCutHalfWidth\s*=/,'probe must not tune terrain geometry');
assert.doesNotMatch(source,/blendWidth\s*=/,'probe must not tune terrain geometry');
assert.doesNotMatch(source,/MeshStandardMaterial\s*\(\{[\s\S]*transitionBasicTint/,
  'probe transition must not use a lit material');

console.log('Issue 4 transition basic-material QA: PASS',{
  transitionNamesCovered:2,
  material:'MeshBasicMaterial',
  fixedTint:'0x6f8150',
  vertexColors:false,
  lighting:false,
  geometryChanged:false,
  depthStencilPolicyPreserved:true
});
