import assert from 'node:assert/strict';
import fs from 'node:fs';

const terrain=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');

assert.match(
  terrain,
  /const shade=Math\.max\(\.56,Math\.min\(1\.36,\.72\+directional\*\.46-slope\*\.10\)\)/,
  'Issue #4 candidate must raise only the P9.27 baked transition shade floor to 0.56'
);
assert.match(
  terrain,
  /const lightX=-\.58,lightY=\.64,lightZ=-\.50/,
  'Issue #4 candidate must preserve the existing transition light direction'
);
assert.match(
  terrain,
  /data\.normals\[j\]=nx;data\.normals\[j\+1\]=ny;data\.normals\[j\+2\]=nz/,
  'Issue #4 candidate must preserve natural DEM normals'
);
assert.match(
  terrain,
  /data\.positions\[j\]=wx-offset\.x;data\.positions\[j\+1\]=Math\.min\(natural,support\*\(1-rise\)\+natural\*rise\);data\.positions\[j\+2\]=wz-offset\.z/,
  'Issue #4 candidate must not alter transition geometry'
);
assert.match(
  terrain,
  /material\.side=THREE\.DoubleSide;material\.polygonOffset=true;material\.polygonOffsetFactor=1;material\.polygonOffsetUnits=1/,
  'Issue #4 candidate must preserve transition material/depth policy'
);
assert.match(
  terrain,
  /mesh\.receiveShadow=true;mesh\.castShadow=false;mesh\.renderOrder=-1/,
  'Issue #4 candidate must preserve shadow and render-order policy'
);

console.log('Issue 4 transition shading candidate QA: PASS');
