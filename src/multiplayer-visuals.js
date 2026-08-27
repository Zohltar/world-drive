import {createMultiplayerVisualSystem as createProceduralMultiplayerVisualSystem} from './multiplayer-visuals-v18.js';
import {createRemoteSupportFallback} from './multiplayer-fallback-visual.js';
import {createRemoteLightingRig} from './multiplayer-lighting.js';
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
// M2.3 keeps the short receiver-side presentation filter introduced by M2.2,
// but makes receiver-local road support sample the SAME smoothed X/Z/yaw that
// is actually rendered. Vertical support is no longer smoothed a second time by
// the presentation wrapper. This prevents the body plane and rendered position
// from disagreeing on slopes/camber, which caused subtle remote-car trembling.
//
// M2.4 adds per-peer replicated lighting. The lighting rig lives outside the
// cached GLB resources, so every peer may independently brake, reverse, run
// night lamps and blink left/right without mutating another driver's materials.

const SMOOTH_POSITION_RATE=30;
const SMOOTH_YAW_RATE=26;
const SMOOTH_TELEPORT_DISTANCE=12;
const SMOOTH_TELEPORT_YAW=1.45;
const SMOOTH_DT_MAX=.05;
const GEO_EARTH=6378137;
const DEG_TO_RAD=Math.PI/180;

function angleDelta(target,current){
  let d=(Number(target)||0)-(Number(current)||0);
  d=Math.atan2(Math.sin(d),Math.cos(d));
  return d;
}

function offsetLatLonMeters(lat,lon,x,z){
  const cosLat=Math.max(.15,Math.cos((Number(lat)||0)*DEG_TO_RAD));
  return {
    lat:(Number(lat)||0)-(Number(z)||0)/GEO_EARTH/DEG_TO_RAD,
    lon:(Number(lon)||0)+(Number(x)||0)/(GEO_EARTH*cosLat)/DEG_TO_RAD
  };
}

function collectProceduralPresentation(visual){
  const bodyMeshes=[];
  const presentationRoot=visual?.bodyGroup||visual?.root||null;

  if(presentationRoot){
    for(const child of presentationRoot.children||[]){
      // Keep projector/glow rigs and player labels. Every procedural body/lamp
      // mesh is hidden once the authored HD vehicle is ready; the M2.4 light rig
      // is created only after this list is collected, so it remains visible.
      if(String(child?.name||'').startsWith('remote-headlights-'))continue;
      if(child?.isSprite)continue;
      child.traverse?.(object=>{
        if(object?.isMesh||object?.isSkinnedMesh)bodyMeshes.push(object);
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

  // multiplayer.js owns networkRoot. contentRoot carries only an X/Z + yaw
  // presentation correction. Y remains receiver-local support authority.
  const smoothedPosition=new THREE.Vector3();
  const correction=new THREE.Vector3();
  let smoothedYaw=0;
  let yawCorrection=0;
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
      const dx=smoothedPosition.x-targetPosition.x;
      const dz=smoothedPosition.z-targetPosition.z;
      const distance=Math.hypot(dx,dz);
      const yawError=Math.abs(angleDelta(targetYaw,smoothedYaw));

      if(distance>SMOOTH_TELEPORT_DISTANCE||yawError>SMOOTH_TELEPORT_YAW){
        smoothedPosition.x=targetPosition.x;
        smoothedPosition.z=targetPosition.z;
        smoothedYaw=targetYaw;
        perf.smoothingSnaps++;
      }else{
        const positionAlpha=1-Math.exp(-dt*SMOOTH_POSITION_RATE);
        const yawAlpha=1-Math.exp(-dt*SMOOTH_YAW_RATE);
        smoothedPosition.x+=(targetPosition.x-smoothedPosition.x)*positionAlpha;
        smoothedPosition.z+=(targetPosition.z-smoothedPosition.z)*positionAlpha;
        smoothedYaw+=angleDelta(targetYaw,smoothedYaw)*yawAlpha;

        const correctionMeters=Math.hypot(
          smoothedPosition.x-targetPosition.x,
          smoothedPosition.z-targetPosition.z
        );
        if(correctionMeters>perf.smoothingMaxCorrectionM){
          perf.smoothingMaxCorrectionM=correctionMeters;
        }
      }
    }

    // Vertical support is already smoothed by multiplayer.js and, more
    // importantly, is derived from receiver-local terrain. Do not lag it again.
    smoothedPosition.y=targetPosition.y;
    correction.set(
      smoothedPosition.x-targetPosition.x,
      0,
      smoothedPosition.z-targetPosition.z
    );

    // Convert the desired world-space correction into the network anchor's
    // local frame. networkRoot carries authoritative yaw; contentRoot gets only
    // the short-lived presentation compensation.
    const c=Math.cos(targetYaw);
    const s=Math.sin(targetYaw);
    const dx=correction.x;
    const dz=correction.z;

    contentRoot.position.set(
      c*dx-s*dz,
      0,
      s*dx+c*dz
    );
    yawCorrection=angleDelta(smoothedYaw,targetYaw);
    contentRoot.rotation.y=yawCorrection;

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
    get presentationCorrectionX(){return correction.x;},
    get presentationCorrectionZ(){return correction.z;},
    get presentationYawCorrection(){return yawCorrection;},
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
    smoothingMaxCorrectionM:0,
    supportPresentationAdjustments:0,
    lightingVisuals:0,
    lightingUpdates:0
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

    // Capture fallback geometry before the M2.4 lighting rig is added. When the
    // GLB becomes ready we hide the old body/lamp geometry but never the network
    // lighting rig itself.
    const procedural=collectProceduralPresentation(visual);
    const lightingParent=visual.bodyGroup||visual.root;
    const lightingRig=createRemoteLightingRig(THREE,vehicleId,lightingParent);
    const fallbackSetBraking=visual.setBraking?.bind(visual)||null;
    const fallbackSetHeadlights=visual.setHeadlights?.bind(visual)||null;
    const fallbackDispose=visual.dispose?.bind(visual)||(()=>{});
    let lightingDisposed=false;

    if(lightingRig)perf.lightingVisuals++;

    visual.setLighting=(state={})=>{
      const braking=!!state.braking;
      const nightLevel=Math.max(0,Math.min(1,Number(state.nightLevel)||0));
      const distance=Math.max(0,Number(state.distance)||0);
      fallbackSetBraking?.(braking?1:0);
      fallbackSetHeadlights?.(nightLevel,distance);
      lightingRig?.setState({...state,braking,nightLevel,distance});
      perf.lightingUpdates++;
    };

    visual.dispose=()=>{
      if(lightingDisposed)return;
      lightingDisposed=true;
      lightingRig?.dispose?.();
      if(lightingRig)perf.lightingVisuals=Math.max(0,perf.lightingVisuals-1);
      fallbackDispose();
    };

    const smoothedVisual=installPresentationSmoothing(THREE,visual,perf);

    if(!THREE||!supportsRemoteHdVehicle(vehicleId)){
      perf.hdFallbacks++;
      return smoothedVisual;
    }

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

  function solveRemoteVehicleSupport(input={}){
    if(typeof base.solveRemoteVehicleSupport!=='function')return null;

    const visual=input.visual;
    const correctionX=Number(visual?.presentationCorrectionX)||0;
    const correctionZ=Number(visual?.presentationCorrectionZ)||0;
    const yawCorrection=Number(visual?.presentationYawCorrection)||0;

    if(
      Math.abs(correctionX)<1e-6&&
      Math.abs(correctionZ)<1e-6&&
      Math.abs(yawCorrection)<1e-7
    ){
      return base.solveRemoteVehicleSupport(input);
    }

    const presentationGeo=offsetLatLonMeters(
      input.lat,
      input.lon,
      correctionX,
      correctionZ
    );
    perf.supportPresentationAdjustments++;

    return base.solveRemoteVehicleSupport({
      ...input,
      lat:presentationGeo.lat,
      lon:presentationGeo.lon,
      heading:(Number(input.heading)||0)+yawCorrection
    });
  }

  function diagnostics(){
    return {
      enabled:true,
      mode:'multiplayer-hd-overlay-v5-replicated-lighting',
      ...perf,
      smoothing:{
        positionRate:SMOOTH_POSITION_RATE,
        yawRate:SMOOTH_YAW_RATE,
        teleportDistanceM:SMOOTH_TELEPORT_DISTANCE,
        teleportYawRad:SMOOTH_TELEPORT_YAW,
        verticalDoubleSmoothing:false,
        receiverSupportAligned:true
      },
      lighting:{
        perPeer:true,
        families:['night','brake','reverse','signal-left','signal-right']
      },
      cache:remoteHdDiagnostics()
    };
  }

  try{globalThis.__WORLD_DRIVE_MULTIPLAYER_HD_VISUALS__=diagnostics;}catch{}

  return {
    ...base,
    createRemoteVehicleVisual,
    solveRemoteVehicleSupport,
    diagnostics
  };
}
