import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem} from '../src/vehicle-system.js';
import {aerodynamicLoad,lateralDynamicsEnvelope,estimateWheelGripUsage} from '../src/vehicle-dynamics.js';

const sys=createVehicleSystem({initialId:'f1_2010'});
const f1=sys.physics;
assert.equal(f1.massKg,740);
assert.equal(f1.frontTireGripScale,1.20);
assert.equal(f1.rearTireGripScale,1.20);
assert.equal(f1.lateralAccelLimit,20.5);
assert.equal(f1.aeroLaunchRetentionScale,1.00);
assert.equal(f1.aeroAirborneDownforceScale,0.55);

const aero200=aerodynamicLoad({vehicle:f1,speedAbs:200/3.6});
const aero300=aerodynamicLoad({vehicle:f1,speedAbs:300/3.6});
const supportedDown200=9.81+aero200.downforceAccel*f1.aeroLaunchRetentionScale;
const airborneDown200=9.81+aero200.downforceAccel*f1.aeroAirborneDownforceScale;
const supportedDown300=9.81+aero300.downforceAccel*f1.aeroLaunchRetentionScale;
assert.ok(supportedDown200>21.3&&supportedDown200<21.6,'F1 supported downward authority at 200 km/h');
assert.ok(airborneDown200>16.1&&airborneDown200<16.3,'F1 airborne wing load at 200 km/h');
assert.ok(supportedDown300>35.9&&supportedDown300<36.2,'F1 supported downward authority at 300 km/h');

const f1Lat100=lateralDynamicsEnvelope({vehicle:f1,speed:100/3.6,steerAngle:.05,steerInput:.4,onPavement:true,surfaceGrip:1});
assert.ok(f1Lat100.latLimit/9.80665>2.6,'F1 should exceed 2.6 g tire+aero envelope by 100 km/h');
const f1Lat200=lateralDynamicsEnvelope({vehicle:f1,speed:200/3.6,steerAngle:.05,steerInput:.4,onPavement:true,surfaceGrip:1});
assert.ok(f1Lat200.latLimit/9.80665>4.2,'F1 should exceed 4.2 g envelope by 200 km/h');

const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];
const f1Grip=estimateWheelGripUsage({
  requestedLatAccel:12,signedLatAccel:12,latLimit:f1Lat100.latLimit,longitudinalAccel:0,
  propulsionAccel:0,serviceBrakeAccel:0,surfaceMu:1.1,throttle:0,handbrake:false,airborne:false,
  vehicle:f1,speedAbs:100/3.6,dt:.05,contacts,previousUsage:[0,0,0,0]
});
assert.ok(Math.max(...f1Grip.raw)<.50,'1.22 g turn should remain well inside F1 tire budget at 100 km/h');
assert.equal(Math.max(...f1Grip.slip),0,'F1 should not slide at 1.22 g / 100 km/h');

sys.select('wrx');
const wrx=sys.physics;
const wrxLat100=lateralDynamicsEnvelope({vehicle:wrx,speed:100/3.6,steerAngle:.05,steerInput:.4,onPavement:true,surfaceGrip:1});
assert.ok(f1Lat100.latLimit>wrxLat100.latLimit*2.5,'F1 lateral envelope must be dramatically above WRX');

// Static wiring check: vertical presentation must use aero in both crest
// retention and airborne fall, without changing road-car dynamics.
const presentation=fs.readFileSync(new URL('../src/vehicle-presentation.js',import.meta.url),'utf8');
for(const token of ['aerodynamicLoad({','supportedDownwardAccel','airborneDownwardAccel','aeroLaunchRetentionScale','aeroAirborneDownforceScale']){
  assert.ok(presentation.includes(token),`presentation missing ${token}`);
}
assert.ok(/requiredSupportAccel[\s\S]*supportedDownwardAccel\+[\s\S]*launchAccelMargin/.test(presentation),'crest launch threshold must include downforce');
assert.ok(/verticalVelocity-=[\s\S]*airborneDownwardAccel/.test(presentation),'airborne fall must include retained aero load');

console.log('V21.21.23 F1 STABILITY QA: PASS');
console.log(JSON.stringify({
  f1At200:{downforceN:aero200.downforceN,gripScale:aero200.gripScale,supportedDownwardAccel:supportedDown200,airborneDownwardAccel:airborneDown200,latLimitG:f1Lat200.latLimit/9.80665},
  f1At100:{latLimitG:f1Lat100.latLimit/9.80665,maxTireUsageAt12ms2:Math.max(...f1Grip.raw)},
  wrxAt100:{latLimitG:wrxLat100.latLimit/9.80665}
},null,2));
