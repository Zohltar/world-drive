import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(new URL(p,root))).digest('hex');
const main=read('src/main.js');
const pkg=JSON.parse(read('package.json'));

assert.equal(pkg.version,'21.23.0');
assert.ok(main.includes("version:'21.23.0-candidate'"));

// V21.22.6 terrain/satellite modules are intentionally byte-for-byte retained.
const unchanged={
  'src/terrain.js':'dac3de9d375c8bc314ea3c065ad69554e22e2b715fb1e012bf91a0c77c0e8a7f',
  'src/imagery.js':'e3df74bd976b078c4f8ac2e32384c4ea2589a61dbdfc1064d855657ca2f88d46',
  'src/vehicle-dynamics.js':'b8898f7f99061e35563862362e3f1afa02171a788d6a94a2fe7ffb1ab835ddb4',
  'src/vehicle-presentation.js':'60cedf69ce50716155ea11da313a8d1949a2019ae2bc9a7394e8b7c2d4133f08'
};
for(const [path,expected] of Object.entries(unchanged)){
  assert.equal(sha(path),expected,`${path} changed unexpectedly from V21.22.6 baseline`);
}

// Main still carries the validated terrain ownership and hitch-free policy.
for(const needle of [
  'const NEAR_TERRAIN_SIZE=5600;',
  'const NEAR_TERRAIN_SEGMENTS=448;',
  'perfConsoleLogging:false',
  'shiftRenderedWorldForOrigin(shiftX,shiftZ)',
  'const TERRAIN_PRELOAD_BUFFER={',
  'aheadDistance:10500',
  'stencilRef:2',
  'stencilFunc:THREE.NotEqualStencilFunc',
  'ground.renderOrder=-5',
  'chunkSegments:96'
]){
  assert.ok(main.includes(needle),`V21.22.6 baseline policy missing: ${needle}`);
}

console.log('V21.23.0 BASELINE REGRESSION QA: PASS');
console.log('terrain/imagery/dynamics/presentation unchanged from V21.22.6');
