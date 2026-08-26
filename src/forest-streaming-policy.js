export const FOREST_STREAMING_POLICY=Object.freeze({
  cellSize:120,

  // P9.8 spends part of the large P9.7 GPU win on forest volume. The optimized
  // 592-triangle near tree leaves enough headroom to raise candidate density by
  // ~67% while keeping the persistent chunk architecture unchanged.
  candidatesPerCell:50,

  // P9.3 hybrid GPU profile. The detailed tree is kept only while a chunk is
  // genuinely near the driver. Beyond this band, the streamer swaps to the
  // approved 68-triangle proxy. nearDistance===midDistance deliberately removes
  // the old medium HD tier; hysteresis in the chunk streamer makes the switch
  // occur around ~480 m approaching / ~640 m leaving, avoiding visible chatter.
  nearDistance:560,
  midDistance:560,
  maxDistance:1750,
  outerFadeStart:1540,
  sectors:8,
  refreshDistance:240,
  pollMs:180,

  // P9.4 roadside anchoring guard. The visible road-terrain transition in
  // terrain.js extends to terrainCutHalfWidth 16.5 + blendWidth 14.0 = 30.5 m.
  // Trees inside that ribbon are anchored to the main terrain mesh while the
  // ribbon itself can sit at a different elevation, which makes trunks appear
  // buried or floating beside the road. Keep tree roots just outside the full
  // transition footprint plus a small visual safety margin.
  roadClearance:32,

  slopeCacheSize:44,
  maxSlope:1.28,
  densityNoiseScale:420,
  cellsPerSlice:30,

  // P9 persistent chunk streaming. Four deterministic 120 m cells per axis
  // gives 480 m chunks: few enough draw calls for WebGL, but small enough that
  // only a handful of chunks enter/leave while driving.
  chunkCells:4,
  chunkCacheLimit:96,
  chunkBuildsPerSlice:1,
  chunkLodHysteresis:80,
  initialReadyDistance:720,
  heightRefreshDistance:720
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
