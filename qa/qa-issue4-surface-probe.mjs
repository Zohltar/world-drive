import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

assert.match(source,/worldDriveDiagnostics\.presentation\.issue4Surface=\(x=absX,z=absZ\)=>\{/,
  'Issue 4 surface probe must default to the current vehicle world X/Z');
assert.match(source,/const physicalY=terrainAbs\(worldX,worldZ\);/,
  'surface probe must report the authoritative physics terrain height');
assert.match(source,/terrainService\.renderHeightAt\?\.\(worldX,worldZ\)/,
  'surface probe must report the analytic rendered terrain height');
assert.match(source,/terrainService\.roadVisualHeightAt\?\.\(worldX,worldZ\)/,
  'surface probe must report the road visual analytic height when available');
assert.match(source,/groundHeightForWheel\(worldX,worldZ,false\)/,
  'surface probe must report the ordinary wheel-support height');
assert.match(source,/groundHeightForWheel\(worldX,worldZ,true\)/,
  'surface probe must report the fast/local wheel-support height');
assert.match(source,/issue4RaycastHeight\(\[ground\],renderX,renderZ\)/,
  'surface probe must raycast the actual rendered ground mesh');
assert.match(source,/issue4RaycastHeight\(transitionRoots,renderX,renderZ\)/,
  'surface probe must raycast the actual transition presentation meshes');
assert.match(source,/physicalHeightAt:[\s\S]*analyticRenderHeightAt:[\s\S]*wheelSupportY:[\s\S]*rasterGround:[\s\S]*rasterTransition:/,
  'surface probe must return the physical, analytic, wheel and rasterized surfaces together');

const start=source.indexOf('// Issue #4 read-only surface probe.');
const end=source.indexOf('// V21.27.2 diagnostics only.',start);
assert.ok(start>=0&&end>start,'surface probe block must remain narrowly scoped in diagnostics');
const block=source.slice(start,end);
for(const forbidden of [
  'setState(',
  'car.position.set(',
  'ground.position.set(',
  '.geometry.setAttribute(',
  '.material=',
  'terrainService.setRoadBed(',
]){
  assert.ok(!block.includes(forbidden),`surface probe must remain read-only: ${forbidden}`);
}

console.log('Issue 4 physical/rendered surface probe QA: PASS');
console.log({
  readOnly:true,
  physicsHeight:true,
  analyticRenderHeight:true,
  wheelSupportHeight:true,
  rasterGround:true,
  rasterTransition:true
});
