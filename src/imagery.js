// World Drive P9.18 imagery entry point.
// Keeps P9.17's fast rendered-ground sampler and makes route-ahead warming much
// cheaper: background probes fetch only the centre slippy tile instead of a 3x3
// block. Visible satellite chunks still compose their full 3x3 imagery, so this
// changes loading pressure only, not rendered image quality.
import {createImageryService as createImageryServiceP913} from './imagery/imagery-p913.js';

export function createImageryService(options){
  const originalTerrainSample=options?.sampleTerrainHeight;
  let groundMesh=null;
  let cachedPositionAttribute=null;
  let cachedCols=0;
  let cachedSegments=0;
  let fastGroundSamples=0;
  let roadVisualSamples=0;
  let fallbackGroundSamples=0;

  function resolveGroundMesh(){
    if(groundMesh?.geometry?.attributes?.position)return groundMesh;
    groundMesh=null;
    options?.scene?.traverse?.(object=>{
      if(groundMesh)return;
      if(
        object?.isMesh&&
        object.material===options?.groundMaterial&&
        object.geometry?.attributes?.position
      )groundMesh=object;
    });
    return groundMesh;
  }

  function refreshGridMetadata(positions){
    if(positions===cachedPositionAttribute)return;
    cachedPositionAttribute=positions;
    const count=positions?.count||0;
    const cols=Math.round(Math.sqrt(count));
    if(cols>1&&cols*cols===count){
      cachedCols=cols;
      cachedSegments=cols-1;
    }else{
      cachedCols=0;
      cachedSegments=0;
    }
  }

  function fastRenderedGroundHeight(absx,absz){
    // Terrain R2: the coarse ground mesh intentionally contains a wider hidden
    // safety excavation than the visible road earthwork. Near roads, sample the
    // authoritative refined surface so satellite geometry cannot sit underneath
    // and expose a green procedural wedge. Everywhere else retain the fast grid.
    const roadVisual=options?.sampleRoadVisualHeight?.(absx,absz);
    if(Number.isFinite(roadVisual)){
      roadVisualSamples++;
      return roadVisual;
    }

    const mesh=resolveGroundMesh();
    const positions=mesh?.geometry?.attributes?.position;
    refreshGridMetadata(positions);

    const size=Number(options?.groundSize)||0;
    const worldOffset=options?.getWorldOffset?.();
    let centerX=NaN,centerZ=NaN;
    if(worldOffset&&Number.isFinite(worldOffset.x)&&Number.isFinite(worldOffset.z)){
      centerX=worldOffset.x+(Number(mesh?.position?.x)||0);
      centerZ=worldOffset.z+(Number(mesh?.position?.z)||0);
    }else{
      const center=options?.getGroundCenter?.();
      centerX=center?.x;
      centerZ=center?.z;
    }

    // Before the first real terrain rebuild, main.js still owns an unrotated
    // PlaneGeometry through mesh.rotation.x=-PI/2. Its position.y values are
    // plane coordinates, not terrain height; use the authoritative fallback
    // until rebuildGround() rotates geometry into X/Z and resets mesh rotation.
    const meshStillRotated=Math.abs(Number(mesh?.rotation?.x)||0)>.01;

    if(
      !positions||
      cachedSegments<1||
      !(size>0)||
      meshStillRotated||
      !Number.isFinite(centerX)||
      !Number.isFinite(centerZ)
    ){
      fallbackGroundSamples++;
      return originalTerrainSample?.(absx,absz)??0;
    }

    const half=size*.5;
    const lx=absx-centerX;
    const lz=absz-centerZ;
    if(lx<-half||lx>half||lz<-half||lz>half){
      fallbackGroundSamples++;
      return originalTerrainSample?.(absx,absz)??0;
    }

    const segments=cachedSegments;
    const cols=cachedCols;
    const gx=(lx+half)/size*segments;
    const gz=(lz+half)/size*segments;
    const ix=Math.max(0,Math.min(segments-1,Math.floor(gx)));
    const iz=Math.max(0,Math.min(segments-1,Math.floor(gz)));
    const fx=Math.max(0,Math.min(1,gx-ix));
    const fz=Math.max(0,Math.min(1,gz-iz));
    const array=positions.array;
    const stride=positions.itemSize||3;

    const i00=(iz*cols+ix)*stride+1;
    const i10=(iz*cols+ix+1)*stride+1;
    const i01=((iz+1)*cols+ix)*stride+1;
    const i11=((iz+1)*cols+ix+1)*stride+1;
    const h00=array[i00];
    const h10=array[i10];
    const h01=array[i01];
    const h11=array[i11];
    fastGroundSamples++;

    // THREE.PlaneGeometry triangulates each cell across the diagonal joining
    // (x0,z1) to (x1,z0). Match that exact triangle interpolation so satellite
    // geometry lies on the visible terrain rather than merely bilinear-fitting it.
    if(fx+fz<=1){
      return h00+fx*(h10-h00)+fz*(h01-h00);
    }
    return h11+(1-fx)*(h01-h11)+(1-fz)*(h10-h11);
  }

  const service=createImageryServiceP913({
    ...options,
    sampleTerrainHeight:fastRenderedGroundHeight
  });
  const baseDiagnostics=service.diagnostics?.bind(service);
  const baseInvalidateGeometry=service.invalidateGeometry?.bind(service);

  // R8.1 diagnostics only: observe the already-existing P9.13 sequential
  // satellite geometry resampling without changing its queue, commit guard,
  // chunk order, quality, or timing policy. Geometry object identity is enough
  // to tell when each visible mesh has been resampled.
  const GEOMETRY_REFRESH_MONITOR_MS=120;
  let geometryRefreshGeneration=0;
  let geometryRefreshRuns=0;
  let geometryRefreshActiveJobs=0;
  let geometryRefreshTotalChunks=0;
  let geometryRefreshCompletedChunks=0;
  let geometryRefreshPendingChunks=0;
  let geometryRefreshLastStartedAt=null;
  let geometryRefreshLastCompletedAt=null;
  let geometryRefreshLastDurationMs=0;
  let geometryRefreshMaxDurationMs=0;
  let geometryRefreshLastReason=null;

  const roundMs=value=>Number.isFinite(value)?Number(value.toFixed(3)):null;

  function visibleGeometrySnapshot(){
    const group=service.group;
    const children=Array.isArray(group?.children)?group.children:[];
    return children
      .filter(mesh=>mesh?.geometry)
      .map(mesh=>({mesh,geometry:mesh.geometry}));
  }

  function geometryRefreshCompleted(snapshot){
    let completed=0;
    for(const item of snapshot){
      if(item.mesh?.parent!==service.group||item.mesh?.geometry!==item.geometry)completed++;
    }
    return completed;
  }

  function finishGeometryRefresh(job,completed){
    if(job.finished)return;
    job.finished=true;
    geometryRefreshActiveJobs=Math.max(0,geometryRefreshActiveJobs-1);
    if(job.id!==geometryRefreshGeneration)return;
    const endedAt=performance.now();
    const duration=endedAt-job.startedAt;
    geometryRefreshCompletedChunks=Math.min(job.total,Math.max(0,completed));
    geometryRefreshPendingChunks=Math.max(0,job.total-geometryRefreshCompletedChunks);
    geometryRefreshLastCompletedAt=endedAt;
    geometryRefreshLastDurationMs=duration;
    geometryRefreshMaxDurationMs=Math.max(geometryRefreshMaxDurationMs,duration);
  }

  function monitorGeometryRefresh(job){
    const sample=()=>{
      if(job.finished)return;
      const completed=geometryRefreshCompleted(job.snapshot);
      if(job.id===geometryRefreshGeneration){
        geometryRefreshCompletedChunks=completed;
        geometryRefreshPendingChunks=Math.max(0,job.total-completed);
      }
      if(completed>=job.total){
        finishGeometryRefresh(job,completed);
        return;
      }
      setTimeout(sample,GEOMETRY_REFRESH_MONITOR_MS);
    };
    sample();
  }

  service.invalidateGeometry=(reason='terrain-commit')=>{
    const snapshot=visibleGeometrySnapshot();
    const startedAt=performance.now();
    const id=++geometryRefreshGeneration;
    geometryRefreshRuns++;
    geometryRefreshActiveJobs++;
    geometryRefreshTotalChunks=snapshot.length;
    geometryRefreshCompletedChunks=0;
    geometryRefreshPendingChunks=snapshot.length;
    geometryRefreshLastStartedAt=startedAt;
    geometryRefreshLastCompletedAt=null;
    geometryRefreshLastDurationMs=0;
    geometryRefreshLastReason=String(reason||'terrain-commit');

    baseInvalidateGeometry?.();

    const job={
      id,
      snapshot,
      total:snapshot.length,
      startedAt,
      finished:false
    };
    monitorGeometryRefresh(job);
    return undefined;
  };

  let prefetchBusy=false;
  let lastPrefetchAt=-Infinity;
  let lastPrefetchX=Infinity;
  let lastPrefetchZ=Infinity;
  let prefetchStarted=0;
  let prefetchSkipped=0;
  let prefetchTilesRequested=0;

  const PREFETCH_COOLDOWN_MS=420;
  const PREFETCH_NEAR_DUPLICATE_M=700;
  const PREFETCH_ZOOM=Math.max(0,Math.floor(Number(options?.zoom)||16));

  function centreTileForWorld(absx,absz){
    const ll=options?.toLatLon?.(absx,absz);
    if(!ll||!Number.isFinite(ll.lat)||!Number.isFinite(ll.lon))return null;
    const n=2**PREFETCH_ZOOM;
    const safeLat=Math.max(-85.05112878,Math.min(85.05112878,ll.lat));
    const latRad=safeLat*Math.PI/180;
    return {
      x:Math.floor((ll.lon+180)/360*n),
      y:Math.floor((1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n)
    };
  }

  service.prefetchAt=async(absx,absz)=>{
    const now=performance.now();
    const nearPrevious=Math.hypot(
      absx-lastPrefetchX,
      absz-lastPrefetchZ
    )<PREFETCH_NEAR_DUPLICATE_M;

    if(
      prefetchBusy||
      now-lastPrefetchAt<PREFETCH_COOLDOWN_MS||
      nearPrevious
    ){
      prefetchSkipped++;
      return false;
    }

    const tile=centreTileForWorld(absx,absz);
    if(!tile){
      prefetchSkipped++;
      return false;
    }

    prefetchBusy=true;
    lastPrefetchAt=now;
    lastPrefetchX=absx;
    lastPrefetchZ=absz;
    prefetchStarted++;
    prefetchTilesRequested++;

    try{
      await service.loadTile(tile.x,tile.y).catch(()=>null);
      return true;
    }finally{
      prefetchBusy=false;
    }
  };

  service.diagnostics=()=>({
    ...(baseDiagnostics?.()||{}),
    p917FastGroundSamples:fastGroundSamples,
    terrainR2RoadVisualSamples:roadVisualSamples,
    p917FallbackGroundSamples:fallbackGroundSamples,
    p917PrefetchBusy:prefetchBusy,
    p917PrefetchStarted:prefetchStarted,
    p917PrefetchSkipped:prefetchSkipped,
    p917PrefetchCooldownMs:PREFETCH_COOLDOWN_MS,
    p918PrefetchTilesPerProbe:1,
    p918PrefetchTilesRequested:prefetchTilesRequested,
    r8GeometryRefresh:{
      generation:geometryRefreshGeneration,
      runs:geometryRefreshRuns,
      active:geometryRefreshActiveJobs>0,
      activeJobs:geometryRefreshActiveJobs,
      totalChunks:geometryRefreshTotalChunks,
      completedChunks:geometryRefreshCompletedChunks,
      pendingChunks:geometryRefreshPendingChunks,
      lastStartedAt:roundMs(geometryRefreshLastStartedAt),
      lastCompletedAt:roundMs(geometryRefreshLastCompletedAt),
      lastDurationMs:roundMs(geometryRefreshLastDurationMs)??0,
      maxDurationMs:roundMs(geometryRefreshMaxDurationMs)??0,
      lastReason:geometryRefreshLastReason,
      monitorIntervalMs:GEOMETRY_REFRESH_MONITOR_MS
    }
  });

  return service;
}