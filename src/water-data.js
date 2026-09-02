// World Drive - hydrography data subsystem
// Step 13A: owns hydro/coastline/bridge OSM query, persistent cache,
// parsing/deduplication, request cancellation and streaming state.
// Three.js water rendering and bridge geometry orchestration remain in main.js.

import {createOfflineHydroSource} from './offline-hydro-source.js';

const HYDRO_TTL_MS=1000*60*60*24*30;
const HYDRO_RADIUS_M=7000;

export function createWaterDataService({
  statusEl,
  cacheStatusEl,
  cache,
  overpass,
  toLatLon,
  toWorld,
  offline=typeof window!=='undefined'?createOfflineHydroSource():null
}) {
  if(!cache)throw new Error('Water data requires cache');
  if(!overpass)throw new Error('Water data requires overpass client');
  if(typeof toLatLon!=='function'){
    throw new Error('Water data requires toLatLon()');
  }
  if(typeof toWorld!=='function'){
    throw new Error('Water data requires toWorld()');
  }
  if(offline&&typeof offline.loadAround!=='function'){
    throw new Error('Water data offline source requires loadAround()');
  }

  const waterFeatures=[];
  const bridgeFeatures=[];
  const coastlineFeatures=[];

  const state={
    loading:false,
    center:{x:Infinity,z:Infinity},
    generation:0,
    source:'none'
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

  function completeLoad({data,generation,absx,absz,source,cached=false}){
    const added=ingest(data,generation);

    state.center={
      x:absx,
      z:absz
    };
    state.source=source;

    const waterCount=waterFeatures.length;
    const coastCount=coastlineFeatures.length;
    const label=source==='local'
      ?'Local'
      :cached
        ?'Cache'
        :'OSM';

    setStatus(
      `${label} · `+
      `${waterCount} eau${waterCount!==1?'x':''}`+
      `${coastCount?` · côte ${coastCount}`:''}`
    );

    return {
      ok:true,
      cached,
      source,
      ...added,
      waterCount,
      bridgeCount:bridgeFeatures.length,
      coastlineCount:coastCount
    };
  }

  async function loadAround(absx,absz){
    if(state.loading){
      return {
        ok:false,
        busy:true,
        cached:false,
        source:state.source
      };
    }

    state.loading=true;

    const generation=state.generation;
    const ll=toLatLon(absx,absz);

    try{
      if(offline){
        setStatus('Hydro local…');
        const local=await offline.loadAround(ll.lat,ll.lon,HYDRO_RADIUS_M);

        if(generation!==state.generation){
          return {ok:false,stale:true,cached:false,source:'local'};
        }

        if(local?.available){
          return completeLoad({
            data:local.data,
            generation,
            absx,
            absz,
            source:'local',
            cached:false
          });
        }
      }

      const cached=await readCache(ll.lat,ll.lon);

      if(generation!==state.generation){
        return {ok:false,stale:true,cached:!!cached,source:cached?'cache':'none'};
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
        return {ok:false,stale:true,cached:!!cached,source:cached?'cache':'osm'};
      }

      if(data&&!cached){
        await writeCache(ll.lat,ll.lon,data);
      }

      if(!data){
        state.source='none';
        setStatus('Indisponible');
        return {
          ok:false,
          cached:false,
          source:'none'
        };
      }

      return completeLoad({
        data,
        generation,
        absx,
        absz,
        source:cached?'cache':'osm',
        cached:!!cached
      });
    }catch(error){
      if(generation===state.generation){
        console.warn('Hydro load failed',error);
        state.source=offline?'local-error':'none';
        setStatus('Indisponible');
      }

      return {
        ok:false,
        cached:false,
        source:state.source,
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

    if(offline){
      try{
        const local=await offline.loadAround(ll.lat,ll.lon,HYDRO_RADIUS_M);
        if(generation!==state.generation){
          return {ok:false,stale:true,cached:false,source:'local'};
        }
        if(local?.available){
          return {
            ok:true,
            cached:false,
            source:'local'
          };
        }
      }catch(error){
        return {
          ok:false,
          cached:false,
          source:'local',
          error
        };
      }
    }

    const cached=await readCache(ll.lat,ll.lon);
    if(cached){
      return {
        ok:true,
        cached:true,
        source:'cache'
      };
    }

    if(generation!==state.generation){
      return {ok:false,stale:true,cached:false,source:'none'};
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
      cached:!!result?.cached,
      source:result?.cached?'cache':'osm'
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
    state.source='none';

    setStatus('Réinitialisé');
  }

  function diagnostics(){
    return {
      source:state.source,
      loading:state.loading,
      generation:state.generation,
      center:{...state.center},
      offline:offline&&typeof offline.diagnostics==='function'
        ?offline.diagnostics()
        :null
    };
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
    diagnostics,

    get loading(){
      return state.loading;
    },

    get center(){
      return state.center;
    },

    get generation(){
      return state.generation;
    },

    get source(){
      return state.source;
    }
  };
}
