import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicle-system.js';
import {steeringCommand} from './src/vehicle-dynamics.js';

const system=createVehicleSystem({initialId:'f1_2010'});
const f1=system.physics;

function target(kmh,input){
  return steeringCommand({vehicle:f1,speedAbs:kmh/3.6,input},{}).target;
}
function exponent(kmh){
  return steeringCommand({vehicle:f1,speedAbs:kmh/3.6,input:.5},{}).steeringInputExponent;
}

const speeds=[100,150,180,200,220,250,300,324];
const rows=speeds.map(kmh=>({
  kmh,
  exponent:+exponent(kmh).toFixed(3),
  input25:+target(kmh,.25).toFixed(5),
  input50:+target(kmh,.50).toFixed(5),
  input70:+target(kmh,.70).toFixed(5),
  input85:+target(kmh,.85).toFixed(5),
  full:+target(kmh,1).toFixed(5)
}));

for(let i=1;i<rows.length;i++){
  assert.ok(rows[i].exponent>=rows[i-1].exponent-1e-9,
    `F1 steering exponent must not decrease with speed: ${JSON.stringify(rows)}`);
}
assert.ok(Math.abs(target(150,.5)-.0625)<.006,
  `150 km/h half-stick should stay near R13 behavior: ${target(150,.5)}`);
assert.ok(target(220,.5)<.035,
  `220 km/h half-stick still too sensitive: ${target(220,.5)}`);
assert.ok(target(250,.7)<.14,
  `250 km/h 70% stick still too sensitive: ${target(250,.7)}`);
assert.ok(target(300,.85)<.36,
  `300 km/h 85% stick still too sensitive: ${target(300,.85)}`);
for(const kmh of speeds){
  assert.ok(Math.abs(target(kmh,1)-1)<1e-12,
    `${kmh} km/h full stick must retain full mechanical authority`);
}

// Non-F1 profiles do not opt into the ultra-high-speed exponent stage.
for(const id of ['wrx','countach_80','id4']){
  system.select(id);
  const vehicle=system.physics;
  const cmd=steeringCommand({vehicle,speedAbs:300/3.6,input:.5},{});
  assert.equal(cmd.ultraHighSpeedExponentBoost||0,0,
    `${id}: R22 must remain F1-specific`);
}

console.log('GRIP R22 F1 ULTRA-HIGH-SPEED STEERING CURVE QA: PASS');
console.table(rows);
