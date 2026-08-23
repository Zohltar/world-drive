import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const src=path.join(root,'src');
const mainPath=path.join(src,'main.js');
const modulePath=path.join(src,'road-geometry.js');

assert.equal(fs.existsSync(mainPath),true,'src/main.js missing');
assert.equal(fs.existsSync(modulePath),true,'src/road-geometry.js missing — run tools/refactor-main-road-geometry-v21-25.mjs first');

const main=fs.readFileSync(mainPath,'utf8');
const road=fs.readFileSync(modulePath,'utf8');

for(const pattern of [
  /\/\/ ---------- continuous road ribbon ----------/,
  /function roadLateralFrame\s*\(/,
  /function buildRoadProfile\s*\(/,
  /const ROAD_PROFILE_INDEX_CELL=48;/,
  /function evaluateRoadProfileSegmentInto\s*\(/,
  /\bactiveRoadProfile=profile;/,
  /\bactiveRoadProfile=\[\];/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns extracted road geometry: ${pattern}`);
}

for(const pattern of [
  /from '\.\/road-geometry\.js'/,
  /const roadGeometry=createRoadGeometrySystem\s*\(/,
  /const activeRoadProfile=roadGeometry\.profile;/,
  /const buildRoadProfile=\(\)=>roadGeometry\.buildProfile\(\);/,
  /const buildRibbon=\(\.\.\.args\)=>roadGeometry\.buildRibbon\(\.\.\.args\);/,
  /const roadFrameAt=\(\.\.\.args\)=>roadGeometry\.roadFrameAt\(\.\.\.args\);/,
  /setActiveRoadProfile\(profile\);/,
  /clearActiveRoadProfile\(\);/,
  /function terrainFrameAt\s*\(/
]){
  assert.match(main,pattern,`main.js missing road geometry facade: ${pattern}`);
}

for(const pattern of [
  /export function createRoadGeometrySystem\s*\(/,
  /const activeRoadProfile=\[\];/,
  /function roadLateralFrame\s*\(/,
  /function buildLateralBand\s*\(/,
  /function buildRibbon\s*\(/,
  /function buildOffsetRibbon\s*\(/,
  /function buildRoadVolume\s*\(/,
  /function buildRoadProfile\s*\(/,
  /function rebuildRoadProfileSpatialIndex\s*\(/,
  /function roadFrameAt\s*\(/,
  /function roadProfileFrameAtCum\s*\(/,
  /function roadHeightAt\s*\(/,
  /function roadSurfaceAt\s*\(/,
  /function setProfile\s*\(/,
  /profile:activeRoadProfile/
]){
  assert.match(road,pattern,`road-geometry.js missing expected behavior: ${pattern}`);
}

for(const filePath of [mainPath,modulePath]){
  const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout||`${path.basename(filePath)} syntax check failed`);
}

// Lightweight behavioral test of the extracted profile/index ownership without
// needing WebGL or DOM. This protects the road-contact math used by wheel support.
const imported=await import(`${pathToFileURL(modulePath).href}?qa=${Date.now()}`);
assert.equal(typeof imported.createRoadGeometrySystem,'function','createRoadGeometrySystem export missing');

const roadSystem=imported.createRoadGeometrySystem({
  THREE:{},
  roadEdgeMat:{},
  roadUnderMat:{},
  ROAD_SURFACE_OFFSET:.10,
  terrainAbs:()=>0,
  nearestRoute:()=>({cum:0}),
  bridgeHeightAtCum:()=>null,
  bridgeManager:{isNearApproach:()=>false},
  getState:()=>({
    absX:0,
    absZ:0,
    routeLength:100,
    segments:[],
    worldOffset:{x:0,z:0}
  })
});

const stableProfile=roadSystem.profile;
roadSystem.setProfile([
  {x:0,z:0,y:10,cum:0,roll:0},
  {x:0,z:100,y:20,cum:100,roll:0}
]);
assert.equal(roadSystem.profile,stableProfile,'profile array identity must remain stable');
assert.equal(stableProfile.length,2,'setProfile must populate stable profile');

const frame=roadSystem.roadFrameAt(3,50);
assert.ok(frame,'roadFrameAt should resolve the test segment');
assert.ok(Math.abs(frame.y-15)<1e-9,`roadFrameAt interpolation changed: ${frame.y}`);
assert.ok(Math.abs(frame.distance-3)<1e-9,`roadFrameAt distance changed: ${frame.distance}`);

const cumulative=roadSystem.roadProfileFrameAtCum(50);
assert.ok(cumulative,'roadProfileFrameAtCum should resolve the test segment');
assert.ok(Math.abs(cumulative.y-15)<1e-9,`cumulative height interpolation changed: ${cumulative.y}`);
assert.ok(Math.abs(cumulative.z-50)<1e-9,`cumulative position interpolation changed: ${cumulative.z}`);

const surface=roadSystem.roadSurfaceAt(3,50);
assert.ok(surface,'roadSurfaceAt should resolve the test segment');
assert.ok(Math.abs(surface.y-15.10)<1e-9,`road surface offset changed: ${surface.y}`);

roadSystem.clearProfile();
assert.equal(stableProfile.length,0,'clearProfile must preserve identity and clear contents');
assert.equal(roadSystem.roadFrameAt(0,0),null,'cleared profile should have no road frame');

const mainLines=main.split(/\r?\n/).length;
const roadLines=road.split(/\r?\n/).length;
assert.ok(mainLines<6100,`main.js is still unexpectedly large after road geometry extraction: ${mainLines} lines`);

console.log('V21.25 ROAD GEOMETRY REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; road-geometry.js: ${roadLines} lines`);
console.log('road profile identity/index/interpolation/surface offset: verified');