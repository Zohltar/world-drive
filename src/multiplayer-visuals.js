// Lightweight multiplayer visual facade.
// The full remote presentation stack is optional and is loaded only when the
// multiplayer client is about to connect. This keeps interpolation/support/GLB
// adapter code out of the normal single-player startup bundle.

export function createMultiplayerVisualSystem(options={}){
  let implementation=null;
  let loadPromise=null;
  let loadError=null;

  async function prepare(){
    if(implementation)return implementation;
    if(loadPromise)return loadPromise;
    loadPromise=(async()=>{
      try{
        const module=await import('./multiplayer-visuals-m3.js');
        implementation=module.createMultiplayerVisualSystem(options);
        loadError=null;
        return implementation;
      }catch(error){
        loadError=error;
        console.warn('Multiplayer visual runtime failed to load',error);
        return null;
      }
    })();
    return loadPromise;
  }

  function createRemoteVehicleVisual(...args){
    if(!implementation){
      // The public multiplayer client awaits prepare() before opening its
      // socket, so a peer cannot normally arrive before this point.
      console.warn('Remote visual requested before multiplayer visual preload');
      return null;
    }
    return implementation.createRemoteVehicleVisual?.(...args)||null;
  }
  createRemoteVehicleVisual.prepare=prepare;

  function solveRemoteVehicleSupport(...args){
    return implementation?.solveRemoteVehicleSupport?.(...args)||null;
  }
  solveRemoteVehicleSupport.prepare=prepare;

  function diagnostics(){
    if(implementation?.diagnostics)return implementation.diagnostics();
    return {
      enabled:false,
      lazy:true,
      loaded:false,
      loading:!!loadPromise&&!implementation&&!loadError,
      loadError:loadError?String(loadError?.message||loadError):null,
      visualSource:'same-local-authored-controller'
    };
  }

  try{globalThis.__WORLD_DRIVE_MULTIPLAYER_HD_VISUALS__=diagnostics;}catch{}

  return {
    createRemoteVehicleVisual,
    solveRemoteVehicleSupport,
    diagnostics,
    prepare,
    get loaded(){return !!implementation;},
    get loadError(){return loadError;}
  };
}
