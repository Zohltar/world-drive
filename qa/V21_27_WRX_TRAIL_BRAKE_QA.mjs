import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const solverPath=path.join(root,'src','physics','per-wheel-shadow-solver.js');
const {createPerWheelShadowSolver}=await import(`${pathToFileURL(solverPath).href}?qa=${Date.now()}`);

const DEG=Math.PI/180;
const G=9.80665;
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

function runCase({brakingG=.6,lateralG=.6,surfaceId='asphalt-dry'}={}){
  const shadow=createPerWheelShadowSolver({hz:120});
  let result=null;
  const requestedBrakeAccel=-brakingG*G;
  for(let frame=0;frame<180;frame++){
    result=shadow.advance(1/60,{
      vehicleId:'wrx',vehicle,contacts,speed:20,
      heading:0,velocityHeading:0,yawRate:0,
      centerSteerAngle:3*DEG,
      longitudinalAccel:requestedBrakeAccel,
      lateralAccel:lateralG*G,
      requestedDriveAccel:0,
      requestedBrakeAccel,
      handbrake:false,
      surfaceId
    });
  }
  return result;
}

for(const test of [
  {brakingG:.6,lateralG:.6,surfaceId:'asphalt-dry'},
  {brakingG:.8,lateralG:.6,surfaceId:'asphalt-dry'},
  {brakingG:.5,lateralG:.5,surfaceId:'asphalt-wet'},
  {brakingG:.35,lateralG:.35,surfaceId:'gravel'}
]){
  const r=runCase(test);
  const inside=r.wheels.filter(w=>w.side==='right');
  const outside=r.wheels.filter(w=>w.side==='left');
  assert.ok(r.wheels.every(w=>Number.isFinite(w.utilization)),'non-finite tire utilization');
  assert.ok(Math.max(...inside.map(w=>w.utilization))<1.08,
    `inside wheel over-saturated in ${JSON.stringify(test)}`);
  assert.ok(Math.max(...inside.map(w=>w.utilization))<Math.max(...outside.map(w=>w.utilization))+.18,
    `inside wheel braking demand became disproportionately high in ${JSON.stringify(test)}`);
}

// With ABS disabled, left/right hydraulic split must remain equal even under
// lateral load transfer; this preserves the intentional no-ABS behavior.
{
  const noAbs={...vehicle,absEnabled:false};
  const shadow=createPerWheelShadowSolver({hz:120});
  const r=shadow.advance(1/60,{
    vehicleId:'wrx',vehicle:noAbs,contacts,speed:20,
    heading:0,velocityHeading:0,yawRate:0,
    centerSteerAngle:3*DEG,
    longitudinalAccel:-.6*G,
    lateralAccel:.6*G,
    requestedDriveAccel:0,requestedBrakeAccel:-.6*G,
    handbrake:false,surfaceId:'asphalt-dry'
  });
  assert.ok(Math.abs(r.serviceBrakeShares[0]-.62)<1e-9);
  assert.ok(Math.abs(r.serviceBrakeShares[1]-.38)<1e-9);
}

console.log('V21.27 WRX TRAIL BRAKE QA: PASS');
