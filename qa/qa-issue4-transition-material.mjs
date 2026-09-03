import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const worldScenePath=path.join(root,'src','terrain','world-scene.js');
const source=fs.readFileSync(worldScenePath,'utf8').replace(/\r\n/g,'\n');

for(const pattern of [
  /'road-terrain-transition'/,
  /'road-terrain-transition-p927-hold'/,
  /const transitionTerrainTint=0x6f8150;/,
  /material\.vertexColors=false;/,
  /material\.color\?\.setHex/,
  /material\.color=transitionTerrainTint;/,
  /material\.map=null;/,
  /material\.alphaMap=null;/,
  /material\.alphaTest=0;/,
  /material\.transparent=false;/,
  /material\.needsUpdate=true;/,
  /const originalSceneAdd=scene\.add;/,
  /scene\.add=function\(\.\.\.objects\)/,
  /normalizeTransitionMaterial\(object\)/
])assert.match(source,pattern,`Issue 4 transition material guard missing: ${pattern}`);

assert.doesNotMatch(source,/MeshBasicMaterial/,'candidate must preserve standard terrain lighting');
assert.doesNotMatch(source,/polygonOffset\s*=/,'candidate must not change transition depth offset');
assert.doesNotMatch(source,/depthWrite\s*=/,'candidate must not change depth-write policy');
assert.doesNotMatch(source,/depthTest\s*=/,'candidate must not change depth-test policy');
assert.doesNotMatch(source,/setIndex\s*\(/,'candidate must not alter transition geometry');
assert.doesNotMatch(source,/terrainCutHalfWidth\s*=/,'candidate must not tune terrain geometry');
assert.doesNotMatch(source,/blendWidth\s*=/,'candidate must not tune terrain geometry');

console.log('Issue 4 transition material QA: PASS');
console.log({
  transitionNamesCovered:2,
  vertexColorsDisabled:true,
  neutralTint:'0x6f8150',
  standardLightingPreserved:true,
  geometryChanged:false,
  depthPolicyChanged:false
});
