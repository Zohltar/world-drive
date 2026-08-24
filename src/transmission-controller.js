export function createTransmissionController({
  vehicleSystem,
  VEHICLE,
  computeGearRedlineSpeeds,
  computeTransmissionState,
  physicsClamp,
  physicsSmoothstep01,
  toast,
  getSpeed,
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
  
    const current=
      Math.max(
        1,
        Number(state.transmissionGear)||1
      );
  
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
  
    const gear=
      Math.max(
        1,
        Math.min(
          points.length,
          Number(currentGear)||1
        )
      );
  
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
  
    if(profile.type!=='combustion'){
      state.transmissionGear=getSpeed()<-.25?-1:0;
      state.transmissionPendingGear=state.transmissionGear;
      state.transmissionShiftTimer=0;
      state.transmissionShiftDuration=0;
      state.transmissionShifting=false;
      state.revLimiterActive=false;
      state.revLimiterPhase=0;
      state.engineRpm=0;
      return requestedThrottle;
    }
  
    const idle=Number(profile.idleRpm)||850;
    const redline=Number(profile.redlineRpm)||6500;
  
    const effectiveRedline=
      effectiveEngineRedlineRpm(
        profile,
        onPavement
      );
  
    const kmh=Math.abs(getSpeed())*3.6;

    const automaticShiftMode=
      automaticOverride||
      state.transmissionMode==='automatic';
  
    if(getSpeed()<-.25){
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
