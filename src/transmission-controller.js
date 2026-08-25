import { createTransmissionController as createBaseTransmissionController } from './transmission-controller-base.js';

export function selectTransmissionDriveDirection({
  currentDirection=1,
  requestedThrottle=0,
  bodyLongitudinalSpeed=0,
  reverseEngageForwardThreshold=.35
}={}){
  const current=Number(currentDirection)<0?-1:1;
  const throttle=Number(requestedThrottle)||0;
  const bodySpeed=Number(bodyLongitudinalSpeed)||0;

  // Positive pedal is an explicit request for Drive.  This matters after a
  // J-turn: the vehicle may still be travelling backwards by inertia, but the
  // forward gear remains engaged and its torque works against that motion.
  if(throttle>.04)return 1;

  // The negative control is brake while appreciably travelling forward.  It
  // becomes a Reverse request only near standstill or once travel is already
  // rearward.  This preserves World Drive's brake-to-reverse control scheme.
  if(throttle<-.04){
    if(current<0)return -1;
    if(bodySpeed<=reverseEngageForwardThreshold)return -1;
  }

  // Coasting/sliding never changes the selected driveline direction by itself.
  return current;
}

export function createTransmissionController(args={}){
  const rawGetSpeed=typeof args.getSpeed==='function'?args.getSpeed:()=>0;
  let bodyLongitudinalSpeed=NaN;
  let driveDirection=1;
  let lastProfileKey='';

  const transmissionSpeed=()=>{
    const raw=Number.isFinite(bodyLongitudinalSpeed)
      ?bodyLongitudinalSpeed
      :Number(rawGetSpeed())||0;
    return driveDirection<0?-Math.abs(raw):Math.abs(raw);
  };

  const base=createBaseTransmissionController({
    ...args,
    getSpeed:transmissionSpeed
  });
  const baseUpdateTransmission=base.updateTransmission;
  const baseResetTransmissionState=base.resetTransmissionState;

  function activeProfileKey(){
    const profile=base.activeTransmissionProfile();
    return `${args.vehicleSystem?.activeId||'unknown'}:${profile?.profile||profile?.type||''}`;
  }

  function resetTransmissionState(){
    driveDirection=1;
    bodyLongitudinalSpeed=NaN;
    lastProfileKey=activeProfileKey();
    return baseResetTransmissionState();
  }

  return {
    ...base,
    resetTransmissionState,
    updateTransmission(
      dt,
      requestedThrottle,
      onPavement=true,
      automaticOverride=false,
      nextBodyLongitudinalSpeed=NaN
    ){
      const next=Number(nextBodyLongitudinalSpeed);
      bodyLongitudinalSpeed=Number.isFinite(next)?next:NaN;

      const profileKey=activeProfileKey();
      if(profileKey!==lastProfileKey){
        driveDirection=1;
        lastProfileKey=profileKey;
      }

      const physicalBodySpeed=Number.isFinite(bodyLongitudinalSpeed)
        ?bodyLongitudinalSpeed
        :Number(rawGetSpeed())||0;
      driveDirection=selectTransmissionDriveDirection({
        currentDirection:driveDirection,
        requestedThrottle,
        bodyLongitudinalSpeed:physicalBodySpeed
      });

      return baseUpdateTransmission(
        dt,
        requestedThrottle,
        onPavement,
        automaticOverride
      );
    },
    getTransmissionLongitudinalSpeed(){
      return transmissionSpeed();
    },
    getPhysicalBodyLongitudinalSpeed(){
      return Number.isFinite(bodyLongitudinalSpeed)
        ?bodyLongitudinalSpeed
        :Number(rawGetSpeed())||0;
    },
    getTransmissionDriveDirection(){
      return driveDirection;
    }
  };
}
