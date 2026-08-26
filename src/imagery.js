// World Drive P9.17 imagery entry point.
// Wraps the P9.13 transition-safe chunk renderer with a lightweight prefetch
// governor. Route-ahead code can issue many overlapping prefetch probes in one
// tick; only one 3x3 satellite warm-up is allowed at a time so browser image
// decode cannot arrive in large main-thread bursts while driving.
import {createImageryService as createImageryServiceP913} from './imagery-p913.js';

export function createImageryService(options){
  const service=createImageryServiceP913(options);
  const basePrefetch=service.prefetchAt.bind(service);
  const baseDiagnostics=service.diagnostics?.bind(service);

  let prefetchBusy=false;
  let lastPrefetchAt=-Infinity;
  let lastPrefetchCenter={x:Infinity,z:Infinity};
  let prefetchStarted=0;
  let prefetchSkipped=0;

  const PREFETCH_COOLDOWN_MS=420;
  const PREFETCH_NEAR_DUPLICATE_M=700;

  service.prefetchAt=async(absx,absz)=>{
    const now=performance.now();
    const nearPrevious=Math.hypot(
      absx-lastPrefetchCenter.x,
      absz-lastPrefetchCenter.z
    )<PREFETCH_NEAR_DUPLICATE_M;

    if(
      prefetchBusy||
      now-lastPrefetchAt<PREFETCH_COOLDOWN_MS||
      nearPrevious
    ){
      prefetchSkipped++;
      return false;
    }

    prefetchBusy=true;
    lastPrefetchAt=now;
    lastPrefetchCenter={x:absx,z:absz};
    prefetchStarted++;

    try{
      return await basePrefetch(absx,absz);
    }finally{
      prefetchBusy=false;
    }
  };

  service.diagnostics=()=>({
    ...(baseDiagnostics?.()||{}),
    p917PrefetchBusy:prefetchBusy,
    p917PrefetchStarted:prefetchStarted,
    p917PrefetchSkipped:prefetchSkipped,
    p917PrefetchCooldownMs:PREFETCH_COOLDOWN_MS
  });

  return service;
}
