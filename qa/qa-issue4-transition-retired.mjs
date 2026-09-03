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
  /const originalSceneAdd=scene\.add;/,
  /scene\.add=function\(\.\.\.objects\)/,
  /retireRoadTerrainTransition\(object\)/
])assert.match(source,pattern,`Issue 4 retired transition guard missing: ${pattern}`);

assert.doesNotMatch(source,/MeshBasicMaterial/,'final issue 4 correction must not depend on diagnostic material replacement');
assert.doesNotMatch(source,/vertexColors=false/,'final issue 4 correction must not alter transition vertex-color policy');
assert.doesNotMatch(source,/polygonOffset\s*=/,'final issue 4 correction must not alter depth policy');
assert.doesNotMatch(source,/depthWrite\s*=/,'final issue 4 correction must not alter depth-write policy');
assert.doesNotMatch(source,/depthTest\s*=/,'final issue 4 correction must not alter depth-test policy');
assert.doesNotMatch(source,/setIndex\s*\(/,'final issue 4 correction must not alter transition geometry');

console.log('Issue 4 transition retired QA: PASS',{
  hiddenTransitionNames:2,
  geometryChanged:false,
  materialChanged:false,
  depthPolicyChanged:false,
  presentationRetired:true
});
