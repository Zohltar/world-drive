import assert from 'node:assert/strict';
import { steeringCommand } from '../src/vehicle-dynamics.js';

const WRX={
  wheelbase:2.65,
  maxSteerLow:.48,
  maxSteerHigh:.175,
  steeringInputExponent:1.65,
  steeringResponseHigh:5.6,
  steeringCenterToFullTimeSec:.46,
  steeringReturnToCenterTimeSec:.34,
  lateralAccelLimit:9.32
};

function legacyTarget(speed,input,vehicle=WRX){
  const v=Math.max(0,speed);
  const exponent=vehicle.steeringInputExponent??1.65;
  const t=Math.max(0,Math.min(1,(v-8.3)/26.4));
  const s=t*t*(3-2*t);
  return Math.sign(input)*Math.pow(Math.abs(input),exponent+1.15*s);
}

for(const kmh of [40,56,80,120]){
  const speed=kmh/3.6;
  const mid=steeringCommand({vehicle:WRX,speedAbs:speed,input:.50});
  const full=steeringCommand({vehicle:WRX,speedAbs:speed,input:1});
  const legacy=legacyTarget(speed,.50);

  // Full stick still reaches the existing physical road-wheel limit.
  assert.equal(full.target,1,`${kmh} km/h: full input must remain full rack request`);
  assert(mid.maxRoadWheelAngle===full.maxRoadWheelAngle,`${kmh} km/h: input curve must not alter physical wheel-angle cap`);

  // V21.28 removes only the duplicate speed-dependent exponent. The vehicle's
  // normal progressive curve remains, so 50% stick is not made linear/arcade.
  const expected=Math.pow(.5,WRX.steeringInputExponent);
  assert(Math.abs(mid.target-expected)<1e-10,`${kmh} km/h: target must use only vehicle exponent`);
  assert(mid.target>=legacy-1e-10,`${kmh} km/h: steering must never be more attenuated than V21.27`);

  // Existing high-speed safety mechanisms stay active.
  if(speed>27){
    assert(mid.highSpeedAuthorityScale<1,`${kmh} km/h: very-high-speed wheel-angle reduction must remain active`);
    assert(mid.highSpeedResponseScale<1,`${kmh} km/h: very-high-speed rack response reduction must remain active`);
  }
}

const at56=steeringCommand({vehicle:WRX,speedAbs:56/3.6,input:.5});
const old56=legacyTarget(56/3.6,.5);
const at80=steeringCommand({vehicle:WRX,speedAbs:80/3.6,input:.5});
const old80=legacyTarget(80/3.6,.5);

console.table({
  '56 km/h':{v21_28:+at56.target.toFixed(3),v21_27:+old56.toFixed(3),gain_pct:+((at56.target/old56-1)*100).toFixed(1)},
  '80 km/h':{v21_28:+at80.target.toFixed(3),v21_27:+old80.toFixed(3),gain_pct:+((at80.target/old80-1)*100).toFixed(1)}
});
console.log('V21.28 HIGH SPEED STEERING QA: PASS');
