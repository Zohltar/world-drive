import { createTransmissionController as createBaseTransmissionController } from './transmission-controller-base.js';
import { readTransmissionRuntimeState, resetTransmissionRuntimeState } from './transmission-runtime-bridge.js';

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

function publishEngineInput({throttle=0,clutchHeld=false}={}){
  if(typeof window==='undefined')return;
  window.WorldDriveEngineInput={
    throttle:clamp01(Math.max(0,Number(throttle)||0)),
    clutchHeld:!!clutchHeld
  };
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
    resetTransmissionRuntimeState();
    publishEngineInput({throttle:0,clutchHeld:false});
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
      nextBodyLongitudinalSpeed=NaN,
      clutchHeld=undefined
    ){
      const bridged=readTransmissionRuntimeState();
      const explicitBody=Number(nextBodyLongitudinalSpeed);
      const bridgeBody=Number(bridged?.bodyLongitudinalSpeed);
      bodyLongitudinalSpeed=Number.isFinite(explicitBody)
        ?explicitBody
        :(Number.isFinite(bridgeBody)?bridgeBody:NaN);

      const resolvedClutchHeld=typeof clutchHeld==='boolean'
        ?clutchHeld
        :!!bridged?.clutchHeld;
      const resolvedEngineThrottle=Number.isFinite(Number(bridged?.engineThrottle))
        ?Number(bridged.engineThrottle)
        :Number(requestedThrottle)||0;

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
      const combustion=profile?.type==='combustion';
      publishEngineInput({
        throttle:combustion?resolvedEngineThrottle:0,
        clutchHeld:combustion&&resolvedClutchHeld
      });

      if(combustion&&resolvedClutchHeld){
        const idle=Math.max(500,Number(profile.idleRpm)||850);
        const redline=Math.max(idle+500,Number(profile.redlineRpm)||6500);
        const pedal=clamp01(Math.max(0,resolvedEngineThrottle));
        const freeRevTarget=idle+(redline-idle)*Math.pow(pedal,.72)*.97;
        const current=Math.max(idle,Number(args.state?.engineRpm)||idle);
        const response=freeRevTarget>current?11.5:6.0;
        args.state.engineRpm=current+(freeRevTarget-current)*(1-Math.exp(-Math.max(0,Number(dt)||0)*response));
      }

      return transmitted;
    },
    getTransmissionLongitudinalSpeed(){return transmissionSpeed();},
    getPhysicalBodyLongitudinalSpeed(){
      return Number.isFinite(bodyLongitudinalSpeed)?bodyLongitudinalSpeed:Number(rawGetSpeed())||0;
    },
    getTransmissionDriveDirection(){return driveDirection;}
  };
}
