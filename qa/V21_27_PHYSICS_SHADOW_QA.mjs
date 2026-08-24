import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const solverPath=path.join(root,'src','physics','per-wheel-shadow-solver.js');
const runtimePath=path.join(root,'src','driving-runtime.js');
const mainPath=path.join(root,'src','main.js');
const foundationQa=path.join(root,'qa','V21_27_PHYSICS_FOUNDATION_QA.mjs');

const foundation=spawnSync(process.execPath,[foundationQa],{encoding:'utf8'});
assert.equal(
  foundation.status,
  0,
  `V21.27 foundation regression failed:\n${foundation.stdout}\n${foundation.stderr}`
);

const {createPerWheelShadowSolver}=await import(
  `${pathToFileURL(solverPath).href}?qa=${Date.now()}`
);

const vehicle={
  id:'wrx',
  drivetrain:'AWD',
  massKg:1510,
  wheelbase:2.65,
  trackWidth:1.56,
  cgHeight:.50,
  frontWeightBias:.58,
  brakeBiasFront:.62,
  driveBiasFront:.45,
  yawInertiaScale:.96,
  axles:[
    {
      id:'front',positionM:1.113,staticLoadFraction:.58,
      steerFactor:1,driveShare:.45,brakeShare:.62,trackWidth:1.56,wheelCount:2
    },
    {
      id:'rear',positionM:-1.537,staticLoadFraction:.42,
      steerFactor:0,driveShare:.55,brakeShare:.38,trackWidth:1.56,wheelCount:2
    }
  ]
};

const contacts=[
  {localX:-.78,localZ:-1.537,axleIndex:1,front:false,side:'left',contact:true,contactFactor:1},
  {localX:-.78,localZ: 1.113,axleIndex:0,front:true, side:'left',contact:true,contactFactor:1},
  {localX: .78,localZ:-1.537,axleIndex:1,front:false,side:'right',contact:true,contactFactor:1},
  {localX: .78,localZ: 1.113,axleIndex:0,front:true, side:'right',contact:true,contactFactor:1}
];

function pairByAxle(result,front){
  const pair=result.wheels.filter(w=>w.front===front).sort((a,b)=>a.side.localeCompare(b.side));
  assert.equal(pair.length,2,`${front?'front':'rear'} wheel pair classification changed`);
  return pair;
}

// 1) Fixed-step cadence and zero-slip straight rolling state.
const straight=createPerWheelShadowSolver({hz:120});
const straightResult=straight.advance(1/60,{
  vehicleId:'wrx',vehicle,contacts,
  speed:20,heading:0,velocityHeading:0,yawRate:0,
  centerSteerAngle:0,longitudinalAccel:0,lateralAccel:0,
  requestedDriveAccel:0,requestedBrakeAccel:0,handbrake:false,
  surfaceId:'asphalt-dry'
});
assert.equal(straightResult.steps,2,'120 Hz shadow solver did not execute two steps at 60 FPS');
assert.equal(straightResult.wheelCount,4,'shadow solver did not preserve four wheel contacts');
assert.ok(Math.abs(straightResult.totalForceX)<1e-6,'straight coasting invented lateral force');
assert.ok(Math.abs(straightResult.totalForceZ)<1e-6,'straight coasting invented longitudinal force');
assert.ok(Math.abs(straightResult.totalYawMomentNm)<1e-6,'straight coasting invented yaw moment');
for(const wheel of straightResult.wheels){
  assert.ok(Math.abs(wheel.slipRatio)<1e-9,'free-rolling wheel started with longitudinal slip');
  assert.ok(Math.abs(wheel.slipAngle)<1e-9,'free-rolling wheel started with lateral slip');
}

// 2) Numerical stiffness guard. Identical left/right wheels on a straight road
// must remain identical under sustained drive and braking. The original explicit
// wheelOmega Euler step could oscillate across rolling speed, causing equal-load
// wheels to report opposite force signs and even negative RPM while moving forward.
const powered=createPerWheelShadowSolver({hz:120});
let poweredResult=null;
for(let frame=0;frame<120;frame++){
  poweredResult=powered.advance(1/60,{
    vehicleId:'wrx',vehicle,contacts,
    speed:20,heading:0,velocityHeading:0,yawRate:0,
    centerSteerAngle:0,longitudinalAccel:3,lateralAccel:0,
    requestedDriveAccel:3,requestedBrakeAccel:0,handbrake:false,
    surfaceId:'asphalt-dry'
  });
}
for(const front of [false,true]){
  const [left,right]=pairByAxle(poweredResult,front);
  assert.ok(Math.abs(left.wheelOmega-right.wheelOmega)<1e-9,'straight drive broke left/right wheel-speed symmetry');
  assert.ok(Math.abs(left.fxWheel-right.fxWheel)<1e-6,'straight drive broke left/right longitudinal-force symmetry');
  assert.ok(left.wheelOmega>0&&right.wheelOmega>0,'straight forward drive reversed a wheel angular speed');
}
assert.ok(Math.abs(poweredResult.totalYawMomentNm)<1e-6,'symmetric straight drive invented yaw moment');

const braking=createPerWheelShadowSolver({hz:120});
let brakingResult=null;
for(let frame=0;frame<90;frame++){
  brakingResult=braking.advance(1/60,{
    vehicleId:'wrx',vehicle,contacts,
    speed:20,heading:0,velocityHeading:0,yawRate:0,
    centerSteerAngle:0,longitudinalAccel:-5,lateralAccel:0,
    requestedDriveAccel:0,requestedBrakeAccel:-5,handbrake:false,
    surfaceId:'asphalt-dry'
  });
}
for(const front of [false,true]){
  const [left,right]=pairByAxle(brakingResult,front);
  assert.ok(Math.abs(left.wheelOmega-right.wheelOmega)<1e-9,'straight braking broke left/right wheel-speed symmetry');
  assert.ok(Math.abs(left.fxWheel-right.fxWheel)<1e-6,'straight braking broke left/right longitudinal-force symmetry');
  assert.ok(left.wheelOmega>=-1e-9&&right.wheelOmega>=-1e-9,'straight forward braking numerically reversed a wheel');
}
assert.ok(Math.abs(brakingResult.totalYawMomentNm)<1e-6,'symmetric straight braking invented yaw moment');

// 3) Ackermann steering must give different inner/outer angles and real front
// tire lateral force/yaw without any explicit drift/yaw helper.
const corner=createPerWheelShadowSolver({hz:120});
const cornerResult=corner.advance(1/60,{
  vehicleId:'wrx',vehicle,contacts,
  speed:18,heading:0,velocityHeading:0,yawRate:0,
  centerSteerAngle:.22,longitudinalAccel:0,lateralAccel:0,
  requestedDriveAccel:0,requestedBrakeAccel:0,handbrake:false,
  surfaceId:'asphalt-dry'
});
const front=cornerResult.wheels.filter(w=>w.front);
assert.equal(front.length,2,'front wheel classification changed');
assert.notEqual(front[0].steerAngle,front[1].steerAngle,'Ackermann inner/outer wheel angles collapsed to one angle');
assert.ok(front.some(w=>Math.abs(w.fyWheel)>100),'steered front contact patches produced no lateral tire force');
assert.ok(Math.abs(cornerResult.totalYawMomentNm)>100,'contact-patch forces produced no chassis yaw moment');
assert.equal(cornerResult.authoritative,false,'shadow solver became authoritative unexpectedly');
assert.equal(cornerResult.shadow,true,'shadow solver lost shadow marker');

// 4) Rear handbrake torque must be capable of physically locking the rear wheel
// while the body keeps moving. No handbrake=>yaw shortcut is used by the solver.
const handbrakeSolver=createPerWheelShadowSolver({hz:120});
let handResult=null;
for(let frame=0;frame<45;frame++){
  handResult=handbrakeSolver.advance(1/60,{
    vehicleId:'wrx',vehicle,contacts,
    speed:15,heading:0,velocityHeading:0,yawRate:0,
    centerSteerAngle:.12,longitudinalAccel:0,lateralAccel:2.0,
    requestedDriveAccel:0,requestedBrakeAccel:0,handbrake:true,
    surfaceId:'asphalt-dry'
  });
}
const rear=handResult.wheels.filter(w=>!w.front);
const frontAfterHand=handResult.wheels.filter(w=>w.front);
assert.equal(rear.length,2,'rear wheel classification changed');
assert.ok(rear.every(w=>w.locked),'handbrake did not enter a stable rear-wheel lock state');
assert.ok(rear.every(w=>Math.abs(w.wheelOmega)<1e-9),'handbrake failed to hold rear wheel angular speed at zero');
assert.ok(rear.every(w=>w.slipRatio<-.85),'locked rear wheels did not reach near-full braking slip');
assert.ok(rear.every(w=>w.saturated),'locked rear tires were not friction saturated');
assert.ok(frontAfterHand.every(w=>!w.locked),'handbrake incorrectly marked a front wheel locked');
assert.ok(frontAfterHand.every(w=>Math.abs(w.slipRatio)<.15),'handbrake incorrectly locked the front wheels');

// 5) Runtime integration must be observational only.
const runtime=fs.readFileSync(runtimePath,'utf8');
const main=fs.readFileSync(mainPath,'utf8');
assert.match(runtime,/createPerWheelShadowSolver/,'driving runtime does not import/create shadow solver');
assert.match(runtime,/physicsShadow\.advance\(dt,\{/,'driving runtime does not advance shadow solver');
assert.match(runtime,/physicsShadowDiagnostics:\(\)=>physicsShadow\.diagnostics\(\)/,'shadow diagnostics are not exposed by driving runtime');
assert.match(main,/getVehicleId:\(\)=>vehicleSystem\.activeId/,'driving runtime is not receiving active vehicle identity');
assert.match(main,/window\.WorldDrivePhysicsShadow=/,'DevTools shadow diagnostics hook is missing');

// Guard against accidentally feeding the prediction back into authoritative
// chassis state during this phase.
assert.doesNotMatch(runtime,/predictedAccelX\s*[+\-*/]?=/,'shadow predictedAccelX is being written into runtime state');
assert.doesNotMatch(runtime,/predictedAccelZ\s*[+\-*/]?=/,'shadow predictedAccelZ is being written into runtime state');
assert.doesNotMatch(runtime,/predictedYawAccel\s*[+\-*/]?=/,'shadow predictedYawAccel is being written into runtime state');

console.log('V21.27 PHYSICS SHADOW QA: PASS');
console.log('120 Hz per-wheel forces / stable wheel spin / Ackermann / rear lock / non-authoritative runtime integration verified');
