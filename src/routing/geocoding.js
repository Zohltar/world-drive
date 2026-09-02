// World Drive - geocoding subsystem
// Nominatim search + polite request pacing + waypoint resolution.

export function validLatLon(lat,lon){
  return Number.isFinite(lat) &&
         Number.isFinite(lon) &&
         Math.abs(lat)<=85 &&
         Math.abs(lon)<=180;
}

export function createGeocodingService({
  language='fr',
  minIntervalMs=1050,
  timeoutMs=7000
}={}) {
  let lastRequestAt=0;
  let requestChain=Promise.resolve();

  function wait(ms){
    return new Promise(resolve=>setTimeout(resolve,ms));
  }

  async function pace(){
    const elapsed=Date.now()-lastRequestAt;
    const delay=Math.max(0,minIntervalMs-elapsed);
    if(delay)await wait(delay);
    lastRequestAt=Date.now();
  }

  // Serialize Nominatim requests so simultaneous UI actions cannot accidentally
  // bypass the minimum interval between public API calls.
  function enqueue(task){
    const run=requestChain.then(task,task);
    requestChain=run.catch(()=>{});
    return run;
  }

  function normalizeResult(item,fallbackName){
    const lat=Number(item?.lat);
    const lon=Number(item?.lon);

    if(!validLatLon(lat,lon))return null;

    return {
      lat,
      lon,
      name:item.display_name||fallbackName,
      type:item.type||item.category||''
    };
  }

  async function fetchSearch(query,limit=5){
    const q=String(query||'').trim();
    if(!q)return [];

    await pace();

    const safeLimit=Math.max(1,Math.min(5,Number(limit)||5));
    const url='https://nominatim.openstreetmap.org/search?'+
      new URLSearchParams({
        q,
        format:'jsonv2',
        limit:String(safeLimit),
        addressdetails:'1',
        'accept-language':language
      });

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);

    try{
      const response=await fetch(url,{
        signal:controller.signal,
        headers:{Accept:'application/json'}
      });

      if(!response.ok){
        throw new Error('Géocodage HTTP '+response.status);
      }

      const data=await response.json();
      return (data||[])
        .map(item=>normalizeResult(item,q))
        .filter(Boolean);
    }finally{
      clearTimeout(timer);
    }
  }

  function search(query,limit=5){
    return enqueue(()=>fetchSearch(query,limit));
  }

  function parseCoordinateWaypoint(line){
    const parts=String(line||'')
      .trim()
      .split(/[,\s;]+/)
      .map(Number);

    if(parts.length>=2&&validLatLon(parts[0],parts[1])){
      return {
        lat:parts[0],
        lon:parts[1],
        name:'Waypoint'
      };
    }

    return null;
  }

  async function resolveWaypointLines(text){
    const lines=String(text||'')
      .split(/\n+/)
      .map(x=>x.trim())
      .filter(Boolean)
      .slice(0,8);

    const output=[];

    for(const line of lines){
      const direct=parseCoordinateWaypoint(line);
      if(direct){
        output.push(direct);
        continue;
      }

      try{
        const result=await search(line,1);
        if(result[0]){
          output.push({
            ...result[0],
            name:line
          });
        }
      }catch(error){
        console.warn('Waypoint geocode failed',line,error);
      }
    }

    return output;
  }

  return {
    search,
    resolveWaypointLines,
    parseCoordinateWaypoint
  };
}
