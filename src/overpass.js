// World Drive - Overpass client
// Owns Overpass endpoints, network retries, cache-first reads and in-flight deduplication.
// OSM interpretation/rendering remains in main.js.

export function createOverpassClient({
  cache,
  keyFor,
  endpoints=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ]
}={}) {
  if(!cache)throw new Error('Overpass client requires a cache');
  if(typeof keyFor!=='function'){
    throw new Error('Overpass client requires keyFor()');
  }

  const pending=cache.pending || new Map();

  async function requestEndpoint({
    endpoint,
    query,
    timeoutMs,
    onControllerStart,
    onControllerEnd
  }){
    const controller=new AbortController();
    onControllerStart?.(controller);

    const timer=setTimeout(
      ()=>controller.abort(),
      timeoutMs
    );

    try{
      const response=await fetch(endpoint,{
        method:'POST',
        body:new URLSearchParams({data:query}),
        signal:controller.signal,
        cache:'no-store'
      });

      if(!response.ok){
        throw new Error('HTTP '+response.status);
      }

      return await response.json();
    }finally{
      clearTimeout(timer);
      onControllerEnd?.(controller);
    }
  }

  async function fetchRaw({
    query,
    timeoutMs=7500,
    label='OSM',
    shouldContinue=()=>true,
    onControllerStart=null,
    onControllerEnd=null
  }){
    if(!query)throw new Error('Overpass query is required');

    for(const endpoint of endpoints){
      if(!shouldContinue())return null;

      try{
        const data=await requestEndpoint({
          endpoint,
          query,
          timeoutMs,
          onControllerStart,
          onControllerEnd
        });

        if(!shouldContinue())return null;
        if(data)return data;
      }catch(error){
        // AbortError is expected when an Overpass endpoint reaches its timeout
        // or a caller deliberately cancels an obsolete request. Continue to the
        // next endpoint silently; genuine HTTP/network failures remain visible.
        const expectedAbort=
          error?.name==='AbortError';

        if(shouldContinue()&&!expectedAbort){
          console.warn(
            `${label} Overpass failed`,
            endpoint,
            error
          );
        }
      }
    }

    return null;
  }

  async function fetchCached({
    namespace,
    lat,
    lon,
    query,
    timeoutMs=7500,
    ttlMs=1000*60*60*24*14
  }){
    if(!namespace)throw new Error('Overpass namespace is required');
    if(!Number.isFinite(lat)||!Number.isFinite(lon)){
      throw new Error('Overpass coordinates are invalid');
    }

    const key=keyFor(namespace,lat,lon);

    const cached=await cache.get(
      namespace,
      lat,
      lon,
      ttlMs
    );

    if(cached){
      return {
        data:cached,
        cached:true
      };
    }

    // Visible load and background prefetch share a request when they target
    // the same namespace/geographic cache cell.
    if(pending.has(key)){
      return pending.get(key);
    }

    const task=(async()=>{
      const data=await fetchRaw({
        query,
        timeoutMs,
        label:`OSM ${namespace}`
      });

      if(data){
        await cache.set(namespace,lat,lon,data);
      }

      return {
        data:data||null,
        cached:false
      };
    })();

    pending.set(key,task);

    try{
      return await task;
    }finally{
      pending.delete(key);
    }
  }

  function pendingCount(){
    return pending.size;
  }

  return {
    fetchRaw,
    fetchCached,
    pendingCount
  };
}
