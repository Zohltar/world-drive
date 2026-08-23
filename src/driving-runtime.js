export function createDrivingRuntime({
  getState,
  setState,
  getFlags,
  getRouteLength,
  getWorldOffset,
  nearestRouteForVehicle,
  autopilotControl,
  keyboardActionDown,
  gamepadState,
  updateTransmission,
  vehiclePresentation,
  vehicleVisuals,
  truckTrailerSystem,
  roadSurfaceGrip,
  VEHICLE,
  vehicleTopSpeedKmh,
  activeTransmissionProfile,
  effectiveEngineRedlineRpm,
  transmissionRedlineSpeedKmh,
  vehicleReverseLimitMps,
  physicsClamp,
  longitudinalTractionLimit,
  computeGradeAcceleration,
  physicsRoadFrameScratch,
  dynamicsScratch,
  roadProfileFrameAtCum,
  ensureRoadProfileNear,
  roadFrameAt,
  terrainAbs,
  routePointAtCum,
  laneKeepAssistCommand,
  angleDelta,
  steeringCommand,
  advanceSteeringRack,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage,
  yawResponseRate,
  limitMomentumHeadingDelta,
  recenterIfNeeded,
  updateRunChallenge,
  terrainFrameAt,
  ROAD_SURFACE_OFFSET,
  TIRE_VISUAL_CLEARANCE,
  setFastWheelRoadSupport,
  car,
  skidMarks,
  xzToLL,
  elevationService,
  altitudeEl,
  updatePassedSignReadout,
  drawMap,
  worldStreaming,
  $,
  DRIVE_HUD_INTERVAL,
  MINIMAP_INTERVAL,
  GRIP_SOLVER_INTERVAL,
  WORLD_STREAMING_INTERVAL,
}){
  function update(dt){
    const initialState=getState();
    const nr=nearestRouteForVehicle(initialState.absX,initialState.absZ);
    const ap=autopilotControl(dt,nr);

    let {
      absX,
      absZ,
      heading,
      speed,
      steer,
      longitudinalAccel,
      visualSteer,
      currentSteerAngle,
      countachBrakeLightRequested,
      countachReverseLightRequested,
      lateralGripUsage,
      velocityHeading,
      dynamicYawRate,
      wheelGripUsage,
      wheelSlipLevels,
      wheelLateralUsage,
      wheelLongitudinalUsage,
      frontSlipAmount,
      rearSlipAmount,
      currentOnPavementForInstruments,
      driveHudAccumulator,
      minimapAccumulator,
      gripSolverAccumulator,
      worldStreamingAccumulator,
      lastContactModeText,
      roadContact,
    }=getState();

    const {
      assist,
      autopilot,
      menuOpen,
      maxSpeedKmh,
      maxSpeedMps:MAX
    }=getFlags();
    const routeLength=getRouteLength();

    const syncState=()=>setState({
      absX,
      absZ,
      heading,
      speed,
      steer,
      longitudinalAccel,
      visualSteer,
      currentSteerAngle,
      countachBrakeLightRequested,
      countachReverseLightRequested,
      lateralGripUsage,
      velocityHeading,
      dynamicYawRate,
      wheelGripUsage,
      wheelSlipLevels,
      wheelLateralUsage,
      wheelLongitudinalUsage,
      frontSlipAmount,
      rearSlipAmount,
      currentOnPavementForInstruments,
      driveHudAccumulator,
      minimapAccumulator,
      gripSolverAccumulator,
      worldStreamingAccumulator,
      lastContactModeText,
      roadContact,
    });

   // Presentation vertical physics was solved on the previous frame.
    // This one-frame-old state is stable and avoids a circular dependency.
    const airborneNow=
      !!vehiclePresentation.airborne;
   
    const keyboardThrottle=
      (
        keyboardActionDown('accelerate')
          ?1
          :0
      )-
      (
        keyboardActionDown('brake')
          ?1
          :0
      );
   
    const keyboardTurn=
      (
        keyboardActionDown('steerLeft')
          ?1
          :0
      )-
      (
        keyboardActionDown('steerRight')
          ?1
          :0
      );
   
    let manualThrottle=
      menuOpen
        ?0
        :keyboardThrottle;
   
    let manualTurn=
      menuOpen
        ?0
        :keyboardTurn;
   
    let manualHand=
      menuOpen
        ?false
        :keyboardActionDown(
           'handbrake'
         );
   
    if(
      gamepadState.connected&&
      !menuOpen
    ){
      if(
        gamepadState.throttle>.02||
        gamepadState.brake>.02
      ){
        manualThrottle=
          gamepadState.throttle-
          gamepadState.brake;
      }
   
      if(Math.abs(gamepadState.steer)>.001){
        manualTurn=
          -gamepadState.steer;
      }
   
      manualHand=
        manualHand||
        gamepadState.hand;
    }
   
    const throttle=autopilot?ap.throttle:manualThrottle;
    const turn=autopilot?ap.turn:manualTurn;
    const hand=autopilot?ap.hand:manualHand;
   
    const onPavement=
      !!(
        nr&&
        nr.d<8.5
      );
    currentOnPavementForInstruments=onPavement;
   
    const driveThrottle=
      updateTransmission(
        dt,
        throttle,
        onPavement
      );
   
    const brakeRequested=hand||(throttle<-.04&&speed>.15);
    countachBrakeLightRequested=brakeRequested;
    // Reverse lamps illuminate as soon as reverse drive is requested at/through
    // zero speed, and remain on while the car is actually travelling backwards.
    countachReverseLightRequested=(speed<-.08)||(driveThrottle<-.04&&speed<=.15);
    vehicleVisuals.updateBrakeLights(dt,brakeRequested);
    truckTrailerSystem.setBrakeLights(brakeRequested);
    const combination=truckTrailerSystem.longitudinalScales();
    // ----- V4.1 longitudinal dynamics -----
    const previousSpeed=speed;
    const surfaceGrip=onPavement?roadSurfaceGrip():1;
   
    // Terrain behavior:
    // every vehicle still loses 20% propulsion away from pavement.
    // Combustion vehicles additionally lose 30% usable redline in V20.6.
    // AWD keeps a meaningful traction advantage in loose terrain.
    const offroadPowerFactor=
      onPavement
        ?1
        :.80;
   
    const isAWD=
      VEHICLE.drivetrain==='AWD';
   
    const awdOffroadGripBonus=
      !onPavement&&isAWD
        ?1.18
        :1;
   
    // V21.21 — longitudinal force model. Propulsion and service braking are
    // resolved independently so axle load, drivetrain and surface grip can cap
    // the requested force before rolling/aero/grade forces are added.
    let requestedDriveAccel=0;
    let requestedBrakeAccel=0;
   
    if(driveThrottle>0){
      if(speed>=0){
        const performanceTop=vehicleTopSpeedKmh()/3.6;
        const speedRatio=Math.min(1,Math.max(0,speed/performanceTop));
        const powerTaper=truckTrailerSystem.active
          ?1
          :1-.38*speedRatio;
        requestedDriveAccel=
          VEHICLE.accel*
          offroadPowerFactor*
          driveThrottle*
          powerTaper;
      }else{
        requestedBrakeAccel=VEHICLE.brake*driveThrottle;
      }
    }else if(driveThrottle<0){
      if(speed>0){
        requestedBrakeAccel=VEHICLE.brake*driveThrottle;
      }else{
        requestedDriveAccel=
          VEHICLE.reverseAccel*
          offroadPowerFactor*
          driveThrottle;
      }
    }
   
    // V21.23.1 — when the tractor carries a trailer, engine force and service
    // braking are resolved against the mass/brake capability of the combination.
    // Passenger cars receive neutral scales of exactly 1.
    requestedDriveAccel*=truckTrailerSystem.active
      ?truckTrailerSystem.driveAccelScaleForSpeed(Math.abs(speed))
      :combination.driveAccelScale;
    requestedBrakeAccel*=combination.serviceBrakeScale;
   
    // V21.21.22 hotfix — longitudinal traction/downforce needs the current
    // pre-integration speed. The steering/lateral speedAbs is intentionally declared
    // later, after speed has been integrated for this frame, so do not reference it
    // here (doing so triggers the JS temporal dead zone on the first frame).
    const longitudinalSpeedAbs=Math.abs(speed);
   
    // V21.21.15 — static tire bite at walking/hairpin speed. Loose terrain
    // still has much less grip than asphalt, but a tire that is barely rolling
    // should not behave as if it were already in a high-slip state. Fade the
    // small static boost out before normal road speed.
    const offroadStaticTractionT=
      1-physicsClamp(Math.abs(speed)/7,0,1);
    const offroadStaticTractionBoost=
      1+.12*offroadStaticTractionT;
   
    const longitudinalMu=onPavement
      ?Math.max(
         .25,
         ((VEHICLE.longitudinalAccelLimit??VEHICLE.brake??9.8)/9.80665)*
         surfaceGrip
       )
      :Math.max(
         .22,
         (VEHICLE.offroadGrip??.60)*
         awdOffroadGripBonus*
         offroadStaticTractionBoost
       );
   
    const driveForce=longitudinalTractionLimit({
      vehicle:VEHICLE,requestedAccel:requestedDriveAccel,surfaceMu:longitudinalMu,mode:'drive',airborne:airborneNow,speedAbs:longitudinalSpeedAbs
    },dynamicsScratch.drive);
   
    const brakeForce=longitudinalTractionLimit({
      vehicle:VEHICLE,requestedAccel:requestedBrakeAccel,surfaceMu:longitudinalMu,mode:'brake',airborne:airborneNow,speedAbs:longitudinalSpeedAbs
    },dynamicsScratch.brake);
   
    let accel=
      driveForce.acceleration+
      brakeForce.acceleration;
   
    // Gravity is projected along the actual road/terrain grade. This is a key
    // foundation for heavy vehicles: climbs now cost speed and descents add load
    // instead of every route behaving as if it were level.
    let physicsRoadFrame=onPavement&&nr
      ?roadProfileFrameAtCum(nr.cum,physicsRoadFrameScratch)
      :null;
   
    if(onPavement&&!physicsRoadFrame){
      ensureRoadProfileNear(absX,absZ);
      physicsRoadFrame=
        (nr?roadProfileFrameAtCum(nr.cum,physicsRoadFrameScratch):null)||
        roadFrameAt(absX,absZ,physicsRoadFrameScratch);
    }
   
    const gradeForce=computeGradeAcceleration({
      onPavement,roadFrame:physicsRoadFrame,heading,airborne:airborneNow,x:absX,z:absZ,terrainHeightAt:terrainAbs
    },dynamicsScratch.grade);
   
    accel+=gradeForce.acceleration;
   
    // Rolling + aerodynamic resistance. In the air only aerodynamic resistance
    // remains; tires cannot provide propulsion, braking or rolling resistance.
    if(Math.abs(speed)>.05){
      const surfaceDrag=onPavement
        ?Math.max(0,(1-surfaceGrip)*.75)
        :VEHICLE.offroadDrag;
      const rollingAndSurface=airborneNow
        ?0
        :VEHICLE.rolling+surfaceDrag;
      const resist=
        rollingAndSurface+
        VEHICLE.aero*speed*speed+
        combination.rollingResistanceAccel+
        combination.aeroDragCoeff*speed*speed;
      accel-=Math.sign(speed)*resist;
    }else if(!throttle&&Math.abs(gradeForce.acceleration)<.04){
      speed=0;
    }
   
    if(hand&&!airborneNow){
      const handRequest=-Math.sign(speed||gradeForce.acceleration||1)*8.5;
      accel+=longitudinalTractionLimit({
        vehicle:VEHICLE,requestedAccel:handRequest,surfaceMu:longitudinalMu,mode:'handbrake',airborne:false,speedAbs:longitudinalSpeedAbs
      },dynamicsScratch.handbrake).acceleration;
    }
   
    speed+=accel*dt;
   
    // V20.6 off-road resistance.
    // Combustion: reduced effective redline naturally lowers every gear's usable
    // speed. If the car enters terrain above that top-gear redline speed, added
    // resistance bleeds the excess progressively rather than snapping speed.
    // EV: preserve the previous 20% off-road electronic reduction.
    if(!airborneNow&&!onPavement&&speed>0){
      const profile=
        activeTransmissionProfile();
   
      if(profile.type==='combustion'){
        const terrainRedline=
          effectiveEngineRedlineRpm(
            profile,
            false
          );
   
        const terrainMechanicalTop=
          transmissionRedlineSpeedKmh(
            profile,
            terrainRedline
          )/
          3.6;
   
        if(speed>terrainMechanicalTop){
          const excess=
            speed-
            terrainMechanicalTop;
   
          const terrainOverspeedResistance=
            Math.min(
              13.5,
              4.5+
              excess*.55
            );
   
          speed=
            Math.max(
              terrainMechanicalTop,
              speed-
              terrainOverspeedResistance*
              dt
            );
        }
      }else{
        const offroadEvMax=
          MAX*.80;
   
        if(speed>offroadEvMax){
          speed=
            Math.max(
              offroadEvMax,
              speed-
              12.5*
              dt
            );
        }
      }
    }
   
    // Full mechanical setting is NOT hard-clamped for combustion cars. The rev
    // limiter and drag determine their maximum. A deliberately lower user speed
    // setting still behaves as an explicit driver/electronic speed cap.
    const mechanicalTop=
      vehicleTopSpeedKmh();
   
    const userSpeedCapActive=
      maxSpeedKmh<
      mechanicalTop-.5;
   
    const hardForwardCap=
      userSpeedCapActive
        ?MAX
        :Infinity;
   
    const hardReverseCap=vehicleReverseLimitMps();
    speed=
      Math.max(
        hardReverseCap,
        Math.min(
          hardForwardCap,
          speed
        )
      );
    if(previousSpeed>0&&speed<0&&!throttle)speed=0;
    if(previousSpeed<0&&speed>0&&!throttle)speed=0;
    longitudinalAccel=(speed-previousSpeed)/Math.max(dt,.001);
   
    // ----- V21.21 generalized steering + lateral envelope -----
    const speedAbs=Math.abs(speed);
   
    // V21.21.19 — physical lane-keep assist. Normal Assist no longer edits the
    // chassis heading or world position after the tire simulation. Instead it
    // aims the FRONT WHEELS toward a preview point in the right-hand lane, and
    // that steering command must pass through the same steering rack, tire
    // friction circle and momentum model as the driver. If the tires cannot make
    // the corner, Assist cannot magically pull the car back onto the road.
    let assistedTurn=turn;
    if(
      assist&&
      !autopilot&&
      !airborneNow&&
      !hand&&
      nr&&
      routeLength&&
      nr.d<9.5&&
      speed>2
    ){
      let routeHeading=nr.angle;
      let routeDirection=1;
   
      if(
        Math.abs(angleDelta(routeHeading+Math.PI,heading))<
        Math.abs(angleDelta(routeHeading,heading))
      ){
        routeHeading+=Math.PI;
        routeDirection=-1;
      }
   
      // North-American/right-hand traffic: target the centre of the lane on
      // the driver's RIGHT, not the road centreline. World Drive maps geographic
      // north toward -Z (llToXZ), so for forward=(sin(h),cos(h)) the driver's
      // right-hand normal is (-cos(h),+sin(h)). V21.21.18 accidentally used the
      // opposite normal and therefore targeted the left lane on real routes.
      const laneOffset=1.65;
      const lookAhead=
        Math.max(
          10,
          Math.min(
            36,
            9+speedAbs*.72
          )
        );
      const targetCum=
        Math.max(
          0,
          Math.min(
            routeLength-1,
            nr.cum+routeDirection*lookAhead
          )
        );
      const target=routePointAtCum(targetCum);
   
      if(target){
        const targetHeading=
          target.angle+
          (routeDirection<0?Math.PI:0);
        const rightX=-Math.cos(targetHeading);
        const rightZ=Math.sin(targetHeading);
        const targetX=target.x+rightX*laneOffset;
        const targetZ=target.z+rightZ*laneOffset;
        const desiredHeading=
          Math.atan2(
            targetX-absX,
            targetZ-absZ
          );
        const assistHeadingError=
          angleDelta(
            desiredHeading,
            heading
          );
        const laneAssist=laneKeepAssistCommand({
          speedAbs,
          headingError:assistHeadingError,
          manualInput:manualTurn,
          frontSlipAmount,
          rearSlipAmount,
          airborne:false,
          handbrake:false
        });
   
        assistedTurn=
          physicsClamp(
            manualTurn+laneAssist.input,
            -1,
            1
          );
      }
    }
   
    const steeringModel=steeringCommand({vehicle:VEHICLE,speedAbs,input:assistedTurn},dynamicsScratch.steering);
    // V21.21.25 — finite steering-rack travel. When a profile defines a
    // centre-to-full time, joystick input requests a wheel angle but cannot move
    // the rack there instantaneously. This gives each vehicle a directly tunable
    // steering nervousness without adding fake yaw or grip.
    steer=advanceSteeringRack({
      current:steer,
      target:steeringModel.target,
      dt,
      inputSlewRate:steeringModel.inputSlewRate,
      returnSlewRate:steeringModel.returnSlewRate,
      inputRate:steeringModel.inputRate,
      returnRate:steeringModel.returnRate
    });
    if(steeringModel.target===0&&Math.abs(steer)<.008)steer=0;
   
    const steerAngle=steer*steeringModel.maxRoadWheelAngle;
    currentSteerAngle=steerAngle;
   
    const lateralEnvelope=lateralDynamicsEnvelope({
      vehicle:VEHICLE,speed,steerAngle,steerInput:steer,driveThrottle,onPavement,surfaceGrip,awdOffroadGripBonus,rearSlipAmount,airborne:airborneNow
    },dynamicsScratch.lateral);
   
    let yawRate=
      lateralEnvelope.yawRate*
      truckTrailerSystem.tractorYawScale(speedAbs);
    const drivetrain=lateralEnvelope.drivetrain;
    const powerCorneringLoad=lateralEnvelope.powerCorneringLoad;
    const requestedLatAccel=lateralEnvelope.requestedLatAccel;
    const latLimit=lateralEnvelope.latLimit;
    const signedLatAccel=lateralEnvelope.signedLatAccel;
   
    gripSolverAccumulator+=dt;
    let perWheelGrip=dynamicsScratch.grip;
    if(
      gripSolverAccumulator>=GRIP_SOLVER_INTERVAL||
      !perWheelGrip?.smoothed?.length
    ){
      const gripDt=Math.min(.10,Math.max(dt,gripSolverAccumulator));
      gripSolverAccumulator%=GRIP_SOLVER_INTERVAL;
      // V21.21.16 — the tire solver must receive the lateral force the chassis
      // can physically develop, not the unbounded kinematic request from full
      // steering lock. Passing a 3–10 g request into a ~1 g tire model made all
      // four tires appear saturated and could create a bogus opposite yaw moment.
      const tireSolverLatAccel=
        Math.min(
          Math.max(0,requestedLatAccel),
          Math.max(0,latLimit)
        );
      const tireSolverSignedLatAccel=
        Math.sign(signedLatAccel||steerAngle||1)*
        tireSolverLatAccel;
   
      perWheelGrip=estimateWheelGripUsage({
        requestedLatAccel:tireSolverLatAccel,signedLatAccel:tireSolverSignedLatAccel,latLimit,longitudinalAccel,
        propulsionAccel:driveForce.acceleration,serviceBrakeAccel:brakeForce.acceleration,
        surfaceMu:longitudinalMu,
        throttle:driveThrottle,handbrake:hand,airborne:airborneNow,vehicle:VEHICLE,speedAbs,
        contacts:vehiclePresentation?.wheelContacts||[],previousUsage:wheelGripUsage,dt:gripDt
      },dynamicsScratch.grip);
    }
   
    wheelGripUsage=
      perWheelGrip.smoothed;
   
    wheelSlipLevels=
      perWheelGrip.slip;
   
    wheelLateralUsage=
      perWheelGrip.lateralUsage;
   
    wheelLongitudinalUsage=
      perWheelGrip.longitudinalUsage;
   
    const targetFrontSlip=
      perWheelGrip.frontLateral;
   
    const targetRearSlip=
      perWheelGrip.rearLateral;
   
    // V21.21.12 — real axle-force imbalance from the friction circle. A locked
    // rear axle removes the counter-yaw force that normally balances the front
    // tires, so the chassis gains yaw angular velocity while momentum initially
    // keeps following the old trajectory. No steering/lateral demand = no moment.
    let frictionYawAccel=
      Number.isFinite(perWheelGrip.frictionYawAccel)
        ?perWheelGrip.frictionYawAccel
        :0;
   
    // V21.21.12 — the friction circle now feeds both rotational and translational
    // dynamics. Losing rear lateral force must not only rotate the chassis: the
    // center-of-mass trajectory also has less lateral force available, which is
    // what creates a visibly large slip angle instead of a car that still follows
    // the corner almost perfectly while its nose yaws.
    const netLateralAccel=
      Number.isFinite(perWheelGrip.netLateralAccel)
        ?perWheelGrip.netLateralAccel
        :signedLatAccel;
    const rearLateralForceScale=
      Number.isFinite(perWheelGrip.rearLateralForceScale)
        ?physicsClamp(perWheelGrip.rearLateralForceScale,0,1)
        :1;
    const rearLateralForceLoss=
      Math.abs(signedLatAccel)>.15
        ?1-rearLateralForceScale
        :0;
   
    const slipDt=
      Math.min(
        .05,
        dt
      );
   
    // V21.21.14 — at parking/neighbourhood speed, tire slip should disappear
    // very quickly once the demand falls back under static friction. Keeping the
    // old high-speed decay here made a tiny transient slip feel like the car was
    // gently skating sideways in the opposite direction of the turn.
    const lowSpeedSlipReleaseBoost=
      1+
      (1-physicsClamp(speedAbs/8,0,1))*1.6;
   
    frontSlipAmount+=
      (
        targetFrontSlip-
        frontSlipAmount
      )*
      (
        1-
        Math.exp(
          -slipDt*
          (
            targetFrontSlip>
            frontSlipAmount
              ?7.8
              :5.8*lowSpeedSlipReleaseBoost
          )
        )
      );
   
    rearSlipAmount+=
      (
        targetRearSlip-
        rearSlipAmount
      )*
      (
        1-
        Math.exp(
          -slipDt*
          (
            targetRearSlip>
            rearSlipAmount
              ?7.8
              :5.8*lowSpeedSlipReleaseBoost
          )
        )
      );
   
    if(airborneNow){
      frontSlipAmount*=
        Math.exp(
          -dt*5
        );
   
      rearSlipAmount*=
        Math.exp(
          -dt*5
        );
    }
   
    // Raw tire demand is measured exactly where the physics reaches its grip
    // ceiling, rather than reconstructed later from joystick/steering angle.
    const rawGripUsage=
      onPavement&&
      !airborneNow&&
      latLimit>0
        ?Math.min(
           1.35,
           requestedLatAccel/
           latLimit
         )
        :0;
   
    // Real tires do not build slip/force in zero time. A short attack/release
    // also prevents a tiny joystick tap from instantly firing audio/decals.
    const gripResponse=
      rawGripUsage>lateralGripUsage
        ?12
        :18;
   
    lateralGripUsage+=
      (rawGripUsage-lateralGripUsage)*
      (1-Math.exp(-dt*gripResponse));
   
    if(lateralGripUsage<.002&&rawGripUsage===0){
      lateralGripUsage=0;
    }
   
    if(requestedLatAccel>latLimit&&requestedLatAccel>0){
      yawRate*=
        latLimit/
        requestedLatAccel;
    }
   
    // ---------------------------------------------------------------
    // V20.2 AXLE BALANCE
    // ---------------------------------------------------------------
    // Front slip primarily causes understeer. Rear slip primarily causes
    // oversteer. If both axles are saturated, the entire car slides and steering
    // authority falls instead of the physics continuing to corner perfectly at
    // the grip limit.
    const frontDominance=
      Math.max(
        0,
        frontSlipAmount-
        rearSlipAmount*.55
      );
   
    const rearDominance=
      Math.max(
        0,
        rearSlipAmount-
        frontSlipAmount*.55
      );
   
    const fourWheelSlide=
      Math.min(
        frontSlipAmount,
        rearSlipAmount
      );
   
    if(!airborneNow){
      // Front saturation = the car refuses additional steering input.
      yawRate*=
        Math.max(
          .46,
          1-
          frontDominance*.54-
          fourWheelSlide*.24
        );
    }
   
    if(
      drivetrain==='RWD'&&
      powerCorneringLoad>.05&&
      !airborneNow
    ){
      // Power-oversteer remains a small vehicle-personality term, but only the
      // REAR-DOMINANT part can amplify rotation.
      const powerOversteerYaw=
        VEHICLE.powerOversteerYaw??
        .035;
   
      const rearSlipYaw=
        Math.sign(steer||1)*
        powerOversteerYaw*
        powerCorneringLoad*
        (
          .30+
          rearDominance*.70
        )*
        Math.min(
          1,
          speedAbs/18
        );
   
      yawRate+=
        rearSlipYaw*
        Math.sign(speed||1);
    }
   
    if(
      rearDominance>.015&&
      !airborneNow&&
      speedAbs>4
    ){
      // V21.21.13 — this older rear-slip yaw helper predates the real axle-force
      // moment added in V21.21.11/12. Keep its useful low/medium-speed character,
      // but progressively fade it at high speed so it does not stack on top of
      // the force-coupled model and make the rear break away too eagerly.
      const highSpeedRearStabilityT=
        physicsClamp(
          (speedAbs-25)/30,
          0,
          1
        );
      const legacySlipYawScale=
        1-
        highSpeedRearStabilityT*.55;
   
      const slipYaw=
        Math.sign(
          yawRate||
          steerAngle||
          1
        )*
        rearDominance*
        Math.min(
          .135,
          .040+
          speedAbs*.0022
        )*
        legacySlipYawScale;
   
      yawRate+=
        slipYaw*
        Math.sign(speed||1);
    }
   
    // V21.21.16 — front saturation is understeer, not reverse steering.
    // Under AWD acceleration the old force-loss sum could be dominated by the
    // unloaded front axle and produce a yaw acceleration opposite the commanded
    // turn. Front slip already reduces yawRate above, so do not integrate an
    // opposing friction moment while the driver is actively commanding a turn.
    // Same-sign rear-loss moments (handbrake / power oversteer) remain intact.
    if(
      Math.abs(steerAngle)>.006&&
      Math.abs(yawRate)>1e-5&&
      frictionYawAccel*yawRate<0
    ){
      frictionYawAccel=0;
    }
   
    // ---------------------------------------------------------------
    // HIGH-SPEED LATERAL FORCE BUILDUP
    // ---------------------------------------------------------------
    // The old model applied target yaw almost immediately. A real tire/chassis
    // needs time to build lateral force, and that response should become calmer
    // as speed rises.
    const yawResponse=yawResponseRate({
      vehicle:VEHICLE,
      speedAbs,
      airborne:airborneNow
    });
   
    const yawReleaseBoost=
      Math.abs(yawRate)<
      Math.abs(dynamicYawRate)
        ?1.35
        :1;
   
    // A rear axle with little lateral authority cannot also provide the strong
    // stabilizing cornering stiffness that normally drags yaw rate back toward
    // the bicycle-model target. Keep angular momentum while the rear is locked,
    // then restore the normal damping as soon as rear grip returns.
    const frictionYawLoss=
      physicsClamp(
        Math.abs(frictionYawAccel)/4.5,
        0,
        1
      );
    const forceCoupledSlide=
      physicsClamp(
        Math.max(
          frictionYawLoss,
          rearLateralForceLoss
        ),
        0,
        1
      );
    const yawGripResponseScale=
      Math.max(
        .34,
        1-forceCoupledSlide*.66
      );
   
    // Integrate the tire-force yaw moment directly. This is deliberately not a
    // `handbrake => yaw` shortcut: frictionYawAccel is zero unless there is actual
    // signed lateral force demand and an axle loses lateral capacity.
    dynamicYawRate+=
      frictionYawAccel*dt;
   
    dynamicYawRate+=
      (
        yawRate-
        dynamicYawRate
      )*
      (
        1-
        Math.exp(
          -dt*
          yawResponse*
          yawReleaseBoost*
          yawGripResponseScale
        )
      );
   
    heading+=
      dynamicYawRate*
      dt;
   
    // Four-wheel sliding scrubs speed away. This makes entering a corner far
    // beyond the efficient limit cost trajectory and speed instead of behaving
    // like a perfect constant-G turn.
    if(
      !airborneNow&&
      fourWheelSlide>.01&&
      speedAbs>6
    ){
      const scrubDecel=
        (
          1.0+
          fourWheelSlide*
          3.2
        );
   
      const scrubDelta=
        scrubDecel*
        dt;
   
      if(speed>0){
        speed=
          Math.max(
            0,
            speed-
            scrubDelta
          );
      }else if(speed<0){
        speed=
          Math.min(
            0,
            speed+
            scrubDelta
          );
      }
    }
   
    // Autopilot retains its own stronger recovery logic. Normal Assist is
    // intentionally absent here: V21.21.19 performs lane keeping exclusively by
    // steering the front wheels BEFORE tire forces are resolved.
    if(
      !airborneNow&&
      assist&&
      autopilot&&
      nr&&
      nr.d<12&&
      speedAbs>2
    ){
      let routeHeading=nr.angle;
   
      if(
        Math.abs(angleDelta(routeHeading+Math.PI,heading))<
        Math.abs(angleDelta(routeHeading,heading))
      ){
        routeHeading+=Math.PI;
      }
   
      const hErr=
        angleDelta(routeHeading,heading);
   
      heading+=
        hErr*dt*.55;
   
      if(nr.d>.55){
        const centerRate=.48;
        absX+=(nr.px-absX)*(1-Math.exp(-dt*centerRate));
        absZ+=(nr.pz-absZ)*(1-Math.exp(-dt*centerRate));
      }
    }
   
    // Direction of travel follows chassis heading almost instantly while the
    // tires are hooked up. During rear slip it lags progressively, creating a
    // real sideslip angle: the nose turns while momentum carries the car outward.
    if(
      !Number.isFinite(
        velocityHeading
      )||
      Math.abs(speed)<1.2
    ){
      velocityHeading=heading;
    }
   
    const trajectoryRearSlip=
      Math.max(
        0,
        rearSlipAmount-
        frontSlipAmount*.45
      );
   
    // When the friction circle has actually removed rear lateral force, momentum
    // should keep travelling on its old vector longer than the normal rear-slip
    // heuristic allowed. This is still force-driven: in a straight line
    // frictionYawAccel is zero and the historical trajectory-follow rate is kept.
    const frictionTrajectoryLoss=frictionYawLoss;
   
    // V21.21.14 — low-speed no-slip region. Below roughly 30 km/h, a normal
    // unsaturated tire should behave almost kinematically: the contact patches
    // roll where the front wheels point instead of carrying a persistent sideslip
    // angle from the transient tire solver. This is bypassed as soon as there is
    // a genuine breakaway (handbrake / saturated axle), so low-speed drift remains
    // possible when the tires are actually sliding.
    const lowSpeedNoSlip=
      !airborneNow&&
      speedAbs<8.5&&
      forceCoupledSlide<.18&&
      frontSlipAmount<.16&&
      rearSlipAmount<.16;
   
    if(lowSpeedNoSlip){
      if(speedAbs<2.5){
        velocityHeading=heading;
      }else{
        const lowSpeedLockT=
          1-physicsClamp((speedAbs-2.5)/6.0,0,1);
        const lowSpeedFollowRate=
          34+
          lowSpeedLockT*48;
   
        velocityHeading+=
          angleDelta(
            heading,
            velocityHeading
          )*
          (
            1-
            Math.exp(
              -dt*lowSpeedFollowRate
            )
          );
      }
    }
    // During a real rear breakaway, integrate the direction of travel from the
    // *remaining net lateral tire force* rather than simply making it chase the
    // chassis heading. V21.21.17 then caps the COMPLETE trajectory correction by
    // a_lat / v, so neither normal cornering nor service braking can rotate linear
    // momentum faster than the remaining tire friction physically allows.
    else{
      let attemptedTrajectoryDelta=0;
   
      if(
        !airborneNow&&
        speedAbs>4&&
        forceCoupledSlide>.10
      ){
        const signedSpeedForCurvature=
          Math.abs(speed)>.5
            ?speed
            :Math.sign(speed||1)*.5;
        const forceTrajectoryYawRate=
          netLateralAccel/
          signedSpeedForCurvature;
   
        attemptedTrajectoryDelta+=
          forceTrajectoryYawRate*dt;
   
        const slideAlignmentRate=
          .65+
          (1-forceCoupledSlide)*3.20;
   
        attemptedTrajectoryDelta+=
          angleDelta(
            heading,
            velocityHeading
          )*
          (
            1-
            Math.exp(
              -dt*slideAlignmentRate
            )
          );
      }else{
        const velocityFollowRate=
          airborneNow
            ?0
            :(
               (2.8-1.45*frictionTrajectoryLoss)+
               27.2*
               Math.pow(
                 1-
                 physicsClamp(
                   trajectoryRearSlip,
                   0,
                   1
                 ),
                 2
               )
             );
   
        attemptedTrajectoryDelta+=
          angleDelta(
            heading,
            velocityHeading
          )*
          (
            1-
            Math.exp(
              -dt*velocityFollowRate
            )
          );
      }
   
      const trajectoryLateralCapacityAccel=
        Number.isFinite(perWheelGrip.trajectoryLateralCapacityAccel)
          ?Math.max(0,perWheelGrip.trajectoryLateralCapacityAccel)
          :Math.max(0,latLimit);
   
      velocityHeading+=
        limitMomentumHeadingDelta({
          attemptedDelta:attemptedTrajectoryDelta,
          speedAbs,
          lateralCapacityAccel:trajectoryLateralCapacityAccel,
          dt,
          airborne:airborneNow
        });
    }
   
    absX+=
      Math.sin(
        velocityHeading
      )*
      speed*
      dt;
   
    absZ+=
      Math.cos(
        velocityHeading
      )*
      speed*
      dt;
   
    syncState();
    recenterIfNeeded(absX,absZ);
    const worldOffset=getWorldOffset();
    const rx=absX-worldOffset.x,rz=absZ-worldOffset.z;
   
    // Hysteresis prevents rapid on/off flicker at the road edge:
    // enter at 8.5 m, remain attached until 11 m.
    if(nr){
      if(!roadContact && nr.d<8.5) roadContact=true;
      else if(roadContact && nr.d>11) roadContact=false;
    }else roadContact=false;
   
    let roadFrame=roadFrameAt(absX,absZ);
    if(roadContact && (!roadFrame || roadFrame.distance>18)){
      roadFrame=ensureRoadProfileNear(absX,absZ);
    }
    const onRoad=roadContact&&roadFrame&&roadFrame.distance<18;
    currentOnPavementForInstruments=!!onRoad;
    const contactModeText=onRoad?'Route':'Terrain';
    if(contactModeText!==lastContactModeText){
      lastContactModeText=contactModeText;
      $('contactMode').textContent=contactModeText;
    }
   
    // Competitive run uses the same final Route/Terrain contact decision as HUD
    // and vehicle support, so penalties match what the player actually sees.
    updateRunChallenge(
      onRoad,
      nr
    );
   
    const terrainFrame=!onRoad?terrainFrameAt(absX,absZ,heading):null;
   
    // V21.21.5: reuse the road frame we already resolved above. Calling
    // roadSurfaceAt() here performed another nearest-segment search for the exact
    // same chassis center. The equivalent rolled surface height is reconstructed
    // directly and then reused by the four wheel support samples.
    let centerRoadSurfaceY=null;
    if(onRoad&&roadFrame){
      const normalX=-Math.cos(roadFrame.angle||0);
      const normalZ=Math.sin(roadFrame.angle||0);
      const centerLateral=(absX-roadFrame.px)*normalX+(absZ-roadFrame.pz)*normalZ;
      centerRoadSurfaceY=roadFrame.y+Math.tan(roadFrame.roll||0)*centerLateral+ROAD_SURFACE_OFFSET;
    }
    setFastWheelRoadSupport(onRoad,roadFrame,centerRoadSurfaceY,absX,absZ);
   
    const baseGround=onRoad
      ?(centerRoadSurfaceY??roadFrame.y+ROAD_SURFACE_OFFSET)
      :(terrainFrame?terrainFrame.y:terrainAbs(absX,absZ));
   
    const targetY=
      baseGround+
      .38+
      (onRoad?TIRE_VISUAL_CLEARANCE:0);
   
    car.position.x=rx;
    car.position.z=rz;
   
    // V20.0: vehiclePresentation owns root Y on both pavement and terrain.
    // It may follow support geometry or continue ballistically while airborne.
   
    // Root vehicle stays yaw-aligned only. Wheel heights and the sprung body
    // handle suspension/pitch/roll independently.
    car.rotation.set(0,heading,0);
    vehiclePresentation.updateSuspensionVisuals(dt,onRoad,steerAngle);
    // Wheel rotation + visible front steering.
    // Steering pivot and wheel spin are now independent transforms.
    visualSteer+=(steerAngle-visualSteer)*(1-Math.exp(-dt*7));
    vehiclePresentation.updateWheels(dt,speed,visualSteer);
   
    skidMarks.updateLocal({
      contacts:vehiclePresentation.wheelContacts,
      onRoad,
      speed,
      steerAngle,
      lateralGripUsage,
      wheelGripUsage,
      wheelSlipLevels,
      wheelLateralUsage,
      wheelLongitudinalUsage,
      longitudinalAccel,
      handbrake:hand,
      vehicle:VEHICLE,
      dt
    });
   
    driveHudAccumulator+=dt;
    minimapAccumulator+=dt;
   
    if(driveHudAccumulator>=DRIVE_HUD_INTERVAL){
      driveHudAccumulator%=DRIVE_HUD_INTERVAL;
      $('speed').textContent=Math.round(Math.abs(speed)*3.6);
      const llNow=xzToLL(absX,absZ);
      const realElev=elevationService.elevationAt(llNow.lat,llNow.lon);
      altitudeEl.textContent=realElev!==null&&Number.isFinite(realElev)?Math.round(realElev):'—';
      const frameNow=roadFrameAt(absX,absZ);
      $('grade').textContent=frameNow?(Math.tan(frameNow.pitch)*100).toFixed(1):'0.0';
   
      if(nr){
        const pct=100*nr.cum/routeLength;
        $('progress').textContent=pct.toFixed(1);
        $('doneKm').textContent=(nr.cum/1000).toFixed(1);
        $('remainKm').textContent=((routeLength-nr.cum)/1000).toFixed(1);
        $('roadDist').textContent=Math.round(nr.d);
        updatePassedSignReadout(nr);
      }
    }
   
    if(nr&&minimapAccumulator>=MINIMAP_INTERVAL){
      minimapAccumulator%=MINIMAP_INTERVAL;
      drawMap(nr.cum);
    }
   
    // Streaming boundaries move slowly relative to vehicle physics. Checking
    // them at ~8 Hz removes main-thread work from every animation frame while
    // preserving exactly the same load distances and world detail.
    worldStreamingAccumulator+=dt;
    if(worldStreamingAccumulator>=WORLD_STREAMING_INTERVAL){
      worldStreamingAccumulator%=WORLD_STREAMING_INTERVAL;
      worldStreaming.updateVisible(absX,absZ);
    }
   

    syncState();
  }

  return {update};
}
