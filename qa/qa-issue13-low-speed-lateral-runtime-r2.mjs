import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {createVehicleVisualSystem} from '../src/vehicles/vehicle-visuals.js';
import {createVehiclePresentation} from '../src/vehicles/vehicle-presentation.js';
import {
  steeringCommand,
  lateralDynamicsEnvelope,
  longitudinalTractionLimit,
  estimateWheelGripUsage,
  yawResponseRate
} from '../src/physics/vehicle-dynamics.js';
import {advanceYawAuthority} from '../src/physics/yaw-authority.js';
import {advanceMomentumDirection,travelAxisSideslip} from '../src/physics/momentum-direction.js';
import {
  ROAD_WHEEL_CONTACT_HALF_WIDTH,WHEEL_RADIUS,TIRE_HALF_WIDTH,TIRE_VISUAL_CLEARANCE
} from '../src/world-materials.js';

const DEG=Math.PI/180;
const DT=1/120;
const IDS=['id4','wrx','civic','sonata','i3_2017','countach_80'];
const PITCHES=[-15,-10,-5,5,10,15];
const TWISTS=[-.06,-.045,-.03,.03,.045,.06];
const SPEEDS=[1,2,3];
const STEERS=[.35,.65];

function contactsFor(vehicleId,pitchDeg,twist){
  const vehicleSystem=createVehicleSystem({initialId:vehicleId});
  const vehicle=vehicleSystem.physics;
  const scene=new THREE.Scene();
  const visuals=createVehicleVisualSystem({THREE,scene,vehicleSystem});
  const sun=new THREE.DirectionalLight(0xffffff,1);scene.add(sun);
  const slope=Math.tan(pitchDeg*DEG);
  const groundHeight=(x,z)=>slope*(Number(z)||0)+Number(twist||0)*(Number(x)||0)*(Number(z)||0);
  const state={absX:0,absZ:0,heading:0,velocityHeading:0,speed:0,longitudinalAccel:0,rearSlipAmount:0,VEHICLE:vehicle};
  const presentation=createVehiclePresentation({
    THREE,scene,car:visuals.car,bodyGroup:visuals.bodyGroup,wheels:visuals.wheels,vehicleSystem,sun,
    roadSurfaceAt:(x,z)=>({lateral:0,y:groundHeight(x,z)}),terrainAbs:groundHeight,groundHeightForWheel:groundHeight,
    activeVehicleWheels:visuals.activeVehicleWheels,getDrivingState:()=>state,
    ROAD_WHEEL_CONTACT_HALF_WIDTH,WHEEL_RADIUS,TIRE_HALF_WIDTH,TIRE_VISUAL_CLEARANCE
  });
  for(let i=0;i<260;i++)presentation.updateSuspensionVisuals(DT,true,0);
  return {
    vehicle,
    contacts:presentation.wheelContacts.map(c=>({
      front:!!c.front,axleIndex:Number.isInteger(c.axleIndex)?c.axleIndex:0,side:c.side,
      contact:c.contact!==false,contactFactor:Number(c.contactFactor)||0,
      localX:Number(c.localX)||0,localZ:Number(c.localZ)||0,ground:Number(c.ground)||0
    }))
  };
}

function simulate({vehicle,contacts,speed,steerInput,throttle=.2,duration=1.25}){
  let heading=0,velocityHeading=0,dynamicYawRate=0,frontSlipAmount=0,rearSlipAmount=0;
  let previousUsage=new Array(Math.max(4,contacts.length)).fill(0);
  let peakSideslip=0,peakForceCoupled=0,peakFrontSlip=0,peakRearSlip=0,minTrajectoryCapacity=Infinity;
  const steering=steeringCommand({vehicle,speedAbs:speed,input:steerInput},{});
  const steerAngle=steering.maxRoadWheelAngle*steering.target;
  const longitudinalMu=Math.max(.25,((vehicle.longitudinalAccelLimit??vehicle.brake??9.8)/9.80665));
  const requestedDrive=(Number(vehicle.accel)||0)*throttle;
  const drive=longitudinalTractionLimit({vehicle,requestedAccel:requestedDrive,surfaceMu:longitudinalMu,mode:'drive',airborne:false,speedAbs:speed},{});
  const steps=Math.ceil(duration/DT);
  for(let step=0;step<steps;step++){
    const lateral=lateralDynamicsEnvelope({
      vehicle,speed,steerAngle,steerInput,driveThrottle:throttle,onPavement:true,
      surfaceGrip:1,awdOffroadGripBonus:1,rearSlipAmount:0,airborne:false
    },{});
    const tireSolverLatAccel=Math.min(Math.max(0,lateral.requestedLatAccel),Math.max(0,lateral.latLimit));
    const signedLatAccel=Math.sign(lateral.signedLatAccel||steerAngle||1)*tireSolverLatAccel;
    const grip=estimateWheelGripUsage({
      requestedLatAccel:tireSolverLatAccel,signedLatAccel,latLimit:lateral.latLimit,
      longitudinalAccel:drive.acceleration,requestedPropulsionAccel:requestedDrive,
      appliedPropulsionAccel:drive.acceleration,propulsionAccel:drive.acceleration,serviceBrakeAccel:0,
      surfaceMu:longitudinalMu,throttle,handbrake:false,airborne:false,vehicle,speedAbs:speed,dt:DT,
      contacts,previousUsage
    },{});
    previousUsage=[...(grip.smoothed||[])];
    const targetFrontSlip=Number(grip.frontLateral)||0;
    const targetRearSlip=Number(grip.rearLateral)||0;
    const lowSpeedSlipReleaseBoost=1+(1-Math.max(0,Math.min(1,speed/8)))*1.6;
    frontSlipAmount+=(targetFrontSlip-frontSlipAmount)*(1-Math.exp(-DT*(targetFrontSlip>frontSlipAmount?7.8:5.8*lowSpeedSlipReleaseBoost)));
    rearSlipAmount+=(targetRearSlip-rearSlipAmount)*(1-Math.exp(-DT*(targetRearSlip>rearSlipAmount?7.8:5.8*lowSpeedSlipReleaseBoost)));
    const currentSideslip=travelAxisSideslip({heading,velocityHeading});
    const frontScale=Number.isFinite(grip.frontLateralForceScale)?Math.max(0,Math.min(1,grip.frontLateralForceScale)):1;
    const rearScale=Number.isFinite(grip.rearLateralForceScale)?Math.max(0,Math.min(1,grip.rearLateralForceScale)):1;
    const rearForceLoss=Math.abs(signedLatAccel)>.15?1-rearScale:0;
    const yaw=advanceYawAuthority({
      yawRate:lateral.yawRate,dynamicYawRate,dt:DT,yawResponse:yawResponseRate({vehicle,speedAbs:speed,airborne:false}),
      requestedLatAccel:lateral.requestedLatAccel,latLimit:lateral.latLimit,
      frontSlipAmount,rearSlipAmount,airborne:false,useLegacyDriftAssist:true,
      drivetrain:lateral.drivetrain,powerCorneringLoad:lateral.powerCorneringLoad,steer:steerInput,
      powerOversteerYaw:vehicle.powerOversteerYaw,speedAbs:speed,speed,steeringTravelSpeed:speed,handbrake:false,
      currentSideslip,frictionYawAccel:Number(grip.frictionYawAccel)||0,rearLateralForceLoss:rearForceLoss,
      physicalTireYawAccel:Number(grip.frictionYawAccel)||0,targetFrontSlip,targetRearSlip,
      frontLateralForceScale:frontScale,rearLateralForceScale:rearScale
    });
    dynamicYawRate=yaw.dynamicYawRate;
    heading+=dynamicYawRate*DT;
    const trajectoryCapacity=Number.isFinite(grip.trajectoryLateralCapacityAccel)?Math.max(0,grip.trajectoryLateralCapacityAccel):Math.max(0,lateral.latLimit);
    const netLateralAccel=Number.isFinite(grip.netLateralAccel)?grip.netLateralAccel:signedLatAccel;
    velocityHeading=advanceMomentumDirection({
      velocityHeading,heading,speed,speedAbs:speed,dt:DT,airborne:false,
      frontSlipAmount,rearSlipAmount,forceCoupledSlide:yaw.forceCoupledSlide,
      frictionTrajectoryLoss:yaw.frictionYawLoss,offroadMomentumYawRate:0,onPavement:true,
      driftPhysicalAuthority:yaw.driftPhysicalAuthority,driftKinematicScale:yaw.driftKinematicScale,
      useLegacyDriftAssist:true,netLateralAccel,
      physicalTrajectoryYawRate:netLateralAccel/Math.max(.5,speed),trajectoryLateralCapacityAccel:trajectoryCapacity
    });
    const slip=travelAxisSideslip({heading,velocityHeading});
    peakSideslip=Math.max(peakSideslip,slip);
    peakForceCoupled=Math.max(peakForceCoupled,yaw.forceCoupledSlide);
    peakFrontSlip=Math.max(peakFrontSlip,frontSlipAmount);
    peakRearSlip=Math.max(peakRearSlip,rearSlipAmount);
    minTrajectoryCapacity=Math.min(minTrajectoryCapacity,trajectoryCapacity);
  }
  return {
    finalSideslipDeg:travelAxisSideslip({heading,velocityHeading})/DEG,
    peakSideslipDeg:peakSideslip/DEG,
    peakForceCoupled,peakFrontSlip,peakRearSlip,minTrajectoryCapacity,
    touching:contacts.filter(c=>c.contact).length,
    factors:contacts.map(c=>c.contactFactor)
  };
}

const rows=[];
for(const vehicleId of IDS){
  const flat=contactsFor(vehicleId,0,0);
  for(const speed of SPEEDS)for(const steerInput of STEERS){
    const flatResult=simulate({vehicle:flat.vehicle,contacts:flat.contacts,speed,steerInput});
    for(const pitchDeg of PITCHES)for(const twist of TWISTS){
      const support=contactsFor(vehicleId,pitchDeg,twist);
      const result=simulate({vehicle:support.vehicle,contacts:support.contacts,speed,steerInput});
      rows.push({vehicleId,pitchDeg,twist,speedKmh:speed*3.6,steerInput,flatPeak:flatResult.peakSideslipDeg,...result});
    }
  }
}

assert.ok(rows.every(row=>Object.values(row).every(value=>Array.isArray(value)?value.every(Number.isFinite):(typeof value!=='number'||Number.isFinite(value)))),'non-finite Issue #13 trajectory state');
const ranked=[...rows].sort((a,b)=>(b.peakSideslipDeg-b.flatPeak)-(a.peakSideslipDeg-a.flatPeak));
const pathological=rows.filter(row=>row.speedKmh<=10.8&&row.peakSideslipDeg>=5&&row.peakSideslipDeg>=row.flatPeak+3);
const bySpeed=SPEEDS.map(speed=>{
  const sample=rows.filter(row=>row.speedKmh===speed*3.6);
  return {speedKmh:speed*3.6,cases:sample.length,pathological:sample.filter(row=>row.peakSideslipDeg>=5&&row.peakSideslipDeg>=row.flatPeak+3).length,maxExcessDeg:Math.max(...sample.map(row=>row.peakSideslipDeg-row.flatPeak))};
});
console.log('ISSUE 13 LOW-SPEED TRAJECTORY RECOVERY DIAGNOSTIC',JSON.stringify({
  cases:rows.length,pathologicalVeryLowCases:pathological.length,bySpeed,
  worst:ranked[0]||null,top:ranked.slice(0,16)
},null,2));
