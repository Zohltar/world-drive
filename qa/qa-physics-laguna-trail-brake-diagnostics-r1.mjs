import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {createPerWheelShadowSolver} from '../src/physics/per-wheel-shadow-solver.js';

const G=9.80665;
const RAD=Math.PI/180;
const circuit=JSON.parse(fs.readFileSync(new URL('../src/routing/circuits/laguna-seca.json',import.meta.url),'utf8'));
const vehicleSystem=createVehicleSystem({initialId:'wrx'});
const vehicle=vehicleSystem.physics;

function toMeters(coords){
  const lat0=coords.reduce((s,p)=>s+p[1],0)/coords.length;
  const lon0=coords.reduce((s,p)=>s+p[0],0)/coords.length;
  const cos=Math.cos(lat0*RAD);
  return coords.map(([lon,lat])=>({
    x:(lon-lon0)*111320*cos,
    z:(lat-lat0)*110540
  }));
}

function distance(a,b){return Math.hypot(b.x-a.x,b.z-a.z);}

function resampleClosed(points,step=5){
  const source=[...points];
  if(distance(source[0],source[source.length-1])>.01)source.push({...source[0]});
  const seg=[];
  let total=0;
  for(let i=1;i<source.length;i++){
    const len=distance(source[i-1],source[i]);
    seg.push({a:source[i-1],b:source[i],start:total,len});
    total+=len;
  }
  const out=[];
  for(let s=0;s<total;s+=step){
    let k=seg.findIndex(v=>s<=v.start+v.len+1e-9);
    if(k<0)k=seg.length-1;
    const v=seg[k];
    const t=v.len>1e-9?(s-v.start)/v.len:0;
    out.push({
      s,
      x:v.a.x+(v.b.x-v.a.x)*t,
      z:v.a.z+(v.b.z-v.a.z)*t
    });
  }
  return {points:out,length:total,step};
}

function wrapAngle(a){return Math.atan2(Math.sin(a),Math.cos(a));}

function curvatureSamples(resampled,windowM=25){
  const pts=resampled.points;
  const n=pts.length;
  const offset=Math.max(2,Math.round(windowM/resampled.step));
  const result=[];
  for(let i=0;i<n;i++){
    const prev=pts[(i-offset+n)%n];
    const cur=pts[i];
    const next=pts[(i+offset)%n];
    const h0=Math.atan2(cur.x-prev.x,cur.z-prev.z);
    const h1=Math.atan2(next.x-cur.x,next.z-cur.z);
    const ds=Math.max(1,distance(prev,cur)+distance(cur,next));
    const dHeading=wrapAngle(h1-h0);
    const kappa=2*dHeading/ds;
    const radius=Math.abs(kappa)>1e-6?1/Math.abs(kappa):Infinity;
    result.push({s:cur.s,kappa,radius,x:cur.x,z:cur.z});
  }
  return result;
}

function selectCornerPeaks(samples,count=6,minSeparationM=180){
  const candidates=samples
    .filter(v=>Number.isFinite(v.radius)&&v.radius>=18&&v.radius<=220)
    .sort((a,b)=>Math.abs(b.kappa)-Math.abs(a.kappa));
  const picked=[];
  const length=Math.max(...samples.map(v=>v.s));
  for(const c of candidates){
    const distinct=picked.every(p=>{
      const raw=Math.abs(c.s-p.s);
      return Math.min(raw,Math.max(0,length-raw))>=minSeparationM;
    });
    if(distinct)picked.push(c);
    if(picked.length>=count)break;
  }
  return picked.sort((a,b)=>a.s-b.s);
}

function contactsForVehicle(v){
  const axles=v.axles;
  const contacts=[];
  for(let axleIndex=0;axleIndex<axles.length;axleIndex++){
    const axle=axles[axleIndex];
    const half=Math.max(.4,Number(axle.trackWidth||v.trackWidth||1.55))/2;
    contacts.push({contact:true,contactFactor:1,axleIndex,front:axle.positionM>=0,side:'left',localX:-half,localZ:axle.positionM});
    contacts.push({contact:true,contactFactor:1,axleIndex,front:axle.positionM>=0,side:'right',localX:half,localZ:axle.positionM});
  }
  return contacts;
}

const contacts=contactsForVehicle(vehicle);

function evaluateState({radius,speed,beta,yawRate,brakeG=0,turnSign=1}){
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  const steerAngle=turnSign*Math.atan(vehicle.wheelbase/radius);
  const lateralAccel=turnSign*speed*speed/radius;
  const brakeAccel=-Math.abs(brakeG)*G;
  let result=null;
  const input={
    vehicleId:'wrx',vehicle,contacts,
    speed,heading:0,velocityHeading:turnSign*beta,
    yawRate:turnSign*yawRate,
    centerSteerAngle:steerAngle,
    longitudinalAccel:brakeAccel,
    lateralAccel,
    requestedDriveAccel:0,
    requestedBrakeAccel:brakeAccel,
    longitudinalLoadTransferAccel:brakeAccel,
    handbrake:false,surfaceId:'asphalt-dry'
  };
  // Hold chassis state fixed long enough for wheel angular speed / ABS state to settle.
  for(let i=0;i<72;i++)result=solver.advance(1/120,input);
  const front=result.wheels.filter(w=>w.front);
  const rear=result.wheels.filter(w=>!w.front);
  const sum=(arr,key)=>arr.reduce((s,w)=>s+(Number(w[key])||0),0);
  const max=(arr,key)=>arr.reduce((m,w)=>Math.max(m,Number(w[key])||0),0);
  return {
    beta,
    brakeG,
    yawAccel:turnSign*result.predictedYawAccel,
    yawMomentNm:turnSign*result.totalYawMomentNm,
    lateralAccelPred:turnSign*result.predictedAccelX,
    longitudinalAccelPred:result.predictedAccelZ,
    frontFz:sum(front,'normalLoadN'),
    rearFz:sum(rear,'normalLoadN'),
    frontFy:turnSign*sum(front,'forceX'),
    rearFy:turnSign*sum(rear,'forceX'),
    frontUtil:max(front,'utilization'),
    rearUtil:max(rear,'utilization'),
    frontSlipDeg:Math.max(...front.map(w=>Math.abs(w.slipAngle)/RAD)),
    rearSlipDeg:Math.max(...rear.map(w=>Math.abs(w.slipAngle)/RAD)),
    absWheels:result.wheels.filter(w=>w.absActive).length,
    saturatedWheels:result.wheels.filter(w=>w.saturated).length,
    axleLoads:result.axleLoads
  };
}

function coastEquilibrium({radius,speed,turnSign=1}){
  const yawRate=speed/radius;
  const probes=[];
  for(let beta=-.16;beta<=.1601;beta+=.01){
    const state=evaluateState({radius,speed,beta,yawRate,brakeG:0,turnSign});
    probes.push(state);
  }
  probes.sort((a,b)=>Math.abs(a.yawAccel)-Math.abs(b.yawAccel));
  let best=probes[0];

  // Refine around the best coarse state; minimizing |yaw acceleration| is robust
  // even if the nonlinear tire model does not bracket an exact sign change.
  for(let span=.01;span>=.000625;span/=2){
    const candidates=[];
    for(let j=-4;j<=4;j++){
      const beta=best.beta+j*span/4;
      candidates.push(evaluateState({radius,speed,beta,yawRate,brakeG:0,turnSign}));
    }
    candidates.sort((a,b)=>Math.abs(a.yawAccel)-Math.abs(b.yawAccel));
    best=candidates[0];
  }
  return {best,yawRate};
}

const resampled=resampleClosed(toMeters(circuit.coordinates),5);
const corners=selectCornerPeaks(curvatureSamples(resampled,25),6,180);
assert.ok(corners.length>=4,'Laguna diagnostic needs at least four usable corner peaks');
assert.ok(Math.abs(resampled.length-circuit.lengthM)<120,'resampled circuit length drifted too far from authored Laguna length');

const targetLatAccel=Math.min(vehicle.lateralAccelLimit*.78,.78*G);
const brakeLevels=[0,.10,.20,.35,.50,.70];
const rows=[];

for(const corner of corners){
  const radius=corner.radius;
  const speed=Math.max(11,Math.min(32,Math.sqrt(targetLatAccel*radius)));
  const turnSign=Math.sign(corner.kappa)||1;
  const eq=coastEquilibrium({radius,speed,turnSign});
  for(const brakeG of brakeLevels){
    const state=evaluateState({radius,speed,beta:eq.best.beta,yawRate:eq.yawRate,brakeG,turnSign});
    rows.push({
      sM:Math.round(corner.s),
      radiusM:Number(radius.toFixed(1)),
      speedKmh:Number((speed*3.6).toFixed(1)),
      targetLatG:Number((speed*speed/radius/G).toFixed(3)),
      coastBetaDeg:Number((eq.best.beta/RAD).toFixed(2)),
      brakeG,
      frontLoadPct:Number((100*state.frontFz/(state.frontFz+state.rearFz)).toFixed(1)),
      yawAccel:Number(state.yawAccel.toFixed(3)),
      frontUtil:Number(state.frontUtil.toFixed(3)),
      rearUtil:Number(state.rearUtil.toFixed(3)),
      frontSlipDeg:Number(state.frontSlipDeg.toFixed(2)),
      rearSlipDeg:Number(state.rearSlipDeg.toFixed(2)),
      absWheels:state.absWheels,
      saturatedWheels:state.saturatedWheels
    });
  }
}

// Analytic longitudinal load-transfer cross-check for the exact WRX profile.
const transferChecks=brakeLevels.map(brakeG=>{
  const expectedFront=vehicle.frontWeightBias+(brakeG*vehicle.cgHeight/vehicle.wheelbase);
  const probe=evaluateState({
    radius:80,
    speed:20,
    beta:0,
    yawRate:20/80,
    brakeG,
    turnSign:1
  });
  const measuredFront=probe.frontFz/(probe.frontFz+probe.rearFz);
  assert.ok(Math.abs(measuredFront-expectedFront)<.003,
    `longitudinal load transfer mismatch at ${brakeG}g: expected ${expectedFront}, got ${measuredFront}`);
  return {brakeG,expectedFrontPct:Number((expectedFront*100).toFixed(2)),measuredFrontPct:Number((measuredFront*100).toFixed(2))};
});

console.log('LAGUNA TRAIL-BRAKING DIAGNOSTIC: CURRENT ENGINE');
console.log(JSON.stringify({
  circuitLengthM:Number(resampled.length.toFixed(1)),
  vehicle:'wrx',
  vehicleMassKg:vehicle.massKg,
  wheelbaseM:vehicle.wheelbase,
  cgHeightM:vehicle.cgHeight,
  staticFrontPct:vehicle.frontWeightBias*100,
  lateralAccelLimitG:Number((vehicle.lateralAccelLimit/G).toFixed(3)),
  targetLatAccelG:Number((targetLatAccel/G).toFixed(3)),
  corners:corners.map(c=>({sM:Math.round(c.s),radiusM:Number(c.radius.toFixed(1)),turn:c.kappa>0?'right':'left'})),
  loadTransfer:transferChecks,
  rows
},null,2));
