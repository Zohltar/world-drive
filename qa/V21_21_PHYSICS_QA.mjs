import assert from 'node:assert/strict';
import { createVehicleSystem, validateVehicleProfiles } from '../src/vehicles/vehicle-system.js';
import {
  GRAVITY,
  clampDynamics,
  vehicleLayout,
  dynamicAxleLoads,
  longitudinalTractionLimit,
  computeGradeAcceleration,
  steeringCommand,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage,
  fitWheelSupportPlane,
  yawResponseRate,
  dynamicsDiagnostics
} from '../src/physics/vehicle-dynamics.js';

const EPS=1e-9;
const approx=(a,b,t=1e-8)=>Math.abs(a-b)<=t;
const finite=(v,label)=>assert.ok(Number.isFinite(v),`${label} must be finite; got ${v}`);

function oldSteering(vehicle,speedAbs,input){
  const speedBlend=Math.min(1,speedAbs/32);
  const maxRoadWheelAngle=vehicle.maxSteerLow+(vehicle.maxSteerHigh-vehicle.maxSteerLow)*(speedBlend*speedBlend);
  let target=Math.max(-1,Math.min(1,input));
  if(Math.abs(target)<.08){
    target=0;
  }else{
    const vehicleExponent=vehicle.steeringInputExponent??1;
    const highSpeedT=Math.max(0,Math.min(1,(speedAbs-8.3)/26.4));
    const smooth=highSpeedT*highSpeedT*(3-2*highSpeedT);
    const exponent=vehicleExponent+1.15*smooth;
    target=Math.sign(target)*Math.pow(Math.abs(target),exponent);
  }
  const highSpeedResponse=vehicle.steeringResponseHigh??3.8;
  return {
    target,
    maxRoadWheelAngle,
    inputRate:speedAbs<5?3.7:(speedAbs>25?highSpeedResponse:4.5),
    returnRate:speedAbs<5?6.5:7.5
  };
}

function oldLateral({vehicle,speed,steerAngle,steerInput,driveThrottle,onPavement,surfaceGrip,awdOffroadGripBonus,rearSlipAmount,airborne}){
  const speedAbs=Math.abs(speed);
  const positiveThrottle=speed>=0?Math.max(0,Math.min(1,driveThrottle)):0;
  const powerHandlingSpeedGate=Math.max(0,Math.min(1,(speedAbs-3)/12));
  const steeringDemand=Math.max(0,Math.min(1,Math.abs(steerInput)));
  const powerCorneringLoad=positiveThrottle*powerHandlingSpeedGate*steeringDemand;
  const offroadGripBlend=Math.min(1,Math.max(0,(speedAbs-8)/18));
  const roadGripMultiplier=vehicle.roadGripMultiplier??1;
  const effectiveOffroadGrip=Math.min(.96,(vehicle.offroadGrip??.60)*awdOffroadGripBonus);
  const effectiveGrip=onPavement?surfaceGrip*roadGripMultiplier:1+(effectiveOffroadGrip-1)*offroadGripBlend;
  let yawRate=(speed/vehicle.wheelbase)*Math.tan(steerAngle)*effectiveGrip;
  if(airborne)yawRate*=.06;
  const drivetrain=vehicle.drivetrain||'AWD';
  if(drivetrain==='FWD')yawRate*=1-.20*powerCorneringLoad;
  const powerOversteerGripLoss=drivetrain==='RWD'?(vehicle.powerOversteerGripLoss??.07):0;
  const requestedLatAccel=Math.abs(speed*yawRate);
  const offroadLatLimit=(speedAbs<10?7.0:3.8)*awdOffroadGripBonus;
  const roadLatLimit=vehicle.lateralAccelLimit??7.0;
  const baseLatLimit=onPavement?roadLatLimit:offroadLatLimit;
  const rwdPowerGripFactor=drivetrain==='RWD'?Math.max(.72,1-powerOversteerGripLoss*powerCorneringLoad):1;
  const slideGripFactor=airborne?.08:Math.max(.78,1-rearSlipAmount*.16);
  const latLimit=baseLatLimit*rwdPowerGripFactor*slideGripFactor;
  return {yawRate,requestedLatAccel,signedLatAccel:speed*yawRate,latLimit,drivetrain,powerCorneringLoad,effectiveGrip};
}

const profileValidation=validateVehicleProfiles();
assert.equal(profileValidation.ok,true,profileValidation.errors.join('\n'));

const registry=createVehicleSystem({initialId:'wrx'});
const ids=registry.list().map(v=>v.id);
assert.equal(ids.length,7,'expected current seven-vehicle fleet');

const profiles={};
for(const id of ids){
  if(registry.activeId!==id)registry.select(id);
  profiles[id]=structuredClone(registry.active.physics);
  const v=profiles[id];
  const layout=vehicleLayout(v);
  assert.equal(layout.axles.length,2,`${id}: current fleet must remain 2-axle`);
  assert.ok(v.coupling?.supportsArticulation,`${id}: coupling metadata missing`);
  assert.ok(v.massKg>500,`${id}: mass missing`);
  assert.ok(v.cgHeight>.15,`${id}: CG height missing`);
  assert.ok(v.trackWidth>1,`${id}: track width missing`);
  assert.ok(v.yawInertiaKgM2>0,`${id}: yaw inertia missing`);
  assert.ok(approx(layout.axles.reduce((s,a)=>s+a.staticLoadFraction,0),1,1e-10));
  assert.ok(approx(layout.axles.reduce((s,a)=>s+a.driveShare,0),1,1e-10));
  assert.ok(approx(layout.axles.reduce((s,a)=>s+a.brakeShare,0),1,1e-10));
}

// Refactor regression: road-car steering target shaping and the pre-slip lateral
// envelope remain numerically identical to V21.20.1 outside deliberate changes.
// The F1 now has its own current steering / physical-drift ownership coverage;
// this historical equivalence block therefore only checks finite/bounded F1
// outputs rather than enforcing abandoned V21.21 rack/envelope semantics.
for(const [id,v] of Object.entries(profiles)){
  for(const speed of [0,3,9,18,25,32,55,90]){
    for(const input of [-1,-.55,-.15,.15,.55,1]){
      const a=steeringCommand({vehicle:v,speedAbs:speed,input});
      const b=oldSteering(v,speed,input);
      if(id==='f1_2010'){
        finite(a.target,`${id}: steering target`);
        finite(a.maxRoadWheelAngle,`${id}: steering angle`);
        assert.ok(a.maxRoadWheelAngle>0&&a.maxRoadWheelAngle<=b.maxRoadWheelAngle*1.27+1e-12,`${id}: progressive steering bounds`);
        assert.ok(a.inputRate>0&&a.returnRate>0,`${id}: steering response must stay positive`);
      }else{
        assert.ok(approx(a.target,b.target,1e-12),`${id}: steering target regression`);
        if(speed<8){
          assert.ok(a.maxRoadWheelAngle>=b.maxRoadWheelAngle-1e-12,`${id}: parking steer authority decreased`);
          assert.ok(a.maxRoadWheelAngle<=b.maxRoadWheelAngle*1.27+1e-12,`${id}: parking steer boost excessive`);
          assert.ok(a.inputRate>=b.inputRate-1e-12,`${id}: parking steer response decreased`);
        }else if(speed<=25){
          assert.ok(approx(a.maxRoadWheelAngle,b.maxRoadWheelAngle,1e-12),`${id}: medium-speed steer lock regression`);
          assert.ok(approx(a.inputRate,b.inputRate,1e-12),`${id}: medium-speed steer response regression`);
        }else{
          assert.ok(a.maxRoadWheelAngle<=b.maxRoadWheelAngle+1e-12,`${id}: high-speed steer authority increased`);
          assert.ok(a.inputRate<=b.inputRate+1e-12,`${id}: high-speed steer response increased`);
        }
      }
    }
  }
  for(const speed of [-25,0,5,15,35,70]){
    for(const steerAngle of [-.18,-.05,.05,.18]){
      for(const onPavement of [true,false]){
        const args={vehicle:v,speed,steerAngle,steerInput:.42,driveThrottle:.7,onPavement,surfaceGrip:.92,awdOffroadGripBonus:v.drivetrain==='AWD'&&!onPavement?1.18:1,rearSlipAmount:.22,airborne:false};
        const a=lateralDynamicsEnvelope(args);
        const b=oldLateral(args);
        for(const key of ['yawRate','requestedLatAccel','signedLatAccel','latLimit','powerCorneringLoad','effectiveGrip']){
          if(id==='f1_2010'){
            finite(a[key],`${id}: lateral ${key}`);
            if(key==='latLimit'&&Math.abs(speed)>1e-9)assert.ok(a[key]>=b[key]-1e-12,`${id}: aero lateral limit decreased`);
          }else{
            assert.ok(approx(a[key],b[key],1e-12),`${id}: lateral ${key} regression`);
          }
        }
      }
    }
  }
}

// Grade gravity: 10% uphill/downhill and reverse-route projection.
for(const grade of [.10,-.10,.22,-.22]){
  const roadFrame={pitch:Math.atan(grade),angle:0};
  const r=computeGradeAcceleration({onPavement:true,roadFrame,heading:0});
  assert.ok(Math.sign(r.acceleration)===-Math.sign(grade),`grade sign ${grade}`);
  finite(r.acceleration,'grade acceleration');
  const reverse=computeGradeAcceleration({onPavement:true,roadFrame,heading:Math.PI});
  assert.ok(Math.sign(reverse.acceleration)===Math.sign(grade),`reverse grade sign ${grade}`);
}
const tenPct=computeGradeAcceleration({onPavement:true,roadFrame:{pitch:Math.atan(.10),angle:0},heading:0});
assert.ok(Math.abs(tenPct.acceleration+GRAVITY*Math.sin(Math.atan(.10)))<1e-10,'10% grade magnitude');

// Terrain grade sampler path.
const terrainGrade=computeGradeAcceleration({onPavement:false,heading:0,x:0,z:0,terrainHeightAt:(x,z)=>z*.12});
assert.ok(terrainGrade.acceleration<0&&terrainGrade.source==='terrain');

// Traction/load-transfer invariants with identical synthetic chassis.
const baseSynthetic={wheelbase:2.8,trackWidth:1.6,massKg:1600,cgHeight:.55,frontWeightBias:.58,brakeBiasFront:.62,accel:9,brake:11,offroadGrip:.6};
function synth(drivetrain,driveBiasFront){
  return {...baseSynthetic,drivetrain,driveBiasFront,axles:[
    {id:'front',positionM:(1-.58)*2.8,staticLoadFraction:.58,steerFactor:1,driveShare:driveBiasFront,brakeShare:.62,trackWidth:1.6,wheelCount:2},
    {id:'rear',positionM:-.58*2.8,staticLoadFraction:.42,steerFactor:0,driveShare:1-driveBiasFront,brakeShare:.38,trackWidth:1.6,wheelCount:2}
  ]};
}
const fwd=longitudinalTractionLimit({vehicle:synth('FWD',1),requestedAccel:12,surfaceMu:1,mode:'drive'});
const rwd=longitudinalTractionLimit({vehicle:synth('RWD',0),requestedAccel:12,surfaceMu:1,mode:'drive'});
const awd=longitudinalTractionLimit({vehicle:synth('AWD',.5),requestedAccel:12,surfaceMu:1,mode:'drive'});
assert.ok(awd.limit>fwd.limit,'AWD should out-traction FWD with same chassis');
assert.ok(rwd.limit>fwd.limit,'RWD benefits from rearward launch transfer vs FWD');
assert.equal(longitudinalTractionLimit({vehicle:synth('AWD',.5),requestedAccel:8,surfaceMu:1,mode:'drive',airborne:true}).acceleration,0,'airborne propulsion must be zero');
const serviceBrake=longitudinalTractionLimit({vehicle:synth('AWD',.5),requestedAccel:-8.5,surfaceMu:1,mode:'brake'});
assert.ok(approx(serviceBrake.acceleration,-8.5,1e-12),'service braking below tire limit must be preserved');
const handBrake=longitudinalTractionLimit({vehicle:synth('AWD',.5),requestedAccel:-8.5,surfaceMu:1,mode:'handbrake'});
assert.ok(Math.abs(handBrake.acceleration)<Math.abs(serviceBrake.acceleration),'rear-only handbrake should have less total decel capacity');

const loadsAccel=dynamicAxleLoads(synth('RWD',0),5);
const loadsBrake=dynamicAxleLoads(synth('RWD',0),-5);
assert.ok(loadsAccel[0]<.58&&loadsAccel[1]>.42,'acceleration must transfer load rearward');
assert.ok(loadsBrake[0]>.58&&loadsBrake[1]<.42,'braking must transfer load forward');

// Wheel model: normal, combined braking/cornering, handbrake and airborne.
const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];
for(const [id,v] of Object.entries(profiles)){
  let prev=[0,0,0,0];
  for(let n=0;n<180;n++){
    const g=estimateWheelGripUsage({requestedLatAccel:(v.lateralAccelLimit??7)*1.08,signedLatAccel:(v.lateralAccelLimit??7)*.85,latLimit:v.lateralAccelLimit??7,longitudinalAccel:n<90?2.5:-5,throttle:n<90?.75:0,handbrake:n>150,airborne:false,vehicle:v,dt:1/60,contacts,previousUsage:prev});
    prev=g.smoothed;
    for(const value of [...g.raw,...g.smoothed,...g.slip,...g.lateralUsage,...g.longitudinalUsage])finite(value,`${id} wheel model`);
    assert.ok(g.slip.every(x=>x>=-EPS&&x<=1+EPS),`${id}: slip range`);
  }
  const air=estimateWheelGripUsage({requestedLatAccel:99,signedLatAccel:99,latLimit:1,longitudinalAccel:10,throttle:1,handbrake:true,airborne:true,vehicle:v,dt:1/60,contacts,previousUsage:prev});
  assert.ok(air.raw.every(x=>x===0),`${id}: airborne wheel demand must be zero`);
}

// Multi-wheel support plane regression: exact planar samples must recover the
// same pitch/roll regardless of whether the chassis has four or six wheels.
function planarGround(x,z){return 120+.07*x-.11*z;}
for(const points of [
  [[-0.78,-1.2],[-0.78,1.2],[0.78,-1.2],[0.78,1.2]],
  [[-1,-2.2],[1,-2.2],[-1,0],[1,0],[-1,2.2],[1,2.2]]
]){
  const plane=fitWheelSupportPlane(points.map(([localX,localZ])=>({localX,localZ,ground:planarGround(localX,localZ)})));
  assert.ok(approx(plane.slopeX,.07,1e-10),'support plane lateral slope');
  assert.ok(approx(plane.slopeZ,-.11,1e-10),'support plane longitudinal slope');
  assert.ok(approx(plane.roll,Math.atan(-.07),1e-10),'support plane roll');
  assert.ok(approx(plane.pitch,Math.atan(.11),1e-10),'support plane pitch');
}

// For the existing symmetric four-wheel layout, least-squares support must
// exactly reproduce the previous front/rear + left/right averaging behavior.
for(const heights of [
  [100,100,100,100],
  [100.2,100.8,99.9,100.6],
  [99.7,100.1,100.4,100.9]
]){
  const positions=[[-.86,-1.22],[-.86,1.22],[.86,-1.22],[.86,1.22]];
  const samples=positions.map(([localX,localZ],i)=>({localX,localZ,ground:heights[i]}));
  const plane=fitWheelSupportPlane(samples);
  const rearAvg=(heights[0]+heights[2])*.5;
  const frontAvg=(heights[1]+heights[3])*.5;
  const leftAvg=(heights[0]+heights[1])*.5;
  const rightAvg=(heights[2]+heights[3])*.5;
  const oldPitch=Math.atan2(rearAvg-frontAvg,2.44);
  const oldRoll=Math.atan2(leftAvg-rightAvg,1.72);
  assert.ok(approx(plane.pitch,oldPitch,1e-12),'4-wheel support pitch regression');
  assert.ok(approx(plane.roll,oldRoll,1e-12),'4-wheel support roll regression');
}

// Future 3-axle truck compatibility: dynamics math accepts six contacts today,
// even though visual/trailer support is intentionally deferred to later versions.
const futureTruck={
  vehicleClass:'truck',drivetrain:'RWD',massKg:11500,cgHeight:1.05,wheelbase:5.2,trackWidth:2.02,
  frontWeightBias:.34,brakeBiasFront:.32,driveBiasFront:0,yawInertiaScale:1.25,accel:2.4,brake:7.2,
  maxSteerLow:.48,maxSteerHigh:.11,steeringResponseHigh:2.5,roadGripMultiplier:.92,lateralAccelLimit:5.0,
  offroadGrip:.42,
  axles:[
    {id:'steer',positionM:2.25,staticLoadFraction:.34,steerFactor:1,driveShare:0,brakeShare:.32,trackWidth:2.02,wheelCount:2},
    {id:'drive-a',positionM:-2.1,staticLoadFraction:.33,steerFactor:0,driveShare:.5,brakeShare:.34,trackWidth:1.86,wheelCount:2},
    {id:'drive-b',positionM:-3.3,staticLoadFraction:.33,steerFactor:0,driveShare:.5,brakeShare:.34,trackWidth:1.86,wheelCount:2}
  ]
};
const truckLayout=vehicleLayout(futureTruck);
assert.equal(truckLayout.axles.length,3);
const truckContacts=truckLayout.axles.flatMap((axle,axleIndex)=>['left','right'].map(side=>({axleIndex,side,front:axleIndex===0,contact:true,contactFactor:1})));
const truckGrip=estimateWheelGripUsage({requestedLatAccel:4.5,signedLatAccel:3.8,latLimit:5,longitudinalAccel:1.8,throttle:.8,handbrake:false,airborne:false,vehicle:futureTruck,dt:1/60,contacts:truckContacts,previousUsage:Array(6).fill(0)});
assert.equal(truckGrip.raw.length,6,'3-axle wheel model must return six wheel states');
assert.ok(yawResponseRate({vehicle:futureTruck,speedAbs:25})<yawResponseRate({vehicle:profiles.wrx,speedAbs:25}),'truck yaw buildup should be slower than WRX');

// Future unpowered trailer bodies must never manufacture propulsion simply
// because they have tire grip. Missing axle positions should also be spread
// predictably across the configured wheelbase for future multi-axle profiles.
const futureTrailer={
  vehicleClass:'trailer',drivetrain:'NONE',massKg:9000,cgHeight:1.15,wheelbase:4.2,trackWidth:2.0,
  axles:[
    {id:'trailer-a',staticLoadFraction:.5,driveShare:0,brakeShare:.5,wheelCount:4},
    {id:'trailer-b',staticLoadFraction:.5,driveShare:0,brakeShare:.5,wheelCount:4}
  ]
};
const trailerLayout=vehicleLayout(futureTrailer);
assert.ok(trailerLayout.axles[0].positionM>trailerLayout.axles[1].positionM,'trailer fallback axle ordering');
assert.equal(longitudinalTractionLimit({vehicle:futureTrailer,requestedAccel:5,surfaceMu:1,mode:'drive'}).acceleration,0,'unpowered trailer must have zero drive force');

// Offline preset-style route stress. This is deterministic and tests the same
// grade/curvature envelopes represented by the built-in presets without relying
// on live OSRM/Overpass availability during QA.
const PRESETS={
  'Route 389':{seconds:95,grade:t=>.055*Math.sin(t*.13)+.018*Math.sin(t*.047),steer:t=>.22*Math.sin(t*.17)+.08*Math.sin(t*.49)},
  'Route 169':{seconds:90,grade:t=>.035*Math.sin(t*.11),steer:t=>.18*Math.sin(t*.20)+.05*Math.sin(t*.61)},
  'Route 132':{seconds:90,grade:t=>.018*Math.sin(t*.09),steer:t=>.15*Math.sin(t*.16)+.04*Math.sin(t*.43)},
  'Yungas':{seconds:100,grade:t=>.14*Math.sin(t*.10)+.055*Math.sin(t*.31),steer:t=>clampDynamics(.78*Math.sin(t*.23)+.22*Math.sin(t*.67),-.96,.96)}
};

function simulatePreset(vehicle,preset,dt=1/120){
  let speed=0,steer=0,yaw=0,heading=0,maxLat=0,maxSpeed=0,minSpeed=Infinity;
  const steps=Math.round(preset.seconds/dt);
  for(let i=0;i<steps;i++){
    const t=i*dt;
    const input=preset.steer(t);
    const sc=steeringCommand({vehicle,speedAbs:Math.abs(speed),input});
    const rate=sc.target===0?sc.returnRate:sc.inputRate;
    steer+=(sc.target-steer)*(1-Math.exp(-dt*rate));
    const steerAngle=steer*sc.maxRoadWheelAngle;
    const grade=preset.grade(t);
    const gradeForce=computeGradeAcceleration({onPavement:true,roadFrame:{pitch:Math.atan(grade),angle:heading},heading});
    const speedRatio=Math.min(1,Math.max(0,speed/Math.max(25,((vehicle.topSpeedKmh||220)/3.6))));
    const requested=(vehicle.accel||6)*.62*(1-.38*speedRatio);
    const mu=(vehicle.longitudinalAccelLimit||vehicle.brake||9.8)/GRAVITY;
    const tr=longitudinalTractionLimit({vehicle,requestedAccel:requested,surfaceMu:mu,mode:'drive',speedAbs:Math.abs(speed)});
    let ax=tr.acceleration+gradeForce.acceleration;
    if(speed>.05)ax-=(vehicle.rolling||.3)+(vehicle.aero||.001)*speed*speed;
    speed=Math.max(0,speed+ax*dt);
    const lat=lateralDynamicsEnvelope({vehicle,speed,steerAngle,steerInput:steer,driveThrottle:.62,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,rearSlipAmount:0,airborne:false});
    let targetYaw=lat.yawRate;
    if(lat.requestedLatAccel>lat.latLimit&&lat.requestedLatAccel>0)targetYaw*=lat.latLimit/lat.requestedLatAccel;
    const yr=yawResponseRate({vehicle,speedAbs:speed,airborne:false});
    yaw+=(targetYaw-yaw)*(1-Math.exp(-dt*yr));
    heading+=yaw*dt;
    finite(speed,'preset speed'); finite(yaw,'preset yaw'); finite(heading,'preset heading');
    maxLat=Math.max(maxLat,Math.abs(speed*yaw));
    maxSpeed=Math.max(maxSpeed,speed);
    minSpeed=Math.min(minSpeed,speed);
    assert.ok(Math.abs(speed*yaw)<lat.latLimit*1.18+1e-6,`preset lateral runaway ${Math.abs(speed*yaw)}`);
    assert.ok(speed<120,'preset speed runaway');
  }
  return {maxSpeedKmh:maxSpeed*3.6,minSpeedKmh:minSpeed*3.6,maxLat};
}

const presetResults=[];
for(const [name,preset] of Object.entries(PRESETS)){
  for(const id of ['id4','wrx','countach_80','f1_2010']){
    const result=simulatePreset(profiles[id],preset);
    presetResults.push({preset:name,vehicle:id,...result});
  }
}
const wrx132=presetResults.find(r=>r.preset==='Route 132'&&r.vehicle==='wrx');
const wrxYungas=presetResults.find(r=>r.preset==='Yungas'&&r.vehicle==='wrx');
assert.ok(wrxYungas.maxLat>wrx132.maxLat,'Yungas stress must exercise more lateral load than Route 132');

// Whole-route frame-rate stability on the harshest preset-style profile.
const yungas30=simulatePreset(profiles.wrx,PRESETS.Yungas,1/30);
const yungas240=simulatePreset(profiles.wrx,PRESETS.Yungas,1/240);
assert.ok(Math.abs(yungas30.maxSpeedKmh-yungas240.maxSpeedKmh)<.1,'Yungas max speed should be frame-rate stable');
assert.ok(Math.abs(yungas30.maxLat-yungas240.maxLat)<.06,'Yungas lateral load should be frame-rate stable');

// Frame-rate invariance spot-check for steering state convergence.
function steeringAfter(seconds,dt){
  const v=profiles.wrx; let state=0; let time=0;
  while(time<seconds-1e-12){
    const step=Math.min(dt,seconds-time);
    const sc=steeringCommand({vehicle:v,speedAbs:30,input:.42});
    state+=(sc.target-state)*(1-Math.exp(-step*sc.inputRate));
    time+=step;
  }
  return state;
}
assert.ok(Math.abs(steeringAfter(1,1/30)-steeringAfter(1,1/240))<2e-6,'steering must be frame-rate invariant');

console.log('PASS V21.21 vehicle profile schema:',ids.join(', '));
console.log('PASS steering + lateral refactor regression against V21.20.1');
console.log('PASS load transfer, traction limits, road/terrain grade gravity, airborne force isolation');
console.log('PASS multi-wheel support plane + 3-axle future-truck math (6 wheel states)');
console.log('PASS frame-rate invariance: steering + full Yungas stress (30..240 Hz)');
console.log('PASS preset-style stress runs:',presetResults.length);
for(const row of presetResults){
  console.log(`${row.preset.padEnd(10)} ${row.vehicle.padEnd(11)} max=${row.maxSpeedKmh.toFixed(1).padStart(6)} km/h  lat=${row.maxLat.toFixed(2)} m/s²`);
}
console.log('Diagnostics WRX',dynamicsDiagnostics(profiles.wrx));
console.log('Diagnostics future truck',dynamicsDiagnostics(futureTruck));
