import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem} from './src/vehicles/vehicle-system.js';
import {longitudinalTractionLimit,estimateWheelGripUsage} from './src/physics/vehicle-dynamics.js';
import {
  createWheelspinState,
  drivenWheelSlipLevels,
  wheelspinDynamicGripFactor,
  wheelspinHoldDurationSec
} from './src/physics/wheelspin-state.js';

function approx(a,b,eps=1e-12,msg='values differ'){
  assert.ok(Math.abs(Number(a)-Number(b))<=eps,`${msg}: ${a} vs ${b}`);
}

// Preserve the exact pre-B6 persistence equations while moving their state to
// one explicit owner.
function referenceAdvance(state,input){
  const dt=Math.max(.001,Math.min(.05,Number(input.dt)||1/60));
  const request=Math.abs(Number(input.tractionResult?.requested)||0);
  const limit=Math.max(.01,Math.abs(Number(input.tractionResult?.limit)||0));
  const overRatio=request/limit;
  const clutchBreakaway=
    Number(input.releaseMultiplier)>1.05&&
    Number(input.engineThrottle)>.35&&
    !!input.tractionResult?.limited&&
    overRatio>1.03;
  if(clutchBreakaway){
    const seed=Math.max(0,Math.min(1,(overRatio-1.02)/.72));
    state.level=Math.max(state.level,.42+.58*seed);
    state.holdSec=Math.max(state.holdSec,wheelspinHoldDurationSec(input.drivetrain,input.vehicleClass));
  }else if(state.holdSec>0){
    state.holdSec=Math.max(0,state.holdSec-dt);
    state.level*=Math.pow(Number(input.engineThrottle)>.55?.995:.975,dt*60);
  }else if(state.level>0){
    state.level*=Math.exp(-dt*(Number(input.engineThrottle)>.55?3.3:8.5));
    if(state.level<.01)state.level=0;
  }
  return {
    level:state.level,
    holdSec:state.holdSec,
    gripFactor:wheelspinDynamicGripFactor(input.drivetrain,state.level,input.vehicleClass),
    wheels:drivenWheelSlipLevels(input.drivetrain,state.level),
    clutchBreakaway,
    overRatio
  };
}

let seed=0xb600cafe;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const drives=['FWD','RWD','AWD'];
let maxError=0;
for(const drivetrain of drives){
  for(const vehicleClass of ['passenger','tractor']){
    const owner=createWheelspinState();
    const ref={level:0,holdSec:0};
    for(let i=0;i<7000;i++){
      if(rnd()<.012){owner.reset();ref.level=0;ref.holdSec=0;}
      const limit=.5+rnd()*12;
      const requested=rnd()*18;
      const input={
        dt:.001+rnd()*.049,
        releaseMultiplier:1+rnd()*2.8,
        engineThrottle:rnd(),
        tractionResult:{requested,limit,limited:requested>limit},
        drivetrain,
        vehicleClass
      };
      const a=owner.advance(input);
      const b=referenceAdvance(ref,input);
      for(const key of ['level','holdSec','gripFactor','overRatio']){
        const err=Math.abs(a[key]-b[key]);
        maxError=Math.max(maxError,err);
        approx(a[key],b[key],1e-12,`${drivetrain}/${vehicleClass} ${key}`);
      }
      assert.equal(a.clutchBreakaway,b.clutchBreakaway);
      assert.deepEqual(a.wheels,b.wheels);
    }
  }
}

// The traction/steering tire owner must be call-order independent. The raw clutch demand
// belongs to this grip evaluation, not to whichever traction call happened last.
const sys=createVehicleSystem({initialId:'civic'});
const civic=sys.physics;
const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];
const requested=10.8;
const surfaceMu=(Number(civic.longitudinalAccelLimit)||8.67)/9.80665;
const drive=longitudinalTractionLimit({vehicle:civic,requestedAccel:requested,surfaceMu,mode:'drive',airborne:false,speedAbs:1.5},{});
function gripExplicit(){
  return estimateWheelGripUsage({
    requestedLatAccel:0,signedLatAccel:0,latLimit:civic.lateralAccelLimit,
    longitudinalAccel:drive.acceleration,
    propulsionAccel:drive.acceleration,
    requestedPropulsionAccel:requested,
    appliedPropulsionAccel:drive.acceleration,
    serviceBrakeAccel:0,surfaceMu,
    throttle:requested/Math.max(.1,Number(civic.accel)||4.44),
    handbrake:false,airborne:false,vehicle:civic,speedAbs:1.5,dt:1/60,
    contacts,previousUsage:[0,0,0,0]
  },{});
}
const baseline=gripExplicit();
// Deliberately contaminate the old hidden handoff with unrelated calls.
longitudinalTractionLimit({vehicle:civic,requestedAccel:.8,surfaceMu:1,mode:'drive',airborne:false,speedAbs:15},{});
longitudinalTractionLimit({vehicle:civic,requestedAccel:17,surfaceMu:.4,mode:'drive',airborne:false,speedAbs:2},{});
const interleaved=gripExplicit();
approx(interleaved.requestedPropulsionAccel,baseline.requestedPropulsionAccel,1e-12,'explicit requested propulsion changed after interleaving');
approx(interleaved.appliedPropulsionAccel,baseline.appliedPropulsionAccel,1e-12,'explicit applied propulsion changed after interleaving');
approx(interleaved.propulsionSaturationRatio,baseline.propulsionSaturationRatio,1e-12,'saturation ratio changed after interleaving');
assert.deepEqual(interleaved.slip,baseline.slip,'wheel slip changed after unrelated traction calls');
assert.deepEqual(interleaved.longitudinalUsage,baseline.longitudinalUsage,'wheel usage changed after unrelated traction calls');

// With no requested-propulsion argument, the grip function must use only the
// supplied applied value; no stale previous traction request may leak in.
longitudinalTractionLimit({vehicle:civic,requestedAccel:25,surfaceMu:.2,mode:'drive',airborne:false,speedAbs:1},{});
const cleanFallback=estimateWheelGripUsage({
  requestedLatAccel:0,signedLatAccel:0,latLimit:civic.lateralAccelLimit,
  longitudinalAccel:1.1,propulsionAccel:1.1,serviceBrakeAccel:0,surfaceMu:1,
  throttle:.3,handbrake:false,airborne:false,vehicle:civic,speedAbs:5,dt:1/60,
  contacts,previousUsage:[0,0,0,0]
},{});
approx(cleanFallback.requestedPropulsionAccel,1.1,1e-12,'stale raw demand leaked into fallback grip call');
approx(cleanFallback.appliedPropulsionAccel,1.1,1e-12,'fallback applied propulsion changed');
approx(cleanFallback.propulsionSaturationRatio,1,1e-12,'fallback saturation must be 1');

const dynamics=fs.readFileSync('src/physics/vehicle-dynamics-traction-steering.js','utf8');
const runtime=fs.readFileSync('src/driving-runtime.js','utf8');
const wrapper=fs.readFileSync('src/physics/vehicle-dynamics.js','utf8');
assert.doesNotMatch(dynamics,/latestRawDriveDemandAccel|latestAppliedDriveAccel/,'hidden traction→grip module state remains');
assert.doesNotMatch(dynamics,/WorldDriveWheelSpinTelemetry/,'deprecated wheelspin telemetry global remains');
assert.doesNotMatch(wrapper,/WorldDriveWheelSpinTelemetry/,'canonical dynamics still depends on deprecated wheelspin telemetry global');
assert.match(runtime,/createWheelspinState/,'runtime does not use B6 persistent wheelspin owner');
assert.doesNotMatch(runtime,/let wheelspinLevel=0,wheelspinHoldSec=0/,'runtime still owns hidden parallel wheelspin variables');

console.log('CLEANUP B6 WHEELSPIN OWNERSHIP QA: PASS',{
  randomizedSteps:42000,
  maxError,
  explicitSaturation:baseline.propulsionSaturationRatio,
  frontSlip:[baseline.slip[1],baseline.slip[3]],
  fallbackSaturation:cleanFallback.propulsionSaturationRatio
});
