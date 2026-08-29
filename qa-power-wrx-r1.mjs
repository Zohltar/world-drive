import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicle-system.js';
import {computeGearRedlineSpeeds} from './src/audio-base.js';
import {interpolateTorqueNm,torqueDrivenAcceleration} from './src/physics/powertrain-force.js';

const system=createVehicleSystem({initialId:'wrx'});
const V=system.physics;
const P=system.active.audio;

// Power R1 is the architectural contract: the WRX must remain driven by
// crank torque, physical gearing and final drive. Later Power revisions may
// deliberately recalibrate the torque curve without invalidating this gate.
assert.equal(P.powertrainModel,'torque','WRX must use torque-driven powertrain');
assert.equal(P.redlineRpm,6100,'WRX VB redline calibration');
assert.equal(P.finalDriveRatio,4.111,'WRX 6MT final drive');
assert.deepEqual(P.gearRatios,[3.455,1.947,1.367,1.029,.825,.667],'WRX must use physical 6MT ratios');
assert.ok(interpolateTorqueNm(P.torqueCurveNm,2000)>=350,'WRX must retain at least stock-class low-rpm torque');
assert.ok(interpolateTorqueNm(P.torqueCurveNm,4000)>=350,'WRX must retain a strong midrange torque plateau');
assert.ok(interpolateTorqueNm(P.torqueCurveNm,5600)>=330,'WRX high-rpm torque collapsed below the intended power band');
assert.ok(interpolateTorqueNm(P.torqueCurveNm,6100)<interpolateTorqueNm(P.torqueCurveNm,4000),'torque should taper by redline');

const launch=torqueDrivenAcceleration({vehicle:V,profile:P,gear:1,rpm:P.idleRpm,throttle:1,speedAbs:0});
const second=torqueDrivenAcceleration({vehicle:V,profile:P,gear:2,rpm:4000,throttle:1,speedAbs:20});
const third=torqueDrivenAcceleration({vehicle:V,profile:P,gear:3,rpm:4000,throttle:1,speedAbs:28});
assert.ok(launch.active,'WRX torque model did not activate');
assert.ok(launch.effectiveRpm>=1950,'launch clutch must let the turbo motor enter its torque band');
assert.ok(launch.acceleration>7.5,`launch wheel-force accel too low: ${launch.acceleration}`);
assert.ok(second.acceleration>4.2,`second-gear torque too low: ${second.acceleration}`);
assert.ok(third.acceleration>2.9,`third-gear torque too low: ${third.acceleration}`);
assert.ok(launch.acceleration>second.acceleration&&second.acceleration>third.acceleration,'gear multiplication must decrease with taller gears');

const redlineSpeeds=computeGearRedlineSpeeds(P,P.redlineRpm);
assert.ok(redlineSpeeds[0]>50&&redlineSpeeds[0]<55,`first gear redline should be near real WRX range, got ${redlineSpeeds[0]}`);
assert.ok(redlineSpeeds[1]>90&&redlineSpeeds[1]<97,`second gear redline unexpected: ${redlineSpeeds[1]}`);
assert.ok(redlineSpeeds[5]>270&&redlineSpeeds[5]<278,'physical sixth-gear redline reference must remain independent from road top-speed cap');
assert.equal(V.powertrainTopSpeedKmh,225,'WRX road-speed cap should stay at existing gameplay/mechanical target');

console.log('POWER R1 WRX TORQUE ARCHITECTURE QA: PASS',{
  torqueNm:{rpm2000:interpolateTorqueNm(P.torqueCurveNm,2000),rpm4000:interpolateTorqueNm(P.torqueCurveNm,4000),rpm5600:interpolateTorqueNm(P.torqueCurveNm,5600),rpm6100:interpolateTorqueNm(P.torqueCurveNm,6100)},
  accelMps2:{launch:+launch.acceleration.toFixed(2),second:+second.acceleration.toFixed(2),third:+third.acceleration.toFixed(2)},
  redlineKmh:redlineSpeeds.map(v=>+v.toFixed(1))
});
