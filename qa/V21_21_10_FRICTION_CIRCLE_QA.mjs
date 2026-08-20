import assert from 'node:assert/strict';
import { createVehicleSystem } from '../src/vehicle-system.js';
import { estimateWheelGripUsage } from '../src/vehicle-dynamics.js';

const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];

function settle(vehicle,{lat=0,handbrake=false,serviceBrakeAccel=0,propulsionAccel=0,throttle=0}={}){
  let previousUsage=[0,0,0,0];
  let result=null;
  for(let i=0;i<8;i++){
    result=estimateWheelGripUsage({
      requestedLatAccel:lat,
      signedLatAccel:lat,
      latLimit:vehicle.lateralAccelLimit??7,
      longitudinalAccel:serviceBrakeAccel+propulsionAccel,
      propulsionAccel,
      serviceBrakeAccel,
      throttle,
      handbrake,
      airborne:false,
      vehicle,
      dt:.05,
      contacts,
      previousUsage
    });
    previousUsage=[...result.smoothed];
  }
  return result;
}

const registry=createVehicleSystem({initialId:'wrx'});
const rows=[];
for(const entry of registry.list()){
  registry.select(entry.id);
  const vehicle=registry.active.physics;
  const lat=Math.min(4.5,(vehicle.lateralAccelLimit??7)*.48);

  const normalTurn=settle(vehicle,{lat});
  const handbrakeTurn=settle(vehicle,{lat,handbrake:true});
  const straightHandbrake=settle(vehicle,{lat:0,handbrake:true});
  const straightServiceBrake=settle(vehicle,{lat:0,serviceBrakeAccel:-Math.min(7,vehicle.brake??7)});

  assert.ok(normalTurn.rearLateral<.05,`${entry.id}: moderate normal turn should stay below rear slip threshold`);
  assert.ok(handbrakeTurn.rearLateral>.90,`${entry.id}: turning handbrake must consume rear lateral grip`);
  assert.ok(handbrakeTurn.frontLateral<.10,`${entry.id}: handbrake must not directly remove front lateral grip`);
  assert.equal(straightHandbrake.rearLateral,0,`${entry.id}: straight handbrake must not invent lateral slip/yaw`);
  assert.equal(straightServiceBrake.frontLateral,0,`${entry.id}: straight service braking must not invent front lateral slip`);
  assert.equal(straightServiceBrake.rearLateral,0,`${entry.id}: straight service braking must not invent rear lateral slip`);
  assert.ok(handbrakeTurn.longitudinalUsage[0]>=1.28&&handbrakeTurn.longitudinalUsage[2]>=1.28,`${entry.id}: rear wheels must reach handbrake lock demand`);
  assert.ok(handbrakeTurn.lateralUsage[0]>normalTurn.lateralUsage[0]*3,`${entry.id}: rear effective lateral utilization must rise when longitudinal grip is consumed`);

  rows.push({id:entry.id,lat,normalRear:normalTurn.rearLateral,handRear:handbrakeTurn.rearLateral,handFront:handbrakeTurn.frontLateral});
}

// Combined service braking + cornering should reduce remaining lateral capacity,
// but only when a lateral demand actually exists.
registry.select('wrx');
const wrx=registry.active.physics;
const cornerOnly=settle(wrx,{lat:6});
const trailBrake=settle(wrx,{lat:6,serviceBrakeAccel:-7});
assert.ok(Math.max(...trailBrake.lateralUsage)>Math.max(...cornerOnly.lateralUsage),'combined braking/cornering must use more of the friction circle than cornering alone');

console.log('PASS V21.21.10 friction-circle coupling');
for(const row of rows){
  console.log(`${row.id}: lat=${row.lat.toFixed(2)} normalRear=${row.normalRear.toFixed(3)} handRear=${row.handRear.toFixed(3)} handFront=${row.handFront.toFixed(3)}`);
}
console.log('PASS straight-line handbrake: longitudinal lock without artificial lateral yaw demand');
console.log('PASS combined service braking/cornering: reduced lateral reserve');
