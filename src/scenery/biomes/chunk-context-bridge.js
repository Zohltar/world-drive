/** Exclusive route/window owner for a previously initialized R5 Worker client.
 * Explicit preparation publishes bounded immutable exact-point chunk snapshots.
 * get()/lookup() never request, queue, hash, decode or await anything.
 */
import {CHUNK_CONTEXT_SCHEMA, MAX_CHUNK_CONTEXTS, MAX_CONTEXT_PAYLOAD,
  MISSING_CHUNK_CONTEXT, snapshotIdentity, chunkContextKey, copyChunkPoints,
  installChunkContext} from './chunk-context-snapshot.js';
import {FOREST_LAYOUT_ID, FOREST_POINT_COUNT, createForestCandidateAdapter,
  copyForestChunkRequest} from './forest-candidate-adapter.js';
const freeze=Object.freeze;
const outcome=(status,reason=null,snapshot=null)=>freeze({status,reason,snapshot});
const bounded=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export function createBiomeChunkContextBridge({client,identity,layoutId='forest-candidates-v1',
  maxChunks=32,maxBytes=4*1024*1024,maxPendingChunks=2,maxPendingBytes=1024*1024}={}){
  const fixed=snapshotIdentity(identity);
  chunkContextKey('validation',layoutId,0,0);
  for(const method of ['setRoute','update','captureChunk','dispose'])if(typeof client?.[method]!=='function')throw new TypeError('Invalid chunk Worker client');
  if(!bounded(maxChunks,1,128)||!bounded(maxBytes,1,16*1024*1024)||!bounded(maxPendingChunks,1,2)
    ||!bounded(maxPendingBytes,1,2*1024*1024))throw new RangeError('Invalid chunk snapshot budgets');
  const cache=new Map(),pending=new Map();
  let routeEpoch=0,windowEpoch=0,workerGeneration=null,ready=null,projectionId=null;
  let closed=false,routePending=false,updatePending=false,requestId=0,residentBytes=0,pendingBytes=0;
  const stats={published:0,cacheHits:0,deduplicated:0,rejected:0,discarded:0,busy:0,evictions:0,
    peakChunks:0,peakBytes:0,peakPendingChunks:0,peakPendingBytes:0};
  const current=(r,w)=>!closed&&r===routeEpoch&&w===windowEpoch;
  const busy=reason=>{stats.busy++;return outcome('busy',reason);};
  const rejected=reason=>{stats.rejected++;return outcome('rejected',reason);};
  const discarded=()=>{stats.discarded++;return outcome('discarded','stale-route-or-window');};
  function clear(){cache.clear();residentBytes=0;}
  async function setRoute(coordinates,{projectionId:nextProjection}={}){
    if(closed)return outcome('unavailable','disposed');
    // Validate address and bounded route BEFORE invalidating a good snapshot set.
    chunkContextKey(nextProjection,layoutId,0,0);
    if(!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>20000
      ||!coordinates.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)
        &&Math.abs(p[0])<=180&&Math.abs(p[1])<=90))throw new TypeError('Invalid snapshot route');
    if(routePending)return busy('route-admission');
    const points=coordinates.map(p=>[p[0],p[1]]);
    routeEpoch++;windowEpoch++;clear();ready=null;workerGeneration=null;projectionId=nextProjection;routePending=true;
    const r=routeEpoch,w=windowEpoch;
    try{
      const answer=await client.setRoute(points);
      if(!current(r,w))return discarded();
      if(!Number.isSafeInteger(answer?.generation)||answer.generation<1)return rejected('invalid-route-reply');
      workerGeneration=answer.generation;return outcome('route-ready');
    }catch(error){return current(r,w)?rejected('route-worker-failure'):discarded();}
    finally{routePending=false;}
  }
  async function update(position,options={}){
    if(closed)return outcome('unavailable','disposed');
    if(!workerGeneration||routePending)return outcome('unavailable','route-not-ready');
    if(updatePending)return busy('window-admission');
    if(!Number.isFinite(position))throw new TypeError('Invalid snapshot position');
    const safe={};
    for(const k of ['aheadMeters','behindMeters','corridorMeters','maxTiles','maxTests']){
      if(options[k]!==undefined){if(!Number.isFinite(options[k]))throw new TypeError('Invalid snapshot window');safe[k]=options[k];}
    }
    windowEpoch++;ready=null;updatePending=true;const r=routeEpoch,w=windowEpoch;
    try{
      const answer=await client.update(position,safe);
      if(!current(r,w))return discarded();
      if(answer?.status!=='ready')return outcome('unavailable','window-not-ready');
      if(answer.generation!==workerGeneration||answer.revision!==fixed.revision
        ||!Number.isSafeInteger(answer.serial)||answer.serial<1)return rejected('invalid-window-reply');
      ready=freeze({generation:workerGeneration,serial:answer.serial});return outcome('ready');
    }catch(error){return current(r,w)?rejected('window-worker-failure'):discarded();}
    finally{updatePending=false;}
  }
  function prepare({cx,cz,points,refresh=false,origin,routeId}={},procedural=false){
    if(closed)return Promise.resolve(outcome('unavailable','disposed'));
    if(!projectionId)return Promise.resolve(outcome('unavailable','route-not-ready'));
    const key=chunkContextKey(projectionId,layoutId,cx,cz);
    let adapter=null;
    if(procedural){
      adapter=createForestCandidateAdapter({origin,routeId});
      if(layoutId!==FOREST_LAYOUT_ID||projectionId!==adapter.projectionId
        ||typeof client.captureForestChunk!=='function')return Promise.resolve(rejected('forest-layout-or-client-mismatch'));
    }else if(layoutId===FOREST_LAYOUT_ID)return Promise.resolve(rejected('forest-layout-requires-procedural-request'));
    const flat=procedural?null:copyChunkPoints(points);
    const previous=cache.get(key);
    if(previous&&!procedural&&!previous.matches(flat))return Promise.resolve(rejected('chunk-layout-conflict'));
    if(previous&&!refresh){cache.delete(key);cache.set(key,previous);stats.cacheHits++;return Promise.resolve(outcome('prepared',null,previous.view));}
    if(!ready||routePending)return Promise.resolve(outcome('unavailable','window-not-ready'));
    const r=routeEpoch,w=windowEpoch,pendingKey=`${r}/${w}/${key}`;
    const other=pending.get(pendingKey);
    if(other){
      if(other.procedural!==procedural||(!procedural&&(other.points.length!==flat.length||!other.points.every((n,i)=>n===flat[i]))))return Promise.resolve(rejected('chunk-layout-conflict'));
      stats.deduplicated++;return other.promise;
    }
    // Reserve the worst-case normalized dictionary plus coordinate/index payload.
    const reservation=(procedural?FOREST_POINT_COUNT*18:flat.byteLength+flat.length)+MAX_CHUNK_CONTEXTS*MAX_CONTEXT_PAYLOAD;
    if(pending.size>=maxPendingChunks||pendingBytes+reservation>maxPendingBytes)return Promise.resolve(busy('chunk-admission'));
    let request={schema:CHUNK_CONTEXT_SCHEMA,key,requestId:++requestId,...ready,cx,cz,projectionId,layoutId};
    if(procedural)request=copyForestChunkRequest({...request,origin:adapter.origin,routeId:adapter.routeId});
    else request.points=flat;
    const job={points:flat,procedural,promise:null};pending.set(pendingKey,job);pendingBytes+=reservation;
    stats.peakPendingChunks=Math.max(stats.peakPendingChunks,pending.size);stats.peakPendingBytes=Math.max(stats.peakPendingBytes,pendingBytes);
    // The microtask lets the bounded pending entry exist before client callbacks.
    job.promise=Promise.resolve().then(()=>current(r,w)
      ?(procedural?client.captureForestChunk(request):client.captureChunk(request)):null).then(reply=>{
      if(!current(r,w))return discarded();
      let packet=reply,complete=request;
      if(procedural){
        if(!(reply?.points instanceof Float64Array)||reply.points.length!==FOREST_POINT_COUNT*2)
          return rejected('forest-point-buffer-bound');
        // No hashing/projection/chunk generation here. R6 validates and privately
        // copies the bounded exact-point buffer; lookup still requires exact lon/lat.
        complete={...request,points:reply.points};packet=reply.packet;
      }
      const installed=installChunkContext(packet,complete,fixed,{isCurrent:()=>!closed&&r===routeEpoch});
      if(installed.payloadBytes>maxBytes)return rejected('chunk-residency-budget');
      // All validation is complete before touching valid resident data.
      const old=cache.get(key);
      if(old){cache.delete(key);residentBytes-=old.payloadBytes;}
      while(cache.size>=maxChunks||residentBytes+installed.payloadBytes>maxBytes){
        const first=cache.keys().next().value;residentBytes-=cache.get(first).payloadBytes;cache.delete(first);stats.evictions++;
      }
      cache.set(key,installed);residentBytes+=installed.payloadBytes;stats.published++;
      stats.peakChunks=Math.max(stats.peakChunks,cache.size);stats.peakBytes=Math.max(stats.peakBytes,residentBytes);
      return outcome('prepared',null,installed.view);
    }).catch(()=>current(r,w)?rejected('chunk-worker-or-validation-failure'):discarded())
      .finally(()=>{pending.delete(pendingKey);pendingBytes-=reservation;});
    return job.promise;
  }
  function get(cx,cz){
    if(closed||!projectionId)return null;
    return cache.get(chunkContextKey(projectionId,layoutId,cx,cz))?.view??null;
  }
  function lookup(cx,cz,index,lon,lat){return get(cx,cz)?.lookup(index,lon,lat)??MISSING_CHUNK_CONTEXT;}
  function dispose(){if(closed)return;closed=true;routeEpoch++;windowEpoch++;ready=null;clear();client.dispose();}
  return freeze({setRoute,update,prepareChunk:options=>prepare(options),
    prepareForestChunk:options=>prepare(options,true),get,lookup,dispose,diagnostics:()=>({...stats,closed,
    routeEpoch,windowEpoch,workerGeneration,ready:!!ready,projectionId,layoutId,identity:fixed,
    residentChunks:cache.size,residentPayloadBytes:residentBytes,pendingChunks:pending.size,pendingReservedBytes:pendingBytes,
    maxChunks,maxBytes,maxPendingChunks,maxPendingBytes,routePending,updatePending})});
}
