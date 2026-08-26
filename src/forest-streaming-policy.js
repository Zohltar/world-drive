export const FOREST_STREAMING_POLICY=Object.freeze({
  cellSize:120,

  // P9.11+ dense low-definition profile. Every visible tree uses the approved
  // 68-triangle proxy, so 200 deterministic candidates per 120 m cell stays the
  // visual density baseline while P9.12 focuses on transition smoothness.
  candidatesPerCell:200,

  // Legacy LOD thresholds remain exported for QA/backward compatibility. P9.12
  // no longer swaps geometry at these boundaries; density is continuous instead.
  nearDistance:560,
  midDistance:560,
  maxDistance:1750,
  outerFadeStart:1540,
  sectors:8,
  refreshDistance:240,
  pollMs:180,

  // P9.12 continuous density profile. Chunk instance buffers are ordered once by
  // deterministic density rank, then mesh.count changes gradually with distance.
  // This removes GPU matrix uploads and abrupt population jumps on the road.
  densityNearFullDistance:500,
  densityNearSparseDistance:760,
  farDensityFraction:.55,
  edgeDensityFraction:.20,
  densityBuckets:32,

  // The visible road-terrain transition reaches 30.5 m from route centre. Keep
  // tree roots outside it so roadside trees cannot intersect the separate ribbon.
  roadClearance:32,

  slopeCacheSize:44,
  maxSlope:1.28,
  densityNoiseScale:420,
  cellsPerSlice:30,

  // Persistent 480 m chunks. P9.12 builds only two 120 m cells per idle slice,
  // bounding each background CPU burst to at most 400 candidate evaluations.
  chunkCells:4,
  chunkCacheLimit:96,
  chunkBuildsPerSlice:1,
  cellsPerBuildSlice:2,
  chunkLodHysteresis:80,
  initialReadyDistance:720,

  // Only the road-critical inner ring is refreshed after a terrain/road rebuild.
  // Replacement is double-buffered, so the old forest remains visible until the
  // corrected chunk is ready.
  heightRefreshDistance:520
});

function mix32(value){
  let x=value>>>0;
  x^=x>>>16;
  x=Math.imul(x,0x7feb352d)>>>0;
  x^=x>>>15;
  x=Math.imul(x,0x846ca68b)>>>0;
  x^=x>>>16;
  return x>>>0;
}

export function forestHash(ix,iz,salt=0){
  const a=Math.imul(ix|0,73856093);
  const b=Math.imul(iz|0,19349663);
  return mix32((a^b^(salt|0))>>>0)/4294967296;
}

function smooth01(t){return t*t*(3-2*t);}

export function forestDensityNoise(x,z,scale=FOREST_STREAMING_POLICY.densityNoiseScale){
  const fx=x/scale,fz=z/scale;
  const ix=Math.floor(fx),iz=Math.floor(fz);
  const tx=smooth01(fx-ix),tz=smooth01(fz-iz);
  const a=forestHash(ix,iz,0x2f6e2b1d);
  const b=forestHash(ix+1,iz,0x2f6e2b1d);
  const c=forestHash(ix,iz+1,0x2f6e2b1d);
  const d=forestHash(ix+1,iz+1,0x2f6e2b1d);
  const top=a+(b-a)*tx;
  const bottom=c+(d-c)*tx;
  return top+(bottom-top)*tz;
}

export function forestLodForDistance(distance,policy=FOREST_STREAMING_POLICY){
  if(distance<policy.nearDistance)return 0;
  if(distance<policy.midDistance)return 1;
  if(distance<policy.maxDistance)return 2;
  return -1;
}

export function forestKeepProbability(distance,densityNoise,policy=FOREST_STREAMING_POLICY){
  const density=.55+.60*Math.max(0,Math.min(1,densityNoise));
  const lod=forestLodForDistance(distance,policy);
  if(lod<0)return 0;
  if(lod===0)return Math.min(1,density);
  if(lod===1)return Math.min(1,density*.88);
  let fade=1;
  if(distance>policy.outerFadeStart){
    fade=Math.max(0,Math.min(1,(policy.maxDistance-distance)/(policy.maxDistance-policy.outerFadeStart)));
  }
  return Math.min(1,density*.55*fade);
}

export function forestSectorForOffset(dx,dz,sectors=FOREST_STREAMING_POLICY.sectors){
  const normalized=(Math.atan2(dz,dx)+Math.PI)/(Math.PI*2);
  return Math.min(sectors-1,Math.max(0,Math.floor(normalized*sectors)));
}

export function forestCellRange(centerX,centerZ,policy=FOREST_STREAMING_POLICY){
  const minX=Math.floor((centerX-policy.maxDistance)/policy.cellSize)-1;
  const maxX=Math.floor((centerX+policy.maxDistance)/policy.cellSize)+1;
  const minZ=Math.floor((centerZ-policy.maxDistance)/policy.cellSize)-1;
  const maxZ=Math.floor((centerZ+policy.maxDistance)/policy.cellSize)+1;
  const halfDiagonal=policy.cellSize*Math.SQRT2*.5;
  const cells=[];
  for(let cx=minX;cx<=maxX;cx++)for(let cz=minZ;cz<=maxZ;cz++){
    const x=(cx+.5)*policy.cellSize,z=(cz+.5)*policy.cellSize;
    const d=Math.hypot(x-centerX,z-centerZ);
    if(d<=policy.maxDistance+halfDiagonal)cells.push({cx,cz,x,z,d});
  }
  cells.sort((a,b)=>a.d-b.d);
  return cells;
}
