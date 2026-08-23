import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicle-system.js';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const src=resolve(root,'src');

const profiles=validateVehicleProfiles();
assert.equal(profiles.ok,true,profiles.errors?.join('\n'));

const vehicles=createVehicleSystem({initialId:'wrx'}).list();
assert.equal(vehicles.length,8,'V21.25 expects 7 GLB cars + 1 articulated truck');
assert.equal(vehicles.some(v=>v.id==='semi_cabover_glb'),false,'obsolete cab-over profile must stay removed');
assert.equal(vehicles.some(v=>v.id==='semi_6x4'),true,'current Saia truck profile must remain');

const vehicleVisuals=fs.readFileSync(resolve(src,'vehicle-visuals.js'),'utf8');
assert.doesNotMatch(vehicleVisuals,/buildRoadCarVisual\s*\(/,'procedural road-car builder must stay removed');
assert.doesNotMatch(vehicleVisuals,/buildCountach80Visual\s*\(/,'procedural Countach builder must stay removed');
assert.doesNotMatch(vehicleVisuals,/buildF12010Visual\s*\(/,'procedural F1 builder must stay removed');
assert.doesNotMatch(vehicleVisuals,/wrx-visual\.js/,'removed WRX procedural module must not be imported');
assert.match(vehicleVisuals,/addWheelProbe\s*\(/,'suspension wheel probes must remain');
assert.match(vehicleVisuals,/activeVehicleWheels/,'vehicle presentation wheel API must remain');

assert.equal(fs.existsSync(resolve(src,'wrx-visual.js')),false,'obsolete WRX procedural module must stay deleted');
assert.equal(fs.existsSync(resolve(root,'inspect-civic.mjs')),false,'temporary Civic inspector must stay deleted');
assert.equal(fs.existsSync(resolve(src,'assets','cabover_micro.glb')),false,'obsolete cab-over prototype must stay deleted');
assert.equal(fs.existsSync(resolve(src,'assets','saia_ltl_freight_truck_half_trailer.glb')),true,'current Saia truck GLB must remain');

for(const asset of [
  'id4_2021_detailed.glb',
  'subaru_wrx_vb.glb',
  '2006_honda_civic_si.glb',
  '2006_hyundai_sonata.glb',
  'countach_80.glb',
  'f1_2010_ferrari.glb',
  '2017_bmw_i3.glb'
]){
  assert.equal(fs.existsSync(resolve(src,'assets',asset)),true,`current GLB missing: ${asset}`);
}

console.log('V21.25 CLEANUP REGRESSION QA: PASS');
console.log(`fleet: ${vehicles.length}; procedural passenger bodies: removed; current GLB assets: present`);
