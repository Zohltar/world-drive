import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicles/vehicle-system.js';
import {steeringCommand,GRAVITY,longitudinalTractionLimit} from '../src/physics/vehicle-dynamics.js';
import {combinationDynamics,driveAccelScaleAtSpeed} from '../src/vehicles/truck/truck-trailer.js';

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));
const fleet=createVehicleSystem({initialId:'semi_6x4'});
const v=fleet.physics;
const trailer=fleet.active.trailer;
const combo=combinationDynamics({tractor:v,trailer});

assert.equal(combo.totalMassKg,27100);
assert.equal(trailer.lengthM,16.15);
assert.equal(v.bodyLength,8.05);
assert.equal(v.suspensionTravel,.14);
assert.equal(v.suspensionResponse,18.5);
assert.ok(v.suspensionResponse>=18,'loaded tractor suspension response too soft');
assert.ok(v.suspensionTravel<=.15,'loaded tractor suspension travel too long');

// Same spring integrator as vehicle-presentation.js: verify the truck-specific
// retune actually settles materially faster than the V21.23.2 9.5 response.
function settleTime(response,target=.10){
  let y=0,vel=0;
  const dt=1/120;
  const k=response*response;
  const d=response*1.55;
  let settledSince=null;
  for(let t=0;t<3;t+=dt){
    const a=(target-y)*k-vel*d;
    vel+=a*dt;
    y+=vel*dt;
    if(Math.abs(y-target)<.004&&Math.abs(vel)<.035){
      if(settledSince===null)settledSince=t;
      if(t-settledSince>.15)return t;
    }else settledSince=null;
  }
  return Infinity;
}
const oldSettle=settleTime(9.5);
const newSettle=settleTime(v.suspensionResponse);
assert.ok(Number.isFinite(newSettle));
assert.ok(newSettle<oldSettle*.72,`suspension did not firm up enough: old=${oldSettle.toFixed(2)} new=${newSettle.toFixed(2)}`);

// Hairpin steering and hill torque must survive this visual/suspension pass.
const park=steeringCommand({vehicle:v,speedAbs:0,input:1});
const radius=v.wheelbase/Math.tan(park.maxRoadWheelAngle);
assert.ok(radius<4.7,`hairpin radius regression ${radius.toFixed(2)} m`);
const roadMu=Math.max(.25,v.longitudinalAccelLimit/GRAVITY);
const speed=40/3.6;
const scale=driveAccelScaleAtSpeed({tractor:v,trailer,speedMps:speed});
const drive=longitudinalTractionLimit({vehicle:v,requestedAccel:v.accel*scale,surfaceMu:roadMu,mode:'drive',airborne:false,speedAbs:speed}).acceleration;
const resist=v.rolling+combo.rollingResistanceAccel+(v.aero+combo.aeroDragCoeff)*speed*speed;
assert.ok(drive-resist-GRAVITY*.10>0,'10% grade @ 40 km/h torque regression');

const truckSrc=fs.readFileSync(new URL('../src/vehicles/truck/truck-trailer.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(main,/version:'21\.23\.3-candidate'/);
assert.match(truckSrc,/const desiredDistance=38\.0/);
assert.match(truckSrc,/const desiredSide=8\.0/);
assert.match(truckSrc,/const desiredHeight=7\.7/);
assert.match(truckSrc,/const targetDistance=-4\.8/);
assert.match(truckSrc,/\[2\.44,\.62,2\.34\]/,'full-height sleeper roof missing');
assert.match(truckSrc,/\[2\.46,\.52,2\.28\]/,'front aero roof missing');

console.log('V21.23.3 TRUCK CAMERA + SUSPENSION QA: PASS');
console.table({
  combinationMassKg:combo.totalMassKg,
  suspensionTravelM:v.suspensionTravel,
  suspensionResponse:v.suspensionResponse,
  oldSettleS:oldSettle.toFixed(2),
  newSettleS:newSettle.toFixed(2),
  parkingRadiusM:radius.toFixed(2),
  cameraDistanceM:38,
  cameraSideM:8
});
