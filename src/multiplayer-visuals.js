import {createMultiplayerVisualSystem as createProceduralMultiplayerVisualSystem} from './multiplayer-visuals-v18.js';
import {createRemoteSupportFallback} from './multiplayer-fallback-visual.js';
import {
  createRemoteHdVehicle,
  supportsRemoteHdVehicle,
  remoteHdDiagnostics
} from './multiplayer-hd-vehicles.js';

// Multiplayer HD presentation wrapper.
//
// The legacy exact-procedural clone remains preferred because it preserves all
// established receiver-local suspension/contact presentation. If that clone is
// unavailable for a peer, a guaranteed lightweight four-wheel support visual is
// created here instead. Crucially, BOTH paths continue into the same lazy HD
// upgrade, so multiplayer.js can never bypass the authored GLB request by
// falling back to its older internal low-poly renderer.

function materialList(object){
  if(!object?.material)return [];
  return Array.isArray(object.material)?object.material:[object.material];
}

function collectProceduralPresentation(visual){
  const brakeMaterials=new Set(
    (visual?.brakeEntries||[])
      .map(entry=>entry?.material)
      .filter(Boolean)
  );
  if(visual?.brakeMat)brakeMaterials.add(visual.brakeMat);

  const bodyMeshes=[];
  const presentationRoot=visual?.bodyGroup||visual?.root||null;

  if(presentationRoot){
    for(const child of presentationRoot.children||[]){
      // Keep the exact-remote projector/glow rig and player label. The HD model
      // replaces only geometry presentation; networking/labels remain unchanged.
      if(String(child?.name||'').startsWith('remote-headlights-'))continue;
      if(child?.isSprite)continue;
      child.traverse?.(object=>{
        if(!object?.isMesh&&!object?.isSkinnedMesh)return;
        const isBrakeLayer=materialList(object).some(material=>brakeMaterials.has(material));
        if(!isBrakeLayer)bodyMeshes.push(object);
      });
    }
  }

  const wheelPivots=(visual?.wheels||[])
    .map(wheel=>wheel?.pivot)
    .filter(Boolean);

  return {bodyMeshes,wheelPivots};
}

export function createMultiplayerVisualSystem(options={}){
  const base=createProceduralMultiplayerVisualSystem(options);
  const THREE=options.THREE;
  const perf={
    visualsCreated:0,
    exactProcedural:0,
    supportFallbacks:0,
    hdRequested:0,
    hdAttached:0,
    hdFallbacks:0,
    lateLoadsIgnored:0
  };

  function createRemoteVehicleVisual(vehicleId,name){
    let visual=base.createRemoteVehicleVisual(vehicleId,name);

    if(visual){
      perf.exactProcedural++;
    }else if(THREE){
      // Do not return null here. Returning null lets multiplayer.js create its
      // private legacy fallback, which cannot be upgraded by this wrapper.
      visual=createRemoteSupportFallback(THREE,vehicleId,name);
      perf.supportFallbacks++;
    }

    if(!visual)return visual;

    perf.visualsCreated++;
    visual.hdReady=false;
    visual.hdPending=false;
    visual.hdVehicleId=vehicleId;

    if(!THREE||!supportsRemoteHdVehicle(vehicleId)){
      perf.hdFallbacks++;
      return visual;
    }

    const procedural=collectProceduralPresentation(visual);
    const attachParent=visual.bodyGroup||visual.root;
    const originalDispose=visual.dispose?.bind(visual)||(()=>{});
    let disposed=false;
    let hdInstance=null;

    visual.hdPending=true;
    perf.hdRequested++;

    createRemoteHdVehicle(THREE,vehicleId)
      .then(instance=>{
        visual.hdPending=false;
        if(disposed){
          if(instance){
            perf.lateLoadsIgnored++;
            instance.dispose?.();
          }
          return;
        }
        if(!instance?.root||!attachParent){
          perf.hdFallbacks++;
          return;
        }

        hdInstance=instance;
        attachParent.add(instance.root);

        // Hide presentation only. Keep the four support pivots alive in the
        // scene graph because multiplayer.js still updates them every frame and
        // solveRemoteVehicleSupport() reads their stable X/Z geometry.
        for(const mesh of procedural.bodyMeshes)mesh.visible=false;
        for(const pivot of procedural.wheelPivots)pivot.visible=false;

        visual.hdReady=true;
        perf.hdAttached++;
      })
      .catch(error=>{
        visual.hdPending=false;
        perf.hdFallbacks++;
        console.warn(`Remote HD visual failed for ${vehicleId}; procedural fallback kept.`,error);
      });

    visual.dispose=()=>{
      if(disposed)return;
      disposed=true;
      visual.hdPending=false;
      visual.hdReady=false;
      hdInstance?.dispose?.();
      hdInstance=null;
      originalDispose();
    };

    return visual;
  }

  function diagnostics(){
    return {
      enabled:true,
      mode:'multiplayer-hd-overlay-v2-guaranteed-upgrade',
      ...perf,
      cache:remoteHdDiagnostics()
    };
  }

  try{globalThis.__WORLD_DRIVE_MULTIPLAYER_HD_VISUALS__=diagnostics;}catch{}

  return {
    ...base,
    createRemoteVehicleVisual,
    diagnostics
  };
}
