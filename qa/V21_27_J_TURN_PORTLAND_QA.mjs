import assert from 'node:assert/strict';
import {
  steeringCommand,
  lateralDynamicsEnvelope,
  limitMomentumHeadingDelta
} from '../src/vehicle-dynamics.js';
import {bodyRelativeLongitudinalSpeed} from '../src/driving-runtime.js';
import {jTurnEntryEligible} from '../src/physics/maneuver-state.js';

const DEG=180/Math.PI;
const MPH_TO_MPS=0.44704;
const DT=1/60;

const WRX={
  drivetrain:'AWD',
  vehicleClass:'passenger',
  massKg:1510,
  cgHeight:.50,
  trackWidth:1.56,
  frontWeightBias:.58,
  brakeBiasFront:.62,
  driveBiasFront:.45,
  yawInertiaScale:.96,
  longitudinalAccelLimit:9.47,
  wheelbase:2.65,
  maxSteerLow:.48,
  maxSteerHigh:.175,
  steeringResponseHigh:5.6,
  steeringCenterToFullTimeSec:.46,
  steeringReturnToCenterTimeSec:.34,
  roadGripMultiplier:1.10,
  lateralAccelLimit:9.32,
  offroadGrip:.70
};

// Portland Police Bureau J-turn study:
// - dry surface measured at mu ~= 0.75
// - target reverse speed 25-35 mph
// - >35 mph may over-rotate
// - ESC generally does not intervene during reverse; effect becomes noticeable
//   after roughly 135 degrees of rotation.
const PORTLAND_MU=.75;

function sample(mph){
  const speedAbs=mph*MPH_TO_MPS;
  const heading=Math.PI;
  const velocityHeading=0;
  const speed=speedAbs;
  const bodyLong=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});
  assert(bodyLong<0,`${mph} mph sample must be reverse relative to chassis`);

  const steering=steeringCommand({vehicle:WRX,speedAbs,input:1});
  const steerAngle=steering.maxRoadWheelAngle;
  const env=lateralDynamicsEnvelope({
    vehicle:WRX,
    speed:-speedAbs,
    steerAngle,
    steerInput:1,
    driveThrottle:0,
    onPavement:true,
    surfaceGrip:PORTLAND_MU,
    awdOffroadGripBonus:1,
    rearSlipAmount:0,
    airborne:false
  });

  const entryEligible=jTurnEntryEligible({
    bodyLongitudinalSpeed:bodyLong,
    speedAbs,
    steerAngle,
    handbrake:false,
    airborne:false,
    onPavement:true
  });
  assert(entryEligible,`${mph} mph should be eligible to enter the J-turn transient regime`);

  const yawDegPerSec=Math.abs(env.yawRate)*DEG;
  const latLimit=env.latLimit;
  const requestedLatAccel=env.requestedLatAccel;

  const momentumDelta=limitMomentumHeadingDelta({
    attemptedDelta:env.yawRate*DT,
    speedAbs,
    lateralCapacityAccel:latLimit,
    dt:DT,
    airborne:false
  });
  const momentumYawDegPerSec=Math.abs(momentumDelta/DT)*DEG;

  return {
    mph,
    speedAbs,
    steerDeg:Math.abs(steerAngle)*DEG,
    yawDegPerSec,
    momentumYawDegPerSec,
    requestedG:requestedLatAccel/9.80665,
    availableG:latLimit/9.80665,
    nominal180Sec:180/yawDegPerSec
  };
}

const s25=sample(25);
const s30=sample(30);
const s35=sample(35);
const s40=sample(40);

for(const s of [s25,s30,s35]){
  assert(s.yawDegPerSec>85,`${s.mph} mph must have decisive J-turn chassis yaw`);
  assert(s.nominal180Sec<2.1,`${s.mph} mph must complete 180 without behaving like a slow steady corner`);
  assert(s.momentumYawDegPerSec<s.yawDegPerSec,
    `${s.mph} mph chassis yaw must decouple from grip-limited momentum curvature`);
  assert(s.requestedG>s.availableG,
    `${s.mph} mph full-lock J-turn should exceed steady-state lateral-G demand`);
}

assert(s30.yawDegPerSec>s25.yawDegPerSec,'30 mph should rotate more assertively than 25 mph');
assert(s35.yawDegPerSec>s30.yawDegPerSec,'35 mph should rotate more assertively than 30 mph');
assert(s40.yawDegPerSec>s35.yawDegPerSec,'>35 mph should increase over-rotation tendency');

console.table([s25,s30,s35,s40].map(s=>({
  mph:s.mph,
  steer_deg:+s.steerDeg.toFixed(1),
  chassis_yaw_deg_s:+s.yawDegPerSec.toFixed(1),
  momentum_yaw_cap_deg_s:+s.momentumYawDegPerSec.toFixed(1),
  requested_g:+s.requestedG.toFixed(2),
  available_g:+s.availableG.toFixed(2),
  nominal_180_s:+s.nominal180Sec.toFixed(2)
})));
console.log('V21.27 J-TURN PORTLAND QA: PASS');
