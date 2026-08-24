import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const solverPath=path.join(root,'src','physics','per-wheel-shadow-solver.js');
const visualsPath=path.join(root,'src','vehicle-visuals.js');

const {createPerWheelShadowSolver}=await import(
  `${pathToFileURL(solverPath).href}?qa=${Date.now()}`
);

const DEG=Math.PI/180;
const near=(actual,expected,epsilon=1e-6,message='values differ')=>{
  assert.ok(Math.abs(actual-expected)<=epsilon,`${message}: ${actual} vs ${expected}`);
};

// Match the actual WRX runtime situation: suspension probes are symmetric around
// the visual/model origin even though the physical CG is not at wheelbase centre.
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
  yawInertiaScale:.96
};
const contacts=[
  {localX:-.86,localZ:-1.25,axleIndex:1,front:false,side:'left', contact:true,contactFactor:1},
  {localX:-.86,localZ: 1.25,axleIndex:0,front:true, side:'left', contact:true,contactFactor:1},
  {localX: .86,localZ:-1.25,axleIndex:1,front:false,side:'right',contact:true,contactFactor:1},
  {localX: .86,localZ: 1.25,axleIndex:0,front:true, side:'right',contact:true,contactFactor:1}
];

function sample({beta=0,yawRate=0,speed=20}={}){
  const solver=createPerWheelShadowSolver({hz:120});
  return solver.advance(1/60,{
    vehicleId:'wrx',
    vehicle,
    contacts,
    speed,
    heading:0,
    velocityHeading:beta,
    yawRate,
    centerSteerAngle:0,
    longitudinalAccel:0,
    lateralAccel:0,
    requestedDriveAccel:0,
    requestedBrakeAccel:0,
    handbrake:false,
    surfaceId:'asphalt-dry'
  });
}

// 1) Geometry must be measured around the physical CG, not the visual probe
// origin. 58/42 static balance means CG->front = 42% of wheelbase and
// CG->rear = 58% of wheelbase.
const neutral=sample();
const front=neutral.wheels.filter(w=>w.front);
const rear=neutral.wheels.filter(w=>!w.front);
assert.equal(front.length,2,'front wheel count changed');
assert.equal(rear.length,2,'rear wheel count changed');

for(const wheel of front){
  near(wheel.localZ,(1-.58)*2.65,1e-9,'front physics lever arm is not CG-relative');
  near(Math.abs(wheel.localX),1.56*.5,1e-9,'front physics half-track changed');
  near(wheel.probeLocalZ,1.25,1e-9,'front suspension probe geometry was overwritten');
  near(Math.abs(wheel.probeLocalX),.86,1e-9,'front suspension probe track was overwritten');
}
for(const wheel of rear){
  near(wheel.localZ,-.58*2.65,1e-9,'rear physics lever arm is not CG-relative');
  near(Math.abs(wheel.localX),1.56*.5,1e-9,'rear physics half-track changed');
  near(wheel.probeLocalZ,-1.25,1e-9,'rear suspension probe geometry was overwritten');
  near(Math.abs(wheel.probeLocalX),.86,1e-9,'rear suspension probe track was overwritten');
}

// 2) Static sideslip stability. If velocity points slightly right of the body
// (positive beta), the body must receive a positive restoring yaw moment so it
// turns toward its velocity vector and REDUCES beta. The old symmetric ±1.25 m
// probe lever arms gave the opposite sign on the 58/42 WRX.
for(const betaDeg of [.5,1,2,3]){
  const positive=sample({beta:betaDeg*DEG});
  const negative=sample({beta:-betaDeg*DEG});
  assert.ok(
    positive.predictedYawAccel>0,
    `positive ${betaDeg}° sideslip produced destabilizing/opposite yaw acceleration: ${positive.predictedYawAccel}`
  );
  assert.ok(
    negative.predictedYawAccel<0,
    `negative ${betaDeg}° sideslip produced destabilizing/opposite yaw acceleration: ${negative.predictedYawAccel}`
  );
}

// 3) Pure yaw-rate damping must also oppose rotation with zero steering/input.
const yawRight=sample({yawRate:.35});
const yawLeft=sample({yawRate:-.35});
assert.ok(yawRight.predictedYawAccel<0,'positive free yaw is not damped by tire forces');
assert.ok(yawLeft.predictedYawAccel>0,'negative free yaw is not damped by tire forces');

// 4) Keep a source-level guard tying this QA to the real runtime probe geometry.
const visuals=fs.readFileSync(visualsPath,'utf8');
assert.match(visuals,/vehicleId:'wrx',[\s\S]*?x:\.86,[\s\S]*?z:1\.25/,'WRX probe geometry changed; update this regression test');
const solverSource=fs.readFileSync(solverPath,'utf8');
assert.match(solverSource,/V21\.27\.6 CG-RELATIVE CONTACT GEOMETRY/,'CG-relative solver marker missing');
assert.match(solverSource,/const localZ=finite\(axle\?\.positionM,probeLocalZ\)/,'solver is not using axle position around CG');

console.log('V21.27 CG CONTACT GEOMETRY QA: PASS');
console.log('WRX visual probes remain symmetric, while tire forces use CG-relative axle levers and produce restoring sideslip/yaw moments');