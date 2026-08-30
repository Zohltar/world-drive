import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicle-system.js';
import {
  bodyAxisDriveProjection,
  resolveOpposingDriveMomentumCrossing
} from './src/driving-runtime-base.js';
import {createPerWheelShadowSolver} from './src/physics/per-wheel-shadow-solver.js';

const DEG=Math.PI/180;

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

// R17 contract: selector torque is body-axis torque. It must never reverse just
// because the chassis has rotated beyond 90 degrees relative to momentum.
for(const angleDeg of [0,80,89,90,91,100,135,180]){
  const projection=bodyAxisDriveProjection({heading:angleDeg*DEG,velocityHeading:0});
  if(angleDeg<90)assert.ok(projection>0,`${angleDeg}: projection should aid momentum`);
  if(angleDeg===90)assert.ok(Math.abs(projection)<1e-12,`${angleDeg}: projection should be perpendicular`);
  if(angleDeg>90)assert.ok(projection<0,`${angleDeg}: projection should oppose momentum`);
}

// If opposing drivetrain force would make the old scalar integrator cross zero
// while the force still has a perpendicular component, preserve the vector
// momentum instead of snapping velocityHeading to the chassis heading.
const crossingReports=[];
for(const angleDeg of [95,100,120,135]){
  const heading=angleDeg*DEG;
  const resolved=resolveOpposingDriveMomentumCrossing({
    previousSpeed:1.0,
    velocityHeading:0,
    heading,
    nonDriveDeltaSpeed:0,
    bodyDriveAccel:7.0,
    dt:.25
  });
  assert.ok(Math.abs(resolved.speed)>.05,`${angleDeg}: real perpendicular impulse must leave non-zero momentum`);
  assert.ok(Math.abs(resolved.velocityHeading-heading)>.05,`${angleDeg}: momentum must not snap to body heading`);
  crossingReports.push({angleDeg,speed:resolved.speed,velocityHeadingDeg:resolved.velocityHeading/DEG});
}

// At exact 180 degrees a precisely cancelling body-axis impulse may truly stop;
// this is distinct from the artificial 90-degree wall.
const trueStop=resolveOpposingDriveMomentumCrossing({
  previousSpeed:1,
  velocityHeading:0,
  heading:180*DEG,
  nonDriveDeltaSpeed:0,
  bodyDriveAccel:4,
  dt:.25
});
assert.ok(trueStop.stopped||Math.abs(trueStop.speed)<1e-8,'exact opposing impulse may physically stop the car');

// Per-wheel EV torque must remain Drive-positive even beyond 90 degrees. The
// solver receives body-axis acceleration, while the chassis scalar integrator
// separately projects that force onto current momentum.
for(const id of ['id4','i3_2017']){
  const system=createVehicleSystem({initialId:id});
  const vehicle=system.physics;
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  const contacts=contactsFor(vehicle);
  let result=null;
  for(let i=0;i<24;i++){
    result=solver.advance(1/120,{
      vehicleId:id,vehicle,contacts,
      speed:14,heading:100*DEG,velocityHeading:0,yawRate:-1.2,
      centerSteerAngle:-.22,longitudinalAccel:-1.0,lateralAccel:-4,
      requestedDriveAccel:Math.min(4.5,Number(vehicle.accel)||4.5),
      requestedBrakeAccel:0,handbrake:false,surfaceId:'asphalt-dry'
    });
  }
  const driven=result.wheels.filter(w=>{
    const axle=vehicle.axles[w.axleIndex];
    return Number(axle?.driveShare)>1e-6;
  });
  assert.ok(driven.length>=2,`${id}: expected driven tire contacts`);
  assert.ok(result.longitudinalLoadTransferAccel>0,`${id}: Drive torque past 90deg must still transfer load rearward, got ${result.longitudinalLoadTransferAccel}`);
}

console.log('GRIP R17 EV HANDBRAKE / J-TURN MOMENTUM QA: PASS',{crossingReports});
