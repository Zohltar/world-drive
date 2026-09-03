import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/terrain/world-scene.js', import.meta.url), 'utf8');

const checks = [
  ['transition layer remains dynamically discovered', /name==='transition'[\s\S]*road-terrain-transition/],
  ['transition meshes are collected without changing runtime defaults', /const transitionMeshes=.*dynamicMatches\('transition'\)/],
  ['diagnostic exposes transitionShadow helper', /transitionShadow:\(receive=true\)=>/],
  ['transitionShadow only mutates receiveShadow', /for\(const mesh of transitionMeshes\(\)\)mesh\.receiveShadow=!!receive/],
  ['restore re-enables transition shadow receiving', /for\(const mesh of transitionMeshes\(\)\)mesh\.receiveShadow=true/],
];

for (const [label, pattern] of checks) {
  if (!pattern.test(source)) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

if (/castShadow\s*=/.test(source)) {
  throw new Error('FAIL: layer probe must not mutate castShadow');
}

console.log('Issue 4 transition shadow probe QA: PASS');
