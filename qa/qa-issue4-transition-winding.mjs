import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');
const facade=fs.readFileSync(new URL('../src/terrain-p926.js',import.meta.url),'utf8');

assert.match(source,/const sides=\[-1,1\]\.map\(side=>\(\{/,
  'P9.27 transition must retain its two symmetric side ribbons');
assert.match(source,/const pushUpwardTriangle=\(i0,i1,i2\)=>\{[\s\S]*?if\(data\.side<0\)data\.indices\.push\(i0,i1,i2\);[\s\S]*?else data\.indices\.push\(i0,i2,i1\);[\s\S]*?\};/,
  'P9.27 must reverse winding only for the mirrored transition side');
assert.match(source,/if\(data\._triangleClear\(a,c,b\)\)pushUpwardTriangle\(a,c,b\);/,
  'first P9.27 transition triangle must preserve the existing clearance decision');
assert.match(source,/if\(data\._triangleClear\(b,c,d\)\)pushUpwardTriangle\(b,c,d\);/,
  'second P9.27 transition triangle must preserve the existing clearance decision');
assert.match(source,/data\.normals\[j\]=nx;data\.normals\[j\+1\]=ny;data\.normals\[j\+2\]=nz;/,
  'natural DEM normals must remain unchanged');
assert.match(source,/material\.side=THREE\.DoubleSide/,
  'material sidedness must remain unchanged for this focused correction');

assert.match(facade,/function normalizeUpwardTransitionWinding\(geometry\)/,
  'sync P9.25 output must have a narrow winding normalizer');
assert.match(facade,/if\(winding>=0\)return false;/,
  'sync normalizer must leave already-upward triangles untouched');
assert.match(facade,/indices\[i\+1\]=indices\[i\+2\];[\s\S]*indices\[i\+2\]=tmp;/,
  'sync normalizer must reverse only triangle index order');
assert.match(facade,/child\?\.name==='road-terrain-transition'[\s\S]*!child\?\.userData\?\.p927External[\s\S]*!child\?\.userData\?\.p927Hold/,
  'sync normalizer must exclude P9.27 external/held transitions');
assert.match(facade,/const result=originalSetRoadBed\.apply\(base,args\);[\s\S]*normalizeSyncRoadTransition\(options\.ground\);[\s\S]*return result;/,
  'sync correction must run only after the existing P9.25 setRoadBed result');

if(/material\s*=|\.material\.|setAttribute\(|setXYZ\(|position\.set\(/.test(facade)){
  throw new Error('FAIL: sync winding correction must not change material, colors, normals or positions');
}

// Minimal geometry proof: the two mirrored ribbons need opposite index ordering
// to produce the same upward-facing Y winding.
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
  syncP925WindingCorrected:true,
  incrementalP927WindingCorrected:true
});
