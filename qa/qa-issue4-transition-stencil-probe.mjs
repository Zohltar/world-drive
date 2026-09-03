import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/terrain/world-scene.js', import.meta.url), 'utf8');

const checks = [
  ['transition materials are collected from transition meshes', /const transitionMaterials=.*transitionMeshes\(\)/],
  ['diagnostic exposes transitionStencil helper', /transitionStencil:\(enabled=true\)=>/],
  ['transitionStencil only toggles material stencil participation', /material\.stencilWrite=!!enabled/],
  ['transitionStencil recompiles material state', /material\.needsUpdate=true/],
  ['restore re-enables transition stencil participation', /material\.stencilWrite=true/],
];

for (const [label, pattern] of checks) {
  if (!pattern.test(source)) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

console.log('Issue 4 transition stencil probe QA: PASS');
