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
const ROAD_HALF_WIDTH=4.25;

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
        const angle=Math.atan2(p.x-last.x,p.z-last.z);
        segments.push({ax:last.x,az:last.z,bx:p.x,bz:p.z,len,cum:routeLength,angle});
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
function nearestRouteLocal(segments,x,z,hint=0){
  const first=Math.max(0,hint-90),last=Math.min(segments.length-1,hint+90);
  let best=null,bd=Infinity;
  for(let i=first;i<=last;i++){
    const s=segments[i],vx=s.bx-s.ax,vz=s.bz-s.az,vv=vx*vx+vz*vz||1;
    const t=clamp(((x-s.ax)*vx+(z-s.az)*vz)/vv,0,1);
    const px=s.ax+vx*t,pz=s.az+vz*t,d2=(x-px)**2+(z-pz)**2;
    if(d2<bd){bd=d2;best={i,t,px,pz,d:Math.sqrt(d2),cum:s.cum+t*s.len,angle:s.angle};}
  }
  return best;
}
function curvatureAt(segments,routeLength,cum){
  const a=routePointAtCum(segments,routeLength,cum-18);
  const b=routePointAtCum(segments,routeLength,cum+18);
  return Math.abs(angleDelta(b.angle,a.angle))/36;
}
function chooseAnchors(segments,routeLength){
  const samples=[];
  for(let c=routeLength*.08;c<routeLength*.92;c+=35)samples.push({cum:c,curve:curvatureAt(segments,routeLength,c)});
  samples.sort((a,b)=>b.curve-a.curve);
  const selected=[];
  for(const s of samples){
    if(selected.every(x=>Math.abs(x.cum-s.cum)>900)){selected.push(s);if(selected.length===2)break;}
  }
  selected.push({cum:routeLength*.52,curve:curvatureAt(segments,routeLength,routeLength*.52)});
  return selected.slice(0,3).map((x,i)=>({...x,label:i===0?'hairpin-A':i===1?'hairpin-B':'mid-route'}));
}
function contactsFor(vehicle){
  const out=[];
  for(let axleIndex=0;axleIndex<vehicle.axles.length;axleIndex++){
    const axle=vehicle.axles[axleIndex];
    const count=Math.max(2,Number(axle.wheelCount)||2);
    const perSide=Math.max(1,Math.round(count/2));
    for(const side of ['left','right'])for(let n=0;n<perSide;n++){
      out.push({
        front:axle.positionM>=0,
        side,axleIndex,contact:true,contactFactor:1,
        localX:(side==='left'?-1:1)*(Number(axle.trackWidth)||Number(vehicle.trackWidth)||1.55)/2,
        localZ:Number(axle.positionM)||0
      });
    }
  }
  return out;
}
function stageTargetOffset(t,side){
  if(t<.65)return 0;
  if(t<1.75)return side*8.2;
  if(t<2.85)return side*9.0;
  if(t<4.25)return 0;
  return 0;
}

const scenarios=[
  {id:'fwd-35-clean',kmh:35,direction:1,driftDeg:0,anchor:2},
  {id:'fwd-70-clean',kmh:70,direction:1,driftDeg:0,anchor:1},
  {id:'fwd-110-clean',kmh:110,direction:1,driftDeg:0,anchor:0},
  {id:'fwd-90-drift',kmh:90,direction:1,driftDeg:18,anchor:0},
  {id:'rev-18-clean',kmh:18,direction:-1,driftDeg:0,anchor:2},
  {id:'rev-15-drift',kmh:15,direction:-1,driftDeg:15,anchor:1}
];

const routing=createRoutingService({distance:geoDist,onStatus:()=>{},onLoadingText:()=>{}});
const points=[YUNGAS_START,...YUNGAS_WAYPOINTS,YUNGAS_END];
const routed=await routing.fetchRoute({points,start:YUNGAS_START});
assert.ok(routed.coordinates.length>50,'Yungas route did not load');
const {segments,routeLength}=buildSegments(routed.coordinates,YUNGAS_START);
assert.ok(routeLength>5000&&segments.length>50,'Yungas route geometry too sparse');
const anchors=chooseAnchors(segments,routeLength);

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));
const system=createVehicleSystem({initialId:'wrx'});
const fleet=system.list();
const results=[];

for(const info of fleet){
  if(system.activeId!==info.id)system.select(info.id);
  const vehicle=system.physics;
  const contacts=contactsFor(vehicle);
  const tireDirt=offroadTireFriction({vehicleId:info.id,vehicle});
  const topKmh=Math.max(40,Number(vehicle.topSpeedKmh)||180);
  const reverseTop=Math.max(10,Number(vehicle.reverseTopSpeedKmh)||32);

  for(let sIndex=0;sIndex<scenarios.length;sIndex++){
    const scenario=scenarios[sIndex];
    const anchor=anchors[scenario.anchor%anchors.length];
    const start=routePointAtCum(segments,routeLength,anchor.cum);
    const exitSide=(sIndex%2===0)?1:-1;
    let speedKmh=scenario.direction>0?Math.min(scenario.kmh,topKmh*.82):Math.min(scenario.kmh,reverseTop*.90);
    speedKmh=Math.max(scenario.direction>0?24:8,speedKmh);
    let speed=scenario.direction*speedKmh/3.6;
    let x=start.x,z=start.z,heading=start.angle,velocityHeading=heading,dynamicYawRate=0,steer=0;
    let nearest={i:start.index,cum:start.cum,d:0,angle:start.angle,px:start.x,pz:start.z};
    const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
    let lateralAccel=0;
    let leftRoad=false,reentered=false,reentryAt=null,recoveredAt=null,driftInjected=false;
    let maxOffroad=0,maxSideslip=0,maxYaw=0,maxUtil=0,maxSteerInput=0,transitions=0,nonFinite=0;
    let prevOnRoad=true;
    let minSpeedAbs=Math.abs(speed),maxSpeedAbs=Math.abs(speed);

    for(let frame=0;frame<Math.round(6.5/DT);frame++){
      const t=frame*DT;
      nearest=nearestRouteLocal(segments,x,z,nearest.i);
      const onRoad=nearest.d<=ROAD_HALF_WIDTH;
      if(onRoad!==prevOnRoad){transitions++;prevOnRoad=onRoad;}
      if(!onRoad){leftRoad=true;maxOffroad=Math.max(maxOffroad,nearest.d);}
      if(leftRoad&&onRoad&&!reentered){reentered=true;reentryAt=t;}

      if(scenario.driftDeg>0&&!driftInjected&&t>=2.72){
        velocityHeading=normAngle(velocityHeading+exitSide*scenario.driftDeg*DEG);
        dynamicYawRate+=exitSide*(scenario.direction>0?.34:.22);
        driftInjected=true;
      }

      const direction=Math.sign(speed||scenario.direction||1);
      const lookAhead=clamp(Math.abs(speed)*.52+6,8,30);
      const targetCum=nearest.cum+(direction>0?1:-1)*lookAhead;
      const target=routePointAtCum(segments,routeLength,targetCum);
      const offset=stageTargetOffset(t,exitSide);
      const rightX=-Math.cos(target.angle),rightZ=Math.sin(target.angle);
      const tx=target.x+rightX*offset,tz=target.z+rightZ*offset;
      const desiredTravel=Math.atan2(tx-x,tz-z);
      const desiredChassis=direction>0?desiredTravel:normAngle(desiredTravel+Math.PI);
      const hErr=angleDelta(desiredChassis,heading);
      const gain=clamp(3.0+Math.abs(speed)*.055,3.2,5.8);
      const rawInput=clamp(hErr*gain,-1,1);
      maxSteerInput=Math.max(maxSteerInput,Math.abs(rawInput));
      const steeringModel=steeringCommand({vehicle,speedAbs:Math.abs(speed),input:rawInput},{});
      steer=advanceSteeringRack({
        current:steer,target:steeringModel.target,dt:DT,
        inputSlewRate:steeringModel.inputSlewRate,returnSlewRate:steeringModel.returnSlewRate,
        inputRate:steeringModel.inputRate,returnRate:steeringModel.returnRate
      });
      const steerAngle=steer*steeringModel.maxRoadWheelAngle;
      const steeringTravelSpeed=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:false});
      const lat=lateralDynamicsEnvelope({
        vehicle,speed:steeringTravelSpeed,steerAngle,steerInput:steer,
        driveThrottle:0,onPavement:onRoad,surfaceGrip:1,offroadPeakMu:tireDirt.peak,
        rearSlipAmount:0,airborne:false
      },{});
      const signedLat=Number(lat.signedLatAccel)||0;
      const latLimit=Math.max(.1,Number(lat.latLimit)||1);
      const physicalSignedLat=Math.sign(signedLat||steerAngle||1)*Math.min(Math.abs(signedLat),latLimit);
      const physics=solver.advance(DT,{
        vehicleId:info.id,vehicle,contacts,speed,heading,velocityHeading,
        yawRate:dynamicYawRate,centerSteerAngle:steerAngle,longitudinalAccel:0,lateralAccel:physicalSignedLat,
        requestedDriveAccel:0,requestedBrakeAccel:0,handbrake:false,
        surfaceId:onRoad?'asphalt-dry':'dirt'
      });
      const wheelUtil=(physics.wheels||[]).map(w=>Number(w.utilization)||0);
      const peakUtil=Math.max(0,...wheelUtil);
      maxUtil=Math.max(maxUtil,peakUtil);
      const forceCoupledSlide=clamp((peakUtil-.82)/.58,0,1);
      const sideslip=travelAxisSideslip({heading,velocityHeading});
      maxSideslip=Math.max(maxSideslip,sideslip);
      const driftScale=driftKinematicCoupling({sideslipRad:sideslip,forceCoupledSlide});
      const physicalAuthority=driftTireForceAuthority({sideslipRad:sideslip,forceCoupledSlide});
      const yawResponse=yawResponseRate({vehicle,speedAbs:Math.abs(speed),airborne:false});
      const targetYaw=Number(lat.yawRate)||0;
      const physicalYawAccel=Number(physics.predictedYawAccel)||0;
      dynamicYawRate+=physicalYawAccel*physicalAuthority*DT;
      const yawTargetGain=driftScale*(1-.85*physicalAuthority);
      dynamicYawRate+=(targetYaw-dynamicYawRate)*(1-Math.exp(-DT*yawResponse*yawTargetGain));
      dynamicYawRate=clamp(dynamicYawRate,-3.2,3.2);
      heading=normAngle(heading+dynamicYawRate*DT);
      maxYaw=Math.max(maxYaw,Math.abs(dynamicYawRate));

      const physicalTrajectoryYaw=tireForceTrajectoryYawRate({
        bodyVx:physics.bodyVx,bodyVz:physics.bodyVz,
        accelX:physics.predictedAccelX,accelZ:physics.predictedAccelZ
      });
      let attemptedDelta=0;
      const offroad=onRoad?{momentumYawRate:0,speedDecel:0}:offroadSideslipFriction({
        speed,heading,velocityHeading,slideMu:tireDirt.slide,airborne:false
      });
      attemptedDelta+=offroad.momentumYawRate*DT;
      const forceDominated=physicalAuthority>.12||driftScale<.88;
      if(forceDominated){
        const signedReference=Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5;
        const legacyTrajectoryYaw=physicalSignedLat/signedReference;
        attemptedDelta+=blendDriftForce(legacyTrajectoryYaw,physicalTrajectoryYaw,physicalAuthority)*DT;
      }else{
        const momentumTarget=bodyRelativeMomentumTargetHeading({speed,heading,velocityHeading});
        const followRate=onRoad?23:12;
        attemptedDelta+=angleDelta(momentumTarget,velocityHeading)*(1-Math.exp(-DT*followRate));
      }
      velocityHeading=normAngle(velocityHeading+limitMomentumHeadingDelta({
        attemptedDelta,speedAbs:Math.abs(speed),lateralCapacityAccel:latLimit,dt:DT,airborne:false
      }));

      if(!onRoad&&offroad.speedDecel>0){
        const dv=Math.min(Math.abs(speed),offroad.speedDecel*DT+.10*DT);
        speed-=Math.sign(speed||1)*dv;
      }
      minSpeedAbs=Math.min(minSpeedAbs,Math.abs(speed));
      maxSpeedAbs=Math.max(maxSpeedAbs,Math.abs(speed));
      x+=Math.sin(velocityHeading)*speed*DT;
      z+=Math.cos(velocityHeading)*speed*DT;

      const nowSideslip=travelAxisSideslip({heading,velocityHeading});
      if(reentered&&recoveredAt===null&&nearest.d<3.4&&nowSideslip<5*DEG&&t>(reentryAt??0)+.08)recoveredAt=t;
      for(const n of [x,z,heading,velocityHeading,dynamicYawRate,speed,physics.predictedAccelX,physics.predictedAccelZ,physics.predictedYawAccel]){
        if(!Number.isFinite(n))nonFinite++;
      }
      if(nonFinite)break;
    }

    nearest=nearestRouteLocal(segments,x,z,nearest.i);
    const finalSideslip=travelAxisSideslip({heading,velocityHeading});
    const recoverySec=reentryAt!==null&&recoveredAt!==null?recoveredAt-reentryAt:null;
    let status='PASS';
    const notes=[];
    if(nonFinite){status='FAIL';notes.push('non-finite physics state');}
    if(!leftRoad){status='WARN';notes.push('driver script failed to leave road');}
    if(leftRoad&&!reentered){status='WARN';notes.push('did not re-enter road');}
    if(reentered&&nearest.d>ROAD_HALF_WIDTH){status='WARN';notes.push('left road again before finish');}
    if(finalSideslip>12*DEG){status='WARN';notes.push('residual crab angle >12°');}
    if(maxSideslip>70*DEG&&scenario.driftDeg===0){status='WARN';notes.push('unexpected near-spin in clean scenario');}
    if(Math.abs(dynamicYawRate)>1.2&&scenario.driftDeg===0){status='WARN';notes.push('large residual yaw rate');}

    results.push({
      vehicle:info.id,scenario:scenario.id,status,anchor:anchor.label,
      curvature_deg_per_30m:+(anchor.curve*30/DEG).toFixed(2),
      start_kmh:+speedKmh.toFixed(1),min_kmh:+(minSpeedAbs*3.6).toFixed(1),
      max_offroad_m:+maxOffroad.toFixed(2),transitions,
      max_sideslip_deg:+(maxSideslip/DEG).toFixed(1),final_sideslip_deg:+(finalSideslip/DEG).toFixed(1),
      max_yaw_deg_s:+(maxYaw/DEG).toFixed(1),max_wheel_util:+maxUtil.toFixed(2),
      max_input:+maxSteerInput.toFixed(2),final_road_dist_m:+nearest.d.toFixed(2),
      recovery_s:recoverySec===null?null:+recoverySec.toFixed(2),notes:notes.join('; ')
    });
  }
}

assert.equal(results.some(r=>r.status==='FAIL'),false,'numerical failure in Yungas re-entry matrix');
const summary={
  route_provider:routed.provider,
  route_km:+(routeLength/1000).toFixed(1),
  route_points:routed.coordinates.length,
  anchors:anchors.map(a=>({label:a.label,cum_km:+(a.cum/1000).toFixed(1),curvature_deg_per_30m:+(a.curve*30/DEG).toFixed(2)})),
  runs:results.length,
  pass:results.filter(r=>r.status==='PASS').length,
  warn:results.filter(r=>r.status==='WARN').length,
  fail:results.filter(r=>r.status==='FAIL').length
};
console.log('YUNGAS OFFROAD / REENTRY SIMULATION SUMMARY');
console.log(JSON.stringify(summary,null,2));
console.table(results.map(({notes,...r})=>r));
const warnings=results.filter(r=>r.status!=='PASS');
if(warnings.length){
  console.log('YUNGAS WARNINGS');
  console.log(JSON.stringify(warnings,null,2));
}else{
  console.log('YUNGAS OFFROAD / REENTRY SIMULATION: ALL SCENARIOS PASS');
}
