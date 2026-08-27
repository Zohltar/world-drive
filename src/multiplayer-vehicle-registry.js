import {createVehicleSystem} from './vehicle-system.js';

// Multiplayer M3 — one registry for vehicle metrics and presentation contracts.
// Physical geometry is read from vehicle-system.js so network prediction,
// fallback support and HD presentation cannot silently drift from gameplay.

const PASSENGER_IDS=['id4','wrx','civic','sonata','f1_2010','countach_80','i3_2017'];

const PRESENTATION_OVERRIDES=Object.freeze({
  id4:Object.freeze({
    color:0x3b6e91,wheelRadius:.36,bodyHeight:.63,
    hdAsset:'id4_2021_detailed.glb',hdLengthScale:1,
    lightingStrategy:'id4'
  }),
  wrx:Object.freeze({
    color:0x2766a5,wheelRadius:.35,bodyHeight:.48,
    hdAsset:'subaru_wrx_vb.glb',hdLengthScale:1.20,
    lightingStrategy:'wrx'
  }),
  civic:Object.freeze({
    color:0x101317,wheelRadius:.34,bodyHeight:.47,
    hdAsset:'2006_honda_civic_si.glb',hdLengthScale:1,
    lightingStrategy:'civic'
  }),
  sonata:Object.freeze({
    color:0xe9edf0,wheelRadius:.35,bodyHeight:.48,
    hdAsset:'2006_hyundai_sonata.glb',hdLengthScale:1,
    lightingStrategy:'sonata'
  }),
  i3_2017:Object.freeze({
    color:0xf0f1ee,wheelRadius:.35,bodyHeight:.70,
    hdAsset:'2017_bmw_i3.glb',hdLengthScale:1.20,
    lightingStrategy:'i3_2017'
  }),
  f1_2010:Object.freeze({
    color:0xc51f27,wheelRadius:.32,bodyHeight:.24,
    hdAsset:'f1_2010_ferrari.glb',hdLengthScale:1,
    lightingStrategy:'f1_2010'
  }),
  countach_80:Object.freeze({
    color:0xd42222,wheelRadius:.34,bodyHeight:.34,
    hdAsset:'countach_80.glb',hdLengthScale:1.15,hdTargetWidth:2.08*1.15,
    lightingStrategy:'countach_80'
  }),
  semi_6x4:Object.freeze({
    color:0xb52b28,wheelRadius:.52,bodyHeight:2.65,
    hdAsset:null,hdLengthScale:1,
    lightingStrategy:'fallback'
  })
});

const profileCache=new Map();

function normalizedProfile(vehicleId){
  if(profileCache.has(vehicleId))return profileCache.get(vehicleId);
  const system=createVehicleSystem({initialId:vehicleId});
  const profile=system.active;
  profileCache.set(vehicleId,profile);
  return profile;
}

const fleetIds=Object.freeze(
  createVehicleSystem({initialId:'wrx'}).list().map(entry=>entry.id)
);

function supportContactsFromAxles(physics,wheelRadius){
  const contacts=[];
  for(const axle of physics.axles||[]){
    const halfTrack=Math.max(.4,Number(axle.trackWidth)||Number(physics.trackWidth)||1.55)/2;
    const z=Number(axle.positionM)||0;
    const front=Math.abs(Number(axle.steerFactor)||0)>.001;

    // Dual tires do not need duplicate terrain probes. One left + one right
    // contact per physical axle gives the support plane the correct geometry
    // while retaining arbitrary multi-axle chassis support.
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
  const override=PRESENTATION_OVERRIDES[vehicleId]||PRESENTATION_OVERRIDES.wrx;
  const wheelRadius=Math.max(.20,Number(override.wheelRadius)||.34);
  const bodyLength=Math.max(1,Number(physics.bodyLength)||Number(physics.wheelbase)+1.5);
  const bodyWidth=Math.max(.8,Number(physics.bodyWidth)||Number(physics.trackWidth)+.25);
  const hdTargetLength=override.hdAsset
    ?bodyLength*Math.max(.5,Number(override.hdLengthScale)||1)
    :null;

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
      axles:Object.freeze((physics.axles||[]).map(axle=>Object.freeze({...axle})))
    }),
    visual:Object.freeze({
      color:override.color,
      bodyHeight:override.bodyHeight,
      wheelRadius,
      rideHeight:Number(profile.visual?.rideHeight)||wheelRadius,
      supportContacts:supportContactsFromAxles(physics,wheelRadius)
    }),
    hd:Object.freeze({
      enabled:!!override.hdAsset,
      asset:override.hdAsset,
      targetLength:hdTargetLength,
      targetWidth:Number.isFinite(override.hdTargetWidth)?override.hdTargetWidth:null
    }),
    lighting:Object.freeze({strategy:override.lightingStrategy||'fallback'})
  });
}

const specs=new Map(fleetIds.map(id=>[id,buildSpec(id)]));

export function getMultiplayerVehicleSpec(vehicleId){
  return specs.get(vehicleId)||specs.get('wrx');
}

export function listMultiplayerVehicleSpecs(){
  return [...specs.values()];
}

export function listMultiplayerVehicleIds(){
  return [...fleetIds];
}

export function isPassengerHdVehicle(vehicleId){
  return PASSENGER_IDS.includes(vehicleId)&&!!getMultiplayerVehicleSpec(vehicleId).hd.enabled;
}

export function multiplayerRegistryDiagnostics(){
  return listMultiplayerVehicleSpecs().map(spec=>({
    id:spec.id,
    vehicleClass:spec.vehicleClass,
    wheelbase:spec.physics.wheelbase,
    trackWidth:spec.physics.trackWidth,
    axles:spec.physics.axles.length,
    supportContacts:spec.visual.supportContacts.length,
    hd:spec.hd.enabled,
    lighting:spec.lighting.strategy
  }));
}
