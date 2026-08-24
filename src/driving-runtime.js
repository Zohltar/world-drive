import { createPerWheelShadowSolver } from './physics/per-wheel-shadow-solver.js';

function smoothstep01(value){
  const t=Math.max(0,Math.min(1,Number(value)||0));
  return t*t*(3-2*t);
}

export function bodyRelativeLongitudinalSpeed({speed=0,heading=0,velocityHeading=0}={}){
  const v=Number(speed)||0;
  const bodyDelta=(Number(velocityHeading)||0)-(Number(heading)||0);
  return v*Math.cos(bodyDelta);
}

// P8 — the velocityHeading state is paired with a SIGNED scalar speed. During
// a handbrake 180 we can temporarily have speed>0 while motion is rearward
// relative to the chassis. In that representation the no-slip momentum target
// is heading+PI, not heading. Conversely a canonical true reverse (speed<0,
// velocityHeading~=heading) should continue targeting heading. Pick whichever
// parameter-space heading represents the body's actual forward/reverse travel.
export function bodyRelativeMomentumTargetHeading({speed=0,heading=0,velocityHeading=0}={}){
  const v=Number(speed)||0;
  const h=Number(heading)||0;
  const vh=Number(velocityHeading)||0;
  if(Math.abs(v)<1e-8)return h;
  const bodyLong=bodyRelativeLongitudinalSpeed({speed:v,heading:h,velocityHeading:vh});
  const speedSign=Math.sign(v||1);
  const bodySign=Math.sign(bodyLong||v||1);
  if(bodySign===speedSign)return h;
  return h+Math.PI;
}

// P6.4 — steering DIRECTION follows body-relative travel immediately once the
// handbrake is released. Do not blend the sign through rear-slip memory: if the
// chassis is moving backward, steering must act like reverse. Grip recovery is
// handled separately as an authority multiplier so we never point yaw the wrong
// way while the tires are still reattaching.
export function bodyRelativeSteeringSpeed({speed=0,heading=0,velocityHeading=0,handbrake=false}={}){
  const v=Number(speed)||0;
  const speedAbs=Math.abs(v);
  if(speedAbs<1e-8)return 0;
  if(handbrake)return Math.sign(v||1)*speedAbs;
  const bodyLong=bodyRelativeLongitudinalSpeed({speed:v,heading,velocityHeading});
  const projectionDeadband=speedAbs*.06;
  const direction=Math.abs(bodyLong)>projectionDeadband
    ?Math.sign(bodyLong)
    :Math.sign(v||1);
  return direction*speedAbs;
}

// P9 — measure extreme slip against the nearest longitudinal travel axis, not
// always against the chassis nose. A clean 180 with the car moving backward has
// heading-vs-momentum delta ~= PI, but its true lateral slip relative to the
// reverse axis is ~= 0. Treating PI as maximum sideslip suppressed front-tire
// steering authority to ~28% exactly when a J-turn needs it most.
export function travelAxisSideslip({heading=0,velocityHeading=0}={}){
  let delta=(Number(velocityHeading)||0)-(Number(heading)||0);
  delta=Math.atan2(Math.sin(delta),Math.cos(delta));
  return Math.atan2(Math.abs(Math.sin(delta)),Math.abs(Math.cos(delta)));
}

// During a genuinely sideways post-spin state the bicycle steering model is
// outside its valid range, so fade steering yaw authority until rear grip
// begins to return. Once motion is aligned with either the forward OR reverse
// body axis, full front-tire steering authority is restored naturally.
export function postSpinSteeringAuthority({rearSlipAmount=0,heading=0,velocityHeading=0,handbrake=false}={}){
  if(handbrake)return 1;
  const slip=Math.max(0,Math.min(1,Number(rearSlipAmount)||0));
  const sideslip=travelAxisSideslip({heading,velocityHeading});
  const extremeSideslip=smoothstep01((sideslip-.70)/.70); // ~40 deg -> ~80 deg
  const rearSlipGate=smoothstep01((slip-.18)/.55);
  const suppression=extremeSideslip*rearSlipGate;
  return 1-.72*suppression;
}

export function handbrakeLateralEffectForSpeed(speedAbs=0){
  return smoothstep01((Math.max(0,Number(speedAbs)||0)-2.5)/6.5);
}

export function landingSideslipGripSeed({sideslipRad=0,speedAbs=0}={}){
  const slip=Math.abs(Number(sideslipRad)||0);
  const speed=Math.max(0,Math.abs(Number(speedAbs)||0));
  const slipT=smoothstep01((slip-.035)/.19);
  const speedT=smoothstep01((speed-3.5)/7.5);
  return Math.min(.92,slipT*speedT*.92);
}

export function createDrivingRuntime({
  getState,setState,getFlags,getRouteLength,getWorldOffset,nearestRouteForVehicle,
  autopilotControl,keyboardActionDown,gamepadState,updateTransmission,
  vehiclePresentation,vehicleVisuals,truckTrailerSystem,roadSurfaceGrip,getVehicleId,
  VEHICLE,vehicleTopSpeedKmh,activeTransmissionProfile,effectiveEngineRedlineRpm,
  transmissionRedlineSpeedKmh,vehicleReverseLimitMps,physicsClamp,
  longitudinalTractionLimit,computeGradeAcceleration,physicsRoadFrameScratch,
  dynamicsScratch,roadProfileFrameAtCum,ensureRoadProfileNear,roadFrameAt,terrainAbs,
  routePointAtCum,laneKeepAssistCommand,angleDelta,steeringCommand,advanceSteeringRack,
  lateralDynamicsEnvelope,estimateWheelGripUsage,yawResponseRate,limitMomentumHeadingDelta,
  recenterIfNeeded,updateRunChallenge,terrainFrameAt,ROAD_SURFACE_OFFSET,
  TIRE_VISUAL_CLEARANCE,setFastWheelRoadSupport,car,skidMarks,xzToLL,elevationService,
  altitudeEl,updatePassedSignReadout,drawMap,worldStreaming,$,DRIVE_HUD_INTERVAL,
  MINIMAP_INTERVAL,GRIP_SOLVER_INTERVAL,WORLD_STREAMING_INTERVAL,
}){
  const physicsShadow=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  let wasAirborne=false;

  function update(dt){
    const initialState=getState();
    const nr=nearestRouteForVehicle(initialState.absX,initialState.absZ);
    const ap=autopilotControl(dt,nr);

    let {
      absX,absZ,heading,speed,steer,longitudinalAccel,visualSteer,currentSteerAngle,
      countachBrakeLightRequested,countachReverseLightRequested,lateralGripUsage,
      velocityHeading,dynamicYawRate,wheelGripUsage,wheelSlipLevels,wheelLateralUsage,
      wheelLongitudinalUsage,frontSlipAmount,rearSlipAmount,currentOnPavementForInstruments,
      driveHudAccumulator,minimapAccumulator,gripSolverAccumulator,worldStreamingAccumulator,
      lastContactModeText,roadContact,
    }=getState();

    const {assist,autopilot,menuOpen,maxSpeedKmh,maxSpeedMps:MAX}=getFlags();
    const routeLength=getRouteLength();

    const syncState=()=>setState({
      absX,absZ,heading,speed,steer,longitudinalAccel,visualSteer,currentSteerAngle,
      countachBrakeLightRequested,countachReverseLightRequested,lateralGripUsage,
      velocityHeading,dynamicYawRate,wheelGripUsage,wheelSlipLevels,wheelLateralUsage,
      wheelLongitudinalUsage,frontSlipAmount,rearSlipAmount,currentOnPavementForInstruments,
      driveHudAccumulator,minimapAccumulator,gripSolverAccumulator,worldStreamingAccumulator,
      lastContactModeText,roadContact,
    });

    const airborneNow=!!vehiclePresentation.airborne;
    const justLanded=wasAirborne&&!airborneNow;
    wasAirborne=airborneNow;

    const keyboardThrottle=(keyboardActionDown('accelerate')?1:0)-(keyboardActionDown('brake')?1:0);
    const keyboardTurn=(keyboardActionDown('steerLeft')?1:0)-(keyboardActionDown('steerRight')?1:0);
    let manualThrottle=menuOpen?0:keyboardThrottle;
    let manualTurn=menuOpen?0:keyboardTurn;
    let manualHand=menuOpen?false:keyboardActionDown('handbrake');

    if(gamepadState.connected&&!menuOpen){
      if(gamepadState.throttle>.02||gamepadState.brake>.02)manualThrottle=gamepadState.throttle-gamepadState.brake;
      if(Math.abs(gamepadState.steer)>.001)manualTurn=-gamepadState.steer;
      manualHand=manualHand||gamepadState.hand;
    }

    const throttle=autopilot?ap.throttle:manualThrottle;
    const turn=autopilot?ap.turn:manualTurn;
    const hand=autopilot?ap.hand:manualHand;
    const onPavement=!!(nr&&nr.d<8.5);
    currentOnPavementForInstruments=onPavement;
    const driveThrottle=updateTransmission(dt,throttle,onPavement);

    const brakeRequested=hand||(throttle<-.04&&speed>.15);
    countachBrakeLightRequested=brakeRequested;
    countachReverseLightRequested=(speed<-.08)||(driveThrottle<-.04&&speed<=.15);
    vehicleVisuals.updateBrakeLights(dt,brakeRequested);
    truckTrailerSystem.setBrakeLights(brakeRequested);
    const combination=truckTrailerSystem.longitudinalScales();
    const previousSpeed=speed;
    const surfaceGrip=onPavement?roadSurfaceGrip():1;
    const offroadPowerFactor=onPavement?1:.80;
    const isAWD=VEHICLE.drivetrain==='AWD';
    const awdOffroadGripBonus=!onPavement&&isAWD?1.18:1;
    let requestedDriveAccel=0,requestedBrakeAccel=0;

    if(driveThrottle>0){
      if(speed>=0){
        const performanceTop=vehicleTopSpeedKmh()/3.6;
        const speedRatio=Math.min(1,Math.max(0,speed/performanceTop));
        const powerTaper=truckTrailerSystem.active?1:1-.38*speedRatio;
        requestedDriveAccel=VEHICLE.accel*offroadPowerFactor*driveThrottle*powerTaper;
      }else requestedBrakeAccel=VEHICLE.brake*driveThrottle;
    }else if(driveThrottle<0){
      if(speed>0)requestedBrakeAccel=VEHICLE.brake*driveThrottle;
      else requestedDriveAccel=VEHICLE.reverseAccel*offroadPowerFactor*driveThrottle;
    }

    requestedDriveAccel*=truckTrailerSystem.active?truckTrailerSystem.driveAccelScaleForSpeed(Math.abs(speed)):combination.driveAccelScale;
    requestedBrakeAccel*=combination.serviceBrakeScale;
    const longitudinalSpeedAbs=Math.abs(speed);
    const offroadStaticTractionT=1-physicsClamp(Math.abs(speed)/7,0,1);
    const offroadStaticTractionBoost=1+.12*offroadStaticTractionT;
    const longitudinalMu=onPavement
      ?Math.max(.25,((VEHICLE.longitudinalAccelLimit??VEHICLE.brake??9.8)/9.80665)*surfaceGrip)
      :Math.max(.22,(VEHICLE.offroadGrip??.60)*awdOffroadGripBonus*offroadStaticTractionBoost);

    const driveForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedDriveAccel,surfaceMu:longitudinalMu,mode:'drive',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.drive);
    const brakeForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedBrakeAccel,surfaceMu:longitudinalMu,mode:'brake',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.brake);
    let accel=driveForce.acceleration+brakeForce.acceleration;

    let physicsRoadFrame=onPavement&&nr?roadProfileFrameAtCum(nr.cum,physicsRoadFrameScratch):null;
    if(onPavement&&!physicsRoadFrame){
      ensureRoadProfileNear(absX,absZ);
      physicsRoadFrame=(nr?roadProfileFrameAtCum(nr.cum,physicsRoadFrameScratch):null)||roadFrameAt(absX,absZ,physicsRoadFrameScratch);
    }
    const gradeForce=computeGradeAcceleration({onPavement,roadFrame:physicsRoadFrame,heading,airborne:airborneNow,x:absX,z:absZ,terrainHeightAt:terrainAbs},dynamicsScratch.grade);
    accel+=gradeForce.acceleration;

    if(Math.abs(speed)>.05){
      const surfaceDrag=onPavement?Math.max(0,(1-surfaceGrip)*.75):VEHICLE.offroadDrag;
      const rollingAndSurface=airborneNow?0:VEHICLE.rolling+surfaceDrag;
      const resist=rollingAndSurface+VEHICLE.aero*speed*speed+combination.rollingResistanceAccel+combination.aeroDragCoeff*speed*speed;
      accel-=Math.sign(speed)*resist;
    }else if(!throttle&&Math.abs(gradeForce.acceleration)<.04)speed=0;

    if(hand&&!airborneNow){
      const handRequest=-Math.sign(speed||gradeForce.acceleration||1)*8.5;
      accel+=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:handRequest,surfaceMu:longitudinalMu,mode:'handbrake',airborne:false,speedAbs:longitudinalSpeedAbs},dynamicsScratch.handbrake).acceleration;
    }

    speed+=accel*dt;

    if(!airborneNow&&!onPavement&&speed>0){
      const profile=activeTransmissionProfile();
      if(profile.type==='combustion'){
        const terrainRedline=effectiveEngineRedlineRpm(profile,false);
        const terrainMechanicalTop=transmissionRedlineSpeedKmh(profile,terrainRedline)/3.6;
        if(speed>terrainMechanicalTop){
          const excess=speed-terrainMechanicalTop;
          const terrainOverspeedResistance=Math.min(13.5,4.5+excess*.55);
          speed=Math.max(terrainMechanicalTop,speed-terrainOverspeedResistance*dt);
        }
      }else{
        const offroadEvMax=MAX*.80;
        if(speed>offroadEvMax)speed=Math.max(offroadEvMax,speed-12.5*dt);
      }
    }

    const mechanicalTop=vehicleTopSpeedKmh();
    const userSpeedCapActive=maxSpeedKmh<mechanicalTop-.5;
    const hardForwardCap=userSpeedCapActive?MAX:Infinity;
    const hardReverseCap=vehicleReverseLimitMps();
    speed=Math.max(hardReverseCap,Math.min(hardForwardCap,speed));
    if(previousSpeed>0&&speed<0&&!throttle)speed=0;
    if(previousSpeed<0&&speed>0&&!throttle)speed=0;
    longitudinalAccel=(speed-previousSpeed)/Math.max(dt,.001);

    const speedAbs=Math.abs(speed);
    let assistedTurn=turn;
    if(assist&&!autopilot&&!airborneNow&&!hand&&nr&&routeLength&&nr.d<9.5&&speed>2){
      let routeHeading=nr.angle,routeDirection=1;
      if(Math.abs(angleDelta(routeHeading+Math.PI,heading))<Math.abs(angleDelta(routeHeading,heading))){routeHeading+=Math.PI;routeDirection=-1;}
      const laneOffset=1.65;
      const lookAhead=Math.max(10,Math.min(36,9+speedAbs*.72));
      const targetCum=Math.max(0,Math.min(routeLength-1,nr.cum+routeDirection*lookAhead));
      const target=routePointAtCum(targetCum);
      if(target){
        const targetHeading=target.angle+(routeDirection<0?Math.PI:0);
        const rightX=-Math.cos(targetHeading),rightZ=Math.sin(targetHeading);
        const targetX=target.x+rightX*laneOffset,targetZ=target.z+rightZ*laneOffset;
        const desiredHeading=Math.atan2(targetX-absX,targetZ-absZ);
        const assistHeadingError=angleDelta(desiredHeading,heading);
        const laneAssist=laneKeepAssistCommand({speedAbs,headingError:assistHeadingError,manualInput:manualTurn,frontSlipAmount,rearSlipAmount,airborne:false,handbrake:false});
        assistedTurn=physicsClamp(manualTurn+laneAssist.input,-1,1);
      }
    }

    const steeringModel=steeringCommand({vehicle:VEHICLE,speedAbs,input:assistedTurn},dynamicsScratch.steering);
    steer=advanceSteeringRack({current:steer,target:steeringModel.target,dt,inputSlewRate:steeringModel.inputSlewRate,returnSlewRate:steeringModel.returnSlewRate,inputRate:steeringModel.inputRate,returnRate:steeringModel.returnRate});
    if(steeringModel.target===0&&Math.abs(steer)<.008)steer=0;
    const steerAngle=steer*steeringModel.maxRoadWheelAngle;
    currentSteerAngle=steerAngle;

    const bodyLongitudinalSpeed=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});
    const steeringTravelSpeed=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:hand});
    const steeringAuthority=postSpinSteeringAuthority({rearSlipAmount,heading,velocityHeading,handbrake:hand});
    const lateralEnvelope=lateralDynamicsEnvelope({vehicle:VEHICLE,speed:steeringTravelSpeed,steerAngle,steerInput:steer,driveThrottle,onPavement,surfaceGrip,awdOffroadGripBonus,rearSlipAmount:0,airborne:airborneNow},dynamicsScratch.lateral);
    let yawRate=lateralEnvelope.yawRate*truckTrailerSystem.tractorYawScale(speedAbs)*steeringAuthority;
    const drivetrain=lateralEnvelope.drivetrain;
    const powerCorneringLoad=lateralEnvelope.powerCorneringLoad;
    const requestedLatAccel=lateralEnvelope.requestedLatAccel*steeringAuthority;
    const latLimit=lateralEnvelope.latLimit;
    const signedLatAccel=lateralEnvelope.signedLatAccel*steeringAuthority;

    gripSolverAccumulator+=dt;
    let perWheelGrip=dynamicsScratch.grip;
    if(gripSolverAccumulator>=GRIP_SOLVER_INTERVAL||!perWheelGrip?.smoothed?.length){
      const gripDt=Math.min(.10,Math.max(dt,gripSolverAccumulator));
      gripSolverAccumulator%=GRIP_SOLVER_INTERVAL;
      const tireSolverLatAccel=Math.min(Math.max(0,requestedLatAccel),Math.max(0,latLimit));
      const tireSolverSignedLatAccel=Math.sign(signedLatAccel||steerAngle||1)*tireSolverLatAccel;
      perWheelGrip=estimateWheelGripUsage({
        requestedLatAccel:tireSolverLatAccel,signedLatAccel:tireSolverSignedLatAccel,latLimit,longitudinalAccel,
        propulsionAccel:driveForce.acceleration,serviceBrakeAccel:brakeForce.acceleration,
        surfaceMu:longitudinalMu,throttle:driveThrottle,handbrake:hand,airborne:airborneNow,vehicle:VEHICLE,speedAbs,
        contacts:vehiclePresentation?.wheelContacts||[],previousUsage:wheelGripUsage,dt:gripDt
      },dynamicsScratch.grip);
    }

    physicsShadow.advance(dt,{
      vehicleId:getVehicleId?.()||'unknown',vehicle:VEHICLE,contacts:vehiclePresentation?.wheelContacts||[],speed,heading,velocityHeading,
      yawRate:dynamicYawRate,centerSteerAngle:steerAngle,longitudinalAccel,lateralAccel:signedLatAccel,
      requestedDriveAccel,requestedBrakeAccel,handbrake:hand,surfaceId:onPavement?'asphalt-dry':'dirt'
    });

    wheelGripUsage=perWheelGrip.smoothed;
    wheelSlipLevels=perWheelGrip.slip;
    wheelLateralUsage=perWheelGrip.lateralUsage;
    wheelLongitudinalUsage=perWheelGrip.longitudinalUsage;

    const handbrakeLateralEffect=hand&&!airborneNow?handbrakeLateralEffectForSpeed(speedAbs):1;
    const targetFrontSlip=perWheelGrip.frontLateral;
    const targetRearSlip=perWheelGrip.rearLateral*handbrakeLateralEffect;
    let frictionYawAccel=Number.isFinite(perWheelGrip.frictionYawAccel)?perWheelGrip.frictionYawAccel:0;
    const rawNetLateralAccel=Number.isFinite(perWheelGrip.netLateralAccel)?perWheelGrip.netLateralAccel:signedLatAccel;
    const rawRearLateralForceScale=Number.isFinite(perWheelGrip.rearLateralForceScale)?physicsClamp(perWheelGrip.rearLateralForceScale,0,1):1;

    if(hand&&!airborneNow)frictionYawAccel*=handbrakeLateralEffect;
    const netLateralAccel=hand&&!airborneNow
      ?signedLatAccel+(rawNetLateralAccel-signedLatAccel)*handbrakeLateralEffect
      :rawNetLateralAccel;
    const rearLateralForceScale=hand&&!airborneNow
      ?1-(1-rawRearLateralForceScale)*handbrakeLateralEffect
      :rawRearLateralForceScale;
    const rearLateralForceLoss=Math.abs(signedLatAccel)>.15?1-rearLateralForceScale:0;
    const slipDt=Math.min(.05,dt);
    const lowSpeedSlipReleaseBoost=1+(1-physicsClamp(speedAbs/8,0,1))*1.6;

    frontSlipAmount+=(targetFrontSlip-frontSlipAmount)*(1-Math.exp(-slipDt*(targetFrontSlip>frontSlipAmount?7.8:5.8*lowSpeedSlipReleaseBoost)));
    rearSlipAmount+=(targetRearSlip-rearSlipAmount)*(1-Math.exp(-slipDt*(targetRearSlip>rearSlipAmount?7.8:5.8*lowSpeedSlipReleaseBoost)));
    if(airborneNow){frontSlipAmount*=Math.exp(-dt*5);rearSlipAmount*=Math.exp(-dt*5);}
    else if(justLanded){
      const landingSeed=landingSideslipGripSeed({sideslipRad:angleDelta(velocityHeading,heading),speedAbs});
      if(landingSeed>0){
        frontSlipAmount=Math.max(frontSlipAmount,landingSeed);
        rearSlipAmount=Math.max(rearSlipAmount,landingSeed);
        lateralGripUsage=Math.max(lateralGripUsage,landingSeed*.82);
      }
    }

    const rawGripUsage=onPavement&&!airborneNow&&latLimit>0?Math.min(1.35,requestedLatAccel/latLimit):0;
    const gripResponse=rawGripUsage>lateralGripUsage?12:18;
    lateralGripUsage+=(rawGripUsage-lateralGripUsage)*(1-Math.exp(-dt*gripResponse));
    if(lateralGripUsage<.002&&rawGripUsage===0)lateralGripUsage=0;
    if(requestedLatAccel>latLimit&&requestedLatAccel>0)yawRate*=latLimit/requestedLatAccel;

    const frontDominance=Math.max(0,frontSlipAmount-rearSlipAmount*.55);
    const rearDominance=Math.max(0,rearSlipAmount-frontSlipAmount*.55);
    const fourWheelSlide=Math.min(frontSlipAmount,rearSlipAmount);
    if(!airborneNow)yawRate*=Math.max(.46,1-frontDominance*.54-fourWheelSlide*.24);

    if(drivetrain==='RWD'&&powerCorneringLoad>.05&&!airborneNow){
      const powerOversteerYaw=VEHICLE.powerOversteerYaw??.035;
      const rearSlipYaw=Math.sign(steer||1)*powerOversteerYaw*powerCorneringLoad*(.30+rearDominance*.70)*Math.min(1,speedAbs/18);
      yawRate+=rearSlipYaw*Math.sign((hand?speed:steeringTravelSpeed)||speed||1)*steeringAuthority;
    }

    if(Math.abs(steerAngle)>.006&&Math.abs(yawRate)>1e-5&&frictionYawAccel*yawRate<0)frictionYawAccel=0;
    const yawResponse=yawResponseRate({vehicle:VEHICLE,speedAbs,airborne:airborneNow});
    const yawReleaseBoost=Math.abs(yawRate)<Math.abs(dynamicYawRate)?1.35:1;
    const frictionYawLoss=physicsClamp(Math.abs(frictionYawAccel)/4.5,0,1);
    const forceCoupledSlide=physicsClamp(Math.max(frictionYawLoss,rearLateralForceLoss),0,1);
    const yawGripResponseScale=Math.max(.34,1-forceCoupledSlide*.66);
    dynamicYawRate+=frictionYawAccel*dt;
    dynamicYawRate+=(yawRate-dynamicYawRate)*(1-Math.exp(-dt*yawResponse*yawReleaseBoost*yawGripResponseScale));
    heading+=dynamicYawRate*dt;

    if(!airborneNow&&fourWheelSlide>.01&&speedAbs>6){
      const scrubDecel=1.0+fourWheelSlide*3.2,scrubDelta=scrubDecel*dt;
      if(speed>0)speed=Math.max(0,speed-scrubDelta);else if(speed<0)speed=Math.min(0,speed+scrubDelta);
    }

    if(!airborneNow&&assist&&autopilot&&nr&&nr.d<12&&speedAbs>2){
      let routeHeading=nr.angle;
      if(Math.abs(angleDelta(routeHeading+Math.PI,heading))<Math.abs(angleDelta(routeHeading,heading)))routeHeading+=Math.PI;
      const hErr=angleDelta(routeHeading,heading);heading+=hErr*dt*.55;
      if(nr.d>.55){
        const centerRate=.48;
        absX+=(nr.px-absX)*(1-Math.exp(-dt*centerRate));absZ+=(nr.pz-absZ)*(1-Math.exp(-dt*centerRate));
      }
    }

    if(!Number.isFinite(velocityHeading)||Math.abs(speed)<1.2)velocityHeading=heading;
    const trajectoryRearSlip=Math.max(0,rearSlipAmount-frontSlipAmount*.45);
    const frictionTrajectoryLoss=frictionYawLoss;
    const lowSpeedNoSlip=!airborneNow&&speedAbs<8.5&&forceCoupledSlide<.18&&frontSlipAmount<.16&&rearSlipAmount<.16;
    const momentumTargetHeading=bodyRelativeMomentumTargetHeading({speed,heading,velocityHeading});

    if(lowSpeedNoSlip){
      if(speedAbs<2.5)velocityHeading=momentumTargetHeading;
      else{
        const lowSpeedLockT=1-physicsClamp((speedAbs-2.5)/6.0,0,1);
        const lowSpeedFollowRate=34+lowSpeedLockT*48;
        velocityHeading+=angleDelta(momentumTargetHeading,velocityHeading)*(1-Math.exp(-dt*lowSpeedFollowRate));
      }
    }else{
      let attemptedTrajectoryDelta=0;
      if(!airborneNow&&speedAbs>4&&forceCoupledSlide>.10){
        const signedSpeedForCurvature=Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5;
        const forceTrajectoryYawRate=netLateralAccel/signedSpeedForCurvature;
        attemptedTrajectoryDelta+=forceTrajectoryYawRate*dt;
        const slideAlignmentRate=.65+(1-forceCoupledSlide)*3.20;
        attemptedTrajectoryDelta+=angleDelta(momentumTargetHeading,velocityHeading)*(1-Math.exp(-dt*slideAlignmentRate));
      }else{
        const velocityFollowRate=airborneNow?0:((2.8-1.45*frictionTrajectoryLoss)+27.2*Math.pow(1-physicsClamp(trajectoryRearSlip,0,1),2));
        attemptedTrajectoryDelta+=angleDelta(momentumTargetHeading,velocityHeading)*(1-Math.exp(-dt*velocityFollowRate));
      }
      const rawTrajectoryLateralCapacityAccel=Number.isFinite(perWheelGrip.trajectoryLateralCapacityAccel)?Math.max(0,perWheelGrip.trajectoryLateralCapacityAccel):Math.max(0,latLimit);
      const trajectoryLateralCapacityAccel=hand&&!airborneNow
        ?latLimit+(rawTrajectoryLateralCapacityAccel-latLimit)*handbrakeLateralEffect
        :rawTrajectoryLateralCapacityAccel;
      velocityHeading+=limitMomentumHeadingDelta({attemptedDelta:attemptedTrajectoryDelta,speedAbs,lateralCapacityAccel:trajectoryLateralCapacityAccel,dt,airborne:airborneNow});
    }

    absX+=Math.sin(velocityHeading)*speed*dt;absZ+=Math.cos(velocityHeading)*speed*dt;
    syncState();recenterIfNeeded(absX,absZ);
    const worldOffset=getWorldOffset();const rx=absX-worldOffset.x,rz=absZ-worldOffset.z;

    if(nr){if(!roadContact&&nr.d<8.5)roadContact=true;else if(roadContact&&nr.d>11)roadContact=false;}else roadContact=false;
    let roadFrame=roadFrameAt(absX,absZ);
    if(roadContact&&(!roadFrame||roadFrame.distance>18))roadFrame=ensureRoadProfileNear(absX,absZ);
    const onRoad=roadContact&&roadFrame&&roadFrame.distance<18;
    currentOnPavementForInstruments=!!onRoad;
    const contactModeText=onRoad?'Route':'Terrain';
    if(contactModeText!==lastContactModeText){lastContactModeText=contactModeText;$('contactMode').textContent=contactModeText;}
    updateRunChallenge(onRoad,nr);
    const terrainFrame=!onRoad?terrainFrameAt(absX,absZ,heading):null;
    let centerRoadSurfaceY=null;
    if(onRoad&&roadFrame){
      const normalX=-Math.cos(roadFrame.angle||0),normalZ=Math.sin(roadFrame.angle||0);
      const centerLateral=(absX-roadFrame.px)*normalX+(absZ-roadFrame.pz)*normalZ;
      centerRoadSurfaceY=roadFrame.y+Math.tan(roadFrame.roll||0)*centerLateral+ROAD_SURFACE_OFFSET;
    }
    setFastWheelRoadSupport(onRoad,roadFrame,centerRoadSurfaceY,absX,absZ);
    const baseGround=onRoad?(centerRoadSurfaceY??roadFrame.y+ROAD_SURFACE_OFFSET):(terrainFrame?terrainFrame.y:terrainAbs(absX,absZ));
    const targetY=baseGround+.38+(onRoad?TIRE_VISUAL_CLEARANCE:0);void targetY;
    car.position.x=rx;car.position.z=rz;car.rotation.set(0,heading,0);
    vehiclePresentation.updateSuspensionVisuals(dt,onRoad,steerAngle);
    visualSteer+=(steerAngle-visualSteer)*(1-Math.exp(-dt*7));
    vehiclePresentation.updateWheels(dt,speed,visualSteer);

    skidMarks.updateLocal({contacts:vehiclePresentation.wheelContacts,onRoad,speed,steerAngle,lateralGripUsage,wheelGripUsage,wheelSlipLevels,wheelLateralUsage,wheelLongitudinalUsage,longitudinalAccel,handbrake:hand,vehicle:VEHICLE,dt});

    driveHudAccumulator+=dt;minimapAccumulator+=dt;
    if(driveHudAccumulator>=DRIVE_HUD_INTERVAL){
      driveHudAccumulator%=DRIVE_HUD_INTERVAL;$('speed').textContent=Math.round(Math.abs(speed)*3.6);
      const llNow=xzToLL(absX,absZ);const realElev=elevationService.elevationAt(llNow.lat,llNow.lon);
      altitudeEl.textContent=realElev!==null&&Number.isFinite(realElev)?Math.round(realElev):'—';
      const frameNow=roadFrameAt(absX,absZ);$('grade').textContent=frameNow?(Math.tan(frameNow.pitch)*100).toFixed(1):'0.0';
      if(nr){
        const pct=100*nr.cum/routeLength;$('progress').textContent=pct.toFixed(1);
        $('doneKm').textContent=(nr.cum/1000).toFixed(1);$('remainKm').textContent=((routeLength-nr.cum)/1000).toFixed(1);
        $('roadDist').textContent=Math.round(nr.d);updatePassedSignReadout(nr);
      }
    }
    if(nr&&minimapAccumulator>=MINIMAP_INTERVAL){minimapAccumulator%=MINIMAP_INTERVAL;drawMap(nr.cum);}
    worldStreamingAccumulator+=dt;
    if(worldStreamingAccumulator>=WORLD_STREAMING_INTERVAL){worldStreamingAccumulator%=WORLD_STREAMING_INTERVAL;worldStreaming.updateVisible(absX,absZ);}
    syncState();
  }

  return {update,physicsShadowDiagnostics:()=>physicsShadow.diagnostics()};
}
