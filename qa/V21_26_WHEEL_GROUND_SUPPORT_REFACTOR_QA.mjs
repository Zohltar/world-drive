import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','wheel-ground-support.js');

assert.ok(fs.existsSync(modulePath),'src/wheel-ground-support.js missing — run tools/refactor-main-wheel-ground-support-v21-26.mjs first');

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
const supportSource=fs.readFileSync(modulePath,'utf8').replace(/\r\n/g,'\n');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${path.basename(file)} syntax failed:\n${result.stderr||result.stdout}`);
}
syntaxCheck(mainPath);
syntaxCheck(modulePath);

for(const pattern of [
  /import \{ createWheelGroundSupport \} from '\.\/wheel-ground-support\.js';/,
  /const wheelGroundSupport=createWheelGroundSupport\(\{/,
  /roadHalfWidth:ROAD_WHEEL_CONTACT_HALF_WIDTH/,
  /function setFastWheelRoadSupport\(active,roadFrame,centerY,centerX=absX,centerZ=absZ\)\{/,
  /wheelGroundSupport\.setFastWheelRoadSupport\(active,roadFrame,centerY,centerX,centerZ\)/,
  /function groundHeightForWheel\(\.\.\.args\)\{/,
  /wheelGroundSupport\.groundHeightForWheel\(\.\.\.args\)/,
  /let currentOnPavementForInstruments=true;/
]){
  assert.match(main,pattern,`main.js missing wheel ground support facade/runtime state: ${pattern}`);
}

assert.doesNotMatch(
  supportSource,
  /currentOnPavementForInstruments/,
  'wheel-ground-support.js must not own driving/instrument pavement state'
);

for(const pattern of [
  /const groundHeightRoadScratch=\{\};/,
  /const fastWheelRoadSupport=\{/,
  /fastWheelRoadSupport\.tanPitch=/,
  /const rs=roadSurfaceAt\(absx,absz,groundHeightRoadScratch\);/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns wheel ground support implementation: ${pattern}`);
}

for(const pattern of [
  /export function createWheelGroundSupport\s*\(\{/,
  /const groundHeightRoadScratch=\{\};/,
  /const supportOuterHalfWidth=Math\.max\(4,Number\(roadHalfWidth\)\|\|8\.5\);/,
  /const supportCoreHalfWidth=Math\.min\(/,
  /const fastWheelRoadSupport=\{/,
  /halfWidth:supportOuterHalfWidth/,
  /coreHalfWidth:supportCoreHalfWidth/,
  /function setFastWheelRoadSupport\(active,roadFrame,centerY,centerX,centerZ\)\{/,
  /Math\.tan\(Number\(roadFrame\.pitch\)\|\|0\)/,
  /Math\.tan\(Number\(roadFrame\.roll\)\|\|0\)/,
  /function blendRoadToTerrain\(roadY,terrainY,lateral\)\{/,
  /function groundHeightForWheel\(absx,absz,preferLocalRoadPlane=false\)\{/,
  /Math\.abs\(lateral\)>=supportOuterHalfWidth/,
  /Math\.abs\(along\)>=8\.5/,
  /roadSurfaceAt\(absx,absz,groundHeightRoadScratch\)/,
  /Math\.abs\(Number\(rs\.lateral\)\|\|0\)>=supportOuterHalfWidth/,
  /const terrainY=terrainHeight\(absx,absz\);/,
  /return blendRoadToTerrain\(roadSample\.y,terrainY,roadSample\.lateral\);/
]){
  assert.match(supportSource,pattern,`wheel-ground-support.js missing expected behavior: ${pattern}`);
}

const { createWheelGroundSupport }=await import(`${pathToFileURL(modulePath).href}?qa=${Date.now()}`);
assert.equal(typeof createWheelGroundSupport,'function','createWheelGroundSupport export missing');

let roadCalls=0;
let terrainCalls=0;
let scratchRef=null;
const controller=createWheelGroundSupport({
  roadHalfWidth:4,
  roadSurfaceAt:(x,z,scratch)=>{
    roadCalls++;
    if(!scratchRef)scratchRef=scratch;
    else assert.equal(scratch,scratchRef,'road-height scratch identity changed between calls');
    if(x===50)return {lateral:2,y:42};
    return {lateral:6,y:99};
  },
  terrainAbs:()=>{
    terrainCalls++;
    return 7;
  }
});

assert.equal(controller.support.active,false,'fast support should start inactive');
assert.equal(controller.support.halfWidth,4,'outer wheel-support width no longer follows configured road half-width');
assert.equal(controller.support.coreHalfWidth,3.75,'R14 solid road-core width changed');
controller.setFastWheelRoadSupport(
  true,
  {
    angle:0,
    pitch:Math.atan(.1),
    roll:Math.atan(.2)
  },
  10,
  100,
  200
);
assert.equal(controller.support.active,true,'fast support did not activate');
assert.equal(controller.support.centerX,100,'fast support center X changed');
assert.equal(controller.support.centerZ,200,'fast support center Z changed');
assert.equal(controller.support.centerY,10,'fast support center Y changed');

const localHeight=controller.groundHeightForWheel(101,202,true);
assert.ok(Math.abs(localHeight-10)<1e-10,`local road-plane interpolation changed: ${localHeight}`);
assert.equal(roadCalls,0,'fast local road plane unexpectedly performed a road lookup');
assert.equal(terrainCalls,1,'R14 fast support must sample terrain for shoulder blending');

const roadHeight=controller.groundHeightForWheel(50,0,false);
assert.ok(Math.abs(roadHeight-42.1)<1e-10,`road-surface wheel support changed: ${roadHeight}`);
assert.equal(roadCalls,1,'road fallback lookup count changed');
assert.equal(terrainCalls,2,'R14 road fallback must retain terrain sample for shoulder blending');

const terrainHeight=controller.groundHeightForWheel(60,0,false);
assert.equal(terrainHeight,7,'terrain wheel support fallback changed');
assert.equal(roadCalls,2,'terrain fallback should still query road first');
assert.equal(terrainCalls,3,'terrain fallback lookup count changed');

controller.setFastWheelRoadSupport(false,null,NaN,0,0);
assert.equal(controller.support.active,false,'invalid/disabled support did not clear active state');

const mainLines=main.split('\n').length;
assert.ok(mainLines<3290,`main.js is still unexpectedly large after wheel ground support extraction: ${mainLines} lines`);

const r14Regression=spawnSync(process.execPath,['qa-wheel-ground-reentry-r14.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(r14Regression.status,0,`Grip R14 road/terrain re-entry regressed:\n${r14Regression.stderr||r14Regression.stdout}`);

const autopilotRegression=spawnSync(process.execPath,['qa/V21_26_AUTOPILOT_REFACTOR_QA.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(autopilotRegression.status,0,`prior V21.26 refactors regressed:\n${autopilotRegression.stderr||autopilotRegression.stdout}`);

const transmissionRegression=spawnSync(process.execPath,['qa/V21_26_AUTOPILOT_TRANSMISSION_QA.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(transmissionRegression.status,0,`autopilot transmission fix regressed:\n${transmissionRegression.stderr||transmissionRegression.stdout}`);

console.log('V21.26 WHEEL GROUND SUPPORT REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; wheel-ground-support.js: ${supportSource.split('\n').length} lines`);
console.log('fast local road plane / R14 road-terrain blend / road fallback / terrain fallback / scratch reuse / pavement instrument state verified');
