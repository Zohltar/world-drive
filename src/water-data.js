// World Drive - hydrography data subsystem
// Step 13A: owns hydro/coastline/bridge OSM query, persistent cache,
// parsing/deduplication, request cancellation and streaming state.
// Three.js water rendering and bridge geometry orchestration remain in main.js.

const HYDRO_TTL_MS=1000*60*60*24*30;

export function createWaterDataService({
  statusEl,
  cacheStatusEl,
  cache,
  overpass,
  toLatLon,
  toWorld
}) {
  if(!cache)throw new Error('Water data requires cache');
  if(!overpass)throw new Error('Water data requires overpass client');
  if(typeof toLatLon!=='function'){
    throw new Error('Water data requires toLatLon()');
  }
  if(typeof toWorld!=='function'){
    throw new Error('Water data requires toWorld()');
  }

  const waterFeatures=[];
  const bridgeFeatures=[];
  const coastlineFeatures=[];

  const state={
    loading:false,
    center:{x:Infinity,z:Infinity},
    generation:0
  };

  const abortControllers=new Set();

  function setStatus(text){
    if(statusEl)statusEl.textContent=text;
  }

  function query(ll){
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

  function featureKey(element){
    return `${element?.type||'way'}/${element?.id}`;
  }

  function elementPoints(element){
    if(!element?.geometry?.length)return [];

    return element.geometry.map(point=>{
      const world=toWorld(point.lat,point.lon);
      return {
        x:world.x,
        z:world.z
      };
    });
  }

  function ingest(data,generation=state.generation){
    if(!data)return {
      waterAdded:0,
      bridgeAdded:0,
      coastlineAdded:0
    };

    const knownWater=new Set(
      waterFeatures.map(feature=>
        `${feature.type||'way'}/${feature.id}`
      )
    );
    const knownBridge=new Set(
      bridgeFeatures.map(feature=>
        `${feature.type||'way'}/${feature.id}`
      )
    );
    const knownCoastline=new Set(
      coastlineFeatures.map(feature=>
        `${feature.type||'way'}/${feature.id}`
      )
    );

    let waterAdded=0;
    let bridgeAdded=0;
    let coastlineAdded=0;

    for(const element of data.elements||[]){
      const points=elementPoints(element);
      if(points.length<2)continue;

      const key=featureKey(element);
      const tags=element.tags||{};

      if(tags.highway&&tags.bridge){
        if(!knownBridge.has(key)){
          bridgeFeatures.push({
            id:element.id,
            type:element.type||'way',
            points,
            tags,
            generation
          });
          knownBridge.add(key);
          bridgeAdded++;
        }
        continue;
      }

      if(tags.natural==='coastline'){
        if(!knownCoastline.has(key)){
          coastlineFeatures.push({
            id:element.id,
            type:element.type||'way',
            points,
            tags,
            generation
          });
          knownCoastline.add(key);
          coastlineAdded++;
        }
        continue;
      }

      const isWater=
        !!tags.waterway ||
        tags.natural==='water' ||
        tags.landuse==='reservoir';

      if(!isWater||knownWater.has(key))continue;

      const isArea=
        tags.natural==='water' ||
        tags.landuse==='reservoir' ||
        tags.waterway==='riverbank';

      waterFeatures.push({
        id:element.id,
        type:element.type||'way',
        kind:isArea&&points.length>=3
          ?'polygon'
          :'line',
        points,
        tags,
        generation
      });

      knownWater.add(key);
      waterAdded++;
    }

    return {
      waterAdded,
      bridgeAdded,
      coastlineAdded
    };
  }

  async function updateCacheHUD(){
    if(!cacheStatusEl)return 0;

    const count=await cache.count('hydro');

    cacheStatusEl.textContent=
      `Cache IDB: ${count} zone${count!==1?'s':''}`;

    return count;
  }

  async function readCache(lat,lon){
    return cache.get(
      'hydro',
      lat,
      lon,
      HYDRO_TTL_MS
    );
  }

  async function writeCache(lat,lon,data){
    const ok=await cache.set(
      'hydro',
      lat,
      lon,
      data
    );

    updateCacheHUD().catch(()=>{});
    return ok;
  }

  async function loadAround(absx,absz){
    if(state.loading){
      return {
        ok:false,
        busy:true,
        cached:false
      };
    }

    state.loading=true;

    const generation=state.generation;
    const ll=toLatLon(absx,absz);

    try{
      const cached=await readCache(ll.lat,ll.lon);

      if(generation!==state.generation){
        return {ok:false,stale:true,cached:!!cached};
      }

      setStatus(
        cached
          ?'Cache IDB…'
          :'Chargement OSM…'
      );

      let data=cached;

      if(!data){
        data=await overpass.fetchRaw({
          query:query(ll),
          timeoutMs:9000,
          label:'Hydro',
          shouldContinue:()=>
            generation===state.generation,
          onControllerStart:controller=>
            abortControllers.add(controller),
          onControllerEnd:controller=>
            abortControllers.delete(controller)
        });
      }

      if(generation!==state.generation){
        return {ok:false,stale:true,cached:!!cached};
      }

      if(data&&!cached){
        await writeCache(ll.lat,ll.lon,data);
      }

      if(!data){
        setStatus('Indisponible');
        return {
          ok:false,
          cached:false
        };
      }

      const added=ingest(data,generation);

      state.center={
        x:absx,
        z:absz
      };

      const waterCount=waterFeatures.length;
      const coastCount=coastlineFeatures.length;

      setStatus(
        `${cached?'Cache':'OSM'} · `+
        `${waterCount} eau${waterCount!==1?'x':''}`+
        `${coastCount?` · côte ${coastCount}`:''}`
      );

      return {
        ok:true,
        cached:!!cached,
        ...added,
        waterCount,
        bridgeCount:bridgeFeatures.length,
        coastlineCount:coastCount
      };
    }catch(error){
      if(generation===state.generation){
        console.warn('Hydro load failed',error);
        setStatus('Indisponible');
      }

      return {
        ok:false,
        cached:false,
        error
      };
    }finally{
      if(generation===state.generation){
        state.loading=false;
      }
    }
  }

  async function prefetchAt(x,z,timeoutMs=7000){
    const generation=state.generation;
    const ll=toLatLon(x,z);

    const cached=await readCache(ll.lat,ll.lon);
    if(cached){
      return {
        ok:true,
        cached:true
      };
    }

    if(generation!==state.generation){
      return {ok:false,stale:true,cached:false};
    }

    const result=await overpass.fetchCached({
      namespace:'hydro',
      lat:ll.lat,
      lon:ll.lon,
      query:query(ll),
      timeoutMs,
      ttlMs:HYDRO_TTL_MS
    });

    return {
      ok:!!result?.data,
      cached:!!result?.cached
    };
  }

  function reset(){
    state.generation++;

    for(const controller of abortControllers){
      try{
        controller.abort();
      }catch(error){}
    }

    abortControllers.clear();

    waterFeatures.length=0;
    bridgeFeatures.length=0;
    coastlineFeatures.length=0;

    state.loading=false;
    state.center={
      x:Infinity,
      z:Infinity
    };

    setStatus('Réinitialisé');
  }

  return {
    waterFeatures,
    bridgeFeatures,
    coastlineFeatures,
    query,
    ingest,
    loadAround,
    prefetchAt,
    reset,
    updateCacheHUD,

    get loading(){
      return state.loading;
    },

    get center(){
      return state.center;
    },

    get generation(){
      return state.generation;
    }
  };
}
