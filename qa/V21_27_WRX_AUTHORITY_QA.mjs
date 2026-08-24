import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimePath=path.join(root,'src','driving-runtime.js');
const mainPath=path.join(root,'src','main.js');
const controllerPath=path.join(root,'src','physics','wrx-authority-controller.js');
const shadowPath=path.join(root,'src','physics','per-wheel-shadow-solver.js');
const shadowQa=path.join(root,'qa','V21_27_PHYSICS_SHADOW_QA.mjs');
const ackermannQa=path.join(root,'qa','V21_27_ACKERMANN_WHEEL_QA.mjs');

for(const qa of [shadowQa,ackermannQa]){
  const result=spawnSync(process.execPath,[qa],{encoding:'utf8'});
  assert.equal(
    result.status,
    0,
    `Prerequisite QA failed: ${path.basename(qa)}\n${result.stdout}\n${result.stderr}`
  );
}

const {createWrxAuthorityController,angleDifference}=await import(
  `${pathToFileURL(controllerPath).href}?qa=${Date.now()}`
);
const {createPerWheelShadowSolver}=await import(
  `${pathToFileURL(shadowPath).href}?qa=${Date.now()}`
);

// 1) Gating: this phase may NEVER become authoritative for another vehicle,
// airborne motion, autopilot, disabled state or the parking-speed fallback.
const gate=createWrxAuthorityController();
const neutralPhysics={shadow:true,predictedYawAccel:1,predictedAccelX:3};
for(const test of [
  {vehicleId:'civic',speed:15,reason:'non-wrx'},
  {vehicleId:'wrx',speed:15,airborne:true,reason:'airborne'},
  {vehicleId:'wrx',speed:15,autopilot:true,reason:'autopilot-fallback'},
  {vehicleId:'wrx',speed:15,enabled:false,reason:'disabled'},
  {vehicleId:'wrx',speed:1.5,reason:'low-speed-fallback'}
]){
  const result=gate.apply({
    enabled:test.enabled??true,
    vehicleId:test.vehicleId,
    airborne:!!test.airborne,
    autopilot:!!test.autopilot,
    dt:1/60,
    speed:test.speed,
    heading:.2,
    velocityHeading:.2,
    dynamicYawRate:.1,
    physics:neutralPhysics
  });
  assert.equal(result.applied,false,`${test.reason} unexpectedly became authoritative`);
  assert.equal(result.reason,test.reason,`${test.reason} fallback reason changed`);
}

// 2) Pure force integration. Positive tire yaw moment and lateral force must turn
// both body and momentum right, with independent rates so sideslip can exist.
const pure=createWrxAuthorityController();
let pureState={heading:0,velocityHeading:0,dynamicYawRate:0};
for(let i=0;i<120;i++){
  const r=pure.apply({
    vehicleId:'wrx',dt:1/120,speed:20,
    ...pureState,
    physics:{shadow:true,predictedYawAccel:1.2,predictedAccelX:4.0}
  });
  assert.equal(r.applied,true,'valid WRX force step did not apply');
  pureState={
    heading:r.heading,
    velocityHeading:r.velocityHeading,
    dynamicYawRate:r.dynamicYawRate
  };
}
assert.ok(pureState.heading>.2,'positive yaw moment failed to rotate WRX chassis');
assert.ok(pureState.velocityHeading>.05,'positive lateral force failed to rotate momentum');
assert.ok(Number.isFinite(angleDifference(pureState.velocityHeading,pureState.heading)),'pure authority generated invalid sideslip');

// 3) Coupled WRX simulation using the REAL per-wheel solver. Constant-speed is
// deliberate in this transition phase: longitudinal speed still belongs to the
// V21.26 runtime. We update heading, momentum heading and yaw rate every frame so
// the contact patches see the evolving authoritative state.
const vehicle={
  id:'wrx',drivetrain:'AWD',massKg:1510,wheelbase:2.65,trackWidth:1.56,
  cgHeight:.50,frontWeightBias:.58,brakeBiasFront:.62,driveBiasFront:.45,
  yawInertiaScale:.96,
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

// Straight-line coupling must not invent yaw or sideslip.
{
  const shadow=createPerWheelShadowSolver({hz:120});
  const authority=createWrxAuthorityController();
  let state={heading:0,velocityHeading:0,dynamicYawRate:0};
  let lat=0;
  for(let frame=0;frame<180;frame++){
    const physics=shadow.advance(1/60,{
      vehicleId:'wrx',vehicle,contacts,speed:20,
      heading:state.heading,velocityHeading:state.velocityHeading,yawRate:state.dynamicYawRate,
      centerSteerAngle:0,longitudinalAccel:0,lateralAccel:lat,
      requestedDriveAccel:0,requestedBrakeAccel:0,handbrake:false,surfaceId:'asphalt-dry'
    });
    const r=authority.apply({vehicleId:'wrx',dt:1/60,speed:20,...state,physics});
    assert.equal(r.applied,true,'straight WRX authority unexpectedly fell back');
    state={heading:r.heading,velocityHeading:r.velocityHeading,dynamicYawRate:r.dynamicYawRate};
    lat=r.lateralAccel;
  }
  assert.ok(Math.abs(state.heading)<1e-7,'straight coupling invented chassis yaw');
  assert.ok(Math.abs(angleDifference(state.velocityHeading,state.heading))<1e-7,'straight coupling invented sideslip');
}

// Handbrake + steering must create a real rear lock and body/momentum separation
// without any handbrake=>yaw shortcut in the authority controller.
{
  const shadow=createPerWheelShadowSolver({hz:120});
  const authority=createWrxAuthorityController();
  let state={heading:0,velocityHeading:0,dynamicYawRate:0};
  let lat=0;
  let physics=null;
  let maxSideslip=0;
  for(let frame=0;frame<90;frame++){
    physics=shadow.advance(1/60,{
      vehicleId:'wrx',vehicle,contacts,speed:15,
      heading:state.heading,velocityHeading:state.velocityHeading,yawRate:state.dynamicYawRate,
      centerSteerAngle:.12,longitudinalAccel:0,lateralAccel:lat,
      requestedDriveAccel:0,requestedBrakeAccel:0,handbrake:true,surfaceId:'asphalt-dry'
    });
    const r=authority.apply({vehicleId:'wrx',dt:1/60,speed:15,...state,physics});
    assert.equal(r.applied,true,'handbrake WRX authority unexpectedly fell back');
    assert.ok(Number.isFinite(r.heading)&&Number.isFinite(r.velocityHeading)&&Number.isFinite(r.dynamicYawRate),'coupled WRX authority became non-finite');
    state={heading:r.heading,velocityHeading:r.velocityHeading,dynamicYawRate:r.dynamicYawRate};
    lat=r.lateralAccel;
    maxSideslip=Math.max(maxSideslip,Math.abs(r.sideslipRad));
  }
  const rear=physics.wheels.filter(w=>!w.front);
  assert.ok(rear.length===2&&rear.every(w=>w.locked),'coupled handbrake simulation did not lock both rear wheels');
  assert.ok(Math.abs(state.heading)>.03,'rear lock generated no chassis rotation');
  assert.ok(maxSideslip>.015,'rear lock generated no body/momentum separation');
  assert.ok(maxSideslip<.89,'sideslip safety envelope was exceeded');
}

// 4) Generated runtime integration: old model remains intact as fallback, but
// only the WRX can discard its legacy lateral/yaw result and consume physicsStep.
const runtime=fs.readFileSync(runtimePath,'utf8');
const main=fs.readFileSync(mainPath,'utf8');
assert.match(runtime,/createWrxAuthorityController/,'driving runtime does not import WRX authority controller');
assert.match(runtime,/authorityVehicleId==='wrx'/,'WRX-only authority gate is missing');
assert.match(runtime,/!autopilot/,'autopilot fallback gate is missing');
assert.match(runtime,/speedAbs>=2/,'low-speed fallback gate is missing');
assert.match(runtime,/const physicsStep=physicsShadow\.advance/,'per-wheel result is not captured for authority');
assert.match(runtime,/const authorityResult=wrxAuthority\.apply\(\{/,'WRX authority result is not applied');
assert.match(runtime,/heading=authorityResult\.heading/,'authoritative chassis heading is not written');
assert.match(runtime,/velocityHeading=authorityResult\.velocityHeading/,'authoritative momentum heading is not written');
assert.match(runtime,/dynamicYawRate=authorityResult\.dynamicYawRate/,'authoritative yaw rate is not written');
assert.match(runtime,/lateralDynamicsEnvelope/,'V21.26 fallback lateral model was removed');
assert.match(main,/window\.WorldDrivePhysicsAuthority=/,'DevTools authority switch is missing');
assert.match(main,/setPhysicsAuthorityEnabled/,'DevTools authority switch cannot reach runtime');

console.log('V21.27 WRX AUTHORITY QA: PASS');
console.log('WRX-only tire-force lateral/yaw authority, rear-lock sideslip, safety fallback and legacy non-WRX path verified');
