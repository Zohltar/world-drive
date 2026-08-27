import {createMultiplayerVisualSystem as createSupportSystem} from './multiplayer-visuals-v18.js';
import {createRemoteLightingRig} from './multiplayer-lighting.js';
import {createRemoteHdVehicle,supportsRemoteHdVehicle,remoteHdDiagnostics} from './multiplayer-hd-vehicles-m3.js';

// Multiplayer M3 presentation pipeline:
// registry support chassis -> optional HD GLB -> contract-validated GLB lighting.

const SMOOTH_POSITION_RATE=30;
const SMOOTH_YAW_RATE=26;
const SMOOTH_TELEPORT_DISTANCE=12;
const SMOOTH_TELEPORT_YAW=1.45;
const SMOOTH_DT_MAX=.05;
const GEO_EARTH=6378137;
const DEG_TO_RAD=Math.PI/180;

function angleDelta(target,current){return Math.atan2(Math.sin((Number(target)||0)-(Number(current)||0)),Math.cos((Number(target)||0)-(Number(current)||0)));}
function offsetLatLonMeters(lat,lon,x,z){
  const cosLat=Math.max(.15,Math.cos((Number(lat)||0)*DEG_TO_RAD));
  return {lat:(Number(lat)||0)-(Number(z)||0)/GEO_EARTH/DEG_TO_RAD,lon:(Number(lon)||0)+(Number(x)||0)/(GEO_EARTH*cosLat)/DEG_TO_RAD};
}

function installPresentationSmoothing(THREE,visual,perf){
  if(!THREE||!visual?.root||typeof requestAnimationFrame!=='function')return visual;
  const contentRoot=visual.root;
  const networkRoot=new THREE.Group();networkRoot.name=`${contentRoot.name||'remote'}-m3-network-anchor`;networkRoot.rotation.order='YXZ';networkRoot.add(contentRoot);
  const smoothedPosition=new THREE.Vector3(),correction=new THREE.Vector3();
  let smoothedYaw=0,yawCorrection=0,initialized=false,disposed=false,lastAt=performance.now(),rafId=0;
  perf.smoothingVisuals++;
  const tick=now=>{
    if(disposed)return;
    const dt=Math.max(.001,Math.min(SMOOTH_DT_MAX,(now-lastAt)/1000));lastAt=now;
    const target=networkRoot.position,targetYaw=networkRoot.rotation.y;
    if(!initialized){smoothedPosition.copy(target);smoothedYaw=targetYaw;initialized=true;}
    else{
      const dx=smoothedPosition.x-target.x,dz=smoothedPosition.z-target.z,distance=Math.hypot(dx,dz),yawError=Math.abs(angleDelta(targetYaw,smoothedYaw));
      if(distance>SMOOTH_TELEPORT_DISTANCE||yawError>SMOOTH_TELEPORT_YAW){smoothedPosition.x=target.x;smoothedPosition.z=target.z;smoothedYaw=targetYaw;perf.smoothingSnaps++;}
      else{
        const pa=1-Math.exp(-dt*SMOOTH_POSITION_RATE),ya=1-Math.exp(-dt*SMOOTH_YAW_RATE);
        smoothedPosition.x+=(target.x-smoothedPosition.x)*pa;smoothedPosition.z+=(target.z-smoothedPosition.z)*pa;smoothedYaw+=angleDelta(targetYaw,smoothedYaw)*ya;
        perf.smoothingMaxCorrectionM=Math.max(perf.smoothingMaxCorrectionM,Math.hypot(smoothedPosition.x-target.x,smoothedPosition.z-target.z));
      }
    }
    smoothedPosition.y=target.y;correction.set(smoothedPosition.x-target.x,0,smoothedPosition.z-target.z);
    const c=Math.cos(targetYaw),s=Math.sin(targetYaw),dx=correction.x,dz=correction.z;
    contentRoot.position.set(c*dx-s*dz,0,s*dx+c*dz);yawCorrection=angleDelta(smoothedYaw,targetYaw);contentRoot.rotation.y=yawCorrection;
    perf.smoothingFrames++;rafId=requestAnimationFrame(tick);
  };
  rafId=requestAnimationFrame(tick);
  const baseDispose=visual.dispose?.bind(visual)||(()=>{});let done=false;
  return {
    ...visual,root:networkRoot,presentationRoot:contentRoot,smoothing:true,
    get presentationCorrectionX(){return correction.x;},get presentationCorrectionZ(){return correction.z;},get presentationYawCorrection(){return yawCorrection;},
    dispose(){if(done)return;done=true;disposed=true;if(rafId)cancelAnimationFrame?.(rafId);contentRoot.removeFromParent?.();networkRoot.clear?.();baseDispose();perf.smoothingVisuals=Math.max(0,perf.smoothingVisuals-1);}
  };
}

function collectSupportPresentation(visual){
  const bodyMeshes=[];
  const body=visual?.bodyGroup||null;
  body?.traverse?.(obj=>{if(obj!==body&&(obj?.isMesh||obj?.isSkinnedMesh))bodyMeshes.push(obj);});
  const wheelPivots=(visual?.wheels||[]).map(w=>w?.pivot).filter(Boolean);
  return {bodyMeshes,wheelPivots};
}

export function createMultiplayerVisualSystem(options={}){
  const base=createSupportSystem(options);const THREE=options.THREE;
  const perf={visualsCreated:0,hdRequested:0,hdAttached:0,hdFallbacks:0,lateLoadsIgnored:0,lightingFallbacks:0,authoredLightingActive:0,authoredLightingSwaps:0,lightingUpdates:0,smoothingVisuals:0,smoothingFrames:0,smoothingSnaps:0,smoothingMaxCorrectionM:0,supportPresentationAdjustments:0};

  function createRemoteVehicleVisual(vehicleId,name){
    const support=base.createRemoteVehicleVisual(vehicleId,name);if(!support)return null;
    perf.visualsCreated++;
    const hidden=collectSupportPresentation(support);
    const lightingParent=support.bodyGroup||support.root;
    const fallbackLighting=createRemoteLightingRig(THREE,vehicleId,lightingParent);
    let lastLighting={braking:false,reversing:false,nightLevel:0,signalLeft:false,signalRight:false,signalBlink:false,distance:0};
    let hdInstance=null,hdAttached=false,hdLightingReady=false,disposed=false;

    support.setLighting=state=>{
      lastLighting={...lastLighting,...state};perf.lightingUpdates++;
      if(hdAttached&&hdLightingReady&&hdInstance?.setLighting){
        if(fallbackLighting?.rig)fallbackLighting.rig.visible=false;
        hdInstance.setLighting(lastLighting);
      }else{
        if(fallbackLighting?.rig)fallbackLighting.rig.visible=true;
        fallbackLighting?.setState(lastLighting);
      }
    };
    support.setBraking=level=>support.setLighting({...lastLighting,braking:Number(level)>.18});
    support.setHeadlights=(level,distance)=>support.setLighting({...lastLighting,nightLevel:Math.max(0,Math.min(1,Number(level)||0)),distance});

    const originalDispose=support.dispose?.bind(support)||(()=>{});
    support.dispose=()=>{
      if(disposed)return;disposed=true;
      fallbackLighting?.dispose?.();
      if(hdLightingReady)perf.authoredLightingActive=Math.max(0,perf.authoredLightingActive-1);
      hdInstance?.dispose?.();hdInstance=null;originalDispose();
    };

    const visual=installPresentationSmoothing(THREE,support,perf);
    visual.hdReady=false;visual.hdPending=false;visual.hdVehicleId=vehicleId;

    if(!supportsRemoteHdVehicle(vehicleId)){perf.hdFallbacks++;perf.lightingFallbacks++;return visual;}
    visual.hdPending=true;perf.hdRequested++;
    createRemoteHdVehicle(THREE,vehicleId).then(instance=>{
      visual.hdPending=false;
      if(disposed){if(instance){perf.lateLoadsIgnored++;instance.dispose?.();}return;}
      if(!instance?.root||!lightingParent){perf.hdFallbacks++;return;}
      hdInstance=instance;lightingParent.add(instance.root);hdAttached=true;
      for(const mesh of hidden.bodyMeshes)mesh.visible=false;
      for(const pivot of hidden.wheelPivots)pivot.visible=false;
      hdLightingReady=!!instance.lightingReady&&instance.lightingMode==='authored-glb-lamps-v2';
      if(hdLightingReady){
        if(fallbackLighting?.rig)fallbackLighting.rig.visible=false;
        instance.setLighting(lastLighting);perf.authoredLightingActive++;perf.authoredLightingSwaps++;
      }else{
        perf.lightingFallbacks++;
        console.warn(`Remote ${vehicleId} HD lighting contract incomplete; keeping loading fallback.`,instance.lightingDiagnostics?.());
      }
      visual.hdReady=true;perf.hdAttached++;
    }).catch(error=>{visual.hdPending=false;perf.hdFallbacks++;console.warn(`Remote HD visual failed for ${vehicleId}; support fallback kept.`,error);});

    return visual;
  }

  function solveRemoteVehicleSupport(input={}){
    if(typeof base.solveRemoteVehicleSupport!=='function')return null;
    const visual=input.visual,dx=Number(visual?.presentationCorrectionX)||0,dz=Number(visual?.presentationCorrectionZ)||0,dyaw=Number(visual?.presentationYawCorrection)||0;
    if(Math.abs(dx)<1e-6&&Math.abs(dz)<1e-6&&Math.abs(dyaw)<1e-7)return base.solveRemoteVehicleSupport(input);
    const geo=offsetLatLonMeters(input.lat,input.lon,dx,dz);perf.supportPresentationAdjustments++;
    return base.solveRemoteVehicleSupport({...input,lat:geo.lat,lon:geo.lon,heading:(Number(input.heading)||0)+dyaw});
  }

  function diagnostics(){
    return {enabled:true,mode:'multiplayer-m3-registry-hd-pipeline',...perf,smoothing:{positionRate:SMOOTH_POSITION_RATE,yawRate:SMOOTH_YAW_RATE,receiverSupportAligned:true,verticalDoubleSmoothing:false},lighting:{protocol:'m2.4',hdSource:'authored-glb-lamps-v2',fallbackScope:'loading-or-contract-failure'},cache:remoteHdDiagnostics()};
  }
  try{globalThis.__WORLD_DRIVE_MULTIPLAYER_HD_VISUALS__=diagnostics;}catch{}
  return {...base,createRemoteVehicleVisual,solveRemoteVehicleSupport,diagnostics};
}
