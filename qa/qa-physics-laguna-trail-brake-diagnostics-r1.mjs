import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {
  estimateWheelGripUsage,
  lateralDynamicsEnvelope,
  longitudinalTractionLimit
} from '../src/physics/vehicle-dynamics.js';
import {combinedBrakeForceAllocation} from '../src/physics/longitudinal-control.js';
import {createPerWheelShadowSolver} from '../src/physics/per-wheel-shadow-solver.js';

const G=9.80665;
const RAD=Math.PI/180;
const circuit=JSON.parse(fs.readFileSync(new URL('../src/routing/circuits/laguna-seca.json',import.meta.url),'utf8'));
const vehicleSystem=createVehicleSystem({initialId:'wrx'});
const vehicle=vehicleSystem.physics;

function toMeters(coords){
  const lat0=coords.reduce((sum,point)=>sum+point[1],0)/coords.length;
  const lon0=coords.reduce((sum,point)=>sum+point[0],0)/coords.length;
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
  const segments=[];
  let total=0;
  for(let index=1;index<source.length;index++){
    const length=distance(source[index-1],source[index]);
    segments.push({a:source[index-1],b:source[index],start:total,length});
    total+=length;
  }
  const out=[];
  for(let position=0;position<total;position+=step){
    let index=segments.findIndex(segment=>position<=segment.start+segment.length+1e-9);
    if(index<0)index=segments.length-1;
    const segment=segments[index];
    const t=segment.length>1e-9?(position-segment.start)/segment.length:0;
    out.push({
      s:position,
      x:segment.a.x+(segment.b.x-segment.a.x)*t,
      z:segment.a.z+(segment.b.z-segment.a.z)*t
    });
  }
  return {points:out,length:total,step};
}

function wrapAngle(angle){return Math.atan2(Math.sin(angle),Math.cos(angle));}

function curvatureSamples(resampled,windowM=25){
  const points=resampled.points;
  const count=points.length;
  const offset=Math.max(2,Math.round(windowM/resampled.step));
  const result=[];
  for(let index=0;index<count;index++){
    const previous=points[(index-offset+count)%count];
    const current=points[index];
    const next=points[(index+offset)%count];
    const heading0=Math.atan2(current.x-previous.x,current.z-previous.z);
    const heading1=Math.atan2(next.x-current.x,next.z-current.z);
    const span=Math.max(1,distance(previous,current)+distance(current,next));
    const curvature=2*wrapAngle(heading1-heading0)/span;
    const radius=Math.abs(curvature)>1e-6?1/Math.abs(curvature):Infinity;
    result.push({s:current.s,curvature,radius,x:current.x,z:current.z});
  }
  return result;
}

function selectCornerPeaks(samples,count=6,minSeparationM=180){
  const candidates=samples
    .filter(sample=>Number.isFinite(sample.radius)&&sample.radius>=18&&sample.radius<=220)
    .sort((a,b)=>Math.abs(b.curvature)-Math.abs(a.curvature));
  const picked=[];
  const length=Math.max(...samples.map(sample=>sample.s));
  for(const candidate of candidates){
    const distinct=picked.every(previous=>{
      const raw=Math.abs(candidate.s-previous.s);
      return Math.min(raw,Math.max(0,length-raw))>=minSeparationM;
    });
    if(distinct)picked.push(candidate);
    if(picked.length>=count)break;
  }
  return picked.sort((a,b)=>a.s-b.s);
}

function contactsForVehicle(profile){
  const contacts=[];
  for(let axleIndex=0;axleIndex<profile.axles.length;axleIndex++){
    const axle=profile.axles[axleIndex];
    const halfTrack=Math.max(.4,Number(axle.trackWidth||profile.trackWidth||1.55))/2;
    contacts.push({contact:true,contactFactor:1,axleIndex,front:axle.positionM>=0,side:'left',localX:-halfTrack,localZ:axle.positionM});
    contacts.push({contact:true,contactFactor:1,axleIndex,front:axle.positionM>=0,side:'right',localX:halfTrack,localZ:axle.positionM});
  }
  return contacts;
}

const contacts=contactsForVehicle(vehicle);

function evaluateState({radius,speed,beta,steerAngle,yawRate,brakeG=0,turnSign=1,settleSteps=30}){
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  const targetLatAccel=speed*speed/radius;
  const brakeAccel=-Math.abs(brakeG)*G;
  const input={
    vehicleId:'wrx',vehicle,contacts,speed,
    heading:0,
    velocityHeading:turnSign*beta,
    yawRate:turnSign*yawRate,
    centerSteerAngle:turnSign*steerAngle,
    longitudinalAccel:brakeAccel,
    lateralAccel:turnSign*targetLatAccel,
    requestedDriveAccel:0,
    requestedBrakeAccel:brakeAccel,
    longitudinalLoadTransferAccel:brakeAccel,
    handbrake:false,
    surfaceId:'asphalt-dry'
  };
  let result=null;
  for(let index=0;index<settleSteps;index++)result=solver.advance(1/120,input);
  const front=result.wheels.filter(wheel=>wheel.front);
  const rear=result.wheels.filter(wheel=>!wheel.front);
  const sum=(wheels,key)=>wheels.reduce((total,wheel)=>total+(Number(wheel[key])||0),0);
  const max=(wheels,key)=>wheels.reduce((value,wheel)=>Math.max(value,Number(wheel[key])||0),0);
  return {
    beta,steerAngle,brakeG,
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
    frontSlipDeg:Math.max(...front.map(wheel=>Math.abs(wheel.slipAngle)/RAD)),
    rearSlipDeg:Math.max(...rear.map(wheel=>Math.abs(wheel.slipAngle)/RAD)),
    absWheels:result.wheels.filter(wheel=>wheel.absActive).length,
    saturatedWheels:result.wheels.filter(wheel=>wheel.saturated).length,
    axleLoads:result.axleLoads
  };
}

// A steady corner is a two-equation trim problem. The tire forces must both
// provide v^2/R at the CG and produce zero yaw acceleration. The superseded R1
// diagnostic minimized only yaw acceleration, which admitted the trivial
// near-zero-force state and made its brake sweep physically meaningless.
function steadyCornerTrim({radius,speed,turnSign=1}){
  const targetLatAccel=speed*speed/radius;
  const yawRate=speed/radius;
  const rearDistance=Math.abs(Math.min(...vehicle.axles.map(axle=>Number(axle.positionM)||0)));
  let beta=rearDistance/radius-.08;
  let steerAngle=Math.atan(vehicle.wheelbase/radius)+.004;
  let state=null;
  let residual=Infinity;

  for(let iteration=0;iteration<24;iteration++){
    state=evaluateState({radius,speed,beta,steerAngle,yawRate,turnSign,settleSteps:30});
    const forceError=state.lateralAccelPred-targetLatAccel;
    const yawError=state.yawAccel;
    residual=Math.hypot(
      forceError/Math.max(.2,targetLatAccel),
      yawError/Math.max(.2,targetLatAccel/vehicle.wheelbase)
    );
    if(residual<1e-5)break;

    const step=1e-4;
    const betaProbe=evaluateState({radius,speed,beta:beta+step,steerAngle,yawRate,turnSign,settleSteps:30});
    const steerProbe=evaluateState({radius,speed,beta,steerAngle:steerAngle+step,yawRate,turnSign,settleSteps:30});
    const j11=(betaProbe.lateralAccelPred-state.lateralAccelPred)/step;
    const j21=(betaProbe.yawAccel-state.yawAccel)/step;
    const j12=(steerProbe.lateralAccelPred-state.lateralAccelPred)/step;
    const j22=(steerProbe.yawAccel-state.yawAccel)/step;
    const determinant=j11*j22-j12*j21;
    assert.ok(Math.abs(determinant)>1e-8,`singular Laguna trim Jacobian at R=${radius.toFixed(1)} m`);
    const betaDelta=(-forceError*j22+j12*yawError)/determinant;
    const steerDelta=(-j11*yawError+j21*forceError)/determinant;
    const maxStep=.025;
    const scale=Math.min(1,maxStep/Math.max(Math.abs(betaDelta),Math.abs(steerDelta),1e-12));
    beta=Math.max(-.25,Math.min(.25,beta+betaDelta*scale));
    steerAngle=Math.max(0,Math.min(.35,steerAngle+steerDelta*scale));
  }

  state=evaluateState({radius,speed,beta,steerAngle,yawRate,turnSign,settleSteps:72});
  residual=Math.hypot(
    (state.lateralAccelPred-targetLatAccel)/Math.max(.2,targetLatAccel),
    state.yawAccel/Math.max(.2,targetLatAccel/vehicle.wheelbase)
  );
  assert.ok(residual<.006,`Laguna steady-state trim did not converge at R=${radius.toFixed(1)} m: ${residual}`);
  assert.ok(Math.abs(state.lateralAccelPred-targetLatAccel)<.02*G,
    `Laguna trim lateral-force residual too large at R=${radius.toFixed(1)} m`);
  assert.ok(Math.abs(state.yawAccel)<.02,
    `Laguna trim yaw residual too large at R=${radius.toFixed(1)} m`);
  assert.ok(Math.max(state.frontUtil,state.rearUtil)>.45,
    `Laguna trim did not materially load the tires at R=${radius.toFixed(1)} m`);
  return {beta,steerAngle,yawRate,state,residual};
}

function runtimeAggregateProbe({speed,steerAngle,brakeG,allocateCombined=false}){
  const longitudinalMu=vehicle.longitudinalAccelLimit/G;
  const lateral=lateralDynamicsEnvelope({
    vehicle,
    speed,
    steerAngle,
    steerInput:0,
    driveThrottle:0,
    onPavement:true,
    surfaceGrip:1,
    awdOffroadGripBonus:1,
    rearSlipAmount:0,
    airborne:false
  },{});
  const tireSolverLatAccel=Math.min(lateral.requestedLatAccel,lateral.latLimit);
  const brakeForce=longitudinalTractionLimit({
    vehicle,
    requestedAccel:-Math.abs(brakeG)*G,
    surfaceMu:longitudinalMu,
    mode:'brake',
    airborne:false,
    speedAbs:speed
  },{});
  const allocation=combinedBrakeForceAllocation({
    serviceBrakeAccel:brakeForce.acceleration,
    longitudinalLimit:brakeForce.limit,
    requestedLateralAccel:tireSolverLatAccel,
    lateralLimit:lateral.latLimit,
    vehicle,
    absEnabled:vehicle.absEnabled!==false,
    airborne:false,
    enabled:allocateCombined
  },{});
  const grip=estimateWheelGripUsage({
    requestedLatAccel:tireSolverLatAccel,
    signedLatAccel:tireSolverLatAccel,
    latLimit:lateral.latLimit,
    longitudinalAccel:allocation.acceleration,
    propulsionAccel:0,
    serviceBrakeAccel:allocation.acceleration,
    surfaceMu:longitudinalMu,
    throttle:-1,
    handbrake:false,
    airborne:false,
    vehicle,
    speedAbs:speed,
    contacts,
    previousUsage:[0,0,0,0],
    dt:.05
  },{});
  return {brakeForce,allocation,grip,lateral,tireSolverLatAccel};
}

const resampled=resampleClosed(toMeters(circuit.coordinates),5);
const corners=selectCornerPeaks(curvatureSamples(resampled,25),6,180);
assert.ok(corners.length>=4,'Laguna diagnostic needs at least four usable corner peaks');
assert.ok(Math.abs(resampled.length-circuit.lengthM)<120,'resampled circuit length drifted too far from authored Laguna length');

const targetLatAccel=Math.min(vehicle.lateralAccelLimit*.78,.78*G);
const brakeLevels=[0,.10,.20,.35,.50,.70];
const rows=[];
const trims=[];

for(const corner of corners){
  const radius=corner.radius;
  const speed=Math.max(11,Math.min(32,Math.sqrt(targetLatAccel*radius)));
  const turnSign=Math.sign(corner.curvature)||1;
  const trim=steadyCornerTrim({radius,speed,turnSign});
  trims.push({corner,trim,speed,turnSign});
  const states=[];

  for(const brakeG of brakeLevels){
    const state=evaluateState({
      radius,speed,beta:trim.beta,steerAngle:trim.steerAngle,yawRate:trim.yawRate,
      brakeG,turnSign,settleSteps:72
    });
    states.push(state);
    rows.push({
      sM:Math.round(corner.s),
      radiusM:Number(radius.toFixed(1)),
      speedKmh:Number((speed*3.6).toFixed(1)),
      targetLatG:Number((speed*speed/radius/G).toFixed(3)),
      coastBetaDeg:Number((trim.beta/RAD).toFixed(2)),
      roadWheelSteerDeg:Number((trim.steerAngle/RAD).toFixed(2)),
      brakeG,
      actualLatG:Number((state.lateralAccelPred/G).toFixed(3)),
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

  const coast=states[0];
  const brake20=states[2];
  const brake50=states[4];
  assert.ok(brake20.yawAccel>coast.yawAccel+.06,
    `0.2 g trail braking did not add turn-in yaw at R=${radius.toFixed(1)} m`);
  assert.ok(brake50.lateralAccelPred>coast.lateralAccelPred*.90,
    `0.5 g trail braking lost excessive physical lateral force at R=${radius.toFixed(1)} m`);
  assert.equal(brake50.saturatedWheels,0,
    `0.5 g trail braking saturated a physical tire at R=${radius.toFixed(1)} m`);
}

// Analytic longitudinal load-transfer cross-check for the exact WRX profile.
const loadTransfer=brakeLevels.map(brakeG=>{
  const expectedFront=vehicle.frontWeightBias+(brakeG*vehicle.cgHeight/vehicle.wheelbase);
  const probe=evaluateState({
    radius:80,speed:20,beta:0,
    steerAngle:Math.atan(vehicle.wheelbase/80),yawRate:20/80,
    brakeG,turnSign:1,settleSteps:72
  });
  const measuredFront=probe.frontFz/(probe.frontFz+probe.rearFz);
  assert.ok(Math.abs(measuredFront-expectedFront)<.003,
    `longitudinal load transfer mismatch at ${brakeG}g: expected ${expectedFront}, got ${measuredFront}`);
  return {
    brakeG,
    expectedFrontPct:Number((expectedFront*100).toFixed(2)),
    measuredFrontPct:Number((measuredFront*100).toFixed(2))
  };
});

const runtimeFullBrake=trims.map(({corner,trim,speed,turnSign})=>{
  const legacy=runtimeAggregateProbe({speed,steerAngle:trim.steerAngle,brakeG:vehicle.brake/G,allocateCombined:false});
  const allocated=runtimeAggregateProbe({speed,steerAngle:trim.steerAngle,brakeG:vehicle.brake/G,allocateCombined:true});
  const physical=evaluateState({
    radius:corner.radius,
    speed,
    beta:trim.beta,
    steerAngle:trim.steerAngle,
    yawRate:trim.yawRate,
    brakeG:Math.abs(allocated.allocation.acceleration)/G,
    turnSign,
    settleSteps:72
  });
  assert.ok(allocated.grip.netLateralAccel>legacy.grip.netLateralAccel*3,
    `combined allocation did not restore Laguna lateral force at R=${corner.radius.toFixed(1)} m`);
  assert.ok(allocated.grip.frontLateral<.99,
    `combined allocation retained front-axle saturation at R=${corner.radius.toFixed(1)} m`);
  return {
    sM:Math.round(corner.s),
    radiusM:Number(corner.radius.toFixed(1)),
    speedKmh:Number((speed*3.6).toFixed(1)),
    runtimeRequestedLatG:Number((allocated.tireSolverLatAccel/G).toFixed(3)),
    unallocated:{
      appliedBrakeG:Number((Math.abs(legacy.allocation.acceleration)/G).toFixed(3)),
      netLatG:Number((legacy.grip.netLateralAccel/G).toFixed(3)),
      trajectoryCapacityG:Number((legacy.grip.trajectoryLateralCapacityAccel/G).toFixed(3)),
      frontSlip:Number(legacy.grip.frontLateral.toFixed(3)),
      rearSlip:Number(legacy.grip.rearLateral.toFixed(3))
    },
    allocated:{
      appliedBrakeG:Number((Math.abs(allocated.allocation.acceleration)/G).toFixed(3)),
      forceScale:Number(allocated.allocation.forceScale.toFixed(3)),
      netLatG:Number((allocated.grip.netLateralAccel/G).toFixed(3)),
      trajectoryCapacityG:Number((allocated.grip.trajectoryLateralCapacityAccel/G).toFixed(3)),
      frontForceScale:Number(allocated.grip.frontLateralForceScale.toFixed(3)),
      rearForceScale:Number(allocated.grip.rearLateralForceScale.toFixed(3)),
      frontSlip:Number(allocated.grip.frontLateral.toFixed(3)),
      rearSlip:Number(allocated.grip.rearLateral.toFixed(3)),
      physicalYawAccel:Number(physical.yawAccel.toFixed(3))
    }
  };
});

console.log('LAGUNA TRAIL-BRAKING DIAGNOSTIC: FORCE + YAW TRIM');
console.log(JSON.stringify({
  method:{
    steadyStateConstraints:['sum(Fy)/mass = speed^2/radius','sum(Mz)/yawInertia = 0'],
    brakeSweep:'fixed trimmed corner state; 120 Hz per-wheel tire/ABS solver',
    note:'runtimeFullBrake compares the superseded longitudinal-priority path with combined g-g allocation and the physical tire yaw result'
  },
  circuitLengthM:Number(resampled.length.toFixed(1)),
  vehicle:'wrx',
  vehicleMassKg:vehicle.massKg,
  wheelbaseM:vehicle.wheelbase,
  cgHeightM:vehicle.cgHeight,
  staticFrontPct:vehicle.frontWeightBias*100,
  lateralAccelLimitG:Number((vehicle.lateralAccelLimit/G).toFixed(3)),
  targetLatAccelG:Number((targetLatAccel/G).toFixed(3)),
  corners:corners.map(corner=>({
    sM:Math.round(corner.s),
    radiusM:Number(corner.radius.toFixed(1)),
    turn:corner.curvature>0?'right':'left'
  })),
  loadTransfer,
  physicalTireRows:rows,
  runtimeFullBrake
},null,2));
