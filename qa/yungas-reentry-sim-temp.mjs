import assert from 'node:assert/strict';
import {createRoutingService} from '../src/routing-service.js';
import {YUNGAS_START,YUNGAS_END,YUNGAS_WAYPOINTS} from '../src/route-presets.js';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicle-system.js';
import {
  steeringCommand,
  advanceSteeringRack,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage,
  yawResponseRate,
  limitMomentumHeadingDelta
} from '../src/vehicle-dynamics.js';
import {createPerWheelShadowSolver} from '../src/physics/per-wheel-shadow-solver.js';
import {
  driftTireForceAuthority,
  tireForceTrajectoryYawRate,
  blendDriftForce
} from '../src/physics/drift-force-coupling.js';
import {
  bodyRelativeMomentumTargetHeading,
  bodyRelativeSteeringSpeed,
  driftKinematicCoupling,
  offroadSideslipFriction,
  offroadTireFriction,
  rearContactPatchSideslip,
  travelAxisSideslip
} from '../src/driving-runtime-base.js';

const EARTH=6378137;
const DEG=Math.PI/180;
const DT=1/60;
const G=9.80665;
const REENTRY_T=2.55;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function smooth01(v){const t=clamp(Number(v)||0,0,1);return t*t*(3-2*t);}
function normAngle(a){return Math.atan2(Math.sin(a),Math.cos(a));}
function angleDelta(target,current){return normAngle(target-current);}
function geoDist(a,b){
  const R=6371000,p1=a.lat*DEG,p2=b.lat*DEG;
  const dp=(b.lat-a.lat)*DEG,dl=(b.lon-a.lon)*DEG;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
function toWorld(origin,lat,lon){return {x:(lon-origin.lon)*DEG*EARTH*Math.cos(origin.lat*DEG),z:-(lat-origin.lat)*DEG*EARTH};}
function buildSegments(coordinates,origin){
  const segments=[];let routeLength=0,last=null;
  for(const [lon,lat] of coordinates){
    const p=toWorld(origin,lat,lon);
    if(last){
      const len=Math.hypot(p.x-last.x,p.z-last.z);
      if(len>.03){segments.push({ax:last.x,az:last.z,bx:p.x,bz:p.z,len,cum:routeLength,angle:Math.atan2(p.x-last.x,p.z-last.z)});routeLength+=len;}
    }
    last=p;
  }
  return {segments,routeLength};
}
function routePointAtCum(segments,routeLength,cum){
  const c=clamp(cum,0,Math.max(0,routeLength-.001));
  let lo=0,hi=segments.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(segments[mid].cum<=c)lo=mid;else hi=mid-1;}
  const s=segments[lo],t=clamp((c-s.cum)/Math.max(.001,s.len),0,1);
  return {x:s.ax+(s.bx-s.ax)*t,z:s.az+(s.bz-s.az)*t,angle:s.angle,cum:c,index:lo};
}
function curvatureDeg30(segments,routeLength,cum){
  const a=routePointAtCum(segments,routeLength,cum-15),b=routePointAtCum(segments,routeLength,cum+15);
  return Math.abs(angleDelta(b.angle,a.angle))/DEG;
}
function chooseAnchorBands(segments,routeLength){
  const samples=[];
  for(let c=routeLength*.08;c<routeLength*.92;c+=30)samples.push({cum:c,deg30:curvatureDeg30(segments,routeLength,c)});
  const pick=(label,target,min,max)=>{
    const matching=samples.filter(s=>s.deg30>=min&&s.deg30<=max);
    const pool=matching.length?matching:samples;
    return {...pool.slice().sort((a,b)=>Math.abs(a.deg30-target)-Math.abs(b.deg30-target))[0],label};
  };
  return [pick('mild',4,0,8),pick('medium',16,9,28),pick('tight',55,35,85)];
}
function contactsFor(vehicle){
  const out=[];
  for(let axleIndex=0;axleIndex<vehicle.axles.length;axleIndex++){
    const axle=vehicle.axles[axleIndex];
    const perSide=Math.max(1,Math.round((Number(axle.wheelCount)||2)/2));
    for(const side of ['left','right'])for(let i=0;i<perSide;i++)out.push({
      front:Number(axle.positionM)>=0,side,axleIndex,contact:true,contactFactor:1,
      localX:(side==='left'?-1:1)*(Number(axle.trackWidth)||Number(vehicle.trackWidth)||1.55)/2,
      localZ:Number(axle.positionM)||0
    });
  }
  return out;
}

const scenarios=[
  {id:'fwd-30-clean-tight',kmh:30,direction:1,anchor:'tight',base:.16,out:.22,back:.26,driftDeg:0},
  {id:'fwd-55-clean-medium',kmh:55,direction:1,anchor:'medium',base:.11,out:.20,back:.24,driftDeg:0},
  {id:'fwd-90-clean-mild',kmh:90,direction:1,anchor:'mild',base:.06,out:.26,back:.30,driftDeg:0},
  {id:'fwd-120-clean-mild',kmh:120,direction:1,anchor:'mild',base:.04,out:.30,back:.34,driftDeg:0},
  {id:'fwd-75-drift-medium',kmh:75,direction:1,anchor:'medium',base:.09,out:.26,back:.34,driftDeg:15},
  {id:'rev-15-clean-mild',kmh:15,direction:-1,anchor:'mild',base:.07,out:.18,back:.22,driftDeg:0},
  {id:'rev-12-drift-mild',kmh:12,direction:-1,anchor:'mild',base:.06,out:.17,back:.23,driftDeg:12}
];
function driverInputAt(t,s,side){
  if(t<.75)return s.base;
  if(t<1.35)return clamp(s.base+side*s.out,-.55,.55);
  if(t<2.05)return s.base*.4;
  if(t<2.55)return clamp(s.base-side*s.back,-.55,.55);
  if(t<3.05)return clamp(s.base-side*s.back*.6,-.55,.55);
  if(t<3.55)return s.base*.45;
  return s.base;
}
function onRoadAt(t){return t<.86||t>=REENTRY_T;}

const routing=createRoutingService({distance:geoDist,onStatus:()=>{},onLoadingText:()=>{}});
const routed=await routing.fetchRoute({points:[YUNGAS_START,...YUNGAS_WAYPOINTS,YUNGAS_END],start:YUNGAS_START});
assert.ok(routed.coordinates.length>50,'Yungas route did not load');
const {segments,routeLength}=buildSegments(routed.coordinates,YUNGAS_START);
const anchors=chooseAnchorBands(segments,routeLength);
const anchorByLabel=Object.fromEntries(anchors.map(a=>[a.label,a]));

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));
const system=createVehicleSystem({initialId:'wrx'});
const results=[];

for(const info of system.list()){
  if(system.activeId!==info.id)system.select(info.id);
  const vehicle=system.physics;
  const contacts=contactsFor(vehicle);
  const dirt=offroadTireFriction({vehicleId:info.id,vehicle});
  const topKmh=Math.max(40,Number(vehicle.topSpeedKmh)||180);
  const reverseTop=Math.max(10,Number(vehicle.reverseTopSpeedKmh)||30);

  for(let si=0;si<scenarios.length;si++){
    const s=scenarios[si],anchor=anchorByLabel[s.anchor];
    const side=si%2===0?1:-1;
    let speedKmh=s.direction>0?Math.min(s.kmh,topKmh*.88):Math.min(s.kmh,reverseTop*.9);
    speedKmh=Math.max(s.direction>0?24:8,speedKmh);
    let speed=s.direction*speedKmh/3.6;
    let heading=routePointAtCum(segments,routeLength,anchor.cum).angle;
    let velocityHeading=heading,dynamicYawRate=0,steer=0;
    let frontSlipAmount=0,rearSlipAmount=0;
    let wheelGripUsage=new Array(contacts.length).fill(0);
    let driftInjected=false;
    const shadow=createPerWheelShadowSolver({hz:120,maxSubSteps:8});

    let maxSideslip=0,reentryPeakSideslip=0,maxYaw=0,reentryPeakYaw=0,maxUtil=0,maxInput=0,maxSteer=0;
    let recoveryAt=null,nonFinite=0,minSpeedAbs=Math.abs(speed);
    const initialSign=Math.sign(speed);

    for(let frame=0;frame<Math.round(6.2/DT);frame++){
      const t=frame*DT,onRoad=onRoadAt(t),speedAbs=Math.abs(speed);
      if(s.driftDeg&&!driftInjected&&t>=2.34){
        velocityHeading=normAngle(velocityHeading+side*s.driftDeg*DEG);
        dynamicYawRate+=side*(s.direction>0?.20:.12);
        driftInjected=true;
      }

      const rawInput=driverInputAt(t,s,side);
      maxInput=Math.max(maxInput,Math.abs(rawInput));
      const steerModel=steeringCommand({vehicle,speedAbs,input:rawInput},{});
      steer=advanceSteeringRack({current:steer,target:steerModel.target,dt:DT,inputSlewRate:steerModel.inputSlewRate,returnSlewRate:steerModel.returnSlewRate,inputRate:steerModel.inputRate,returnRate:steerModel.returnRate});
      if(steerModel.target===0&&Math.abs(steer)<.008)steer=0;
      const steerAngle=steer*steerModel.maxRoadWheelAngle;
      maxSteer=Math.max(maxSteer,Math.abs(steerAngle));

      const steeringSpeed=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:false});
      const lat=lateralDynamicsEnvelope({vehicle,speed:steeringSpeed,steerAngle,steerInput:steer,driveThrottle:0,onPavement:onRoad,surfaceGrip:1,awdOffroadGripBonus:vehicle.drivetrain==='AWD'?1.18:1,offroadPeakMu:dirt.peak,rearSlipAmount:0,airborne:false},{});
      let targetYaw=Number(lat.yawRate)||0;
      const requestedLat=Math.max(0,Number(lat.requestedLatAccel)||0);
      const latLimit=Math.max(.1,Number(lat.latLimit)||1);
      const signedLat=Number(lat.signedLatAccel)||0;
      const physicalSignedLat=Math.sign(signedLat||steerAngle||1)*Math.min(Math.abs(signedLat),latLimit);

      const currentSideslip=travelAxisSideslip({heading,velocityHeading});
      const rearTireSideslip=rearContactPatchSideslip({speed,heading,velocityHeading,yawRate:dynamicYawRate,wheelbase:vehicle.wheelbase,frontWeightBias:vehicle.frontWeightBias});
      const longitudinalMu=onRoad
        ?Math.max(.25,(Number(vehicle.longitudinalAccelLimit)||Number(vehicle.brake)||9.8)/G)
        :Math.max(.22,(Number(vehicle.offroadGrip)||.60)*(vehicle.drivetrain==='AWD'?1.18:1));
      const perGrip=estimateWheelGripUsage({
        requestedLatAccel:Math.min(requestedLat,latLimit),
        signedLatAccel:Math.sign(signedLat||steerAngle||1)*Math.min(requestedLat,latLimit),
        latLimit,longitudinalAccel:0,propulsionAccel:0,serviceBrakeAccel:0,
        surfaceMu:longitudinalMu,throttle:0,handbrake:false,handbrakeSlipState:0,
        sideslipRad:rearTireSideslip,airborne:false,vehicle,speedAbs,contacts,
        previousUsage:wheelGripUsage,dt:DT
      },{});
      wheelGripUsage=[...(perGrip.smoothed||[])];
      const targetFront=Number(perGrip.frontLateral)||0,targetRear=Number(perGrip.rearLateral)||0;
      const slipDt=Math.min(.05,DT);
      const lowRelease=1+(1-clamp(speedAbs/8,0,1))*1.6;
      frontSlipAmount+=(targetFront-frontSlipAmount)*(1-Math.exp(-slipDt*(targetFront>frontSlipAmount?7.8:5.8*lowRelease)));
      rearSlipAmount+=(targetRear-rearSlipAmount)*(1-Math.exp(-slipDt*(targetRear>rearSlipAmount?7.8:5.8*lowRelease)));

      let frictionYawAccel=Number(perGrip.frictionYawAccel)||0;
      const rearScale=Number.isFinite(Number(perGrip.rearLateralForceScale))?clamp(Number(perGrip.rearLateralForceScale),0,1):1;
      const rearLoss=Math.abs(physicalSignedLat)>.15?1-rearScale:0;
      const frictionYawLoss=clamp(Math.abs(frictionYawAccel)/4.5,0,1);
      const forceCoupledSlide=clamp(Math.max(frictionYawLoss,rearLoss),0,1);
      const fourWheelSlide=Math.min(frontSlipAmount,rearSlipAmount);
      const frontDominance=Math.max(0,frontSlipAmount-rearSlipAmount*.55);
      targetYaw*=Math.max(.46,1-frontDominance*.54-fourWheelSlide*.24);
      const driftScale=driftKinematicCoupling({sideslipRad:currentSideslip,forceCoupledSlide});
      const physicalAuthority=driftTireForceAuthority({sideslipRad:currentSideslip,forceCoupledSlide});

      const physics=shadow.advance(DT,{vehicleId:info.id,vehicle,contacts,speed,heading,velocityHeading,yawRate:dynamicYawRate,centerSteerAngle:steerAngle,longitudinalAccel:0,lateralAccel:physicalSignedLat,requestedDriveAccel:0,requestedBrakeAccel:0,handbrake:false,surfaceId:onRoad?'asphalt-dry':'dirt'});
      const physicalYawAccel=Number.isFinite(Number(physics.predictedYawAccel))?Number(physics.predictedYawAccel):frictionYawAccel;
      const authoritativeYawAccel=blendDriftForce(frictionYawAccel,physicalYawAccel,physicalAuthority);
      const response=yawResponseRate({vehicle,speedAbs,airborne:false});
      const yawGripScale=driftScale*(1-.85*physicalAuthority);
      dynamicYawRate+=authoritativeYawAccel*DT;
      dynamicYawRate+=(targetYaw-dynamicYawRate)*(1-Math.exp(-DT*response*yawGripScale));
      dynamicYawRate=clamp(dynamicYawRate,-2.6,2.6);
      heading=normAngle(heading+dynamicYawRate*DT);

      const physicalTrajectoryYaw=tireForceTrajectoryYawRate({bodyVx:physics.bodyVx,bodyVz:physics.bodyVz,accelX:physics.predictedAccelX,accelZ:physics.predictedAccelZ});
      const trajectoryRearSlip=Math.max(0,rearSlipAmount-frontSlipAmount*.45);
      const lowSpeedNoSlip=speedAbs<8.5&&forceCoupledSlide<.18&&frontSlipAmount<.16&&rearSlipAmount<.16;
      const momentumTarget=bodyRelativeMomentumTargetHeading({speed,heading,velocityHeading});
      let attempted=0;
      const offroad=onRoad?{momentumYawRate:0,speedDecel:0}:offroadSideslipFriction({speed,heading,velocityHeading,slideMu:dirt.slide,airborne:false});
      if(!onRoad)attempted+=offroad.momentumYawRate*DT;
      if(lowSpeedNoSlip){
        const follow=34+(1-clamp((speedAbs-2.5)/6,0,1))*48;
        attempted+=angleDelta(momentumTarget,velocityHeading)*(1-Math.exp(-DT*follow));
      }else{
        const forceDominated=speedAbs>4&&(physicalAuthority>.12||forceCoupledSlide>.10||driftScale<.88);
        if(forceDominated){
          const signedReference=Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5;
          const legacyTrajectory=(Number(perGrip.netLateralAccel)||physicalSignedLat)/signedReference;
          attempted+=blendDriftForce(legacyTrajectory,physicalTrajectoryYaw,physicalAuthority)*DT;
        }else{
          const followRate=(2.8-1.45*frictionYawLoss)+27.2*Math.pow(1-clamp(trajectoryRearSlip,0,1),2);
          attempted+=angleDelta(momentumTarget,velocityHeading)*(1-Math.exp(-DT*followRate));
        }
      }
      const trajectoryCapacity=Number.isFinite(Number(perGrip.trajectoryLateralCapacityAccel))?Math.max(0,Number(perGrip.trajectoryLateralCapacityAccel)):latLimit;
      velocityHeading=normAngle(velocityHeading+limitMomentumHeadingDelta({attemptedDelta:attempted,speedAbs,lateralCapacityAccel:trajectoryCapacity,dt:DT,airborne:false}));

      if(!onRoad&&offroad.speedDecel>0){
        const dv=Math.min(Math.abs(speed)*.06,offroad.speedDecel*DT);
        speed-=Math.sign(speed||1)*dv;
      }
      minSpeedAbs=Math.min(minSpeedAbs,Math.abs(speed));
      const nowSlip=travelAxisSideslip({heading,velocityHeading});
      maxSideslip=Math.max(maxSideslip,nowSlip);maxYaw=Math.max(maxYaw,Math.abs(dynamicYawRate));
      if(t>=REENTRY_T){reentryPeakSideslip=Math.max(reentryPeakSideslip,nowSlip);reentryPeakYaw=Math.max(reentryPeakYaw,Math.abs(dynamicYawRate));}
      maxUtil=Math.max(maxUtil,...(perGrip.smoothed||[0]).map(v=>Number(v)||0));
      if(t>=REENTRY_T&&recoveryAt===null&&nowSlip<(s.driftDeg?8:5)*DEG&&Math.abs(dynamicYawRate)<18*DEG)recoveryAt=t;
      for(const n of [speed,heading,velocityHeading,dynamicYawRate,physics.predictedAccelX,physics.predictedAccelZ,physics.predictedYawAccel])if(!Number.isFinite(n))nonFinite++;
      if(nonFinite)break;
    }

    const finalSideslip=travelAxisSideslip({heading,velocityHeading});
    const recoverySec=recoveryAt===null?null:recoveryAt-REENTRY_T;
    let status='PASS';const notes=[];
    if(nonFinite){status='FAIL';notes.push('non-finite state');}
    if(Math.sign(speed)!==initialSign&&Math.abs(speed)>.05){status='FAIL';notes.push('unexpected direction flip');}
    if(s.driftDeg===0&&finalSideslip>8*DEG){status='WARN';notes.push('clean re-entry retained >8° sideslip');}
    if(s.driftDeg>0&&finalSideslip>12*DEG){status='WARN';notes.push('drift re-entry retained >12° sideslip');}
    if(recoverySec===null){status='WARN';notes.push('did not settle before end');}
    if(recoverySec!==null&&recoverySec>2.5){status='WARN';notes.push('recovery >2.5 s');}

    results.push({vehicle:info.id,scenario:s.id,status,anchor:anchor.label,curve_deg30:+anchor.deg30.toFixed(1),start_kmh:+speedKmh.toFixed(1),min_kmh:+(minSpeedAbs*3.6).toFixed(1),max_input:+maxInput.toFixed(2),max_steer_deg:+(maxSteer/DEG).toFixed(2),max_sideslip_deg:+(maxSideslip/DEG).toFixed(1),reentry_peak_sideslip_deg:+(reentryPeakSideslip/DEG).toFixed(1),final_sideslip_deg:+(finalSideslip/DEG).toFixed(1),max_yaw_deg_s:+(maxYaw/DEG).toFixed(1),reentry_peak_yaw_deg_s:+(reentryPeakYaw/DEG).toFixed(1),max_filtered_grip:+maxUtil.toFixed(2),recovery_s:recoverySec===null?null:+recoverySec.toFixed(2),notes:notes.join('; ')});
  }
}

assert.equal(results.some(r=>r.status==='FAIL'),false,'numerical failure in runtime-path Yungas matrix');
const summary={route_provider:routed.provider,route_km:+(routeLength/1000).toFixed(1),route_points:routed.coordinates.length,anchors:anchors.map(a=>({label:a.label,cum_km:+(a.cum/1000).toFixed(1),curve_deg30:+a.deg30.toFixed(1)})),runs:results.length,pass:results.filter(r=>r.status==='PASS').length,warn:results.filter(r=>r.status==='WARN').length,fail:results.filter(r=>r.status==='FAIL').length};
console.log('YUNGAS RUNTIME-PATH OFFROAD / REENTRY SUMMARY');
console.log(JSON.stringify(summary,null,2));
console.table(results.map(({notes,...r})=>r));
console.log('YUNGAS RUNTIME-PATH WARNINGS');
console.log(JSON.stringify(results.filter(r=>r.status!=='PASS'),null,2));
