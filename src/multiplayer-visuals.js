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
//
// M2.2 adds a receiver-side presentation filter around the whole remote visual.
// Network/terrain state stays authoritative; only the rendered transform eases
// toward that state over a very short time constant. This removes small browser
// / LAN timing corrections without increasing network traffic or changing the
// 30 Hz simulation-state stream.

const SMOOTH_POSITION_RATE=30;
const SMOOTH_YAW_RATE=26;
const SMOOTH_TELEPORT_DISTANCE=12;
const SMOOTH_TELEPORT_YAW=1.45;
const SMOOTH_DT_MAX=.05;

function materialList(object){
  if(!object?.material)return [];
  return Array.isArray(object.material)?object.material:[object.material];
}

function angleDelta(target,current){
  let d=(Number(target)||0)-(Number(current)||0);
  d=Math.atan2(Math.sin(d),Math.cos(d));
  return d;
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

function installPresentationSmoothing(THREE,visual,perf){
  if(!THREE||!visual?.root||typeof requestAnimationFrame!=='function')return visual;

  const contentRoot=visual.root;
  const networkRoot=new THREE.Group();
  networkRoot.name=`${contentRoot.name||'remote'}-smoothed-network-anchor`;
  networkRoot.rotation.order='YXZ';
  networkRoot.add(contentRoot);

  // multiplayer.js owns networkRoot. contentRoot is a local visual offset that
  // cancels tiny instantaneous target corrections and decays them smoothly.
  const smoothedPosition=new THREE.Vector3();
  const correction=new THREE.Vector3();
  let smoothedYaw=0;
  let initialized=false;
  let disposed=false;
  let lastAt=performance.now();
  let rafId=0;

  perf.smoothingVisuals++;

  const tick=now=>{
    if(disposed)return;

    const dt=Math.max(.001,Math.min(SMOOTH_DT_MAX,(now-lastAt)/1000));
    lastAt=now;

    const targetPosition=networkRoot.position;
    const targetYaw=networkRoot.rotation.y;

    if(!initialized){
      smoothedPosition.copy(targetPosition);
      smoothedYaw=targetYaw;
      initialized=true;
    }else{
      const distance=smoothedPosition.distanceTo(targetPosition);
      const yawError=Math.abs(angleDelta(targetYaw,smoothedYaw));

      if(distance>SMOOTH_TELEPORT_DISTANCE||yawError>SMOOTH_TELEPORT_YAW){
        smoothedPosition.copy(targetPosition);
        smoothedYaw=targetYaw;
        perf.smoothingSnaps++;
      }else{
        const positionAlpha=1-Math.exp(-dt*SMOOTH_POSITION_RATE);
        const yawAlpha=1-Math.exp(-dt*SMOOTH_YAW_RATE);
        smoothedPosition.lerp(targetPosition,positionAlpha);
        smoothedYaw+=angleDelta(targetYaw,smoothedYaw)*yawAlpha;

        const correctionMeters=smoothedPosition.distanceTo(targetPosition);
        if(correctionMeters>perf.smoothingMaxCorrectionM){
          perf.smoothingMaxCorrectionM=correctionMeters;
        }
      }
    }

    correction.copy(smoothedPosition).sub(targetPosition);

    // Convert the desired world-space correction into the network anchor's
    // local frame. networkRoot carries the authoritative yaw; contentRoot gets
    // only the short-lived visual compensation.
    const c=Math.cos(targetYaw);
    const s=Math.sin(targetYaw);
    const dx=correction.x;
    const dz=correction.z;

    contentRoot.position.set(
      c*dx-s*dz,
      correction.y,
      s*dx+c*dz
    );
    contentRoot.rotation.y=angleDelta(smoothedYaw,targetYaw);

    perf.smoothingFrames++;
    rafId=requestAnimationFrame(tick);
  };

  rafId=requestAnimationFrame(tick);

  const originalDispose=visual.dispose?.bind(visual)||(()=>{});
  let originalDisposed=false;

  return {
    ...visual,
    root:networkRoot,
    presentationRoot:contentRoot,
    smoothing:true,
    dispose(){
      if(originalDisposed)return;
      originalDisposed=true;
      disposed=true;
      if(rafId)cancelAnimationFrame?.(rafId);
      contentRoot.removeFromParent?.();
      networkRoot.clear?.();
      originalDispose();
      perf.smoothingVisuals=Math.max(0,perf.smoothingVisuals-1);
    }
  };
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
    lateLoadsIgnored:0,
    smoothingVisuals:0,
    smoothingFrames:0,
    smoothingSnaps:0,
    smoothingMaxCorrectionM:0
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

    const smoothedVisual=installPresentationSmoothing(THREE,visual,perf);

    if(!THREE||!supportsRemoteHdVehicle(vehicleId)){
      perf.hdFallbacks++;
      return smoothedVisual;
    }

    const procedural=collectProceduralPresentation(visual);
    const attachParent=visual.bodyGroup||visual.root;
    const smoothedDispose=smoothedVisual.dispose?.bind(smoothedVisual)||(()=>{});
    let disposed=false;
    let hdInstance=null;

    smoothedVisual.hdPending=true;
    perf.hdRequested++;

    createRemoteHdVehicle(THREE,vehicleId)
      .then(instance=>{
        smoothedVisual.hdPending=false;
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

        smoothedVisual.hdReady=true;
        perf.hdAttached++;
      })
      .catch(error=>{
        smoothedVisual.hdPending=false;
        perf.hdFallbacks++;
        console.warn(`Remote HD visual failed for ${vehicleId}; procedural fallback kept.`,error);
      });

    smoothedVisual.dispose=()=>{
      if(disposed)return;
      disposed=true;
      smoothedVisual.hdPending=false;
      smoothedVisual.hdReady=false;
      hdInstance?.dispose?.();
      hdInstance=null;
      smoothedDispose();
    };

    return smoothedVisual;
  }

  function diagnostics(){
    return {
      enabled:true,
      mode:'multiplayer-hd-overlay-v3-smoothed-presentation',
      ...perf,
      smoothing:{
        positionRate:SMOOTH_POSITION_RATE,
        yawRate:SMOOTH_YAW_RATE,
        teleportDistanceM:SMOOTH_TELEPORT_DISTANCE,
        teleportYawRad:SMOOTH_TELEPORT_YAW
      },
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
