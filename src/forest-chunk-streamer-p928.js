import {createForestChunkStreamer as createForestChunkStreamerP912} from './forest-chunk-streamer-p912.js';

// Foret P9.28 — diagnostics-only wrapper around the proven P9.12 streamer.
//
// This module deliberately does NOT change density, LOD, chunk sizing, queue
// ordering, idle scheduling, terrain sampling or GPU upload behaviour. It only
// observes the existing streamer and exposes enough telemetry to correlate a
// gameplay hitch with forest activity that happened immediately beforehand.

const P928_MATCH_BEFORE_MS=70;
const P928_MATCH_AFTER_MS=12;
const P928_CORRELATION_POLL_MS=80;
const P928_EVENT_LIMIT=96;
const P928_INSTALL_RETRY_MS=120;

function finite(value,fallback=0){
  return Number.isFinite(value)?value:fallback;
}

function round3(value){
  return Number(finite(value).toFixed(3));
}

function makeCallStats(){
  return {calls:0,totalMs:0,lastMs:0,maxMs:0};
}

function snapshotCallStats(stats){
  return {
    calls:stats.calls,
    lastMs:round3(stats.lastMs),
    maxMs:round3(stats.maxMs),
    avgMs:round3(stats.totalMs/Math.max(1,stats.calls))
  };
}

export function createForestChunkStreamer(options){
  const userOnStats=options?.onStats;
  let base=null;
  let sampleQueued=false;
  let lastBase=null;
  let lastVisible={trees:0,near:0,mid:0,far:0,edge:0,chunks:0,cached:0,queued:0};
  const events=[];

  const telemetry={
    enabled:true,
    reports:0,
    samples:0,
    activitySequence:0,
    lastActivityAt:0,
    lastReportAt:0,
    maxObservedSliceMs:0,
    lastObservedSliceMs:0,
    chunkCompletionEvents:0,
    commitEvents:0,
    replacementEvents:0,
    matrixUploadsObserved:0,
    densityUpdatesObserved:0,
    maxCommitSliceMs:0,
    lastCommitSliceMs:0,
    maxChunkCompletionSliceMs:0,
    lastChunkCompletionSliceMs:0,
    lastEvent:null,
    maxEvent:null,
    publicCalls:{
      setAssets:makeCallStats(),
      requestUpdate:makeCallStats(),
      refreshVisibleHeights:makeCallStats(),
      clearAll:makeCallStats()
    },
    correlation:{
      samples:0,
      hitchesObserved:0,
      hitchesCorrelated:0,
      hitchesUnmatched:0,
      ambiguousHitches:0,
      lastHitchAt:0,
      lastMatchedHitch:null,
      lastUnmatchedHitch:null
    }
  };

  function pushEvent(event){
    telemetry.activitySequence++;
    telemetry.lastActivityAt=event.at;
    telemetry.lastEvent=event;
    if(!telemetry.maxEvent||event.sliceMs>telemetry.maxEvent.sliceMs){
      telemetry.maxEvent=event;
    }
    events.push(event);
    while(events.length>P928_EVENT_LIMIT)events.shift();
  }

  function sampleBase(reason='report'){
    sampleQueued=false;
    if(!base?.stats)return;
    const current=base.stats()||{};
    telemetry.samples++;

    const previous=lastBase||{};
    const builtDelta=Math.max(0,finite(current.chunksBuilt)-finite(previous.chunksBuilt));
    const replacedDelta=Math.max(0,finite(current.chunksReplaced)-finite(previous.chunksReplaced));
    const uploadDelta=Math.max(0,finite(current.matrixUploads)-finite(previous.matrixUploads));
    const densityDelta=Math.max(0,finite(current.densityCountUpdates)-finite(previous.densityCountUpdates));
    const sliceMs=finite(current.lastSliceMs);

    telemetry.lastObservedSliceMs=sliceMs;
    telemetry.maxObservedSliceMs=Math.max(
      telemetry.maxObservedSliceMs,
      finite(current.maxSliceMs),
      sliceMs
    );

    if(builtDelta>0){
      telemetry.chunkCompletionEvents+=builtDelta;
      telemetry.lastChunkCompletionSliceMs=sliceMs;
      telemetry.maxChunkCompletionSliceMs=Math.max(telemetry.maxChunkCompletionSliceMs,sliceMs);
    }
    if(uploadDelta>0){
      telemetry.commitEvents+=uploadDelta;
      telemetry.matrixUploadsObserved+=uploadDelta;
      telemetry.lastCommitSliceMs=sliceMs;
      telemetry.maxCommitSliceMs=Math.max(telemetry.maxCommitSliceMs,sliceMs);
    }
    if(replacedDelta>0)telemetry.replacementEvents+=replacedDelta;
    if(densityDelta>0)telemetry.densityUpdatesObserved+=densityDelta;

    // Every onStats report marks real forest-streaming activity. In the P9.12
    // implementation it is emitted after a queue slice or a substantial stream
    // update, never from the cheap <120 m polling early-return path.
    const now=performance.now();
    pushEvent({
      at:round3(now),
      reason,
      sliceMs:round3(sliceMs),
      chunksBuiltDelta:builtDelta,
      chunksReplacedDelta:replacedDelta,
      matrixUploadsDelta:uploadDelta,
      densityUpdatesDelta:densityDelta,
      activeChunks:finite(current.activeChunks),
      cachedChunks:finite(current.cachedChunks),
      queuedChunks:finite(current.queuedChunks)
    });

    lastBase={
      chunksBuilt:finite(current.chunksBuilt),
      chunksReplaced:finite(current.chunksReplaced),
      matrixUploads:finite(current.matrixUploads),
      densityCountUpdates:finite(current.densityCountUpdates),
      activeChunks:finite(current.activeChunks),
      cachedChunks:finite(current.cachedChunks),
      queuedChunks:finite(current.queuedChunks)
    };
  }

  function queueSample(reason){
    if(sampleQueued)return;
    sampleQueued=true;
    const run=()=>sampleBase(reason);
    if(typeof globalThis.queueMicrotask==='function')globalThis.queueMicrotask(run);
    else Promise.resolve().then(run);
  }

  function wrappedOnStats(stats){
    telemetry.reports++;
    telemetry.lastReportAt=performance.now();
    lastVisible={
      trees:finite(stats?.trees),
      near:finite(stats?.near),
      mid:finite(stats?.mid),
      far:finite(stats?.far),
      edge:finite(stats?.edge),
      chunks:finite(stats?.chunks),
      cached:finite(stats?.cached),
      queued:finite(stats?.queued)
    };
    userOnStats?.(stats);
    queueSample('stream-report');
  }

  base=createForestChunkStreamerP912({
    ...options,
    onStats:wrappedOnStats
  });
  lastBase=base.stats?.()||null;

  function timeCall(name,fn,args,{resetAfter=false}={}){
    const started=performance.now();
    try{
      return fn(...args);
    }finally{
      const ms=performance.now()-started;
      const stats=telemetry.publicCalls[name];
      stats.calls++;
      stats.totalMs+=ms;
      stats.lastMs=ms;
      stats.maxMs=Math.max(stats.maxMs,ms);
      if(ms>=.15){
        pushEvent({
          at:round3(performance.now()),
          reason:`api:${name}`,
          sliceMs:round3(ms),
          chunksBuiltDelta:0,
          chunksReplacedDelta:0,
          matrixUploadsDelta:0,
          densityUpdatesDelta:0,
          activeChunks:finite(base.stats?.()?.activeChunks),
          cachedChunks:finite(base.stats?.()?.cachedChunks),
          queuedChunks:finite(base.stats?.()?.queuedChunks)
        });
      }
      if(resetAfter)resetRouteTelemetry({preserveClearCall:true});
      else queueSample(`api:${name}`);
    }
  }

  function resetRouteTelemetry({preserveClearCall=false}={}){
    const clearCall=preserveClearCall?{...telemetry.publicCalls.clearAll}:null;
    telemetry.reports=0;
    telemetry.samples=0;
    telemetry.activitySequence=0;
    telemetry.lastActivityAt=0;
    telemetry.lastReportAt=0;
    telemetry.maxObservedSliceMs=0;
    telemetry.lastObservedSliceMs=0;
    telemetry.chunkCompletionEvents=0;
    telemetry.commitEvents=0;
    telemetry.replacementEvents=0;
    telemetry.matrixUploadsObserved=0;
    telemetry.densityUpdatesObserved=0;
    telemetry.maxCommitSliceMs=0;
    telemetry.lastCommitSliceMs=0;
    telemetry.maxChunkCompletionSliceMs=0;
    telemetry.lastChunkCompletionSliceMs=0;
    telemetry.lastEvent=null;
    telemetry.maxEvent=null;
    for(const key of Object.keys(telemetry.publicCalls))telemetry.publicCalls[key]=makeCallStats();
    if(clearCall)telemetry.publicCalls.clearAll=clearCall;
    telemetry.correlation.samples=0;
    telemetry.correlation.hitchesObserved=0;
    telemetry.correlation.hitchesCorrelated=0;
    telemetry.correlation.hitchesUnmatched=0;
    telemetry.correlation.ambiguousHitches=0;
    telemetry.correlation.lastHitchAt=0;
    telemetry.correlation.lastMatchedHitch=null;
    telemetry.correlation.lastUnmatchedHitch=null;
    events.length=0;
    lastBase=base.stats?.()||null;
  }

  function findForestEventForHitch(hitchAt){
    if(!Number.isFinite(hitchAt)||hitchAt<=0)return null;
    let best=null;
    let bestDistance=Infinity;
    for(let i=events.length-1;i>=0;i--){
      const event=events[i];
      const delta=hitchAt-event.at;
      if(delta>P928_MATCH_BEFORE_MS)break;
      if(delta<-P928_MATCH_AFTER_MS)continue;
      const distance=Math.abs(delta);
      if(distance<bestDistance){best=event;bestDistance=distance;}
    }
    return best?{event,bestDistance}:null;
  }

  function observeFrameDiagnostics(diagnostics){
    const correlation=telemetry.correlation;
    const hitchCount=finite(diagnostics?.hitchCount);
    const hitchAt=finite(diagnostics?.lastHitchAt);
    const previous=finite(observeFrameDiagnostics.lastHitchCount);
    correlation.samples++;

    if(!observeFrameDiagnostics.initialized||hitchCount<previous){
      observeFrameDiagnostics.initialized=true;
      observeFrameDiagnostics.lastHitchCount=hitchCount;
      return;
    }

    const delta=hitchCount-previous;
    observeFrameDiagnostics.lastHitchCount=hitchCount;
    if(delta<=0)return;

    correlation.hitchesObserved+=delta;
    correlation.lastHitchAt=hitchAt;
    if(delta>1)correlation.ambiguousHitches+=delta-1;

    const match=findForestEventForHitch(hitchAt);
    if(match){
      correlation.hitchesCorrelated++;
      correlation.hitchesUnmatched+=Math.max(0,delta-1);
      correlation.lastMatchedHitch={
        hitchAt:round3(hitchAt),
        forestEventAt:match.event.at,
        deltaMs:round3(hitchAt-match.event.at),
        event:{...match.event}
      };
    }else{
      correlation.hitchesUnmatched+=delta;
      correlation.lastUnmatchedHitch={
        hitchAt:round3(hitchAt),
        nearestForestActivityAgeMs:telemetry.lastActivityAt
          ?round3(hitchAt-telemetry.lastActivityAt)
          :null
      };
    }
  }
  observeFrameDiagnostics.initialized=false;
  observeFrameDiagnostics.lastHitchCount=0;

  function snapshot(){
    const raw=base.stats?.()||{};
    return {
      enabled:true,
      note:'P9.28 correlation is temporal evidence, not proof of causation',
      trees:lastVisible.trees,
      near:lastVisible.near,
      mid:lastVisible.mid,
      far:lastVisible.far,
      edge:lastVisible.edge,
      activeChunks:finite(raw.activeChunks),
      cachedChunks:finite(raw.cachedChunks),
      queuedChunks:finite(raw.queuedChunks),
      chunksBuilt:finite(raw.chunksBuilt),
      chunksReplaced:finite(raw.chunksReplaced),
      matrixUploads:finite(raw.matrixUploads),
      densityCountUpdates:finite(raw.densityCountUpdates),
      slice:{
        lastMs:round3(raw.lastSliceMs),
        maxMs:round3(raw.maxSliceMs),
        observedLastMs:round3(telemetry.lastObservedSliceMs),
        observedMaxMs:round3(telemetry.maxObservedSliceMs),
        completedChunkEvents:telemetry.chunkCompletionEvents,
        lastChunkCompletionMs:round3(telemetry.lastChunkCompletionSliceMs),
        maxChunkCompletionMs:round3(telemetry.maxChunkCompletionSliceMs)
      },
      commit:{
        events:telemetry.commitEvents,
        matrixUploadsObserved:telemetry.matrixUploadsObserved,
        lastSliceMs:round3(telemetry.lastCommitSliceMs),
        maxSliceMs:round3(telemetry.maxCommitSliceMs),
        replacements:telemetry.replacementEvents,
        densityUpdatesObserved:telemetry.densityUpdatesObserved
      },
      stream:{
        reports:telemetry.reports,
        samples:telemetry.samples,
        activitySequence:telemetry.activitySequence,
        lastActivityAt:round3(telemetry.lastActivityAt),
        lastEvent:telemetry.lastEvent?{...telemetry.lastEvent}:null,
        maxEvent:telemetry.maxEvent?{...telemetry.maxEvent}:null
      },
      api:{
        setAssets:snapshotCallStats(telemetry.publicCalls.setAssets),
        requestUpdate:snapshotCallStats(telemetry.publicCalls.requestUpdate),
        refreshVisibleHeights:snapshotCallStats(telemetry.publicCalls.refreshVisibleHeights),
        clearAll:snapshotCallStats(telemetry.publicCalls.clearAll)
      },
      hitchCorrelation:{
        samples:telemetry.correlation.samples,
        hitchesObserved:telemetry.correlation.hitchesObserved,
        hitchesCorrelated:telemetry.correlation.hitchesCorrelated,
        hitchesUnmatched:telemetry.correlation.hitchesUnmatched,
        ambiguousHitches:telemetry.correlation.ambiguousHitches,
        matchBeforeMs:P928_MATCH_BEFORE_MS,
        matchAfterMs:P928_MATCH_AFTER_MS,
        lastHitchAt:round3(telemetry.correlation.lastHitchAt),
        lastMatchedHitch:telemetry.correlation.lastMatchedHitch
          ?{...telemetry.correlation.lastMatchedHitch}
          :null,
        lastUnmatchedHitch:telemetry.correlation.lastUnmatchedHitch
          ?{...telemetry.correlation.lastUnmatchedHitch}
          :null
      }
    };
  }

  function installFramePacingBridge(){
    if(typeof globalThis.setTimeout!=='function')return;
    const attempt=()=>{
      const current=globalThis.WorldDriveFramePacing;
      if(typeof current!=='function'){
        globalThis.setTimeout(attempt,P928_INSTALL_RETRY_MS);
        return;
      }
      if(current.__worldDriveP928Forest){
        globalThis.__WORLD_DRIVE_P928_FOREST__=snapshot;
        return;
      }

      const original=current;
      const wrapped=()=>{
        const diagnostics=original()||{};
        return {...diagnostics,forest:snapshot()};
      };
      wrapped.__worldDriveP928Forest=true;
      wrapped.__worldDriveP928Original=original;
      globalThis.WorldDriveFramePacing=wrapped;
      globalThis.__WORLD_DRIVE_P928_FOREST__=snapshot;

      let lastSeenHitchCount=null;
      globalThis.setInterval(()=>{
        try{
          const diagnostics=original()||{};
          const hitchCount=finite(diagnostics.hitchCount);
          if(lastSeenHitchCount!==null&&hitchCount<lastSeenHitchCount){
            observeFrameDiagnostics.initialized=false;
          }
          lastSeenHitchCount=hitchCount;
          observeFrameDiagnostics(diagnostics);
        }catch{}
      },P928_CORRELATION_POLL_MS);
    };
    globalThis.setTimeout(attempt,0);
  }

  const api=Object.freeze({
    setAssets:(...args)=>timeCall('setAssets',base.setAssets,args),
    requestUpdate:(...args)=>timeCall('requestUpdate',base.requestUpdate,args),
    refreshVisibleHeights:(...args)=>timeCall('refreshVisibleHeights',base.refreshVisibleHeights,args),
    clearAll:(...args)=>timeCall('clearAll',base.clearAll,args,{resetAfter:true}),
    whenInitialReady:(...args)=>base.whenInitialReady(...args),
    stats:()=>({
      ...(base.stats?.()||{}),
      p928:snapshot()
    })
  });

  globalThis.__WORLD_DRIVE_P928_FOREST__=snapshot;
  installFramePacingBridge();
  return api;
}
