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

function runCase(brakingG){
  const shadow=createPerWheelShadowSolver({hz:120});
  let result=null;
  const requestedBrakeAccel=-brakingG*G;

  // Prime the wheel states, then let the implicit wheel solver settle under a
  // steady 3-degree road bend with the requested longitudinal load transfer.
  for(let frame=0;frame<120;frame++){
    result=shadow.advance(1/60,{
      vehicleId:'wrx',vehicle,contacts,
      speed:20,
      heading:0,
      velocityHeading:0,
      yawRate:0,
      centerSteerAngle:3*DEG,
      longitudinalAccel:requestedBrakeAccel,
      lateralAccel:0,
      requestedDriveAccel:0,
      requestedBrakeAccel,
      handbrake:false,
      surfaceId:'asphalt-dry'
    });
  }
  return result;
}

for(const brakingG of [.30,.60,.80]){
  const result=runCase(brakingG);
  const front=result.wheels.filter(w=>w.front);
  const rear=result.wheels.filter(w=>!w.front);
  const frontMax=Math.max(...front.map(w=>w.utilization));
  const rearMax=Math.max(...rear.map(w=>w.utilization));

  assert.equal(result.serviceBrakeShares.length,2,'EBD diagnostic brake shares missing');
  assert.ok(Number.isFinite(frontMax)&&Number.isFinite(rearMax),'combined tire utilization became non-finite');
  assert.ok(rearMax<1.0,`rear tires saturated during ${brakingG}g service braking in an ordinary bend`);
  assert.ok(rearMax<frontMax+.12,`rear braking demand became excessively dominant at ${brakingG}g: front=${frontMax} rear=${rearMax}`);
}

// F1-style opt-out: explicit ABS disable must retain the mechanical brake bias.
{
  const noAbsVehicle={...vehicle,absEnabled:false};
  const shadow=createPerWheelShadowSolver({hz:120});
  const result=shadow.advance(1/60,{
    vehicleId:'wrx',vehicle:noAbsVehicle,contacts,
    speed:20,heading:0,velocityHeading:0,yawRate:0,
    centerSteerAngle:0,
    longitudinalAccel:-.8*G,
    lateralAccel:0,
    requestedDriveAccel:0,
    requestedBrakeAccel:-.8*G,
    handbrake:false,
    surfaceId:'asphalt-dry'
  });
  assert.ok(Math.abs(result.serviceBrakeShares[0]-.62)<1e-9,'absEnabled:false no longer preserves configured front brake share');
  assert.ok(Math.abs(result.serviceBrakeShares[1]-.38)<1e-9,'absEnabled:false no longer preserves configured rear brake share');
}

console.log('V21.27 WRX BRAKE IN CORNER QA: PASS');
console.log('load-aware EBD keeps the rear axle stable under service braking while preserving explicit no-ABS bias');