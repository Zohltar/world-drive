import {createTransmissionController} from '../src/transmission-controller.js';
import {publishTransmissionRuntimeState} from '../src/transmission-runtime-bridge.js';

function fail(m){throw new Error(m);}
const state={transmissionMode:'automatic',transmissionGear:1,transmissionPendingGear:1,transmissionShiftTimer:0,transmissionShiftDuration:0,transmissionShiftStartRpm:0,transmissionShiftEndRpm:0,transmissionShifting:false,revLimiterActive:false,revLimiterPhase:0,manualShiftRequest:null,transmissionProfileKey:'',engineRpm:850};
const profile={type:'combustion',profile:'civic',idleRpm:850,redlineRpm:6800,gearRatios:[3.2,2.1,1.5,1.1,.85],referenceTopGearRedlineKmh:210,referenceTopGearRatio:.85,referenceRedlineRpm:6800};
const vehicleSystem={activeId:'civic',active:{audio:profile}};
const controller=createTransmissionController({
  vehicleSystem,VEHICLE:{topSpeedKmh:210},state,toast:()=>{},getSpeed:()=>0,getLongitudinalAccel:()=>0,vehicleReverseLimitMps:()=>-10,
  physicsClamp:(v,a,b)=>Math.max(a,Math.min(b,v)),physicsSmoothstep01:v=>v*v*(3-2*v),
  computeGearRedlineSpeeds:()=>[45,75,115,160,210],
  computeTransmissionState:(kmh,load,p,g)=>({rpm:Math.max(p.idleRpm,850+kmh*40),mechanicalRpm:Math.max(p.idleRpm,850+kmh*40),gear:g||1}),
});
controller.resetTransmissionState();
if(controller.getTransmissionSelector()!==1)fail('reset must start in D/forward');
controller.requestManualShift(-1);
if(controller.getTransmissionSelector()!==0||state.transmissionGear!==0)fail('first downshift from 1/D must select N');
controller.requestManualShift(-1);
if(controller.getTransmissionSelector()!==-1||state.transmissionGear!==-1)fail('second downshift must select R');
publishTransmissionRuntimeState({bodyLongitudinalSpeed:0,engineThrottle:1,clutchHeld:false,serviceBrake:0});
const reverseTorque=controller.updateTransmission(1/60,1,true,false,0,false);
if(!(reverseTorque<0))fail(`R must turn positive throttle into reverse torque, got ${reverseTorque}`);
controller.requestManualShift(1);
if(controller.getTransmissionSelector()!==0)fail('first upshift from R must select N');
controller.requestManualShift(1);
if(controller.getTransmissionSelector()!==1)fail('second upshift from N must return D/1');
console.log('V21.29 D/N/R selector QA passed');
