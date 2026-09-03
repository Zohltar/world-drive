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
  /const normalizeTransitionDepth=group=>/,
  /material\.polygonOffset=false;/,
  /material\.needsUpdate=true;/,
  /const originalSceneAdd=scene\.add;/,
  /scene\.add=function\(\.\.\.objects\)/,
  /normalizeTransitionDepth\(object\)/,
  /return originalSceneAdd\.apply\(this,objects\);/
])assert.match(source,pattern,`Issue 4 transition depth guard missing: ${pattern}`);

assert.doesNotMatch(source,/material\.vertexColors=false/,'depth candidate must preserve transition vertex colours');
assert.doesNotMatch(source,/material\.depthWrite\s*=/,'depth candidate must preserve depth writes');
assert.doesNotMatch(source,/material\.depthTest\s*=/,'depth candidate must preserve depth tests');
assert.doesNotMatch(source,/material\.stencilWrite\s*=/,'depth candidate must preserve stencil policy');
assert.doesNotMatch(source,/setIndex\s*\(/,'depth candidate must not alter transition geometry');
assert.doesNotMatch(source,/MeshBasicMaterial/,'depth candidate must preserve standard terrain material');

console.log('Issue 4 transition depth QA: PASS');
console.log({
  transitionNamesCovered:2,
  polygonOffsetDisabled:true,
  vertexColorsPreserved:true,
  lightingPreserved:true,
  stencilPreserved:true,
  geometryChanged:false,
  depthTestWriteChanged:false
});
