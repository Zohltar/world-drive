import { createTransmissionController as createBaseTransmissionController } from './transmission-controller-base.js';
import {
  readTransmissionRuntimeState,
  resetTransmissionRuntimeState,
  publishClutchShockMultiplier
} from './transmission-runtime-bridge.js';

function clamp01(value){
  return Math.max(0,Math.min(1,Number(value)||0));
}

export function freeRevRiseTimeSec(profile={},vehicleId=''){
  const explicit=Number(profile.freeRevIdleToRedlineSec);
  if(Number.isFinite(explicit)&&explicit>.25)return explicit;

  if(vehicleId==='semi_6x4')return 2.35;
  switch(String(profile.profile||'')){
    case 'f1-v8': return .72;
    case 'countach-v12': return 1.18;
    case 'boxer-turbo': return 1.48;
    case 'civic': return 1.62;
    case 'sonata-sport': return 1.70;
    default: return 1.55;
  }
}

export function clutchShockCalibration(profile={},vehicleId=''){
  if(vehicleId==='semi_6x4')return {gain:1.35,travelBonus:.18,max:2.15};
  switch(String(profile.profile||'')){
    case 'f1-v8': return {gain:2.30,travelBonus:.25,max:3.35};
    case 'countach-v12': return {gain:2.85,travelBonus:.38,max:3.75};
    case 'boxer-turbo': return {gain:2.65,travelBonus:.42,max:3.60};
    case 'civic': return {gain:2.10,travelBonus:.28,max:3.05};
    case 'sonata-sport': return {gain:2.00,travelBonus:.26,max:2.95};
    default: return {gain:2.20,travelBonus:.30,max:3.20};
  }
}

export function advanceFreeRevRpm({
  currentRpm=850,
  idleRpm=850,
  redlineRpm=6500,
  throttle=0,
  dt=0,
  riseTimeSec=1.5
}={}){
  const idle=Math.max(400,Number(idleRpm)||850);
  const redline=Math.max(idle+500,Number(redlineRpm)||6500);
  const current=Math.max(idle,Math.min(redline,Number(currentRpm)||idle));
  const pedal=clamp01(Math.max(0,Number(throttle)||0));
  const stepDt=Math.max(0,Math.min(.05,Number(dt)||0));
  const span=redline-idle;
  const target=idle+span*Math.pow(pedal,.72)*.985;

  if(Math.abs(target-current)<.5)return target;

  if(target>current){
    const normalized=clamp01((current-idle)/span);
    const highRpmTaper=1-.32*Math.pow(normalized,2.2);
    const pedalAuthority=.18+.82*Math.pow(pedal,.85);
    const nominalRate=span/Math.max(.30,Number(riseTimeSec)||1.5);
    const rpmStep=nominalRate*1.18*highRpmTaper*pedalAuthority*stepDt;
    return Math.min(target,current+rpmStep);
  }

  const fallTime=Math.max(.55,(Number(riseTimeSec)||1.5)*.78);
  const fallRate=span/fallTime;
  return Math.max(target,current-fallRate*stepDt);
}

export function clutchShockMultiplierFromMismatch({
  freeRpm=0,
  coupledRpm=0,
  idleRpm=850,
  redlineRpm=6500,
  throttle=0,
  opposingTravel=false,
  gain=2.65,
  travelBonus=.42,
  maxMultiplier=3.6
}={}){
  const idle=Math.max(400,Number(idleRpm)||850);
  const redline=Math.max(idle+500,Number(redlineRpm)||6500);
  const span=Math.max(500,redline-idle);
  const delta=Math.abs((Number(freeRpm)||0)-(Number(coupledRpm)||0));
  const mismatch=clamp01(delta/span);
  const pedal=clamp01(Math.max(0,Number(throttle)||0));
  if(pedal<.08||mismatch<.025)return 1;
  const bonus=opposingTravel?Math.max(0,Number(travelBonus)||0):0;
  const configuredGain=Math.max(0,Number(gain)||0);
  const cap=Math.max(1,Number(maxMultiplier)||1);
  return Math.min(cap,1+pedal*(.18+configuredGain*mismatch+bonus));
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
  let freeRevRpm=NaN;
  let clutchWasHeld=false;

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
    freeRevRpm=NaN;
    clutchWasHeld=false;
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
        freeRevRpm=NaN;
        clutchWasHeld=false;
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

      const profileBeforeBase=base.activeTransmissionProfile();
      const combustionBeforeBase=profileBeforeBase?.type==='combustion';
      if(combustionBeforeBase&&resolvedClutchHeld&&!clutchWasHeld){
        const idle=Math.max(500,Number(profileBeforeBase.idleRpm)||850);
        freeRevRpm=Math.max(idle,Number(args.state?.engineRpm)||idle);
      }

      const freeRpmBeforeCoupling=freeRevRpm;
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
        if(!Number.isFinite(freeRevRpm))freeRevRpm=Math.max(idle,Number(args.state?.engineRpm)||idle);
        freeRevRpm=advanceFreeRevRpm({
          currentRpm:freeRevRpm,
          idleRpm:idle,
          redlineRpm:redline,
          throttle:pedal,
          dt,
          riseTimeSec:freeRevRiseTimeSec(profile,args.vehicleSystem?.activeId||'')
        });
        args.state.engineRpm=freeRevRpm;
        args.state.revLimiterActive=pedal>.96&&freeRevRpm>=redline*.982;
        if(!args.state.revLimiterActive)args.state.revLimiterPhase=0;
      }else{
        if(combustion&&clutchWasHeld&&Number.isFinite(freeRpmBeforeCoupling)){
          const idle=Math.max(500,Number(profile.idleRpm)||850);
          const redline=Math.max(idle+500,Number(profile.redlineRpm)||6500);
          const coupledRpm=Math.max(idle,Number(args.state?.engineRpm)||idle);
          const opposingTravel=(driveDirection>0&&physicalBodySpeed<-.25)||(driveDirection<0&&physicalBodySpeed>.25);
          const calibration=clutchShockCalibration(profile,args.vehicleSystem?.activeId||'');
          publishClutchShockMultiplier(clutchShockMultiplierFromMismatch({
            freeRpm:freeRpmBeforeCoupling,
            coupledRpm,
            idleRpm:idle,
            redlineRpm:redline,
            throttle:resolvedEngineThrottle,
            opposingTravel,
            gain:calibration.gain,
            travelBonus:calibration.travelBonus,
            maxMultiplier:calibration.max
          }));
        }
        freeRevRpm=NaN;
      }

      clutchWasHeld=combustion&&resolvedClutchHeld;
      return transmitted;
    },
    getTransmissionLongitudinalSpeed(){return transmissionSpeed();},
    getPhysicalBodyLongitudinalSpeed(){
      return Number.isFinite(bodyLongitudinalSpeed)?bodyLongitudinalSpeed:Number(rawGetSpeed())||0;
    },
    getTransmissionDriveDirection(){return driveDirection;}
  };
}
