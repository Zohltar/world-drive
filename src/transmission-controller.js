import { createTransmissionController as createBaseTransmissionController } from './transmission-controller-base.js';

function clamp01(value){
  return Math.max(0,Math.min(1,Number(value)||0));
}

export function selectTransmissionDriveDirection({
  currentDirection=1,
  requestedThrottle=0,
  bodyLongitudinalSpeed=0,
  reverseEngageForwardThreshold=.35
}={}){
  const current=Number(currentDirection)<0?-1:1;
  const throttle=Number(requestedThrottle)||0;
  const bodySpeed=Number(bodyLongitudinalSpeed)||0;

  if(throttle>.04)return 1;

  if(throttle<-.04){
    if(current<0)return -1;
    if(bodySpeed<=reverseEngageForwardThreshold)return -1;
  }

  return current;
}

export function clutchShockThrottle({
  vehicleId='',
  profileType='',
  driveDirection=1,
  bodyLongitudinalSpeed=0,
  requestedThrottle=0,
  transmittedThrottle=0
}={}){
  const base=Number(transmittedThrottle)||0;
  if(
    vehicleId!=='wrx'||
    profileType!=='combustion'||
    Number(driveDirection)<0||
    Number(bodyLongitudinalSpeed)>=-.35||
    Number(requestedThrottle)<=.18||
    base<=0
  )return base;

  // A WRX 6MT clutch dump while the chassis is still travelling rearward is a
  // torque transient, not steady-state 0-100 acceleration. The normal vehicle
  // accel calibration remains untouched; this only increases the instantaneous
  // drivetrain demand so the tire model/traction limiter can saturate the AWD
  // contacts instead of unrealistically feeding torque in gently.
  const oppositionT=clamp01((Math.abs(Number(bodyLongitudinalSpeed)||0)-.35)/3.65);
  const pedalT=clamp01((Number(requestedThrottle)-.18)/.82);
  const shockT=oppositionT*pedalT;
  const maxMultiplier=2.25;
  return base*(1+(maxMultiplier-1)*shockT);
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

      const transmitted=baseUpdateTransmission(
        dt,
        requestedThrottle,
        onPavement,
        automaticOverride
      );
      const profile=base.activeTransmissionProfile();
      return clutchShockThrottle({
        vehicleId:args.vehicleSystem?.activeId||'',
        profileType:profile?.type||'',
        driveDirection,
        bodyLongitudinalSpeed:physicalBodySpeed,
        requestedThrottle,
        transmittedThrottle:transmitted
      });
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
