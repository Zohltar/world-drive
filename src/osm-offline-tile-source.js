const EARTH_RADIUS_M=6378137;
const MAX_MERCATOR_LAT=85.05112878;

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

export function offlineTileForLatLon(lat,lon,tileSizeMeters){
  const safeLat=clamp(Number(lat),-MAX_MERCATOR_LAT,MAX_MERCATOR_LAT);
  const x=EARTH_RADIUS_M*Number(lon)*Math.PI/180;
  const y=EARTH_RADIUS_M*Math.log(Math.tan(Math.PI/4+(safeLat*Math.PI/180)/2));
  return {
    x:Math.floor(x/tileSizeMeters),
    y:Math.floor(y/tileSizeMeters)
  };
}

export function offlineTileRangeForRadius(lat,lon,radiusMeters,tileSizeMeters){
  const center=offlineTileForLatLon(lat,lon,tileSizeMeters);
  const radiusTiles=Math.max(0,Math.ceil(Number(radiusMeters||0)/tileSizeMeters));
  const tiles=[];
  for(let x=center.x-radiusTiles;x<=center.x+radiusTiles;x++){
    for(let y=center.y-radiusTiles;y<=center.y+radiusTiles;y++){
      tiles.push({x,y});
    }
  }
  return tiles;
}

function parseJsonLines(text){
  const result=[];
  for(const line of String(text||'').split(/\r?\n/)){
    const trimmed=line.trim();
    if(trimmed)result.push(JSON.parse(trimmed));
  }
  return result;
}

export function createOfflineOsmTileSource({
  baseUrl='/world-data/osm/quebec',
  fetchImpl=globalThis.fetch
}={}){
  if(typeof fetchImpl!=='function'){
    throw new Error('Offline OSM tile source requires fetch()');
  }

  const normalizedBase=String(baseUrl).replace(/\/+$/,'');
  const tileCache=new Map();
  let manifestPromise=null;
  let tileHits=0;
  let tileMisses=0;

  async function loadManifest(){
    if(!manifestPromise){
      manifestPromise=(async()=>{
        const response=await fetchImpl(`${normalizedBase}/manifest.json`,{cache:'no-store'});
        if(!response.ok){
          throw new Error(`Offline OSM manifest HTTP ${response.status}`);
        }
        const manifest=await response.json();
        if(manifest?.format!=='world-drive-osm-jsonl-v1'){
          throw new Error(`Unsupported offline OSM format: ${manifest?.format||'unknown'}`);
        }
        return manifest;
      })().catch(error=>{
        manifestPromise=null;
        throw error;
      });
    }
    return manifestPromise;
  }

  async function loadTile(x,y){
    const key=`${x}/${y}`;
    if(tileCache.has(key)){
      tileHits++;
      return tileCache.get(key);
    }

    const task=(async()=>{
      const response=await fetchImpl(
        `${normalizedBase}/tiles/${x}/${y}.jsonl`,
        {cache:'force-cache'}
      );
      if(response.status===404)return [];
      if(!response.ok){
        throw new Error(`Offline OSM tile ${key} HTTP ${response.status}`);
      }
      return parseJsonLines(await response.text());
    })();

    tileCache.set(key,task);
    tileMisses++;
    try{
      return await task;
    }catch(error){
      tileCache.delete(key);
      throw error;
    }
  }

  async function loadAround(lat,lon,radiusMeters=9000){
    const manifest=await loadManifest();
    const tiles=offlineTileRangeForRadius(
      lat,
      lon,
      radiusMeters,
      manifest.tileSizeMeters
    );
    const batches=await Promise.all(
      tiles.map(tile=>loadTile(tile.x,tile.y))
    );

    const seen=new Set();
    const records=[];
    for(const batch of batches){
      for(const record of batch){
        const key=String(record?.id||'');
        if(key&&seen.has(key))continue;
        if(key)seen.add(key);
        records.push(record);
      }
    }

    return {
      manifest,
      tiles,
      records
    };
  }

  function clear(){
    tileCache.clear();
    manifestPromise=null;
    tileHits=0;
    tileMisses=0;
  }

  function diagnostics(){
    return {
      baseUrl:normalizedBase,
      manifestLoaded:!!manifestPromise,
      cachedTiles:tileCache.size,
      tileHits,
      tileMisses
    };
  }

  return {
    loadManifest,
    loadTile,
    loadAround,
    clear,
    diagnostics
  };
}
