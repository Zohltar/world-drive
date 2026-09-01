import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/vehicles/models/sonata-glb.js',import.meta.url),'utf8');

assert.ok(source.includes("mat.envMapIntensity=Math.max(1.25,Number(mat.envMapIntensity)||1.25)"),'pilotable Sonata exterior environment response must match civilian tuning');
assert.ok(source.includes('preserve authored body color'),'pilotable Sonata exterior must explicitly preserve authored body color');
assert.ok(source.includes('roughness, metalness'),'pilotable Sonata exterior must preserve authored PBR response');
assert.ok(!source.includes('new THREE.Color(0xf1ece2)'),'legacy bright cream body emissive must not return');
assert.ok(!source.includes('mat.emissiveIntensity=.20'),'legacy body self-illumination intensity must not return');
assert.ok(!source.includes("mat.roughness=Math.max(.18,Math.min(.52,Number(mat.roughness)||.34))"),'pilotable Sonata exterior must not override authored roughness');
assert.ok(!source.includes("mat.metalness=Math.max(.08,Number(mat.metalness)||.08)"),'pilotable Sonata exterior must not override authored metalness');

// Lighting behavior remains independent from the body-material correction.
assert.ok(source.includes('new THREE.SpotLight(0xf8fbff,0,72,.36,.68,1.0)'),'pilotable Sonata must retain its authored headlight beam contract');
assert.ok(source.includes("setGlow(authoredRearGlowLayers,'red',0"),'pilotable Sonata must retain authored rear lamp glow');
assert.ok(source.includes("setGlow(authoredFrontGlowLayers,'white',0"),'pilotable Sonata must retain authored front lamp glow');

console.log('PASS Sonata authored cream body lighting');
console.log('  - exterior keeps the GLB-authored cream body color and PBR properties');
console.log('  - environment response matches the civilian Sonata baseline');
console.log('  - legacy artificial body emissive remains removed');
console.log('  - authored front/rear lamps and normal headlight beams remain intact');
