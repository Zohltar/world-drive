import {createLocalWorldBuilder as createLocalWorldBuilderP926} from './local-world-builder-p926.js';

const P937_ROAD_PREP_GAP_MS=8;

export function createLocalWorldBuilder(options={}){
  const terrainService=options.terrainService;
  const scheduleVisualJob=options.scheduleVisualJob;
  const getWorldOffset=options.getWorldOffset;
  let incrementalInstall=false;
  let roadReplay=null;

  const roadPerf={
    preparations:0,
    preparedObjects:0,
    discarded:0,
    replayCommits:0,
    replayObjects:0,
    fallbackBuilds:0,
    maxSliceMs:0,
    lastPrepareWallMs:0,
    maxPrepareWallMs:0
  };

  const sameOffset=(a,b)=>!!a&&!!b&&Math.hypot(
    (Number(a.x)||0)-(Number(b.x)||0),
    (Number(a.z)||0)-(Number(b.z)||0)
  )<.5;
  const now=()=>globalThis.performance?.now?.()??Date.now();

  function disposePreparedObject(object){
    object?.traverse?.(child=>child.geometry?.dispose?.());
  }

  function disposeRoadStage(stage){
    if(!stage)return;
    for(const list of [stage.volume,stage.lateral,stage.ribbon,stage.offset]){
      for(const object of list||[])if(object)disposePreparedObject(object);
      if(list)list.length=0;
    }
  }

  function takePrepared(kind,fallback,args){
    const list=roadReplay?.[kind];
    if(list?.length){
      const object=list.shift();
      roadPerf.replayObjects++;
      return object;
    }
    roadPerf.fallbackBuilds++;
    return fallback?.(...args);
  }

  const originalRoadVolume=options.buildRoadVolume;
  const originalLateralBand=options.buildLateralBand;
  const originalRibbon=options.buildRibbon;
  const originalOffsetRibbon=options.buildOffsetRibbon;

  const terrainProxy=terrainService?Object.create(terrainService):terrainService;
  if(terrainProxy){
    terrainProxy.setRoadBed=(...args)=>{
      if(incrementalInstall&&typeof terrainService?.setRoadBedStateOnly==='function'){
        return terrainService.setRoadBedStateOnly(...args);
      }
      return terrainService?.setRoadBed?.(...args);
    };
  }

  const base=createLocalWorldBuilderP926({
    ...options,
    terrainService:terrainProxy,
    buildRoadVolume:(...args)=>takePrepared('volume',originalRoadVolume,args),
    buildLateralBand:(...args)=>takePrepared('lateral',originalLateralBand,args),
    buildRibbon:(...args)=>takePrepared('ribbon',originalRibbon,args),
    buildOffsetRibbon:(...args)=>takePrepared('offset',originalOffsetRibbon,args)
  });

  function scheduleRoadPrep(callback){
    if(typeof globalThis.setTimeout==='function')globalThis.setTimeout(callback,P937_ROAD_PREP_GAP_MS);
    else callback();
  }

  async function prepareRoadStage(prepared){
    if(!prepared?.profile?.length||prepared.profile.length<=1)return null;
    const started=now();
    const expectedOffset=prepared.offset;
    const stage={volume:[],lateral:[],ribbon:[],offset:[]};
    const tasks=[
      ()=>stage.volume.push(originalRoadVolume?.(prepared.profile)||null),
      ()=>stage.lateral.push(originalLateralBand?.(prepared.profile,5.20,3.75,options.shoulderMat,.035)||null),
      ()=>stage.lateral.push(originalLateralBand?.(prepared.profile,-3.75,-5.20,options.shoulderMat,.035)||null),
      ()=>stage.ribbon.push(originalRibbon?.(prepared.profile,7.5,options.roadMat,options.ROAD_SURFACE_OFFSET)||null),
      ()=>stage.offset.push(originalOffsetRibbon?.(prepared.profile,0,.13,options.lineYellow,.165)||null),
      ()=>stage.offset.push(originalOffsetRibbon?.(prepared.profile,-3.45,.10,options.lineWhite,.16)||null),
      ()=>stage.offset.push(originalOffsetRibbon?.(prepared.profile,3.45,.10,options.lineWhite,.16)||null)
    ];

    roadPerf.preparations++;
    for(const task of tasks){
      if(!sameOffset(getWorldOffset?.()||{x:0,z:0},expectedOffset)){
        roadPerf.discarded++;
        disposeRoadStage(stage);
        return null;
      }
      await new Promise(resolve=>scheduleRoadPrep(resolve));
      if(!sameOffset(getWorldOffset?.()||{x:0,z:0},expectedOffset)){
        roadPerf.discarded++;
        disposeRoadStage(stage);
        return null;
      }
      const sliceStarted=now();
      task();
      const elapsed=now()-sliceStarted;
      roadPerf.maxSliceMs=Math.max(roadPerf.maxSliceMs,elapsed);
    }

    roadPerf.preparedObjects+=tasks.length;
    roadPerf.lastPrepareWallMs=now()-started;
    roadPerf.maxPrepareWallMs=Math.max(roadPerf.maxPrepareWallMs,roadPerf.lastPrepareWallMs);
    return stage;
  }

  function rebuild(...args){
    terrainService?.cancelRoadTransitionPreparation?.();
    return base.rebuild?.(...args);
  }

  async function prepareIncremental(...args){
    incrementalInstall=true;
    let preparedPromise;
    try{
      // Async functions execute synchronously until their first await. P9.25's
      // road-state install happens before that await, so this narrow flag swaps
      // only that call to the P9.27 state-only terrain path. All forced/sync
      // rebuilds continue to use the proven full setRoadBed implementation.
      preparedPromise=base.prepareIncremental?.(...args);
    }finally{
      incrementalInstall=false;
    }
    const prepared=await preparedPromise;
    if(!prepared)return prepared;

    // P9.37: build the seven road presentation meshes one timer turn at a time
    // while the world is already in its prepared state. They stay off-scene and
    // are replayed into roadGroup during commit, removing the former 8-12 ms
    // synchronous buildRoadMeshes burst from the atomic world swap.
    prepared.p937RoadStage=await prepareRoadStage(prepared);
    if(prepared.meta){
      prepared.meta.p937RoadPrepared=!!prepared.p937RoadStage;
      prepared.meta.p937RoadPrepareMaxSliceMs=Number(roadPerf.maxSliceMs.toFixed(3));
      prepared.meta.p937RoadPrepareWallMs=Number(roadPerf.lastPrepareWallMs.toFixed(3));
    }
    return prepared;
  }

  function commitPrepared(prepared){
    roadReplay=prepared?.p937RoadStage||null;
    if(roadReplay)roadPerf.replayCommits++;
    try{
      const result=base.commitPrepared?.(prepared);
      if(result&&typeof terrainService?.rebuildRoadTransitionIncremental==='function'){
        terrainService.cancelRoadTransitionPreparation?.();
        scheduleVisualJob?.(
          'road-transition',
          ()=>terrainService.rebuildRoadTransitionIncremental(),
          360
        );
      }
      return result;
    }finally{
      // Any leftovers mean the base commit did not consume the complete staged
      // road (for example a discarded/stale commit). Dispose only geometry;
      // shared road materials remain owned by main.js.
      if(roadReplay){
        for(const list of [roadReplay.volume,roadReplay.lateral,roadReplay.ribbon,roadReplay.offset]){
          for(const object of list||[])if(object)disposePreparedObject(object);
        }
      }
      roadReplay=null;
    }
  }

  function cancelPreparation(...args){
    terrainService?.cancelRoadTransitionPreparation?.();
    return base.cancelPreparation?.(...args);
  }

  function p923Diagnostics(){
    return {
      ...(base.p923Diagnostics?.()||{}),
      p926Horizon:terrainService?.p926Diagnostics?.()||null,
      p927RoadTransition:terrainService?.p927Diagnostics?.()||null,
      p937RoadPrebuild:{
        enabled:true,
        preparations:roadPerf.preparations,
        preparedObjects:roadPerf.preparedObjects,
        discarded:roadPerf.discarded,
        replayCommits:roadPerf.replayCommits,
        replayObjects:roadPerf.replayObjects,
        fallbackBuilds:roadPerf.fallbackBuilds,
        maxSliceMs:Number(roadPerf.maxSliceMs.toFixed(3)),
        lastPrepareWallMs:Number(roadPerf.lastPrepareWallMs.toFixed(3)),
        maxPrepareWallMs:Number(roadPerf.maxPrepareWallMs.toFixed(3)),
        gapMs:P937_ROAD_PREP_GAP_MS
      }
    };
  }

  const api={
    ...base,
    rebuild,
    prepareIncremental,
    commitPrepared,
    cancelPreparation,
    p923Diagnostics
  };
  try{globalThis.__WORLD_DRIVE_P923_LOCAL_WORLD__=api;}catch{}
  return api;
}
