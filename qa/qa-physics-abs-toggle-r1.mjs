import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {createPerWheelShadowSolver} from '../src/physics/per-wheel-shadow-solver.js';
import {effectiveRuntimeAbsEnabled} from '../src/driving-runtime-base.js';
import {DEFAULT_WORLD_SETTINGS} from '../src/cache.js';

const DEG=Math.PI/180;

assert.equal(DEFAULT_WORLD_SETTINGS.absEnabled,true,'ABS must remain enabled by default');
assert.equal(effectiveRuntimeAbsEnabled({vehicle:{},userEnabled:true}),true);
assert.equal(effectiveRuntimeAbsEnabled({vehicle:{},userEnabled:false}),false);
assert.equal(
  effectiveRuntimeAbsEnabled({vehicle:{absEnabled:false},userEnabled:true}),
  false,
  'the player switch must not add ABS to a vehicle that does not have it'
);

const baseVehicle=createVehicleSystem({initialId:'wrx'}).physics;
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

function hardBrake(absEnabled){
  const vehicle=Object.assign(Object.create(baseVehicle),{absEnabled});
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
      combinedServiceBrakeControl:absEnabled
    });
  }
  return result;
}

const absOn=hardBrake(true);
const absOff=hardBrake(false);

assert.equal(absOn.wheelCount,4,'ABS comparison did not resolve four WRX tires');
assert.ok(absOn.wheels.some(wheel=>wheel.absActive),'ABS ON never regulated a wheel');
assert.ok(absOn.wheels.every(wheel=>!wheel.locked),'ABS ON left a wheel locked');
assert.ok(absOff.wheels.every(wheel=>!wheel.absActive),'ABS OFF still regulated a wheel');
assert.ok(absOff.wheels.some(wheel=>wheel.locked),'ABS OFF did not permit real wheel lock');

const main=fs.readFileSync('src/main.js','utf8');
const menu=fs.readFileSync('src/ui/v21-menu.js','utf8');
const runtime=fs.readFileSync('src/driving-runtime-base.js','utf8');
assert.match(main,/getAbsEnabled:\(\)=>appSettings\.absEnabled!==false/,'runtime ABS preference wiring missing');
assert.match(main,/function toggleAbs\(\)/,'ABS toggle controller missing');
assert.match(menu,/v21AbsToggle/,'ABS menu control missing');
assert.match(runtime,/vehicle:runtimeVehicle,contacts:/,'per-wheel solver does not receive runtime ABS policy');
assert.match(runtime,/airborne:airborneNow,vehicle:runtimeVehicle,speedAbs/,'aggregate tire solver does not receive runtime ABS policy');

const summarize=result=>({
  locked:result.wheels.filter(wheel=>wheel.locked).length,
  regulated:result.wheels.filter(wheel=>wheel.absActive).length,
  front:result.wheels.filter(wheel=>wheel.front).map(wheel=>({
    side:wheel.side,
    locked:wheel.locked,
    absActive:wheel.absActive,
    slipRatio:Number(wheel.slipRatio.toFixed(3))
  }))
});

console.log('PHYSICS ABS TOGGLE R1 QA: PASS',{
  absOn:summarize(absOn),
  absOff:summarize(absOff),
  persistenceDefault:DEFAULT_WORLD_SETTINGS.absEnabled
});
