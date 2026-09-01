import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicles/vehicle-system.js';
import {GRAVITY,longitudinalTractionLimit} from '../src/physics/vehicle-dynamics.js';
import {combinationDynamics,driveAccelScaleAtSpeed} from '../src/vehicles/truck/truck-trailer.js';

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));

const fleet=createVehicleSystem({initialId:'semi_6x4'});
const v=fleet.physics;
const trailer=fleet.active.trailer;
const combo=combinationDynamics({tractor:v,trailer});
assert.equal(combo.totalMassKg,27100);
assert.equal(v.tractivePowerKw,340);
assert.ok(v.rolling<=.10,'truck rolling resistance should be heavy-vehicle plausible');
assert.ok(v.aero<.0002,'truck aero term should not be arcade-scale');

const roadMu=Math.max(.25,v.longitudinalAccelLimit/GRAVITY);
function delivered(kph){
  const speed=kph/3.6;
  const scale=driveAccelScaleAtSpeed({tractor:v,trailer,speedMps:speed});
  const requested=v.accel*scale;
  const drive=longitudinalTractionLimit({
    vehicle:v,requestedAccel:requested,surfaceMu:roadMu,mode:'drive',airborne:false,speedAbs:speed
  }).acceleration;
  const resist=v.rolling+combo.rollingResistanceAccel+(v.aero+combo.aeroDragCoeff)*speed*speed;
  return {scale,requested,drive,resist};
}

const launch=delivered(0);
const at30=delivered(30);
const at40=delivered(40);
const at60=delivered(60);
assert.ok(launch.drive>1.8,'low gears must deliver strong launch/hill torque');
assert.ok(at30.drive>1.35,'loaded truck should retain useful tractive effort at 30 km/h');
assert.ok(at40.drive>1.0,'loaded truck should sustain moderate grades near 40 km/h');
assert.ok(at60.drive<at40.drive,'power-limited acceleration must fall with speed');

// Grade capability: use g*sin(theta) approximation via percent grade for a QA
// bound. At 10% / 40 km/h the truck should approximately hold or gain speed;
// at 6% / 60 km/h it should be near equilibrium rather than stalling.
const net=(sample,grade)=>sample.drive-sample.resist-GRAVITY*grade;
assert.ok(net(at40,.10)>0,'10% grade at 40 km/h should be climbable in a low enough gear');
assert.ok(net(at60,.06)>-.08,'6% grade at 60 km/h should be sustainable/near equilibrium');

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const truckSrc=fs.readFileSync(new URL('../src/vehicles/truck/truck-trailer.js',import.meta.url),'utf8');
assert.match(main,/version:'21\.23\.1-candidate'/);
assert.match(main,/driveAccelScaleForSpeed\(Math\.abs\(speed\)\)/);
assert.match(main,/modeLabel:\$\('camMode'\)\?\.textContent/);
assert.match(truckSrc,/const truckCameraPos=new THREE\.Vector3\(\)/);
assert.match(truckSrc,/const desiredDistance=27\.0/);
assert.match(truckSrc,/truckCameraPos\.x\+=\(desiredX-truckCameraPos\.x\)\*posAlpha/);
assert.doesNotMatch(truckSrc,/const scale=desiredDistance\/horizontal/,'old passenger-camera rescale fight must be gone');

console.log('V21.23.1 TRUCK CAMERA + TORQUE QA: PASS');
console.table({
  combinationMassKg:combo.totalMassKg,
  wheelPowerKw:combo.wheelPowerKw,
  launchAccel:launch.drive.toFixed(2),
  accel30Kmh:at30.drive.toFixed(2),
  accel40Kmh:at40.drive.toFixed(2),
  accel60Kmh:at60.drive.toFixed(2),
  net10pctAt40:net(at40,.10).toFixed(3),
  net6pctAt60:net(at60,.06).toFixed(3)
});
