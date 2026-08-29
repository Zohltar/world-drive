import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`./${p}`,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const base=read('src/terrain-p925.js');
const imagery=read('src/imagery.js');
const main=read('src/main.js');

assert.match(base,/function roadVisualHeightAt\(x,z\)/,'Terrain R2 road visual height API missing');
assert.match(base,/if\(!bucket\?\.length\)return null/,'road visual override must retain cheap spatial reject');
assert.match(base,/return refinedRoadVisualHeight\(x,z,departureSafe\)/,'road visual override must use refined earthwork');
assert.match(base,/roadVisualHeightAt,\n\s+rebuildGround/,'road visual API not exported');

assert.match(main,/sampleRoadVisualHeight:\(x,z\)=>terrainService\.roadVisualHeightAt\?\.\(x,z\)/,'main does not pass road visual sampler to imagery');
assert.match(imagery,/const roadVisual=options\?\.sampleRoadVisualHeight\?\.\(absx,absz\)/,'imagery fast sampler does not consult road visual override');
assert.match(imagery,/if\(Number\.isFinite\(roadVisual\)\)/,'imagery road visual override not guarded');
assert.match(imagery,/const mesh=resolveGroundMesh\(\)/,'P9.17 fast ground path must remain for non-road terrain');
assert.match(imagery,/terrainR2RoadVisualSamples:roadVisualSamples/,'Terrain R2 diagnostics missing');

console.log('TERRAIN R2 ROAD IMAGERY QA: PASS');
console.log('road corridor uses refined visual earthwork; non-road terrain keeps P9.17 fast grid sampling');
