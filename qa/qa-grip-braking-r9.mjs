import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  serviceBrakeAcceleration,
  shouldAutoClutchForServiceBrake,
  brakeWouldCrossZero
} from '../src/physics/longitudinal-control.js';
import {regulateAbsWheelOmega} from '../src/physics/braking-tire-control.js';
import {bodyRelativeLongitudinalSpeed} from '../src/driving-runtime-base.js';
import {createPerWheelShadowSolver} from '../src/physics/per-wheel-shadow-solver.js';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicles/vehicle-system.js';

const DEG=Math.PI/180;
const BRAKE=8.8;

assert.equal(serviceBrakeAcceleration({serviceBrake:1,speed:20,maxBrakeAccel:BRAKE}),-BRAKE,'forward brake must oppose positive momentum');
assert.equal(serviceBrakeAcceleration({serviceBrake:1,speed:-20,maxBrakeAccel:BRAKE}),BRAKE,'reverse brake must oppose negative momentum');
assert.equal(serviceBrakeAcceleration({serviceBrake:.5,speed:-20,maxBrakeAccel:BRAKE}),BRAKE*.5,'reverse brake must scale with pedal');
assert.equal(serviceBrakeAcceleration({serviceBrake:1,speed:20,maxBrakeAccel:BRAKE,airborne:true}),0,'airborne service brake cannot decelerate chassis through tire force');

// At 90 degrees into a J-turn, body-longitudinal speed is ~zero while the car
// still has large real momentum. Legacy code treated this as standstill, dropped
// the brake channel and could auto-clutch. R9 must use actual speed magnitude.
const jTurn={speed:20,heading:90*DEG,velocityHeading:0};
const jBody=bodyRelativeLongitudinalSpeed(jTurn);
assert.ok(Math.abs(jBody)<1e-8,`90deg J-turn body speed should be ~0, got ${jBody}`);
assert.equal(serviceBrakeAcceleration({serviceBrake:1,speed:jTurn.speed,maxBrakeAccel:BRAKE}),-BRAKE,'J-turn service brake must remain active across 90 degrees');
assert.equal(shouldAutoClutchForServiceBrake({serviceBrake:1,speed:jTurn.speed}),false,'fast sideways J-turn must not trigger stationary auto-clutch');
assert.equal(shouldAutoClutchForServiceBrake({serviceBrake:1,speed:.1}),true,'true near-stop braking may auto-clutch');

// At 180 degrees the chassis sees rearward body motion, but the scalar momentum
// is still positive. Service brake must keep removing that momentum instead of
// becoming reverse/forward drivetrain torque.
const post180={speed:20,heading:Math.PI,velocityHeading:0};
assert.ok(bodyRelativeLongitudinalSpeed(post180)<0,'post-180 sample must be rearward relative to chassis');
assert.equal(serviceBrakeAcceleration({serviceBrake:1,speed:post180.speed,maxBrakeAccel:BRAKE}),-BRAKE,'post-180 brake direction must follow momentum, not body axis');
assert.equal(brakeWouldCrossZero({previousSpeed:1,nextSpeed:-.1,serviceBrake:1}),true,'service brake must clamp at zero rather than reverse vehicle');
assert.equal(brakeWouldCrossZero({previousSpeed:1,nextSpeed:-.1,serviceBrake:0}),false);

// R8 ABS regulation must be direction-symmetric. Force an over-braked reverse
// wheel and verify that ABS restores the declared +peak slip ratio rather than
// allowing angular speed to cross through zero.
{
  const radius=.33;
  const v=-30;
  const regulated=regulateAbsWheelOmega({
    nextOmega:0,
    longitudinalSpeed:v,
    radiusM:radius,
    peakSlipRatio:.11,
    serviceBrakeTorqueNm:2500,
    handbrakeTorqueNm:0,
    absEnabled:true
  });
  assert.equal(regulated.active,true,'ABS must intervene symmetrically in reverse');
  assert.ok(regulated.omega<0,'ABS-regulated reverse wheel must keep rotating rearward');
  const slip=(regulated.omega*radius-v)/Math.abs(v);
  assert.ok(Math.abs(slip-.11)<1e-9,`reverse ABS target should be +0.11, got ${slip}`);
}

function contactsFor(vehicle){
  const contacts=[];
  const axles=Array.isArray(vehicle?.axles)?vehicle.axles:[];
  for(let axleIndex=0;axleIndex<axles.length;axleIndex++){
    const axle=axles[axleIndex];
    const wheelCount=Math.max(2,Math.round(Number(axle?.wheelCount)||2));
    const wheelsPerSide=Math.max(1,Math.round(wheelCount/2));
    const halfTrack=Math.max(.25,Number(axle?.trackWidth||vehicle?.trackWidth||1.55)/2);
    const localZ=Number(axle?.positionM)||0;
    for(const side of ['left','right']){
      for(let wheel=0;wheel<wheelsPerSide;wheel++){
        const dualOffset=wheelsPerSide>1?(wheel-(wheelsPerSide-1)/2)*.08:0;
        contacts.push({
          front:localZ>=0,
          axleIndex,
          side,
          localX:(side==='left'?-halfTrack:halfTrack)+(side==='left'?-dualOffset:dualOffset),
          localZ,
          contact:true,
          contactFactor:1
        });
      }
    }
  }
  return contacts;
}

function simulateStraightServiceBrake({vehicleId,vehicle,speed}){
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  const contacts=contactsFor(vehicle);
  const requestedBrakeAccel=serviceBrakeAcceleration({
    serviceBrake:1,
    speed,
    maxBrakeAccel:vehicle.brake
  });
  let result=null;
  for(let i=0;i<36;i++){
    result=solver.advance(1/120,{
      vehicleId,vehicle,contacts,
      speed,heading:0,velocityHeading:0,yawRate:0,
      centerSteerAngle:0,longitudinalAccel:requestedBrakeAccel,lateralAccel:0,
      requestedDriveAccel:0,requestedBrakeAccel,
      handbrake:false,surfaceId:'asphalt-dry'
    });
  }
  return result;
}

// Grip R9 fleet promotion. The runtime brake path is shared by every selectable
// vehicle, so validate the invariant against every profile instead of proving it
// only with the WRX calibration. Each car keeps its own brake capacity, axle
// bias, ABS policy, tire profile, mass and wheel layout. The articulated tractor
// is included as well so future shared-runtime changes cannot silently regress it.
const profileValidation=validateVehicleProfiles();
assert.equal(profileValidation.ok,true,profileValidation.errors.join('\n'));
const vehicleSystem=createVehicleSystem({initialId:'wrx'});
const fleetBrakeResults=[];

for(const info of vehicleSystem.list()){
  if(vehicleSystem.activeId!==info.id)vehicleSystem.select(info.id);
  const vehicle=vehicleSystem.physics;
  const brakeCapacity=Math.max(0,Number(vehicle.brake)||0);
  assert.ok(brakeCapacity>0,`${info.id}: brake capacity must be positive`);

  const forwardCommand=serviceBrakeAcceleration({serviceBrake:1,speed:20,maxBrakeAccel:brakeCapacity});
  const reverseCommand=serviceBrakeAcceleration({serviceBrake:1,speed:-20,maxBrakeAccel:brakeCapacity});
  assert.equal(forwardCommand,-brakeCapacity,`${info.id}: forward service brake must use this vehicle's own brake capacity`);
  assert.equal(reverseCommand,brakeCapacity,`${info.id}: reverse service brake must use this vehicle's own brake capacity`);

  const forward=simulateStraightServiceBrake({vehicleId:info.id,vehicle,speed:20});
  const reverse=simulateStraightServiceBrake({vehicleId:info.id,vehicle,speed:-20});

  assert.ok(forward.wheelCount>=4,`${info.id}: braking solver needs physical wheel contacts`);
  assert.equal(reverse.wheelCount,forward.wheelCount,`${info.id}: reverse braking must preserve wheel layout`);
  assert.ok(forward.bodyVz>0,`${info.id}: forward scenario must travel forward in body frame`);
  assert.ok(reverse.bodyVz<0,`${info.id}: reverse scenario must travel rearward in body frame`);
  assert.ok(forward.predictedAccelZ<-.05,`${info.id}: forward tire force must oppose forward travel (${forward.predictedAccelZ})`);
  assert.ok(reverse.predictedAccelZ>.05,`${info.id}: reverse tire force must oppose rearward travel (${reverse.predictedAccelZ})`);
  assert.ok(Math.abs(forward.predictedYawAccel)<.08,`${info.id}: symmetric forward braking invented yaw ${forward.predictedYawAccel}`);
  assert.ok(Math.abs(reverse.predictedYawAccel)<.08,`${info.id}: symmetric reverse braking invented yaw ${reverse.predictedYawAccel}`);

  const forwardShareTotal=(forward.serviceBrakeShares||[]).reduce((sum,value)=>sum+Number(value||0),0);
  const reverseShareTotal=(reverse.serviceBrakeShares||[]).reduce((sum,value)=>sum+Number(value||0),0);
  assert.ok(Math.abs(forwardShareTotal-1)<1e-9,`${info.id}: forward brake distribution must sum to 1`);
  assert.ok(Math.abs(reverseShareTotal-1)<1e-9,`${info.id}: reverse brake distribution must sum to 1`);

  if(vehicle.absEnabled!==false){
    assert.ok(forward.wheels.every(w=>!w.locked),`${info.id}: ABS-equipped vehicle locked a wheel in forward service braking`);
    assert.ok(reverse.wheels.every(w=>!w.locked),`${info.id}: ABS-equipped vehicle locked a wheel in reverse service braking`);
  }

  fleetBrakeResults.push({
    id:info.id,
    brake:brakeCapacity,
    abs:vehicle.absEnabled!==false,
    wheels:forward.wheelCount,
    forwardTireAccelZ:forward.predictedAccelZ,
    reverseTireAccelZ:reverse.predictedAccelZ
  });
}

// Integration contract: wrapper keeps brake independent, base consumes that
// channel for the active vehicle profile, and no body-speed sign branch may
// translate the brake into throttle. This is what makes R9 fleet-wide rather
// than a WRX-only behavior patch.
const wrapper=fs.readFileSync(new URL('../src/driving-runtime.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const base=fs.readFileSync(new URL('../src/driving-runtime-base.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
assert.match(wrapper,/getServiceBrakeInput:/,'wrapper must expose independent service brake to base runtime');
assert.doesNotMatch(wrapper,/if\(bodySpeed<-\.15\)[\s\S]{0,220}return serviceBrake/,'legacy reverse-brake-as-throttle adapter remains');
assert.match(wrapper,/shouldAutoClutchForServiceBrake\(/,'stationary clutch must use real speed helper');
assert.match(base,/serviceBrakeAcceleration\(/,'base runtime must compute signed brake force independently');
assert.match(base,/maxBrakeAccel:VEHICLE\.brake/,'base runtime must use the selected vehicle brake capacity');
assert.match(base,/requestedBrakeAccel\*=combination\.serviceBrakeScale/,'truck/trailer service-brake scaling must remain on the shared R9 channel');
assert.match(base,/getServiceBrakeInput/,'base runtime must consume service brake channel');
assert.doesNotMatch(base,/if\(driveThrottle<0\)[\s\S]{0,160}preDriveBodyLongitudinalSpeed>.15/,'negative drivetrain command still doubles as service brake');

console.log('GRIP R9 FULL-FLEET BRAKE / REVERSE / J-TURN QA: PASS',{
  jTurnBodySpeed:jBody,
  forwardBrake:serviceBrakeAcceleration({serviceBrake:1,speed:20,maxBrakeAccel:BRAKE}),
  reverseBrake:serviceBrakeAcceleration({serviceBrake:1,speed:-20,maxBrakeAccel:BRAKE}),
  fleet:fleetBrakeResults
});