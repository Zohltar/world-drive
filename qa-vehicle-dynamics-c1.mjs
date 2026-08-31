import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const exists=p=>fs.existsSync(p);

assert.equal(exists('src/vehicle-dynamics-base.js'),false,'legacy vehicle-dynamics-base.js returned');
assert.equal(exists('src/vehicle-dynamics-v21.29.js'),false,'versioned V21.29 dynamics wrapper returned');
assert.equal(exists('src/vehicle-dynamics-core.js'),true,'canonical dynamics core missing');
assert.equal(exists('src/vehicle-dynamics-traction-steering.js'),true,'traction/steering layer missing');
assert.equal(exists('src/vehicle-dynamics.js'),true,'canonical vehicle dynamics facade missing');

const canonical=read('src/vehicle-dynamics.js');
const control=read('src/vehicle-dynamics-traction-steering.js');
const core=read('src/vehicle-dynamics-core.js');
const runtime=read('src/driving-runtime-base.js')+'\n'+read('src/driving-runtime.js');

assert.match(canonical,/vehicle-dynamics-traction-steering\.js/,'canonical facade must consume traction/steering owner');
assert.doesNotMatch(canonical,/vehicle-dynamics-v21\.29|vehicle-dynamics-base/,'canonical facade still points at historical dynamics layers');
assert.match(control,/vehicle-dynamics-core\.js/,'traction/steering layer must consume dynamics core');
assert.doesNotMatch(control,/vehicle-dynamics-v21\.29|vehicle-dynamics-base/,'traction/steering layer still points at historical names');
assert.match(core,/export const GRAVITY=/,'core math owner is missing expected foundation exports');
assert.doesNotMatch(runtime,/vehicle-dynamics-(?:core|traction-steering|v21\.29|base)/,'driving runtime must consume only canonical vehicle-dynamics.js');
assert.match(runtime,/vehicle-dynamics\.js/,'driving runtime no longer imports canonical vehicle dynamics');

// Public behavior must remain available only through the canonical facade.
const dynamics=await import('./src/vehicle-dynamics.js');
for(const name of [
  'vehicleLayout','aerodynamicLoad','longitudinalTractionLimit','steeringCommand',
  'advanceSteeringRack','lateralDynamicsEnvelope','estimateWheelGripUsage',
  'antiRollCalibration','antiRollAxleGripScales','lowSpeedYawAuthority'
]){
  assert.equal(typeof dynamics[name],'function',`canonical export missing: ${name}`);
}

console.log('CLEANUP C1 VEHICLE DYNAMICS OWNERSHIP QA: PASS',{
  layers:['vehicle-dynamics-core.js','vehicle-dynamics-traction-steering.js','vehicle-dynamics.js'],
  runtimeBoundary:'vehicle-dynamics.js only'
});
