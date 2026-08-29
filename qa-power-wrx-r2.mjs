import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicle-system.js';
import {computeGearRedlineSpeeds} from './src/audio-base.js';
import {interpolateTorqueNm,torqueDrivenAcceleration} from './src/physics/powertrain-force.js';

const system=createVehicleSystem({initialId:'wrx'});
const V=system.physics;
const P=system.active.audio;

const torque=rpm=>interpolateTorqueNm(P.torqueCurveNm,rpm);
const powerKw=rpm=>torque(rpm)*rpm/9549;

assert.equal(P.peakTorqueNm,420,'Power R2 WRX target torque must remain 420 Nm');
assert.equal(P.drivetrainEfficiency,.86,'Power R2 AWD efficiency calibration changed');
assert.ok(Math.abs(torque(1800)-420)<1e-9,'420 Nm plateau must begin by 1800 rpm');
assert.ok(Math.abs(torque(4000)-420)<1e-9,'midrange torque plateau missing');
assert.ok(Math.abs(torque(4600)-420)<1e-9,'torque plateau must remain through 4600 rpm');
assert.ok(Math.abs(torque(5200)-372)<1e-9,'5200 rpm taper changed');
assert.ok(Math.abs(torque(5600)-345)<1e-9,'5600 rpm torque must preserve ~271 hp high-rpm output');
assert.ok(Math.abs(torque(6100)-300)<1e-9,'redline torque taper changed');

// R2 intentionally broadens the torque band while keeping peak power near the
// original ~271 hp envelope rather than increasing top-end speed.
assert.ok(powerKw(4600)>200&&powerKw(4600)<205,`4600 rpm power escaped target: ${powerKw(4600)}`);
assert.ok(powerKw(5200)>200&&powerKw(5200)<205,`5200 rpm power escaped target: ${powerKw(5200)}`);
assert.ok(powerKw(5600)>200&&powerKw(5600)<205,`5600 rpm power escaped target: ${powerKw(5600)}`);

const launch=torqueDrivenAcceleration({vehicle:V,profile:P,gear:1,rpm:2000,throttle:1,speedAbs:0});
const second=torqueDrivenAcceleration({vehicle:V,profile:P,gear:2,rpm:4000,throttle:1,speedAbs:20});
const third=torqueDrivenAcceleration({vehicle:V,profile:P,gear:3,rpm:4000,throttle:1,speedAbs:28});
assert.ok(launch.acceleration>10.0,'raw first-gear wheel torque should now exceed the tire traction ceiling');
assert.ok(second.acceleration>5.7&&second.acceleration<6.05,`second-gear punch out of R2 range: ${second.acceleration}`);
assert.ok(third.acceleration>4.0&&third.acceleration<4.25,`third-gear punch out of R2 range: ${third.acceleration}`);

const redlineSpeeds=computeGearRedlineSpeeds(P,P.redlineRpm);
let speed=0,time=0,gear=1,shiftTimer=0;
const dt=1/1000;
while(time<10&&speed<100/3.6){
  const kmh=speed*3.6;
  if(shiftTimer<=0&&gear<6&&kmh>=redlineSpeeds[gear-1]){gear++;shiftTimer=P.shiftDuration;}
  const rpm=Math.max(P.idleRpm,P.redlineRpm*kmh/redlineSpeeds[gear-1]);
  let drive=0;
  if(shiftTimer>0){
    shiftTimer=Math.max(0,shiftTimer-dt);
  }else{
    drive=torqueDrivenAcceleration({vehicle:V,profile:P,gear,rpm,throttle:1,speedAbs:speed}).acceleration;
    drive=Math.min(V.longitudinalAccelLimit,drive);
  }
  const drag=speed>.05?V.rolling+V.aero*speed*speed:0;
  speed=Math.max(0,speed+(drive-drag)*dt);
  time+=dt;
}
assert.ok(time>4.5&&time<4.95,`Power R2 WRX 0-100 escaped punch target: ${time.toFixed(3)} s`);
assert.equal(V.powertrainTopSpeedKmh,225,'R2 must not increase WRX road top-speed cap');

console.log('POWER R2 WRX MIDRANGE TORQUE QA: PASS',{
  torqueNm:{rpm1800:torque(1800),rpm4000:torque(4000),rpm4600:torque(4600),rpm5200:torque(5200),rpm5600:torque(5600),rpm6100:torque(6100)},
  powerKw:{rpm4600:+powerKw(4600).toFixed(1),rpm5200:+powerKw(5200).toFixed(1),rpm5600:+powerKw(5600).toFixed(1)},
  accelMps2:{launch:+launch.acceleration.toFixed(2),second:+second.acceleration.toFixed(2),third:+third.acceleration.toFixed(2)},
  zeroTo100Sec:+time.toFixed(3)
});
