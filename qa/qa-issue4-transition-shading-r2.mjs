import assert from 'node:assert/strict';
import fs from 'node:fs';

const p927=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');
const p925=fs.readFileSync(new URL('../src/terrain-p925.js',import.meta.url),'utf8');

assert.match(
  p927,
  /const shade=Math\.max\(\.56,Math\.min\(1\.36,\.72\+directional\*\.46-slope\*\.10\)\);/,
  'P9.27 incremental transition must keep the raised .56 shading floor'
);
assert.match(p927,/const lightX=-\.58,lightY=\.64,lightZ=-\.50;/,
  'P9.27 virtual light direction must remain unchanged');
assert.match(p927,/const low=\[0x4f\/255,0x6e\/255,0x3e\/255\],mid=\[0x6f\/255,0x81\/255,0x50\/255\],high=\[0x8b\/255,0x8d\/255,0x69\/255\];/,
  'P9.27 transition palette must remain unchanged');

const roadStart=p925.indexOf('function applyRoadBedTerrainColors(geometry)');
const hillStart=p925.indexOf('function applyHillshadeColors(geometry',roadStart);
assert.ok(roadStart>=0&&hillStart>roadStart,'P9.25 terrain color owners missing');
const roadBlock=p925.slice(roadStart,hillStart);
const hillBlock=p925.slice(hillStart,p925.indexOf('function applyDistantTerrainColors',hillStart));

assert.match(roadBlock,/shade=Math\.max\(\.56,Math\.min\(1\.36,shade\)\);/,
  'P9.25 sync road-transition shading floor must be .56');
assert.match(roadBlock,/const lightX=-\.58,lightY=\.64,lightZ=-\.50;/,
  'P9.25 sync virtual light direction must remain unchanged');
assert.match(roadBlock,/new THREE\.Color\(0x4f6e3e\)/,
  'P9.25 sync transition palette must remain unchanged');
assert.match(hillBlock,/\.34,[\s\S]*?Math\.min\([\s\S]*?1\.36,[\s\S]*?shade/,
  'main near-ground Photo OFF hillshade floor must remain the certified .34');
assert.doesNotMatch(hillBlock,/Math\.max\(\s*\.56/,
  'issue 4 candidate must not brighten the main near-ground hillshade');

assert.match(p925,/if\(triangleClear\(a,c,b\)\)indices\.push\(a,c,b\);/,
  'sync transition geometry/index policy must remain unchanged');
assert.match(p927,/if\(data\._triangleClear\(a,c,b\)\)data\.indices\.push\(a,c,b\);/,
  'incremental transition geometry/index policy must remain unchanged');

console.log('Issue 4 transition shading r2 QA: PASS');
console.log({
  syncP925ShadeFloor:.56,
  incrementalP927ShadeFloor:.56,
  mainGroundShadeFloor:.34,
  geometryChanged:false,
  materialChanged:false,
  lightDirectionChanged:false,
  paletteChanged:false
});
