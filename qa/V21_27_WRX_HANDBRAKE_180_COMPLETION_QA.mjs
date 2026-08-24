import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimePath=path.join(root,'src','driving-runtime.js');
const {bodyRelativeSteeringSpeed}=await import(`${pathToFileURL(runtimePath).href}?qa=${Date.now()}`);

const DEG=Math.PI/180;
const speed=18;

for(const angleDeg of [100,120,150,175]){
  const heading=angleDeg*DEG;
  const velocityHeading=0;
  const held=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:true});
  const released=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:false});

  assert.ok(held>0,
    `handbrake spin direction reversed too early at ${angleDeg} deg: ${held}`);
  assert.ok(released<0,
    `released steering did not become body-relative reverse at ${angleDeg} deg: ${released}`);
  assert.ok(Math.abs(Math.abs(held)-speed)<1e-9,
    `handbrake steering-speed magnitude changed at ${angleDeg} deg`);
  assert.ok(Math.abs(Math.abs(released)-speed)<1e-9,
    `released steering-speed magnitude changed at ${angleDeg} deg`);
}

// Before 90 degrees both held and released states still represent forward
// travel relative to the body, so there must be no artificial sign change.
for(const angleDeg of [0,30,60,80]){
  const heading=angleDeg*DEG;
  const held=bodyRelativeSteeringSpeed({speed,heading,velocityHeading:0,handbrake:true});
  const released=bodyRelativeSteeringSpeed({speed,heading,velocityHeading:0,handbrake:false});
  assert.ok(held>0&&released>0,
    `premature reverse steering sign at ${angleDeg} deg`);
}

console.log('V21.27 WRX HANDBRAKE 180 COMPLETION QA: PASS');
