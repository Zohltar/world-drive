import {createRoadFurnitureSystem as createRoadFurnitureSystemP930} from './road-furniture-p930.js';
import {ensureWorldDriveDiagnostics} from '../diagnostics.js';

const MIN_IDLE_MS=5.5;
const MAX_IDLE_DEFERRALS=10;
const IDLE_TIMEOUT_MS=900;

function finite(value,fallback=0){return Number.isFinite(value)?value:fallback;}

export function createRoadFurnitureSystem(options={}){
  const base=createRoadFurnitureSystemP930(options);
  let scheduled=false;
  let latestRequestAt=0;
  const perf={
    requests:0,
    coalesced:0,
    runs:0,
    deferrals:0,
    forcedRuns:0,
    lastMs:0,
    maxMs:0,
    lastIdleMs:0
  };

  function runRefresh(deadline,deferrals){
    const idleMs=Number(deadline?.timeRemaining?.())||0;
    perf.lastIdleMs=idleMs;
    if(
      !deadline?.didTimeout&&
      idleMs<MIN_IDLE_MS&&
      deferrals<MAX_IDLE_DEFERRALS
    ){
      perf.deferrals++;
      scheduleAttempt(deferrals+1);
      return;
    }

    scheduled=false;
    if(deadline?.didTimeout)perf.forcedRuns++;
    const started=performance.now();
    base.refreshRoadSignsOnly();
    const elapsed=performance.now()-started;
    perf.runs++;
    perf.lastMs=elapsed;
    perf.maxMs=Math.max(perf.maxMs,elapsed);
  }

  function scheduleAttempt(deferrals=0){
    if(typeof globalThis.requestIdleCallback==='function'){
      globalThis.requestIdleCallback(
        deadline=>runRefresh(deadline,deferrals),
        {timeout:IDLE_TIMEOUT_MS}
      );
      return;
    }
    setTimeout(
      ()=>runRefresh({didTimeout:true,timeRemaining:()=>0},deferrals),
      0
    );
  }

  function refreshRoadSignsOnly(){
    perf.requests++;
    latestRequestAt=performance.now();
    if(scheduled){
      perf.coalesced++;
      return true;
    }
    scheduled=true;
    scheduleAttempt(0);
    return true;
  }

  function diagnostics(){
    const baseDiag=base.diagnostics?.()||{};
    return {
      ...baseDiag,
      enabled:true,
      mode:'p937-idle-sign-collection',
      pending:scheduled||baseDiag.pending===true,
      p937:{
        scheduled,
        requests:perf.requests,
        coalesced:perf.coalesced,
        runs:perf.runs,
        deferrals:perf.deferrals,
        forcedRuns:perf.forcedRuns,
        lastMs:Number(finite(perf.lastMs).toFixed(3)),
        maxMs:Number(finite(perf.maxMs).toFixed(3)),
        lastIdleMs:Number(finite(perf.lastIdleMs).toFixed(3)),
        minIdleMs:MIN_IDLE_MS,
        timeoutMs:IDLE_TIMEOUT_MS,
        latestRequestAt:Number(finite(latestRequestAt).toFixed(3))
      }
    };
  }

  const api=Object.freeze({
    ...base,
    refreshRoadSignsOnly,
    diagnostics
  });
  const roadSignDiagnostics=ensureWorldDriveDiagnostics().roadSigns;
  roadSignDiagnostics.snapshot=diagnostics;
  return api;
}