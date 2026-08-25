import assert from 'node:assert/strict';
import {createTransmissionController} from '../src/transmission-controller.js';
import {bodyRelativeLongitudinalSpeed} from '../src/driving-runtime.js';

function makeController(){
  let rawSpeed=18;
  const state={
    transmissionGear:1,transmissionPendingGear:1,transmissionShiftTimer:0,
    transmissionShiftDuration:0,transmissionShiftStartRpm:0,transmissionShiftEndRpm:0,
    transmissionShifting:false,revLimiterActive:false,revLimiterPhase:0,
    manualShiftRequest:null,transmissionProfileKey:'wrx:test',engineRpm:900,
    transmissionMode:'automatic'
  };
  const profile={type:'combustion',profile:'test',idleRpm:900,redlineRpm:6500,gearCount:6,gearRatios:[3.8,2.2,1.5,1.15,.92,.75],shiftDuration:.1,downshiftDuration:.1,revLimiterHz:10,revLimiterDropRpm:220};
  const vehicleSystem={activeId:'wrx',active:{audio:profile}};
  const VEHICLE={topSpeedKmh:220};
  const ctrl=createTransmissionController({
    vehicleSystem,VEHICLE,
    computeGearRedlineSpeeds:()=>[45,80,120,160,195,225],
    computeTransmissionState:(kmh,load,p,g)=>({rpm:Math.max(900,kmh*80/Math.max(1,g)),mechanicalRpm:Math.max(900,kmh*80/Math.max(1,g))}),
    physicsClamp:(v,a,b)=>Math.max(a,Math.min(b,v)),physicsSmoothstep01:v=>v*v*(3-2*v),toast:()=>{},getSpeed:()=>rawSpeed,
    getLongitudinalAccel:()=>0,vehicleReverseLimitMps:()=>-12,state
  });
  return {ctrl,state,setRawSpeed:v=>{rawSpeed=v;}};
}

assert.ok(bodyRelativeLongitudinalSpeed({speed:20,heading:0,velocityHeading:Math.PI})<0,'post-180 momentum must be reverse-relative to chassis');

{
  const {ctrl,state}=makeController();
  ctrl.updateTransmission(1/60,0,true,false,-18);
  assert.equal(ctrl.getPhysicalBodyLongitudinalSpeed(),-18,'physical body-relative speed must preserve rearward inertia');
  assert.equal(ctrl.getTransmissionSelector(),1,'rearward inertia must not auto-select Reverse');
  assert.ok(state.transmissionGear>=1,'Drive must remain selected after a 180 until driver changes selector');
}

{
  const {ctrl,state}=makeController();
  ctrl.requestManualShift(-1); // 1st -> N
  assert.equal(ctrl.getTransmissionSelector(),0,'downshift below first must select Neutral');
  ctrl.updateTransmission(1/60,0,true,false,.1);
  ctrl.requestManualShift(-1); // N -> R near stop
  assert.equal(ctrl.getTransmissionSelector(),-1,'N -> R must require explicit selector input near standstill');
  assert.equal(state.transmissionGear,-1);
}

{
  const {ctrl}=makeController();
  ctrl.requestManualShift(-1);
  ctrl.updateTransmission(1/60,0,true,false,4);
  ctrl.requestManualShift(-1);
  assert.equal(ctrl.getTransmissionSelector(),0,'Reverse must be refused while appreciably moving');
}

console.log('V21.31 BODY-RELATIVE D/N/R TRANSMISSION QA: PASS');
