// World Drive - geographic sign data subsystem
// Owns OSM sign/city/river data loading and parsing.
// 3D rendering and fallback signs remain in main.js for this first extraction.

const SIGN_TTL_MS=1000*60*60*24*10;

export function createSignDataService({
  statusEl,
  toLatLon,
  toWorld,
  nearestRoute,
  fetchCached,
  getGeneration,
  onChanged
}) {
  if(typeof toLatLon!=='function')throw new Error('Signs requires toLatLon()');
  if(typeof toWorld!=='function')throw new Error('Signs requires toWorld()');
  if(typeof nearestRoute!=='function')throw new Error('Signs requires nearestRoute()');
  if(typeof fetchCached!=='function')throw new Error('Signs requires fetchCached()');

  const signs=[];
  const state={
    loading:false,
    center:{x:Infinity,z:Infinity}
  };

  function updateStatus(){
    if(statusEl)statusEl.textContent=String(signs.length);
  }

  function query(ll){
    return `[out:json][timeout:12];(
      node(around:5000,${ll.lat},${ll.lon})["highway"="traffic_sign"];
      node(around:5000,${ll.lat},${ll.lon})["traffic_sign"];
      node(around:5000,${ll.lat},${ll.lon})["place"~"city|town|village|hamlet"]["name"];
      way(around:5000,${ll.lat},${ll.lon})["waterway"~"river|stream"]["name"];
      way(around:5000,${ll.lat},${ll.lon})["natural"="water"]["name"];
    );out tags geom center;`;
  }

  function routeCorrelationForPoint(x,z,maxDistance=55){
    const nearest=nearestRoute(x,z);
    if(!nearest||nearest.d>maxDistance)return null;
    return nearest;
  }

  function extractWaterName(tags={}){
    return tags['name:fr']||
           tags.name||
           tags.official_name||
           null;
  }

  function elementLatLon(element){
    let lat=element?.lat;
    let lon=element?.lon;

    if((lat==null||lon==null)&&element?.center){
      lat=element.center.lat;
      lon=element.center.lon;
    }

    if(
      (lat==null||lon==null) &&
      element?.geometry?.length
    ){
      const middle=
        element.geometry[Math.floor(element.geometry.length/2)];
      lat=middle.lat;
      lon=middle.lon;
    }

    if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))){
      return null;
    }

    return {
      lat:Number(lat),
      lon:Number(lon)
    };
  }

  function classify(element){
    const tags=element?.tags||{};
    let kind=null;
    let label=null;
    let maxspeed=null;

    const signTag=tags.traffic_sign||'';

    if(tags.highway==='traffic_sign'||signTag){
      const speedMatch=
        String(signTag).match(/(?:maxspeed[:=]?|CA:)?(\d{2,3})/i);

      if(speedMatch){
        kind='speed';
        maxspeed=parseFloat(speedMatch[1]);
        label=String(Math.round(maxspeed));
      }
    }

    if(!kind&&tags.place&&tags.name){
      kind='city';
      label=tags['name:fr']||tags.name;
    }

    if(!kind&&(tags.waterway||tags.natural==='water')){
      const waterName=extractWaterName(tags);
      if(waterName){
        kind='river';
        label=waterName;
      }
    }

    if(!kind||!label)return null;

    return {
      kind,
      label,
      maxspeed
    };
  }

  function ingest(data){
    if(!data)return 0;

    const known=new Set(signs.map(sign=>sign.key));
    let added=0;

    for(const element of data.elements||[]){
      const ll=elementLatLon(element);
      if(!ll)continue;

      const world=toWorld(ll.lat,ll.lon);
      const near=routeCorrelationForPoint(
        world.x,
        world.z,
        85
      );
      if(!near)continue;

      const classified=classify(element);
      if(!classified)continue;

      const {
        kind,
        label,
        maxspeed
      }=classified;

      const key=
        `${kind}:${element.type}:${element.id}:${label}`;

      if(known.has(key))continue;

      signs.push({
        key,
        kind,
        label,
        maxspeed,
        x:world.x,
        z:world.z,
        routeCum:near.cum,
        routeDistance:near.d
      });

      known.add(key);
      added++;
    }

    return added;
  }

  async function loadAround(absx,absz){
    if(state.loading)return false;

    state.loading=true;
    const generation=getGeneration?.()??0;
    const ll=toLatLon(absx,absz);

    try{
      const {data}=await fetchCached(
        'signs',
        ll,
        query(ll),
        6500,
        SIGN_TTL_MS
      );

      if(generation!==(getGeneration?.()??0)){
        return false;
      }

      ingest(data);

      state.center={
        x:absx,
        z:absz
      };

      updateStatus();
      onChanged?.();
      return true;
    }finally{
      state.loading=false;
    }
  }

  function reset(){
    signs.length=0;
    state.loading=false;
    state.center={
      x:Infinity,
      z:Infinity
    };
    updateStatus();
  }

  updateStatus();

  return {
    signs,
    loadAround,
    reset,
    ingest,
    query,
    get loading(){
      return state.loading;
    },
    get center(){
      return state.center;
    }
  };
}
