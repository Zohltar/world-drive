import assert from 'node:assert/strict';
import fs from 'node:fs';

const terrain=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const base=fs.readFileSync(new URL('../src/terrain-p925.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const imagery=fs.readFileSync(new URL('../src/imagery/imagery-p913.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const roadAwareGrid=fs.readFileSync(new URL('../src/imagery/road-aware-grid.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');

// Modern imagery ownership: satellite is its own geometry, never a monolithic ground map.
assert.match(imagery,/chunkGroup\.name='satellite-terrain-chunks'/,'satellite chunk geometry ownership missing');
assert.match(imagery,/groundMaterial\.map=null/,'legacy monolithic ground imagery unexpectedly returned');
assert.match(
  imagery,
  /buildRoadAwareImageryGrid\(\{[\s\S]*sampleTerrainHeight,[\s\S]*sampleRoadVisualHeight/,
  'satellite chunks no longer pass terrain visual height into geometry builder'
);
assert.match(
  roadAwareGrid,
  /const sampled=heightOverride===null[\s\S]*\?terrainSample\(absX,absZ\)/,
  'road-aware imagery grid no longer samples the visual terrain surface'
);

// Terrain R1: keep the safety-cut ground separate from the visible refined earthwork height.
assert.match(base,/function groundTerrainHeight\(x,z\)/,'authoritative safety-cut ground height missing');
assert.match(base,/function refinedRoadVisualHeight\(x,z,naturalY\)/,'refined visible road earthwork height missing');
assert.match(base,/renderHeightAt:renderedTerrainHeight/,'satellite visible-height API missing');
assert.match(base,/const y=groundTerrainHeight\(wx,wz\)/,'near ground must retain safety excavation instead of using visual overlay height');
assert.match(base,/refinedRoadVisualHeight\(x,z,departureSafe\)/,'visible terrain height must use refined earthwork near roads');

// The old monolithic imagery-copy bridge is invalid with chunked satellite rendering.
assert.doesNotMatch(base,/mesh\.material\.map=ground\.material\.map/,'legacy ground-map copy still pollutes road earthwork');

// Refined earthwork lighting must inherit natural DEM normals, not reveal the artificial ribbon normal.
assert.match(base,/normals\.setXYZ\(i,nx,ny,nz\)/,'synchronous road earthwork does not inherit natural DEM normals');
assert.match(terrain,/data\.normals\[j\]=nx;data\.normals\[j\+1\]=ny;data\.normals\[j\+2\]=nz/,'incremental road earthwork does not inherit natural DEM normals');
assert.doesNotMatch(terrain,/if\(!await accumulateNormals\(\)\)return null/,'legacy artificial-ribbon normal pass still active');

// Satellite must continue to own pixels before all procedural terrain layers.
assert.match(imagery,/stencilRef:2/,'satellite stencil ownership missing');
assert.match(imagery,/mesh\.renderOrder=-10/,'satellite chunks must render before terrain');
assert.match(terrain,/material\.polygonOffsetFactor=1/,'road earthwork must remain behind higher-priority road\/satellite surfaces');

console.log('TERRAIN R1 LEGACY OWNERSHIP QA: PASS');
console.log('chunked satellite follows refined visible earthwork; hidden safety cut remains authoritative; natural DEM normals own terrain lighting');
