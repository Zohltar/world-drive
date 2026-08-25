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

export function createDrivingRuntime(args={}){
  const originalUpdateTransmission=args.updateTransmission;
  if(typeof originalUpdateTransmission!=='function')return createBaseDrivingRuntime(args);

  let clutchWasHeld=false;
  let clutchReleaseTimer=0;
  let clutchShockMultiplier=1;
  let clutchShockDuration=.095;

  const updateTransmissionWithBodySpeed=(dt,requestedThrottle,onPavement=true,automaticOverride=false)=>{
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

    if(!combustion){
      clutchWasHeld=false;
      clutchReleaseTimer=0;
      clutchShockMultiplier=1;
      return baseThrottle;
    }

    if(clutchHeld){
      clutchWasHeld=true;
      clutchReleaseTimer=0;
      clutchShockMultiplier=1;
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
      clutchReleaseTimer=Math.max(0,clutchReleaseTimer-Math.max(0,Number(dt)||0));
      if(clutchReleaseTimer<=0)clutchShockMultiplier=1;
      return baseThrottle*multiplier;
    }

    return baseThrottle;
  };

  return createBaseDrivingRuntime({
    ...args,
    updateTransmission:updateTransmissionWithBodySpeed
  });
}
