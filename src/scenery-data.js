// World Drive - scenery data subsystem
// Step 12A: owns OSM scenery query, cache/Overpass loading, parsing,
// deduplication and route-relative loading state.
// Three.js scenery rendering remains in main.js.

const SCENERY_TTL_MS=1000*60*60*24*10;

export function createSceneryDataService({
  statusEl,
  toLatLon,
  toWorld,
  fetchCached,
  getGeneration
}) {
  if(typeof toLatLon!=='function'){
    throw new Error('Scenery data requires toLatLon()');
  }
  if(typeof toWorld!=='function'){
    throw new Error('Scenery data requires toWorld()');
  }
  if(typeof fetchCached!=='function'){
    throw new Error('Scenery data requires fetchCached()');
  }

  const features=[];
  const state={
    loading:false,
    center:{x:Infinity,z:Infinity}
  };

  function setStatus(text){
    if(statusEl)statusEl.textContent=text;
  }

  function query(ll){
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

  function elementPoints(element){
    if(element?.geometry?.length){
      return element.geometry.map(point=>{
        const world=toWorld(point.lat,point.lon);
        return {
          x:world.x,
          z:world.z
        };
      });
    }

    const lat=Number(element?.lat);
    const lon=Number(element?.lon);

    if(Number.isFinite(lat)&&Number.isFinite(lon)){
      const world=toWorld(lat,lon);
      return [{
        x:world.x,
        z:world.z
      }];
    }

    return [];
  }

  function ingest(data){
    if(!data)return 0;

    const known=new Set(
      features.map(
        feature=>`${feature.type}/${feature.id}`
      )
    );

    let added=0;

    for(const element of data.elements||[]){
      const key=`${element.type}/${element.id}`;
      if(known.has(key))continue;

      const points=elementPoints(element);
      if(!points.length)continue;

      features.push({
        id:element.id,
        type:element.type,
        points,
        tags:element.tags||{}
      });

      known.add(key);
      added++;
    }

    return added;
  }

  async function loadAround(absx,absz){
    if(state.loading){
      return {
        ok:false,
        busy:true,
        cached:false,
        added:0,
        total:features.length
      };
    }

    state.loading=true;
    setStatus('Chargement…');

    const generation=getGeneration?.()??0;
    const ll=toLatLon(absx,absz);

    try{
      const {
        data,
        cached
      }=await fetchCached(
        'scenery',
        ll,
        query(ll),
        8500,
        SCENERY_TTL_MS
      );

      if(generation!==(getGeneration?.()??0)){
        return {
          ok:false,
          stale:true,
          cached:!!cached,
          added:0,
          total:features.length
        };
      }

      if(!data){
        setStatus('Indisponible');

        return {
          ok:false,
          cached:false,
          added:0,
          total:features.length
        };
      }

      const added=ingest(data);

      state.center={
        x:absx,
        z:absz
      };

      setStatus(
        `${cached?'Cache':'OSM'} · ${features.length} objets`
      );

      return {
        ok:true,
        cached:!!cached,
        added,
        total:features.length
      };
    }catch(error){
      console.warn(
        'Scenery load failed',
        error
      );

      setStatus('Indisponible');

      return {
        ok:false,
        cached:false,
        added:0,
        total:features.length,
        error
      };
    }finally{
      state.loading=false;
    }
  }

  function reset(){
    features.length=0;
    state.loading=false;
    state.center={
      x:Infinity,
      z:Infinity
    };
    setStatus('—');
  }

  return {
    features,
    query,
    ingest,
    loadAround,
    reset,

    get loading(){
      return state.loading;
    },

    get center(){
      return state.center;
    }
  };
}
