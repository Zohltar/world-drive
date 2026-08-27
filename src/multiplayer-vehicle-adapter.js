import {createVehicleSystem} from './vehicle-system.js';
import {getAuthoredVehicleDescriptor,loadAuthoredVehicleFactory} from './vehicle-authored-registry.js';

// Multiplayer M4.1 adapter.
//
// The network/runtime sees one normalized vehicle contract. The visual side then
// delegates to the exact controller used by the local player. Vehicle-specific
// GLB hierarchy, material, wheel, lamp and trailer logic therefore lives in one
// place only: the local authored controller. Explicit transmission gear is the
// source of truth for reverse when present.

const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
function normalizeGear(value){
  const n=Number(value);
  if(!Number.isFinite(n))return null;
  return n<0?-1:n===0?0:Math.max(1,Math.floor(n));
}

export function normalizeMultiplayerVehicleState(input={},vehicleSpec=null){
  const maxSteer=Math.max(.05,finite(vehicleSpec?.physics?.maxSteerLow,.45));
  const steerAngle=finite(input.steerAngle,input.steer);
  const gear=normalizeGear(input.gear);
  return Object.freeze({
    absX:finite(input.absX,0),
    absZ:finite(input.absZ,0),
    renderX:finite(input.renderX,0),
    renderZ:finite(input.renderZ,0),
    heading:finite(input.heading,0),
    speed:finite(input.speed,0),
    steerAngle,
    steerInput:Number.isFinite(Number(input.steerInput))
      ?clamp(input.steerInput,-1,1)
      :clamp(steerAngle/maxSteer,-1,1),
    gear,
    braking:!!input.braking,
    reversing:gear!==null?gear<0:!!input.reversing,
    nightLevel:clamp(input.nightLevel,0,1),
    signalLeft:!!input.signalLeft,
    signalRight:!!input.signalRight,
    signalBlink:!!input.signalBlink,
    distance:Math.max(0,finite(input.distance,0))
  });
}

function disposeTree(root){
  if(!root)return;
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse?.(obj=>{
    if(obj.geometry)geometries.add(obj.geometry);
    for(const mat of (Array.isArray(obj.material)?obj.material:[obj.material])){
      if(!mat)continue;materials.add(mat);
      for(const key of ['map','emissiveMap','normalMap','roughnessMap','metalnessMap','alphaMap'])if(mat[key])textures.add(mat[key]);
    }
  });
  root.removeFromParent?.();
  for(const geometry of geometries)geometry.dispose?.();
  for(const texture of textures)texture.dispose?.();
  for(const material of materials)material.dispose?.();
  root.clear?.();
}

function isolatedVehicleSystem(vehicleId){
  const vehicleSystem=createVehicleSystem({initialId:vehicleId});
  if(vehicleSystem.activeId!==vehicleId)vehicleSystem.select?.(vehicleId);
  return vehicleSystem;
}

export function createRemoteVehicleAdapter({
  THREE,
  vehicleId,
  car,
  bodyGroup,
  existingWheels=[],
  scene=null,
  groundHeightForWheel=()=>0
}={}){
  const descriptor=getAuthoredVehicleDescriptor(vehicleId);
  const vehicleSystem=descriptor?isolatedVehicleSystem(vehicleId):null;
  const sceneRoot=scene||car?.parent||null;
  let system=null;
  let loading=null;
  let loadError=null;
  let disposed=false;
  let visible=true;
  let lastDt=1/60;
  let lastState=normalizeMultiplayerVehicleState({},vehicleSystem?.active);
  let ownedSceneRoots=[];
  let updates=0;

  // The truck controller positions its articulated trailer in render space from
  // absolute world coordinates. Infer the receiver's current floating origin
  // from the already-resolved remote render position, keeping it aligned with
  // the same presentation smoothing as the tractor.
  let inferredWorldOffset={x:0,z:0};
  const getInferredWorldOffset=()=>inferredWorldOffset;

  function refreshWorldOffset(state){
    if(!Number.isFinite(state.absX)||!Number.isFinite(state.absZ))return;
    inferredWorldOffset={x:state.absX-state.renderX,z:state.absZ-state.renderZ};
  }

  function setControllerActive(next){
    if(!system)return;
    if(descriptor?.kind==='articulated-truck'){
      system.setActive?.(next,{absX:lastState.absX,absZ:lastState.absZ,heading:lastState.heading});
    }else{
      system.setActive?.(next);
    }
  }

  async function ensureLoaded(){
    if(disposed||system||loading||!descriptor)return system;
    loading=(async()=>{
      try{
        const before=new Set(sceneRoot?.children||[]);
        const factory=await loadAuthoredVehicleFactory(vehicleId);
        if(disposed)return null;
        const options=descriptor.kind==='articulated-truck'
          ?{THREE,scene:sceneRoot,car,bodyGroup,existingWheels,vehicleSystem,groundHeightForWheel,getWorldOffset:getInferredWorldOffset}
          :{THREE,bodyGroup,existingWheels,vehicleSystem};
        const created=factory(options);
        if(!created)throw new Error(`${descriptor.label}: controller factory returned no system`);
        system=created;
        if(sceneRoot)ownedSceneRoots=sceneRoot.children.filter(child=>!before.has(child));
        setControllerActive(visible);
        if(visible)system.update?.(lastDt,lastState);
        return system;
      }catch(error){
        loadError=error;
        console.warn(`Remote ${vehicleId} local-visual adapter unavailable; support fallback kept.`,error);
        return null;
      }finally{
        loading=null;
      }
    })();
    return loading;
  }

  function setVisible(next,state=null){
    const desired=!!next;
    if(state){lastState=normalizeMultiplayerVehicleState(state,vehicleSystem?.active);refreshWorldOffset(lastState);}
    if(desired===visible)return;
    visible=desired;
    setControllerActive(visible);
  }

  function update(dt,input={}){
    if(disposed)return;
    lastDt=Math.max(.001,Math.min(.05,finite(dt,1/60)));
    lastState=normalizeMultiplayerVehicleState(input,vehicleSystem?.active);
    refreshWorldOffset(lastState);
    if(!system){ensureLoaded();return;}
    if(!visible)return;
    system.update?.(lastDt,lastState);
    updates++;
  }

  function controllerReady(){
    if(!system)return false;
    return descriptor?.kind==='articulated-truck'?!!system.glbReady:!!system.ready;
  }

  function diagnostics(){
    return {
      vehicleId,
      registered:!!descriptor,
      kind:descriptor?.kind||'fallback',
      capabilities:[...(descriptor?.capabilities||[])],
      source:'local-authored-controller',
      controllerLoaded:!!system,
      visualReady:controllerReady(),
      loading:!!loading,
      loadError:loadError?String(loadError?.message||loadError):null,
      visible,
      updates,
      gear:lastState.gear,
      reversing:lastState.reversing
    };
  }

  if(descriptor)ensureLoaded();

  return {
    vehicleId,
    descriptor,
    vehicleSystem,
    update,
    setVisible,
    ensureLoaded,
    get ready(){return controllerReady();},
    get loadError(){return loadError;},
    diagnostics,
    dispose(){
      if(disposed)return;disposed=true;visible=false;
      try{setControllerActive(false);}catch{}
      if(system?.host)disposeTree(system.host);
      for(const root of ownedSceneRoots)disposeTree(root);
      ownedSceneRoots=[];system=null;
    }
  };
}
