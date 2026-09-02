import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWheelGroundSupport as facadeCreateWheelGroundSupport} from '../src/wheel-ground-support.js';
import {createWheelGroundSupport as physicsCreateWheelGroundSupport} from '../src/physics/wheel-ground-support.js';

const facadePath='src/wheel-ground-support.js';
const implementationPath='src/physics/wheel-ground-support.js';
const mainPath='src/main.js';
const r14Path='qa/qa-wheel-ground-reentry-r14.mjs';
const legacyQaPath='qa/V21_26_WHEEL_GROUND_SUPPORT_REFACTOR_QA.mjs';

for(const file of [facadePath,implementationPath,mainPath,r14Path,legacyQaPath]){
  assert.ok(fs.existsSync(file),`missing R5b contract file: ${file}`);
}

const facade=fs.readFileSync(facadePath,'utf8').replace(/\r\n/g,'\n').trim();
const implementation=fs.readFileSync(implementationPath,'utf8').replace(/\r\n/g,'\n');
const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
const r14=fs.readFileSync(r14Path,'utf8').replace(/\r\n/g,'\n');
const legacyQa=fs.readFileSync(legacyQaPath,'utf8').replace(/\r\n/g,'\n');

assert.equal(
  facade,
  "export { createWheelGroundSupport } from './physics/wheel-ground-support.js';",
  'root wheel-ground-support public facade changed'
);
assert.doesNotMatch(facade,/export function createWheelGroundSupport/,'implementation returned to root facade');
assert.match(implementation,/export function createWheelGroundSupport\s*\(\{/,'physics wheel-ground implementation missing');
assert.equal(facadeCreateWheelGroundSupport,physicsCreateWheelGroundSupport,'root facade is not the exact physics implementation export');

assert.match(
  main,
  /import \{ createWheelGroundSupport \} from '\.\/wheel-ground-support\.js';/,
  'main.js must keep the stable root wheel-ground-support boundary'
);
assert.match(
  r14,
  /from '\.\.\/src\/wheel-ground-support\.js';/,
  'R14 must keep exercising the public root facade'
);
assert.match(
  legacyQa,
  /path\.join\(root,'src','physics','wheel-ground-support\.js'\)/,
  'legacy implementation-inspection QA must follow the implementation under src/physics'
);

for(const forbidden of [
  'src/braking.js',
  'src/abs-system.js',
  'src/wheel-friction.js',
  'src/truck-physics-adapter.js'
]){
  assert.equal(fs.existsSync(forbidden),false,`R5b unexpectedly recreated audit-only historical companion ${forbidden}`);
}

console.log('SOURCE TREE R5b WHEEL GROUND SUPPORT QA: PASS',{
  rootFacade:facadePath,
  implementation:implementationPath,
  publicBoundaryPreserved:true,
  implementationRelocated:true
});
