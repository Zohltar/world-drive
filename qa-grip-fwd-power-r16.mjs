import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicle-system.js';
import {createPerWheelShadowSolver} from './src/physics/per-wheel-shadow-solver.js';

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

function runCase(id,{speed=20,steerDeg=12,driveAccel=4.0,sideslipDeg=0,yawRate=0}={}){
  const system=createVehicleSystem({initialId:id});
  const vehicle=system.physics;
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  const steer=steerDeg*Math.PI/180;
  const sideslip=sideslipDeg*Math.PI/180;
  let result=null;
  for(let i=0;i<24;i++){
    result=solver.advance(1/120,{
      vehicleId:id,
      vehicle,
      contacts:contactsFor(vehicle),
      speed,
      heading:0,
      velocityHeading:sideslip,
      yawRate,
      centerSteerAngle:steer,
      longitudinalAccel:driveAccel,
      lateralAccel:Math.sign(steer)*4.0,
      requestedDriveAccel:driveAccel,
      requestedBrakeAccel:0,
      handbrake:false,
      surfaceId:'asphalt-dry'
    });
  }
  return result;
}

const reports=[];
for(const id of ['civic','sonata','id4','wrx']){
  for(const speed of [10,20,30]){
    for(const steerAbs of [6,12,20]){
      const left=runCase(id,{speed,steerDeg:-steerAbs,driveAccel:4.0});
      const right=runCase(id,{speed,steerDeg:steerAbs,driveAccel:4.0});
      reports.push({id,speed,steerAbs,leftYaw:left.predictedYawAccel,rightYaw:right.predictedYawAccel,leftAx:left.predictedAccelX,rightAx:right.predictedAccelX});
      assert.ok(left.predictedYawAccel<=1e-6,`${id} ${speed}m/s ${steerAbs}deg left throttle produced right yaw ${left.predictedYawAccel}`);
      assert.ok(right.predictedYawAccel>=-1e-6,`${id} ${speed}m/s ${steerAbs}deg right throttle produced left yaw ${right.predictedYawAccel}`);
      assert.ok(left.predictedAccelX<=1e-6,`${id} left steer produced right lateral accel ${left.predictedAccelX}`);
      assert.ok(right.predictedAccelX>=-1e-6,`${id} right steer produced left lateral accel ${right.predictedAccelX}`);
      const mirrorYaw=Math.abs(left.predictedYawAccel+right.predictedYawAccel);
      assert.ok(mirrorYaw<.25,`${id} yaw mirror asymmetry ${mirrorYaw}`);
    }
  }
}
console.log('GRIP R16 FWD POWER-SLIDE DIRECTION QA: PASS');
console.table(reports);
