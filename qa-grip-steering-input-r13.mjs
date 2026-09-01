import assert from 'node:assert/strict';
import {createVehicleSystem,validateVehicleProfiles} from './src/vehicles/vehicle-system.js';
import {steeringCommand} from './src/physics/vehicle-dynamics.js';

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));

const system=createVehicleSystem({initialId:'wrx'});
const fleet=system.list();

function sample(vehicle,speed,input){
  return steeringCommand({vehicle,speedAbs:speed,input},{});
}

const reports=[];
for(const info of fleet){
  if(system.activeId!==info.id)system.select(info.id);
  const vehicle=system.physics;
  const highSpeed=Math.min(
    45,
    Math.max(30,((Number(vehicle.topSpeedKmh)||180)/3.6)*.85)
  );
  const low=sample(vehicle,5,.5);
  const h15=sample(vehicle,highSpeed,.15);
  const h25=sample(vehicle,highSpeed,.25);
  const h50=sample(vehicle,highSpeed,.50);
  const h70=sample(vehicle,highSpeed,.70);
  const h85=sample(vehicle,highSpeed,.85);
  const h100=sample(vehicle,highSpeed,1.0);

  assert.ok(Math.abs(h15.target)<Math.abs(h25.target),`${info.id}: steering curve must be monotonic at small input`);
  assert.ok(Math.abs(h25.target)<Math.abs(h50.target),`${info.id}: steering curve must be monotonic through half input`);
  assert.ok(Math.abs(h50.target)<Math.abs(h70.target),`${info.id}: steering curve must be monotonic through medium input`);
  assert.ok(Math.abs(h70.target)<Math.abs(h85.target),`${info.id}: steering curve must be monotonic near high input`);
  assert.ok(Math.abs(h85.target)<Math.abs(h100.target),`${info.id}: steering curve must still reach full input`);
  assert.ok(Math.abs(h100.target-1)<1e-12,`${info.id}: full input must retain full steering authority`);

  // Grip R13: high-speed fine corrections must be substantially softer than
  // the previous ~2.8 exponent, while preserving useful authority deeper in the stick.
  if(highSpeed>=34){
    assert.ok(Math.abs(h25.target)<.012,`${info.id}: 25% high-speed input is still too aggressive (${h25.target})`);
    assert.ok(Math.abs(h50.target)<.105,`${info.id}: 50% high-speed input is still too aggressive (${h50.target})`);
    assert.ok(Math.abs(h85.target)>.50,`${info.id}: upper stick travel lost too much steering authority (${h85.target})`);
  }

  // Low-speed maneuverability remains intentionally much more direct.
  assert.ok(Math.abs(low.target)>Math.abs(h50.target)*2.2,`${info.id}: high-speed curve is not sufficiently separated from low-speed response`);

  reports.push({
    id:info.id,
    highSpeedMps:+highSpeed.toFixed(2),
    input25:+h25.target.toFixed(4),
    input50:+h50.target.toFixed(4),
    input85:+h85.target.toFixed(4),
    full:+h100.target.toFixed(4)
  });
}

console.log('GRIP R13 PROGRESSIVE HIGH-SPEED STEERING INPUT QA: PASS');
console.table(reports);
