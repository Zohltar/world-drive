// Grip R9 — independent longitudinal driver controls.
// Service braking is not reverse propulsion: it always removes kinetic energy
// from the current signed momentum, regardless of chassis orientation.

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function clamp01(value){
  return Math.max(0,Math.min(1,finite(value,0)));
}

function twoAxleCombinedBrakeCapacity({
  vehicle,
  requestedBrakeMagnitude=0,
  longitudinalCapacity=0,
  lateralUtilization=0
}={}){
  const axles=Array.isArray(vehicle?.axles)?vehicle.axles:[];
  if(axles.length!==2)return null;
  const frontIndex=finite(axles[0]?.positionM,0)>=finite(axles[1]?.positionM,0)?0:1;
  const rearIndex=frontIndex===0?1:0;
  const rawStatic=axles.map(axle=>Math.max(.01,finite(axle?.staticLoadFraction,.5)));
  const staticTotal=rawStatic[0]+rawStatic[1];
  const staticLoads=rawStatic.map(value=>value/staticTotal);
  const wheelbase=Math.max(1,finite(vehicle?.wheelbase,2.7));
  const cgHeight=Math.max(.15,finite(vehicle?.cgHeight,.52));
  const transferPerAccel=cgHeight/(9.80665*wheelbase);
  const globalRemaining=Math.sqrt(Math.max(0,1-lateralUtilization*lateralUtilization));
  const upper=Math.min(
    Math.max(0,requestedBrakeMagnitude),
    Math.max(0,longitudinalCapacity)*globalRemaining
  );

  const capacityAt=deceleration=>{
    const transfer=Math.max(-.32,Math.min(.32,deceleration*transferPerAccel));
    const loads=[0,0];
    loads[frontIndex]=Math.max(.05,Math.min(.95,staticLoads[frontIndex]+transfer));
    loads[rearIndex]=1-loads[frontIndex];
    let capacity=0;
    for(let index=0;index<2;index++){
      // Zero-yaw steady cornering requires axle lateral-force shares set by
      // the CG lever arms; those are the same normalized static load shares.
      const axleLateralUtilization=Math.min(
        1,
        lateralUtilization*staticLoads[index]/Math.max(.01,loads[index])
      );
      const remaining=Math.sqrt(Math.max(0,1-axleLateralUtilization*axleLateralUtilization));
      capacity+=longitudinalCapacity*loads[index]*remaining;
    }
    return capacity;
  };

  const upperCapacity=capacityAt(upper);
  if(upper<=upperCapacity+1e-10){
    return {
      acceleration:upper,
      capacityAtAcceleration:upperCapacity,
      globalUpper:upper
    };
  }

  let low=0;
  let high=upper;
  for(let iteration=0;iteration<24;iteration++){
    const candidate=(low+high)*.5;
    if(candidate<=capacityAt(candidate)+1e-10)low=candidate;
    else high=candidate;
  }
  return {
    acceleration:low,
    capacityAtAcceleration:capacityAt(low),
    globalUpper:upper
  };
}

export function serviceBrakeAcceleration({
  serviceBrake=0,
  speed=0,
  maxBrakeAccel=0,
  airborne=false,
  stopSpeed=.02
}={}){
  const pedal=clamp01(serviceBrake);
  const v=finite(speed,0);
  const capacity=Math.max(0,Math.abs(finite(maxBrakeAccel,0)));
  if(airborne||pedal<=0||capacity<=0||Math.abs(v)<=Math.max(0,finite(stopSpeed,.02)))return 0;
  return -Math.sign(v)*capacity*pedal;
}

// Trail Braking R2 — reserve lateral tire authority before service braking.
//
// The scalar traction limiter runs before the lateral tire solver. Applying its
// full longitudinal result directly would therefore give braking first claim
// on the friction circle and leave steering only the small residual. ABS road
// cars instead send a feasible combined request into the tire solver. Steering
// is not an actuator this function can reduce, so when the normalized request
// exceeds the g-g envelope ABS releases only enough service-brake pressure to
// fit inside the longitudinal capacity left by the current lateral demand. The
// existing per-wheel solver then owns load transfer, combined slip and yaw.
export function combinedBrakeForceAllocation({
  serviceBrakeAccel=0,
  longitudinalLimit=0,
  requestedLateralAccel=0,
  lateralLimit=0,
  vehicle=null,
  absEnabled=true,
  airborne=false,
  enabled=true
}={},out=null){
  const result=out||{};
  const acceleration=finite(serviceBrakeAccel,0);
  const longitudinalCapacity=Math.max(0,Math.abs(finite(longitudinalLimit,0)));
  const lateralCapacity=Math.max(0,Math.abs(finite(lateralLimit,0)));
  const longitudinalUtilization=longitudinalCapacity>1e-6
    ?Math.abs(acceleration)/longitudinalCapacity
    :0;
  const lateralUtilization=lateralCapacity>1e-6
    ?Math.min(1,Math.abs(finite(requestedLateralAccel,0))/lateralCapacity)
    :0;
  const combinedUtilization=Math.hypot(longitudinalUtilization,lateralUtilization);
  const remainingLongitudinalUtilization=Math.sqrt(
    Math.max(0,1-lateralUtilization*lateralUtilization)
  );
  const eligible=enabled&&absEnabled&&!airborne&&Math.abs(acceleration)>1e-8;
  const globalAllowedMagnitude=longitudinalCapacity*remainingLongitudinalUtilization;
  const axleAllocation=eligible?twoAxleCombinedBrakeCapacity({
    vehicle,
    requestedBrakeMagnitude:Math.abs(acceleration),
    longitudinalCapacity,
    lateralUtilization
  }):null;
  const allowedMagnitude=eligible
    ?Math.min(
      Math.abs(acceleration),
      globalAllowedMagnitude,
      axleAllocation?.acceleration??Infinity
    )
    :Math.abs(acceleration);
  const forceScale=Math.abs(acceleration)>1e-8
    ?Math.min(1,allowedMagnitude/Math.abs(acceleration))
    :1;

  result.acceleration=acceleration*forceScale;
  result.unallocatedAcceleration=acceleration;
  result.longitudinalLimit=longitudinalCapacity;
  result.lateralLimit=lateralCapacity;
  result.longitudinalUtilization=longitudinalUtilization;
  result.lateralUtilization=lateralUtilization;
  result.combinedUtilization=combinedUtilization;
  result.remainingLongitudinalUtilization=remainingLongitudinalUtilization;
  result.axleCombinedCapacityAccel=axleAllocation?.capacityAtAcceleration??null;
  result.axleLimited=!!axleAllocation&&allowedMagnitude<Math.min(Math.abs(acceleration),globalAllowedMagnitude)-1e-8;
  result.forceScale=forceScale;
  result.limited=forceScale<1-1e-8;
  return result;
}

export function shouldAutoClutchForServiceBrake({
  serviceBrake=0,
  speed=0,
  speedThreshold=.35
}={}){
  return clamp01(serviceBrake)>.04&&Math.abs(finite(speed,0))<Math.max(.05,finite(speedThreshold,.35));
}

export function brakeWouldCrossZero({previousSpeed=0,nextSpeed=0,serviceBrake=0}={}){
  const before=finite(previousSpeed,0);
  const after=finite(nextSpeed,0);
  return clamp01(serviceBrake)>.04&&Math.abs(before)>.02&&Math.sign(before)!==Math.sign(after);
}
