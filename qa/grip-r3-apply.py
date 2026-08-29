from pathlib import Path

p=Path('src/vehicle-dynamics-v21.29.js')
s=p.read_text()
marker='export function steeringCommand({vehicle,speedAbs=0,input=0}={},out=null){'
start=s.find(marker)
if start<0:
    raise SystemExit('steeringCommand marker not found')

new='''export function steeringCommand({vehicle,speedAbs=0,input=0}={},out=null){
  const result=out||{};
  const v=Math.max(0,safeNumber(speedAbs,0));
  const raw=clampDynamics(safeNumber(input,0),-1,1);

  // Grip R3 — steering geometry keeps its real mechanical lock at every speed.
  // Speed changes sensitivity, not the maximum road-wheel angle. This preserves
  // emergency/full-lock manoeuvres and handbrake turns while making small
  // analog inputs progressively softer as speed rises.
  const low=safeNumber(vehicle?.maxSteerLow,.46);
  const parkingSteerBoost=clampDynamics(safeNumber(vehicle?.parkingSteerBoost,.26),0,.50);
  const defaultMechanicalAngle=low*(1+parkingSteerBoost);
  const maxRoadWheelAngle=Math.max(
    .08,
    safeNumber(vehicle?.maxSteerMechanical,defaultMechanicalAngle)
  );

  // 0 km/h is linear. The curve then grows smoothly toward a strong high-speed
  // exponent. At full input pow(1,p) is still 1, so there is no hidden angle cap.
  const steeringCurveFullSpeedMps=Math.max(
    18,
    safeNumber(vehicle?.steeringCurveFullSpeedMps,40)
  );
  const steeringCurveMaxExponent=Math.max(
    1.4,
    safeNumber(vehicle?.steeringInputExponentHigh,3.2)
  );
  const steeringCurveT=smoothstep01(v/steeringCurveFullSpeedMps);
  const steeringInputExponent=
    1+(steeringCurveMaxExponent-1)*steeringCurveT;

  let target=raw;
  if(Math.abs(target)<.08){
    target=0;
  }else{
    target=Math.sign(target)*Math.pow(Math.abs(target),steeringInputExponent);
  }

  // Keep the old grip-envelope calculation as a diagnostic only. Tire physics
  // decides understeer/saturation; this value must never clamp steering angle.
  const steeringGripEnvelopeFraction=clampDynamics(
    safeNumber(vehicle?.steeringGripEnvelopeFraction,0),
    0,
    1
  );
  let gripEnvelopeRoadWheelAngle=0;
  if(steeringGripEnvelopeFraction>0&&v>4){
    const layout=vehicleLayout(vehicle);
    const aero=safeNumber(vehicle?.aeroDownforceClA,0)>0
      ?aerodynamicLoad({vehicle,speedAbs:v,airborne:false},steeringAeroScratch)
      :null;
    const aeroGripScale=aero?.gripScale||1;
    const lateralEnvelopeAccel=
      Math.max(1,safeNumber(vehicle?.lateralAccelLimit,7))*
      aeroGripScale*
      steeringGripEnvelopeFraction;
    gripEnvelopeRoadWheelAngle=Math.atan(
      (lateralEnvelopeAccel*layout.wheelbase)/Math.max(16,v*v)
    );
  }

  // Rack motion still slows at high speed. This matters for keyboard input,
  // where raw input is binary and therefore cannot benefit from an analog curve
  // until the rack has had time to travel toward full lock.
  const highSpeedResponseT=clampDynamics((v-20)/32,0,1);
  const highSpeedResponseSmooth=
    highSpeedResponseT*highSpeedResponseT*(3-2*highSpeedResponseT);
  const highSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseHigh,3.8));
  const highSpeedResponseScale=1-.48*highSpeedResponseSmooth;
  const lowSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseLow,5.2));
  const midSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseMid,4.5));
  const lowReturnRate=Math.max(.5,safeNumber(vehicle?.steeringReturnRateLow,7.2));
  const highReturnRate=Math.max(.5,safeNumber(vehicle?.steeringReturnRateHigh,7.5));

  result.target=target;
  result.maxRoadWheelAngle=maxRoadWheelAngle;
  result.inputRate=v<5
    ?lowSpeedResponse
    :(v>20?highSpeedResponse*highSpeedResponseScale:midSpeedResponse);
  result.returnRate=v<5?lowReturnRate:highReturnRate;

  const centerToFullTimeSec=safeNumber(vehicle?.steeringCenterToFullTimeSec,0);
  const returnToCenterTimeSec=safeNumber(
    vehicle?.steeringReturnToCenterTimeSec,
    centerToFullTimeSec
  );
  result.inputSlewRate=centerToFullTimeSec>1e-4?1/centerToFullTimeSec:0;
  result.returnSlewRate=
    returnToCenterTimeSec>1e-4
      ?1/returnToCenterTimeSec
      :result.inputSlewRate;
  result.centerToFullTimeSec=centerToFullTimeSec>1e-4?centerToFullTimeSec:0;
  result.returnToCenterTimeSec=returnToCenterTimeSec>1e-4?returnToCenterTimeSec:0;

  result.parkingSteerScale=1+parkingSteerBoost;
  result.highSpeedAuthorityScale=1;
  result.highSpeedResponseScale=highSpeedResponseScale;
  result.highSpeedInputExponentBoost=steeringInputExponent-1;
  result.steeringInputExponent=steeringInputExponent;
  result.steeringCurveT=steeringCurveT;
  result.steeringCurveFullSpeedMps=steeringCurveFullSpeedMps;
  result.mechanicalSteerAngle=maxRoadWheelAngle;
  result.gripEnvelopeRoadWheelAngle=gripEnvelopeRoadWheelAngle;
  result.gripEnvelopeLimited=0;
  return result;
}
'''
p.write_text(s[:start]+new)

Path('qa-grip-steering-curve-r3.mjs').write_text('''import assert from 'node:assert/strict';
import {steeringCommand} from './src/vehicle-dynamics-v21.29.js';

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
''')
