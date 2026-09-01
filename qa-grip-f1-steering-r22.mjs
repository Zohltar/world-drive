import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicles/vehicle-system.js';
import {steeringCommand} from './src/vehicle-dynamics.js';

const system=createVehicleSystem({initialId:'f1_2010'});
const f1=system.physics;

function command(kmh,input){
  return steeringCommand({vehicle:f1,speedAbs:kmh/3.6,input},{});
}
function target(kmh,input){return command(kmh,input).target;}
function exponent(kmh){return command(kmh,.5).steeringInputExponent;}

const speeds=[100,150,170,180,200,220,250,260,300,324];
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

// R22.1 human calibration: 0–150 km/h was explicitly accepted. Freeze that
// region at the proven R13 curve and increase compression only above 150 km/h.
assert.ok(Math.abs(target(150,.5)-.0625)<.003,
  `150 km/h half-stick must stay at accepted R13 behavior: ${target(150,.5)}`);
assert.ok(Math.abs(target(150,.85)-.522)<.015,
  `150 km/h upper-stick behavior changed unexpectedly: ${target(150,.85)}`);
assert.ok(target(170,.5)<.050&&target(170,.5)>.040,
  `170 km/h transition should be progressive, not a cliff: ${target(170,.5)}`);
assert.ok(target(180,.5)<.037,
  `180 km/h half-stick still too sensitive: ${target(180,.5)}`);
assert.ok(target(200,.5)<.018,
  `200 km/h half-stick still too sensitive: ${target(200,.5)}`);
assert.ok(target(220,.5)<.008,
  `220 km/h half-stick still too sensitive: ${target(220,.5)}`);
assert.ok(target(250,.7)<.050,
  `250 km/h 70% stick still too sensitive: ${target(250,.7)}`);
assert.ok(target(300,.85)<.250,
  `300 km/h 85% stick still too sensitive: ${target(300,.85)}`);
assert.ok(exponent(260)>=8.95&&exponent(300)>=8.95,
  `F1 ultra-high-speed exponent should plateau near 9 after 260 km/h: ${JSON.stringify(rows)}`);

for(const kmh of speeds){
  assert.ok(Math.abs(target(kmh,1)-1)<1e-12,
    `${kmh} km/h full stick must retain full mechanical authority`);
}

// No other current vehicle opts into the F1 ultra-high-speed stage.
for(const id of ['wrx','countach_80','id4','i3_2017','civic','sonata']){
  system.select(id);
  const vehicle=system.physics;
  const cmd=steeringCommand({vehicle,speedAbs:300/3.6,input:.5},{});
  assert.equal(cmd.ultraHighSpeedExponentBoost||0,0,
    `${id}: R22.1 must remain explicitly F1-specific`);
}

console.log('GRIP R22.1 F1 ULTRA-HIGH-SPEED STEERING CURVE QA: PASS');
console.table(rows);
