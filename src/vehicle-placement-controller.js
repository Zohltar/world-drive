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
    state.absX=p.x;
    state.absZ=p.z;
    state.heading=p.angle;

    // Preserve historical ordering: recenter/profile refresh occurs from the
    // route-point placement before the cumulative road-profile correction.
    resetVehicleDynamics({resetGripSolver:false});

    // On stacked mountain roads, horizontal X/Z can overlap multiple branches.
    // Spawn from route cumulative distance so 0% remains the true first segment.
    const placedFrame=roadProfileFrameAtCum(p.cum);
    if(placedFrame){
      state.absX=placedFrame.x;
      state.absZ=placedFrame.z;
      state.heading=placedFrame.angle;
      state.velocityHeading=state.heading;
    }

    const placedY=
      (placedFrame?.y??roadHeightAt(state.absX,state.absZ))+
      ROAD_SURFACE_OFFSET;

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
    if(!n)return;

    state.absX=n.px;
    state.absZ=n.pz;
    state.heading=n.angle;

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
