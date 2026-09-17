/** Opt-in observer only. No forest/terrain mutations or planting authority.
 * A single delayed idle task admits at most four diagnostic chunks. Full raw
 * candidate generation, I/O and decoding continue to belong to the R7 Worker.
 */
import {createBiomeWorkerClient} from './biome-worker-client.js';
import {createBiomeChunkContextBridge} from './chunk-context-bridge.js';
import {FOREST_LAYOUT_ID,forestChunkAtAbsolute} from './forest-candidate-adapter.js';
import {MISSING_CHUNK_CONTEXT,snapshotIdentity} from './chunk-context-snapshot.js';
import {createBiomeObserverPlan} from './route-observer-plan.js';
const freeze=Object.freeze;
const copy=value=>JSON.parse(JSON.stringify(value));
export function scheduleBiomeObservation(callback){
  let idleId=null,cancelled=false;
  const timer=setTimeout(()=>{
    if(cancelled)return;
    const idle=globalThis.requestIdleCallback;
    if(typeof idle==='function')idleId=idle.call(globalThis,deadline=>{
      if(!cancelled)void callback(deadline.timeRemaining()>=2);
    },{timeout:1000});
    else void callback(true);
  },250);
  return ()=>{cancelled=true;clearTimeout(timer);
    if(idleId!==null&&typeof globalThis.cancelIdleCallback==='function')globalThis.cancelIdleCallback(idleId);};
}
export function createBiomeGameplayDiagnostics({getState,getGeneration,getRoute,isRouteReady,
  schedule=scheduleBiomeObservation,clientFactory=createBiomeWorkerClient,now=()=>performance.now()}={}){
  for(const f of [getState,getGeneration,getRoute,isRouteReady,schedule,clientFactory,now])
    if(typeof f!=='function')throw new TypeError('Invalid diagnostic owner');
  let enabled=false,epoch=0,cancel=null,running=null,client=null,bridge=null,plan=null,config=null;
  let generation=null,origin=null,attempted=null,last=null,phase='disabled',error=null,workerStats=null;
  const stats={polls:0,idleDeferrals:0,initializations:0,invalidations:0,teleports:0,windows:0,
    captures:0,unchanged:0,failures:0,discarded:0,maxObserveMs:0,maxPlanMs:0,maxRoundTripMs:0,
    maxScanTests:0,maxChunksRequested:0};
  function release(){bridge?.dispose();client?.dispose();bridge=null;client=null;plan=null;
    generation=null;origin=null;attempted=null;last=null;workerStats=null;}
  function invalidate(reason='route-change'){
    epoch++;stats.invalidations++;cancel?.();cancel=null;release();phase=enabled?'waiting-route':'disabled';error=reason;
  }
  function stop(){enabled=false;invalidate('stopped');config=null;phase='disabled';}
  function arm(){
    if(!enabled||cancel||running||phase==='fault')return;
    cancel=schedule(async admitted=>{cancel=null;if(!enabled)return;
      if(!admitted){stats.idleDeferrals++;arm();return;}
      const task={epoch};running=task;
      try{await poll(task);}catch(e){
        if(task.epoch===epoch){stats.failures++;release();phase='fault';error=String(e?.message??e).slice(0,160);}
      }finally{if(running===task)running=null;arm();}
    });
  }
  function valid(task){
    if(!enabled||task.epoch!==epoch||!isRouteReady())return false;
    const s=getState();return getGeneration()===generation&&s.origin?.lat===origin?.lat&&s.origin?.lon===origin?.lon;
  }
  async function poll(task){
    stats.polls++;
    const raw=getState(),state={gameStarted:raw.gameStarted,absX:raw.absX,absZ:raw.absZ,
      origin:{lat:raw.origin?.lat,lon:raw.origin?.lon}};
    if(!isRouteReady()||!state.gameStarted){phase='waiting-route';return;}
    if(!Number.isFinite(state.absX)||!Number.isFinite(state.absZ))throw new TypeError('Invalid diagnostic position');
    if(!plan){
      generation=getGeneration();origin={lat:state.origin?.lat,lon:state.origin?.lon};
      if(!Number.isSafeInteger(generation)||generation<0)throw new TypeError('Invalid game generation');
      const t=now();plan=createBiomeObserverPlan(getRoute(),{origin,routeId:`game-${generation}`});
      stats.maxPlanMs=Math.max(stats.maxPlanMs,now()-t);
      phase='initializing';client=clientFactory();stats.initializations++;
      await client.initialize(config);if(!valid(task)){stats.discarded++;return;}
      bridge=createBiomeChunkContextBridge({client,identity:config.directory,layoutId:FOREST_LAYOUT_ID,maxChunks:16});
      const r=await bridge.setRoute(plan.coordinates,{projectionId:plan.adapter.projectionId});
      if(!valid(task)){stats.discarded++;return;}
      if(r.status!=='route-ready')throw new Error(r.reason||r.status);
    }
    if(!valid(task)){invalidate('generation-or-origin-change');return;}
    const started=now(),position=plan.locate(state.absX,state.absZ);
    stats.maxObserveMs=Math.max(stats.maxObserveMs,now()-started);
    stats.maxScanTests=Math.max(stats.maxScanTests,position.tests);
    if(position.teleport&&last){
      stats.teleports++;invalidate('teleport-observed');return;
    }
    if(attempted===position.signature){stats.unchanged++;return;}
    attempted=position.signature;phase='preparing';error=null;last=null;
    const tripStart=now(),options={aheadMeters:position.direction>0?2400:700,
      behindMeters:position.direction>0?700:2400,corridorMeters:900,maxTiles:8};
    stats.windows++;
    const ready=await bridge.update(position.progress,options);
    if(!valid(task)){stats.discarded++;return;}
    const chunks=[];
    if(ready.status==='ready'){
      stats.maxChunksRequested=Math.max(stats.maxChunksRequested,position.chunks.length);
      for(const c of position.chunks){
        if(!valid(task)){stats.discarded++;return;}
        const previous=bridge.get(c.cx,c.cz);stats.captures++;
        const result=await bridge.prepareForestChunk({...c,origin,routeId:plan.adapter.routeId,
          refresh:!!previous?.counts.unavailable});
        if(!valid(task)){stats.discarded++;return;}
        chunks.push(freeze({...c,status:result.status,reason:result.reason,
          counts:result.snapshot?.counts??null}));
      }
    }
    const diagnostics=await client.diagnostics();if(!valid(task)){stats.discarded++;return;}
    workerStats={ready:!!diagnostics.ready,reason:diagnostics.last?.reason??null,
      handoffs:diagnostics.handoffs,peakServices:diagnostics.peakServices,
      transport:diagnostics.transport,source:diagnostics.source};
    // A response may finish after a teleport. Never call this old location current.
    const live=getState();if(Math.hypot(live.absX-state.absX,live.absZ-state.absZ)>960){
      stats.teleports++;invalidate('teleport-during-preparation');return;
    }
    stats.maxRoundTripMs=Math.max(stats.maxRoundTripMs,now()-tripStart);
    phase=ready.status==='ready'?'observed':'missing-coverage';error=ready.reason;
    last=freeze({at:now(),generation,absX:state.absX,absZ:state.absZ,progress:position.progress,
      direction:position.direction,distanceFromRoute:position.distanceFromRoute,
      chunks:freeze(chunks),windowStatus:ready.status});
  }
  function start(value){
    // Trusted application input, not a fetched/signed root. Validate/copy once.
    const json=JSON.stringify(value);if(!json||json.length>2*1024*1024)throw new RangeError('Diagnostic configuration size');
    const safe=JSON.parse(json);snapshotIdentity(safe?.directory);
    if(typeof safe.baseUrl!=='string')throw new TypeError('Diagnostic baseUrl required');
    stop();config={directory:safe.directory,baseUrl:safe.baseUrl};enabled=true;phase='waiting-route';error=null;arm();
    return freeze({status:'enabled',diagnosticOnly:true});
  }
  function sample(cx,cz,index){
    if(!plan||!bridge||!enabled||!isRouteReady()||getGeneration()!==generation)return MISSING_CHUNK_CONTEXT;
    const s=getState();if(s.origin?.lat!==origin.lat||s.origin?.lon!==origin.lon)return MISSING_CHUNK_CONTEXT;
    const p=plan.adapter.point(cx,cz,index);return bridge.lookup(cx,cz,index,p.lon,p.lat);
  }
  function diagnostics(){
    let fresh=false;
    if(last&&enabled&&isRouteReady()&&getGeneration()===generation){
      const s=getState(),c=forestChunkAtAbsolute(s.absX,s.absZ),old=last.chunks.find(v=>v.role==='current');
      fresh=s.origin?.lat===origin.lat&&s.origin?.lon===origin.lon&&c.cx===old?.cx&&c.cz===old?.cz;
    }
    return {enabled,diagnosticOnly:true,phase,error,epoch,running:!!running,scheduled:!!cancel,
      freshCurrentChunk:fresh,last,...stats,bridge:bridge?.diagnostics()??null,worker:copy(workerStats),
      coverageScope:'current plus up to three route-forward chunks; not whole forest',
      placementAuthority:false};
  }
  return freeze({start,stop,invalidate,routeReady:()=>{error=null;arm();},
    refresh:()=>{attempted=null;arm();},sample,diagnostics});
}
