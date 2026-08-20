import {createVehicleSystem} from '../src/vehicle-system.js';
import {
  steeringCommand,
  lateralDynamicsEnvelope,
  longitudinalTractionLimit,
  estimateWheelGripUsage,
  yawResponseRate
} from '../src/vehicle-dynamics.js';

const DEG=180/Math.PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fail=(msg)=>{throw new Error(msg)};
const ids=['id4','wrx','civic','sonata','countach_80','i3_2017'];
const vehicle=(id)=>createVehicleSystem({initialId:id}).physics;

function offroadMu(v,speed){
  const awd=v.drivetrain==='AWD'?1.18:1;
  const staticBoost=1+.12*(1-clamp(Math.abs(speed)/7,0,1));
  return Math.max(.22,(v.offroadGrip??.60)*awd*staticBoost);
}
function roadMu(v){
  return Math.max(.25,(v.longitudinalAccelLimit??v.brake??9.8)/9.80665);
}

// Parking steering must materially tighten the radius, but disappear before
// ordinary cornering speed so V21.21.13 high-speed stability is untouched.
for(const id of ids){
  const v=vehicle(id);
  const stop=steeringCommand({vehicle:v,speedAbs:0,input:1},{});
  const normal=steeringCommand({vehicle:v,speedAbs:9,input:1},{});
  const stopRadius=v.wheelbase/Math.tan(stop.maxRoadWheelAngle);
  if(!(stop.parkingSteerScale>1.20&&stop.parkingSteerScale<1.27))fail(`${id}: parking steering boost missing`);
  if(stopRadius>4.9)fail(`${id}: parking radius still too large (${stopRadius.toFixed(2)} m)`);
  if(Math.abs(normal.parkingSteerScale-1)>1e-12)fail(`${id}: parking boost leaked into normal road speed`);
}

// Weak throttle should remain well inside the friction circle on pavement and
// on loose terrain. This is the regression that previously made even modest
// acceleration produce apparent wheel slip / lateral breakaway.
for(const id of ids){
  const v=vehicle(id);
  for(const offroad of [false,true]){
    const speed=3;
    const mu=offroad?offroadMu(v,speed):roadMu(v);
    const throttle=.25;
    const requested=v.accel*throttle*(offroad?.80:1);
    const drive=longitudinalTractionLimit({vehicle:v,requestedAccel:requested,surfaceMu:mu,mode:'drive',airborne:false},{});
    const steering=steeringCommand({vehicle:v,speedAbs:speed,input:1},{});
    const lat=lateralDynamicsEnvelope({
      vehicle:v,speed,steerAngle:steering.maxRoadWheelAngle,steerInput:1,driveThrottle:throttle,
      onPavement:!offroad,surfaceGrip:1,awdOffroadGripBonus:offroad&&v.drivetrain==='AWD'?1.18:1,
      rearSlipAmount:0,airborne:false
    },{});
    const grip=estimateWheelGripUsage({
      requestedLatAccel:lat.requestedLatAccel,signedLatAccel:lat.signedLatAccel,latLimit:lat.latLimit,
      longitudinalAccel:drive.acceleration,propulsionAccel:drive.acceleration,serviceBrakeAccel:0,
      surfaceMu:mu,throttle,handbrake:false,airborne:false,vehicle:v,speedAbs:speed,dt:.05,
      contacts:[],previousUsage:[0,0,0,0]
    },{});
    const maxLong=Math.max(...grip.longitudinalUsage);
    if(maxLong>.66)fail(`${id} ${offroad?'offroad':'road'}: weak-throttle longitudinal use ${(maxLong*100).toFixed(1)}%`);
    if(grip.frontLateral>.08||grip.rearLateral>.08)fail(`${id} ${offroad?'offroad':'road'}: weak throttle caused lateral breakaway`);
  }
}

// Grade acceleration is external to the contact-patch drive/brake force and
// must not change the tire-force load-transfer result. This catches the old
// off-road/slope feedback bug.
{
  const v=vehicle('wrx');
  const base=estimateWheelGripUsage({
    requestedLatAccel:1.5,signedLatAccel:1.5,latLimit:9.4,longitudinalAccel:0,
    propulsionAccel:0,serviceBrakeAccel:0,surfaceMu:roadMu(v),throttle:0,handbrake:false,
    airborne:false,vehicle:v,speedAbs:5,dt:.05,contacts:[],previousUsage:[0,0,0,0]
  },{});
  const downhill=estimateWheelGripUsage({
    requestedLatAccel:1.5,signedLatAccel:1.5,latLimit:9.4,longitudinalAccel:3.5,
    propulsionAccel:0,serviceBrakeAccel:0,surfaceMu:roadMu(v),throttle:0,handbrake:false,
    airborne:false,vehicle:v,speedAbs:5,dt:.05,contacts:[],previousUsage:[0,0,0,0]
  },{});
  for(let i=0;i<base.axleLoads.length;i++){
    if(Math.abs(base.axleLoads[i]-downhill.axleLoads[i])>1e-12)fail('grade acceleration leaked into tire load transfer');
  }
}

// Start-from-rest full-lock launch: the car must immediately develop yaw and
// carve a tight hairpin rather than accelerating nearly straight ahead.
function launch({offroad=false}={}){
  const v=vehicle('wrx'),dt=1/60,throttle=.25;
  let speed=0,heading=0,dynamicYawRate=0,x=0,z=0;
  for(let i=0;i<180;i++){
    const mu=offroad?offroadMu(v,speed):roadMu(v);
    const requested=v.accel*throttle*(offroad?.80:1);
    const drive=longitudinalTractionLimit({vehicle:v,requestedAccel:requested,surfaceMu:mu,mode:'drive',airborne:false},{});
    speed+=drive.acceleration*dt;
    const steering=steeringCommand({vehicle:v,speedAbs:speed,input:1},{});
    const lat=lateralDynamicsEnvelope({vehicle:v,speed,steerAngle:steering.maxRoadWheelAngle,steerInput:1,driveThrottle:throttle,onPavement:!offroad,surfaceGrip:1,awdOffroadGripBonus:offroad?1.18:1,rearSlipAmount:0,airborne:false},{});
    let yawRate=lat.yawRate;
    if(lat.requestedLatAccel>lat.latLimit&&lat.requestedLatAccel>0)yawRate*=lat.latLimit/lat.requestedLatAccel;
    const response=yawResponseRate({vehicle:v,speedAbs:speed,airborne:false});
    dynamicYawRate+=(yawRate-dynamicYawRate)*(1-Math.exp(-dt*response));
    heading+=dynamicYawRate*dt;
    x+=Math.sin(heading)*speed*dt;
    z+=Math.cos(heading)*speed*dt;
  }
  return {heading,x,z,speed};
}
for(const offroad of [false,true]){
  const r=launch({offroad});
  if(Math.abs(r.heading)*DEG<(offroad?55:75))fail(`${offroad?'offroad':'road'} full-lock launch did not turn enough (${(r.heading*DEG).toFixed(1)} deg)`);
  if(Math.abs(r.x)<2.0)fail(`${offroad?'offroad':'road'} full-lock launch stayed too straight`);
}

// Friction-circle handbrake behavior remains available at drift speed.
{
  const v=vehicle('wrx'),speed=20,mu=roadMu(v);
  const steering=steeringCommand({vehicle:v,speedAbs:speed,input:.5},{});
  const lat=lateralDynamicsEnvelope({vehicle:v,speed,steerAngle:steering.maxRoadWheelAngle*.5,steerInput:.5,driveThrottle:0,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,rearSlipAmount:0,airborne:false},{});
  const grip=estimateWheelGripUsage({
    requestedLatAccel:lat.requestedLatAccel,signedLatAccel:lat.signedLatAccel,latLimit:lat.latLimit,
    longitudinalAccel:-4.2,propulsionAccel:0,serviceBrakeAccel:0,surfaceMu:mu,throttle:0,
    handbrake:true,airborne:false,vehicle:v,speedAbs:speed,dt:.05,contacts:[],previousUsage:[0,0,0,0]
  },{});
  if(grip.rearLateral<.45)fail(`handbrake rear breakaway weakened too far (${(grip.rearLateral*100).toFixed(1)}%)`);
}

console.log('V21.21.15 LOW-SPEED / TRACTION QA: PASS');
const wrx=vehicle('wrx');
const s0=steeringCommand({vehicle:wrx,speedAbs:0,input:1},{});
console.log(`WRX parking wheel angle ${(s0.maxRoadWheelAngle*DEG).toFixed(1)} deg, radius ${(wrx.wheelbase/Math.tan(s0.maxRoadWheelAngle)).toFixed(2)} m`);
for(const offroad of [false,true]){
  const r=launch({offroad});
  console.log(`WRX ${offroad?'offroad':'road'} launch: ${(r.heading*DEG).toFixed(1)} deg heading after 3 s, ${(r.speed*3.6).toFixed(1)} km/h`);
}
