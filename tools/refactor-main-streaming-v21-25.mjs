import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','streaming-coordinator.js');
const mainCheck=path.join(root,'src','__main_streaming_check__.mjs');
const moduleCheck=path.join(root,'src','__streaming_coordinator_check__.mjs');

function die(message){
  console.error(`V21.25 streaming refactor: ${message}`);
  process.exit(1);
}
function count(text,needle){return text.split(needle).length-1;}
function syntaxCheck(filePath,content,label){
  fs.writeFileSync(filePath,content,'utf8');
  try{
    const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
    if(result.status!==0)die(`${label} syntax check failed:\n${result.stderr||result.stdout}`);
  }finally{
    try{fs.unlinkSync(filePath);}catch{}
  }
}
function required(text,needle,label=needle){
  if(!text.includes(needle))die(`${label} missing. No files changed.`);
}

if(!fs.existsSync(mainPath))die('src/main.js missing.');
let main=fs.readFileSync(mainPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';
const beforeLines=main.split(/\r?\n/).length;
const beforeBytes=Buffer.byteLength(main,'utf8');

const already=
  main.includes("from './streaming-coordinator.js'")&&
  main.includes('createStreamingCoordinator({')&&
  !main.includes('const TERRAIN_PRELOAD_BUFFER={')&&
  !main.includes('const deferredVisualJobs=new Map();');
if(already){
  if(!fs.existsSync(modulePath))die('main.js references streaming-coordinator.js but module is missing.');
  console.log('V21.25 streaming refactor: already applied; nothing to do.');
  process.exit(0);
}

// This tool intentionally supports both the GitHub pre-road-extraction source
// and the user's locally generated road-furniture/keyboard/road-geometry state.
for(const needle of [
  '// V21.22.3 HITCH-FREE STREAMING POLICY',
  'const HITCH_FREE_STREAMING={',
  'const streamRefreshState={',
  'function markStreamWorldRefresh(',
  'const deferredVisualJobs=new Map();',
  'function scheduleVisualJob(',
  'function cancelVisualJob(',
  'function shiftRenderedWorldForOrigin(',
  'function commitLocalWorldRefresh(){',
  'function scheduleLocalWorldRefresh(',
  'function recenterIfNeeded(',
  '// ---------- directional world prefetch ----------',
  'const TERRAIN_PRELOAD_BUFFER={',
  'function prefetchRouteAhead(){',
  'async function primeInitialTerrainPreloadBuffer(){',
  'function refreshCurrentImagerySooner(now){',
  'const DISPLAY_DISTANCE_PROFILES={',
  'window.WorldDriveFramePacing=()=>({',
  'let nextDirectionalPrefetchAt=0;',
  'function animate(now){'
])required(main,needle);

const module=`// World Drive V21.25 — streamed-world scheduling and floating-origin coordinator.
// Owns hitch-free refresh policy, deferred visual jobs, directional/cache prefetch,
// floating-origin shifts and streamed-world diagnostics. Heavy rendering stays in main.js.

export function createStreamingCoordinator({
  createWorldStreaming,
  toLatLon,
  nearestRoute,
  routePointAtCum,
  routePointAtFraction,
  getRouteLength,
  getRoutePointCount,
  elevationService,
  waterData,
  sceneryData,
  imageryService,
  getRoadMetadataState,
  signData,
  loadElevationAround,
  loadWaterAround,
  loadSceneryAround,
  buildImageryMosaic,
  loadRoadMetadataAround,
  loadGeographicSignsAround,
  fetchCached,
  streamedWorldGroups,
  ground,
  terrainService,
  camera,
  camTarget,
  car,
  resetStreamedWorldOrigins,
  rebuildLocalWorld,
  applyImageryToGround,
  markStaticShadowsDirty,
  getRuntimeState,
  setWorldOffset
}){
  if(typeof createWorldStreaming!=='function')throw new Error('streaming coordinator requires createWorldStreaming');
  if(typeof getRuntimeState!=='function')throw new Error('streaming coordinator requires getRuntimeState');
  if(typeof setWorldOffset!=='function')throw new Error('streaming coordinator requires setWorldOffset');
  if(typeof rebuildLocalWorld!=='function')throw new Error('streaming coordinator requires rebuildLocalWorld');

  const policy={
    perfConsoleLogging:false,
    softRecenterDistance:520,
    hardWorldRefreshDistance:1450,
    urgentWorldRefreshDistance:2200,
    calmSpeed:4.5
  };

  const state={
    pendingWorld:false,
    reasons:new Set(),
    lastBuiltCenter:{x:0,z:0},
    lastWorldBuildAt:0,
    lastHitchAt:0,
    maxFrameMs:0,
    hitchCount:0
  };

  const deferredVisualJobs=new Map();
  let deferredVisualJobSerial=0;

  const terrainPreloadPolicy={
    aheadDistance:10500,
    behindDistance:1800,
    longitudinalStep:900,
    lateralOffsets:[0,-1500,1500,-3000,3000],
    speedLeadPerMps:38,
    maxSpeedLead:3200,
    batchSize:5,
    bootstrapAheadDistance:7200,
    bootstrapStep:1200,
    bootstrapLateralOffsets:[0,-2800,2800],
    bootstrapTimeoutMs:6500
  };

  const aheadStreamingBuckets=new Set();
  const terrainPreloadQueuedKeys=new Set();
  const terrainPreloadQueue=[];
  let nextDirectionalPrefetchAt=0;
  let nextAheadStreamingAt=0;
  let lastImageryRefreshAt=0;

  const roadMetadata={
    get center(){return getRoadMetadataState()?.center},
    get loading(){return !!getRoadMetadataState()?.loading},
    load:(x,z)=>loadRoadMetadataAround(x,z)
  };

  const worldStreaming=createWorldStreaming({
    toLatLon,
    nearestRoute,
    routePointAtCum,
    routePointAtFraction,
    getRouteLength,

    elevation:{
      get center(){return elevationService.center},
      get loading(){return elevationService.loading},
      load:(x,z)=>loadElevationAround(x,z),
      prefetch:(x,z)=>elevationService.prefetchAt(x,z)
    },

    water:{
      get center(){return waterData.center},
      get loading(){return waterData.loading},
      get generation(){return waterData.generation},
      load:(x,z)=>loadWaterAround(x,z),
      prefetch:(x,z,timeoutMs)=>waterData.prefetchAt(x,z,timeoutMs)
    },

    scenery:{
      get center(){return sceneryData.center},
      get loading(){return sceneryData.loading},
      load:(x,z)=>loadSceneryAround(x,z),
      query:ll=>sceneryData.query(ll)
    },

    imagery:{
      get center(){return imageryService.center},
      get loading(){return imageryService.loading},
      load:(x,z)=>buildImageryMosaic(x,z),
      prefetch:(x,z)=>imageryService.prefetchAt(x,z)
    },

    roadMetadata,

    signs:{
      get center(){return signData.center},
      get loading(){return signData.loading},
      load:(x,z)=>loadGeographicSignsAround(x,z),
      query:ll=>signData.query(ll)
    },

    fetchCached
  });

  function runtime(){
    return getRuntimeState()||{};
  }

  function markWorldRefresh(reason='stream'){
    state.pendingWorld=true;
    state.reasons.add(reason);
  }

  function scheduleVisualJob(key,job,timeout=180){
    if(deferredVisualJobs.has(key))return false;
    const token=++deferredVisualJobSerial;
    deferredVisualJobs.set(key,token);

    const run=()=>{
      if(deferredVisualJobs.get(key)!==token)return;
      deferredVisualJobs.delete(key);
      try{job();}
      catch(error){console.warn(`Deferred visual job failed: ${key}`,error);}
    };

    if(typeof globalThis.requestIdleCallback==='function'){
      globalThis.requestIdleCallback(run,{timeout});
    }else{
      setTimeout(run,Math.min(120,timeout));
    }
    return true;
  }

  function cancelVisualJob(key){
    return deferredVisualJobs.delete(key);
  }

  function hasVisualJob(key){
    return deferredVisualJobs.has(key);
  }

  function shiftRenderedWorldForOrigin(shiftX,shiftZ){
    for(const group of streamedWorldGroups||[]){
      group.position.x-=shiftX;
      group.position.z-=shiftZ;
      group.updateMatrix?.();
    }
    if(ground?.position){
      ground.position.x-=shiftX;
      ground.position.z-=shiftZ;
      ground.updateMatrix?.();
    }
    terrainService.shiftRoadBedOrigin?.(shiftX,shiftZ);
    imageryService.shiftOrigin?.(shiftX,shiftZ);
  }

  function commitWorldRefresh(){
    const current=runtime();
    resetStreamedWorldOrigins?.();
    terrainService.resetRoadBedOrigin?.();
    rebuildLocalWorld();
    imageryService.realignToOrigin?.();
    imageryService.invalidateGeometry?.();
    applyImageryToGround?.();
    if(imageryService.enabled){
      Promise.resolve(buildImageryMosaic(current.absX,current.absZ)).catch(()=>{});
    }
    state.pendingWorld=false;
    state.reasons.clear();
    state.lastBuiltCenter={...(current.worldOffset||{x:0,z:0})};
    state.lastWorldBuildAt=performance.now();
    markStaticShadowsDirty?.();
    return true;
  }

  function scheduleWorldRefresh({urgent=false}={}){
    if(hasVisualJob('world-rebuild'))return false;
    const attempt=()=>{
      const current=runtime();
      const center=state.lastBuiltCenter;
      const buildDistance=Math.hypot(
        (current.absX||0)-center.x,
        (current.absZ||0)-center.z
      );
      const calm=
        !current.gameStarted||
        current.menuOpen||
        Math.abs(current.speed||0)<=policy.calmSpeed;
      const mustRun=
        urgent||
        buildDistance>=policy.urgentWorldRefreshDistance;
      if(!calm&&!mustRun)return;
      commitWorldRefresh();
    };
    return scheduleVisualJob('world-rebuild',attempt,1200);
  }

  function recenterIfNeeded(absx,absz,force=false){
    const current=runtime();
    const offset=current.worldOffset||{x:0,z:0};
    const dx=absx-offset.x;
    const dz=absz-offset.z;
    if(!force&&dx*dx+dz*dz<=policy.softRecenterDistance**2)return false;

    const shiftX=dx;
    const shiftZ=dz;
    const nextOffset={x:absx,z:absz};
    setWorldOffset(nextOffset);

    if(camera?.position){camera.position.x-=shiftX;camera.position.z-=shiftZ;}
    if(camTarget){camTarget.x-=shiftX;camTarget.z-=shiftZ;}
    if(car?.position){car.position.x-=shiftX;car.position.z-=shiftZ;}

    if(force){
      cancelVisualJob('world-rebuild');
      commitWorldRefresh();
      return true;
    }

    shiftRenderedWorldForOrigin(shiftX,shiftZ);

    const bx=absx-state.lastBuiltCenter.x;
    const bz=absz-state.lastBuiltCenter.z;
    const buildDistance=Math.hypot(bx,bz);
    if(buildDistance>=policy.hardWorldRefreshDistance){
      markWorldRefresh('recenter');
      scheduleWorldRefresh({
        urgent:buildDistance>=policy.urgentWorldRefreshDistance
      });
    }
    return true;
  }

  function routeTravelSign(nr){
    if(!nr)return 1;
    return Math.cos((runtime().heading||0)-nr.angle)>=0?1:-1;
  }

  function routeBufferProbe(cum,lateralOffset=0){
    const p=routePointAtCum(cum);
    if(!p)return null;
    const nx=Math.cos(p.angle),nz=-Math.sin(p.angle);
    return {
      x:p.x+nx*lateralOffset,
      z:p.z+nz*lateralOffset,
      cum,
      lateralOffset
    };
  }

  function terrainPreloadKey(dir,cum,lateralOffset){
    return `${dir}:${Math.round(cum/450)}:${Math.round(lateralOffset/500)}`;
  }

  function enqueueTerrainPreloadProbe(dir,cum,lateralOffset){
    const key=terrainPreloadKey(dir,cum,lateralOffset);
    if(aheadStreamingBuckets.has(key)||terrainPreloadQueuedKeys.has(key))return false;
    const probe=routeBufferProbe(cum,lateralOffset);
    if(!probe)return false;
    terrainPreloadQueuedKeys.add(key);
    terrainPreloadQueue.push({...probe,key});
    return true;
  }

  function refillTerrainPreloadBuffer(){
    const routeLength=Math.max(0,Number(getRouteLength())||0);
    if(!routeLength||!getRoutePointCount())return 0;
    const current=runtime();
    const nr=nearestRoute(current.absX,current.absZ);
    if(!nr)return 0;

    const dir=routeTravelSign(nr);
    const speedLead=Math.min(
      terrainPreloadPolicy.maxSpeedLead,
      Math.abs(current.speed||0)*terrainPreloadPolicy.speedLeadPerMps
    );
    const ahead=terrainPreloadPolicy.aheadDistance+speedLead;
    let queued=0;

    for(
      let distance=-terrainPreloadPolicy.behindDistance;
      distance<=ahead;
      distance+=terrainPreloadPolicy.longitudinalStep
    ){
      const cum=Math.max(0,Math.min(routeLength,nr.cum+dir*distance));
      for(const lateralOffset of terrainPreloadPolicy.lateralOffsets){
        if(enqueueTerrainPreloadProbe(dir,cum,lateralOffset))queued++;
      }
    }
    return queued;
  }

  function startTerrainPreloadProbe(probe){
    terrainPreloadQueuedKeys.delete(probe.key);
    aheadStreamingBuckets.add(probe.key);
    try{
      const promise=elevationService.prefetchAt?.(probe.x,probe.z);
      if(promise!==undefined)Promise.resolve(promise).catch(()=>{});
    }catch{}
    if(imageryService.enabled){
      try{
        const promise=imageryService.prefetchAt?.(probe.x,probe.z);
        if(promise!==undefined)Promise.resolve(promise).catch(()=>{});
      }catch{}
    }
  }

  function drainTerrainPreloadBuffer(maxJobs=terrainPreloadPolicy.batchSize){
    let started=0;
    while(started<maxJobs&&terrainPreloadQueue.length){
      const probe=terrainPreloadQueue.shift();
      if(!probe)break;
      startTerrainPreloadProbe(probe);
      started++;
    }
    if(aheadStreamingBuckets.size>900){
      const keep=[...aheadStreamingBuckets].slice(-620);
      aheadStreamingBuckets.clear();
      keep.forEach(key=>aheadStreamingBuckets.add(key));
    }
    return started;
  }

  function prefetchRouteAhead(){
    const queued=refillTerrainPreloadBuffer();
    const started=drainTerrainPreloadBuffer();
    return queued>0||started>0;
  }

  function promiseWithTimeout(promise,timeoutMs){
    return Promise.race([
      Promise.resolve(promise),
      new Promise(resolve=>setTimeout(()=>resolve(null),timeoutMs))
    ]);
  }

  async function primeInitialTerrainPreloadBuffer(){
    const routeLength=Math.max(0,Number(getRouteLength())||0);
    if(!routeLength||!getRoutePointCount())return;
    const current=runtime();
    const nr=nearestRoute(current.absX,current.absZ);
    if(!nr)return;
    const dir=routeTravelSign(nr);
    const tasks=[];

    for(
      let distance=0;
      distance<=terrainPreloadPolicy.bootstrapAheadDistance;
      distance+=terrainPreloadPolicy.bootstrapStep
    ){
      const cum=Math.max(0,Math.min(routeLength,nr.cum+dir*distance));
      for(const lateralOffset of terrainPreloadPolicy.bootstrapLateralOffsets){
        const key=terrainPreloadKey(dir,cum,lateralOffset);
        if(aheadStreamingBuckets.has(key))continue;
        const probe=routeBufferProbe(cum,lateralOffset);
        if(!probe)continue;
        aheadStreamingBuckets.add(key);
        try{
          const promise=elevationService.prefetchAt?.(probe.x,probe.z);
          if(promise!==undefined)tasks.push(Promise.resolve(promise).catch(()=>null));
        }catch{}
        if(imageryService.enabled){
          try{
            const promise=imageryService.prefetchAt?.(probe.x,probe.z);
            if(promise!==undefined)tasks.push(Promise.resolve(promise).catch(()=>null));
          }catch{}
        }
      }
    }

    if(tasks.length){
      await promiseWithTimeout(
        Promise.allSettled(tasks),
        terrainPreloadPolicy.bootstrapTimeoutMs
      );
    }
    refillTerrainPreloadBuffer();
    drainTerrainPreloadBuffer(terrainPreloadPolicy.batchSize*2);
  }

  function refreshCurrentImagerySooner(now){
    if(!imageryService.enabled)return;
    const current=runtime();
    const center=imageryService.center;
    if(!center||!Number.isFinite(center.x)||!Number.isFinite(center.z))return;
    const moved=Math.hypot((current.absX||0)-center.x,(current.absZ||0)-center.z);
    if(moved<520||now-lastImageryRefreshAt<1200)return;
    lastImageryRefreshAt=now;
    Promise.resolve(buildImageryMosaic(current.absX,current.absZ)).catch(()=>{});
  }

  function updateFrame(now){
    const current=runtime();
    if(current.gameStarted&&!current.menuOpen&&now>=nextDirectionalPrefetchAt){
      nextDirectionalPrefetchAt=now+250;
      worldStreaming.prefetchDirectional(current.absX,current.absZ);
    }
    if(current.gameStarted&&!current.menuOpen&&now>=nextAheadStreamingAt){
      nextAheadStreamingAt=now+420;
      prefetchRouteAhead();
      refreshCurrentImagerySooner(now);
    }
    if(
      state.pendingWorld&&
      !hasVisualJob('world-rebuild')&&
      (!current.gameStarted||current.menuOpen||Math.abs(current.speed||0)<=policy.calmSpeed)
    ){
      scheduleWorldRefresh({urgent:false});
    }
  }

  function recordFrame(rawFrameMs,now){
    if(rawFrameMs>20){
      state.lastHitchAt=now;
      state.hitchCount++;
      state.maxFrameMs=Math.max(state.maxFrameMs,rawFrameMs);
    }
  }

  function reset(){
    worldStreaming.reset();
    aheadStreamingBuckets.clear();
    terrainPreloadQueuedKeys.clear();
    terrainPreloadQueue.length=0;
    nextAheadStreamingAt=0;
    lastImageryRefreshAt=0;
    state.pendingWorld=false;
    state.reasons.clear();
    state.lastBuiltCenter={...(runtime().worldOffset||{x:0,z:0})};
    state.lastWorldBuildAt=performance.now();
    deferredVisualJobs.clear();
  }

  function diagnostics(){
    const current=runtime();
    return {
      hitchCount:state.hitchCount,
      maxFrameMs:state.maxFrameMs,
      lastHitchAt:state.lastHitchAt,
      pendingWorldRefresh:state.pendingWorld,
      pendingReasons:[...state.reasons],
      worldBuildCenter:{...state.lastBuiltCenter},
      worldOffset:{...(current.worldOffset||{x:0,z:0})}
    };
  }

  return Object.freeze({
    policy,
    state,
    worldStreaming,
    markWorldRefresh,
    scheduleVisualJob,
    cancelVisualJob,
    hasVisualJob,
    commitWorldRefresh,
    scheduleWorldRefresh,
    recenterIfNeeded,
    prefetchRouteAhead,
    primeInitialTerrainPreloadBuffer,
    promiseWithTimeout,
    refreshCurrentImagerySooner,
    updateFrame,
    recordFrame,
    reset,
    diagnostics
  });
}
`;

// 1) Early policy/state globals become a lazy facade. Runtime creation remains
// near the old worldStreaming block, after every service callback exists.
const policyStart=main.indexOf('// V21.22.3 HITCH-FREE STREAMING POLICY');
const policyEnd=main.indexOf('function markStaticShadowsDirty(){',policyStart);
if(policyStart<0||policyEnd<0)die('streaming policy block markers not found. No files changed.');
const policyReplacement=[
  '// ---------- streamed-world coordinator facade ----------',
  'let streamingCoordinator=null;',
  "function markStreamWorldRefresh(reason='stream'){return streamingCoordinator?.markWorldRefresh(reason);}",
  'function scheduleVisualJob(key,job,timeout=180){return streamingCoordinator?.scheduleVisualJob(key,job,timeout);}',
  'function cancelVisualJob(key){return streamingCoordinator?.cancelVisualJob(key);}',
  'function commitLocalWorldRefresh(){return streamingCoordinator?.commitWorldRefresh();}',
  'function scheduleLocalWorldRefresh(options={}){return streamingCoordinator?.scheduleWorldRefresh(options);}',
  'function recenterIfNeeded(absx,absz,force=false){return streamingCoordinator?.recenterIfNeeded(absx,absz,force)??false;}',
  '',
  'function markStaticShadowsDirty(){'
].join(eol);
main=main.slice(0,policyStart)+policyReplacement+main.slice(policyEnd+'function markStaticShadowsDirty(){'.length);

// 2) Remove the old deferred visual scheduler implementation; facade above owns calls.
const deferredStart=main.indexOf('// Heavy streamed visuals should not all rebuild inside the same animation frame.');
const deferredEnd=main.indexOf('// ---------- Vehicle systems ----------',deferredStart);
if(deferredStart<0||deferredEnd<0)die('deferred visual-job block markers not found. No files changed.');
main=main.slice(0,deferredStart)+main.slice(deferredEnd);

// 3) Remove floating-origin/world-refresh implementation. rebuildLocalWorld() itself stays in main.
const floatingStart=main.indexOf('function shiftRenderedWorldForOrigin(shiftX,shiftZ){');
const floatingEnd=main.indexOf('function resetWorldCaches(){',floatingStart);
if(floatingStart<0||floatingEnd<0)die('floating-origin block markers not found. No files changed.');
main=main.slice(0,floatingStart)+main.slice(floatingEnd);

// 4) Replace unified streaming + preload buffer with one coordinator instance.
const streamStart=main.indexOf('// ---------- directional world prefetch ----------');
const streamEnd=main.indexOf('const DISPLAY_DISTANCE_PROFILES={',streamStart);
if(streamStart<0||streamEnd<0)die('directional/preload streaming block markers not found. No files changed.');
const streamReplacement=[
  '// ---------- unified streamed-world coordinator ----------',
  'streamingCoordinator=createStreamingCoordinator({',
  '  createWorldStreaming,',
  '  toLatLon:(x,z)=>xzToLL(x,z),',
  '  nearestRoute:(x,z)=>nearestRoute(x,z),',
  '  routePointAtCum:cum=>routePointAtCum(cum),',
  '  routePointAtFraction:f=>routePointAt(f),',
  '  getRouteLength:()=>routeLength,',
  '  getRoutePointCount:()=>route.length,',
  '  elevationService,',
  '  waterData,',
  '  sceneryData,',
  '  imageryService,',
  '  getRoadMetadataState:()=>({center:lastRoadMetaCenter,loading:roadMetaLoading}),',
  '  signData,',
  '  loadElevationAround,',
  '  loadWaterAround,',
  '  loadSceneryAround,',
  '  buildImageryMosaic,',
  '  loadRoadMetadataAround,',
  '  loadGeographicSignsAround,',
  '  fetchCached:(namespace,ll,query,timeoutMs,ttlMs)=>',
  '    fetchOverpassCached(namespace,ll,query,timeoutMs,ttlMs),',
  '  streamedWorldGroups,',
  '  ground,',
  '  terrainService,',
  '  camera,',
  '  camTarget,',
  '  car,',
  '  resetStreamedWorldOrigins,',
  '  rebuildLocalWorld,',
  '  applyImageryToGround,',
  '  markStaticShadowsDirty,',
  '  getRuntimeState:()=>({',
  '    absX,absZ,heading,speed,',
  '    gameStarted,',
  '    menuOpen:v21MenuOpen,',
  '    worldOffset',
  '  }),',
  '  setWorldOffset:value=>{worldOffset=value;}',
  '});',
  'const worldStreaming=streamingCoordinator.worldStreaming;',
  'const prefetchRouteAhead=()=>streamingCoordinator.prefetchRouteAhead();',
  'const primeInitialTerrainPreloadBuffer=()=>streamingCoordinator.primeInitialTerrainPreloadBuffer();',
  'const promiseWithTimeout=(promise,timeoutMs)=>streamingCoordinator.promiseWithTimeout(promise,timeoutMs);',
  '',
  'const DISPLAY_DISTANCE_PROFILES={'
].join(eol);
main=main.slice(0,streamStart)+streamReplacement+main.slice(streamEnd+'const DISPLAY_DISTANCE_PROFILES={'.length);

// 5) Route reset delegates all streaming/preload/deferred state cleanup.
const resetSpan=/\s*worldStreaming\.reset\(\);\s*aheadStreamingBuckets\?\.clear\?\.\(\);\s*terrainPreloadQueuedKeys\?\.clear\?\.\(\);\s*terrainPreloadQueue\.length=0;\s*nextAheadStreamingAt=0;\s*lastImageryRefreshAt=0;\s*streamRefreshState\.pendingWorld=false;\s*streamRefreshState\.reasons\.clear\(\);\s*streamRefreshState\.lastBuiltCenter=\{\.\.\.worldOffset\};\s*streamRefreshState\.lastWorldBuildAt=performance\.now\(\);/;
if(!resetSpan.test(main))die('resetWorldCaches streaming-state span not found. No files changed.');
main=main.replace(resetSpan,`${eol}  streamingCoordinator?.reset();`);
main=main.replace(/\s*deferredVisualJobs\.clear\(\);/,'');

// 6) Initial route creation checks coordinator-owned pending state.
required(main,'if(initialElevationReady||streamRefreshState.pendingWorld){','initial pending-world check');
main=main.replace(
  'if(initialElevationReady||streamRefreshState.pendingWorld){',
  'if(initialElevationReady||streamingCoordinator?.state.pendingWorld){'
);

// 7) Diagnostics now come from the coordinator.
const diagStart=main.indexOf('window.WorldDriveFramePacing=()=>({');
const diagEnd=main.indexOf('// ---------- main ----------',diagStart);
if(diagStart<0||diagEnd<0)die('frame-pacing diagnostics block not found. No files changed.');
const diagReplacement=[
  'window.WorldDriveFramePacing=()=>({',
  '  fps:perfGovernor.fps,',
  '  ...(streamingCoordinator?.diagnostics?.()||{})',
  '});',
  '',
  '// ---------- main ----------'
].join(eol);
main=main.slice(0,diagStart)+diagReplacement+main.slice(diagEnd+'// ---------- main ----------'.length);

// 8) Animation loop delegates hitch accounting and periodic streaming cadence.
main=main.replace(/\nlet nextDirectionalPrefetchAt=0;\s*\n/,'\n');
const hitchBlock=/\s*if\(rawFrameMs>20\)\{\s*streamRefreshState\.lastHitchAt=now;\s*streamRefreshState\.hitchCount\+\+;\s*streamRefreshState\.maxFrameMs=Math\.max\(streamRefreshState\.maxFrameMs,rawFrameMs\);\s*\}/;
if(!hitchBlock.test(main))die('animation hitch-accounting block not found. No files changed.');
main=main.replace(hitchBlock,`${eol} streamingCoordinator?.recordFrame(rawFrameMs,now);`);

const cadenceStart=main.indexOf('   if(\n     gameStarted&&\n     !v21MenuOpen&&\n     now>=nextDirectionalPrefetchAt');
const cadenceEndNeedle="   waterTex.offset.x=(waterTex.offset.x+dt*.003)%1;";
const cadenceEnd=main.indexOf(cadenceEndNeedle,cadenceStart);
if(cadenceStart<0||cadenceEnd<0)die('animation streaming cadence block not found. No files changed.');
main=main.slice(0,cadenceStart)+`   streamingCoordinator?.updateFrame(now);${eol}${eol}`+main.slice(cadenceEnd);

required(main,'if(HITCH_FREE_STREAMING.perfConsoleLogging&&now>=perfGovernor.nextPerfLogAt){','perf logging policy check');
main=main.replace(
  'if(HITCH_FREE_STREAMING.perfConsoleLogging&&now>=perfGovernor.nextPerfLogAt){',
  'if(streamingCoordinator?.policy.perfConsoleLogging&&now>=perfGovernor.nextPerfLogAt){'
);

// Import near the existing world-streaming dependency.
const importAnchor="import { createWorldStreaming } from './world-streaming.js';";
if(count(main,importAnchor)!==1)die('world-streaming import anchor missing/duplicated. No files changed.');
main=main.replace(importAnchor,importAnchor+eol+"import { createStreamingCoordinator } from './streaming-coordinator.js';");

for(const stale of [
  'const HITCH_FREE_STREAMING={',
  'const streamRefreshState={',
  'const deferredVisualJobs=new Map();',
  'function shiftRenderedWorldForOrigin(',
  'const TERRAIN_PRELOAD_BUFFER={',
  'const aheadStreamingBuckets=new Set();',
  'const terrainPreloadQueue=[];',
  'let nextAheadStreamingAt=0;',
  'let nextDirectionalPrefetchAt=0;',
  'streamRefreshState.',
  'deferredVisualJobs.'
]){
  if(main.includes(stale))die(`stale streaming implementation remains in main.js: ${stale}. No files changed.`);
}

for(const needle of [
  "from './streaming-coordinator.js'",
  'let streamingCoordinator=null;',
  'function scheduleVisualJob(key,job,timeout=180){return streamingCoordinator?.scheduleVisualJob(key,job,timeout);}',
  'function recenterIfNeeded(absx,absz,force=false){return streamingCoordinator?.recenterIfNeeded(absx,absz,force)??false;}',
  'streamingCoordinator=createStreamingCoordinator({',
  'const worldStreaming=streamingCoordinator.worldStreaming;',
  'streamingCoordinator?.reset();',
  'streamingCoordinator?.recordFrame(rawFrameMs,now);',
  'streamingCoordinator?.updateFrame(now);',
  'streamingCoordinator?.policy.perfConsoleLogging'
])required(main,needle,`post-transform integration ${needle}`);

for(const needle of [
  'export function createStreamingCoordinator({',
  'const policy={',
  'const state={',
  'const deferredVisualJobs=new Map();',
  'const terrainPreloadPolicy={',
  'const worldStreaming=createWorldStreaming({',
  'function scheduleVisualJob(',
  'function commitWorldRefresh(){',
  'function recenterIfNeeded(',
  'function refillTerrainPreloadBuffer(){',
  'async function primeInitialTerrainPreloadBuffer(){',
  'function updateFrame(now){',
  'function recordFrame(rawFrameMs,now){',
  'function diagnostics(){'
])required(module,needle,`generated coordinator ${needle}`);

syntaxCheck(mainCheck,main,'transformed main.js');
syntaxCheck(moduleCheck,module,'generated streaming-coordinator.js');

fs.writeFileSync(modulePath,module,'utf8');
fs.writeFileSync(mainPath,main,'utf8');

const afterLines=main.split(/\r?\n/).length;
const afterBytes=Buffer.byteLength(main,'utf8');
console.log('V21.25 STREAMING REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines (${beforeBytes} -> ${afterBytes} bytes)`);
console.log(`streaming-coordinator.js: ${module.split(/\r?\n/).length} lines`);
console.log('Extracted: hitch-free policy, idle jobs, floating origin, world-refresh scheduling, directional/terrain preload and hitch diagnostics.');