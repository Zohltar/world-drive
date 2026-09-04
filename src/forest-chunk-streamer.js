import {createForestChunkStreamer as createForestChunkStreamerCore} from './forest-chunk-streamer-core.js';
import {frameRuntimeSnapshot} from './frame-runtime-profiler.js';
import {ensureWorldDriveDiagnostics,installDiagnosticAlias} from './diagnostics.js';

const FRAME_MATCH_SLACK_MS=2;
const MATCH_AFTER_MS=2;
const FOREST_MIN_CONTRIBUTION_MS=1.5;
const FOREST_MIN_FRAME_SHARE=.10;
const INSTALL_RETRY_MS=120;
const STARTUP_DIRECTION_SEED_M=180;
const ROUTE_CACHE_SLOTS=2;
const DEFAULT_ROUTE_CACHE_KEY='__default__';

function finite(value,fallback=0){return Number.isFinite(value)?value:fallback;}
function round3(value){return Number(finite(value).toFixed(3));}

export function createForestChunkStreamer(options){
  const userOnStats=options?.onStats;
  const realGetWorldOffset=options?.getWorldOffset;
  const nearestRoute=options?.nearestRoute;
  const parentForestGroup=options?.forestGroup;
  let offsetOverride=null;
  let currentAssets=null;
  let activeEntry=null;
  const entries=[];
  let visible={
    trees:0,near:0,mid:0,far:0,edge:0,chunks:0,cached:0,queued:0,
    visibleWanted:0,prefetchWanted:0,prefetchedReady:0,prefetchQueued:0
  };
  const correlation={
    hitchesObserved:0,
    hitchesCorrelated:0,
    hitchesAttributedToForest:0,
    hitchesUnmatched:0,
    sliceMatches:0,
    commitMatches:0,
    runtimeMainCpu:0,
    runtimeRenderSubmit:0,
    runtimeOutsideMain:0,
    lastHitchAt:0,
    lastMatchedHitch:null,
    lastUnmatchedHitch:null,
    lastRuntimeHitch:null
  };

  const readRealOffset=()=>{
    const value=realGetWorldOffset?.()||{x:0,z:0};
    return {x:finite(value.x),z:finite(value.z)};
  };

  function routeDirectionAt(center){
    try{
      const nr=nearestRoute?.(center.x,center.z);
      if(!nr||!Number.isFinite(nr.angle))return null;
      return {
        angle:nr.angle,
        x:Math.sin(nr.angle),
        z:Math.cos(nr.angle)
      };
    }catch{
      return null;
    }
  }

  function resetSeed(entry){
    if(!entry)return;
    entry.startupDirectionSeeded=false;
    entry.startupSeedDir={x:0,z:0};
    entry.startupSeedAngle=null;
  }

  function updateVisible(entry,stats){
    entry.lastStats=stats||{};
    if(entry!==activeEntry)return;
    visible={
      trees:finite(stats?.trees),near:finite(stats?.near),mid:finite(stats?.mid),
      far:finite(stats?.far),edge:finite(stats?.edge),chunks:finite(stats?.chunks),
      cached:finite(stats?.cached),queued:finite(stats?.queued),
      visibleWanted:finite(stats?.visibleWanted),prefetchWanted:finite(stats?.prefetchWanted),
      prefetchedReady:finite(stats?.prefetchedReady),prefetchQueued:finite(stats?.prefetchQueued)
    };
    userOnStats?.(stats);
  }

  function createEntry(key){
    const group=new options.THREE.Group();
    group.name=`forest-route-cache-${String(key).replace(/[^a-z0-9_-]+/gi,'-').slice(0,48)}`;
    group.visible=false;
    parentForestGroup.add(group);
    const entry={
      key,
      group,
      core:null,
      lastUsed:performance.now(),
      lastStats:{},
      startupDirectionSeeded:false,
      startupSeedDir:{x:0,z:0},
      startupSeedAngle:null
    };
    entry.core=createForestChunkStreamerCore({
      ...options,
      forestGroup:group,
      getWorldOffset:()=>offsetOverride||readRealOffset(),
      onStats:stats=>updateVisible(entry,stats)
    });
    entries.push(entry);
    return entry;
  }

  activeEntry=createEntry(DEFAULT_ROUTE_CACHE_KEY);
  activeEntry.group.visible=true;

  const activeBase=()=>activeEntry.core;

  function seedStartupRouteDirection(entry,nextAssets){
    const center=readRealOffset();
    const dir=routeDirectionAt(center);
    if(!dir)return false;

    offsetOverride={
      x:center.x-dir.x*STARTUP_DIRECTION_SEED_M,
      z:center.z-dir.z*STARTUP_DIRECTION_SEED_M
    };
    try{
      entry.core.setAssets(nextAssets);
    }finally{
      offsetOverride=null;
    }
    entry.core.requestUpdate(true);
    entry.startupDirectionSeeded=true;
    entry.startupSeedDir={x:dir.x,z:dir.z};
    entry.startupSeedAngle=dir.angle;
    return true;
  }

  function activateAssets(entry){
    if(!currentAssets?.trees?.length){
      resetSeed(entry);
      entry.core.setAssets(currentAssets);
      return false;
    }
    if(!entry.startupDirectionSeeded&&seedStartupRouteDirection(entry,currentAssets))return true;
    entry.core.setAssets(currentAssets);
    return true;
  }

  function chooseReusableEntry(){
    const inactive=entries.filter(entry=>entry!==activeEntry);
    inactive.sort((a,b)=>a.lastUsed-b.lastUsed);
    const entry=inactive[0];
    if(!entry)return null;
    entry.core.setAssets(null);
    entry.core.clearAll();
    resetSeed(entry);
    return entry;
  }

  function switchRouteCache(routeKey){
    const key=String(routeKey||DEFAULT_ROUTE_CACHE_KEY);
    if(activeEntry.key===key){
      activeEntry.lastUsed=performance.now();
      activeEntry.group.visible=true;
      activateAssets(activeEntry);
      activeEntry.core.requestUpdate(true);
      return {restored:true,key,slots:entries.length};
    }

    const previous=activeEntry;
    previous.lastUsed=performance.now();
    previous.group.visible=false;
    previous.core.setAssets(null);

    let target=entries.find(entry=>entry.key===key)||null;
    let restored=!!target;

    // Adopt the initial slot on the first named route. This preserves any forest
    // work that may have completed before route ownership was formally assigned.
    if(!target&&entries.length===1&&previous.key===DEFAULT_ROUTE_CACHE_KEY){
      target=previous;
      target.key=key;
      target.group.name=`forest-route-cache-${key.replace(/[^a-z0-9_-]+/gi,'-').slice(0,48)}`;
      restored=true;
    }else if(!target&&entries.length<ROUTE_CACHE_SLOTS){
      target=createEntry(key);
    }else if(!target){
      target=chooseReusableEntry();
      target.key=key;
      target.group.name=`forest-route-cache-${key.replace(/[^a-z0-9_-]+/gi,'-').slice(0,48)}`;
      restored=false;
    }

    activeEntry=target;
    target.lastUsed=performance.now();
    target.group.visible=true;
    activateAssets(target);
    target.core.requestUpdate(true);
    updateVisible(target,target.lastStats);
    return {restored,key,slots:entries.length};
  }

  function nearestActivity(raw,hitchAt,frameMs){
    const candidates=[];
    if(Number.isFinite(raw.lastSliceAt)&&raw.lastSliceAt>0){
      candidates.push({kind:'slice',at:raw.lastSliceAt,ms:finite(raw.lastSliceMs)});
    }
    if(Number.isFinite(raw.lastCommitAt)&&raw.lastCommitAt>0){
      candidates.push({kind:'commit',at:raw.lastCommitAt,ms:finite(raw.lastCommitMs)});
    }
    const frameWindow=Math.max(0,Math.min(250,finite(frameMs)))+FRAME_MATCH_SLACK_MS;
    let best=null,bestAbs=Infinity;
    for(const event of candidates){
      const delta=hitchAt-event.at;
      if(delta>frameWindow||delta<-MATCH_AFTER_MS)continue;
      const abs=Math.abs(delta);
      if(abs<bestAbs){best={...event,deltaMs:delta,frameWindowMs:frameWindow};bestAbs=abs;}
    }
    return best;
  }

  function classifyRuntimeHitch(frameMs){
    const runtime=frameRuntimeSnapshot();
    const mainMs=finite(runtime?.main?.lastMs);
    const renderMs=finite(runtime?.renderSubmit?.lastMs);
    const frame=Math.max(.001,finite(frameMs));
    const outsideMainMs=Math.max(0,frame-mainMs);
    const mainShare=mainMs/frame;
    const renderShare=renderMs/frame;
    let source='outside-main';
    if(renderMs>=8||renderShare>=.35){
      source='render-submit';
      correlation.runtimeRenderSubmit++;
    }else if(mainMs>=12||mainShare>=.62){
      source='main-cpu';
      correlation.runtimeMainCpu++;
    }else{
      correlation.runtimeOutsideMain++;
    }
    return {
      source,
      frameMs:round3(frame),
      previousMainMs:round3(mainMs),
      previousMainSharePct:round3(mainShare*100),
      previousRenderSubmitMs:round3(renderMs),
      previousRenderSharePct:round3(renderShare*100),
      outsideMainMs:round3(outsideMainMs),
      mainEndedAt:round3(runtime?.main?.lastEndedAt),
      renderEndedAt:round3(runtime?.renderSubmit?.lastEndedAt)
    };
  }

  function recordHitch({hitchCount=0,hitchAt=0,frameMs=0}={}){
    if(!Number.isFinite(hitchAt)||hitchAt<=0)return false;
    const raw=activeBase().stats?.()||{};
    correlation.hitchesObserved++;
    correlation.lastHitchAt=hitchAt;
    correlation.lastRuntimeHitch={
      hitchCount:finite(hitchCount),
      hitchAt:round3(hitchAt),
      ...classifyRuntimeHitch(frameMs)
    };

    const event=nearestActivity(raw,hitchAt,frameMs);
    if(event){
      correlation.hitchesCorrelated++;
      if(event.kind==='commit')correlation.commitMatches++;
      else correlation.sliceMatches++;
      const share=finite(frameMs)>0?event.ms/frameMs:0;
      const meaningful=event.ms>=FOREST_MIN_CONTRIBUTION_MS&&share>=FOREST_MIN_FRAME_SHARE;
      if(meaningful)correlation.hitchesAttributedToForest++;
      correlation.lastMatchedHitch={
        hitchCount:finite(hitchCount),hitchAt:round3(hitchAt),frameMs:round3(frameMs),
        kind:event.kind,forestActivityAt:round3(event.at),deltaMs:round3(event.deltaMs),
        frameWindowMs:round3(event.frameWindowMs),forestWorkMs:round3(event.ms),
        forestFrameSharePct:round3(share*100),meaningful
      };
      return meaningful;
    }
    correlation.hitchesUnmatched++;
    const latest=Math.max(finite(raw.lastSliceAt),finite(raw.lastCommitAt));
    correlation.lastUnmatchedHitch={
      hitchCount:finite(hitchCount),hitchAt:round3(hitchAt),frameMs:round3(frameMs),
      nearestForestActivityAgeMs:latest?round3(hitchAt-latest):null
    };
    return false;
  }

  function snapshot(){
    const raw=activeBase().stats?.()||{};
    const seed=activeEntry;
    return {
      enabled:true,
      observerMode:'p931-ahead-priority',
      startupMode:'p934-startup-route-seed',
      streamingMode:'p940-dirty-priority-queue',
      hitchMode:'p941-frame-window-runtime',
      legacyObserverMode:'p929-direct-last-slice',
      routeCache:{key:activeEntry.key,slots:entries.length,maxSlots:ROUTE_CACHE_SLOTS},
      trees:visible.trees,near:visible.near,mid:visible.mid,far:visible.far,edge:visible.edge,
      activeChunks:finite(raw.activeChunks),cachedChunks:finite(raw.cachedChunks),queuedChunks:finite(raw.queuedChunks),
      chunksBuilt:finite(raw.chunksBuilt),chunksReplaced:finite(raw.chunksReplaced),
      matrixUploads:finite(raw.matrixUploads),densityCountUpdates:finite(raw.densityCountUpdates),
      startupDirection:{
        seeded:seed.startupDirectionSeeded,
        seedDistanceM:STARTUP_DIRECTION_SEED_M,
        angle:Number.isFinite(seed.startupSeedAngle)?round3(seed.startupSeedAngle):null,
        dirX:round3(seed.startupSeedDir.x),dirZ:round3(seed.startupSeedDir.z)
      },
      aheadPriority:{
        enabled:raw.aheadPriority===true,
        nearPriorityDistance:round3(raw.nearPriorityDistance),leadM:round3(raw.priorityLeadM),
        confidence:round3(raw.travelConfidence),dirX:round3(raw.travelDirX),dirZ:round3(raw.travelDirZ)
      },
      prefetch:{
        enabled:raw.rollingPrefetch===true,leadM:round3(raw.prefetchLeadM),radiusM:round3(raw.prefetchRadiusM),
        minForwardM:round3(raw.prefetchMinForwardM),wanted:finite(raw.prefetchWantedChunks),
        ready:finite(raw.prefetchedReadyChunks),queued:finite(raw.prefetchQueuedChunks),
        meshPrepares:finite(raw.prefetchMeshPrepares),hits:finite(raw.prefetchHits)
      },
      catchup:{
        threshold:finite(raw.catchupQueueThreshold),sliceBudgetMs:round3(raw.catchupSliceBudgetMs),
        candidateBatchSize:finite(raw.catchupCandidateBatchSize),slices:finite(raw.catchupSlices)
      },
      maintenance:{
        queueSorts:finite(raw.queueSorts),lastQueueSortMs:round3(raw.lastQueueSortMs),maxQueueSortMs:round3(raw.maxQueueSortMs),
        cacheTrimRuns:finite(raw.cacheTrimRuns),lastCacheTrimMs:round3(raw.lastCacheTrimMs),maxCacheTrimMs:round3(raw.maxCacheTrimMs)
      },
      slice:{
        lastMs:round3(raw.lastSliceMs),maxMs:round3(raw.maxSliceMs),lastAt:round3(raw.lastSliceAt),
        count:finite(raw.sliceCount),lastCandidates:finite(raw.lastCandidates),maxCandidates:finite(raw.maxCandidates),
        budgetMs:round3(raw.sliceBudgetMs),candidateBatchSize:finite(raw.candidateBatchSize)
      },
      commit:{lastMs:round3(raw.lastCommitMs),maxMs:round3(raw.maxCommitMs),lastAt:round3(raw.lastCommitAt),manualBounds:raw.manualBounds===true},
      hitchCorrelation:{
        hitchesObserved:correlation.hitchesObserved,hitchesCorrelated:correlation.hitchesCorrelated,
        hitchesAttributedToForest:correlation.hitchesAttributedToForest,hitchesUnmatched:correlation.hitchesUnmatched,
        matchesByKind:{slice:correlation.sliceMatches,commit:correlation.commitMatches},
        runtimeSources:{mainCpu:correlation.runtimeMainCpu,renderSubmit:correlation.runtimeRenderSubmit,outsideMain:correlation.runtimeOutsideMain},
        frameMatchSlackMs:FRAME_MATCH_SLACK_MS,matchAfterMs:MATCH_AFTER_MS,
        minContributionMs:FOREST_MIN_CONTRIBUTION_MS,minFrameShare:FOREST_MIN_FRAME_SHARE,
        lastHitchAt:round3(correlation.lastHitchAt),
        lastMatchedHitch:correlation.lastMatchedHitch?{...correlation.lastMatchedHitch}:null,
        lastUnmatchedHitch:correlation.lastUnmatchedHitch?{...correlation.lastUnmatchedHitch}:null,
        lastRuntimeHitch:correlation.lastRuntimeHitch?{...correlation.lastRuntimeHitch}:null
      }
    };
  }

  function installDiagnostics(){
    const diagnostics=ensureWorldDriveDiagnostics();
    diagnostics.forest.recordHitch=recordHitch;
    diagnostics.forest.snapshot=snapshot;
    installDiagnosticAlias('__WORLD_DRIVE_P928_RECORD_HITCH__',()=>diagnostics.forest.recordHitch);
    installDiagnosticAlias('__WORLD_DRIVE_P929_FOREST__',()=>diagnostics.forest.snapshot);
    installDiagnosticAlias('__WORLD_DRIVE_P931_FOREST__',()=>diagnostics.forest.snapshot);
    installDiagnosticAlias('__WORLD_DRIVE_P934_FOREST__',()=>diagnostics.forest.snapshot);
    installDiagnosticAlias('__WORLD_DRIVE_P936_FOREST__',()=>diagnostics.forest.snapshot);
    installDiagnosticAlias('__WORLD_DRIVE_P940_FOREST__',()=>diagnostics.forest.snapshot);
    installDiagnosticAlias('__WORLD_DRIVE_P941_FOREST__',()=>diagnostics.forest.snapshot);

    if(typeof globalThis.setTimeout!=='function')return;
    const attempt=()=>{
      const current=diagnostics.framePacing.snapshot;
      if(typeof current!=='function'){
        globalThis.setTimeout(attempt,INSTALL_RETRY_MS);
        return;
      }
      if(current.__worldDriveP941Forest)return;
      const original=current.__worldDriveP928Original||current;
      const wrapped=()=>({
        ...((original?.()||{})),
        forest:snapshot(),
        frameRuntime:frameRuntimeSnapshot()
      });
      wrapped.__worldDriveP929Forest=true;
      wrapped.__worldDriveP931Forest=true;
      wrapped.__worldDriveP934Forest=true;
      wrapped.__worldDriveP936Forest=true;
      wrapped.__worldDriveP940Forest=true;
      wrapped.__worldDriveP941Forest=true;
      wrapped.__worldDriveP928Original=original;
      diagnostics.framePacing.snapshot=wrapped;
    };
    globalThis.setTimeout(attempt,0);
  }

  installDiagnostics();

  return Object.freeze({
    setAssets:(nextAssets,...args)=>{
      currentAssets=nextAssets;
      if(!nextAssets?.trees?.length){
        resetSeed(activeEntry);
        return activeBase().setAssets(nextAssets,...args);
      }
      if(!activeEntry.startupDirectionSeeded&&seedStartupRouteDirection(activeEntry,nextAssets))return true;
      return activeBase().setAssets(nextAssets,...args);
    },
    switchRouteCache,
    requestUpdate:(...args)=>activeBase().requestUpdate(...args),
    refreshVisibleHeights:(...args)=>activeBase().refreshVisibleHeights(...args),
    clearAll:(...args)=>{
      for(const entry of entries){
        entry.core.setAssets(null);
        entry.core.clearAll(...args);
        entry.group.visible=false;
        resetSeed(entry);
        entry.key=null;
      }
      activeEntry=entries[0];
      activeEntry.key=DEFAULT_ROUTE_CACHE_KEY;
      activeEntry.group.name='forest-route-cache-default';
      activeEntry.group.visible=true;
      currentAssets=null;
      visible={trees:0,near:0,mid:0,far:0,edge:0,chunks:0,cached:0,queued:0,visibleWanted:0,prefetchWanted:0,prefetchedReady:0,prefetchQueued:0};
      return true;
    },
    whenInitialReady:(...args)=>activeBase().whenInitialReady(...args),
    stats:()=>({...activeBase().stats(),routeCacheKey:activeEntry.key,routeCacheSlots:entries.length,p934:snapshot(),p936:snapshot(),p940:snapshot(),p941:snapshot()})
  });
}