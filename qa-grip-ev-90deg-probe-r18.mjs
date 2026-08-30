import {createVehicleSystem} from './src/vehicle-system.js';
import {createPerWheelShadowSolver} from './src/physics/per-wheel-shadow-solver.js';

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

function sample(id,angleDeg,{speed=12,yawRate=1.2,steerDeg=22,driveAccel=0}={}){
  const system=createVehicleSystem({initialId:id});
  const v=system.physics;
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  const input={
    vehicleId:id,vehicle:v,contacts:contactsFor(v),speed,heading:angleDeg*DEG,velocityHeading:0,
    yawRate,centerSteerAngle:-Math.abs(steerDeg)*DEG,longitudinalAccel:0,lateralAccel:0,
    requestedDriveAccel:driveAccel,requestedBrakeAccel:0,handbrake:true,surfaceId:'asphalt-dry'
  };
  let r;
  for(let i=0;i<30;i++)r=solver.advance(1/120,input);
  return {
    id,angleDeg,mass:v.massKg,yawInertiaScale:v.yawInertiaScale,drive:v.drivetrain,
    yawAccel:+r.predictedYawAccel.toFixed(3),ax:+r.predictedAccelX.toFixed(3),az:+r.predictedAccelZ.toFixed(3),
    locked:r.wheels.filter(w=>w.locked).map(w=>`${w.front?'F':'R'}${w.side[0]}`).join(','),
    frontSlip:r.wheels.filter(w=>w.front).map(w=>+(w.slipAngle/DEG).toFixed(1)).join('/'),
    rearSlip:r.wheels.filter(w=>!w.front).map(w=>+(w.slipAngle/DEG).toFixed(1)).join('/')
  };
}

const ids=['id4','i3_2017','wrx','civic','sonata','countach_80'];
for(const driveAccel of [0,3]){
  console.log(`\n=== driveAccel ${driveAccel} m/s2 ===`);
  const rows=[];
  for(const id of ids)for(const angle of [60,75,85,90,95,105,120])rows.push(sample(id,angle,{driveAccel}));
  console.table(rows);
}
