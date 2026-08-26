// World Drive P9.18 streaming coordinator entry point.
// P9.13 owns the proven transition scheduler. P9.17 added adaptive backoff;
// P9.18 makes that governor driving-aware and adds useful per-job telemetry so
// browser pauses/startup time cannot masquerade as road-transition hitches.
import {createStreamingCoordinator as createStreamingCoordinatorP913} from './streaming-coordinator-p913.js';

export function createStreamingCoordinator(options){
  const base=createStreamingCoordinatorP913(options);

  // Give heavy world refreshes more runway and avoid eager imagery work around
  // activity. These nested policy objects remain mutable although base is frozen.
  base.policy.quietWindowMs=Math.max(base.policy.quietWindowMs||0,420);
  base.policy.imageryRefreshCooldownMs=Math.max(base.policy.imageryRefreshCooldownMs||0,2200);
  base.policy.imageryCommitGuardMs=Math.max(base.policy.imageryCommitGuardMs||0,850);

  const BACKGROUND_COOLDOWN_MS=460;
  const HITCH_IMAGERY_GUARD_MS=650;
  const SUSPENDED_FRAME_MS=250;

  let lastAdaptiveHitchAt=-Infinity;
  let adaptiveDeferrals=0;
  let adaptiveHitches=0;
  let frameBaselineMs=16.7;
  let gameplayFrames=0;
  let gameplayHitchCount=0;
  let maxGameplayFrameMs=0;
  let over12Ms=0;
  let over16_7Ms=0;
  let over25Ms=0;
  let over50Ms=0;
  let over100Ms=0;
  let suspendedFrames=0;
  let ignoredNonDrivingFrames=0;
  const visualJobStats=new Map();

  function hitchThresholdMs(){
    // At ~144 Hz the baseline converges near 6.9 ms and the threshold lands
    // around 11.5-12 ms. At 60 Hz it stays near 27.5 ms, so ordinary 60-FPS
    // cadence is never treated as a hitch.
    return Math.max(11.5,Math.min(30,frameBaselineMs*1.65));
  }

  function updateFrameBaseline(rawFrameMs){
    if(!Number.isFinite(rawFrameMs)||rawFrameMs<2||rawFrameMs>80)return;
    const alpha=rawFrameMs<frameBaselineMs?.08:.004;
    const capped=Math.min(rawFrameMs,frameBaselineMs*1.12);
    frameBaselineMs+=(capped-frameBaselineMs)*alpha;
  }

  function backgroundAllowed(now=performance.now()){
    return now-lastAdaptiveHitchAt>=BACKGROUND_COOLDOWN_MS;
  }

  function runtimeState(){
    try{return options.getRuntimeState?.()||{};}catch{return {};}
  }

  function recordVisualJob(key,ms){
    if(!Number.isFinite(ms))return;
    const previous=visualJobStats.get(key)||{runs:0,totalMs:0,maxMs:0,lastMs:0};
    previous.runs++;
    previous.totalMs+=ms;
    previous.lastMs=ms;
    previous.maxMs=Math.max(previous.maxMs,ms);
    visualJobStats.set(key,previous);
  }

  function scheduleVisualJob(key,job,timeout=180){
    return base.scheduleVisualJob(key,()=>{
      const started=performance.now();
      try{
        const result=job();
        recordVisualJob(key,performance.now()-started);
        return result;
      }catch(error){
        recordVisualJob(key,performance.now()-started);
        throw error;
      }
    },timeout);
  }

  function recordFrame(rawFrameMs,now){
    const current=runtimeState();

    // Startup, chooser/menu time and browser suspension are not driving hitches.
    // A resume still gets a short loading cooldown so queued work cannot all land
    // on the first active frame, but it does not poison maxFrameMs/hitchCount.
    if(!current.gameStarted||current.menuOpen){
      ignoredNonDrivingFrames++;
      return;
    }
    if(!Number.isFinite(rawFrameMs)||rawFrameMs<=0)return;
    if(rawFrameMs>SUSPENDED_FRAME_MS){
      suspendedFrames++;
      lastAdaptiveHitchAt=now;
      if(base.state)base.state.lastHitchAt=now;
      options.imageryService?.deferCommits?.(HITCH_IMAGERY_GUARD_MS);
      return;
    }

    gameplayFrames++;
    maxGameplayFrameMs=Math.max(maxGameplayFrameMs,rawFrameMs);
    if(rawFrameMs>12)over12Ms++;
    if(rawFrameMs>16.7)over16_7Ms++;
    if(rawFrameMs>25)over25Ms++;
    if(rawFrameMs>50)over50Ms++;
    if(rawFrameMs>100)over100Ms++;
    if(rawFrameMs>20)gameplayHitchCount++;

    base.recordFrame(rawFrameMs,now);
    updateFrameBaseline(rawFrameMs);

    if(rawFrameMs>hitchThresholdMs()){
      lastAdaptiveHitchAt=now;
      adaptiveHitches++;
      if(base.state)base.state.lastHitchAt=now;
      options.imageryService?.deferCommits?.(HITCH_IMAGERY_GUARD_MS);
    }
  }

  function updateFrame(now){
    // recenterIfNeeded() runs independently, so backing off background jobs does
    // not affect vehicle/world coordinates or physics.
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

  function resetTelemetry(){
    lastAdaptiveHitchAt=-Infinity;
    adaptiveDeferrals=0;
    adaptiveHitches=0;
    frameBaselineMs=16.7;
    gameplayFrames=0;
    gameplayHitchCount=0;
    maxGameplayFrameMs=0;
    over12Ms=0;
    over16_7Ms=0;
    over25Ms=0;
    over50Ms=0;
    over100Ms=0;
    suspendedFrames=0;
    ignoredNonDrivingFrames=0;
    visualJobStats.clear();
  }

  function reset(){
    base.reset();
    resetTelemetry();
  }

  function diagnostics(){
    const legacy=base.diagnostics();
    const visualJobs={};
    for(const [key,value] of visualJobStats){
      visualJobs[key]={
        runs:value.runs,
        lastMs:Number(value.lastMs.toFixed(3)),
        maxMs:Number(value.maxMs.toFixed(3)),
        avgMs:Number((value.totalMs/Math.max(1,value.runs)).toFixed(3))
      };
    }
    return {
      ...legacy,
      // Top-level hitch values are now gameplay-only and ignore tab suspension.
      hitchCount:gameplayHitchCount,
      maxFrameMs:maxGameplayFrameMs,
      suspendedFrames,
      ignoredNonDrivingFrames,
      frameBins:{
        gameplayFrames,
        over12Ms,
        over16_7Ms,
        over25Ms,
        over50Ms,
        over100Ms
      },
      visualJobs,
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
    scheduleVisualJob,
    recordFrame,
    updateFrame,
    prefetchRouteAhead,
    refreshCurrentImagerySooner,
    reset,
    resetTelemetry,
    diagnostics
  });
}
