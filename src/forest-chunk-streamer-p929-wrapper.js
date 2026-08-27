import {createForestChunkStreamer as createForestChunkStreamerP929} from './forest-chunk-streamer-p929.js';

const MATCH_BEFORE_MS=70;
const MATCH_AFTER_MS=12;
const INSTALL_RETRY_MS=120;

function finite(value,fallback=0){return Number.isFinite(value)?value:fallback;}
function round3(value){return Number(finite(value).toFixed(3));}

export function createForestChunkStreamer(options){
  const userOnStats=options?.onStats;
  let visible={trees:0,near:0,mid:0,far:0,edge:0,chunks:0,cached:0,queued:0};
  let base=null;
  const correlation={
    hitchesObserved:0,
    hitchesCorrelated:0,
    hitchesUnmatched:0,
    lastHitchAt:0,
    lastMatchedHitch:null,
    lastUnmatchedHitch:null
  };

  base=createForestChunkStreamerP929({
    ...options,
    onStats:stats=>{
      visible={
        trees:finite(stats?.trees),near:finite(stats?.near),mid:finite(stats?.mid),
        far:finite(stats?.far),edge:finite(stats?.edge),chunks:finite(stats?.chunks),
        cached:finite(stats?.cached),queued:finite(stats?.queued)
      };
      userOnStats?.(stats);
    }
  });

  function nearestActivity(raw,hitchAt){
    const candidates=[];
    if(Number.isFinite(raw.lastSliceAt)&&raw.lastSliceAt>0){
      candidates.push({kind:'slice',at:raw.lastSliceAt,ms:finite(raw.lastSliceMs)});
    }
    if(Number.isFinite(raw.lastCommitAt)&&raw.lastCommitAt>0){
      candidates.push({kind:'commit',at:raw.lastCommitAt,ms:finite(raw.lastCommitMs)});
    }
    let best=null,bestAbs=Infinity;
    for(const event of candidates){
      const delta=hitchAt-event.at;
      if(delta>MATCH_BEFORE_MS||delta<-MATCH_AFTER_MS)continue;
      const abs=Math.abs(delta);
      if(abs<bestAbs){best={...event,deltaMs:delta};bestAbs=abs;}
    }
    return best;
  }

  function recordHitch({hitchCount=0,hitchAt=0,frameMs=0}={}){
    if(!Number.isFinite(hitchAt)||hitchAt<=0)return false;
    const raw=base.stats?.()||{};
    correlation.hitchesObserved++;
    correlation.lastHitchAt=hitchAt;
    const event=nearestActivity(raw,hitchAt);
    if(event){
      correlation.hitchesCorrelated++;
      correlation.lastMatchedHitch={
        hitchCount:finite(hitchCount),hitchAt:round3(hitchAt),frameMs:round3(frameMs),
        kind:event.kind,forestActivityAt:round3(event.at),deltaMs:round3(event.deltaMs),
        forestWorkMs:round3(event.ms)
      };
      return true;
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
    const raw=base.stats?.()||{};
    return {
      enabled:true,
      observerMode:'p931-ahead-priority',
      legacyObserverMode:'p929-direct-last-slice',
      trees:visible.trees,near:visible.near,mid:visible.mid,far:visible.far,edge:visible.edge,
      activeChunks:finite(raw.activeChunks),cachedChunks:finite(raw.cachedChunks),queuedChunks:finite(raw.queuedChunks),
      chunksBuilt:finite(raw.chunksBuilt),chunksReplaced:finite(raw.chunksReplaced),
      matrixUploads:finite(raw.matrixUploads),densityCountUpdates:finite(raw.densityCountUpdates),
      aheadPriority:{
        enabled:raw.aheadPriority===true,
        nearPriorityDistance:round3(raw.nearPriorityDistance),
        leadM:round3(raw.priorityLeadM),
        confidence:round3(raw.travelConfidence),
        dirX:round3(raw.travelDirX),
        dirZ:round3(raw.travelDirZ)
      },
      slice:{
        lastMs:round3(raw.lastSliceMs),maxMs:round3(raw.maxSliceMs),lastAt:round3(raw.lastSliceAt),
        count:finite(raw.sliceCount),lastCandidates:finite(raw.lastCandidates),maxCandidates:finite(raw.maxCandidates),
        budgetMs:round3(raw.sliceBudgetMs),candidateBatchSize:finite(raw.candidateBatchSize)
      },
      commit:{
        lastMs:round3(raw.lastCommitMs),maxMs:round3(raw.maxCommitMs),lastAt:round3(raw.lastCommitAt),
        manualBounds:raw.manualBounds===true
      },
      hitchCorrelation:{
        hitchesObserved:correlation.hitchesObserved,
        hitchesCorrelated:correlation.hitchesCorrelated,
        hitchesUnmatched:correlation.hitchesUnmatched,
        matchBeforeMs:MATCH_BEFORE_MS,matchAfterMs:MATCH_AFTER_MS,
        lastHitchAt:round3(correlation.lastHitchAt),
        lastMatchedHitch:correlation.lastMatchedHitch?{...correlation.lastMatchedHitch}:null,
        lastUnmatchedHitch:correlation.lastUnmatchedHitch?{...correlation.lastUnmatchedHitch}:null
      }
    };
  }

  function installDiagnostics(){
    globalThis.__WORLD_DRIVE_P928_RECORD_HITCH__=recordHitch;
    globalThis.__WORLD_DRIVE_P929_FOREST__=snapshot;
    globalThis.__WORLD_DRIVE_P931_FOREST__=snapshot;
    if(typeof globalThis.setTimeout!=='function')return;
    const attempt=()=>{
      const current=globalThis.WorldDriveFramePacing;
      if(typeof current!=='function'){
        globalThis.setTimeout(attempt,INSTALL_RETRY_MS);
        return;
      }
      if(current.__worldDriveP931Forest)return;
      const original=current.__worldDriveP928Original||current;
      const wrapped=()=>({...((original?.()||{})),forest:snapshot()});
      wrapped.__worldDriveP929Forest=true;
      wrapped.__worldDriveP931Forest=true;
      wrapped.__worldDriveP928Original=original;
      globalThis.WorldDriveFramePacing=wrapped;
    };
    globalThis.setTimeout(attempt,0);
  }

  installDiagnostics();

  return Object.freeze({
    setAssets:(...args)=>base.setAssets(...args),
    requestUpdate:(...args)=>base.requestUpdate(...args),
    refreshVisibleHeights:(...args)=>base.refreshVisibleHeights(...args),
    clearAll:(...args)=>base.clearAll(...args),
    whenInitialReady:(...args)=>base.whenInitialReady(...args),
    stats:()=>({...base.stats(),p931:snapshot()})
  });
}
