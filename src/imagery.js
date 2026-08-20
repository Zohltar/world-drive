// World Drive V21.22.6 - chunked satellite imagery service
//
// The legacy renderer composed one small slippy-map mosaic and mapped it over
// the entire local terrain with ClampToEdgeWrapping. Once the high-detail
// terrain grew to 5.6 km, areas outside the true mosaic bounds sampled the
// mosaic edge forever, producing kilometre-long green/tan streaks.
//
// This service never stretches imagery outside its geographic bounds. Satellite
// data is rendered as independent, georeferenced 3x3-tile chunks. Missing chunks
// simply reveal the terrain's procedural/DEM underlay until their tiles arrive.
// Chunk composition is serialized and committed during idle time to preserve the
// V21.22.3 hitch-free frame pacing.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function idleTurn(timeout=700){
  return new Promise(resolve=>{
    if(typeof globalThis.requestIdleCallback==='function'){
      globalThis.requestIdleCallback(()=>resolve(),{timeout});
    }else{
      setTimeout(resolve,0);
    }
  });
}

export function createImageryService({
  THREE,
  renderer,
  cache=null,
  groundMaterial,
  statusEl=null,
  toggleButton=null,
  toLatLon,
  toWorld,
  getWorldOffset,
  getGroundCenter=null,
  sampleTerrainHeight=null,
  scene=null,
  zoom=16,
  groundSize=3200,
  chunkTiles=3,
  chunkSegments=24,
  maxVisibleChunks=42
}={}){
  if(!THREE)throw new Error('Imagery requires THREE');
  if(!groundMaterial)throw new Error('Imagery requires groundMaterial');
  if(typeof toLatLon!=='function'||typeof toWorld!=='function'){
    throw new Error('Imagery requires coordinate converters');
  }
  if(typeof getWorldOffset!=='function'){
    throw new Error('Imagery requires getWorldOffset()');
  }

  const Z=Math.max(0,Math.floor(zoom));
  const CHUNK_TILES=Math.max(1,Math.floor(chunkTiles));
  const CHUNK_SEGMENTS=Math.max(6,Math.floor(chunkSegments));
  const MAX_VISIBLE=Math.max(12,Math.floor(maxVisibleChunks));
  const tileCache=new Map();
  const tilePending=new Map();
  const chunks=new Map();
  const chunkPending=new Map();
  const queue=[];
  const queuedKeys=new Set();
  const waiters=new Map();
  const chunkGroup=new THREE.Group();
  chunkGroup.name='satellite-terrain-chunks';
  // Render before every procedural terrain layer so stencil ref 2 exists
  // before the DEM/horizon materials test it.
  chunkGroup.renderOrder=-10;
  scene?.add?.(chunkGroup);

  let enabled=true;
  let generation=0;
  let activeBuilds=0;
  let lastCenter={x:Infinity,z:Infinity};
  let requiredKeys=new Set();
  let lastRequiredSpecs=[];
  let currentPriority={x:0,z:0};
  let destroyed=false;

  function setStatus(text){
    if(statusEl)statusEl.textContent=text;
  }

  function lonLatToSlippy(lon,lat,z=Z){
    const n=2**z;
    const safeLat=clamp(lat,-85.05112878,85.05112878);
    const latRad=safeLat*Math.PI/180;
    return {
      x:(lon+180)/360*n,
      y:(1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n
    };
  }

  function slippyToLonLat(x,y,z=Z){
    const n=2**z;
    return {
      lon:x/n*360-180,
      lat:Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI
    };
  }

  const tileKey=(x,y)=>`${Z}/${x}/${y}`;
  const chunkKey=(cx,cy)=>`${Z}/${cx}/${cy}`;

  function cacheGet(map,key){
    try{
      const value=cache?.get?.(map,key);
      if(value!==undefined&&value!==null)return value;
    }catch{}
    return map.get(key)??null;
  }

  function cachePut(map,key,value){
    map.set(key,value);
    try{cache?.touch?.(map,key,value);}catch{}
    try{
      const limit=cache?.limits?.imagery;
      if(limit)cache?.trim?.(map,limit);
    }catch{}
  }

  function loadTile(tx,ty,timeoutMs=6000){
    const key=tileKey(tx,ty);
    const hit=cacheGet(tileCache,key);
    if(hit)return Promise.resolve(hit);
    if(tilePending.has(key))return tilePending.get(key);

    const promise=new Promise((resolve,reject)=>{
      const img=new Image();
      img.crossOrigin='anonymous';
      let done=false;
      const finish=(ok,value)=>{
        if(done)return;
        done=true;
        clearTimeout(timer);
        tilePending.delete(key);
        if(ok){
          cachePut(tileCache,key,value);
          resolve(value);
        }else{
          reject(value);
        }
      };
      const timer=setTimeout(
        ()=>finish(false,new Error(`imagery timeout ${key}`)),
        timeoutMs
      );
      img.onload=()=>finish(true,img);
      img.onerror=()=>finish(false,new Error(`imagery load error ${key}`));
      img.src=`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${ty}/${tx}`;
    });

    tilePending.set(key,promise);
    return promise;
  }

  function absoluteGroundCenter(){
    const supplied=getGroundCenter?.();
    if(supplied&&Number.isFinite(supplied.x)&&Number.isFinite(supplied.z)){
      return {x:supplied.x,z:supplied.z};
    }
    const offset=getWorldOffset();
    return {x:offset.x,z:offset.z};
  }

  function chunkSpec(cx,cy){
    const tileX=cx*CHUNK_TILES;
    const tileY=cy*CHUNK_TILES;
    const nw=slippyToLonLat(tileX,tileY);
    const se=slippyToLonLat(tileX+CHUNK_TILES,tileY+CHUNK_TILES);
    const westNorth=toWorld(nw.lat,nw.lon);
    const eastSouth=toWorld(se.lat,se.lon);
    const west=westNorth.x;
    const east=eastSouth.x;
    const north=westNorth.z;
    const south=eastSouth.z;
    return {
      key:chunkKey(cx,cy),
      cx,cy,tileX,tileY,
      west,east,north,south,
      centerX:(west+east)/2,
      centerZ:(north+south)/2
    };
  }

  function chunkSpecsForGround(){
    const center=absoluteGroundCenter();
    const half=groundSize/2;
    const corners=[
      toLatLon(center.x-half,center.z-half),
      toLatLon(center.x+half,center.z-half),
      toLatLon(center.x-half,center.z+half),
      toLatLon(center.x+half,center.z+half)
    ].map(ll=>lonLatToSlippy(ll.lon,ll.lat));

    let minTx=Infinity,maxTx=-Infinity,minTy=Infinity,maxTy=-Infinity;
    for(const point of corners){
      minTx=Math.min(minTx,point.x);
      maxTx=Math.max(maxTx,point.x);
      minTy=Math.min(minTy,point.y);
      maxTy=Math.max(maxTy,point.y);
    }

    // Include one tile of safety before chunk alignment so no terrain edge can
    // ever sample a texture beyond its geographic coverage.
    const minCx=Math.floor((Math.floor(minTx)-1)/CHUNK_TILES);
    const maxCx=Math.floor((Math.floor(maxTx)+1)/CHUNK_TILES);
    const minCy=Math.floor((Math.floor(minTy)-1)/CHUNK_TILES);
    const maxCy=Math.floor((Math.floor(maxTy)+1)/CHUNK_TILES);
    const specs=[];
    for(let cy=minCy;cy<=maxCy;cy++){
      for(let cx=minCx;cx<=maxCx;cx++)specs.push(chunkSpec(cx,cy));
    }
    return specs;
  }

  function disposeChunk(entry){
    if(!entry)return;
    entry.mesh?.parent?.remove?.(entry.mesh);
    entry.mesh?.geometry?.dispose?.();
    const material=entry.mesh?.material;
    material?.map?.dispose?.();
    material?.dispose?.();
  }

  function pruneChunks(){
    const center=absoluteGroundCenter();
    const candidates=[...chunks.values()].sort((a,b)=>{
      const da=Math.hypot(a.spec.centerX-center.x,a.spec.centerZ-center.z);
      const db=Math.hypot(b.spec.centerX-center.x,b.spec.centerZ-center.z);
      return da-db;
    });

    for(const entry of candidates){
      if(requiredKeys.has(entry.spec.key))continue;
      if(chunks.size<=MAX_VISIBLE)break;
      disposeChunk(entry);
      chunks.delete(entry.spec.key);
    }
  }

  function makeChunkGeometry(spec){
    const seg=CHUNK_SEGMENTS;
    const cols=seg+1;
    const positions=new Float32Array(cols*cols*3);
    const uvs=new Float32Array(cols*cols*2);
    const indices=[];
    let pi=0,ui=0;

    for(let row=0;row<=seg;row++){
      const tz=row/seg;
      const absZ=spec.north+(spec.south-spec.north)*tz;
      for(let col=0;col<=seg;col++){
        const tx=col/seg;
        const absX=spec.west+(spec.east-spec.west)*tx;
        const y=typeof sampleTerrainHeight==='function'
          ?sampleTerrainHeight(absX,absZ)
          :0;
        positions[pi++]=absX-spec.centerX;
        positions[pi++]=Number.isFinite(y)?y+.018:.018;
        positions[pi++]=absZ-spec.centerZ;
        uvs[ui++]=tx;
        uvs[ui++]=1-tz;
      }
    }

    for(let row=0;row<seg;row++){
      for(let col=0;col<seg;col++){
        const a=row*cols+col;
        const b=a+1;
        const c=a+cols;
        const d=c+1;
        indices.push(a,c,b,b,c,d);
      }
    }

    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function realignEntry(entry){
    const offset=getWorldOffset();
    entry.mesh.position.set(
      entry.spec.centerX-offset.x,
      0,
      entry.spec.centerZ-offset.z
    );
    entry.mesh.updateMatrix();
  }

  async function composeChunk(spec,jobGeneration){
    const tileJobs=[];
    for(let dy=0;dy<CHUNK_TILES;dy++){
      for(let dx=0;dx<CHUNK_TILES;dx++){
        // A chunk is only published when every tile is real. Partial canvases
        // would merely replace one form of stretching with visible seams.
        tileJobs.push(loadTile(spec.tileX+dx,spec.tileY+dy));
      }
    }
    const images=await Promise.all(tileJobs);

    if(jobGeneration!==generation||destroyed)return false;
    await idleTurn();
    if(jobGeneration!==generation||destroyed)return false;

    const tilePx=256;
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=CHUNK_TILES*tilePx;
    const ctx=canvas.getContext('2d',{alpha:false});
    ctx.fillStyle='#65745a';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    let imageIndex=0;
    for(let dy=0;dy<CHUNK_TILES;dy++){
      for(let dx=0;dx<CHUNK_TILES;dx++){
        ctx.drawImage(images[imageIndex++],dx*tilePx,dy*tilePx,tilePx,tilePx);
      }
    }

    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=THREE.ClampToEdgeWrapping;
    texture.wrapT=THREE.ClampToEdgeWrapping;
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;
    texture.anisotropy=Math.min(12,renderer?.capabilities?.getMaxAnisotropy?.()??8);
    texture.generateMipmaps=true;
    texture.needsUpdate=true;

    const geometry=makeChunkGeometry(spec);
    const material=new THREE.MeshStandardMaterial({
      map:texture,
      color:0xffffff,
      roughness:1,
      metalness:0,
      side:THREE.FrontSide,
      polygonOffset:true,
      polygonOffsetFactor:-1,
      polygonOffsetUnits:-1,
      fog:true,
      // Loaded satellite coverage owns these terrain pixels. The procedural
      // underlay/horizon use NotEqual(ref 2), eliminating z-fighting even when
      // their triangulation differs slightly from this chunk.
      stencilWrite:true,
      stencilRef:2,
      stencilFunc:THREE.AlwaysStencilFunc,
      stencilFail:THREE.KeepStencilOp,
      stencilZFail:THREE.KeepStencilOp,
      stencilZPass:THREE.ReplaceStencilOp
    });

    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=`satellite-chunk-${spec.key}`;
    mesh.receiveShadow=true;
    mesh.castShadow=false;
    mesh.renderOrder=-10;
    mesh.matrixAutoUpdate=false;
    const entry={spec,mesh,geometryDirty:false};
    realignEntry(entry);

    if(jobGeneration!==generation||destroyed){
      disposeChunk(entry);
      return false;
    }

    const previous=chunks.get(spec.key);
    if(previous)disposeChunk(previous);
    chunks.set(spec.key,entry);
    chunkGroup.add(mesh);
    mesh.visible=enabled;
    pruneChunks();
    return true;
  }

  function resolveWaiters(key,value){
    const list=waiters.get(key);
    if(!list)return;
    waiters.delete(key);
    for(const resolve of list)resolve(value);
  }

  function enqueueChunk(spec){
    if(chunks.has(spec.key))return Promise.resolve(true);
    if(chunkPending.has(spec.key))return chunkPending.get(spec.key);

    let outerResolve;
    const promise=new Promise(resolve=>{outerResolve=resolve;});
    chunkPending.set(spec.key,promise);
    queue.push({spec,jobGeneration:generation,resolve:outerResolve});
    queuedKeys.add(spec.key);
    pumpQueue();
    return promise;
  }

  function updateStatus(){
    const total=lastRequiredSpecs.length;
    if(!enabled){setStatus('OFF');return;}
    if(!total){setStatus(chunks.size?'Satellite':'Attente');return;}
    let ready=0;
    for(const spec of lastRequiredSpecs)if(chunks.has(spec.key))ready++;
    setStatus(`Satellite · ${ready}/${total}`);
  }

  function pumpQueue(){
    if(activeBuilds>=1||!queue.length||destroyed){
      updateStatus();
      return;
    }
    const task=queue.shift();
    queuedKeys.delete(task.spec.key);
    activeBuilds++;

    composeChunk(task.spec,task.jobGeneration)
      .then(value=>{
        task.resolve(value);
        resolveWaiters(task.spec.key,value);
      })
      .catch(error=>{
        console.warn('Satellite chunk unavailable',task.spec.key,error);
        task.resolve(false);
        resolveWaiters(task.spec.key,false);
      })
      .finally(()=>{
        chunkPending.delete(task.spec.key);
        activeBuilds--;
        updateStatus();
        pumpQueue();
      });
  }

  function requestChunks(specs,priorityX,priorityZ){
    currentPriority={x:priorityX,z:priorityZ};
    const sorted=specs.slice().sort((a,b)=>{
      const da=Math.hypot(a.centerX-priorityX,a.centerZ-priorityZ);
      const db=Math.hypot(b.centerX-priorityX,b.centerZ-priorityZ);
      return da-db;
    });
    requiredKeys=new Set(sorted.map(spec=>spec.key));
    lastRequiredSpecs=sorted;

    const promises=[];
    for(const spec of sorted)promises.push(enqueueChunk(spec));
    updateStatus();
    return {sorted,promises};
  }

  async function buildMosaic(absx,absz){
    if(!enabled)return false;
    lastCenter={x:absx,z:absz};
    applyToGround();
    const specs=chunkSpecsForGround();
    const {sorted}=requestChunks(specs,absx,absz);

    // Wait for the nearest chunks only. The rest continue in the serialized
    // idle queue and reveal themselves as they become complete. This avoids a
    // giant all-or-nothing 4K canvas upload and keeps startup bounded.
    const critical=sorted.slice(0,Math.min(9,sorted.length));
    const results=await Promise.all(critical.map(spec=>enqueueChunk(spec)));
    return results.some(Boolean)||critical.every(spec=>chunks.has(spec.key));
  }

  async function prefetchAt(absx,absz){
    if(!enabled)return false;
    const ll=toLatLon(absx,absz);
    const p=lonLatToSlippy(ll.lon,ll.lat);
    const tx=Math.floor(p.x),ty=Math.floor(p.y);
    const jobs=[];
    // Small 3x3 warm-up. V21.22.4 already supplies a wide 2D route-ahead
    // buffer; pending/cache deduplication makes overlapping probes cheap.
    for(let dy=-1;dy<=1;dy++){
      for(let dx=-1;dx<=1;dx++)jobs.push(loadTile(tx+dx,ty+dy).catch(()=>null));
    }
    await Promise.allSettled(jobs);
    return true;
  }

  function applyToGround(){
    // Satellite imagery is never mapped onto the monolithic ground mesh.
    // Therefore no UV can sample outside real imagery bounds and no edge pixel
    // can ever be stretched across kilometres of terrain.
    groundMaterial.map=null;
    groundMaterial.vertexColors=true;
    groundMaterial.color.set(0xffffff);
    groundMaterial.needsUpdate=true;
    chunkGroup.visible=enabled;
    for(const entry of chunks.values())entry.mesh.visible=enabled;
    updateStatus();
    return true;
  }

  function shiftOrigin(shiftX,shiftZ){
    // Existing chunks describe fixed absolute geography. Shift only their local
    // render coordinates; newly built chunks use the current origin directly.
    for(const entry of chunks.values()){
      entry.mesh.position.x-=shiftX;
      entry.mesh.position.z-=shiftZ;
      entry.mesh.updateMatrix();
    }
  }

  function realignToOrigin(){
    for(const entry of chunks.values())realignEntry(entry);
  }

  function refreshEntryGeometry(entry){
    if(!entry?.mesh)return;
    const next=makeChunkGeometry(entry.spec);
    const previous=entry.mesh.geometry;
    entry.mesh.geometry=next;
    previous?.dispose?.();
    entry.geometryDirty=false;
  }

  function invalidateGeometry(){
    const pending=[...chunks.values()];
    let index=0;
    const jobGeneration=generation;
    const step=async()=>{
      if(jobGeneration!==generation||destroyed)return;
      const entry=pending[index++];
      if(!entry)return;
      await idleTurn(900);
      if(jobGeneration!==generation||destroyed)return;
      refreshEntryGeometry(entry);
      realignEntry(entry);
      if(index<pending.length)setTimeout(step,0);
    };
    if(pending.length)setTimeout(step,0);
  }

  function clearVisibleChunks(){
    for(const entry of chunks.values())disposeChunk(entry);
    chunks.clear();
    requiredKeys.clear();
    lastRequiredSpecs=[];
    while(queue.length){
      const task=queue.shift();
      chunkPending.delete(task.spec.key);
      task.resolve(false);
    }
    queuedKeys.clear();
    for(const resolves of waiters.values())for(const resolve of resolves)resolve(false);
    waiters.clear();
  }

  function reset(){
    generation++;
    clearVisibleChunks();
    lastCenter={x:Infinity,z:Infinity};
    updateStatus();
    // Completed tileCache is intentionally retained across route changes.
  }

  function toggle(){
    enabled=!enabled;
    if(toggleButton)toggleButton.textContent=`Photo: ${enabled?'ON':'OFF'}`;
    applyToGround();
    if(enabled&&Number.isFinite(lastCenter.x))buildMosaic(lastCenter.x,lastCenter.z).catch(()=>{});
    return enabled;
  }

  if(toggleButton){
    toggleButton.addEventListener('click',toggle);
    toggleButton.textContent=`Photo: ${enabled?'ON':'OFF'}`;
  }
  applyToGround();

  return {
    get enabled(){return enabled;},
    get center(){return lastCenter;},
    get loading(){return activeBuilds>0||queue.length>0;},
    get chunkCount(){return chunks.size;},
    get group(){return chunkGroup;},
    buildMosaic,
    applyToGround,
    loadTile,
    prefetchAt,
    shiftOrigin,
    realignToOrigin,
    invalidateGeometry,
    reset,
    toggle,
    destroy(){
      destroyed=true;
      generation++;
      clearVisibleChunks();
      chunkGroup.parent?.remove?.(chunkGroup);
    }
  };
}
