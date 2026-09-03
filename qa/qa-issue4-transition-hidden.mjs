import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src','terrain','world-scene.js'),'utf8').replace(/\r\n/g,'\n');

for(const pattern of [
  /'road-terrain-transition'/,
  /'road-terrain-transition-p927-hold'/,
  /group\.visible=false;/,
  /new THREE\.MeshBasicMaterial\(/,
  /vertexColors:false/,
  /normalizeTransitionBasicMaterial\(object\)/
])assert.match(source,pattern,`Issue 4 hidden-transition probe missing: ${pattern}`);

assert.doesNotMatch(source,/setIndex\s*\(/,'hidden-transition comparison must not alter transition geometry');
assert.doesNotMatch(source,/terrainCutHalfWidth\s*=/,'hidden-transition comparison must not tune terrain geometry');
assert.doesNotMatch(source,/blendWidth\s*=/,'hidden-transition comparison must not tune terrain geometry');

console.log('Issue 4 transition hidden QA: PASS',{
  transitionNamesCovered:2,
  hidden:true,
  geometryChanged:false,
  comparisonBase:'transition-basic-r1'
});
