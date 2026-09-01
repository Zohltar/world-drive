import {ensureWorldDriveDiagnostics} from '../diagnostics.js';

// Lightweight async facade used by authored passenger vehicle systems.
// The heavy per-vehicle module is imported only when that vehicle is selected.
// Until then the existing procedural visual remains authoritative.

// M4.7 presentation bridge. Only the ACTIVE local deferred controller writes
// here. Remote multiplayer adapters instantiate authored factories directly and
// therefore cannot overwrite this state. The network can consequently consume
// the exact brake/reverse/night values that local authored rendering received.
const localAuthoredPresentationState={
  sequence:0,
  source:null,
  braking:false,
  reversing:false,
  nightLevel:null
};

function finiteNight(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?Math.max(0,Math.min(1,n)):null;
}

export function publishLocalAuthoredPresentationState(source,input={}){
  localAuthoredPresentationState.source=String(source||'authored');
  localAuthoredPresentationState.braking=!!input.braking;
  localAuthoredPresentationState.reversing=!!input.reversing;
  localAuthoredPresentationState.nightLevel=finiteNight(input.nightLevel);
  localAuthoredPresentationState.sequence++;
  return localAuthoredPresentationState.sequence;
}

export function clearLocalAuthoredPresentationState(source=null){
  if(source!==null&&localAuthoredPresentationState.source!==String(source))return false;
  localAuthoredPresentationState.source=null;
  localAuthoredPresentationState.braking=false;
  localAuthoredPresentationState.reversing=false;
  localAuthoredPresentationState.nightLevel=null;
  localAuthoredPresentationState.sequence++;
  return true;
}

export function resetLocalAuthoredPresentationState(){
  localAuthoredPresentationState.sequence=0;
  localAuthoredPresentationState.source=null;
  localAuthoredPresentationState.braking=false;
  localAuthoredPresentationState.reversing=false;
  localAuthoredPresentationState.nightLevel=null;
}

export function readLocalAuthoredPresentationState(){
  return {
    sequence:localAuthoredPresentationState.sequence,
    source:localAuthoredPresentationState.source,
    braking:localAuthoredPresentationState.braking,
    reversing:localAuthoredPresentationState.reversing,
    nightLevel:localAuthoredPresentationState.nightLevel
  };
}

const presentationDiagnostics=ensureWorldDriveDiagnostics().presentation;
presentationDiagnostics.localAuthored=readLocalAuthoredPresentationState;

function driverCameraModeFallback(modeLabel=''){
  const label=String(modeLabel||'').toLowerCase();
  return label.includes('capot')||
    label.includes('cockpit')||
    label.includes('first')||
    label.includes('1st')||
    label.includes('1re')||
    label.includes('1ère')||
    label.includes('premiere')||
    label.includes('première')||
    label.includes('driver')||
    label.includes('conducteur');
}

export function createDeferredGlbSystem({
  label='vehicle',
  options,
  loadFactory
}={}){
  let implementation=null;
  let moduleLoadPromise=null;
  let moduleLoadError=null;
  let requestedActive=false;

  async function ensureImplementation(){
    if(implementation)return implementation;
    if(moduleLoadPromise)return moduleLoadPromise;
    moduleLoadPromise=(async()=>{
      try{
        const factory=await loadFactory();
        if(typeof factory!=='function')throw new Error(`${label}: GLB factory unavailable`);
        const system=factory(options);
        implementation=system;
        moduleLoadError=null;
        system?.setActive?.(requestedActive);
        return system;
      }catch(error){
        moduleLoadError=error;
        console.warn(`${label}: deferred GLB module unavailable; procedural fallback kept.`,error);
        return null;
      }
    })();
    return moduleLoadPromise;
  }

  function invoke(method,args){
    if(method==='setActive'){
      requestedActive=!!args[0];
      if(!requestedActive)clearLocalAuthoredPresentationState(label);
      if(requestedActive&&!implementation)ensureImplementation();
      return implementation?.setActive?.(...args);
    }

    // Capture BEFORE dispatch and even during the short async load window. This
    // is exactly the state main.js intended to give the active authored model.
    if(method==='update'&&requestedActive){
      publishLocalAuthoredPresentationState(label,args[1]||{});
    }

    if(implementation){
      const value=implementation[method];
      if(typeof value==='function')return value.apply(implementation,args);
      return value;
    }

    // Countach pointer-look checks this synchronously before the authored module
    // has necessarily arrived. Preserve the same camera-mode classification.
    if(method==='isDriverCameraMode')return driverCameraModeFallback(args[0]);

    // update(), adjustCamera(), light setters and pointer deltas are safe no-ops
    // during the very short module-load window. The procedural visual continues
    // rendering until the real implementation becomes ready.
    return undefined;
  }

  return new Proxy({}, {
    get(_target,property){
      if(property==='then')return undefined;
      if(property==='moduleLoaded')return !!implementation;
      if(property==='moduleLoadError')return moduleLoadError;
      if(property==='active')return requestedActive;
      if(property==='ready')return implementation?.ready??false;
      if(property==='loadError')return implementation?.loadError??moduleLoadError;
      if(typeof property==='symbol')return undefined;
      return (...args)=>invoke(property,args);
    }
  });
}
