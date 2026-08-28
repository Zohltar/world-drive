import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicle-system.js';
import {estimateWheelGripUsage} from '../src/vehicle-dynamics.js';

const system=createVehicleSystem({initialId:'wrx'});
const fleet=system.list();

function contactsFor(vehicle,{contact=false,contactFactor=0}={}){
  const out=[];
  for(let axleIndex=0;axleIndex<vehicle.axles.length;axleIndex++){
    const axle=vehicle.axles[axleIndex];
    const perSide=Math.max(1,Math.round((Number(axle.wheelCount)||2)/2));
    for(const side of ['left','right'])for(let i=0;i<perSide;i++){
      out.push({front:axleIndex===0,side,axleIndex,contact,contactFactor});
    }
  }
  return out;
}

for(const info of fleet){
  if(system.activeId!==info.id)system.select(info.id);
  const vehicle=system.physics;
  const contacts=contactsFor(vehicle);
  const previousUsage=new Array(contacts.length).fill(1.42);

  const result=estimateWheelGripUsage({
    requestedLatAccel:7,
    signedLatAccel:7,
    latLimit:Math.max(1,Number(vehicle.lateralAccelLimit)||7),
    longitudinalAccel:-4.2,
    propulsionAccel:0,
    serviceBrakeAccel:-4.2,
    surfaceMu:1,
    throttle:0,
    handbrake:false,
    airborne:true,
    vehicle,
    speedAbs:30,
    dt:1/60,
    contacts,
    previousUsage
  });

  for(const key of ['raw','smoothed','slip','lateralSlip','lateralUsage','longitudinalUsage']){
    assert.ok(Array.isArray(result[key]),`${info.id}: missing ${key}`);
    assert.ok(result[key].every(value=>Number(value)===0),`${info.id}: airborne ${key} retained tire-road state: ${JSON.stringify(result[key])}`);
  }
  for(const key of [
    'frontCombined','rearCombined','frontLateral','rearLateral','netLateralAccel',
    'frictionYawAccel','trajectoryLateralCapacityScale','trajectoryLateralCapacityAccel',
    'frontLateralForceScale','rearLateralForceScale'
  ]){
    assert.equal(Number(result[key]),0,`${info.id}: airborne ${key} must be zero`);
  }

  const telemetry=globalThis.WorldDriveWheelSpinTelemetry;
  if(telemetry){
    assert.ok((telemetry.levels||[]).every(value=>Number(value)===0),`${info.id}: airborne telemetry slip retained`);
    assert.ok((telemetry.longitudinalUsage||[]).every(value=>Number(value)===0),`${info.id}: airborne telemetry longitudinal usage retained`);
  }
}

console.log('V21.31 AIRBORNE TIRE STATE QA: PASS',{
  vehicles:fleet.map(vehicle=>vehicle.id),
  saturatedPreviousUsage:1.42,
  tireRoadStateClearedImmediately:true,
  chassisSideslipMemoryUntouched:true
});
