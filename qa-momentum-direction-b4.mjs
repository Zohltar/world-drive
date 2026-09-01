import assert from 'node:assert/strict';
import fs from 'node:fs';
import {blendDriftForce} from './src/physics/drift-force-coupling.js';

const finite=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback;};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const angleDelta=(target,current)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));

function legacyBodyLong({speed=0,heading=0,velocityHeading=0}={}){
  const v=Number(speed)||0;
  return v*Math.cos((Number(velocityHeading)||0)-(Number(heading)||0));
}
function legacyTarget({speed=0,heading=0,velocityHeading=0}={}){
  const v=Number(speed)||0,h=Number(heading)||0,vh=Number(velocityHeading)||0;
  if(Math.abs(v)<1e-8)return h;
  const bodyLong=legacyBodyLong({speed:v,heading:h,velocityHeading:vh});
  return Math.sign(bodyLong||v||1)===Math.sign(v||1)?h:h+Math.PI;
}
function legacyCanonical({speedAbs=0}={}){
  return Math.max(0,Math.abs(Number(speedAbs)||0))<.12;
}
function legacyLimit({attemptedDelta=0,speedAbs=0,lateralCapacityAccel=0,dt=0,airborne=false}={}){
  const desired=finite(attemptedDelta,0);
  if(airborne||Math.abs(desired)<1e-12)return 0;
  const step=Math.max(0,finite(dt,0));
  if(step<=0)return 0;
  const v=Math.max(1.25,Math.abs(finite(speedAbs,0)));
  const aLat=Math.max(0,finite(lateralCapacityAccel,0));
  const maxDelta=(aLat/v)*step;
  return clamp(desired,-maxDelta,maxDelta);
}
function legacyAdvance(args={}){
  let {
    velocityHeading=0,heading=0,speed=0,speedAbs=Math.abs(Number(speed)||0),dt=0,
    airborne=false,frontSlipAmount=0,rearSlipAmount=0,forceCoupledSlide=0,
    frictionTrajectoryLoss=0,offroadMomentumYawRate=0,onPavement=true,
    driftPhysicalAuthority=0,driftKinematicScale=1,useLegacyDriftAssist=true,
    netLateralAccel=0,physicalTrajectoryYawRate=0,trajectoryLateralCapacityAccel=0
  }=args;
  if(!Number.isFinite(velocityHeading)||legacyCanonical({speedAbs}))velocityHeading=heading;
  const trajectoryRearSlip=Math.max(0,rearSlipAmount-frontSlipAmount*.45);
  const lowSpeedNoSlip=!airborne&&speedAbs<8.5&&forceCoupledSlide<.18&&frontSlipAmount<.16&&rearSlipAmount<.16;
  const momentumTargetHeading=legacyTarget({speed,heading,velocityHeading});
  if(lowSpeedNoSlip){
    if(speedAbs<2.5)velocityHeading=momentumTargetHeading;
    else{
      const lowSpeedLockT=1-clamp((speedAbs-2.5)/6.0,0,1);
      const lowSpeedFollowRate=34+lowSpeedLockT*48;
      velocityHeading+=angleDelta(momentumTargetHeading,velocityHeading)*(1-Math.exp(-dt*lowSpeedFollowRate));
    }
  }else{
    let attemptedTrajectoryDelta=0;
    if(!onPavement&&!airborne)attemptedTrajectoryDelta+=offroadMomentumYawRate*dt;
    const forceDominatedDrift=!airborne&&speedAbs>4&&(driftPhysicalAuthority>.12||driftKinematicScale<.88);
    if(forceDominatedDrift){
      const signedSpeedForCurvature=Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5;
      const legacyForceTrajectoryYawRate=netLateralAccel/signedSpeedForCurvature;
      const forceTrajectoryYawRate=useLegacyDriftAssist
        ?blendDriftForce(legacyForceTrajectoryYawRate,physicalTrajectoryYawRate,driftPhysicalAuthority)
        :physicalTrajectoryYawRate;
      attemptedTrajectoryDelta+=forceTrajectoryYawRate*dt;
    }else{
      const velocityFollowRate=airborne?0:((2.8-1.45*frictionTrajectoryLoss)+27.2*Math.pow(1-clamp(trajectoryRearSlip,0,1),2));
      attemptedTrajectoryDelta+=angleDelta(momentumTargetHeading,velocityHeading)*(1-Math.exp(-dt*velocityFollowRate));
    }
    velocityHeading+=legacyLimit({attemptedDelta:attemptedTrajectoryDelta,speedAbs,lateralCapacityAccel:trajectoryLateralCapacityAccel,dt,airborne});
  }
  return velocityHeading;
}

const momentum=await import(`./src/physics/momentum-direction.js?b4=${Date.now()}`);
const runtime=await import(`./src/driving-runtime.js?b4=${Date.now()}`);
const dynamics=await import(`./src/physics/vehicle-dynamics.js?b4=${Date.now()}`);

for(const a of [
  {speed:20,heading:0,velocityHeading:0},
  {speed:20,heading:Math.PI/2,velocityHeading:0},
  {speed:20,heading:Math.PI,velocityHeading:0},
  {speed:-12,heading:0,velocityHeading:0},
  {speed:8,heading:-2.4,velocityHeading:2.6}
]){
  assert.ok(Math.abs(momentum.bodyRelativeLongitudinalSpeed(a)-legacyBodyLong(a))<1e-12);
  assert.ok(Math.abs(runtime.bodyRelativeLongitudinalSpeed(a)-legacyBodyLong(a))<1e-12,'driving-runtime public compatibility changed');
}
assert.equal(momentum.shouldCanonicalizeMomentumHeading({speedAbs:.119}),true);
assert.equal(momentum.shouldCanonicalizeMomentumHeading({speedAbs:.12}),false);
assert.ok(Math.abs(dynamics.limitMomentumHeadingDelta({attemptedDelta:2,speedAbs:20,lateralCapacityAccel:8,dt:.1})-.04)<1e-12,'vehicle-dynamics compatibility export changed');

let seed=0x21b4cafe;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const range=(a,b)=>a+(b-a)*rnd();
let maxError=0;
for(let i=0;i<25000;i++){
  const speed=range(-40,65);
  const args={
    velocityHeading:i%997===0?NaN:range(-Math.PI*2,Math.PI*2),
    heading:range(-Math.PI*2,Math.PI*2),
    speed,
    speedAbs:Math.abs(speed)+range(0,.18),
    dt:range(1/240,1/20),
    airborne:rnd()<.08,
    frontSlipAmount:range(0,1),
    rearSlipAmount:range(0,1),
    forceCoupledSlide:range(0,1),
    frictionTrajectoryLoss:range(0,1),
    offroadMomentumYawRate:range(-2,2),
    onPavement:rnd()>.22,
    driftPhysicalAuthority:range(0,1),
    driftKinematicScale:range(.04,1),
    useLegacyDriftAssist:rnd()>.18,
    netLateralAccel:range(-30,30),
    physicalTrajectoryYawRate:range(-4,4),
    trajectoryLateralCapacityAccel:range(0,35)
  };
  const expected=legacyAdvance(args);
  const actual=momentum.advanceMomentumDirection(args);
  const error=Math.abs(actual-expected);
  maxError=Math.max(maxError,error);
  assert.ok(error<2e-12,`momentum equivalence drift at sample ${i}: ${error}`);
}

const base=fs.readFileSync('src/driving-runtime-base.js','utf8');
const dynBase=fs.readFileSync('src/physics/vehicle-dynamics-core.js','utf8');
const main=fs.readFileSync('src/main.js','utf8');
const owned=fs.readFileSync('src/physics/momentum-direction.js','utf8');
for(const name of [
  'bodyRelativeLongitudinalSpeed','bodyRelativeSteeringSpeed','bodyAxisDriveProjection',
  'resolveOpposingDriveMomentumCrossing','shouldCanonicalizeMomentumHeading'
]){
  assert.doesNotMatch(base,new RegExp(`export function ${name}\\b`),`${name} still locally owned by driving-runtime-base`);
  assert.match(owned,new RegExp(`export function ${name}\\b`),`${name} missing from momentum owner`);
}
assert.doesNotMatch(dynBase,/export function limitMomentumHeadingDelta\b/,'momentum limiter still owned by vehicle dynamics');
assert.match(dynBase,/export \{limitMomentumHeadingDelta\} from '\.\/momentum-direction\.js';/,'vehicle dynamics compatibility export missing');
assert.doesNotMatch(main,/\blimitMomentumHeadingDelta\b/,'main still injects momentum-direction physics authority');
assert.match(base,/velocityHeading=advanceMomentumDirection\(\{/,'runtime does not delegate state evolution to momentum owner');

console.log('CLEANUP B4 MOMENTUM-DIRECTION QA: PASS',{samples:25000,maxError});
