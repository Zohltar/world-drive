import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {handbrakeLateralEffectForSpeed} from '../src/physics/maneuver-state.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimePath=path.join(root,'src','driving-runtime.js');
const {
  bodyRelativeLongitudinalSpeed,
  bodyRelativeSteeringSpeed
}=await import(`${pathToFileURL(runtimePath).href}?qa=${Date.now()}`);

const DEG=Math.PI/180;
const speed=20;

// Current maneuver semantics:
// - with the handbrake held, steering/yaw keeps the signed translational speed
//   magnitude through the spin so rear lock does not create a 90-degree wall;
// - after release, ordinary R4 steering follows body-longitudinal velocity and
//   therefore crosses continuously through zero at 90 degrees.
const maneuverAngles=[0,45,80,89,90,91,100,135,180];
for(const angleDeg of maneuverAngles){
  const heldSpeed=bodyRelativeSteeringSpeed({
    speed,heading:angleDeg*DEG,velocityHeading:0,handbrake:true
  });
  assert.ok(Math.abs(Math.abs(heldSpeed)-speed)<1e-9,
    `held-handbrake steering magnitude collapsed at ${angleDeg} deg: ${heldSpeed}`);
  assert.ok(heldSpeed>0,
    `held-handbrake steering sign should preserve the signed scalar speed at ${angleDeg} deg: ${heldSpeed}`);

  const releasedSpeed=bodyRelativeSteeringSpeed({
    speed,heading:angleDeg*DEG,velocityHeading:0,handbrake:false
  });
  const expectedReleased=speed*Math.cos(angleDeg*DEG);
  assert.ok(Math.abs(releasedSpeed-expectedReleased)<1e-9,
    `released R4 steering projection mismatch at ${angleDeg} deg: ${releasedSpeed} vs ${expectedReleased}`);
}
assert.ok(bodyRelativeSteeringSpeed({speed,heading:89*DEG,velocityHeading:0,handbrake:false})>0);
assert.ok(Math.abs(bodyRelativeSteeringSpeed({speed,heading:90*DEG,velocityHeading:0,handbrake:false}))<1e-9);
assert.ok(bodyRelativeSteeringSpeed({speed,heading:91*DEG,velocityHeading:0,handbrake:false})<0);
assert.ok(bodyRelativeSteeringSpeed({speed,heading:180*DEG,velocityHeading:0,handbrake:false})<0);
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
assert.ok(at20kph>.35&&at20kph<.60,`20 km/h transition unexpected: ${at20kph}`);
assert.ok(at32kph>.98,`32 km/h should be near full effect: ${at32kph}`);
assert.ok(at40kph>.999,`40 km/h should be full effect: ${at40kph}`);

console.log(JSON.stringify({at5kph,at10kph,at20kph,at32kph,at40kph},null,2));
console.log('V21.27 HANDBRAKE 180 / LOW-SPEED QA: PASS');
