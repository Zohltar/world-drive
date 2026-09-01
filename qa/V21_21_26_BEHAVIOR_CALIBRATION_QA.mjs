import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {
  GRAVITY,
  steeringCommand,
  advanceSteeringRack,
  lateralDynamicsEnvelope,
  longitudinalTractionLimit,
  estimateWheelGripUsage,
  aerodynamicLoad
} from '../src/vehicle-dynamics.js';

const IDS=['id4','wrx','civic','sonata','f1_2010','countach_80','i3_2017'];
const CONTACTS=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];

// Instrumented/representative targets used for gameplay calibration. Ranges are
// deliberately wider than a single magazine run: temperature, tires, rollout,
// fuel and transmission strategy all move the measured result.
const TARGETS={
  id4:{zero100:[4.90,5.25],brake70:[49.0,54.0],latG:[.84,.88],topKph:[158,162]},
  wrx:{zero100:[5.50,6.00],brake70:[45.0,50.0],latG:[.93,.97]},
  civic:{zero100:[8.80,9.50],brake70:[49.0,54.0],latG:[.85,.89]},
  sonata:{zero100:[7.20,7.90],brake70:[48.0,53.0],latG:[.80,.84]},
  f1_2010:{zero100:[2.40,2.80],brake70:[15.0,30.0],latG:[2.05,2.15]},
  countach_80:{zero100:[4.80,5.50],brake70:[57.0,65.0],latG:[.80,.84],topKph:[292,298]},
  i3_2017:{zero100:[6.60,7.20],brake70:[51.0,57.0],latG:[.75,.79],topKph:[147,151]}
};

function inRange(value,[lo,hi],label){
  assert.ok(value>=lo&&value<=hi,`${label}: ${value.toFixed(3)} outside [${lo}, ${hi}]`);
}
function redlineSpeeds(audio){
  if(audio?.type!=='combustion')return [];
  const top=Number(audio.referenceTopGearRedlineKmh)||220;
  const topRatio=Number(audio.referenceTopGearRatio)||1;
  const ratios=Array.isArray(audio.gearRatios)&&audio.gearRatios.length?audio.gearRatios:[1];
  return ratios.map(r=>top*topRatio/Math.max(.05,Number(r)||1));
}
function simulatedZeroTo100(vehicle,audio){
  // Mirrors the current World Drive longitudinal model closely enough to be a
  // stable regression metric: traction limit + rolling/aero drag + automatic
  // redline shifts and their throttle interruption.
  const dt=1/480,target=100/3.6;
  const redline=redlineSpeeds(audio);
  const topKph=audio?.type==='combustion'
    ?Number(audio.referenceTopGearRedlineKmh)||220
    :Number(vehicle.topSpeedKmh)||220;
  const top=Math.max(1,topKph/3.6);
  const surfaceMu=Math.max(.25,(vehicle.longitudinalAccelLimit||vehicle.brake||9.8)/GRAVITY);
  let speed=0,t=0,gear=1,shiftTimer=0;
  while(speed<target&&t<20){
    let throttle=1;
    if(shiftTimer>0){
      shiftTimer=Math.max(0,shiftTimer-dt);
      throttle=0;
    }else if(audio?.type==='combustion'&&gear<redline.length&&speed*3.6>=redline[gear-1]){
      gear++;
      shiftTimer=Math.max(.045,Number(audio.shiftDuration)||.18);
      throttle=0;
    }
    const speedRatio=Math.min(1,Math.max(0,speed/top));
    const requested=vehicle.accel*throttle*(1-.38*speedRatio);
    const drive=longitudinalTractionLimit({vehicle,requestedAccel:requested,surfaceMu,mode:'drive',airborne:false,speedAbs:speed}).acceleration;
    const resist=(vehicle.rolling||0)+(vehicle.aero||0)*speed*speed;
    speed=Math.max(0,speed+(drive-resist)*dt);
    t+=dt;
  }
  return t;
}
function simulated70To0(vehicle){
  const dt=1/960;
  const surfaceMu=Math.max(.25,(vehicle.longitudinalAccelLimit||vehicle.brake||9.8)/GRAVITY);
  let speed=112.654/3.6,distance=0,t=0;
  while(speed>.005&&t<20){
    const brake=longitudinalTractionLimit({vehicle,requestedAccel:-vehicle.brake,surfaceMu,mode:'brake',airborne:false,speedAbs:speed}).acceleration;
    const resist=(vehicle.rolling||0)+(vehicle.aero||0)*speed*speed;
    const next=Math.max(0,speed+(brake-resist)*dt);
    distance+=(speed+next)*.5*dt;
    speed=next;t+=dt;
  }
  return distance;
}
function profileTopKph(sys){
  const p=sys.physics,a=sys.active.audio;
  return a?.type==='combustion'?(Number(a.referenceTopGearRedlineKmh)||0):(Number(p.topSpeedKmh)||0);
}

const report=[];
for(const id of IDS){
  const sys=createVehicleSystem({initialId:id});
  const v=sys.physics;
  const target=TARGETS[id];
  const z=simulatedZeroTo100(v,sys.active.audio);
  const b=simulated70To0(v);
  const lat=v.lateralAccelLimit/GRAVITY;
  inRange(z,target.zero100,`${id} 0-100`);
  inRange(b,target.brake70,`${id} 70-0 distance`);
  inRange(lat,target.latG,`${id} base lateral g`);
  if(target.topKph)inRange(profileTopKph(sys),target.topKph,`${id} top speed`);

  // Steering must remain left/right symmetric over the complete useful speed
  // range and the finite rack must actually honor the configured travel time.
  for(const kph of [0,10,40,80,120,160,250,320]){
    const speed=kph/3.6;
    const right=steeringCommand({vehicle:v,speedAbs:speed,input:1});
    const left=steeringCommand({vehicle:v,speedAbs:speed,input:-1});
    assert.ok(Number.isFinite(right.maxRoadWheelAngle)&&right.maxRoadWheelAngle>=0,`${id} ${kph}: invalid steering angle`);
    assert.ok(Math.abs(right.maxRoadWheelAngle-left.maxRoadWheelAngle)<1e-12,`${id} ${kph}: asymmetric steering geometry`);
    assert.ok(Math.abs(right.target+left.target)<1e-12,`${id} ${kph}: asymmetric steering shaping`);
  }
  {
    const dt=1/1000;
    const cmd=steeringCommand({vehicle:v,speedAbs:60/3.6,input:1});
    let rack=0,t=0;
    while(t<v.steeringCenterToFullTimeSec-.5*dt){
      rack=advanceSteeringRack({current:rack,target:cmd.target,dt,inputSlewRate:cmd.inputSlewRate,returnSlewRate:cmd.returnSlewRate,inputRate:cmd.inputRate,returnRate:cmd.returnRate});
      t+=dt;
    }
    assert.ok(rack>.985,`${id}: steering rack did not reach requested lock in configured time (${rack})`);
  }

  // Full-throttle straight-line acceleration must not invent lateral tire slip.
  // Rear-drive cars may approach longitudinal saturation, but nothing should
  // create a lateral breakaway in a straight line.
  for(const kph of [5,20,50,100]){
    const speed=kph/3.6;
    const mu=(v.longitudinalAccelLimit||v.brake||9.8)/GRAVITY;
    const drive=longitudinalTractionLimit({vehicle:v,requestedAccel:v.accel,surfaceMu:mu,mode:'drive',airborne:false,speedAbs:speed}).acceleration;
    const grip=estimateWheelGripUsage({
      requestedLatAccel:0,signedLatAccel:0,latLimit:v.lateralAccelLimit,
      longitudinalAccel:drive,propulsionAccel:drive,serviceBrakeAccel:0,
      surfaceMu:mu,throttle:1,handbrake:false,airborne:false,vehicle:v,speedAbs:speed,
      dt:.05,contacts:CONTACTS,previousUsage:[0,0,0,0]
    });
    assert.equal(grip.frontLateral,0,`${id} ${kph}: straight launch created front lateral slip`);
    assert.equal(grip.rearLateral,0,`${id} ${kph}: straight launch created rear lateral slip`);
    assert.ok(grip.raw.every(Number.isFinite),`${id} ${kph}: invalid wheel grip`);
  }

  report.push({id,zero100:z,brake70:b,latG:lat,topKph:profileTopKph(sys)});
}

// F1 aero regression: high speed must add a lot of grip/downforce without any
// discontinuity in the base mechanical calibration.
{
  const f1=createVehicleSystem({initialId:'f1_2010'}).physics;
  const a100=aerodynamicLoad({vehicle:f1,speedAbs:100/3.6});
  const a200=aerodynamicLoad({vehicle:f1,speedAbs:200/3.6});
  const a300=aerodynamicLoad({vehicle:f1,speedAbs:300/3.6});
  assert.ok(a100.downforceN>0&&a200.downforceN>a100.downforceN*3.8,'F1 downforce should scale ~v²');
  assert.ok(a300.gripScale>a200.gripScale&&a200.gripScale>1.5,'F1 aero grip progression invalid');
}

// Deterministic extreme-state sweep: every vehicle, road/offroad, throttle,
// braking, steering and speed combinations. This is intentionally broader than
// normal gameplay and catches NaNs/sign explosions before a visual road test.
let seed=0x21_21_26;
const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
let stressCount=0;
for(const id of IDS){
  const v=createVehicleSystem({initialId:id}).physics;
  for(let i=0;i<25000;i++){
    const speedKph=rand()*360;
    const speed=speedKph/3.6;
    const input=rand()*2-1;
    const throttle=rand()*2-1;
    const onPavement=rand()>.28;
    const surfaceGrip=.45+rand()*.65;
    const cmd=steeringCommand({vehicle:v,speedAbs:speed,input});
    const steerAngle=cmd.target*cmd.maxRoadWheelAngle;
    const env=lateralDynamicsEnvelope({
      vehicle:v,speed,steerAngle,steerInput:cmd.target,driveThrottle:Math.max(0,throttle),
      onPavement,surfaceGrip,awdOffroadGripBonus:v.drivetrain==='AWD'?1.18:1,
      rearSlipAmount:rand()*.8,airborne:false
    });
    assert.ok(Number.isFinite(env.yawRate)&&Number.isFinite(env.latLimit)&&env.latLimit>=0,`${id}: invalid lateral envelope`);
    const mu=onPavement
      ?Math.max(.25,(v.longitudinalAccelLimit||v.brake||9.8)/GRAVITY*surfaceGrip)
      :Math.max(.22,(v.offroadGrip||.6)*(v.drivetrain==='AWD'?1.18:1));
    const requested=throttle>=0?v.accel*throttle:-v.brake*(-throttle);
    const mode=throttle>=0?'drive':'brake';
    const long=longitudinalTractionLimit({vehicle:v,requestedAccel:requested,surfaceMu:mu,mode,airborne:false,speedAbs:speed});
    assert.ok(Number.isFinite(long.acceleration)&&Number.isFinite(long.limit)&&long.limit>=0,`${id}: invalid longitudinal force`);
    const tireLat=Math.min(Math.max(0,env.requestedLatAccel),Math.max(0,env.latLimit));
    const grip=estimateWheelGripUsage({
      requestedLatAccel:tireLat,
      signedLatAccel:Math.sign(env.signedLatAccel||steerAngle||1)*tireLat,
      latLimit:env.latLimit,
      longitudinalAccel:long.acceleration,
      propulsionAccel:throttle>=0?long.acceleration:0,
      serviceBrakeAccel:throttle<0?long.acceleration:0,
      surfaceMu:mu,throttle,handbrake:rand()<.03,airborne:false,vehicle:v,speedAbs:speed,
      dt:.01+rand()*.08,contacts:CONTACTS,previousUsage:[rand(),rand(),rand(),rand()]
    });
    for(const arr of [grip.raw,grip.smoothed,grip.slip,grip.lateralUsage,grip.longitudinalUsage]){
      assert.ok(arr.length>=4&&arr.every(Number.isFinite),`${id}: invalid tire solver output`);
    }
    assert.ok(Number.isFinite(grip.frictionYawAccel)&&Number.isFinite(grip.netLateralAccel),`${id}: invalid force coupling`);
    stressCount++;
  }
}

console.log('V21.21.26 BEHAVIOR CALIBRATION QA: PASS');
console.table(report.map(r=>({
  vehicle:r.id,
  '0-100 s':r.zero100.toFixed(2),
  '70-0 m':r.brake70.toFixed(1),
  'base g':r.latG.toFixed(2),
  'top km/h':r.topKph.toFixed(0)
})));
console.log(`Extreme-state stress cases: ${stressCount.toLocaleString('en-US')}`);
