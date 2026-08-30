import assert from 'node:assert/strict';
import { steeringCommand } from '../src/vehicle-dynamics.js';

const WRX={
  wheelbase:2.65,
  maxSteerLow:.48,
  maxSteerHigh:.175,
  parkingSteerBoost:.26,
  steeringInputExponent:1.65,
  steeringInputExponentHigh:4.0,
  steeringCurveFullSpeedMps:40,
  steeringResponseLow:5.2,
  steeringResponseMid:4.5,
  steeringResponseHigh:5.6,
  steeringCenterToFullTimeSec:.46,
  steeringReturnToCenterTimeSec:.34,
  lateralAccelLimit:9.32
};

const mechanicalAngle=WRX.maxSteerLow*(1+WRX.parkingSteerBoost);

// Grip R3/R13 supersede the V21.28 fixed-exponent / speed-angle-cap contract.
// Vehicle speed changes analog sensitivity, never mechanical steering lock.
const zeroHalf=steeringCommand({vehicle:WRX,speedAbs:0,input:.50});
assert(Math.abs(zeroHalf.target-.50)<1e-12,'0 km/h: steering input must be linear');
assert(Math.abs(zeroHalf.steeringInputExponent-1)<1e-12,'0 km/h: exponent must be 1.0');

let previousHalf=zeroHalf.target;
let previousExponent=zeroHalf.steeringInputExponent;
for(const kmh of [40,56,80,120,160]){
  const speed=kmh/3.6;
  const quarter=steeringCommand({vehicle:WRX,speedAbs:speed,input:.25});
  const mid=steeringCommand({vehicle:WRX,speedAbs:speed,input:.50});
  const threeQuarter=steeringCommand({vehicle:WRX,speedAbs:speed,input:.75});
  const full=steeringCommand({vehicle:WRX,speedAbs:speed,input:1});

  assert.equal(full.target,1,`${kmh} km/h: full input must remain full rack request`);
  assert(Math.abs(full.maxRoadWheelAngle-mechanicalAngle)<1e-12,`${kmh} km/h: mechanical wheel angle must not shrink with speed`);
  assert.equal(full.highSpeedAuthorityScale,1,`${kmh} km/h: no speed-based steering-angle authority cap`);
  assert.equal(full.gripEnvelopeLimited,0,`${kmh} km/h: tire grip envelope must not hard-limit steering angle`);

  assert(mid.steeringInputExponent>=previousExponent-1e-12,`${kmh} km/h: steering exponent must not decrease with speed`);
  assert(mid.target<=previousHalf+1e-12,`${kmh} km/h: half-stick response must not become stronger with speed`);
  assert(quarter.target<mid.target&&mid.target<threeQuarter.target&&threeQuarter.target<1,`${kmh} km/h: steering curve must remain monotonic`);

  previousHalf=mid.target;
  previousExponent=mid.steeringInputExponent;
}

const at50=steeringCommand({vehicle:WRX,speedAbs:50/3.6,input:.5});
const at80=steeringCommand({vehicle:WRX,speedAbs:80/3.6,input:.5});
const at120=steeringCommand({vehicle:WRX,speedAbs:120/3.6,input:.5});
assert(at50.target<.31&&at50.target>.24,'50 km/h: half-stick should already be progressively softened');
assert(at80.target<at50.target-.09,'80 km/h: half-stick should be substantially softer than 50 km/h');
assert(at120.target<at80.target-.06,'120 km/h: half-stick should be strongly softened');

const quarter80=steeringCommand({vehicle:WRX,speedAbs:80/3.6,input:.25});
const threeQuarter80=steeringCommand({vehicle:WRX,speedAbs:80/3.6,input:.75});
assert(quarter80.target<.04,'80 km/h: small analog input should be strongly attenuated');
assert(threeQuarter80.target>.42&&threeQuarter80.target<.58,'80 km/h: upper analog travel must remain useful');

const rack50=steeringCommand({vehicle:WRX,speedAbs:50/3.6,input:1});
const rack160=steeringCommand({vehicle:WRX,speedAbs:160/3.6,input:1});
assert(rack160.inputRate<rack50.inputRate,'high-speed rack response must remain slower for digital input');

console.table({
  '0 km/h':{half:+zeroHalf.target.toFixed(3),exponent:+zeroHalf.steeringInputExponent.toFixed(3),lock_deg:+(zeroHalf.maxRoadWheelAngle*180/Math.PI).toFixed(1)},
  '50 km/h':{half:+at50.target.toFixed(3),exponent:+at50.steeringInputExponent.toFixed(3),lock_deg:+(at50.maxRoadWheelAngle*180/Math.PI).toFixed(1)},
  '80 km/h':{half:+at80.target.toFixed(3),exponent:+at80.steeringInputExponent.toFixed(3),lock_deg:+(at80.maxRoadWheelAngle*180/Math.PI).toFixed(1)},
  '120 km/h':{half:+at120.target.toFixed(3),exponent:+at120.steeringInputExponent.toFixed(3),lock_deg:+(at120.maxRoadWheelAngle*180/Math.PI).toFixed(1)}
});
console.log('GRIP R13 HIGH SPEED STEERING CURVE QA: PASS');
