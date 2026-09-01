import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {
  estimateWheelGripUsage,
  longitudinalTractionLimit,
  limitMomentumHeadingDelta
} from '../src/vehicle-dynamics.js';

const DEG=180/Math.PI;
const V=createVehicleSystem({initialId:'wrx'}).physics;
const mu=V.longitudinalAccelLimit/9.80665;
const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];
const fail=(m)=>{throw new Error(m)};
const angleDelta=(t,c)=>Math.atan2(Math.sin(t-c),Math.cos(t-c));

function gripAt({speedKmh=120,brakeInput=0,latDemand=V.lateralAccelLimit}){
  const speedAbs=speedKmh/3.6;
  const brakeAccel=brakeInput
    ?longitudinalTractionLimit({
        vehicle:V,
        requestedAccel:-V.brake*brakeInput,
        surfaceMu:mu,
        mode:'brake',
        airborne:false
      },{}).acceleration
    :0;
  return estimateWheelGripUsage({
    requestedLatAccel:latDemand,
    signedLatAccel:latDemand,
    latLimit:V.lateralAccelLimit,
    longitudinalAccel:brakeAccel,
    propulsionAccel:0,
    serviceBrakeAccel:brakeAccel,
    surfaceMu:mu,
    throttle:-brakeInput,
    handbrake:false,
    airborne:false,
    vehicle:V,
    speedAbs,
    contacts,
    previousUsage:[0,0,0,0],
    dt:.05
  },{});
}

const coast=gripAt({brakeInput:0});
const half=gripAt({brakeInput:.5});
const full=gripAt({brakeInput:1});

if(!(coast.trajectoryLateralCapacityAccel>half.trajectoryLateralCapacityAccel))
  fail('half braking must reduce lateral trajectory authority');
if(!(half.trajectoryLateralCapacityAccel>full.trajectoryLateralCapacityAccel))
  fail('full braking must reduce lateral trajectory authority further');
if(!full.serviceBrakeAbsEnabled)fail('WRX must use ABS/EBD service-brake distribution');
const fullLong=full.longitudinalUsage;
if(Math.max(...fullLong)-Math.min(...fullLong)>.015)
  fail(`ABS/EBD wheel utilization imbalance too high: ${fullLong.join(',')}`);
if(Math.max(...fullLong)>1.02)
  fail(`WRX service brake should not lock a wheel under ABS: ${fullLong.join(',')}`);

// Sideways landing / large momentum mismatch: the old heuristic could almost
// snap the velocity vector to the chassis. The new correction must be bounded
// by a_lat/v, and braking must never make that correction larger.
const speedAbs=120/3.6;
const dt=1/60;
const attempted=35/DEG; // absurdly large one-frame requested alignment
const coastStep=Math.abs(limitMomentumHeadingDelta({
  attemptedDelta:attempted,
  speedAbs,
  lateralCapacityAccel:coast.trajectoryLateralCapacityAccel,
  dt,
  airborne:false
}));
const fullStep=Math.abs(limitMomentumHeadingDelta({
  attemptedDelta:attempted,
  speedAbs,
  lateralCapacityAccel:full.trajectoryLateralCapacityAccel,
  dt,
  airborne:false
}));
const airborneStep=Math.abs(limitMomentumHeadingDelta({
  attemptedDelta:attempted,
  speedAbs,
  lateralCapacityAccel:coast.trajectoryLateralCapacityAccel,
  dt,
  airborne:true
}));
if(!(fullStep<coastStep))fail('braking increased momentum-direction correction');
if(airborneStep!==0)fail('airborne tires changed horizontal momentum direction');

function landingMismatch(brakeInput){
  let speed=120/3.6;
  const heading=35/DEG;
  let velocityHeading=0;
  let previous=[0,0,0,0];
  const stepDt=1/120;
  for(let i=0;i<.75/stepDt;i++){
    const brakeAccel=brakeInput
      ?longitudinalTractionLimit({vehicle:V,requestedAccel:-V.brake*brakeInput,surfaceMu:mu,mode:'brake',airborne:false},{}).acceleration
      :0;
    const grip=estimateWheelGripUsage({
      requestedLatAccel:0,
      signedLatAccel:0,
      latLimit:V.lateralAccelLimit,
      longitudinalAccel:brakeAccel,
      propulsionAccel:0,
      serviceBrakeAccel:brakeAccel,
      surfaceMu:mu,
      throttle:-brakeInput,
      handbrake:false,
      airborne:false,
      vehicle:V,
      speedAbs:speed,
      contacts,
      previousUsage:previous,
      dt:.05
    },{});
    previous=grip.smoothed;
    const error=angleDelta(heading,velocityHeading);
    const attemptedDelta=error*(1-Math.exp(-stepDt*30));
    velocityHeading+=limitMomentumHeadingDelta({
      attemptedDelta,
      speedAbs:speed,
      lateralCapacityAccel:grip.trajectoryLateralCapacityAccel,
      dt:stepDt,
      airborne:false
    });
    speed=Math.max(1,speed+brakeAccel*stepDt);
  }
  return {
    speedKmh:speed*3.6,
    sideslipDeg:Math.abs(angleDelta(heading,velocityHeading))*DEG,
    trajectoryDeg:velocityHeading*DEG
  };
}
const landingCoast=landingMismatch(0);
const landingFull=landingMismatch(1);
if(landingCoast.sideslipDeg<18)
  fail(`coasting sideways landing realigned too quickly: ${landingCoast.sideslipDeg.toFixed(2)} deg`);
if(landingFull.sideslipDeg<=landingCoast.sideslipDeg)
  fail('full braking should preserve MORE sideways momentum than coasting, not add lateral grip');

console.log('V21.21.17 BRAKING + MOMENTUM QA: PASS');
console.log(`WRX lateral capacity: coast ${coast.trajectoryLateralCapacityAccel.toFixed(2)} m/s², half brake ${half.trajectoryLateralCapacityAccel.toFixed(2)}, full brake ${full.trajectoryLateralCapacityAccel.toFixed(2)}`);
for(const kmh of [80,100,120,150]){
  const v=kmh/3.6;
  const coastRate=coast.trajectoryLateralCapacityAccel/v*DEG;
  const fullRate=full.trajectoryLateralCapacityAccel/v*DEG;
  if(!(fullRate<coastRate))fail(`${kmh} km/h braking added lateral trajectory authority`);
  console.log(`${kmh} km/h max momentum-turn rate: coast ${coastRate.toFixed(2)}°/s, full brake ${fullRate.toFixed(2)}°/s`);
}
console.log(`WRX full-brake tire utilization: ${fullLong.map(v=>(v*100).toFixed(1)+'%').join(' / ')}`);
console.log(`120 km/h, one-frame 35° correction request: coast ${(coastStep*DEG).toFixed(3)}°, full brake ${(fullStep*DEG).toFixed(3)}°, airborne ${(airborneStep*DEG).toFixed(3)}°`);
console.log(`35° sideways landing after 0.75 s: coast ${landingCoast.sideslipDeg.toFixed(2)}° remaining, full brake ${landingFull.sideslipDeg.toFixed(2)}° remaining (${landingFull.speedKmh.toFixed(1)} km/h)`);
