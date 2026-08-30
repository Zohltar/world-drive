import { createFixedStepAccumulator } from './fixed-step.js';
import {
  contactPatchVelocity,
  resolveTireForces,
  tireProfileForVehicle
} from './tire-model.js';
import { ackermannSteeringAngles } from './steering-geometry.js';
import { regulateAbsWheelOmega, lockedTireGroundForce } from './braking-tire-control.js';

// World Drive V21.27 per-wheel solver, selectively promoted by Grip R7.
//
// It began as a non-authoritative shadow solver. Grip R7 now uses its physical
// force/moment outputs during real drift and tire saturation, while ordinary
// small-slip driving still retains the established bicycle-model response.
//
// Vehicle-local coordinates:
//   +X = right
//   +Z = forward
//   +yaw = +Z rotating toward +X

const G=9.80665;

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}

function bodyVelocityFromWorldMotion({speed=0,heading=0,velocityHeading=0}={}){
  const beta=finite(velocityHeading)-finite(heading);
  const v=finite(speed);
  return {
    vx:Math.sin(beta)*v,
    vz:Math.cos(beta)*v,
    sideslipRad:beta
  };
}

function normalizedAxles(vehicle={}){
  const configured=Array.isArray(vehicle?.axles)?vehicle.axles:[];
  if(configured.length>=2){
    const axles=configured.map((axle,index)=>({
      id:axle.id||`axle-${index}`,
      positionM:finite(axle.positionM,index===0?1:-1),
      staticLoadFraction:Math.max(.01,finite(axle.staticLoadFraction,1/configured.length)),
      steerFactor:finite(axle.steerFactor,index===0?1:0),
      driveShare:Math.max(0,finite(axle.driveShare,0)),
      brakeShare:Math.max(0,finite(axle.brakeShare,0)),
      trackWidth:Math.max(.5,finite(axle.trackWidth,vehicle?.trackWidth||1.55))
    }));
    for(const key of ['staticLoadFraction','driveShare','brakeShare']){
      const total=axles.reduce((sum,axle)=>sum+Math.max(0,axle[key]),0);
      if(total>1e-8){
        for(const axle of axles)axle[key]=Math.max(0,axle[key])/total;
      }
    }
    return axles;
  }

  const wheelbase=Math.max(.5,finite(vehicle?.wheelbase,2.7));
  const frontBias=clamp(finite(vehicle?.frontWeightBias,.55),.30,.75);
  const drivetrain=vehicle?.drivetrain||'AWD';
  const driveFront=drivetrain==='FWD'?1:(drivetrain==='RWD'?0:clamp(finite(vehicle?.driveBiasFront,.5),0,1));
  const brakeFront=clamp(finite(vehicle?.brakeBiasFront,.62),.35,.85);
  return [
    {
      id:'front',
      positionM:(1-frontBias)*wheelbase,
      staticLoadFraction:frontBias,
      steerFactor:1,
      driveShare:driveFront,
      brakeShare:brakeFront,
      trackWidth:Math.max(.5,finite(vehicle?.trackWidth,1.55))
    },
    {
      id:'rear',
      positionM:-frontBias*wheelbase,
      staticLoadFraction:1-frontBias,
      steerFactor:0,
      driveShare:1-driveFront,
      brakeShare:1-brakeFront,
      trackWidth:Math.max(.5,finite(vehicle?.trackWidth,1.55))
    }
  ];
}

function axleLoadFractions(vehicle,axles,longitudinalAccel=0){
  const wheelbase=Math.max(.5,finite(vehicle?.wheelbase,2.7));
  const cgHeight=Math.max(.1,finite(vehicle?.cgHeight,.52));
  const transfer=clamp(finite(longitudinalAccel)*cgHeight/(G*wheelbase),-.32,.32);
  const loads=new Array(axles.length);

  if(axles.length===2){
    const frontIndex=axles[0].positionM>=axles[1].positionM?0:1;
    const rearIndex=frontIndex===0?1:0;
    const frontStatic=axles[frontIndex].staticLoadFraction;
    const front=clamp(frontStatic-transfer,.05,.95);
    loads[frontIndex]=front;
    loads[rearIndex]=1-front;
    return loads;
  }

  let total=0;
  for(let i=0;i<axles.length;i++){
    const axle=axles[i];
    const lever=clamp(axle.positionM/wheelbase,-1,1);
    const value=Math.max(.01,axle.staticLoadFraction-transfer*lever*2);
    loads[i]=value;
    total+=value;
  }
  total=total||1;
  for(let i=0;i<loads.length;i++)loads[i]/=total;
  return loads;
}

// V21.27 P2 — road-car service braking gets a lightweight EBD layer. The
// configured brakeShare remains the low-deceleration mechanical bias, then the
// distribution progressively follows the actual axle normal loads as braking
// grows. This prevents a dynamically unloaded rear axle from being asked to
// carry a fixed 38% of braking force in a hard corner. Vehicles that explicitly
// set absEnabled:false (for example the F1 profile) retain fixed brake bias.
function effectiveServiceBrakeShares(vehicle,axles,axleLoads,requestedBrakeAccel=0){
  const base=axles.map(axle=>Math.max(0,finite(axle?.brakeShare,0)));
  const baseTotal=base.reduce((sum,value)=>sum+value,0)||1;
  for(let i=0;i<base.length;i++)base[i]/=baseTotal;

  if(vehicle?.absEnabled===false)return base;

  const decelG=Math.abs(finite(requestedBrakeAccel,0))/G;
  const ebdBlend=clamp((decelG-.15)/.55,0,1);
  if(ebdBlend<=0)return base;

  const load=axles.map((_,index)=>Math.max(.001,finite(axleLoads?.[index],0)));
  const loadTotal=load.reduce((sum,value)=>sum+value,0)||1;
  for(let i=0;i<load.length;i++)load[i]/=loadTotal;

  const result=new Array(axles.length);
  let total=0;
  for(let i=0;i<result.length;i++){
    result[i]=base[i]+(load[i]-base[i])*ebdBlend;
    total+=result[i];
  }
  total=total||1;
  for(let i=0;i<result.length;i++)result[i]/=total;
  return result;
}

function contactSteerAngle({contact,axle,geometry}={}){
  const steerFactor=finite(axle?.steerFactor,0);
  if(Math.abs(steerFactor)<1e-8)return 0;

  // Positive World Drive steering rotates +Z toward +X: a right turn. Therefore
  // the right wheel is inside for positive steering and the left wheel is inside
  // for negative steering. Multi-steer axles can scale the same geometry.
  const positiveTurn=geometry.turnSign>0;
  const side=contact?.side||(finite(contact?.localX)<0?'left':'right');
  const inside=positiveTurn?side==='right':side==='left';
  const base=inside?geometry.innerAngle:geometry.outerAngle;
  return base*steerFactor;
}

function contactCounts(contacts,axleCount){
  const counts=Array.from({length:axleCount},()=>({left:0,right:0,total:0}));
  for(const contact of contacts){
    const axleIndex=clamp(Math.trunc(finite(contact?.axleIndex,0)),0,axleCount-1);
    const side=contact?.side||(finite(contact?.localX)<0?'left':'right');
    counts[axleIndex].total++;
    if(side==='left')counts[axleIndex].left++;
    else counts[axleIndex].right++;
  }
  return counts;
}

function wheelNormalLoad({
  contact,
  axle,
  axleIndex,
  axleLoads,
  counts,
  massKg,
  lateralAccel,
  cgHeight
}){
  if(contact?.contact===false)return 0;
  const axleFraction=Math.max(0,axleLoads[axleIndex]||0);
  const axleNormal=massKg*G*axleFraction;
  const track=Math.max(.5,finite(axle?.trackWidth,1.55));
  const lateralTransfer=clamp(finite(lateralAccel)*cgHeight/(G*track),-.45,.45);
  const side=contact?.side||(finite(contact?.localX)<0?'left':'right');
  // Positive lateral acceleration points right; load transfers to the left.
  const sideFraction=side==='left'?(1+lateralTransfer)*.5:(1-lateralTransfer)*.5;
  const sideCount=Math.max(1,counts[axleIndex]?.[side]||0);
  const support=clamp(finite(contact?.contactFactor,1),0,1);
  return Math.max(0,axleNormal*sideFraction/sideCount*support);
}

function wheelShare(axle,key,count){
  return Math.max(0,finite(axle?.[key],0))/Math.max(1,count||1);
}

function tireForceAtOmega({
  tire,
  surfaceId,
  normalLoadN,
  patch,
  omega,
  steerAngle,
  localX,
  localZ
}){
  return resolveTireForces({
    tire,
    surface:surfaceId,
    normalLoadN,
    longitudinalSpeed:patch.longitudinal,
    lateralSpeed:patch.lateral,
    wheelOmega:omega,
    steerAngle,
    localX,
    localZ
  });
}

function integrateWheelOmegaStable({
  state,
  step,
  tire,
  surfaceId,
  normalLoadN,
  patch,
  steerAngle,
  localX,
  localZ,
  driveTorqueNm,
  serviceBrakeTorqueNm,
  handbrakeTorqueNm,
  absEnabled=false
}){
  const radius=Math.max(.05,finite(tire?.rollingRadiusM,.32));
  const inertia=Math.max(.05,finite(tire?.wheelInertiaKgM2,1.2));
  const previousOmega=finite(state?.omega,0);
  const brakeTorqueNm=finite(serviceBrakeTorqueNm)+finite(handbrakeTorqueNm);
  const hasDrive=Math.abs(finite(driveTorqueNm))>.01;
  const brakingOnly=!hasDrive&&Math.abs(brakeTorqueNm)>.01;
  const absEligible=!!absEnabled&&
    Math.abs(finite(serviceBrakeTorqueNm))>.01&&
    Math.abs(finite(handbrakeTorqueNm))<=.01&&
    Math.abs(finite(patch?.longitudinal))>=2;
  const dt=Math.max(0,finite(step,0));
  const externalTorque=finite(driveTorqueNm)+brakeTorqueNm;

  const forceAtOmega=omega=>tireForceAtOmega({
    tire,
    surfaceId,
    normalLoadN,
    patch,
    omega,
    steerAngle,
    localX,
    localZ
  });

  if(normalLoadN<=1){
    let nextOmega=previousOmega+dt*externalTorque/inertia;
    if(brakingOnly){
      if(Math.abs(previousOmega)<.35||(Math.abs(previousOmega)>.001&&Math.sign(previousOmega)!==Math.sign(nextOmega))){
        nextOmega=0;
      }
    }
    state.omega=Number.isFinite(nextOmega)?nextOmega:0;
    return {force:forceAtOmega(state.omega),locked:false,absActive:false};
  }

  const lockedForce=()=>forceAtOmega(0);
  if(brakingOnly&&!absEligible&&Math.abs(previousOmega)<.35){
    const forceAtLock=lockedForce();
    const reactionAtLock=-forceAtLock.fxWheel*radius;
    const opposing=brakeTorqueNm*reactionAtLock<=0;
    if(opposing&&Math.abs(brakeTorqueNm)+1>=Math.abs(reactionAtLock)){
      state.omega=0;
      return {force:forceAtLock,locked:true,absActive:false};
    }
  }

  const forceAtPrevious=forceAtOmega(previousOmega);
  const treadSpeed=previousOmega*radius;
  const referenceSpeed=Math.max(1,Math.abs(patch.longitudinal),Math.abs(treadSpeed));
  const slipRatio=(treadSpeed-patch.longitudinal)/referenceSpeed;
  const linearFx=finite(tire?.longitudinalStiffnessN,80000)*slipRatio;
  const forceScale=Math.abs(linearFx)>1e-6?clamp(Math.abs(forceAtPrevious.fxWheel/linearFx),.015,1):1;
  const effectiveStiffness=Math.max(1,finite(tire?.longitudinalStiffnessN,80000)*forceScale);
  const dampingTorquePerOmega=effectiveStiffness*radius*radius/referenceSpeed;
  const roadDriveTorque=effectiveStiffness*radius*patch.longitudinal/referenceSpeed;
  const denominator=1+dt*dampingTorquePerOmega/inertia;
  let nextOmega=(previousOmega+dt*(externalTorque+roadDriveTorque)/inertia)/Math.max(1e-9,denominator);

  // Grip R8 — ABS service braking regulates wheel angular speed around the
  // tire's declared peak slip ratio. The old code only implemented EBD despite
  // the absEnabled flag, so an ABS-equipped road car could still lock its front
  // wheels during trail braking and feed a reversed force vector into Grip R7.
  const absRegulation=regulateAbsWheelOmega({
    nextOmega,
    longitudinalSpeed:patch.longitudinal,
    radiusM:radius,
    peakSlipRatio:tire?.peakSlipRatio,
    serviceBrakeTorqueNm,
    handbrakeTorqueNm,
    absEnabled:absEligible
  });
  nextOmega=absRegulation.omega;

  if(brakingOnly&&!absRegulation.active&&Math.abs(previousOmega)>.001&&Math.sign(previousOmega)!==Math.sign(nextOmega)){
    nextOmega=0;
  }

  state.omega=Number.isFinite(nextOmega)?nextOmega:0;
  if(brakingOnly&&!absEligible&&Math.abs(state.omega)<.35){
    const forceAtLock=lockedForce();
    const reactionAtLock=-forceAtLock.fxWheel*radius;
    const opposing=brakeTorqueNm*reactionAtLock<=0;
    if(opposing&&Math.abs(brakeTorqueNm)+1>=Math.abs(reactionAtLock)){
      state.omega=0;
      return {force:forceAtLock,locked:true,absActive:false};
    }
  }

  return {force:forceAtOmega(state.omega),locked:false,absActive:absRegulation.active};
}

function serializableWheel(wheel){
  return {
    index:wheel.index,
    axleIndex:wheel.axleIndex,
    side:wheel.side,
    front:wheel.front,
    localX:wheel.localX,
    localZ:wheel.localZ,
    steerAngle:wheel.steerAngle,
    normalLoadN:wheel.normalLoadN,
    longitudinalSpeed:wheel.longitudinalSpeed,
    lateralSpeed:wheel.lateralSpeed,
    wheelOmega:wheel.wheelOmega,
    wheelRpm:wheel.wheelOmega*60/(2*Math.PI),
    locked:!!wheel.locked,
    absActive:!!wheel.absActive,
    slipRatio:wheel.slipRatio,
    slipAngle:wheel.slipAngle,
    fxWheel:wheel.fxWheel,
    fyWheel:wheel.fyWheel,
    forceX:wheel.forceX,
    forceZ:wheel.forceZ,
    yawMomentNm:wheel.yawMomentNm,
    utilization:wheel.utilization,
    saturated:wheel.saturated,
    mu:wheel.mu
  };
}

export function createPerWheelShadowSolver({hz=120,maxSubSteps=8}={}){
  const clock=createFixedStepAccumulator({hz,maxSubSteps,maxFrameTime:.10});
  const wheelState=new Map();
  let vehicleKey=null;
  let lastInput=null;
  let lastObservedSpeed=null;
  let stateDiscontinuityResets=0;
  let lastResult={
    authoritative:false,
    shadow:true,
    steps:0,
    wheelCount:0,
    totalForceX:0,
    totalForceZ:0,
    totalYawMomentNm:0,
    predictedAccelX:0,
    predictedAccelZ:0,
    predictedYawAccel:0,
    stateDiscontinuityResets:0,
    wheels:[]
  };

  function reset(){
    wheelState.clear();
    vehicleKey=null;
    lastInput=null;
    lastObservedSpeed=null;
    stateDiscontinuityResets=0;
    clock.reset();
    lastResult={
      authoritative:false,
      shadow:true,
      steps:0,
      wheelCount:0,
      totalForceX:0,
      totalForceZ:0,
      totalYawMomentNm:0,
      predictedAccelX:0,
      predictedAccelZ:0,
      predictedYawAccel:0,
      stateDiscontinuityResets:0,
      wheels:[]
    };
  }

  function simulateStep(step,input){
    const vehicle=input?.vehicle||{};
    const key=String(input?.vehicleId||vehicle?.id||'unknown');
    if(vehicleKey!==key){
      wheelState.clear();
      vehicleKey=key;
    }

    const contacts=Array.isArray(input?.contacts)?input.contacts:[];
    const axles=normalizedAxles(vehicle);
    const massKg=Math.max(250,finite(vehicle?.massKg,1500));
    const cgHeight=Math.max(.1,finite(vehicle?.cgHeight,.52));
    const yawInertia=Math.max(
      1,
      finite(
        vehicle?.yawInertiaKgM2,
        massKg*(Math.max(.5,finite(vehicle?.wheelbase,2.7))**2+Math.max(.5,finite(vehicle?.trackWidth,1.55))**2)/12*Math.max(.45,finite(vehicle?.yawInertiaScale,1))
      )
    );
    const body=bodyVelocityFromWorldMotion(input);
    // Grip R10 — slope gravity must not masquerade as tire-force load transfer.
    // The chassis net acceleration includes grade, rolling resistance and aero.
    // Feeding that net value into axle loading unloaded the rear on climbs, so a
    // small steering correction at speed could provoke artificial oversteer.
    // Use only longitudinal force requested through the contact patches here.
    const requestedTireForceAccel=
      finite(input?.requestedDriveAccel,0)+
      finite(input?.requestedBrakeAccel,0);
    const explicitLoadTransferAccel=Number(input?.longitudinalLoadTransferAccel);
    const transferLimit=Math.max(3,Math.abs(finite(vehicle?.longitudinalAccelLimit,9.80665)));
    const longitudinalLoadTransferAccel=clamp(
      Number.isFinite(explicitLoadTransferAccel)?explicitLoadTransferAccel:requestedTireForceAccel,
      -transferLimit,
      transferLimit
    );
    const axleLoads=axleLoadFractions(vehicle,axles,longitudinalLoadTransferAccel);
    const counts=contactCounts(contacts,axles.length);
    const tire=tireProfileForVehicle(key,vehicle);
    const geometry=ackermannSteeringAngles({
      wheelbase:vehicle?.wheelbase,
      trackWidth:axles[0]?.trackWidth||vehicle?.trackWidth,
      centerAngle:input?.centerSteerAngle
    });

    const driveForceN=finite(input?.requestedDriveAccel)*massKg;
    const brakeForceN=finite(input?.requestedBrakeAccel)*massKg;
    const effectiveBrakeShares=effectiveServiceBrakeShares(vehicle,axles,axleLoads,input?.requestedBrakeAccel);
    const surfaceId=input?.surfaceId||'asphalt-dry';
    const handbrake=!!input?.handbrake;
    const wheels=[];
    let totalForceX=0,totalForceZ=0,totalYawMomentNm=0;

    for(let index=0;index<contacts.length;index++){
      const contact=contacts[index]||{};
      const axleIndex=clamp(Math.trunc(finite(contact.axleIndex,contact.front?0:Math.min(1,axles.length-1))),0,axles.length-1);
      const axle=axles[axleIndex];
      const side=contact.side||(finite(contact.localX)<0?'left':'right');
      const localX=finite(contact.localX);
      const localZ=finite(contact.localZ,axle?.positionM||0);
      const steerAngle=contactSteerAngle({contact:{...contact,side},axle,geometry});
      const patch=contactPatchVelocity({
        bodyVx:body.vx,
        bodyVz:body.vz,
        yawRate:input?.yawRate,
        localX,
        localZ,
        steerAngle
      });
      const normalLoadN=wheelNormalLoad({
        contact:{...contact,side},
        axle,
        axleIndex,
        axleLoads,
        counts,
        massKg,
        lateralAccel:input?.lateralAccel,
        cgHeight
      });

      let state=wheelState.get(index);
      if(!state){
        state={omega:patch.longitudinal/Math.max(.05,tire.rollingRadiusM)};
        wheelState.set(index,state);
      }
      if(!Number.isFinite(state.omega))state.omega=0;

      const axleContactCount=Math.max(1,counts[axleIndex]?.total||1);
      const rear=axle.positionM<0||contact.front===false;
      const rawDriveTorqueNm=driveForceN*wheelShare(axle,'driveShare',axleContactCount)*tire.rollingRadiusM;
      // Grip R18 — a mechanical handbrake owns the rear wheel while applied.
      // Motor/engine torque cannot simultaneously keep that same wheel driven
      // and prevent it from entering the locked/sliding state. FWD front drive
      // remains available; AWD keeps only its front-axle share.
      const driveTorqueNm=handbrake&&rear?0:rawDriveTorqueNm;

      // P2 refinement — with ABS active, left/right service-brake torque follows
      // instantaneous vertical load inside each axle. This keeps a light inside
      // wheel from locking first during trail braking. No-ABS vehicles preserve
      // equal hydraulic split across the wheels of the configured axle bias.
      const axleNormalLoad=Math.max(1,massKg*G*Math.max(0,axleLoads[axleIndex]||0));
      const wheelBrakeFractionWithinAxle=
        vehicle?.absEnabled===false
          ?1/axleContactCount
          :clamp(normalLoadN/axleNormalLoad,0,1);
      const serviceBrakeTorqueNm=
        brakeForceN*
        Math.max(0,finite(effectiveBrakeShares[axleIndex],0))*
        wheelBrakeFractionWithinAxle*
        tire.rollingRadiusM;

      let handbrakeTorqueNm=0;
      if(handbrake&&rear&&normalLoadN>0){
        const rollingSign=Math.sign(state.omega||patch.longitudinal||1);
        const hardwareScale=Math.max(.7,finite(vehicle?.handbrakeTorqueScale,1.18));
        handbrakeTorqueNm=-rollingSign*normalLoadN*Math.max(.75,tire.peakMu)*tire.rollingRadiusM*hardwareScale;
      }

      const integrated=integrateWheelOmegaStable({
        state,
        step,
        tire,
        surfaceId,
        normalLoadN,
        patch,
        steerAngle,
        localX,
        localZ,
        driveTorqueNm,
        serviceBrakeTorqueNm,
        handbrakeTorqueNm,
        absEnabled:vehicle?.absEnabled!==false
      });
      let force=integrated.force;
      if(integrated.locked){
        // Grip R8 — a locked tire is sliding, so kinetic friction opposes the
        // actual contact-patch velocity in the chassis frame. The old wheel-
        // axis brush calculation could rotate a large braking force sideways
        // with steering lock and yaw the car opposite the driver's command.
        const handbrakeLockedLateralScale=
          handbrake&&rear
            ?clamp(finite(vehicle?.handbrakeLockedLateralScale,.46),.25,1)
            :1;
        const groundSlide=lockedTireGroundForce({
          bodyX:patch.bodyX,
          bodyZ:patch.bodyZ,
          normalLoadN,
          slideMu:force?.slideMu,
          lateralScale:handbrakeLockedLateralScale,
          steerAngle,
          localX,
          localZ
        });
        force={
          ...force,
          ...groundSlide,
          slideBlend:1,
          saturated:true,
          utilization:Math.max(1,finite(force?.utilization,1))
        };
      }

      totalForceX+=force.forceX;
      totalForceZ+=force.forceZ;
      totalYawMomentNm+=force.yawMomentNm;
      wheels.push(serializableWheel({
        index,
        axleIndex,
        side,
        front:contact.front!==undefined?!!contact.front:axle.positionM>=0,
        localX,
        localZ,
        steerAngle,
        normalLoadN,
        longitudinalSpeed:patch.longitudinal,
        lateralSpeed:patch.lateral,
        wheelOmega:state.omega,
        locked:integrated.locked,
        absActive:integrated.absActive,
        ...force
      }));
    }

    lastResult={
      authoritative:false,
      shadow:true,
      vehicleId:key,
      tireProfile:tire.id,
      surfaceId,
      wheelCount:wheels.length,
      bodyVx:body.vx,
      bodyVz:body.vz,
      bodySideslipRad:body.sideslipRad,
      longitudinalLoadTransferAccel,
      axleLoads:[...axleLoads],
      centerSteerAngle:finite(input?.centerSteerAngle),
      ackermann:{...geometry},
      serviceBrakeShares:[...effectiveBrakeShares],
      totalForceX,
      totalForceZ,
      totalYawMomentNm,
      predictedAccelX:totalForceX/massKg,
      predictedAccelZ:totalForceZ/massKg,
      predictedYawAccel:totalYawMomentNm/yawInertia,
      stateDiscontinuityResets,
      wheels
    };
  }

  function advance(frameDt,input={}){
    const observedSpeed=finite(input?.speed,0);
    const dt=Math.max(0,finite(frameDt,0));
    const discontinuityThreshold=Math.max(4,80*Math.min(.10,dt));

    if(lastObservedSpeed!==null&&Math.abs(observedSpeed-lastObservedSpeed)>discontinuityThreshold){
      wheelState.clear();
      stateDiscontinuityResets++;
    }

    lastObservedSpeed=observedSpeed;
    lastInput=input;
    const timing=clock.advance(frameDt,step=>simulateStep(step,lastInput));
    lastResult={...lastResult,steps:timing.steps,timing,stateDiscontinuityResets};
    return lastResult;
  }

  function diagnostics(){
    return {
      ...lastResult,
      timing:clock.diagnostics(),
      wheels:(lastResult.wheels||[]).map(wheel=>({...wheel})),
      ackermann:lastResult.ackermann?{...lastResult.ackermann}:null
    };
  }

  return {advance,reset,diagnostics};
}

export { bodyVelocityFromWorldMotion };
