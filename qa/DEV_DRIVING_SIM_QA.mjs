import assert from 'node:assert/strict';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicles/vehicle-system.js';
import {
  GRAVITY,
  steeringCommand,
  lateralDynamicsEnvelope,
  longitudinalTractionLimit,
  estimateWheelGripUsage,
  computeGradeAcceleration
} from '../src/physics/vehicle-dynamics.js';

const validation=validateVehicleProfiles();
assert.equal(validation.ok,true,validation.errors.join('\n'));

const system=createVehicleSystem({initialId:'wrx'});
const fleet=system.list();

function finite(value){return Number.isFinite(Number(value));}
function contactsFor(vehicle,contactFactor=1,contact=true){
  const out=[];
  for(let axleIndex=0;axleIndex<vehicle.axles.length;axleIndex++){
    const axle=vehicle.axles[axleIndex];
    const perSide=Math.max(1,Math.round((Number(axle.wheelCount)||2)/2));
    for(const side of ['left','right'])for(let i=0;i<perSide;i++){
      out.push({front:axleIndex===0,side,axleIndex,contact,contactFactor});
    }
  }
  return out;
}

const reports=[];
for(const info of fleet){
  if(system.activeId!==info.id)system.select(info.id);
  const v=system.physics;
  const top=Math.max(12,(Number(v.topSpeedKmh)||180)/3.6);
  const speedCases=[8,Math.min(20,top*.45),Math.min(35,top*.72),Math.min(50,top*.92)].filter((x,i,a)=>x>0&&a.indexOf(x)===i);
  let matrixCases=0;
  let peakRawGrip=0;
  let peakSlip=0;
  let peakBrakeLatDemand=0;
  let nonFinite=0;

  for(const speed of speedCases){
    for(const input of [.18,.42,.72]){
      const steer=steeringCommand({vehicle:v,speedAbs:speed,input});
      const lat=lateralDynamicsEnvelope({
        vehicle:v,speed,steerAngle:steer.maxRoadWheelAngle*steer.target,steerInput:input,
        driveThrottle:0,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,rearSlipAmount:0,airborne:false
      });
      assert.ok(finite(lat.yawRate)&&finite(lat.latLimit)&&finite(lat.requestedLatAccel),`${info.id}: non-finite lateral state`);
      for(const brakeRequest of [-2.5,-5,-9.5]){
        const brake=longitudinalTractionLimit({vehicle:v,requestedAccel:brakeRequest,surfaceMu:1,mode:'brake',airborne:false,speedAbs:speed});
        assert.ok(finite(brake.acceleration)&&finite(brake.limit),`${info.id}: non-finite brake limit`);
        const contacts=contactsFor(v);
        const grip=estimateWheelGripUsage({
          requestedLatAccel:Math.min(Math.abs(lat.requestedLatAccel),lat.latLimit*1.25),
          signedLatAccel:Math.sign(lat.signedLatAccel||1)*Math.min(Math.abs(lat.signedLatAccel||0),lat.latLimit*1.25),
          latLimit:lat.latLimit,
          longitudinalAccel:brake.acceleration,
          propulsionAccel:0,
          serviceBrakeAccel:brake.acceleration,
          surfaceMu:1,
          throttle:0,
          handbrake:false,
          airborne:false,
          vehicle:v,
          speedAbs:speed,
          dt:1/60,
          contacts,
          previousUsage:new Array(contacts.length).fill(0)
        });
        for(const value of [...(grip.raw||[]),...(grip.smoothed||[]),...(grip.slip||[])])if(!finite(value))nonFinite++;
        peakRawGrip=Math.max(peakRawGrip,...(grip.raw||[0]).map(Number));
        peakSlip=Math.max(peakSlip,...(grip.slip||[0]).map(Number));
        peakBrakeLatDemand=Math.max(peakBrakeLatDemand,Math.hypot(Math.abs(lat.signedLatAccel||0),Math.abs(brake.acceleration||0)));
        matrixCases++;
      }
    }
  }
  assert.equal(nonFinite,0,`${info.id}: non-finite friction-circle result`);
  assert.ok(peakRawGrip<3.5,`${info.id}: pathological wheel grip demand ${peakRawGrip}`);

  // Crest/contact-unloading sweep. This does not fake a jump trajectory; it
  // stresses the exact wheel-contact weighting used when the chassis unloads.
  const crest=[];
  let previousUsage=new Array(contactsFor(v).length).fill(0);
  for(const factor of [1,.75,.5,.3,.15,.05]){
    const contacts=contactsFor(v,factor,true);
    const grip=estimateWheelGripUsage({
      requestedLatAccel:Math.min(Number(v.lateralAccelLimit)||7,6),
      signedLatAccel:Math.min(Number(v.lateralAccelLimit)||7,6),
      latLimit:Math.max(1,Number(v.lateralAccelLimit)||7),
      longitudinalAccel:-2.8,propulsionAccel:0,serviceBrakeAccel:-2.8,
      surfaceMu:1,throttle:0,handbrake:false,airborne:false,vehicle:v,speedAbs:27,dt:1/60,
      contacts,previousUsage
    });
    previousUsage=[...(grip.smoothed||[])];
    const peak=Math.max(0,...(grip.raw||[]).map(Number));
    assert.ok(finite(peak),`${info.id}: crest grip non-finite`);
    crest.push({contactFactor:factor,peakRaw:peak,peakSlip:Math.max(0,...(grip.slip||[]).map(Number))});
  }
  const airborne=estimateWheelGripUsage({
    requestedLatAccel:6,signedLatAccel:6,latLimit:Math.max(1,Number(v.lateralAccelLimit)||7),
    longitudinalAccel:-2.8,propulsionAccel:0,serviceBrakeAccel:-2.8,surfaceMu:1,throttle:0,handbrake:false,
    airborne:true,vehicle:v,speedAbs:27,dt:1/60,contacts:contactsFor(v,0,false),previousUsage
  });
  assert.ok([...(airborne.raw||[]),...(airborne.smoothed||[]),...(airborne.slip||[])].every(finite),`${info.id}: airborne grip non-finite`);

  // Grade solver symmetry: uphill must retard forward travel and downhill must
  // accelerate it. Opposite heading must reverse the sign.
  const pitch=.12;
  const up=computeGradeAcceleration({onPavement:true,roadFrame:{pitch,angle:0},heading:0,airborne:false});
  const reverse=computeGradeAcceleration({onPavement:true,roadFrame:{pitch,angle:0},heading:Math.PI,airborne:false});
  assert.ok(up.acceleration<0,`${info.id}: uphill grade sign`);
  assert.ok(reverse.acceleration>0,`${info.id}: reverse-heading grade sign`);
  assert.ok(Math.abs(Math.abs(up.acceleration)-Math.abs(reverse.acceleration))<1e-8,`${info.id}: grade symmetry`);
  assert.ok(Math.abs(up.acceleration)<=GRAVITY+.01,`${info.id}: grade acceleration impossible`);

  reports.push({
    vehicleId:info.id,
    vehicleClass:info.vehicleClass,
    matrixCases,
    peakRawGrip:Number(peakRawGrip.toFixed(3)),
    peakSlip:Number(peakSlip.toFixed(3)),
    peakBrakeLatDemand:Number(peakBrakeLatDemand.toFixed(3)),
    crest:crest.map(x=>({contactFactor:x.contactFactor,peakRaw:Number(x.peakRaw.toFixed(3)),peakSlip:Number(x.peakSlip.toFixed(3))})),
    airbornePeakRaw:Number(Math.max(0,...(airborne.raw||[]).map(Number)).toFixed(3)),
    uphillAccel:Number(up.acceleration.toFixed(3))
  });
}

console.log('DEV DRIVING SIMULATION QA: PASS',JSON.stringify({
  vehicles:reports.length,
  totalMatrixCases:reports.reduce((s,r)=>s+r.matrixCases,0),
  reports
},null,2));
