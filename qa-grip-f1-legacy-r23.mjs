import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem} from './src/vehicles/vehicle-system.js';
import {steeringCommand,estimateWheelGripUsage,GRAVITY} from './src/physics/vehicle-dynamics.js';

const sys=createVehicleSystem({initialId:'f1_2010'});
const f1=sys.physics;
assert.equal(f1.legacyDriftAssist,false,'F1 must explicitly opt out of legacy drift/yaw assist');
for(const field of ['maxSteerHigh','steeringInputExponent','steeringGripEnvelopeFraction','powerOversteerGripLoss','powerOversteerYaw']){
  assert.equal(Object.hasOwn(f1,field),false,`F1 obsolete field must stay removed: ${field}`);
}

const half150=steeringCommand({vehicle:f1,speedAbs:150/3.6,input:.5},{});
const half220=steeringCommand({vehicle:f1,speedAbs:220/3.6,input:.5},{});
const full300=steeringCommand({vehicle:f1,speedAbs:300/3.6,input:1},{});
assert.ok(Math.abs(half150.target-.0625)<.002,'R23 changed accepted <=150 km/h steering mapping');
assert.ok(half220.target<.007,'R23 restored excessive F1 sensitivity above 150 km/h');
assert.ok(Math.abs(full300.target-1)<1e-12,'R23 must preserve full-stick mechanical authority');

const runtime=fs.readFileSync('src/driving-runtime-base.js','utf8');
const yawAuthority=fs.readFileSync('src/physics/yaw-authority.js','utf8');
const momentum=fs.readFileSync('src/physics/momentum-direction.js','utf8');
const dynamicsCore=fs.readFileSync('src/physics/vehicle-dynamics-core.js','utf8');
assert.match(runtime,/const useLegacyDriftAssist=VEHICLE\?\.legacyDriftAssist!==false;/,'runtime lacks explicit legacy-drift ownership switch');
// Cleanup B5 moved both legacy RWD yaw injection and R16/R21 fallback filtering
// into the single local-chassis yaw authority owner.
assert.match(yawAuthority,/if\(useLegacyDriftAssist&&String\(drivetrain\|\|'AWD'\)==='RWD'/,'synthetic RWD yaw is not gated');
assert.match(yawAuthority,/const fallbackYawAccel=useLegacyDriftAssist/,'grip-loss fallback yaw is not gated');
// Cleanup B4 owns momentum trajectory. Physical-only profiles (currently F1)
// must still bypass the pre-R7 trajectory estimate once force rotation is active.
assert.match(
  momentum,
  /const forceTrajectoryYawRate=useLegacyDriftAssist[\s\S]*\?blendDriftForce\([\s\S]*legacyForceTrajectoryYawRate,[\s\S]*finite\(physicalTrajectoryYawRate\),[\s\S]*finite\(driftPhysicalAuthority\)[\s\S]*\)[\s\S]*:finite\(physicalTrajectoryYawRate\);/,
  'legacy trajectory blend is not bypassed for physical-only profiles'
);
assert.match(dynamicsCore,/drivetrain==='RWD'&&vehicle\?\.legacyDriftAssist!==false/,'heuristic power-oversteer grip loss is not gated');

const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];
const grip=estimateWheelGripUsage({
  requestedLatAccel:12,signedLatAccel:12,latLimit:25,
  longitudinalAccel:8,propulsionAccel:8,serviceBrakeAccel:0,
  surfaceMu:f1.longitudinalAccelLimit/GRAVITY,
  throttle:1,handbrake:false,airborne:false,vehicle:f1,speedAbs:45,
  dt:.05,contacts,previousUsage:[0,0,0,0]
});
assert.ok(Math.max(...grip.longitudinalUsage)>0,'F1 physical friction circle lost longitudinal tire usage');

console.log('GRIP R23 F1 LEGACY-OWNERSHIP QA: PASS',{
  half150:+half150.target.toFixed(5),
  half220:+half220.target.toFixed(5),
  full300:+full300.target.toFixed(5),
  maxLongUsage:+Math.max(...grip.longitudinalUsage).toFixed(4)
});
