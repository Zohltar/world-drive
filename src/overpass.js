// World Drive - Overpass client
// Owns Overpass endpoints, network retries, cache-first reads and in-flight deduplication.
// OSM interpretation/rendering remains in main.js.

export function createOverpassClient({
  cache,
  keyFor,
  endpoints=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ]
}={}) {
  if(!cache)throw new Error('Overpass client requires a cache');
  if(typeof keyFor!=='function'){
    throw new Error('Overpass client requires keyFor()');
  }

  const pending=cache.pending || new Map();
  const endpointCooldownUntil=new Map();
  const endpointFailures=new Map();

  function nowMs(){return Date.now();}

  function endpointAvailable(endpoint){
    return (endpointCooldownUntil.get(endpoint)||0)<=nowMs();
  }

  function markEndpointSuccess(endpoint){
    endpointFailures.delete(endpoint);
    endpointCooldownUntil.delete(endpoint);
  }

  function markEndpointFailure(endpoint){
    const failures=(endpointFailures.get(endpoint)||0)+1;
    endpointFailures.set(endpoint,failures);

    // Back off quickly when a public endpoint is unhealthy so directional
    // prefetches do not hammer the same failing service every few frames.
    const cooldownMs=Math.min(
      120000,
      15000*Math.pow(2,Math.min(3,failures-1))
    );
    endpointCooldownUntil.set(endpoint,nowMs()+cooldownMs);
  }

  function transportUrl(endpoint){
    if(typeof window==='undefined')return endpoint;

    // Electron installs its own transport by intercepting direct Overpass URLs.
    if(window.worldDriveDesktop?.isDesktop)return endpoint;

    const host=window.location?.hostname||'';
    if(host==='localhost'||host==='127.0.0.1'){
      const proxy=new URL(
        '/__worlddrive_proxy/overpass',
        window.location.origin
      );
      proxy.searchParams.set('target',endpoint);
      return proxy.toString();
    }

    return endpoint;
  }

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
      const response=await fetch(transportUrl(endpoint),{
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

    const available=endpoints.filter(endpointAvailable);
    const candidates=available.length?available:endpoints.slice(0,1);

    for(const endpoint of candidates){
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
        if(data){
          markEndpointSuccess(endpoint);
          return data;
        }
      }catch(error){
        const expectedAbort=error?.name==='AbortError';

        if(shouldContinue()){
          markEndpointFailure(endpoint);
        }

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
