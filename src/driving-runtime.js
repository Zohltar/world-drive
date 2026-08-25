export * from './driving-runtime-base.js';
import {
  createDrivingRuntime as createBaseDrivingRuntime,
  bodyRelativeLongitudinalSpeed
} from './driving-runtime-base.js';

export function createDrivingRuntime(args={}){
  const originalUpdateTransmission=args.updateTransmission;
  if(typeof originalUpdateTransmission!=='function')return createBaseDrivingRuntime(args);

  let clutchWasHeld=false;
  let clutchReleaseTimer=0;

  const updateTransmissionWithBodySpeed=(dt,requestedThrottle,onPavement=true,automaticOverride=false)=>{
    const state=typeof args.getState==='function'?args.getState():null;
    const bodySpeed=bodyRelativeLongitudinalSpeed(state||{});
    const profile=typeof args.activeTransmissionProfile==='function'?args.activeTransmissionProfile():null;
    const combustion=profile?.type==='combustion';
    const keyboardClutch=!!args.keyboardActionDown?.('clutch');
    const gamepadClutch=!!args.gamepadState?.clutch;
    const clutchHeld=combustion&&(keyboardClutch||gamepadClutch);

    const baseThrottle=originalUpdateTransmission(
      dt,
      requestedThrottle,
      onPavement,
      automaticOverride,
      bodySpeed
    );

    if(!combustion){
      clutchWasHeld=false;
      clutchReleaseTimer=0;
      return baseThrottle;
    }

    if(clutchHeld){
      clutchWasHeld=true;
      clutchReleaseTimer=0;
      return 0;
    }

    if(clutchWasHeld){
      clutchWasHeld=false;
      clutchReleaseTimer=.22;
    }

    if(clutchReleaseTimer>0){
      clutchReleaseTimer=Math.max(0,clutchReleaseTimer-Math.max(0,Number(dt)||0));
      const releaseT=clutchReleaseTimer/.22;
      const pedal=Math.min(1,Math.abs(Number(requestedThrottle)||0));
      const opposingTravel=(baseThrottle>0&&bodySpeed<-.25)||(baseThrottle<0&&bodySpeed>.25);
      const shock=opposingTravel?1+1.25*pedal*releaseT:1+.35*pedal*releaseT;
      return baseThrottle*shock;
    }

    return baseThrottle;
  };

  return createBaseDrivingRuntime({
    ...args,
    updateTransmission:updateTransmissionWithBodySpeed
  });
}
