// World Drive P9.17 streaming coordinator entry point.
// P9.13 owns the proven transition scheduler. This wrapper adds an adaptive
// background-loading governor: non-essential prefetch/imagery work backs off
// briefly when frame time rises well above the display's normal cadence.
import {createStreamingCoordinator as createStreamingCoordinatorP913} from './streaming-coordinator-p913.js';

export function createStreamingCoordinator(options){
  const base=createStreamingCoordinatorP913(options);

  // These policy objects are intentionally mutable even though the public
  // coordinator object is frozen. Give heavy world refreshes a slightly larger
  // quiet window and avoid eager imagery refreshes immediately after activity.
  base.policy.quietWindowMs=Math.max(base.policy.quietWindowMs||0,420);
  base.policy.imageryRefreshCooldownMs=Math.max(base.policy.imageryRefreshCooldownMs||0,2200);
  base.policy.imageryCommitGuardMs=Math.max(base.policy.imageryCommitGuardMs||0,850);

  const BACKGROUND_COOLDOWN_MS=460;
  const HITCH_IMAGERY_GUARD_MS=650;

  let lastAdaptiveHitchAt=-Infinity;
  let adaptiveDeferrals=0;
  let adaptiveHitches=0;
  let frameBaselineMs=16.7;

  function hitchThresholdMs(){
    // At ~144 Hz the baseline converges near 6.9 ms and the threshold lands
    // around 11.5-12 ms. At 60 Hz the baseline remains ~16.7 ms, so ordinary
    // 60-FPS frames are not mistaken for hitches.
    return Math.max(11.5,Math.min(30,frameBaselineMs*1.65));
  }

  function updateFrameBaseline(rawFrameMs){
    if(!Number.isFinite(rawFrameMs)||rawFrameMs<2||rawFrameMs>80)return;

    // Learn faster when a genuinely faster cadence is observed; learn upward
    // very slowly so an actual hitch cannot redefine itself as the new normal.
    const alpha=rawFrameMs<frameBaselineMs?.08:.004;
    const capped=Math.min(rawFrameMs,frameBaselineMs*1.12);
    frameBaselineMs+= (capped-frameBaselineMs)*alpha;
  }

  function backgroundAllowed(now=performance.now()){
    return now-lastAdaptiveHitchAt>=BACKGROUND_COOLDOWN_MS;
  }

  function recordFrame(rawFrameMs,now){
    base.recordFrame(rawFrameMs,now);
    updateFrameBaseline(rawFrameMs);

    if(rawFrameMs>hitchThresholdMs()){
      lastAdaptiveHitchAt=now;
      adaptiveHitches++;
      options.imageryService?.deferCommits?.(HITCH_IMAGERY_GUARD_MS);
    }
  }

  function updateFrame(now){
    // recenterIfNeeded() is called independently by the runtime, so delaying
    // this background scheduler does not affect vehicle/world coordinates.
    // Pending heavy refreshes simply wait for a clean frame window.
    if(!backgroundAllowed(now)){
      adaptiveDeferrals++;
      return false;
    }
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
        frameBaselineMs,
        hitchThresholdMs:hitchThresholdMs(),
        backgroundCooldownMs:BACKGROUND_COOLDOWN_MS,
        lastAdaptiveHitchAt,
        adaptiveHitches,
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
