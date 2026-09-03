import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const local=read('src/local-world-builder.js');
const terrain=read('src/terrain.js');
const base=read('src/terrain-p925.js');

// Issue #4 r3: the terrain transition remains geometry-owned by P9.25/P9.27.
// The current local-world owner only changes how the already-baked vertex colors
// are displayed once those helper meshes are installed.
assert.match(local,/function createBakedTransitionMaterial\(source\)/,'Issue #4 r3 display material factory missing');
assert.match(local,/new THREE\.MeshBasicMaterial\(\{/,'Issue #4 r3 transition must use an unlit material');
assert.match(local,/vertexColors:true/,'Issue #4 r3 must preserve baked transition vertex colors');
assert.match(local,/road-terrain-transition-p927-hold/,'Issue #4 r3 must cover held P9.27 transition');
assert.match(local,/child\.receiveShadow=false;/,'Issue #4 r3 transition must not receive dynamic shadows');
assert.match(local,/child\.castShadow=false;/,'Issue #4 r3 transition must not become a shadow caster');
assert.match(local,/old\.dispose\?\.\(\);/,'Issue #4 r3 replaced transition material must be disposed');

for(const marker of [
  "'stencilWrite'","'stencilRef'","'stencilFunc'","'stencilFail'","'stencilZFail'","'stencilZPass'",
  "'stencilFuncMask'","'stencilWriteMask'"
])assert.ok(local.includes(marker),`Issue #4 r3 stencil preservation missing: ${marker}`);

// Synchronous P9.25 route install and later P9.27 incremental replacement must
// both be normalized. This prevents startup and streaming refreshes from diverging.
assert.match(local,/result=terrainService\?\.setRoadBed\?\.\(\.\.\.args\);\n\s*stabilizeRoadTerrainTransitions\(\);/,
  'Issue #4 r3 synchronous road transition is not stabilized');
assert.match(local,/const transitionResult=await terrainService\.rebuildRoadTransitionIncremental\(\);\n\s*stabilizeRoadTerrainTransitions\(\);/,
  'Issue #4 r3 incremental road transition is not stabilized');

// Geometry and baked-colour ownership remain exactly where they were.
assert.match(base,/function rebuildRoadBedVisual\(\)/,'P9.25 transition geometry owner missing');
assert.match(base,/applyRoadBedTerrainColors\(geometry\);/,'P9.25 baked transition colors missing');
assert.match(base,/const material=ground\.material\.clone\(\);/,'P9.25 source material contract missing');
assert.match(terrain,/function prepareRoadTransitionIncremental\(\)/,'P9.27 incremental transition owner missing');
assert.match(terrain,/geometry\.setAttribute\('color',new THREE\.BufferAttribute\(data\.colors,3\)\)/,
  'P9.27 baked transition color buffer missing');
assert.match(terrain,/group\.name='road-terrain-transition'/,'P9.27 transition group identity missing');

// No geometry, terrain-height, road-cut, or physics constants belong in the r3
// presentation helper.
assert.doesNotMatch(local,/terrainCutHalfWidth\s*[:=]/,'Issue #4 r3 must not retune terrain cut width');
assert.doesNotMatch(local,/blendWidth\s*[:=]\s*14/,'Issue #4 r3 must not retune terrain blend width');
assert.doesNotMatch(local,/surfaceOffset\s*[:=]\s*\.20/,'Issue #4 r3 must not retune road support height');

console.log('ISSUE 4 TRANSITION UNDERLAY QA: PASS',{
  geometryOwners:['terrain-p925.js','terrain.js P9.27'],
  displayOwner:'local-world-builder.js',
  displayMaterial:'MeshBasicMaterial + baked vertex colors',
  syncAndIncremental:true,
  geometryChanged:false
});
