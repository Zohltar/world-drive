import assert from 'node:assert/strict';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicle-system.js';
import {GRAVITY,steeringCommand,lateralDynamicsEnvelope,estimateWheelGripUsage} from '../src/vehicle-dynamics.js';
import {bodyRelativeSteeringSpeed} from '../src/driving-runtime.js';

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));

const system=createVehicleSystem({initialId:'wrx'});
const fleet=system.list().filter(v=>v.vehicleClass!=='tractor');
assert.ok(fleet.length>=6,'passenger/race fleet unexpectedly small');

function contactsFor(vehicle){
  const out=[];
  for(let axleIndex=0;axleIndex<vehicle.axles.length;axleIndex++){
    const axle=vehicle.axles[axleIndex];
    const perSide=Math.max(1,Math.round((Number(axle.wheelCount)||2)/2));
    for(const side of ['left','right'])for(let i=0;i<perSide;i++)out.push({front:axleIndex===0,side,axleIndex,contact:true,contactFactor:1});
  }
  return out;
}

for(const info of fleet){
  if(system.activeId!==info.id)system.select(info.id);
  const v=system.physics;
  const steer=steeringCommand({vehicle:v,speedAbs:20,input:.72});
  const lat=lateralDynamicsEnvelope({
    vehicle:v,speed:20,steerAngle:steer.maxRoadWheelAngle*.72,steerInput:.72,
    driveThrottle:0,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,rearSlipAmount:0,airborne:false
  });
  assert.ok(Number.isFinite(lat.yawRate),`${info.id}: yaw rate must be finite`);
  assert.ok(Number.isFinite(lat.latLimit)&&lat.latLimit>0,`${info.id}: lateral limit must be positive`);
  assert.ok(Number.isFinite(lat.requestedLatAccel)&&lat.requestedLatAccel>=0,`${info.id}: lateral demand must be finite`);

  // The bicycle model is allowed to request more than tire capacity; the
  // friction-circle solver is the authoritative grip limiter in current builds.
  const grip={};
  const contacts=contactsFor(v);
  estimateWheelGripUsage({
    requestedLatAccel:Math.min(lat.requestedLatAccel,lat.latLimit*1.15),
    signedLatAccel:Math.sign(lat.signedLatAccel||1)*Math.min(Math.abs(lat.signedLatAccel||0),lat.latLimit*1.15),
    latLimit:lat.latLimit,longitudinalAccel:-3.8,propulsionAccel:0,serviceBrakeAccel:-3.8,
    surfaceMu:Math.max(.2,Number(v.longitudinalAccelLimit)||9.81)/GRAVITY,
    throttle:0,handbrake:false,airborne:false,vehicle:v,speedAbs:22,dt:1/60,
    contacts,previousUsage:new Array(contacts.length).fill(0)
  },grip);
  assert.ok(grip.raw.every(Number.isFinite),`${info.id}: friction-circle output must stay finite`);
  assert.ok(grip.serviceBrakeAbsEnabled=== (v.absEnabled!==false),`${info.id}: ABS policy must match profile`);

  const reverseSpeed=bodyRelativeSteeringSpeed({speed:15,heading:Math.PI,velocityHeading:0,handbrake:false});
  assert.equal(reverseSpeed,-15,`${info.id}: clean post-180 travel must preserve the full reverse-relative steering speed`);
}

console.log('V21.31 LIVE FLEET PHYSICS QA: PASS',fleet.map(v=>v.id));
