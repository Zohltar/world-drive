// Lightweight async facade used by authored passenger vehicle systems.
// The heavy per-vehicle module is imported only when that vehicle is selected.
// Until then the existing procedural visual remains authoritative.

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
      if(requestedActive&&!implementation)ensureImplementation();
      return implementation?.setActive?.(...args);
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
