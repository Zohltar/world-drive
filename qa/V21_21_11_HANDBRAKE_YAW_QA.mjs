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
const approx=(a,b,eps=1e-9)=>Math.abs(a-b)<=eps;

function vehicle(id){return createVehicleSystem({initialId:id}).physics;}
function gripCase(v,{lat=4,handbrake=true,throttle=0,propulsion=0,brake=0,longitudinal=-4}={}){
  return estimateWheelGripUsage({
    requestedLatAccel:Math.abs(lat),signedLatAccel:lat,latLimit:v.lateralAccelLimit||8,
    longitudinalAccel:longitudinal,propulsionAccel:propulsion,serviceBrakeAccel:brake,
    throttle,handbrake,airborne:false,vehicle:v,dt:.05,contacts:[],previousUsage:[0,0,0,0]
  },{});
}

const wrx=vehicle('wrx');
const straight=gripCase(wrx,{lat:0,handbrake:true});
if(!approx(straight.frictionYawAccel,0,1e-12))fail(`straight handbrake invented yaw: ${straight.frictionYawAccel}`);

const noHand=gripCase(wrx,{lat:4,handbrake:false,longitudinal:0});
if(Math.abs(noHand.frictionYawAccel)>1e-9)fail(`coasting corner should not add friction yaw: ${noHand.frictionYawAccel}`);

const right=gripCase(wrx,{lat:4,handbrake:true});
const left=gripCase(wrx,{lat:-4,handbrake:true});
if(!(right.frictionYawAccel>2.0))fail(`WRX handbrake yaw too weak: ${right.frictionYawAccel}`);
if(!(left.frictionYawAccel<-2.0))fail(`WRX reverse-sign handbrake yaw too weak: ${left.frictionYawAccel}`);
if(Math.abs(right.frictionYawAccel+left.frictionYawAccel)>.02)fail('handbrake yaw is not sign symmetric');
if(!(right.rearLateral>.9&&right.frontLateral<.15))fail(`rear/front slip balance unexpected: ${right.rearLateral}/${right.frontLateral}`);

for(const id of ['id4','wrx','civic','sonata','f1_2010','countach_80','i3_2017']){
  const v=vehicle(id);
  const g=gripCase(v,{lat:Math.min(4,(v.lateralAccelLimit||8)*.55),handbrake:true});
  if(!(g.frictionYawAccel>.15))fail(`${id}: handbrake corner did not create positive yaw acceleration (${g.frictionYawAccel})`);
}

function simulate({handbrake=false,turn=.5}={}){
  const v=vehicle('wrx');
  const dt=1/60;
  let speed=20,heading=0,velocityHeading=0,dynamicYawRate=0,steer=0;
  let frontSlip=0,rearSlip=0,gripAccumulator=0;
  let x=0,z=0,maxSideslip=0,maxYawRate=0;
  let grip={smoothed:[0,0,0,0],frontLateral:0,rearLateral:0,frictionYawAccel:0};

  for(let step=0;step<180;step++){
    const t=step*dt;
    const hand=handbrake&&t>=1&&t<1.5;
    if(hand)speed=Math.max(0,speed-4.2*dt);

    const steering=steeringCommand({vehicle:v,speedAbs:Math.abs(speed),input:turn},{});
    const steerResponse=steering.target===0?steering.returnRate:steering.inputRate;
    steer+=(steering.target-steer)*(1-Math.exp(-dt*steerResponse));
    const steerAngle=steer*steering.maxRoadWheelAngle;
    const lat=lateralDynamicsEnvelope({
      vehicle:v,speed,steerAngle,steerInput:steer,driveThrottle:0,onPavement:true,
      surfaceGrip:1,awdOffroadGripBonus:1,rearSlipAmount:rearSlip,airborne:false
    },{});
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

    const yawResponse=yawResponseRate({vehicle:v,speedAbs:Math.abs(speed),airborne:false});
    const yawReleaseBoost=Math.abs(yawRate)<Math.abs(dynamicYawRate)?1.35:1;
    dynamicYawRate+=(grip.frictionYawAccel||0)*dt;
    dynamicYawRate+=(yawRate-dynamicYawRate)*(1-Math.exp(-dt*yawResponse*yawReleaseBoost));
    heading+=dynamicYawRate*dt;

    const trajectoryRearSlip=Math.max(0,rearSlip-frontSlip*.45);
    const frictionTrajectoryLoss=clamp(Math.abs(grip.frictionYawAccel||0)/4.5,0,1);
    const velocityFollowRate=(2.8-1.45*frictionTrajectoryLoss)+27.2*Math.pow(1-clamp(trajectoryRearSlip,0,1),2);
    velocityHeading+=angleDelta(heading,velocityHeading)*(1-Math.exp(-dt*velocityFollowRate));
    x+=Math.sin(velocityHeading)*speed*dt;
    z+=Math.cos(velocityHeading)*speed*dt;
    maxSideslip=Math.max(maxSideslip,Math.abs(angleDelta(heading,velocityHeading)));
    maxYawRate=Math.max(maxYawRate,Math.abs(dynamicYawRate));
  }
  return {x,z,speed,heading,maxSideslip,maxYawRate};
}

const normalTurn=simulate({handbrake:false,turn:.5});
const handTurn=simulate({handbrake:true,turn:.5});
const straightHand=simulate({handbrake:true,turn:0});
const extraHeading=Math.abs(handTurn.heading-normalTurn.heading)*DEG;
const sideDeg=handTurn.maxSideslip*DEG;
if(extraHeading<10)fail(`handbrake turn extra heading too small: ${extraHeading.toFixed(2)} deg`);
if(sideDeg<5)fail(`handbrake turn sideslip too small: ${sideDeg.toFixed(2)} deg`);
if(Math.abs(straightHand.heading)*DEG>.05)fail(`straight handbrake rotated chassis: ${(straightHand.heading*DEG).toFixed(3)} deg`);
if(Math.abs(straightHand.maxSideslip)*DEG>.05)fail(`straight handbrake created sideslip: ${(straightHand.maxSideslip*DEG).toFixed(3)} deg`);

console.log('V21.21.11 HANDBRAKE YAW QA: PASS');
console.log(`WRX 4 m/s² handbrake yaw acceleration: ${right.frictionYawAccel.toFixed(3)} rad/s²`);
console.log(`0.5 s handbrake extra heading: ${extraHeading.toFixed(2)} deg`);
console.log(`0.5 s handbrake max sideslip: ${sideDeg.toFixed(2)} deg`);
console.log(`0.5 s handbrake max yaw rate: ${(handTurn.maxYawRate*DEG).toFixed(2)} deg/s`);
