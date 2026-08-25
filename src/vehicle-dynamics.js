// World Drive V21.28 — steering wrapper over the frozen V21.27 generalized dynamics.
//
// The baseline physics implementation is preserved verbatim in
// vehicle-dynamics-base.js.  This wrapper overrides only steeringCommand():
// high-speed stability still comes from reduced road-wheel angle and rack
// response, but joystick input is no longer given a second speed-dependent
// exponential penalty.  That duplicate filtering made transient reverse-axis
// manoeuvres (J-turns) unnecessarily reluctant while adding little stability
// beyond the existing angle/rack limits.

export * from './vehicle-dynamics-base.js';
import {
  clampDynamics,
  smoothstep01,
  vehicleLayout,
  aerodynamicLoad
} from './vehicle-dynamics-base.js';

function safeNumber(value,fallback){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

const steeringAeroScratch={};

export function steeringCommand({vehicle,speedAbs=0,input=0}={},out=null){
  const result=out||{};
  const v=Math.max(0,safeNumber(speedAbs,0));
  const raw=clampDynamics(safeNumber(input,0),-1,1);
  const low=safeNumber(vehicle?.maxSteerLow,.46);
  const high=safeNumber(vehicle?.maxSteerHigh,.16);
  const speedBlend=clampDynamics(v/32,0,1);

  // Preserve V21.27 parking/hairpin travel.
  const parkingSteerT=1-smoothstep01(v/8.0);
  const parkingSteerBoost=clampDynamics(safeNumber(vehicle?.parkingSteerBoost,.26),0,.50);
  const parkingSteerScale=1+parkingSteerBoost*parkingSteerT;
  const lowSpeedRoadWheelAngle=low*parkingSteerScale;
  const baseRoadWheelAngle=
    lowSpeedRoadWheelAngle+
    (high-lowSpeedRoadWheelAngle)*(speedBlend*speedBlend);

  // Preserve the proven very-high-speed maximum-angle reduction.
  const highSpeedAuthorityT=clampDynamics((v-27)/28,0,1);
  const highSpeedAuthoritySmooth=
    highSpeedAuthorityT*highSpeedAuthorityT*(3-2*highSpeedAuthorityT);
  const highSpeedAuthorityScale=1-.28*highSpeedAuthoritySmooth;
  let maxRoadWheelAngle=baseRoadWheelAngle*highSpeedAuthorityScale;

  // Preserve the optional tire/aero-aware steering envelope (notably F1).
  const steeringGripEnvelopeFraction=clampDynamics(
    safeNumber(vehicle?.steeringGripEnvelopeFraction,0),
    0,
    1
  );
  let gripEnvelopeRoadWheelAngle=0;
  let gripEnvelopeLimited=false;
  if(steeringGripEnvelopeFraction>0&&v>4){
    const layout=vehicleLayout(vehicle);
    const aero=safeNumber(vehicle?.aeroDownforceClA,0)>0
      ?aerodynamicLoad({vehicle,speedAbs:v,airborne:false},steeringAeroScratch)
      :null;
    const aeroGripScale=aero?.gripScale||1;
    const lateralEnvelopeAccel=
      Math.max(1,safeNumber(vehicle?.lateralAccelLimit,7))*
      aeroGripScale*
      steeringGripEnvelopeFraction;
    gripEnvelopeRoadWheelAngle=Math.atan(
      (lateralEnvelopeAccel*layout.wheelbase)/Math.max(16,v*v)
    );
    if(gripEnvelopeRoadWheelAngle<maxRoadWheelAngle){
      maxRoadWheelAngle=gripEnvelopeRoadWheelAngle;
      gripEnvelopeLimited=true;
    }
  }

  let target=raw;
  if(Math.abs(target)<.08){
    target=0;
  }else{
    // V21.28: one progressive input curve is enough.  V21.27 additionally
    // increased this exponent by as much as +1.15 with road speed, while the
    // rack angle and rack response were already being reduced.  Removing that
    // second penalty restores meaningful counter-steer/J-turn authority without
    // increasing the physical road-wheel limit or available tire grip.
    const vehicleExponent=Math.max(.75,safeNumber(vehicle?.steeringInputExponent,1.65));
    target=Math.sign(target)*Math.pow(Math.abs(target),vehicleExponent);
  }

  const highSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseHigh,3.8));
  // Preserve slower steering attack at high speed; self-centering stays quick.
  const highSpeedResponseScale=1-.45*highSpeedAuthoritySmooth;
  const lowSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseLow,5.2));
  const midSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseMid,4.5));
  const lowReturnRate=Math.max(.5,safeNumber(vehicle?.steeringReturnRateLow,7.2));
  const highReturnRate=Math.max(.5,safeNumber(vehicle?.steeringReturnRateHigh,7.5));

  result.target=target;
  result.maxRoadWheelAngle=maxRoadWheelAngle;
  result.inputRate=v<5
    ?lowSpeedResponse
    :(v>25?highSpeedResponse*highSpeedResponseScale:midSpeedResponse);
  result.returnRate=v<5?lowReturnRate:highReturnRate;

  const centerToFullTime=safeNumber(vehicle?.steeringCenterToFullTimeSec,0);
  const returnToCenterTime=safeNumber(
    vehicle?.steeringReturnToCenterTimeSec,
    centerToFullTime
  );
  result.inputSlewRate=centerToFullTime>1e-4?1/centerToFullTime:0;
  result.returnSlewRate=
    returnToCenterTime>1e-4
      ?1/returnToCenterTime
      :result.inputSlewRate;
  result.centerToFullTimeSec=centerToFullTime>1e-4?centerToFullTime:0;
  result.returnToCenterTimeSec=returnToCenterTime>1e-4?returnToCenterTime:0;
  result.parkingSteerScale=parkingSteerScale;
  result.highSpeedAuthorityScale=highSpeedAuthorityScale;
  result.highSpeedResponseScale=highSpeedResponseScale;
  result.highSpeedInputExponentBoost=0;
  result.gripEnvelopeRoadWheelAngle=gripEnvelopeRoadWheelAngle;
  result.gripEnvelopeLimited=gripEnvelopeLimited?1:0;
  return result;
}
