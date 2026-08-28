import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('./src/sonata-glb.js',import.meta.url),'utf8');

assert.ok(source.includes('if(mat.emissiveMap)mat.emissiveMap=null;'),'pilotable Sonata exterior must not self-light from the base-color texture');
assert.ok(source.includes('if(mat.emissive)mat.emissive.setHex(0x000000);'),'pilotable Sonata exterior emissive color must be neutralized');
assert.ok(source.includes('mat.emissiveIntensity=0;'),'pilotable Sonata exterior emissive intensity must be zero');
assert.ok(source.includes("mat.envMapIntensity=Math.max(1.25,Number(mat.envMapIntensity)||1.25)"),'pilotable Sonata exterior environment response must match civilian tuning');
assert.ok(!source.includes('new THREE.Color(0xf1ece2)'),'legacy bright cream body emissive must not return');
assert.ok(!source.includes('mat.emissiveIntensity=.20'),'legacy body self-illumination intensity must not return');

// Lighting behavior remains independent from the body-material correction.
assert.ok(source.includes('new THREE.SpotLight(0xf8fbff,0,72,.36,.68,1.0)'),'pilotable Sonata must retain its authored headlight beam contract');
assert.ok(source.includes("setGlow(authoredRearGlowLayers,'red',0"),'pilotable Sonata must retain authored rear lamp glow');
assert.ok(source.includes("setGlow(authoredFrontGlowLayers,'white',0"),'pilotable Sonata must retain authored front lamp glow');

console.log('PASS Sonata realistic night body lighting');
console.log('  - exterior no longer self-illuminates from its diffuse texture');
console.log('  - environment response matches the civilian Sonata baseline');
console.log('  - authored front/rear lamps and normal headlight beams remain intact');
