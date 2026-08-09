// World Drive - elevation data subsystem
// Step 11A: owns Terrarium DEM tile loading, LRU memory cache,
// bilinear sampling, local elevation baseline and directional prefetch.
// Terrain mesh/rendering remains in main.js.

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

  let base=null;
  let loading=false;
  let center={x:Infinity,z:Infinity};

  function setStatus(text){
    if(statusEl)statusEl.textContent=text;
  }

  function lonLatToTile(lon,lat,z=zoom){
    const n=2**z;
    const latRad=lat*Math.PI/180;

    return {
      x:(lon+180)/360*n,
      y:(1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n
    };
  }

  function tileKey(tx,ty){
    return `${zoom}/${tx}/${ty}`;
  }

  function elevationAt(lat,lon){
    const tile=lonLatToTile(lon,lat);
    const tx=Math.floor(tile.x);
    const ty=Math.floor(tile.y);
    const image=cache.get(
      tiles,
      tileKey(tx,ty)
    );

    if(!image)return null;

    // Bilinear interpolation avoids the staircase effect of nearest-pixel DEM.
    const fx=(tile.x-tx)*image.width-.5;
    const fy=(tile.y-ty)*image.height-.5;

    const x0=Math.floor(fx);
    const y0=Math.floor(fy);
    const u=fx-x0;
    const v=fy-y0;

    function sample(px,py){
      px=Math.max(0,Math.min(image.width-1,px));
      py=Math.max(0,Math.min(image.height-1,py));

      const index=(py*image.width+px)*4;
      const r=image.data[index];
      const g=image.data[index+1];
      const b=image.data[index+2];

      // Mapzen/AWS Terrarium encoding.
      return r*256+g+b/256-32768;
    }

    const e00=sample(x0,y0);
    const e10=sample(x0+1,y0);
    const e01=sample(x0,y0+1);
    const e11=sample(x0+1,y0+1);

    const a=e00*(1-u)+e10*u;
    const b=e01*(1-u)+e11*u;

    return a*(1-v)+b*v;
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
    setStatus('Démo');
  }

  return {
    elevationAt,
    relativeElevationAt,
    loadTile,
    loadAround,
    prefetchAt,
    reset,

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
}
