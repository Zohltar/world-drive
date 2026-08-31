import { createPerWheelShadowSolver } from './physics/per-wheel-shadow-solver.js';
import { effectiveTireFriction, tireProfileForVehicle } from './physics/tire-model.js';
import { tireForceTrajectoryYawRate } from './physics/drift-force-coupling.js';
import { serviceBrakeAcceleration, brakeWouldCrossZero } from './physics/longitudinal-control.js';
import {
  createManeuverState,
  jTurnTransientSteeringSpeed
} from './physics/maneuver-state.js';
import {
  advanceMomentumDirection,
  bodyAxisDriveProjection,
  bodyRelativeLateralSpeed,
  bodyRelativeLongitudinalSpeed,
  bodyRelativeMomentumTargetHeading,
  bodyRelativeSteeringSpeed,
  resolveOpposingDriveMomentumCrossing,
  shouldCanonicalizeMomentumHeading,
  travelAxisSideslip
} from './physics/momentum-direction.js';
export {
  bodyAxisDriveProjection,
  bodyRelativeLateralSpeed,
  bodyRelativeLongitudinalSpeed,
  bodyRelativeMomentumTargetHeading,
  bodyRelativeSteeringSpeed,
  resolveOpposingDriveMomentumCrossing,
  shouldCanonicalizeMomentumHeading,
  travelAxisSideslip
};
import {
  advanceYawAuthority,
  driftKinematicCoupling,
  legacyGripYawAcceleration
} from './physics/yaw-authority.js';
export {driftKinematicCoupling,legacyGripYawAcceleration};

function smoothstep01(value){
  const t=Math.max(0,Math.min(1,Number(value)||0));
  return t*t*(3-2*t);
}

const GRAVITY=9.80665;

// Grip R5 — physical off-road sideslip friction. The V21.27 tire/surface model
// already knows the tire compound and dirt peak/sliding friction; use that same
// model for the authoritative terrain path instead of a steering-demand proxy.
export function offroadTireFriction({vehicleId='unknown',vehicle={}}={}){
  const tire=tireProfileForVehicle(vehicleId,vehicle);
  const massKg=Math.max(250,Number(vehicle?.massKg)||1500);
  const normalLoadN=massKg*GRAVITY/4;
  return effectiveTireFriction({tire,surface:'dirt',normalLoadN});
}

export function offroadSideslipFriction({
  speed=0,heading=0,velocityHeading=0,slideMu=.45,airborne=false
}={}){
  const signedSpeed=Number(speed)||0;
  const speedAbs=Math.abs(signedSpeed);
  if(airborne||speedAbs<.35)return {speedDecel:0,momentumYawRate:0,slideGate:0,sideslipRad:0};

  // velocityHeading parameterizes the signed scalar speed. Convert it to the
  // actual direction of travel before resolving velocity in the chassis frame.
  const travelHeading=(Number(velocityHeading)||0)+(signedSpeed<0?Math.PI:0);
  let delta=travelHeading-(Number(heading)||0);
  delta=Math.atan2(Math.sin(delta),Math.cos(delta));
  const lateral=Math.sin(delta);
  const longitudinal=Math.cos(delta);
  const sideslip=Math.atan2(Math.abs(lateral),Math.abs(longitudinal));

  // Below the tire's normal slip-angle region there is no sliding work. Once
  // the tire is genuinely skidding, kinetic dirt friction opposes contact-patch
  // lateral velocity. This is continuous and has no 90-degree branch.
  const slideGate=smoothstep01((sideslip-.10)/.32);
  const speedGate=smoothstep01((speedAbs-.6)/2.4);
  const frictionAccel=GRAVITY*Math.max(.08,Math.min(1.20,Number(slideMu)||.45))*slideGate*speedGate;

  // Work done by lateral friction removes kinetic energy at a rate proportional
  // to the lateral fraction of velocity. The perpendicular component bends the
  // momentum vector toward the nearest chassis travel axis. At exactly 90 deg
  // it only slows the vehicle — it cannot create an artificial rotation wall.
  const speedDecel=frictionAccel*Math.abs(lateral);
  const momentumYawRate=
    -frictionAccel*Math.sign(lateral||0)*longitudinal/Math.max(.50,speedAbs);

  return {speedDecel,momentumYawRate,slideGate,sideslipRad:sideslip};
}

// Grip R2 — locked-tire friction must follow the slip velocity at the rear
// contact patch, not the sideslip measured at the chassis centre of mass.
// Yaw contributes an opposite lateral velocity at an axle behind the CG.
export function rearContactPatchSideslip({speed=0,heading=0,velocityHeading=0,yawRate=0,wheelbase=2.7,frontWeightBias=.55}={}){
  let delta=(Number(velocityHeading)||0)-(Number(heading)||0);
  delta=Math.atan2(Math.sin(delta),Math.cos(delta));
  const v=Number(speed)||0;
  const bodyLong=bodyRelativeLongitudinalSpeed({speed:v,heading,velocityHeading});
  const bodyLat=bodyRelativeLateralSpeed({speed:v,heading,velocityHeading});
  const rearDistance=Math.max(.35,(Number(wheelbase)||2.7)*Math.max(.30,Math.min(.75,Number(frontWeightBias)||.55)));
  const rearLat=bodyLat-(Number(yawRate)||0)*rearDistance;
  return Math.atan2(rearLat,Math.max(.50,Math.abs(bodyLong)));
}

export function rearAxleStaticLoadFraction(vehicle={}){
  const axles=Array.isArray(vehicle?.axles)?vehicle.axles:[];
  if(axles.length>=2){
    const rear=axles.filter(axle=>(Number(axle?.positionM)||0)<0).reduce((sum,axle)=>sum+Math.max(0,Number(axle?.staticLoadFraction)||0),0);
    if(rear>0)return Math.max(.05,Math.min(.90,rear));
  }
  return Math.max(.05,Math.min(.90,1-(Number(vehicle?.frontWeightBias)||.55)));
}

export function handbrakeDriveRetentionScale({vehicle={},handbrake=false}={}){
  if(!handbrake)return 1;
  const drivetrain=String(vehicle?.drivetrain||'AWD');
  if(drivetrain==='FWD')return 1;
  if(drivetrain==='RWD')return 0;
  return Math.max(0,Math.min(1,Number(vehicle?.driveBiasFront)||.5));
}

export function handbrakeLongitudinalDecelCapacity({vehicle={},longitudinalMu=1,slidingMuRatio=.72}={}){
  const rearLoad=rearAxleStaticLoadFraction(vehicle);
  const mu=Math.max(.05,Number(longitudinalMu)||1);
  const slide=Math.max(.50,Math.min(.95,Number(slidingMuRatio)||.72));
  return GRAVITY*rearLoad*mu*slide;
}

// Grip R1 — wheel lock/recovery is continuous, not tied to the button edge.
export function landingSideslipGripSeed({sideslipRad=0,speedAbs=0}={}){
  const slip=Math.abs(Number(sideslipRad)||0);
  const speed=Math.max(0,Math.abs(Number(speedAbs)||0));
  const slipT=smoothstep01((slip-.035)/.19);
  const speedT=smoothstep01((speed-3.5)/7.5);
  return Math.min(.92,slipT*speedT*.92);
}

export function createDrivingRuntime({
  getState,setState,getFlags,getRouteLength,getWorldOffset,nearestRouteForVehicle,
  autopilotControl,keyboardActionDown,gamepadState,updateTransmission,getServiceBrakeInput,
  vehiclePresentation,vehicleVisuals,truckTrailerSystem,roadSurfaceGrip,getVehicleId,
  VEHICLE,vehicleTopSpeedKmh,activeTransmissionProfile,effectiveEngineRedlineRpm,
  transmissionRedlineSpeedKmh,vehicleReverseLimitMps,physicsClamp,
  longitudinalTractionLimit,computeGradeAcceleration,physicsRoadFrameScratch,
  dynamicsScratch,roadProfileFrameAtCum,ensureRoadProfileNear,roadFrameAt,terrainAbs,
  routePointAtCum,laneKeepAssistCommand,angleDelta,steeringCommand,advanceSteeringRack,
  lateralDynamicsEnvelope,estimateWheelGripUsage,yawResponseRate,
  recenterIfNeeded,updateRunChallenge,terrainFrameAt,ROAD_SURFACE_OFFSET,
  TIRE_VISUAL_CLEARANCE,setFastWheelRoadSupport,car,skidMarks,xzToLL,elevationService,
  altitudeEl,updatePassedSignReadout,drawMap,worldStreaming,$,DRIVE_HUD_INTERVAL,
  MINIMAP_INTERVAL,GRIP_SOLVER_INTERVAL,WORLD_STREAMING_INTERVAL,
}){
  const physicsShadow=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  let wasAirborne=false;
  const maneuverState=createManeuverState();

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
    const offroadFrictionModel=!onPavement&&!airborneNow
      ?offroadTireFriction({vehicleId:getVehicleId?.()||'unknown',vehicle:VEHICLE})
      :null;
    const offroadSlipForce=offroadFrictionModel
      ?offroadSideslipFriction({speed,heading,velocityHeading,slideMu:offroadFrictionModel.slide,airborne:airborneNow})
      :{speedDecel:0,momentumYawRate:0,slideGate:0,sideslipRad:0};
    const preDriveBodyLongitudinalSpeed=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});
    const driveAxisProjection=bodyAxisDriveProjection({heading,velocityHeading});
    const driveThrottle=updateTransmission(dt,throttle,onPavement);
    // Grip R9 — service brake is an independent force channel. The legacy
    // signed-throttle adapter used body-relative speed to decide whether the
    // same input meant braking or reverse propulsion; around 90 degrees of a
    // J-turn that projection crosses zero while real momentum is still large.
    const fallbackServiceBrake=Math.max(0,-(Number(throttle)||0));
    const serviceBrakeInput=physicsClamp(
      Number(typeof getServiceBrakeInput==='function'?getServiceBrakeInput():fallbackServiceBrake)||0,
      0,
      1
    );

    const brakeRequested=hand||serviceBrakeInput>.04;
    countachBrakeLightRequested=brakeRequested;
    countachReverseLightRequested=(speed<-.08)||(driveThrottle<-.04&&speed<=.15);
    vehicleVisuals.updateBrakeLights(dt,brakeRequested);
    truckTrailerSystem.setBrakeLights(brakeRequested);
    const combination=truckTrailerSystem.longitudinalScales();
    const previousSpeed=speed;
    const surfaceGrip=onPavement?roadSurfaceGrip():1;
    const isAWD=VEHICLE.drivetrain==='AWD';
    const awdOffroadGripBonus=!onPavement&&isAWD?1.18:1;
    let requestedBodyDriveAccel=0,requestedBrakeAccel=0;

    if(driveThrottle>0){
      const performanceTop=vehicleTopSpeedKmh()/3.6;
      const speedRatio=Math.min(1,Math.max(0,Math.abs(speed)/performanceTop));
      const powerTaper=truckTrailerSystem.active?1:1-.38*speedRatio;
      // Grip R17: selector D always requests forward BODY-axis tire force.
      // Projection onto the current momentum is applied only after traction is
      // resolved; it must never reverse wheel torque beyond 90 degrees.
      requestedBodyDriveAccel=
        VEHICLE.accel*
        driveThrottle*
        powerTaper;
    }else if(driveThrottle<0){
      // Negative drivetrain command means reverse BODY-axis propulsion only.
      requestedBodyDriveAccel=
        VEHICLE.reverseAccel*
        driveThrottle;
    }

    requestedBrakeAccel=serviceBrakeAcceleration({
      serviceBrake:serviceBrakeInput,
      speed,
      maxBrakeAccel:VEHICLE.brake,
      airborne:airborneNow
    });
    requestedBodyDriveAccel*=truckTrailerSystem.active?truckTrailerSystem.driveAccelScaleForSpeed(Math.abs(speed)):combination.driveAccelScale;
    requestedBrakeAccel*=combination.serviceBrakeScale;
    const longitudinalSpeedAbs=Math.abs(speed);
    const offroadStaticTractionT=1-physicsClamp(Math.abs(speed)/7,0,1);
    const offroadStaticTractionBoost=1+.12*offroadStaticTractionT;
    const longitudinalMu=onPavement
      ?Math.max(.25,((VEHICLE.longitudinalAccelLimit??VEHICLE.brake??9.8)/9.80665)*surfaceGrip)
      :Math.max(.22,(VEHICLE.offroadGrip??.60)*awdOffroadGripBonus*offroadStaticTractionBoost);

    const driveForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedBodyDriveAccel,surfaceMu:longitudinalMu,mode:'drive',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.drive);
    const brakeForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedBrakeAccel,surfaceMu:longitudinalMu,mode:'brake',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.brake);
    const appliedBodyDriveAccelRaw=driveForce.acceleration;
    const handbrakeDriveScale=handbrakeDriveRetentionScale({vehicle:VEHICLE,handbrake:hand});
    const appliedBodyDriveAccel=appliedBodyDriveAccelRaw*handbrakeDriveScale;
    const driveMomentumAccel=appliedBodyDriveAccel*driveAxisProjection;
    let accel=driveMomentumAccel+brakeForce.acceleration;

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

    // Grip R5: terrain lateral scrub is real dissipative work, independent of
    // steering input or the legacy fourWheelSlide telemetry.
    if(!onPavement&&!airborneNow&&offroadSlipForce.speedDecel>1e-5&&Math.abs(speed)>.05){
      accel-=Math.sign(speed)*offroadSlipForce.speedDecel;
    }

    if(hand&&!airborneNow){
      // Grip R18 — the handbrake acts through the rear axle only. The previous
      // whole-car 8.5 m/s² request double-counted rear lock and could stop a
      // slower-rotating chassis before it crossed 90 degrees.
      const handbrakeSlidingMuRatio=physicsClamp(Number(VEHICLE.handbrakeSlidingMuRatio??.72)||.72,.65,.90);
      const handCapacity=handbrakeLongitudinalDecelCapacity({vehicle:VEHICLE,longitudinalMu,slidingMuRatio:handbrakeSlidingMuRatio});
      const handRequest=-Math.sign(speed||gradeForce.acceleration||1)*handCapacity;
      accel+=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:handRequest,surfaceMu:longitudinalMu*handbrakeSlidingMuRatio,mode:'handbrake',airborne:false,speedAbs:longitudinalSpeedAbs},dynamicsScratch.handbrake).acceleration;
    }

    const opposingBodyTravel=
      (driveThrottle>.04&&preDriveBodyLongitudinalSpeed<-.15)||
      (driveThrottle<-.04&&preDriveBodyLongitudinalSpeed>.15);
    speed+=accel*dt;
    const serviceBrakeCrossedZero=brakeWouldCrossZero({
      previousSpeed,
      nextSpeed:speed,
      serviceBrake:serviceBrakeInput
    });
    const crossedSignedSpeed=
      Math.abs(previousSpeed)>.02&&
      Math.sign(speed)!==Math.sign(previousSpeed);
    if(serviceBrakeCrossedZero&&crossedSignedSpeed){
      // A service brake can genuinely remove all translational momentum.
      speed=0;
      velocityHeading=heading;
    }else if(opposingBodyTravel&&crossedSignedSpeed){
      // Grip R17: drivetrain force is a BODY-axis vector. Near a J-turn's
      // 90-degree region its perpendicular impulse survives even when the old
      // scalar projection crosses zero, so preserve that vector momentum.
      const resolved=resolveOpposingDriveMomentumCrossing({
        previousSpeed,velocityHeading,heading,
        nonDriveDeltaSpeed:(accel-driveMomentumAccel)*dt,
        bodyDriveAccel:appliedBodyDriveAccel,dt
      });
      speed=resolved.speed;
      velocityHeading=resolved.velocityHeading;
    }

    // V21.31 stress: no separate off-road speed governor. Terrain performance is
    // now determined only by traction, off-road grip/drag, aero, grade and the
    // normal transmission/vehicle physics model above.

    const mechanicalTop=vehicleTopSpeedKmh();
    const userSpeedCapActive=maxSpeedKmh<mechanicalTop-.5;
    const hardForwardCap=userSpeedCapActive?MAX:Infinity;
    const hardReverseCap=vehicleReverseLimitMps();
    speed=Math.max(hardReverseCap,Math.min(hardForwardCap,speed));
    if(previousSpeed>0&&speed<0&&!throttle)speed=0;
    if(previousSpeed<0&&speed>0&&!throttle)speed=0;
    longitudinalAccel=(speed-previousSpeed)/Math.max(dt,.001);

    const speedAbs=Math.abs(speed);
    const currentSideslip=travelAxisSideslip({heading,velocityHeading});
    const rearTireSideslip=rearContactPatchSideslip({
      speed,heading,velocityHeading,yawRate:dynamicYawRate,
      wheelbase:VEHICLE.wheelbase,frontWeightBias:VEHICLE.frontWeightBias
    });
    const rearHandbrakeSlipState=maneuverState.advanceRearHandbrakeSlip({handbrake:hand,airborne:airborneNow,speedAbs,sideslipRad:currentSideslip,dt});
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
    const jTurnLatchedActive=maneuverState.advanceJTurn({
      bodyLongitudinalSpeed,
      speedAbs,
      steerAngle,
      handbrake:hand,
      airborne:airborneNow,
      onPavement,
      sideslipRad:currentSideslip
    });
    const baseSteeringTravelSpeed=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:hand});
    const steeringTravelSpeed=jTurnTransientSteeringSpeed({
      speed,
      fallbackSpeed:baseSteeringTravelSpeed,
      active:jTurnLatchedActive
    });
    const lateralEnvelope=lateralDynamicsEnvelope({vehicle:VEHICLE,speed:steeringTravelSpeed,steerAngle,steerInput:steer,driveThrottle,onPavement,surfaceGrip,awdOffroadGripBonus,offroadPeakMu:offroadFrictionModel?.peak,rearSlipAmount:0,airborne:airborneNow},dynamicsScratch.lateral);
    let yawRate=lateralEnvelope.yawRate*truckTrailerSystem.tractorYawScale(speedAbs);
    const drivetrain=lateralEnvelope.drivetrain;
    const powerCorneringLoad=lateralEnvelope.powerCorneringLoad;
    const requestedLatAccel=lateralEnvelope.requestedLatAccel;
    const latLimit=lateralEnvelope.latLimit;
    const signedLatAccel=lateralEnvelope.signedLatAccel;
    const physicalSignedLatAccel=Math.sign(signedLatAccel||steerAngle||1)*Math.min(Math.abs(signedLatAccel),Math.max(0,latLimit));

    gripSolverAccumulator+=dt;
    let perWheelGrip=dynamicsScratch.grip;
    if(gripSolverAccumulator>=GRIP_SOLVER_INTERVAL||!perWheelGrip?.smoothed?.length){
      const gripDt=Math.min(.10,Math.max(dt,gripSolverAccumulator));
      gripSolverAccumulator%=GRIP_SOLVER_INTERVAL;
      const tireSolverLatAccel=Math.min(Math.max(0,requestedLatAccel),Math.max(0,latLimit));
      const tireSolverSignedLatAccel=Math.sign(signedLatAccel||steerAngle||1)*tireSolverLatAccel;
      perWheelGrip=estimateWheelGripUsage({
        requestedLatAccel:tireSolverLatAccel,signedLatAccel:tireSolverSignedLatAccel,latLimit,longitudinalAccel,
        propulsionAccel:appliedBodyDriveAccel,serviceBrakeAccel:brakeForce.acceleration,
        surfaceMu:longitudinalMu,throttle:driveThrottle,handbrake:hand,
        handbrakeSlipState:rearHandbrakeSlipState,sideslipRad:rearTireSideslip,
        airborne:airborneNow,vehicle:VEHICLE,speedAbs,
        contacts:vehiclePresentation?.wheelContacts||[],previousUsage:wheelGripUsage,dt:gripDt
      },dynamicsScratch.grip);
    }

    const physicalTireForces=physicsShadow.advance(dt,{
      vehicleId:getVehicleId?.()||'unknown',vehicle:VEHICLE,contacts:vehiclePresentation?.wheelContacts||[],speed,heading,velocityHeading,
      yawRate:dynamicYawRate,centerSteerAngle:steerAngle,longitudinalAccel,lateralAccel:physicalSignedLatAccel,
      requestedDriveAccel:appliedBodyDriveAccelRaw,requestedBrakeAccel,
      longitudinalLoadTransferAccel:appliedBodyDriveAccel+requestedBrakeAccel,
      handbrake:hand,surfaceId:onPavement?'asphalt-dry':'dirt'
    });

    wheelGripUsage=perWheelGrip.smoothed;
    wheelSlipLevels=perWheelGrip.slip;
    wheelLateralUsage=perWheelGrip.lateralUsage;
    wheelLongitudinalUsage=perWheelGrip.longitudinalUsage;

    // Grip R1: lateral force recovery follows residual rear tire slip.
    const targetFrontSlip=perWheelGrip.frontLateral;
    const sideslipDrivenRearSlip=rearHandbrakeSlipState*smoothstep01((currentSideslip-.025)/.42)*.90;
    const targetRearSlip=Math.max(perWheelGrip.rearLateral,sideslipDrivenRearSlip);
    let frictionYawAccel=Number.isFinite(perWheelGrip.frictionYawAccel)?perWheelGrip.frictionYawAccel:0;
    // Grip R6 — no tire contact means no residual tire yaw impulse.
    if(airborneNow)frictionYawAccel=0;
    const netLateralAccel=Number.isFinite(perWheelGrip.netLateralAccel)?perWheelGrip.netLateralAccel:physicalSignedLatAccel;
    const frontLateralForceScale=Number.isFinite(perWheelGrip.frontLateralForceScale)?physicsClamp(perWheelGrip.frontLateralForceScale,0,1):1;
    const rearLateralForceScale=Number.isFinite(perWheelGrip.rearLateralForceScale)?physicsClamp(perWheelGrip.rearLateralForceScale,0,1):1;
    const rearLateralForceLoss=Math.abs(physicalSignedLatAccel)>.15?1-rearLateralForceScale:0;
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
    const useLegacyDriftAssist=VEHICLE?.legacyDriftAssist!==false;
    const physicalTireYawAccel=Number.isFinite(physicalTireForces?.predictedYawAccel)
      ?physicalTireForces.predictedYawAccel
      :frictionYawAccel;
    const physicalTrajectoryYawRate=tireForceTrajectoryYawRate({
      bodyVx:physicalTireForces?.bodyVx,
      bodyVz:physicalTireForces?.bodyVz,
      accelX:physicalTireForces?.predictedAccelX,
      accelZ:physicalTireForces?.predictedAccelZ
    });
    const yawResponse=yawResponseRate({vehicle:VEHICLE,speedAbs,airborne:airborneNow});
    const yawAuthority=advanceYawAuthority({
      yawRate,dynamicYawRate,dt,yawResponse,
      jTurnLatchedActive,requestedLatAccel,latLimit,frontSlipAmount,rearSlipAmount,
      airborne:airborneNow,useLegacyDriftAssist,drivetrain,powerCorneringLoad,steer,
      powerOversteerYaw:VEHICLE.powerOversteerYaw,speedAbs,speed,steeringTravelSpeed,handbrake:hand,
      currentSideslip,frictionYawAccel,rearLateralForceLoss,physicalTireYawAccel,
      targetFrontSlip,targetRearSlip,frontLateralForceScale,rearLateralForceScale
    });
    yawRate=yawAuthority.yawRate;
    dynamicYawRate=yawAuthority.dynamicYawRate;
    const fourWheelSlide=yawAuthority.fourWheelSlide;
    const frictionYawLoss=yawAuthority.frictionYawLoss;
    const forceCoupledSlide=yawAuthority.forceCoupledSlide;
    const driftKinematicScale=yawAuthority.driftKinematicScale;
    const driftPhysicalAuthority=yawAuthority.driftPhysicalAuthority;
    heading+=dynamicYawRate*dt;

    if(onPavement&&!airborneNow&&fourWheelSlide>.01&&speedAbs>6){
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

    const rawTrajectoryLateralCapacityAccel=Number.isFinite(perWheelGrip.trajectoryLateralCapacityAccel)
      ?Math.max(0,perWheelGrip.trajectoryLateralCapacityAccel)
      :Math.max(0,latLimit);
    velocityHeading=advanceMomentumDirection({
      velocityHeading,heading,speed,speedAbs,dt,airborne:airborneNow,
      frontSlipAmount,rearSlipAmount,forceCoupledSlide,
      frictionTrajectoryLoss:frictionYawLoss,
      offroadMomentumYawRate:offroadSlipForce.momentumYawRate,
      onPavement,driftPhysicalAuthority,driftKinematicScale,useLegacyDriftAssist,
      netLateralAccel,physicalTrajectoryYawRate,
      trajectoryLateralCapacityAccel:rawTrajectoryLateralCapacityAccel
    });

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
