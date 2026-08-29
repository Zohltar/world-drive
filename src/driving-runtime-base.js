import { createPerWheelShadowSolver } from './physics/per-wheel-shadow-solver.js';
import { effectiveTireFriction, tireProfileForVehicle } from './physics/tire-model.js';
import {
  driftTireForceAuthority,
  tireForceTrajectoryYawRate,
  blendDriftForce
} from './physics/drift-force-coupling.js';
import { serviceBrakeAcceleration, brakeWouldCrossZero } from './physics/longitudinal-control.js';
import { torqueDrivenAcceleration } from './physics/powertrain-force.js';
import { weightedRoadFraction, blendRoadDirt } from './physics/surface-transition.js';

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

export function bodyRelativeLongitudinalSpeed({speed=0,heading=0,velocityHeading=0}={}){
  const v=Number(speed)||0;
  const bodyDelta=(Number(velocityHeading)||0)-(Number(heading)||0);
  return v*Math.cos(bodyDelta);
}

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

export function bodyRelativeSteeringSpeed({speed=0,heading=0,velocityHeading=0,handbrake=false}={}){
  const v=Number(speed)||0;
  const speedAbs=Math.abs(v);
  if(speedAbs<1e-8)return 0;
  if(handbrake)return Math.sign(v||1)*speedAbs;

  // Grip R4 — use the actual longitudinal velocity seen by the chassis instead
  // of snapping the full speed magnitude from +v to -v around 90 degrees.
  // The bicycle steering model therefore fades continuously to zero as travel
  // becomes sideways, then naturally becomes reverse steering beyond 90 deg.
  return bodyRelativeLongitudinalSpeed({speed:v,heading,velocityHeading});
}

export function travelAxisSideslip({heading=0,velocityHeading=0}={}){
  let delta=(Number(velocityHeading)||0)-(Number(heading)||0);
  delta=Math.atan2(Math.sin(delta),Math.cos(delta));
  return Math.atan2(Math.abs(Math.sin(delta)),Math.abs(Math.cos(delta)));
}

// Grip R2 — locked-tire friction must follow the slip velocity at the rear
// contact patch, not the sideslip measured at the chassis centre of mass.
// Yaw contributes an opposite lateral velocity at an axle behind the CG.
export function rearContactPatchSideslip({speed=0,heading=0,velocityHeading=0,yawRate=0,wheelbase=2.7,frontWeightBias=.55}={}){
  let delta=(Number(velocityHeading)||0)-(Number(heading)||0);
  delta=Math.atan2(Math.sin(delta),Math.cos(delta));
  const v=Number(speed)||0;
  const bodyLong=v*Math.cos(delta);
  const bodyLat=v*Math.sin(delta);
  const rearDistance=Math.max(.35,(Number(wheelbase)||2.7)*Math.max(.30,Math.min(.75,Number(frontWeightBias)||.55)));
  const rearLat=bodyLat-(Number(yawRate)||0)*rearDistance;
  return Math.atan2(rearLat,Math.max(.50,Math.abs(bodyLong)));
}

export function postSpinSteeringAuthority(){
  // Grip R4 — steering input itself is never artificially removed in a spin.
  // Tire force and body-relative contact velocity decide how much authority the
  // front axle can physically produce. The old 28% valley around 90 degrees was
  // a numerical anti-spin aid and created a perceptible rotation wall.
  return 1;
}

export function driftKinematicCoupling({sideslipRad=0,forceCoupledSlide=0}={}){
  const sideslip=Math.max(0,Math.min(Math.PI*.5,Math.abs(Number(sideslipRad)||0)));
  const slide=Math.max(0,Math.min(1,Number(forceCoupledSlide)||0));
  // Bicycle-model yaw is valid near the no-slip region, but it must stop acting
  // like stability control once the chassis is far from its momentum vector.
  // Near 90 degrees only 6% of the kinematic yaw target remains; angular inertia
  // and measured tire-force imbalance dominate instead.
  const sideT=smoothstep01((sideslip-.30)/.85);
  const forceT=smoothstep01((slide-.12)/.68);
  return 1-.94*Math.max(sideT,forceT);
}

export function jTurnTransientYawBlend({
  bodyLongitudinalSpeed=0,
  speedAbs=0,
  steerAngle=0,
  handbrake=false,
  airborne=false,
  onPavement=true,
  surfaceRoadFraction=null
}={}){
  if(handbrake||airborne)return 0;
  const suppliedRoad=surfaceRoadFraction===null||surfaceRoadFraction===undefined?NaN:Number(surfaceRoadFraction);
  const road=Number.isFinite(suppliedRoad)?Math.max(0,Math.min(1,suppliedRoad)):(onPavement?1:0);
  const smooth=v=>{const t=Math.max(0,Math.min(1,Number(v)||0));return t*t*(3-2*t);};
  const rearward=smooth((-Number(bodyLongitudinalSpeed)-3.2)/3.0);
  const speedGate=smooth((Math.abs(Number(speedAbs)||0)-7.0)/4.0);
  const steerGate=smooth((Math.abs(Number(steerAngle)||0)-.075)/.09);
  return road*rearward*speedGate*steerGate;
}

export function jTurnTransientYawActive(args={}){
  return jTurnTransientYawBlend(args)>.5;
}

export function handbrakeLateralEffectForSpeed(speedAbs=0){
  return smoothstep01((Math.max(0,Number(speedAbs)||0)-2.5)/6.5);
}

// Grip R1 — wheel lock/recovery is continuous, not tied to the button edge.
export function advanceHandbrakeRearSlipState({previous=0,handbrake=false,airborne=false,speedAbs=0,sideslipRad=0,dt=0}={}){
  const prev=Math.max(0,Math.min(1,Number(previous)||0));
  const step=Math.min(.05,Math.max(0,Number(dt)||0));
  if(step<=0)return prev;
  if(airborne)return prev*Math.exp(-step/.08);
  const speed=Math.max(0,Math.abs(Number(speedAbs)||0));
  const beta=Math.min(Math.PI*.5,Math.abs(Number(sideslipRad)||0));
  const target=handbrake?handbrakeLateralEffectForSpeed(speed):0;
  const engageTau=.045;
  const speedT=smoothstep01(speed/30);
  const sideslipT=smoothstep01(beta/.55);
  const releaseTau=.11+.09*speedT+.24*sideslipT;
  const tau=target>prev?engageTau:releaseTau;
  return prev+(target-prev)*(1-Math.exp(-step/Math.max(.02,tau)));
}

export function landingSideslipGripSeed({sideslipRad=0,speedAbs=0}={}){
  const slip=Math.abs(Number(sideslipRad)||0);
  const speed=Math.max(0,Math.abs(Number(speedAbs)||0));
  const slipT=smoothstep01((slip-.035)/.19);
  const speedT=smoothstep01((speed-3.5)/7.5);
  return Math.min(.92,slipT*speedT*.92);
}

// P11 — propulsion is a force along the vehicle's longitudinal body axis, not
// automatically along the current momentum vector. This matters after a J-turn:
// the chassis may already point forward while residual momentum is still rearward.
// Positive throttle must then REMOVE rearward speed before building forward speed.
export function bodyAxisDriveProjection({heading=0,velocityHeading=0}={}){
  const delta=(Number(velocityHeading)||0)-(Number(heading)||0);
  return Math.cos(delta);
}

export function createDrivingRuntime({
  getState,setState,getFlags,getRouteLength,getWorldOffset,nearestRouteForVehicle,
  autopilotControl,keyboardActionDown,gamepadState,updateTransmission,getServiceBrakeInput,
  getTransmissionGear,getEngineRpm,
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
  let rearHandbrakeSlipState=0;

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
    const surfaceRoadFraction=weightedRoadFraction(
      vehiclePresentation?.wheelContacts||[],
      onPavement?1:0
    );
    const terrainFraction=1-surfaceRoadFraction;
    const offroadFrictionModel=terrainFraction>1e-4&&!airborneNow
      ?offroadTireFriction({vehicleId:getVehicleId?.()||'unknown',vehicle:VEHICLE})
      :null;
    const rawOffroadSlipForce=offroadFrictionModel
      ?offroadSideslipFriction({speed,heading,velocityHeading,slideMu:offroadFrictionModel.slide,airborne:airborneNow})
      :{speedDecel:0,momentumYawRate:0,slideGate:0,sideslipRad:0};
    const offroadSlipForce={
      ...rawOffroadSlipForce,
      speedDecel:rawOffroadSlipForce.speedDecel*terrainFraction,
      momentumYawRate:rawOffroadSlipForce.momentumYawRate*terrainFraction
    };
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
    const roadGripValue=roadSurfaceGrip();
    const surfaceGrip=surfaceRoadFraction>1e-4?roadGripValue:1;
    const isAWD=VEHICLE.drivetrain==='AWD';
    const awdOffroadGripBonus=isAWD?1.18:1;
    let requestedDriveAccel=0,requestedBrakeAccel=0;

    if(driveThrottle>0){
      const transmissionProfile=activeTransmissionProfile?.()||{};
      const torqueDrive=torqueDrivenAcceleration({
        vehicle:VEHICLE,
        profile:transmissionProfile,
        gear:typeof getTransmissionGear==='function'?getTransmissionGear():1,
        rpm:typeof getEngineRpm==='function'?getEngineRpm():transmissionProfile.idleRpm,
        throttle:driveThrottle,
        speedAbs:Math.abs(speed)
      });
      if(torqueDrive.active){
        // Crank torque -> gear/final drive -> tire force -> chassis acceleration.
        // Traction limiting remains authoritative immediately below.
        requestedDriveAccel=torqueDrive.acceleration*driveAxisProjection;
      }else{
        const performanceTop=vehicleTopSpeedKmh()/3.6;
        const speedRatio=Math.min(1,Math.max(0,Math.abs(speed)/performanceTop));
        const powerTaper=truckTrailerSystem.active?1:1-.38*speedRatio;
        requestedDriveAccel=
          VEHICLE.accel*
          driveThrottle*
          powerTaper*
          driveAxisProjection;
      }
    }else if(driveThrottle<0){
      // Negative drivetrain command now means reverse propulsion only. Service
      // braking never enters this branch.
      requestedDriveAccel=
        VEHICLE.reverseAccel*
        driveThrottle*
        driveAxisProjection;
    }

    requestedBrakeAccel=serviceBrakeAcceleration({
      serviceBrake:serviceBrakeInput,
      speed,
      maxBrakeAccel:VEHICLE.brake,
      airborne:airborneNow
    });
    requestedDriveAccel*=truckTrailerSystem.active?truckTrailerSystem.driveAccelScaleForSpeed(Math.abs(speed)):combination.driveAccelScale;
    requestedBrakeAccel*=combination.serviceBrakeScale;
    const longitudinalSpeedAbs=Math.abs(speed);
    const offroadStaticTractionT=1-physicsClamp(Math.abs(speed)/7,0,1);
    const offroadStaticTractionBoost=1+.12*offroadStaticTractionT;
    const roadLongitudinalMu=Math.max(.25,((VEHICLE.longitudinalAccelLimit??VEHICLE.brake??9.8)/9.80665)*roadGripValue);
    const dirtLongitudinalMu=Math.max(.22,(VEHICLE.offroadGrip??.60)*awdOffroadGripBonus*offroadStaticTractionBoost);
    const longitudinalMu=blendRoadDirt(roadLongitudinalMu,dirtLongitudinalMu,surfaceRoadFraction);

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
      const roadDrag=Math.max(0,(1-roadGripValue)*.75);
      const surfaceDrag=blendRoadDirt(roadDrag,VEHICLE.offroadDrag,surfaceRoadFraction);
      const rollingAndSurface=airborneNow?0:VEHICLE.rolling+surfaceDrag;
      const resist=rollingAndSurface+VEHICLE.aero*speed*speed+combination.rollingResistanceAccel+combination.aeroDragCoeff*speed*speed;
      accel-=Math.sign(speed)*resist;
    }else if(!throttle&&Math.abs(gradeForce.acceleration)<.04)speed=0;

    // Grip R5: terrain lateral scrub is real dissipative work, independent of
    // steering input or the legacy fourWheelSlide telemetry.
    if(terrainFraction>1e-4&&!airborneNow&&offroadSlipForce.speedDecel>1e-5&&Math.abs(speed)>.05){
      accel-=Math.sign(speed)*offroadSlipForce.speedDecel;
    }

    if(hand&&!airborneNow){
      const handRequest=-Math.sign(speed||gradeForce.acceleration||1)*8.5;
      // A fully locked tire is on the kinetic/sliding plateau, below peak mu.
      const handbrakeSlidingMuRatio=physicsClamp(Number(VEHICLE.handbrakeSlidingMuRatio??.72)||.72,.65,.90);
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
    if(
      (opposingBodyTravel||serviceBrakeCrossedZero)&&
      Math.abs(previousSpeed)>.02&&
      Math.sign(speed)!==Math.sign(previousSpeed)
    ){
      // Neither engine opposition nor a service brake can teleport through zero
      // into motion in the opposite direction during one integration step.
      speed=0;
      velocityHeading=heading;
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
    rearHandbrakeSlipState=advanceHandbrakeRearSlipState({previous:rearHandbrakeSlipState,handbrake:hand,airborne:airborneNow,speedAbs,sideslipRad:currentSideslip,dt});
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
    const jTurnYawBlend=jTurnTransientYawBlend({bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake:hand,airborne:airborneNow,onPavement,surfaceRoadFraction});
    const lateralEnvelope=lateralDynamicsEnvelope({vehicle:VEHICLE,speed:steeringTravelSpeed,steerAngle,steerInput:steer,driveThrottle,onPavement,surfaceGrip,awdOffroadGripBonus,offroadPeakMu:offroadFrictionModel?.peak,surfaceRoadFraction,rearSlipAmount:0,airborne:airborneNow},dynamicsScratch.lateral);
    let yawRate=lateralEnvelope.yawRate*truckTrailerSystem.tractorYawScale(speedAbs)*steeringAuthority;
    const drivetrain=lateralEnvelope.drivetrain;
    const powerCorneringLoad=lateralEnvelope.powerCorneringLoad;
    const requestedLatAccel=lateralEnvelope.requestedLatAccel*steeringAuthority;
    const latLimit=lateralEnvelope.latLimit;
    const signedLatAccel=lateralEnvelope.signedLatAccel*steeringAuthority;
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
        propulsionAccel:driveForce.acceleration,serviceBrakeAccel:brakeForce.acceleration,
        surfaceMu:longitudinalMu,throttle:driveThrottle,handbrake:hand,
        handbrakeSlipState:rearHandbrakeSlipState,sideslipRad:rearTireSideslip,
        airborne:airborneNow,vehicle:VEHICLE,speedAbs,
        contacts:vehiclePresentation?.wheelContacts||[],previousUsage:wheelGripUsage,dt:gripDt
      },dynamicsScratch.grip);
    }

    const physicalTireForces=physicsShadow.advance(dt,{
      vehicleId:getVehicleId?.()||'unknown',vehicle:VEHICLE,contacts:vehiclePresentation?.wheelContacts||[],speed,heading,velocityHeading,
      yawRate:dynamicYawRate,centerSteerAngle:steerAngle,longitudinalAccel,lateralAccel:physicalSignedLatAccel,
      requestedDriveAccel,requestedBrakeAccel,handbrake:hand,surfaceId:onPavement?'asphalt-dry':'dirt'
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
    if(requestedLatAccel>latLimit&&requestedLatAccel>0){
      const saturationScale=latLimit/requestedLatAccel;
      yawRate*=saturationScale+(1-saturationScale)*jTurnYawBlend;
    }

    const frontDominance=Math.max(0,frontSlipAmount-rearSlipAmount*.55);
    const rearDominance=Math.max(0,rearSlipAmount-frontSlipAmount*.55);
    const fourWheelSlide=Math.min(frontSlipAmount,rearSlipAmount);
    if(!airborneNow)yawRate*=Math.max(.46,1-frontDominance*.54-fourWheelSlide*.24);

    if(drivetrain==='RWD'&&powerCorneringLoad>.05&&!airborneNow){
      const powerOversteerYaw=VEHICLE.powerOversteerYaw??.035;
      const rearSlipYaw=Math.sign(steer||1)*powerOversteerYaw*powerCorneringLoad*(.30+rearDominance*.70)*Math.min(1,speedAbs/18);
      yawRate+=rearSlipYaw*Math.sign((hand?speed:steeringTravelSpeed)||speed||1)*steeringAuthority;
    }

    // Grip R7 — per-wheel tire forces become authoritative outside the small-
    // slip bicycle-model region. The old guard above used to erase an opposing
    // tire yaw moment whenever steering was present; that prevented countersteer
    // from stabilizing a drift and could make both axles translate with the rack.
    const yawResponse=yawResponseRate({vehicle:VEHICLE,speedAbs,airborne:airborneNow});
    const frictionYawLoss=physicsClamp(Math.abs(frictionYawAccel)/4.5,0,1);
    const forceCoupledSlide=physicsClamp(Math.max(frictionYawLoss,rearLateralForceLoss),0,1);
    const driftKinematicScale=driftKinematicCoupling({
      sideslipRad:currentSideslip,
      forceCoupledSlide
    });
    const driftPhysicalAuthority=airborneNow?0:driftTireForceAuthority({
      sideslipRad:currentSideslip,
      forceCoupledSlide
    });
    const physicalTireYawAccel=Number.isFinite(physicalTireForces?.predictedYawAccel)
      ?physicalTireForces.predictedYawAccel
      :frictionYawAccel;
    const physicalTrajectoryYawRate=tireForceTrajectoryYawRate({
      bodyVx:physicalTireForces?.bodyVx,
      bodyVz:physicalTireForces?.bodyVz,
      accelX:physicalTireForces?.predictedAccelX,
      accelZ:physicalTireForces?.predictedAccelZ
    });
    // Keep the familiar fast settling only while the car is close to the
    // bicycle-model regime. During a real drift, do not numerically brake yaw
    // just because the steady-state target is smaller or changes sign.
    const yawReleaseBoost=
      driftKinematicScale>.82&&Math.abs(yawRate)<Math.abs(dynamicYawRate)
        ?1.35
        :1;
    const yawGripResponseScale=airborneNow
      ?0
      :driftKinematicScale*(1-.85*driftPhysicalAuthority);
    const authoritativeYawAccel=blendDriftForce(
      frictionYawAccel,
      physicalTireYawAccel,
      driftPhysicalAuthority
    );
    dynamicYawRate+=authoritativeYawAccel*dt;
    dynamicYawRate+=(yawRate-dynamicYawRate)*(1-Math.exp(-dt*yawResponse*yawReleaseBoost*yawGripResponseScale));
    heading+=dynamicYawRate*dt;

    if(surfaceRoadFraction>1e-4&&!airborneNow&&fourWheelSlide>.01&&speedAbs>6){
      const scrubDecel=(1.0+fourWheelSlide*3.2)*surfaceRoadFraction,scrubDelta=scrubDecel*dt;
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
      // The perpendicular component of real terrain sliding friction bends the
      // momentum vector. This is force-derived, not a synthetic body-axis lock.
      if(!onPavement&&!airborneNow){
        attemptedTrajectoryDelta+=offroadSlipForce.momentumYawRate*dt;
      }
      const forceDominatedDrift=
        !airborneNow&&
        speedAbs>4&&
        (driftPhysicalAuthority>.12||forceCoupledSlide>.10||driftKinematicScale<.88);
      if(forceDominatedDrift){
        const signedSpeedForCurvature=Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5;
        const legacyForceTrajectoryYawRate=netLateralAccel/signedSpeedForCurvature;
        // Grip R7: once sideslip is real, the momentum vector follows the SUM of
        // the four actual tire-force vectors. Countersteer can therefore rotate
        // the chassis and bend momentum in different directions, as it should.
        const forceTrajectoryYawRate=blendDriftForce(
          legacyForceTrajectoryYawRate,
          physicalTrajectoryYawRate,
          driftPhysicalAuthority
        );
        attemptedTrajectoryDelta+=forceTrajectoryYawRate*dt;
      }else{
        const velocityFollowRate=airborneNow?0:((2.8-1.45*frictionTrajectoryLoss)+27.2*Math.pow(1-physicsClamp(trajectoryRearSlip,0,1),2));
        attemptedTrajectoryDelta+=angleDelta(momentumTargetHeading,velocityHeading)*(1-Math.exp(-dt*velocityFollowRate));
      }
      const rawTrajectoryLateralCapacityAccel=Number.isFinite(perWheelGrip.trajectoryLateralCapacityAccel)?Math.max(0,perWheelGrip.trajectoryLateralCapacityAccel):Math.max(0,latLimit);
      const trajectoryLateralCapacityAccel=rawTrajectoryLateralCapacityAccel;
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
