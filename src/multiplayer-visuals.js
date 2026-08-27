import {createMultiplayerVisualSystem as createProceduralMultiplayerVisualSystem} from './multiplayer-visuals-v18.js';
import {createRemoteSupportFallback} from './multiplayer-fallback-visual.js';
import {createRemoteLightingRig} from './multiplayer-lighting.js';
import {
  createRemoteHdVehicle,
  supportsRemoteHdVehicle,
  remoteHdDiagnostics
} from './multiplayer-hd-vehicles.js';

// Multiplayer HD presentation wrapper.
// M2.3 aligns receiver-local support with the smoothed rendered pose.
// M2.4 replicates light state over the network.
// M2.5 keeps the geometric light rig ONLY while the authored GLB is loading;
// once HD is attached, all light state is routed into peer-local GLB materials.

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
      if(String(child?.name||'').startsWith('remote-headlights-'))continue;
      if(child?.isSprite)continue;
      child.traverse?.(object=>{
        if(object?.isMesh||object?.isSkinnedMesh)bodyMeshes.push(object);
      });
    }
  }
  const wheelPivots=(visual?.wheels||[]).map(wheel=>wheel?.pivot).filter(Boolean);
  return {bodyMeshes,wheelPivots};
}

function installPresentationSmoothing(THREE,visual,perf){
  if(!THREE||!visual?.root||typeof requestAnimationFrame!=='function')return visual;
  const contentRoot=visual.root;
  const networkRoot=new THREE.Group();
  networkRoot.name=`${contentRoot.name||'remote'}-smoothed-network-anchor`;
  networkRoot.rotation.order='YXZ';
  networkRoot.add(contentRoot);

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
        const correctionMeters=Math.hypot(smoothedPosition.x-targetPosition.x,smoothedPosition.z-targetPosition.z);
        if(correctionMeters>perf.smoothingMaxCorrectionM)perf.smoothingMaxCorrectionM=correctionMeters;
      }
    }

    smoothedPosition.y=targetPosition.y;
    correction.set(smoothedPosition.x-targetPosition.x,0,smoothedPosition.z-targetPosition.z);
    const c=Math.cos(targetYaw),s=Math.sin(targetYaw),dx=correction.x,dz=correction.z;
    contentRoot.position.set(c*dx-s*dz,0,s*dx+c*dz);
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
      originalDisposed=true;disposed=true;
      if(rafId)cancelAnimationFrame?.(rafId);
      contentRoot.removeFromParent?.();networkRoot.clear?.();originalDispose();
      perf.smoothingVisuals=Math.max(0,perf.smoothingVisuals-1);
    }
  };
}

export function createMultiplayerVisualSystem(options={}){
  const base=createProceduralMultiplayerVisualSystem(options);
  const THREE=options.THREE;
  const perf={
    visualsCreated:0,exactProcedural:0,supportFallbacks:0,hdRequested:0,hdAttached:0,hdFallbacks:0,lateLoadsIgnored:0,
    smoothingVisuals:0,smoothingFrames:0,smoothingSnaps:0,smoothingMaxCorrectionM:0,supportPresentationAdjustments:0,
    lightingVisuals:0,lightingUpdates:0,lightingCompatibilityFrames:0,
    authoredLightingActive:0,authoredLightingSwaps:0,authoredLightingUpdates:0
  };

  function createRemoteVehicleVisual(vehicleId,name){
    let visual=base.createRemoteVehicleVisual(vehicleId,name);
    if(visual)perf.exactProcedural++;
    else if(THREE){visual=createRemoteSupportFallback(THREE,vehicleId,name);perf.supportFallbacks++;}
    if(!visual)return visual;

    perf.visualsCreated++;
    visual.hdReady=false;visual.hdPending=false;visual.hdVehicleId=vehicleId;

    const procedural=collectProceduralPresentation(visual);
    const lightingParent=visual.bodyGroup||visual.root;
    const lightingRig=createRemoteLightingRig(THREE,vehicleId,lightingParent);
    const fallbackSetBraking=visual.setBraking?.bind(visual)||null;
    const fallbackSetHeadlights=visual.setHeadlights?.bind(visual)||null;
    const fallbackDispose=visual.dispose?.bind(visual)||(()=>{});
    let lightingDisposed=false;
    let explicitLightingSeen=false;
    let lastLightingAt=performance.now();
    let lastWheelSpin=null;
    let hdInstance=null;
    let hdLightingActive=false;
    let lastLightingState=null;

    const compatibilityState={
      braking:false,reversing:false,nightLevel:0,signalLeft:false,signalRight:false,signalBlink:false,signalTimer:0,distance:0
    };
    if(lightingRig)perf.lightingVisuals++;

    function inferCompatibilityLighting(){
      const now=performance.now();
      const dt=Math.max(.001,Math.min(.05,(now-lastLightingAt)/1000));
      lastLightingAt=now;
      const front=(visual.wheels||[]).filter(wheel=>wheel?.front);
      const steer=front.length?front.reduce((sum,wheel)=>sum+(Number(wheel.pivot?.rotation?.y)||0),0)/front.length:0;
      const probe=(visual.wheels||[]).find(wheel=>wheel?.tire)||null;
      const spin=Number(probe?.tire?.rotation?.x);
      let stopped=true;
      if(Number.isFinite(spin)&&Number.isFinite(lastWheelSpin)){
        const delta=spin-lastWheelSpin;
        stopped=Math.abs(delta)<.006;
        if(Math.abs(delta)>.002)compatibilityState.reversing=delta>0;
      }
      if(Number.isFinite(spin))lastWheelSpin=spin;
      const absSteer=Math.abs(steer);
      if(absSteer<=.045){
        compatibilityState.signalLeft=false;compatibilityState.signalRight=false;compatibilityState.signalTimer=0;
      }else if(!compatibilityState.signalLeft&&!compatibilityState.signalRight&&stopped&&absSteer>=.318){
        compatibilityState.signalLeft=steer<0;compatibilityState.signalRight=steer>0;compatibilityState.signalTimer=0;
      }
      if(compatibilityState.signalLeft||compatibilityState.signalRight)compatibilityState.signalTimer+=dt;
      compatibilityState.signalBlink=(compatibilityState.signalLeft||compatibilityState.signalRight)&&((compatibilityState.signalTimer%1.05)<.58);
    }

    function routeLighting(state){
      const normalized={
        ...state,
        braking:!!state.braking,
        reversing:!!state.reversing,
        nightLevel:Math.max(0,Math.min(1,Number(state.nightLevel)||0)),
        signalLeft:!!state.signalLeft,
        signalRight:!!state.signalRight,
        signalBlink:!!state.signalBlink,
        distance:Math.max(0,Number(state.distance)||0)
      };
      lastLightingState=normalized;

      if(hdLightingActive&&hdInstance?.setLighting){
        // Explicitly quench every old/procedural light source before using the
        // authored GLB lamp controller. This is the M2.5 ownership boundary.
        fallbackSetBraking?.(0);
        fallbackSetHeadlights?.(0,normalized.distance);
        if(lightingRig?.rig)lightingRig.rig.visible=false;
        hdInstance.setLighting(normalized);
        perf.authoredLightingUpdates++;
      }else{
        if(lightingRig?.rig)lightingRig.rig.visible=true;
        fallbackSetBraking?.(normalized.braking?1:0);
        fallbackSetHeadlights?.(normalized.nightLevel,normalized.distance);
        lightingRig?.setState(normalized);
      }
      perf.lightingUpdates++;
    }

    function flushCompatibilityLighting(){
      inferCompatibilityLighting();
      routeLighting(compatibilityState);
      perf.lightingCompatibilityFrames++;
    }

    visual.setBraking=level=>{
      compatibilityState.braking=Number(level)>.18;
      if(!explicitLightingSeen)flushCompatibilityLighting();
    };
    visual.setHeadlights=(level,distance)=>{
      compatibilityState.nightLevel=Math.max(0,Math.min(1,Number(level)||0));
      compatibilityState.distance=Math.max(0,Number(distance)||0);
      if(!explicitLightingSeen)flushCompatibilityLighting();
    };
    visual.setLighting=(state={})=>{
      explicitLightingSeen=true;
      routeLighting(state);
    };
    visual.dispose=()=>{
      if(lightingDisposed)return;
      lightingDisposed=true;
      lightingRig?.dispose?.();
      if(lightingRig)perf.lightingVisuals=Math.max(0,perf.lightingVisuals-1);
      fallbackDispose();
    };

    const smoothedVisual=installPresentationSmoothing(THREE,visual,perf);
    if(!THREE||!supportsRemoteHdVehicle(vehicleId)){perf.hdFallbacks++;return smoothedVisual;}

    const attachParent=visual.bodyGroup||visual.root;
    const smoothedDispose=smoothedVisual.dispose?.bind(smoothedVisual)||(()=>{});
    let disposed=false;
    smoothedVisual.hdPending=true;perf.hdRequested++;

    createRemoteHdVehicle(THREE,vehicleId)
      .then(instance=>{
        smoothedVisual.hdPending=false;
        if(disposed){
          if(instance){perf.lateLoadsIgnored++;instance.dispose?.();}
          return;
        }
        if(!instance?.root||!attachParent){perf.hdFallbacks++;return;}
        hdInstance=instance;
        attachParent.add(instance.root);
        for(const mesh of procedural.bodyMeshes)mesh.visible=false;
        for(const pivot of procedural.wheelPivots)pivot.visible=false;

        hdLightingActive=instance.lightingMode==='authored-glb-lamps-v1'&&typeof instance.setLighting==='function';
        if(hdLightingActive){
          if(lightingRig?.rig)lightingRig.rig.visible=false;
          fallbackSetBraking?.(0);
          fallbackSetHeadlights?.(0,lastLightingState?.distance||compatibilityState.distance||0);
          instance.setLighting(lastLightingState||compatibilityState);
          perf.authoredLightingActive++;
          perf.authoredLightingSwaps++;
          perf.authoredLightingUpdates++;
        }

        smoothedVisual.hdReady=true;perf.hdAttached++;
      })
      .catch(error=>{
        smoothedVisual.hdPending=false;perf.hdFallbacks++;
        console.warn(`Remote HD visual failed for ${vehicleId}; procedural fallback kept.`,error);
      });

    smoothedVisual.dispose=()=>{
      if(disposed)return;
      disposed=true;smoothedVisual.hdPending=false;smoothedVisual.hdReady=false;
      if(hdLightingActive)perf.authoredLightingActive=Math.max(0,perf.authoredLightingActive-1);
      hdLightingActive=false;
      hdInstance?.dispose?.();hdInstance=null;smoothedDispose();
    };
    return smoothedVisual;
  }

  function solveRemoteVehicleSupport(input={}){
    if(typeof base.solveRemoteVehicleSupport!=='function')return null;
    const visual=input.visual;
    const correctionX=Number(visual?.presentationCorrectionX)||0;
    const correctionZ=Number(visual?.presentationCorrectionZ)||0;
    const yawCorrection=Number(visual?.presentationYawCorrection)||0;
    if(Math.abs(correctionX)<1e-6&&Math.abs(correctionZ)<1e-6&&Math.abs(yawCorrection)<1e-7)return base.solveRemoteVehicleSupport(input);
    const presentationGeo=offsetLatLonMeters(input.lat,input.lon,correctionX,correctionZ);
    perf.supportPresentationAdjustments++;
    return base.solveRemoteVehicleSupport({...input,lat:presentationGeo.lat,lon:presentationGeo.lon,heading:(Number(input.heading)||0)+yawCorrection});
  }

  function diagnostics(){
    return {
      enabled:true,
      mode:'multiplayer-hd-overlay-v5-replicated-lighting',
      ...perf,
      smoothing:{positionRate:SMOOTH_POSITION_RATE,yawRate:SMOOTH_YAW_RATE,teleportDistanceM:SMOOTH_TELEPORT_DISTANCE,teleportYawRad:SMOOTH_TELEPORT_YAW,verticalDoubleSmoothing:false,receiverSupportAligned:true},
      lighting:{perPeer:true,explicitProtocol:true,compatibilityFallback:true,fallbackScope:'loading-only',hdSource:'authored-glb-lamps-v1',families:['night','brake','reverse','signal-left','signal-right']},
      cache:remoteHdDiagnostics()
    };
  }

  try{globalThis.__WORLD_DRIVE_MULTIPLAYER_HD_VISUALS__=diagnostics;}catch{}
  return {...base,createRemoteVehicleVisual,solveRemoteVehicleSupport,diagnostics};
}
