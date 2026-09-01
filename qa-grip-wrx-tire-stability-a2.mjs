import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicles/vehicle-system.js';
import {resolveTireForces,tireProfileForVehicle} from './src/physics/tire-model.js';
import {createPerWheelShadowSolver} from './src/physics/per-wheel-shadow-solver.js';

const DEG=Math.PI/180;
const G=9.80665;
const system=createVehicleSystem({initialId:'wrx'});
const vehicle=system.physics;
const tire=tireProfileForVehicle('wrx',vehicle);
const frontWeight=Number(vehicle.frontWeightBias)||.58;
const mass=Number(vehicle.massKg)||1510;
const frontFz=mass*G*frontWeight/2;
const rearFz=mass*G*(1-frontWeight)/2;
const speed=20;

function lateralSample(fz,deg){
  const a=deg*DEG;
  return resolveTireForces({
    tire,
    surface:'asphalt-dry',
    normalLoadN:fz,
    longitudinalSpeed:speed,
    lateralSpeed:Math.tan(a)*speed,
    wheelOmega:speed/tire.rollingRadiusM,
    steerAngle:0,
    localX:0,
    localZ:0
  });
}

// Preserve the useful V21.27 corner-stability invariant without retaining the
// retired WRX-only chassis authority bridge. Static axle load alone must not make
// the lighter rear axle break away substantially earlier in an ordinary bend.
const front3=lateralSample(frontFz,3);
const rear3=lateralSample(rearFz,3);
assert.equal(front3.saturated,false,'front WRX tire saturates at ordinary 3 degree slip');
assert.equal(rear3.saturated,false,'rear WRX tire saturates at ordinary 3 degree slip');
assert.ok(front3.utilization<.90,'front WRX tire uses too much friction at 3 degree slip');
assert.ok(rear3.utilization<.90,'rear WRX tire uses too much friction at 3 degree slip');
assert.ok(Math.abs(front3.utilization-rear3.utilization)<.03,
  `static load creates mismatched breakaway timing: front=${front3.utilization} rear=${rear3.utilization}`);

// The current tire curve must build progressively through its declared peak and
// retain realistic sliding force afterward. This is the useful physics invariant
// from the old V21.27 corner test; it does not depend on the retired WRX bridge.
const progression=[1,3,5,7,10,15].map(deg=>{
  const sample=lateralSample(rearFz,deg);
  return {deg,force:Math.abs(sample.fyWheel),utilization:sample.utilization,saturated:sample.saturated};
});
for(let i=1;i<=3;i++){
  assert.ok(progression[i].force>progression[i-1].force,
    `lateral force failed to build progressively before peak: ${progression[i-1].deg}->${progression[i].deg}`);
}
assert.ok(progression[4].force>progression[3].force*.88,'tire force falls off too abruptly just after peak slip');
assert.ok(progression[5].force>progression[3].force*.70,'sliding tire loses unrealistic lateral force');

// Common R7+ per-wheel solver must remain symmetric in straight travel. Handbrake
// lock itself is deliberately NOT duplicated here: R2/R18/R20 test the current
// handbrake path more accurately, including drivetrain torque and runtime state.
const wheelbase=Number(vehicle.wheelbase)||2.65;
const track=Number(vehicle.trackWidth)||1.56;
const frontZ=(1-frontWeight)*wheelbase;
const rearZ=-frontWeight*wheelbase;
const halfTrack=track/2;
const contacts=[
  {front:false,axleIndex:1,side:'left',localX:-halfTrack,localZ:rearZ,contact:true,contactFactor:1},
  {front:true,axleIndex:0,side:'left',localX:-halfTrack,localZ:frontZ,contact:true,contactFactor:1},
  {front:false,axleIndex:1,side:'right',localX:halfTrack,localZ:rearZ,contact:true,contactFactor:1},
  {front:true,axleIndex:0,side:'right',localX:halfTrack,localZ:frontZ,contact:true,contactFactor:1}
];
const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
let straight=null;
for(let i=0;i<20;i++){
  straight=solver.advance(1/120,{
    vehicleId:'wrx',vehicle,contacts,speed,
    heading:0,velocityHeading:0,yawRate:0,centerSteerAngle:0,
    longitudinalAccel:0,lateralAccel:0,requestedDriveAccel:0,requestedBrakeAccel:0,
    handbrake:false,surfaceId:'asphalt-dry'
  });
}
assert.ok(Math.abs(straight.predictedYawAccel)<1e-8,'common solver invents yaw in straight WRX travel');
assert.ok(Math.abs(straight.predictedAccelX)<1e-8,'common solver invents lateral acceleration in straight WRX travel');

console.log('CLEANUP A2 WRX COMMON TIRE STABILITY QA: PASS',{progression});
