import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimePath=path.join(root,'src','driving-runtime.js');
const dynamicsPath=path.join(root,'src','vehicle-dynamics.js');
const {bodyRelativeLongitudinalSpeed}=await import(`${pathToFileURL(runtimePath).href}?qa=${Date.now()}`);
const {lateralDynamicsEnvelope}=await import(`${pathToFileURL(dynamicsPath).href}?qa=${Date.now()}`);

const vehicle={
  drivetrain:'AWD',wheelbase:2.65,trackWidth:1.56,massKg:1510,cgHeight:.50,
  frontWeightBias:.58,lateralAccelLimit:9.2,roadGripMultiplier:1,
  maxSteerLow:.46,maxSteerHigh:.16
};
const steerAngle=.16;

const trueReverseSpeed=bodyRelativeLongitudinalSpeed({speed:-20,heading:0,velocityHeading:0});
const post180Speed=bodyRelativeLongitudinalSpeed({speed:20,heading:Math.PI,velocityHeading:0});
const forwardSpeed=bodyRelativeLongitudinalSpeed({speed:20,heading:0,velocityHeading:0});

assert.ok(Math.abs(trueReverseSpeed+20)<1e-9,'true reverse must remain negative');
assert.ok(Math.abs(post180Speed+20)<1e-9,'post-180 forward momentum must be reverse relative to chassis');
assert.ok(Math.abs(forwardSpeed-20)<1e-9,'normal forward travel must remain positive');

function envelope(speed){
  return lateralDynamicsEnvelope({
    vehicle,speed,steerAngle,steerInput:.7,driveThrottle:0,
    onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,
    rearSlipAmount:0,airborne:false
  },{});
}

const reverse=envelope(trueReverseSpeed);
const post180=envelope(post180Speed);
const forward=envelope(forwardSpeed);

assert.ok(reverse.yawRate*forward.yawRate<0,'reverse steering yaw must oppose forward yaw for same wheel angle');
assert.ok(post180.yawRate*forward.yawRate<0,'post-180 steering yaw must oppose forward yaw');
assert.ok(Math.abs(post180.yawRate-reverse.yawRate)<1e-9,'post-180 and true reverse steering yaw must match');
assert.ok(Math.abs(post180.signedLatAccel-reverse.signedLatAccel)<1e-9,'post-180 and true reverse lateral acceleration must match');

// A mostly sideways slide should smoothly reduce longitudinal steering authority
// rather than flip direction discontinuously at 90 degrees.
const nearSideways=bodyRelativeLongitudinalSpeed({speed:20,heading:Math.PI/2-.05,velocityHeading:0});
assert.ok(nearSideways>0&&nearSideways<1.1,'near-sideways body longitudinal speed should approach zero smoothly');

console.log(JSON.stringify({trueReverseSpeed,post180Speed,forwardSpeed,reverseYaw:reverse.yawRate,post180Yaw:post180.yawRate,forwardYaw:forward.yawRate},null,2));
console.log('V21.27 WRX POST-180 REVERSE STEER QA: PASS');
