import assert from 'node:assert/strict';
import { createTransmissionController } from '../src/transmission-controller.js';
import { bodyRelativeLongitudinalSpeed } from '../src/driving-runtime.js';

function makeController(){
  let rawSpeed=18;
  const state={
    transmissionGear:1,transmissionPendingGear:1,transmissionShiftTimer:0,
    transmissionShiftDuration:0,transmissionShiftStartRpm:0,transmissionShiftEndRpm:0,
    transmissionShifting:false,revLimiterActive:false,revLimiterPhase:0,
    manualShiftRequest:null,transmissionProfileKey:'wrx:test',engineRpm:900,
    transmissionMode:'automatic'
  };
  const profile={
    type:'combustion',profile:'test',idleRpm:900,redlineRpm:6500,gearCount:6,
    gearRatios:[3.8,2.2,1.5,1.15,.92,.75],shiftDuration:.1,downshiftDuration:.1,
    revLimiterHz:10,revLimiterDropRpm:220
  };
  const vehicleSystem={activeId:'wrx',active:{audio:profile}};
  const VEHICLE={topSpeedKmh:220};
  const ctrl=createTransmissionController({
    vehicleSystem,VEHICLE,
    computeGearRedlineSpeeds:()=>[45,80,120,160,195,225],
    computeTransmissionState:(kmh,load,p,g)=>({rpm:Math.max(900,kmh*80/Math.max(1,g)),mechanicalRpm:Math.max(900,kmh*80/Math.max(1,g))}),
    physicsClamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
    physicsSmoothstep01:v=>v*v*(3-2*v),toast:()=>{},getSpeed:()=>rawSpeed,
    getLongitudinalAccel:()=>0,vehicleReverseLimitMps:()=>-12,state
  });
  return {ctrl,state,setRawSpeed:v=>{rawSpeed=v;}};
}

assert(bodyRelativeLongitudinalSpeed({speed:20,heading:0,velocityHeading:Math.PI})<0,
  'post-180 momentum must be reverse-relative to the chassis');

{
  const {ctrl,state}=makeController();
  ctrl.updateTransmission(1/60,0,true,false,-18);
  assert.equal(state.transmissionGear,-1,'post-180 reverse-relative travel must select reverse');
  assert(ctrl.getTransmissionLongitudinalSpeed()<0,'transmission speed source must be body-relative');
}

{
  const {ctrl,state,setRawSpeed}=makeController();
  setRawSpeed(-10);
  ctrl.updateTransmission(1/60,0,true,false,10);
  assert(state.transmissionGear>=1,'body-forward motion must override contradictory raw scalar speed sign');
}

{
  const {ctrl,state}=makeController();
  ctrl.updateTransmission(1/60,0,true,false,18);
  assert(state.transmissionGear>=1,'ordinary forward travel must retain forward gearing');
}

console.log('V21.29 BODY-RELATIVE TRANSMISSION QA: PASS');
