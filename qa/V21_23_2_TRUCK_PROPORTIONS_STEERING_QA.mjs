import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicles/vehicle-system.js';
import {GRAVITY,steeringCommand,longitudinalTractionLimit} from '../src/physics/vehicle-dynamics.js';
import {combinationDynamics,driveAccelScaleAtSpeed,createTrailerState,stepTrailerArticulation} from '../src/vehicles/truck/truck-trailer.js';

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));

const fleet=createVehicleSystem({initialId:'semi_6x4'});
const v=fleet.physics;
const trailer=fleet.active.trailer;
const combo=combinationDynamics({tractor:v,trailer});

// Preserve the real 53 ft trailer and enlarge the tractor instead.
assert.equal(trailer.lengthM,16.15,'53 ft dry van must remain dimensionally real');
assert.equal(trailer.widthM,2.60);
assert.equal(v.bodyLength,8.05);
assert.equal(v.wheelbase,5.45);
assert.equal(v.axles.length,3);
assert.equal(v.axles.reduce((s,a)=>s+a.wheelCount,0),10);
assert.equal(combo.totalMassKg,27100);

// V21.23.2 hairpin geometry: roughly 50.6 deg at a stop, fading quickly so
// road/highway steering remains close to the V21.23.1 profile.
const park=steeringCommand({vehicle:v,speedAbs:0,input:1});
const parkingAngle=park.maxRoadWheelAngle;
const parkingRadius=v.wheelbase/Math.tan(parkingAngle);
assert.ok(parkingAngle>0.87&&parkingAngle<0.90,`parking wheel cut ${(parkingAngle*180/Math.PI).toFixed(2)} deg`);
assert.ok(parkingRadius>4.3&&parkingRadius<4.7,`parking geometric radius ${parkingRadius.toFixed(2)} m`);

// Compare highway authority against the exact V21.23.1 steering profile.
const old={...v,maxSteerLow:.62,parkingSteerBoost:.05};
for(const kph of [80,100,105]){
  const speed=kph/3.6;
  const before=steeringCommand({vehicle:old,speedAbs:speed,input:1}).maxRoadWheelAngle;
  const after=steeringCommand({vehicle:v,speedAbs:speed,input:1}).maxRoadWheelAngle;
  assert.ok(Math.abs(after-before)<.012,`${kph} km/h steering changed too much`);
}

// Camera + torque fixes from V21.23.1 remain in place.
assert.equal(v.tractivePowerKw,340);
const roadMu=Math.max(.25,v.longitudinalAccelLimit/GRAVITY);
function delivered(kph){
  const speed=kph/3.6;
  const scale=driveAccelScaleAtSpeed({tractor:v,trailer,speedMps:speed});
  const requested=v.accel*scale;
  const drive=longitudinalTractionLimit({
    vehicle:v,requestedAccel:requested,surfaceMu:roadMu,mode:'drive',airborne:false,speedAbs:speed
  }).acceleration;
  const resist=v.rolling+combo.rollingResistanceAccel+(v.aero+combo.aeroDragCoeff)*speed*speed;
  return {drive,resist};
}
const launch=delivered(0),at40=delivered(40),at60=delivered(60);
assert.ok(launch.drive>1.8,'truck low-gear torque regression');
assert.ok(at40.drive-at40.resist-GRAVITY*.10>0,'10% grade @ 40 km/h torque regression');
assert.ok(at60.drive-at60.resist-GRAVITY*.06>-.08,'6% grade @ 60 km/h torque regression');

// Articulation remains physical after proportion/steering changes.
{
  let hitchX=0,hitchZ=0;
  const state=createTrailerState({heading:-3*Math.PI/180,hitchX,hitchZ});
  const dt=.01,speed=-3;
  for(let t=0;t<10;t+=dt){
    hitchZ+=speed*dt;
    stepTrailerArticulation({state,hitchX,hitchZ,tractorHeading:0,dt,trailer});
  }
  assert.ok(Math.abs(state.articulation)*180/Math.PI>15,'reverse articulation must still grow naturally');
}

const truckSrc=fs.readFileSync(new URL('../src/vehicles/truck/truck-trailer.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(main,/version:'21\.23\.2-candidate'/);
assert.match(truckSrc,/\[2\.46,\.36,7\.75\]/,'enlarged tractor frame missing');
assert.match(truckSrc,/\[2\.40,\.42,2\.10\]/,'sleeper roof fairing missing');
assert.match(truckSrc,/const desiredDistance=27\.0/,'stable truck chase camera must remain');
assert.doesNotMatch(truckSrc,/53 ft dry-van trailer visual[^]*\[2\.60,3\.70,(?!16\.15)/,'53 ft trailer dimensions changed unexpectedly');

console.log('V21.23.2 TRUCK PROPORTIONS + HAIRPIN STEERING QA: PASS');
console.table({
  trailerLengthM:trailer.lengthM,
  tractorBodyLengthM:v.bodyLength,
  parkingWheelCutDeg:(parkingAngle*180/Math.PI).toFixed(2),
  parkingGeometricRadiusM:parkingRadius.toFixed(2),
  combinationMassKg:combo.totalMassKg
});
