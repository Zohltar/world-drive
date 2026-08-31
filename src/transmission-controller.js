import {
  readTransmissionRuntimeState,
  resetTransmissionRuntimeState,
  publishClutchShockMultiplier,
  publishTransmissionSelectorGear
} from './transmission-runtime-bridge.js';
import {publishTransmissionNetworkGear} from './transmission-network-state.js';
import {ensureWorldDriveDiagnostics} from './diagnostics.js';

function createTransmissionCore({
  vehicleSystem,
  VEHICLE,
  computeGearRedlineSpeeds,
  computeTransmissionState,
  physicsClamp,
  physicsSmoothstep01,
  toast,
  getSpeed,
  getSelector=()=>1,
  getLongitudinalAccel,
  vehicleReverseLimitMps,
  state,
}){
  function activeTransmissionProfile(){
    return vehicleSystem.active.audio||{type:'ev',profile:'ev'};
  }

  // For combustion vehicles, the last shift point is the road getSpeed() at which
  // highest gear reaches engine redline. That is the mechanical maximum getSpeed().
  function effectiveEngineRedlineRpm(
    profile=activeTransmissionProfile(),
    onPavement=true
  ){
    const nominal=
      Math.max(
        1000,
        Number(profile.redlineRpm)||6500
      );

    // V20.6: loose terrain represents much higher drivetrain/load resistance.
    // Combustion engines effectively lose the upper 30% of their usable RPM.
    return onPavement
      ?nominal
      :nominal*.70;
  }

  function transmissionRedlineSpeedKmh(
    profile=activeTransmissionProfile(),
    effectiveRedlineRpm=null
  ){
    if(profile.type!=='combustion'){
      return Math.max(
        20,
        Number(VEHICLE.topSpeedKmh)||200
      );
    }

    const speeds=
      computeGearRedlineSpeeds(
        profile,
        effectiveRedlineRpm||
        Number(profile.redlineRpm)||
        6500
      );

    return Math.max(
      20,
      Number(
        speeds[
          speeds.length-1
        ]
      )||20
    );
  }

  function resetTransmissionState(){
    const profile=activeTransmissionProfile();

    state.transmissionGear=1;
    state.transmissionPendingGear=1;
    state.transmissionShiftTimer=0;
    state.transmissionShiftDuration=0;
    state.transmissionShiftStartRpm=0;
    state.transmissionShiftEndRpm=0;
    state.transmissionShifting=false;
    state.revLimiterActive=false;
    state.revLimiterPhase=0;
    state.manualShiftRequest=null;

    state.transmissionProfileKey=
      `${vehicleSystem.activeId}:${profile.profile||profile.type||''}`;

    state.engineRpm=
      profile.type==='combustion'
        ?Number(profile.idleRpm)||850
        :0;
  }

  function requestManualShift(direction){
    if(state.transmissionMode!=='manual'){
      return;
    }

    const profile=
      activeTransmissionProfile();

    if(
      profile.type!=='combustion'||
      getSpeed()<-.25||
      state.transmissionShifting||
      state.transmissionShiftTimer>0
    ){
      return;
    }

    const gearCount=
      Array.isArray(profile.gearRatios)&&
      profile.gearRatios.length
        ?profile.gearRatios.length
        :Math.max(
           1,
           Number(profile.gearCount)||1
         );

    const current=normalizeForwardGear(state.transmissionGear,gearCount);

    const target=
      Math.max(
        1,
        Math.min(
          gearCount,
          current+
          (
            direction>0
              ?1
              :-1
          )
        )
      );

    if(target===current){
      return;
    }

    state.manualShiftRequest=target;
  }

  function desiredTransmissionGear(
    kmh,
    profile,
    currentGear,
    effectiveRedlineRpm
  ){
    const points=
      computeGearRedlineSpeeds(
        profile,
        effectiveRedlineRpm
      );

    if(!points.length){
      return 1;
    }

    const gear=normalizeForwardGear(currentGear,points.length);

    if(
      gear<points.length&&
      kmh>=points[gear-1]
    ){
      return gear+1;
    }

    if(
      gear>1&&
      kmh<
        points[gear-2]*
        .82
    ){
      return gear-1;
    }

    return gear;
  }

  function updateTransmission(dt,requestedThrottle,onPavement=true,automaticOverride=false){
    const profile=activeTransmissionProfile();
    const profileKey=
      `${vehicleSystem.activeId}:${profile.profile||profile.type||''}`;

    if(profileKey!==state.transmissionProfileKey){
      resetTransmissionState();
    }

    const selector=normalizeTransmissionSelector(getSelector());

    if(profile.type!=='combustion'){
      // C2: EV selector state is explicit too. 0 now means Neutral only; D is 1.
      state.transmissionGear=selector;
      state.transmissionPendingGear=selector;
      state.transmissionShiftTimer=0;
      state.transmissionShiftDuration=0;
      state.transmissionShifting=false;
      state.revLimiterActive=false;
      state.revLimiterPhase=0;
      state.engineRpm=0;
      return selector===0?0:requestedThrottle;
    }

    const idle=Number(profile.idleRpm)||850;
    const redline=Number(profile.redlineRpm)||6500;

    const effectiveRedline=
      effectiveEngineRedlineRpm(
        profile,
        onPavement
      );

    if(selector===0){
      // C2: Neutral is a first-class controller state. It never enters the
      // forward gearbox and therefore cannot be coerced to first gear by a
      // Number(x)||1 fallback. Free-rev ownership remains in the public layer.
      state.transmissionGear=0;
      state.transmissionPendingGear=0;
      state.transmissionShiftTimer=0;
      state.transmissionShiftDuration=0;
      state.transmissionShifting=false;
      state.manualShiftRequest=null;
      state.revLimiterActive=false;
      state.revLimiterPhase=0;
      state.engineRpm=idle;
      return 0;
    }

    const kmh=Math.abs(getSpeed())*3.6;

    const automaticShiftMode=
      automaticOverride||
      state.transmissionMode==='automatic';

    if(selector<0){
      state.transmissionGear=-1;
      state.transmissionPendingGear=-1;
      state.transmissionShiftTimer=0;
      state.transmissionShiftDuration=0;
      state.transmissionShifting=false;
      state.revLimiterActive=false;
      state.revLimiterPhase=0;

      const reverseRatio=
        physicsClamp(
          Math.abs(getSpeed())/Math.max(1,Math.abs(vehicleReverseLimitMps())),
          0,
          1
        );

      state.engineRpm=
        idle+(redline*.62-idle)*reverseRatio;

      return requestedThrottle;
    }

    if(state.transmissionGear<1){
      state.transmissionGear=1;
      state.transmissionPendingGear=1;
    }

    if(state.transmissionShiftTimer>0){
      state.revLimiterActive=false;
      state.revLimiterPhase=0;

      state.transmissionShiftTimer=
        Math.max(0,state.transmissionShiftTimer-dt);

      const progress=
        state.transmissionShiftDuration>0
          ?1-state.transmissionShiftTimer/state.transmissionShiftDuration
          :1;

      state.engineRpm=
        state.transmissionShiftStartRpm+
        (state.transmissionShiftEndRpm-state.transmissionShiftStartRpm)*
        physicsSmoothstep01(progress);

      state.transmissionShifting=
        state.transmissionShiftTimer>0;

      if(!state.transmissionShifting){
        state.transmissionGear=state.transmissionPendingGear;
        state.engineRpm=
          computeTransmissionState(
            kmh,
            0,
            profile,
            state.transmissionGear
          ).rpm;
      }

      return requestedThrottle>0&&state.transmissionShifting
        ?0
        :requestedThrottle;
    }

    if(automaticOverride){
      // Autopilot owns the drivetrain while active. Ignore any queued manual
      // request without changing the player's selected transmission mode.
      state.manualShiftRequest=null;
    }

    let desiredGear=
      state.transmissionGear;

    if(automaticShiftMode){
      desiredGear=
        desiredTransmissionGear(
          kmh,
          profile,
          state.transmissionGear,
          effectiveRedline
        );
    }else if(state.manualShiftRequest!==null){
      const requestedGear=
        Math.max(
          1,
          Math.min(
            Array.isArray(profile.gearRatios)&&
            profile.gearRatios.length
              ?profile.gearRatios.length
              :Math.max(
                 1,
                 Number(profile.gearCount)||1
               ),
            Number(state.manualShiftRequest)||1
          )
        );

      state.manualShiftRequest=null;

      // Protect the engine from a mechanically impossible downshift.
      // A real manual box can be abused into an over-rev, but for World Drive
      // we reject the shift rather than creating an engine-damage subsystem.
      if(requestedGear<state.transmissionGear){
        const requestedState=
          computeTransmissionState(
            kmh,
            0,
            profile,
            requestedGear
          );

        if(
          requestedState.mechanicalRpm>
          effectiveRedline*
          1.035
        ){
          toast(
            'Rétrogradage refusé · régime trop élevé'
          );

          desiredGear=
            state.transmissionGear;
        }else{
          desiredGear=
            requestedGear;
        }
      }else{
        desiredGear=
          requestedGear;
      }
    }

    if(desiredGear!==state.transmissionGear){
      state.transmissionPendingGear=desiredGear;
      state.manualShiftRequest=null;

      const upshift=desiredGear>state.transmissionGear;

      state.transmissionShiftDuration=
        Math.max(
          .045,
          Number(
            upshift
              ?profile.shiftDuration
              :profile.downshiftDuration
          )||
          (upshift?.18:.15)
        );

      state.transmissionShiftTimer=state.transmissionShiftDuration;

      state.transmissionShiftStartRpm=
        computeTransmissionState(
          kmh,
          0,
          profile,
          state.transmissionGear
        ).rpm;

      state.transmissionShiftEndRpm=
        computeTransmissionState(
          kmh,
          0,
          profile,
          desiredGear
        ).rpm;

      state.transmissionShifting=true;
      state.revLimiterActive=false;
      state.revLimiterPhase=0;
      state.engineRpm=state.transmissionShiftStartRpm;

      return requestedThrottle>0
        ?0
        :requestedThrottle;
    }

    state.transmissionShifting=false;

    const load=
      physicsClamp(
        Math.abs(getLongitudinalAccel())/7.5,
        0,
        1
      );

    const steadyTransmission=
      computeTransmissionState(
        kmh,
        load,
        profile,
        state.transmissionGear
      );

    state.engineRpm=
      steadyTransmission.rpm;

    const gearCount=
      Array.isArray(profile.gearRatios)&&
      profile.gearRatios.length
        ?profile.gearRatios.length
        :Math.max(
           1,
           Number(profile.gearCount)||1
         );

    const topGear=
      state.transmissionGear>=gearCount;

    const redlineSpeedKmh=
      transmissionRedlineSpeedKmh(
        profile,
        effectiveRedline
      );

    const mechanicalState=
      computeTransmissionState(
        kmh,
        load,
        profile,
        state.transmissionGear
      );

    const limiterAllowed=
      automaticShiftMode
        ?topGear
        :state.transmissionGear>=1;

    const touchingLimiter=
      limiterAllowed&&
      requestedThrottle>.05&&
      (
        (
          topGear&&
          kmh>=redlineSpeedKmh*.994
        )||
        mechanicalState.mechanicalRpm>=
          effectiveRedline*.994
      );

    if(touchingLimiter){
      state.revLimiterActive=true;

      const limiterHz=
        Math.max(
          6,
          Number(profile.revLimiterHz)||12
        );

      const limiterDropRpm=
        Math.max(
          100,
          Number(profile.revLimiterDropRpm)||
          Math.min(
            300,
            redline*.035
          )
        );

      state.revLimiterPhase+=
        dt*
        Math.PI*
        2*
        limiterHz;

      if(state.revLimiterPhase>Math.PI*2*100){
        state.revLimiterPhase%=Math.PI*2;
      }

      // Needle + audio bounce under the actual redline.
      const bounce=
        .5+
        .5*
        Math.sin(state.revLimiterPhase);

      const effectiveDrop=
        limiterDropRpm*
        (
          effectiveRedline/
          redline
        );

      state.engineRpm=
        effectiveRedline-
        effectiveDrop*
        (
          .18+
          bounce*.82
        );

      state.engineRpm=
        Math.max(
          idle,
          Math.min(
            effectiveRedline,
            state.engineRpm
          )
        );

      // Fuel/ignition-cut style torque pulse.
      const powerPulse=
        Math.sin(state.revLimiterPhase)<-.12;

      return powerPulse
        ?requestedThrottle
        :0;
    }

    state.revLimiterActive=false;
    state.revLimiterPhase=0;

    if(!onPavement){
      state.engineRpm=
        Math.min(
          state.engineRpm,
          effectiveRedline
        );
    }

    return requestedThrottle;
  }

  return {
    activeTransmissionProfile,
    effectiveEngineRedlineRpm,
    transmissionRedlineSpeedKmh,
    resetTransmissionState,
    requestManualShift,
    desiredTransmissionGear,
    updateTransmission
  };
}


function normalizeTransmissionSelector(value){
  const n=Number(value);
  return n<0?-1:n===0?0:1;
}

function normalizeForwardGear(value,maxGear=Infinity){
  const n=Number(value);
  const forward=Number.isFinite(n)&&n>=1?Math.floor(n):1;
  const max=Number.isFinite(maxGear)?Math.max(1,Math.floor(maxGear)):Infinity;
  return Math.min(max,forward);
}

function clamp01(value){return Math.max(0,Math.min(1,Number(value)||0));}

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

export function advanceFreeRevRpm({currentRpm=850,idleRpm=850,redlineRpm=6500,throttle=0,dt=0,riseTimeSec=1.5}={}){
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
    return Math.min(target,current+nominalRate*1.18*highRpmTaper*pedalAuthority*stepDt);
  }
  const fallTime=Math.max(.55,(Number(riseTimeSec)||1.5)*.78);
  return Math.max(target,current-(span/fallTime)*stepDt);
}

export function clutchShockMultiplierFromMismatch({freeRpm=0,coupledRpm=0,idleRpm=850,redlineRpm=6500,throttle=0,opposingTravel=false,gain=2.65,travelBonus=.42,maxMultiplier=3.6}={}){
  const idle=Math.max(400,Number(idleRpm)||850);
  const redline=Math.max(idle+500,Number(redlineRpm)||6500);
  const span=Math.max(500,redline-idle);
  const mismatch=clamp01(Math.abs((Number(freeRpm)||0)-(Number(coupledRpm)||0))/span);
  const pedal=clamp01(Math.max(0,Number(throttle)||0));
  if(pedal<.08||mismatch<.025)return 1;
  return Math.min(Math.max(1,Number(maxMultiplier)||1),1+pedal*(.18+Math.max(0,Number(gain)||0)*mismatch+(opposingTravel?Math.max(0,Number(travelBonus)||0):0)));
}

function publishEngineInput(diagnostics,{throttle=0,clutchHeld=false}={}){
  if(!diagnostics)return;
  diagnostics.engineInput={throttle:clamp01(Math.max(0,Number(throttle)||0)),clutchHeld:!!clutchHeld};
}

export function createTransmissionController(args={}){
  const rawGetSpeed=typeof args.getSpeed==='function'?args.getSpeed:()=>0;
  const engineInputDiagnostics=typeof window==='undefined'?null:ensureWorldDriveDiagnostics().physics;
  let bodyLongitudinalSpeed=NaN;
  let selector=1; // 1=D/forward, 0=N, -1=R
  let lastProfileKey='';
  let freeRevRpm=NaN;
  let clutchWasHeld=false;

  const transmissionSpeed=()=>{
    const raw=Number.isFinite(bodyLongitudinalSpeed)?bodyLongitudinalSpeed:Number(rawGetSpeed())||0;
    if(selector===0)return 0;
    return selector<0?-Math.abs(raw):Math.abs(raw);
  };

  const core=createTransmissionCore({...args,getSpeed:transmissionSpeed,getSelector:()=>selector});
  const coreUpdateTransmission=core.updateTransmission;
  const coreResetTransmissionState=core.resetTransmissionState;
  const coreRequestManualShift=core.requestManualShift;

  function activeProfileKey(){
    const profile=core.activeTransmissionProfile();
    return `${args.vehicleSystem?.activeId||'unknown'}:${profile?.profile||profile?.type||''}`;
  }

  function publishAuthoritativeGear(){
    publishTransmissionSelectorGear(selector);
    // M4.5/C2: publish the exact gear already owned by this controller. This
    // function observes state; it never repairs or rewrites D/N/R semantics.
    publishTransmissionNetworkGear(args.state.transmissionGear);
  }

  function applySelectorState(){
    if(selector<0){args.state.transmissionGear=-1;args.state.transmissionPendingGear=-1;}
    else if(selector===0){args.state.transmissionGear=0;args.state.transmissionPendingGear=0;}
    else if((Number(args.state.transmissionGear)||0)<1){args.state.transmissionGear=1;args.state.transmissionPendingGear=1;}
    publishAuthoritativeGear();
  }

  function resetTransmissionState(){
    selector=1;bodyLongitudinalSpeed=NaN;freeRevRpm=NaN;clutchWasHeld=false;
    lastProfileKey=activeProfileKey();
    resetTransmissionRuntimeState();
    publishEngineInput(engineInputDiagnostics,{throttle:0,clutchHeld:false});
    const result=coreResetTransmissionState();
    applySelectorState();
    return result;
  }

  function requestManualShift(direction){
    const dir=direction>0?1:-1;
    const physical=Number.isFinite(bodyLongitudinalSpeed)?bodyLongitudinalSpeed:Number(rawGetSpeed())||0;

    if(selector<0){
      if(dir>0){selector=0;applySelectorState();}
      return;
    }
    if(selector===0){
      if(dir<0){
        if(Math.abs(physical)>.8){args.toast?.('Marche arrière refusée · véhicule en mouvement');return;}
        selector=-1;
      }else selector=1;
      applySelectorState();
      return;
    }

    const mode=args.state?.transmissionMode;
    const current=normalizeForwardGear(args.state?.transmissionGear);
    if(dir<0&&current<=1){
      selector=0;
      applySelectorState();
      return;
    }
    if(mode==='manual')coreRequestManualShift(dir);
  }

  return {
    ...core,
    resetTransmissionState,
    requestManualShift,
    updateTransmission(dt,requestedThrottle,onPavement=true,automaticOverride=false,nextBodyLongitudinalSpeed=NaN,clutchHeld=undefined){
      const bridged=readTransmissionRuntimeState();
      const explicitBody=Number(nextBodyLongitudinalSpeed);
      const bridgeBody=Number(bridged?.bodyLongitudinalSpeed);
      bodyLongitudinalSpeed=Number.isFinite(explicitBody)?explicitBody:(Number.isFinite(bridgeBody)?bridgeBody:NaN);

      const profileKey=activeProfileKey();
      if(profileKey!==lastProfileKey){selector=1;freeRevRpm=NaN;clutchWasHeld=false;lastProfileKey=profileKey;}

      const profileBefore=core.activeTransmissionProfile();
      const combustionBefore=profileBefore?.type==='combustion';
      const engineThrottle=clamp01(Number.isFinite(Number(bridged?.engineThrottle))?bridged.engineThrottle:requestedThrottle);
      const explicitClutch=typeof clutchHeld==='boolean'?clutchHeld:!!bridged?.clutchHeld;
      const effectiveClutch=combustionBefore&&(explicitClutch||selector===0);
      const physicalBody=Number.isFinite(bodyLongitudinalSpeed)?bodyLongitudinalSpeed:Number(rawGetSpeed())||0;

      if(combustionBefore&&effectiveClutch&&!clutchWasHeld){
        const idle=Math.max(500,Number(profileBefore.idleRpm)||850);
        freeRevRpm=Math.max(idle,Number(args.state?.engineRpm)||idle);
      }
      const freeRpmBeforeCoupling=freeRevRpm;

      const baseRequested=selector===0?0:engineThrottle;
      let transmitted=coreUpdateTransmission(dt,baseRequested,onPavement,automaticOverride);
      publishAuthoritativeGear();

      const profile=core.activeTransmissionProfile();
      const combustion=profile?.type==='combustion';
      publishEngineInput(engineInputDiagnostics,{throttle:combustion?engineThrottle:0,clutchHeld:effectiveClutch});

      if(combustion&&effectiveClutch){
        const idle=Math.max(500,Number(profile.idleRpm)||850);
        const redline=Math.max(idle+500,Number(profile.redlineRpm)||6500);
        if(!Number.isFinite(freeRevRpm))freeRevRpm=Math.max(idle,Number(args.state?.engineRpm)||idle);
        freeRevRpm=advanceFreeRevRpm({currentRpm:freeRevRpm,idleRpm:idle,redlineRpm:redline,throttle:engineThrottle,dt,riseTimeSec:freeRevRiseTimeSec(profile,args.vehicleSystem?.activeId||'')});
        args.state.engineRpm=freeRevRpm;
        args.state.revLimiterActive=engineThrottle>.96&&freeRevRpm>=redline*.982;
        if(!args.state.revLimiterActive)args.state.revLimiterPhase=0;
      }else{
        if(combustion&&clutchWasHeld&&Number.isFinite(freeRpmBeforeCoupling)){
          const idle=Math.max(500,Number(profile.idleRpm)||850);
          const redline=Math.max(idle+500,Number(profile.redlineRpm)||6500);
          const coupledRpm=Math.max(idle,Number(args.state?.engineRpm)||idle);
          const opposingTravel=(selector>0&&physicalBody<-.25)||(selector<0&&physicalBody>.25);
          const calibration=clutchShockCalibration(profile,args.vehicleSystem?.activeId||'');
          publishClutchShockMultiplier(clutchShockMultiplierFromMismatch({freeRpm:freeRpmBeforeCoupling,coupledRpm,idleRpm:idle,redlineRpm:redline,throttle:engineThrottle,opposingTravel,gain:calibration.gain,travelBonus:calibration.travelBonus,maxMultiplier:calibration.max}));
        }
        freeRevRpm=NaN;
      }

      clutchWasHeld=combustion&&effectiveClutch;
      if(selector===0)return 0;
      transmitted=Math.abs(Number(transmitted)||0);
      return selector<0?-transmitted:transmitted;
    },
    getTransmissionLongitudinalSpeed(){return transmissionSpeed();},
    getPhysicalBodyLongitudinalSpeed(){return Number.isFinite(bodyLongitudinalSpeed)?bodyLongitudinalSpeed:Number(rawGetSpeed())||0;},
    getTransmissionDriveDirection(){return selector;},
    getTransmissionSelector(){return selector;}
  };
}
