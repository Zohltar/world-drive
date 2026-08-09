import * as THREE from 'three';

// Default test route. V4 can replace these coordinates at runtime.
const MANIC2={lat:49.3213,lon:-68.3467,name:'Manic‑2'};
const MANIC5={lat:50.6451065,lon:-68.7271214,name:'Manic‑5'};

// Scenic presets
const R169_START={lat:48.39474,lon:-71.67772,name:'Hébertville'};
const R169_END={lat:48.650002,lon:-72.449997,name:'Saint‑Félicien'};
const R132_START={lat:48.849998,lon:-67.533333,name:'Matane'};
const R132_END={lat:48.533333,lon:-64.216667,name:'Percé'};

let ROUTE_START={...MANIC2};
let ROUTE_END={...MANIC5};
let ROUTE_WAYPOINTS=[];
const EARTH=6378137;
let origin={lat:ROUTE_START.lat,lon:ROUTE_START.lon};
const route=[];       // {x,z,lat,lon,cum}
let routeLength=0;
let segments=[];

const $=id=>document.getElementById(id);
const loading=$('loading'),loadingText=$('loadingText'),statusEl=$('status'),notice=$('notice'),routingStatus=$('routingStatus');

function toast(t){notice.textContent=t;notice.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>notice.classList.remove('show'),1700)}
function llToXZ(lat,lon){return {x:(lon-origin.lon)*Math.PI/180*EARTH*Math.cos(origin.lat*Math.PI/180),z:-(lat-origin.lat)*Math.PI/180*EARTH}}
function xzToLL(x,z){return {lat:origin.lat+(-z/EARTH)*180/Math.PI,lon:origin.lon+(x/(EARTH*Math.cos(origin.lat*Math.PI/180)))*180/Math.PI}}
function geoDist(a,b){
 const R=6371000, p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180;
 const dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lon-a.lon)*Math.PI/180;
 const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}

// ---------- Three ----------
const scene=new THREE.Scene();scene.background=new THREE.Color(0x91b5d1);scene.fog=new THREE.FogExp2(0x91b5d1,0.00082);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,4500);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;$('app').appendChild(renderer.domElement);
const hemi=new THREE.HemisphereLight(0xd6ecff,0x4e6345,2.15);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff2d2,2.6);sun.position.set(-180,260,-120);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-300;sun.shadow.camera.right=300;sun.shadow.camera.top=300;sun.shadow.camera.bottom=-300;scene.add(sun);

const world=new THREE.Group(),
      terrainDetailGroup=new THREE.Group(),
      waterGroup=new THREE.Group(),
      infrastructureGroup=new THREE.Group(),
      buildingGroup=new THREE.Group(),
      roadGroup=new THREE.Group(),
      forestGroup=new THREE.Group(),
      horizonGroup=new THREE.Group();
world.add(terrainDetailGroup,waterGroup,infrastructureGroup,buildingGroup,roadGroup,forestGroup,horizonGroup);
scene.add(world);
const groundMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000,88,88),groundMat);
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

// Local rendering origin follows the car to avoid large-coordinate precision loss.
let worldOffset={x:0,z:0};
function toRender(x,z){return new THREE.Vector3(x-worldOffset.x,0,z-worldOffset.z)}

// ---------- V5.2 unified streaming cache ----------
const WorldCache={
  limits:{elevation:72,imagery:110,osmMemory:10,osmPersistent:120},
  osmPrefix:'worlddrive_osm_v2:', // legacy localStorage prefix for migration only
  osmIndexKey:'worlddrive_osm_v2:index',

  touch(map,key,value){
    if(map.has(key))map.delete(key);
    map.set(key,value);return value;
  },
  get(map,key){
    if(!map.has(key))return null;
    const value=map.get(key);map.delete(key);map.set(key,value);return value;
  },
  trim(map,max,onEvict=null){
    while(map.size>max){
      const first=map.keys().next().value,value=map.get(first);
      map.delete(first);try{onEvict?.(value,first)}catch(e){}
    }
  },

  // Smaller cells than V5.2.0: cached query coverage stays valid around cell edges.
  cellSize(namespace){
    if(namespace==='roadmeta')return .003;
    if(namespace==='scenery')return .020;
    if(namespace==='signs')return .025;
    return .025; // hydro
  },
  cell(namespace,lat,lon){
    const size=this.cellSize(namespace);
    return `${Math.floor(lat/size)}:${Math.floor(lon/size)}`;
  },
  osmKey(namespace,lat,lon){
    return `${namespace}:${this.cell(namespace,lat,lon)}`;
  }
};

const OsmCache={
  dbName:'worlddrive_cache_v3',
  storeName:'osm',
  memory:new Map(),
  pending:new Map(),
  dbPromise:null,

  open(){
    if(this.dbPromise)return this.dbPromise;
    this.dbPromise=new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){resolve(null);return}
      const req=indexedDB.open(this.dbName,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(this.storeName)){
          const st=db.createObjectStore(this.storeName,{keyPath:'key'});
          st.createIndex('lastAccess','lastAccess',{unique:false});
          st.createIndex('namespace','namespace',{unique:false});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>{console.warn('IndexedDB open failed',req.error);resolve(null)};
    });
    return this.dbPromise;
  },

  memGet(key,ttl){
    const rec=WorldCache.get(this.memory,key);
    if(!rec)return null;
    if(Date.now()-rec.ts>ttl){this.memory.delete(key);return null}
    rec.lastAccess=Date.now();
    return rec.data;
  },
  memSet(key,namespace,data,ts=Date.now()){
    WorldCache.touch(this.memory,key,{key,namespace,data,ts,lastAccess:Date.now()});
    WorldCache.trim(this.memory,WorldCache.limits.osmMemory);
  },

  async get(namespace,lat,lon,ttl=1000*60*60*24*14){
    const key=WorldCache.osmKey(namespace,lat,lon);
    const mem=this.memGet(key,ttl);
    if(mem)return mem;

    const db=await this.open();
    if(db){
      const rec=await new Promise(resolve=>{
        try{
          const tx=db.transaction(this.storeName,'readonly');
          const req=tx.objectStore(this.storeName).get(key);
          req.onsuccess=()=>resolve(req.result||null);
          req.onerror=()=>resolve(null);
        }catch(e){resolve(null)}
      });
      if(rec){
        if(Date.now()-rec.ts<=ttl){
          rec.lastAccess=Date.now();
          this.memSet(key,namespace,rec.data,rec.ts);
          // Update access time without blocking the caller.
          try{
            const tx=db.transaction(this.storeName,'readwrite');
            tx.objectStore(this.storeName).put(rec);
          }catch(e){}
          return rec.data;
        }
        try{
          const tx=db.transaction(this.storeName,'readwrite');
          tx.objectStore(this.storeName).delete(key);
        }catch(e){}
      }
    }

    // One-time migration from the old localStorage cache if present.
    try{
      const legacySize=.04;
      const legacyCell=`${Math.floor(lat/legacySize)}:${Math.floor(lon/legacySize)}`;
      const legacyKey=`${WorldCache.osmPrefix}${namespace}:${legacyCell}`;
      const raw=localStorage.getItem(legacyKey);
      if(raw){
        const obj=JSON.parse(raw);
        if(obj?.data&&obj?.ts&&Date.now()-obj.ts<=ttl){
          await this.set(namespace,lat,lon,obj.data,obj.ts);
          localStorage.removeItem(legacyKey);
          return obj.data;
        }
      }
    }catch(e){}

    return null;
  },

  async set(namespace,lat,lon,data,ts=Date.now()){
    if(!data)return false;
    const key=WorldCache.osmKey(namespace,lat,lon);
    this.memSet(key,namespace,data,ts);

    const db=await this.open();
    if(!db)return false;
    try{
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(this.storeName,'readwrite');
        tx.objectStore(this.storeName).put({key,namespace,ts,lastAccess:Date.now(),data});
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
      this.trimPersistent().catch(()=>{});
      return true;
    }catch(e){
      console.warn('IndexedDB cache write failed',namespace,e);
      return false;
    }
  },

  async count(namespace=null){
    const db=await this.open();if(!db)return 0;
    return new Promise(resolve=>{
      try{
        const tx=db.transaction(this.storeName,'readonly'),st=tx.objectStore(this.storeName);
        const req=namespace?st.index('namespace').count(namespace):st.count();
        req.onsuccess=()=>resolve(req.result||0);req.onerror=()=>resolve(0);
      }catch(e){resolve(0)}
    });
  },

  async trimPersistent(){
    const db=await this.open();if(!db)return;
    const total=await this.count();
    const excess=total-WorldCache.limits.osmPersistent;
    if(excess<=0)return;

    await new Promise(resolve=>{
      try{
        const tx=db.transaction(this.storeName,'readwrite');
        const idx=tx.objectStore(this.storeName).index('lastAccess');
        let removed=0;
        const req=idx.openCursor();
        req.onsuccess=()=>{
          const c=req.result;
          if(!c||removed>=excess)return;
          c.delete();removed++;c.continue();
        };
        tx.oncomplete=resolve;tx.onerror=resolve;
      }catch(e){resolve()}
    });
  },

  async clear(){
    this.memory.clear();
    const db=await this.open();
    if(db){
      await new Promise(resolve=>{
        try{
          const tx=db.transaction(this.storeName,'readwrite');
          tx.objectStore(this.storeName).clear();
          tx.oncomplete=resolve;tx.onerror=resolve;
        }catch(e){resolve()}
      });
    }
    // Remove remaining legacy cache too.
    try{
      const keys=[];
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k.startsWith(WorldCache.osmPrefix))keys.push(k);
      }
      keys.forEach(k=>localStorage.removeItem(k));
      localStorage.removeItem(WorldCache.osmIndexKey);
    }catch(e){}
  }
};

async function fetchOverpassCached(namespace,ll,query,timeoutMs=7500,ttlMs=1000*60*60*24*14){
  const key=WorldCache.osmKey(namespace,ll.lat,ll.lon);
  const cached=await OsmCache.get(namespace,ll.lat,ll.lon,ttlMs);
  if(cached)return {data:cached,cached:true};

  // Deduplicate prefetch + visible requests for the same geographic cell.
  if(OsmCache.pending.has(key))return OsmCache.pending.get(key);

  const task=(async()=>{
    const endpoints=[
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];
    for(const endpoint of endpoints){
      const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
      try{
        const r=await fetch(endpoint,{
          method:'POST',body:new URLSearchParams({data:query}),
          signal:ctl.signal,cache:'no-store'
        });
        if(!r.ok)throw new Error('HTTP '+r.status);
        const data=await r.json();
        if(data){
          await OsmCache.set(namespace,ll.lat,ll.lon,data);
          return {data,cached:false};
        }
      }catch(e){console.warn(`OSM ${namespace} failed`,endpoint,e)}
      finally{clearTimeout(timer)}
    }
    return {data:null,cached:false};
  })();

  OsmCache.pending.set(key,task);
  try{return await task}
  finally{OsmCache.pending.delete(key)}
}

// ---------- elevation streaming ----------
const elevStatus=$('elevStatus'), altitudeEl=$('altitude');
const ELEV_Z=11;
const elevTiles=new Map(); // "z/x/y" -> ImageData
const elevPending=new Map();
let elevBase=null;
let lastElevCenter={x:Infinity,z:Infinity};
let elevationBatchLoading=false;

function fallbackTerrain(x,z){
  // Mild procedural relief so the world is never perfectly flat while tiles load.
  return 5*Math.sin(x*.00023)+4*Math.sin(z*.00031)+2.5*Math.sin((x+z)*.00017);
}
function lonLatToTile(lon,lat,z){
  const n=2**z,latRad=lat*Math.PI/180;
  return {x:(lon+180)/360*n,y:(1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n};
}
function tileElevationAt(lat,lon){
  const t=lonLatToTile(lon,lat,ELEV_Z),tx=Math.floor(t.x),ty=Math.floor(t.y);
  const key=`${ELEV_Z}/${tx}/${ty}`;
  const im=WorldCache.get(elevTiles,key);
  if(!im)return null;

  // Bilinear interpolation between the four surrounding elevation pixels.
  // This avoids the "pixel staircase" effect of nearest-neighbour sampling.
  const fx=(t.x-tx)*im.width-.5, fy=(t.y-ty)*im.height-.5;
  const x0=Math.floor(fx),y0=Math.floor(fy),u=fx-x0,v=fy-y0;
  function sample(px,py){
    px=Math.max(0,Math.min(im.width-1,px));
    py=Math.max(0,Math.min(im.height-1,py));
    const k=(py*im.width+px)*4,R=im.data[k],G=im.data[k+1],B=im.data[k+2];
    return R*256+G+B/256-32768;
  }
  const e00=sample(x0,y0),e10=sample(x0+1,y0),e01=sample(x0,y0+1),e11=sample(x0+1,y0+1);
  const a=e00*(1-u)+e10*u,b=e01*(1-u)+e11*u;
  return a*(1-v)+b*v;
}
function terrainAbs(x,z){
  const ll=xzToLL(x,z);
  const e=tileElevationAt(ll.lat,ll.lon);
  if(e===null||!Number.isFinite(e)) return fallbackTerrain(x,z);
  if(elevBase===null)elevBase=e;
  return e-elevBase;
}
async function fetchElevationTile(tx,ty){
  const key=`${ELEV_Z}/${tx}/${ty}`;
  if(elevTiles.has(key))return true;
  if(elevPending.has(key))return elevPending.get(key);

  const task=(async()=>{
    // Two equivalent AWS endpoints. The whole image decode is covered by timeout,
    // not just the HTTP fetch.
    const urls=[
      `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${ELEV_Z}/${tx}/${ty}.png`,
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ELEV_Z}/${tx}/${ty}.png`
    ];

    async function loadOne(url,timeoutMs=4800){
      return await new Promise((resolve,reject)=>{
        const img=new Image();
        img.crossOrigin='anonymous';
        let done=false;
        const finish=(ok,value)=>{
          if(done)return;done=true;clearTimeout(timer);
          img.onload=null;img.onerror=null;
          ok?resolve(value):reject(value);
        };
        const timer=setTimeout(()=>finish(false,new Error('elevation image timeout')),timeoutMs);
        img.onload=()=>{
          try{
            const cv=document.createElement('canvas');
            cv.width=img.naturalWidth||256;cv.height=img.naturalHeight||256;
            const ctx=cv.getContext('2d',{willReadFrequently:true});
            ctx.drawImage(img,0,0);
            const data=ctx.getImageData(0,0,cv.width,cv.height);
            finish(true,data);
          }catch(e){finish(false,e)}
        };
        img.onerror=()=>finish(false,new Error('elevation image error'));
        img.src=url;
      });
    }

    try{
      let lastErr=null;
      for(const url of urls){
        try{
          const imageData=await loadOne(url,4800);
          WorldCache.touch(elevTiles,key,imageData);
          WorldCache.trim(elevTiles,WorldCache.limits.elevation);
          return true;
        }catch(e){lastErr=e;console.warn('Elevation endpoint failed',url,e)}
      }
      throw lastErr||new Error('elevation unavailable');
    }catch(e){
      console.warn('Elevation tile unavailable',key,e);
      return false;
    }finally{
      // Critical: no stale pending entry can permanently block future refreshes.
      elevPending.delete(key);
    }
  })();

  elevPending.set(key,task);
  return task;
}
async function loadElevationAround(absx,absz){
  if(elevationBatchLoading)return false;
  elevationBatchLoading=true;
  const ll=xzToLL(absx,absz),c=lonLatToTile(ll.lon,ll.lat,ELEV_Z),cx=Math.floor(c.x),cy=Math.floor(c.y);
  elevStatus.textContent='Chargement…';

  const jobs=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)jobs.push(fetchElevationTile(cx+dx,cy+dy));

  let res=[];
  try{
    // Hard deadline for the entire 3x3 batch. The visible world must continue.
    res=await Promise.race([
      Promise.all(jobs),
      new Promise(resolve=>setTimeout(()=>resolve(Array(9).fill(false)),5600))
    ]);
  }catch(e){
    console.warn('Elevation batch failed',e);
    res=Array(9).fill(false);
  }

  const available=()=>{
    let n=0;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      if(elevTiles.has(`${ELEV_Z}/${cx+dx}/${cy+dy}`))n++;
    }
    return n;
  };

  // Wait one micro-turn: a tile may have completed concurrently with the deadline.
  await Promise.resolve();
  const count=available();

  if(count>0){
    const ce=tileElevationAt(ll.lat,ll.lon);
    if(ce!==null&&Number.isFinite(ce)&&elevBase===null)elevBase=ce;

    lastElevCenter={x:absx,z:absz};
    elevStatus.textContent=count>=5?'Réel':`Partiel ${count}/9`;

    // Rebuild exactly once with whatever valid DEM coverage we have.
    rebuildLocalWorld();
    toast(count>=5?'Relief réel chargé':'Relief partiel chargé');
    elevationBatchLoading=false;
    return true;
  }

  // The procedural terrain remains active and drivable.
  elevStatus.textContent='Démo';
  lastElevCenter={x:absx,z:absz};
  console.warn('No DEM tiles available; keeping procedural terrain');
  elevationBatchLoading=false;
  return false;
}
function rebuildGroundTerrain(){
  // Near terrain LOD: dense enough for suspension/roadside detail.
  // Horizon rings handle the far field separately.
  const size=2000,seg=88;
  if(ground.geometry)ground.geometry.dispose();
  const geom=new THREE.PlaneGeometry(size,size,seg,seg);
  geom.rotateX(-Math.PI/2);
  const pos=geom.attributes.position;
  for(let i=0;i<pos.count;i++){
    const rx=pos.getX(i),rz=pos.getZ(i);
    pos.setY(i,terrainAbs(worldOffset.x+rx,worldOffset.z+rz)-.15);
  }
  pos.needsUpdate=true;geom.computeVertexNormals();
  ground.geometry=geom;
  ground.rotation.set(0,0,0);
  ground.position.set(0,0,0);
  applyImageryToGround();
}


// ---------- Materials ----------
function makeAsphalt(){
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#555a5e';ctx.fillRect(0,0,128,128);
 const d=ctx.getImageData(0,0,128,128);for(let i=0;i<d.data.length;i+=4){const n=(Math.random()-.5)*22;d.data[i]+=n;d.data[i+1]+=n;d.data[i+2]+=n}ctx.putImageData(d,0,0);
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1,4);t.colorSpace=THREE.SRGBColorSpace;return t;
}
const asphalt=makeAsphalt();
const roadMat=new THREE.MeshStandardMaterial({color:0xffffff,map:asphalt,roughness:.96});
const shoulderMat=new THREE.MeshStandardMaterial({color:0x89867a,roughness:1});
const lineYellow=new THREE.MeshBasicMaterial({color:0xe6c94f}),lineWhite=new THREE.MeshBasicMaterial({color:0xe8e8e6});
const treeTrunkMat=new THREE.MeshStandardMaterial({color:0x604532,roughness:1}),treeMat=new THREE.MeshStandardMaterial({color:0x315b35,roughness:1});
function makeWaterTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#2a6f96';ctx.fillRect(0,0,128,128);
  ctx.strokeStyle='rgba(255,255,255,.08)';
  ctx.lineWidth=1;
  for(let y=6;y<128;y+=10){
    ctx.beginPath();
    for(let x=0;x<=128;x+=8){
      const yy=y+Math.sin((x+y)*.12)*1.6;
      if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);
    }
    ctx.stroke();
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(18,18);
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
const waterTex=makeWaterTexture();

const waterMat=new THREE.MeshStandardMaterial({
  color:0x2a6f96,map:waterTex,roughness:.16,metalness:.12,
  transparent:true,opacity:.90,side:THREE.DoubleSide
});
const riverMat=new THREE.MeshStandardMaterial({
  color:0x2f7da7,map:waterTex,roughness:.18,metalness:.10,
  transparent:true,opacity:.93,side:THREE.DoubleSide
});
const coastWaterMat=new THREE.MeshStandardMaterial({
  color:0x235f86,map:waterTex,roughness:.14,metalness:.16,
  transparent:true,opacity:.94,side:THREE.DoubleSide
});
const waterStatus=$('waterStatus');
const hydroCacheStatus=$('hydroCacheStatus');

// ---------- V5.1.1 safe road metadata ----------
const roadTypeStatus=$('roadTypeStatus');
const roadSurfaceStatus=$('roadSurfaceStatus');
const osmSpeedStatus=$('osmSpeedStatus');
const signStatus=$('signStatus');

let activeRoadMeta={
  highway:null,surface:'asphalt',maxspeed:null,lanes:null,width:null,name:null,ref:null,
  confidence:0
};
let lastRoadMetaCenter={x:Infinity,z:Infinity};
let roadMetaLoading=false;

const geographicSigns=[];
let signDataLoading=false;
let lastSignDataCenter={x:Infinity,z:Infinity};

function parseMaxspeed(v){
  if(!v)return null;
  const t=String(v).toLowerCase().trim();
  const n=parseFloat(t);
  if(!Number.isFinite(n))return null;
  return t.includes('mph')?n*1.609344:n;
}
function roadSurfaceGrip(){
  const k=String(activeRoadMeta.surface||'asphalt').toLowerCase();
  if(k.includes('gravel'))return .74;
  if(['compacted','fine_gravel'].includes(k))return .80;
  if(['unpaved','dirt','ground','earth'].includes(k))return .64;
  if(k==='grass')return .54;
  return 1;
}
function safeRoadWidth(){
  // Conservative visual range, independent of suspicious metadata.
  const lanes=Math.max(1,Math.min(4,Number(activeRoadMeta.lanes)||2));
  const cls=activeRoadMeta.highway||'primary';
  let width=lanes*(['motorway','trunk'].includes(cls)?3.5:['primary','secondary'].includes(cls)?3.35:3.1);
  if(Number.isFinite(activeRoadMeta.width)&&activeRoadMeta.width>=4.5&&activeRoadMeta.width<=11.5){
    width=activeRoadMeta.width;
  }
  return Math.max(5.5,Math.min(9.5,width));
}
function updateRoadMetaHUD(){
  roadTypeStatus.textContent=activeRoadMeta.ref||activeRoadMeta.name||activeRoadMeta.highway||'—';
  roadSurfaceStatus.textContent=activeRoadMeta.surface||'—';
  osmSpeedStatus.textContent=activeRoadMeta.maxspeed?`${Math.round(activeRoadMeta.maxspeed)} km/h`:'—';
}

const waterFeatures=[]; // hydrography for the CURRENT generated route
const bridgeFeatures=[]; // bridges for the CURRENT generated route
let bridgeSpans=[];      // spans projected onto the current route cumulative distance
let bridgeRebuildCount=0;
const bridgeStatus=$('bridgeStatus');
let lastWaterCenter={x:Infinity,z:Infinity};
let waterLoading=false;
let hydroGeneration=0;
let hydroRequestSerial=0;
const waterAbortControllers=new Set();
const coastlineFeatures=[];

// ---------- V5.1.3 persistent hydro cache ----------
const HYDRO_CACHE_PREFIX='worlddrive_hydro_v1:';
const HYDRO_CACHE_TTL=1000*60*60*24*30; // 30 days
const HYDRO_CACHE_CELL=.04; // ~4 km latitude cells, coarse enough for route reuse

function hydroCellKey(lat,lon){
  const a=Math.floor(lat/HYDRO_CACHE_CELL);
  const b=Math.floor(lon/HYDRO_CACHE_CELL);
  return `${a}:${b}`;
}
function hydroCacheKey(lat,lon){return WorldCache.osmKey('hydro',lat,lon)}
async function readHydroCache(lat,lon){
  return OsmCache.get('hydro',lat,lon,HYDRO_CACHE_TTL);
}
async function writeHydroCache(lat,lon,data){
  return OsmCache.set('hydro',lat,lon,data);
}
async function hydroCacheCount(){
  return OsmCache.count('hydro');
}


function hydroQuery(ll){
  return `[out:json][timeout:14];(
    way(around:7000,${ll.lat},${ll.lon})["waterway"~"river|stream|canal|ditch"];
    way(around:7000,${ll.lat},${ll.lon})["waterway"="riverbank"];
    way(around:7000,${ll.lat},${ll.lon})["natural"="water"];
    relation(around:7000,${ll.lat},${ll.lon})["natural"="water"];
    way(around:7000,${ll.lat},${ll.lon})["landuse"="reservoir"];
    relation(around:7000,${ll.lat},${ll.lon})["landuse"="reservoir"];
    way(around:7000,${ll.lat},${ll.lon})["natural"="coastline"];
    way(around:7000,${ll.lat},${ll.lon})["highway"]["bridge"];
  );out geom;`;
}
function sceneryQuery(ll){
  return `[out:json][timeout:16];(
    way(around:4500,${ll.lat},${ll.lon})["building"];
    way(around:4500,${ll.lat},${ll.lon})["landuse"~"forest|meadow"];
    way(around:4500,${ll.lat},${ll.lon})["natural"~"wood|scrub|bare_rock|scree|cliff"];
    node(around:4500,${ll.lat},${ll.lon})["power"~"tower|pole"];
    way(around:4500,${ll.lat},${ll.lon})["power"~"line|minor_line"];
    way(around:4500,${ll.lat},${ll.lon})["man_made"="dam"];
    way(around:4500,${ll.lat},${ll.lon})["waterway"="dam"];
    way(around:4500,${ll.lat},${ll.lon})["barrier"="guard_rail"];
  );out geom;`;
}
function signQuery(ll){
  return `[out:json][timeout:12];(
    node(around:5000,${ll.lat},${ll.lon})["highway"="traffic_sign"];
    node(around:5000,${ll.lat},${ll.lon})["traffic_sign"];
    node(around:5000,${ll.lat},${ll.lon})["place"~"city|town|village|hamlet"]["name"];
    way(around:5000,${ll.lat},${ll.lon})["waterway"~"river|stream"]["name"];
    way(around:5000,${ll.lat},${ll.lon})["natural"="water"]["name"];
  );out tags geom center;`;
}
function roadMetaQuery(ll){
  return `[out:json][timeout:10];(
    way(around:90,${ll.lat},${ll.lon})["highway"];
  );out tags geom;`;
}

// ---------- V3 geographic scenery ----------
const sceneryStatus=$('sceneryStatus');
const sceneryFeatures=[];
let sceneryLoading=false;

let lastSceneryCenter={x:Infinity,z:Infinity};

// ---------- streamed aerial/satellite imagery ----------
const imageryStatus=$('imageryStatus');
let imageryEnabled=true;
const IMAGERY_Z=16;
const imageryTileCache=new Map(); // key -> HTMLImageElement
const imageryPending=new Map();
let imageryTexture=null;
let imageryLoading=false;
let lastImageryCenter={x:Infinity,z:Infinity};
let currentImageryBounds=null;

function lonLatToSlippy(lon,lat,z){
  const n=2**z,latRad=lat*Math.PI/180;
  return {
    x:(lon+180)/360*n,
    y:(1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n
  };
}
function slippyToLonLat(x,y,z){
  const n=2**z;
  return {
    lon:x/n*360-180,
    lat:Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI
  };
}
function imageryKey(x,y){ return `${IMAGERY_Z}/${x}/${y}`; }

function loadImageryTile(tx,ty,timeoutMs=5000){
  const key=imageryKey(tx,ty);
  const hit=WorldCache.get(imageryTileCache,key);
  if(hit)return Promise.resolve(hit);
  if(imageryPending.has(key))return imageryPending.get(key);

  const p=new Promise((resolve,reject)=>{
    const img=new Image();
    img.crossOrigin='anonymous';
    let done=false;
    const finish=(ok,val)=>{
      if(done)return; done=true; clearTimeout(timer); imageryPending.delete(key);
      if(ok){
        WorldCache.touch(imageryTileCache,key,val);
        WorldCache.trim(imageryTileCache,WorldCache.limits.imagery);
        resolve(val)
      } else reject(val);
    };
    const timer=setTimeout(()=>finish(false,new Error('imagery timeout')),timeoutMs);
    img.onload=()=>finish(true,img);
    img.onerror=()=>finish(false,new Error('imagery load error'));
    // ArcGIS World Imagery, public tiled map service.
    img.src=`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${IMAGERY_Z}/${ty}/${tx}`;
  });
  imageryPending.set(key,p);
  return p;
}

async function buildImageryMosaic(absx,absz){
  if(imageryLoading)return false;
  imageryLoading=true;
  imageryStatus.textContent='Chargement…';

  const ll=xzToLL(absx,absz);
  const t=lonLatToSlippy(ll.lon,ll.lat,IMAGERY_Z);
  const cx=Math.floor(t.x),cy=Math.floor(t.y);

  // 5x5 around vehicle: enough for the 1.8 km detailed ground patch at z16.
  const radius=2,count=5;
  const cv=document.createElement('canvas');
  cv.width=cv.height=count*256;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#627a4e';ctx.fillRect(0,0,cv.width,cv.height);

  let loaded=0;
  const jobs=[];
  for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++){
    const tx=cx+dx,ty=cy+dy;
    jobs.push(
      loadImageryTile(tx,ty).then(img=>{
        ctx.drawImage(img,(dx+radius)*256,(dy+radius)*256,256,256);
        loaded++;
      }).catch(()=>{})
    );
  }

  // Never stall the game waiting for imagery.
  await Promise.race([
    Promise.all(jobs),
    new Promise(resolve=>setTimeout(resolve,5600))
  ]);

  if(loaded<4){
    imageryStatus.textContent='Fallback';
    imageryLoading=false;
    return false;
  }

  if(imageryTexture)imageryTexture.dispose();
  imageryTexture=new THREE.CanvasTexture(cv);
  imageryTexture.colorSpace=THREE.SRGBColorSpace;
  imageryTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  imageryTexture.wrapS=THREE.ClampToEdgeWrapping;
  imageryTexture.wrapT=THREE.ClampToEdgeWrapping;

  const left=cx-radius,top=cy-radius,right=cx+radius+1,bottom=cy+radius+1;
  const nw=slippyToLonLat(left,top,IMAGERY_Z);
  const se=slippyToLonLat(right,bottom,IMAGERY_Z);

  const west=llToXZ(ll.lat,nw.lon).x;
  const east=llToXZ(ll.lat,se.lon).x;
  const north=llToXZ(nw.lat,ll.lon).z;
  const south=llToXZ(se.lat,ll.lon).z;

  currentImageryBounds={west,east,north,south};
  lastImageryCenter={x:absx,z:absz};

  applyImageryToGround();
  imageryStatus.textContent=`Réelle · ${loaded}/25`;
  imageryLoading=false;
  return true;
}

function applyImageryToGround(){
  if(!imageryEnabled||!imageryTexture||!currentImageryBounds){
    groundMat.map=null;
    groundMat.color.set(0x627a4e);
    groundMat.needsUpdate=true;
    return;
  }
  groundMat.map=imageryTexture;
  groundMat.color.set(0xffffff);

  // Ground is 2000m square centered on current floating origin.
  const size=2000, half=size/2;
  const b=currentImageryBounds;
  const spanX=b.east-b.west;
  const spanZ=b.south-b.north;

  const absWest=worldOffset.x-half, absEast=worldOffset.x+half;
  const absNorth=worldOffset.z-half, absSouth=worldOffset.z+half;

  const u0=(absWest-b.west)/spanX;
  const u1=(absEast-b.west)/spanX;
  const vTop=(absNorth-b.north)/spanZ;
  const vBottom=(absSouth-b.north)/spanZ;

  imageryTexture.offset.set(u0,1-vBottom);
  imageryTexture.repeat.set(u1-u0,vBottom-vTop);
  imageryTexture.needsUpdate=true;
  groundMat.needsUpdate=true;
}

$('imageryToggle').addEventListener('click',()=>{
  imageryEnabled=!imageryEnabled;
  $('imageryToggle').textContent='Photo: '+(imageryEnabled?'ON':'OFF');
  imageryStatus.textContent=imageryEnabled?(imageryTexture?'Réelle':'Attente'):'OFF';
  applyImageryToGround();
});


const buildingWallMat=new THREE.MeshStandardMaterial({color:0xa9a49a,roughness:.90,metalness:.01});
const roofMat=new THREE.MeshStandardMaterial({color:0x686c70,roughness:.84});
const rockMat=new THREE.MeshStandardMaterial({color:0x777a75,roughness:1});
const scrubMat=new THREE.MeshStandardMaterial({color:0x526b43,roughness:1,transparent:true,opacity:.88});
const towerMat=new THREE.MeshStandardMaterial({color:0x6a6f74,metalness:.55,roughness:.44});
const lineMatPower=new THREE.LineBasicMaterial({color:0x43484d,transparent:true,opacity:.72});
const railMat=new THREE.MeshStandardMaterial({color:0x8c8f91,metalness:.48,roughness:.4});
const damMat=new THREE.MeshStandardMaterial({color:0x777c80,roughness:.72,metalness:.12});
const bridgeDeckMat=new THREE.MeshStandardMaterial({color:0x6f7376,roughness:.82,metalness:.08});

function featureCentroid(points){
  let x=0,z=0;
  if(!points.length)return{x:0,z:0};
  for(const p of points){x+=p.x;z+=p.z}
  return{x:x/points.length,z:z/points.length};
}



// ---------- Car ----------
const car=new THREE.Group();

// ID.4-inspired compact electric crossover proportions — generic, no brand marks.
const bodyMat=new THREE.MeshStandardMaterial({color:0xbfc4c9,metalness:.32,roughness:.30});
const lowerMat=new THREE.MeshStandardMaterial({color:0x20252a,metalness:.10,roughness:.45});
const glassMat=new THREE.MeshStandardMaterial({color:0x182936,metalness:.18,roughness:.18,transparent:true,opacity:.88});
const lightMat=new THREE.MeshBasicMaterial({color:0xeaf5ff});
const tailMat=new THREE.MeshBasicMaterial({color:0x8b1825});
const brakeLampMat=new THREE.MeshBasicMaterial({color:0x8b1825});
const wheelMat=new THREE.MeshStandardMaterial({color:0x111418,metalness:.25,roughness:.38});
const rimMat=new THREE.MeshStandardMaterial({color:0xa7adb2,metalness:.65,roughness:.24});

// Lower battery-floor / rocker area
const floor=new THREE.Mesh(new THREE.BoxGeometry(1.98,.34,4.55),lowerMat);
floor.position.y=.55;floor.castShadow=true;car.add(floor);

// Main rounded crossover body
const bodyGeom=new THREE.BoxGeometry(1.92,.70,4.38,3,2,5);
const body= new THREE.Mesh(bodyGeom,bodyMat);
body.position.y=.91;body.castShadow=true;car.add(body);

// soften body silhouette by slightly scaling end vertices
{
  const p=body.geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const z=p.getZ(i), y=p.getY(i);
    const end=Math.min(1,Math.abs(z)/2.19);
    if(y>.05){
      p.setX(i,p.getX(i)*(1-.07*end));
      p.setY(i,p.getY(i)-.08*end);
    }
  }
  p.needsUpdate=true;body.geometry.computeVertexNormals();
}

// Sloped glasshouse / panoramic roof
const cabinGeom=new THREE.BoxGeometry(1.68,.78,2.45,2,2,4);
const cabin=new THREE.Mesh(cabinGeom,glassMat);
cabin.position.set(0,1.48,-.18);
cabin.castShadow=true;
car.add(cabin);
{
  const p=cabin.geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const z=p.getZ(i), y=p.getY(i);
    if(y>0){
      const taper=.10+.12*Math.abs(z)/1.225;
      p.setX(i,p.getX(i)*(1-taper));
    }
    // more sloped windshield/front roof
    if(z>0)p.setY(i,p.getY(i)-.12*(z/1.225));
  }
  p.needsUpdate=true;cabin.geometry.computeVertexNormals();
}

// Body-colored hood and rear shoulders
const hood=new THREE.Mesh(new THREE.BoxGeometry(1.72,.22,1.18),bodyMat);
hood.position.set(0,1.18,1.50);hood.rotation.x=-.035;hood.castShadow=true;car.add(hood);

const rearDeck=new THREE.Mesh(new THREE.BoxGeometry(1.76,.18,.80),bodyMat);
rearDeck.position.set(0,1.16,-1.73);rearDeck.rotation.x=.025;rearDeck.castShadow=true;car.add(rearDeck);

// Panoramic roof panel
const roof=new THREE.Mesh(new THREE.BoxGeometry(1.34,.035,1.58),glassMat);
roof.position.set(0,1.89,-.26);roof.rotation.x=-.015;car.add(roof);

// Continuous front light bar + slim headlights
const frontBar=new THREE.Mesh(new THREE.BoxGeometry(1.50,.055,.05),lightMat);
frontBar.position.set(0,1.02,2.205);car.add(frontBar);
for(const x of [-.68,.68]){
  const lamp=new THREE.Mesh(new THREE.BoxGeometry(.34,.12,.055),lightMat);
  lamp.position.set(x,1.00,2.215);car.add(lamp);
}

// Rear red light bar
const rearBar=new THREE.Mesh(new THREE.BoxGeometry(1.56,.08,.05),tailMat);
rearBar.position.set(0,1.06,-2.205);car.add(rearBar);

const brakeLamps=[];
for(const x of [-.62,.62]){
  const lamp=new THREE.Mesh(new THREE.BoxGeometry(.34,.15,.055),brakeLampMat);
  lamp.position.set(x,1.03,-2.215);
  car.add(lamp);brakeLamps.push(lamp);
}
let brakeLightLevel=0;
const brakeBaseColor=new THREE.Color(0x8b1825);
const brakeHotColor=new THREE.Color(0xff3048);
function updateBrakeLights(dt,braking){
  const target=braking?1:0;
  brakeLightLevel+=(target-brakeLightLevel)*(1-Math.exp(-dt*(braking?14:7)));
  tailMat.color.copy(brakeBaseColor).lerp(brakeHotColor,brakeLightLevel);
  brakeLampMat.color.copy(brakeBaseColor).lerp(brakeHotColor,brakeLightLevel);
}

// Black front/rear lower valances
const frontValance=new THREE.Mesh(new THREE.BoxGeometry(1.72,.24,.18),lowerMat);
frontValance.position.set(0,.66,2.18);car.add(frontValance);
const rearValance=new THREE.Mesh(new THREE.BoxGeometry(1.72,.23,.18),lowerMat);
rearValance.position.set(0,.66,-2.18);car.add(rearValance);

// Wheel arches / wheels
// Front wheels use a steering pivot group. Tire/rim spin INSIDE the pivot,
// so wheel roll and steering never fight each other through Euler rotations.
const wheels=[];
const frontWheelPivots=[];
for(const x of [-.86,.86])for(const z of [-1.22,1.22]){
  const pivot=new THREE.Group();
  pivot.position.set(x,0,z);
  car.add(pivot);

  const tire=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.27,20),wheelMat);
  tire.rotation.z=Math.PI/2;
  tire.castShadow=true;
  pivot.add(tire);

  const rim=new THREE.Mesh(new THREE.CylinderGeometry(.235,.235,.285,10),rimMat);
  rim.rotation.z=Math.PI/2;
  pivot.add(rim);

  wheels.push({pivot,tire,rim,front:z>0});
  if(z>0)frontWheelPivots.push(pivot);
}

// Subtle wheel-arch trim
for(const x of [-.83,.83])for(const z of [-1.22,1.22]){
  const arch=new THREE.Mesh(new THREE.TorusGeometry(.41,.05,8,18,Math.PI),lowerMat);
  arch.rotation.y=Math.PI/2;
  arch.rotation.z=(x<0?Math.PI/2:-Math.PI/2);
  arch.position.set(x,.59,z);
  car.add(arch);
}

// Side mirrors
for(const x of [-1.02,1.02]){
  const mirror=new THREE.Mesh(new THREE.BoxGeometry(.16,.14,.28),lowerMat);
  mirror.position.set(x,1.46,.53);mirror.castShadow=true;car.add(mirror);
}

// Separate sprung body from unsprung wheel assemblies.
// Everything except wheel pivots becomes the sprung visual body.
const bodyGroup=new THREE.Group();
const wheelPivotSet=new Set(wheels.map(w=>w.pivot));
const sprungChildren=car.children.filter(c=>!wheelPivotSet.has(c));
for(const child of sprungChildren){
  car.remove(child);
  bodyGroup.add(child);
}
car.add(bodyGroup);
// Lower the sprung body relative to wheel centers for compact-crossover proportions.
// Keeps a modest wheel-arch gap instead of an off-road / lifted stance.
bodyGroup.position.y=-.22;

// Suspension visual state
let suspensionRoll=0;
let suspensionPitch=0;
let suspensionHeave=0;
let lastWheelGround=[0,0,0,0];

// Slightly larger crossover scale than old sedan-like box
car.scale.set(.80,.80,.80);
scene.add(car);

function clearGroup(g){while(g.children.length){const c=g.children.pop();c.traverse?.(o=>{if(o.geometry)o.geometry.dispose();if(o.material&&![roadMat,shoulderMat,lineYellow,lineWhite,treeTrunkMat,treeMat].includes(o.material)){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}})}}
function segMesh(ax,az,bx,bz,width,mat,y=.05){
 const a=toRender(ax,az),b=toRender(bx,bz),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.12)return null;
 const m=new THREE.Mesh(new THREE.BoxGeometry(width,.10,len),mat);const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
 m.position.set(mx,terrainAbs((ax+bx)/2,(az+bz)/2)+y,mz);m.rotation.y=Math.atan2(dx,dz);m.receiveShadow=true;return m
}
function nearestRoute(x,z){
 let best=null,bd=Infinity;
 // spatial shortcut: search all segments (~few thousand) is okay, but retain squared distance.
 for(let i=0;i<segments.length;i++){const s=segments[i],vx=s.bx-s.ax,vz=s.bz-s.az,wx=x-s.ax,wz=z-s.az,vv=vx*vx+vz*vz||1,t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv)),px=s.ax+t*vx,pz=s.az+t*vz,dx=x-px,dz=z-pz,d2=dx*dx+dz*dz;if(d2<bd){bd=d2;best={...s,i,t,px,pz,d:Math.sqrt(d2),angle:Math.atan2(vx,vz),cum:s.cum+t*s.len}}}
 return best
}
function routePointAt(frac){
 const target=Math.max(0,Math.min(1,frac))*routeLength;
 let lo=0,hi=segments.length-1;
 while(lo<hi){const m=(lo+hi)>>1;if(segments[m].cum+segments[m].len<target)lo=m+1;else hi=m}
 const s=segments[lo],t=Math.max(0,Math.min(1,(target-s.cum)/(s.len||1)));
 return {x:s.ax+(s.bx-s.ax)*t,z:s.az+(s.bz-s.az)*t,angle:Math.atan2(s.bx-s.ax,s.bz-s.az),cum:target}
}
function routePointAtCum(target){
 target=Math.max(0,Math.min(routeLength,target));
 let lo=0,hi=segments.length-1;
 while(lo<hi){const m=(lo+hi)>>1;if(segments[m].cum+segments[m].len<target)lo=m+1;else hi=m}
 const q=segments[lo],t=Math.max(0,Math.min(1,(target-q.cum)/(q.len||1)));
 return {x:q.ax+(q.bx-q.ax)*t,z:q.az+(q.bz-q.az)*t,angle:Math.atan2(q.bx-q.ax,q.bz-q.az),cum:target};
}
function angleDelta(target,current){
  return Math.atan2(Math.sin(target-current),Math.cos(target-current));
}







function nearestPointOnPolyline(x,z,pts){
  let best={d:Infinity,angle:0};
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1];
    const vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z;
    const vv=vx*vx+vz*vz||1;
    const t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
    const px=a.x+vx*t,pz=a.z+vz*t;
    const d=Math.hypot(x-px,z-pz);
    if(d<best.d)best={d,angle:Math.atan2(vx,vz)};
  }
  return best;
}

async function loadRoadMetadataAround(absx,absz){
  if(roadMetaLoading)return false;
  roadMetaLoading=true;
  const generation=WorldDrive?.route?.generation??0;
  const ll=xzToLL(absx,absz);
  const routeNear=nearestRoute(absx,absz);

  const q=roadMetaQuery(ll);
  const {data}=await fetchOverpassCached('roadmeta',ll,q,6000,1000*60*60*24*7);

  if(generation!==(WorldDrive?.route?.generation??0)){
    roadMetaLoading=false;return false;
  }

  let winner=null,bestScore=Infinity;
  if(data&&routeNear){
    for(const e of data.elements||[]){
      if(!e.geometry?.length||!e.tags?.highway)continue;
      const pts=e.geometry.map(p=>{const q=llToXZ(p.lat,p.lon);return{x:q.x,z:q.z}});
      const np=nearestPointOnPolyline(absx,absz,pts);
      const angleDiff=Math.abs(angleDelta(np.angle,routeNear.angle));
      const aligned=Math.min(angleDiff,Math.abs(Math.PI-angleDiff));

      // Strict correlation: must be close to car AND aligned with active route.
      // Service/driveway candidates are penalized unless extremely well aligned.
      if(np.d>22||aligned>0.38)continue; // ~22m and ~22°
      let score=np.d + aligned*28;
      if(['service','track','path','footway'].includes(e.tags.highway))score+=12;
      if(score<bestScore){bestScore=score;winner=e}
    }
  }

  if(winner){
    const t=winner.tags||{};
    const lanes=parseInt(t.lanes||'',10);
    const width=parseFloat(t.width||'');
    activeRoadMeta={
      highway:t.highway||null,
      surface:t.surface||'asphalt',
      maxspeed:parseMaxspeed(t.maxspeed),
      lanes:Number.isFinite(lanes)?lanes:null,
      width:Number.isFinite(width)?width:null,
      name:t.name||null,
      ref:t.ref||null,
      confidence:Math.max(0,1-bestScore/45)
    };
  }else{
    // Safe fallback: do NOT mutate route geometry based on uncertain metadata.
    activeRoadMeta={
      highway:null,surface:'asphalt',maxspeed:null,lanes:null,width:null,name:null,ref:null,confidence:0
    };
  }

  lastRoadMetaCenter={x:absx,z:absz};
  updateRoadMetaHUD();
  if(activeRoadProfile.length)rebuildLocalWorld();
  roadMetaLoading=false;
  return !!winner;
}


// ---------- V5.1.7 geographic sign data ----------
function routeCorrelationForPoint(x,z,maxDistance=55){
  const n=nearestRoute(x,z);
  if(!n||n.d>maxDistance)return null;
  return n;
}
function extractWaterName(tags={}){
  return tags['name:fr']||tags.name||tags.official_name||null;
}
async function loadGeographicSignsAround(absx,absz){
  if(signDataLoading)return false;
  signDataLoading=true;
  const generation=WorldDrive?.route?.generation??0;
  const ll=xzToLL(absx,absz);

  const q=signQuery(ll);
  const {data}=await fetchOverpassCached('signs',ll,q,6500,1000*60*60*24*10);

  if(generation!==(WorldDrive?.route?.generation??0)){signDataLoading=false;return false}

  if(data){
    const known=new Set(geographicSigns.map(f=>f.key));
    for(const e of data.elements||[]){
      const tags=e.tags||{};
      let lat=e.lat,lon=e.lon;
      if((lat==null||lon==null)&&e.center){lat=e.center.lat;lon=e.center.lon}
      if((lat==null||lon==null)&&e.geometry?.length){
        const mid=e.geometry[Math.floor(e.geometry.length/2)];lat=mid.lat;lon=mid.lon;
      }
      if(lat==null||lon==null)continue;
      const p=llToXZ(lat,lon),near=routeCorrelationForPoint(p.x,p.z,85);
      if(!near)continue;

      let kind=null,label=null,maxspeed=null;
      const signTag=tags.traffic_sign||'';
      if(tags.highway==='traffic_sign'||signTag){
        const speedMatch=String(signTag).match(/(?:maxspeed[:=]?|CA:)?(\d{2,3})/i);
        if(speedMatch){
          kind='speed';maxspeed=parseFloat(speedMatch[1]);label=String(Math.round(maxspeed));
        }
      }

      if(!kind&&tags.place&&tags.name){
        kind='city';label=tags['name:fr']||tags.name;
      }

      if(!kind&&(tags.waterway||tags.natural==='water')){
        const wn=extractWaterName(tags);
        if(wn){kind='river';label=wn}
      }

      if(!kind||!label)continue;
      const key=`${kind}:${e.type}:${e.id}:${label}`;
      if(known.has(key))continue;

      geographicSigns.push({
        key,kind,label,maxspeed,
        x:p.x,z:p.z,
        routeCum:near.cum,
        routeDistance:near.d
      });
      known.add(key);
    }
  }

  lastSignDataCenter={x:absx,z:absz};
  signStatus.textContent=String(geographicSigns.length);
  signDataLoading=false;
  if(activeRoadProfile.length)rebuildLocalWorld();
  return true;
}


function nearestRouteCumToFeature(points){
  let best=null,bd=Infinity;
  for(const p of points||[]){
    const n=nearestRoute(p.x,p.z);
    if(n&&n.d<bd){bd=n.d;best=n}
  }
  return best&&bd<120?best:null;
}


function collectEndpointLocalitySigns(){
  const candidates=[
    {p:ROUTE_START,cum:0},
    {p:ROUTE_END,cum:routeLength}
  ];
  const known=new Set(geographicSigns.filter(x=>x.kind==='city').map(x=>String(x.label).toLowerCase()));
  for(const c of candidates){
    const label=c.p?.name;
    if(!label||/^(départ|arrivée|waypoint)$/i.test(label)||known.has(String(label).toLowerCase()))continue;
    geographicSigns.push({
      key:`city:endpoint:${c.cum}:${label}`,
      kind:'city',
      label,
      maxspeed:null,
      x:0,z:0,
      routeCum:c.cum,
      routeDistance:0,
      fallback:true
    });
    known.add(String(label).toLowerCase());
  }
}

function collectFallbackRiverSigns(){
  const existing=new Set(geographicSigns.filter(x=>x.kind==='river').map(x=>String(x.label).toLowerCase()));
  for(const f of waterFeatures||[]){
    const tags=f.tags||{};
    const label=tags['name:fr']||tags.name||tags.official_name;
    if(!label||existing.has(String(label).toLowerCase()))continue;

    const n=nearestRouteCumToFeature(f.points);
    if(!n)continue;

    geographicSigns.push({
      key:`river:fallback:${f.type||'way'}:${f.id}:${label}`,
      kind:'river',
      label,
      maxspeed:null,
      x:n.px,z:n.pz,
      routeCum:n.cum,
      routeDistance:n.d,
      fallback:true
    });
    existing.add(String(label).toLowerCase());
  }
}

function addFallbackSpeedSign(){
  if(!activeRoadMeta.maxspeed||activeRoadMeta.confidence<=.20)return;
  const n=nearestRoute(absX,absZ);if(!n)return;

  // If no explicit OSM speed sign is near the vehicle, show one representative
  // sign for the active road section.
  const hasNearby=geographicSigns.some(f=>f.kind==='speed'&&Math.abs(f.routeCum-n.cum)<900);
  if(hasNearby)return;

  const p=routePointAtCum(Math.min(routeLength,n.cum+95));
  p.y=roadHeightAt(p.x,p.z);
  addRoadSignAt(p,Math.round(activeRoadMeta.maxspeed),'speed',1);
}

function addGeographicRoadSigns(){
  collectFallbackRiverSigns();
  collectEndpointLocalitySigns();
  if(!routeLength)return;
  const n=nearestRoute(absX,absZ);if(!n)return;

  addFallbackSpeedSign();

  signStatus.textContent=String(geographicSigns.length);
  for(const f of geographicSigns){
    if(Math.abs(f.routeCum-n.cum)>1600)continue;
    let cum=f.routeCum,side=1;
    if(f.kind==='river')cum=Math.max(0,f.routeCum-22);
    else if(f.kind==='city')cum=Math.max(0,f.routeCum-55);

    const p=routePointAtCum(cum);
    p.y=roadHeightAt(p.x,p.z);
    const label=f.kind==='speed'?Math.round(f.maxspeed||Number(f.label)):f.label;
    addRoadSignAt(p,label,f.kind,side);
  }
}
// ---------- geographic scenery rendering ----------
function makeFootprintMesh(points,height=6,material=buildingWallMat){
  if(points.length<3)return null;
  const local=points.map(p=>({x:p.x-worldOffset.x,z:p.z-worldOffset.z}));
  const shape=new THREE.Shape();
  shape.moveTo(local[0].x,-local[0].z);
  for(let i=1;i<local.length;i++)shape.lineTo(local[i].x,-local[i].z);
  shape.closePath();
  const geom=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});
  geom.rotateX(-Math.PI/2);
  const c=featureCentroid(points);
  const mesh=new THREE.Mesh(geom,material);
  mesh.position.y=terrainAbs(c.x,c.z)+.08;
  mesh.castShadow=true;mesh.receiveShadow=true;
  return mesh;
}

function addUtilityTower(x,z,scale=1){
  const g=new THREE.Group();
  const y=terrainAbs(x,z);
  const legs=[];
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(.07,.11,10*scale,5),towerMat);
    leg.position.set((x-worldOffset.x)+sx*.9*scale,y+5*scale,(z-worldOffset.z)+sz*.7*scale);
    leg.rotation.z=sx*.06;g.add(leg);legs.push(leg);
  }
  for(const h of [4,7.2,9.2]){
    const bar=new THREE.Mesh(new THREE.BoxGeometry(5.2*scale,.12,.12),towerMat);
    bar.position.set(x-worldOffset.x,y+h*scale,z-worldOffset.z);g.add(bar);
  }
  return g;
}

function addDam(points){
  if(points.length<2)return null;
  const g=new THREE.Group();
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    if(len<1)continue;
    const h=14;
    const m=new THREE.Mesh(new THREE.BoxGeometry(6,h,len),damMat);
    const mx=(a.x+b.x)/2-worldOffset.x,mz=(a.z+b.z)/2-worldOffset.z;
    m.position.set(mx,Math.min(terrainAbs(a.x,a.z),terrainAbs(b.x,b.z))+h/2,mz);
    m.rotation.y=Math.atan2(dx,dz);m.castShadow=true;m.receiveShadow=true;g.add(m);
  }
  return g;
}

function addGuardRail(points){
  const g=new THREE.Group();
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    if(len<.5)continue;
    const m=new THREE.Mesh(new THREE.BoxGeometry(.10,.18,len),railMat);
    const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
    m.position.set(mx-worldOffset.x,terrainAbs(mx,mz)+.72,mz-worldOffset.z);
    m.rotation.y=Math.atan2(dx,dz);g.add(m);
  }
  return g;
}

function addPowerLine(points){
  const g=new THREE.Group();
  if(points.length<2)return g;
  const verts=[];
  for(const p of points){
    verts.push(p.x-worldOffset.x,terrainAbs(p.x,p.z)+14,p.z-worldOffset.z);
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  const line=new THREE.Line(geom,lineMatPower);g.add(line);
  return g;
}

function addLandPatch(points,mat,yOffset=.03){
  if(points.length<3)return null;
  const local=points.map(p=>({x:p.x-worldOffset.x,z:p.z-worldOffset.z}));
  const shape=new THREE.Shape();
  shape.moveTo(local[0].x,-local[0].z);
  for(let i=1;i<local.length;i++)shape.lineTo(local[i].x,-local[i].z);
  shape.closePath();
  const geom=new THREE.ShapeGeometry(shape);geom.rotateX(-Math.PI/2);
  const c=featureCentroid(points);
  const m=new THREE.Mesh(geom,mat);
  m.position.y=terrainAbs(c.x,c.z)+yOffset;
  m.receiveShadow=true;return m;
}


function pointInPolygon2D(x,z,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const xi=points[i].x,zi=points[i].z,xj=points[j].x,zj=points[j].z;
    const hit=((zi>z)!==(zj>z)) && (x < (xj-xi)*(z-zi)/((zj-zi)||1e-9)+xi);
    if(hit)inside=!inside;
  }
  return inside;
}
function pointSegDist2D(px,pz,a,b){
  const vx=b.x-a.x,vz=b.z-a.z,wx=px-a.x,wz=pz-a.z;
  const vv=vx*vx+vz*vz||1;
  const t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
  return Math.hypot(px-(a.x+vx*t),pz-(a.z+vz*t));
}
function isWaterAt(x,z,margin=5){
  for(const f of waterFeatures){
    if(!f.points?.length)continue;
    if(f.kind==='polygon'){
      if(pointInPolygon2D(x,z,f.points))return true;
      // Also reject close to shoreline to avoid trunks at water edge.
      for(let i=0;i<f.points.length;i++){
        const a=f.points[i],b=f.points[(i+1)%f.points.length];
        if(pointSegDist2D(x,z,a,b)<margin)return true;
      }
    }else{
      const half=Math.max(margin,waterWidth(f.tags)*.55+margin);
      for(let i=0;i<f.points.length-1;i++){
        if(pointSegDist2D(x,z,f.points[i],f.points[i+1])<half)return true;
      }
    }
  }
  return false;
}
function removeTreesOverWater(){
  // Existing forest may predate an asynchronous hydro response.
  // Remove any procedural tree pair whose ground point is now classified as water.
  const remove=[];
  for(const child of forestGroup.children){
    const ax=child.position.x+worldOffset.x,az=child.position.z+worldOffset.z;
    if(isWaterAt(ax,az,4))remove.push(child);
  }
  for(const child of remove){
    forestGroup.remove(child);
    child.geometry?.dispose?.();
  }
}

function densifyForestPolygon(points,id){
  const c=featureCentroid(points);
  // inexpensive deterministic cluster near centroid; OSM polygon gives location, not each tree.
  let seed=(Number(id)||1)*2654435761;
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const g=new THREE.Group();
  const radius=Math.min(180,Math.max(35,Math.sqrt(points.length)*26));
  for(let i=0;i<28;i++){
    const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*radius;
    const x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r;
    if(!pointInPolygon2D(x,z,points))continue;
    if(isWaterAt(x,z,6))continue;
    const nr=nearestRoute(x,z);if(nr&&nr.d<13)continue;
    const scale=.65+rnd()*.9,y=terrainAbs(x,z);
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.10*scale,.16*scale,1.5*scale,5),treeTrunkMat);
    trunk.position.set(x-worldOffset.x,y+.75*scale,z-worldOffset.z);
    const crown=new THREE.Mesh(new THREE.ConeGeometry(.78*scale,3.2*scale,6),treeMat);
    crown.position.set(x-worldOffset.x,y+2.25*scale,z-worldOffset.z);
    g.add(trunk,crown);
  }
  return g;
}


function makeBuildingLOD(points,tags,dist){
  if(dist<520)return makeFootprintMesh(points,(()=>{
    let h=parseFloat(tags.height||'');
    if(!Number.isFinite(h)){
      const levels=parseFloat(tags['building:levels']||'');
      h=Number.isFinite(levels)?Math.max(3,levels*3.1):6.5;
    }
    return Math.min(45,h);
  })());

  // Mid-distance proxy: one cheap box per footprint.
  const c=featureCentroid(points);
  let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;
  for(const p of points){minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z)}
  const w=Math.max(3,Math.min(35,maxx-minx)),d=Math.max(3,Math.min(35,maxz-minz));
  const h=Math.max(4,Math.min(18,parseFloat(tags.height||'')||7));
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),buildingWallMat);
  m.position.set(c.x-worldOffset.x,terrainAbs(c.x,c.z)+h/2,c.z-worldOffset.z);
  m.castShadow=dist<750;m.receiveShadow=true;
  return m;
}
function rebuildLocalScenery(){
  clearGroup(terrainDetailGroup);clearGroup(infrastructureGroup);clearGroup(buildingGroup);
  const R=1500,R2=R*R;
  let shown=0;

  for(const f of sceneryFeatures){
    const c=featureCentroid(f.points);
    const dx=c.x-worldOffset.x,dz=c.z-worldOffset.z;
    const dist2=dx*dx+dz*dz;
    if(dist2>R2)continue;
    const dist=Math.sqrt(dist2);

    const t=f.tags||{};
    let obj=null;

    if(t.building && dist<1150){
      obj=makeBuildingLOD(f.points,t,dist);
      if(obj)buildingGroup.add(obj);
    }
    else if((t.power==='tower'||t.power==='pole') && dist<1400){
      obj=addUtilityTower(c.x,c.z,t.power==='pole'?.6:1);
      infrastructureGroup.add(obj);
    }
    else if(t.power==='line'||t.power==='minor_line'){
      infrastructureGroup.add(addPowerLine(f.points));
    }
    else if(t.man_made==='dam'||t.waterway==='dam'){
      obj=addDam(f.points);if(obj)infrastructureGroup.add(obj);
    }
    else if(t.barrier==='guard_rail'){
      infrastructureGroup.add(addGuardRail(f.points));
    }
    else if(t.natural==='bare_rock'||t.natural==='scree'||t.natural==='cliff'){
      obj=addLandPatch(f.points,rockMat,.04);if(obj)terrainDetailGroup.add(obj);
    }
    else if(t.natural==='scrub'||t.landuse==='meadow'){
      obj=addLandPatch(f.points,scrubMat,.035);if(obj)terrainDetailGroup.add(obj);
    }
    else if((t.natural==='wood'||t.landuse==='forest') && dist<1150){
      // Near forest is dense; mid-distance forest is intentionally thinned.
      const cluster=densifyForestPolygon(f.points,f.id);
      if(cluster){
        if(dist>700){
          for(let i=cluster.children.length-1;i>=0;i--){
            if(i%2)cluster.remove(cluster.children[i]);
          }
        }
        forestGroup.add(cluster);
      }
    }
    shown++;
  }
  sceneryStatus.textContent=`${shown} objets`;
}

async function loadSceneryAround(absx,absz){
  if(sceneryLoading)return;
  sceneryLoading=true;
  sceneryStatus.textContent='Chargement…';

  try{
    const ll=xzToLL(absx,absz);
    const q=sceneryQuery(ll);
    const {data,cached}=await fetchOverpassCached('scenery',ll,q,8500,1000*60*60*24*10);

    if(data){
      const known=new Set(sceneryFeatures.map(f=>`${f.type}/${f.id}`));
      for(const e of data.elements||[]){
        const key=`${e.type}/${e.id}`;if(known.has(key))continue;
        let pts=[];
        if(e.geometry?.length){
          pts=e.geometry.map(p=>{const q=llToXZ(p.lat,p.lon);return{x:q.x,z:q.z}});
        }else if(Number.isFinite(e.lat)&&Number.isFinite(e.lon)){
          const q=llToXZ(e.lat,e.lon);pts=[{x:q.x,z:q.z}];
        }
        if(!pts.length)continue;
        sceneryFeatures.push({id:e.id,type:e.type,points:pts,tags:e.tags||{}});
        known.add(key);
      }
      lastSceneryCenter={x:absx,z:absz};
      rebuildLocalScenery();
      sceneryStatus.textContent=`${cached?'Cache':'OSM'} · ${sceneryFeatures.length} objets`;
    }else{
      sceneryStatus.textContent='Indisponible';
    }
  }catch(e){
    console.warn('Scenery load failed',e);
    sceneryStatus.textContent='Indisponible';
  }finally{
    sceneryLoading=false;
  }
}

// ---------- bridge logic ----------
function projectPointToRoute(x,z){
  const n=nearestRoute(x,z);
  return n?{cum:n.cum,d:n.d,x:n.px,z:n.pz}:null;
}
function rebuildBridgeSpans(){
  const spans=[];
  for(const b of bridgeFeatures){
    if(!b.points||b.points.length<2)continue;
    const projections=b.points.map(p=>projectPointToRoute(p.x,p.z)).filter(Boolean);
    if(!projections.length)continue;
    // Ignore unrelated bridges that happen to be inside the Overpass radius.
    const close=projections.filter(p=>p.d<22);
    if(close.length<2)continue;
    let c0=Math.min(...close.map(p=>p.cum)), c1=Math.max(...close.map(p=>p.cum));
    if(c1-c0<3)continue;

    // Sample well onto the approaches so the deck never inherits river-bed elevation.
    const approach=45;
    const aCum=Math.max(0,c0-approach), bCum=Math.min(routeLength,c1+approach);
    const a=routePointAtCum(aCum), bb=routePointAtCum(bCum);
    const y0=terrainAbs(a.x,a.z), y1=terrainAbs(bb.x,bb.z);

    spans.push({
      id:b.id,
      start:c0,end:c1,
      rampStart:aCum,rampEnd:bCum,
      y0,y1,
      length:c1-c0
    });
  }
  spans.sort((a,b)=>a.start-b.start);
  bridgeSpans=spans;
  bridgeRebuildCount++;
  bridgeStatus.textContent=`${spans.length} · r${bridgeRebuildCount}`;
}
function bridgeHeightAtCum(cum){
  for(const b of bridgeSpans){
    if(cum<b.rampStart||cum>b.rampEnd)continue;
    const t=(cum-b.rampStart)/Math.max(.001,b.rampEnd-b.rampStart);
    // Smooth grade transition from one approach to the other.
    // The deck remains above the valley/river because no interior terrain sample is used.
    const smooth=t*t*(3-2*t);
    return b.y0+(b.y1-b.y0)*smooth;
  }
  return null;
}

// ---------- continuous road ribbon ----------
function buildRibbon(points,width,material,yOffset=0){
  if(points.length<2)return null;
  const pos=[],uv=[],idx=[];
  let cumulative=0;
  for(let i=0;i<points.length;i++){
    const p=points[i];
    const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
    let tx=next.x-prev.x,tz=next.z-prev.z;
    const tl=Math.hypot(tx,tz)||1;tx/=tl;tz/=tl;
    const nx=-tz,nz=tx;
    if(i>0)cumulative+=Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z);
    const y=p.y+yOffset;
    pos.push(p.x-worldOffset.x+nx*width/2,y,p.z-worldOffset.z+nz*width/2);
    pos.push(p.x-worldOffset.x-nx*width/2,y,p.z-worldOffset.z-nz*width/2);
    uv.push(0,cumulative/8,1,cumulative/8);
    if(i<points.length-1){
      const a=i*2;
      idx.push(a,a+2,a+1,a+2,a+3,a+1);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,material);m.receiveShadow=true;return m;
}
function buildRoadProfile(){
  // Find a little more than the visible corridor so the ribbon never ends at screen edge.
  const R=1050,R2=R*R,raw=[];
  for(const seg of segments){
    const mx=(seg.ax+seg.bx)/2,mz=(seg.az+seg.bz)/2,dx=mx-worldOffset.x,dz=mz-worldOffset.z;
    if(dx*dx+dz*dz>R2)continue;
    const steps=Math.max(1,Math.ceil(seg.len/5)); // <=5 m vertical samples
    for(let k=0;k<steps;k++){
      const t=k/steps,x=seg.ax+(seg.bx-seg.ax)*t,z=seg.az+(seg.bz-seg.az)*t,cum=seg.cum+seg.len*t;
      if(!raw.length||Math.hypot(x-raw[raw.length-1].x,z-raw[raw.length-1].z)>.4)raw.push({x,z,y:terrainAbs(x,z),cum});
    }
  }
  if(!raw.length)return raw;

  // Add last endpoint.
  const lastSeg=segments.findLast ? segments.findLast(seg=>{
    const mx=(seg.ax+seg.bx)/2,mz=(seg.az+seg.bz)/2,dx=mx-worldOffset.x,dz=mz-worldOffset.z;
    return dx*dx+dz*dz<=R2;
  }) : null;
  if(lastSeg)raw.push({x:lastSeg.bx,z:lastSeg.bz,y:terrainAbs(lastSeg.bx,lastSeg.bz),cum:lastSeg.cum+lastSeg.len});

  // Two-pass weighted smoothing on HEIGHT ONLY.
  // Horizontal geometry remains the exact routing polyline, preserving every curve.
  let heights=raw.map(p=>p.y);
  for(let pass=0;pass<2;pass++){
    const h2=heights.slice();
    for(let i=2;i<heights.length-2;i++){
      h2[i]=(heights[i-2]+2*heights[i-1]+4*heights[i]+2*heights[i+1]+heights[i+2])/10;
    }
    heights=h2;
  }
  // Bridges override the terrain-following height AFTER normal road smoothing.
  // This is what prevents a road deck from dipping into the river/valley below.
  for(let i=0;i<raw.length;i++){
    const by=bridgeHeightAtCum(raw[i].cum);
    if(by!==null)heights[i]=by;
  }

  // Light pass at bridge approach boundaries only, retaining the deck itself.
  const finalH=heights.slice();
  for(let i=1;i<heights.length-1;i++){
    const here=bridgeHeightAtCum(raw[i].cum);
    if(here===null){
      const nearBridge=bridgeSpans.some(b=>Math.abs(raw[i].cum-b.rampStart)<18||Math.abs(raw[i].cum-b.rampEnd)<18);
      if(nearBridge)finalH[i]=(heights[i-1]+2*heights[i]+heights[i+1])/4;
    }
  }
  return raw.map((p,i)=>({x:p.x,z:p.z,y:finalH[i],cum:p.cum}));
}
let activeRoadProfile=[];
function roadFrameAt(x,z){
  // Returns height + the local 3D road tangent from the closest profile segment.
  let best=null,bd=Infinity;
  for(let i=0;i<activeRoadProfile.length-1;i++){
    const a=activeRoadProfile[i],b=activeRoadProfile[i+1];
    const vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z;
    const vv=vx*vx+vz*vz||1,t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
    const px=a.x+t*vx,pz=a.z+t*vz,d2=(x-px)**2+(z-pz)**2;
    if(d2<bd){
      const horizontal=Math.hypot(vx,vz)||1;
      const pitch=Math.atan2(b.y-a.y,horizontal);
      bd=d2;
      best={
        y:a.y+(b.y-a.y)*t,
        angle:Math.atan2(vx,vz),
        pitch,
        px,pz,
        index:i,t,
        distance:Math.sqrt(d2)
      };
    }
  }
  return best;
}
function roadHeightAt(x,z){
  const f=roadFrameAt(x,z);
  return f?f.y:terrainAbs(x,z);
}
function terrainFrameAt(x,z,heading){
  // Compute the terrain gradient in WORLD X/Z, independent of vehicle heading.
  // This avoids the Euler-axis problem from v2.3.
  const d=2.5;
  const hL=terrainAbs(x-d,z), hR=terrainAbs(x+d,z);
  const hN=terrainAbs(x,z-d), hS=terrainAbs(x,z+d);
  const hC=terrainAbs(x,z);

  const dhdx=(hR-hL)/(2*d);
  const dhdz=(hS-hN)/(2*d);

  // Surface normal for y = h(x,z): (-dh/dx, 1, -dh/dz)
  const up=new THREE.Vector3(-dhdx,1,-dhdz).normalize();

  // Desired horizontal travel direction from vehicle heading.
  const forward=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));

  // Project travel direction onto terrain plane.
  forward.addScaledVector(up,-forward.dot(up));
  if(forward.lengthSq()<1e-8) forward.set(0,0,1);
  forward.normalize();

  // Right-handed basis: local car X=right, Y=up, Z=forward.
  const right=new THREE.Vector3().crossVectors(up,forward).normalize();
  const correctedForward=new THREE.Vector3().crossVectors(right,up).normalize();

  const basis=new THREE.Matrix4().makeBasis(right,up,correctedForward);
  const quaternion=new THREE.Quaternion().setFromRotationMatrix(basis);

  return {
    y:hC,
    up,
    forward:correctedForward,
    right,
    quaternion,
    slope:Math.sqrt(dhdx*dhdx+dhdz*dhdz)
  };
}
function ensureRoadProfileNear(x,z){
  // Rebuild immediately when coming back toward the road after an off-road excursion.
  const nr=nearestRoute(x,z);
  if(!nr)return null;

  let frame=roadFrameAt(x,z);
  const profileMissing=!frame || frame.distance>40 || activeRoadProfile.length<2;

  if(nr.d<80 && profileMissing){
    // Center the local road corridor on the vehicle right now instead of waiting
    // for the normal 360 m floating-origin threshold.
    recenterIfNeeded(x,z,true);
    frame=roadFrameAt(x,z);
  }
  return frame;
}


// ---------- Manicouagan / local hydrography ----------
function waterWidth(tags={}){
  if(tags.width){
    const w=parseFloat(String(tags.width).replace(',','.'));
    if(Number.isFinite(w))return Math.max(5,Math.min(220,w));
  }
  if(tags.waterway==='river')return 34;
  if(tags.waterway==='stream')return 7;
  return 18;
}
function addWaterRibbon(points,width,material){
  if(points.length<2)return null;
  // Keep water visually smooth and slightly above surrounding terrain.
  // Rivers should read as water, not painted terrain. Use a lightly smoothed
  // profile and keep the surface slightly above the DEM.
  const raw=points.map(p=>terrainAbs(p.x,p.z));
  const h=raw.slice();
  for(let i=1;i<h.length-1;i++)h[i]=(raw[i-1]+2*raw[i]+raw[i+1])/4;
  const prof=points.map((p,i)=>({x:p.x,z:p.z,y:h[i]+.28}));
  return buildRibbon(prof,width,material,0);
}
function simplifyWaterPoints(points,maxPoints=700){
  if(points.length<=maxPoints)return points;
  const step=Math.ceil(points.length/maxPoints),out=[];
  for(let i=0;i<points.length;i+=step)out.push(points[i]);
  if(out.length>=3)return out;
  return points.slice(0,maxPoints);
}

function addWaterPolygon(points){
  if(points.length<3)return null;
  points=simplifyWaterPoints(points);

  const local=points.map(p=>({x:p.x-worldOffset.x,z:p.z-worldOffset.z,y:terrainAbs(p.x,p.z)}));
  const shape=new THREE.Shape();
  shape.moveTo(local[0].x,-local[0].z);
  for(let i=1;i<local.length;i++)shape.lineTo(local[i].x,-local[i].z);
  shape.closePath();

  let geom;
  try{
    geom=new THREE.ShapeGeometry(shape);
    geom.rotateX(-Math.PI/2);
  }catch(e){
    console.warn('Large water polygon triangulation failed',e);
    return null;
  }

  const heights=local.map(p=>p.y).filter(Number.isFinite).sort((a,b)=>a-b);
  const qIndex=Math.max(0,Math.min(heights.length-1,Math.floor(heights.length*.18)));
  const level=heights.length?heights[qIndex]:0;

  const m=new THREE.Mesh(geom,waterMat);
  m.position.y=level+.30;
  m.renderOrder=2;
  m.receiveShadow=false;
  return m;
}

function rebuildCoastalWater(){
  if(!coastlineFeatures.length)return;

  const R=2200,R2=R*R;
  const coastWidth=3400;

  for(const f of coastlineFeatures){
    const pts=f.points||[];
    if(pts.length<2)continue;

    // Work feature-by-feature instead of concatenating unrelated coastlines.
    let featureNear=false;
    for(const p of pts){
      const dx=p.x-worldOffset.x,dz=p.z-worldOffset.z;
      if(dx*dx+dz*dz<R2){featureNear=true;break}
    }
    if(!featureNear)continue;

    const usable=simplifyWaterPoints(pts,500);
    const samples=usable.map(p=>terrainAbs(p.x,p.z)).filter(Number.isFinite).sort((a,b)=>a-b);
    const level=samples.length?samples[Math.floor(samples.length*.12)]:0;

    const pos=[],idx=[];
    for(let i=0;i<usable.length;i++){
      const p=usable[i],prev=usable[Math.max(0,i-1)],next=usable[Math.min(usable.length-1,i+1)];
      let tx=next.x-prev.x,tz=next.z-prev.z,tl=Math.hypot(tx,tz)||1;tx/=tl;tz/=tl;
      let nx=-tz,nz=tx;

      // Determine water side locally. This handles curved coastline much better.
      const probe=180;
      const hA=terrainAbs(p.x+nx*probe,p.z+nz*probe);
      const hB=terrainAbs(p.x-nx*probe,p.z-nz*probe);
      if(hA>hB){nx=-nx;nz=-nz}

      const lx=p.x-worldOffset.x,lz=p.z-worldOffset.z;
      pos.push(lx,level+.20,lz);
      pos.push(lx+nx*coastWidth,level+.20,lz+nz*coastWidth);
      if(i<usable.length-1){
        const a=i*2;idx.push(a,a+2,a+1,a+2,a+3,a+1);
      }
    }
    if(idx.length<3)continue;

    const geom=new THREE.BufferGeometry();
    geom.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geom.setIndex(idx);geom.computeVertexNormals();

    const m=new THREE.Mesh(geom,coastWaterMat);
    m.renderOrder=1;m.receiveShadow=false;
    waterGroup.add(m);
  }
}

function rebuildLocalWater(){
  clearGroup(waterGroup);
  const R=1650,R2=R*R;
  let shown=0;
  rebuildCoastalWater();

  for(const f of waterFeatures){
    let near=false;
    for(const p of f.points){
      const dx=p.x-worldOffset.x,dz=p.z-worldOffset.z;
      if(dx*dx+dz*dz<R2){near=true;break}
    }
    if(!near)continue;
    let mesh=null;
    if(f.kind==='polygon')mesh=addWaterPolygon(f.points);
    else mesh=addWaterRibbon(f.points,waterWidth(f.tags),f.tags?.waterway==='river'?riverMat:waterMat);
    if(mesh){waterGroup.add(mesh);shown++}
  }
  if(shown)waterStatus.textContent='OSM';
}

async function updateHydroCacheHUD(){
  if(!hydroCacheStatus)return;
  const n=await hydroCacheCount();
  hydroCacheStatus.textContent=`Cache IDB: ${n} zone${n!==1?'s':''}`;
}
updateHydroCacheHUD().catch(()=>{});

async function loadWaterAround(absx,absz){
  if(waterLoading)return false;

  const generation=hydroGeneration;
  const requestId=++hydroRequestSerial;
  waterLoading=true;

  const ll=xzToLL(absx,absz);

  // Persistent cache first: no network if this geographic cell was already loaded.
  const cached=await readHydroCache(ll.lat,ll.lon);
  if(cached){
    waterStatus.textContent='Cache IDB…';
  }else{
    waterStatus.textContent='Chargement OSM…';
  }

  const q=hydroQuery(ll);

  const endpoints=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  let data=cached;
  if(!data)for(const endpoint of endpoints){
    if(generation!==hydroGeneration)break;

    const ctl=new AbortController();
    waterAbortControllers.add(ctl);
    const timer=setTimeout(()=>ctl.abort(),9000);

    try{
      const r=await fetch(endpoint,{
        method:'POST',
        body:new URLSearchParams({data:q}),
        signal:ctl.signal,
        cache:'no-store'
      });
      if(!r.ok)throw new Error('HTTP '+r.status);
      const candidate=await r.json();

      if(generation!==hydroGeneration)return false;

      data=candidate;
      if(data)break;
    }catch(e){
      if(generation===hydroGeneration)console.warn('Hydro Overpass failed',endpoint,e);
    }finally{
      clearTimeout(timer);
      waterAbortControllers.delete(ctl);
    }
  }

  if(generation!==hydroGeneration)return false;

  if(data && !cached){
    await writeHydroCache(ll.lat,ll.lon,data);
    updateHydroCacheHUD().catch(()=>{});
  }

  if(data){
    const knownWater=new Set(waterFeatures.map(f=>`${f.type||'way'}/${f.id}`));
    const knownBridge=new Set(bridgeFeatures.map(f=>`${f.type||'way'}/${f.id}`));

    for(const e of data.elements||[]){
      if(!e.geometry||e.geometry.length<2)continue;

      const pts=e.geometry.map(p=>{
        const q=llToXZ(p.lat,p.lon);
        return{x:q.x,z:q.z};
      });

      const featureKey=`${e.type||'way'}/${e.id}`;

      if(e.tags?.highway && e.tags?.bridge){
        if(!knownBridge.has(featureKey)){
          bridgeFeatures.push({id:e.id,type:e.type||'way',points:pts,tags:e.tags||{},generation});
          knownBridge.add(featureKey);
        }
        continue;
      }

      if(e.tags?.natural==='coastline'){
        coastlineFeatures.push({
          id:e.id,type:e.type||'way',points:pts,tags:e.tags||{},generation
        });
        continue;
      }

      const isWater=
        !!e.tags?.waterway ||
        e.tags?.natural==='water' ||
        e.tags?.landuse==='reservoir';

      if(!isWater||knownWater.has(featureKey))continue;

      const isArea=
        e.tags?.natural==='water' ||
        e.tags?.landuse==='reservoir' ||
        e.tags?.waterway==='riverbank';

      waterFeatures.push({
        id:e.id,
        type:e.type||'way',
        kind:isArea&&pts.length>=3?'polygon':'line',
        points:pts,
        tags:e.tags||{},
        generation
      });
      knownWater.add(featureKey);
    }

    if(generation!==hydroGeneration)return false;

    rebuildBridgeSpans();
    lastWaterCenter={x:absx,z:absz};

    // Hydro can arrive after vegetation. Purge trees that were generated before
    // the shoreline/water geometry was known.
    removeTreesOverWater();

    const waterCount=waterFeatures.length;
    const coastCount=coastlineFeatures.length;
    waterStatus.textContent=`${cached?'Cache':'OSM'} · ${waterCount} eau${waterCount!==1?'x':''}${coastCount?` · côte ${coastCount}`:''}`;
    bridgeStatus.textContent=`${bridgeSpans.length} · r${bridgeRebuildCount}`;

    rebuildLocalWorld();
    waterLoading=false;
    return true;
  }

  waterStatus.textContent='Indisponible';
  waterLoading=false;
  return false;
}


function rebuildHorizon(){
  clearGroup(horizonGroup);

  // Overlap the 2.0 km near terrain from ~850 m onward.
  // Rings progressively reduce segment count and increase opacity,
  // creating a much softer near/far hand-off.
  const rings=[
    {r0:850,r1:1150,segs:80,opacity:.28,yOff:-.42},
    {r0:1100,r1:1550,segs:64,opacity:.52,yOff:-.50},
    {r0:1500,r1:2150,segs:48,opacity:.78,yOff:-.58},
    {r0:2100,r1:3000,segs:36,opacity:1.0,yOff:-.66}
  ];

  for(const ring of rings){
    const pos=[],idx=[];
    for(let i=0;i<=ring.segs;i++){
      const a=i/ring.segs*Math.PI*2;
      for(const r of [ring.r0,ring.r1]){
        const ax=worldOffset.x+Math.cos(a)*r,az=worldOffset.z+Math.sin(a)*r;
        pos.push(Math.cos(a)*r,terrainAbs(ax,az)+ring.yOff,Math.sin(a)*r);
      }
    }
    for(let i=0;i<ring.segs;i++){
      const a=i*2;idx.push(a,a+2,a+1,a+2,a+3,a+1);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setIndex(idx);g.computeVertexNormals();
    const mat=new THREE.MeshStandardMaterial({
      color:0x60744f,roughness:1,side:THREE.DoubleSide,
      transparent:ring.opacity<1,opacity:ring.opacity,depthWrite:ring.opacity>.7
    });
    const m=new THREE.Mesh(g,mat);
    m.receiveShadow=ring.r0<1200;
    m.renderOrder=-2;
    horizonGroup.add(m);
  }
}


function addBridgeStructures(){
  // Deprecated visual deck layer remains disabled: road ribbon is the ONLY roadway.
  return;
}


// ---------- V5.1.2 signs + enhanced bridge furniture ----------
const signPoleMat=new THREE.MeshStandardMaterial({color:0x74787b,roughness:.72,metalness:.45});
const signBackMat=new THREE.MeshStandardMaterial({color:0x9a9d9f,roughness:.65,metalness:.25});
const bridgeRailMat=new THREE.MeshStandardMaterial({color:0xb8bcc0,roughness:.55,metalness:.55});
const bridgeConcreteMat=new THREE.MeshStandardMaterial({color:0xa6a49b,roughness:.95});
const bridgeGirderMat=new THREE.MeshStandardMaterial({color:0x666b70,roughness:.62,metalness:.38});
const bridgeUndersideMat=new THREE.MeshStandardMaterial({color:0x808287,roughness:.82,metalness:.12});
const bridgeFasciaMat=new THREE.MeshStandardMaterial({color:0x70757a,roughness:.74,metalness:.22});
const bridgeBearingMat=new THREE.MeshStandardMaterial({color:0x4d5053,roughness:.58,metalness:.48});

function makeSignTexture(text,kind='speed'){
 const c=document.createElement('canvas');c.width=384;c.height=256;
 const x=c.getContext('2d');x.textAlign='center';x.textBaseline='middle';
 if(kind==='speed'){
  x.fillStyle='rgba(0,0,0,0)';x.fillRect(0,0,c.width,c.height);
  x.fillStyle='#fff';x.beginPath();x.arc(192,128,104,0,Math.PI*2);x.fill();
  x.lineWidth=18;x.strokeStyle='#d62828';x.stroke();
  x.fillStyle='#111';x.font='bold 92px Arial';x.fillText(String(text),192,132);
 }else{
  let bg='#176d45',fg='#fff',border='#fff';
  if(kind==='river')bg='#296b9b';
  if(kind==='city'){bg='#fff';fg='#111';border='#111'}
  x.fillStyle=bg;x.fillRect(12,40,360,176);
  x.lineWidth=7;x.strokeStyle=border;x.strokeRect(20,48,344,160);
  x.fillStyle=fg;
  const words=String(text||'').replace(/\|/g,' ').split(/\s+/);
  let lines=[''];
  for(const w of words){
    const k=lines.length-1;
    if((lines[k]+' '+w).trim().length>18&&lines.length<3)lines.push(w);
    else lines[k]=(lines[k]+' '+w).trim();
  }
  x.font=kind==='city'?'bold 43px Arial':'bold 38px Arial';
  const lineH=48,y0=128-(lines.length-1)*lineH/2;
  lines.slice(0,3).forEach((t,i)=>x.fillText(t,192,y0+i*lineH));
 }
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function addRoadSignAt(p,text,kind='speed',side=1){
 if(!p)return;
 const ang=p.angle??0,lateral=side*4.45,nx=Math.cos(ang),nz=-Math.sin(ang),g=new THREE.Group();
 const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,2.15,8),signPoleMat);pole.position.y=1.18;g.add(pole);
 const geom=kind==='speed'
   ?new THREE.CircleGeometry(.46,28)
   :new THREE.PlaneGeometry(kind==='city'?2.15:1.95,1.02);
 const face=new THREE.Mesh(geom,new THREE.MeshStandardMaterial({map:makeSignTexture(text,kind),side:THREE.DoubleSide,roughness:.72}));
 face.position.y=2.28;face.rotation.y=side>0?Math.PI:0;g.add(face);
 const back=new THREE.Mesh(geom,signBackMat);back.position.copy(face.position);back.rotation.y=face.rotation.y+Math.PI;g.add(back);
 g.position.set(p.x+nx*lateral-worldOffset.x,p.y+.02,p.z+nz*lateral-worldOffset.z);g.rotation.y=ang;infrastructureGroup.add(g);
}
function addBridgeRailFromProfile(a,b,side){
 const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.4)return;
 const ang=Math.atan2(dx,dz);
 const nx=Math.cos(ang),nz=-Math.sin(ang);
 // Align to the actual road edge. Main asphalt is 7.5m wide in this build.
 const off=side*4.15;

 // Rail beam follows exact road-profile heights.
 const rail=new THREE.Mesh(new THREE.BoxGeometry(.10,.18,len),bridgeRailMat);
 rail.position.set(
   (a.x+b.x)/2+nx*off-worldOffset.x,
   (a.y+b.y)/2+.48,
   (a.z+b.z)/2+nz*off-worldOffset.z
 );
 rail.rotation.y=ang;
 infrastructureGroup.add(rail);

 // Posts also interpolate directly between exact profile heights.
 const posts=Math.max(1,Math.floor(len/3.2));
 for(let i=0;i<=posts;i++){
   const t=i/posts;
   const px=a.x+(b.x-a.x)*t+nx*off;
   const pz=a.z+(b.z-a.z)*t+nz*off;
   const py=a.y+(b.y-a.y)*t;
   const post=new THREE.Mesh(new THREE.BoxGeometry(.09,.62,.09),bridgeRailMat);
   post.position.set(px-worldOffset.x,py+.20,pz-worldOffset.z);
   infrastructureGroup.add(post);
 }
}
function addEnhancedBridgeFurniture(){
 if(!activeRoadProfile?.length||!bridgeSpans?.length)return;

 for(const b of bridgeSpans){
   const pts=activeRoadProfile.filter(p=>p.cum>=b.start&&p.cum<=b.end);
   if(pts.length<2)continue;

   // 1) Guardrails follow the exact roadway profile.
   for(let i=0;i<pts.length-1;i++){
     addBridgeRailFromProfile(pts[i],pts[i+1],-1);
     addBridgeRailFromProfile(pts[i],pts[i+1],1);
   }

   // 2) Build true 3D under-structure segment-by-segment so side views
   // follow vertical curvature and don't look like one flat slab.
   for(let i=0;i<pts.length-1;i++){
     const a=pts[i],c=pts[i+1];
     const dx=c.x-a.x,dz=c.z-a.z,len=Math.hypot(dx,dz);
     if(len<.35)continue;

     const ang=Math.atan2(dx,dz);
     const nx=Math.cos(ang),nz=-Math.sin(ang);
     const my=(a.y+c.y)/2;

     // Main underside slab.
     const slab=new THREE.Mesh(new THREE.BoxGeometry(8.0,.62,len),bridgeUndersideMat);
     slab.position.set((a.x+c.x)/2-worldOffset.x,my-.64,(a.z+c.z)/2-worldOffset.z);
     slab.rotation.y=ang;
     slab.castShadow=true;slab.receiveShadow=true;
     infrastructureGroup.add(slab);

     // Strong side fascias: these are what make the bridge readable in profile.
     for(const side of [-1,1]){
       const off=side*3.72;
       const fascia=new THREE.Mesh(new THREE.BoxGeometry(.34,1.18,len),bridgeFasciaMat);
       fascia.position.set(
         (a.x+c.x)/2+nx*off-worldOffset.x,
         my-.93,
         (a.z+c.z)/2+nz*off-worldOffset.z
       );
       fascia.rotation.y=ang;
       fascia.castShadow=true;
       infrastructureGroup.add(fascia);

       // Inner longitudinal girders set in from the fascia.
       const girder=new THREE.Mesh(new THREE.BoxGeometry(.38,.82,len),bridgeGirderMat);
       girder.position.set(
         (a.x+c.x)/2+nx*(side*2.35)-worldOffset.x,
         my-1.18,
         (a.z+c.z)/2+nz*(side*2.35)-worldOffset.z
       );
       girder.rotation.y=ang;
       girder.castShadow=true;
       infrastructureGroup.add(girder);
     }
   }

   // 3) Cross-beams under the deck at fixed longitudinal spacing.
   const startCum=pts[0].cum,endCum=pts[pts.length-1].cum;
   const total=Math.max(0,endCum-startCum);
   const crossCount=Math.max(2,Math.floor(total/10));
   for(let i=1;i<crossCount;i++){
     const cum=startCum+total*i/crossCount;
     const p=routePointAtCum(cum);
     const y=bridgeHeightAtCum(cum)??roadHeightAt(p.x,p.z);
     const beam=new THREE.Mesh(new THREE.BoxGeometry(7.25,.32,.42),bridgeGirderMat);
     beam.position.set(p.x-worldOffset.x,y-1.18,p.z-worldOffset.z);
     beam.rotation.y=p.angle+Math.PI/2;
     infrastructureGroup.add(beam);
   }

   // 4) Abutments + visible bearings at bridge ends.
   for(const p of [pts[0],pts[pts.length-1]]){
     const idx=activeRoadProfile.indexOf(p);
     const p0=activeRoadProfile[Math.max(0,idx-1)];
     const p1=activeRoadProfile[Math.min(activeRoadProfile.length-1,idx+1)];
     const ang=Math.atan2(p1.x-p0.x,p1.z-p0.z);

     const ab=new THREE.Mesh(new THREE.BoxGeometry(8.9,1.15,.92),bridgeConcreteMat);
     ab.position.set(p.x-worldOffset.x,p.y-.78,p.z-worldOffset.z);
     ab.rotation.y=ang;
     ab.castShadow=true;ab.receiveShadow=true;
     infrastructureGroup.add(ab);

     for(const side of [-1,1]){
       const nx=Math.cos(ang),nz=-Math.sin(ang);
       const bearing=new THREE.Mesh(new THREE.BoxGeometry(.68,.18,.54),bridgeBearingMat);
       bearing.position.set(
         p.x+nx*(side*2.35)-worldOffset.x,
         p.y-1.03,
         p.z+nz*(side*2.35)-worldOffset.z
       );
       bearing.rotation.y=ang;
       infrastructureGroup.add(bearing);
     }
   }

   // 5) Piers for longer spans, with wider caps and footings.
   if(total>30){
     const pierCount=Math.max(1,Math.min(4,Math.floor(total/38)));
     for(let i=1;i<=pierCount;i++){
       const cum=startCum+total*i/(pierCount+1);
       const p=routePointAtCum(cum);
       const deckY=bridgeHeightAtCum(cum)??roadHeightAt(p.x,p.z);
       const groundY=terrainAbs(p.x,p.z);
       const h=Math.max(1.8,deckY-groundY-1.1);

       const pier=new THREE.Mesh(new THREE.BoxGeometry(1.35,h,.88),bridgeConcreteMat);
       pier.position.set(p.x-worldOffset.x,groundY+h/2,p.z-worldOffset.z);
       pier.rotation.y=p.angle;
       pier.castShadow=true;pier.receiveShadow=true;
       infrastructureGroup.add(pier);

       const cap=new THREE.Mesh(new THREE.BoxGeometry(6.8,.62,1.25),bridgeConcreteMat);
       cap.position.set(p.x-worldOffset.x,deckY-1.52,p.z-worldOffset.z);
       cap.rotation.y=p.angle+Math.PI/2;
       cap.castShadow=true;
       infrastructureGroup.add(cap);

       const footing=new THREE.Mesh(new THREE.BoxGeometry(2.2,.55,1.7),bridgeConcreteMat);
       footing.position.set(p.x-worldOffset.x,groundY+.18,p.z-worldOffset.z);
       footing.rotation.y=p.angle;
       footing.receiveShadow=true;
       infrastructureGroup.add(footing);
     }
   }
 }
}
function addCurrentRoadSigns(){
 if(activeRoadMeta.confidence<=.25)return;
 const n=nearestRoute(absX,absZ);if(!n)return;
 const label=activeRoadMeta.ref||activeRoadMeta.name;
 if(label){
  const p=routePointAtCum(Math.min(routeLength,n.cum+170));p.y=roadHeightAt(p.x,p.z);
  addRoadSignAt(p,String(label).slice(0,28),'guide',1);
 }
}

// Build only a corridor around the current location, preserving every source polyline curve.
function rebuildLocalWorld(){
 clearGroup(roadGroup);clearGroup(forestGroup);
 clearGroup(terrainDetailGroup);clearGroup(infrastructureGroup);clearGroup(buildingGroup);

 // CRITICAL: bridge deck heights depend on terrain elevation at their approaches.
 // Elevation tiles, floating-origin shifts and asynchronous loads can all change
 // terrainAbs(). Recompute bridge spans BEFORE rebuilding the road every time.
 if(bridgeFeatures.length) rebuildBridgeSpans();

 const profile=buildRoadProfile();
 activeRoadProfile=profile;
 if(profile.length>1){
   const shoulder=buildRibbon(profile,10.4,shoulderMat,.035);if(shoulder)roadGroup.add(shoulder);
   const asphaltRoad=buildRibbon(profile,7.5,roadMat,.10);if(asphaltRoad)roadGroup.add(asphaltRoad);
   const center=buildRibbon(profile,.13,lineYellow,.165);if(center)roadGroup.add(center);

   // Edge lines: derive horizontally offset profiles but reuse the exact smoothed height.
   for(const side of [-1,1]){
     const edge=[];
     for(let i=0;i<profile.length;i++){
       const p=profile[i],prev=profile[Math.max(0,i-1)],next=profile[Math.min(profile.length-1,i+1)];
       let tx=next.x-prev.x,tz=next.z-prev.z,tl=Math.hypot(tx,tz)||1;tx/=tl;tz/=tl;
       const nx=-tz,nz=tx,off=3.45*side;
       edge.push({x:p.x+nx*off,z:p.z+nz*off,y:p.y});
     }
     const em=buildRibbon(edge,.10,lineWhite,.16);if(em)roadGroup.add(em);
   }
 }

 // lightweight boreal forest, deterministic around the current render origin
 let seed=Math.floor(worldOffset.x/90)*73856093 ^ Math.floor(worldOffset.z/90)*19349663;
 function rnd(){seed=(seed*1664525+1013904223)|0;return ((seed>>>0)/4294967296)}
 for(let i=0;i<170;i++){
   const rx=(rnd()-.5)*1700,rz=(rnd()-.5)*1700,absx=worldOffset.x+rx,absz=worldOffset.z+rz,n=nearestRoute(absx,absz);
   if(n&&n.d<16)continue;
   if(isWaterAt(absx,absz,7))continue;
   const scale=.7+rnd()*.8,y=terrainAbs(absx,absz),dist=Math.hypot(rx,rz);
   // Vegetation LOD: full tree nearby, crown-only mid-range, sparse far edge.
   if(dist<520){
     const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.12*scale,.18*scale,1.5*scale,6),treeTrunkMat);trunk.position.set(rx,y+.75*scale,rz);
     const crown=new THREE.Mesh(new THREE.ConeGeometry(.9*scale,3.4*scale,7),treeMat);crown.position.set(rx,y+2.35*scale,rz);
     forestGroup.add(trunk,crown);
   }else if(dist<900 || i%3===0){
     const crown=new THREE.Mesh(new THREE.ConeGeometry(.9*scale,3.4*scale,6),treeMat);crown.position.set(rx,y+2.15*scale,rz);
     forestGroup.add(crown);
   }
 }
 rebuildGroundTerrain();
 rebuildLocalWater();
 rebuildLocalScenery();
 addEnhancedBridgeFurniture();
 addCurrentRoadSigns();
 addGeographicRoadSigns();
 rebuildHorizon();
}
function recenterIfNeeded(absx,absz,force=false){
 const dx=absx-worldOffset.x,dz=absz-worldOffset.z;
 if(force||dx*dx+dz*dz>360*360){
   // Preserve camera/car relative geometry across the floating-origin shift.
   // Before: render coordinate = absolute - oldOffset
   // After : render coordinate = absolute - newOffset
   // Therefore every existing render-space object/camera must be shifted by -(new-old).
   const shiftX=absx-worldOffset.x;
   const shiftZ=absz-worldOffset.z;
   worldOffset={x:absx,z:absz};

   camera.position.x -= shiftX;
   camera.position.z -= shiftZ;
   camTarget.x -= shiftX;
   camTarget.z -= shiftZ;

   // car position is updated immediately after this function, but shifting it here
   // prevents a one-frame mismatch if rendering occurs during a forced recenter.
   car.position.x -= shiftX;
   car.position.z -= shiftZ;

   rebuildLocalWorld();
   applyImageryToGround();
   return true;
 }
 return false
}


function resetWorldCaches(){
  hydroGeneration++;
  for(const ctl of waterAbortControllers){try{ctl.abort()}catch(e){}}
  waterAbortControllers.clear();
  waterLoading=false;

  route.length=0;segments.length=0;routeLength=0;
  waterFeatures.length=0;bridgeFeatures.length=0;bridgeSpans.length=0;
  coastlineFeatures.length=0;
  waterStatus.textContent='Réinitialisé';
  bridgeStatus.textContent='0';
  clearGroup(waterGroup);

  sceneryFeatures.length=0;
  // Keep completed elevation/imagery LRU caches across route changes.
  // Only in-flight operations and route-relative state are reset.
  elevPending.clear();elevBase=null;
  imageryPending.clear();
  if(imageryTexture){imageryTexture.dispose();imageryTexture=null;}
  currentImageryBounds=null;
  lastElevCenter={x:Infinity,z:Infinity};
  elevationBatchLoading=false;
  lastWaterCenter={x:Infinity,z:Infinity};
  lastSceneryCenter={x:Infinity,z:Infinity};
  lastImageryCenter={x:Infinity,z:Infinity};
  bridgeRebuildCount=0;
  activeRoadMeta={highway:null,surface:'asphalt',maxspeed:null,lanes:null,width:null,name:null,ref:null,confidence:0};
  geographicSigns.length=0;
  lastSignDataCenter={x:Infinity,z:Infinity};
  signDataLoading=false;
  passedSignKeys.clear();signReadout.key=null;signReadout.text='';signReadout.startedAt=0;
  if(signStatus)signStatus.textContent='0';
  lastRoadMetaCenter={x:Infinity,z:Infinity};
  roadMetaLoading=false;
  updateRoadMetaHUD();
  lastPrefetchCum=-Infinity;
  activeRoadProfile=[];
  clearGroup(roadGroup);clearGroup(forestGroup);
  clearGroup(terrainDetailGroup);clearGroup(infrastructureGroup);clearGroup(buildingGroup);clearGroup(horizonGroup);
}

function preloadHydroAlongRoute(){
  if(routeLength<=0)return;
  const generation=hydroGeneration;

  // Load only the current visible zone immediately.
  loadWaterAround(absX,absZ).catch(()=>{});

  // Remaining route points are CACHE-ONLY and staggered.
  // They never rebuild the visible water scene.
  const fractions=[.20,.40,.60,.80];
  fractions.forEach((f,i)=>{
    setTimeout(async()=>{
      if(generation!==hydroGeneration||waterLoading||sceneryLoading)return;
      const p=routePointAt(f),ll=xzToLL(p.x,p.z);
      await fetchOverpassCached('hydro',ll,hydroQuery(ll),7000,HYDRO_CACHE_TTL);
    },3500+i*3500);
  });
}

function parseCoordinateWaypoint(line){
  const parts=String(line||'').trim().split(/[,\s;]+/).map(Number);
  if(parts.length>=2&&validLatLon(parts[0],parts[1])){
    return {lat:parts[0],lon:parts[1],name:'Waypoint'};
  }
  return null;
}

async function geocodePlace(query,limit=5){
  const q=String(query||'').trim();
  if(!q)return [];

  const url='https://nominatim.openstreetmap.org/search?'+new URLSearchParams({
    q,
    format:'jsonv2',
    limit:String(Math.max(1,Math.min(5,limit))),
    addressdetails:'1',
    'accept-language':'fr'
  });

  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),7000);
  try{
    const r=await fetch(url,{signal:ctl.signal,headers:{'Accept':'application/json'}});
    if(!r.ok)throw new Error('Géocodage HTTP '+r.status);
    const data=await r.json();
    return (data||[]).map(x=>({
      lat:Number(x.lat),
      lon:Number(x.lon),
      name:x.display_name||q,
      type:x.type||x.category||''
    })).filter(x=>validLatLon(x.lat,x.lon));
  }finally{clearTimeout(timer)}
}

async function resolveWaypointLines(text){
  const lines=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,8);
  const out=[];
  for(const line of lines){
    const direct=parseCoordinateWaypoint(line);
    if(direct){out.push(direct);continue;}
    try{
      const r=await geocodePlace(line,1);
      if(r[0])out.push({...r[0],name:line});
    }catch(e){console.warn('Waypoint geocode failed',line,e)}
    await new Promise(resolve=>setTimeout(resolve,1050)); // public Nominatim policy friendliness
  }
  return out;
}

function validLatLon(lat,lon){
  return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=85&&Math.abs(lon)<=180;
}
async function createRequestedRoute(start,end,waypoints=[]){
  bumpRouteGeneration();
  if(!validLatLon(start.lat,start.lon)||!validLatLon(end.lat,end.lon)){
    toast('Coordonnées invalides');return false;
  }
  if(geoDist(start,end)<100){toast('Départ et arrivée trop proches');return false;}

  if(autopilot)setAutopilot(false,'Pilote auto désactivé');
  speed=0;steer=0;autopilotSteer=0;
  ROUTE_START={...start,name:start.name||'Départ'};
  ROUTE_END={...end,name:end.name||'Arrivée'};
  ROUTE_WAYPOINTS=Array.isArray(waypoints)?waypoints.slice(0,8):[];
  origin={lat:ROUTE_START.lat,lon:ROUTE_START.lon};
  resetWorldCaches();

  loading.classList.remove('hidden');
  loadingText.textContent='Initialisation du trajet…';
  routingStatus.textContent='Connexion…';
  statusEl.textContent='Création du trajet…';

  // Absolute failsafe: UI must never stay hidden forever.
  let completed=false;
  const failsafe=setTimeout(()=>{
    if(!completed){
      loading.classList.add('hidden');
      routingStatus.textContent='Timeout';
      statusEl.textContent='Routage trop lent — tu peux réessayer';
      toast('Le routeur ne répond pas');
    }
  },11000);

  try{
    await loadRoute();
    prepMap();
    placeAt(0);
    completed=true;
    clearTimeout(failsafe);
    loading.classList.add('hidden');

    loadElevationAround(absX,absZ).catch(()=>{elevStatus.textContent='Démo'});
    preloadHydroAlongRoute();
    loadSceneryAround(absX,absZ).catch(()=>{sceneryStatus.textContent='Indisponible'});
    buildImageryMosaic(absX,absZ).catch(()=>{imageryStatus.textContent='Fallback'});
    loadRoadMetadataAround(absX,absZ).catch(()=>{});
    loadGeographicSignsAround(absX,absZ).catch(()=>{});
    toast('Trajet prêt');
    return true;
  }catch(e){
    completed=true;
    clearTimeout(failsafe);
    console.error('Route creation failed:',e);
    loading.classList.add('hidden');
    routingStatus.textContent='Échec';
    statusEl.textContent='Impossible de créer le trajet — clique Créer le trajet pour réessayer';
    toast('Échec du routage');
    return false;
  }
}


// ---------- V5 subsystem facade ----------
const WorldDrive={
  version:'5.0-alpha',
  route:{generation:0},
  streaming:{generation:0},
  vehicle:{generation:0},
  ui:{generation:0}
};
function bumpRouteGeneration(){
  WorldDrive.route.generation++;
  WorldDrive.streaming.generation++;
}

// ---------- route fetch ----------
async function fetchJSON(url,ms=8500,label='routeur'){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{
    const r=await fetch(url,{signal:c.signal,cache:'no-store'});
    if(!r.ok)throw new Error(`${label}: HTTP ${r.status}`);
    const j=await r.json();
    if(!j?.routes?.[0]?.geometry?.coordinates?.length)throw new Error(`${label}: réponse invalide`);
    return j;
  }finally{
    clearTimeout(t);
  }
}

async function loadRoute(){
 const routePoints=[ROUTE_START,...ROUTE_WAYPOINTS,ROUTE_END];
 const coords=routePoints.map(p=>`${p.lon},${p.lat}`).join(';');
 const endpoints=[
   {
     label:'OSRM Project',
     url:`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`
   },
   {
     label:'OSM Routing',
     url:`https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`
   }
 ];

 routingStatus.textContent='Connexion…';
 loadingText.textContent='Récupération du tracé routier…';

 // Launch both demo routers simultaneously: first valid response wins.
 const attempts=endpoints.map(ep=>(async()=>{
   try{
     const data=await fetchJSON(ep.url,8500,ep.label);
     return {ep,data};
   }catch(e){
     console.warn(ep.label,e);
     throw e;
   }
 })());

 let winner;
 try{
   winner=await Promise.any(attempts);
 }catch(groupError){
   routingStatus.textContent='Échec';
   throw new Error('Aucun serveur de routage n’a répondu dans le délai prévu');
 }

 const data=winner.data;
 routingStatus.textContent=winner.ep.label;
 let coordsGeo=data.routes[0].geometry.coordinates.slice();

 // Always orient geometry from requested start to requested destination.
 const first={lon:coordsGeo[0][0],lat:coordsGeo[0][1]};
 const last={lon:coordsGeo[coordsGeo.length-1][0],lat:coordsGeo[coordsGeo.length-1][1]};
 const firstToStart=geoDist(first,ROUTE_START), lastToStart=geoDist(last,ROUTE_START);
 if(lastToStart < firstToStart)coordsGeo.reverse();

 route.length=0;segments.length=0;routeLength=0;
 for(let i=0;i<coordsGeo.length;i++){
   const [lon,lat]=coordsGeo[i],p=llToXZ(lat,lon);
   let cum=routeLength;
   if(i){
     const prev=route[i-1],len=Math.hypot(p.x-prev.x,p.z-prev.z);
     if(len>.02){
       segments.push({ax:prev.x,az:prev.z,bx:p.x,bz:p.z,len,cum:routeLength});
       routeLength+=len;
     }
     cum=routeLength;
   }
   route.push({x:p.x,z:p.z,lat,lon,cum});
 }
 if(segments.length<2||routeLength<100)throw new Error('Tracé routier trop court ou invalide');

 statusEl.textContent=`Trajet chargé · ${(routeLength/1000).toFixed(1)} km · ${route.length.toLocaleString('fr-CA')} points`;
 return true;
}

// ---------- Driving ----------
// ---------- V5.2.4 vehicle audio ----------
let audioCtx=null,audioMaster=null,motorOsc1=null,motorOsc2=null,motorGain=null;
let tireNoise=null,tireGain=null,audioReady=false;
const audioStatus=$('audioStatus');

function makeNoiseBuffer(ctx,seconds=2){
  const n=Math.floor(ctx.sampleRate*seconds);
  const b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);
  let last=0;
  for(let i=0;i<n;i++){
    const white=Math.random()*2-1;
    last=last*.72+white*.28;
    d[i]=last;
  }
  return b;
}
async function initVehicleAudio(){
  if(audioReady){
    if(audioCtx?.state==='suspended'){
      try{await audioCtx.resume()}catch(e){console.warn('Audio resume failed',e)}
    }
    audioStatus.textContent=audioCtx?.state==='running'?'ON':'Suspendu';
    return;
  }
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){audioStatus.textContent='Non supporté';return}
  audioCtx=new AC();

  audioMaster=audioCtx.createGain();
  audioMaster.gain.value=.32;
  audioMaster.connect(audioCtx.destination);

  // EV-like drivetrain whine: two soft oscillators rather than a combustion engine.
  motorOsc1=audioCtx.createOscillator();
  motorOsc2=audioCtx.createOscillator();
  motorOsc1.type='sine';motorOsc2.type='triangle';
  motorGain=audioCtx.createGain();motorGain.gain.value=.0001;
  const motorFilter=audioCtx.createBiquadFilter();
  motorFilter.type='lowpass';motorFilter.frequency.value=1200;
  motorOsc1.connect(motorGain);motorOsc2.connect(motorGain);
  motorGain.connect(motorFilter);motorFilter.connect(audioMaster);
  motorOsc1.start();motorOsc2.start();

  // Tire scrub is filtered noise, activated progressively by lateral demand.
  tireNoise=audioCtx.createBufferSource();
  tireNoise.buffer=makeNoiseBuffer(audioCtx,2);
  tireNoise.loop=true;
  tireGain=audioCtx.createGain();tireGain.gain.value=.0001;
  const tireFilter=audioCtx.createBiquadFilter();
  tireFilter.type='bandpass';tireFilter.frequency.value=1450;tireFilter.Q.value=.75;
  tireNoise.connect(tireFilter);tireFilter.connect(tireGain);tireGain.connect(audioMaster);
  tireNoise.start();

  audioReady=true;
  try{await audioCtx.resume()}catch(e){console.warn('Audio start failed',e)}
  audioStatus.textContent=audioCtx.state==='running'?'ON':'Suspendu';
}
function updateVehicleAudio(){
  if(!audioReady||!audioCtx)return;
  if(audioCtx.state!=='running'){
    audioStatus.textContent='Suspendu';
    return;
  }
  const now=audioCtx.currentTime;
  const kmh=Math.abs(speed)*3.6;

  // Speed and acceleration drive pitch/volume; remains subtle at cruise.
  const accelLoad=Math.min(1,Math.abs(longitudinalAccel)/6.5);
  const f1=72+kmh*3.0;
  const f2=f1*2.04;
  motorOsc1.frequency.setTargetAtTime(f1,now,.055);
  motorOsc2.frequency.setTargetAtTime(f2,now,.055);
  const motorVol=kmh<1?.0001:Math.min(.11,.018+kmh/1900+accelLoad*.035);
  motorGain.gain.setTargetAtTime(motorVol,now,.07);

  // Approximate lateral acceleration from bicycle model.
  const yawRate=(speed/VEHICLE.wheelbase)*Math.tan(currentSteerAngle||0);
  const lateralG=Math.abs(speed*yawRate)/9.81;
  const nr=nearestRoute(absX,absZ);
  const onPavement=!!(nr&&nr.d<8.5);
  const gripThreshold=onPavement?.43:.30;

  // Progressive scrub begins near the grip limit; hard cornering becomes a squeal.
  const scrub=Math.max(0,Math.min(1,(lateralG-gripThreshold)/.48));
  const speedGate=Math.max(0,Math.min(1,(kmh-18)/28));
  const tireVol=scrub*speedGate*.24;
  tireGain.gain.setTargetAtTime(Math.max(.0001,tireVol),now,tireVol>.01?.035:.12);
}
function wakeAudio(){initVehicleAudio().catch(e=>console.warn('Audio activation failed',e))}
$('audioEnableBtn').addEventListener('click',e=>{
  e.stopPropagation();
  wakeAudio();
});
addEventListener('pointerdown',()=>{
  if(!audioReady||audioCtx?.state!=='running')wakeAudio();
},{passive:true});
addEventListener('keydown',()=>{
  if(!audioReady||audioCtx?.state!=='running')wakeAudio();
},{passive:true});
addEventListener('gamepadconnected',()=>{
  audioStatus.textContent=audioReady&&audioCtx?.state==='running'?'ON':'OFF';
});

let absX=0,absZ=0,heading=0,speed=0,steer=0,assist=true,camMode=0,last=performance.now();
let autopilot=false;
let autopilotSteer=0;

// V4.1 vehicle dynamics state
let longitudinalAccel=0;
let visualSteer=0;
let bodyHeave=0;
let currentSteerAngle=0; // shared with audio / visual systems
const VEHICLE={
  accel:6.2,          // EV-like acceleration, m/s²
  brake:9.2,          // service braking
  reverseAccel:3.2,
  rolling:0.32,
  aero:0.0038,
  wheelbase:2.77,
  maxSteerLow:0.43,   // ~25° at parking speed: tighter control, less twitchy
  maxSteerHigh:0.115, // ~6.6° at highway speed
  offroadGrip:.58,
  offroadDrag:1.15
};
const autopilotStatus=$('autopilotStatus');

const gamepadStatus=$('gamepadStatus');
const gamepadState={
  connected:false,id:'',steer:0,lookX:0,lookY:0,throttle:0,brake:0,hand:false,
  prevButtons:[],activeIndex:null,lastInputAt:0
};

function gamepadDeadzone(v,dz=.10){
  const a=Math.abs(v);if(a<=dz)return 0;
  return Math.sign(v)*(a-dz)/(1-dz);
}
function gamepadButton(gp,i){return !!gp?.buttons?.[i]?.pressed}
function gamepadValue(gp,i){return Number(gp?.buttons?.[i]?.value)||0}
function gamepadPressedEdge(gp,i){
  const now=gamepadButton(gp,i),prev=!!gamepadState.prevButtons[i];
  gamepadState.prevButtons[i]=now;
  return now&&!prev;
}
function axisTrigger(v){
  // Some GuliKit modes expose triggers as axes in [-1,+1].
  if(!Number.isFinite(v))return 0;
  return Math.max(0,Math.min(1,(v+1)/2));
}
function padActivity(gp){
  let score=0;
  for(const a of gp.axes||[])score=Math.max(score,Math.abs(a||0));
  for(const b of gp.buttons||[])score=Math.max(score,b?.value||0);
  return score;
}
function chooseGamepad(){
  const pads=[...navigator.getGamepads()].filter(Boolean);
  if(!pads.length)return null;

  // Keep the pad the player has actually used, important when Windows has
  // several paired Xbox controllers plus the active GuliKit Controller XW.
  const active=pads.find(p=>p.index===gamepadState.activeIndex);
  if(active)return active;

  const used=pads.slice().sort((a,b)=>padActivity(b)-padActivity(a))[0];
  if(padActivity(used)>.08){gamepadState.activeIndex=used.index;return used}

  // Prefer the connected GuliKit if no controller has produced input yet.
  return pads.find(p=>/gulikit|controller xw/i.test(p.id||'')) ||
         pads.find(p=>p.mapping==='standard') || pads[0];
}
function updateGamepad(){
  if(!navigator.getGamepads){
    gamepadStatus.textContent='Non supportée';gamepadState.connected=false;return;
  }
  const gp=chooseGamepad();
  if(!gp){
    gamepadState.connected=false;gamepadState.activeIndex=null;
    gamepadState.steer=0;gamepadState.lookX=0;gamepadState.lookY=0;
    gamepadState.throttle=0;gamepadState.brake=0;
    gamepadState.hand=false;gamepadState.prevButtons=[];
    gamepadStatus.textContent='—';return;
  }

  const activity=padActivity(gp);
  if(activity>.08){
    gamepadState.activeIndex=gp.index;
    gamepadState.lastInputAt=performance.now();
  }

  gamepadState.connected=true;
  gamepadState.id=gp.id||'Gamepad';
  const shortId=/gulikit/i.test(gamepadState.id)?'GuliKit XW':
                (gp.mapping==='standard'?'Gamepad standard':'Gamepad');
  gamepadStatus.textContent=shortId;

  // Steering: standard/GuliKit XInput uses axis 0.
  gamepadState.steer=gamepadDeadzone(Number(gp.axes?.[0])||0);

  // Right stick free-look: standard mapping axes 2/3.
  gamepadState.lookX=gamepadDeadzone(Number(gp.axes?.[2])||0,.12);
  gamepadState.lookY=gamepadDeadzone(Number(gp.axes?.[3])||0,.12);

  // Primary mapping: standard Gamepad API buttons 6/7.
  let lt=gamepadValue(gp,6),rt=gamepadValue(gp,7);

  // GuliKit can expose analog triggers as axes depending on Bluetooth mode/browser.
  // Only use these fallbacks when buttons 6/7 are not providing analog values.
  if(lt<.01 && rt<.01 && gp.mapping!=='standard' && (gp.axes?.length||0)>=6){
    lt=axisTrigger(Number(gp.axes[4]));
    rt=axisTrigger(Number(gp.axes[5]));
  }
  // Alternate combined-trigger axis is only safe on NON-standard mappings.
  // Axis 2 is the right-stick X axis on Xbox/GuliKit XInput and must never
  // be treated as a trigger there.
  if(lt<.01 && rt<.01 && gp.mapping!=='standard' && (gp.axes?.length||0)>=3){
    const t=Number(gp.axes[2])||0;
    if(Math.abs(t)>.08){
      if(t<0)lt=Math.min(1,-t);
      else rt=Math.min(1,t);
    }
  }

  gamepadState.brake=Math.max(0,Math.min(1,lt));
  gamepadState.throttle=Math.max(0,Math.min(1,rt));
  gamepadState.hand=gamepadButton(gp,0);

  if(!audioReady||audioCtx?.state!=='running'){
    audioStatus.textContent='Clique Activer';
  }

  if(gamepadPressedEdge(gp,3))cycleCam();        // Y
  if(gamepadPressedEdge(gp,2))toggleAssist();    // X
  if(gamepadPressedEdge(gp,1))toggleAutopilot(); // B
  if(gamepadPressedEdge(gp,9))resetToRoad();     // Menu/Start

  if(autopilot&&(Math.abs(gamepadState.steer)>.14||gamepadState.brake>.08||gamepadState.hand)){
    setAutopilot(false,'Reprise manuelle — manette');
  }
}

addEventListener('gamepadconnected',e=>{
  // Do not blindly select the first Windows device: wait for actual input.
  if(/gulikit|controller xw/i.test(e.gamepad?.id||''))gamepadState.activeIndex=e.gamepad.index;
  gamepadStatus.textContent=/gulikit/i.test(e.gamepad?.id||'')?'GuliKit XW':'Détectée';
  toast('Manette détectée — appuie sur un bouton');
});
addEventListener('gamepaddisconnected',e=>{
  if(gamepadState.activeIndex===e.gamepad?.index)gamepadState.activeIndex=null;
  gamepadState.connected=false;gamepadStatus.textContent='—';
  toast('Manette déconnectée');
});

const keys={};addEventListener('keydown',e=>{
 keys[e.code]=true;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
 if(e.code==='KeyC')cycleCam();
 if(e.code==='KeyL')toggleAssist();
 if(e.code==='KeyP')toggleAutopilot();
 if(e.code==='KeyR')resetToRoad();

 // Immediate manual takeover: steering, braking or reverse cancels autopilot.
 if(autopilot && ['KeyA','KeyD','ArrowLeft','ArrowRight','KeyS','ArrowDown','Space'].includes(e.code)){
   setAutopilot(false,'Reprise manuelle');
 }
});addEventListener('keyup',e=>keys[e.code]=false);
let maxSpeedKmh=100;let MAX=maxSpeedKmh/3.6;const REV=-10;
let roadContact=false;

function setAutopilot(enabled,message=''){
  autopilot=enabled;
  $('autopilotBtn').textContent='Pilote auto: '+(autopilot?'ON':'OFF');
  autopilotStatus.textContent=autopilot?'ACTIF':'OFF';
  if(autopilot){
    assist=true;
    $('assist').textContent='Assist: ON';
    roadContact=true;
    const n=nearestRoute(absX,absZ);
    if(n && n.d>6){
      absX=n.px;absZ=n.pz;
      recenterIfNeeded(absX,absZ,true);
    }
    toast(message||'Pilote automatique activé');
  }else{
    autopilotSteer=0;
    toast(message||'Pilote automatique désactivé');
  }
}
function toggleAutopilot(){ setAutopilot(!autopilot); }

function autopilotControl(dt,nr){
  if(!autopilot||!nr||!routeLength)return {throttle:0,turn:0,hand:false};

  const kmh=Math.abs(speed)*3.6;
  const lookAhead=Math.max(18,Math.min(105,18+kmh*.40));
  const target=routePointAtCum(Math.min(routeLength-1,nr.cum+lookAhead));

  const desired=Math.atan2(target.x-absX,target.z-absZ);
  const headingErr=angleDelta(desired,heading);

  // Cross-track correction is blended with heading correction.
  const lateralSign=Math.sign(
    Math.sin(nr.angle)*(absZ-nr.pz)-Math.cos(nr.angle)*(absX-nr.px)
  )||0;
  const crossTrack=Math.min(1,nr.d/5)*lateralSign;
  const steerRequest=Math.max(-1,Math.min(1,headingErr*1.55-crossTrack*.34));
  autopilotSteer+=(steerRequest-autopilotSteer)*(1-Math.exp(-dt*(kmh>130?4.5:6.5)));

  // Sample several points instead of comparing only two headings.
  // This makes braking start before a sequence of bends rather than in the bend.
  let maxCurve=0;
  const step=Math.max(12,lookAhead*.45);
  let prev=routePointAtCum(Math.min(routeLength-1,nr.cum+step));
  for(let d=step*2;d<=lookAhead*2.6;d+=step){
    const q=routePointAtCum(Math.min(routeLength-1,nr.cum+d));
    const ds=Math.max(5,q.cum-prev.cum);
    maxCurve=Math.max(maxCurve,Math.abs(angleDelta(q.angle,prev.angle))/ds);
    prev=q;
  }

  // Approximate safe speed from lateral acceleration v²*kappa.
  // 3.0 m/s² keeps the autopilot comfortable rather than race-car aggressive.
  const curveSpeed=maxCurve>.00015?Math.sqrt(3.0/maxCurve):MAX;
  const osmLimit=activeRoadMeta.maxspeed?activeRoadMeta.maxspeed/3.6:MAX;
  let targetSpeed=Math.min(MAX,osmLimit,Math.max(7.5,curveSpeed));

  // Progressive destination braking.
  const remaining=routeLength-nr.cum;
  if(remaining<120)targetSpeed=Math.min(targetSpeed,Math.sqrt(Math.max(0,remaining)*5.2));
  if(remaining<8)targetSpeed=0;

  const errorV=targetSpeed-speed;
  let throttle=0;
  if(errorV>1.0)throttle=Math.min(1,.30+errorV/5);
  else if(errorV>.12)throttle=Math.max(.08,errorV/1.2);
  else if(errorV<-.25)throttle=Math.max(-1,errorV/3.5);

  if(remaining<5&&Math.abs(speed)<.45){
    speed=0;setAutopilot(false,'Arrivée à destination');
  }
  return {throttle,turn:autopilotSteer,hand:false};
}


function groundHeightForWheel(absx,absz){
  const nrw=nearestRoute(absx,absz);
  if(nrw&&nrw.d<6.5){
    const rf=roadFrameAt(absx,absz);
    if(rf&&rf.distance<12)return rf.y;
  }
  return terrainAbs(absx,absz);
}

function updateSuspensionVisuals(dt,onRoad,currentSteerAngle){
  const c=Math.cos(heading),sn=Math.sin(heading);
  const wheelRadius=.38;
  const contacts=[];

  for(let i=0;i<wheels.length;i++){
    const w=wheels[i];
    const lx=w.pivot.position.x;
    const lz=w.pivot.position.z;

    // Rotate local wheel offset into world X/Z using vehicle yaw only.
    const wx=absX + lx*c + lz*sn;
    const wz=absZ - lx*sn + lz*c;
    const ground=groundHeightForWheel(wx,wz);
    contacts.push(ground);

    // Wheel center follows the ground independently from the body.
    const targetLocalY=(ground+wheelRadius)-car.position.y;
    const suspensionRate=1-Math.exp(-dt*18);
    w.pivot.position.y+=(targetLocalY-w.pivot.position.y)*suspensionRate;
  }

  if(contacts.length!==4)return;

  // wheels order: x=-1/z=-1, x=-1/z=+1, x=+1/z=-1, x=+1/z=+1
  const rearL=contacts[0],frontL=contacts[1],rearR=contacts[2],frontR=contacts[3];
  const frontAvg=(frontL+frontR)*.5;
  const rearAvg=(rearL+rearR)*.5;
  const leftAvg=(frontL+rearL)*.5;
  const rightAvg=(frontR+rearR)*.5;

  const wheelbase=2.84;
  const track=2.00;

  // Static road pitch/roll from wheel contact plane.
  const roadPitch=Math.atan2(rearAvg-frontAvg,wheelbase);
  const roadRoll=Math.atan2(leftAvg-rightAvg,track);

  // Dynamic body movement only: wheels remain on contact plane.
  const visualYawRate=(speed/VEHICLE.wheelbase)*Math.tan(currentSteerAngle||0);
  const lateralAccel=Math.max(-8,Math.min(8,speed*visualYawRate));
  // Positive lateral acceleration means the car is curving toward one side;
  // body mass rolls toward the OUTSIDE of the bend.
  const dynamicRoll=Math.max(-.065,Math.min(.065,lateralAccel*.0075));
  const dynamicPitch=Math.max(-.040,Math.min(.040,-longitudinalAccel*.0045));

  // Body follows road geometry gently, plus suspension response.
  const targetRoll=(onRoad?roadRoll*.35:roadRoll*.55)+dynamicRoll;
  const targetPitch=(onRoad?roadPitch*.72:roadPitch*.85)+dynamicPitch;

  suspensionRoll+=(targetRoll-suspensionRoll)*(1-Math.exp(-dt*5.4));
  suspensionPitch+=(targetPitch-suspensionPitch)*(1-Math.exp(-dt*7.2));

  // Small heave from average wheel travel / terrain undulation.
  const avg=(frontAvg+rearAvg)*.5;
  const targetHeave=Math.max(-.045,Math.min(.045,(avg-car.position.y)*.055));
  suspensionHeave+=(targetHeave-suspensionHeave)*(1-Math.exp(-dt*5.5));

  bodyGroup.rotation.x=suspensionPitch;
  bodyGroup.rotation.z=suspensionRoll;
  bodyGroup.position.y=-.22+suspensionHeave;
}

function updateDrive(dt){
 const nr=nearestRoute(absX,absZ);
 const ap=autopilotControl(dt,nr);

 const keyboardThrottle=((keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0));
 const keyboardTurn=((keys.KeyA||keys.ArrowLeft?1:0)-(keys.KeyD||keys.ArrowRight?1:0));
 let manualThrottle=keyboardThrottle,manualTurn=keyboardTurn,manualHand=!!keys.Space;

 if(gamepadState.connected){
   if(gamepadState.throttle>.02||gamepadState.brake>.02)manualThrottle=gamepadState.throttle-gamepadState.brake;
   if(Math.abs(gamepadState.steer)>.001)manualTurn=-gamepadState.steer;
   manualHand=manualHand||gamepadState.hand;
 }

 const throttle=autopilot?ap.throttle:manualThrottle;
 const turn=autopilot?ap.turn:manualTurn;
 const hand=autopilot?ap.hand:manualHand;

 const brakeRequested=hand||(throttle<-.04&&speed>.15);
 updateBrakeLights(dt,brakeRequested);
 // ----- V4.1 longitudinal dynamics -----
 const previousSpeed=speed;
 const onPavement=nr&&nr.d<8.5;
 const surfaceGrip=onPavement?roadSurfaceGrip():1;
 const grip=onPavement?surfaceGrip:VEHICLE.offroadGrip;

 let accel=0;
 if(throttle>0){
   if(speed>=0)accel+=VEHICLE.accel*throttle*(1-.34*Math.min(1,speed/Math.max(MAX,1)));
   else accel+=VEHICLE.brake*throttle; // brake reverse motion before going forward
 }else if(throttle<0){
   if(speed>0)accel+=VEHICLE.brake*throttle;
   else accel+=VEHICLE.reverseAccel*throttle;
 }

 // Rolling + aerodynamic resistance. Off-road adds substantial drag but no
 // artificial hard speed clamp.
 if(Math.abs(speed)>.05){
   const surfaceDrag=onPavement?Math.max(0,(1-surfaceGrip)*.75):VEHICLE.offroadDrag;
   const resist=VEHICLE.rolling+VEHICLE.aero*speed*speed+surfaceDrag;
   accel-=Math.sign(speed)*resist;
 }else if(!throttle)speed=0;

 if(hand){
   accel-=Math.sign(speed||1)*12;
 }

 speed+=accel*dt;
 speed=Math.max(REV,Math.min(MAX,speed));
 if(previousSpeed>0&&speed<0&&!throttle)speed=0;
 if(previousSpeed<0&&speed>0&&!throttle)speed=0;
 longitudinalAccel=(speed-previousSpeed)/Math.max(dt,.001);

 // ----- speed-sensitive bicycle steering -----
 const speedAbs=Math.abs(speed);

 // Speed-dependent mechanical steering angle.
 // Parking speeds get a tight turning circle; highway speeds progressively reduce
 // available road-wheel angle for stability.
 const speedBlend=Math.min(1,speedAbs/32);
 const maxRoadWheelAngle=VEHICLE.maxSteerLow+(VEHICLE.maxSteerHigh-VEHICLE.maxSteerLow)*(speedBlend*speedBlend);

 // Soft center dead-zone and self-centering. Digital keyboard input remains full
 // left/right, but releasing the key now brings steering cleanly back to zero.
 let steerTarget=turn;
 if(Math.abs(steerTarget)<.08)steerTarget=0;

 // Slower steering buildup around low speed; faster return to center.
 const steeringInRate=speedAbs<5?3.7:(speedAbs>25?3.8:4.5);
 const steeringOutRate=speedAbs<5?6.5:7.5;
 const steerResponse=steerTarget===0?steeringOutRate:steeringInRate;
 steer+=(steerTarget-steer)*(1-Math.exp(-dt*steerResponse));
 if(steerTarget===0&&Math.abs(steer)<.008)steer=0;

 // Bicycle-model yaw rate.
 const steerAngle=steer*maxRoadWheelAngle;
 currentSteerAngle=steerAngle;

 // Off-road should behave like pavement at manoeuvring speeds. Grip loss becomes
 // progressively relevant only as speed rises.
 const offroadGripBlend=Math.min(1,Math.max(0,(speedAbs-8)/18));
 const effectiveGrip=onPavement?surfaceGrip:(1+(VEHICLE.offroadGrip-1)*offroadGripBlend);
 let yawRate=(speed/VEHICLE.wheelbase)*Math.tan(steerAngle)*effectiveGrip;

 // Limit lateral acceleration so the car doesn't rotate unrealistically at speed.
 const latAccel=Math.abs(speed*yawRate);
 const offroadLatLimit=speedAbs<10?7.0:3.8;
 const latLimit=onPavement?7.0:offroadLatLimit;
 if(latAccel>latLimit&&latAccel>0)yawRate*=latLimit/latAccel;
 heading+=yawRate*dt;

 // Road assist is now a gentle lane-centering force, not a hidden steering snap.
 if(assist&&nr&&nr.d<(autopilot?12:8.5)&&speedAbs>2){
   let routeHeading=nr.angle;
   if(Math.abs(angleDelta(routeHeading+Math.PI,heading))<Math.abs(angleDelta(routeHeading,heading)))routeHeading+=Math.PI;
   const hErr=angleDelta(routeHeading,heading);
   const strength=autopilot?.55:.12;
   heading+=hErr*dt*strength;
   if(nr.d>(autopilot?.55:2.2)){
     const centerRate=autopilot?.48:.10;
     absX+=(nr.px-absX)*(1-Math.exp(-dt*centerRate));
     absZ+=(nr.pz-absZ)*(1-Math.exp(-dt*centerRate));
   }
 }

 absX+=Math.sin(heading)*speed*dt;
 absZ+=Math.cos(heading)*speed*dt;
 recenterIfNeeded(absX,absZ);
 const rx=absX-worldOffset.x,rz=absZ-worldOffset.z;

 // Hysteresis prevents rapid on/off flicker at the road edge:
 // enter at 8.5 m, remain attached until 11 m.
 if(nr){
   if(!roadContact && nr.d<8.5) roadContact=true;
   else if(roadContact && nr.d>11) roadContact=false;
 }else roadContact=false;

 let roadFrame=roadFrameAt(absX,absZ);
 if(roadContact && (!roadFrame || roadFrame.distance>18)){
   roadFrame=ensureRoadProfileNear(absX,absZ);
 }
 const onRoad=roadContact&&roadFrame&&roadFrame.distance<18;
 $('contactMode').textContent=onRoad?'Route':'Terrain';
 const terrainFrame=!onRoad?terrainFrameAt(absX,absZ,heading):null;

 // Root rides near the average contact plane. Individual wheel pivots handle
 // the actual wheel-to-ground contact, while the sprung body moves independently.
 const baseGround=(onRoad?roadFrame.y:(terrainFrame?terrainFrame.y:terrainAbs(absX,absZ)));
 const targetY=baseGround+.38;
 const yAlpha=1-Math.exp(-dt*10);
 car.position.x=rx;car.position.z=rz;car.position.y+=(targetY-car.position.y)*yAlpha;

 // Root vehicle stays yaw-aligned only. Wheel heights and the sprung body
 // handle suspension/pitch/roll independently.
 car.rotation.set(0,heading,0);
 updateSuspensionVisuals(dt,onRoad,steerAngle);
 // Wheel rotation + visible front steering.
 // Steering pivot and wheel spin are now independent transforms.
 visualSteer+=(steerAngle-visualSteer)*(1-Math.exp(-dt*7));
 for(const w of wheels){
   // Tire/rim roll independently inside the steering/suspension pivot.
   w.tire.rotation.x-=speed*dt/.38;
   w.rim.rotation.x-=speed*dt/.38;

   // Pivot yaw is steering only; pivot Y position is suspension travel.
   const targetWheelYaw=w.front?visualSteer:0;
   w.pivot.rotation.y+=(targetWheelYaw-w.pivot.rotation.y)*(1-Math.exp(-dt*12));
 }
 $('speed').textContent=Math.round(Math.abs(speed)*3.6);
 const llNow=xzToLL(absX,absZ),realElev=tileElevationAt(llNow.lat,llNow.lon);
 altitudeEl.textContent=realElev!==null&&Number.isFinite(realElev)?Math.round(realElev):'—';
 const frameNow=roadFrameAt(absX,absZ);
 $('grade').textContent=frameNow?(Math.tan(frameNow.pitch)*100).toFixed(1):'0.0';
 if(nr){const pct=100*nr.cum/routeLength;$('progress').textContent=pct.toFixed(1);$('doneKm').textContent=(nr.cum/1000).toFixed(1);$('remainKm').textContent=((routeLength-nr.cum)/1000).toFixed(1);$('roadDist').textContent=Math.round(nr.d);updatePassedSignReadout(nr);drawMap(nr.cum)}
 // Refresh elevation tiles after moving roughly 1.4 km from last tile center.
 const ex=absX-lastElevCenter.x,ez=absZ-lastElevCenter.z;
 if(ex*ex+ez*ez>1400*1400)loadElevationAround(absX,absZ);

 const wx=absX-lastWaterCenter.x,wz=absZ-lastWaterCenter.z;
 if(wx*wx+wz*wz>2200*2200&&!waterLoading)loadWaterAround(absX,absZ);

 const sx=absX-lastSceneryCenter.x,sz=absZ-lastSceneryCenter.z;
 if(sx*sx+sz*sz>2600*2600&&!sceneryLoading)loadSceneryAround(absX,absZ);

 const ix=absX-lastImageryCenter.x,iz=absZ-lastImageryCenter.z;
 if(ix*ix+iz*iz>700*700&&!imageryLoading)buildImageryMosaic(absX,absZ);

 const mx=absX-lastRoadMetaCenter.x,mz=absZ-lastRoadMetaCenter.z;
 if(mx*mx+mz*mz>700*700&&!roadMetaLoading)loadRoadMetadataAround(absX,absZ);

 const signDx=absX-lastSignDataCenter.x,signDz=absZ-lastSignDataCenter.z;
 if(signDx*signDx+signDz*signDz>2500*2500&&!signDataLoading)loadGeographicSignsAround(absX,absZ);
}
const camTarget=new THREE.Vector3();
let cameraLookYaw=0;
let cameraLookPitch=0;

function updateCameraLook(dt){
  const targetYaw=gamepadState.connected?gamepadState.lookX*1.22:0;
  const targetPitch=gamepadState.connected?-gamepadState.lookY*.58:0;

  const active=Math.abs(targetYaw)>.01||Math.abs(targetPitch)>.01;
  const rate=active?8.5:3.0;
  cameraLookYaw+=(targetYaw-cameraLookYaw)*(1-Math.exp(-dt*rate));
  cameraLookPitch+=(targetPitch-cameraLookPitch)*(1-Math.exp(-dt*rate));

  cameraLookYaw=Math.max(-1.35,Math.min(1.35,cameraLookYaw));
  cameraLookPitch=Math.max(-.46,Math.min(.38,cameraLookPitch));
}

function updateCam(dt){
 updateCameraLook(dt);

 const baseForward=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
 const cosY=Math.cos(cameraLookYaw),sinY=Math.sin(cameraLookYaw);
 const f=new THREE.Vector3(
   baseForward.x*cosY + baseForward.z*sinY,
   0,
   baseForward.z*cosY - baseForward.x*sinY
 ).normalize();

 let des,tgt;
 const pitchOffset=Math.sin(cameraLookPitch);
 const pitchHeight=Math.sin(cameraLookPitch)*8;

 if(camMode===0){
   des=car.position.clone().addScaledVector(f,-10.5).add(new THREE.Vector3(0,5+pitchHeight*.35,0));
   tgt=car.position.clone().addScaledVector(f,8).add(new THREE.Vector3(0,1.2+pitchHeight,0));
 }else if(camMode===1){
   des=car.position.clone().addScaledVector(f,1.1).add(new THREE.Vector3(0,1.55+pitchHeight*.16,0));
   tgt=car.position.clone().addScaledVector(f,20).add(new THREE.Vector3(0,1.2+pitchHeight,0));
 }else{
   des=car.position.clone().addScaledVector(f,-12).add(new THREE.Vector3(0,29+pitchHeight*.55,0));
   tgt=car.position.clone().addScaledVector(f,10).add(new THREE.Vector3(0,pitchHeight*.8,0));
 }

 const a=1-Math.exp(-dt*(camMode===1?12:7));
 camera.position.lerp(des,a);
 camTarget.lerp(tgt,a);
 camera.lookAt(camTarget);
}
function cycleCam(){camMode=(camMode+1)%3;$('camMode').textContent=['Chase','Capot','Aérienne'][camMode]}
function toggleAssist(){
 if(autopilot){setAutopilot(false,'Pilote auto désactivé');}
 assist=!assist;
 $('assist').textContent='Assist: '+(assist?'ON':'OFF');
 toast('Assistance '+(assist?'activée':'désactivée'));
}
function placeAt(frac){const p=routePointAt(frac);absX=p.x;absZ=p.z;heading=p.angle;speed=0;steer=0;visualSteer=0;currentSteerAngle=0;longitudinalAccel=0;suspensionRoll=0;suspensionPitch=0;suspensionHeave=0;bodyGroup.rotation.set(0,0,0);bodyGroup.position.y=-.22;roadContact=true;recenterIfNeeded(absX,absZ,true);ensureRoadProfileNear(absX,absZ);car.position.set(0,roadHeightAt(absX,absZ)+.38,0);drawMap(p.cum)}
function resetToRoad(){const n=nearestRoute(absX,absZ);if(n){absX=n.px;absZ=n.pz;heading=n.angle;speed=0;steer=0;visualSteer=0;currentSteerAngle=0;longitudinalAccel=0;suspensionRoll=0;suspensionPitch=0;suspensionHeave=0;bodyGroup.rotation.set(0,0,0);bodyGroup.position.y=-.22;roadContact=true;recenterIfNeeded(absX,absZ,true);ensureRoadProfileNear(absX,absZ)}}

const maxSpeedSlider=$('maxSpeedSlider'),maxSpeedLabel=$('maxSpeedLabel');
function setMaxSpeed(kmh){
  maxSpeedKmh=Math.max(20,Math.min(200,Number(kmh)||100));
  MAX=maxSpeedKmh/3.6;
  maxSpeedLabel.textContent=Math.round(maxSpeedKmh);
  // If the limit is reduced below current speed, taper immediately to new limit.
  if(speed>MAX)speed=MAX;
  toast(`Vitesse max: ${Math.round(maxSpeedKmh)} km/h`);
}
maxSpeedSlider.addEventListener('input',e=>setMaxSpeed(e.target.value));
$('autopilotBtn').onclick=toggleAutopilot;
$('assist').onclick=toggleAssist;$('camera').onclick=cycleCam;$('reset').onclick=resetToRoad;$('jump').oninput=e=>$('jumpPct').textContent=(+e.target.value).toFixed(1)+' %';$('jumpBtn').onclick=()=>placeAt(+$('jump').value/100);$('northBtn').onclick=()=>{$('jump').value=99.8;$('jumpPct').textContent='99.8 %';placeAt(.998)};





// ---------- human-friendly place search ----------
let selectedStart={...MANIC2};
let selectedEnd={...MANIC5};
let lastGeocodeAt=0;

async function politeGeocode(query,limit=5){
  const wait=Math.max(0,1050-(Date.now()-lastGeocodeAt));
  if(wait)await new Promise(r=>setTimeout(r,wait));
  lastGeocodeAt=Date.now();
  return geocodePlace(query,limit);
}

function setSelectedPlace(which,p){
  if(which==='start'){
    selectedStart={lat:p.lat,lon:p.lon,name:p.name||$('startPlace').value};
    $('startLat').value=p.lat;$('startLon').value=p.lon;
    $('startPlace').value=p.name||$('startPlace').value;
    $('startSearchResults').classList.remove('open');
  }else{
    selectedEnd={lat:p.lat,lon:p.lon,name:p.name||$('endPlace').value};
    $('endLat').value=p.lat;$('endLon').value=p.lon;
    $('endPlace').value=p.name||$('endPlace').value;
    $('endSearchResults').classList.remove('open');
  }
}

function renderSearchResults(which,items){
  const box=$(which==='start'?'startSearchResults':'endSearchResults');
  box.innerHTML='';
  if(!items.length){
    const d=document.createElement('div');d.className='searchChoice';d.textContent='Aucun résultat';box.appendChild(d);
    box.classList.add('open');return;
  }
  for(const p of items){
    const b=document.createElement('button');b.className='searchChoice';
    b.innerHTML=`${p.name}<span class="searchMeta">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span>`;
    b.onclick=()=>setSelectedPlace(which,p);
    box.appendChild(b);
  }
  box.classList.add('open');
}

async function searchPlaceField(which){
  const input=$(which==='start'?'startPlace':'endPlace');
  const btn=$(which==='start'?'findStartBtn':'findEndBtn');
  const old=btn.textContent;btn.textContent='…';btn.disabled=true;
  try{
    const items=await politeGeocode(input.value,5);
    renderSearchResults(which,items);
  }catch(e){
    console.warn(e);toast('Recherche de lieu indisponible');
  }finally{btn.textContent=old;btn.disabled=false}
}

$('findStartBtn').onclick=()=>searchPlaceField('start');
$('findEndBtn').onclick=()=>searchPlaceField('end');
$('startPlace').addEventListener('keydown',e=>{if(e.key==='Enter')searchPlaceField('start')});
$('endPlace').addEventListener('keydown',e=>{if(e.key==='Enter')searchPlaceField('end')});

// ---------- route planner ----------
$('buildRouteBtn').addEventListener('click',async()=>{
  const btn=$('buildRouteBtn'),old=btn.textContent;btn.textContent='Préparation…';btn.disabled=true;
  try{
    // If the user edited text without clicking Search, resolve it automatically.
    const startText=$('startPlace').value.trim();
    const endText=$('endPlace').value.trim();

    if(startText && startText!==selectedStart.name){
      const r=await politeGeocode(startText,1);
      if(!r[0]){toast('Départ introuvable');return}
      setSelectedPlace('start',{...r[0],name:startText});
    }
    if(endText && endText!==selectedEnd.name){
      const r=await politeGeocode(endText,1);
      if(!r[0]){toast('Destination introuvable');return}
      setSelectedPlace('end',{...r[0],name:endText});
    }

    const waypoints=await resolveWaypointLines($('waypointsInput').value);
    createRequestedRoute({...selectedStart},{...selectedEnd},waypoints);
  }catch(e){
    console.error(e);toast('Impossible de préparer le trajet');
  }finally{btn.textContent=old;btn.disabled=false}
});
function applyPreset(start,end){
  $('waypointsInput').value='';
  selectedStart={...start};selectedEnd={...end};
  $('startPlace').value=start.name;$('endPlace').value=end.name;
  $('startLat').value=start.lat;$('startLon').value=start.lon;
  $('endLat').value=end.lat;$('endLon').value=end.lon;
  createRequestedRoute({...start},{...end});
}
$('preset389Btn').addEventListener('click',()=>applyPreset(MANIC2,MANIC5));
$('preset169Btn').addEventListener('click',()=>applyPreset(R169_START,R169_END));
$('preset132Btn').addEventListener('click',()=>applyPreset(R132_START,R132_END));


document.querySelectorAll('.sectionHead').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const section=document.getElementById(btn.dataset.section);
    section.classList.toggle('collapsed');
    btn.lastElementChild.textContent=section.classList.contains('collapsed')?'+':'−';
  });
});

// ---------- collapsible panels ----------
const hudPanel=$('hud'),hudToggle=$('hudToggle'),mapPanel=$('mapbox'),mapToggle=$('mapToggle');

function setCollapsed(panel,button,collapsed,label){
  panel.classList.toggle('collapsed',collapsed);
  button.textContent=collapsed?'+':'−';
  button.title=collapsed?`Restaurer ${label}`:`Minimiser ${label}`;
  button.setAttribute('aria-label',button.title);
  if(label==='la carte'&&!collapsed)requestAnimationFrame(()=>drawMap());
}
hudToggle.addEventListener('click',()=>setCollapsed(hudPanel,hudToggle,!hudPanel.classList.contains('collapsed'),'les détails'));
mapToggle.addEventListener('click',()=>setCollapsed(mapPanel,mapToggle,!mapPanel.classList.contains('collapsed'),'la carte'));

// ---------- compass ----------
const compassCanvas=$('compass'),compassCtx=compassCanvas.getContext('2d'),compassHeading=$('compassHeading');

function headingDeg(){
  // heading 0 = +Z = geographic north in this local projection.
  let d=(heading*180/Math.PI)%360;
  if(d<0)d+=360;
  return d;
}
function cardinalLabel(d){
  const labels=['N','NE','E','SE','S','SO','O','NO'];
  return labels[Math.round(d/45)%8];
}
function drawCompass(){
  const dpr=devicePixelRatio||1,w=compassCanvas.clientWidth,h=compassCanvas.clientHeight;
  const W=Math.round(w*dpr),H=Math.round(h*dpr);
  if(compassCanvas.width!==W||compassCanvas.height!==H){compassCanvas.width=W;compassCanvas.height=H}
  compassCtx.setTransform(dpr,0,0,dpr,0,0);
  compassCtx.clearRect(0,0,w,h);

  const hd=headingDeg();
  const pxPerDeg=w/120; // show ~120 degrees across the strip
  const center=w/2;

  // subtle center line
  compassCtx.strokeStyle='rgba(255,255,255,.16)';
  compassCtx.lineWidth=1;
  compassCtx.beginPath();
  compassCtx.moveTo(center,10);compassCtx.lineTo(center,h-8);compassCtx.stroke();

  // ticks every 5 degrees, labels every 45
  const start=Math.floor((hd-70)/5)*5;
  const end=Math.ceil((hd+70)/5)*5;
  for(let deg=start;deg<=end;deg+=5){
    let norm=((deg%360)+360)%360;
    let delta=((deg-hd+540)%360)-180;
    const x=center+delta*pxPerDeg;
    if(x<-20||x>w+20)continue;

    const major=(norm%45===0);
    const mid=(norm%15===0);
    const tickH=major?16:mid?10:6;
    compassCtx.strokeStyle=major?'rgba(255,255,255,.95)':mid?'rgba(255,255,255,.5)':'rgba(255,255,255,.28)';
    compassCtx.lineWidth=major?2:1;
    compassCtx.beginPath();
    compassCtx.moveTo(x,12);compassCtx.lineTo(x,12+tickH);compassCtx.stroke();

    if(major){
      const txt=cardinalLabel(norm);
      compassCtx.font='700 12px system-ui';
      compassCtx.textAlign='center';
      compassCtx.textBaseline='top';
      compassCtx.fillStyle=(txt==='N')?'#ff6767':'#e4edf6';
      compassCtx.fillText(txt,x,31);
    }
  }
  compassHeading.textContent=`${cardinalLabel(hd)} · ${String(Math.round(hd)%360).padStart(3,'0')}°`;
}

// ---------- transient sign readout on minimap ----------
const signReadout={key:null,text:'',startedAt:0,duration:5000,fadeMs:1100};
const passedSignKeys=new Set();
function signDisplayCum(f){
  if(!f)return 0;
  if(f.kind==='river')return Math.max(0,f.routeCum-22);
  if(f.kind==='city')return Math.max(0,f.routeCum-55);
  return f.routeCum;
}
function signReadoutText(f){
  if(!f)return '';
  if(f.kind==='speed')return String(Math.round(f.maxspeed||Number(f.label)||0));
  return String(f.label||'');
}
function updatePassedSignReadout(nr){
  if(!nr||!geographicSigns.length)return;
  let best=null,bestDelta=Infinity;
  for(const f of geographicSigns){
    if(!f?.key||passedSignKeys.has(f.key))continue;
    const d=Math.abs(signDisplayCum(f)-nr.cum);
    if(d<=14 && d<bestDelta){best=f;bestDelta=d}
  }
  if(best){
    passedSignKeys.add(best.key);
    signReadout.key=best.key;
    signReadout.text=signReadoutText(best);
    signReadout.startedAt=performance.now();
  }
  // If the player resets far enough back, allow signs to be read again.
  for(const f of geographicSigns){
    if(passedSignKeys.has(f.key) && signDisplayCum(f)-nr.cum>80)passedSignKeys.delete(f.key);
  }
}

// ---------- minimap ----------
const mc=$('minimap'),mctx=mc.getContext('2d');
let bounds=null;
function prepMap(){let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;for(const p of route){minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z)}bounds={minx,maxx,minz,maxz}}
function drawMap(cum=0){if(!bounds)return;const dpr=devicePixelRatio||1,w=mc.clientWidth,h=mc.clientHeight;if(mc.width!==Math.round(w*dpr)||mc.height!==Math.round(h*dpr)){mc.width=Math.round(w*dpr);mc.height=Math.round(h*dpr)}mctx.setTransform(dpr,0,0,dpr,0,0);mctx.clearRect(0,0,w,h);mctx.fillStyle='#0a1725';mctx.fillRect(0,0,w,h);const pad=18,sx=(w-2*pad)/(bounds.maxx-bounds.minx),sz=(h-2*pad)/(bounds.maxz-bounds.minz),sc=Math.min(sx,sz),X=x=>pad+(x-bounds.minx)*sc,Z=z=>pad+(z-bounds.minz)*sc;
 mctx.strokeStyle='#89a3ba';mctx.lineWidth=3;mctx.beginPath();route.forEach((p,i)=>i?mctx.lineTo(X(p.x),Z(p.z)):mctx.moveTo(X(p.x),Z(p.z)));mctx.stroke();

 // Fixed endpoint markers: green = Manic-2 start, white = Manic-5 destination.
 if(route.length){
   const a=route[0],b=route[route.length-1];
   mctx.fillStyle='#56e37a';mctx.beginPath();mctx.arc(X(a.x),Z(a.z),4,0,Math.PI*2);mctx.fill();
   mctx.fillStyle='#f2f5f8';mctx.beginPath();mctx.arc(X(b.x),Z(b.z),4,0,Math.PI*2);mctx.fill();
 }
 // Red dot = current vehicle position/progress.
 const p=routePointAt(cum/routeLength),carMapX=X(p.x),carMapZ=Z(p.z);mctx.fillStyle='#ff4949';mctx.beginPath();mctx.arc(carMapX,carMapZ,5,0,Math.PI*2);mctx.fill();

 // When a road sign is crossed, briefly repeat its text beside the vehicle marker.
 if(signReadout.text&&signReadout.startedAt){
   const age=performance.now()-signReadout.startedAt;
   if(age<signReadout.duration){
     const fadeStart=signReadout.duration-signReadout.fadeMs;
     const alpha=age<=fadeStart?1:Math.max(0,1-(age-fadeStart)/signReadout.fadeMs);
     mctx.save();mctx.globalAlpha=alpha;mctx.font='700 12px system-ui';mctx.textBaseline='middle';
     const text=signReadout.text,padX=8,boxH=24,boxW=Math.ceil(mctx.measureText(text).width)+padX*2;
     let bx=carMapX+12,by=carMapZ-boxH-7;
     if(bx+boxW>w-5)bx=carMapX-boxW-12;
     if(by<5)by=carMapZ+9;
     mctx.fillStyle='rgba(7,18,30,.94)';mctx.strokeStyle='rgba(235,244,252,.72)';mctx.lineWidth=1;
     mctx.beginPath();mctx.roundRect(bx,by,boxW,boxH,6);mctx.fill();mctx.stroke();
     mctx.fillStyle='#f6fbff';mctx.textAlign='left';mctx.fillText(text,bx+padX,by+boxH/2);
     mctx.restore();
   }else{signReadout.key=null;signReadout.text='';signReadout.startedAt=0}
 }
 // Endpoint labels are anchored to the actual route geometry.
 const startPt=route[0], endPt=route[route.length-1];
 if(startPt&&endPt){
   const sxp=X(startPt.x), szp=Z(startPt.z), exp=X(endPt.x), ezp=Z(endPt.z);
   mctx.font='700 11px system-ui';
   mctx.textBaseline='middle';

   mctx.fillStyle='#7dff9a';
   mctx.textAlign=sxp < w/2 ? 'left' : 'right';
   mctx.fillText(ROUTE_START.name||'Départ', sxp + (sxp < w/2 ? 8 : -8), szp);

   mctx.fillStyle='#f0f4f8';
   mctx.textAlign=exp < w/2 ? 'left' : 'right';
   mctx.fillText(ROUTE_END.name||'Arrivée', exp + (exp < w/2 ? 8 : -8), ezp);
 }
}


// ---------- directional world prefetch ----------
let lastPrefetchCum=-Infinity;

async function prefetchElevationAt(x,z){
  const ll=xzToLL(x,z),c=lonLatToTile(ll.lon,ll.lat,ELEV_Z);
  const cx=Math.floor(c.x),cy=Math.floor(c.y),jobs=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)jobs.push(fetchElevationTile(cx+dx,cy+dy));
  await Promise.allSettled(jobs);
}

async function prefetchImageryAt(x,z){
  const ll=xzToLL(x,z),t=lonLatToSlippy(ll.lon,ll.lat,IMAGERY_Z);
  const cx=Math.floor(t.x),cy=Math.floor(t.y),jobs=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)jobs.push(loadImageryTile(cx+dx,cy+dy));
  await Promise.allSettled(jobs);
}

async function prefetchOsmAt(x,z){
  // Visible world always wins over background caching.
  if(waterLoading||sceneryLoading)return;
  const ll=xzToLL(x,z);
  await Promise.allSettled([
    fetchOverpassCached('hydro',ll,hydroQuery(ll),7000,HYDRO_CACHE_TTL),
    fetchOverpassCached('scenery',ll,sceneryQuery(ll),7000,1000*60*60*24*10),
    fetchOverpassCached('signs',ll,signQuery(ll),5500,1000*60*60*24*10)
  ]);
}

let prefetchBusy=false;
async function prefetchDirectionalWorld(){
  if(prefetchBusy)return;
  const nr=nearestRoute(absX,absZ);
  if(!nr||routeLength<=0)return;
  if(nr.cum-lastPrefetchCum<850)return;
  lastPrefetchCum=nr.cum;
  prefetchBusy=true;

  try{
    const near=routePointAtCum(Math.min(routeLength-1,nr.cum+1800));
    const far=routePointAtCum(Math.min(routeLength-1,nr.cum+3600));

    // Near future gets all caches. Far future only cheap terrain/imagery.
    await Promise.allSettled([
      prefetchElevationAt(near.x,near.z),
      prefetchImageryAt(near.x,near.z),
      prefetchOsmAt(near.x,near.z)
    ]);
    await Promise.allSettled([
      prefetchElevationAt(far.x,far.z),
      prefetchImageryAt(far.x,far.z)
    ]);
  }finally{prefetchBusy=false}
}
function prefetchAhead(){prefetchDirectionalWorld().catch(()=>{})}


// ---------- V5 time-of-day prototype ----------
const timeSlider=$('timeSlider'),timeLabel=$('timeLabel');
let timeOfDay=12;
function setTimeOfDay(hour){
  timeOfDay=((Number(hour)%24)+24)%24;
  const hh=Math.floor(timeOfDay),mm=Math.round((timeOfDay-hh)*60)%60;
  timeLabel.textContent=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');

  const daylight=Math.max(0,Math.sin((timeOfDay-6)/12*Math.PI));
  scene.background=new THREE.Color().setHSL(.58,.45,.08+.50*daylight);
  scene.fog.color.copy(scene.background);
  hemi.intensity=.10+2.05*daylight;
  sun.intensity=.03+2.55*daylight;
  const a=(timeOfDay-6)/12*Math.PI;
  sun.position.set(Math.cos(a)*900,Math.max(35,Math.sin(a)*950),420);
}
timeSlider.addEventListener('input',e=>setTimeOfDay(e.target.value));

$('clearHydroCacheBtn').addEventListener('click',async()=>{
  try{
    await OsmCache.clear();
    await updateHydroCacheHUD();
    toast('Cache OSM IndexedDB vidé');
  }catch(e){console.warn(e);toast('Impossible de vider le cache')}
});

setTimeOfDay(12);

// ---------- main ----------
function animate(now){
 requestAnimationFrame(animate);
 const dt=Math.min(.033,(now-last)/1000||.016);last=now;
 try{
   updateGamepad();
   updateDrive(dt);
   try{updateVehicleAudio()}catch(audioErr){
     console.warn('Audio frame error',audioErr);
     if(audioStatus)audioStatus.textContent='Erreur audio';
   }
   updateCam(dt);
   prefetchAhead();
   waterTex.offset.x=(waterTex.offset.x+dt*.003)%1;
   waterTex.offset.y=(waterTex.offset.y+dt*.0015)%1;
   drawCompass();
   renderer.render(scene,camera);
 }catch(e){
   console.error('Frame error:',e);
   statusEl.textContent='Erreur moteur 3D: '+(e?.message||e);
 }
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);drawMap();drawCompass()});

(async()=>{
 // Start the renderer first. Network/routing is now an independent startup step.
 requestAnimationFrame(t=>{last=t;animate(t)});
 try{
   await createRequestedRoute({...MANIC2},{...MANIC5});
 }catch(e){
   console.error('Startup error',e);
   loading.classList.add('hidden');
   routingStatus.textContent='Erreur';
   statusEl.textContent='Erreur de démarrage — utilise Preset 389 ou Créer le trajet';
 }
})();
