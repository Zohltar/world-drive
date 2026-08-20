import {
  vehicleLayout,
  dynamicAxleLoads,
  longitudinalTractionLimit,
  computeGradeAcceleration,
  steeringCommand,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage,
  fitWheelSupportPlane,
  yawResponseRate
} from '../src/vehicle-dynamics.js';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicle-system.js';

const finite=(v)=>Number.isFinite(v);
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
let seed=0x21_21_2026;
function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
function range(a,b){return a+(b-a)*rnd()}
function choose(a){return a[Math.floor(rnd()*a.length)]}

const profileValidation=validateVehicleProfiles();
assert(profileValidation.ok,profileValidation.errors.join('; '));
const vehicleSystem=createVehicleSystem({initialId:'wrx'});
const fleet=vehicleSystem.list().map(({id})=>{vehicleSystem.select(id);return structuredClone(vehicleSystem.physics)});

function randomVehicle(){
  if(rnd()<.55)return choose(fleet);
  const axleCount=2+Math.floor(rnd()*4);
  const wheelbase=range(2.2,8.5), trackWidth=range(1.4,2.6);
  const axles=[];
  const rawLoads=[],rawDrive=[],rawBrake=[];
  for(let i=0;i<axleCount;i++){
    rawLoads.push(range(.05,1));
    rawDrive.push(rnd()<.65?range(.05,1):0);
    rawBrake.push(range(.05,1));
  }
  if(rawDrive.every(v=>v===0))rawDrive[axleCount-1]=1;
  const sum=a=>a.reduce((x,y)=>x+y,0)||1;
  const ls=sum(rawLoads),ds=sum(rawDrive),bs=sum(rawBrake);
  for(let i=0;i<axleCount;i++){
    const t=axleCount===1?0:i/(axleCount-1);
    axles.push({
      id:`a${i}`,
      positionM:wheelbase*(.5-t),
      staticLoadFraction:rawLoads[i]/ls,
      steerFactor:i===0?1:(rnd()<.08?range(-.3,.3):0),
      driveShare:rawDrive[i]/ds,
      brakeShare:rawBrake[i]/bs,
      trackWidth:trackWidth*range(.95,1.05),
      wheelCount:rnd()<.25?4:2
    });
  }
  return {
    vehicleClass:'qa-random', drivetrain:choose(['FWD','RWD','AWD']),
    massKg:range(600,28000), wheelbase, trackWidth, cgHeight:range(.25,1.7),
    frontWeightBias:range(.35,.7), yawInertiaScale:range(.6,1.5),
    accel:range(2,18), brake:range(5,16), maxSteerLow:range(.25,.65),
    maxSteerHigh:range(.07,.24), steeringResponseHigh:range(2.5,7),
    roadGripMultiplier:range(.8,1.35), lateralAccelLimit:range(4,20),
    offroadGrip:range(.35,.85), powerOversteerGripLoss:range(0,.18), axles
  };
}

let states=0,maxWheels=0,maxAxles=0;
for(let iteration=0;iteration<50000;iteration++){
  const vehicle=randomVehicle();
  const layout=vehicleLayout(vehicle);
  maxAxles=Math.max(maxAxles,layout.axles.length);
  assert(layout.axles.length>=2,'axle count');
  assert(finite(layout.yawInertiaKgM2)&&layout.yawInertiaKgM2>0,'yaw inertia');
  const share=(key)=>layout.axles.reduce((s,a)=>s+a[key],0);
  assert(Math.abs(share('staticLoadFraction')-1)<1e-9,'static share sum');
  assert(Math.abs(share('driveShare')-1)<1e-9,'drive share sum');
  assert(Math.abs(share('brakeShare')-1)<1e-9,'brake share sum');

  const ax=range(-18,18);
  const loads=dynamicAxleLoads(vehicle,ax);
  assert(loads.length===layout.axles.length,'load length');
  assert(loads.every(finite)&&loads.every(v=>v>=0),'load finite');
  assert(Math.abs(loads.reduce((a,b)=>a+b,0)-1)<1e-8,'load sum');

  for(const mode of ['drive','brake','handbrake']){
    const request=range(-22,22);
    const force=longitudinalTractionLimit({vehicle,requestedAccel:request,surfaceMu:range(.15,1.5),mode,airborne:false});
    assert(finite(force.acceleration)&&finite(force.limit),'traction finite');
    assert(Math.abs(force.acceleration)<=Math.abs(request)+1e-9,'traction exceeds request');
    assert(force.axleLoads.every(finite),'traction loads finite');
  }
  const airForce=longitudinalTractionLimit({vehicle,requestedAccel:15,surfaceMu:1,mode:'drive',airborne:true});
  assert(airForce.acceleration===0,'air tire force');

  const heading=range(-Math.PI*4,Math.PI*4);
  const roadAngle=range(-Math.PI*4,Math.PI*4);
  const grade=computeGradeAcceleration({onPavement:true,heading,roadFrame:{pitch:range(-.8,.8),angle:roadAngle},airborne:false});
  assert(finite(grade.acceleration)&&finite(grade.grade)&&Math.abs(grade.grade)<=.550000001,'grade bounds');

  const speed=range(-120,120), input=range(-1.3,1.3);
  const steer=steeringCommand({vehicle,speedAbs:Math.abs(speed),input});
  assert(Object.values(steer).every(finite),'steer finite');
  assert(Math.abs(steer.target)<=1.000000001,'steer target bounds');

  const lateral=lateralDynamicsEnvelope({
    vehicle,speed,steerAngle:steer.target*steer.maxRoadWheelAngle,steerInput:input,
    driveThrottle:range(-1,1),onPavement:rnd()>.35,surfaceGrip:range(.35,1.2),
    awdOffroadGripBonus:range(.7,1.3),rearSlipAmount:range(0,1),airborne:rnd()<.03
  });
  for(const key of ['yawRate','requestedLatAccel','signedLatAccel','latLimit','effectiveGrip'])assert(finite(lateral[key]),`lateral ${key}`);
  assert(lateral.latLimit>0,'lat limit');

  const wheelCount=layout.axles.reduce((s,a)=>s+a.wheelCount,0);
  maxWheels=Math.max(maxWheels,wheelCount);
  const contacts=[];
  for(let a=0;a<layout.axles.length;a++){
    const axle=layout.axles[a];
    for(let w=0;w<axle.wheelCount;w++){
      contacts.push({
        axleIndex:a,front:axle.positionM>=0,side:w%2===0?'left':'right',
        contact:rnd()>.05,contactFactor:range(.15,1),
        localX:(w%2===0?-1:1)*axle.trackWidth*.5,localZ:axle.positionM
      });
    }
  }
  const grip=estimateWheelGripUsage({
    requestedLatAccel:lateral.requestedLatAccel,signedLatAccel:lateral.signedLatAccel,
    latLimit:lateral.latLimit,longitudinalAccel:ax,propulsionAccel:range(0,12),serviceBrakeAccel:range(0,12),
    throttle:range(-1,1),handbrake:rnd()<.1,airborne:false,vehicle,dt:range(1/240,1/20),contacts,
    previousUsage:Array(contacts.length).fill(0).map(()=>range(0,1))
  });
  assert(grip.raw.length===Math.max(4,contacts.length),'grip wheel count');
  assert(grip.raw.every(finite)&&grip.smoothed.every(finite)&&grip.slip.every(v=>finite(v)&&v>=0&&v<=1),'grip finite/bounds');
  assert(grip.axleLoads.every(finite),'grip loads');

  const planeSamples=contacts.slice(0,Math.max(3,contacts.length)).map(c=>({
    localX:c.localX,localZ:c.localZ,ground:range(-500,500)+c.localX*range(-.3,.3)+c.localZ*range(-.3,.3)
  }));
  const plane=fitWheelSupportPlane(planeSamples);
  for(const key of ['slopeX','slopeZ','meanY','pitch','roll'])assert(finite(plane[key]),`plane ${key}`);
  const yawRate=yawResponseRate({vehicle,speedAbs:Math.abs(speed),airborne:false});
  assert(finite(yawRate)&&yawRate>0,'yaw response');
  states++;
}

console.log(`PASS randomized dynamics fuzz: ${states} states, up to ${maxAxles} axles / ${maxWheels} wheels`);
console.log(`PASS deterministic seed: 0x21212026`);
