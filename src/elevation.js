// World Drive - elevation data subsystem
// Step 11A: owns Terrarium DEM tile loading, LRU memory cache,
// bilinear sampling, local elevation baseline and directional prefetch.
// Terrain mesh/rendering remains in main.js.
//
// P9.19 adds a world-space fast path for repeated terrain/horizon sampling.
// The old path converted every terrain vertex world -> lat/lon -> WebMercator
// with tan/asinh. A 448x448 ground refresh alone does 201,601 samples, and the
// horizon performs several more height probes per vertex. The fast path locally
// calibrates world metres directly to slippy-tile coordinates, then reuses the
// currently-hot DEM tile while preserving the same bilinear Terrarium decoder.

export function createElevationService({
  cache,
  statusEl,
  toLatLon,
  zoom=11
}) {
  if(!cache)throw new Error('Elevation requires cache');
  if(typeof toLatLon!=='function'){
    throw new Error('Elevation requires toLatLon()');
  }

  const tiles=new Map();
  const pending=new Map();
  const TILE_SCALE=2**zoom;

  let base=null;
  let loading=false;
  let center={x:Infinity,z:Infinity};

  // P9.19 world -> tile local affine calibration. The route coordinate system
  // is locally metric; WebMercator is extremely close to affine across a local
  // terrain patch. Recalibration every few kilometres keeps the approximation
  // sub-pixel while avoiding trigonometry for hundreds of thousands of samples.
  let fastAnchorX=NaN;
  let fastAnchorZ=NaN;
  let fastAnchorTileX=NaN;
  let fastAnchorTileY=NaN;
  let fastTileXPerX=0;
  let fastTileXPerZ=0;
  let fastTileYPerX=0;
  let fastTileYPerZ=0;
  let fastCalibrationCount=0;
  let fastSampleCount=0;
  let exactSampleCount=0;
  let fastTileHits=0;
  let fastTileMisses=0;
  let hotTx=NaN;
  let hotTy=NaN;
  let hotImage=null;

  const FAST_CALIBRATION_STEP_M=500;
  const FAST_REBASE_DISTANCE_M=9000;
  const FAST_REBASE_DISTANCE2=FAST_REBASE_DISTANCE_M*FAST_REBASE_DISTANCE_M;

  function setStatus(text){
    if(statusEl)statusEl.textContent=text;
  }

  function lonLatToTile(lon,lat,z=zoom){
    const n=z===zoom?TILE_SCALE:2**z;
    const safeLat=Math.max(-85.05112878,Math.min(85.05112878,lat));
    const latRad=safeLat*Math.PI/180;

    return {
      x:(lon+180)/360*n,
      y:(1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n
    };
  }

  function tileKey(tx,ty){
    return `${zoom}/${tx}/${ty}`;
  }

  function sampleTerrariumImage(image,tileX,tileY,tx,ty){
    const fx=(tileX-tx)*image.width-.5;
    const fy=(tileY-ty)*image.height-.5;

    const x0=Math.floor(fx);
    const y0=Math.floor(fy);
    const u=fx-x0;
    const v=fy-y0;
    const width=image.width;
    const height=image.height;
    const data=image.data;

    const sx0=Math.max(0,Math.min(width-1,x0));
    const sx1=Math.max(0,Math.min(width-1,x0+1));
    const sy0=Math.max(0,Math.min(height-1,y0));
    const sy1=Math.max(0,Math.min(height-1,y0+1));

    let i=(sy0*width+sx0)*4;
    const e00=data[i]*256+data[i+1]+data[i+2]/256-32768;
    i=(sy0*width+sx1)*4;
    const e10=data[i]*256+data[i+1]+data[i+2]/256-32768;
    i=(sy1*width+sx0)*4;
    const e01=data[i]*256+data[i+1]+data[i+2]/256-32768;
    i=(sy1*width+sx1)*4;
    const e11=data[i]*256+data[i+1]+data[i+2]/256-32768;

    const a=e00+(e10-e00)*u;
    const b=e01+(e11-e01)*u;
    return a+(b-a)*v;
  }

  function imageForTile(tx,ty,{fast=false}={}){
    if(fast&&hotImage&&tx===hotTx&&ty===hotTy){
      fastTileHits++;
      return hotImage;
    }

    const image=cache.get(
      tiles,
      tileKey(tx,ty)
    );

    if(fast){
      if(image){
        hotTx=tx;
        hotTy=ty;
        hotImage=image;
        fastTileMisses++;
      }
    }

    return image||null;
  }

  function elevationAtTileCoordinates(tileX,tileY,{fast=false}={}){
    const tx=Math.floor(tileX);
    const ty=Math.floor(tileY);
    const image=imageForTile(tx,ty,{fast});
    if(!image)return null;
    return sampleTerrariumImage(image,tileX,tileY,tx,ty);
  }

  function elevationAt(lat,lon){
    exactSampleCount++;
    const tile=lonLatToTile(lon,lat);
    return elevationAtTileCoordinates(tile.x,tile.y);
  }

  function relativeElevationAt(lat,lon){
    const elevation=elevationAt(lat,lon);

    if(elevation===null||!Number.isFinite(elevation)){
      return null;
    }

    if(base===null){
      base=elevation;
    }

    return elevation-base;
  }

  function resetFastCalibration(){
    fastAnchorX=NaN;
    fastAnchorZ=NaN;
    fastAnchorTileX=NaN;
    fastAnchorTileY=NaN;
    fastTileXPerX=0;
    fastTileXPerZ=0;
    fastTileYPerX=0;
    fastTileYPerZ=0;
    hotTx=NaN;
    hotTy=NaN;
    hotImage=null;
  }

  function calibrateFastWorldSampler(x,z){
    const d=FAST_CALIBRATION_STEP_M;
    const ll0=toLatLon(x,z);
    const llX=toLatLon(x+d,z);
    const llZ=toLatLon(x,z+d);
    const t0=lonLatToTile(ll0.lon,ll0.lat);
    const tX=lonLatToTile(llX.lon,llX.lat);
    const tZ=lonLatToTile(llZ.lon,llZ.lat);

    fastAnchorX=x;
    fastAnchorZ=z;
    fastAnchorTileX=t0.x;
    fastAnchorTileY=t0.y;
    fastTileXPerX=(tX.x-t0.x)/d;
    fastTileXPerZ=(tZ.x-t0.x)/d;
    fastTileYPerX=(tX.y-t0.y)/d;
    fastTileYPerZ=(tZ.y-t0.y)/d;
    fastCalibrationCount++;
  }

  function fastElevationAtWorld(x,z){
    const dx=x-fastAnchorX;
    const dz=z-fastAnchorZ;
    if(
      !Number.isFinite(fastAnchorX)||
      dx*dx+dz*dz>FAST_REBASE_DISTANCE2
    ){
      calibrateFastWorldSampler(x,z);
    }

    const localX=x-fastAnchorX;
    const localZ=z-fastAnchorZ;
    const tileX=
      fastAnchorTileX+
      localX*fastTileXPerX+
      localZ*fastTileXPerZ;
    const tileY=
      fastAnchorTileY+
      localX*fastTileYPerX+
      localZ*fastTileYPerZ;

    fastSampleCount++;
    return elevationAtTileCoordinates(tileX,tileY,{fast:true});
  }

  function relativeWorldHeightFast(x,z){
    const elevation=fastElevationAtWorld(x,z);
    if(elevation===null||!Number.isFinite(elevation))return null;
    if(base===null)base=elevation;
    return elevation-base;
  }

  async function decodeImage(url,timeoutMs=4800){
    return new Promise((resolve,reject)=>{
      const image=new Image();
      image.crossOrigin='anonymous';

      let done=false;

      const finish=(ok,value)=>{
        if(done)return;

        done=true;
        clearTimeout(timer);

        image.onload=null;
        image.onerror=null;

        if(ok)resolve(value);
        else reject(value);
      };

      const timer=setTimeout(
        ()=>finish(
          false,
          new Error('elevation image timeout')
        ),
        timeoutMs
      );

      image.onload=()=>{
        try{
          const canvas=document.createElement('canvas');
          canvas.width=image.naturalWidth||256;
          canvas.height=image.naturalHeight||256;

          const ctx=canvas.getContext(
            '2d',
            {willReadFrequently:true}
          );

          ctx.drawImage(image,0,0);

          const data=ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );

          finish(true,data);
        }catch(error){
          finish(false,error);
        }
      };

      image.onerror=()=>finish(
        false,
        new Error('elevation image error')
      );

      image.src=url;
    });
  }

  async function loadTile(tx,ty){
    const key=tileKey(tx,ty);

    if(tiles.has(key)){
      // Touch the entry so memory eviction remains true LRU.
      cache.get(tiles,key);
      return true;
    }

    if(pending.has(key)){
      return pending.get(key);
    }

    const task=(async()=>{
      const urls=[
        `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${zoom}/${tx}/${ty}.png`,
        `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${tx}/${ty}.png`
      ];

      try{
        let lastError=null;

        for(const url of urls){
          try{
            const imageData=await decodeImage(url,4800);

            cache.touch(
              tiles,
              key,
              imageData
            );

            cache.trim(
              tiles,
              cache.limits.elevation
            );

            // A newly arrived image may satisfy the currently-hot fast tile.
            if(tx===hotTx&&ty===hotTy)hotImage=imageData;

            return true;
          }catch(error){
            lastError=error;
            console.warn(
              'Elevation endpoint failed',
              url,
              error
            );
          }
        }

        throw lastError||
          new Error('elevation unavailable');
      }catch(error){
        console.warn(
          'Elevation tile unavailable',
          key,
          error
        );
        return false;
      }finally{
        // Never leave a stale in-flight marker blocking future retries.
        pending.delete(key);
      }
    })();

    pending.set(key,task);
    return task;
  }

  function availableAround(cx,cy,radius=1){
    let count=0;

    for(let dx=-radius;dx<=radius;dx++){
      for(let dy=-radius;dy<=radius;dy++){
        if(tiles.has(tileKey(cx+dx,cy+dy))){
          count++;
        }
      }
    }

    return count;
  }

  async function loadAround(absx,absz){
    if(loading){
      return {
        ok:false,
        count:0,
        busy:true
      };
    }

    loading=true;
    setStatus('Chargement…');

    try{
      const ll=toLatLon(absx,absz);
      const tile=lonLatToTile(ll.lon,ll.lat);
      const cx=Math.floor(tile.x);
      const cy=Math.floor(tile.y);

      const jobs=[];

      for(let dx=-1;dx<=1;dx++){
        for(let dy=-1;dy<=1;dy++){
          jobs.push(
            loadTile(cx+dx,cy+dy)
          );
        }
      }

      try{
        // Hard deadline for the visible 3x3 batch.
        await Promise.race([
          Promise.all(jobs),
          new Promise(resolve=>
            setTimeout(resolve,5600)
          )
        ]);
      }catch(error){
        console.warn(
          'Elevation batch failed',
          error
        );
      }

      // One micro-turn catches tiles completing at the deadline boundary.
      await Promise.resolve();

      const count=availableAround(cx,cy,1);

      if(count>0){
        const central=elevationAt(ll.lat,ll.lon);

        if(
          central!==null &&
          Number.isFinite(central) &&
          base===null
        ){
          base=central;
        }

        center={
          x:absx,
          z:absz
        };

        setStatus(
          count>=5
            ?'Réel'
            :`Partiel ${count}/9`
        );

        return {
          ok:true,
          count,
          busy:false
        };
      }

      center={
        x:absx,
        z:absz
      };

      setStatus('Démo');

      return {
        ok:false,
        count:0,
        busy:false
      };
    }finally{
      loading=false;
    }
  }

  async function prefetchAt(x,z){
    const ll=toLatLon(x,z);
    const tile=lonLatToTile(ll.lon,ll.lat);
    const cx=Math.floor(tile.x);
    const cy=Math.floor(tile.y);

    const jobs=[];

    for(let dx=-1;dx<=1;dx++){
      for(let dy=-1;dy<=1;dy++){
        jobs.push(
          loadTile(cx+dx,cy+dy)
        );
      }
    }

    await Promise.allSettled(jobs);
  }

  function reset(){
    // Preserve completed DEM tiles across route changes, matching the original
    // World Drive behavior. Only route-relative/in-flight state is reset.
    pending.clear();
    base=null;
    loading=false;
    center={x:Infinity,z:Infinity};
    resetFastCalibration();
    setStatus('Démo');
  }

  const api={
    elevationAt,
    relativeElevationAt,
    loadTile,
    loadAround,
    prefetchAt,
    reset,

    // Compatibility with main.js: it historically assigns a slow adapter onto
    // relativeWorldHeight after construction. Keep that assignment harmless and
    // expose the P9.19 fast implementation through the same public property.
    get relativeWorldHeight(){
      return relativeWorldHeightFast;
    },
    set relativeWorldHeight(_value){
      // Intentionally ignored: the service now owns the optimized world sampler.
    },

    diagnostics(){
      return {
        fastSampleCount,
        exactSampleCount,
        fastCalibrationCount,
        fastTileHits,
        fastTileMisses,
        fastRebaseDistanceM:FAST_REBASE_DISTANCE_M,
        tileCount:tiles.size
      };
    },

    get loading(){
      return loading;
    },

    get center(){
      return center;
    },

    get tileCount(){
      return tiles.size;
    }
  };

  return api;
}
