import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {createPerWheelShadowSolver} from '../src/physics/per-wheel-shadow-solver.js';
import {DEFAULT_WORLD_SETTINGS} from '../src/cache.js';

const DEG=Math.PI/180;
assert.equal('absEnabled' in DEFAULT_WORLD_SETTINGS,false,'ABS still has a persisted default');

const main=fs.readFileSync('src/main.js','utf8');
const menu=fs.readFileSync('src/ui/v21-menu.js','utf8');
const runtime=fs.readFileSync('src/driving-runtime-base.js','utf8');
assert.doesNotMatch(main,/toggleAbs|runtimeAbsEnabled|vehicleHasAbs|getAbsEnabled/,'main still exposes runtime ABS wiring');
assert.doesNotMatch(menu,/v21AbsToggle|toggleAbs|absAvailable/,'driving menu still exposes ABS');
assert.match(runtime,/const serviceBrakeAbsEnabled=false;/,'gameplay runtime does not force the no-ABS path');
assert.doesNotMatch(runtime,/effectiveRuntimeAbsEnabled|getAbsEnabled/,'runtime ABS preference can still reactivate regulation');

const baseVehicle=createVehicleSystem({initialId:'wrx'}).physics;
const vehicle=Object.assign(Object.create(baseVehicle),{absEnabled:false});
const contacts=[];
for(let axleIndex=0;axleIndex<baseVehicle.axles.length;axleIndex++){
  const axle=baseVehicle.axles[axleIndex];
  const halfTrack=Number(axle.trackWidth||baseVehicle.trackWidth)/2;
  contacts.push({
    axleIndex,front:axle.positionM>=0,side:'left',contact:true,contactFactor:1,
    localX:-halfTrack,localZ:axle.positionM
  });
  contacts.push({
    axleIndex,front:axle.positionM>=0,side:'right',contact:true,contactFactor:1,
    localX:halfTrack,localZ:axle.positionM
  });
}

const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
let result=null;
for(let frame=0;frame<72;frame++){
  result=solver.advance(1/120,{
    vehicleId:'wrx',vehicle,contacts,
    speed:30,heading:0,velocityHeading:0,yawRate:0,
    centerSteerAngle:33*DEG,
    longitudinalAccel:-8.5,lateralAccel:6,
    requestedDriveAccel:0,requestedBrakeAccel:-9.5,
    longitudinalLoadTransferAccel:-9.5,
    handbrake:false,surfaceId:'asphalt-dry',
    combinedServiceBrakeControl:false
  });
}

assert.equal(result.wheelCount,4,'no-ABS runtime contract did not resolve four WRX tires');
assert.ok(result.wheels.every(wheel=>!wheel.absActive),'removed ABS still regulated a wheel');
assert.ok(result.wheels.some(wheel=>wheel.locked),'fixed-bias path no longer permits physical wheel lock');

console.log('PHYSICS NO ABS R1 QA: PASS',{
  menuRemoved:true,
  persistenceRemoved:true,
  runtimeForcedOff:true,
  locked:result.wheels.filter(wheel=>wheel.locked).length,
  regulated:result.wheels.filter(wheel=>wheel.absActive).length
});
