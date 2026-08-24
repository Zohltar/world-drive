import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const solverPath=path.join(root,'src','physics','per-wheel-shadow-solver.js');
const authorityPath=path.join(root,'src','physics','wrx-authority-controller.js');
const runtimePath=path.join(root,'src','driving-runtime.js');

const {createPerWheelShadowSolver}=await import(`${pathToFileURL(solverPath).href}?qa=${Date.now()}`);
const {createWrxAuthorityController,angleDifference}=await import(`${pathToFileURL(authorityPath).href}?qa=${Date.now()}`);

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

function runRecovery({speed=20,steer=.08,initialSideslipDeg=-15,driveAccel=0,seconds=6}={}){
  const shadow=createPerWheelShadowSolver({hz:120});
  const authority=createWrxAuthorityController();
  let state={
    heading:0,
    velocityHeading:initialSideslipDeg*Math.PI/180,
    dynamicYawRate:0
  };
  let lateralAccel=0;
  let maxSideslip=Math.abs(angleDifference(state.velocityHeading,state.heading));
  let maxYawRate=0;
  let lastPhysics=null;
  const frames=Math.round(seconds*60);

  for(let frame=0;frame<frames;frame++){
    lastPhysics=shadow.advance(1/60,{
      vehicleId:'wrx',vehicle,contacts,speed,
      heading:state.heading,
      velocityHeading:state.velocityHeading,
      yawRate:state.dynamicYawRate,
      centerSteerAngle:steer,
      longitudinalAccel:driveAccel,
      lateralAccel,
      requestedDriveAccel:driveAccel,
      requestedBrakeAccel:0,
      handbrake:false,
      surfaceId:'asphalt-dry'
    });
    const r=authority.apply({
      vehicleId:'wrx',dt:1/60,speed,...state,physics:lastPhysics
    });
    assert.equal(r.applied,true,'WRX recovery simulation unexpectedly fell back');
    assert.ok(Number.isFinite(r.heading)&&Number.isFinite(r.velocityHeading)&&Number.isFinite(r.dynamicYawRate),'WRX recovery became non-finite');
    state={heading:r.heading,velocityHeading:r.velocityHeading,dynamicYawRate:r.dynamicYawRate};
    lateralAccel=r.lateralAccel;
    maxSideslip=Math.max(maxSideslip,Math.abs(r.sideslipRad));
    maxYawRate=Math.max(maxYawRate,Math.abs(r.dynamicYawRate));
  }

  return {
    finalSideslip:Math.abs(angleDifference(state.velocityHeading,state.heading)),
    maxSideslip,
    maxYawRate,
    physics:lastPhysics
  };
}

// 1) The new tire-force chassis must recover from a substantial rear breakaway
// without handbrake. This directly guards against the reported "rear on ice"
// behaviour. A 15-degree perturbation is far larger than normal road cornering.
for(const speed of [15,20,25,30]){
  const result=runRecovery({speed,steer:.08,initialSideslipDeg:-15,driveAccel:0});
  assert.ok(result.maxSideslip<25*Math.PI/180,`coast recovery at ${speed} m/s amplified sideslip toward a spin`);
  assert.ok(result.finalSideslip<5*Math.PI/180,`coast recovery at ${speed} m/s failed to regain rear stability`);
  assert.ok(result.maxYawRate<1.8,`coast recovery at ${speed} m/s produced excessive yaw rate`);
}

// 2) Moderate AWD throttle in a normal bend must still self-recover. Rear drive
// bias may consume some friction circle, but it must not behave like rear ice.
for(const speed of [15,20,25]){
  const result=runRecovery({speed,steer:.07,initialSideslipDeg:-10,driveAccel:2.0});
  assert.ok(result.maxSideslip<22*Math.PI/180,`throttle recovery at ${speed} m/s amplified sideslip toward a spin`);
  assert.ok(result.finalSideslip<6*Math.PI/180,`throttle recovery at ${speed} m/s failed to stabilize`);
}

// 3) Runtime isolation. While WRX authority is active, legacy slip is not allowed
// to steer lane assist, scrub scalar speed, or persist as next-frame tire state.
const runtime=fs.readFileSync(runtimePath,'utf8');
assert.match(runtime,/V21\.27\.5 WRX AUTHORITY ISOLATION/,'WRX authority isolation marker missing');
assert.match(runtime,/assist&&\s*!autopilot&&\s*!wrxAuthorityCandidate&&/,'legacy lane assist still runs during WRX authority');
assert.match(runtime,/!wrxAuthorityCandidate&&\s*fourWheelSlide>.01/,'legacy four-wheel speed scrub still runs during WRX authority');
assert.match(runtime,/frontSlipAmount=axleBreakaway\(frontAuthority\)/,'front slip telemetry is not owned by shadow tires');
assert.match(runtime,/rearSlipAmount=axleBreakaway\(rearAuthority\)/,'rear slip telemetry is not owned by shadow tires');
assert.match(runtime,/wheelGripUsage=authorityWheels\.map/,'per-wheel grip telemetry still comes from legacy solver');

console.log('V21.27 WRX BREAKAWAY RECOVERY QA: PASS');
console.log('new per-wheel solver self-recovers from large rear slip; legacy drift side effects are isolated during WRX authority');