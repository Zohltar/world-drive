import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimePath=path.join(root,'src','driving-runtime.js');
const {bodyRelativeMomentumTargetHeading}=await import(`${pathToFileURL(runtimePath).href}?qa=${Date.now()}`);

const PI=Math.PI;
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

// Canonical forward: velocityHeading parameter should align to chassis heading.
let target=bodyRelativeMomentumTargetHeading({speed:20,heading:0,velocityHeading:0});
assert.ok(Math.abs(angleDelta(target,0))<1e-9,'forward target must be chassis heading');

// Canonical true reverse: signed speed already carries the reverse direction,
// so velocityHeading parameter still aligns to chassis heading.
target=bodyRelativeMomentumTargetHeading({speed:-12,heading:0,velocityHeading:0});
assert.ok(Math.abs(angleDelta(target,0))<1e-9,'true reverse target must remain chassis heading in signed-speed representation');

// Post-180 state: scalar speed is still positive, but chassis is now facing the
// opposite way. Momentum parameter must align with heading+PI, not with the nose.
target=bodyRelativeMomentumTargetHeading({speed:20,heading:PI,velocityHeading:0});
assert.ok(Math.abs(angleDelta(target,0))<1e-9,'post-180 positive-speed target must preserve rearward physical momentum');

// Same geometry with a little residual sideslip should still choose the rearward
// target instead of trying to bend momentum 180 degrees toward the chassis nose.
target=bodyRelativeMomentumTargetHeading({speed:20,heading:PI-0.18,velocityHeading:0.05});
assert.ok(Math.abs(angleDelta(target,(PI-0.18)+PI))<0.001,'post-180 residual-slip target must remain rearward relative to chassis');

console.log('V21.27 POST-180 MOMENTUM TARGET QA: PASS');
