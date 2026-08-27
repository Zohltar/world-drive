import {createVehicleSystem} from './vehicle-system.js';

// Multiplayer M3 — one registry for vehicle metrics and presentation contracts.
// Physical geometry is read from vehicle-system.js so network prediction,
// fallback support and HD presentation cannot silently drift from gameplay.

const PASSENGER_IDS=['id4','wrx','civic','sonata','f1_2010','countach_80','i3_2017'];

const LIGHTING_CONTRACTS=Object.freeze({
  wrx:Object.freeze({
    strategy:'wrx',
    requiredFamilies:['brake','reverse','night','signal-left','signal-right'],
    brakePaths:['fh_light_glass_red_material','fh_taillight_new_material','fh_chmsl_new_material'],
    // Binary GLB audit: the real reverse geometry lives under this node path;
    // its material is misleadingly named "Eblems", so never detect it by mat name.
    reversePaths:['fh_reverse_material'],
    headlightPaths:['fh_lowhighbeam_material'],
    // The WRX asset has clean L/R front indicators, but its rear indicator mesh
    // is a single authored branch with an asymmetric "R" name. Treat that rear
    // lens as shared geometry and split it by local X at presentation time.
    leftSignalPaths:['fh_front_indicator_orange_l_material'],
    rightSignalPaths:['fh_front_indicator_orange_r_material'],
    sharedRearSignalPaths:['fh_signal_r_material_19']
  }),
  civic:Object.freeze({
    strategy:'civic',
    requiredFamilies:['brake','reverse','night','signal-left','signal-right'],
    materials:['red_glass','ambas_glass','glass','light_R','lights']
  }),
  sonata:Object.freeze({
    strategy:'sonata',
    requiredFamilies:['brake','reverse','night','signal-left','signal-right'],
    exactNodes:['Object_46','Object_33','Object_7'],
    texturedNodes:true
  }),
  i3_2017:Object.freeze({
    strategy:'i3_2017',
    requiredFamilies:['brake','reverse','night','signal-left','signal-right'],
    materials:['carro_refletor_farol','carro_refletor_farol_1','carro_vidros_vermelhos','carro_vidros_vermelhos_1','carro_refletor_lanterna','carro_refletor_lanterna_2']
  }),
  countach_80:Object.freeze({
    strategy:'countach_80',
    requiredFamilies:['brake','reverse','night','signal-left','signal-right'],
    materials:['SignalLights','Lights','HeadlightGlass']
  }),
  id4:Object.freeze({
    strategy:'id4',
    requiredFamilies:['brake','reverse','night','signal-left','signal-right'],
    exactNodes:['13_headlight_glass_glass_0','16_headlight_white_plastic_white_P_0','13_headlight_glass_1_glass_0','52_trunk_tilllight_glass_glass_0'],
    materials:['inner_red'],
    authoredParent:'group1'
  }),
  f1_2010:Object.freeze({
    strategy:'f1_2010',
    // The local F1 has one authored rear safety lamp, not road-car indicators or
    // headlamps. Multiplayer mirrors the real local capability instead of
    // inventing road lighting that the source vehicle does not have.
    requiredFamilies:['brake','reverse'],
    exactNodes:['REARLEDs_011_001_RearLight_0','light_rear_light_4_0']
  }),
  fallback:Object.freeze({strategy:'fallback',requiredFamilies:['brake','reverse','night','signal-left','signal-right']})
});

const PRESENTATION_OVERRIDES=Object.freeze({
  id4:Object.freeze({color:0x3b6e91,wheelRadius:.36,bodyHeight:.63,hdAsset:'id4_2021_detailed.glb',hdUrl:new URL('./assets/id4_2021_detailed.glb',import.meta.url).href,hdLengthScale:1,lighting:'id4'}),
  wrx:Object.freeze({color:0x2766a5,wheelRadius:.35,bodyHeight:.48,hdAsset:'subaru_wrx_vb.glb',hdUrl:new URL('./assets/subaru_wrx_vb.glb',import.meta.url).href,hdLengthScale:1.20,lighting:'wrx'}),
  civic:Object.freeze({color:0x101317,wheelRadius:.34,bodyHeight:.47,hdAsset:'2006_honda_civic_si.glb',hdUrl:new URL('./assets/2006_honda_civic_si.glb',import.meta.url).href,hdLengthScale:1,lighting:'civic'}),
  sonata:Object.freeze({color:0xe9edf0,wheelRadius:.35,bodyHeight:.48,hdAsset:'2006_hyundai_sonata.glb',hdUrl:new URL('./assets/2006_hyundai_sonata.glb',import.meta.url).href,hdLengthScale:1,lighting:'sonata'}),
  i3_2017:Object.freeze({color:0xf0f1ee,wheelRadius:.35,bodyHeight:.70,hdAsset:'2017_bmw_i3.glb',hdUrl:new URL('./assets/2017_bmw_i3.glb',import.meta.url).href,hdLengthScale:1.20,lighting:'i3_2017'}),
  f1_2010:Object.freeze({color:0xc51f27,wheelRadius:.32,bodyHeight:.24,hdAsset:'f1_2010_ferrari.glb',hdUrl:new URL('./assets/f1_2010_ferrari.glb',import.meta.url).href,hdLengthScale:1,lighting:'f1_2010'}),
  countach_80:Object.freeze({color:0xd42222,wheelRadius:.34,bodyHeight:.34,hdAsset:'countach_80.glb',hdUrl:new URL('./assets/countach_80.glb',import.meta.url).href,hdLengthScale:1.15,hdTargetWidth:2.08*1.15,lighting:'countach_80'}),
  semi_6x4:Object.freeze({color:0xb52b28,wheelRadius:.52,bodyHeight:2.65,hdAsset:null,hdUrl:null,hdLengthScale:1,lighting:'fallback'})
});

const profileCache=new Map();
function normalizedProfile(vehicleId){
  if(profileCache.has(vehicleId))return profileCache.get(vehicleId);
  const profile=createVehicleSystem({initialId:vehicleId}).active;profileCache.set(vehicleId,profile);return profile;
}
const fleetIds=Object.freeze(createVehicleSystem({initialId:'wrx'}).list().map(entry=>entry.id));

function supportContactsFromAxles(physics,wheelRadius){
  const contacts=[];
  for(const axle of physics.axles||[]){
    const halfTrack=Math.max(.4,Number(axle.trackWidth)||Number(physics.trackWidth)||1.55)/2,z=Number(axle.positionM)||0,front=Math.abs(Number(axle.steerFactor)||0)>.001;
    contacts.push(Object.freeze({axleId:axle.id,side:'left',x:-halfTrack,z,front,radius:wheelRadius}),Object.freeze({axleId:axle.id,side:'right',x:halfTrack,z,front,radius:wheelRadius}));
  }
  return Object.freeze(contacts);
}

function buildSpec(vehicleId){
  const profile=normalizedProfile(vehicleId),physics=profile.physics,override=PRESENTATION_OVERRIDES[vehicleId]||PRESENTATION_OVERRIDES.wrx;
  const wheelRadius=Math.max(.20,Number(override.wheelRadius)||.34),bodyLength=Math.max(1,Number(physics.bodyLength)||Number(physics.wheelbase)+1.5),bodyWidth=Math.max(.8,Number(physics.bodyWidth)||Number(physics.trackWidth)+.25);
  const lighting=LIGHTING_CONTRACTS[override.lighting]||LIGHTING_CONTRACTS.fallback;
  return Object.freeze({
    id:vehicleId,name:profile.name,description:profile.description,vehicleClass:physics.vehicleClass||'passenger',
    physics:Object.freeze({wheelbase:Number(physics.wheelbase),trackWidth:Number(physics.trackWidth),bodyLength,bodyWidth,axles:Object.freeze((physics.axles||[]).map(axle=>Object.freeze({...axle})))}),
    visual:Object.freeze({color:override.color,bodyHeight:override.bodyHeight,wheelRadius,rideHeight:Number(profile.visual?.rideHeight)||wheelRadius,supportContacts:supportContactsFromAxles(physics,wheelRadius)}),
    hd:Object.freeze({enabled:!!override.hdUrl,asset:override.hdAsset,url:override.hdUrl,targetLength:override.hdUrl?bodyLength*Math.max(.5,Number(override.hdLengthScale)||1):null,targetWidth:Number.isFinite(override.hdTargetWidth)?override.hdTargetWidth:null}),
    lighting
  });
}

const specs=new Map(fleetIds.map(id=>[id,buildSpec(id)]));
export function getMultiplayerVehicleSpec(vehicleId){return specs.get(vehicleId)||specs.get('wrx');}
export function listMultiplayerVehicleSpecs(){return [...specs.values()];}
export function listMultiplayerVehicleIds(){return [...fleetIds];}
export function isPassengerHdVehicle(vehicleId){return PASSENGER_IDS.includes(vehicleId)&&!!getMultiplayerVehicleSpec(vehicleId).hd.enabled;}
export function multiplayerRegistryDiagnostics(){return listMultiplayerVehicleSpecs().map(spec=>({id:spec.id,vehicleClass:spec.vehicleClass,wheelbase:spec.physics.wheelbase,trackWidth:spec.physics.trackWidth,axles:spec.physics.axles.length,supportContacts:spec.visual.supportContacts.length,hd:spec.hd.enabled,lighting:spec.lighting.strategy,requiredLighting:[...(spec.lighting.requiredFamilies||[])]}));}
