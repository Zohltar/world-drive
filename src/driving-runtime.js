export * from './driving-runtime-base.js';
import {
  createDrivingRuntime as createBaseDrivingRuntime,
  bodyRelativeLongitudinalSpeed
} from './driving-runtime-base.js';
import {
  publishTransmissionRuntimeState,
  consumeClutchShockMultiplier
} from './transmission-runtime-bridge.js';

export function clutchShockDurationSec(profile={},vehicleId=''){
  if(vehicleId==='semi_6x4')return .18;
  switch(String(profile.profile||'')){
    case 'f1-v8': return .065;
    case 'countach-v12': return .085;
    case 'boxer-turbo': return .095;
    case 'civic': return .11;
    case 'sonata-sport': return .12;
    default: return .105;
  }
}

export function semiAutoClutchReleaseMultiplier({
  releaseRemaining=0,
  releaseDuration=.095,
  shockMultiplier=1
}={}){
  const duration=Math.max(.001,Number(releaseDuration)||.095);
  const remaining=Math.max(0,Math.min(1,(Number(releaseRemaining)||0)/duration));
  const peak=Math.max(1,Number(shockMultiplier)||1);
  const envelope=Math.pow(remaining,1.65);
  return 1+(peak-1)*envelope;
}

export function drivenWheelSlipLevels(drivetrain='AWD',level=0){
  const s=Math.max(0,Math.min(1,Number(level)||0));
  if(drivetrain==='FWD')return [0,s,0,s];
  if(drivetrain==='RWD')return [s,0,s,0];
  return [s*.72,s*.72,s*.72,s*.72];
}

export function wheelspinDynamicGripFactor(drivetrain='AWD',level=0,vehicleClass='passenger'){
  const s=Math.max(0,Math.min(1,Number(level)||0));
  if(vehicleClass==='tractor')return 1-.05*s;
  if(drivetrain==='FWD')return 1-.22*s;
  if(drivetrain==='RWD')return 1-.18*s;
  return 1-.10*s;
}

export function createDrivingRuntime(args={}){
  const originalUpdateTransmission=args.updateTransmission;
  const originalLongitudinalTractionLimit=args.longitudinalTractionLimit;
  const originalSkidMarks=args.skidMarks;
  if(typeof originalUpdateTransmission!=='function')return createBaseDrivingRuntime(args);

  let clutchWasHeld=false;
  let clutchReleaseTimer=0;
  let clutchShockMultiplier=1;
  let clutchShockDuration=.095;
  let activeReleaseMultiplier=1;
  let frameDt=1/60;
  let requestedEngineThrottle=0;
  let wheelspinLevel=0;
  let wheelspinHoldSec=0;

  const updateTransmissionWithBodySpeed=(dt,requestedThrottle,onPavement=true,automaticOverride=false)=>{
    frameDt=Math.max(.001,Math.min(.05,Number(dt)||1/60));
    requestedEngineThrottle=Number(requestedThrottle)||0;
    const state=typeof args.getState==='function'?args.getState():null;
    const bodySpeed=bodyRelativeLongitudinalSpeed(state||{});
    const profile=typeof args.activeTransmissionProfile==='function'?args.activeTransmissionProfile():null;
    const combustion=profile?.type==='combustion';
    const keyboardClutch=!!args.keyboardActionDown?.('clutch');
    const gamepadClutch=!!args.gamepadState?.clutch;
    const clutchHeld=combustion&&(keyboardClutch||gamepadClutch);

    publishTransmissionRuntimeState({
      bodyLongitudinalSpeed:bodySpeed,
      clutchHeld,
      engineThrottle:requestedThrottle
    });

    const baseThrottle=originalUpdateTransmission(
      dt,
      requestedThrottle,
      onPavement,
      automaticOverride,
      bodySpeed,
      clutchHeld
    );

    activeReleaseMultiplier=1;

    if(!combustion){
      clutchWasHeld=false;
      clutchReleaseTimer=0;
      clutchShockMultiplier=1;
      wheelspinLevel=0;
      wheelspinHoldSec=0;
      return baseThrottle;
    }

    if(clutchHeld){
      clutchWasHeld=true;
      clutchReleaseTimer=0;
      clutchShockMultiplier=1;
      wheelspinLevel=0;
      wheelspinHoldSec=0;
      return 0;
    }

    if(clutchWasHeld){
      clutchWasHeld=false;
      clutchShockDuration=clutchShockDurationSec(profile,args.getVehicleId?.()||'');
      clutchReleaseTimer=clutchShockDuration;
      clutchShockMultiplier=consumeClutchShockMultiplier();
    }

    if(clutchReleaseTimer>0){
      const multiplier=semiAutoClutchReleaseMultiplier({
        releaseRemaining:clutchReleaseTimer,
        releaseDuration:clutchShockDuration,
        shockMultiplier:clutchShockMultiplier
      });
      activeReleaseMultiplier=multiplier;
      clutchReleaseTimer=Math.max(0,clutchReleaseTimer-frameDt);
      if(clutchReleaseTimer<=0)clutchShockMultiplier=1;
      return baseThrottle*multiplier;
    }

    return baseThrottle;
  };

  const longitudinalTractionWithPersistentWheelspin=(tractionArgs={},out=null)=>{
    const result=originalLongitudinalTractionLimit
      ?originalLongitudinalTractionLimit(tractionArgs,out)
      :{acceleration:Number(tractionArgs.requestedAccel)||0,requested:Number(tractionArgs.requestedAccel)||0,limit:Infinity,limited:false};

    if(String(tractionArgs?.mode||'')!=='drive')return result;

    const request=Math.abs(Number(result?.requested)||0);
    const limit=Math.max(.01,Math.abs(Number(result?.limit)||0));
    const overRatio=request/limit;
    const clutchBreakaway=
      activeReleaseMultiplier>1.05&&
      requestedEngineThrottle>.35&&
      !!result?.limited&&
      overRatio>1.03;

    const drivetrain=String(tractionArgs?.vehicle?.drivetrain||'AWD');
    const vehicleClass=String(tractionArgs?.vehicle?.vehicleClass||'passenger');

    if(clutchBreakaway){
      const seed=Math.max(0,Math.min(1,(overRatio-1.02)/.72));
      wheelspinLevel=Math.max(wheelspinLevel,.42+.58*seed);
      wheelspinHoldSec=Math.max(
        wheelspinHoldSec,
        vehicleClass==='tractor'?.18:drivetrain==='FWD'?.62:drivetrain==='RWD'?.48:.24
      );
    }else if(wheelspinHoldSec>0){
      wheelspinHoldSec=Math.max(0,wheelspinHoldSec-frameDt);
      const sustain=requestedEngineThrottle>.55?.995:.975;
      wheelspinLevel*=Math.pow(sustain,frameDt*60);
    }else if(wheelspinLevel>0){
      const recoveryRate=requestedEngineThrottle>.55?3.3:8.5;
      wheelspinLevel*=Math.exp(-frameDt*recoveryRate);
      if(wheelspinLevel<.01)wheelspinLevel=0;
    }

    if(wheelspinLevel>.01&&result&&Number.isFinite(Number(result.acceleration))){
      const factor=wheelspinDynamicGripFactor(drivetrain,wheelspinLevel,vehicleClass);
      const staticAcceleration=Number(result.staticTractionAcceleration);
      if(Number.isFinite(staticAcceleration)){
        result.acceleration=Math.sign(result.acceleration||1)*Math.min(
          Math.abs(result.acceleration),
          Math.abs(staticAcceleration)*factor
        );
      }else{
        result.acceleration*=factor;
      }
      result.runtimeWheelspinLevel=wheelspinLevel;
      result.runtimeSlidingGripFactor=factor;
    }

    if(typeof globalThis!=='undefined'){
      globalThis.WorldDriveRuntimeWheelspin={
        level:wheelspinLevel,
        holdSec:wheelspinHoldSec,
        drivetrain,
        wheels:drivenWheelSlipLevels(drivetrain,wheelspinLevel)
      };
    }

    return result;
  };

  const skidMarksWithWheelspin=originalSkidMarks&&typeof originalSkidMarks.updateLocal==='function'
    ?{
      updateLocal(input={}){
        const drivetrain=String(args.VEHICLE?.drivetrain||'AWD');
        const synthetic=drivenWheelSlipLevels(drivetrain,wheelspinLevel);
        const levels=Array.isArray(input.wheelSlipLevels)?input.wheelSlipLevels.slice():[0,0,0,0];
        const longitudinal=Array.isArray(input.wheelLongitudinalUsage)?input.wheelLongitudinalUsage.slice():[0,0,0,0];
        const grip=Array.isArray(input.wheelGripUsage)?input.wheelGripUsage.slice():[0,0,0,0];
        for(let i=0;i<4;i++){
          if((synthetic[i]||0)<=0)continue;
          levels[i]=Math.max(Number(levels[i])||0,synthetic[i]);
          longitudinal[i]=Math.max(Number(longitudinal[i])||0,1.18+synthetic[i]*.62);
          grip[i]=Math.max(Number(grip[i])||0,1.08+synthetic[i]*.50);
        }
        return originalSkidMarks.updateLocal({
          ...input,
          wheelSlipLevels:levels,
          wheelLongitudinalUsage:longitudinal,
          wheelGripUsage:grip,
          longitudinalAccel:wheelspinLevel>.05?Math.max(.25,Number(input.longitudinalAccel)||0):input.longitudinalAccel
        });
      }
    }
    :originalSkidMarks;

  return createBaseDrivingRuntime({
    ...args,
    updateTransmission:updateTransmissionWithBodySpeed,
    longitudinalTractionLimit:longitudinalTractionWithPersistentWheelspin,
    skidMarks:skidMarksWithWheelspin||args.skidMarks
  });
}
