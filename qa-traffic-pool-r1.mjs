import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CIVIL_TRAFFIC_VEHICLE_POOL,
  GENERIC_PASSENGER_PACK_URL,
  GENERIC_PASSENGER_PACK_FALLBACK_URL,
  civilTrafficChooseVehicleId,
  genericPassengerPackIds
} from './src/civil-traffic-pool.js';

const ids=CIVIL_TRAFFIC_VEHICLE_POOL.map(entry=>entry.id);
const expected=['sonata','compact','coupe','hatchback','minivan','offroad','pickup','sedan','sport','suv','wagon'];
assert.deepEqual(ids,expected,'traffic variety pool must contain Sonata plus all ten supplied pack silhouettes');
assert.equal(new Set(ids).size,ids.length,'traffic pool ids must be unique');
assert.equal(genericPassengerPackIds().length,10,'generic passenger pack must expose ten civilian variants');
assert.ok(CIVIL_TRAFFIC_VEHICLE_POOL.every(entry=>entry.weight>0),'every traffic pool entry needs positive spawn weight');
assert.ok(CIVIL_TRAFFIC_VEHICLE_POOL.every(entry=>entry.targetLength>=4&&entry.targetLength<=5.6),'traffic vehicle dimensions must stay plausible');
assert.equal(civilTrafficChooseVehicleId(['sedan'],.5),'sedan','single available vehicle must be deterministic');
assert.notEqual(civilTrafficChooseVehicleId(['sedan','suv'],.2,'sedan'),'sedan','pool should avoid immediate duplicate when another variant is available');
assert.equal(GENERIC_PASSENGER_PACK_URL,'./assets/traffic/generic_passenger_car_pack_traffic.glb');
assert.equal(GENERIC_PASSENGER_PACK_FALLBACK_URL,'./assets/traffic/generic_passenger_car_pack.glb');

const poolSource=fs.readFileSync(new URL('./src/civil-traffic-pool.js',import.meta.url),'utf8');
for(const name of ['Compact Body','Coupe Body','Hatchback Body','minivan body','Offroad Body','Pickup Body','Sedan Body','Sport body','SUV Body','Wagon Body']){
  assert.ok(poolSource.includes(`bodyName:'${name}'`),`missing supplied pack body ${name}`);
}
assert.ok(poolSource.includes('assembly.rotation.x=-Math.PI/2'),'pack extraction must convert source -Y forward / Z-up into World Drive +Z forward / Y-up');
assert.ok(poolSource.includes('.slice(0,4)'),'each pack body must bind its four nearest authored wheels');

const trafficSource=fs.readFileSync(new URL('./src/civil-traffic.js',import.meta.url),'utf8');
assert.ok(trafficSource.includes("mode:'traffic-r7-variety-pool'"),'traffic diagnostics must identify variety-pool mode');
assert.ok(trafficSource.includes('buildGenericPassengerTemplates'),'traffic runtime must build templates from the supplied pack');
assert.ok(trafficSource.includes('civilTrafficChooseVehicleId'),'traffic spawns must select from the vehicle pool');
assert.ok(trafficSource.includes('WorldDriveTrafficPool'),'runtime must expose pool diagnostics for visual testing');
assert.ok(trafficSource.includes('WorldDriveTrafficSpawn=(kind,vehicleId)'),'forced test spawn must accept an explicit vehicle id');
assert.ok(trafficSource.includes('spawnedByVehicle'),'diagnostics must count spawned vehicles by variant');

console.log('PASS Traffic R7 civilian vehicle variety pool');
console.log('  - Sonata + 10 supplied generic passenger-car silhouettes');
console.log('  - weighted selection avoids immediate duplicate variants');
console.log('  - pack bodies are centered with their four nearest authored wheels');
console.log('  - explicit vehicle-id test spawning and pool diagnostics are available');
