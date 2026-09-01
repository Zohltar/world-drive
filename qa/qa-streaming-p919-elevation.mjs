import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createElevationService} from '../src/elevation.js';

const source=fs.readFileSync(new URL('../src/elevation.js',import.meta.url),'utf8');

assert.match(source,/fastElevationAtWorld/,
  'P9.19 fast world-space DEM sampler missing');
assert.match(source,/FAST_REBASE_DISTANCE_M\s*=\s*9000/,
  'P9.19 local world->tile recalibration window missing');
assert.match(source,/hotImage&&tx===hotTx&&ty===hotTy/,
  'P9.19 hot DEM tile reuse missing');
assert.match(source,/set relativeWorldHeight\(_value\)/,
  'P9.19 compatibility setter missing');
assert.doesNotMatch(source,/function sample\(px,py\)/,
  'legacy per-sample Terrarium closure still present');

const cache={
  limits:{elevation:32},
  get(map,key){return map.get(key)??null;},
  touch(map,key,value){map.set(key,value);},
  trim(){}
};

// Affine local test converter; no network/image access is needed for this QA.
const service=createElevationService({
  cache,
  toLatLon:(x,z)=>({lat:46-z/111000,lon:-73+x/78000}),
  zoom:11
});

const fastBefore=service.relativeWorldHeight;
assert.equal(typeof fastBefore,'function',
  'relativeWorldHeight must expose the P9.19 fast sampler');

// main.js historically assigns a slow adapter here. P9.19 deliberately keeps
// that assignment harmless so terrain.js receives the optimized service path.
service.relativeWorldHeight=()=>123;
assert.equal(service.relativeWorldHeight,fastBefore,
  'legacy main.js assignment replaced the P9.19 fast sampler');

assert.equal(service.relativeWorldHeight(0,0),null,
  'without a loaded DEM tile the fast sampler should preserve null fallback');
assert.equal(service.relativeWorldHeight(100,100),null,
  'repeated fast samples should preserve missing-tile semantics');

const diag=service.diagnostics();
assert.ok(diag.fastSampleCount>=2,
  'fast sample counter did not advance');
assert.ok(diag.fastCalibrationCount>=1,
  'world-to-tile fast calibration did not run');
assert.equal(diag.exactSampleCount,0,
  'fast world samples unexpectedly used the exact trig path');

console.log('Streaming P9.19 elevation QA passed');
console.log({
  fastSampleCount:diag.fastSampleCount,
  exactSampleCount:diag.exactSampleCount,
  fastCalibrationCount:diag.fastCalibrationCount,
  fastRebaseDistanceM:diag.fastRebaseDistanceM
});
