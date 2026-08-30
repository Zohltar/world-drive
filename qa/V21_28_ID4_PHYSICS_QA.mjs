import assert from 'node:assert/strict';
import {
  GRAVITY,
  dynamicAxleLoads,
  steeringCommand,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage
} from '../src/vehicle-dynamics.js';
import {bodyRelativeSteeringSpeed} from '../src/driving-runtime.js';

const DEG=180/Math.PI;

const ID4={
  drivetrain:'AWD',vehicleClass:'passenger',massKg:2226,cgHeight:.56,trackWidth:1.59,
  frontWeightBias:.48,brakeBiasFront:.62,driveBiasFront:.28,yawInertiaScale:1.10,
  longitudinalAccelLimit:8.75,wheelbase:2.77,maxSteerLow:.44,maxSteerHigh:.135,
  steeringResponseHigh:4.4,steeringCenterToFullTimeSec:.58,steeringReturnToCenterTimeSec:.40,
  roadGripMultiplier:1.02,lateralAccelLimit:8.43,offroadGrip:.58
};

const WRX={
  drivetrain:'AWD',vehicleClass:'passenger',massKg:1510,cgHeight:.50,trackWidth:1.56,
  frontWeightBias:.58,brakeBiasFront:.62,driveBiasFront:.45,yawInertiaScale:.96,
  longitudinalAccelLimit:9.47,wheelbase:2.65,maxSteerLow:.48,maxSteerHigh:.175,
  steeringResponseHigh:5.6,steeringCenterToFullTimeSec:.46,steeringReturnToCenterTimeSec:.34,
  roadGripMultiplier:1.10,lateralAccelLimit:9.32,offroadGrip:.70
};

const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true, side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true, side:'right',axleIndex:0,contact:true,contactFactor:1}
];

// 1) Heavy 48/52 EV should transfer load forward under a hard stop without
// becoming as front-heavy as the WRX. This distinguishes chassis geometry from
// generic tire code.
const id4Loads=dynamicAxleLoads(ID4,-.8*GRAVITY,[]);
const wrxLoads=dynamicAxleLoads(WRX,-.8*GRAVITY,[]);
assert(id4Loads[0]>.62&&id4Loads[0]<.67,'ID.4 front load at 0.8 g braking should be ~64%');
assert(id4Loads[1]>.33&&id4Loads[1]<.38,'ID.4 rear axle must retain substantial load');
assert(wrxLoads[0]>id4Loads[0]+.06,'WRX should remain more front-loaded than ID.4 under same decel');

// 2) ABS/EBD must avoid rear saturation during realistic trail braking. Use
// 0.6 g braking + ~0.25 g lateral demand: enough to exercise combined grip
// without demanding an impossible 0.8 g + 0.4 g from an 0.86 g crossover tire.
const grip={};
estimateWheelGripUsage({
  requestedLatAccel:2.5,
  signedLatAccel:2.5,
  latLimit:ID4.lateralAccelLimit,
  longitudinalAccel:-.6*GRAVITY,
  propulsionAccel:0,
  serviceBrakeAccel:-.6*GRAVITY,
  surfaceMu:ID4.longitudinalAccelLimit/GRAVITY,
  throttle:0,
  handbrake:false,
  airborne:false,
  vehicle:ID4,
  speedAbs:22,
  dt:1/60,
  contacts,
  previousUsage:[0,0,0,0]
},grip);
assert(grip.serviceBrakeAbsEnabled===true,'ID.4 road-car ABS/EBD must be active');
assert(Math.max(...grip.longitudinalUsage)<.75,'ID.4 EBD should distribute a 0.6 g stop without rear lock');
assert(Math.max(...grip.lateralUsage)<.90,'moderate trail braking should retain lateral authority on all four tires');

// 3) At equal speed/input the heavier crossover must request less yaw than the
// WRX because of longer wheelbase, smaller rack angle and lower grip target.
const speed=20;
const id4Steer=steeringCommand({vehicle:ID4,speedAbs:speed,input:1});
const wrxSteer=steeringCommand({vehicle:WRX,speedAbs:speed,input:1});
const id4Lat=lateralDynamicsEnvelope({vehicle:ID4,speed,steerAngle:id4Steer.maxRoadWheelAngle,steerInput:1,onPavement:true,surfaceGrip:1});
const wrxLat=lateralDynamicsEnvelope({vehicle:WRX,speed,steerAngle:wrxSteer.maxRoadWheelAngle,steerInput:1,onPavement:true,surfaceGrip:1});
assert(id4Steer.maxRoadWheelAngle<wrxSteer.maxRoadWheelAngle,'ID.4 rack should be less aggressive than WRX');
assert(Math.abs(id4Lat.yawRate)<Math.abs(wrxLat.yawRate),'ID.4 should rotate more slowly than WRX at same speed/input');
assert(id4Lat.latLimit<wrxLat.latLimit,'ID.4 lateral envelope must remain below WRX');

// 4) Reverse-axis correction is generic: once cleanly aligned after 180°,
// body-relative steering must retain the full reverse travel magnitude.
const reverseSteerSpeed=bodyRelativeSteeringSpeed({speed:15,heading:Math.PI,velocityHeading:0,handbrake:false});
assert.equal(reverseSteerSpeed,-15,'ID.4 clean post-180 steering must retain full reverse-relative speed');

console.table({
  id4:{front_load_08g:+id4Loads[0].toFixed(3),steer_deg:+(id4Steer.maxRoadWheelAngle*DEG).toFixed(1),yaw_deg_s:+(Math.abs(id4Lat.yawRate)*DEG).toFixed(1),lat_g:+(id4Lat.latLimit/GRAVITY).toFixed(2)},
  wrx:{front_load_08g:+wrxLoads[0].toFixed(3),steer_deg:+(wrxSteer.maxRoadWheelAngle*DEG).toFixed(1),yaw_deg_s:+(Math.abs(wrxLat.yawRate)*DEG).toFixed(1),lat_g:+(wrxLat.latLimit/GRAVITY).toFixed(2)}
});
console.log('V21.28 ID4 PHYSICS QA: PASS');
