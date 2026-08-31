import {createVehicleSystem} from '../vehicle-system.js';
import {getAuthoredVehicleDescriptor} from '../vehicle-authored-registry.js';

// Multiplayer M4 metric/support registry.
//
// This file deliberately knows NOTHING about GLB files, lamp meshes, materials
// or authored controller internals. Those belong exclusively to
// vehicle-authored-registry.js and the local vehicle controllers. Multiplayer
// keeps only the normalized physical dimensions needed for prediction, terrain
// support and the temporary loading fallback.

const SUPPORT_PRESENTATION=Object.freeze({
  id4:Object.freeze({color:0x3b6e91,wheelRadius:.36,bodyHeight:.63}),
  wrx:Object.freeze({color:0x2766a5,wheelRadius:.35,bodyHeight:.48}),
  civic:Object.freeze({color:0x101317,wheelRadius:.34,bodyHeight:.47}),
  sonata:Object.freeze({color:0xe9edf0,wheelRadius:.35,bodyHeight:.48}),
  i3_2017:Object.freeze({color:0xf0f1ee,wheelRadius:.35,bodyHeight:.70}),
  f1_2010:Object.freeze({color:0xc51f27,wheelRadius:.32,bodyHeight:.24}),
  countach_80:Object.freeze({color:0xd42222,wheelRadius:.34,bodyHeight:.34}),
  semi_6x4:Object.freeze({color:0xb52b28,wheelRadius:.52,bodyHeight:2.65})
});

const profileCache=new Map();
function normalizedProfile(vehicleId){
  if(profileCache.has(vehicleId))return profileCache.get(vehicleId);
  const profile=createVehicleSystem({initialId:vehicleId}).active;
  profileCache.set(vehicleId,profile);
  return profile;
}
const fleetIds=Object.freeze(createVehicleSystem({initialId:'wrx'}).list().map(entry=>entry.id));

function supportContactsFromAxles(physics,wheelRadius){
  const contacts=[];
  for(const axle of physics.axles||[]){
    const halfTrack=Math.max(.4,Number(axle.trackWidth)||Number(physics.trackWidth)||1.55)/2;
    const z=Number(axle.positionM)||0;
    const front=Math.abs(Number(axle.steerFactor)||0)>.001;
    contacts.push(
      Object.freeze({axleId:axle.id,side:'left',x:-halfTrack,z,front,radius:wheelRadius}),
      Object.freeze({axleId:axle.id,side:'right',x:halfTrack,z,front,radius:wheelRadius})
    );
  }
  return Object.freeze(contacts);
}

function buildSpec(vehicleId){
  const profile=normalizedProfile(vehicleId);
  const physics=profile.physics;
  const support=SUPPORT_PRESENTATION[vehicleId]||SUPPORT_PRESENTATION.wrx;
  const wheelRadius=Math.max(.20,Number(support.wheelRadius)||.34);
  const bodyLength=Math.max(1,Number(physics.bodyLength)||Number(physics.wheelbase)+1.5);
  const bodyWidth=Math.max(.8,Number(physics.bodyWidth)||Number(physics.trackWidth)+.25);
  return Object.freeze({
    id:vehicleId,
    name:profile.name,
    description:profile.description,
    vehicleClass:physics.vehicleClass||'passenger',
    physics:Object.freeze({
      wheelbase:Number(physics.wheelbase),
      trackWidth:Number(physics.trackWidth),
      bodyLength,
      bodyWidth,
      maxSteerLow:Number(physics.maxSteerLow)||.43,
      axles:Object.freeze((physics.axles||[]).map(axle=>Object.freeze({...axle})))
    }),
    visual:Object.freeze({
      color:support.color,
      bodyHeight:support.bodyHeight,
      wheelRadius,
      rideHeight:Number(profile.visual?.rideHeight)||wheelRadius,
      supportContacts:supportContactsFromAxles(physics,wheelRadius)
    })
  });
}

const specs=new Map(fleetIds.map(id=>[id,buildSpec(id)]));
export function getMultiplayerVehicleSpec(vehicleId){return specs.get(vehicleId)||specs.get('wrx');}
export function listMultiplayerVehicleSpecs(){return [...specs.values()];}
export function listMultiplayerVehicleIds(){return [...fleetIds];}

// Compatibility helper for older diagnostics. Authored visual ownership is now
// answered by the canonical controller registry, never by an HD asset table.
export function isPassengerHdVehicle(vehicleId){
  return getAuthoredVehicleDescriptor(vehicleId)?.kind==='passenger';
}

export function multiplayerRegistryDiagnostics(){
  return listMultiplayerVehicleSpecs().map(spec=>({
    id:spec.id,
    vehicleClass:spec.vehicleClass,
    wheelbase:spec.physics.wheelbase,
    trackWidth:spec.physics.trackWidth,
    axles:spec.physics.axles.length,
    supportContacts:spec.visual.supportContacts.length,
    authoredController:!!getAuthoredVehicleDescriptor(spec.id)
  }));
}
