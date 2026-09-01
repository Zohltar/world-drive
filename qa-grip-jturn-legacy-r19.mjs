import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem} from './src/vehicles/vehicle-system.js';
import {
  bodyRelativeLongitudinalSpeed,
  bodyRelativeSteeringSpeed,
  travelAxisSideslip
} from './src/driving-runtime-base.js';
import {
  jTurnEntryEligible,
  jTurnExitEligible,
  advanceJTurnLatchedState,
  jTurnTransientSteeringSpeed
} from './src/physics/maneuver-state.js';
import {steeringCommand,lateralDynamicsEnvelope} from './src/vehicle-dynamics.js';

const DEG=Math.PI/180;
const speed=-12;
const steerAngle=.30;
let active=false;
const rows=[];

for(const angleDeg of [0,40,60,70,75,85,88,90,92,105,120,150,170,178,180]){
  const heading=angleDeg*DEG;
  const velocityHeading=0;
  const bodyLong=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});
  const sideslip=travelAxisSideslip({heading,velocityHeading});
  const entryEligible=jTurnEntryEligible({
    bodyLongitudinalSpeed:bodyLong,
    speedAbs:Math.abs(speed),
    steerAngle,
    handbrake:false,
    airborne:false,
    onPavement:true
  });
  const exitEligible=jTurnExitEligible({
    bodyLongitudinalSpeed:bodyLong,
    speedAbs:Math.abs(speed),
    steerAngle,
    handbrake:false,
    airborne:false,
    onPavement:true,
    sideslipRad:sideslip
  });
  active=advanceJTurnLatchedState({
    active,
    bodyLongitudinalSpeed:bodyLong,
    speedAbs:Math.abs(speed),
    steerAngle,
    handbrake:false,
    airborne:false,
    onPavement:true,
    sideslipRad:sideslip
  });
  const legacySpeed=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:false});
  const maneuverSpeed=jTurnTransientSteeringSpeed({speed,fallbackSpeed:legacySpeed,active});
  rows.push({angleDeg,bodyLong,entryEligible,exitEligible,active,legacySpeed,maneuverSpeed,sideslipDeg:sideslip/DEG});
}

const at90=rows.find(r=>r.angleDeg===90);
const at120=rows.find(r=>r.angleDeg===120);
const at170=rows.find(r=>r.angleDeg===170);
const at178=rows.find(r=>r.angleDeg===178);
assert.ok(Math.abs(at90.legacySpeed)<1e-8,`pre-R19 legacy steering projection should collapse at 90 deg: ${at90.legacySpeed}`);
assert.equal(at90.entryEligible,false,'J-turn entry eligibility must already be false at 90 deg');
assert.equal(at90.exitEligible,false,'J-turn exit eligibility must remain false through the 90-degree region');
assert.equal(at90.active,true,'R19 transient latch must survive the 90-degree region');
assert.ok(Math.abs(at90.maneuverSpeed+12)<1e-9,`R19 must preserve reverse-entry steering magnitude at 90 deg: ${at90.maneuverSpeed}`);
assert.equal(at120.active,true,'R19 J-turn state must remain active after crossing 90 deg');
assert.ok(Math.abs(at120.maneuverSpeed+12)<1e-9,'R19 must not reverse bicycle yaw sign immediately after 90 deg');
assert.equal(at170.active,true,'R19 must preserve transient yaw until nearly aligned with the exit axis');
assert.equal(at178.active,false,'R19 must release once the chassis is essentially aligned on the exit axis');

for(const id of ['id4','i3_2017']){
  const system=createVehicleSystem({initialId:id});
  const vehicle=system.physics;
  const steering=steeringCommand({vehicle,speedAbs:Math.abs(speed),input:1});
  const env=lateralDynamicsEnvelope({
    vehicle,
    speed:-Math.abs(speed),
    steerAngle:steering.maxRoadWheelAngle,
    steerInput:1,
    driveThrottle:0,
    onPavement:true,
    surfaceGrip:1,
    awdOffroadGripBonus:1,
    rearSlipAmount:0,
    airborne:false
  });
  assert.ok(Math.abs(env.yawRate)>.5,`${id}: preserved reverse steering speed must retain decisive J-turn yaw at 90 deg (${env.yawRate})`);
}

// Ordinary forward driving or a released wheel must never latch the maneuver.
assert.equal(advanceJTurnLatchedState({
  active:false,bodyLongitudinalSpeed:12,speedAbs:12,steerAngle:.30,
  handbrake:false,airborne:false,onPavement:true,sideslipRad:0
}),false,'forward driving must not enter J-turn transient mode');
assert.equal(advanceJTurnLatchedState({
  active:true,bodyLongitudinalSpeed:0,speedAbs:12,steerAngle:.01,
  handbrake:false,airborne:false,onPavement:true,sideslipRad:Math.PI/2
}),false,'releasing the steering wheel must end the transient latch');

console.table(rows.map(r=>({
  deg:r.angleDeg,
  body:+r.bodyLong.toFixed(2),
  entry_eligible:r.entryEligible,
  exit_eligible:r.exitEligible,
  latched:r.active,
  legacy_steer:+r.legacySpeed.toFixed(2),
  r19_steer:+r.maneuverSpeed.toFixed(2),
  sideslip:+r.sideslipDeg.toFixed(1)
})));
const runtimeSource=fs.readFileSync(new URL('./src/driving-runtime-base.js',import.meta.url),'utf8');
const maneuverSource=fs.readFileSync(new URL('./src/physics/maneuver-state.js',import.meta.url),'utf8');
assert.ok(!runtimeSource.includes('jTurnTransientYawActive'),'B2 old entry-predicate name must remain removed');
assert.ok(!runtimeSource.includes('advanceJTurnTransientYawState'),'B2 old latch-state helper name must remain removed');
assert.ok(!runtimeSource.includes('jTurnYawActive'),'B2 ambiguous active alias must remain removed');
for(const name of ['jTurnEntryEligible','jTurnExitEligible','advanceJTurnLatchedState']){
  assert.ok(maneuverSource.includes(`export function ${name}`),`B3 maneuver helper missing from maneuver-state: ${name}`);
  assert.ok(!runtimeSource.includes(`export function ${name}`),`B3 runtime must not own maneuver helper: ${name}`);
}
assert.ok(runtimeSource.includes('createManeuverState'),'B3 runtime must consume maneuver-state owner');

console.log('GRIP R19 LEGACY J-TURN ROTATION-WALL QA: PASS');
