import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicle-system.js';

const vs=createVehicleSystem();
const fleet=vs.list();
const trucks=fleet.filter(p=>p.vehicleClass==='tractor');
assert.equal(trucks.length,1,'fleet should expose exactly one tractor profile');
assert.equal(trucks[0].id,'semi_6x4');
assert.equal(fleet.some(p=>p.id==='semi_cabover_glb'),false,'old second truck profile must be removed');
assert.deepEqual(validateVehicleProfiles(),{ok:true,errors:[]});

const asset=new URL('../src/assets/saia_ltl_freight_truck_half_trailer.glb',import.meta.url);
const stat=fs.statSync(asset);
assert.ok(stat.size>1_000_000,'Saia GLB must be a real binary asset');
const fd=fs.openSync(asset,'r');
const header=Buffer.alloc(4);fs.readSync(fd,header,0,4,0);fs.closeSync(fd);
assert.equal(header.toString('ascii'),'glTF');

const source=fs.readFileSync(new URL('../src/truck-trailer.js',import.meta.url),'utf8');
assert.match(source,/saia_ltl_freight_truck_half_trailer\.glb/);
assert.match(source,/assetTruckBody/);
assert.match(source,/assetTrailerBody/);
assert.match(source,/buildSaiaSplitVisual/);
assert.doesNotMatch(source,/semi_cabover_glb/);
assert.doesNotMatch(source,/cabover_micro\.glb/);
console.log('PASS V21.24.46 Saia truck/trailer integration QA');
