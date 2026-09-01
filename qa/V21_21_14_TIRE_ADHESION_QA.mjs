import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {
  estimateWheelGripUsage,
  steeringCommand,
  lateralDynamicsEnvelope,
  yawResponseRate
} from '../src/physics/vehicle-dynamics.js';

const DEG=180/Math.PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angleDelta=(target,current)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));
const fail=(msg)=>{throw new Error(msg)};
const vehicle=(id)=>createVehicleSystem({initialId:id}).physics;

function simulate({id='wrx',speed0=5,turn=.55,handbrake=false,handStart=.8,handDuration=.45,duration=3}={}){
  const v=vehicle(id),dt=1/60;
  let speed=speed0,heading=0,velocityHeading=0,dynamicYawRate=0,steer=0;
  let frontSlip=0,rearSlip=0,gripAccumulator=0;
  let maxSideslip=0,maxRearSlip=0,maxFrontSlip=0,maxBoost=1;
  let grip={smoothed:[0,0,0,0],frontLateral:0,rearLateral:0,frictionYawAccel:0,netLateralAccel:0,rearLateralForceScale:1};
  const steps=Math.ceil(duration/dt);
  for(let step=0;step<steps;step++){
    const t=step*dt,hand=handbrake&&t>=handStart&&t<handStart+handDuration;
    if(hand)speed=Math.max(0,speed-4.2*dt);
    const speedAbs=Math.abs(speed);
    const steering=steeringCommand({vehicle:v,speedAbs,input:turn},{});
    const steerResponse=steering.target===0?steering.returnRate:steering.inputRate;
    steer+=(steering.target-steer)*(1-Math.exp(-dt*steerResponse));
    const steerAngle=steer*steering.maxRoadWheelAngle;
    const lat=lateralDynamicsEnvelope({vehicle:v,speed,steerAngle,steerInput:steer,driveThrottle:0,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,rearSlipAmount:rearSlip,airborne:false},{});
    let yawRate=lat.yawRate;

    gripAccumulator+=dt;
    if(gripAccumulator>=.05){
      gripAccumulator%=.05;
      grip=estimateWheelGripUsage({
        requestedLatAccel:lat.requestedLatAccel,signedLatAccel:lat.signedLatAccel,latLimit:lat.latLimit,
        longitudinalAccel:hand?-4.2:0,propulsionAccel:0,serviceBrakeAccel:0,throttle:0,
        handbrake:hand,airborne:false,vehicle:v,speedAbs,dt:.05,contacts:[],previousUsage:grip.smoothed
      },grip);
    }
    maxBoost=Math.max(maxBoost,grip.lowSpeedStaticGripBoost||1);

    const lowSpeedSlipReleaseBoost=1+(1-clamp(speedAbs/8,0,1))*1.6;
    const frontTarget=grip.frontLateral||0,rearTarget=grip.rearLateral||0;
    frontSlip+=(frontTarget-frontSlip)*(1-Math.exp(-dt*(frontTarget>frontSlip?7.8:5.8*lowSpeedSlipReleaseBoost)));
    rearSlip+=(rearTarget-rearSlip)*(1-Math.exp(-dt*(rearTarget>rearSlip?7.8:5.8*lowSpeedSlipReleaseBoost)));
    maxRearSlip=Math.max(maxRearSlip,rearSlip);maxFrontSlip=Math.max(maxFrontSlip,frontSlip);

    if(lat.requestedLatAccel>lat.latLimit&&lat.requestedLatAccel>0)yawRate*=lat.latLimit/lat.requestedLatAccel;
    const frontDominance=Math.max(0,frontSlip-rearSlip*.55);
    const rearDominance=Math.max(0,rearSlip-frontSlip*.55);
    const fourWheelSlide=Math.min(frontSlip,rearSlip);
    yawRate*=Math.max(.46,1-frontDominance*.54-fourWheelSlide*.24);
    if(rearDominance>.015&&speedAbs>4){
      const highSpeedRearStabilityT=clamp((speedAbs-25)/30,0,1);
      const legacySlipYawScale=1-highSpeedRearStabilityT*.55;
      yawRate+=Math.sign(yawRate||steerAngle||1)*rearDominance*Math.min(.135,.040+speedAbs*.0022)*legacySlipYawScale*Math.sign(speed||1);
    }

    const frictionYawAccel=Number.isFinite(grip.frictionYawAccel)?grip.frictionYawAccel:0;
    const netLateralAccel=Number.isFinite(grip.netLateralAccel)?grip.netLateralAccel:lat.signedLatAccel;
    const rearForceScale=Number.isFinite(grip.rearLateralForceScale)?clamp(grip.rearLateralForceScale,0,1):1;
    const rearForceLoss=Math.abs(lat.signedLatAccel)>.15?1-rearForceScale:0;
    const frictionYawLoss=clamp(Math.abs(frictionYawAccel)/4.5,0,1);
    const forceSlide=clamp(Math.max(frictionYawLoss,rearForceLoss),0,1);

    const yawResponse=yawResponseRate({vehicle:v,speedAbs,airborne:false});
    const yawReleaseBoost=Math.abs(yawRate)<Math.abs(dynamicYawRate)?1.35:1;
    const yawGripResponseScale=Math.max(.34,1-forceSlide*.66);
    dynamicYawRate+=frictionYawAccel*dt;
    dynamicYawRate+=(yawRate-dynamicYawRate)*(1-Math.exp(-dt*yawResponse*yawReleaseBoost*yawGripResponseScale));
    heading+=dynamicYawRate*dt;

    if(!Number.isFinite(velocityHeading)||speedAbs<1.2)velocityHeading=heading;
    const trajectoryRearSlip=Math.max(0,rearSlip-frontSlip*.45);
    const lowSpeedNoSlip=speedAbs<8.5&&forceSlide<.18&&frontSlip<.16&&rearSlip<.16;
    if(lowSpeedNoSlip){
      if(speedAbs<2.5)velocityHeading=heading;
      else{
        const lowSpeedLockT=1-clamp((speedAbs-2.5)/6.0,0,1);
        const lowSpeedFollowRate=34+lowSpeedLockT*48;
        velocityHeading+=angleDelta(heading,velocityHeading)*(1-Math.exp(-dt*lowSpeedFollowRate));
      }
    }else if(speedAbs>4&&forceSlide>.10){
      const forceTrajectoryYawRate=netLateralAccel/(Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5);
      velocityHeading+=forceTrajectoryYawRate*dt;
      const slideAlignmentRate=.65+(1-forceSlide)*3.20;
      velocityHeading+=angleDelta(heading,velocityHeading)*(1-Math.exp(-dt*slideAlignmentRate));
    }else{
      const velocityFollowRate=(2.8-1.45*frictionYawLoss)+27.2*Math.pow(1-clamp(trajectoryRearSlip,0,1),2);
      velocityHeading+=angleDelta(heading,velocityHeading)*(1-Math.exp(-dt*velocityFollowRate));
    }
    maxSideslip=Math.max(maxSideslip,Math.abs(angleDelta(heading,velocityHeading)));
  }
  return {maxSideslip,maxRearSlip,maxFrontSlip,maxBoost,heading,velocityHeading};
}

// Normal steering at neighbourhood/parking speed should remain in the static
// adhesion region. The body and velocity vector should not visibly diverge.
for(const id of ['id4','wrx','civic','sonata','countach_80','i3_2017']){
  for(const speed of [1.5,3,5,7]){
    const r=simulate({id,speed0:speed,turn:.60,handbrake:false,duration:2.5});
    const slipDeg=r.maxSideslip*DEG;
    if(slipDeg>1.15)fail(`${id} ${speed} m/s: low-speed sideslip ${slipDeg.toFixed(3)} deg`);
    if(r.maxRearSlip>.12||r.maxFrontSlip>.12)fail(`${id} ${speed} m/s: false low-speed tire saturation`);
  }
}

// Left/right must remain exactly symmetric: no per-side adhesion bias.
for(const speed of [3,5,7]){
  const right=simulate({speed0:speed,turn:.60});
  const left=simulate({speed0:speed,turn:-.60});
  if(Math.abs(right.maxSideslip-left.maxSideslip)>1e-10)fail(`left/right asymmetry at ${speed} m/s`);
  if(Math.abs(right.heading+left.heading)>1e-10)fail(`left/right yaw asymmetry at ${speed} m/s`);
}

// The appreciated handbrake breakaway must still work at normal drift speed.
const drift=simulate({speed0:20,turn:.5,handbrake:true,handStart:.8,handDuration:.5,duration:3});
if(drift.maxSideslip*DEG<14)fail(`handbrake drift weakened too far: ${(drift.maxSideslip*DEG).toFixed(2)} deg`);

console.log('V21.21.14 TIRE ADHESION QA: PASS');
for(const speed of [1.5,3,5,7]){
  const r=simulate({speed0:speed,turn:.60});
  console.log(`WRX ${String((speed*3.6).toFixed(0)).padStart(2)} km/h: sideslip ${(r.maxSideslip*DEG).toFixed(3)} deg, front ${(r.maxFrontSlip*100).toFixed(1)}%, rear ${(r.maxRearSlip*100).toFixed(1)}%, static boost ${(r.maxBoost*100).toFixed(0)}%`);
}
console.log(`WRX handbrake 72 km/h: max sideslip ${(drift.maxSideslip*DEG).toFixed(2)} deg`);
