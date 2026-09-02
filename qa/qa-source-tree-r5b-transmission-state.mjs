import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as networkFacade from '../src/transmission-network-state.js';
import * as networkImplementation from '../src/physics/transmission-network-state.js';
import * as runtimeFacade from '../src/transmission-runtime-bridge.js';
import * as runtimeImplementation from '../src/physics/transmission-runtime-bridge.js';

const networkFacadePath='src/transmission-network-state.js';
const networkImplementationPath='src/physics/transmission-network-state.js';
const runtimeFacadePath='src/transmission-runtime-bridge.js';
const runtimeImplementationPath='src/physics/transmission-runtime-bridge.js';
const controllerPath='src/transmission-controller.js';
const drivingRuntimePath='src/driving-runtime.js';
const multiplayerPath='src/multiplayer.js';
const c2Path='qa/qa-transmission-c2.mjs';

for(const file of [
  networkFacadePath,networkImplementationPath,
  runtimeFacadePath,runtimeImplementationPath,
  controllerPath,drivingRuntimePath,multiplayerPath,c2Path
])assert.ok(fs.existsSync(file),`missing R5b.2 contract file: ${file}`);

const read=file=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const networkRoot=read(networkFacadePath).trim();
const networkImpl=read(networkImplementationPath);
const runtimeRoot=read(runtimeFacadePath).trim();
const runtimeImpl=read(runtimeImplementationPath);
const controller=read(controllerPath);
const drivingRuntime=read(drivingRuntimePath);
const multiplayer=read(multiplayerPath);
const c2=read(c2Path);

assert.equal(networkRoot,"export * from './physics/transmission-network-state.js';",'network-state root facade changed');
assert.equal(runtimeRoot,"export * from './physics/transmission-runtime-bridge.js';",'runtime-bridge root facade changed');
assert.doesNotMatch(networkRoot,/let gear=|function normalizeGear/,'network-state implementation returned to root');
assert.doesNotMatch(runtimeRoot,/const state=|publishTransmissionRuntimeState/,'runtime-bridge implementation returned to root');

for(const [name,value] of Object.entries(networkImplementation)){
  assert.equal(networkFacade[name],value,`network-state facade export identity drift: ${name}`);
}
for(const [name,value] of Object.entries(runtimeImplementation)){
  assert.equal(runtimeFacade[name],value,`runtime-bridge facade export identity drift: ${name}`);
}
assert.deepEqual(Object.keys(networkFacade).sort(),Object.keys(networkImplementation).sort(),'network-state facade export surface drift');
assert.deepEqual(Object.keys(runtimeFacade).sort(),Object.keys(runtimeImplementation).sort(),'runtime-bridge facade export surface drift');

assert.match(networkImpl,/if\(value===null\|\|value===undefined\|\|value===''\)return null;/,'missing null-safe exact gear normalization');
assert.match(networkImpl,/return n<0\?-1:n===0\?0:Math\.max\(1,Math\.floor\(n\)\);/,'R/N/D exact gear normalization changed');
assert.match(runtimeImpl,/from '\.\/transmission-network-state\.js';/,'runtime bridge must consume sibling physics network state');
assert.match(runtimeImpl,/const gear=Number\(readTransmissionNetworkGear\(\)\);/,'runtime selector synchronization changed');

assert.match(controller,/from '\.\/transmission-runtime-bridge\.js';/,'controller must keep stable root runtime bridge boundary');
assert.match(controller,/from '\.\/transmission-network-state\.js';/,'controller must keep stable root network-state boundary');
assert.match(drivingRuntime,/from '\.\/transmission-runtime-bridge\.js';/,'driving runtime must keep stable root bridge boundary');
assert.match(multiplayer,/from '\.\/transmission-network-state\.js';/,'multiplayer must keep stable root exact-gear boundary');
assert.match(c2,/from '\.\.\/src\/transmission-runtime-bridge\.js';/,'C2 must keep exercising root runtime facade');
assert.match(c2,/from '\.\.\/src\/transmission-network-state\.js';/,'C2 must keep exercising root network facade');

console.log('SOURCE TREE R5b TRANSMISSION STATE QA: PASS',{
  networkFacade:networkFacadePath,
  runtimeFacade:runtimeFacadePath,
  implementations:[networkImplementationPath,runtimeImplementationPath],
  exactGearBoundaryPreserved:true
});
