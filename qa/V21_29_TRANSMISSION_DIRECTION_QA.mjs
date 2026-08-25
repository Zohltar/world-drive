import assert from 'node:assert/strict';
import {createTransmissionController} from '../src/transmission-controller.js';

const state={
  transmissionGear:1,transmissionPendingGear:1,transmissionShiftTimer:0,transmissionShiftDuration:0,
  transmissionShiftStartRpm:0,transmissionShiftEndRpm:0,transmissionShifting:false,
  revLimiterActive:false,revLimiterPhase:0,manualShiftRequest:null,transmissionProfileKey:'',
  engineRpm:900,transmissionMode:'automatic'
};
let rawSpeed=0;
const profile={type:'combustion',profile:'test',idleRpm:900,redlineRpm:6500,gearCount:6,gearRatios:[3.8,2.2,1.5,1.15,.92,.75]};
const ctrl=createTransmissionController({
  vehicleSystem:{activeId:'qa',active:{audio:profile}},VEHICLE:{topSpeedKmh:220},
  computeGearRedlineSpeeds:()=>[45,80,120,160,195,225],
  computeTransmissionState:(kmh,load,p,g)=>({rpm:Math.max(900,kmh*80/Math.max(1,g)),mechanicalRpm:Math.max(900,kmh*80/Math.max(1,g))}),
  physicsClamp:(v,a,b)=>Math.max(a,Math.min(b,v)),physicsSmoothstep01:v=>v*v*(3-2*v),
  toast:()=>{},getSpeed:()=>rawSpeed,getLongitudinalAccel:()=>0,vehicleReverseLimitMps:()=>-12,state
});

ctrl.updateTransmission(1/60,0,true,false,-12);
assert.equal(ctrl.getTransmissionSelector(),1,'rearward inertia must not auto-select Reverse');

ctrl.requestManualShift(-1);
assert.equal(ctrl.getTransmissionSelector(),0,'downshift below first must explicitly select Neutral');
rawSpeed=.2;
ctrl.updateTransmission(1/60,0,true,false,.2);
ctrl.requestManualShift(-1);
assert.equal(ctrl.getTransmissionSelector(),-1,'Reverse must require explicit N -> R selection near stop');

ctrl.requestManualShift(1);
assert.equal(ctrl.getTransmissionSelector(),0,'R -> upshift must select Neutral first');
ctrl.requestManualShift(1);
assert.equal(ctrl.getTransmissionSelector(),1,'N -> upshift must select Drive');

ctrl.requestManualShift(-1);
rawSpeed=4;
ctrl.updateTransmission(1/60,0,true,false,4);
ctrl.requestManualShift(-1);
assert.equal(ctrl.getTransmissionSelector(),0,'Reverse must be refused while moving appreciably');

console.log('V21.31 TRANSMISSION SELECTOR QA: PASS');
