import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicle-system.js';
import {createPerWheelShadowSolver} from './src/physics/per-wheel-shadow-solver.js';
import {
  handbrakeDriveRetentionScale,
  handbrakeLongitudinalDecelCapacity,
  shouldCanonicalizeMomentumHeading,
  bodyRelativeSteeringSpeed
} from './src/driving-runtime-base.js';
import {steeringCommand,lateralDynamicsEnvelope} from './src/vehicle-dynamics.js';

function contactsFor(vehicle){
  const half=(Number(vehicle.trackWidth)||1.55)*.5;
  const wb=Number(vehicle.wheelbase)||2.7;
  const fb=Number(vehicle.frontWeightBias)||.55;
  const frontZ=(1-fb)*wb,rearZ=-fb*wb;
  return [
    {localX:-half,localZ:rearZ,front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
    {localX:-half,localZ:frontZ,front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
    {localX:half,localZ:rearZ,front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
    {localX:half,localZ:frontZ,front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
  ];
}

function vehicle(id){return createVehicleSystem({initialId:id}).physics;}
const id4=vehicle('id4'),i3=vehicle('i3_2017'),civic=vehicle('civic'),wrx=vehicle('wrx');

assert.ok(Math.abs(handbrakeDriveRetentionScale({vehicle:id4,handbrake:true})-.28)<1e-9,'ID4 handbrake must retain only front AWD share');
assert.equal(handbrakeDriveRetentionScale({vehicle:i3,handbrake:true}),0,'i3 RWD rear drive must decouple under handbrake');
assert.equal(handbrakeDriveRetentionScale({vehicle:civic,handbrake:true}),1,'FWD front drive remains available under handbrake');
assert.ok(Math.abs(handbrakeDriveRetentionScale({vehicle:wrx,handbrake:true})-.45)<1e-9,'WRX AWD must retain front drive share');

for(const [id,v] of [['id4',id4],['i3_2017',i3]]){
  const mu=(Number(v.longitudinalAccelLimit)||9.8)/9.80665;
  const cap=handbrakeLongitudinalDecelCapacity({vehicle:v,longitudinalMu:mu,slidingMuRatio:.72});
  assert.ok(cap>2&&cap<4,`${id}: rear-only handbrake decel must be plausible, got ${cap}`);
  assert.ok(4-cap*.5>1.2,`${id}: 4 m/s entry should not be numerically stopped before half-second rotation`);
}
assert.equal(shouldCanonicalizeMomentumHeading({speedAbs:1.0}),false,'1 m/s sideways momentum must not be snapped to chassis');
assert.equal(shouldCanonicalizeMomentumHeading({speedAbs:.2}),false,'.2 m/s residual momentum must still be preserved');
assert.equal(shouldCanonicalizeMomentumHeading({speedAbs:.05}),true,'true near-stop may canonicalize momentum heading');

function handbrakeLock(id){
  const v=vehicle(id),solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  let r;
  for(let i=0;i<36;i++)r=solver.advance(1/120,{
    vehicleId:id,vehicle:v,contacts:contactsFor(v),speed:12,heading:Math.PI/2,velocityHeading:0,yawRate:1.2,
    centerSteerAngle:-.38,longitudinalAccel:0,lateralAccel:0,
    requestedDriveAccel:3,requestedBrakeAccel:0,handbrake:true,surfaceId:'asphalt-dry'
  });
  const rear=r.wheels.filter(w=>!w.front);
  assert.equal(rear.length,2,`${id}: expected two rear contacts`);
  assert.ok(rear.every(w=>w.locked),`${id}: powered handbrake must lock rear wheels`);
  return {id,yawAccel:r.predictedYawAccel,rearLocked:rear.every(w=>w.locked)};
}

const locks=[handbrakeLock('id4'),handbrakeLock('i3_2017')];

function jTurnAt90(id){
  const v=vehicle(id),solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  const speed=-12,heading=Math.PI/2,velocityHeading=0,speedAbs=Math.abs(speed),steerInput=-1;
  const steering=steeringCommand({vehicle:v,speedAbs,input:steerInput});
  const steerAngle=steering.maxRoadWheelAngle*steerInput;
  const steeringSpeed=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:false});
  const env=lateralDynamicsEnvelope({
    vehicle:v,speed:steeringSpeed,steerAngle,steerInput,driveThrottle:0,
    onPavement:true,surfaceGrip:1,rearSlipAmount:0,airborne:false
  },{});
  let r;
  for(let i=0;i<30;i++)r=solver.advance(1/120,{
    vehicleId:id,vehicle:v,contacts:contactsFor(v),speed,heading,velocityHeading,yawRate:1.2,
    centerSteerAngle:steerAngle,longitudinalAccel:0,lateralAccel:env.signedLatAccel,
    requestedDriveAccel:0,requestedBrakeAccel:0,handbrake:false,surfaceId:'asphalt-dry'
  });
  assert.ok(r.predictedYawAccel>.2,`${id}: physical front-tire yaw must continue through 90-degree J-turn`);
  return {id,yawAccel:r.predictedYawAccel,steerAngle,steeringSpeed};
}
const jturn=[jTurnAt90('id4'),jTurnAt90('i3_2017')];

console.log('GRIP R18 EV HANDBRAKE / J-TURN QA: PASS',{locks,jturn});
