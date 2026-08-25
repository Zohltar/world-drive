// World Drive - Overpass client
// Owns Overpass endpoints, network retries, cache-first reads and in-flight deduplication.
// OSM interpretation/rendering remains in main.js.

export function createOverpassClient({
  cache,
  keyFor,
  endpoints=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter'
  ]
}={}) {
  if(!cache)throw new Error('Overpass client requires a cache');
  if(typeof keyFor!=='function'){
    throw new Error('Overpass client requires keyFor()');
  }

  const pending=cache.pending || new Map();
  const endpointCooldownUntil=new Map();
  const endpointFailures=new Map();
  const MIN_REQUEST_GAP_MS=900;
  let globalCooldownUntil=0;
  let networkTail=Promise.resolve();
  let lastNetworkRequestAt=0;
  let lastAllMirrorsLogAt=0;

  function nowMs(){return Date.now();}
  function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

  function endpointAvailable(endpoint){
    return (endpointCooldownUntil.get(endpoint)||0)<=nowMs();
  }

  function markEndpointSuccess(endpoint){
    endpointFailures.delete(endpoint);
    endpointCooldownUntil.delete(endpoint);
    globalCooldownUntil=0;
  }

  function markEndpointFailure(endpoint){
    const failures=(endpointFailures.get(endpoint)||0)+1;
    endpointFailures.set(endpoint,failures);

    const cooldownMs=Math.min(
      120000,
      15000*Math.pow(2,Math.min(3,failures-1))
    );
    endpointCooldownUntil.set(endpoint,nowMs()+cooldownMs);
  }

  function allEndpointsCoolingDown(){
    return endpoints.every(endpoint=>!endpointAvailable(endpoint));
  }

  function noteAllMirrorsUnavailable(){
    const now=nowMs();
    if(now-lastAllMirrorsLogAt<30000)return;
    lastAllMirrorsLogAt=now;
    console.info('OSM Overpass temporarily unavailable; cached data and driving continue');
  }

  async function paceNextRequest(){
    const elapsed=nowMs()-lastNetworkRequestAt;
    const waitMs=Math.max(0,MIN_REQUEST_GAP_MS-elapsed);
    if(waitMs>0)await delay(waitMs);
    lastNetworkRequestAt=nowMs();
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
    // Be deliberately polite to public Overpass infrastructure. This applies to
    // normal requests and mirror failover alike, so a failing mirror cannot make
    // World Drive immediately hammer the next one in the same burst.
    await paceNextRequest();

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

      const data=await response.json();

      // Vite dev proxy reports upstream 429/5xx/timeouts as an application-level
      // JSON failure with HTTP 200. This keeps Chrome from logging expected red
      // network errors while still letting this client fail over normally.
      if(data?.__worldDriveOverpassFailure){
        const error=new Error(
          data.message||`Overpass upstream HTTP ${data.status||'failure'}`
        );
        error.status=Number(data.status)||0;
        error.softProxyFailure=true;
        throw error;
      }

      return data;
    }finally{
      clearTimeout(timer);
      onControllerEnd?.(controller);
    }
  }

  async function fetchRawSerial({
    query,
    timeoutMs,
    shouldContinue,
    onControllerStart,
    onControllerEnd
  }){
    // Re-check health only when this queued request actually gets its turn.
    // A request ahead of it may just have discovered that a mirror is down.
    if(globalCooldownUntil>nowMs())return null;

    const available=endpoints.filter(endpointAvailable);
    if(!available.length){
      globalCooldownUntil=Math.max(globalCooldownUntil,nowMs()+15000);
      noteAllMirrorsUnavailable();
      return null;
    }

    let attempted=0;
    for(const endpoint of available){
      if(!shouldContinue())return null;
      attempted++;

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
        if(shouldContinue())markEndpointFailure(endpoint);

        // Soft proxy failures are expected service-health events, not game
        // errors. Do not dump one stack trace per hydro/scenery/sign request.
        if(shouldContinue()&&!expectedAbort&&!error?.softProxyFailure){
          console.warn('Overpass request failed',endpoint,error);
        }
      }
    }

    if(attempted>0&&allEndpointsCoolingDown()){
      globalCooldownUntil=nowMs()+30000;
      noteAllMirrorsUnavailable();
    }

    return null;
  }

  function fetchRaw({
    query,
    timeoutMs=7500,
    label='OSM', // retained for API compatibility / diagnostics callers
    shouldContinue=()=>true,
    onControllerStart=null,
    onControllerEnd=null
  }){
    if(!query)return Promise.reject(new Error('Overpass query is required'));
    void label;

    // Public Overpass instances dislike bursts. Hydro, road metadata, scenery
    // and signs therefore share one network lane, and each outbound request is
    // spaced by MIN_REQUEST_GAP_MS. Cache hits never enter this queue, and the
    // driving/rendering loop never waits on it.
    const run=networkTail.then(
      ()=>fetchRawSerial({
        query,
        timeoutMs,
        shouldContinue,
        onControllerStart,
        onControllerEnd
      }),
      ()=>fetchRawSerial({
        query,
        timeoutMs,
        shouldContinue,
        onControllerStart,
        onControllerEnd
      })
    );

    networkTail=run.catch(()=>null);
    return run;
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
