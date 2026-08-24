import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tirePath=path.join(root,'src','physics','tire-model.js');
const solverPath=path.join(root,'src','physics','per-wheel-shadow-solver.js');
const authorityPath=path.join(root,'src','physics','wrx-authority-controller.js');

const tireModule=await import(`${pathToFileURL(tirePath).href}?qa=${Date.now()}`);
const solverModule=await import(`${pathToFileURL(solverPath).href}?qa=${Date.now()+1}`);
const authorityModule=await import(`${pathToFileURL(authorityPath).href}?qa=${Date.now()+2}`);

const {
  resolveTireForces,
  tireProfileForVehicle
}=tireModule;
const {createPerWheelShadowSolver}=solverModule;
const {createWrxAuthorityController,angleDifference}=authorityModule;

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

// 1) Same tire, same slip angle, different static axle loads: normalized tire
// utilization should be almost identical. The old fixed stiffness made the rear
// WRX tire hit mu*Fz around ~2.2 deg while the front lasted to ~2.9 deg, causing
// abrupt lift-off/neutral-throttle oversteer solely because the rear carries less Fz.
const tire=tireProfileForVehicle('wrx',vehicle);
const frontFz=vehicle.massKg*G*vehicle.frontWeightBias/2;
const rearFz=vehicle.massKg*G*(1-vehicle.frontWeightBias)/2;
const alpha=3*DEG;
const vLong=20;
const vLat=Math.tan(alpha)*vLong;

function lateralSample(fz){
  return resolveTireForces({
    tire,
    surface:'asphalt-dry',
    normalLoadN:fz,
    longitudinalSpeed:vLong,
    lateralSpeed:vLat,
    wheelOmega:vLong/tire.rollingRadiusM,
    steerAngle:0,
    localX:0,
    localZ:0
  });
}

const front3=lateralSample(frontFz);
const rear3=lateralSample(rearFz);
assert.equal(front3.saturated,false,'front WRX tire saturates at ordinary 3 deg slip');
assert.equal(rear3.saturated,false,'rear WRX tire saturates at ordinary 3 deg slip');
assert.ok(front3.utilization<.90,'front WRX tire uses too much friction at 3 deg slip');
assert.ok(rear3.utilization<.90,'rear WRX tire uses too much friction at 3 deg slip');
assert.ok(
  Math.abs(front3.utilization-rear3.utilization)<.025,
  `load alone creates mismatched breakaway timing: front=${front3.utilization} rear=${rear3.utilization}`
);

// Progressive curve: force must build monotonically through the declared peak
// slip region and then lose grip gradually rather than falling off a cliff.
const progression=[];
for(const deg of [1,3,5,7,10,15]){
  const a=deg*DEG;
  const sample=resolveTireForces({
    tire,
    surface:'asphalt-dry',
    normalLoadN:rearFz,
    longitudinalSpeed:vLong,
    lateralSpeed:Math.tan(a)*vLong,
    wheelOmega:vLong/tire.rollingRadiusM,
    steerAngle:0,
    localX:0,
    localZ:0
  });
  progression.push({deg,force:Math.abs(sample.fyWheel),sample});
}
for(let i=1;i<=3;i++){
  assert.ok(
    progression[i].force>progression[i-1].force,
    `lateral force failed to build progressively before peak: ${progression[i-1].deg}->${progression[i].deg}`
  );
}
assert.ok(
  progression[4].force>progression[3].force*.88,
  'tire force falls off too abruptly immediately after peak slip'
);
assert.ok(
  progression[5].force>progression[3].force*.70,
  'sliding tire loses an unrealistic amount of force'
);

// 2) Coupled normal-corner sweep. These are ordinary ~0.7-0.85 g road bends,
// not drift commands. The WRX must settle without rear-only saturation or a spin.
const cases=[
  {speed:15,steerDeg:5},
  {speed:20,steerDeg:3},
  {speed:25,steerDeg:2},
  {speed:30,steerDeg:1.5}
];

for(const test of cases){
  const shadow=createPerWheelShadowSolver({hz:120});
  const authority=createWrxAuthorityController();
  let state={heading:0,velocityHeading:0,dynamicYawRate:0};
  let lateralAccel=0;
  let maxSideslip=0;
  let rearSaturatedFrames=0;
  let finalPhysics=null;

  for(let frame=0;frame<240;frame++){
    finalPhysics=shadow.advance(1/60,{
      vehicleId:'wrx',vehicle,contacts,
      speed:test.speed,
      heading:state.heading,
      velocityHeading:state.velocityHeading,
      yawRate:state.dynamicYawRate,
      centerSteerAngle:test.steerDeg*DEG,
      longitudinalAccel:0,
      lateralAccel,
      requestedDriveAccel:0,
      requestedBrakeAccel:0,
      handbrake:false,
      surfaceId:'asphalt-dry'
    });

    const r=authority.apply({
      vehicleId:'wrx',
      dt:1/60,
      speed:test.speed,
      ...state,
      physics:finalPhysics
    });
    assert.equal(r.applied,true,'normal-corner authority unexpectedly fell back');
    assert.ok(
      Number.isFinite(r.heading)&&Number.isFinite(r.velocityHeading)&&Number.isFinite(r.dynamicYawRate),
      'normal corner produced non-finite chassis state'
    );

    state={
      heading:r.heading,
      velocityHeading:r.velocityHeading,
      dynamicYawRate:r.dynamicYawRate
    };
    lateralAccel=r.lateralAccel;
    maxSideslip=Math.max(maxSideslip,Math.abs(angleDifference(state.velocityHeading,state.heading)));

    const rear=finalPhysics.wheels.filter(w=>!w.front);
    if(rear.some(w=>w.saturated))rearSaturatedFrames++;
  }

  assert.ok(state.dynamicYawRate>0,'positive normal steering failed to generate positive yaw');
  assert.ok(
    maxSideslip<8*DEG,
    `ordinary curve became excessive oversteer: ${test.speed}m/s ${test.steerDeg}deg max sideslip=${maxSideslip/DEG}deg`
  );
  assert.ok(
    rearSaturatedFrames<12,
    `rear tires saturated persistently in ordinary curve: ${test.speed}m/s ${test.steerDeg}deg frames=${rearSaturatedFrames}`
  );
}

// 3) Preserve the intentional rear-lock behavior. Progressive normal-corner grip
// must not make the handbrake ineffective.
{
  const shadow=createPerWheelShadowSolver({hz:120});
  const authority=createWrxAuthorityController();
  let state={heading:0,velocityHeading:0,dynamicYawRate:0};
  let lateralAccel=0;
  let physics=null;
  let maxSideslip=0;

  for(let frame=0;frame<90;frame++){
    physics=shadow.advance(1/60,{
      vehicleId:'wrx',vehicle,contacts,
      speed:15,
      heading:state.heading,
      velocityHeading:state.velocityHeading,
      yawRate:state.dynamicYawRate,
      centerSteerAngle:7*DEG,
      longitudinalAccel:0,
      lateralAccel,
      requestedDriveAccel:0,
      requestedBrakeAccel:0,
      handbrake:true,
      surfaceId:'asphalt-dry'
    });
    const r=authority.apply({vehicleId:'wrx',dt:1/60,speed:15,...state,physics});
    assert.equal(r.applied,true,'handbrake authority unexpectedly fell back');
    state={heading:r.heading,velocityHeading:r.velocityHeading,dynamicYawRate:r.dynamicYawRate};
    lateralAccel=r.lateralAccel;
    maxSideslip=Math.max(maxSideslip,Math.abs(r.sideslipRad));
  }

  const rear=physics.wheels.filter(w=>!w.front);
  assert.ok(rear.length===2&&rear.every(w=>w.locked),'progressive tire curve broke rear handbrake lock');
  assert.ok(maxSideslip>1.0*DEG,'rear lock no longer creates meaningful body/momentum separation');
}

console.log('V21.27 WRX CORNER STABILITY QA: PASS');
console.log('progressive load-scaled tire force, normal-corner rear stability and intentional handbrake lock verified');