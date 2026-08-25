import assert from 'node:assert/strict';
import {
  GRAVITY,
  steeringCommand,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage
} from '../src/vehicle-dynamics.js';
import {
  bodyRelativeSteeringSpeed,
  postSpinSteeringAuthority
} from '../src/driving-runtime.js';

const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true, side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true, side:'right',axleIndex:0,contact:true,contactFactor:1}
];

const CARS={
  civic:{
    drivetrain:'FWD',vehicleClass:'passenger',massKg:1345,cgHeight:.50,trackWidth:1.55,
    frontWeightBias:.61,brakeBiasFront:.64,driveBiasFront:1,yawInertiaScale:.98,
    longitudinalAccelLimit:8.67,wheelbase:2.70,maxSteerLow:.49,maxSteerHigh:.165,
    steeringResponseHigh:5.2,steeringCenterToFullTimeSec:.52,steeringReturnToCenterTimeSec:.38,
    roadGripMultiplier:1.06,lateralAccelLimit:8.53,accel:4.44,brake:9.54,absEnabled:true
  },
  sonata:{
    drivetrain:'FWD',vehicleClass:'passenger',massKg:1584,cgHeight:.54,trackWidth:1.60,
    frontWeightBias:.61,brakeBiasFront:.64,driveBiasFront:1,yawInertiaScale:1.04,
    longitudinalAccelLimit:8.82,wheelbase:2.80,maxSteerLow:.47,maxSteerHigh:.158,
    steeringResponseHigh:5.0,steeringCenterToFullTimeSec:.55,steeringReturnToCenterTimeSec:.40,
    roadGripMultiplier:1.05,lateralAccelLimit:8.04,accel:5.01,brake:9.70,absEnabled:true
  },
  countach:{
    drivetrain:'RWD',vehicleClass:'passenger',massKg:1490,cgHeight:.48,trackWidth:1.50,
    frontWeightBias:.44,brakeBiasFront:.57,driveBiasFront:0,yawInertiaScale:.90,
    longitudinalAccelLimit:9.50,wheelbase:2.45,maxSteerLow:.43,maxSteerHigh:.142,
    steeringInputExponent:1.65,steeringResponseHigh:5.8,steeringCenterToFullTimeSec:.44,
    steeringReturnToCenterTimeSec:.32,roadGripMultiplier:1.16,lateralAccelLimit:8.04,
    accel:6.77,brake:7.30,absEnabled:false,powerOversteerGripLoss:.18,powerOversteerYaw:.055
  },
  i3:{
    drivetrain:'RWD',vehicleClass:'passenger',massKg:1343,cgHeight:.54,trackWidth:1.57,
    frontWeightBias:.48,brakeBiasFront:.60,driveBiasFront:0,yawInertiaScale:.96,
    longitudinalAccelLimit:8.39,wheelbase:2.57,maxSteerLow:.53,maxSteerHigh:.17,
    steeringResponseHigh:5.3,steeringCenterToFullTimeSec:.50,steeringReturnToCenterTimeSec:.36,
    roadGripMultiplier:1.00,lateralAccelLimit:7.55,accel:5.28,brake:9.23,absEnabled:true,
    powerOversteerGripLoss:.08,powerOversteerYaw:.030
  },
  f1:{
    drivetrain:'RWD',vehicleClass:'racecar',massKg:740,cgHeight:.30,trackWidth:1.80,
    frontWeightBias:.46,brakeBiasFront:.56,driveBiasFront:0,yawInertiaScale:.82,
    longitudinalAccelLimit:20.5,wheelbase:3.15,maxSteerLow:.34,maxSteerHigh:.115,
    steeringInputExponent:1.72,steeringResponseLow:2.55,steeringResponseMid:3.20,
    steeringResponseHigh:4.80,steeringCenterToFullTimeSec:.42,steeringReturnToCenterTimeSec:.30,
    steeringGripEnvelopeFraction:.82,yawResponseMultiplier:.86,roadGripMultiplier:1,
    lateralAccelLimit:20.5,frontTireGripScale:1.20,rearTireGripScale:1.20,
    aeroDownforceClA:4.56,aeroDownforceFrontBias:.42,aeroGripEfficiency:.88,aeroGripScaleMax:3,
    accel:12.3,brake:20.5,absEnabled:false,powerOversteerGripLoss:.018,powerOversteerYaw:.010
  }
};

function gripCase(vehicle,{lat=3.0,long=-4.0,prop=0,brake=-4.0,throttle=0,speed=20}={}){
  const out={};
  estimateWheelGripUsage({
    requestedLatAccel:Math.abs(lat),signedLatAccel:lat,latLimit:vehicle.lateralAccelLimit,
    longitudinalAccel:long,propulsionAccel:prop,serviceBrakeAccel:brake,
    surfaceMu:vehicle.longitudinalAccelLimit/GRAVITY,throttle,handbrake:false,airborne:false,
    vehicle,speedAbs:speed,dt:1/60,contacts,previousUsage:[0,0,0,0]
  },out);
  return out;
}

for(const [name,vehicle] of Object.entries(CARS)){
  // Generic steering/lateral model must produce finite, bounded results for every profile.
  const steer=steeringCommand({vehicle,speedAbs:20,input:.72});
  const lat=lateralDynamicsEnvelope({
    vehicle,speed:20,steerAngle:steer.maxRoadWheelAngle*.72,steerInput:.72,
    driveThrottle:0,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,rearSlipAmount:0,airborne:false
  });
  assert(Number.isFinite(lat.yawRate),`${name}: yaw rate must be finite`);
  assert(Number.isFinite(lat.latLimit)&&lat.latLimit>0,`${name}: lateral limit must be positive`);
  assert(Math.abs(lat.signedLatAccel)<=lat.latLimit+1e-6,`${name}: steady lateral force must remain grip-limited`);

  // Moderate trail-braking must remain inside the friction circle.
  const braking=gripCase(vehicle,{lat:2.6,long:-3.8,brake:-3.8,speed:22});
  assert(Math.max(...braking.longitudinalUsage)<1.15,`${name}: moderate braking should remain bounded`);
  assert(Math.max(...braking.lateralUsage)<1.20,`${name}: moderate cornering should remain bounded`);

  // ABS policy must stay vehicle-specific while using the same generalized solver.
  if(vehicle.absEnabled===false)assert(braking.serviceBrakeAbsEnabled===false,`${name}: ABS must remain disabled`);
  else assert(braking.serviceBrakeAbsEnabled===true,`${name}: ABS/EBD must remain enabled`);

  // P6/P8/P9 reverse-axis logic is generic: a clean 180 is reverse-relative,
  // but it must not be mistaken for 180 degrees of tire sideslip.
  const reverseSpeed=bodyRelativeSteeringSpeed({speed:15,heading:Math.PI,velocityHeading:0,handbrake:false});
  const reverseAuthority=postSpinSteeringAuthority({rearSlipAmount:.8,heading:Math.PI,velocityHeading:0,handbrake:false});
  assert(reverseSpeed<0,`${name}: clean post-180 travel must steer as reverse`);
  assert(reverseAuthority>.98,`${name}: clean reverse-axis travel must retain steering authority`);
}

// Drivetrain-specific longitudinal usage should remain distinct.
for(const name of ['civic','sonata']){
  const v=CARS[name];
  const drive=gripCase(v,{lat:1.6,long:3.2,prop:3.2,brake:0,throttle:.8,speed:18});
  const front=(drive.longitudinalUsage[1]+drive.longitudinalUsage[3])*.5;
  const rear=(drive.longitudinalUsage[0]+drive.longitudinalUsage[2])*.5;
  assert(front>rear+.05,`${name}: FWD propulsion must load front tires more than rear`);
}
for(const name of ['countach','i3','f1']){
  const v=CARS[name];
  const drive=gripCase(v,{lat:1.6,long:Math.min(v.accel,5),prop:Math.min(v.accel,5),brake:0,throttle:.8,speed:18});
  const front=(drive.longitudinalUsage[1]+drive.longitudinalUsage[3])*.5;
  const rear=(drive.longitudinalUsage[0]+drive.longitudinalUsage[2])*.5;
  assert(rear>front+.05,`${name}: RWD propulsion must load rear tires more than front`);
}

// Character hierarchy: road sedans < old supercar steering response < F1 grip envelope.
const civicLat=lateralDynamicsEnvelope({vehicle:CARS.civic,speed:25,steerAngle:steeringCommand({vehicle:CARS.civic,speedAbs:25,input:.6}).maxRoadWheelAngle*.6,steerInput:.6,onPavement:true,surfaceGrip:1});
const f1Lat=lateralDynamicsEnvelope({vehicle:CARS.f1,speed:25,steerAngle:steeringCommand({vehicle:CARS.f1,speedAbs:25,input:.6}).maxRoadWheelAngle*.6,steerInput:.6,onPavement:true,surfaceGrip:1});
assert(f1Lat.latLimit>civicLat.latLimit*1.8,'F1 must retain a much larger lateral envelope than road cars');
assert(CARS.countach.wheelbase<CARS.sonata.wheelbase,'Countach geometry should remain shorter/more agile than Sonata');

console.table(Object.fromEntries(Object.entries(CARS).map(([name,v])=>{
  const steer=steeringCommand({vehicle:v,speedAbs:20,input:1});
  const lat=lateralDynamicsEnvelope({vehicle:v,speed:20,steerAngle:steer.maxRoadWheelAngle,steerInput:1,onPavement:true,surfaceGrip:1});
  return [name,{
    drivetrain:v.drivetrain,
    abs:v.absEnabled!==false,
    steer_deg:+(steer.maxRoadWheelAngle*180/Math.PI).toFixed(1),
    yaw_deg_s:+(Math.abs(lat.yawRate)*180/Math.PI).toFixed(1),
    lat_g:+(lat.latLimit/GRAVITY).toFixed(2)
  }];
})));
console.log('V21.28 ALL CARS PHYSICS QA: PASS');
