import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/terrain/world-scene.js', import.meta.url), 'utf8');

const checks = [
  ['transition geometry diagnostic exists', /transitionGeometry:\(\)=>transitionGeometryState\(\)/],
  ['geometry probe reads transition mesh position data', /const position=mesh\.geometry\?\.getAttribute\?\.\('position'\)/],
  ['geometry probe reads transition normal data', /const normal=mesh\.geometry\?\.getAttribute\?\.\('normal'\)/],
  ['geometry probe measures vertical delta', /maxVerticalDelta=Math\.max\(maxVerticalDelta,vertical\)/],
  ['geometry probe measures slope', /maxSlope=Math\.max\(maxSlope,slope\)/],
  ['geometry probe counts steep edges', /if\(vertical>8&&slope>2\)steepEdges\+\+/],
  ['geometry probe measures triangle winding', /const windingY=.*\(bz-az\).*\(cx-ax\).*\(bx-ax\).*\(cz-az\)/],
  ['geometry probe reports positive winding', /positiveWindingY/],
  ['geometry probe reports negative winding', /negativeWindingY/],
  ['geometry probe reports vertex normal direction', /positiveVertexNormals[\s\S]*negativeVertexNormals/],
  ['geometry probe is read-only for mesh geometry', /transitionGeometryState=.*transitionMeshes\(\)\.map/s],
];

for (const [label, pattern] of checks) {
  if (!pattern.test(source)) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

if (/transitionGeometry[\s\S]{0,1200}(?:setAttribute|setIndex|dispose\(|visible=|material=)/.test(source)) {
  throw new Error('FAIL: transition geometry probe must remain read-only');
}

console.log('Issue 4 transition geometry probe QA: PASS');
