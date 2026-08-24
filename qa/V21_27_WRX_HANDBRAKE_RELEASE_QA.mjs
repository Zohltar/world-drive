import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const solverPath=path.join(root,'src','physics','per-wheel-shadow-solver.js');
const dynamicsPath=path.join(root,'src','vehicle-dynamics.js');
const {createPerWheelShadowSolver}=await import(`${pathToFileURL(solverPath).href}?qa=${Date.now()}`);
const {lateralDynamicsEnvelope}=await import(`${pathToFileURL(dynamicsPath).href}?qa=${Date.now()}`);

const DEG=Math.PI/180;
const vehicle={
  id:'wrx',drivetrain:'AWD',massKg:1510,wheelbase:2.65,trackWidth:1.56,
  cgHeight:.50,frontWeightBias:.58,brakeBiasFront:.62,driveBiasFront:.45,
  yawInertiaScale:.96,lateralAccelLimit:9.2,
  axles:[
    {id:'front',positionM:1.113,staticLoadFraction:.58,steerFactor:1,driveShare:.45,brakeShare:.62,trackWidth:1.56,wheelCount:2},
    {id:'rear',positionM:-1.537,staticLoadFraction:.42,steerFactor:0,driveShare:.55,brakeShare:.38,trackWidth:1.56,wheelCount:2}
  ]
};
const contacts=[
  {localX:-.78,localZ:-1.537,axleIndex:1,front:false,side:'left',contact:true,contactFactor:1},
  {localX:-.78,localZ: 1.113,axleIndex:0,front:true, side:'left',contact:true,contactFactor:1},
  {localX: .78,localZ:-1.537,axleIndex:1,front:false,side:'right',contact:true,contactFactor:1},
  {localX: .78,localZ: 1.113,axleIndex:0,front:true, side:'right',contact:true,contactFactor:1}
];

const shadow=createPerWheelShadowSolver({hz:120});
let held=null;
for(let frame=0;frame<45;frame++){
  held=shadow.advance(1/60,{
    vehicleId:'wrx',vehicle,contacts,speed:22,
    heading:0,velocityHeading:0,yawRate:.35,
    centerSteerAngle:8*DEG,
    longitudinalAccel:-3.5,
    lateralAccel:6.2,
    requestedDriveAccel:0,requestedBrakeAccel:0,
    handbrake:true,surfaceId:'asphalt-dry'
  });
}

const rearHeld=held.wheels.filter(w=>w.axleIndex===1);
const heldRearLong=Math.max(...rearHeld.map(w=>w.longitudinalUtilization??w.utilization??0));
const heldRearLatScale=Math.min(...rearHeld.map(w=>w.lateralForceScale??1));

let released=null;
for(let frame=0;frame<6;frame++){
  released=shadow.advance(1/60,{
    vehicleId:'wrx',vehicle,contacts,speed:22,
    heading:0,velocityHeading:0,yawRate:.35,
    centerSteerAngle:8*DEG,
    longitudinalAccel:0,
    lateralAccel:6.2,
    requestedDriveAccel:0,requestedBrakeAccel:0,
    handbrake:false,surfaceId:'asphalt-dry'
  });
}

const rearReleased=released.wheels.filter(w=>w.axleIndex===1);
const releasedRearLong=Math.max(...rearReleased.map(w=>w.longitudinalUtilization??0));
const releasedRearLatScale=Math.min(...rearReleased.map(w=>w.lateralForceScale??1));

assert.ok(releasedRearLong<heldRearLong-.45,
  `rear longitudinal tire load did not fall enough after handbrake release: held=${heldRearLong}, released=${releasedRearLong}`);
assert.ok(releasedRearLatScale>heldRearLatScale+.25,
  `rear lateral authority did not recover after handbrake release: held=${heldRearLatScale}, released=${releasedRearLatScale}`);

// Drift history itself must not lower the base lateral envelope. The runtime
// intentionally supplies rearSlipAmount=0 to this legacy argument so only the
// current per-wheel force solver owns grip loss.
const envNoHistory=lateralDynamicsEnvelope({
  vehicle,speed:22,steerAngle:8*DEG,steerInput:.72,driveThrottle:0,
  onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,rearSlipAmount:0,airborne:false
});
const envWithHistory=lateralDynamicsEnvelope({
  vehicle,speed:22,steerAngle:8*DEG,steerInput:.72,driveThrottle:0,
  onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,rearSlipAmount:.9,airborne:false
});
assert.ok(envNoHistory.latLimit>envWithHistory.latLimit,
  'QA setup no longer exposes the historical rear-slip grip penalty');

console.log(JSON.stringify({
  heldRearLong,heldRearLatScale,releasedRearLong,releasedRearLatScale,
  legacyLatLimitWithHistory:envWithHistory.latLimit,
  runtimeLatLimitNoHistory:envNoHistory.latLimit
},null,2));
console.log('V21.27 WRX HANDBRAKE RELEASE QA: PASS');
