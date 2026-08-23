// World Drive V21.25 — streamed-world scheduling and floating-origin coordinator.
// Owns hitch-free refresh policy, deferred visual jobs, directional/cache prefetch,
// floating-origin shifts and streamed-world diagnostics. Heavy rendering stays in main.js.

export function createStreamingCoordinator({
  createWorldStreaming,
  toLatLon,
  nearestRoute,
  routePointAtCum,
  routePointAtFraction,
  getRouteLength,
  getRoutePointCount,
  elevationService,
  waterData,
  sceneryData,
  imageryService,
  getRoadMetadataState,
  signData,
  loadElevationAround,
  loadWaterAround,
  loadSceneryAround,
  buildImageryMosaic,
  loadRoadMetadataAround,
  loadGeographicSignsAround,
  fetchCached,
  streamedWorldGroups,
  ground,
  terrainService,
  camera,
  camTarget,
  car,
  resetStreamedWorldOrigins,
  rebuildLocalWorld,
  applyImageryToGround,
  markStaticShadowsDirty,
  getRuntimeState,
  setWorldOffset
}){
  if(typeof createWorldStreaming!=='function')throw new Error('streaming coordinator requires createWorldStreaming');
  if(typeof getRuntimeState!=='function')throw new Error('streaming coordinator requires getRuntimeState');
  if(typeof setWorldOffset!=='function')throw new Error('streaming coordinator requires setWorldOffset');
  if(typeof rebuildLocalWorld!=='function')throw new Error('streaming coordinator requires rebuildLocalWorld');

  const policy={
    perfConsoleLogging:false,
    softRecenterDistance:520,
    hardWorldRefreshDistance:1450,
    urgentWorldRefreshDistance:2200,
    calmSpeed:4.5
  };

  const state={
    pendingWorld:false,
    reasons:new Set(),
    lastBuiltCenter:{x:0,z:0},
    lastWorldBuildAt:0,
    lastHitchAt:0,
    maxFrameMs:0,
    hitchCount:0
  };

  const deferredVisualJobs=new Map();
  let deferredVisualJobSerial=0;

  const terrainPreloadPolicy={
    aheadDistance:10500,
    behindDistance:1800,
    longitudinalStep:900,
    lateralOffsets:[0,-1500,1500,-3000,3000],
    speedLeadPerMps:38,
    maxSpeedLead:3200,
    batchSize:5,
    bootstrapAheadDistance:7200,
    bootstrapStep:1200,
    bootstrapLateralOffsets:[0,-2800,2800],
    bootstrapTimeoutMs:6500
  };

  const aheadStreamingBuckets=new Set();
  const terrainPreloadQueuedKeys=new Set();
  const terrainPreloadQueue=[];
  let nextDirectionalPrefetchAt=0;
  let nextAheadStreamingAt=0;
  let lastImageryRefreshAt=0;

  const roadMetadata={
    get center(){return getRoadMetadataState()?.center},
    get loading(){return !!getRoadMetadataState()?.loading},
    load:(x,z)=>loadRoadMetadataAround(x,z)
  };

  const worldStreaming=createWorldStreaming({
    toLatLon,
    nearestRoute,
    routePointAtCum,
    routePointAtFraction,
    getRouteLength,

    elevation:{
      get center(){return elevationService.center},
      get loading(){return elevationService.loading},
      load:(x,z)=>loadElevationAround(x,z),
      prefetch:(x,z)=>elevationService.prefetchAt(x,z)
    },

    water:{
      get center(){return waterData.center},
      get loading(){return waterData.loading},
      get generation(){return waterData.generation},
      load:(x,z)=>loadWaterAround(x,z),
      prefetch:(x,z,timeoutMs)=>waterData.prefetchAt(x,z,timeoutMs)
    },

    scenery:{
      get center(){return sceneryData.center},
      get loading(){return sceneryData.loading},
      load:(x,z)=>loadSceneryAround(x,z),
      query:ll=>sceneryData.query(ll)
    },

    imagery:{
      get center(){return imageryService.center},
      get loading(){return imageryService.loading},
      load:(x,z)=>buildImageryMosaic(x,z),
      prefetch:(x,z)=>imageryService.prefetchAt(x,z)
    },

    roadMetadata,

    signs:{
      get center(){return signData.center},
      get loading(){return signData.loading},
      load:(x,z)=>loadGeographicSignsAround(x,z),
      query:ll=>signData.query(ll)
    },

    fetchCached
  });

  function runtime(){
    return getRuntimeState()||{};
  }

  function markWorldRefresh(reason='stream'){
    state.pendingWorld=true;
    state.reasons.add(reason);
  }

  function scheduleVisualJob(key,job,timeout=180){
    if(deferredVisualJobs.has(key))return false;
    const token=++deferredVisualJobSerial;
    deferredVisualJobs.set(key,token);

    const run=()=>{
      if(deferredVisualJobs.get(key)!==token)return;
      deferredVisualJobs.delete(key);
      try{job();}
      catch(error){console.warn('Deferred visual job failed: '+key,error);}
    };

    if(typeof globalThis.requestIdleCallback==='function'){
      globalThis.requestIdleCallback(run,{timeout});
    }else{
      setTimeout(run,Math.min(120,timeout));
    }
    return true;
  }

  function cancelVisualJob(key){
    return deferredVisualJobs.delete(key);
  }

  function hasVisualJob(key){
    return deferredVisualJobs.has(key);
  }

  function shiftRenderedWorldForOrigin(shiftX,shiftZ){
    for(const group of streamedWorldGroups||[]){
      group.position.x-=shiftX;
      group.position.z-=shiftZ;
      group.updateMatrix?.();
    }
    if(ground?.position){
      ground.position.x-=shiftX;
      ground.position.z-=shiftZ;
      ground.updateMatrix?.();
    }
    terrainService.shiftRoadBedOrigin?.(shiftX,shiftZ);
    imageryService.shiftOrigin?.(shiftX,shiftZ);
  }

  function commitWorldRefresh(){
    const current=runtime();
    resetStreamedWorldOrigins?.();
    terrainService.resetRoadBedOrigin?.();
    rebuildLocalWorld();
    imageryService.realignToOrigin?.();
    imageryService.invalidateGeometry?.();
    applyImageryToGround?.();
    if(imageryService.enabled){
      Promise.resolve(buildImageryMosaic(current.absX,current.absZ)).catch(()=>{});
    }
    state.pendingWorld=false;
    state.reasons.clear();
    state.lastBuiltCenter={...(current.worldOffset||{x:0,z:0})};
    state.lastWorldBuildAt=performance.now();
    markStaticShadowsDirty?.();
    return true;
  }

  function scheduleWorldRefresh({urgent=false}={}){
    if(hasVisualJob('world-rebuild'))return false;
    const attempt=()=>{
      const current=runtime();
      const center=state.lastBuiltCenter;
      const buildDistance=Math.hypot(
        (current.absX||0)-center.x,
        (current.absZ||0)-center.z
      );
      const calm=
        !current.gameStarted||
        current.menuOpen||
        Math.abs(current.speed||0)<=policy.calmSpeed;
      const mustRun=
        urgent||
        buildDistance>=policy.urgentWorldRefreshDistance;
      if(!calm&&!mustRun)return;
      commitWorldRefresh();
    };
    return scheduleVisualJob('world-rebuild',attempt,1200);
  }

  function recenterIfNeeded(absx,absz,force=false){
    const current=runtime();
    const offset=current.worldOffset||{x:0,z:0};
    const dx=absx-offset.x;
    const dz=absz-offset.z;
    if(!force&&dx*dx+dz*dz<=policy.softRecenterDistance**2)return false;

    const shiftX=dx;
    const shiftZ=dz;
    const nextOffset={x:absx,z:absz};
    setWorldOffset(nextOffset);

    if(camera?.position){camera.position.x-=shiftX;camera.position.z-=shiftZ;}
    if(camTarget){camTarget.x-=shiftX;camTarget.z-=shiftZ;}
    if(car?.position){car.position.x-=shiftX;car.position.z-=shiftZ;}

    if(force){
      cancelVisualJob('world-rebuild');
      commitWorldRefresh();
      return true;
    }

    shiftRenderedWorldForOrigin(shiftX,shiftZ);

    const bx=absx-state.lastBuiltCenter.x;
    const bz=absz-state.lastBuiltCenter.z;
    const buildDistance=Math.hypot(bx,bz);
    if(buildDistance>=policy.hardWorldRefreshDistance){
      markWorldRefresh('recenter');
      scheduleWorldRefresh({
        urgent:buildDistance>=policy.urgentWorldRefreshDistance
      });
    }
    return true;
  }

  function routeTravelSign(nr){
    if(!nr)return 1;
    return Math.cos((runtime().heading||0)-nr.angle)>=0?1:-1;
  }

  function routeBufferProbe(cum,lateralOffset=0){
    const p=routePointAtCum(cum);
    if(!p)return null;
    const nx=Math.cos(p.angle),nz=-Math.sin(p.angle);
    return {
      x:p.x+nx*lateralOffset,
      z:p.z+nz*lateralOffset,
      cum,
      lateralOffset
    };
  }

  function terrainPreloadKey(dir,cum,lateralOffset){
    return String(dir)+':'+Math.round(cum/450)+':'+Math.round(lateralOffset/500);
  }

  function enqueueTerrainPreloadProbe(dir,cum,lateralOffset){
    const key=terrainPreloadKey(dir,cum,lateralOffset);
    if(aheadStreamingBuckets.has(key)||terrainPreloadQueuedKeys.has(key))return false;
    const probe=routeBufferProbe(cum,lateralOffset);
    if(!probe)return false;
    terrainPreloadQueuedKeys.add(key);
    terrainPreloadQueue.push({...probe,key});
    return true;
  }

  function refillTerrainPreloadBuffer(){
    const routeLength=Math.max(0,Number(getRouteLength())||0);
    if(!routeLength||!getRoutePointCount())return 0;
    const current=runtime();
    const nr=nearestRoute(current.absX,current.absZ);
    if(!nr)return 0;

    const dir=routeTravelSign(nr);
    const speedLead=Math.min(
      terrainPreloadPolicy.maxSpeedLead,
      Math.abs(current.speed||0)*terrainPreloadPolicy.speedLeadPerMps
    );
    const ahead=terrainPreloadPolicy.aheadDistance+speedLead;
    let queued=0;

    for(
      let distance=-terrainPreloadPolicy.behindDistance;
      distance<=ahead;
      distance+=terrainPreloadPolicy.longitudinalStep
    ){
      const cum=Math.max(0,Math.min(routeLength,nr.cum+dir*distance));
      for(const lateralOffset of terrainPreloadPolicy.lateralOffsets){
        if(enqueueTerrainPreloadProbe(dir,cum,lateralOffset))queued++;
      }
    }
    return queued;
  }

  function startTerrainPreloadProbe(probe){
    terrainPreloadQueuedKeys.delete(probe.key);
    aheadStreamingBuckets.add(probe.key);
    try{
      const promise=elevationService.prefetchAt?.(probe.x,probe.z);
      if(promise!==undefined)Promise.resolve(promise).catch(()=>{});
    }catch{}
    if(imageryService.enabled){
      try{
        const promise=imageryService.prefetchAt?.(probe.x,probe.z);
        if(promise!==undefined)Promise.resolve(promise).catch(()=>{});
      }catch{}
    }
  }

  function drainTerrainPreloadBuffer(maxJobs=terrainPreloadPolicy.batchSize){
    let started=0;
    while(started<maxJobs&&terrainPreloadQueue.length){
      const probe=terrainPreloadQueue.shift();
      if(!probe)break;
      startTerrainPreloadProbe(probe);
      started++;
    }
    if(aheadStreamingBuckets.size>900){
      const keep=[...aheadStreamingBuckets].slice(-620);
      aheadStreamingBuckets.clear();
      keep.forEach(key=>aheadStreamingBuckets.add(key));
    }
    return started;
  }

  function prefetchRouteAhead(){
    const queued=refillTerrainPreloadBuffer();
    const started=drainTerrainPreloadBuffer();
    return queued>0||started>0;
  }

  function promiseWithTimeout(promise,timeoutMs){
    return Promise.race([
      Promise.resolve(promise),
      new Promise(resolve=>setTimeout(()=>resolve(null),timeoutMs))
    ]);
  }

  async function primeInitialTerrainPreloadBuffer(){
    const routeLength=Math.max(0,Number(getRouteLength())||0);
    if(!routeLength||!getRoutePointCount())return;
    const current=runtime();
    const nr=nearestRoute(current.absX,current.absZ);
    if(!nr)return;
    const dir=routeTravelSign(nr);
    const tasks=[];

    for(
      let distance=0;
      distance<=terrainPreloadPolicy.bootstrapAheadDistance;
      distance+=terrainPreloadPolicy.bootstrapStep
    ){
      const cum=Math.max(0,Math.min(routeLength,nr.cum+dir*distance));
      for(const lateralOffset of terrainPreloadPolicy.bootstrapLateralOffsets){
        const key=terrainPreloadKey(dir,cum,lateralOffset);
        if(aheadStreamingBuckets.has(key))continue;
        const probe=routeBufferProbe(cum,lateralOffset);
        if(!probe)continue;
        aheadStreamingBuckets.add(key);
        try{
          const promise=elevationService.prefetchAt?.(probe.x,probe.z);
          if(promise!==undefined)tasks.push(Promise.resolve(promise).catch(()=>null));
        }catch{}
        if(imageryService.enabled){
          try{
            const promise=imageryService.prefetchAt?.(probe.x,probe.z);
            if(promise!==undefined)tasks.push(Promise.resolve(promise).catch(()=>null));
          }catch{}
        }
      }
    }

    if(tasks.length){
      await promiseWithTimeout(
        Promise.allSettled(tasks),
        terrainPreloadPolicy.bootstrapTimeoutMs
      );
    }
    refillTerrainPreloadBuffer();
    drainTerrainPreloadBuffer(terrainPreloadPolicy.batchSize*2);
  }

  function refreshCurrentImagerySooner(now){
    if(!imageryService.enabled)return;
    const current=runtime();
    const center=imageryService.center;
    if(!center||!Number.isFinite(center.x)||!Number.isFinite(center.z))return;
    const moved=Math.hypot((current.absX||0)-center.x,(current.absZ||0)-center.z);
    if(moved<520||now-lastImageryRefreshAt<1200)return;
    lastImageryRefreshAt=now;
    Promise.resolve(buildImageryMosaic(current.absX,current.absZ)).catch(()=>{});
  }

  function updateFrame(now){
    const current=runtime();
    if(current.gameStarted&&!current.menuOpen&&now>=nextDirectionalPrefetchAt){
      nextDirectionalPrefetchAt=now+250;
      worldStreaming.prefetchDirectional(current.absX,current.absZ);
    }
    if(current.gameStarted&&!current.menuOpen&&now>=nextAheadStreamingAt){
      nextAheadStreamingAt=now+420;
      prefetchRouteAhead();
      refreshCurrentImagerySooner(now);
    }
    if(
      state.pendingWorld&&
      !hasVisualJob('world-rebuild')&&
      (!current.gameStarted||current.menuOpen||Math.abs(current.speed||0)<=policy.calmSpeed)
    ){
      scheduleWorldRefresh({urgent:false});
    }
  }

  function recordFrame(rawFrameMs,now){
    if(rawFrameMs>20){
      state.lastHitchAt=now;
      state.hitchCount++;
      state.maxFrameMs=Math.max(state.maxFrameMs,rawFrameMs);
    }
  }

  function reset(){
    worldStreaming.reset();
    aheadStreamingBuckets.clear();
    terrainPreloadQueuedKeys.clear();
    terrainPreloadQueue.length=0;
    nextAheadStreamingAt=0;
    lastImageryRefreshAt=0;
    state.pendingWorld=false;
    state.reasons.clear();
    state.lastBuiltCenter={...(runtime().worldOffset||{x:0,z:0})};
    state.lastWorldBuildAt=performance.now();
    deferredVisualJobs.clear();
  }

  function diagnostics(){
    const current=runtime();
    return {
      hitchCount:state.hitchCount,
      maxFrameMs:state.maxFrameMs,
      lastHitchAt:state.lastHitchAt,
      pendingWorldRefresh:state.pendingWorld,
      pendingReasons:[...state.reasons],
      worldBuildCenter:{...state.lastBuiltCenter},
      worldOffset:{...(current.worldOffset||{x:0,z:0})}
    };
  }

  return Object.freeze({
    policy,
    state,
    worldStreaming,
    markWorldRefresh,
    scheduleVisualJob,
    cancelVisualJob,
    hasVisualJob,
    commitWorldRefresh,
    scheduleWorldRefresh,
    recenterIfNeeded,
    prefetchRouteAhead,
    primeInitialTerrainPreloadBuffer,
    promiseWithTimeout,
    refreshCurrentImagerySooner,
    updateFrame,
    recordFrame,
    reset,
    diagnostics
  });
}
