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
    if(!enabled||!texture||!bounds){
      groundMaterial.map=null;
      groundMaterial.color.set(0x627a4e);
      groundMaterial.needsUpdate=true;
      return;
    }

    groundMaterial.map=texture;
    groundMaterial.color.set(0xffffff);

    const half=groundSize/2;
    const worldOffset=getWorldOffset();

    const spanX=bounds.east-bounds.west;
    const spanZ=bounds.south-bounds.north;

    if(Math.abs(spanX)<1e-9||Math.abs(spanZ)<1e-9){
      return;
    }

    const absWest=worldOffset.x-half;
    const absEast=worldOffset.x+half;
    const absNorth=worldOffset.z-half;
    const absSouth=worldOffset.z+half;

    const u0=(absWest-bounds.west)/spanX;
    const u1=(absEast-bounds.west)/spanX;
    const vTop=(absNorth-bounds.north)/spanZ;
    const vBottom=(absSouth-bounds.north)/spanZ;

    texture.offset.set(u0,1-vBottom);
    texture.repeat.set(u1-u0,vBottom-vTop);
    texture.needsUpdate=true;
    groundMaterial.needsUpdate=true;
  }

  async function buildMosaic(absx,absz){
    if(loading)return false;

    loading=true;
    setStatus('Chargement…');

    try{
      const ll=toLatLon(absx,absz);
      const tile=lonLatToSlippy(ll.lon,ll.lat);
      const cx=Math.floor(tile.x);
      const cy=Math.floor(tile.y);

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

      if(texture)texture.dispose();

      texture=new THREE.CanvasTexture(canvas);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.anisotropy=Math.min(
        8,
        renderer.capabilities.getMaxAnisotropy()
      );
      texture.wrapS=THREE.ClampToEdgeWrapping;
      texture.wrapT=THREE.ClampToEdgeWrapping;

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
    }
  };
}
