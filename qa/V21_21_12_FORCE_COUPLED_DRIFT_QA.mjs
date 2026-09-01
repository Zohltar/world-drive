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
function vehicle(id){return createVehicleSystem({initialId:id}).physics;}

function simulate({id='wrx',handbrake=false,turn=.5,handStart=1,handDuration=.5,speed0=20}={}){
  const v=vehicle(id),dt=1/60;
  let speed=speed0,heading=0,velocityHeading=0,dynamicYawRate=0,steer=0;
  let frontSlip=0,rearSlip=0,gripAccumulator=0;
  let x=0,z=0,maxSideslip=0,maxYawRate=0,maxForceSlide=0;
  let grip={smoothed:[0,0,0,0],frontLateral:0,rearLateral:0,frictionYawAccel:0,netLateralAccel:0,rearLateralForceScale:1};

  for(let step=0;step<240;step++){
    const t=step*dt,hand=handbrake&&t>=handStart&&t<handStart+handDuration;
    if(hand)speed=Math.max(0,speed-4.2*dt);
    const steering=steeringCommand({vehicle:v,speedAbs:Math.abs(speed),input:turn},{});
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
        handbrake:hand,airborne:false,vehicle:v,dt:.05,contacts:[],previousUsage:grip.smoothed
      },grip);
    }

    const frontTarget=grip.frontLateral||0,rearTarget=grip.rearLateral||0;
    frontSlip+=(frontTarget-frontSlip)*(1-Math.exp(-dt*(frontTarget>frontSlip?7.8:5.8)));
    rearSlip+=(rearTarget-rearSlip)*(1-Math.exp(-dt*(rearTarget>rearSlip?7.8:5.8)));

    if(lat.requestedLatAccel>lat.latLimit&&lat.requestedLatAccel>0)yawRate*=lat.latLimit/lat.requestedLatAccel;
    const frontDominance=Math.max(0,frontSlip-rearSlip*.55);
    const rearDominance=Math.max(0,rearSlip-frontSlip*.55);
    const fourWheelSlide=Math.min(frontSlip,rearSlip);
    yawRate*=Math.max(.46,1-frontDominance*.54-fourWheelSlide*.24);
    if(rearDominance>.015&&Math.abs(speed)>4){
      yawRate+=Math.sign(yawRate||steerAngle||1)*rearDominance*Math.min(.135,.040+Math.abs(speed)*.0022)*Math.sign(speed||1);
    }

    const frictionYawAccel=Number.isFinite(grip.frictionYawAccel)?grip.frictionYawAccel:0;
    const netLateralAccel=Number.isFinite(grip.netLateralAccel)?grip.netLateralAccel:lat.signedLatAccel;
    const rearForceScale=Number.isFinite(grip.rearLateralForceScale)?clamp(grip.rearLateralForceScale,0,1):1;
    const rearForceLoss=Math.abs(lat.signedLatAccel)>.15?1-rearForceScale:0;
    const frictionYawLoss=clamp(Math.abs(frictionYawAccel)/4.5,0,1);
    const forceSlide=clamp(Math.max(frictionYawLoss,rearForceLoss),0,1);
    maxForceSlide=Math.max(maxForceSlide,forceSlide);

    const yawResponse=yawResponseRate({vehicle:v,speedAbs:Math.abs(speed),airborne:false});
    const yawReleaseBoost=Math.abs(yawRate)<Math.abs(dynamicYawRate)?1.35:1;
    const yawGripResponseScale=Math.max(.34,1-forceSlide*.66);
    dynamicYawRate+=frictionYawAccel*dt;
    dynamicYawRate+=(yawRate-dynamicYawRate)*(1-Math.exp(-dt*yawResponse*yawReleaseBoost*yawGripResponseScale));
    heading+=dynamicYawRate*dt;

    const trajectoryRearSlip=Math.max(0,rearSlip-frontSlip*.45);
    if(Math.abs(speed)>4&&forceSlide>.10){
      const forceTrajectoryYawRate=netLateralAccel/(Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5);
      velocityHeading+=forceTrajectoryYawRate*dt;
      const slideAlignmentRate=.65+(1-forceSlide)*3.20;
      velocityHeading+=angleDelta(heading,velocityHeading)*(1-Math.exp(-dt*slideAlignmentRate));
    }else{
      const velocityFollowRate=(2.8-1.45*frictionYawLoss)+27.2*Math.pow(1-clamp(trajectoryRearSlip,0,1),2);
      velocityHeading+=angleDelta(heading,velocityHeading)*(1-Math.exp(-dt*velocityFollowRate));
    }

    x+=Math.sin(velocityHeading)*speed*dt;
    z+=Math.cos(velocityHeading)*speed*dt;
    maxSideslip=Math.max(maxSideslip,Math.abs(angleDelta(heading,velocityHeading)));
    maxYawRate=Math.max(maxYawRate,Math.abs(dynamicYawRate));
  }
  return {x,z,speed,heading,maxSideslip,maxYawRate,maxForceSlide};
}

const normal=simulate({handbrake:false});
const hand=simulate({handbrake:true});
const straight=simulate({handbrake:true,turn:0});
const sideDeg=hand.maxSideslip*DEG;
const extraHeading=Math.abs(hand.heading-normal.heading)*DEG;
if(sideDeg<14)fail(`handbrake sideslip still too small: ${sideDeg.toFixed(2)} deg`);
if(extraHeading<20)fail(`handbrake extra heading still too small: ${extraHeading.toFixed(2)} deg`);
if(Math.abs(straight.heading)*DEG>.05)fail(`straight handbrake invented yaw: ${(straight.heading*DEG).toFixed(3)} deg`);
if(Math.abs(straight.maxSideslip)*DEG>.05)fail(`straight handbrake invented sideslip: ${(straight.maxSideslip*DEG).toFixed(3)} deg`);

for(const id of ['id4','wrx','civic','sonata','f1_2010','countach_80','i3_2017']){
  const r=simulate({id,handbrake:true,turn:.45,handDuration:.45,speed0:18});
  if(!Number.isFinite(r.heading)||!Number.isFinite(r.maxSideslip)||r.maxSideslip>Math.PI*1.2)fail(`${id}: unstable drift simulation`);
}

console.log('V21.21.12 FORCE-COUPLED DRIFT QA: PASS');
console.log(`WRX 0.5 s handbrake extra heading: ${extraHeading.toFixed(2)} deg`);
console.log(`WRX 0.5 s handbrake max sideslip: ${sideDeg.toFixed(2)} deg`);
console.log(`WRX max yaw rate: ${(hand.maxYawRate*DEG).toFixed(2)} deg/s`);
console.log(`WRX max rear force-loss coupling: ${(hand.maxForceSlide*100).toFixed(1)} %`);
