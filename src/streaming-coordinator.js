// World Drive P9.17 streaming coordinator entry point.
// P9.13 owns the proven transition scheduler. This wrapper adds an adaptive
// background-loading governor: if frame time rises above the 144 Hz comfort
// budget, non-essential prefetch/imagery work backs off briefly instead of
// compounding the hitch with another loading burst.
import {createStreamingCoordinator as createStreamingCoordinatorP913} from './streaming-coordinator-p913.js';

export function createStreamingCoordinator(options){
  const base=createStreamingCoordinatorP913(options);

  // These policy objects are intentionally mutable even though the public
  // coordinator object is frozen. Give heavy world refreshes a slightly larger
  // quiet window and avoid eager imagery refreshes immediately after activity.
  base.policy.quietWindowMs=Math.max(base.policy.quietWindowMs||0,420);
  base.policy.imageryRefreshCooldownMs=Math.max(base.policy.imageryRefreshCooldownMs||0,2200);
  base.policy.imageryCommitGuardMs=Math.max(base.policy.imageryCommitGuardMs||0,850);

  const HITCH_FRAME_MS=12;
  const BACKGROUND_COOLDOWN_MS=460;
  const HITCH_IMAGERY_GUARD_MS=650;

  let lastAdaptiveHitchAt=-Infinity;
  let adaptiveDeferrals=0;

  function backgroundAllowed(now=performance.now()){
    return now-lastAdaptiveHitchAt>=BACKGROUND_COOLDOWN_MS;
  }

  function recordFrame(rawFrameMs,now){
    base.recordFrame(rawFrameMs,now);
    if(rawFrameMs>HITCH_FRAME_MS){
      lastAdaptiveHitchAt=now;
      adaptiveDeferrals++;
      options.imageryService?.deferCommits?.(HITCH_IMAGERY_GUARD_MS);
    }
  }

  function updateFrame(now){
    // recenterIfNeeded() is called independently by the runtime, so delaying
    // this background scheduler does not affect vehicle/world coordinates.
    // Pending heavy refreshes simply wait for a clean frame window.
    if(!backgroundAllowed(now))return false;
    return base.updateFrame(now);
  }

  function prefetchRouteAhead(){
    if(!backgroundAllowed()){
      adaptiveDeferrals++;
      return false;
    }
    return base.prefetchRouteAhead();
  }

  function refreshCurrentImagerySooner(now=performance.now()){
    if(!backgroundAllowed(now)){
      adaptiveDeferrals++;
      return false;
    }
    return base.refreshCurrentImagerySooner(now);
  }

  function diagnostics(){
    return {
      ...base.diagnostics(),
      p917:{
        hitchFrameMs:HITCH_FRAME_MS,
        backgroundCooldownMs:BACKGROUND_COOLDOWN_MS,
        lastAdaptiveHitchAt,
        adaptiveDeferrals,
        backgroundAllowed:backgroundAllowed()
      }
    };
  }

  return Object.freeze({
    ...base,
    recordFrame,
    updateFrame,
    prefetchRouteAhead,
    refreshCurrentImagerySooner,
    diagnostics
  });
}
