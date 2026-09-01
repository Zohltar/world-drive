import {createMultiplayerVisualSystem as createSupportSystem} from './multiplayer-visuals-v18.js';
import {createRemoteVehicleAdapter} from './multiplayer-vehicle-adapter.js';
import {VEHICLE_RENDER_ROOT_SCALE} from '../vehicles/vehicle-render-contract.js';
import {ensureWorldDriveDiagnostics} from '../diagnostics.js';

// Multiplayer M4 presentation pipeline:
// normalized support chassis -> isolated adapter -> exact LOCAL authored controller.
// There is no second multiplayer GLB/material/lamp implementation anymore.

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
  const networkRoot=new THREE.Group();networkRoot.name=`${contentRoot.name||'remote'}-m4-network-anchor`;networkRoot.rotation.order='YXZ';networkRoot.add(contentRoot);
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

export function createMultiplayerVisualSystem(options={}){
  const base=createSupportSystem(options),THREE=options.THREE;
  const sceneRoot=options.scene||options.car?.parent||null;
  const perf={visualsCreated:0,adapterCreated:0,adapterReadyFrames:0,adapterFallbackFrames:0,adapterErrors:0,lightingUpdates:0,motionUpdates:0,smoothingVisuals:0,smoothingFrames:0,smoothingSnaps:0,smoothingMaxCorrectionM:0,supportPresentationAdjustments:0};
  const adapters=new Set();

  function createRemoteVehicleVisual(vehicleId,name){
    const support=base.createRemoteVehicleVisual(vehicleId,name);if(!support)return null;
    perf.visualsCreated++;

    // M4.2 parity: support.root is the remote equivalent of the local `car`
    // group. Apply the exact same render scale before the local authored
    // controller is instantiated. Support math intentionally continues to use
    // unscaled local probe coordinates, matching vehicle-presentation locally.
    support.root.scale.set(VEHICLE_RENDER_ROOT_SCALE,VEHICLE_RENDER_ROOT_SCALE,VEHICLE_RENDER_ROOT_SCALE);
    support.renderRootScale=VEHICLE_RENDER_ROOT_SCALE;

    const adapter=createRemoteVehicleAdapter({
      THREE,
      vehicleId,
      car:support.root,
      bodyGroup:support.bodyGroup,
      existingWheels:support.wheels,
      scene:sceneRoot,
      groundHeightForWheel:options.groundHeightForWheel
    });
    adapters.add(adapter);perf.adapterCreated++;
    let disposed=false;
    let lastLighting={braking:false,reversing:false,nightLevel:0,signalLeft:false,signalRight:false,signalBlink:false,distance:0};

    support.setLighting=state=>{
      lastLighting={...lastLighting,...state};perf.lightingUpdates++;
      if(!adapter.ready)support.setBraking?.(lastLighting.braking?1:0);
    };
    support.updateRemoteVehicle=(dt,state={})=>{
      perf.motionUpdates++;
      const combined={
        ...lastLighting,
        ...state,
        braking:typeof state.braking==='boolean'?state.braking:lastLighting.braking,
        reversing:typeof state.reversing==='boolean'?state.reversing:lastLighting.reversing,
        nightLevel:Number.isFinite(Number(state.nightLevel))?state.nightLevel:lastLighting.nightLevel,
        signalLeft:typeof state.signalLeft==='boolean'?state.signalLeft:lastLighting.signalLeft,
        signalRight:typeof state.signalRight==='boolean'?state.signalRight:lastLighting.signalRight,
        signalBlink:typeof state.signalBlink==='boolean'?state.signalBlink:lastLighting.signalBlink
      };
      adapter.update(dt,combined);
      if(adapter.ready)perf.adapterReadyFrames++;else perf.adapterFallbackFrames++;
      if(adapter.loadError)perf.adapterErrors++;
    };
    support.setRemoteVisible=(visible,state={})=>adapter.setVisible(visible,{...lastLighting,...state});

    const originalDispose=support.dispose?.bind(support)||(()=>{});
    support.dispose=()=>{
      if(disposed)return;disposed=true;
      adapters.delete(adapter);adapter.dispose();originalDispose();
    };

    const visual=installPresentationSmoothing(THREE,support,perf);
    visual.vehicleAdapter=adapter;
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
    return {
      enabled:true,
      mode:'multiplayer-m4.2-local-controller-parity',
      renderRootScale:VEHICLE_RENDER_ROOT_SCALE,
      ...perf,
      smoothing:{positionRate:SMOOTH_POSITION_RATE,yawRate:SMOOTH_YAW_RATE,receiverSupportAligned:true,verticalDoubleSmoothing:false},
      visualSource:'same-local-authored-controller',
      adapters:[...adapters].map(adapter=>adapter.diagnostics())
    };
  }
  try{ensureWorldDriveDiagnostics().multiplayer.hdVisuals=diagnostics;}catch{}
  return {...base,createRemoteVehicleVisual,solveRemoteVehicleSupport,diagnostics};
}
