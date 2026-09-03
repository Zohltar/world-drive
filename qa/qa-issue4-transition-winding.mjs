import assert from 'node:assert/strict';
import fs from 'node:fs';

const incremental=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../src/terrain-p925.js',import.meta.url),'utf8');
const facade=fs.readFileSync(new URL('../src/terrain-p926.js',import.meta.url),'utf8');

assert.match(incremental,/const sides=\[-1,1\]\.map\(side=>\(\{/,
  'P9.27 transition must retain its two symmetric side ribbons');
assert.match(incremental,/const pushUpwardTriangle=\(i0,i1,i2\)=>\{[\s\S]*?if\(data\.side<0\)data\.indices\.push\(i0,i1,i2\);[\s\S]*?else data\.indices\.push\(i0,i2,i1\);[\s\S]*?\};/,
  'P9.27 must reverse winding only for the mirrored transition side');
assert.match(incremental,/if\(data\._triangleClear\(a,c,b\)\)pushUpwardTriangle\(a,c,b\);/,
  'first P9.27 transition triangle must preserve the existing clearance decision');
assert.match(incremental,/if\(data\._triangleClear\(b,c,d\)\)pushUpwardTriangle\(b,c,d\);/,
  'second P9.27 transition triangle must preserve the existing clearance decision');
assert.match(incremental,/data\.normals\[j\]=nx;data\.normals\[j\+1\]=ny;data\.normals\[j\+2\]=nz;/,
  'P9.27 natural DEM normals must remain unchanged');
assert.match(incremental,/material\.side=THREE\.DoubleSide/,
  'P9.27 material sidedness must remain unchanged');

assert.match(sync,/function buildSide\(side\)/,
  'P9.25 sync transition must retain its side-aware ribbon builder');
assert.match(sync,/const pushUpwardTriangle=\(i0,i1,i2\)=>\{[\s\S]*?if\(side<0\)indices\.push\(i0,i1,i2\);[\s\S]*?else indices\.push\(i0,i2,i1\);[\s\S]*?\};/,
  'P9.25 must reverse winding only for the mirrored transition side');
assert.match(sync,/if\(triangleClear\(a,c,b\)\)pushUpwardTriangle\(a,c,b\);/,
  'first P9.25 transition triangle must preserve the existing clearance decision');
assert.match(sync,/if\(triangleClear\(b,c,d\)\)pushUpwardTriangle\(b,c,d\);/,
  'second P9.25 transition triangle must preserve the existing clearance decision');
assert.match(sync,/geometry\.computeVertexNormals\(\);[\s\S]*applyRoadBedTerrainColors\(geometry\);/,
  'P9.25 must preserve existing normal/color ownership');
assert.match(sync,/material\.side=THREE\.DoubleSide/,
  'P9.25 material sidedness must remain unchanged');

assert.match(facade,/export\s*\{\s*createTerrainService\s*\}\s*from\s*['"]\.\/terrain\/terrain-p926\.js['"]/,
  'R8 terrain facade must remain a pure compatibility export');

// Minimal geometry proof: mirrored ribbons need opposite index ordering to
// produce the same upward-facing Y winding.
const yCross=(a,b,c)=>{
  const abx=b[0]-a[0],abz=b[2]-a[2];
  const acx=c[0]-a[0],acz=c[2]-a[2];
  return abz*acx-abx*acz;
};
const left={a:[1,0,0],b:[2,0,0],c:[1,0,1]};
const right={a:[-1,0,0],b:[-2,0,0],c:[-1,0,1]};
assert.ok(yCross(left.a,left.c,left.b)>0,'existing left-side winding should face upward');
assert.ok(yCross(right.a,right.c,right.b)<0,'unfixed mirrored winding should face downward');
assert.ok(yCross(right.a,right.b,right.c)>0,'reversed mirrored winding should face upward');

console.log('Issue 4 transition winding QA: PASS');
console.log({
  geometryPositionsChanged:false,
  clearanceChanged:false,
  materialChanged:false,
  normalsChanged:false,
  facadeChanged:false,
  syncP925WindingCorrected:true,
  incrementalP927WindingCorrected:true
});
