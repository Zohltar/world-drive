// World Drive M4 — canonical authored-vehicle controller registry.
//
// Local gameplay and multiplayer must resolve the SAME controller factory for a
// vehicle. This file owns that mapping so remote rendering can never drift into
// a second WRX/Sonata/etc implementation.

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

function restoreSonataBrakeGlowContract(system){
  if(!system||typeof system!=='object')return system;

  let patched=false;
  const patchRedLayers=()=>{
    if(patched)return true;
    let count=0;
    system.host?.traverse?.(obj=>{
      const name=String(obj?.name||'');
      if(name!=='Object_46-red-0'&&name!=='Object_33-red-0')return;
      const uniforms=obj?.material?.uniforms;
      if(!uniforms?.uUseUvRegion)return;

      // M4.6 made the previously dormant UV-region uniforms active. The two
      // guessed red regions do not match the actual Sonata atlas and clipped the
      // authored brake/running glow completely. Keep the proven texture-based
      // red discrimination, but do not spatially crop the red layers. Reverse
      // (white) and indicators (amber) retain their own authored contracts.
      uniforms.uUseUvRegion.value=0;
      obj.material.needsUpdate=true;
      count++;
    });
    patched=count>=2;
    return patched;
  };

  const originalSetActive=typeof system.setActive==='function'?system.setActive.bind(system):null;
  const originalUpdate=typeof system.update==='function'?system.update.bind(system):null;

  if(originalSetActive){
    system.setActive=(...args)=>{
      const result=originalSetActive(...args);
      patchRedLayers();
      return result;
    };
  }
  if(originalUpdate){
    system.update=(...args)=>{
      const result=originalUpdate(...args);
      patchRedLayers();
      return result;
    };
  }

  return system;
}

export function getAuthoredVehicleDescriptor(vehicleId){return DESCRIPTORS[vehicleId]||null;}
export function listAuthoredVehicleDescriptors(){return Object.values(DESCRIPTORS);}
export function listAuthoredVehicleIds(){return Object.keys(DESCRIPTORS);}

export async function loadAuthoredVehicleFactory(vehicleId){
  const descriptor=getAuthoredVehicleDescriptor(vehicleId);
  if(!descriptor)throw new Error(`No authored vehicle controller registered for ${vehicleId}`);
  const module=await descriptor.loadModule();
  const factory=module?.[descriptor.exportName];
  if(typeof factory!=='function')throw new Error(`${descriptor.label}: ${descriptor.exportName} unavailable`);

  if(vehicleId==='sonata'){
    return options=>restoreSonataBrakeGlowContract(factory(options));
  }
  return factory;
}
