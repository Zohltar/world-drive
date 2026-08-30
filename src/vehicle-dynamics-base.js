// World Drive V21.21.26 — generalized vehicle dynamics + finite steering-rack travel.
//
// This module deliberately contains no Three.js or DOM dependencies. It is
// pure math so it can be stress-tested outside the renderer and reused later
// by trucks, multi-axle vehicles and articulated combinations.

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
      {
        id:'front',
        positionM:frontAxlePosition,
        staticLoadFraction:frontWeightBias,
        steerFactor:1,
        driveShare:driveFront,
        brakeShare:brakeFront,
        trackWidth,
        wheelCount:2
      },
      {
        id:'rear',
        positionM:rearAxlePosition,
        staticLoadFraction:1-frontWeightBias,
        steerFactor:0,
        driveShare:1-driveFront,
        brakeShare:1-brakeFront,
        trackWidth,
        wheelCount:2
      }
    ];
  }

  const normalizeShare=(key)=>{
    const total=axles.reduce((sum,a)=>sum+Math.max(0,a[key]),0);
    if(total<=1e-8)return;
    for(const axle of axles)axle[key]=Math.max(0,axle[key])/total;
  };

  normalizeShare('staticLoadFraction');
  normalizeShare('driveShare');
  normalizeShare('brakeShare');

  const yawInertiaKgM2=
    Math.max(
      1,
      safeNumber(
        vehicle.yawInertiaKgM2,
        massKg*(wheelbase*wheelbase+trackWidth*trackWidth)/12*yawInertiaScale
      )
    );

  const referenceYawInertia=1560*(2.65*2.65+1.56*1.56)/12*.96;
  const yawResponseScale=clampDynamics(Math.sqrt(referenceYawInertia/yawInertiaKgM2),.52,1.45);

  return {
    wheelbase,
    trackWidth,
    frontWeightBias,
    massKg,
    cgHeight,
    yawInertiaScale,
    yawInertiaKgM2,
    yawResponseScale,
    drivetrain,
    axles
  };
}


export function vehicleLayout(vehicle={}){
  if(!vehicle || (typeof vehicle!=='object'&&typeof vehicle!=='function'))return buildVehicleLayout({});
  // The renderer intentionally preserves one stable physics object while a
  // vehicle selection replaces its fields. V21.21.21 tags those rare profile
  // swaps with a revision so the hot path still performs only one scalar check
  // instead of rebuilding/re-signaturing the complete chassis every frame.
  const revision=safeNumber(vehicle?._layoutRevision,0);
  const cached=layoutCache.get(vehicle);
  if(cached&&cached.revision===revision)return cached.layout;
  const layout=buildVehicleLayout(vehicle);
  layoutCache.set(vehicle,{revision,layout});
  return layout;
}

// V21.21.21 — aerodynamic normal load. Road cars currently leave ClA at zero;
// the 2010 F1 profile supplies a period-appropriate coefficient-area target.
// Keeping this as pure math makes the aero model testable and lets future
// spoilers/trucks opt in without coupling the physics module to rendering.
function aerodynamicLoadForLayout(layout,vehicle,speedAbs=0,airborne=false,out=null){
  const result=out||{};
  const v=Math.max(0,Math.abs(safeNumber(speedAbs,0)));
  const clA=Math.max(0,safeNumber(vehicle?.aeroDownforceClA,0));
  const rho=1.225; // kg/m³, ISA sea-level reference
  const downforceN=airborne||clA<=0?0:.5*rho*v*v*clA;
  const downforceAccel=downforceN/Math.max(1,layout.massKg);
  const loadRatio=downforceAccel/GRAVITY;
  const efficiency=clampDynamics(safeNumber(vehicle?.aeroGripEfficiency,1),.35,1);
  const maxGripScale=Math.max(1,safeNumber(vehicle?.aeroGripScaleMax,4));
  const gripScale=clampDynamics(1+loadRatio*efficiency,1,maxGripScale);
  const frontBias=clampDynamics(
    safeNumber(vehicle?.aeroDownforceFrontBias,layout.frontWeightBias),
    .05,.95
  );
  result.downforceN=downforceN;
  result.downforceAccel=downforceAccel;
  result.loadRatio=loadRatio;
  result.totalNormalScale=1+loadRatio;
  result.gripScale=gripScale;
  result.frontBias=frontBias;
  result.rearBias=1-frontBias;
  result.clA=clA;
  return result;
}

export function aerodynamicLoad({vehicle,speedAbs=0,airborne=false}={},out=null){
  return aerodynamicLoadForLayout(vehicleLayout(vehicle),vehicle,speedAbs,airborne,out);
}

function aerodynamicAxleShare(layout,aero,axleIndex){
  const axle=layout.axles[axleIndex];
  if(layout.axles.length===2){
    return axle.positionM>=0?(aero?.frontBias??layout.frontWeightBias):(aero?.rearBias??(1-layout.frontWeightBias));
  }
  // No explicit multi-axle aero map yet: distribute by static vertical load.
  return Math.max(.01,axle.staticLoadFraction);
}

export function dynamicAxleLoads(vehicle,longitudinalAccel=0,out=null){
  const layout=vehicleLayout(vehicle);
  const result=out||[];
  const transfer=clampDynamics((safeNumber(longitudinalAccel,0)*layout.cgHeight)/(GRAVITY*layout.wheelbase),-.32,.32);
  if(layout.axles.length===2){
    const frontLoad=clampDynamics(layout.axles[0].staticLoadFraction-transfer,.05,.95);
    result.length=2;result[0]=frontLoad;result[1]=1-frontLoad;return result;
  }
  result.length=layout.axles.length;
  let total=0;
  for(let i=0;i<layout.axles.length;i++){
    const axle=layout.axles[i];
    const lever=clampDynamics(axle.positionM/layout.wheelbase,-1,1);
    const value=Math.max(.01,axle.staticLoadFraction-transfer*lever*2);
    result[i]=value;total+=value;
  }
  total=total||1;
  for(let i=0;i<result.length;i++)result[i]/=total;
  return result;
}


function longitudinalLimitFromLoads(layout,loads,aero,mu,mode){
  const aeroLoadRatio=aero?.loadRatio||0;
  const totalNormalScale=aero?.totalNormalScale||1;

  let limit=Infinity;
  if(layout.axles.length===2){
    const front=layout.axles[0],rear=layout.axles[1];
    const frontNormal=Math.max(.01,(loads[0]||0)+aeroLoadRatio*aerodynamicAxleShare(layout,aero,0));
    const rearNormal=Math.max(.01,(loads[1]||0)+aeroLoadRatio*aerodynamicAxleShare(layout,aero,1));
    if(mode==='brake'){
      limit=(front.brakeShare>1e-6||rear.brakeShare>1e-6)?mu*GRAVITY*totalNormalScale:0;
    }else if(mode==='handbrake'){
      const rearLoad=(front.positionM<0?frontNormal:0)+(rear.positionM<0?rearNormal:0);
      limit=mu*GRAVITY*Math.max(.05,rearLoad);
    }else{
      const d0=Math.max(0,front.driveShare),d1=Math.max(0,rear.driveShare);
      if(d0<=1e-6&&d1<=1e-6){
        limit=0;
      }else{
        let l=Infinity;
        if(d0>1e-6)l=Math.min(l,mu*GRAVITY*frontNormal/d0);
        if(d1>1e-6)l=Math.min(l,mu*GRAVITY*rearNormal/d1);
        limit=Number.isFinite(l)?l:mu*GRAVITY;
      }
    }
  }else if(mode==='brake'){
    let hasServiceBrakes=false;
    for(let i=0;i<layout.axles.length;i++){if(layout.axles[i].brakeShare>1e-6){hasServiceBrakes=true;break;}}
    limit=hasServiceBrakes?mu*GRAVITY*totalNormalScale:0;
  }else if(mode==='handbrake'){
    let rearLoad=0;
    for(let i=0;i<layout.axles.length;i++){
      if(layout.axles[i].positionM>=0)continue;
      const normal=Math.max(.01,(loads[i]||0)+aeroLoadRatio*aerodynamicAxleShare(layout,aero,i));
      rearLoad+=normal;
    }
    limit=mu*GRAVITY*Math.max(.05,rearLoad);
  }else{
    let driven=false;
    for(let i=0;i<layout.axles.length;i++){
      const share=Math.max(0,layout.axles[i].driveShare);
      if(share<=1e-6)continue;
      driven=true;
      const normal=Math.max(.01,(loads[i]||0)+aeroLoadRatio*aerodynamicAxleShare(layout,aero,i));
      const available=mu*GRAVITY*normal;
      limit=Math.min(limit,available/share);
    }
    if(!driven)limit=0;else if(!Number.isFinite(limit))limit=mu*GRAVITY;
  }
  return Math.max(0,limit);
}

export function longitudinalTractionLimit({vehicle,requestedAccel=0,surfaceMu=1,mode='drive',airborne=false,speedAbs=0}={},out=null){
  const result=out||{};
  const loads=result.axleLoads||(result.axleLoads=[]);
  const requested=safeNumber(requestedAccel,0);
  if(airborne||Math.abs(requested)<1e-8){
    dynamicAxleLoads(vehicle,0,loads);
    result.acceleration=0;result.requested=requested;result.limit=0;result.limited=Math.abs(requested)>1e-8;
    return result;
  }

  const layout=vehicleLayout(vehicle);
  const aeroEnabled=!airborne&&safeNumber(vehicle?.aeroDownforceClA,0)>0&&Math.abs(speedAbs)>.25;
  const aero=aeroEnabled
    ?aerodynamicLoadForLayout(layout,vehicle,speedAbs,false,result.aero||(result.aero={}))
    :null;
  const mu=Math.max(.05,safeNumber(surfaceMu,1));
  const requestedMagnitude=Math.abs(requested);
  const requestedSign=Math.sign(requested);

  // Service-brake capacity is the total tire normal load (ABS/EBD distributes
  // it later per wheel), so its scalar ceiling does not depend on fore/aft load
  // transfer. Avoid iterative solving on this very common path, but still
  // expose axle loads corresponding to the deceleration actually delivered.
  if(mode==='brake'){
    let hasServiceBrakes=false;
    for(let i=0;i<layout.axles.length;i++){
      if(layout.axles[i].brakeShare>1e-6){hasServiceBrakes=true;break;}
    }
    const limit=hasServiceBrakes?mu*GRAVITY*(aero?.totalNormalScale||1):0;
    const magnitude=Math.min(requestedMagnitude,Math.max(0,limit));
    const actual=requestedSign*magnitude;
    dynamicAxleLoads(vehicle,actual,loads);
    result.acceleration=actual;
    result.requested=requested;
    result.limit=limit;
    result.limited=magnitude+1e-8<requestedMagnitude;
    return result;
  }

  // First evaluate the driver's request itself. If it is physically feasible,
  // no iteration is needed. This preserves the old fast path for normal driving
  // while still correcting the pathological requested-vs-actual load-transfer
  // feedback when the tires really are traction limited.
  dynamicAxleLoads(vehicle,requested,loads);
  let limit=longitudinalLimitFromLoads(layout,loads,aero,mu,mode);
  if(requestedMagnitude<=limit+1e-8){
    result.acceleration=requested;
    result.requested=requested;
    result.limit=limit;
    result.limited=false;
    return result;
  }

  // V21.21.26 — self-consistent longitudinal load transfer. The old solver
  // computed axle load from an unattainable engine/handbrake request before
  // limiting traction. Start from the first feasible estimate, then converge
  // the tiny force/load loop only when saturation actually occurs.
  let assumedAccel=requestedSign*Math.max(0,limit);
  let actual=assumedAccel;
  for(let iteration=0;iteration<3;iteration++){
    dynamicAxleLoads(vehicle,assumedAccel,loads);
    limit=longitudinalLimitFromLoads(layout,loads,aero,mu,mode);
    actual=requestedSign*Math.min(requestedMagnitude,limit);
    if(Math.abs(actual-assumedAccel)<1e-4)break;
    assumedAccel=actual;
  }

  // Expose axle loads and limit corresponding to the force actually applied.
  dynamicAxleLoads(vehicle,actual,loads);
  limit=longitudinalLimitFromLoads(layout,loads,aero,mu,mode);
  actual=requestedSign*Math.min(requestedMagnitude,limit);

  result.acceleration=actual;
  result.requested=requested;
  result.limit=limit;
  result.limited=Math.abs(actual)+1e-8<requestedMagnitude;
  return result;
}

export function computeGradeAcceleration({onPavement=false,roadFrame=null,heading=0,airborne=false,x=0,z=0,terrainHeightAt=null,sampleDistance=3}={},out=null){
  const result=out||{};
  if(airborne){result.acceleration=0;result.pitch=0;result.grade=0;result.source='air';return result;}
  let grade=0,source='flat';
  if(onPavement&&roadFrame&&Number.isFinite(roadFrame.pitch)&&Number.isFinite(roadFrame.angle)){
    grade=Math.tan(roadFrame.pitch)*Math.cos(heading-roadFrame.angle);source='road';
  }else if(typeof terrainHeightAt==='function'){
    const d=Math.max(.5,safeNumber(sampleDistance,3));
    const sx=Math.sin(heading)*d,sz=Math.cos(heading)*d;
    const ahead=terrainHeightAt(x+sx,z+sz),behind=terrainHeightAt(x-sx,z-sz);
    if(Number.isFinite(ahead)&&Number.isFinite(behind)){grade=(ahead-behind)/(2*d);source='terrain';}
  }
  grade=clampDynamics(grade,-.55,.55);
  const pitch=Math.atan(grade);
  result.acceleration=-GRAVITY*Math.sin(pitch);result.pitch=pitch;result.grade=grade;result.source=source;
  return result;
}


const steeringAeroScratch={};

export function steeringCommand({vehicle,speedAbs=0,input=0}={},out=null){
  const result=out||{};
  const v=Math.max(0,safeNumber(speedAbs,0));
  const raw=clampDynamics(safeNumber(input,0),-1,1);
  const low=safeNumber(vehicle?.maxSteerLow,.46),high=safeNumber(vehicle?.maxSteerHigh,.16);
  const speedBlend=clampDynamics(v/32,0,1);
  // V21.21.15 — parking/hairpin steering geometry. The profile's historical
  // low-speed value was tuned for normal road driving (~25-29 deg at the
  // wheels), which leaves a 5+ m bicycle-model radius and makes very tight
  // switchbacks almost impossible from a near stop. Passenger-car steering
  // commonly reaches the mid-30-degree range at parking speed, so add that
  // missing rack travel only below neighbourhood speed and fade it completely
  // before ordinary cornering speeds.
  const parkingSteerT=1-smoothstep01(v/8.0);
  const parkingSteerBoost=clampDynamics(safeNumber(vehicle?.parkingSteerBoost,.26),0,.50);
  const parkingSteerScale=1+parkingSteerBoost*parkingSteerT;
  const lowSpeedRoadWheelAngle=low*parkingSteerScale;
  const baseRoadWheelAngle=lowSpeedRoadWheelAngle+(high-lowSpeedRoadWheelAngle)*(speedBlend*speedBlend);

  // V21.21.13 — high-speed steering stability. Above roughly 100 km/h the
  // same steering-wheel/gamepad movement must command progressively less road
  // wheel angle. This keeps the responsive low/medium-speed feel and the new
  // handbrake drift behaviour, while removing the nervous 140–200 km/h rack.
  const highSpeedAuthorityT=clampDynamics((v-27)/28,0,1);
  const highSpeedAuthoritySmooth=highSpeedAuthorityT*highSpeedAuthorityT*(3-2*highSpeedAuthorityT);
  const highSpeedAuthorityScale=1-.28*highSpeedAuthoritySmooth;
  let maxRoadWheelAngle=baseRoadWheelAngle*highSpeedAuthorityScale;

  // V21.21.24 — optional physics-aware steering envelope. On very high-grip
  // race cars the old rack map could ask for several times the available
  // lateral acceleration, so one digital full-lock input instantly saturated
  // all four tires and produced G-force/yaw spikes. Bound the maximum wheel
  // angle by a configurable fraction of the tire+aero lateral envelope. The
  // cap only limits the driver's requested geometry; it does not manufacture
  // grip and it does not apply to vehicles that omit the setting.
  const steeringGripEnvelopeFraction=clampDynamics(
    safeNumber(vehicle?.steeringGripEnvelopeFraction,0),
    0,
    1
  );
  let gripEnvelopeRoadWheelAngle=0;
  let gripEnvelopeLimited=false;
  if(steeringGripEnvelopeFraction>0&&v>4){
    const layout=vehicleLayout(vehicle);
    const aero=safeNumber(vehicle?.aeroDownforceClA,0)>0
      ?aerodynamicLoadForLayout(layout,vehicle,v,false,steeringAeroScratch)
      :null;
    const aeroGripScale=aero?.gripScale||1;
    const lateralEnvelopeAccel=
      Math.max(1,safeNumber(vehicle?.lateralAccelLimit,7))*
      aeroGripScale*
      steeringGripEnvelopeFraction;
    gripEnvelopeRoadWheelAngle=Math.atan(
      (lateralEnvelopeAccel*layout.wheelbase)/Math.max(16,v*v)
    );
    if(gripEnvelopeRoadWheelAngle<maxRoadWheelAngle){
      maxRoadWheelAngle=gripEnvelopeRoadWheelAngle;
      gripEnvelopeLimited=true;
    }
  }
  let target=raw;
  if(Math.abs(target)<.08)target=0;
  else{
    // V21.24.11 — make the progressive joystick steering curve the global
    // default for every vehicle. Profiles can still override the exponent,
    // but cars that do not specify one now get the same fine-on-centre,
    // stronger-near-lock response requested for the Countach.
    const vehicleExponent=Math.max(.75,safeNumber(vehicle?.steeringInputExponent,1.65));
    const highSpeedT=clampDynamics((v-8.3)/26.4,0,1);
    const highSpeedSmooth=highSpeedT*highSpeedT*(3-2*highSpeedT);
    target=Math.sign(target)*Math.pow(Math.abs(target),vehicleExponent+1.15*highSpeedSmooth);
  }
  const highSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseHigh,3.8));
  // Reduce only steering attack at high speed; self-centering stays quick so
  // corrections can be released immediately instead of leaving the car hung
  // on steering lock. At 100 km/h the change is tiny, reaching about -45%
  // response only at very high road speed.
  const highSpeedResponseScale=1-.45*highSpeedAuthoritySmooth;
  const lowSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseLow,5.2));
  const midSpeedResponse=Math.max(.5,safeNumber(vehicle?.steeringResponseMid,4.5));
  const lowReturnRate=Math.max(.5,safeNumber(vehicle?.steeringReturnRateLow,7.2));
  const highReturnRate=Math.max(.5,safeNumber(vehicle?.steeringReturnRateHigh,7.5));
  result.target=target;result.maxRoadWheelAngle=maxRoadWheelAngle;
  result.inputRate=v<5?lowSpeedResponse:(v>25?highSpeedResponse*highSpeedResponseScale:midSpeedResponse);
  result.returnRate=v<5?lowReturnRate:highReturnRate;

  // V21.21.25 — optional finite steering-rack travel. The value is defined as
  // centre -> full-scale requested input time, so it is easy to tune per car.
  // A 0 -> 50% joystick step takes half this time; -100% -> +100% takes twice.
  // Profiles without these fields retain the historical exponential response.
  const centerToFullTime=safeNumber(vehicle?.steeringCenterToFullTimeSec,0);
  const returnToCenterTime=safeNumber(vehicle?.steeringReturnToCenterTimeSec,centerToFullTime);
  result.inputSlewRate=centerToFullTime>1e-4?1/centerToFullTime:0;
  result.returnSlewRate=returnToCenterTime>1e-4?1/returnToCenterTime:result.inputSlewRate;
  result.centerToFullTimeSec=centerToFullTime>1e-4?centerToFullTime:0;
  result.returnToCenterTimeSec=returnToCenterTime>1e-4?returnToCenterTime:0;
  result.parkingSteerScale=parkingSteerScale;
  result.highSpeedAuthorityScale=highSpeedAuthorityScale;
  result.highSpeedResponseScale=highSpeedResponseScale;
  result.gripEnvelopeRoadWheelAngle=gripEnvelopeRoadWheelAngle;
  result.gripEnvelopeLimited=gripEnvelopeLimited?1:0;
  return result;
}



export function advanceSteeringRack({current=0,target=0,dt=0,inputSlewRate=0,returnSlewRate=0,inputRate=0,returnRate=0}={}){
  const cur=clampDynamics(safeNumber(current,0),-1,1);
  const tgt=clampDynamics(safeNumber(target,0),-1,1);
  const stepDt=Math.max(0,safeNumber(dt,0));
  const returning=Math.abs(tgt)<1e-12;
  const slew=Math.max(0,safeNumber(returning?returnSlewRate:inputSlewRate,0));
  if(slew>0&&stepDt>0){
    const delta=tgt-cur;
    const maxStep=slew*stepDt;
    if(Math.abs(delta)<=maxStep)return tgt;
    return clampDynamics(cur+Math.sign(delta)*maxStep,-1,1);
  }
  const response=Math.max(0,safeNumber(returning?returnRate:inputRate,0));
  if(response<=0||stepDt<=0)return cur;
  return clampDynamics(cur+(tgt-cur)*(1-Math.exp(-stepDt*response)),-1,1);
}

export function lateralDynamicsEnvelope({vehicle,speed=0,steerAngle=0,steerInput=0,driveThrottle=0,onPavement=true,surfaceGrip=1,awdOffroadGripBonus=1,offroadPeakMu=null,rearSlipAmount=0,airborne=false}={},out=null){
  const result=out||{};
  const layout=vehicleLayout(vehicle);
  const speedValue=safeNumber(speed,0),speedAbs=Math.abs(speedValue),drivetrain=layout.drivetrain;
  const positiveThrottle=speedValue>=0?clampDynamics(driveThrottle,0,1):0;
  const powerHandlingSpeedGate=clampDynamics((speedAbs-3)/12,0,1),steeringDemand=clampDynamics(Math.abs(steerInput),0,1);
  const powerCorneringLoad=positiveThrottle*powerHandlingSpeedGate*steeringDemand;
  const roadGripMultiplier=safeNumber(vehicle?.roadGripMultiplier,1);
  const suppliedOffroadPeak=Number(offroadPeakMu);
  const effectiveOffroadGrip=clampDynamics(
    Number.isFinite(suppliedOffroadPeak)?suppliedOffroadPeak:safeNumber(vehicle?.offroadGrip,.60),
    .18,.95
  );
  // Grip R5: steering geometry itself is not weakened by loose terrain. The
  // friction limit below decides whether the requested curvature is attainable.
  // AWD is deliberately absent here: drive layout does not raise passive Fy.
  const effectiveGrip=onPavement?safeNumber(surfaceGrip,1)*roadGripMultiplier:1;
  let yawRate=(speedValue/layout.wheelbase)*Math.tan(safeNumber(steerAngle,0))*effectiveGrip;
  if(airborne)yawRate*=.06;
  if(drivetrain==='FWD')yawRate*=1-.20*powerCorneringLoad;
  const powerOversteerGripLoss=
    drivetrain==='RWD'&&vehicle?.legacyDriftAssist!==false
      ?safeNumber(vehicle?.powerOversteerGripLoss,.07)
      :0;
  const requestedLatAccel=Math.abs(speedValue*yawRate);
  // Grip R5: continuous Coulomb-style lateral ceiling. The old 7.0 -> 3.8
  // m/s^2 branch at 10 m/s created a nonphysical handling discontinuity.
  const offroadLatLimit=effectiveOffroadGrip*GRAVITY;
  const roadLatLimit=Math.max(1,safeNumber(vehicle?.lateralAccelLimit,7));
  const baseLatLimit=onPavement?roadLatLimit:offroadLatLimit;
  const aeroEnabled=!airborne&&safeNumber(vehicle?.aeroDownforceClA,0)>0&&speedAbs>.25;
  const aero=aeroEnabled
    ?aerodynamicLoadForLayout(layout,vehicle,speedAbs,false,result.aero||(result.aero={}))
    :null;
  const rawAeroGripScale=aero?.gripScale||1;
  const aeroGripScale=onPavement?rawAeroGripScale:1+(rawAeroGripScale-1)*.55;
  const rwdPowerGripFactor=drivetrain==='RWD'?Math.max(.72,1-powerOversteerGripLoss*powerCorneringLoad):1;
  const slideGripFactor=airborne?.08:Math.max(.78,1-clampDynamics(rearSlipAmount,0,1)*.16);
  const latLimit=baseLatLimit*aeroGripScale*rwdPowerGripFactor*slideGripFactor;
  result.yawRate=yawRate;result.requestedLatAccel=requestedLatAccel;result.signedLatAccel=speedValue*yawRate;
  result.latLimit=latLimit;result.drivetrain=drivetrain;result.powerCorneringLoad=powerCorneringLoad;
  result.effectiveGrip=effectiveGrip;result.roadLatLimit=roadLatLimit;result.offroadLatLimit=offroadLatLimit;result.offroadPeakMu=effectiveOffroadGrip;
  result.aeroGripScale=aeroGripScale;result.aeroDownforceAccel=aero?.downforceAccel||0;
  return result;
}


const FALLBACK_WHEEL_META=[
  {front:false,side:'left',axleIndex:1},
  {front:true,side:'left',axleIndex:0},
  {front:false,side:'right',axleIndex:1},
  {front:true,side:'right',axleIndex:0}
];
function fallbackWheelMeta(index){
  return FALLBACK_WHEEL_META[index]||{
    front:index%2===1,
    side:index%4<2?'left':'right',
    axleIndex:index%2===1?0:1
  };
}

export function estimateWheelGripUsage({requestedLatAccel,signedLatAccel,latLimit,longitudinalAccel,propulsionAccel=null,serviceBrakeAccel=null,surfaceMu=1,throttle,handbrake,handbrakeSlipState=null,sideslipRad=0,airborne,vehicle,speedAbs=null,dt,contacts=[],previousUsage=[]}={},out=null){
  const result=out||{};
  const layout=vehicleLayout(vehicle),count=Math.max(4,contacts.length||0);
  const lateralDemand=latLimit>0?Math.max(0,requestedLatAccel/latLimit):0;
  const tireSpeed=Math.max(0,safeNumber(speedAbs,50));
  const rearHandbrakeSlip=airborne?0:clampDynamics(safeNumber(handbrakeSlipState,handbrake?1:0),0,1);
  // Sliding tires operate below peak/static mu. Configurable per vehicle.
  const handbrakeSlidingMuRatio=clampDynamics(safeNumber(vehicle?.handbrakeSlidingMuRatio,.72),.65,.90);
  const handbrakeSideslip=Math.min(Math.PI*.5,Math.abs(safeNumber(sideslipRad,0)));
  const aeroEnabled=!airborne&&safeNumber(vehicle?.aeroDownforceClA,0)>0&&tireSpeed>.25;
  const aero=aeroEnabled
    ?aerodynamicLoadForLayout(layout,vehicle,tireSpeed,false,result.aero||(result.aero={}))
    :null;
  const aeroLoadRatio=aero?.loadRatio||0;
  const totalNormalScale=Math.max(1,aero?.totalNormalScale||1);
  // V21.21.14 — the drift model exposed a low-speed weakness in the old
  // normalized tire loads. Near walking/parking speeds a tiny transient wheel
  // unloading could consume almost the entire friction budget, even though a
  // real tire is still in its static/no-slip region. Give all four tires a
  // modest static-friction reserve that fades out by normal road speed.
  const lowSpeedGripT=clampDynamics((tireSpeed-2.5)/6.0,0,1);
  const lowSpeedStaticGripBoost=1+.18*(1-lowSpeedGripT);
  const explicitBrake=Number(serviceBrakeAccel),explicitDrive=Number(propulsionAccel);
  const fallbackNetAccel=safeNumber(longitudinalAccel,0);
  const driveSigned=Number.isFinite(explicitDrive)?explicitDrive:(throttle?Math.max(0,fallbackNetAccel):0);
  const brakeSigned=Number.isFinite(explicitBrake)?explicitBrake:(!throttle&&fallbackNetAccel<0?fallbackNetAccel:0);
  // V21.21.15 — load transfer must be driven by tire forces, not by the final
  // chassis acceleration. Grade and rolling resistance are external forces;
  // feeding them back into the axle-load model created false unloading on
  // slopes and was especially visible off road.
  const tireForceAccel=driveSigned+brakeSigned;
  const axleLoads=result.axleLoads||(result.axleLoads=[]);
  dynamicAxleLoads(vehicle,tireForceAccel,axleLoads);
  const longitudinalSurfaceMu=Math.max(.12,safeNumber(surfaceMu,1));
  const transfers=result._lateralTransfer||(result._lateralTransfer=[]);transfers.length=layout.axles.length;
  for(let i=0;i<layout.axles.length;i++)transfers[i]=clampDynamics((safeNumber(signedLatAccel,0)*layout.cgHeight)/(GRAVITY*Math.max(.8,layout.axles[i].trackWidth)),-.45,.45);
  const raw=result.raw||(result.raw=[]),smoothed=result.smoothed||(result.smoothed=[]),slip=result.slip||(result.slip=[]);
  const lateralSlip=result.lateralSlip||(result.lateralSlip=[]),lateralUsage=result.lateralUsage||(result.lateralUsage=[]),longitudinalUsage=result.longitudinalUsage||(result.longitudinalUsage=[]);
  raw.length=smoothed.length=slip.length=lateralSlip.length=lateralUsage.length=longitudinalUsage.length=count;
  let frontCombined=0,rearCombined=0,frontLateralMax=0,rearLateralMax=0;
  let frontLateralWeighted=0,rearLateralWeighted=0,frontLateralWeight=0,rearLateralWeight=0;
  // V21.21.11 — accumulate the *change* in axle lateral force caused by the
  // friction circle. The bicycle steering model already represents the balanced
  // cornering state, so only the lost-force moment is added as yaw acceleration.
  // This is what makes a locked rear axle rotate the chassis instead of merely
  // drawing skid marks while the car keeps following the same trajectory.
  let lateralForceLossMomentNm=0;
  let frontLateralForceLossMomentNm=0;
  let rearLateralForceLossMomentNm=0;
  let netLateralForceN=0;
  let frontBaselineLateralForceAbs=0,frontRetainedLateralForceAbs=0;
  let rearBaselineLateralForceAbs=0,rearRetainedLateralForceAbs=0;
  // V21.21.17 — physical lateral authority left after longitudinal tire load.
  // This is intentionally separate from the current steering demand: a car
  // landing sideways still has a finite amount of tire force available to bend
  // its momentum vector, and braking must REDUCE that authority rather than
  // making the trajectory snap to the chassis heading.
  let trajectoryLateralCapacityScale=0;
  const brakeMagnitude=Math.abs(brakeSigned);
  const driveMagnitude=Math.abs(driveSigned);
  const dtSafe=Math.min(.05,Math.max(0,dt||0));

  // V21.21.17 — road cars use ABS/EBD by default. The previous service-brake
  // accounting forced the fixed 62/38 brake bias onto the dynamically loaded
  // axles. Under a 1 g stop the WRX rear axle could therefore report >130%
  // longitudinal utilization while the front was only around 75%. Besides
  // being an unrealistic rear lockup for an ABS-equipped road car, that
  // imbalance fed the yaw model. With ABS/EBD, distribute braking so all
  // contacted axles operate at approximately the same friction utilization.
  const serviceBrakeAbsEnabled=vehicle?.absEnabled!==false;
  let absBrakeCapacityAccel=0;
  if(serviceBrakeAbsEnabled&&brakeMagnitude>.10&&!airborne){
    for(let axleIndex=0;axleIndex<layout.axles.length;axleIndex++){
      const axle=layout.axles[axleIndex];
      const dynamicLoad=Math.max(.01,axleLoads[axleIndex]??axle.staticLoadFraction);
      const normalLoadEquivalent=
        dynamicLoad+aeroLoadRatio*aerodynamicAxleShare(layout,aero,axleIndex);
      const isRear=axle.positionM<0;
      const axleGripScale=Math.max(.72,safeNumber(isRear?vehicle?.rearTireGripScale:vehicle?.frontTireGripScale,1));
      absBrakeCapacityAccel+=
        longitudinalSurfaceMu*GRAVITY*normalLoadEquivalent*axleGripScale*lowSpeedStaticGripBoost;
    }
  }
  const absServiceBrakeUtil=
    serviceBrakeAbsEnabled&&absBrakeCapacityAccel>.10
      ?brakeMagnitude/absBrakeCapacityAccel
      :0;

  for(let i=0;i<count;i++){
    const fallback=fallbackWheelMeta(i),meta=contacts[i];
    const front=meta?.front!==undefined?!!meta.front:fallback.front,side=meta?.side||fallback.side;
    let axleIndex=Number.isInteger(meta?.axleIndex)?meta.axleIndex:(front?0:Math.min(1,layout.axles.length-1));
    axleIndex=clampDynamics(axleIndex,0,layout.axles.length-1);
    const axle=layout.axles[axleIndex],staticLoad=Math.max(.02,axle.staticLoadFraction),dynamicLoad=Math.max(.01,axleLoads[axleIndex]??staticLoad);
    const normalLoadEquivalent=
      dynamicLoad+aeroLoadRatio*aerodynamicAxleShare(layout,aero,axleIndex);
    // Global lateral capacity already includes the aero grip gain. Normalize
    // axle load by total normal load here so aero is not counted twice; this
    // term only redistributes capacity front/rear and left/right.
    const normalizedAxleLoad=normalLoadEquivalent/totalNormalScale;
    const axleLoadFactor=normalizedAxleLoad/staticLoad,lateralTransfer=transfers[axleIndex]||0,sideLoadFactor=side==='left'?1+lateralTransfer:1-lateralTransfer;
    const support=airborne||meta?.contact===false?0:clampDynamics(safeNumber(meta?.contactFactor,1),.15,1);
    const loadFactor=airborne?.05:clampDynamics(axleLoadFactor*sideLoadFactor*support,.08,1.8);
    const isRear=axle.positionM<0||front===false;
    // Real tires are load-sensitive: doubling vertical load gives less than
    // double cornering capacity. The previous linear normalization also made
    // a lightly loaded inside tire unrealistically fragile. A 0.90 exponent
    // keeps weight transfer meaningful without letting one wheel dominate the
    // four-tire balance. Front/rear scales are symmetric left-to-right so the
    // car cannot acquire an artificial steering pull.
    const axleGripScale=Math.max(.72,safeNumber(isRear?vehicle?.rearTireGripScale:vehicle?.frontTireGripScale,1));
    const tireCapacityScale=
      Math.max(.16,Math.pow(loadFactor,.90)*axleGripScale*lowSpeedStaticGripBoost);
    const baseLateralUtil=airborne?0:lateralDemand/tireCapacityScale;
    let longitudinalUtil=0;
    // V21.21.15 — normalize propulsion/braking against the ACTUAL friction
    // capacity of this axle (mu * g * dynamic axle load). The previous shortcut
    // normalized against the vehicle's engine/brake rating, so modest throttle
    // could consume far too much of the friction circle and the error became
    // worse on dirt. This keeps weak acceleration in static adhesion while a
    // genuinely traction-limited axle can still reach 100% utilization.
    const axleLongitudinalCapacityAccel=
      longitudinalSurfaceMu*GRAVITY*normalLoadEquivalent*axleGripScale*lowSpeedStaticGripBoost;
    if(brakeMagnitude>.10){
      longitudinalUtil=
        serviceBrakeAbsEnabled
          ?absServiceBrakeUtil
          :(brakeMagnitude*Math.max(0,axle.brakeShare))/
            Math.max(.20,axleLongitudinalCapacityAccel);
    }else if(driveMagnitude>.10&&Math.abs(throttle)>0){
      longitudinalUtil=
        (driveMagnitude*Math.max(0,axle.driveShare))/
        Math.max(.20,axleLongitudinalCapacityAccel);
    }
    longitudinalUtil=clampDynamics(longitudinalUtil,0,1.35);

    // Grip R1 — kinetic friction opposes contact-patch slip velocity. A locked
    // rear tire therefore retains a sideslip-dependent lateral component rather
    // than an arbitrary 6% floor. Rolling -> sliding is blended continuously.
    const rearSlipBlend=isRear&&!airborne?rearHandbrakeSlip:0;
    let slidingLateralCapacity=0;
    if(rearSlipBlend>1e-4){
      const slidingLongitudinalCapacity=handbrakeSlidingMuRatio*Math.abs(Math.cos(handbrakeSideslip));
      slidingLateralCapacity=handbrakeSlidingMuRatio*Math.abs(Math.sin(handbrakeSideslip));
      longitudinalUtil=Math.max(longitudinalUtil,slidingLongitudinalCapacity*rearSlipBlend);
    }
    const circleLongitudinal=clampDynamics(longitudinalUtil,0,1);
    const lateralCapacity=Math.sqrt(Math.max(0,1-circleLongitudinal*circleLongitudinal));
    const rollingLateralCapacity=Math.max(.12,lateralCapacity);
    const lockedLateralCapacity=Math.max(.02,slidingLateralCapacity);
    const usableLateralCapacity=rearSlipBlend>1e-4
      ?rollingLateralCapacity+(lockedLateralCapacity-rollingLateralCapacity)*rearSlipBlend
      :rollingLateralCapacity;
    const effectiveLateralUtil=airborne?0:baseLateralUtil/usableLateralCapacity;

    // The old V21.21.10 implementation stopped at effectiveLateralUtil. That
    // correctly detected rear tire saturation, but the vehicle kinematics never
    // received the resulting axle-force imbalance. Convert the remaining tire
    // capacity into an actual force scale and accumulate only the force that was
    // lost versus the already-balanced bicycle model.
    const lateralForceScale=
      airborne
        ?0
        :(baseLateralUtil>1e-6
          ?clampDynamics(usableLateralCapacity/baseLateralUtil,0,1)
          :1);
    const wheelLoadShare=staticLoad/Math.max(1,axle.wheelCount);
    trajectoryLateralCapacityScale+=
      wheelLoadShare*
      tireCapacityScale*
      usableLateralCapacity;
    const baselineWheelLateralForceN=
      layout.massKg*safeNumber(signedLatAccel,0)*wheelLoadShare;
    const retainedWheelLateralForceN=
      baselineWheelLateralForceN*lateralForceScale;
    netLateralForceN+=retainedWheelLateralForceN;
    const wheelLossMomentNm=
      baselineWheelLateralForceN*
      (lateralForceScale-1)*
      axle.positionM;
    lateralForceLossMomentNm+=wheelLossMomentNm;
    if(isRear){
      rearLateralForceLossMomentNm+=wheelLossMomentNm;
      rearBaselineLateralForceAbs+=Math.abs(baselineWheelLateralForceN);
      rearRetainedLateralForceAbs+=Math.abs(retainedWheelLateralForceN);
    }else{
      frontLateralForceLossMomentNm+=wheelLossMomentNm;
      frontBaselineLateralForceAbs+=Math.abs(baselineWheelLateralForceN);
      frontRetainedLateralForceAbs+=Math.abs(retainedWheelLateralForceN);
    }

    lateralUsage[i]=Math.max(0,effectiveLateralUtil);longitudinalUsage[i]=Math.max(0,longitudinalUtil);
    const combined=airborne?0:Math.sqrt(baseLateralUtil*baseLateralUtil+longitudinalUtil*longitudinalUtil);
    const lockedSlipFloor=rearSlipBlend>0?.98+.30*rearSlipBlend:0;
    raw[i]=Math.max(Math.min(1.65,combined),lockedSlipFloor);
    const old=safeNumber(previousUsage[i],0),response=raw[i]>old?11:17;
    smoothed[i]=old+(raw[i]-old)*(1-Math.exp(-dtSafe*response));
    slip[i]=smoothstep01((smoothed[i]-.98)/.24);lateralSlip[i]=airborne?0:smoothstep01((effectiveLateralUtil-1.00)/.30);

    // V21.21.16 — axle breakaway is load-weighted instead of taking the worst
    // single tire. In a hard turn the lightly loaded inside tire may saturate
    // first; that does not mean the entire axle has instantly lost all grip.
    // Per-wheel skid levels stay untouched for decals/audio.
    const wheelNormalLoadShare=
      Math.max(0,normalizedAxleLoad*sideLoadFactor*support/Math.max(1,axle.wheelCount));
    if(isRear){
      rearCombined=Math.max(rearCombined,slip[i]);
      rearLateralMax=Math.max(rearLateralMax,lateralSlip[i]);
      rearLateralWeighted+=lateralSlip[i]*wheelNormalLoadShare;
      rearLateralWeight+=wheelNormalLoadShare;
    }else{
      frontCombined=Math.max(frontCombined,slip[i]);
      frontLateralMax=Math.max(frontLateralMax,lateralSlip[i]);
      frontLateralWeighted+=lateralSlip[i]*wheelNormalLoadShare;
      frontLateralWeight+=wheelNormalLoadShare;
    }
  }
  const frontLateral=
    frontLateralWeight>1e-8
      ?clampDynamics(frontLateralWeighted/frontLateralWeight,0,1)
      :frontLateralMax;
  const rearLateral=
    rearLateralWeight>1e-8
      ?clampDynamics(rearLateralWeighted/rearLateralWeight,0,1)
      :rearLateralMax;
  result.frontCombined=frontCombined;result.rearCombined=rearCombined;result.frontLateral=frontLateral;result.rearLateral=rearLateral;
  result.lowSpeedStaticGripBoost=lowSpeedStaticGripBoost;
  result.aeroDownforceN=aero?.downforceN||0;
  result.aeroLoadRatio=aeroLoadRatio;
  result.aeroGripScale=aero?.gripScale||1;
  result.longitudinalSurfaceMu=longitudinalSurfaceMu;
  result.tireForceAccel=tireForceAccel;
  result.serviceBrakeAbsEnabled=serviceBrakeAbsEnabled;
  result.absServiceBrakeUtil=absServiceBrakeUtil;
  result.handbrakeRearSlipState=rearHandbrakeSlip;
  result.handbrakeSlidingMuRatio=handbrakeSlidingMuRatio;
  result.handbrakeSideslipRad=handbrakeSideslip;
  // Positive signed lateral acceleration with rear grip loss produces positive
  // yaw acceleration; front grip loss produces the opposite (understeer). Cap
  // only pathological spikes — ordinary handbrake turns remain well below it.
  result.lateralForceLossMomentNm=lateralForceLossMomentNm;
  result.frontLateralForceLossMomentNm=frontLateralForceLossMomentNm;
  result.rearLateralForceLossMomentNm=rearLateralForceLossMomentNm;
  result.netLateralAccel=
    airborne
      ?0
      :netLateralForceN/Math.max(1,layout.massKg);
  result.frontLateralForceScale=
    frontBaselineLateralForceAbs>1e-6
      ?clampDynamics(frontRetainedLateralForceAbs/frontBaselineLateralForceAbs,0,1)
      :1;
  result.rearLateralForceScale=
    rearBaselineLateralForceAbs>1e-6
      ?clampDynamics(rearRetainedLateralForceAbs/rearBaselineLateralForceAbs,0,1)
      :1;
  result.trajectoryLateralCapacityScale=
    airborne
      ?0
      :clampDynamics(trajectoryLateralCapacityScale,0,1.35);
  result.trajectoryLateralCapacityAccel=
    airborne
      ?0
      :Math.max(0,safeNumber(latLimit,0))*result.trajectoryLateralCapacityScale;

  // Keep the full physical front+rear loss moment available to diagnostics.
  // The renderer/main integration decides whether an opposing front-loss
  // moment should act as understeer damping or be allowed to reverse yaw.
  result.frictionYawAccel=
    airborne
      ?0
      :clampDynamics(
          lateralForceLossMomentNm/Math.max(1,layout.yawInertiaKgM2),
          -6.5,
          6.5
        );
  return result;
}


// V21.21.17 — limit how quickly tire forces are allowed to rotate the
// vehicle's momentum vector. The old trajectory-follow heuristic could rotate
// velocity by many radians/second after a sideways landing; worse, service
// braking could still use that synthetic alignment and feel like extra grip.
// A tire can only bend the velocity vector at a_lat / v.
export function limitMomentumHeadingDelta({
  attemptedDelta=0,
  speedAbs=0,
  lateralCapacityAccel=0,
  dt=0,
  airborne=false
}={}){
  const desired=safeNumber(attemptedDelta,0);
  if(airborne||Math.abs(desired)<1e-12)return 0;
  const step=Math.max(0,safeNumber(dt,0));
  if(step<=0)return 0;
  const v=Math.max(1.25,Math.abs(safeNumber(speedAbs,0)));
  const aLat=Math.max(0,safeNumber(lateralCapacityAccel,0));
  const maxDelta=(aLat/v)*step;
  return clampDynamics(desired,-maxDelta,maxDelta);
}


// V21.21.19 — lane keeping expressed as a steering request, never as a
// position/heading teleport. The caller supplies the heading error to a
// preview point in the desired lane. Driver input always has priority, and the
// assist fades away during genuine tire slip so it cannot act like stability
// control or manufacture grip.
export function laneKeepAssistCommand({
  speedAbs=0,
  headingError=0,
  manualInput=0,
  frontSlipAmount=0,
  rearSlipAmount=0,
  airborne=false,
  handbrake=false
}={}){
  const v=Math.max(0,safeNumber(speedAbs,0));
  const manual=clampDynamics(safeNumber(manualInput,0),-1,1);
  const err=clampDynamics(safeNumber(headingError,0),-.70,.70);
  const slip=Math.max(
    0,
    safeNumber(frontSlipAmount,0),
    safeNumber(rearSlipAmount,0)
  );

  if(airborne||handbrake||v<2){
    return {input:0,authority:0,driverAuthority:0,gripAuthority:0};
  }

  // Full help around the steering dead-zone, then rapidly hand control back to
  // the driver. At ~0.28 manual input the assist is completely gone.
  const driverFade=clampDynamics((Math.abs(manual)-.045)/.235,0,1);
  const driverAuthority=1-smoothstep01(driverFade);

  // Do not fight a drift or a saturated axle. The tire model, not lane assist,
  // decides whether the car can recover.
  const slipFade=clampDynamics((slip-.10)/.28,0,1);
  const gripAuthority=1-smoothstep01(slipFade);

  // Slightly more preview authority at road speed, but cap the contribution
  // to less than one third of full steering input.
  const speedT=smoothstep01((v-4)/30);
  const headingGain=1.10+.45*speedT;
  const maxAssist=.30;
  const requested=clampDynamics(err*headingGain,-maxAssist,maxAssist);
  const authority=driverAuthority*gripAuthority;

  return {
    input:requested*authority,
    authority,
    driverAuthority,
    gripAuthority
  };
}


export function fitWheelSupportPlane(samples=[]){
  let validCount=0;
  let sx=0,sz=0,sy=0,sxx=0,szz=0,sxz=0,sxy=0,szy=0;
  for(const sample of samples){
    if(!Number.isFinite(sample?.localX)||!Number.isFinite(sample?.localZ)||!Number.isFinite(sample?.ground))continue;
    validCount++;
    const x=sample.localX;
    const z=sample.localZ;
    const y=sample.ground;
    sx+=x;sz+=z;sy+=y;
    sxx+=x*x;szz+=z*z;sxz+=x*z;
    sxy+=x*y;szy+=z*y;
  }
  if(validCount<3){
    return {slopeX:0,slopeZ:0,meanY:validCount?sy/validCount:0,pitch:0,roll:0,validCount};
  }
  const n=validCount;
  const det=
    sxx*(szz*n-sz*sz)-
    sxz*(sxz*n-sz*sx)+
    sx*(sxz*sz-szz*sx);
  let slopeX=0,slopeZ=0;
  if(Math.abs(det)>1e-9){
    const detA=
      sxy*(szz*n-sz*sz)-
      sxz*(szy*n-sz*sy)+
      sx*(szy*sz-szz*sy);
    const detB=
      sxx*(szy*n-sz*sy)-
      sxy*(sxz*n-sz*sx)+
      sx*(sxz*sy-szy*sx);
    slopeX=detA/det;
    slopeZ=detB/det;
  }
  return {
    slopeX,
    slopeZ,
    meanY:sy/n,
    pitch:Math.atan(-slopeZ),
    roll:Math.atan(-slopeX),
    validCount:n
  };
}

export function yawResponseRate({
  vehicle,
  speedAbs=0,
  airborne=false
}={}){
  if(airborne)return .85;
  const layout=vehicleLayout(vehicle);
  const speedT=clampDynamics((Math.max(0,speedAbs)-12)/42,0,1);
  const base=8.8-speedT*5.8;
  const vehicleResponse=clampDynamics(safeNumber(vehicle?.yawResponseMultiplier,1),.35,1.5);
  return base*layout.yawResponseScale*vehicleResponse;
}

export function dynamicsDiagnostics(vehicle={}){
  const layout=vehicleLayout(vehicle);
  return {
    massKg:layout.massKg,
    wheelbase:layout.wheelbase,
    trackWidth:layout.trackWidth,
    cgHeight:layout.cgHeight,
    yawInertiaKgM2:layout.yawInertiaKgM2,
    axleCount:layout.axles.length,
    drivenAxles:layout.axles.filter(a=>a.driveShare>1e-6).length,
    steerableAxles:layout.axles.filter(a=>Math.abs(a.steerFactor)>1e-6).length
  };
}
