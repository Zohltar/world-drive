export * from './driving-runtime-base.js';
import {
  createDrivingRuntime as createBaseDrivingRuntime,
  bodyRelativeLongitudinalSpeed
} from './driving-runtime-base.js';
import {
  publishTransmissionRuntimeState,
  consumeClutchShockMultiplier,
  readTransmissionRuntimeState
} from './transmission-runtime-bridge.js';
import {createCivilTrafficSystem} from './civil-traffic.js';
import {shouldAutoClutchForServiceBrake} from './physics/longitudinal-control.js';
import {
  createWheelspinState,
  drivenWheelSlipLevels,
  wheelspinDynamicGripFactor
} from './physics/wheelspin-state.js';
export {drivenWheelSlipLevels,wheelspinDynamicGripFactor};

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

export function semiAutoClutchReleaseMultiplier({releaseRemaining=0,releaseDuration=.095,shockMultiplier=1}={}){
  const duration=Math.max(.001,Number(releaseDuration)||.095);
  const remaining=Math.max(0,Math.min(1,(Number(releaseRemaining)||0)/duration));
  const peak=Math.max(1,Number(shockMultiplier)||1);
  return 1+(peak-1)*Math.pow(remaining,1.65);
}

// Loaded highway tractors have very large low gears. The existing truck power
// model is correct once road speed rises, but its old low-speed acceleration cap
// made steep grades behave as if the engine had no crawler gearing. Keep wheel
// power unchanged and only restore the low-speed torque multiplication envelope.
export function truckLowSpeedTorqueScale(speedMps=0){
  const v=Math.max(0,Math.abs(Number(speedMps)||0));
  if(v>=12)return 1;
  const t=1-Math.max(0,Math.min(1,(v-4)/8));
  const smooth=t*t*(3-2*t);
  return 1+0.34*smooth;
}

export function createDrivingRuntime(args={}){
  const originalUpdateTransmission=args.updateTransmission;
  const originalLongitudinalTractionLimit=args.longitudinalTractionLimit;
  const originalSkidMarks=args.skidMarks;
  const originalVehicleVisuals=args.vehicleVisuals;
  const originalTruckTrailerSystem=args.truckTrailerSystem;
  const originalSetState=args.setState;
  if(typeof originalUpdateTransmission!=='function')return createBaseDrivingRuntime(args);

  let clutchWasHeld=false,clutchReleaseTimer=0,clutchShockMultiplier=1,clutchShockDuration=.095;
  let activeReleaseMultiplier=1,frameDt=1/60,requestedEngineThrottle=0;
  const wheelspinState=createWheelspinState();

  const lightingState=()=>{
    const bridge=readTransmissionRuntimeState();
    return {
      braking:(Number(bridge?.serviceBrake)||0)>.04,
      reversing:Number(bridge?.selectorGear)===-1
    };
  };

  const vehicleVisualsWithAuthoritativeBrake=originalVehicleVisuals?{
    ...originalVehicleVisuals,
    updateBrakeLights(dt){
      return originalVehicleVisuals.updateBrakeLights?.(dt,lightingState().braking);
    }
  }:originalVehicleVisuals;

  const truckTrailerWithAuthoritativeBrake=originalTruckTrailerSystem?{
    ...originalTruckTrailerSystem,
    setBrakeLights(){
      return originalTruckTrailerSystem.setBrakeLights?.(lightingState().braking);
    },
    driveAccelScaleForSpeed(speedAbs=0){
      const base=typeof originalTruckTrailerSystem.driveAccelScaleForSpeed==='function'
        ?Number(originalTruckTrailerSystem.driveAccelScaleForSpeed(speedAbs))||0
        :1;
      if(args.getVehicleId?.()!=='semi_6x4')return base;
      return base*truckLowSpeedTorqueScale(speedAbs);
    }
  }:originalTruckTrailerSystem;

  const setStateWithAuthoritativeLights=typeof originalSetState==='function'
    ?state=>{
      const lights=lightingState();
      const residualSpeed=Math.abs(Number(state?.speed)||0);
      const holdStopped=lights.braking&&residualSpeed<.18;
      return originalSetState({
        ...state,
        ...(holdStopped?{
          speed:0,
          longitudinalAccel:0,
          velocityHeading:Number.isFinite(Number(state?.heading))?Number(state.heading):state?.velocityHeading,
          dynamicYawRate:0
        }:null),
        countachBrakeLightRequested:lights.braking,
        countachReverseLightRequested:lights.reversing
      });
    }
    :originalSetState;

  const updateTransmissionWithBodySpeed=(dt,legacySignedInput,onPavement=true,automaticOverride=false)=>{
    frameDt=Math.max(.001,Math.min(.05,Number(dt)||1/60));
    const state=typeof args.getState==='function'?args.getState():null;
    const bodySpeed=bodyRelativeLongitudinalSpeed(state||{});
    const flags=typeof args.getFlags==='function'?args.getFlags():{};
    const menuOpen=!!flags?.menuOpen;
    const autopilot=!!flags?.autopilot;
    const profile=typeof args.activeTransmissionProfile==='function'?args.activeTransmissionProfile():null;
    const combustion=profile?.type==='combustion';

    let engineThrottle=0;
    let serviceBrake=0;
    if(autopilot){
      engineThrottle=Math.max(0,Number(legacySignedInput)||0);
      serviceBrake=Math.max(0,-(Number(legacySignedInput)||0));
    }else if(!menuOpen){
      const keyboardGas=args.keyboardActionDown?.('accelerate')?1:0;
      const keyboardBrake=args.keyboardActionDown?.('brake')?1:0;
      const padGas=args.gamepadState?.connected?Math.max(0,Number(args.gamepadState.throttle)||0):0;
      const padBrake=args.gamepadState?.connected?Math.max(0,Number(args.gamepadState.brake)||0):0;
      engineThrottle=Math.max(keyboardGas,padGas);
      serviceBrake=Math.max(keyboardBrake,padBrake);
    }
    requestedEngineThrottle=engineThrottle;

    const keyboardClutch=!!args.keyboardActionDown?.('clutch');
    const gamepadClutch=!!args.gamepadState?.clutch;
    const stationaryBrakeClutch=combustion&&shouldAutoClutchForServiceBrake({
      serviceBrake,
      speed:Number(state?.speed)||0
    });
    const clutchHeld=combustion&&(keyboardClutch||gamepadClutch||stationaryBrakeClutch);

    publishTransmissionRuntimeState({bodyLongitudinalSpeed:bodySpeed,clutchHeld,engineThrottle,serviceBrake});

    const baseThrottle=originalUpdateTransmission(
      dt,engineThrottle,onPavement,automaticOverride,bodySpeed,clutchHeld
    );

    activeReleaseMultiplier=1;

    // Grip R9 — keep serviceBrake independent all the way into the
    // chassis. Do not convert it back into positive/negative engine throttle.
    if(serviceBrake>.04&&combustion&&clutchHeld){
      clutchWasHeld=true;
      clutchReleaseTimer=0;
      clutchShockMultiplier=1;
    }

    if(!combustion){
      clutchWasHeld=false;clutchReleaseTimer=0;clutchShockMultiplier=1;wheelspinState.reset();
      return baseThrottle;
    }

    if(clutchHeld){
      clutchWasHeld=true;clutchReleaseTimer=0;clutchShockMultiplier=1;wheelspinState.reset();
      return 0;
    }

    if(clutchWasHeld){
      clutchWasHeld=false;
      clutchShockDuration=clutchShockDurationSec(profile,args.getVehicleId?.()||'');
      clutchReleaseTimer=clutchShockDuration;
      clutchShockMultiplier=consumeClutchShockMultiplier();
    }

    if(clutchReleaseTimer>0){
      const multiplier=semiAutoClutchReleaseMultiplier({releaseRemaining:clutchReleaseTimer,releaseDuration:clutchShockDuration,shockMultiplier:clutchShockMultiplier});
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

    const drivetrain=String(tractionArgs?.vehicle?.drivetrain||'AWD');
    const vehicleClass=String(tractionArgs?.vehicle?.vehicleClass||'passenger');
    const wheelspin=wheelspinState.advance({
      dt:frameDt,
      releaseMultiplier:activeReleaseMultiplier,
      engineThrottle:requestedEngineThrottle,
      tractionResult:result,
      drivetrain,
      vehicleClass
    });

    if(wheelspin.level>.01&&result&&Number.isFinite(Number(result.acceleration))){
      const factor=wheelspin.gripFactor;
      const staticAcceleration=Number(result.staticTractionAcceleration);
      if(Number.isFinite(staticAcceleration))result.acceleration=Math.sign(result.acceleration||1)*Math.min(Math.abs(result.acceleration),Math.abs(staticAcceleration)*factor);
      else result.acceleration*=factor;
      result.runtimeWheelspinLevel=wheelspin.level;
      result.runtimeSlidingGripFactor=factor;
    }
    if(typeof globalThis!=='undefined')globalThis.WorldDriveRuntimeWheelspin={
      level:wheelspin.level,
      holdSec:wheelspin.holdSec,
      drivetrain,
      wheels:wheelspin.wheels
    };
    return result;
  };

  const skidMarksWithWheelspin=originalSkidMarks&&typeof originalSkidMarks.updateLocal==='function'?{
    updateLocal(input={}){
      const drivetrain=String(args.VEHICLE?.drivetrain||'AWD');
      const synthetic=drivenWheelSlipLevels(drivetrain,wheelspinState.level);
      const levels=Array.isArray(input.wheelSlipLevels)?input.wheelSlipLevels.slice():[0,0,0,0];
      const longitudinal=Array.isArray(input.wheelLongitudinalUsage)?input.wheelLongitudinalUsage.slice():[0,0,0,0];
      const grip=Array.isArray(input.wheelGripUsage)?input.wheelGripUsage.slice():[0,0,0,0];
      for(let i=0;i<4;i++)if((synthetic[i]||0)>0){levels[i]=Math.max(Number(levels[i])||0,synthetic[i]);longitudinal[i]=Math.max(Number(longitudinal[i])||0,1.18+synthetic[i]*.62);grip[i]=Math.max(Number(grip[i])||0,1.08+synthetic[i]*.50);}
      return originalSkidMarks.updateLocal({...input,wheelSlipLevels:levels,wheelLongitudinalUsage:longitudinal,wheelGripUsage:grip,longitudinalAccel:wheelspinState.level>.05?Math.max(.25,Number(input.longitudinalAccel)||0):input.longitudinalAccel});
    }
  }:originalSkidMarks;

  const runtime=createBaseDrivingRuntime({
    ...args,
    setState:setStateWithAuthoritativeLights,
    updateTransmission:updateTransmissionWithBodySpeed,
    getServiceBrakeInput:()=>Math.max(0,Math.min(1,Number(readTransmissionRuntimeState()?.serviceBrake)||0)),
    longitudinalTractionLimit:longitudinalTractionWithPersistentWheelspin,
    skidMarks:skidMarksWithWheelspin||args.skidMarks,
    vehicleVisuals:vehicleVisualsWithAuthoritativeBrake,
    truckTrailerSystem:truckTrailerWithAuthoritativeBrake
  });

  // Traffic R1 runs strictly after the player's authoritative frame. The civil
  // cars are presentation-only and therefore cannot perturb traction, steering,
  // braking, crest launches, landings or multiplayer state.
  const civilTraffic=createCivilTrafficSystem({
    car:args.car,
    getState:args.getState,
    getRouteLength:args.getRouteLength,
    getWorldOffset:args.getWorldOffset,
    nearestRouteForVehicle:args.nearestRouteForVehicle,
    roadProfileFrameAtCum:args.roadProfileFrameAtCum,
    getHeadlightLevel:()=>Number(originalVehicleVisuals?.headlightLevel)||0
  });

  return Object.freeze({
    ...runtime,
    update(dt){
      const result=runtime.update(dt);
      civilTraffic.update(dt);
      return result;
    },
    traffic:civilTraffic
  });
}
