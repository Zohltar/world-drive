import {registerForestPilotRoute} from './forest-visual-pilot.js';
import {ensureWorldDriveDiagnostics} from './diagnostics.js';

/** Route observation + R24 default biome activation.
 * Routing remains authoritative. The automatic presentation is asynchronous,
 * source-proofed by the existing pilot and falls back to generic R4 on any miss.
 */
export function attachBiomeRouteDiagnostics(lifecycle,options,{target=globalThis,
  load=()=>import('../scenery/biomes/gameplay-diagnostics.js')}={}){
  if(!target.document)return lifecycle;
  let observer=null,loadEpoch=0,request=0,routeReady=!!options.route?.length,lastError=null;
  let listening=false,defaultEpoch=0,defaultLauncher=null;
  let defaultState={enabled:true,phase:'waiting-route',routeId:null,pilot:null,error:null,activations:0,fallbacks:0};
  const diagnostics=ensureWorldDriveDiagnostics(target);
  const visualPilot=registerForestPilotRoute({getState:options.getState,
    getGeneration:()=>lifecycle.worldDrive.route.generation,getRoute:()=>options.route,
    isRouteReady:()=>routeReady},target);

  function defaultSnapshot(){return {...defaultState};}
  function defaultDisabled(){return target.__WORLD_DRIVE_DISABLE_DEFAULT_BIOMES__===true;}
  function setDefaultState(next){defaultState={...defaultState,...next};}
  function cancelDefault(){
    defaultEpoch++;
    const launcher=defaultLauncher;defaultLauncher=null;
    try{launcher?.stop?.();}catch{}
  }
  async function defaultLauncherFor(id){
    if(id==='eifel-r22')return import('../../tools/biomes/eifel-pilot-launcher-r22.mjs');
    if(id==='boreal-r21')return import('../../tools/biomes/boreal-pilot-launcher-r21.mjs');
    if(id==='dry-r19')return import('../../tools/biomes/dry-pilot-launcher-r19.mjs');
    if(id==='humid-r20')return import('../../tools/biomes/humid-montane-pilot-launcher-r20.mjs');
    throw new TypeError('Unknown R24 default biome launcher');
  }
  async function activateDefaultBiome(token=request){
    const epoch=++defaultEpoch;
    if(token!==request||!routeReady)return {status:'discarded'};
    if(defaultDisabled()){
      setDefaultState({enabled:false,phase:'manual-test-mode',routeId:null,pilot:null,error:null});
      return {status:'disabled'};
    }
    setDefaultState({enabled:true,phase:'selecting',routeId:null,pilot:null,error:null});
    try{
      const selector=await import('../../tools/biomes/default-biome-activation-r24.mjs');
      if(epoch!==defaultEpoch||token!==request||!routeReady)return {status:'discarded'};
      const choice=selector.selectDefaultBiomeR24(options.getState());
      if(!choice){
        diagnostics.forest.visualPilot?.stop?.();
        defaultLauncher=null;
        setDefaultState({phase:'fallback-generic-r4',routeId:null,pilot:null,error:null,fallbacks:defaultState.fallbacks+1});
        return {status:'fallback'};
      }
      const launcher=await defaultLauncherFor(choice.launcher);
      if(epoch!==defaultEpoch||token!==request||!routeReady){try{launcher.stop?.();}catch{}return {status:'discarded'};}
      defaultLauncher=launcher;
      setDefaultState({phase:'starting',routeId:choice.id,pilot:choice.pilot,error:null});
      const result=await launcher.start({season:'summer'});
      if(epoch!==defaultEpoch||token!==request||!routeReady){try{launcher.stop?.();}catch{}return {status:'discarded'};}
      setDefaultState({phase:'active',routeId:choice.id,pilot:choice.pilot,error:null,activations:defaultState.activations+1});
      return result;
    }catch(error){
      if(epoch!==defaultEpoch||token!==request)return {status:'discarded'};
      try{defaultLauncher?.stop?.();}catch{}
      defaultLauncher=null;
      const message=String(error?.message??error).slice(0,200);
      setDefaultState({phase:'fallback-error',pilot:null,error:message,fallbacks:defaultState.fallbacks+1});
      return {status:'fallback',error:message};
    }
  }

  diagnostics.forest.defaultBiomes=Object.freeze({
    snapshot:defaultSnapshot,
    refresh:()=>activateDefaultBiome(request)
  });

  function stop(){loadEpoch++;observer?.stop();lastError=null;
    if(listening)target.removeEventListener?.('pagehide',stop);listening=false;}
  async function start(config){
    const serialized=JSON.stringify(config);
    if(!serialized||serialized.length>2*1024*1024)throw new RangeError('Diagnostic configuration size');
    stop();const token=loadEpoch;
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
  diagnostics.forest.biomes=api;

  function invalidate(){
    cancelDefault();visualPilot.invalidate();request++;routeReady=false;
    setDefaultState({enabled:!defaultDisabled(),phase:'waiting-route',routeId:null,pilot:null,error:null});
    try{observer?.invalidate('game-route-lifecycle');}
    catch(error){lastError=String(error?.message??error).slice(0,160);}
  }
  function observePromise(fn,args){
    invalidate();const token=request;
    const promise=fn(...args);
    Promise.resolve(promise).then(ok=>{
      if(token!==request||!ok)return;
      routeReady=true;observer?.routeReady();
      void activateDefaultBiome(token);
    }).catch(error=>{lastError=String(error?.message??error).slice(0,160);});
    return promise;
  }
  return {...lifecycle,
    loadRoute:(...args)=>observePromise(lifecycle.loadRoute,args),
    createRequestedRoute:(...args)=>observePromise(lifecycle.createRequestedRoute,args),
    bumpRouteGeneration:(...args)=>{invalidate();return lifecycle.bumpRouteGeneration(...args);},
    resetWorldCaches:(...args)=>{invalidate();return lifecycle.resetWorldCaches(...args);}};
}
