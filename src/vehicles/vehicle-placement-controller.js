export function createVehiclePlacementController({
  state,
  VEHICLE,
  routePointAt,
  nearestRoute,
  resetTransmissionState,
  vehiclePresentation,
  skidMarks,
  recenterIfNeeded,
  ensureRoadProfileNear,
  roadProfileFrameAtCum,
  roadHeightAt,
  ROAD_SURFACE_OFFSET,
  TIRE_VISUAL_CLEARANCE,
  car,
  truckTrailerSystem,
  drawMap,
  DRIVE_HUD_INTERVAL,
  MINIMAP_INTERVAL,
  GRIP_SOLVER_INTERVAL,
}){
  let lastPlacementCum=null;

  function physicsWheelCount(){
    return Math.max(
      4,
      (VEHICLE.axles||[]).reduce(
        (sum,axle)=>sum+(Number(axle.wheelCount)||0),
        0
      )
    );
  }

  function finite(value){
    return Number.isFinite(Number(value));
  }

  function angleDelta(a,b){
    return Math.atan2(Math.sin(a-b),Math.cos(a-b));
  }

  // V21.31 P3.5 — the geographic route start can sit directly on a crest,
  // switchback hinge or severe grade break. For the initial spawn only, search
  // a short distance forward for a calmer engineered-road section instead of
  // forcing a large artificial platform at cumulative distance zero.
  function stableDepartureCum(){
    let bestCum=0;
    let bestScore=Infinity;

    for(let cum=35;cum<=140;cum+=5){
      const center=roadProfileFrameAtCum(cum);
      const before=roadProfileFrameAtCum(Math.max(0,cum-12));
      const after=roadProfileFrameAtCum(cum+12);
      if(!center||!before||!after)continue;
      if(
        !finite(center.px)||!finite(center.pz)||!finite(center.y)||
        !finite(center.pitch)||!finite(center.angle)||
        !finite(before.pitch)||!finite(after.pitch)||
        !finite(before.angle)||!finite(after.angle)
      )continue;

      const grade=Math.abs(Number(center.pitch));
      const gradeChange=Math.abs(Number(after.pitch)-Number(before.pitch));
      const turn=Math.abs(angleDelta(Number(after.angle),Number(before.angle)));

      // Prefer a nearly constant grade and a modestly straight section. A road
      // does not need to be horizontal; it only needs to avoid an abrupt crest
      // or hinge directly under the spawned vehicle.
      const score=
        grade*1.0+
        gradeChange*3.2+
        turn*1.4+
        cum*0.0008;

      if(score<bestScore){
        bestScore=score;
        bestCum=cum;
      }

      // First clearly good candidate wins so we do not move the user farther
      // down the route than necessary.
      if(
        grade<6*Math.PI/180 &&
        gradeChange<2.5*Math.PI/180 &&
        turn<10*Math.PI/180
      ){
        return cum;
      }
    }

    return bestCum;
  }

  function resetVehicleDynamics({resetGripSolver=false}={}){
    state.speed=0;
    state.steer=0;
    state.visualSteer=0;
    state.currentSteerAngle=0;
    state.driveHudAccumulator=DRIVE_HUD_INTERVAL;
    state.minimapAccumulator=MINIMAP_INTERVAL;
    if(resetGripSolver){
      state.gripSolverAccumulator=GRIP_SOLVER_INTERVAL;
    }
    state.longitudinalAccel=0;
    state.lateralGripUsage=0;

    const wheelCount=physicsWheelCount();
    state.wheelGripUsage=Array(wheelCount).fill(0);
    state.wheelSlipLevels=Array(wheelCount).fill(0);
    state.wheelLateralUsage=Array(wheelCount).fill(0);
    state.wheelLongitudinalUsage=Array(wheelCount).fill(0);

    state.frontSlipAmount=0;
    state.rearSlipAmount=0;
    state.dynamicYawRate=0;
    state.velocityHeading=state.heading;

    resetTransmissionState();
    vehiclePresentation.reset();
    skidMarks.resetSource('local');

    state.roadContact=true;
    recenterIfNeeded(state.absX,state.absZ,true);
    ensureRoadProfileNear(state.absX,state.absZ);
  }

  function resetTrailerPose(){
    if(truckTrailerSystem.active){
      truckTrailerSystem.resetPose(
        state.absX,
        state.absZ,
        state.heading
      );
    }
  }

  function placeAt(frac,options={}){
    const finalizeOnly=options?.finalizeOnly===true;
    const requestedFrac=Math.max(0,Math.min(1,Number(frac)||0));
    const p=routePointAt(requestedFrac);
    if(!p||!finite(p.x)||!finite(p.z)||!finite(p.angle)){
      throw new Error('Route placement returned non-finite coordinates');
    }

    if(!finalizeOnly){
      state.absX=Number(p.x);
      state.absZ=Number(p.z);
      state.heading=Number(p.angle);

      // Preserve historical ordering: recenter/profile refresh occurs from the
      // route-point placement before the cumulative road-profile correction.
      resetVehicleDynamics({resetGripSolver:false});
    }

    const hasStoredPlacement=lastPlacementCum!==null&&finite(lastPlacementCum);
    const targetCum=finalizeOnly&&hasStoredPlacement
      ?Number(lastPlacementCum)
      :requestedFrac<=1e-6
        ?stableDepartureCum()
        :p.cum;

    if(!finalizeOnly)lastPlacementCum=targetCum;

    // On stacked mountain roads, horizontal X/Z can overlap multiple branches.
    // roadProfileFrameAtCum() exposes the interpolated centreline as px/pz.
    const placedFrame=roadProfileFrameAtCum(targetCum);
    const frameX=placedFrame?.px;
    const frameZ=placedFrame?.pz;
    const frameAngle=placedFrame?.angle;
    const validPlacedFrame=
      finite(frameX)&&
      finite(frameZ)&&
      finite(frameAngle)&&
      finite(placedFrame?.y);

    if(validPlacedFrame){
      state.absX=Number(frameX);
      state.absZ=Number(frameZ);
      state.heading=Number(frameAngle);
      state.velocityHeading=state.heading;
    }

    const roadY=validPlacedFrame
      ?Number(placedFrame.y)
      :roadHeightAt(state.absX,state.absZ);
    const safeRoadY=finite(roadY)?Number(roadY):0;
    const placedY=safeRoadY+ROAD_SURFACE_OFFSET;

    car.position.set(
      state.absX-state.worldOffset.x,
      placedY+.38+TIRE_VISUAL_CLEARANCE,
      state.absZ-state.worldOffset.z
    );

    resetTrailerPose();
    if(!finalizeOnly)drawMap(targetCum);
  }

  function resetToRoad(){
    const n=nearestRoute(state.absX,state.absZ);
    if(!n||!finite(n.px)||!finite(n.pz)||!finite(n.angle))return;

    state.absX=Number(n.px);
    state.absZ=Number(n.pz);
    state.heading=Number(n.angle);

    // Historical reset-to-road behavior also forces the secondary tire solver
    // to run again immediately; placeAt() intentionally does not do this.
    resetVehicleDynamics({resetGripSolver:true});
    resetTrailerPose();
  }

  return {
    placeAt,
    resetToRoad,
    resetVehicleDynamics
  };
}