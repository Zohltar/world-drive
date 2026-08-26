import {createForestTerrainSampler} from './forest-terrain-sampler.js';
import {
  FOREST_STREAMING_POLICY as FOREST,
  forestHash,
  forestDensityNoise
} from './forest-streaming-policy.js';

// P9 forest streaming
// -------------------
// P7/P8 rebuilt the complete 1.75 km forest every time the floating origin had
// moved far enough. P9 makes forest generation spatially persistent instead:
//  * the world is split into 480 m chunks (4 x 4 deterministic 120 m cells),
//  * only chunks entering the active radius are generated,
//  * chunks leaving the radius are detached but kept in a bounded LRU cache,
//  * re-entering a cached chunk requires no terrain/road/water generation work,
//  * each chunk owns one InstancedMesh, so Three.js can frustum-cull it,
//  * near/mid/far density and geometry switch by swapping a prebuilt instance
//    matrix tier, not by regenerating tree positions.

export function createForestChunkStreamer({
  THREE,
  forestGroup,
  getWorldOffset,
  terrainHeight,
  nearestRoute,
  isWaterAt,
  blocksForest,
  onStats
}){
  if(!THREE)throw new Error('Forest chunk streamer requires THREE');
  if(!forestGroup)throw new Error('Forest chunk streamer requires forestGroup');

  const chunkCells=Math.max(1,FOREST.chunkCells||4);
  const chunkSize=FOREST.cellSize*chunkCells;
  const halfChunkDiagonal=chunkSize*Math.SQRT2*.5;
  const cacheLimit=Math.max(32,FOREST.chunkCacheLimit||96);
  const edgeDistance=FOREST.outerFadeStart||1540;
  const lodHysteresis=Math.max(0,FOREST.chunkLodHysteresis||70);

  let assets=null;
  let active=new Map();
  const cache=new Map();
  const queued=new Map();
  let queue=[];
  let queueRunning=false;
  let pollTimer=null;
  let serial=0;
  let lastCenter={x:NaN,z:NaN};
  let slopeCache=new Map();
  let initialResolved=false;
  let resolveInitialReady;
  const initialReady=new Promise(resolve=>{resolveInitialReady=resolve;});
  const dummy=new THREE.Object3D();

  const forestTerrain=createForestTerrainSampler({
    THREE,
    forestGroup,
    getWorldOffset,
    fallbackHeight:terrainHeight
  });
  const forestHeight=(x,z)=>forestTerrain.heightAt(x,z);

  function assetByName(name){
    return (assets?.trees||[]).find(tree=>String(tree?.name||'').toLowerCase()===name)||null;
  }

  function currentAssets(){
    const trees=assets?.trees||[];
    const mid=assetByName('proxy-mid')||trees[0]||null;
    const far=assetByName('proxy-far')||mid;
    return {mid,far};
  }

  function keyFor(cx,cz){return `${cx}:${cz}`;}

  function chunkDescriptor(cx,cz){
    return {
      key:keyFor(cx,cz),cx,cz,
      originX:cx*chunkSize,
      originZ:cz*chunkSize,
      centerX:(cx+.5)*chunkSize,
      centerZ:(cz+.5)*chunkSize
    };
  }

  // P9.1 priority is distance to the chunk footprint, not its centre. A 480 m
  // chunk containing the car therefore always has priority 0 even when the car
  // sits near one of its corners. Centre-distance alone could make a visually
  // farther neighbouring chunk build first.
  function chunkPriorityDistance(chunk,center){
    const minX=chunk.originX,maxX=chunk.originX+chunkSize;
    const minZ=chunk.originZ,maxZ=chunk.originZ+chunkSize;
    const dx=center.x<minX?minX-center.x:(center.x>maxX?center.x-maxX:0);
    const dz=center.z<minZ?minZ-center.z:(center.z>maxZ?center.z-maxZ:0);
    return Math.hypot(dx,dz);
  }

  function chunkCenterDistance(chunk,center){
    return Math.hypot(chunk.centerX-center.x,chunk.centerZ-center.z);
  }

  function sortQueueByPriority(center){
    queue.sort((a,b)=>{
      const pa=chunkPriorityDistance(a,center),pb=chunkPriorityDistance(b,center);
      if(Math.abs(pa-pb)>.001)return pa-pb;
      return chunkCenterDistance(a,center)-chunkCenterDistance(b,center);
    });
  }

  function requiredChunks(center){
    const minX=Math.floor((center.x-FOREST.maxDistance)/chunkSize)-1;
    const maxX=Math.floor((center.x+FOREST.maxDistance)/chunkSize)+1;
    const minZ=Math.floor((center.z-FOREST.maxDistance)/chunkSize)-1;
    const maxZ=Math.floor((center.z+FOREST.maxDistance)/chunkSize)+1;
    const out=[];
    for(let cx=minX;cx<=maxX;cx++)for(let cz=minZ;cz<=maxZ;cz++){
      const chunk=chunkDescriptor(cx,cz);
      const d=chunkCenterDistance(chunk,center);
      if(d<=FOREST.maxDistance+halfChunkDiagonal){
        chunk.distance=d;
        chunk.priorityDistance=chunkPriorityDistance(chunk,center);
        out.push(chunk);
      }
    }
    out.sort((a,b)=>a.priorityDistance-b.priorityDistance||a.distance-b.distance);
    return out;
  }

  function distanceToSegment(x,z,segment){
    const vx=segment.bx-segment.ax,vz=segment.bz-segment.az;
    const vv=vx*vx+vz*vz||1;
    const t=Math.max(0,Math.min(1,((x-segment.ax)*vx+(z-segment.az)*vz)/vv));
    return Math.hypot(x-(segment.ax+vx*t),z-(segment.az+vz*t));
  }

  function routeSegmentsForCell(cell){
    const first=nearestRoute(cell.x,cell.z);
    if(!first)return [];
    const halfDiagonal=FOREST.cellSize*Math.SQRT2*.5;
    if(first.d>FOREST.roadClearance+halfDiagonal+4)return [];
    const h=FOREST.cellSize*.48;
    const probes=[
      [cell.x,cell.z],
      [cell.x-h,cell.z-h],[cell.x+h,cell.z-h],[cell.x-h,cell.z+h],[cell.x+h,cell.z+h],
      [cell.x-h,cell.z],[cell.x+h,cell.z],[cell.x,cell.z-h],[cell.x,cell.z+h]
    ];
    const unique=new Map();
    for(const [x,z] of probes){
      const nr=nearestRoute(x,z);
      if(nr&&Number.isInteger(nr.i))unique.set(nr.i,nr);
    }
    return [...unique.values()];
  }

  function tooCloseToRoad(x,z,segments){
    for(const segment of segments){
      if(distanceToSegment(x,z,segment)<FOREST.roadClearance)return true;
    }
    return false;
  }

  function terrainSlope(x,z){
    const q=FOREST.slopeCacheSize;
    const qx=Math.floor(x/q),qz=Math.floor(z/q),key=`${qx}:${qz}`;
    if(slopeCache.has(key))return slopeCache.get(key);
    const sx=(qx+.5)*q,sz=(qz+.5)*q,d=8;
    const hx=forestHeight(sx+d,sz)-forestHeight(sx-d,sz);
    const hz=forestHeight(sx,sz+d)-forestHeight(sx,sz-d);
    const slope=Math.hypot(hx,hz)/(d*2);
    slopeCache.set(key,slope);
    if(slopeCache.size>12000){
      const next=new Map();
      let kept=0;
      for(const entry of slopeCache){
        if((kept++&1)===0)next.set(entry[0],entry[1]);
      }
      slopeCache=next;
    }
    return slope;
  }

  function densityAt(x,z){
    const noise=forestDensityNoise(x,z);
    return Math.min(1,.42+.72*Math.max(0,Math.min(1,noise)));
  }

  function pushMatrix(list,x,z,y,height,widthScale,rot,leanX,leanZ,originX,originZ){
    dummy.position.set(x-originX,y-.10,z-originZ);
    dummy.rotation.set(leanX,rot,leanZ);
    dummy.scale.set(height*widthScale,height,height*widthScale);
    dummy.updateMatrix();
    const e=dummy.matrix.elements;
    for(let i=0;i<16;i++)list.push(e[i]);
  }

  function buildChunkData(desc,buildSerial){
    if(buildSerial!==serial)return null;
    const near=[];
    const mid=[];
    const far=[];
    const edge=[];
    let accepted=0;

    const baseCellX=desc.cx*chunkCells;
    const baseCellZ=desc.cz*chunkCells;
    for(let sx=0;sx<chunkCells;sx++)for(let sz=0;sz<chunkCells;sz++){
      const cellCx=baseCellX+sx;
      const cellCz=baseCellZ+sz;
      const cell={
        cx:cellCx,cz:cellCz,
        x:(cellCx+.5)*FOREST.cellSize,
        z:(cellCz+.5)*FOREST.cellSize
      };
      const roadSegments=routeSegmentsForCell(cell);
      const baseDensity=densityAt(cell.x,cell.z);

      for(let i=0;i<FOREST.candidatesPerCell;i++){
        const rx=forestHash(cellCx,cellCz,17+i*7919);
        const rz=forestHash(cellCx,cellCz,31+i*104729);
        const x=(cellCx+rx)*FOREST.cellSize;
        const z=(cellCz+rz)*FOREST.cellSize;
        const slope=terrainSlope(x,z);
        if(slope>FOREST.maxSlope)continue;

        let keep=baseDensity;
        if(slope>.82)keep*=.72;
        const keepSeed=forestHash(cellCx,cellCz,(0x51f15e+Math.imul(i,0x9e3779b1))|0);
        if(keepSeed>keep)continue;
        if(roadSegments.length&&tooCloseToRoad(x,z,roadSegments))continue;
        if(isWaterAt(x,z,8))continue;
        if(blocksForest(x,z))continue;

        const height=8.2+forestHash(cellCx,cellCz,0x191+i*1013)*9.6;
        const widthScale=.78+forestHash(cellCx,cellCz,0x2b7+i*2029)*.42;
        const rot=forestHash(cellCx,cellCz,0x391+i*4093)*Math.PI*2;
        const leanX=(forestHash(cellCx,cellCz,0x4d1+i*8191)-.5)*.038;
        const leanZ=(forestHash(cellCx,cellCz,0x5f3+i*12289)-.5)*.038;
        const y=forestHeight(x,z);
        const lodSeed=forestHash(cellCx,cellCz,(0x73a2d1+Math.imul(i,2246822519))|0);

        pushMatrix(near,x,z,y,height,widthScale,rot,leanX,leanZ,desc.originX,desc.originZ);
        if(lodSeed<.88)pushMatrix(mid,x,z,y,height,widthScale,rot,leanX*.7,leanZ*.7,desc.originX,desc.originZ);
        if(lodSeed<.55)pushMatrix(far,x,z,y,height,widthScale,rot,leanX*.35,leanZ*.35,desc.originX,desc.originZ);
        if(lodSeed<.20)pushMatrix(edge,x,z,y,height,widthScale,rot,leanX*.2,leanZ*.2,desc.originX,desc.originZ);
        accepted++;
      }
    }

    const tier=array=>({matrices:new Float32Array(array),count:array.length/16});
    return {
      ...desc,
      tiers:{near:tier(near),mid:tier(mid),far:tier(far),edge:tier(edge)},
      accepted,
      lastUsed:performance.now(),
      mesh:null,
      state:null
    };
  }

  function stateForDistance(distance,previous=null){
    if(previous==='near'&&distance<FOREST.nearDistance+lodHysteresis)return 'near';
    if(previous==='mid'&&distance>FOREST.nearDistance-lodHysteresis&&distance<FOREST.midDistance+lodHysteresis)return 'mid';
    if(previous==='far'&&distance>FOREST.midDistance-lodHysteresis&&distance<edgeDistance+lodHysteresis)return 'far';
    if(previous==='edge'&&distance>edgeDistance-lodHysteresis)return 'edge';
    if(distance<FOREST.nearDistance)return 'near';
    if(distance<FOREST.midDistance)return 'mid';
    if(distance<edgeDistance)return 'far';
    return 'edge';
  }

  function ensureMesh(data,center){
    const {mid,far}=currentAssets();
    if(!mid?.parts?.[0]?.geometry||!far?.parts?.[0]?.geometry)return false;
    const maxCount=Math.max(1,data.tiers.near.count);
    if(!data.mesh){
      const part=mid.parts[0];
      const mesh=new THREE.InstancedMesh(part.geometry,part.material,maxCount);
      mesh.userData.sharedForestGeometry=true;
      mesh.userData.forestChunk=data.key;
      mesh.castShadow=false;
      mesh.receiveShadow=false;
      mesh.frustumCulled=true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.matrixAutoUpdate=false;
      mesh.updateMatrix();
      const group=new THREE.Group();
      group.name=`forest-chunk-${data.key}`;
      group.matrixAutoUpdate=false;
      group.add(mesh);
      data.mesh=mesh;
      data.group=group;
    }
    positionChunkGroup(data);
    updateChunkLod(data,center,true);
    return true;
  }

  function positionChunkGroup(data){
    if(!data.group)return;
    const offset=getWorldOffset()||{x:0,z:0};
    data.group.position.set(
      data.originX-offset.x-(forestGroup.position.x||0),
      0,
      data.originZ-offset.z-(forestGroup.position.z||0)
    );
    data.group.updateMatrix();
  }

  function applyTier(data,state){
    const {mid,far}=currentAssets();
    const mesh=data.mesh;
    if(!mesh||!mid||!far)return;
    const tier=data.tiers[state]||data.tiers.mid;
    const part=(state==='far'||state==='edge'?far:mid).parts[0];
    if(mesh.geometry!==part.geometry)mesh.geometry=part.geometry;
    if(mesh.material!==part.material)mesh.material=part.material;
    const array=mesh.instanceMatrix.array;
    if(tier.matrices.length)array.set(tier.matrices,0);
    mesh.count=tier.count;
    mesh.instanceMatrix.needsUpdate=true;
    if(!mesh.userData.forestBoundsReady){
      mesh.computeBoundingSphere();
      mesh.userData.forestBoundsReady=true;
    }
    data.state=state;
  }

  function updateChunkLod(data,center,force=false){
    const distance=chunkCenterDistance(data,center);
    const next=stateForDistance(distance,data.state);
    if(force||next!==data.state)applyTier(data,next);
    data.lastUsed=performance.now();
  }

  function detach(data){
    if(data?.group?.parent===forestGroup)forestGroup.remove(data.group);
  }

  function attach(data,center){
    if(!ensureMesh(data,center))return false;
    if(data.group.parent!==forestGroup)forestGroup.add(data.group);
    active.set(data.key,data);
    cache.set(data.key,data);
    data.lastUsed=performance.now();
    return true;
  }

  function disposeChunk(data){
    detach(data);
    data?.mesh?.dispose?.();
    data.mesh=null;
    data.group=null;
  }

  function trimCache(){
    if(cache.size<=cacheLimit)return;
    const inactive=[...cache.values()].filter(data=>!active.has(data.key));
    inactive.sort((a,b)=>a.lastUsed-b.lastUsed);
    while(cache.size>cacheLimit&&inactive.length){
      const data=inactive.shift();
      cache.delete(data.key);
      disposeChunk(data);
    }
  }

  function report(){
    let trees=0,near=0,mid=0,far=0,edge=0;
    for(const data of active.values()){
      const count=data.tiers[data.state]?.count||0;
      trees+=count;
      if(data.state==='near')near+=count;
      else if(data.state==='mid')mid+=count;
      else if(data.state==='far')far+=count;
      else edge+=count;
    }
    onStats?.({trees,near,mid,far,edge,chunks:active.size,cached:cache.size,queued:queue.length});
  }

  function maybeResolveInitial(center){
    if(initialResolved)return;
    const readyDistance=FOREST.initialReadyDistance||720;
    const required=requiredChunks(center).filter(chunk=>chunk.priorityDistance<=readyDistance);
    if(required.length&&required.every(chunk=>active.has(chunk.key))){
      initialResolved=true;
      resolveInitialReady?.(true);
    }
  }

  function scheduleIdle(callback){
    if(typeof globalThis.requestIdleCallback==='function'){
      globalThis.requestIdleCallback(callback,{timeout:70});
    }else{
      setTimeout(()=>callback({didTimeout:true,timeRemaining:()=>6}),0);
    }
  }

  function runQueue(){
    if(queueRunning||!queue.length||!assets?.trees?.length)return;
    queueRunning=true;
    const buildSerial=serial;
    const step=deadline=>{
      if(buildSerial!==serial){queueRunning=false;return;}
      let built=0;
      const perSlice=Math.max(1,FOREST.chunkBuildsPerSlice||1);
      while(queue.length&&built<perSlice){
        if(built>0&&!deadline.didTimeout&&deadline.timeRemaining()<2)break;
        // Re-evaluate immediately before every build. If the car moved while the
        // idle queue was running, the nearest missing chunk preempts old work.
        sortQueueByPriority(lastCenter);
        const desc=queue.shift();
        queued.delete(desc.key);
        if(active.has(desc.key)){built++;continue;}
        let data=cache.get(desc.key);
        if(!data){
          data=buildChunkData(desc,buildSerial);
          if(!data){queueRunning=false;return;}
          cache.set(data.key,data);
        }
        const center={...lastCenter};
        attach(data,center);
        built++;
      }
      trimCache();
      report();
      maybeResolveInitial(lastCenter);
      if(queue.length){scheduleIdle(step);return;}
      queueRunning=false;
    };
    scheduleIdle(step);
  }

  function requestUpdate(force=false){
    if(!assets?.trees?.length)return false;
    const offset=getWorldOffset()||{x:0,z:0};
    const center={x:offset.x,z:offset.z};
    const moved=Number.isFinite(lastCenter.x)
      ?Math.hypot(center.x-lastCenter.x,center.z-lastCenter.z)
      :Infinity;
    if(!force&&moved<Math.min(FOREST.cellSize,120)){
      for(const data of active.values())updateChunkLod(data,center,false);
      return false;
    }
    lastCenter=center;

    const required=requiredChunks(center);
    const requiredKeys=new Set(required.map(chunk=>chunk.key));

    for(const [key,data] of active){
      if(requiredKeys.has(key))continue;
      detach(data);
      active.delete(key);
      data.lastUsed=performance.now();
    }

    // Drop queued chunks that are no longer needed. Existing queued descriptors
    // do not retain stale distance priority because sorting is dynamic.
    queue=queue.filter(desc=>{
      if(requiredKeys.has(desc.key))return true;
      queued.delete(desc.key);
      return false;
    });

    for(const desc of required){
      const existing=active.get(desc.key);
      if(existing){updateChunkLod(existing,center,false);continue;}
      const cached=cache.get(desc.key);
      if(cached){attach(cached,center);continue;}
      if(!queued.has(desc.key)){
        queued.set(desc.key,desc);
        queue.push(desc);
      }
    }
    sortQueueByPriority(center);
    trimCache();
    report();
    maybeResolveInitial(center);
    runQueue();
    return true;
  }

  function setAssets(next){
    assets=next;
    requestUpdate(true);
  }

  function refreshVisibleHeights(){
    forestTerrain.invalidate?.();
    const center=Number.isFinite(lastCenter.x)?lastCenter:(getWorldOffset()||{x:0,z:0});
    const refreshDistance=FOREST.heightRefreshDistance||720;
    const removed=[];
    for(const [key,data] of active){
      const d=chunkCenterDistance(data,center);
      if(d>refreshDistance+halfChunkDiagonal)continue;
      detach(data);
      active.delete(key);
      cache.delete(key);
      disposeChunk(data);
      removed.push(chunkDescriptor(data.cx,data.cz));
    }
    if(removed.length){
      const removedKeys=new Set(removed.map(r=>r.key));
      queue=queue.filter(desc=>{
        if(!removedKeys.has(desc.key))return true;
        queued.delete(desc.key);
        return false;
      });
      for(const desc of removed){
        if(queued.has(desc.key))continue;
        queued.set(desc.key,desc);
        queue.push(desc);
      }
      sortQueueByPriority(center);
      runQueue();
    }
  }

  function clearAll(){
    serial++;
    queue=[];
    queued.clear();
    queueRunning=false;
    for(const data of cache.values())disposeChunk(data);
    active.clear();
    cache.clear();
    slopeCache.clear();
    lastCenter={x:NaN,z:NaN};
    forestTerrain.invalidate?.();
  }

  function ensurePolling(){
    if(pollTimer||typeof globalThis.setInterval!=='function')return;
    pollTimer=globalThis.setInterval(()=>requestUpdate(false),FOREST.pollMs||180);
  }

  ensurePolling();

  return Object.freeze({
    setAssets,
    requestUpdate,
    refreshVisibleHeights,
    clearAll,
    whenInitialReady:()=>initialReady,
    stats:()=>({activeChunks:active.size,cachedChunks:cache.size,queuedChunks:queue.length})
  });
}
