import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicle-system.js';
import {computeGearRedlineSpeeds} from './src/audio-base.js';
import {interpolateTorqueNm,torqueDrivenAcceleration} from './src/physics/powertrain-force.js';

const system=createVehicleSystem({initialId:'wrx'});
const V=system.physics;
const P=system.active.audio;

assert.equal(P.powertrainModel,'torque','WRX must use torque-driven powertrain');
assert.equal(P.redlineRpm,6100,'WRX VB redline calibration');
assert.equal(P.finalDriveRatio,4.111,'WRX 6MT final drive');
assert.deepEqual(P.gearRatios,[3.455,1.947,1.367,1.029,.825,.667],'WRX must use physical 6MT ratios');
assert.ok(Math.abs(interpolateTorqueNm(P.torqueCurveNm,2000)-350)<1e-9,'WRX must reach ~350 Nm by 2000 rpm');
assert.ok(Math.abs(interpolateTorqueNm(P.torqueCurveNm,4000)-350)<1e-9,'WRX broad midrange torque plateau missing');
assert.ok(Math.abs(interpolateTorqueNm(P.torqueCurveNm,5200)-350)<1e-9,'WRX torque plateau must extend to 5200 rpm');
assert.ok(interpolateTorqueNm(P.torqueCurveNm,6100)<350,'torque should taper by redline');

const launch=torqueDrivenAcceleration({vehicle:V,profile:P,gear:1,rpm:P.idleRpm,throttle:1,speedAbs:0});
const second=torqueDrivenAcceleration({vehicle:V,profile:P,gear:2,rpm:4000,throttle:1,speedAbs:20});
const third=torqueDrivenAcceleration({vehicle:V,profile:P,gear:3,rpm:4000,throttle:1,speedAbs:28});
assert.ok(launch.active,'WRX torque model did not activate');
assert.ok(launch.effectiveRpm>=1950,'launch clutch must let the turbo motor enter its torque band');
assert.ok(launch.acceleration>7.5&&launch.acceleration<9.2,`launch wheel-force accel out of range: ${launch.acceleration}`);
assert.ok(second.acceleration>4.2&&second.acceleration<5.1,`second-gear torque out of range: ${second.acceleration}`);
assert.ok(third.acceleration>2.9&&third.acceleration<3.7,`third-gear torque out of range: ${third.acceleration}`);
assert.ok(launch.acceleration>second.acceleration&&second.acceleration>third.acceleration,'gear multiplication must decrease with taller gears');

const redlineSpeeds=computeGearRedlineSpeeds(P,P.redlineRpm);
assert.ok(redlineSpeeds[0]>50&&redlineSpeeds[0]<55,`first gear redline should be near real WRX range, got ${redlineSpeeds[0]}`);
assert.ok(redlineSpeeds[1]>90&&redlineSpeeds[1]<97,`second gear redline unexpected: ${redlineSpeeds[1]}`);
assert.ok(redlineSpeeds[5]>270&&redlineSpeeds[5]<278,'physical sixth-gear redline reference must remain independent from road top-speed cap');
assert.equal(V.powertrainTopSpeedKmh,225,'WRX road-speed cap should stay at existing gameplay/mechanical target');

// Simple full-throttle 0-100 integration. This is intentionally not a drag-race
// simulator; it guards the overall calibration while allowing the real runtime
// tire solver to impose traction and wheelspin separately.
let speed=0,time=0,gear=1,shiftTimer=0;
const dt=1/1000;
while(time<10&&speed<100/3.6){
  const kmh=speed*3.6;
  if(shiftTimer<=0&&gear<6&&kmh>=redlineSpeeds[gear-1]){gear++;shiftTimer=P.shiftDuration;}
  const rpm=Math.max(P.idleRpm,P.redlineRpm*kmh/redlineSpeeds[gear-1]);
  let drive=0;
  if(shiftTimer>0){shiftTimer=Math.max(0,shiftTimer-dt);}else{
    drive=torqueDrivenAcceleration({vehicle:V,profile:P,gear,rpm,throttle:1,speedAbs:speed}).acceleration;
    drive=Math.min(V.longitudinalAccelLimit,drive);
  }
  const drag=speed>.05?V.rolling+V.aero*speed*speed:0;
  speed=Math.max(0,speed+(drive-drag)*dt);
  time+=dt;
}
assert.ok(time>5.15&&time<5.95,`WRX 0-100 calibration escaped target envelope: ${time.toFixed(3)} s`);

console.log('POWER R1 WRX TORQUE QA: PASS',{
  torqueNm:{rpm2000:interpolateTorqueNm(P.torqueCurveNm,2000),rpm5200:interpolateTorqueNm(P.torqueCurveNm,5200),rpm6100:interpolateTorqueNm(P.torqueCurveNm,6100)},
  accelMps2:{launch:+launch.acceleration.toFixed(2),second:+second.acceleration.toFixed(2),third:+third.acceleration.toFixed(2)},
  redlineKmh:redlineSpeeds.map(v=>+v.toFixed(1)),
  zeroTo100Sec:+time.toFixed(3)
});
