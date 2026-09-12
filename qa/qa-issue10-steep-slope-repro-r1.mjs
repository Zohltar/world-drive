import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicles/vehicle-system.js';
import {createVehicleVisualSystem} from '../src/vehicles/vehicle-visuals.js';
import {createVehiclePresentation} from '../src/vehicles/vehicle-presentation.js';
import {createPerWheelShadowSolver} from '../src/physics/per-wheel-shadow-solver.js';
import {
  ROAD_WHEEL_CONTACT_HALF_WIDTH,
  WHEEL_RADIUS,
  TIRE_HALF_WIDTH,
  TIRE_VISUAL_CLEARANCE
} from '../src/world-materials.js';

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));

const DEG=Math.PI/180;
const DT=1/120;

function copyContacts(contacts=[]){
  return contacts.map(contact=>({
    absX:Number(contact.absX)||0,
    absZ:Number(contact.absZ)||0,
    ground:Number(contact.ground)||0,
    localX:Number(contact.localX)||0,
    localZ:Number(contact.localZ)||0,
    axleIndex:Number.isInteger(contact.axleIndex)?contact.axleIndex:0,
    front:!!contact.front,
    side:contact.side,
    contact:contact.contact!==false,
    contactFactor:Number(contact.contactFactor)||0,
    suspensionCompression:Number(contact.suspensionCompression)||0,
    suspensionVelocity:Number(contact.suspensionVelocity)||0
  }));
}

function contactSummary(contacts=[]){
  const front=contacts.filter(contact=>contact.front||contact.axleIndex===0);
  const rear=contacts.filter(contact=>!(contact.front||contact.axleIndex===0));
  const summarize=list=>({
    count:list.length,
    touching:list.filter(contact=>contact.contact!==false).length,
    meanFactor:list.length
      ?list.reduce((sum,contact)=>sum+(Number(contact.contactFactor)||0),0)/list.length
      :0,
    maxGapSignal:list.length
      ?Math.max(...list.map(contact=>Math.abs(Number(contact.suspensionVelocity)||0)))
      :0
  });
  return {front:summarize(front),rear:summarize(rear)};
}

function presentationProbe(vehicleId,pitchDeg,{frames=240}={}){
  const vehicleSystem=createVehicleSystem({initialId:vehicleId});
  const vehicle=vehicleSystem.physics;
  const scene=new THREE.Scene();
  const visuals=createVehicleVisualSystem({THREE,scene,vehicleSystem});
  const sun=new THREE.DirectionalLight(0xffffff,1);
  scene.add(sun);

  const slope=Math.tan(pitchDeg*DEG);
  const groundHeight=(x,z)=>slope*(Number(z)||0);
  const state={
    absX:0,
    absZ:0,
    heading:0,
    velocityHeading:0,
    speed:0,
    longitudinalAccel:0,
    rearSlipAmount:0,
    VEHICLE:vehicle
  };

  const presentation=createVehiclePresentation({
    THREE,
    scene,
    car:visuals.car,
    bodyGroup:visuals.bodyGroup,
    wheels:visuals.wheels,
    vehicleSystem,
    sun,
    roadSurfaceAt:(x,z)=>({lateral:0,y:groundHeight(x,z)}),
    terrainAbs:groundHeight,
    groundHeightForWheel:groundHeight,
    activeVehicleWheels:visuals.activeVehicleWheels,
    getDrivingState:()=>state,
    ROAD_WHEEL_CONTACT_HALF_WIDTH,
    WHEEL_RADIUS,
    TIRE_HALF_WIDTH,
    TIRE_VISUAL_CLEARANCE
  });

  for(let frame=0;frame<frames;frame++){
    presentation.updateSuspensionVisuals(DT,true,0);
  }

  const contacts=copyContacts(presentation.wheelContacts);
  return {
    vehicle,
    contacts,
    summary:contactSummary(contacts),
    airborne:!!presentation.airborne,
    wheelPlanePitch:Number(presentation.wheelPlanePitch)||0,
    bodyPitch:Number(visuals.bodyGroup.rotation.x)||0
  };
}

function tireProbe(vehicleId,vehicle,contacts,{speed=18,steer=.028,drive=0,brake=0,lateralAccel=2.2}={}){
  const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
  let result=null;
  for(let i=0;i<72;i++){
    result=solver.advance(DT,{
      vehicleId,
      vehicle,
      contacts,
      speed,
      heading:0,
      velocityHeading:0,
      yawRate:0,
      centerSteerAngle:steer,
      longitudinalAccel:drive+brake,
      lateralAccel,
      requestedDriveAccel:drive,
      requestedBrakeAccel:brake,
      longitudinalLoadTransferAccel:drive+brake,
      handbrake:false,
      surfaceId:'asphalt-dry'
    });
  }
  const wheels=Array.isArray(result?.wheels)?result.wheels:[];
  return {
    predictedYawAccel:Number(result?.predictedYawAccel)||0,
    predictedAccelX:Number(result?.predictedAccelX)||0,
    predictedAccelZ:Number(result?.predictedAccelZ)||0,
    normalLoadN:wheels.reduce((sum,wheel)=>sum+(Number(wheel.normalLoadN)||0),0),
    frontNormalN:wheels.filter(wheel=>wheel.front||wheel.axleIndex===0).reduce((sum,wheel)=>sum+(Number(wheel.normalLoadN)||0),0),
    rearNormalN:wheels.filter(wheel=>!(wheel.front||wheel.axleIndex===0)).reduce((sum,wheel)=>sum+(Number(wheel.normalLoadN)||0),0),
    saturated:wheels.filter(wheel=>wheel.saturated).length,
    touching:wheels.filter(wheel=>(Number(wheel.normalLoadN)||0)>1).length
  };
}

function firstLoss(vehicleId,direction){
  for(const degrees of [0,2.5,5,7.5,10,12.5,15,17.5,20,22.5,25,27.5,30,32.5,35,37.5,40]){
    const pitch=degrees*direction;
    const probe=presentationProbe(vehicleId,pitch);
    assert.equal(probe.airborne,false,`${vehicleId}: uniform ${pitch}° plane falsely became airborne`);
    const totalTouch=probe.contacts.filter(contact=>contact.contact).length;
    if(totalTouch<probe.contacts.length)return {degrees:pitch,probe};
  }
  return null;
}

const fleetSystem=createVehicleSystem({initialId:'wrx'});
const vehicleIds=fleetSystem.list()
  .map(info=>info.id)
  .filter(id=>id!=='truck');

const reports=[];
for(const vehicleId of vehicleIds){
  const flat=presentationProbe(vehicleId,0);
  assert.ok(flat.contacts.length>=4,`${vehicleId}: expected wheel contacts in stress harness`);
  assert.equal(flat.airborne,false,`${vehicleId}: flat plane became airborne`);
  assert.equal(flat.contacts.filter(contact=>contact.contact).length,flat.contacts.length,`${vehicleId}: flat baseline already has missing contacts`);

  const uphill30=presentationProbe(vehicleId,30);
  const downhill30=presentationProbe(vehicleId,-30);
  assert.equal(uphill30.airborne,false,`${vehicleId}: uphill uniform plane became airborne`);
  assert.equal(downhill30.airborne,false,`${vehicleId}: downhill uniform plane became airborne`);

  const flatTire=tireProbe(vehicleId,flat.vehicle,flat.contacts);
  const uphillTire=tireProbe(vehicleId,uphill30.vehicle,uphill30.contacts);
  const downhillTire=tireProbe(vehicleId,downhill30.vehicle,downhill30.contacts);

  const upLoss=firstLoss(vehicleId,1);
  const downLoss=firstLoss(vehicleId,-1);

  reports.push({
    vehicleId,
    suspensionTravel:Number(flat.vehicle.suspensionTravel)||0,
    flat:{contacts:flat.summary,tire:flatTire},
    uphill30:{contacts:uphill30.summary,tire:uphillTire,wheelPlanePitch:uphill30.wheelPlanePitch,bodyPitch:uphill30.bodyPitch},
    downhill30:{contacts:downhill30.summary,tire:downhillTire,wheelPlanePitch:downhill30.wheelPlanePitch,bodyPitch:downhill30.bodyPitch},
    firstUphillLossDeg:upLoss?.degrees??null,
    firstDownhillLossDeg:downLoss?.degrees??null
  });
}

const wrx=reports.find(report=>report.vehicleId==='wrx');
assert.ok(wrx,'WRX report missing');

// Issue #10 reproduction contract: on a perfectly planar road there is no crest,
// pothole or airborne event that can justify dropping an axle. Current runtime
// suspension/contact sampling nevertheless loses rear support on a steep climb
// and front support on a steep descent. This diagnostic intentionally PASSES
// when the reported defect is reproduced; the correction QA will invert these
// expectations once the causal fix exists.
assert.ok(
  wrx.uphill30.contacts.rear.touching<wrx.uphill30.contacts.rear.count,
  `WRX: expected current steep-uphill rear-contact loss was not reproduced: ${JSON.stringify(wrx.uphill30.contacts)}`
);
assert.ok(
  wrx.downhill30.contacts.front.touching<wrx.downhill30.contacts.front.count,
  `WRX: expected current steep-downhill front-contact loss was not reproduced: ${JSON.stringify(wrx.downhill30.contacts)}`
);
assert.ok(
  Math.abs(wrx.uphill30.tire.predictedYawAccel-wrx.flat.tire.predictedYawAccel)>.25 ||
  Math.abs(wrx.downhill30.tire.predictedYawAccel-wrx.flat.tire.predictedYawAccel)>.25,
  'WRX: contact loss should materially alter steering/yaw response in the tire solver'
);

console.log('ISSUE 10 STEEP-SLOPE REPRODUCTION: PASS (DEFECT REPRODUCED)',JSON.stringify({
  note:'Uniform planar grades must not shed an axle; current contact sampling does at steep pitch.',
  reports
},null,2));
