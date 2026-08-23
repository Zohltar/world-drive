import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const src=path.join(root,'src');
const mainPath=path.join(src,'main.js');
const roadPath=path.join(src,'road-furniture.js');
const keyboardPath=path.join(src,'keyboard-controls.js');

for(const filePath of [mainPath,roadPath,keyboardPath]){
  assert.equal(fs.existsSync(filePath),true,`${path.basename(filePath)} missing — run the V21.25 road-furniture and keyboard refactors first`);
}

const main=fs.readFileSync(mainPath,'utf8');
const road=fs.readFileSync(roadPath,'utf8');
const keyboard=fs.readFileSync(keyboardPath,'utf8');

for(const pattern of [
  /V5\.1\.2 signs \+ enhanced bridge furniture/,
  /const signPoleMat=/,
  /const bridgeRailMat=/,
  /function makeSignTexture\s*\(/,
  /function addBridgeRailFromProfile\s*\(/,
  /function addCurrentRoadSigns\s*\(/,
  /const keys=\{\};/,
  /function assignKeyboardBinding\s*\(/,
  /addEventListener\('keydown',e=>\{/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns extracted implementation: ${pattern}`);
}

for(const pattern of [
  /from '\.\/road-furniture\.js'/,
  /createRoadFurnitureSystem\s*\(/,
  /roadFurniture\.addRoadSignAt/,
  /roadFurniture\.addEnhancedBridgeFurniture/,
  /roadFurniture\.refreshRoadSignsOnly/,
  /from '\.\/keyboard-controls\.js'/,
  /createKeyboardControls\s*\(/,
  /keyboardControls\.actionDown/,
  /keyboardControls\.clearState/
]){
  assert.match(main,pattern,`main.js missing deep-cleanup facade: ${pattern}`);
}

for(const pattern of [
  /export function createRoadFurnitureSystem\s*\(/,
  /function makeSignTexture\s*\(/,
  /function addRoadSignAt\s*\(/,
  /function addEnhancedBridgeFurniture\s*\(/,
  /function refreshRoadSignsOnly\s*\(/,
  /setRoadGuideSign\?\.\(currentRoadGuideSign\)/
]){
  assert.match(road,pattern,`road-furniture.js missing expected behavior: ${pattern}`);
}

for(const pattern of [
  /export function createKeyboardControls\s*\(/,
  /function actionDown\s*\(/,
  /function assignBinding\s*\(/,
  /worlddrive-keyboard-rebound/,
  /onManualTakeover\?\.\(\)/,
  /removeEventListener\('keydown',keydown\)/
]){
  assert.match(keyboard,pattern,`keyboard-controls.js missing expected behavior: ${pattern}`);
}

for(const filePath of [mainPath,roadPath,keyboardPath]){
  const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout||`${path.basename(filePath)} syntax check failed`);
}

const roadImport=await import(`${pathToFileURL(roadPath).href}?qa=${Date.now()}`);
const keyboardImport=await import(`${pathToFileURL(keyboardPath).href}?qa=${Date.now()}`);
assert.equal(typeof roadImport.createRoadFurnitureSystem,'function','createRoadFurnitureSystem export missing');
assert.equal(typeof keyboardImport.createKeyboardControls,'function','createKeyboardControls export missing');

const mainLines=main.split(/\r?\n/).length;
assert.ok(mainLines<6600,`main.js is still unexpectedly large after deep cleanup: ${mainLines} lines`);

console.log('V21.25 MAIN DEEP CLEANUP QA: PASS');
console.log(`main.js: ${mainLines} lines`);
console.log(`road-furniture.js: ${road.split(/\r?\n/).length} lines; keyboard-controls.js: ${keyboard.split(/\r?\n/).length} lines`);
console.log('road furniture + keyboard ownership: extracted; driving physics remains in main.js');