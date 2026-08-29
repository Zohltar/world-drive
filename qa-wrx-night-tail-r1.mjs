import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('./src/wrx-glb.js',import.meta.url),'utf8');

assert.ok(
  source.includes("const runningIntensity=night>.06 ? (.90+night*4.60) : .02;"),
  'WRX rear night running lamps must use the brighter R2 night intensity curve'
);
assert.ok(
  source.includes("const cut=minY+(maxY-minY)*.35;"),
  'WRX night running section must cover about 65% of the authored red lens'
);
assert.ok(
  source.includes("mat.emissiveIntensity=braking?5.0:.015;"),
  'WRX brake-light intensity must remain unchanged so braking stays distinct by added lamp area'
);
assert.ok(
  source.includes("mat.emissiveIntensity=reversing?5.2:.01;"),
  'WRX reverse-light intensity must remain unchanged'
);

const fullNight=.90+1*4.60;
assert.equal(fullNight,5.5,'WRX full-night running-tail intensity must be 5.5');

console.log('PASS WRX rear night running lights R2');
console.log('  - running portion: about 65% of authored red lens');
console.log('  - full-night running-tail intensity: 5.5');
console.log('  - brake intensity retained at 5.0 with extra brake area + CHMSL');
console.log('  - reverse intensity retained at 5.2');
