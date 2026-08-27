import {createForestTerrainSamplerP912} from './forest-terrain-sampler-p912.js';
import {
  FOREST_STREAMING_POLICY as FOREST,
  forestHash,
  forestDensityNoise
} from './forest-streaming-policy.js';

// Foret P9.35 — frame-budgeted dense forest streamer with travel-ahead priority.
//
// P9.29 remains the frame-budget baseline: candidate evaluation is resumable
// inside a cell, chunk commit gets its own idle slice, status reporting is
// throttled, and InstancedMesh bounds are conservative. P9.31/P9.32 keep those
// CPU limits unchanged and prioritize travel ahead. P9.35 fixes startup bias:
// once a route direction is known, the protected near ring still wins as a
// whole, but its forward chunks are built before lateral/rear chunks.
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
  const totalCells=chunkCells*chunkCells;
  const halfChunkDiagonal=chunkSize*Math.SQRT2*.5;
  const cellHalfDiagonal=FOREST.cellSize*Math.SQRT2*.5;
  const cacheLimit=Math.max(32,FOREST.chunkCacheLimit||96);
  const densityBuckets=Math.max(8,FOREST.densityBuckets||32);
  const candidateBatchSize=Math.max(1,FOREST.candidatesPerBuildSlice||12);
  const sliceBudgetMs=Math.max(.45,FOREST.forestSliceBudgetMs||.95);
  const reportIntervalMs=Math.max(60,FOREST.forestReportIntervalMs||140);
  const nearPriorityDistance=Math.max(560,(FOREST.densityNearFullDistance||500)+80);
  const minAheadLead=Math.max(620,FOREST.forestAheadLeadMin||720);
  const maxAheadLead=Math.max(minAheadLead,FOREST.forestAheadLeadMax||980);

  let assets=null;
  let active=new Map();
  const cache=new Map();
  const queued=new Map();
  let queue=[];
  let queueRunning=false;
  let pollTimer=null;
  let serial=0;
  let lastCenter={x:NaN,z:NaN};
  let wantedKeys=new Set();
  let slopeCache=new Map();
  let initialResolved=false;
  let resolveInitialReady;
  let lastReportAt=-Infinity;
  let travelDir={x:0,z:0};
  let travelConfidence=0;
  let lastRecenterDistance=0;
  let priorityLeadM=0;
  const initialReady=new Promise(resolve=>{resolveInitialReady=resolve;});

  const perf={
    chunksBuilt:0,
    chunksReplaced:0,
    maxSliceMs:0,
    lastSliceMs:0,
    lastSliceAt:0,
    sliceCount:0,
    lastCandidates:0,
    maxCandidates:0,
    densityCountUpdates:0,
    matrixUploads:0,
    lastCommitMs:0,
    maxCommitMs:0,
    lastCommitAt:0,
    manualBounds:true,
    sliceBudgetMs,
    candidateBatchSize,
    aheadPriority:true,
    directionalNearPriority:true,
    nearForwardBonus:.72,
    nearRearPenalty:1.05,
    nearPriorityDistance,
    priorityLeadM:0,
    travelConfidence:0,
    travelDirX:0,
    travelDirZ:0
  };

  const forestTerrain=createForestTerrainSamplerP912({
    THREE,
    forestGroup,
    getWorldOffset,
    fallbackHeight:terrainHeight
  });
  const forestHeight=(x,z)=>forestTerrain.heightAt(x,z);

  function activePart(){
    const trees=assets?.trees||[];
    const tree=trees.find(item=>String(item?.name||'').toLowerCase()==='proxy-mid')||trees[0]||null;
    return tree?.parts?.[0]||null;
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

  function updateTravelDirection(previous,center){
    if(!Number.isFinite(previous?.x)||!Number.isFinite(previous?.z))return false;
    const dx=center.x-previous.x,dz=center.z-previous.z;
    const distance=Math.hypot(dx,dz);
    if(distance<Math.min(FOREST.cellSize,120))return false;
    const ux=dx/distance,uz=dz/distance;
    if(travelConfidence<=0){
      travelDir={x:ux,z:uz};
      travelConfidence=.72;
    }else{
      const blend=.68;
      let x=travelDir.x*(1-blend)+ux*blend;
      let z=travelDir.z*(1-blend)+uz*blend;
      const length=Math.hypot(x,z)||1;
      travelDir={x:x/length,z:z/length};
      travelConfidence=Math.min(1,travelConfidence+.18);
    }
    lastRecenterDistance=distance;
    priorityLeadM=Math.max(
      minAheadLead,
      Math.min(maxAheadLead,distance*1.65)
    );
    perf.priorityLeadM=priorityLeadM;
    perf.travelConfidence=travelConfidence;
    perf.travelDirX=travelDir.x;
    perf.travelDirZ=travelDir.z;
    return true;
  }

  function aheadPriorityCenter(center){
    if(travelConfidence<.25||priorityLeadM<=0)return center;
    return {
      x:center.x+travelDir.x*priorityLeadM,
      z:center.z+travelDir.z*priorityLeadM
    };
  }

  function signedForwardDistance(chunk,center){
    if(travelConfidence<.25)return 0;
    const dx=chunk.centerX-center.x,dz=chunk.centerZ-center.z;
    return dx*travelDir.x+dz*travelDir.z;
  }

  function queuePriority(chunk,center){
    const nearDistance=chunkPriorityDistance(chunk,center);
    const forward=signedForwardDistance(chunk,center);

    // P9.35: the old protected near ring was purely radial, so startup could
    // spend most of its first chunks behind the vehicle even though P9.31 knew
    // the route direction. Keep the entire near ring ahead of distant work, but
    // strongly sort FORWARD chunks first inside that protected ring.
    if(nearDistance<=nearPriorityDistance){
      let score=nearDistance;
      if(travelConfidence>=.25){
        if(forward>=0){
          score-=Math.min(520,forward*perf.nearForwardBonus);
        }else{
          score+=Math.min(760,-forward*perf.nearRearPenalty);
        }
      }
      return {band:0,score,nearDistance,forward};
    }

    const aheadCenter=aheadPriorityCenter(center);
    const aheadDistance=chunkPriorityDistance(chunk,aheadCenter);
    let behindPenalty=0;
    if(travelConfidence>=.25&&forward<0){
      behindPenalty=Math.min(620,-forward*.48);
    }
    return {
      band:1,
      score:aheadDistance+nearDistance*.12+behindPenalty,
      nearDistance,
      forward
    };
  }

  function sortQueueByPriority(center){
    queue.sort((a,b)=>{
      const pa=queuePriority(a,center),pb=queuePriority(b,center);
      if(pa.band!==pb.band)return pa.band-pb.band;
      if(Math.abs(pa.score-pb.score)>.001)return pa.score-pb.score;
      if(!!a.builder!==!!b.builder)return a.builder?-1:1;
      return pa.nearDistance-pb.nearDistance||chunkCenterDistance(a,center)-chunkCenterDistance(b,center);
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

  function smooth01(t){
    const x=Math.max(0,Math.min(1,t));
    return x*x*(3-2*x);
  }

  function densityFractionForDistance(distance){
    const nearFull=FOREST.densityNearFullDistance||500;
    const nearSparse=FOREST.densityNearSparseDistance||760;
    const farFraction=FOREST.farDensityFraction||.55;
    const outerStart=FOREST.outerFadeStart||1540;
    const edgeFraction=FOREST.edgeDensityFraction||.20;
    const outerEnd=FOREST.maxDistance||1750;

    if(distance<=nearFull)return 1;
    if(distance<nearSparse){
      const t=smooth01((distance-nearFull)/Math.max(1,nearSparse-nearFull));
      return 1-(1-farFraction)*t;
    }
    if(distance<=outerStart)return farFraction;
    if(distance<outerEnd){
      const t=smooth01((distance-outerStart)/Math.max(1,outerEnd-outerStart));
      return farFraction-(farFraction-edgeFraction)*t;
    }
    return edgeFraction;
  }

  function densityBand(distance){
    if(distance<=(FOREST.densityNearFullDistance||500))return 'near';
    if(distance<(FOREST.densityNearSparseDistance||760))return 'mid';
    if(distance<(FOREST.outerFadeStart||1540))return 'far';
    return 'edge';
  }

  function cellNearRoad(x,z){
    const nr=nearestRoute(x,z);
    return !!nr&&Number.isFinite(nr.d)&&
      nr.d<=FOREST.roadClearance+cellHalfDiagonal+4;
  }

  function tooCloseToRoadExact(x,z,nearRoadCell){
    if(!nearRoadCell)return false;
    const nr=nearestRoute(x,z);
    return !!nr&&Number.isFinite(nr.d)&&nr.d<FOREST.roadClearance;
  }

  function terrainSlope(x,z){
    const q=FOREST.slopeCacheSize;
    const qx=Math.floor(x/q),qz=Math.floor(z/q),key=`${qx}:${qz}`;
    if(slopeCache.has(key))return slopeCache.get(key);
    const sx=(qx+.5)*q,sz=(qz+.5)*q,d=8;
    const hx=terrainHeight(sx+d,sz)-terrainHeight(sx-d,sz);
    const hz=terrainHeight(sx,sz+d)-terrainHeight(sx,sz-d);
    const slope=Math.hypot(hx,hz)/(d*2);
    slopeCache.set(key,slope);
    if(slopeCache.size>12000){
      const next=new Map();
      let kept=0;
      for(const entry of slopeCache){if((kept++&1)===0)next.set(entry[0],entry[1]);}
      slopeCache=next;
    }
    return slope;
  }

  function densityAt(x,z){
    const noise=forestDensityNoise(x,z);
    return Math.min(1,.42+.72*Math.max(0,Math.min(1,noise)));
  }

  function pushMatrix(list,x,z,y,height,widthScale,rot,originX,originZ){
    const xzScale=height*widthScale;
    const c=Math.cos(rot),s=Math.sin(rot);
    list.push(
      c*xzScale,0,-s*xzScale,0,
      0,height,0,0,
      s*xzScale,0,c*xzScale,0,
      x-originX,y-.28,z-originZ,1
    );
  }

  function createBuilder(desc,buildSerial){
    return {
      desc,
      buildSerial,
      cellIndex:0,
      candidateIndex:0,
      cell:null,
      accepted:0,
      buckets:Array.from({length:densityBuckets},()=>[])
    };
  }

  function beginBuilderCell(builder){
    if(builder.cellIndex>=totalCells)return false;
    const index=builder.cellIndex;
    const sx=Math.floor(index/chunkCells);
    const sz=index%chunkCells;
    const cellCx=builder.desc.cx*chunkCells+sx;
    const cellCz=builder.desc.cz*chunkCells+sz;
    const cellX=(cellCx+.5)*FOREST.cellSize;
    const cellZ=(cellCz+.5)*FOREST.cellSize;
    builder.candidateIndex=0;
    builder.cell={
      cellCx,
      cellCz,
      nearRoadCell:cellNearRoad(cellX,cellZ),
      baseDensity:densityAt(cellX,cellZ)
    };
    return true;
  }

  function advanceBuilderCandidate(builder){
    builder.candidateIndex++;
    if(builder.candidateIndex>=FOREST.candidatesPerCell){
      builder.cellIndex++;
      builder.candidateIndex=0;
      builder.cell=null;
    }
    return builder.cellIndex>=totalCells;
  }

  function processBuilderCandidate(builder){
    if(builder.buildSerial!==serial)return true;
    if(!builder.cell&&!beginBuilderCell(builder))return true;

    const {cellCx,cellCz,nearRoadCell,baseDensity}=builder.cell;
    const i=builder.candidateIndex;
    const rx=forestHash(cellCx,cellCz,17+i*7919);
    const rz=forestHash(cellCx,cellCz,31+i*104729);
    const x=(cellCx+rx)*FOREST.cellSize;
    const z=(cellCz+rz)*FOREST.cellSize;
    const slope=terrainSlope(x,z);
    if(slope>FOREST.maxSlope)return advanceBuilderCandidate(builder);

    let keep=baseDensity;
    if(slope>.82)keep*=.72;
    const keepSeed=forestHash(cellCx,cellCz,(0x51f15e+Math.imul(i,0x9e3779b1))|0);
    if(keepSeed>keep)return advanceBuilderCandidate(builder);
    if(tooCloseToRoadExact(x,z,nearRoadCell))return advanceBuilderCandidate(builder);
    if(isWaterAt(x,z,8))return advanceBuilderCandidate(builder);
    if(blocksForest(x,z))return advanceBuilderCandidate(builder);

    const height=8.2+forestHash(cellCx,cellCz,0x191+i*1013)*9.6;
    const widthScale=.78+forestHash(cellCx,cellCz,0x2b7+i*2029)*.42;
    const rot=forestHash(cellCx,cellCz,0x391+i*4093)*Math.PI*2;
    const y=forestHeight(x,z);
    const rank=forestHash(cellCx,cellCz,(0x73a2d1+Math.imul(i,2246822519))|0);
    const bucket=Math.min(densityBuckets-1,Math.floor(rank*densityBuckets));
    pushMatrix(
      builder.buckets[bucket],x,z,y,height,widthScale,rot,
      builder.desc.originX,builder.desc.originZ
    );
    builder.accepted++;
    return advanceBuilderCandidate(builder);
  }

  function finalizeBuilder(builder){
    let floats=0;
    for(const bucket of builder.buckets)floats+=bucket.length;
    const matrices=new Float32Array(floats);
    let cursor=0;
    for(const bucket of builder.buckets){
      if(bucket.length){matrices.set(bucket,cursor);cursor+=bucket.length;}
    }
    return {
      ...builder.desc,
      matrices,
      maxCount:Math.floor(floats/16),
      accepted:builder.accepted,
      lastUsed:performance.now(),
      mesh:null,
      group:null,
      visibleCount:0,
      state:null
    };
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

  function updateChunkDensity(data,center,force=false){
    if(!data.mesh)return;
    const distance=chunkPriorityDistance(data,center);
    const fraction=densityFractionForDistance(distance);
    const count=Math.max(0,Math.min(data.maxCount,Math.round(data.maxCount*fraction)));
    if(force||count!==data.visibleCount){
      data.mesh.count=count;
      data.visibleCount=count;
      perf.densityCountUpdates++;
    }
    data.state=densityBand(distance);
    data.lastUsed=performance.now();
  }

  function installConservativeBounds(mesh){
    if(!THREE.Vector3)return false;
    mesh.boundingSphere={
      center:new THREE.Vector3(chunkSize*.5,12,chunkSize*.5),
      radius:halfChunkDiagonal+40
    };
    return true;
  }

  function ensureMesh(data,center){
    const part=activePart();
    if(!part?.geometry||!part?.material)return false;
    if(!data.mesh){
      const capacity=Math.max(1,data.maxCount);
      const mesh=new THREE.InstancedMesh(part.geometry,part.material,capacity);
      mesh.userData.sharedForestGeometry=true;
      mesh.userData.forestChunk=data.key;
      mesh.castShadow=false;
      mesh.receiveShadow=false;
      mesh.frustumCulled=true;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      if(data.matrices.length)mesh.instanceMatrix.array.set(data.matrices,0);
      mesh.count=data.maxCount;
      mesh.instanceMatrix.needsUpdate=true;
      perf.matrixUploads++;
      if(!installConservativeBounds(mesh))mesh.computeBoundingSphere?.();
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
    updateChunkDensity(data,center,true);
    return true;
  }

  function detach(data){
    if(data?.group?.parent===forestGroup)forestGroup.remove(data.group);
  }

  function disposeChunk(data){
    detach(data);
    data?.mesh?.dispose?.();
    data.mesh=null;
    data.group=null;
  }

  function attach(data,center){
    if(!ensureMesh(data,center))return false;
    if(data.group.parent!==forestGroup)forestGroup.add(data.group);
    active.set(data.key,data);
    cache.set(data.key,data);
    data.lastUsed=performance.now();
    return true;
  }

  function replaceActive(oldData,newData,center){
    if(!ensureMesh(newData,center))return false;
    if(newData.group.parent!==forestGroup)forestGroup.add(newData.group);
    active.set(newData.key,newData);
    cache.set(newData.key,newData);
    if(oldData&&oldData!==newData)disposeChunk(oldData);
    newData.lastUsed=performance.now();
    perf.chunksReplaced++;
    return true;
  }

  function trimCache(){
    if(cache.size<=cacheLimit)return;
    const inactive=[...cache.values()].filter(data=>!active.has(data.key));
    inactive.sort((a,b)=>a.lastUsed-b.lastUsed);
    let disposed=0;
    while(cache.size>cacheLimit&&inactive.length&&disposed<4){
      const data=inactive.shift();
      cache.delete(data.key);
      disposeChunk(data);
      disposed++;
    }
  }

  function report(force=false){
    const now=performance.now();
    if(!force&&now-lastReportAt<reportIntervalMs)return false;
    lastReportAt=now;
    let trees=0,near=0,mid=0,far=0,edge=0;
    for(const data of active.values()){
      const count=data.visibleCount||0;
      trees+=count;
      if(data.state==='near')near+=count;
      else if(data.state==='mid')mid+=count;
      else if(data.state==='far')far+=count;
      else edge+=count;
    }
    onStats?.({
      trees,near,mid,far,edge,
      chunks:active.size,cached:cache.size,queued:queue.length,
      maxForestSliceMs:perf.maxSliceMs
    });
    return true;
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
      globalThis.requestIdleCallback(callback,{timeout:90});
    }else{
      setTimeout(()=>callback({didTimeout:true,timeRemaining:()=>5}),0);
    }
  }

  function queueJob(desc,{replace=false}={}){
    const existing=queued.get(desc.key);
    if(existing){
      if(replace)existing.replace=true;
      return existing;
    }
    const job={...desc,replace,builder:null,readyToCommit:false};
    queued.set(job.key,job);
    queue.push(job);
    return job;
  }

  function finishJob(job,data){
    const old=cache.get(job.key)||active.get(job.key)||null;
    const wanted=wantedKeys.has(job.key);

    if(job.replace){
      if(wanted&&active.has(job.key)){
        replaceActive(active.get(job.key),data,lastCenter);
      }else{
        if(old&&old!==data)disposeChunk(old);
        cache.set(job.key,data);
        if(wanted)attach(data,lastCenter);
      }
    }else if(wanted){
      attach(data,lastCenter);
    }else{
      cache.set(job.key,data);
    }
    perf.chunksBuilt++;
  }

  function recordSlice(sliceStart,candidates=0){
    const ended=performance.now();
    const elapsed=ended-sliceStart;
    perf.lastSliceMs=elapsed;
    perf.lastSliceAt=ended;
    perf.maxSliceMs=Math.max(perf.maxSliceMs,elapsed);
    perf.sliceCount++;
    perf.lastCandidates=candidates;
    perf.maxCandidates=Math.max(perf.maxCandidates,candidates);
  }

  function runQueue(){
    if(queueRunning||!queue.length||!assets?.trees?.length)return;
    queueRunning=true;

    const step=deadline=>{
      const sliceStart=performance.now();
      if(!queue.length){queueRunning=false;report(true);return;}
      sortQueueByPriority(lastCenter);
      const job=queue[0];
      let candidates=0;

      if(!wantedKeys.has(job.key)&&!job.replace){
        queue.shift();queued.delete(job.key);
      }else if(!job.replace&&active.has(job.key)){
        queue.shift();queued.delete(job.key);
      }else if(!job.replace&&cache.has(job.key)){
        queue.shift();queued.delete(job.key);
        if(wantedKeys.has(job.key))attach(cache.get(job.key),lastCenter);
      }else if(job.readyToCommit){
        const commitStarted=performance.now();
        const data=finalizeBuilder(job.builder);
        queue.shift();queued.delete(job.key);
        finishJob(job,data);
        const commitEnded=performance.now();
        perf.lastCommitMs=commitEnded-commitStarted;
        perf.lastCommitAt=commitEnded;
        perf.maxCommitMs=Math.max(perf.maxCommitMs,perf.lastCommitMs);
      }else{
        if(!job.builder)job.builder=createBuilder(job,serial);
        if(job.builder.buildSerial!==serial){
          job.builder=createBuilder(job,serial);
          job.readyToCommit=false;
        }

        const stopAt=sliceStart+sliceBudgetMs;
        while(job.builder.cellIndex<totalCells&&candidates<candidateBatchSize){
          if(candidates>0){
            if(performance.now()>=stopAt)break;
            if(!deadline.didTimeout&&deadline.timeRemaining()<.35)break;
          }
          processBuilderCandidate(job.builder);
          candidates++;
        }
        if(job.builder.cellIndex>=totalCells){
          job.readyToCommit=true;
        }
      }

      trimCache();
      report(false);
      maybeResolveInitial(lastCenter);
      recordSlice(sliceStart,candidates);

      if(queue.length){scheduleIdle(step);return;}
      queueRunning=false;
      report(true);
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
      for(const data of active.values()){
        positionChunkGroup(data);
        updateChunkDensity(data,center,false);
      }
      return false;
    }

    updateTravelDirection(lastCenter,center);
    lastCenter=center;

    const required=requiredChunks(center);
    wantedKeys=new Set(required.map(chunk=>chunk.key));

    for(const [key,data] of active){
      if(wantedKeys.has(key))continue;
      detach(data);
      active.delete(key);
      data.lastUsed=performance.now();
    }

    queue=queue.filter(job=>{
      if(wantedKeys.has(job.key))return true;
      queued.delete(job.key);
      return false;
    });

    for(const desc of required){
      const existing=active.get(desc.key);
      if(existing){
        positionChunkGroup(existing);
        updateChunkDensity(existing,center,false);
        continue;
      }
      const cached=cache.get(desc.key);
      if(cached){attach(cached,center);continue;}
      queueJob(desc);
    }

    sortQueueByPriority(center);
    trimCache();
    report(true);
    maybeResolveInitial(center);
    runQueue();
    return true;
  }

  function setAssets(next){
    assets=next;
    requestUpdate(true);
  }

  function refreshVisibleHeights(){
    serial++;
    for(const job of queue){job.builder=null;job.readyToCommit=false;}
    forestTerrain.invalidate?.();
    slopeCache.clear();
    const center=Number.isFinite(lastCenter.x)?lastCenter:(getWorldOffset()||{x:0,z:0});
    const refreshDistance=FOREST.heightRefreshDistance||520;
    let replacements=0;

    for(const data of active.values()){
      const d=chunkCenterDistance(data,center);
      if(d>refreshDistance+halfChunkDiagonal)continue;
      queueJob(chunkDescriptor(data.cx,data.cz),{replace:true});
      replacements++;
    }
    sortQueueByPriority(center);
    runQueue();
    return replacements;
  }

  function clearAll(){
    serial++;
    queue=[];
    queued.clear();
    queueRunning=false;
    wantedKeys.clear();
    for(const data of cache.values())disposeChunk(data);
    active.clear();
    cache.clear();
    slopeCache.clear();
    lastCenter={x:NaN,z:NaN};
    travelDir={x:0,z:0};
    travelConfidence=0;
    lastRecenterDistance=0;
    priorityLeadM=0;
    perf.priorityLeadM=0;
    perf.travelConfidence=0;
    perf.travelDirX=0;
    perf.travelDirZ=0;
    forestTerrain.invalidate?.();
    report(true);
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
    stats:()=>({
      activeChunks:active.size,
      cachedChunks:cache.size,
      queuedChunks:queue.length,
      ...perf
    })
  });
}
