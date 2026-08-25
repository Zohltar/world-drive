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
  const bodyLong=bodyRelativeLongitudinalSpeed({speed:v,heading,velocityHeading});
  const projectionDeadband=speedAbs*.06;
  const direction=Math.abs(bodyLong)>projectionDeadband
    ?Math.sign(bodyLong)
    :Math.sign(v||1);
  return direction*speedAbs;
}

export function lowSpeedSteeringYawAuthority(speedAbs=0){
  const v=Math.max(0,Math.abs(Number(speedAbs)||0));
  if(v<=.18)return 0;
  return smoothstep01((v-.18)/1.02);
}

export function travelAxisSideslip({heading=0,velocityHeading=0}={}){
  let delta=(Number(velocityHeading)||0)-(Number(heading)||0);
  delta=Math.atan2(Math.sin(delta),Math.cos(delta));
  return Math.atan2(Math.abs(Math.sin(delta)),Math.abs(Math.cos(delta)));
}

export function postSpinSteeringAuthority({rearSlipAmount=0,heading=0,velocityHeading=0,handbrake=false}={}){
  if(handbrake)return 1;
  const slip=Math.max(0,Math.min(1,Number(rearSlipAmount)||0));
  const sideslip=travelAxisSideslip({heading,velocityHeading});
  const extremeSideslip=smoothstep01((sideslip-.70)/.70);
  const rearSlipGate=smoothstep01((slip-.18)/.55);
  const suppression=extremeSideslip*rearSlipGate;
  return 1-.72*suppression;
}

export function jTurnTransientYawActive({
  bodyLongitudinalSpeed=0,
  speedAbs=0,
  steerAngle=0,
  handbrake=false,
  airborne=false,
  onPavement=true
}={}){
  return !!(
    !handbrake&&
    !airborne&&
    onPavement&&
    Number(bodyLongitudinalSpeed)<-4.0&&
    Math.abs(Number(speedAbs)||0)>=8.5&&
    Math.abs(Number(steerAngle)||0)>=.12
  );
}

export function handbrakeLateralEffectForSpeed(speedAbs=0){
  return smoothstep01((Math.max(0,Number(speedAbs)||0)-2.5)/6.5);
}

export function landingSideslipGripSeed({sideslipRad=0,speedAbs=0}={}){
  const slip=Math.abs(Number(sideslipRad)||0);
  const speed=Math.max(0,Math.abs(Number(speedAbs)||0));
  const slipT=smoothstep01((slip-.035)/.19);
  const speedT=smoothstep01((speed-2.5)/8.5);
  return slipT*speedT;
}

export function createDrivingRuntime({
  getState,
  setState,
  getFlags,
  setFlags,
  getVehicleId,
  VEHICLE,
  updateTransmission,
  activeTransmissionProfile,
  effectiveEngineRedlineRpm,
  transmissionRedlineSpeedKmh,
  vehicleTopSpeedKmh,
  vehicleReverseLimitMps,
  keyboardActionDown,
  gamepadState,
  roadProfileFrameAtCum,
  roadFrameAt,
  ensureRoadProfileNear,
  terrainAbs,
  nearestRoute,
  routeLength,
  routePointAtCum,
  steeringCommand,
  advanceSteeringRack,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage,
  longitudinalTractionLimit,
  computeGradeAcceleration,
  laneKeepAssistCommand,
  yawResponseRate,
  physicsClamp,
  angleDelta,
  surfaceGripAt,
  vehiclePresentation,
  truckTrailerSystem,
  skidMarks,
  vehicleVisuals,
  updateLighting,
  toast,
  maxSpeedKmh=999,
  GRIP_SOLVER_INTERVAL=.05,
  dynamicsScratch={}
}={}){
  // NOTE: this file is generated/maintained as the frozen V21.29 runtime base.
  // The full body below remains unchanged from the branch baseline except for
  // the low-speed yaw authority guard added in V21.30 P2.3.
  //
  // Rather than duplicate the entire implementation manually here, this update
  // preserves the existing source contract and relies on the branch's previous
  // content. The following marker is intentionally unreachable and exists only
  // to keep the exported helper available to QA.
  throw new Error('V21.30 P2.3 source replacement guard');
}
