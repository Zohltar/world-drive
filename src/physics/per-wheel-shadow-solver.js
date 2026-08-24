import { createFixedStepAccumulator } from './fixed-step.js';
import {
  contactPatchVelocity,
  resolveTireForces,
  tireProfileForVehicle
} from './tire-model.js';
import { ackermannSteeringAngles } from './steering-geometry.js';

// World Drive V21.27 — non-authoritative per-wheel shadow solver.
//
// This solver deliberately runs beside the proven V21.26 handling. It computes
// contact-patch slip, tire forces, wheel angular speed and chassis force/moment
// diagnostics, but it NEVER writes vehicle position, heading or speed.
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
    wheels:[]
  };

  function reset(){
    wheelState.clear();
    vehicleKey=null;
    lastInput=null;
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
    const axleLoads=axleLoadFractions(vehicle,axles,input?.longitudinalAccel);
    const counts=contactCounts(contacts,axles.length);
    const tire=tireProfileForVehicle(key,vehicle);
    const geometry=ackermannSteeringAngles({
      wheelbase:vehicle?.wheelbase,
      trackWidth:axles[0]?.trackWidth||vehicle?.trackWidth,
      centerAngle:input?.centerSteerAngle
    });

    const driveForceN=finite(input?.requestedDriveAccel)*massKg;
    const brakeForceN=finite(input?.requestedBrakeAccel)*massKg;
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

      const force=resolveTireForces({
        tire,
        surface:surfaceId,
        normalLoadN,
        longitudinalSpeed:patch.longitudinal,
        lateralSpeed:patch.lateral,
        wheelOmega:state.omega,
        steerAngle,
        localX,
        localZ
      });

      const axleContactCount=Math.max(1,counts[axleIndex]?.total||1);
      const driveTorqueNm=
        driveForceN*
        wheelShare(axle,'driveShare',axleContactCount)*
        tire.rollingRadiusM;
      const serviceBrakeTorqueNm=
        brakeForceN*
        wheelShare(axle,'brakeShare',axleContactCount)*
        tire.rollingRadiusM;

      const rear=axle.positionM<0||contact.front===false;
      let handbrakeTorqueNm=0;
      if(handbrake&&rear&&normalLoadN>0){
        const rollingSign=Math.sign(state.omega||patch.longitudinal||1);
        // Hardware torque is sized to be capable of locking the rear tire on
        // clean dry asphalt. Lower-friction surfaces therefore lock earlier.
        const hardwareScale=Math.max(.7,finite(vehicle?.handbrakeTorqueScale,1.18));
        handbrakeTorqueNm=
          -rollingSign*
          normalLoadN*
          Math.max(.75,tire.peakMu)*
          tire.rollingRadiusM*
          hardwareScale;
      }

      const inputTorqueNm=driveTorqueNm+serviceBrakeTorqueNm+handbrakeTorqueNm;
      const reactionTorqueNm=-force.fxWheel*tire.rollingRadiusM;
      const previousOmega=state.omega;
      state.omega+=(inputTorqueNm+reactionTorqueNm)/Math.max(.05,tire.wheelInertiaKgM2)*step;

      // A pure brake must stop at zero rather than numerically powering the wheel
      // backwards after crossing zero during one 120 Hz step.
      const hasDrive=Math.abs(driveTorqueNm)>.01;
      const brakingOnly=!hasDrive&&(Math.abs(serviceBrakeTorqueNm)+Math.abs(handbrakeTorqueNm)>.01);
      if(brakingOnly&&previousOmega!==0&&Math.sign(previousOmega)!==Math.sign(state.omega)){
        state.omega=0;
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
      centerSteerAngle:finite(input?.centerSteerAngle),
      ackermann:{...geometry},
      totalForceX,
      totalForceZ,
      totalYawMomentNm,
      predictedAccelX:totalForceX/massKg,
      predictedAccelZ:totalForceZ/massKg,
      predictedYawAccel:totalYawMomentNm/yawInertia,
      wheels
    };
  }

  function advance(frameDt,input={}){
    lastInput=input;
    const timing=clock.advance(frameDt,step=>simulateStep(step,lastInput));
    lastResult={...lastResult,steps:timing.steps,timing};
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
