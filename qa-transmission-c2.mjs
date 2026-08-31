import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTransmissionController} from './src/transmission-controller.js';
import {publishTransmissionRuntimeState,readTransmissionRuntimeState} from './src/transmission-runtime-bridge.js';
import {readTransmissionNetworkGear,resetTransmissionNetworkGear} from './src/transmission-network-state.js';

assert.equal(fs.existsSync('src/transmission-controller-base.js'),false,'historical transmission-controller-base.js returned');
const source=fs.readFileSync('src/transmission-controller.js','utf8');
assert.doesNotMatch(source,/transmission-controller-base\.js/,'canonical controller still imports historical base layer');
assert.doesNotMatch(source,/createBaseTransmissionController/,'historical base-controller alias remains');
assert.doesNotMatch(source,/syncSelectorGear/,'post-update selector repair helper remains');
assert.match(source,/function normalizeTransmissionSelector\(/,'explicit selector normalization missing');
assert.match(source,/if\(selector===0\)\{/,'Neutral does not have an explicit controller branch');
assert.match(source,/state\.transmissionGear=0;/,'Neutral exact gear write missing');
assert.match(source,/publishTransmissionNetworkGear\(args\.state\.transmissionGear\)/,'authoritative network gear publication changed');

function makeController({type='combustion'}={}){
  const state={transmissionMode:'manual',transmissionGear:1,transmissionPendingGear:1,transmissionShiftTimer:0,transmissionShiftDuration:0,transmissionShiftStartRpm:0,transmissionShiftEndRpm:0,transmissionShifting:false,revLimiterActive:false,revLimiterPhase:0,manualShiftRequest:null,transmissionProfileKey:'',engineRpm:type==='combustion'?850:0};
  const profile=type==='combustion'
    ?{type:'combustion',profile:'civic',idleRpm:850,redlineRpm:6800,gearRatios:[3.2,2.1,1.5,1.1,.85],referenceTopGearRedlineKmh:210,referenceTopGearRatio:.85,referenceRedlineRpm:6800}
    :{type:'ev',profile:'ev'};
  const vehicleSystem={activeId:type==='combustion'?'civic':'id4',active:{audio:profile}};
  let speed=0;
  const controller=createTransmissionController({
    vehicleSystem,VEHICLE:{topSpeedKmh:210},state,toast:()=>{},getSpeed:()=>speed,getLongitudinalAccel:()=>0,vehicleReverseLimitMps:()=>-10,
    physicsClamp:(v,a,b)=>Math.max(a,Math.min(b,v)),physicsSmoothstep01:v=>v*v*(3-2*v),
    computeGearRedlineSpeeds:()=>[45,75,115,160,210],
    computeTransmissionState:(kmh,load,p,g)=>({rpm:type==='combustion'?Math.max(p.idleRpm,850+kmh*40):0,mechanicalRpm:type==='combustion'?Math.max(p.idleRpm,850+kmh*40):0,gear:g}),
  });
  return {state,controller,setSpeed:v=>{speed=v;}};
}

for(const type of ['combustion','ev']){
  resetTransmissionNetworkGear();
  const {state,controller}=makeController({type});
  controller.resetTransmissionState();
  assert.equal(controller.getTransmissionSelector(),1,`${type} reset selector must be D`);
  assert.equal(state.transmissionGear,1,`${type} D must publish exact forward gear 1`);
  assert.equal(readTransmissionNetworkGear(),1,`${type} network D gear drift`);

  controller.requestManualShift(-1);
  assert.equal(controller.getTransmissionSelector(),0,`${type} D->N selector drift`);
  assert.equal(state.transmissionGear,0,`${type} Neutral must be exact gear 0`);
  publishTransmissionRuntimeState({bodyLongitudinalSpeed:0,engineThrottle:1,clutchHeld:false,serviceBrake:0});
  const neutralTorque=controller.updateTransmission(1/60,1,true,false,0,false);
  assert.equal(neutralTorque,0,`${type} Neutral transmitted torque`);
  assert.equal(state.transmissionGear,0,`${type} core coerced Neutral back to first gear`);
  assert.equal(readTransmissionNetworkGear(),0,`${type} network Neutral drift`);
  assert.equal(readTransmissionRuntimeState().selectorGear,0,`${type} runtime bridge Neutral drift`);

  controller.requestManualShift(-1);
  assert.equal(controller.getTransmissionSelector(),-1,`${type} N->R selector drift`);
  assert.equal(state.transmissionGear,-1,`${type} Reverse must be exact gear -1`);
  const reverseTorque=controller.updateTransmission(1/60,1,true,false,0,false);
  assert.ok(reverseTorque<0,`${type} Reverse must return negative drive torque`);
  assert.equal(readTransmissionNetworkGear(),-1,`${type} network Reverse drift`);

  controller.requestManualShift(1);
  assert.equal(state.transmissionGear,0,`${type} R->N must restore exact Neutral`);
  controller.requestManualShift(1);
  assert.equal(state.transmissionGear,1,`${type} N->D must restore forward gear 1`);
}

console.log('CLEANUP C2 TRANSMISSION OWNERSHIP QA: PASS',{selectorContract:{reverse:-1,neutral:0,forward:'1..N'},singleControllerModule:true,multiplayerExactGear:true});
