import {createLocalWorldBuilder as createLocalWorldBuilderP926} from './local-world-builder-p926.js';

export function createLocalWorldBuilder(options={}){
  const terrainService=options.terrainService;
  const scheduleVisualJob=options.scheduleVisualJob;
  let incrementalInstall=false;

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
    terrainService:terrainProxy
  });

  function rebuild(...args){
    terrainService?.cancelRoadTransitionPreparation?.();
    return base.rebuild?.(...args);
  }

  function prepareIncremental(...args){
    incrementalInstall=true;
    try{
      // Async functions execute synchronously until their first await. P9.25's
      // road-state install happens before that await, so this narrow flag swaps
      // only that call to the P9.27 state-only terrain path. All forced/sync
      // rebuilds continue to use the proven full setRoadBed implementation.
      return base.prepareIncremental?.(...args);
    }finally{
      incrementalInstall=false;
    }
  }

  function commitPrepared(prepared){
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
  }

  function cancelPreparation(...args){
    terrainService?.cancelRoadTransitionPreparation?.();
    return base.cancelPreparation?.(...args);
  }

  function p923Diagnostics(){
    return {
      ...(base.p923Diagnostics?.()||{}),
      p927RoadTransition:terrainService?.p927Diagnostics?.()||null
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
