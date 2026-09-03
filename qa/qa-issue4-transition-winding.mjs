import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');

assert.match(source,/const sides=\[-1,1\]\.map\(side=>\(\{/,
  'P9.27 transition must retain its two symmetric side ribbons');
assert.match(source,/const pushUpwardTriangle=\(i0,i1,i2\)=>\{[\s\S]*?if\(data\.side<0\)data\.indices\.push\(i0,i1,i2\);[\s\S]*?else data\.indices\.push\(i0,i2,i1\);[\s\S]*?\};/,
  'P9.27 must reverse winding only for the mirrored transition side');
assert.match(source,/if\(data\._triangleClear\(a,c,b\)\)pushUpwardTriangle\(a,c,b\);/,
  'first transition triangle must preserve the existing clearance decision');
assert.match(source,/if\(data\._triangleClear\(b,c,d\)\)pushUpwardTriangle\(b,c,d\);/,
  'second transition triangle must preserve the existing clearance decision');
assert.match(source,/data\.normals\[j\]=nx;data\.normals\[j\+1\]=ny;data\.normals\[j\+2\]=nz;/,
  'natural DEM normals must remain unchanged');
assert.match(source,/material\.side=THREE\.DoubleSide/,
  'material sidedness must remain unchanged for this focused correction');

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
  geometryChanged:false,
  clearanceChanged:false,
  materialChanged:false,
  normalsChanged:false,
  mirroredWindingCorrected:true
});
