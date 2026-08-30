import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicle-system.js';
import {createPerWheelShadowSolver} from './src/physics/per-wheel-shadow-solver.js';
import {lateralDynamicsEnvelope,estimateWheelGripUsage} from './src/vehicle-dynamics.js';
import {legacyGripYawAcceleration} from './src/driving-runtime-base.js';

function contactsFor(vehicle){
  const halfTrack=(Number(vehicle.trackWidth)||1.55)*.5;
  const wb=Number(vehicle.wheelbase)||2.7;
  const frontBias=Number(vehicle.frontWeightBias)||.55;
  const frontZ=(1-frontBias)*wb;
  const rearZ=-frontBias*wb;
  return [
    {localX:-halfTrack,localZ:rearZ,front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
    {localX:-halfTrack,localZ:frontZ,front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
    {localX: halfTrack,localZ:rearZ,front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
    {localX: halfTrack,localZ:frontZ,front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
  ];
}

function physicalCase(id,{speed=20,steerDeg=12,driveAccel=4.0,sideslipDeg=0,yawRate=0}={}){
  const system=createVehicleSystem({initialId:id});
  const vehicle=system.physics;
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  const steer=steerDeg*Math.PI/180;
  const sideslip=sideslipDeg*Math.PI/180;
  let result=null;
  for(let i=0;i<24;i++){
    result=solver.advance(1/120,{
      vehicleId:id,vehicle,contacts:contactsFor(vehicle),speed,heading:0,velocityHeading:sideslip,
      yawRate,centerSteerAngle:steer,longitudinalAccel:driveAccel,lateralAccel:Math.sign(steer)*4.0,
      requestedDriveAccel:driveAccel,requestedBrakeAccel:0,handbrake:false,surfaceId:'asphalt-dry'
    });
  }
  return result;
}

function transitionCase(id,{speed=20,steerDeg=-12,driveAccel=4.0}={}){
  const system=createVehicleSystem({initialId:id});
  const vehicle=system.physics;
  const contacts=contactsFor(vehicle);
  const steer=steerDeg*Math.PI/180;
  const env=lateralDynamicsEnvelope({
    vehicle,speed,steerAngle:steer,steerInput:Math.sign(steer),driveThrottle:1,
    onPavement:true,surfaceGrip:1,rearSlipAmount:0,airborne:false
  },{});
  const previous=[0,0,0,0];
  let grip=null;
  for(let i=0;i<18;i++){
    grip=estimateWheelGripUsage({
      requestedLatAccel:Math.min(env.requestedLatAccel,env.latLimit),
      signedLatAccel:Math.sign(env.signedLatAccel||steer)*Math.min(env.requestedLatAccel,env.latLimit),
      latLimit:env.latLimit,longitudinalAccel:driveAccel,propulsionAccel:driveAccel,serviceBrakeAccel:0,
      surfaceMu:1,throttle:1,handbrake:false,handbrakeSlipState:0,sideslipRad:0,
      airborne:false,vehicle,speedAbs:Math.abs(speed),contacts,previousUsage:previous,dt:1/60
    },{});
    for(let k=0;k<4;k++)previous[k]=grip.smoothed[k];
  }
  const legacy=legacyGripYawAcceleration({
    frictionYawAccel:grip.frictionYawAccel,
    yawRate:env.yawRate,
    frontSlip:grip.frontLateral,
    rearSlip:grip.rearLateral
  });
  return {env,grip,legacy};
}

// The physical tire solver itself must follow the steering direction under power.
for(const id of ['civic','sonata','id4','wrx']){
  for(const speed of [10,20,30])for(const steerAbs of [6,12,20]){
    const left=physicalCase(id,{speed,steerDeg:-steerAbs,driveAccel:4.0});
    const right=physicalCase(id,{speed,steerDeg:steerAbs,driveAccel:4.0});
    assert.ok(left.predictedYawAccel<=1e-6,`${id}: left steer produced right physical yaw ${left.predictedYawAccel}`);
    assert.ok(right.predictedYawAccel>=-1e-6,`${id}: right steer produced left physical yaw ${right.predictedYawAccel}`);
    assert.ok(left.predictedAccelX<=1e-6,`${id}: left steer produced right physical accel ${left.predictedAccelX}`);
    assert.ok(right.predictedAccelX>=-1e-6,`${id}: right steer produced left physical accel ${right.predictedAccelX}`);
  }
}

// FWD front saturation may reduce yaw authority, but the legacy loss moment must
// never drive the chassis through zero into steering-opposite yaw by itself.
const reports=[];
for(const id of ['civic','sonata']){
  for(const speed of [12,20,28])for(const steerDeg of [-8,-14,-20,8,14,20]){
    const r=transitionCase(id,{speed,steerDeg,driveAccel:4.0});
    const frontDominated=r.grip.frontLateral>r.grip.rearLateral+.06;
    const opposing=(Number(r.grip.frictionYawAccel)||0)*(Number(r.env.yawRate)||0)<0;
    if(frontDominated&&opposing){
      assert.equal(r.legacy,0,`${id}: front-loss understeer created counter-yaw`);
    }
    reports.push({
      id,speed,steerDeg,
      rawYaw:Number(r.grip.frictionYawAccel.toFixed(3)),
      filteredYaw:Number(r.legacy.toFixed(3)),
      frontSlip:Number(r.grip.frontLateral.toFixed(3)),
      rearSlip:Number(r.grip.rearLateral.toFixed(3))
    });
  }
}

// Rear-dominated oversteer and same-direction tire yaw remain untouched.
assert.equal(legacyGripYawAcceleration({frictionYawAccel:-2.2,yawRate:-.7,frontSlip:.15,rearSlip:.80}),-2.2);
assert.equal(legacyGripYawAcceleration({frictionYawAccel:1.8,yawRate:-.7,frontSlip:.20,rearSlip:.70}),1.8);
assert.equal(legacyGripYawAcceleration({frictionYawAccel:-1.6,yawRate:-.7,frontSlip:.85,rearSlip:.10}),-1.6);

console.log('GRIP R16 FWD POWER-UNDERSTEER COUNTER-YAW QA: PASS');
console.table(reports.slice(0,12));
