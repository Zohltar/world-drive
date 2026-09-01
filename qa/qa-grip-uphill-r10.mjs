import assert from 'node:assert/strict';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicles/vehicle-system.js';
import {createPerWheelShadowSolver} from '../src/physics/per-wheel-shadow-solver.js';

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));

function contactsFor(vehicle){
  const out=[];
  for(let axleIndex=0;axleIndex<vehicle.axles.length;axleIndex++){
    const axle=vehicle.axles[axleIndex];
    const perSide=Math.max(1,Math.round((Number(axle.wheelCount)||2)/2));
    const halfTrack=Math.max(.4,Number(axle.trackWidth||vehicle.trackWidth||1.55))/2;
    for(const side of ['left','right']){
      for(let i=0;i<perSide;i++){
        out.push({
          front:axle.positionM>=0,
          axleIndex,
          side,
          localX:side==='left'?-halfTrack:halfTrack,
          localZ:Number(axle.positionM)||0,
          contact:true,
          contactFactor:1
        });
      }
    }
  }
  return out;
}

function run(vehicleId,vehicle,{
  speed=30,
  longitudinalAccel=0,
  requestedDriveAccel=0,
  requestedBrakeAccel=0,
  centerSteerAngle=.025,
  lateralAccel=2.2
}={}){
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  const contacts=contactsFor(vehicle);
  let result=null;
  for(let i=0;i<24;i++){
    result=solver.advance(1/120,{
      vehicleId,
      vehicle,
      contacts,
      speed,
      heading:0,
      velocityHeading:0,
      yawRate:0,
      centerSteerAngle,
      longitudinalAccel,
      lateralAccel,
      requestedDriveAccel,
      requestedBrakeAccel,
      handbrake:false,
      surfaceId:'asphalt-dry'
    });
  }
  return result;
}

function almostEqual(a,b,eps=1e-9){
  return Math.abs(Number(a)-Number(b))<=eps;
}

// Core regression: gravity-induced deceleration on a climb is not a tire force.
// Coasting uphill may reduce road speed, but it must not shift normal load to the
// front axle and artificially make the rear fragile.
const system=createVehicleSystem({initialId:'wrx'});
for(const info of system.list()){
  if(system.activeId!==info.id)system.select(info.id);
  const vehicle=system.physics;
  const coast=run(info.id,vehicle,{
    longitudinalAccel:-2.0,
    requestedDriveAccel:0,
    requestedBrakeAccel:0,
    centerSteerAngle:.018,
    lateralAccel:1.5
  });
  assert.ok(Array.isArray(coast.axleLoads)&&coast.axleLoads.length===vehicle.axles.length,`${info.id}: missing axle-load diagnostics`);
  const staticTotal=vehicle.axles.reduce((sum,a)=>sum+Math.max(0,Number(a.staticLoadFraction)||0),0)||1;
  for(let i=0;i<vehicle.axles.length;i++){
    const expected=Math.max(0,Number(vehicle.axles[i].staticLoadFraction)||0)/staticTotal;
    assert.ok(almostEqual(coast.axleLoads[i],expected,1e-8),`${info.id}: uphill gravity changed axle ${i} load ${coast.axleLoads[i]} vs static ${expected}`);
  }
  assert.ok(Math.abs(coast.longitudinalLoadTransferAccel)<1e-9,`${info.id}: coasting grade leaked into load transfer`);
}

// Powered climb while still losing speed: net chassis acceleration can be
// negative even though the tires are pushing forward. Load transfer must follow
// the forward tire force, not the negative net acceleration from gravity.
system.select('wrx');
const wrx=system.physics;
const poweredUphill=run('wrx',wrx,{
  longitudinalAccel:-1.5,
  requestedDriveAccel:3.2,
  requestedBrakeAccel:0,
  centerSteerAngle:.030,
  lateralAccel:2.6
});
const poweredFlat=run('wrx',wrx,{
  longitudinalAccel:3.2,
  requestedDriveAccel:3.2,
  requestedBrakeAccel:0,
  centerSteerAngle:.030,
  lateralAccel:2.6
});
assert.ok(poweredUphill.longitudinalLoadTransferAccel>0,'powered uphill must retain rearward acceleration load transfer');
assert.ok(poweredUphill.axleLoads[0]<wrx.frontWeightBias,'powered uphill should load rear, not front');
assert.ok(poweredUphill.axleLoads[1]>(1-wrx.frontWeightBias),'powered uphill rear axle should gain normal load');
for(let i=0;i<poweredUphill.axleLoads.length;i++){
  assert.ok(almostEqual(poweredUphill.axleLoads[i],poweredFlat.axleLoads[i],1e-8),`powered climb axle ${i} differs from equal tire-force flat case`);
}
assert.ok(Math.abs(poweredUphill.predictedYawAccel-poweredFlat.predictedYawAccel)<1e-7,'grade-only net acceleration must not create extra steering yaw');

// The same separation must hold under service braking on a slope: gravity can
// add to net deceleration without being counted a second time as brake pitch.
const brakingUphill=run('wrx',wrx,{
  longitudinalAccel:-6.0,
  requestedDriveAccel:0,
  requestedBrakeAccel:-4.5,
  centerSteerAngle:.022,
  lateralAccel:2.0
});
const brakingFlat=run('wrx',wrx,{
  longitudinalAccel:-4.5,
  requestedDriveAccel:0,
  requestedBrakeAccel:-4.5,
  centerSteerAngle:.022,
  lateralAccel:2.0
});
for(let i=0;i<brakingUphill.axleLoads.length;i++){
  assert.ok(almostEqual(brakingUphill.axleLoads[i],brakingFlat.axleLoads[i],1e-8),`braking climb axle ${i} double-counted grade`);
}

console.log('GRIP R10 UPHILL LOAD-TRANSFER QA: PASS',{
  poweredNetAccel:-1.5,
  poweredTireForceAccel:poweredUphill.longitudinalLoadTransferAccel,
  poweredAxleLoads:poweredUphill.axleLoads,
  staticFront:wrx.frontWeightBias,
  poweredYawAccel:poweredUphill.predictedYawAccel
});
