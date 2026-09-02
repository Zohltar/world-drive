// World Drive - local compressed hydrography source
// Reads Geofabrik-derived hydro JSONL gzip tiles and adapts compact GeoJSON
// records to the existing water-data Overpass-style ingest contract.

const EARTH_RADIUS_M=6378137;
const MAX_MERCATOR_LAT=85.05112878;
const DEFAULT_TILE_SIZE_M=16000;
const DEFAULT_RADIUS_M=7000;
const DEFAULT_BASE_URL='/world-data/osm-v2/quebec/hydro';
const EXPECTED_FORMAT='world-drive-osm-hydro-jsonl-gzip-v2';

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

function lonLatToMercator(lon,lat){
  const safeLat=clamp(Number(lat),-MAX_MERCATOR_LAT,MAX_MERCATOR_LAT);
  const safeLon=Number(lon);
  return {
    x:EARTH_RADIUS_M*safeLon*Math.PI/180,
    y:EARTH_RADIUS_M*Math.log(Math.tan(Math.PI/4+(safeLat*Math.PI/180)/2))
  };
}

export function offlineHydroTileForLatLon(lat,lon,tileSizeMeters=DEFAULT_TILE_SIZE_M){
  const {x,y}=lonLatToMercator(lon,lat);
  return {
    x:Math.floor(x/tileSizeMeters),
    y:Math.floor(y/tileSizeMeters)
  };
}

function tileRangeForRadius(lat,lon,radiusMeters,tileSizeMeters){
  const center=lonLatToMercator(lon,lat);
  return {
    minX:Math.floor((center.x-radiusMeters)/tileSizeMeters),
    maxX:Math.floor((center.x+radiusMeters)/tileSizeMeters),
    minY:Math.floor((center.y-radiusMeters)/tileSizeMeters),
    maxY:Math.floor((center.y+radiusMeters)/tileSizeMeters)
  };
}

function parseJsonLines(text){
  const records=[];
  for(const raw of String(text||'').split(/\r?\n/)){
    const line=raw.trim();
    if(!line)continue;
    records.push(JSON.parse(line));
  }
  return records;
}

async function decodeResponseText(response){
  if(typeof response.arrayBuffer!=='function'){
    if(typeof response.text==='function')return response.text();
    throw new Error('Hydro tile response has no readable body');
  }

  const bytes=new Uint8Array(await response.arrayBuffer());
  const gzip=bytes.length>=2&&bytes[0]===0x1f&&bytes[1]===0x8b;
  if(!gzip)return new TextDecoder().decode(bytes);

  if(typeof DecompressionStream!=='function'){
    throw new Error('Gzip hydro tiles require DecompressionStream support');
  }

  const stream=new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function parseFeatureIdentity(recordId){
  const text=String(recordId??'');
  const slash=text.indexOf('/');
  const type=slash>0?text.slice(0,slash):'way';
  const rawId=slash>0?text.slice(slash+1):text;
  const id=/^-?\d+$/.test(rawId)?Number(rawId):rawId;
  return {type,id,rawId};
}

function geometryParts(geometry){
  const type=geometry?.type;
  const coordinates=geometry?.coordinates;
  if(!Array.isArray(coordinates))return [];

  if(type==='LineString')return [coordinates];
  if(type==='MultiLineString')return coordinates;
  if(type==='Polygon')return coordinates.length?[coordinates[0]]:[];
  if(type==='MultiPolygon'){
    return coordinates
      .map(polygon=>Array.isArray(polygon)&&polygon.length?polygon[0]:null)
      .filter(Boolean);
  }
  return [];
}

function coordinateLineToGeometry(line){
  if(!Array.isArray(line))return [];
  const geometry=[];
  for(const coordinate of line){
    if(!Array.isArray(coordinate)||coordinate.length<2)continue;
    const lon=Number(coordinate[0]);
    const lat=Number(coordinate[1]);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    geometry.push({lat,lon});
  }
  return geometry;
}

export function compactHydroRecordToElements(record){
  const identity=parseFeatureIdentity(record?.id);
  const parts=geometryParts(record?.g);
  const tags=record?.t&&typeof record.t==='object'?record.t:{};
  const elements=[];

  for(let i=0;i<parts.length;i++){
    const geometry=coordinateLineToGeometry(parts[i]);
    if(geometry.length<2)continue;
    elements.push({
      type:identity.type,
      id:i===0?identity.id:`${identity.rawId}#${i}`,
      tags,
      geometry
    });
  }

  return elements;
}

function boundsIntersectsRadius(record,lat,lon,radiusMeters){
  const bounds=record?.b;
  if(!bounds)return true;
  const center=lonLatToMercator(lon,lat);
  const min=lonLatToMercator(bounds.minLon,bounds.minLat);
  const max=lonLatToMercator(bounds.maxLon,bounds.maxLat);
  const minX=Math.min(min.x,max.x);
  const maxX=Math.max(min.x,max.x);
  const minY=Math.min(min.y,max.y);
  const maxY=Math.max(min.y,max.y);
  return !(
    maxX<center.x-radiusMeters||
    minX>center.x+radiusMeters||
    maxY<center.y-radiusMeters||
    minY>center.y+radiusMeters
  );
}

export function createOfflineHydroSource({
  baseUrl=DEFAULT_BASE_URL,
  fetchImpl=globalThis.fetch
}={}){
  if(typeof fetchImpl!=='function')throw new Error('Offline hydro source requires fetch()');

  const root=String(baseUrl).replace(/\/+$/,'');
  let manifestPromise=null;
  let oversizePromise=null;
  const tilePromises=new Map();
  const stats={
    manifestLoads:0,
    tileFetches:0,
    tileHits:0,
    tileMisses:0,
    oversizeLoads:0,
    localLoads:0,
    localUnavailable:0
  };

  async function fetchManifest(){
    if(manifestPromise)return manifestPromise;
    manifestPromise=(async()=>{
      const response=await fetchImpl(`${root}/manifest.json`);
      if(response?.status===404)return null;
      if(!response?.ok)throw new Error(`Hydro manifest HTTP ${response?.status??'error'}`);
      const manifest=typeof response.json==='function'
        ?await response.json()
        :JSON.parse(await response.text());
      if(manifest?.format!==EXPECTED_FORMAT){
        throw new Error(`Unsupported hydro manifest format: ${manifest?.format||'missing'}`);
      }
      if(!(Number(manifest.sourceTileSizeMeters)>0)){
        throw new Error('Hydro manifest missing sourceTileSizeMeters');
      }
      stats.manifestLoads++;
      return manifest;
    })();
    try{return await manifestPromise;}
    catch(error){manifestPromise=null;throw error;}
  }

  async function fetchTile(x,y){
    const key=`${x}/${y}`;
    if(tilePromises.has(key)){
      stats.tileHits++;
      return tilePromises.get(key);
    }

    stats.tileFetches++;
    const promise=(async()=>{
      const response=await fetchImpl(`${root}/tiles/${x}/${y}.jsonl.gz`);
      if(response?.status===404){
        stats.tileMisses++;
        return {exists:false,records:[]};
      }
      if(!response?.ok)throw new Error(`Hydro tile ${key} HTTP ${response?.status??'error'}`);
      return {
        exists:true,
        records:parseJsonLines(await decodeResponseText(response))
      };
    })();
    tilePromises.set(key,promise);
    try{return await promise;}
    catch(error){tilePromises.delete(key);throw error;}
  }

  async function fetchOversize(manifest){
    const file=manifest?.oversize?.file||manifest?.files?.oversize;
    if(!file)return [];
    if(oversizePromise)return oversizePromise;
    oversizePromise=(async()=>{
      const response=await fetchImpl(`${root}/${file}`);
      if(response?.status===404){
        throw new Error(`Hydro oversize file is declared but missing: ${file}`);
      }
      if(!response?.ok)throw new Error(`Hydro oversize HTTP ${response?.status??'error'}`);
      stats.oversizeLoads++;
      return parseJsonLines(await decodeResponseText(response));
    })();
    try{return await oversizePromise;}
    catch(error){oversizePromise=null;throw error;}
  }

  async function loadAround(lat,lon,radiusMeters=DEFAULT_RADIUS_M){
    const manifest=await fetchManifest();
    if(!manifest){
      stats.localUnavailable++;
      return {available:false,reason:'manifest-missing'};
    }

    const tileSizeMeters=Number(manifest.sourceTileSizeMeters);
    const centerTile=offlineHydroTileForLatLon(lat,lon,tileSizeMeters);
    const center=await fetchTile(centerTile.x,centerTile.y);
    if(!center.exists){
      stats.localUnavailable++;
      return {
        available:false,
        reason:'center-tile-missing',
        centerTile
      };
    }

    const range=tileRangeForRadius(lat,lon,radiusMeters,tileSizeMeters);
    const requests=[];
    for(let x=range.minX;x<=range.maxX;x++){
      for(let y=range.minY;y<=range.maxY;y++){
        if(x===centerTile.x&&y===centerTile.y){
          requests.push(Promise.resolve({x,y,...center}));
        }else{
          requests.push(fetchTile(x,y).then(tile=>({x,y,...tile})));
        }
      }
    }

    const tiles=await Promise.all(requests);
    const unique=new Map();
    for(const tile of tiles){
      if(!tile.exists)continue;
      for(const record of tile.records||[]){
        if(record?.id!==undefined&&!unique.has(String(record.id))){
          unique.set(String(record.id),record);
        }
      }
    }

    const oversize=await fetchOversize(manifest);
    for(const record of oversize){
      if(!boundsIntersectsRadius(record,lat,lon,radiusMeters))continue;
      if(record?.id!==undefined&&!unique.has(String(record.id))){
        unique.set(String(record.id),record);
      }
    }

    const elements=[];
    for(const record of unique.values()){
      elements.push(...compactHydroRecordToElements(record));
    }

    stats.localLoads++;
    return {
      available:true,
      source:'local',
      centerTile,
      tileCount:tiles.filter(tile=>tile.exists).length,
      recordCount:unique.size,
      data:{elements}
    };
  }

  function diagnostics(){
    return {
      ...stats,
      cachedTiles:tilePromises.size,
      manifestCached:!!manifestPromise,
      oversizeCached:!!oversizePromise,
      baseUrl:root
    };
  }

  return {
    loadAround,
    diagnostics
  };
}
