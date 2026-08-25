export * from './driving-runtime-base.js';
import {
  createDrivingRuntime as createBaseDrivingRuntime,
  bodyRelativeLongitudinalSpeed
} from './driving-runtime-base.js';
import {
  publishTransmissionRuntimeState,
  consumeClutchShockMultiplier
} from './transmission-runtime-bridge.js';

export function semiAutoClutchReleaseMultiplier({
  releaseRemaining=0,
  releaseDuration=.095,
  shockMultiplier=1
}={}){
  const duration=Math.max(.001,Number(releaseDuration)||.095);
  const remaining=Math.max(0,Math.min(1,(Number(releaseRemaining)||0)/duration));
  const peak=Math.max(1,Number(shockMultiplier)||1);
  // Fast, front-loaded engagement: clutch bites hard immediately, then the
  // transient collapses over roughly a tenth of a second. Tire grip still caps
  // the actual force in the base dynamics, so excess demand becomes slip.
  const envelope=Math.pow(remaining,1.65);
  return 1+(peak-1)*envelope;
}

export function createDrivingRuntime(args={}){
  const originalUpdateTransmission=args.updateTransmission;
  if(typeof originalUpdateTransmission!=='function')return createBaseDrivingRuntime(args);

  let clutchWasHeld=false;
  let clutchReleaseTimer=0;
  let clutchShockMultiplier=1;
  const CLUTCH_SHOCK_DURATION=.095;

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
      clutchReleaseTimer=CLUTCH_SHOCK_DURATION;
      clutchShockMultiplier=consumeClutchShockMultiplier();
    }

    if(clutchReleaseTimer>0){
      const multiplier=semiAutoClutchReleaseMultiplier({
        releaseRemaining:clutchReleaseTimer,
        releaseDuration:CLUTCH_SHOCK_DURATION,
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
