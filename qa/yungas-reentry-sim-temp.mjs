import assert from 'node:assert/strict';
import {createRoutingService} from '../src/routing-service.js';
import {YUNGAS_START,YUNGAS_END,YUNGAS_WAYPOINTS} from '../src/route-presets.js';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicle-system.js';
import {
  steeringCommand,
  advanceSteeringRack,
  lateralDynamicsEnvelope,
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
  travelAxisSideslip
} from '../src/driving-runtime-base.js';

const EARTH=6378137;
const DEG=Math.PI/180;
const DT=1/60;
const REENTRY_T=2.70;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function normAngle(a){return Math.atan2(Math.sin(a),Math.cos(a));}
function angleDelta(target,current){return normAngle(target-current);}
function geoDist(a,b){
  const R=6371000,p1=a.lat*DEG,p2=b.lat*DEG;
  const dp=(b.lat-a.lat)*DEG,dl=(b.lon-a.lon)*DEG;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
function toWorld(origin,lat,lon){
  return {x:(lon-origin.lon)*DEG*EARTH*Math.cos(origin.lat*DEG),z:-(lat-origin.lat)*DEG*EARTH};
}
function buildSegments(coordinates,origin){
  const segments=[];let routeLength=0,last=null;
  for(const [lon,lat] of coordinates){
    const p=toWorld(origin,lat,lon);
    if(last){
      const len=Math.hypot(p.x-last.x,p.z-last.z);
      if(len>.03){
        segments.push({ax:last.x,az:last.z,bx:p.x,bz:p.z,len,cum:routeLength,angle:Math.atan2(p.x-last.x,p.z-last.z)});
        routeLength+=len;
      }
    }
    last=p;
  }
  return {segments,routeLength};
}
function routePointAtCum(segments,routeLength,cum){
  const c=clamp(cum,0,Math.max(0,routeLength-.001));
  let lo=0,hi=segments.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(segments[mid].cum<=c)lo=mid;else hi=mid-1;}
  const s=segments[lo];
  const t=clamp((c-s.cum)/Math.max(.001,s.len),0,1);
  return {x:s.ax+(s.bx-s.ax)*t,z:s.az+(s.bz-s.az)*t,angle:s.angle,cum:c,index:lo};
}
function curvatureDeg30(segments,routeLength,cum){
  const a=routePointAtCum(segments,routeLength,cum-15);
  const b=routePointAtCum(segments,routeLength,cum+15);
  return Math.abs(angleDelta(b.angle,a.angle))/DEG;
}
function chooseAnchorBands(segments,routeLength){
  const samples=[];
  for(let c=routeLength*.08;c<routeLength*.92;c+=30)samples.push({cum:c,deg30:curvatureDeg30(segments,routeLength,c)});
  const pick=(label,target,min,max)=>{
    const candidates=samples.filter(s=>s.deg30>=min&&s.deg30<=max);
    const pool=candidates.length?candidates:samples;
    const best=pool.slice().sort((a,b)=>Math.abs(a.deg30-target)-Math.abs(b.deg30-target))[0];
    return {...best,label};
  };
  return [
    pick('mild',4,0,8),
    pick('medium',16,9,28),
    pick('tight',55,35,85)
  ];
}
function contactsFor(vehicle){
  const out=[];
  for(let axleIndex=0;axleIndex<vehicle.axles.length;axleIndex++){
    const axle=vehicle.axles[axleIndex];
    const count=Math.max(2,Number(axle.wheelCount)||2);
    const perSide=Math.max(1,Math.round(count/2));
    for(const side of ['left','right'])for(let i=0;i<perSide;i++)out.push({
      front:Number(axle.positionM)>=0,side,axleIndex,contact:true,contactFactor:1,
      localX:(side==='left'?-1:1)*(Number(axle.trackWidth)||Number(vehicle.trackWidth)||1.55)/2,
      localZ:Number(axle.positionM)||0
    });
  }
  return out;
}

const scenarios=[
  {id:'fwd-30-clean-tight',kmh:30,direction:1,anchor:'tight',baseInput:.28,excursionInput:.34,returnInput:.38,driftDeg:0},
  {id:'fwd-55-clean-medium',kmh:55,direction:1,anchor:'medium',baseInput:.20,excursionInput:.32,returnInput:.36,driftDeg:0},
  {id:'fwd-90-clean-mild',kmh:90,direction:1,anchor:'mild',baseInput:.12,excursionInput:.52,returnInput:.56,driftDeg:0},
  {id:'fwd-120-clean-mild',kmh:120,direction:1,anchor:'mild',baseInput:.10,excursionInput:.58,returnInput:.62,driftDeg:0},
  {id:'fwd-75-drift-medium',kmh:75,direction:1,anchor:'medium',baseInput:.16,excursionInput:.50,returnInput:.62,driftDeg:16},
  {id:'rev-15-clean-mild',kmh:15,direction:-1,anchor:'mild',baseInput:.10,excursionInput:.34,returnInput:.38,driftDeg:0},
  {id:'rev-12-drift-mild',kmh:12,direction:-1,anchor:'mild',baseInput:.08,excursionInput:.32,returnInput:.42,driftDeg:13}
];

function driverInputAt(t,scenario,side){
  const base=scenario.baseInput;
  if(t<.85)return base;
  if(t<1.45)return clamp(base+side*scenario.excursionInput,-.72,.72);
  if(t<2.25)return base*.45;
  if(t<2.70)return clamp(base-side*scenario.returnInput,-.72,.72);
  if(t<3.25)return clamp(base-side*scenario.returnInput*.65,-.72,.72);
  if(t<3.80)return base*.60;
  return base;
}
function onRoadAt(t){return t<.92||t>=REENTRY_T;}

const routing=createRoutingService({distance:geoDist,onStatus:()=>{},onLoadingText:()=>{}});
const routed=await routing.fetchRoute({points:[YUNGAS_START,...YUNGAS_WAYPOINTS,YUNGAS_END],start:YUNGAS_START});
assert.ok(routed.coordinates.length>50,'Yungas route did not load');
const {segments,routeLength}=buildSegments(routed.coordinates,YUNGAS_START);
assert.ok(routeLength>5000&&segments.length>50,'Yungas route geometry too sparse');
const anchors=chooseAnchorBands(segments,routeLength);
const anchorByLabel=Object.fromEntries(anchors.map(a=>[a.label,a]));

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));
const system=createVehicleSystem({initialId:'wrx'});
const fleet=system.list();
const results=[];

for(const info of fleet){
  if(system.activeId!==info.id)system.select(info.id);
  const vehicle=system.physics;
  const contacts=contactsFor(vehicle);
  const dirt=offroadTireFriction({vehicleId:info.id,vehicle});
  const topKmh=Math.max(40,Number(vehicle.topSpeedKmh)||180);
  const reverseTop=Math.max(10,Number(vehicle.reverseTopSpeedKmh)||30);

  for(let sIndex=0;sIndex<scenarios.length;sIndex++){
    const scenario=scenarios[sIndex];
    const anchor=anchorByLabel[scenario.anchor];
    const start=routePointAtCum(segments,routeLength,anchor.cum);
    const side=sIndex%2===0?1:-1;
    let speedKmh=scenario.direction>0?Math.min(scenario.kmh,topKmh*.88):Math.min(scenario.kmh,reverseTop*.9);
    speedKmh=Math.max(scenario.direction>0?24:8,speedKmh);
    let speed=scenario.direction*speedKmh/3.6;
    let heading=start.angle;
    let velocityHeading=heading;
    let dynamicYawRate=0;
    let steer=0;
    let driftInjected=false;
    const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});

    let maxSideslip=0,maxYaw=0,maxUtil=0,maxInput=0,maxSteerAngle=0;
    let reentryPeakSideslip=0,reentryPeakYaw=0,recoveryAt=null,nonFinite=0;
    const initialSign=Math.sign(speed);
    let minSpeedAbs=Math.abs(speed);

    for(let frame=0;frame<Math.round(6.2/DT);frame++){
      const t=frame*DT;
      const onRoad=onRoadAt(t);
      if(scenario.driftDeg>0&&!driftInjected&&t>=2.48){
        velocityHeading=normAngle(velocityHeading+side*scenario.driftDeg*DEG);
        dynamicYawRate+=side*(scenario.direction>0?.24:.15);
        driftInjected=true;
      }

      const rawInput=driverInputAt(t,scenario,side);
      maxInput=Math.max(maxInput,Math.abs(rawInput));
      const steeringModel=steeringCommand({vehicle,speedAbs:Math.abs(speed),input:rawInput},{});
      steer=advanceSteeringRack({
        current:steer,target:steeringModel.target,dt:DT,
        inputSlewRate:steeringModel.inputSlewRate,returnSlewRate:steeringModel.returnSlewRate,
        inputRate:steeringModel.inputRate,returnRate:steeringModel.returnRate
      });
      const steerAngle=steer*steeringModel.maxRoadWheelAngle;
      maxSteerAngle=Math.max(maxSteerAngle,Math.abs(steerAngle));
      const steeringSpeed=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:false});
      const lat=lateralDynamicsEnvelope({
        vehicle,speed:steeringSpeed,steerAngle,steerInput:steer,driveThrottle:0,
        onPavement:onRoad,surfaceGrip:1,offroadPeakMu:dirt.peak,rearSlipAmount:0,airborne:false
      },{});
      const signedLat=Number(lat.signedLatAccel)||0;
      const latLimit=Math.max(.1,Number(lat.latLimit)||1);
      const physicalSignedLat=Math.sign(signedLat||steerAngle||1)*Math.min(Math.abs(signedLat),latLimit);
      const physics=solver.advance(DT,{
        vehicleId:info.id,vehicle,contacts,speed,heading,velocityHeading,yawRate:dynamicYawRate,
        centerSteerAngle:steerAngle,longitudinalAccel:0,lateralAccel:physicalSignedLat,
        requestedDriveAccel:0,requestedBrakeAccel:0,handbrake:false,
        surfaceId:onRoad?'asphalt-dry':'dirt'
      });

      const peakUtil=Math.max(0,...(physics.wheels||[]).map(w=>Number(w.utilization)||0));
      maxUtil=Math.max(maxUtil,peakUtil);
      const forceCoupledSlide=clamp((peakUtil-.90)/.75,0,1);
      const sideslip=travelAxisSideslip({heading,velocityHeading});
      maxSideslip=Math.max(maxSideslip,sideslip);
      if(t>=REENTRY_T)reentryPeakSideslip=Math.max(reentryPeakSideslip,sideslip);
      const driftScale=driftKinematicCoupling({sideslipRad:sideslip,forceCoupledSlide});
      const physicalAuthority=driftTireForceAuthority({sideslipRad:sideslip,forceCoupledSlide});
      const targetYaw=Number(lat.yawRate)||0;
      const physicalYawAccel=Number(physics.predictedYawAccel)||0;
      const response=yawResponseRate({vehicle,speedAbs:Math.abs(speed),airborne:false});
      dynamicYawRate+=physicalYawAccel*physicalAuthority*DT;
      dynamicYawRate+=(targetYaw-dynamicYawRate)*(1-Math.exp(-DT*response*driftScale*(1-.85*physicalAuthority)));
      dynamicYawRate=clamp(dynamicYawRate,-2.4,2.4);
      heading=normAngle(heading+dynamicYawRate*DT);
      maxYaw=Math.max(maxYaw,Math.abs(dynamicYawRate));
      if(t>=REENTRY_T)reentryPeakYaw=Math.max(reentryPeakYaw,Math.abs(dynamicYawRate));

      const physicalTrajectoryYaw=tireForceTrajectoryYawRate({
        bodyVx:physics.bodyVx,bodyVz:physics.bodyVz,
        accelX:physics.predictedAccelX,accelZ:physics.predictedAccelZ
      });
      const offroad=onRoad?{momentumYawRate:0,speedDecel:0}:offroadSideslipFriction({
        speed,heading,velocityHeading,slideMu:dirt.slide,airborne:false
      });
      let attemptedDelta=offroad.momentumYawRate*DT;
      const forceDominated=physicalAuthority>.12||driftScale<.88;
      if(forceDominated){
        const signedReference=Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5;
        const legacyTrajectoryYaw=physicalSignedLat/signedReference;
        attemptedDelta+=blendDriftForce(legacyTrajectoryYaw,physicalTrajectoryYaw,physicalAuthority)*DT;
      }else{
        const target=bodyRelativeMomentumTargetHeading({speed,heading,velocityHeading});
        const followRate=onRoad?22:10;
        attemptedDelta+=angleDelta(target,velocityHeading)*(1-Math.exp(-DT*followRate));
      }
      velocityHeading=normAngle(velocityHeading+limitMomentumHeadingDelta({
        attemptedDelta,speedAbs:Math.abs(speed),lateralCapacityAccel:latLimit,dt:DT,airborne:false
      }));

      if(!onRoad&&offroad.speedDecel>0){
        const dv=Math.min(Math.abs(speed)*.08,offroad.speedDecel*DT);
        speed-=Math.sign(speed||1)*dv;
      }
      minSpeedAbs=Math.min(minSpeedAbs,Math.abs(speed));

      const nowSlip=travelAxisSideslip({heading,velocityHeading});
      if(t>=REENTRY_T&&recoveryAt===null&&nowSlip<(scenario.driftDeg?8:5)*DEG&&Math.abs(dynamicYawRate)<18*DEG)recoveryAt=t;
      for(const n of [speed,heading,velocityHeading,dynamicYawRate,physics.predictedAccelX,physics.predictedAccelZ,physics.predictedYawAccel])if(!Number.isFinite(n))nonFinite++;
      if(nonFinite)break;
    }

    const finalSideslip=travelAxisSideslip({heading,velocityHeading});
    const recoverySec=recoveryAt===null?null:recoveryAt-REENTRY_T;
    let status='PASS';
    const notes=[];
    if(nonFinite){status='FAIL';notes.push('non-finite state');}
    if(Math.sign(speed)!==initialSign&&Math.abs(speed)>.05){status='FAIL';notes.push('unexpected direction flip');}
    if(scenario.driftDeg===0&&maxSideslip>28*DEG){status='WARN';notes.push('clean excursion exceeded 28° sideslip');}
    if(scenario.driftDeg===0&&finalSideslip>8*DEG){status='WARN';notes.push('clean re-entry retained >8° sideslip');}
    if(scenario.driftDeg>0&&finalSideslip>12*DEG){status='WARN';notes.push('drift re-entry retained >12° sideslip');}
    if(recoverySec===null){status='WARN';notes.push('did not settle before simulation end');}
    if(recoverySec!==null&&recoverySec>2.5){status='WARN';notes.push('slow re-entry recovery >2.5 s');}
    if(maxUtil>25){status='WARN';notes.push('very high transient tire utilization');}

    results.push({
      vehicle:info.id,scenario:scenario.id,status,anchor:anchor.label,
      anchor_curve_deg30:+anchor.deg30.toFixed(1),start_kmh:+speedKmh.toFixed(1),
      min_kmh:+(minSpeedAbs*3.6).toFixed(1),max_input:+maxInput.toFixed(2),
      max_steer_deg:+(maxSteerAngle/DEG).toFixed(2),max_sideslip_deg:+(maxSideslip/DEG).toFixed(1),
      reentry_peak_sideslip_deg:+(reentryPeakSideslip/DEG).toFixed(1),final_sideslip_deg:+(finalSideslip/DEG).toFixed(1),
      max_yaw_deg_s:+(maxYaw/DEG).toFixed(1),reentry_peak_yaw_deg_s:+(reentryPeakYaw/DEG).toFixed(1),
      max_wheel_util:+maxUtil.toFixed(2),recovery_s:recoverySec===null?null:+recoverySec.toFixed(2),notes:notes.join('; ')
    });
  }
}

assert.equal(results.some(r=>r.status==='FAIL'),false,'numerical failure in controlled Yungas matrix');
const summary={
  route_provider:routed.provider,route_km:+(routeLength/1000).toFixed(1),route_points:routed.coordinates.length,
  anchors:anchors.map(a=>({label:a.label,cum_km:+(a.cum/1000).toFixed(1),curve_deg30:+a.deg30.toFixed(1)})),
  runs:results.length,pass:results.filter(r=>r.status==='PASS').length,warn:results.filter(r=>r.status==='WARN').length,fail:results.filter(r=>r.status==='FAIL').length
};
console.log('YUNGAS CONTROLLED OFFROAD / REENTRY SUMMARY');
console.log(JSON.stringify(summary,null,2));
console.table(results.map(({notes,...r})=>r));
const warnings=results.filter(r=>r.status!=='PASS');
console.log('YUNGAS CONTROLLED WARNINGS');
console.log(JSON.stringify(warnings,null,2));
