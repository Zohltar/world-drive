// World Drive - satellite/aerial imagery subsystem
// Owns ArcGIS tile loading, LRU tile cache, 5x5 mosaic generation,
// Three.js texture state and ground-material mapping.

export function createImageryService({
  THREE,
  renderer,
  cache,
  groundMaterial,
  statusEl,
  toggleButton,
  toLatLon,
  toWorld,
  getWorldOffset,
  zoom=16,
  groundSize=2000
}) {
  if(!THREE)throw new Error('Imagery requires THREE');
  if(!renderer)throw new Error('Imagery requires renderer');
  if(!cache)throw new Error('Imagery requires cache');
  if(!groundMaterial)throw new Error('Imagery requires ground material');
  if(typeof toLatLon!=='function')throw new Error('Imagery requires toLatLon()');
  if(typeof toWorld!=='function')throw new Error('Imagery requires toWorld()');
  if(typeof getWorldOffset!=='function')throw new Error('Imagery requires getWorldOffset()');

  const tileCache=new Map();
  const pending=new Map();

  let texture=null;
  let loading=false;
  let enabled=true;
  let center={x:Infinity,z:Infinity};
  let bounds=null;

  let mosaicKey=null;
  let appliedTexture=null;

  function setStatus(text){
    if(statusEl)statusEl.textContent=text;
  }

  function lonLatToSlippy(lon,lat,z=zoom){
    const n=2**z;
    const latRad=lat*Math.PI/180;

    return {
      x:(lon+180)/360*n,
      y:(1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n
    };
  }

  function slippyToLonLat(x,y,z=zoom){
    const n=2**z;

    return {
      lon:x/n*360-180,
      lat:Math.atan(
        Math.sinh(Math.PI*(1-2*y/n))
      )*180/Math.PI
    };
  }

  function tileKey(x,y){
    return `${zoom}/${x}/${y}`;
  }

  function loadTile(tx,ty,timeoutMs=5000){
    const key=tileKey(tx,ty);
    const hit=cache.get(tileCache,key);
    if(hit)return Promise.resolve(hit);

    if(pending.has(key)){
      return pending.get(key);
    }

    const promise=new Promise((resolve,reject)=>{
      const image=new Image();
      image.crossOrigin='anonymous';

      let done=false;

      const finish=(ok,value)=>{
        if(done)return;
        done=true;
        clearTimeout(timer);
        pending.delete(key);

        if(ok){
          cache.touch(tileCache,key,value);
          cache.trim(
            tileCache,
            cache.limits.imagery
          );
          resolve(value);
        }else{
          reject(value);
        }
      };

      const timer=setTimeout(
        ()=>finish(
          false,
          new Error('imagery timeout')
        ),
        timeoutMs
      );

      image.onload=()=>finish(true,image);
      image.onerror=()=>finish(
        false,
        new Error('imagery load error')
      );

      image.src=
        `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
    });

    pending.set(key,promise);
    return promise;
  }

  function applyToGround(){
    const shouldShow=
      enabled&&
      texture&&
      bounds;

    if(!shouldShow){
      if(groundMaterial.map!==null){
        groundMaterial.map=null;
        groundMaterial.color.set(0x627a4e);

        // Material shader variant changes only when a map is attached/removed.
        groundMaterial.needsUpdate=true;
      }else{
        groundMaterial.color.set(0x627a4e);
      }

      appliedTexture=null;
      return;
    }

    const mapChanged=
      groundMaterial.map!==texture;

    if(mapChanged){
      groundMaterial.map=texture;
      groundMaterial.color.set(0xffffff);
      groundMaterial.needsUpdate=true;
      appliedTexture=texture;
    }else{
      groundMaterial.color.set(0xffffff);
    }

    const half=groundSize/2;
    const worldOffset=getWorldOffset();

    const spanX=bounds.east-bounds.west;
    const spanZ=bounds.south-bounds.north;

    if(
      Math.abs(spanX)<1e-9||
      Math.abs(spanZ)<1e-9
    ){
      return;
    }

    const absWest=worldOffset.x-half;
    const absEast=worldOffset.x+half;
    const absNorth=worldOffset.z-half;
    const absSouth=worldOffset.z+half;

    const u0=
      (absWest-bounds.west)/
      spanX;

    const u1=
      (absEast-bounds.west)/
      spanX;

    const vTop=
      (absNorth-bounds.north)/
      spanZ;

    const vBottom=
      (absSouth-bounds.north)/
      spanZ;

    // offset/repeat are sampler uniforms. Changing them does NOT require
    // re-uploading the 1280x1280 canvas texture to the GPU.
    texture.offset.set(
      u0,
      1-vBottom
    );

    texture.repeat.set(
      u1-u0,
      vBottom-vTop
    );

    // Deliberately NO texture.needsUpdate here.
  }

  async function buildMosaic(absx,absz){
    if(!enabled)return false;
    if(loading)return false;

    loading=true;
    setStatus('Chargement…');

    try{
      const ll=toLatLon(absx,absz);
      const tile=lonLatToSlippy(ll.lon,ll.lat);
      const cx=Math.floor(tile.x);
      const cy=Math.floor(tile.y);

      const nextMosaicKey=
        `${zoom}/${cx}/${cy}`;

      // Streaming can ask for imagery repeatedly while still inside the same
      // 5x5 tile cell. Reuse the existing GPU texture instead of rebuilding it.
      if(
        texture&&
        bounds&&
        mosaicKey===nextMosaicKey
      ){
        center={
          x:absx,
          z:absz
        };

        applyToGround();
        setStatus('Réelle · cache GPU');
        return true;
      }

      // 5x5 around vehicle: covers the detailed 2 km ground patch.
      const radius=2;
      const count=5;

      const canvas=document.createElement('canvas');
      canvas.width=canvas.height=count*256;

      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#627a4e';
      ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      let loaded=0;
      const jobs=[];

      for(let dx=-radius;dx<=radius;dx++){
        for(let dy=-radius;dy<=radius;dy++){
          const tx=cx+dx;
          const ty=cy+dy;

          jobs.push(
            loadTile(tx,ty).then(image=>{
              ctx.drawImage(
                image,
                (dx+radius)*256,
                (dy+radius)*256,
                256,
                256
              );
              loaded++;
            }).catch(()=>{})
          );
        }
      }

      // Never hold up the visible game waiting for imagery.
      await Promise.race([
        Promise.all(jobs),
        new Promise(resolve=>
          setTimeout(resolve,5600)
        )
      ]);

      if(loaded<4){
        setStatus('Fallback');
        return false;
      }

      const previousTexture=texture;

      const nextTexture=
        new THREE.CanvasTexture(canvas);

      nextTexture.colorSpace=
        THREE.SRGBColorSpace;

      // 4x keeps oblique-road imagery crisp while reducing texture sampling
      // cost compared with the previous forced 8x anisotropy.
      nextTexture.anisotropy=Math.min(
        4,
        renderer.capabilities.getMaxAnisotropy()
      );

      nextTexture.wrapS=
        THREE.ClampToEdgeWrapping;

      nextTexture.wrapT=
        THREE.ClampToEdgeWrapping;

      // Explicit mipmapping keeps distant/minified terrain inexpensive.
      nextTexture.generateMipmaps=true;
      nextTexture.minFilter=
        THREE.LinearMipmapLinearFilter;
      nextTexture.magFilter=
        THREE.LinearFilter;

      texture=nextTexture;
      mosaicKey=nextMosaicKey;

      // CanvasTexture already uploads itself once when first rendered.
      // Do not force any additional upload here.

      // Release the previous GPU texture away from the swap moment.
      if(previousTexture){
        const disposeOld=()=>
          previousTexture.dispose();

        if(typeof requestIdleCallback==='function'){
          requestIdleCallback(
            disposeOld,
            {timeout:250}
          );
        }else{
          setTimeout(disposeOld,0);
        }
      }

      const left=cx-radius;
      const top=cy-radius;
      const right=cx+radius+1;
      const bottom=cy+radius+1;

      const nw=slippyToLonLat(left,top);
      const se=slippyToLonLat(right,bottom);

      const west=toWorld(ll.lat,nw.lon).x;
      const east=toWorld(ll.lat,se.lon).x;
      const north=toWorld(nw.lat,ll.lon).z;
      const south=toWorld(se.lat,ll.lon).z;

      bounds={
        west,
        east,
        north,
        south
      };

      center={
        x:absx,
        z:absz
      };

      applyToGround();
      setStatus(`Réelle · ${loaded}/25`);
      return true;
    }finally{
      loading=false;
    }
  }

  async function prefetchAt(x,z){
    if(!enabled)return;

    const ll=toLatLon(x,z);
    const tile=lonLatToSlippy(ll.lon,ll.lat);
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

  function toggle(){
    enabled=!enabled;

    if(toggleButton){
      toggleButton.textContent=
        'Photo: '+(enabled?'ON':'OFF');
    }

    setStatus(
      enabled
        ?(texture?'Réelle':'Attente')
        :'OFF'
    );

    applyToGround();
    return enabled;
  }

  function reset(){
    pending.clear();

    if(texture){
      texture.dispose();
      texture=null;
    }

    mosaicKey=null;
    appliedTexture=null;
    bounds=null;
    loading=false;
    center={x:Infinity,z:Infinity};

    if(enabled){
      setStatus('Attente');
    }else{
      setStatus('OFF');
    }

    applyToGround();
  }

  if(toggleButton){
    toggleButton.addEventListener(
      'click',
      ()=>toggle()
    );
  }

  return {
    loadTile,
    buildMosaic,
    prefetchAt,
    applyToGround,
    toggle,
    reset,

    get loading(){
      return loading;
    },

    get center(){
      return center;
    },

    get enabled(){
      return enabled;
    },

    get hasTexture(){
      return !!texture;
    },

    get mosaicKey(){
      return mosaicKey;
    }
  };
}
