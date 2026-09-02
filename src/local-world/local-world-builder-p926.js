import {createLocalWorldBuilder as createLocalWorldBuilderP925} from '../local-world-builder-p925.js';

export function createLocalWorldBuilder(options={}){
  const terrainService=options.terrainService;
  const originalReset=options.resetStreamedWorldOrigins;
  const originalSchedule=options.scheduleVisualJob;

  const base=createLocalWorldBuilderP925({
    ...options,
    resetStreamedWorldOrigins:(...args)=>{
      const horizonOrigin=terrainService?.captureHorizonOrigin?.();
      const result=originalReset?.(...args);
      terrainService?.restoreHorizonOrigin?.(horizonOrigin);
      return result;
    },
    scheduleVisualJob:(key,job,timeout)=>{
      if(key==='horizon'&&Number(timeout)>=500&&typeof terrainService?.rebuildHorizonIncremental==='function'){
        terrainService.cancelHorizonPreparation?.();
        return originalSchedule?.(key,()=>terrainService.rebuildHorizonIncremental(),timeout);
      }
      return originalSchedule?.(key,job,timeout);
    }
  });

  const api={
    ...base,
    p923Diagnostics:()=>({
      ...(base.p923Diagnostics?.()||{}),
      p926Horizon:terrainService?.p926Diagnostics?.()||null
    })
  };
  try{globalThis.__WORLD_DRIVE_P923_LOCAL_WORLD__=api;}catch{}
  return api;
}
