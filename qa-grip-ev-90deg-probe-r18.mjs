import {createVehicleSystem} from './src/vehicle-system.js';
import {createPerWheelShadowSolver} from './src/physics/per-wheel-shadow-solver.js';
import {bodyRelativeLongitudinalSpeed,bodyRelativeSteeringSpeed,jTurnTransientYawActive} from './src/driving-runtime-base.js';
import {steeringCommand,lateralDynamicsEnvelope} from './src/vehicle-dynamics.js';

const DEG=Math.PI/180;

function contactsFor(vehicle){
  const half=(Number(vehicle.trackWidth)||1.55)*.5;
  const wb=Number(vehicle.wheelbase)||2.7;
  const fb=Number(vehicle.frontWeightBias)||.55;
  const frontZ=(1-fb)*wb;
  const rearZ=-fb*wb;
  return [
    {localX:-half,localZ:rearZ,front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
    {localX:-half,localZ:frontZ,front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
    {localX: half,localZ:rearZ,front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
    {localX: half,localZ:frontZ,front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
  ];
}

function handSample(id,angleDeg,{speed=12,yawRate=1.2,steerDeg=22,driveAccel=0}={}){
  const system=createVehicleSystem({initialId:id});
  const v=system.physics;
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  const input={vehicleId:id,vehicle:v,contacts:contactsFor(v),speed,heading:angleDeg*DEG,velocityHeading:0,
    yawRate,centerSteerAngle:-Math.abs(steerDeg)*DEG,longitudinalAccel:0,lateralAccel:0,
    requestedDriveAccel:driveAccel,requestedBrakeAccel:0,handbrake:true,surfaceId:'asphalt-dry'};
  let r;for(let i=0;i<30;i++)r=solver.advance(1/120,input);
  return {id,angleDeg,mass:v.massKg,drive:v.drivetrain,yawAccel:+r.predictedYawAccel.toFixed(3),
    locked:r.wheels.filter(w=>w.locked).map(w=>`${w.front?'F':'R'}${w.side[0]}`).join(',')};
}

function jSample(id,angleDeg,{speed=-12,yawRate=1.2,input=-1}={}){
  const system=createVehicleSystem({initialId:id});
  const v=system.physics;
  const heading=angleDeg*DEG,velocityHeading=0,speedAbs=Math.abs(speed);
  const steering=steeringCommand({vehicle:v,speedAbs,input});
  const steerAngle=steering.maxRoadWheelAngle*input;
  const bodyLong=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});
  const steeringSpeed=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:false});
  const transient=jTurnTransientYawActive({bodyLongitudinalSpeed:bodyLong,speedAbs,steerAngle,handbrake:false,airborne:false,onPavement:true});
  const env=lateralDynamicsEnvelope({vehicle:v,speed:steeringSpeed,steerAngle,steerInput:input,driveThrottle:0,onPavement:true,surfaceGrip:1,rearSlipAmount:0,airborne:false},{});
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  const solverInput={vehicleId:id,vehicle:v,contacts:contactsFor(v),speed,heading,velocityHeading,yawRate,
    centerSteerAngle:steerAngle,longitudinalAccel:0,lateralAccel:env.signedLatAccel,
    requestedDriveAccel:0,requestedBrakeAccel:0,handbrake:false,surfaceId:'asphalt-dry'};
  let r;for(let i=0;i<30;i++)r=solver.advance(1/120,solverInput);
  return {id,angleDeg,bodyLong:+bodyLong.toFixed(2),steeringSpeed:+steeringSpeed.toFixed(2),transient,
    bicycleYaw:+env.yawRate.toFixed(3),physicalYawAccel:+r.predictedYawAccel.toFixed(3)};
}

const ids=['id4','i3_2017','wrx','civic','sonata','countach_80'];
for(const driveAccel of [0,3]){
  console.log(`\n=== HANDBRAKE driveAccel ${driveAccel} m/s2 ===`);
  const rows=[];for(const id of ids)for(const angle of [60,75,85,90,95,105,120])rows.push(handSample(id,angle,{driveAccel}));
  console.table(rows);
}
console.log('\n=== REVERSE J-TURN ===');
const jrows=[];for(const id of ids)for(const angle of [60,70,75,80,85,88,90,92,95,100,105,110,120])jrows.push(jSample(id,angle));
console.table(jrows);
