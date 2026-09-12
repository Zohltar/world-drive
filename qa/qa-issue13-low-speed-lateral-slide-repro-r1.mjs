import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicles/vehicle-system.js';
import {createVehicleVisualSystem} from '../src/vehicles/vehicle-visuals.js';
import {createVehiclePresentation} from '../src/vehicles/vehicle-presentation.js';
import {
  steeringCommand,
  lateralDynamicsEnvelope,
  longitudinalTractionLimit,
  estimateWheelGripUsage
} from '../src/physics/vehicle-dynamics.js';
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
const VEHICLE_IDS=['id4','wrx','civic','sonata','i3_2017','countach_80'];
const PITCHES=[-25,-20,-15,-10,-5,0,5,10,15,20,25];
const TWISTS=[-.08,-.06,-.045,-.03,0,.03,.045,.06,.08];
const SPEEDS=[1.0,2.0,3.0,4.5,6.0];
const STEER_INPUTS=[.35,.65,1.0];
const THROTTLES=[0,.20,.40];

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

function presentationProbe(vehicleId,pitchDeg,twist,{frames=260}={}){
  const vehicleSystem=createVehicleSystem({initialId:vehicleId});
  const vehicle=vehicleSystem.physics;
  const scene=new THREE.Scene();
  const visuals=createVehicleVisualSystem({THREE,scene,vehicleSystem});
  const sun=new THREE.DirectionalLight(0xffffff,1);
  scene.add(sun);

  const slope=Math.tan(pitchDeg*DEG);
  // x*z is a compact proxy for a bank/superelevation transition through the
  // wheelbase: front and rear axles see different cross-slopes. This is the
  // non-planar support condition most relevant to a sloped corner exit.
  const groundHeight=(x,z)=>slope*(Number(z)||0)+Number(twist||0)*(Number(x)||0)*(Number(z)||0);
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
    wheelPlanePitch:Number(presentation.wheelPlanePitch)||0,
    wheelPlaneRoll:Number(presentation.wheelPlaneRoll)||0
  };
}

function gripProbe(vehicle,contacts,{speed,steerInput,throttle}={}){
  const steering=steeringCommand({vehicle,speedAbs:speed,input:steerInput},{});
  const steerAngle=steering.maxRoadWheelAngle*steering.target;
  const lat=lateralDynamicsEnvelope({
    vehicle,
    speed,
    steerAngle,
    steerInput,
    driveThrottle:throttle,
    onPavement:true,
    surfaceGrip:1,
    awdOffroadGripBonus:1,
    rearSlipAmount:0,
    airborne:false
  },{});

  const longitudinalMu=Math.max(.25,((vehicle.longitudinalAccelLimit??vehicle.brake??9.8)/9.80665));
  const requestedDrive=(Number(vehicle.accel)||0)*throttle;
  const drive=longitudinalTractionLimit({
    vehicle,
    requestedAccel:requestedDrive,
    surfaceMu:longitudinalMu,
    mode:'drive',
    airborne:false,
    speedAbs:speed
  },{});

  const grip=estimateWheelGripUsage({
    requestedLatAccel:lat.requestedLatAccel,
    signedLatAccel:lat.signedLatAccel,
    latLimit:lat.latLimit,
    longitudinalAccel:drive.acceleration,
    requestedPropulsionAccel:requestedDrive,
    appliedPropulsionAccel:drive.acceleration,
    propulsionAccel:drive.acceleration,
    serviceBrakeAccel:0,
    surfaceMu:longitudinalMu,
    throttle,
    handbrake:false,
    airborne:false,
    vehicle,
    speedAbs:speed,
    dt:1/60,
    contacts,
    previousUsage:new Array(Math.max(4,contacts.length)).fill(0)
  },{});

  return {
    steerAngle,
    requestedLatAccel:Number(lat.requestedLatAccel)||0,
    latLimit:Number(lat.latLimit)||0,
    driveAccel:Number(drive.acceleration)||0,
    frontLateral:Number(grip.frontLateral)||0,
    rearLateral:Number(grip.rearLateral)||0,
    fourWheelLateral:Math.min(Number(grip.frontLateral)||0,Number(grip.rearLateral)||0),
    trajectoryCapacity:Number(grip.trajectoryLateralCapacityAccel)||0,
    frontForceScale:Number(grip.frontLateralForceScale)||0,
    rearForceScale:Number(grip.rearLateralForceScale)||0,
    peakRaw:Math.max(0,...(grip.raw||[]).map(Number)),
    peakLateralUsage:Math.max(0,...(grip.lateralUsage||[]).map(Number)),
    peakLongitudinalUsage:Math.max(0,...(grip.longitudinalUsage||[]).map(Number))
  };
}

const cases=[];
const supportSummaries=[];
for(const vehicleId of VEHICLE_IDS){
  for(const pitchDeg of PITCHES){
    for(const twist of TWISTS){
      const support=presentationProbe(vehicleId,pitchDeg,twist);
      assert.equal(support.airborne,false,`${vehicleId} ${pitchDeg}deg twist ${twist}: static road support became airborne`);
      assert.equal(support.contacts.length,4,`${vehicleId}: expected four contacts`);
      const touching=support.contacts.filter(contact=>contact.contact).length;
      const factors=support.contacts.map(contact=>Number(contact.contactFactor)||0);
      const minFactor=Math.min(...factors);
      const meanFactor=factors.reduce((sum,value)=>sum+value,0)/factors.length;
      supportSummaries.push({vehicleId,pitchDeg,twist,touching,minFactor,meanFactor,factors});

      for(const speed of SPEEDS){
        for(const steerInput of STEER_INPUTS){
          for(const throttle of THROTTLES){
            const grip=gripProbe(support.vehicle,support.contacts,{speed,steerInput,throttle});
            cases.push({
              vehicleId,pitchDeg,twist,speedKmh:speed*3.6,steerInput,throttle,
              touching,minFactor,meanFactor,factors,
              ...grip
            });
          }
        }
      }
    }
  }
}

const finiteCases=cases.filter(entry=>Object.values(entry).every(value=>
  Array.isArray(value)?value.every(Number.isFinite):(typeof value!=='number'||Number.isFinite(value))
));
assert.equal(finiteCases.length,cases.length,'Issue #13 diagnostic produced non-finite physics values');

const flatControls=cases.filter(entry=>entry.pitchDeg===0&&entry.twist===0);
const slopedTransitions=cases.filter(entry=>Math.abs(entry.pitchDeg)>=5&&Math.abs(entry.twist)>=.03);
const sortedFourWheel=[...slopedTransitions].sort((a,b)=>b.fourWheelLateral-a.fourWheelLateral);
const sortedSupport=[...supportSummaries].sort((a,b)=>(a.touching-b.touching)||(a.meanFactor-b.meanFactor));
const worstFourWheel=sortedFourWheel[0]||null;
const worstSupport=sortedSupport[0]||null;
const flatWorst=[...flatControls].sort((a,b)=>b.fourWheelLateral-a.fourWheelLateral)[0]||null;

const lowSpeedBreakaway=slopedTransitions.filter(entry=>
  entry.speedKmh<=21.6&&
  entry.frontLateral>=.15&&
  entry.rearLateral>=.15
);
const degradedSupport=slopedTransitions.filter(entry=>entry.touching<4||entry.minFactor<.70);

console.log('ISSUE 13 LOW-SPEED LATERAL SLIDE DIAGNOSTIC',JSON.stringify({
  vehicles:VEHICLE_IDS.length,
  supportCases:supportSummaries.length,
  physicsCases:cases.length,
  degradedSupportCases:degradedSupport.length,
  lowSpeedFourWheelBreakawayCases:lowSpeedBreakaway.length,
  flatWorst,
  worstSupport,
  worstFourWheel,
  topFourWheel:sortedFourWheel.slice(0,12),
  topSupportLoss:sortedSupport.slice(0,12)
},null,2));
