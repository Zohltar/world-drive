// Maneuver-specific transient state for World Drive.
// This module owns only J-turn latch state and rear-handbrake slip memory.
// Tire forces, general yaw physics, momentum direction and vehicle calibration
// remain owned by their existing physics/runtime modules.

function smoothstep01(value){
  const t=Math.max(0,Math.min(1,Number(value)||0));
  return t*t*(3-2*t);
}

export function jTurnEntryEligible({
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

export function jTurnExitEligible({
  bodyLongitudinalSpeed=0,
  speedAbs=0,
  steerAngle=0,
  handbrake=false,
  airborne=false,
  onPavement=true,
  sideslipRad=0
}={}){
  if(handbrake||airborne||!onPavement)return true;
  if(Math.abs(Number(speedAbs)||0)<2.5)return true;
  if(Math.abs(Number(steerAngle)||0)<.05)return true;
  return (
    Number(bodyLongitudinalSpeed)>2.0&&
    Math.abs(Number(sideslipRad)||0)<.10
  );
}

export function advanceJTurnLatchedState({
  active=false,
  bodyLongitudinalSpeed=0,
  speedAbs=0,
  steerAngle=0,
  handbrake=false,
  airborne=false,
  onPavement=true,
  sideslipRad=0
}={}){
  const entryEligible=jTurnEntryEligible({
    bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake,airborne,onPavement
  });
  if(!active)return entryEligible;
  return !jTurnExitEligible({
    bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake,airborne,onPavement,sideslipRad
  });
}

export function jTurnTransientSteeringSpeed({speed=0,fallbackSpeed=0,active=false}={}){
  if(!active)return Number(fallbackSpeed)||0;
  // A latched J-turn entered in reverse. Preserve that steering travel sign
  // through 90 degrees instead of letting cos(beta) drive it to zero and then
  // reverse the bicycle yaw target while the chassis is still rotating.
  return -Math.abs(Number(speed)||0);
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

export function createManeuverState({rearHandbrakeSlipState=0,jTurnLatchedActive=false}={}){
  let rearSlip=Math.max(0,Math.min(1,Number(rearHandbrakeSlipState)||0));
  let jTurnActive=!!jTurnLatchedActive;
  return {
    advanceRearHandbrakeSlip(args={}){
      rearSlip=advanceHandbrakeRearSlipState({previous:rearSlip,...args});
      return rearSlip;
    },
    advanceJTurn(args={}){
      jTurnActive=advanceJTurnLatchedState({active:jTurnActive,...args});
      return jTurnActive;
    },
    snapshot(){
      return {rearHandbrakeSlipState:rearSlip,jTurnLatchedActive:jTurnActive};
    }
  };
}
