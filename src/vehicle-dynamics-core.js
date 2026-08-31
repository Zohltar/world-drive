// World Drive V21.21.26 — generalized vehicle dynamics + finite steering-rack travel.
//
// This module deliberately contains no Three.js or DOM dependencies. It is
// pure math so it can be stress-tested outside the renderer and reused later
// by trucks, multi-axle vehicles and articulated combinations.

export {limitMomentumHeadingDelta} from './physics/momentum-direction.js';

export const GRAVITY=9.80665;

export function clampDynamics(value,min,max){
  return Math.max(min,Math.min(max,value));
}

export function smoothstep01(value){
  const t=clampDynamics(Number(value)||0,0,1);
  return t*t*(3-2*t);
}

function safeNumber(value,fallback){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

const layoutCache=new WeakMap();

function buildVehicleLayout(vehicle={}){
  const wheelbase=Math.max(1,safeNumber(vehicle.wheelbase,2.7));
  const trackWidth=Math.max(.8,safeNumber(vehicle.trackWidth,1.55));
  const frontWeightBias=clampDynamics(safeNumber(vehicle.frontWeightBias,.55),.30,.75);
  const massKg=Math.max(250,safeNumber(vehicle.massKg,1500));
  const cgHeight=Math.max(.15,safeNumber(vehicle.cgHeight,.52));
  const yawInertiaScale=Math.max(.45,safeNumber(vehicle.yawInertiaScale,1));
  const drivetrain=vehicle.drivetrain||'AWD';

  const sourceAxles=Array.isArray(vehicle.axles)?vehicle.axles:[];
  const frontAxlePosition=(1-frontWeightBias)*wheelbase;
  const rearAxlePosition=-frontWeightBias*wheelbase;
  let axles=sourceAxles.map((axle,index)=>{
    const t=sourceAxles.length>1?index/(sourceAxles.length-1):0;
    const fallbackPosition=frontAxlePosition+(rearAxlePosition-frontAxlePosition)*t;
    return {
      id:axle.id||`axle-${index}`,
      positionM:safeNumber(axle.positionM,fallbackPosition),
      staticLoadFraction:Math.max(.01,safeNumber(axle.staticLoadFraction,index===0?frontWeightBias:(1-frontWeightBias)/Math.max(1,sourceAxles.length-1))),
      steerFactor:safeNumber(axle.steerFactor,index===0?1:0),
      driveShare:Math.max(0,safeNumber(axle.driveShare,0)),
      brakeShare:Math.max(0,safeNumber(axle.brakeShare,index===0?.62:.38/Math.max(1,sourceAxles.length-1))),
      trackWidth:Math.max(.8,safeNumber(axle.trackWidth,trackWidth)),
      wheelCount:Math.max(1,Math.round(safeNumber(axle.wheelCount,2)))
    };
  });

  if(axles.length<2){
    const configuredDriveFront=clampDynamics(safeNumber(vehicle.driveBiasFront,.5),0,1);
    const driveFront=drivetrain==='FWD'?1:(drivetrain==='RWD'?0:configuredDriveFront);
    const brakeFront=clampDynamics(safeNumber(vehicle.brakeBiasFront,.62),0,1);
    axles=[
      {id:'front',positionM:frontAxlePosition,staticLoadFraction:frontWeightBias,steerFactor:1,driveShare:driveFront,brakeShare:brakeFront,trackWidth,wheelCount:2},
      {id:'rear',positionM:rearAxlePosition,staticLoadFraction:1-frontWeightBias,steerFactor:0,driveShare:1-driveFront,brakeShare:1-brakeFront,trackWidth,wheelCount:2}
    ];
  }

  const normalizeShare=(key)=>{
    const total=axles.reduce((sum,a)=>sum+Math.max(0,a[key]),0);
    if(total<=1e-8)return;
    for(const axle of axles)axle[key]=Math.max(0,axle[key])/total;
  };
  normalizeShare('staticLoadFraction');normalizeShare('driveShare');normalizeShare('brakeShare');

  const yawInertiaKgM2=Math.max(1,safeNumber(vehicle.yawInertiaKgM2,massKg*(wheelbase*wheelbase+trackWidth*trackWidth)/12*yawInertiaScale));
  const referenceYawInertia=1560*(2.65*2.65+1.56*1.56)/12*.96;
  const yawResponseScale=clampDynamics(Math.sqrt(referenceYawInertia/yawInertiaKgM2),.52,1.45);
  return {wheelbase,trackWidth,frontWeightBias,massKg,cgHeight,yawInertiaScale,yawInertiaKgM2,yawResponseScale,drivetrain,axles};
}

export function vehicleLayout(vehicle={}){
  if(!vehicle || (typeof vehicle!=='object'&&typeof vehicle!=='function'))return buildVehicleLayout({});
  const revision=safeNumber(vehicle?._layoutRevision,0);
  const cached=layoutCache.get(vehicle);
  if(cached&&cached.revision===revision)return cached.layout;
  const layout=buildVehicleLayout(vehicle);
  layoutCache.set(vehicle,{revision,layout});
  return layout;
}

function aerodynamicLoadForLayout(layout,vehicle,speedAbs=0,airborne=false,out=null){
  const result=out||{};
  const v=Math.max(0,Math.abs(safeNumber(speedAbs,0)));
  const clA=Math.max(0,safeNumber(vehicle?.aeroDownforceClA,0));
  const rho=1.225;
  const downforceN=airborne||clA<=0?0:.5*rho*v*v*clA;
  const downforceAccel=downforceN/Math.max(1,layout.massKg);
  const loadRatio=downforceAccel/GRAVITY;
  const efficiency=clampDynamics(safeNumber(vehicle?.aeroGripEfficiency,1),.35,1);
  const maxGripScale=Math.max(1,safeNumber(vehicle?.aeroGripScaleMax,4));
  const gripScale=clampDynamics(1+loadRatio*efficiency,1,maxGripScale);
  const frontBias=clampDynamics(safeNumber(vehicle?.aeroDownforceFrontBias,layout.frontWeightBias),.05,.95);
  result.downforceN=downforceN;result.downforceAccel=downforceAccel;result.loadRatio=loadRatio;result.totalNormalScale=1+loadRatio;result.gripScale=gripScale;result.frontBias=frontBias;result.rearBias=1-frontBias;result.clA=clA;
  return result;
}

export function aerodynamicLoad({vehicle,speedAbs=0,airborne=false}={},out=null){return aerodynamicLoadForLayout(vehicleLayout(vehicle),vehicle,speedAbs,airborne,out);}
function aerodynamicAxleShare(layout,aero,axleIndex){
  const axle=layout.axles[axleIndex];
  if(layout.axles.length===2)return axle.positionM>=0?(aero?.frontBias??layout.frontWeightBias):(aero?.rearBias??(1-layout.frontWeightBias));
  return Math.max(.01,axle.staticLoadFraction);
}

export function dynamicAxleLoads(vehicle,longitudinalAccel=0,out=null){
  const layout=vehicleLayout(vehicle);const result=out||[];
  const transfer=clampDynamics((safeNumber(longitudinalAccel,0)*layout.cgHeight)/(GRAVITY*layout.wheelbase),-.32,.32);
  if(layout.axles.length===2){const frontLoad=clampDynamics(layout.axles[0].staticLoadFraction-transfer,.05,.95);result.length=2;result[0]=frontLoad;result[1]=1-frontLoad;return result;}
  result.length=layout.axles.length;let total=0;
  for(let i=0;i<layout.axles.length;i++){const axle=layout.axles[i];const lever=clampDynamics(axle.positionM/layout.wheelbase,-1,1);const value=Math.max(.01,axle.staticLoadFraction-transfer*lever*2);result[i]=value;total+=value;}
  total=total||1;for(let i=0;i<result.length;i++)result[i]/=total;return result;
}

function longitudinalLimitFromLoads(layout,loads,aero,mu,mode){
  const aeroLoadRatio=aero?.loadRatio||0,totalNormalScale=aero?.totalNormalScale||1;let limit=Infinity;
  if(layout.axles.length===2){
    const front=layout.axles[0],rear=layout.axles[1];
    const frontNormal=Math.max(.01,(loads[0]||0)+aeroLoadRatio*aerodynamicAxleShare(layout,aero,0));
    const rearNormal=Math.max(.01,(loads[1]||0)+aeroLoadRatio*aerodynamicAxleShare(layout,aero,1));
    if(mode==='brake')limit=(front.brakeShare>1e-6||rear.brakeShare>1e-6)?mu*GRAVITY*totalNormalScale:0;
    else if(mode==='handbrake'){const rearLoad=(front.positionM<0?frontNormal:0)+(rear.positionM<0?rearNormal:0);limit=mu*GRAVITY*Math.max(.05,rearLoad);}
    else{const d0=Math.max(0,front.driveShare),d1=Math.max(0,rear.driveShare);if(d0<=1e-6&&d1<=1e-6)limit=0;else{let l=Infinity;if(d0>1e-6)l=Math.min(l,mu*GRAVITY*frontNormal/d0);if(d1>1e-6)l=Math.min(l,mu*GRAVITY*rearNormal/d1);limit=Number.isFinite(l)?l:mu*GRAVITY;}}
  }else if(mode==='brake'){
    let hasServiceBrakes=false;for(let i=0;i<layout.axles.length;i++){if(layout.axles[i].brakeShare>1e-6){hasServiceBrakes=true;break;}}limit=hasServiceBrakes?mu*GRAVITY*totalNormalScale:0;
  }else if(mode==='handbrake'){
    let rearLoad=0;for(let i=0;i<layout.axles.length;i++){if(layout.axles[i].positionM>=0)continue;const normal=Math.max(.01,(loads[i]||0)+aeroLoadRatio*aerodynamicAxleShare(layout,aero,i));rearLoad+=normal;}limit=mu*GRAVITY*Math.max(.05,rearLoad);
  }else{
    let driven=false;for(let i=0;i<layout.axles.length;i++){const share=Math.max(0,layout.axles[i].driveShare);if(share<=1e-6)continue;driven=true;const normal=Math.max(.01,(loads[i]||0)+aeroLoadRatio*aerodynamicAxleShare(layout,aero,i));const available=mu*GRAVITY*normal;limit=Math.min(limit,available/share);}if(!driven)limit=0;else if(!Number.isFinite(limit))limit=mu*GRAVITY;
  }return Math.max(0,limit);
}

export function longitudinalTractionLimit({vehicle,requestedAccel=0,surfaceMu=1,mode='drive',airborne=false,speedAbs=0}={},out=null){
  const result=out||{},loads=result.axleLoads||(result.axleLoads=[]),requested=safeNumber(requestedAccel,0);
  if(airborne||Math.abs(requested)<1e-8){dynamicAxleLoads(vehicle,0,loads);result.acceleration=0;result.requested=requested;result.limit=0;result.limited=Math.abs(requested)>1e-8;return result;}
  const layout=vehicleLayout(vehicle);const aeroEnabled=!airborne&&safeNumber(vehicle?.aeroDownforceClA,0)>0&&Math.abs(speedAbs)>.25;const aero=aeroEnabled?aerodynamicLoadForLayout(layout,vehicle,speedAbs,false,result.aero||(result.aero={})):null;const mu=Math.max(.05,safeNumber(surfaceMu,1));const requestedMagnitude=Math.abs(requested),requestedSign=Math.sign(requested);
  if(mode==='brake'){
    let hasServiceBrakes=false;for(let i=0;i<layout.axles.length;i++){if(layout.axles[i].brakeShare>1e-6){hasServiceBrakes=true;break;}}
    const limit=hasServiceBrakes?mu*GRAVITY*(aero?.totalNormalScale||1):0;const magnitude=Math.min(requestedMagnitude,Math.max(0,limit));const actual=requestedSign*magnitude;dynamicAxleLoads(vehicle,actual,loads);result.acceleration=actual;result.requested=requested;result.limit=limit;result.limited=magnitude+1e-8<requestedMagnitude;return result;
  }
  dynamicAxleLoads(vehicle,requested,loads);let limit=longitudinalLimitFromLoads(layout,loads,aero,mu,mode);
  if(requestedMagnitude<=limit+1e-8){result.acceleration=requested;result.requested=requested;result.limit=limit;result.limited=false;return result;}
  let assumedAccel=requestedSign*Math.max(0,limit),actual=assumedAccel;
  for(let iteration=0;iteration<3;iteration++){dynamicAxleLoads(vehicle,assumedAccel,loads);limit=longitudinalLimitFromLoads(layout,loads,aero,mu,mode);actual=requestedSign*Math.min(requestedMagnitude,limit);if(Math.abs(actual-assumedAccel)<1e-4)break;assumedAccel=actual;}
  dynamicAxleLoads(vehicle,actual,loads);limit=longitudinalLimitFromLoads(layout,loads,aero,mu,mode);actual=requestedSign*Math.min(requestedMagnitude,limit);result.acceleration=actual;result.requested=requested;result.limit=limit;result.limited=Math.abs(actual)+1e-8<requestedMagnitude;return result;
}

export function computeGradeAcceleration({onPavement=false,roadFrame=null,heading=0,airborne=false,x=0,z=0,terrainHeightAt=null,sampleDistance=3}={},out=null){
  const result=out||{};if(airborne){result.acceleration=0;result.pitch=0;result.grade=0;result.source='air';return result;}let grade=0,source='flat';
  if(onPavement&&roadFrame&&Number.isFinite(roadFrame.pitch)&&Number.isFinite(roadFrame.angle)){grade=Math.tan(roadFrame.pitch)*Math.cos(heading-roadFrame.angle);source='road';}
  else if(typeof terrainHeightAt==='function'){const d=Math.max(.5,safeNumber(sampleDistance,3));const sx=Math.sin(heading)*d,sz=Math.cos(heading)*d;const ahead=terrainHeightAt(x+sx,z+sz),behind=terrainHeightAt(x-sx,z-sz);if(Number.isFinite(ahead)&&Number.isFinite(behind)){grade=(ahead-behind)/(2*d);source='terrain';}}
  grade=clampDynamics(grade,-.55,.55);const pitch=Math.atan(grade);result.acceleration=-GRAVITY*Math.sin(pitch);result.pitch=pitch;result.grade=grade;result.source=source;return result;
}

const steeringAeroScratch={};
export function steeringCommand({vehicle,speedAbs=0,input=0}={},out=null){
  const result=out||{},v=Math.max(0,safeNumber(speedAbs,0)),raw=clampDynamics(safeNumber(input,0),-1,1),low=safeNumber(vehicle?.maxSteerLow,.46),high=safeNumber(vehicle?.maxSteerHigh,.16),speedBlend=clampDynamics(v/32,0,1);
  const parkingSteerT=1-smoothstep01(v/8.0),parkingSteerBoost=clampDynamics(safeNumber(vehicle?.parkingSteerBoost,.26),0,.50),parkingSteerScale=1+parkingSteerBoost*parkingSteerT,lowSpeedRoadWheelAngle=low*parkingSteerScale,baseRoadWheelAngle=lowSpeedRoadWheelAngle+(high-lowSpeedRoadWheelAngle)*(speedBlend*speedBlend);
  const highSpeedAuthorityT=clampDynamics((v-27)/28,0,1),highSpeedAuthoritySmooth=highSpeedAuthorityT*highSpeedAuthorityT*(3-2*highSpeedAuthorityT),highSpeedAuthorityScale=1-.28*highSpeedAuthoritySmooth;let maxRoadWheelAngle=baseRoadWheelAngle*highSpeedAuthorityScale;
  const steeringGripEnvelopeFraction=clampDynamics(safeNumber(vehicle?.steeringGripEnvelopeFraction,0),0,1);let gripEnvelopeRoadWheelAngle=0,gripEnvelopeLimited=false;
  if(steeringGripEnvelopeFraction>0&&v>4){const layout=vehicleLayout(vehicle);const aero=safeNumber(vehicle?.aeroDownforceClA,0)>0?aerodynamicLoadForLayout(layout,vehicle,v,false,steeringAeroScratch):null;const aeroGripScale=aero?.gripScale||1;const lateralEnvelopeAccel=Math.max(1,safeNumber(vehicle?.lateralAccelLimit,7))*aeroGripScale*steeringGripEnvelopeFraction;gripEnvelopeRoadWheelAngle=Math.atan((lateralEnvelopeAccel*layout.wheelbase)/Math.max(16,v*v));if(gripEnvelopeRoadWheelAngle<maxRoadWheelAngle){maxRoadWheelAngle=gripEnvelopeRoadWheelAngle;gripEnvelopeLimited=true;}}
  let target=raw;if(Math.abs(target)<.08)target=0;else{const vehicleExponent=Math.max(.75,safeNumber(vehicle?.steeringInputExponent,1.65));const highSpeedT=clampDynamics((v-8.3)/26.4,0,1),highSpeedSmooth=highSpeedT*highSpeedT*(3-2*highSpeedT);target=Math.sign(target)*Math.pow(Math.abs(target),vehicleExponent+1.15*highSpeedSmooth);}
  const highSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseHigh,3.8)),highSpeedResponseScale=1-.45*highSpeedAuthoritySmooth,lowSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseLow,5.2)),midSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseMid,4.5)),lowReturnRate=Math.max(.5,safeNumber(vehicle?.steeringReturnRateLow,7.2)),highReturnRate=Math.max(.5,safeNumber(vehicle?.steeringReturnRateHigh,7.5));
  result.target=target;result.maxRoadWheelAngle=maxRoadWheelAngle;result.inputRate=v<5?lowSpeedResponse:(v>25?highSpeedResponse*highSpeedResponseScale:midSpeedResponse);result.returnRate=v<5?lowReturnRate:highReturnRate;
  const centerToFullTime=safeNumber(vehicle?.steeringCenterToFullTimeSec,0),returnToCenterTime=safeNumber(vehicle?.steeringReturnToCenterTimeSec,centerToFullTime);result.inputSlewRate=centerToFullTime>1e-4?1/centerToFullTime:0;result.returnSlewRate=returnToCenterTime>1e-4?1/returnToCenterTime:result.inputSlewRate;result.centerToFullTimeSec=centerToFullTime>1e-4?centerToFullTime:0;result.returnToCenterTimeSec=returnToCenterTime>1e-4?returnToCenterTime:0;result.parkingSteerScale=parkingSteerScale;result.highSpeedAuthorityScale=highSpeedAuthorityScale;result.highSpeedResponseScale=highSpeedResponseScale;result.gripEnvelopeRoadWheelAngle=gripEnvelopeRoadWheelAngle;result.gripEnvelopeLimited=gripEnvelopeLimited?1:0;return result;
}

export function advanceSteeringRack({current=0,target=0,dt=0,inputSlewRate=0,returnSlewRate=0,inputRate=0,returnRate=0}={}){
  const cur=clampDynamics(safeNumber(current,0),-1,1),tgt=clampDynamics(safeNumber(target,0),-1,1),stepDt=Math.max(0,safeNumber(dt,0)),returning=Math.abs(tgt)<1e-12,slew=Math.max(0,safeNumber(returning?returnSlewRate:inputSlewRate,0));
  if(slew>0&&stepDt>0){const delta=tgt-cur,maxStep=slew*stepDt;if(Math.abs(delta)<=maxStep)return tgt;return clampDynamics(cur+Math.sign(delta)*maxStep,-1,1);}const response=Math.max(0,safeNumber(returning?returnRate:inputRate,0));if(response<=0||stepDt<=0)return cur;return clampDynamics(cur+(tgt-cur)*(1-Math.exp(-stepDt*response)),-1,1);
}

export function lateralDynamicsEnvelope({vehicle,speed=0,steerAngle=0,steerInput=0,driveThrottle=0,onPavement=true,surfaceGrip=1,awdOffroadGripBonus=1,offroadPeakMu=null,rearSlipAmount=0,airborne=false}={},out=null){
  const result=out||{},layout=vehicleLayout(vehicle),speedValue=safeNumber(speed,0),speedAbs=Math.abs(speedValue),drivetrain=layout.drivetrain,positiveThrottle=speedValue>=0?clampDynamics(driveThrottle,0,1):0,powerHandlingSpeedGate=clampDynamics((speedAbs-3)/12,0,1),steeringDemand=clampDynamics(Math.abs(steerInput),0,1),powerCorneringLoad=positiveThrottle*powerHandlingSpeedGate*steeringDemand,roadGripMultiplier=safeNumber(vehicle?.roadGripMultiplier,1),suppliedOffroadPeak=Number(offroadPeakMu),effectiveOffroadGrip=clampDynamics(Number.isFinite(suppliedOffroadPeak)?suppliedOffroadPeak:safeNumber(vehicle?.offroadGrip,.60),.18,.95),effectiveGrip=onPavement?safeNumber(surfaceGrip,1)*roadGripMultiplier:1;let yawRate=(speedValue/layout.wheelbase)*Math.tan(safeNumber(steerAngle,0))*effectiveGrip;
  if(airborne)yawRate*=.06;if(drivetrain==='FWD')yawRate*=1-.20*powerCorneringLoad;
  const powerOversteerGripLoss=drivetrain==='RWD'&&vehicle?.legacyDriftAssist!==false?safeNumber(vehicle?.powerOversteerGripLoss,.07):0,requestedLatAccel=Math.abs(speedValue*yawRate),offroadLatLimit=effectiveOffroadGrip*GRAVITY,roadLatLimit=Math.max(1,safeNumber(vehicle?.lateralAccelLimit,7)),baseLatLimit=onPavement?roadLatLimit:offroadLatLimit,aeroEnabled=!airborne&&safeNumber(vehicle?.aeroDownforceClA,0)>0&&speedAbs>.25,aero=aeroEnabled?aerodynamicLoadForLayout(layout,vehicle,speedAbs,false,result.aero||(result.aero={})):null,rawAeroGripScale=aero?.gripScale||1,aeroGripScale=onPavement?rawAeroGripScale:1+(rawAeroGripScale-1)*.55,rwdPowerGripFactor=drivetrain==='RWD'?Math.max(.72,1-powerOversteerGripLoss*powerCorneringLoad):1,slideGripFactor=airborne?.08:Math.max(.78,1-clampDynamics(rearSlipAmount,0,1)*.16),latLimit=baseLatLimit*aeroGripScale*rwdPowerGripFactor*slideGripFactor;
  result.yawRate=yawRate;result.requestedLatAccel=requestedLatAccel;result.signedLatAccel=speedValue*yawRate;result.latLimit=latLimit;result.drivetrain=drivetrain;result.powerCorneringLoad=powerCorneringLoad;result.effectiveGrip=effectiveGrip;result.roadLatLimit=roadLatLimit;result.offroadLatLimit=offroadLatLimit;result.offroadPeakMu=effectiveOffroadGrip;result.aeroGripScale=aeroGripScale;result.aeroDownforceAccel=aero?.downforceAccel||0;return result;
}

const FALLBACK_WHEEL_META=[{front:false,side:'left',axleIndex:1},{front:true,side:'left',axleIndex:0},{front:false,side:'right',axleIndex:1},{front:true,side:'right',axleIndex:0}];
function fallbackWheelMeta(index){return FALLBACK_WHEEL_META[index]||{front:index%2===1,side:index%4<2?'left':'right',axleIndex:index%2===1?0:1};}

export function estimateWheelGripUsage({requestedLatAccel,signedLatAccel,latLimit,longitudinalAccel,propulsionAccel=null,serviceBrakeAccel=null,surfaceMu=1,throttle,handbrake,handbrakeSlipState=null,sideslipRad=0,airborne,vehicle,speedAbs=null,dt,contacts=[],previousUsage=[]}={},out=null){
  const result=out||{},layout=vehicleLayout(vehicle),count=Math.max(4,contacts.length||0),lateralDemand=latLimit>0?Math.max(0,requestedLatAccel/latLimit):0,tireSpeed=Math.max(0,safeNumber(speedAbs,50)),rearHandbrakeSlip=airborne?0:clampDynamics(safeNumber(handbrakeSlipState,handbrake?1:0),0,1),handbrakeSlidingMuRatio=clampDynamics(safeNumber(vehicle?.handbrakeSlidingMuRatio,.72),.65,.90),handbrakeSideslip=Math.min(Math.PI*.5,Math.abs(safeNumber(sideslipRad,0))),aeroEnabled=!airborne&&safeNumber(vehicle?.aeroDownforceClA,0)>0&&tireSpeed>.25,aero=aeroEnabled?aerodynamicLoadForLayout(layout,vehicle,tireSpeed,false,result.aero||(result.aero={})):null,aeroLoadRatio=aero?.loadRatio||0,totalNormalScale=Math.max(1,aero?.totalNormalScale||1),lowSpeedGripT=clampDynamics((tireSpeed-2.5)/6.0,0,1),lowSpeedStaticGripBoost=1+.18*(1-lowSpeedGripT),explicitBrake=Number(serviceBrakeAccel),explicitDrive=Number(propulsionAccel),fallbackNetAccel=safeNumber(longitudinalAccel,0),driveSigned=Number.isFinite(explicitDrive)?explicitDrive:(throttle?Math.max(0,fallbackNetAccel):0),brakeSigned=Number.isFinite(explicitBrake)?explicitBrake:(!throttle&&fallbackNetAccel<0?fallbackNetAccel:0),tireForceAccel=driveSigned+brakeSigned,axleLoads=result.axleLoads||(result.axleLoads=[]);dynamicAxleLoads(vehicle,tireForceAccel,axleLoads);
  const longitudinalSurfaceMu=Math.max(.12,safeNumber(surfaceMu,1)),transfers=result._lateralTransfer||(result._lateralTransfer=[]);transfers.length=layout.axles.length;for(let i=0;i<layout.axles.length;i++)transfers[i]=clampDynamics((safeNumber(signedLatAccel,0)*layout.cgHeight)/(GRAVITY*Math.max(.8,layout.axles[i].trackWidth)),-.45,.45);
  const raw=result.raw||(result.raw=[]),smoothed=result.smoothed||(result.smoothed=[]),slip=result.slip||(result.slip=[]),lateralSlip=result.lateralSlip||(result.lateralSlip=[]),lateralUsage=result.lateralUsage||(result.lateralUsage=[]),longitudinalUsage=result.longitudinalUsage||(result.longitudinalUsage=[]);raw.length=smoothed.length=slip.length=lateralSlip.length=lateralUsage.length=longitudinalUsage.length=count;
  let frontCombined=0,rearCombined=0,frontLateralMax=0,rearLateralMax=0,frontLateralWeighted=0,rearLateralWeighted=0,frontLateralWeight=0,rearLateralWeight=0,lateralForceLossMomentNm=0,frontLateralForceLossMomentNm=0,rearLateralForceLossMomentNm=0,netLateralForceN=0,frontBaselineLateralForceAbs=0,frontRetainedLateralForceAbs=0,rearBaselineLateralForceAbs=0,rearRetainedLateralForceAbs=0,trajectoryLateralCapacityScale=0;
  const brakeMagnitude=Math.abs(brakeSigned),driveMagnitude=Math.abs(driveSigned),dtSafe=Math.min(.05,Math.max(0,dt||0)),serviceBrakeAbsEnabled=vehicle?.absEnabled!==false;let absBrakeCapacityAccel=0;
  if(serviceBrakeAbsEnabled&&brakeMagnitude>.10&&!airborne){for(let axleIndex=0;axleIndex<layout.axles.length;axleIndex++){const axle=layout.axles[axleIndex],dynamicLoad=Math.max(.01,axleLoads[axleIndex]??axle.staticLoadFraction),normalLoadEquivalent=dynamicLoad+aeroLoadRatio*aerodynamicAxleShare(layout,aero,axleIndex),isRear=axle.positionM<0,axleGripScale=Math.max(.72,safeNumber(isRear?vehicle?.rearTireGripScale:vehicle?.frontTireGripScale,1));absBrakeCapacityAccel+=longitudinalSurfaceMu*GRAVITY*normalLoadEquivalent*axleGripScale*lowSpeedStaticGripBoost;}}
  const absServiceBrakeUtil=serviceBrakeAbsEnabled&&absBrakeCapacityAccel>.10?brakeMagnitude/absBrakeCapacityAccel:0;
  for(let i=0;i<count;i++){
    const fallback=fallbackWheelMeta(i),meta=contacts[i],front=meta?.front!==undefined?!!meta.front:fallback.front,side=meta?.side||fallback.side;let axleIndex=Number.isInteger(meta?.axleIndex)?meta.axleIndex:(front?0:Math.min(1,layout.axles.length-1));axleIndex=clampDynamics(axleIndex,0,layout.axles.length-1);
    const axle=layout.axles[axleIndex],staticLoad=Math.max(.02,axle.staticLoadFraction),dynamicLoad=Math.max(.01,axleLoads[axleIndex]??staticLoad),normalLoadEquivalent=dynamicLoad+aeroLoadRatio*aerodynamicAxleShare(layout,aero,axleIndex),normalizedAxleLoad=normalLoadEquivalent/totalNormalScale,axleLoadFactor=normalizedAxleLoad/staticLoad,lateralTransfer=transfers[axleIndex]||0,sideLoadFactor=side==='left'?1+lateralTransfer:1-lateralTransfer,support=airborne||meta?.contact===false?0:clampDynamics(safeNumber(meta?.contactFactor,1),.15,1),loadFactor=airborne?.05:clampDynamics(axleLoadFactor*sideLoadFactor*support,.08,1.8),isRear=axle.positionM<0||front===false,axleGripScale=Math.max(.72,safeNumber(isRear?vehicle?.rearTireGripScale:vehicle?.frontTireGripScale,1)),tireCapacityScale=Math.max(.16,Math.pow(loadFactor,.90)*axleGripScale*lowSpeedStaticGripBoost),baseLateralUtil=airborne?0:lateralDemand/tireCapacityScale,axleLongitudinalCapacityAccel=longitudinalSurfaceMu*GRAVITY*normalLoadEquivalent*axleGripScale*lowSpeedStaticGripBoost;
    let longitudinalUtil=0;if(brakeMagnitude>.10)longitudinalUtil=serviceBrakeAbsEnabled?absServiceBrakeUtil:(brakeMagnitude*Math.max(0,axle.brakeShare))/Math.max(.20,axleLongitudinalCapacityAccel);else if(driveMagnitude>.10&&Math.abs(throttle)>0)longitudinalUtil=(driveMagnitude*Math.max(0,axle.driveShare))/Math.max(.20,axleLongitudinalCapacityAccel);longitudinalUtil=clampDynamics(longitudinalUtil,0,1.35);
    const rearSlipBlend=isRear&&!airborne?rearHandbrakeSlip:0;let slidingLateralCapacity=0;if(rearSlipBlend>1e-4){const slidingLongitudinalCapacity=handbrakeSlidingMuRatio*Math.abs(Math.cos(handbrakeSideslip));slidingLateralCapacity=handbrakeSlidingMuRatio*Math.abs(Math.sin(handbrakeSideslip));longitudinalUtil=Math.max(longitudinalUtil,slidingLongitudinalCapacity*rearSlipBlend);}
    const circleLongitudinal=clampDynamics(longitudinalUtil,0,1),lateralCapacity=Math.sqrt(Math.max(0,1-circleLongitudinal*circleLongitudinal)),rollingLateralCapacity=Math.max(.12,lateralCapacity),lockedLateralCapacity=Math.max(.02,slidingLateralCapacity),usableLateralCapacity=rearSlipBlend>1e-4?rollingLateralCapacity+(lockedLateralCapacity-rollingLateralCapacity)*rearSlipBlend:rollingLateralCapacity,effectiveLateralUtil=airborne?0:baseLateralUtil/usableLateralCapacity,lateralForceScale=airborne?0:(baseLateralUtil>1e-6?clampDynamics(usableLateralCapacity/baseLateralUtil,0,1):1),wheelLoadShare=staticLoad/Math.max(1,axle.wheelCount);trajectoryLateralCapacityScale+=wheelLoadShare*tireCapacityScale*usableLateralCapacity;
    const baselineWheelLateralForceN=layout.massKg*safeNumber(signedLatAccel,0)*wheelLoadShare,retainedWheelLateralForceN=baselineWheelLateralForceN*lateralForceScale;netLateralForceN+=retainedWheelLateralForceN;const wheelLossMomentNm=baselineWheelLateralForceN*(lateralForceScale-1)*axle.positionM;lateralForceLossMomentNm+=wheelLossMomentNm;
    if(isRear){rearLateralForceLossMomentNm+=wheelLossMomentNm;rearBaselineLateralForceAbs+=Math.abs(baselineWheelLateralForceN);rearRetainedLateralForceAbs+=Math.abs(retainedWheelLateralForceN);}else{frontLateralForceLossMomentNm+=wheelLossMomentNm;frontBaselineLateralForceAbs+=Math.abs(baselineWheelLateralForceN);frontRetainedLateralForceAbs+=Math.abs(retainedWheelLateralForceN);}
    lateralUsage[i]=Math.max(0,effectiveLateralUtil);longitudinalUsage[i]=Math.max(0,longitudinalUtil);const combined=airborne?0:Math.sqrt(baseLateralUtil*baseLateralUtil+longitudinalUtil*longitudinalUtil),lockedSlipFloor=rearSlipBlend>0?.98+.30*rearSlipBlend:0;raw[i]=Math.max(Math.min(1.65,combined),lockedSlipFloor);const old=safeNumber(previousUsage[i],0),response=raw[i]>old?11:17;smoothed[i]=old+(raw[i]-old)*(1-Math.exp(-dtSafe*response));slip[i]=smoothstep01((smoothed[i]-.98)/.24);lateralSlip[i]=airborne?0:smoothstep01((effectiveLateralUtil-1.00)/.30);
    const wheelNormalLoadShare=Math.max(0,normalizedAxleLoad*sideLoadFactor*support/Math.max(1,axle.wheelCount));if(isRear){rearCombined=Math.max(rearCombined,slip[i]);rearLateralMax=Math.max(rearLateralMax,lateralSlip[i]);rearLateralWeighted+=lateralSlip[i]*wheelNormalLoadShare;rearLateralWeight+=wheelNormalLoadShare;}else{frontCombined=Math.max(frontCombined,slip[i]);frontLateralMax=Math.max(frontLateralMax,lateralSlip[i]);frontLateralWeighted+=lateralSlip[i]*wheelNormalLoadShare;frontLateralWeight+=wheelNormalLoadShare;}
  }
  const frontLateral=frontLateralWeight>1e-8?clampDynamics(frontLateralWeighted/frontLateralWeight,0,1):frontLateralMax,rearLateral=rearLateralWeight>1e-8?clampDynamics(rearLateralWeighted/rearLateralWeight,0,1):rearLateralMax;result.frontCombined=frontCombined;result.rearCombined=rearCombined;result.frontLateral=frontLateral;result.rearLateral=rearLateral;result.lowSpeedStaticGripBoost=lowSpeedStaticGripBoost;result.aeroDownforceN=aero?.downforceN||0;result.aeroLoadRatio=aeroLoadRatio;result.aeroGripScale=aero?.gripScale||1;result.longitudinalSurfaceMu=longitudinalSurfaceMu;result.tireForceAccel=tireForceAccel;result.serviceBrakeAbsEnabled=serviceBrakeAbsEnabled;result.absServiceBrakeUtil=absServiceBrakeUtil;result.handbrakeRearSlipState=rearHandbrakeSlip;result.handbrakeSlidingMuRatio=handbrakeSlidingMuRatio;result.handbrakeSideslipRad=handbrakeSideslip;result.lateralForceLossMomentNm=lateralForceLossMomentNm;result.frontLateralForceLossMomentNm=frontLateralForceLossMomentNm;result.rearLateralForceLossMomentNm=rearLateralForceLossMomentNm;result.netLateralAccel=airborne?0:netLateralForceN/Math.max(1,layout.massKg);result.frontLateralForceScale=frontBaselineLateralForceAbs>1e-6?clampDynamics(frontRetainedLateralForceAbs/frontBaselineLateralForceAbs,0,1):1;result.rearLateralForceScale=rearBaselineLateralForceAbs>1e-6?clampDynamics(rearRetainedLateralForceAbs/rearBaselineLateralForceAbs,0,1):1;result.trajectoryLateralCapacityScale=airborne?0:clampDynamics(trajectoryLateralCapacityScale,0,1.35);result.trajectoryLateralCapacityAccel=airborne?0:Math.max(0,safeNumber(latLimit,0))*result.trajectoryLateralCapacityScale;result.frictionYawAccel=airborne?0:clampDynamics(lateralForceLossMomentNm/Math.max(1,layout.yawInertiaKgM2),-6.5,6.5);return result;
}

export function laneKeepAssistCommand({speedAbs=0,headingError=0,manualInput=0,frontSlipAmount=0,rearSlipAmount=0,airborne=false,handbrake=false}={}){
  const v=Math.max(0,safeNumber(speedAbs,0)),manual=clampDynamics(safeNumber(manualInput,0),-1,1),err=clampDynamics(safeNumber(headingError,0),-.70,.70),slip=Math.max(0,safeNumber(frontSlipAmount,0),safeNumber(rearSlipAmount,0));if(airborne||handbrake||v<2)return {input:0,authority:0,driverAuthority:0,gripAuthority:0};const driverFade=clampDynamics((Math.abs(manual)-.045)/.235,0,1),driverAuthority=1-smoothstep01(driverFade),slipFade=clampDynamics((slip-.10)/.28,0,1),gripAuthority=1-smoothstep01(slipFade),speedT=smoothstep01((v-4)/30),headingGain=1.10+.45*speedT,maxAssist=.30,requested=clampDynamics(err*headingGain,-maxAssist,maxAssist),authority=driverAuthority*gripAuthority;return {input:requested*authority,authority,driverAuthority,gripAuthority};
}

export function fitWheelSupportPlane(samples=[]){
  let validCount=0,sx=0,sz=0,sy=0,sxx=0,szz=0,sxz=0,sxy=0,szy=0;for(const sample of samples){if(!Number.isFinite(sample?.localX)||!Number.isFinite(sample?.localZ)||!Number.isFinite(sample?.ground))continue;validCount++;const x=sample.localX,z=sample.localZ,y=sample.ground;sx+=x;sz+=z;sy+=y;sxx+=x*x;szz+=z*z;sxz+=x*z;sxy+=x*y;szy+=z*y;}if(validCount<3)return {slopeX:0,slopeZ:0,meanY:validCount?sy/validCount:0,pitch:0,roll:0,validCount};const n=validCount,det=sxx*(szz*n-sz*sz)-sxz*(sxz*n-sz*sx)+sx*(sxz*sz-szz*sx);let slopeX=0,slopeZ=0;if(Math.abs(det)>1e-9){const detA=sxy*(szz*n-sz*sz)-sxz*(szy*n-sz*sy)+sx*(szy*sz-szz*sy),detB=sxx*(szy*n-sz*sy)-sxy*(sxz*n-sz*sx)+sx*(sxz*sy-szy*sx);slopeX=detA/det;slopeZ=detB/det;}return {slopeX,slopeZ,meanY:sy/n,pitch:Math.atan(-slopeZ),roll:Math.atan(-slopeX),validCount:n};
}

export function yawResponseRate({vehicle,speedAbs=0,airborne=false}={}){if(airborne)return .85;const layout=vehicleLayout(vehicle),speedT=clampDynamics((Math.max(0,speedAbs)-12)/42,0,1),base=8.8-speedT*5.8,vehicleResponse=clampDynamics(safeNumber(vehicle?.yawResponseMultiplier,1),.35,1.5);return base*layout.yawResponseScale*vehicleResponse;}
export function dynamicsDiagnostics(vehicle={}){const layout=vehicleLayout(vehicle);return {massKg:layout.massKg,wheelbase:layout.wheelbase,trackWidth:layout.trackWidth,cgHeight:layout.cgHeight,yawInertiaKgM2:layout.yawInertiaKgM2,axleCount:layout.axles.length,drivenAxles:layout.axles.filter(a=>a.driveShare>1e-6).length,steerableAxles:layout.axles.filter(a=>Math.abs(a.steerFactor)>1e-6).length};}
