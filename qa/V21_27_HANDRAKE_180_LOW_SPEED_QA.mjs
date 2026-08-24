import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimePath=path.join(root,'src','driving-runtime.js');
const {
  bodyRelativeLongitudinalSpeed,
  bodyRelativeSteeringSpeed,
  handbrakeLateralEffectForSpeed
}=await import(`${pathToFileURL(runtimePath).href}?qa=${Date.now()}`);

const DEG=Math.PI/180;
const speed=20;

// P6.1: a 180 slide keeps the true speed magnitude for steering/yaw authority.
for(const angleDeg of [0,45,80,89,91,100,135,180]){
  const steeringSpeed=bodyRelativeSteeringSpeed({
    speed,
    heading:angleDeg*DEG,
    velocityHeading:0
  });
  assert.ok(Math.abs(Math.abs(steeringSpeed)-speed)<1e-9,
    `steering magnitude collapsed at ${angleDeg} deg: ${steeringSpeed}`);
}

// Direction remains forward through the tiny near-90-degree deadband, then
// flips once the chassis is clearly travelling rearward relative to itself.
assert.ok(bodyRelativeSteeringSpeed({speed,heading:80*DEG,velocityHeading:0})>0);
assert.ok(bodyRelativeSteeringSpeed({speed,heading:100*DEG,velocityHeading:0})<0);
assert.ok(bodyRelativeSteeringSpeed({speed,heading:180*DEG,velocityHeading:0})<0);
assert.ok(bodyRelativeLongitudinalSpeed({speed,heading:180*DEG,velocityHeading:0})<0);

// P7: locked-rear lateral destabilization must not be full-strength at walking
// speed, but must recover fully at normal handbrake-turn speeds.
const at5kph=handbrakeLateralEffectForSpeed(5/3.6);
const at10kph=handbrakeLateralEffectForSpeed(10/3.6);
const at20kph=handbrakeLateralEffectForSpeed(20/3.6);
const at32kph=handbrakeLateralEffectForSpeed(32/3.6);
const at40kph=handbrakeLateralEffectForSpeed(40/3.6);

assert.ok(at5kph<.01,`5 km/h handbrake lateral effect too high: ${at5kph}`);
assert.ok(at10kph<.03,`10 km/h handbrake lateral effect too high: ${at10kph}`);
assert.ok(at20kph>.15&&at20kph<.45,`20 km/h transition unexpected: ${at20kph}`);
assert.ok(at32kph>.98,`32 km/h should be near full effect: ${at32kph}`);
assert.ok(at40kph>.999,`40 km/h should be full effect: ${at40kph}`);

console.log(JSON.stringify({at5kph,at10kph,at20kph,at32kph,at40kph},null,2));
console.log('V21.27 HANDBRAKE 180 / LOW-SPEED QA: PASS');
