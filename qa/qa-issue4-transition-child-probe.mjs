import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/terrain/world-scene.js', import.meta.url), 'utf8');

const checks = [
  ['transition mesh state helper exists', /const transitionMeshState=\(\)=>transitionMeshes\(\)\.map/],
  ['diagnostic exposes transitionMeshes inventory', /transitionMeshes:\(\)=>transitionMeshState\(\)/],
  ['diagnostic exposes indexed transitionMesh toggle', /transitionMesh:\(index,visible=true\)=>/],
  ['indexed toggle only changes child visibility', /meshes\[i\]\.visible=!!visible/],
  ['restore re-enables child visibility', /mesh\.visible=true;[\s\S]*mesh\.receiveShadow=true/],
];

for (const [label, pattern] of checks) {
  if (!pattern.test(source)) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

console.log('Issue 4 transition child probe QA: PASS');
