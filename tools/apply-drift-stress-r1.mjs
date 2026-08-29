import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

function read(path){return fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');}
function write(path,source){fs.writeFileSync(path,source);}
function replaceOnce(source,from,to,label){
  const first=source.indexOf(from);
  if(first<0)throw new Error(`Drift stress anchor missing: ${label}`);
  if(source.indexOf(from,first+1)>=0)throw new Error(`Drift stress anchor not unique: ${label}`);
  return source.slice(0,first)+to+source.slice(first+from.length);
}
function replaceRange(source,start,end,to,label){
  const a=source.indexOf(start);
  if(a<0)throw new Error(`Drift stress range start missing: ${label}`);
  const b=source.indexOf(end,a+start.length);
  if(b<0)throw new Error(`Drift stress range end missing: ${label}`);
  return source.slice(0,a)+to+source.slice(b);
}

// tire-model: allow an explicit blended surface profile without another lookup.
{
  const path='src/physics/tire-model.js';
  let s=read(path);
  s=replaceOnce(s,
    "  const surfaceProfile=typeof surface==='string'?surfaceFrictionProfile(surface):surfaceFrictionProfile(surface?.id);",
    "  const explicitSurface=surface&&typeof surface==='object'&&Number.isFinite(Number(surface.peakScale))&&Number.isFinite(Number(surface.slideScale));\n  const surfaceProfile=typeof surface==='string'\n    ?surfaceFrictionProfile(surface)\n    :(explicitSurface?surface:surfaceFrictionProfile(surface?.id));",
    'explicit blended tire surface');
  write(path,s);
}

// Per-wheel solver: each tire owns its own road/dirt fraction during an edge crossing.
{
  const path='src/physics/per-wheel-shadow-solver.js';
  let s=read(path);
  s=replaceOnce(s,
    "import { regulateAbsWheelOmega, lockedTireGroundForce } from './braking-tire-control.js';",
    "import { regulateAbsWheelOmega, lockedTireGroundForce } from './braking-tire-control.js';\nimport { blendedSurfaceProfile } from './surface-transition.js';",
    'per-wheel surface import');
  s=replaceOnce(s,
`      const integrated=integrateWheelOmegaStable({
        state,
        step,
        tire,
        surfaceId,`,
`      const contactRoadFraction=Number(contact?.roadFraction);
      const wheelSurface=Number.isFinite(contactRoadFraction)
        ?blendedSurfaceProfile(contactRoadFraction)
        :surfaceId;
      const integrated=integrateWheelOmegaStable({
        state,
        step,
        tire,
        surfaceId:wheelSurface,`,
    'per-wheel material ownership');
  write(path,s);
}

// Wheel support: reuse the same road lookup for height and material fraction.
{
  const path='src/wheel-ground-support.js';
  let s=read(path);
  s="import {tireRoadFractionFromLateral} from './physics/surface-transition.js';\n\n"+s;
  s=replaceOnce(s,
    "  const groundHeightRoadScratch={};",
`  const groundHeightRoadScratch={};
  const roadSampleCache={x:NaN,z:NaN,valid:false,y:0,lateral:Infinity};`,
    'wheel road sample cache');
  s=replaceOnce(s,
    "  function groundHeightForWheel(absx,absz,preferLocalRoadPlane=false){",
`  function sampleRoadSurface(absx,absz){
    if(absx===roadSampleCache.x&&absz===roadSampleCache.z){
      return roadSampleCache.valid?roadSampleCache:null;
    }
    const rs=roadSurfaceAt(absx,absz,groundHeightRoadScratch);
    roadSampleCache.x=absx;roadSampleCache.z=absz;
    roadSampleCache.valid=!!rs;
    roadSampleCache.y=Number(rs?.y)||0;
    roadSampleCache.lateral=Number.isFinite(Number(rs?.lateral))?Number(rs.lateral):Infinity;
    return roadSampleCache.valid?roadSampleCache:null;
  }

  function roadFractionForWheel(absx,absz,tireWidth=.25){
    if(fastWheelRoadSupport.active){
      const dx=absx-fastWheelRoadSupport.centerX;
      const dz=absz-fastWheelRoadSupport.centerZ;
      const along=dx*fastWheelRoadSupport.sinAngle+dz*fastWheelRoadSupport.cosAngle;
      const lateral=-dx*fastWheelRoadSupport.cosAngle+dz*fastWheelRoadSupport.sinAngle;
      if(Math.abs(along)<8.5){
        return tireRoadFractionFromLateral({roadLateral:lateral,roadHalfWidth:fastWheelRoadSupport.halfWidth,tireWidth});
      }
    }
    const rs=sampleRoadSurface(absx,absz);
    return rs
      ?tireRoadFractionFromLateral({roadLateral:rs.lateral,roadHalfWidth,tireWidth})
      :0;
  }

  function groundHeightForWheel(absx,absz,preferLocalRoadPlane=false){`,
    'wheel road fraction helper');
  s=replaceOnce(s,
    "    const rs=roadSurfaceAt(absx,absz,groundHeightRoadScratch);",
    "    const rs=sampleRoadSurface(absx,absz);",
    'reuse cached road sample');
  s=replaceOnce(s,
`  return {
    setFastWheelRoadSupport,
    groundHeightForWheel,
    support:fastWheelRoadSupport
  };`,
`  return {
    setFastWheelRoadSupport,
    groundHeightForWheel,
    roadFractionForWheel,
    support:fastWheelRoadSupport
  };`,
    'expose wheel road fraction');
  write(path,s);
}

// Suspension contact telemetry: carry material ownership with each physical wheel.
{
  const path='src/vehicle-presentation-v21.29.js';
  let s=read(path);
  s=replaceOnce(s,
    "  groundHeightForWheel,\n  activeVehicleWheels,",
    "  groundHeightForWheel,\n  roadFractionForWheel=()=>NaN,\n  activeVehicleWheels,",
    'presentation road fraction dependency');
  s=replaceOnce(s,
`      const ground=groundHeightForWheel(wx,wz,true);
      const tireWidth=(Number(w.tire?.geometry?.parameters?.height)||.27)*(Number(car.scale?.x)||1);
      const sample=samples[wheelIndex]||(samples[wheelIndex]={});
      sample.w=w;sample.ground=ground;sample.absX=wx;sample.absZ=wz;`,
`      const tireWidth=(Number(w.tire?.geometry?.parameters?.height)||.27)*(Number(car.scale?.x)||1);
      const ground=groundHeightForWheel(wx,wz,true);
      const roadFraction=roadFractionForWheel(wx,wz,tireWidth);
      const sample=samples[wheelIndex]||(samples[wheelIndex]={});
      sample.w=w;sample.ground=ground;sample.absX=wx;sample.absZ=wz;sample.roadFraction=roadFraction;`,
    'sample wheel surface fraction');
  s=replaceOnce(s,
`      contactSample.front=s.front;contactSample.side=s.side;contactSample.width=s.width;
      contactSample.contact=contact;contactSample.contactFactor=contactFactor;`,
`      contactSample.front=s.front;contactSample.side=s.side;contactSample.width=s.width;
      contactSample.roadFraction=clamp(s.roadFraction,0,1);
      contactSample.surfaceId=contactSample.roadFraction>=.999?'asphalt-dry':(contactSample.roadFraction<=.001?'dirt':'mixed');
      contactSample.contact=contact;contactSample.contactFactor=contactFactor;`,
    'publish wheel surface fraction');
  write(path,s);
}

// Vehicle dynamics: smooth the legacy J-turn road-only bypass and blend lateral capacity.
{
  const path='src/vehicle-dynamics-base.js';
  let s=read(path);
  const start="export function jTurnTransientYawActive({";
  const end="export function handbrakeLateralEffectForSpeed";
  s=replaceRange(s,start,end,
`export function jTurnTransientYawBlend({
  bodyLongitudinalSpeed=0,
  speedAbs=0,
  steerAngle=0,
  handbrake=false,
  airborne=false,
  onPavement=true,
  surfaceRoadFraction=null
}={}){
  if(handbrake||airborne)return 0;
  const suppliedRoad=Number(surfaceRoadFraction);
  const road=Number.isFinite(suppliedRoad)?clampDynamics(suppliedRoad,0,1):(onPavement?1:0);
  const rearward=smoothstep01((-Number(bodyLongitudinalSpeed)-3.2)/3.0);
  const speedGate=smoothstep01((Math.abs(Number(speedAbs)||0)-7.0)/4.0);
  const steerGate=smoothstep01((Math.abs(Number(steerAngle)||0)-.075)/.09);
  return road*rearward*speedGate*steerGate;
}

export function jTurnTransientYawActive(args={}){
  return jTurnTransientYawBlend(args)>.5;
}

export function handbrakeLateralEffectForSpeed`,
    'J-turn progressive surface authority');
  s=replaceOnce(s,
    "export function lateralDynamicsEnvelope({vehicle,speed=0,steerAngle=0,steerInput=0,driveThrottle=0,onPavement=true,surfaceGrip=1,awdOffroadGripBonus=1,offroadPeakMu=null,rearSlipAmount=0,airborne=false}={},out=null){",
    "export function lateralDynamicsEnvelope({vehicle,speed=0,steerAngle=0,steerInput=0,driveThrottle=0,onPavement=true,surfaceGrip=1,awdOffroadGripBonus=1,offroadPeakMu=null,surfaceRoadFraction=null,rearSlipAmount=0,airborne=false}={},out=null){",
    'lateral envelope surface fraction arg');
  s=replaceOnce(s,
`  const effectiveOffroadGrip=clampDynamics(
    Number.isFinite(suppliedOffroadPeak)?suppliedOffroadPeak:safeNumber(vehicle?.offroadGrip,.60),
    .18,.95
  );`,
`  const effectiveOffroadGrip=clampDynamics(
    Number.isFinite(suppliedOffroadPeak)?suppliedOffroadPeak:safeNumber(vehicle?.offroadGrip,.60),
    .18,.95
  );
  const suppliedRoadFraction=Number(surfaceRoadFraction);
  const roadFraction=Number.isFinite(suppliedRoadFraction)
    ?clampDynamics(suppliedRoadFraction,0,1)
    :(onPavement?1:0);`,
    'lateral road fraction');
  s=replaceOnce(s,
    "  const effectiveGrip=onPavement?safeNumber(surfaceGrip,1)*roadGripMultiplier:1;",
    "  const roadGeometryGrip=safeNumber(surfaceGrip,1)*roadGripMultiplier;\n  const effectiveGrip=1+(roadGeometryGrip-1)*roadFraction;",
    'blend steering geometry grip');
  s=replaceOnce(s,
    "  const baseLatLimit=onPavement?roadLatLimit:offroadLatLimit;",
    "  const baseLatLimit=offroadLatLimit+(roadLatLimit-offroadLatLimit)*roadFraction;",
    'blend lateral capacity');
  s=replaceOnce(s,
    "  const aeroGripScale=onPavement?rawAeroGripScale:1+(rawAeroGripScale-1)*.55;",
    "  const dirtAeroGripScale=1+(rawAeroGripScale-1)*.55;\n  const aeroGripScale=dirtAeroGripScale+(rawAeroGripScale-dirtAeroGripScale)*roadFraction;",
    'blend aero surface authority');
  s=replaceOnce(s,
    "  result.aeroGripScale=aeroGripScale;result.aeroDownforceAccel=aero?.downforceAccel||0;",
    "  result.aeroGripScale=aeroGripScale;result.aeroDownforceAccel=aero?.downforceAccel||0;result.surfaceRoadFraction=roadFraction;",
    'expose surface fraction');
  write(path,s);
}

// Runtime aggregate force path: blend global terms by supported tire fraction.
{
  const path='src/driving-runtime-base.js';
  let s=read(path);
  s=replaceOnce(s,
    "import { torqueDrivenAcceleration } from './physics/powertrain-force.js';",
    "import { torqueDrivenAcceleration } from './physics/powertrain-force.js';\nimport { weightedRoadFraction, blendRoadDirt } from './physics/surface-transition.js';",
    'runtime surface blend import');
  s=replaceOnce(s,
`    const onPavement=!!(nr&&nr.d<8.5);
    currentOnPavementForInstruments=onPavement;
    const offroadFrictionModel=!onPavement&&!airborneNow
      ?offroadTireFriction({vehicleId:getVehicleId?.()||'unknown',vehicle:VEHICLE})
      :null;
    const offroadSlipForce=offroadFrictionModel
      ?offroadSideslipFriction({speed,heading,velocityHeading,slideMu:offroadFrictionModel.slide,airborne:airborneNow})
      :{speedDecel:0,momentumYawRate:0,slideGate:0,sideslipRad:0};`,
`    const onPavement=!!(nr&&nr.d<8.5);
    currentOnPavementForInstruments=onPavement;
    const surfaceRoadFraction=weightedRoadFraction(
      vehiclePresentation?.wheelContacts||[],
      onPavement?1:0
    );
    const terrainFraction=1-surfaceRoadFraction;
    const offroadFrictionModel=terrainFraction>1e-4&&!airborneNow
      ?offroadTireFriction({vehicleId:getVehicleId?.()||'unknown',vehicle:VEHICLE})
      :null;
    const rawOffroadSlipForce=offroadFrictionModel
      ?offroadSideslipFriction({speed,heading,velocityHeading,slideMu:offroadFrictionModel.slide,airborne:airborneNow})
      :{speedDecel:0,momentumYawRate:0,slideGate:0,sideslipRad:0};
    const offroadSlipForce={
      ...rawOffroadSlipForce,
      speedDecel:rawOffroadSlipForce.speedDecel*terrainFraction,
      momentumYawRate:rawOffroadSlipForce.momentumYawRate*terrainFraction
    };`,
    'runtime supported surface fraction');
  s=replaceOnce(s,
    "    const surfaceGrip=onPavement?roadSurfaceGrip():1;\n    const isAWD=VEHICLE.drivetrain==='AWD';\n    const awdOffroadGripBonus=!onPavement&&isAWD?1.18:1;",
    "    const roadGripValue=roadSurfaceGrip();\n    const surfaceGrip=surfaceRoadFraction>1e-4?roadGripValue:1;\n    const isAWD=VEHICLE.drivetrain==='AWD';\n    const awdOffroadGripBonus=isAWD?1.18:1;",
    'runtime road grip value');
  s=replaceOnce(s,
`    const longitudinalMu=onPavement
      ?Math.max(.25,((VEHICLE.longitudinalAccelLimit??VEHICLE.brake??9.8)/9.80665)*surfaceGrip)
      :Math.max(.22,(VEHICLE.offroadGrip??.60)*awdOffroadGripBonus*offroadStaticTractionBoost);`,
`    const roadLongitudinalMu=Math.max(.25,((VEHICLE.longitudinalAccelLimit??VEHICLE.brake??9.8)/9.80665)*roadGripValue);
    const dirtLongitudinalMu=Math.max(.22,(VEHICLE.offroadGrip??.60)*awdOffroadGripBonus*offroadStaticTractionBoost);
    const longitudinalMu=blendRoadDirt(roadLongitudinalMu,dirtLongitudinalMu,surfaceRoadFraction);`,
    'blend longitudinal surface mu');
  s=replaceOnce(s,
    "      const surfaceDrag=onPavement?Math.max(0,(1-surfaceGrip)*.75):VEHICLE.offroadDrag;",
    "      const roadDrag=Math.max(0,(1-roadGripValue)*.75);\n      const surfaceDrag=blendRoadDirt(roadDrag,VEHICLE.offroadDrag,surfaceRoadFraction);",
    'blend surface drag');
  s=replaceOnce(s,
    "    if(!onPavement&&!airborneNow&&offroadSlipForce.speedDecel>1e-5&&Math.abs(speed)>.05){",
    "    if(terrainFraction>1e-4&&!airborneNow&&offroadSlipForce.speedDecel>1e-5&&Math.abs(speed)>.05){",
    'continuous offroad scrub');
  s=replaceOnce(s,
    "    const jTurnYawActive=jTurnTransientYawActive({bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake:hand,airborne:airborneNow,onPavement});",
    "    const jTurnYawBlend=jTurnTransientYawBlend({bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake:hand,airborne:airborneNow,onPavement,surfaceRoadFraction});",
    'progressive J-turn blend');
  s=replaceOnce(s,
    "    const lateralEnvelope=lateralDynamicsEnvelope({vehicle:VEHICLE,speed:steeringTravelSpeed,steerAngle,steerInput:steer,driveThrottle,onPavement,surfaceGrip,awdOffroadGripBonus,offroadPeakMu:offroadFrictionModel?.peak,rearSlipAmount:0,airborne:airborneNow},dynamicsScratch.lateral);",
    "    const lateralEnvelope=lateralDynamicsEnvelope({vehicle:VEHICLE,speed:steeringTravelSpeed,steerAngle,steerInput:steer,driveThrottle,onPavement,surfaceGrip,awdOffroadGripBonus,offroadPeakMu:offroadFrictionModel?.peak,surfaceRoadFraction,rearSlipAmount:0,airborne:airborneNow},dynamicsScratch.lateral);",
    'lateral envelope surface blend');
  s=replaceOnce(s,
    "    if(!jTurnYawActive&&requestedLatAccel>latLimit&&requestedLatAccel>0)yawRate*=latLimit/requestedLatAccel;",
    "    if(requestedLatAccel>latLimit&&requestedLatAccel>0){\n      const saturationScale=latLimit/requestedLatAccel;\n      yawRate*=saturationScale+(1-saturationScale)*jTurnYawBlend;\n    }",
    'smooth J-turn saturation exit');
  s=replaceOnce(s,
`    if(onPavement&&!airborneNow&&fourWheelSlide>.01&&speedAbs>6){
      const scrubDecel=1.0+fourWheelSlide*3.2,scrubDelta=scrubDecel*dt;`,
`    if(surfaceRoadFraction>1e-4&&!airborneNow&&fourWheelSlide>.01&&speedAbs>6){
      const scrubDecel=(1.0+fourWheelSlide*3.2)*surfaceRoadFraction,scrubDelta=scrubDecel*dt;`,
    'blend road slide scrub');
  write(path,s);
}

// Main wiring: expose the optimized cached road-fraction sampler to suspension.
{
  const path='src/main.js';
  let s=read(path);
  s=replaceOnce(s,
`function groundHeightForWheel(...args){
  return wheelGroundSupport.groundHeightForWheel(...args);
}`,
`function groundHeightForWheel(...args){
  return wheelGroundSupport.groundHeightForWheel(...args);
}
function roadFractionForWheel(...args){
  return wheelGroundSupport.roadFractionForWheel(...args);
}`,
    'main wheel material helper');
  s=replaceOnce(s,
    "  groundHeightForWheel,\n  activeVehicleWheels:()=>",
    "  groundHeightForWheel,\n  roadFractionForWheel,\n  activeVehicleWheels:()=>",
    'wire wheel material helper');
  write(path,s);
}

for(const path of [
  'src/physics/tire-model.js',
  'src/physics/per-wheel-shadow-solver.js',
  'src/wheel-ground-support.js',
  'src/vehicle-presentation-v21.29.js',
  'src/vehicle-dynamics-base.js',
  'src/driving-runtime-base.js',
  'src/main.js'
]){
  const check=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});
  if(check.status!==0)process.exit(check.status||1);
}
console.log('Drift stress R1 surface-transition physics patch applied');
