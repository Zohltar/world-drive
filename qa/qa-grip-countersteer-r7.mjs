import assert from 'node:assert/strict';
import {createPerWheelShadowSolver} from '../src/physics/per-wheel-shadow-solver.js';
import {
  driftTireForceAuthority,
  tireForceTrajectoryYawRate,
  blendDriftForce
} from '../src/physics/drift-force-coupling.js';

const DEG=Math.PI/180;
const vehicle={
  id:'wrx',
  massKg:1510,
  wheelbase:2.65,
  trackWidth:1.56,
  frontWeightBias:.58,
  cgHeight:.50,
  yawInertiaScale:.96,
  drivetrain:'AWD',
  driveBiasFront:.45,
  brakeBiasFront:.62,
  absEnabled:true,
  tireProfile:'performance-summer'
};
const frontZ=(1-vehicle.frontWeightBias)*vehicle.wheelbase;
const rearZ=-vehicle.frontWeightBias*vehicle.wheelbase;
const halfTrack=vehicle.trackWidth/2;
const contacts=[
  {front:false,axleIndex:1,side:'left',localX:-halfTrack,localZ:rearZ,contact:true,contactFactor:1},
  {front:true,axleIndex:0,side:'left',localX:-halfTrack,localZ:frontZ,contact:true,contactFactor:1},
  {front:false,axleIndex:1,side:'right',localX:halfTrack,localZ:rearZ,contact:true,contactFactor:1},
  {front:true,axleIndex:0,side:'right',localX:halfTrack,localZ:frontZ,contact:true,contactFactor:1}
];

// Right-hand drift: chassis points farther right than its momentum (negative
// body sideslip). Driver countersteers left. A physical tire solver must create
// a lateral force that bends momentum back TOWARD the chassis while producing a
// stabilizing yaw moment, not translate the whole car farther left with steering.
const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
let result=null;
for(let i=0;i<12;i++){
  result=solver.advance(1/120,{
    vehicleId:'wrx',vehicle,contacts,
    speed:20,
    heading:20*DEG,
    velocityHeading:0,
    yawRate:.62,
    centerSteerAngle:-21*DEG,
    longitudinalAccel:0,
    lateralAccel:0,
    requestedDriveAccel:0,
    requestedBrakeAccel:0,
    handbrake:false,
    surfaceId:'asphalt-dry'
  });
}

assert.ok(result?.wheelCount===4,'shadow solver must resolve all four WRX tires');
assert.ok(result.bodyVx<0,'scenario must have negative body lateral velocity');
assert.ok(result.predictedAccelX>0,'tire force must oppose the lateral slide instead of following countersteer direction');
assert.ok(result.predictedYawAccel<0,'countersteer/rear tire forces must provide stabilizing yaw acceleration');

const physicalTrajectoryYawRate=tireForceTrajectoryYawRate({
  bodyVx:result.bodyVx,
  bodyVz:result.bodyVz,
  accelX:result.predictedAccelX,
  accelZ:result.predictedAccelZ
});
assert.ok(physicalTrajectoryYawRate>0,'physical tire force must bend momentum back toward the chassis heading');

const authority=driftTireForceAuthority({sideslipRad:20*DEG,forceCoupledSlide:.35});
assert.ok(authority>.45,'20 degree drift must substantially promote per-wheel tire force authority');
assert.ok(authority<1,'authority transition must remain progressive at moderate drift angle');

// Legacy bicycle force follows steering sign here (negative), exactly opposite
// the physical momentum correction above. R7 must therefore replace it as drift
// authority rises rather than averaging back toward the wrong direction.
const legacyTrajectoryYawRate=-.32;
const blended=blendDriftForce(legacyTrajectoryYawRate,physicalTrajectoryYawRate,authority);
assert.ok(blended>legacyTrajectoryYawRate,'R7 blend must move trajectory response toward the physical tire-force direction');

console.log('GRIP R7 COUNTERSTEER QA: PASS');
console.log(JSON.stringify({
  bodyVx:result.bodyVx,
  bodyVz:result.bodyVz,
  predictedAccelX:result.predictedAccelX,
  predictedAccelZ:result.predictedAccelZ,
  predictedYawAccel:result.predictedYawAccel,
  physicalTrajectoryYawRate,
  authority,
  blended
},null,2));
