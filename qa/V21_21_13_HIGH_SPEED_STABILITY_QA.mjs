import {createVehicleSystem} from '../src/vehicle-system.js';
import {steeringCommand,lateralDynamicsEnvelope} from '../src/vehicle-dynamics.js';

const fail=(msg)=>{throw new Error(msg)};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function vehicle(id){return createVehicleSystem({initialId:id}).physics;}
function legacySteering(vehicle,speedAbs,input){
  const v=Math.max(0,speedAbs);
  const raw=clamp(input,-1,1);
  const low=vehicle.maxSteerLow??.46,high=vehicle.maxSteerHigh??.16;
  const speedBlend=clamp(v/32,0,1);
  const maxRoadWheelAngle=low+(high-low)*(speedBlend*speedBlend);
  let target=raw;
  if(Math.abs(target)<.08)target=0;
  else{
    const exponent=Math.max(.75,vehicle.steeringInputExponent??1);
    const t=clamp((v-8.3)/26.4,0,1);
    const smooth=t*t*(3-2*t);
    target=Math.sign(target)*Math.pow(Math.abs(target),exponent+1.15*smooth);
  }
  const highResponse=Math.max(.5,vehicle.steeringResponseHigh??3.8);
  return {target,maxRoadWheelAngle,inputRate:v<5?3.7:(v>25?highResponse:4.5)};
}

for(const id of ['id4','wrx','civic','sonata','f1_2010','countach_80','i3_2017']){
  const v=vehicle(id);
  const lowNew=steeringCommand({vehicle:v,speedAbs:20,input:.6},{});
  const lowOld=legacySteering(v,20,.6);
  if(Math.abs(lowNew.maxRoadWheelAngle-lowOld.maxRoadWheelAngle)>1e-12)fail(`${id}: low-speed angle changed`);
  if(Math.abs(lowNew.inputRate-lowOld.inputRate)>1e-12)fail(`${id}: low-speed response changed`);

  const highNew=steeringCommand({vehicle:v,speedAbs:55,input:.6},{});
  const highOld=legacySteering(v,55,.6);
  const angleRatio=highNew.maxRoadWheelAngle/highOld.maxRoadWheelAngle;
  const rateRatio=highNew.inputRate/highOld.inputRate;
  if(angleRatio>.725||angleRatio<.715)fail(`${id}: high-speed angle ratio ${angleRatio}`);
  if(rateRatio>.555||rateRatio<.545)fail(`${id}: high-speed response ratio ${rateRatio}`);

  const oldLat=lateralDynamicsEnvelope({vehicle:v,speed:55,steerAngle:highOld.maxRoadWheelAngle*highOld.target,steerInput:highOld.target,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1},{});
  const newLat=lateralDynamicsEnvelope({vehicle:v,speed:55,steerAngle:highNew.maxRoadWheelAngle*highNew.target,steerInput:highNew.target,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1},{});
  if(!(newLat.requestedLatAccel<oldLat.requestedLatAccel*.80))fail(`${id}: high-speed lateral demand not reduced enough`);
}

const wrx=vehicle('wrx');
const at100=steeringCommand({vehicle:wrx,speedAbs:100/3.6,input:.5},{});
const old100=legacySteering(wrx,100/3.6,.5);
if(at100.maxRoadWheelAngle/old100.maxRoadWheelAngle<.995)fail('WRX: stabilization intrudes too early near 100 km/h');
const at160=steeringCommand({vehicle:wrx,speedAbs:160/3.6,input:.5},{});
const old160=legacySteering(wrx,160/3.6,.5);
if(!(at160.maxRoadWheelAngle<old160.maxRoadWheelAngle*.84))fail('WRX: 160 km/h steering still too strong');

console.log('V21.21.13 HIGH-SPEED STABILITY QA: PASS');
console.log(`WRX angle authority: 100 km/h ${(at100.maxRoadWheelAngle/old100.maxRoadWheelAngle*100).toFixed(1)}%, 160 km/h ${(at160.maxRoadWheelAngle/old160.maxRoadWheelAngle*100).toFixed(1)}%`);
console.log(`WRX response authority at 160 km/h ${(at160.inputRate/old160.inputRate*100).toFixed(1)}%`);
