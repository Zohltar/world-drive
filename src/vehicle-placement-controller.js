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

  function placeAt(frac){
    const p=routePointAt(frac);
    if(!p||!finite(p.x)||!finite(p.z)||!finite(p.angle)){
      throw new Error('Route placement returned non-finite coordinates');
    }

    state.absX=Number(p.x);
    state.absZ=Number(p.z);
    state.heading=Number(p.angle);

    // Preserve historical ordering: recenter/profile refresh occurs from the
    // route-point placement before the cumulative road-profile correction.
    resetVehicleDynamics({resetGripSolver:false});

    // On stacked mountain roads, horizontal X/Z can overlap multiple branches.
    // roadProfileFrameAtCum() exposes the interpolated centreline as px/pz.
    // Older placement code incorrectly read x/z here, poisoning absX/absZ with
    // undefined once the engineered profile became available during startup.
    const placedFrame=roadProfileFrameAtCum(p.cum);
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
    drawMap(p.cum);
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
