import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read=p=>fs.readFileSync(p,'utf8');
const exists=p=>fs.existsSync(p);

assert.equal(exists('src/vehicle-dynamics-base.js'),false,'legacy vehicle-dynamics-base.js returned');
assert.equal(exists('src/vehicle-dynamics-v21.29.js'),false,'versioned V21.29 dynamics wrapper returned');
assert.equal(exists('src/physics/vehicle-dynamics-core.js'),true,'canonical dynamics core missing');
assert.equal(exists('src/physics/vehicle-dynamics-traction-steering.js'),true,'traction/steering layer missing');
assert.equal(exists('src/physics/vehicle-dynamics.js'),true,'canonical vehicle dynamics facade missing');
assert.equal(exists('src/vehicle-dynamics-core.js'),false,'dynamics core must not return to src root');
assert.equal(exists('src/vehicle-dynamics-traction-steering.js'),false,'traction/steering layer must not return to src root');
assert.equal(exists('src/vehicle-dynamics.js'),false,'vehicle dynamics facade must not return to src root');

const canonical=read('src/physics/vehicle-dynamics.js');
const control=read('src/physics/vehicle-dynamics-traction-steering.js');
const core=read('src/physics/vehicle-dynamics-core.js');
const main=read('src/main.js');

assert.match(canonical,/vehicle-dynamics-traction-steering\.js/,'canonical facade must consume traction/steering owner');
assert.doesNotMatch(canonical,/vehicle-dynamics-v21\.29|vehicle-dynamics-base/,'canonical facade still points at historical dynamics layers');
assert.match(control,/vehicle-dynamics-core\.js/,'traction/steering layer must consume dynamics core');
assert.doesNotMatch(control,/vehicle-dynamics-v21\.29|vehicle-dynamics-base/,'traction/steering layer still points at historical names');
assert.match(core,/export const GRAVITY=/,'core math owner is missing expected foundation exports');
assert.match(main,/from '\.\/physics\/vehicle-dynamics\.js'/,'composition root must consume canonical vehicle-dynamics.js from src/physics');
assert.doesNotMatch(main,/from '\.\/(?:vehicle-dynamics|physics\/vehicle-dynamics-(?:core|traction-steering))\.js'/,'composition root must not bypass canonical vehicle dynamics');

// Prevent stale source/QA/CI ownership references from silently bringing the
// historical layers back. Documentation is intentionally excluded because the
// technical-debt plan records historical names as evidence.
const forbidden=['src/vehicle-dynamics-base.js','src/vehicle-dynamics-v21.29.js'];
const stale=[];
function inspectFile(file){
  if(file==='qa-vehicle-dynamics-c1.mjs')return;
  const text=read(file);
  for(const needle of forbidden){
    if(text.includes(needle))stale.push(`${file}: ${needle}`);
  }
}
function walk(dir){
  if(!exists(dir))return;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name).replaceAll('\\','/');
    if(entry.isDirectory())walk(file);
    else if(/\.(?:js|mjs|cjs|yml|yaml)$/.test(entry.name))inspectFile(file);
  }
}
walk('src');
walk('qa');
walk('.github/workflows');
for(const entry of fs.readdirSync('.')){
  if(/^qa-.*\.mjs$/.test(entry))inspectFile(entry);
}
assert.deepEqual(stale,[],'historical vehicle-dynamics ownership reference returned');

// Public behavior must remain available only through the canonical facade.
const dynamics=await import('../src/physics/vehicle-dynamics.js');
for(const name of [
  'vehicleLayout','aerodynamicLoad','longitudinalTractionLimit','steeringCommand',
  'advanceSteeringRack','lateralDynamicsEnvelope','estimateWheelGripUsage',
  'antiRollCalibration','antiRollAxleGripScales','lowSpeedYawAuthority'
]){
  assert.equal(typeof dynamics[name],'function',`canonical export missing: ${name}`);
}

console.log('CLEANUP C1 VEHICLE DYNAMICS OWNERSHIP QA: PASS',{
  layers:['physics/vehicle-dynamics-core.js','physics/vehicle-dynamics-traction-steering.js','physics/vehicle-dynamics.js'],
  compositionRootBoundary:'physics/vehicle-dynamics.js only',
  staleLegacyReferences:stale.length
});
