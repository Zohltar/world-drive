import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicle-system.js';
import {createPerWheelShadowSolver} from './src/physics/per-wheel-shadow-solver.js';
import {
  blendedSurfaceProfile,
  weightedRoadFraction
} from './src/physics/surface-transition.js';
import {
  lateralDynamicsEnvelope,
  jTurnTransientYawBlend
} from './src/vehicle-dynamics-base.js';

const DEG=Math.PI/180;
const system=createVehicleSystem({initialId:'wrx'});
const V=system.physics;
const frontZ=(1-V.frontWeightBias)*V.wheelbase;
const rearZ=-V.frontWeightBias*V.wheelbase;
const halfTrack=V.trackWidth/2;

function contacts(roadFractions=[1,1,1,1]){
  return [
    {front:false,axleIndex:1,side:'left', localX:-halfTrack,localZ:rearZ,contact:true,contactFactor:1,roadFraction:roadFractions[0]},
    {front:true, axleIndex:0,side:'left', localX:-halfTrack,localZ:frontZ,contact:true,contactFactor:1,roadFraction:roadFractions[1]},
    {front:false,axleIndex:1,side:'right',localX: halfTrack,localZ:rearZ,contact:true,contactFactor:1,roadFraction:roadFractions[2]},
    {front:true, axleIndex:0,side:'right',localX: halfTrack,localZ:frontZ,contact:true,contactFactor:1,roadFraction:roadFractions[3]}
  ];
}

function finiteResult(result,label){
  for(const [key,value] of Object.entries({
    ax:result.predictedAccelX,
    az:result.predictedAccelZ,
    yaw:result.predictedYawAccel,
    fx:result.totalForceX,
    fz:result.totalForceZ
  }))assert.ok(Number.isFinite(value),`${label}: non-finite ${key}`);
  for(const wheel of result.wheels){
    for(const key of ['forceX','forceZ','yawMomentNm','slipRatio','slipAngle','mu']){
      assert.ok(Number.isFinite(wheel[key]),`${label}: wheel ${wheel.index} non-finite ${key}`);
    }
  }
}

function settleScenario({speed=20,sideslipDeg=20,steerDeg=0,handbrake=false,roadFractions=[1,1,1,1],steps=36}={}){
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  let result=null;
  for(let i=0;i<steps;i++){
    result=solver.advance(1/120,{
      vehicleId:'wrx',vehicle:V,contacts:contacts(roadFractions),
      speed,heading:0,velocityHeading:sideslipDeg*DEG,yawRate:0,
      centerSteerAngle:steerDeg*DEG,
      longitudinalAccel:0,lateralAccel:0,
      requestedDriveAccel:0,requestedBrakeAccel:0,
      handbrake,surfaceId:'asphalt-dry'
    });
  }
  return result;
}

// Surface profile itself must be continuous and monotonic from dirt -> asphalt.
let previousPeak=0,previousSlide=0;
for(let i=0;i<=20;i++){
  const t=i/20;
  const s=blendedSurfaceProfile(t);
  assert.ok(s.peakScale>=previousPeak-1e-12,`peak mu surface blend regressed at ${t}`);
  assert.ok(s.slideScale>=previousSlide-1e-12,`slide mu surface blend regressed at ${t}`);
  previousPeak=s.peakScale;previousSlide=s.slideScale;
}

assert.ok(Math.abs(weightedRoadFraction(contacts([1,1,0,0]),0)-.5)<1e-12,'two-road/two-dirt contact blend must be 50%');
assert.ok(Math.abs(weightedRoadFraction(contacts([1,1,1,0]),0)-.75)<1e-12,'three-road/one-dirt contact blend must be 75%');

// The global lateral envelope and J-turn release must transition continuously.
let previousLimit=0,previousJ=0;
let maxLimitStep=0,maxJStep=0;
for(let i=0;i<=20;i++){
  const roadFraction=i/20;
  const env=lateralDynamicsEnvelope({
    vehicle:V,speed:20,steerAngle:.20,steerInput:.8,driveThrottle:0,
    onPavement:roadFraction>.5,surfaceGrip:1,offroadPeakMu:.528,
    surfaceRoadFraction:roadFraction,airborne:false
  });
  assert.ok(env.latLimit>=previousLimit-1e-9,`lateral capacity decreased toward asphalt at ${roadFraction}`);
  if(i)maxLimitStep=Math.max(maxLimitStep,Math.abs(env.latLimit-previousLimit));
  previousLimit=env.latLimit;

  const j=jTurnTransientYawBlend({
    bodyLongitudinalSpeed:-15,speedAbs:20,steerAngle:.20,
    handbrake:false,airborne:false,surfaceRoadFraction:roadFraction
  });
  assert.ok(j>=previousJ-1e-9,`J-turn road authority regressed at ${roadFraction}`);
  if(i)maxJStep=Math.max(maxJStep,Math.abs(j-previousJ));
  previousJ=j;
}
assert.ok(maxLimitStep<.35,`road/dirt lateral envelope transition too abrupt: ${maxLimitStep}`);
assert.ok(maxJStep<.08,`J-turn surface transition too abrupt: ${maxJStep}`);

// Full matrix: forward/reverse, handbrake on/off, road/dirt, multiple speeds,
// steering directions and sideslip angles. Coasting tire forces must never add
// meaningful kinetic energy to the chassis.
let cases=0,maxAbsYaw=0,maxPositivePower=0,lockedRearCases=0;
for(const direction of [1,-1]){
  for(const handbrake of [false,true]){
    for(const road of [0,1]){
      for(const speedAbs of [8,16,28]){
        for(const sideslipDeg of [-75,-45,-20,0,20,45,75]){
          for(const steerDeg of [-20,0,20]){
            const speed=direction*speedAbs;
            const result=settleScenario({speed,sideslipDeg,steerDeg,handbrake,roadFractions:[road,road,road,road]});
            const label=`dir=${direction} hb=${handbrake} road=${road} v=${speedAbs} beta=${sideslipDeg} steer=${steerDeg}`;
            finiteResult(result,label);
            maxAbsYaw=Math.max(maxAbsYaw,Math.abs(result.predictedYawAccel));
            const chassisPower=result.totalForceX*result.bodyVx+result.totalForceZ*result.bodyVz;
            maxPositivePower=Math.max(maxPositivePower,chassisPower);
            // A tiny positive numerical exchange can occur while wheel angular
            // state settles, but the tire solver may not become a propulsion source.
            assert.ok(chassisPower<3500,`${label}: passive tires added ${(chassisPower/1000).toFixed(1)} kW`);
            if(handbrake&&speedAbs>=16&&result.wheels.filter(w=>!w.front&&w.locked).length)lockedRearCases++;
            cases++;
          }
        }
      }
    }
  }
}
assert.ok(lockedRearCases>20,'handbrake matrix failed to produce physical rear-wheel lock cases');
assert.ok(maxAbsYaw<45,`drift matrix produced explosive yaw acceleration ${maxAbsYaw}`);

// Simulate both edge directions with each tire crossing separately. The total
// chassis force/yaw should evolve in bounded increments; there must be no old
// all-four-wheels material snap.
const patterns=[
  [1,1,1,1],
  [.5,1,1,1],
  [0,1,1,1],
  [0,.5,1,1],
  [0,0,1,1],
  [0,0,.5,1],
  [0,0,0,1],
  [0,0,0,.5],
  [0,0,0,0]
];
function transitionMetrics(sequence){
  let previous=null,maxAccelStep=0,maxYawStep=0;
  const samples=[];
  for(const roadFractions of sequence){
    const result=settleScenario({speed:20,sideslipDeg:35,steerDeg:-18,handbrake:false,roadFractions,steps:28});
    finiteResult(result,'surface transition');
    const accel=Math.hypot(result.predictedAccelX,result.predictedAccelZ);
    if(previous){
      maxAccelStep=Math.max(maxAccelStep,Math.abs(accel-previous.accel));
      maxYawStep=Math.max(maxYawStep,Math.abs(result.predictedYawAccel-previous.yaw));
    }
    previous={accel,yaw:result.predictedYawAccel};
    samples.push({road:+weightedRoadFraction(contacts(roadFractions),0).toFixed(2),accel:+accel.toFixed(3),yaw:+result.predictedYawAccel.toFixed(3)});
  }
  return {maxAccelStep,maxYawStep,samples};
}
const roadToDirt=transitionMetrics(patterns);
const dirtToRoad=transitionMetrics([...patterns].reverse());
assert.ok(roadToDirt.maxAccelStep<2.0,`road->dirt force snap ${roadToDirt.maxAccelStep}`);
assert.ok(dirtToRoad.maxAccelStep<2.0,`dirt->road force snap ${dirtToRoad.maxAccelStep}`);
assert.ok(roadToDirt.maxYawStep<12,`road->dirt yaw snap ${roadToDirt.maxYawStep}`);
assert.ok(dirtToRoad.maxYawStep<12,`dirt->road yaw snap ${dirtToRoad.maxYawStep}`);

console.log('DRIFT / SURFACE STRESS R1: PASS');
console.log(JSON.stringify({
  cases,
  maxAbsYaw:+maxAbsYaw.toFixed(3),
  maxPositivePassivePowerKw:+(maxPositivePower/1000).toFixed(3),
  lockedRearCases,
  maxLateralLimitStep:+maxLimitStep.toFixed(3),
  maxJTurnBlendStep:+maxJStep.toFixed(3),
  roadToDirt,
  dirtToRoad
},null,2));
