import assert from 'node:assert/strict';
import {steeringCommand} from './src/physics/vehicle-dynamics.js';

const vehicle={
  maxSteerLow:.46,
  parkingSteerBoost:.26,
  steeringCurveFullSpeedMps:40,
  steeringInputExponentHigh:3.2,
  steeringResponseLow:5.2,
  steeringResponseMid:4.5,
  steeringResponseHigh:3.8
};

const speeds=[0,50/3.6,80/3.6,120/3.6,160/3.6];
const half=speeds.map(speedAbs=>steeringCommand({vehicle,speedAbs,input:.5},{}));
const full=speeds.map(speedAbs=>steeringCommand({vehicle,speedAbs,input:1},{}));
const mechanical=.46*1.26;

for(const r of full){
  assert.ok(Math.abs(r.maxRoadWheelAngle-mechanical)<1e-12,'mechanical steering lock must not shrink with speed');
  assert.equal(r.target,1,'100% input must retain 100% steering authority');
  assert.equal(r.gripEnvelopeLimited,0,'grip envelope must be diagnostic only');
}

assert.ok(Math.abs(half[0].target-.5)<1e-12,'0 km/h steering must be linear');
assert.ok(half[1].target<half[0].target-.10,'50 km/h must soften half-stick input');
assert.ok(half[2].target<half[1].target-.07,'80 km/h must further soften half-stick input');
assert.ok(half[3].target<half[2].target-.05,'120 km/h must strongly soften half-stick input');
assert.ok(half[4].target<=half[3].target+.005,'curve should be near maximum by 160 km/h');
assert.ok(full[4].inputRate<full[1].inputRate,'rack response must still slow at high speed for digital inputs');

const quarter80=steeringCommand({vehicle,speedAbs:80/3.6,input:.25},{});
const threeQuarter80=steeringCommand({vehicle,speedAbs:80/3.6,input:.75},{});
assert.ok(quarter80.target<.08,'small 80 km/h input should be strongly softened');
assert.ok(threeQuarter80.target>.45&&threeQuarter80.target<.65,'large 80 km/h input should remain usable');

console.log('PASS Grip R3 speed-sensitive steering curve',{
  mechanicalDeg:mechanical*180/Math.PI,
  halfStick:speeds.map((s,i)=>({kmh:Math.round(s*3.6),target:Number(half[i].target.toFixed(3)),exponent:Number(half[i].steeringInputExponent.toFixed(3))})),
  quarter80:Number(quarter80.target.toFixed(3)),
  threeQuarter80:Number(threeQuarter80.target.toFixed(3))
});
