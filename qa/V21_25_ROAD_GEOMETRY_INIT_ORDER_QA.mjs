import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');

assert.equal(fs.existsSync(mainPath),true,'src/main.js missing');
const main=fs.readFileSync(mainPath,'utf8');

const hoisted=[
  'function buildRoadProfile(){return roadGeometry.buildProfile();}',
  'function setActiveRoadProfile(profile){return roadGeometry.setProfile(profile);}',
  'function clearActiveRoadProfile(){return roadGeometry.clearProfile();}',
  'function rebuildRoadProfileSpatialIndex(){return roadGeometry.rebuildIndex();}',
  'function buildLateralBand(...args){return roadGeometry.buildLateralBand(...args);}',
  'function buildRibbon(...args){return roadGeometry.buildRibbon(...args);}',
  'function buildOffsetRibbon(...args){return roadGeometry.buildOffsetRibbon(...args);}',
  'function buildRoadVolume(...args){return roadGeometry.buildRoadVolume(...args);}',
  'function roadFrameAt(...args){return roadGeometry.roadFrameAt(...args);}',
  'function roadProfileFrameAtCum(...args){return roadGeometry.roadProfileFrameAtCum(...args);}',
  'function roadHeightAt(...args){return roadGeometry.roadHeightAt(...args);}',
  'function roadSurfaceAt(...args){return roadGeometry.roadSurfaceAt(...args);}'
];

for(const signature of hoisted){
  assert.match(main,new RegExp(signature.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`missing hoisted road facade: ${signature}`);
}

for(const pattern of [
  /const buildRibbon=\(\.\.\.args\)=>roadGeometry\.buildRibbon/,
  /const roadFrameAt=\(\.\.\.args\)=>roadGeometry\.roadFrameAt/,
  /const roadHeightAt=\(\.\.\.args\)=>roadGeometry\.roadHeightAt/,
  /const roadSurfaceAt=\(\.\.\.args\)=>roadGeometry\.roadSurfaceAt/
]){
  assert.doesNotMatch(main,pattern,`TDZ-prone road facade still present: ${pattern}`);
}

const firstUse=main.indexOf('roadSurfaceAt,');
const facade=main.indexOf('function roadSurfaceAt(...args)');
assert.ok(firstUse>=0,'expected early roadSurfaceAt callback use missing');
assert.ok(facade>=0,'roadSurfaceAt function facade missing');
assert.ok(firstUse<facade,'QA expects roadSurfaceAt to be referenced before its textual declaration; hoisting is required');

const result=spawnSync(process.execPath,['--check',mainPath],{cwd:root,encoding:'utf8'});
assert.equal(result.status,0,result.stderr||result.stdout||'main.js syntax check failed');

console.log('V21.25 ROAD GEOMETRY INIT ORDER QA: PASS');
console.log('road geometry facade is hoisted; early callback wiring cannot hit const TDZ');
