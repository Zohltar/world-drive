// World Drive M4 — canonical authored-vehicle controller registry.
//
// Local gameplay and multiplayer must resolve the SAME controller factory for a
// vehicle. This file owns only that mapping; per-vehicle visual contracts belong
// inside their authored controllers.

const DESCRIPTORS=Object.freeze({
  id4:Object.freeze({
    id:'id4',label:'ID.4',kind:'passenger',modulePath:'src/id4-glb.js',exportName:'createId4GlbSystem',
    capabilities:Object.freeze(['body','materials','wheels','steering','brake','reverse','night']),
    loadModule:()=>import('./id4-glb.js')
  }),
  wrx:Object.freeze({
    id:'wrx',label:'WRX',kind:'passenger',modulePath:'src/wrx-glb.js',exportName:'createWrxGlbSystem',
    capabilities:Object.freeze(['body','materials','wheels','steering','brake','reverse','night']),
    loadModule:()=>import('./wrx-glb.js')
  }),
  civic:Object.freeze({
    id:'civic',label:'Civic',kind:'passenger',modulePath:'src/civic-glb.js',exportName:'createCivicGlbSystem',
    capabilities:Object.freeze(['body','materials','wheels','steering','brake','reverse','night']),
    loadModule:()=>import('./civic-glb.js')
  }),
  sonata:Object.freeze({
    id:'sonata',label:'Sonata',kind:'passenger',modulePath:'src/sonata-glb.js',exportName:'createSonataGlbSystem',
    capabilities:Object.freeze(['body','materials','wheels','steering','brake','reverse','night','turn-signals']),
    loadModule:()=>import('./sonata-glb.js')
  }),
  f1_2010:Object.freeze({
    id:'f1_2010',label:'F1',kind:'passenger',modulePath:'src/f1-glb.js',exportName:'createF1GlbSystem',
    capabilities:Object.freeze(['body','materials','wheels','steering','brake','reverse']),
    loadModule:()=>import('./f1-glb.js')
  }),
  countach_80:Object.freeze({
    id:'countach_80',label:'Countach',kind:'passenger',modulePath:'src/countach-glb.js',exportName:'createCountachGlbSystem',
    capabilities:Object.freeze(['body','materials','wheels','steering','steering-wheel','brake','reverse','driver-camera']),
    loadModule:()=>import('./countach-glb.js')
  }),
  i3_2017:Object.freeze({
    id:'i3_2017',label:'BMW i3',kind:'passenger',modulePath:'src/i3-glb.js',exportName:'createI3GlbSystem',
    capabilities:Object.freeze(['body','materials','wheels','steering','brake','reverse','night']),
    loadModule:()=>import('./i3-glb.js')
  }),
  semi_6x4:Object.freeze({
    id:'semi_6x4',label:'Semi 6x4',kind:'articulated-truck',modulePath:'src/truck-trailer.js',exportName:'createTruckTrailerSystem',
    capabilities:Object.freeze(['body','materials','multi-axle','wheels','steering','trailer','articulation','brake','reverse','night','turn-signals']),
    loadModule:()=>import('./truck-trailer.js')
  })
});

export function getAuthoredVehicleDescriptor(vehicleId){return DESCRIPTORS[vehicleId]||null;}
export function listAuthoredVehicleDescriptors(){return Object.values(DESCRIPTORS);}
export function listAuthoredVehicleIds(){return Object.keys(DESCRIPTORS);}

export async function loadAuthoredVehicleFactory(vehicleId){
  const descriptor=getAuthoredVehicleDescriptor(vehicleId);
  if(!descriptor)throw new Error(`No authored vehicle controller registered for ${vehicleId}`);
  const module=await descriptor.loadModule();
  const factory=module?.[descriptor.exportName];
  if(typeof factory!=='function')throw new Error(`${descriptor.label}: ${descriptor.exportName} unavailable`);
  return factory;
}
