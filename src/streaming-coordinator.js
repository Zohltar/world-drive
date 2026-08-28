// World Drive P9.25 streaming coordinator entry point.
// Periodic refreshes use the incremental local-world builder when available;
// forced boot/route/reset refreshes keep the proven P9.13 synchronous path.
// P9.25 keeps scenery-only data arrivals out of the terrain pipeline entirely.
import {createStreamingCoordinator as createStreamingCoordinatorP913} from './streaming-coordinator-p913.js';

export function createStreamingCoordinator(options){
  let lastLocalWorldPhases=null;
  const localWorldPhaseMax={};
  const originalRebuildLocalWorld=options.rebuildLocalWorld;
  const p923Builder=()=>globalThis.__WORLD_DRIVE_P923_LOCAL_WORLD__||null;
  const hasPreparedPath=()=>{
    if(typeof options.prepareLocalWorld==='function'&&typeof options.commitPreparedLocalWorld==='function')return true;
    const builder=p923Builder();
    return typeof builder?.prepareIncremental==='function'&&typeof builder?.commitPrepared==='function';
  };
  const prepareLocalWorld=()=>
    typeof options.prepareLocalWorld==='function'
      ?options.prepareLocalWorld()
      :p923Builder()?.prepareIncremental?.();
  const commitPreparedLocalWorld=prepared=>
    typeof options.commitPreparedLocalWorld==='function'
      ?options.commitPreparedLocalWorld(prepared)
      :p923Builder()?.commitPrepared?.(prepared);
  const cancelLocalWorldPreparation=()=>{
    if(typeof options.cancelLocalWorldPreparation==='function')return options.cancelLocalWorldPreparation();
    return p923Builder()?.cancelPreparation?.();
  };

  function captureLocalWorldPhases(result){
    if(!result||typeof result!=='object'||!result.phases)return;
    const phases={};
    for(const [key,value] of Object.entries(result.phases)){
      if(!Number.isFinite(value))continue;
      phases[key]=value;
      localWorldPhaseMax[key]=Math.max(localWorldPhaseMax[key]||0,value);
    }
    const totalMs=Number.isFinite(result.totalMs)?result.totalMs:0;
    localWorldPhaseMax.totalMs=Math.max(localWorldPhaseMax.totalMs||0,totalMs);
    lastLocalWorldPhases={
      totalMs,
      profilePoints:Number(result.profilePoints)||0,
      terrainProfilePoints:Number(result.terrainProfilePoints)||0,
      phases,
      terrain:result.terrain||null,
      p923:result.p923||null
    };
  }

  const base=createStreamingCoordinatorP913({
    ...options,
    rebuildLocalWorld:(...args)=>{
      const result=originalRebuildLocalWorld?.(...args);
      captureLocalWorldPhases(result);
      return result;
    }
  });

  base.policy.quietWindowMs=Math.max(base.policy.quietWindowMs||0,420);
  base.policy.imageryRefreshCooldownMs=Math.max(base.policy.imageryRefreshCooldownMs||0,2200);
  base.policy.imageryCommitGuardMs=Math.max(base.policy.imageryCommitGuardMs||0,850);

  const BACKGROUND_COOLDOWN_MS=460;
  const HITCH_IMAGERY_GUARD_MS=650;
  const SUSPENDED_FRAME_MS=250;
  const PREPARED_START_QUIET_MS=160;
  const HITCH_ATTRIBUTION_WINDOW_MS=90;
  const HITCH_ATTRIBUTION_HISTORY=12;
  let lastAdaptiveHitchAt=-Infinity;
  let adaptiveDeferrals=0;
  let adaptiveHitches=0;
  let frameBaselineMs=16.7;
  let gameplayFrames=0;
  let gameplayHitchCount=0;
  let maxGameplayFrameMs=0;
  let over12Ms=0,over16_7Ms=0,over25Ms=0,over50Ms=0,over100Ms=0;
  let suspendedFrames=0,ignoredNonDrivingFrames=0;
  const visualJobStats=new Map();
  let lastVisualJobEvent=null;
  let lastPreparedCommitEvent=null;
  const hitchAttributionCounts=new Map();
  const hitchAttributionHistory=[];

  let preparedSerial=0;
  let worldPreparePending=false;
  let preparedStarts=0,preparedCommits=0,preparedDiscards=0,preparedFailures=0;
  let sceneryOnlyRefreshes=0;
  let lastPrepareWallMs=0,maxPrepareWallMs=0;
  let lastPreparedCommitMs=0,maxPreparedCommitMs=0;
  let lastPreparedReasons=[];

  function hitchThresholdMs(){return Math.max(11.5,Math.min(30,frameBaselineMs*1.65));}
  function updateFrameBaseline(rawFrameMs){
    if(!Number.isFinite(rawFrameMs)||rawFrameMs<2||rawFrameMs>80)return;
    const alpha=rawFrameMs<frameBaselineMs?.08:.004;
    const capped=Math.min(rawFrameMs,frameBaselineMs*1.12);
    frameBaselineMs+=(capped-frameBaselineMs)*alpha;
  }
  function backgroundAllowed(now=performance.now()){return now-lastAdaptiveHitchAt>=BACKGROUND_COOLDOWN_MS;}
  function runtimeState(){try{return options.getRuntimeState?.()||{};}catch{return {};}}
  function recordVisualJob(key,ms,endedAt=performance.now()){
    if(!Number.isFinite(ms))return;
    const previous=visualJobStats.get(key)||{runs:0,totalMs:0,maxMs:0,lastMs:0};
    previous.runs++;previous.totalMs+=ms;previous.lastMs=ms;previous.maxMs=Math.max(previous.maxMs,ms);
    visualJobStats.set(key,previous);
    lastVisualJobEvent={key:String(key),ms,at:endedAt};
  }
  function scheduleVisualJob(key,job,timeout=180){
    return base.scheduleVisualJob(key,()=>{
      const started=performance.now();
      try{
        const result=job();
        const ended=performance.now();
        recordVisualJob(key,ended-started,ended);
        return result;
      }catch(error){
        const ended=performance.now();
        recordVisualJob(key,ended-started,ended);
        throw error;
      }
    },timeout);
  }

  function recentEvent(event,now){
    if(!event||!Number.isFinite(event.at))return null;
    const age=now-event.at;
    if(age<0||age>HITCH_ATTRIBUTION_WINDOW_MS)return null;
    return {...event,ageMs:age};
  }
  function recordHitchAttribution({hitchCount,frameMs,now,forestMatched=false}){
    const world=recentEvent(lastPreparedCommitEvent,now);
    const visual=recentEvent(lastVisualJobEvent,now);
    let source='unknown',candidate=null;
    if(world&&world.ms>=4){
      source='prepared-world';candidate=world;
    }else if(visual&&visual.ms>=1.5){
      source=`visual:${visual.key}`;candidate=visual;
    }else if(forestMatched){
      source='forest';
    }
    hitchAttributionCounts.set(source,(hitchAttributionCounts.get(source)||0)+1);
    const event={
      hitchCount:Number(hitchCount)||0,
      frameMs:Number(Number(frameMs).toFixed(3)),
      at:Number(Number(now).toFixed(3)),
      source,
      candidateMs:candidate?Number(Number(candidate.ms).toFixed(3)):null,
      candidateAgeMs:candidate?Number(Number(candidate.ageMs).toFixed(3)):null,
      candidateKey:candidate?.key||null,
      reasons:Array.isArray(candidate?.reasons)?[...candidate.reasons]:null,
      forestMatched:!!forestMatched
    };
    hitchAttributionHistory.push(event);
    while(hitchAttributionHistory.length>HITCH_ATTRIBUTION_HISTORY)hitchAttributionHistory.shift();
    return event;
  }

  function markWorldRefresh(reason='stream'){
    // P9.25: OSM scenery completion changes buildings/rocks/masks only. The
    // renderer already owns a cheap scenery rebuild (~single-digit ms in real
    // telemetry), so never spend a 201k-vertex terrain preparation on it.
    if(reason==='scenery'){
      const builder=p923Builder();
      if(typeof builder?.refreshSceneryOnly==='function'){
        sceneryOnlyRefreshes++;
        builder.refreshSceneryOnly();
        return true;
      }
    }
    return base.markWorldRefresh(reason);
  }

  function recordFrame(rawFrameMs,now){
    const current=runtimeState();
    if(!current.gameStarted||current.menuOpen){ignoredNonDrivingFrames++;return;}
    if(!Number.isFinite(rawFrameMs)||rawFrameMs<=0)return;
    if(rawFrameMs>SUSPENDED_FRAME_MS){
      suspendedFrames++;lastAdaptiveHitchAt=now;if(base.state)base.state.lastHitchAt=now;
      options.imageryService?.deferCommits?.(HITCH_IMAGERY_GUARD_MS);return;
    }
    gameplayFrames++;maxGameplayFrameMs=Math.max(maxGameplayFrameMs,rawFrameMs);
    if(rawFrameMs>12)over12Ms++;
    if(rawFrameMs>16.7)over16_7Ms++;
    if(rawFrameMs>25)over25Ms++;
    if(rawFrameMs>50)over50Ms++;
    if(rawFrameMs>100)over100Ms++;
    if(rawFrameMs>20){
      gameplayHitchCount++;
      let forestMatched=false;
      try{
        forestMatched=globalThis.__WORLD_DRIVE_P928_RECORD_HITCH__?.({
          hitchCount:gameplayHitchCount,
          hitchAt:now,
          frameMs:rawFrameMs
        })===true;
      }catch{}
      recordHitchAttribution({
        hitchCount:gameplayHitchCount,
        frameMs:rawFrameMs,
        now,
        forestMatched
      });
    }
    base.recordFrame(rawFrameMs,now);updateFrameBaseline(rawFrameMs);
    if(rawFrameMs>hitchThresholdMs()){
      lastAdaptiveHitchAt=now;adaptiveHitches++;if(base.state)base.state.lastHitchAt=now;
      options.imageryService?.deferCommits?.(HITCH_IMAGERY_GUARD_MS);
    }
  }
  function restoreReasons(reasons){
    for(const reason of reasons||[])base.state.reasons.add(reason);
    if(base.state.reasons.size)base.state.pendingWorld=true;
  }
  function schedulePostPreparedImagery(current){
    base.cancelVisualJob('post-world-imagery');
    return base.scheduleVisualJob('post-world-imagery',()=>{
      if(!options.imageryService?.enabled)return;
      return Promise.resolve(options.buildImageryMosaic?.(current.absX,current.absZ)).catch(()=>{});
    },base.policy.postWorldImageryDelayMs);
  }
  function finalizePreparedCommit(prepared,reasons){
    const current=runtimeState();
    const started=performance.now();
    const result=commitPreparedLocalWorld(prepared);
    if(!result)return false;
    captureLocalWorldPhases(result);
    options.imageryService?.realignToOrigin?.();
    const recenterOnly=reasons.length===1&&reasons[0]==='recenter';
    if(!recenterOnly){options.imageryService?.invalidateGeometry?.();options.applyImageryToGround?.();}
    schedulePostPreparedImagery(current);
    const ended=performance.now();
    const ms=ended-started;
    lastPreparedCommitMs=ms;maxPreparedCommitMs=Math.max(maxPreparedCommitMs,ms);
    lastPreparedCommitEvent={at:ended,ms,reasons:[...reasons]};
    base.state.lastBuiltCenter={...(current.worldOffset||{x:0,z:0})};
    base.state.lastWorldBuildAt=performance.now();
    base.state.lastWorldBuildMs=ms;base.state.maxWorldBuildMs=Math.max(base.state.maxWorldBuildMs,ms);
    base.state.worldBuildCount++;base.state.pendingWorld=false;base.state.reasons.clear();
    preparedCommits++;lastPreparedReasons=[...reasons];
    if(base.policy.perfConsoleLogging||ms>14){
      console.info(`World refresh ${ms.toFixed(1)} ms · prepared · reasons ${reasons.join(',')||'none'}`);
    }
    options.markStaticShadowsDirty?.();
    return true;
  }
  function restartPreparedRefresh(reasons){
    preparedDiscards++;worldPreparePending=false;restoreReasons(reasons);
    const current=runtimeState(),center=base.state.lastBuiltCenter;
    const distance=Math.hypot((current.absX||0)-center.x,(current.absZ||0)-center.z);
    scheduleWorldRefresh({urgent:distance>=base.policy.urgentWorldRefreshDistance});
  }
  function beginPreparedRefresh(capturedReasons,serial){
    const wallStarted=performance.now();preparedStarts++;
    options.imageryService?.deferCommits?.(base.policy.imageryCommitGuardMs);
    Promise.resolve().then(()=>prepareLocalWorld()).then(prepared=>{
      if(serial!==preparedSerial)return;
      lastPrepareWallMs=performance.now()-wallStarted;maxPrepareWallMs=Math.max(maxPrepareWallMs,lastPrepareWallMs);
      const newlyArrived=[...base.state.reasons];
      const reasons=[...new Set([...capturedReasons,...newlyArrived])];
      const current=runtimeState();
      const preparedOffset=prepared?.offset||prepared?.meta?.preparedOffset;
      const staleOffset=!preparedOffset||Math.hypot(
        (current.worldOffset?.x||0)-preparedOffset.x,
        (current.worldOffset?.z||0)-preparedOffset.z
      )>.5;
      const dataChangedDuringPreparation=newlyArrived.some(reason=>reason==='dem'||reason==='hydro');
      if(!prepared||staleOffset||dataChangedDuringPreparation){restartPreparedRefresh(reasons);return;}
      worldPreparePending=false;base.state.reasons.clear();base.state.pendingWorld=false;
      if(!finalizePreparedCommit(prepared,reasons)){restoreReasons(reasons);preparedFailures++;}
    }).catch(error=>{
      if(serial!==preparedSerial)return;
      console.warn('P9.25 prepared world refresh failed',error);
      worldPreparePending=false;preparedFailures++;restoreReasons(capturedReasons);
    });
  }
  function scheduleWorldRefresh({urgent=false}={}){
    if(!hasPreparedPath())return base.scheduleWorldRefresh({urgent});
    if(worldPreparePending||base.hasVisualJob('world-rebuild'))return false;
    const current=runtimeState(),center=base.state.lastBuiltCenter;
    const buildDistance=Math.hypot((current.absX||0)-center.x,(current.absZ||0)-center.z);
    const now=performance.now();
    const quiet=now-base.state.lastHitchAt>=PREPARED_START_QUIET_MS;
    const emergency=buildDistance>=base.policy.emergencyWorldRefreshDistance;
    if(!emergency&&!quiet)return false;

    const capturedReasons=[...base.state.reasons];
    base.state.reasons.clear();base.state.pendingWorld=false;worldPreparePending=true;
    const serial=++preparedSerial;
    const timeout=emergency?35:(urgent?90:180);
    const scheduled=base.scheduleVisualJob('world-rebuild',()=>beginPreparedRefresh(capturedReasons,serial),timeout);
    if(!scheduled){worldPreparePending=false;restoreReasons(capturedReasons);return false;}
    return true;
  }
  function recenterIfNeeded(absx,absz,force=false){
    if(force||!hasPreparedPath()){
      preparedSerial++;worldPreparePending=false;cancelLocalWorldPreparation();
      return base.recenterIfNeeded(absx,absz,force);
    }
    const hard=base.policy.hardWorldRefreshDistance;
    base.policy.hardWorldRefreshDistance=Number.MAX_SAFE_INTEGER;
    let moved=false;
    try{moved=base.recenterIfNeeded(absx,absz,false);}finally{base.policy.hardWorldRefreshDistance=hard;}
    if(!moved)return false;
    const buildDistance=Math.hypot(absx-base.state.lastBuiltCenter.x,absz-base.state.lastBuiltCenter.z);
    if(buildDistance>=hard){
      base.markWorldRefresh('recenter');
      scheduleWorldRefresh({urgent:buildDistance>=base.policy.urgentWorldRefreshDistance});
    }
    return true;
  }
  function updateFrame(now){
    if(!backgroundAllowed(now)){adaptiveDeferrals++;return false;}
    const current=runtimeState();
    if(base.state.pendingWorld&&!worldPreparePending&&!base.hasVisualJob('world-rebuild')){
      const center=base.state.lastBuiltCenter;
      const buildDistance=Math.hypot(
        (current.absX||0)-center.x,
        (current.absZ||0)-center.z
      );
      scheduleWorldRefresh({urgent:buildDistance>=base.policy.urgentWorldRefreshDistance});
    }

    const pendingBefore=base.state.pendingWorld;
    const imageryDistance=base.policy.imageryPriorityRefreshDistance;
    if(hasPreparedPath()){
      base.state.pendingWorld=false;
      if(pendingBefore||worldPreparePending)base.policy.imageryPriorityRefreshDistance=Number.MAX_SAFE_INTEGER;
    }
    let result;
    try{result=base.updateFrame(now);}finally{
      if(hasPreparedPath()){
        const markedDuring=base.state.pendingWorld;
        base.state.pendingWorld=pendingBefore||markedDuring;
        base.policy.imageryPriorityRefreshDistance=imageryDistance;
      }
    }
    return result;
  }
  function prefetchRouteAhead(){
    if(!backgroundAllowed()){adaptiveDeferrals++;return false;}
    return base.prefetchRouteAhead();
  }
  function refreshCurrentImagerySooner(now=performance.now()){
    if(!backgroundAllowed(now)||worldPreparePending){adaptiveDeferrals++;return false;}
    return base.refreshCurrentImagerySooner(now);
  }
  function resetTelemetry(){
    lastAdaptiveHitchAt=-Infinity;adaptiveDeferrals=0;adaptiveHitches=0;frameBaselineMs=16.7;
    gameplayFrames=0;gameplayHitchCount=0;maxGameplayFrameMs=0;
    over12Ms=0;over16_7Ms=0;over25Ms=0;over50Ms=0;over100Ms=0;
    suspendedFrames=0;ignoredNonDrivingFrames=0;visualJobStats.clear();
    lastVisualJobEvent=null;lastPreparedCommitEvent=null;hitchAttributionCounts.clear();hitchAttributionHistory.length=0;
    lastLocalWorldPhases=null;for(const key of Object.keys(localWorldPhaseMax))delete localWorldPhaseMax[key];
    preparedStarts=0;preparedCommits=0;preparedDiscards=0;preparedFailures=0;sceneryOnlyRefreshes=0;
    lastPrepareWallMs=0;maxPrepareWallMs=0;lastPreparedCommitMs=0;maxPreparedCommitMs=0;lastPreparedReasons=[];
  }
  function reset(){
    preparedSerial++;worldPreparePending=false;cancelLocalWorldPreparation();base.reset();resetTelemetry();
  }
  function roundedLocalWorldReport(report){
    if(!report)return null;
    const phases={};for(const [key,value] of Object.entries(report.phases||{}))phases[key]=Number(value.toFixed(3));
    return {
      totalMs:Number((report.totalMs||0).toFixed(3)),
      profilePoints:report.profilePoints||0,
      terrainProfilePoints:report.terrainProfilePoints||0,
      phases,terrain:report.terrain||null,p923:report.p923||null
    };
  }
  function diagnostics(){
    const legacy=base.diagnostics();
    const visualJobs={};
    for(const [key,value] of visualJobStats){
      visualJobs[key]={runs:value.runs,lastMs:Number(value.lastMs.toFixed(3)),maxMs:Number(value.maxMs.toFixed(3)),avgMs:Number((value.totalMs/Math.max(1,value.runs)).toFixed(3))};
    }
    const phaseMax={};for(const [key,value] of Object.entries(localWorldPhaseMax))phaseMax[key]=Number(value.toFixed(3));
    const attributionCounts={};
    for(const [key,value] of hitchAttributionCounts)attributionCounts[key]=value;
    return {
      ...legacy,
      hitchCount:gameplayHitchCount,maxFrameMs:maxGameplayFrameMs,suspendedFrames,ignoredNonDrivingFrames,
      frameBins:{gameplayFrames,over12Ms,over16_7Ms,over25Ms,over50Ms,over100Ms},
      visualJobs,localWorldPhases:roundedLocalWorldReport(lastLocalWorldPhases),localWorldPhaseMax:phaseMax,
      elevation:options.elevationService?.diagnostics?.()||null,
      p917:{
        frameBaselineMs,hitchThresholdMs:hitchThresholdMs(),backgroundCooldownMs:BACKGROUND_COOLDOWN_MS,
        lastAdaptiveHitchAt,adaptiveHitches,adaptiveDeferrals,backgroundAllowed:backgroundAllowed()
      },
      p923:{
        enabled:hasPreparedPath(),worldPreparePending,preparedStarts,preparedCommits,preparedDiscards,preparedFailures,
        sceneryOnlyRefreshes,
        lastPrepareWallMs:Number(lastPrepareWallMs.toFixed(3)),maxPrepareWallMs:Number(maxPrepareWallMs.toFixed(3)),
        lastPreparedCommitMs:Number(lastPreparedCommitMs.toFixed(3)),maxPreparedCommitMs:Number(maxPreparedCommitMs.toFixed(3)),
        lastPreparedReasons,builder:p923Builder()?.p923Diagnostics?.()||options.localWorldP923Diagnostics?.()||null,
        p924PreparedStartQuietMs:PREPARED_START_QUIET_MS,
        p925SceneryBypass:true
      },
      p939HitchAttribution:{
        enabled:true,
        windowMs:HITCH_ATTRIBUTION_WINDOW_MS,
        historyLimit:HITCH_ATTRIBUTION_HISTORY,
        counts:attributionCounts,
        last:hitchAttributionHistory.length?hitchAttributionHistory[hitchAttributionHistory.length-1]:null,
        recent:hitchAttributionHistory.map(event=>({...event}))
      }
    };
  }

  return Object.freeze({
    ...base,
    markWorldRefresh,
    scheduleVisualJob,recordFrame,updateFrame,prefetchRouteAhead,refreshCurrentImagerySooner,
    scheduleWorldRefresh,recenterIfNeeded,reset,resetTelemetry,diagnostics
  });
}