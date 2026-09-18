import {registerForestPilotRoute} from './forest-visual-pilot.js';
/** Public-route facade observation only. The maintained routing implementation
 * and its original promises/results stay authoritative. Disabled until start().
 */
import {ensureWorldDriveDiagnostics} from './diagnostics.js';
export function attachBiomeRouteDiagnostics(lifecycle,options,{target=globalThis,
  load=()=>import('../scenery/biomes/gameplay-diagnostics.js')}={}){
  if(!target.document)return lifecycle; // Node/legacy callers retain exact API.
  let observer=null,loadEpoch=0,request=0,routeReady=!!options.route?.length,lastError=null;
  let listening=false;
  const visualPilot=registerForestPilotRoute({getState:options.getState,
    getGeneration:()=>lifecycle.worldDrive.route.generation,getRoute:()=>options.route,
    isRouteReady:()=>routeReady},target);
  function stop(){loadEpoch++;observer?.stop();lastError=null;
    if(listening)target.removeEventListener?.('pagehide',stop);listening=false;}
  async function start(config){
    const serialized=JSON.stringify(config);
    if(!serialized||serialized.length>2*1024*1024)throw new RangeError('Diagnostic configuration size');
    stop();const token=loadEpoch;
    // Register before the lazy import: pagehide may happen while it is pending.
    target.addEventListener?.('pagehide',stop);listening=true;
    try{
      const module=await load();if(token!==loadEpoch)return {status:'discarded'};
      observer??=module.createBiomeGameplayDiagnostics({getState:options.getState,
        getGeneration:()=>lifecycle.worldDrive.route.generation,getRoute:()=>options.route,
        isRouteReady:()=>routeReady});
      return observer.start(JSON.parse(serialized));
    }catch(error){
      if(token!==loadEpoch)return {status:'discarded'};
      stop();lastError=String(error?.message??error).slice(0,160);throw error;
    }
  }
  const api=Object.freeze({start,stop,refresh:()=>observer?.refresh(),
    snapshot:()=>observer?.diagnostics()??{enabled:false,diagnosticOnly:true,phase:'disabled',error:lastError},
    sample:(cx,cz,index)=>observer?.sample(cx,cz,index)??null});
  ensureWorldDriveDiagnostics(target).forest.biomes=api;
  function invalidate(){visualPilot.invalidate();request++;routeReady=false;
    try{observer?.invalidate('game-route-lifecycle');}
    catch(error){lastError=String(error?.message??error).slice(0,160);}
  }
  function observePromise(fn,args){
    invalidate();const token=request;
    const promise=fn(...args);
    // Attach a side-effect-only continuation; return the original promise. Never
    // await biome initialization/coverage from the game's route-ready path.
    Promise.resolve(promise).then(ok=>{
      if(token!==request||!ok)return;
      routeReady=true;observer?.routeReady();
    }).catch(error=>{lastError=String(error?.message??error).slice(0,160);});
    return promise;
  }
  return {...lifecycle,
    loadRoute:(...args)=>observePromise(lifecycle.loadRoute,args),
    createRequestedRoute:(...args)=>observePromise(lifecycle.createRequestedRoute,args),
    bumpRouteGeneration:(...args)=>{invalidate();return lifecycle.bumpRouteGeneration(...args);},
    resetWorldCaches:(...args)=>{invalidate();return lifecycle.resetWorldCaches(...args);}};
}
