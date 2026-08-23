import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','instrument-cluster.js');

assert.equal(fs.existsSync(mainPath),true,'src/main.js missing');
assert.equal(fs.existsSync(modulePath),true,'src/instrument-cluster.js missing — run tools/refactor-main-instruments-v21-25.mjs first');

const main=fs.readFileSync(mainPath,'utf8');
const cluster=fs.readFileSync(modulePath,'utf8');

for(const pattern of [
  /V20\.7 unified instrument cluster/,
  /function drawGaugeBezel\s*\(/,
  /function drawTachometer\s*\(/,
  /function drawSpeedGauge\s*\(/,
  /function rebuildCompassTape\s*\(/,
  /function headingDeg\s*\(/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns extracted instrument code: ${pattern}`);
}

for(const pattern of [
  /from '\.\/instrument-cluster\.js'/,
  /const instrumentCluster=createInstrumentCluster\s*\(/,
  /currentOnPavementForInstruments/,
  /engineRpm/,
  /transmissionGear/,
  /drawSpeedometer/,
  /drawCompass/
]){
  assert.match(main,pattern,`main.js missing instrument integration: ${pattern}`);
}

for(const pattern of [
  /export function createInstrumentCluster\s*\(/,
  /function setGameControlsHidden\s*\(/,
  /function drawGaugeBezel\s*\(/,
  /function drawTachometer\s*\(/,
  /function drawSpeedGauge\s*\(/,
  /function drawSpeedometer\s*\(/,
  /function rebuildCompassTape\s*\(/,
  /function drawCompass\s*\(/,
  /syncInstrumentState\(\);/
]){
  assert.match(cluster,pattern,`instrument-cluster.js missing expected code: ${pattern}`);
}

function checkSyntax(file,label){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout||`${label} syntax check failed`);
}

checkSyntax(mainPath,'main.js');
checkSyntax(modulePath,'instrument-cluster.js');

console.log('V21.25 INSTRUMENT REFACTOR QA: PASS');
console.log(`main.js: ${main.split(/\r?\n/).length} lines; instrument-cluster.js: ${cluster.split(/\r?\n/).length} lines`);
