import {createMultiplayerVisualSystem as createProceduralMultiplayerVisualSystem} from './multiplayer-visuals-v18.js';
import {
  createRemoteHdVehicle,
  supportsRemoteHdVehicle,
  remoteHdDiagnostics
} from './multiplayer-hd-vehicles.js';

// Multiplayer HD presentation wrapper.
//
// V18's procedural remote vehicle remains the authoritative network/support
// skeleton and the immediate fallback. When an authored passenger GLB becomes
// available, only its visible body/wheels replace the procedural meshes. The
// hidden procedural wheel pivots continue solving receiver-local terrain,
// suspension, steering and skid contacts exactly as before.

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
  const bodyMeshes=[];

  for(const child of visual?.bodyGroup?.children||[]){
    // The remote projector/glow rig is already lightweight and functional. Keep
    // it visible over the authored GLB until authored multiplayer lights receive
    // their own dedicated animation pass.
    if(String(child?.name||'').startsWith('remote-headlights-'))continue;
    child.traverse?.(object=>{
      if(!object?.isMesh&&!object?.isSkinnedMesh)return;
      const isBrakeLayer=materialList(object).some(material=>brakeMaterials.has(material));
      if(!isBrakeLayer)bodyMeshes.push(object);
    });
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
    hdRequested:0,
    hdAttached:0,
    hdFallbacks:0,
    lateLoadsIgnored:0
  };

  function createRemoteVehicleVisual(vehicleId,name){
    const visual=base.createRemoteVehicleVisual(vehicleId,name);
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
        if(!instance?.root){
          perf.hdFallbacks++;
          return;
        }

        hdInstance=instance;
        visual.bodyGroup?.add?.(instance.root);

        // Hide presentation only. Do not remove/dispose the procedural source:
        // multiplayer.js still updates its wheel pivots every frame and the
        // receiver-local support solver reads their stable X/Z geometry.
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
      mode:'multiplayer-hd-overlay-v1',
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
