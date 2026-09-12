import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicles/vehicle-system.js';
import {createVehicleVisualSystem} from '../src/vehicles/vehicle-visuals.js';
import {createVehiclePresentation} from '../src/vehicles/vehicle-presentation.js';
import {createPerWheelShadowSolver} from '../src/physics/per-wheel-shadow-solver.js';
import {restoreSteepPlanarRoadContacts} from '../src/physics/steep-slope-contact.js';
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
const VEHICLE_IDS=['id4','wrx','civic','sonata','i3_2017','f1_2010','countach_80'];
const PITCHES=[-40,-35,-30,-25,-20,-15,-12.5,-10,-7.5,-5,0,5,7.5,10,12.5,15,20,25,30,35,40];

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

  for(let frame=0;frame<frames;frame++)presentation.updateSuspensionVisuals(DT,true,0);

  return {
    vehicle,
    contacts:copyContacts(presentation.wheelContacts),
    airborne:!!presentation.airborne,
    wheelPlanePitch:Number(presentation.wheelPlanePitch)||0
  };
}

function tireProbe(vehicleId,vehicle,contacts,{speed=18,steer=.028,lateralAccel=2.2}={}){
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
      longitudinalAccel:0,
      lateralAccel,
      requestedDriveAccel:0,
      requestedBrakeAccel:0,
      longitudinalLoadTransferAccel:0,
      handbrake:false,
      surfaceId:'asphalt-dry'
    });
  }
  const wheels=Array.isArray(result?.wheels)?result.wheels:[];
  return {
    predictedYawAccel:Number(result?.predictedYawAccel)||0,
    frontNormalN:wheels.filter(wheel=>wheel.front||wheel.axleIndex===0).reduce((sum,wheel)=>sum+(Number(wheel.normalLoadN)||0),0),
    rearNormalN:wheels.filter(wheel=>!(wheel.front||wheel.axleIndex===0)).reduce((sum,wheel)=>sum+(Number(wheel.normalLoadN)||0),0),
    touching:wheels.filter(wheel=>(Number(wheel.normalLoadN)||0)>1).length
  };
}

const reports=[];
for(const vehicleId of VEHICLE_IDS){
  let minYaw=Infinity;
  let maxPitchError=0;
  for(const pitchDeg of PITCHES){
    const probe=presentationProbe(vehicleId,pitchDeg);
    assert.equal(probe.contacts.length,4,`${vehicleId} ${pitchDeg}°: expected four wheel contacts`);
    assert.equal(probe.airborne,false,`${vehicleId} ${pitchDeg}°: uniform plane falsely became airborne`);
    assert.equal(
      probe.contacts.filter(contact=>contact.contact).length,
      4,
      `${vehicleId} ${pitchDeg}°: uniform planar grade shed a wheel/axle: ${JSON.stringify(probe.contacts)}`
    );
    assert.ok(
      probe.contacts.every(contact=>contact.contactFactor>=.35),
      `${vehicleId} ${pitchDeg}°: restored planar contact factor too weak`
    );

    const tire=tireProbe(vehicleId,probe.vehicle,probe.contacts);
    assert.equal(tire.touching,4,`${vehicleId} ${pitchDeg}°: tire solver did not retain four loaded wheels`);
    assert.ok(tire.frontNormalN>1&&tire.rearNormalN>1,`${vehicleId} ${pitchDeg}°: one axle lost normal load`);
    assert.ok(Math.abs(tire.predictedYawAccel)>.05,`${vehicleId} ${pitchDeg}°: steering/yaw authority collapsed`);
    minYaw=Math.min(minYaw,Math.abs(tire.predictedYawAccel));

    if(Math.abs(pitchDeg)>=5){
      maxPitchError=Math.max(
        maxPitchError,
        Math.abs(Math.abs(probe.wheelPlanePitch)-Math.abs(pitchDeg*DEG))
      );
    }
  }
  reports.push({vehicleId,minYaw:Number(minYaw.toFixed(3)),maxPitchError:Number(maxPitchError.toFixed(3))});
}

// Safety gates for the helper itself: do not manufacture support off-road,
// while airborne, or across an obviously non-planar/twisted wheel surface.
const baseContacts=[
  {localX:-.8,localZ:-1.2,ground:-.24,contact:true,contactFactor:1},
  {localX:-.8,localZ:1.2,ground:.24,contact:true,contactFactor:1},
  {localX:.8,localZ:-1.2,ground:-.24,contact:false,contactFactor:0},
  {localX:.8,localZ:1.2,ground:.24,contact:false,contactFactor:0}
];
const offRoad=structuredClone(baseContacts);
assert.equal(restoreSteepPlanarRoadContacts({contacts:offRoad,onRoad:false,airborne:false}).restored,0,'off-road contact must remain untouched');
const airborne=structuredClone(baseContacts);
assert.equal(restoreSteepPlanarRoadContacts({contacts:airborne,onRoad:true,airborne:true}).restored,0,'airborne contact must remain untouched');
const twisted=structuredClone(baseContacts);
twisted[3].ground+=.24;
assert.equal(restoreSteepPlanarRoadContacts({contacts:twisted,onRoad:true,airborne:false,suspensionTravel:.14}).restored,0,'non-planar wheel support must not be fabricated');

console.log('ISSUE 10 STEEP-SLOPE CONTACT QA: PASS',JSON.stringify({vehicles:reports.length,pitches:PITCHES,reports},null,2));
