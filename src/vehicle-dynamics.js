// World Drive V21.29 — steering + clutch-demand wrapper over frozen V21.27 dynamics.
//
// V21.28 removed the duplicate high-speed steering input attenuation. V21.29
// additionally preserves the RAW propulsion demand before the traction limiter
// so clutch-dump torque that cannot reach the road can still appear as driven-
// wheel slip. The actual chassis acceleration remains traction-limited.

export * from './vehicle-dynamics-base.js';
import {
  clampDynamics,
  smoothstep01,
  vehicleLayout,
  aerodynamicLoad,
  longitudinalTractionLimit as baseLongitudinalTractionLimit,
  estimateWheelGripUsage as baseEstimateWheelGripUsage
} from './vehicle-dynamics-base.js';

function safeNumber(value,fallback){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

// The base runtime asks for drive force first, then brake force, then runs the
// per-wheel grip estimator. Keep the latest raw DRIVE request long enough for
// that grip pass. Normal driving is unchanged because raw demand <= tire limit;
// only saturation (notably clutch shock) exposes the excess to the tire model.
let latestRawDriveDemandAccel=0;

export function longitudinalTractionLimit(args={},out=null){
  const result=baseLongitudinalTractionLimit(args,out);
  if(String(args?.mode||'')==='drive'){
    latestRawDriveDemandAccel=safeNumber(result?.requested,safeNumber(args?.requestedAccel,0));
  }
  return result;
}

export function estimateWheelGripUsage(args={},out=null){
  const applied=safeNumber(args?.propulsionAccel,0);
  const raw=latestRawDriveDemandAccel;
  const propulsionDemand=
    Math.abs(raw)>Math.abs(applied)+1e-6
      ?raw
      :applied;
  const result=baseEstimateWheelGripUsage({
    ...args,
    propulsionAccel:propulsionDemand
  },out);
  result.appliedPropulsionAccel=applied;
  result.requestedPropulsionAccel=propulsionDemand;
  result.propulsionSaturationRatio=
    Math.abs(applied)>1e-6
      ?Math.abs(propulsionDemand)/Math.abs(applied)
      :(Math.abs(propulsionDemand)>1e-6?Infinity:1);
  latestRawDriveDemandAccel=0;
  return result;
}

const steeringAeroScratch={};

export function steeringCommand({vehicle,speedAbs=0,input=0}={},out=null){
  const result=out||{};
  const v=Math.max(0,safeNumber(speedAbs,0));
  const raw=clampDynamics(safeNumber(input,0),-1,1);
  const low=safeNumber(vehicle?.maxSteerLow,.46);
  const high=safeNumber(vehicle?.maxSteerHigh,.16);
  const speedBlend=clampDynamics(v/32,0,1);

  const parkingSteerT=1-smoothstep01(v/8.0);
  const parkingSteerBoost=clampDynamics(safeNumber(vehicle?.parkingSteerBoost,.26),0,.50);
  const parkingSteerScale=1+parkingSteerBoost*parkingSteerT;
  const lowSpeedRoadWheelAngle=low*parkingSteerScale;
  const baseRoadWheelAngle=
    lowSpeedRoadWheelAngle+
    (high-lowSpeedRoadWheelAngle)*(speedBlend*speedBlend);

  const highSpeedAuthorityT=clampDynamics((v-27)/28,0,1);
  const highSpeedAuthoritySmooth=
    highSpeedAuthorityT*highSpeedAuthorityT*(3-2*highSpeedAuthorityT);
  const highSpeedAuthorityScale=1-.28*highSpeedAuthoritySmooth;
  let maxRoadWheelAngle=baseRoadWheelAngle*highSpeedAuthorityScale;

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
    const vehicleExponent=Math.max(.75,safeNumber(vehicle?.steeringInputExponent,1.65));
    target=Math.sign(target)*Math.pow(Math.abs(target),vehicleExponent);
  }

  const highSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseHigh,3.8));
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
