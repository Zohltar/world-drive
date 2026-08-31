// World Drive V21.29 — steering + clutch-demand wrapper over frozen V21.27 dynamics.
//
// V21.28 removed the duplicate high-speed steering input attenuation. V21.29
// preserves RAW propulsion demand before the traction limiter so clutch-dump
// torque that cannot reach the road can appear as driven-wheel slip. The
// chassis remains grip limited and drops slightly from static to sliding grip
// once a genuine clutch overtorque breaks adhesion.

export * from './vehicle-dynamics-core.js';
import {
  clampDynamics,
  smoothstep01,
  vehicleLayout,
  aerodynamicLoad,
  longitudinalTractionLimit as baseLongitudinalTractionLimit,
  estimateWheelGripUsage as baseEstimateWheelGripUsage
} from './vehicle-dynamics-core.js';

function safeNumber(value,fallback){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function clutchSlidingGripFactor(vehicle={},requested=0,limit=0){
  const normalAccel=Math.max(.1,Math.abs(safeNumber(vehicle?.accel,0)));
  const request=Math.abs(safeNumber(requested,0));
  const cap=Math.max(.1,Math.abs(safeNumber(limit,0)));
  // Ordinary full-throttle acceleration is left unchanged. A clutch dump is
  // identifiable because its request exceeds both static traction and the
  // vehicle's normal engine acceleration by a meaningful margin.
  if(request<=cap*1.05||request<=normalAccel*1.10)return 1;
  const layout=vehicleLayout(vehicle);
  if(vehicle?.vehicleClass==='tractor')return .96;
  if(layout.drivetrain==='AWD')return .94;
  if(layout.drivetrain==='FWD')return .88;
  return .90;
}

export function longitudinalTractionLimit(args={},out=null){
  const result=baseLongitudinalTractionLimit(args,out);
  if(String(args?.mode||'')==='drive'){
    const requested=safeNumber(result?.requested,safeNumber(args?.requestedAccel,0));
    if(result?.limited){
      const slideFactor=clutchSlidingGripFactor(args?.vehicle||{},requested,result?.limit);
      if(slideFactor<1){
        result.staticTractionAcceleration=result.acceleration;
        result.slidingGripFactor=slideFactor;
        result.acceleration*=slideFactor;
      }
    }
  }
  return result;
}

function fallbackWheelAxleIndex(index){
  // Four-wheel ordering used by the frozen dynamics:
  // rear-left, front-left, rear-right, front-right.
  if(index===1||index===3)return 0;
  return 1;
}

export function estimateWheelGripUsage(args={},out=null){
  // Cleanup B6 — propulsion demand is explicit. No previous traction call may
  // affect this result. requestedPropulsionAccel is the drivetrain request
  // before traction limiting; appliedPropulsionAccel is what reached the
  // chassis after limiting/handbrake ownership.
  const applied=safeNumber(
    args?.appliedPropulsionAccel,
    safeNumber(args?.propulsionAccel,0)
  );
  const requested=safeNumber(args?.requestedPropulsionAccel,applied);
  const propulsionDemand=
    Math.abs(requested)>Math.abs(applied)+1e-6
      ?requested
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

  // A clutch shock is far shorter than the ordinary tire-slip smoothing
  // window. Real driven wheels angularly accelerate within a few tens of ms
  // when engine torque exceeds road capacity, so make longitudinal spin react
  // immediately while keeping non-driven wheels untouched.
  const ratio=Number.isFinite(result.propulsionSaturationRatio)
    ?result.propulsionSaturationRatio
    :4;
  const overtorque=clampDynamics((ratio-1.03)/.72,0,1);
  if(overtorque>0&&Math.abs(safeNumber(args?.throttle,0))>1.01&&!args?.airborne){
    const layout=vehicleLayout(args?.vehicle||{});
    const contacts=Array.isArray(args?.contacts)?args.contacts:[];
    const count=Math.max(4,contacts.length||0);
    const dt=Math.min(.05,Math.max(0,safeNumber(args?.dt,0)));
    const previous=Array.isArray(args?.previousUsage)?args.previousUsage:[];
    const targetUsage=1.08+.48*overtorque;
    const transientResponse=78;
    const step=1-Math.exp(-dt*transientResponse);

    for(let i=0;i<count;i++){
      const meta=contacts[i];
      const axleIndex=Number.isInteger(meta?.axleIndex)
        ?clampDynamics(meta.axleIndex,0,layout.axles.length-1)
        :clampDynamics(fallbackWheelAxleIndex(i),0,layout.axles.length-1);
      const axle=layout.axles[axleIndex];
      if(!axle||axle.driveShare<=1e-6||meta?.contact===false)continue;

      const old=Math.max(0,safeNumber(previous[i],safeNumber(result.smoothed?.[i],0)));
      const fastUsage=old+(targetUsage-old)*step;
      if(result.longitudinalUsage)result.longitudinalUsage[i]=Math.max(result.longitudinalUsage[i]||0,targetUsage);
      if(result.raw)result.raw[i]=Math.max(result.raw[i]||0,targetUsage);
      if(result.smoothed)result.smoothed[i]=Math.max(result.smoothed[i]||0,fastUsage);
      if(result.slip){
        result.slip[i]=Math.max(
          result.slip[i]||0,
          smoothstep01((fastUsage-.94)/.20)
        );
      }
    }
  }

  return result;
}

const steeringAeroScratch={};

export function steeringCommand({vehicle,speedAbs=0,input=0}={},out=null){
  const result=out||{};
  const v=Math.max(0,safeNumber(speedAbs,0));
  const raw=clampDynamics(safeNumber(input,0),-1,1);

  // Grip R3 — steering geometry keeps its real mechanical lock at every speed.
  // Speed changes sensitivity, not the maximum road-wheel angle. This preserves
  // emergency/full-lock manoeuvres and handbrake turns while making small
  // analog inputs progressively softer as speed rises.
  const low=safeNumber(vehicle?.maxSteerLow,.46);
  const parkingSteerBoost=clampDynamics(safeNumber(vehicle?.parkingSteerBoost,.26),0,.50);
  const defaultMechanicalAngle=low*(1+parkingSteerBoost);
  const maxRoadWheelAngle=Math.max(
    .08,
    safeNumber(vehicle?.maxSteerMechanical,defaultMechanicalAngle)
  );

  // 0 km/h is linear. The curve then grows smoothly toward a strong high-speed
  // exponent. At full input pow(1,p) is still 1, so there is no hidden angle cap.
  const steeringCurveFullSpeedMps=Math.max(
    18,
    safeNumber(vehicle?.steeringCurveFullSpeedMps,40)
  );
  // Grip R13 — progressive highway steering. The traction/steering layer owns
  // the active steering curve. Keep low-speed steering unchanged and preserve
  // 100% input = 100% mechanical lock.
  // At full speed: 25% stick ~= 0.39% rack, 50% ~= 6.25%, 85% ~= 52%.
  const steeringCurveMaxExponent=Math.max(
    4.0,
    safeNumber(vehicle?.steeringInputExponentHigh,4.0)
  );
  const steeringCurveT=smoothstep01(v/steeringCurveFullSpeedMps);
  const baseSteeringInputExponent=
    1+(steeringCurveMaxExponent-1)*steeringCurveT;

  // Grip R22/R22.1 — explicitly opted-in high-downforce cars remain extremely sensitive once R13
  // has already reached its normal highway exponent. Keep the proven R13 curve
  // through 150 km/h, then progressively add a second analog exponent stage.
  // Vehicle profiles own the exact start/full speeds and boost. This changes stick sensitivity only: full input is
  // still pow(1,p)=1 and therefore retains full mechanical steering authority.
  const ultraHighSpeedStartMps=Math.max(20,safeNumber(
    vehicle?.steeringUltraHighStartMps,40
  ));
  const ultraHighSpeedFullMps=Math.max(
    ultraHighSpeedStartMps+5,
    safeNumber(vehicle?.steeringUltraHighFullMps,90)
  );
  const ultraHighSpeedMaxBoost=Math.max(0,safeNumber(
    vehicle?.steeringUltraHighExponentBoost,
    0
  ));
  const ultraHighSpeedT=ultraHighSpeedMaxBoost>0
    ?smoothstep01((v-ultraHighSpeedStartMps)/(ultraHighSpeedFullMps-ultraHighSpeedStartMps))
    :0;
  const ultraHighSpeedExponentBoost=ultraHighSpeedMaxBoost*ultraHighSpeedT;
  const steeringInputExponent=
    baseSteeringInputExponent+ultraHighSpeedExponentBoost;

  let target=raw;
  if(Math.abs(target)<.08){
    target=0;
  }else{
    target=Math.sign(target)*Math.pow(Math.abs(target),steeringInputExponent);
  }

  // Keep the old grip-envelope calculation as a diagnostic only. Tire physics
  // decides understeer/saturation; this value must never clamp steering angle.
  const steeringGripEnvelopeFraction=clampDynamics(
    safeNumber(vehicle?.steeringGripEnvelopeFraction,0),
    0,
    1
  );
  let gripEnvelopeRoadWheelAngle=0;
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
  }

  // Rack motion still slows at high speed. This matters for keyboard input,
  // where raw input is binary and therefore cannot benefit from an analog curve
  // until the rack has had time to travel toward full lock.
  const highSpeedResponseT=clampDynamics((v-20)/32,0,1);
  const highSpeedResponseSmooth=
    highSpeedResponseT*highSpeedResponseT*(3-2*highSpeedResponseT);
  const highSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseHigh,3.8));
  const highSpeedResponseScale=1-.48*highSpeedResponseSmooth;
  const lowSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseLow,5.2));
  const midSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseMid,4.5));
  const lowReturnRate=Math.max(.5,safeNumber(vehicle?.steeringReturnRateLow,7.2));
  const highReturnRate=Math.max(.5,safeNumber(vehicle?.steeringReturnRateHigh,7.5));

  result.target=target;
  result.maxRoadWheelAngle=maxRoadWheelAngle;
  result.inputRate=v<5
    ?lowSpeedResponse
    :(v>20?highSpeedResponse*highSpeedResponseScale:midSpeedResponse);
  result.returnRate=v<5?lowReturnRate:highReturnRate;

  const centerToFullTimeSec=safeNumber(vehicle?.steeringCenterToFullTimeSec,0);
  const returnToCenterTimeSec=safeNumber(
    vehicle?.steeringReturnToCenterTimeSec,
    centerToFullTimeSec
  );
  result.inputSlewRate=centerToFullTimeSec>1e-4?1/centerToFullTimeSec:0;
  result.returnSlewRate=
    returnToCenterTimeSec>1e-4
      ?1/returnToCenterTimeSec
      :result.inputSlewRate;
  result.centerToFullTimeSec=centerToFullTimeSec>1e-4?centerToFullTimeSec:0;
  result.returnToCenterTimeSec=returnToCenterTimeSec>1e-4?returnToCenterTimeSec:0;

  result.parkingSteerScale=1+parkingSteerBoost;
  result.highSpeedAuthorityScale=1;
  result.highSpeedResponseScale=highSpeedResponseScale;
  result.highSpeedInputExponentBoost=steeringInputExponent-1;
  result.ultraHighSpeedExponentBoost=ultraHighSpeedExponentBoost;
  result.ultraHighSpeedT=ultraHighSpeedT;
  result.steeringInputExponent=steeringInputExponent;
  result.steeringCurveT=steeringCurveT;
  result.steeringCurveFullSpeedMps=steeringCurveFullSpeedMps;
  result.mechanicalSteerAngle=maxRoadWheelAngle;
  result.gripEnvelopeRoadWheelAngle=gripEnvelopeRoadWheelAngle;
  result.gripEnvelopeLimited=0;
  return result;
}
