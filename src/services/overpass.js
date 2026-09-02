import {ensureWorldDriveDiagnostics,installDiagnosticAlias} from './diagnostics.js';

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
  ],
  minRequestGapMs=900,
  maxConcurrentRequests=2
}={}) {
  if(!cache)throw new Error('Overpass client requires a cache');
  if(typeof keyFor!=='function'){
    throw new Error('Overpass client requires keyFor()');
  }

  const pending=cache.pending || new Map();
  const endpointCooldownUntil=new Map();
  const endpointFailures=new Map();
  const endpointSoftFailures=new Map();
  const endpointSuccesses=new Map();
  const endpointLastIssue=new Map();
  const endpointLastLogAt=new Map();

  const requestGapMs=Math.max(0,Number(minRequestGapMs)||0);
  const laneCount=Math.max(
    1,
    Math.min(4,Math.floor(Number(maxConcurrentRequests)||1))
  );
  const networkTails=Array.from({length:laneCount},()=>Promise.resolve());
  const laneLabels=Array(laneCount).fill(null);

  let nextLane=0;
  let endpointCursor=0;
  let paceTail=Promise.resolve();
  let lastNetworkRequestAt=0;
  let queuedLogicalRequests=0;
  let activeLogicalRequests=0;
  let lastAllMirrorsLogAt=0;

  function nowMs(){return Date.now();}
  function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

  function endpointAvailable(endpoint){
    return (endpointCooldownUntil.get(endpoint)||0)<=nowMs();
  }

  function endpointName(endpoint){
    try{return new URL(endpoint).hostname;}catch{return String(endpoint);}
  }

  function markEndpointSuccess(endpoint){
    endpointFailures.delete(endpoint);
    endpointSoftFailures.delete(endpoint);
    endpointCooldownUntil.delete(endpoint);
    endpointLastIssue.delete(endpoint);
    endpointSuccesses.set(
      endpoint,
      (endpointSuccesses.get(endpoint)||0)+1
    );
  }

  function markEndpointFailure(endpoint,{cooldownMs=null}={}){
    const failures=(endpointFailures.get(endpoint)||0)+1;
    endpointFailures.set(endpoint,failures);

    const computedCooldown=Math.min(
      120000,
      15000*Math.pow(2,Math.min(3,failures-1))
    );
    endpointCooldownUntil.set(
      endpoint,
      nowMs()+Math.max(0,cooldownMs??computedCooldown)
    );
  }

  function markEndpointSoftFailure(endpoint){
    endpointSoftFailures.set(
      endpoint,
      (endpointSoftFailures.get(endpoint)||0)+1
    );
  }

  function noteAllMirrorsUnavailable(){
    const now=nowMs();
    if(now-lastAllMirrorsLogAt<30000)return;
    lastAllMirrorsLogAt=now;
    console.info(
      'OSM Overpass hard-failure cooldown active; cached data and driving continue'
    );
  }

  function noteEndpointIssue(endpoint,issue){
    const now=nowMs();
    endpointLastIssue.set(endpoint,{
      kind:issue.kind,
      status:issue.status||0,
      at:now
    });

    const last=endpointLastLogAt.get(endpoint)||0;
    if(now-last<12000)return;
    endpointLastLogAt.set(endpoint,now);
    console.info(
      'OSM Overpass mirror issue',
      endpointName(endpoint),
      issue.kind,
      issue.status||''
    );
  }

  function classifyFailure(error){
    const status=Number(error?.status)||0;

    // An AbortError is normally the caller's per-query timeout or deliberate
    // cancellation. A heavy hydro query timing out does not prove that the
    // endpoint is unusable for a lighter scenery/sign/metadata query.
    if(error?.name==='AbortError'||status===408||status===504){
      return {kind:'query-timeout',status,hard:false};
    }

    if(status===429){
      return {kind:'rate-limit',status,hard:true,cooldownMs:30000};
    }

    if(status>=500&&status<=503){
      return {kind:'server-unavailable',status,hard:true};
    }

    // 4xx responses other than rate limiting are usually query-specific. Do
    // not poison unrelated world services because one query was rejected.
    if(status>=400&&status<500){
      return {kind:'query-rejected',status,hard:false};
    }

    // Browser/network failures with no HTTP status are endpoint-health signals.
    if(error instanceof TypeError||error?.softProxyFailure){
      return {kind:'network',status,hard:true};
    }

    return {kind:'response-error',status,hard:true};
  }

  function orderedAvailableEndpoints(){
    const count=endpoints.length;
    if(!count)return [];

    const ordered=[];
    for(let i=0;i<count;i++){
      const endpoint=endpoints[(endpointCursor+i)%count];
      if(endpointAvailable(endpoint))ordered.push(endpoint);
    }
    endpointCursor=(endpointCursor+1)%count;
    return ordered;
  }

  function paceNextRequest(){
    const task=paceTail.then(async()=>{
      const elapsed=nowMs()-lastNetworkRequestAt;
      const waitMs=Math.max(0,requestGapMs-elapsed);
      if(waitMs>0)await delay(waitMs);
      lastNetworkRequestAt=nowMs();
    });
    paceTail=task.catch(()=>null);
    return task;
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
    // Keep public traffic polite even though two logical world-service requests
    // may now overlap. Their outbound starts are still globally spaced.
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
        const error=new Error('HTTP '+response.status);
        error.status=response.status;
        throw error;
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

  async function fetchRawLane({
    query,
    timeoutMs,
    shouldContinue,
    onControllerStart,
    onControllerEnd
  }){
    const available=orderedAvailableEndpoints();
    if(!available.length){
      noteAllMirrorsUnavailable();
      return null;
    }

    for(const endpoint of available){
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
        if(!shouldContinue())return null;

        const issue=classifyFailure(error);
        noteEndpointIssue(endpoint,issue);

        if(issue.hard){
          markEndpointFailure(endpoint,{cooldownMs:issue.cooldownMs});
        }else{
          markEndpointSoftFailure(endpoint);
        }

        // Hard network failures remain warnings; expected query timeouts and
        // proxy health events stay compact to avoid DevTools spam.
        if(
          issue.hard&&
          !error?.softProxyFailure&&
          error?.name!=='AbortError'
        ){
          console.warn('Overpass request failed',endpoint,error);
        }
      }
    }

    return null;
  }

  function fetchRaw({
    query,
    timeoutMs=7500,
    label='OSM',
    shouldContinue=()=>true,
    onControllerStart=null,
    onControllerEnd=null
  }){
    if(!query)return Promise.reject(new Error('Overpass query is required'));

    const lane=nextLane;
    nextLane=(nextLane+1)%laneCount;
    queuedLogicalRequests++;

    const execute=async()=>{
      queuedLogicalRequests=Math.max(0,queuedLogicalRequests-1);
      activeLogicalRequests++;
      laneLabels[lane]=label;
      try{
        return await fetchRawLane({
          query,
          timeoutMs,
          shouldContinue,
          onControllerStart,
          onControllerEnd
        });
      }finally{
        activeLogicalRequests=Math.max(0,activeLogicalRequests-1);
        laneLabels[lane]=null;
      }
    };

    const run=networkTails[lane].then(execute,execute);
    networkTails[lane]=run.catch(()=>null);
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

  function diagnostics(){
    const now=nowMs();
    return {
      pendingCacheRequests:pending.size,
      queuedLogicalRequests,
      activeLogicalRequests,
      activeLabels:laneLabels.filter(Boolean),
      maxConcurrentRequests:laneCount,
      minRequestGapMs:requestGapMs,
      endpoints:endpoints.map(endpoint=>({
        endpoint,
        host:endpointName(endpoint),
        available:endpointAvailable(endpoint),
        cooldownMs:Math.max(0,(endpointCooldownUntil.get(endpoint)||0)-now),
        consecutiveHardFailures:endpointFailures.get(endpoint)||0,
        softFailures:endpointSoftFailures.get(endpoint)||0,
        successes:endpointSuccesses.get(endpoint)||0,
        lastIssue:endpointLastIssue.get(endpoint)||null
      }))
    };
  }

  if(typeof window!=='undefined'){
    const root=ensureWorldDriveDiagnostics(window);
    root.streaming.overpass=diagnostics;
    installDiagnosticAlias(
      'WorldDriveOverpass',
      ()=>root.streaming.overpass,
      window
    );
  }

  return {
    fetchRaw,
    fetchCached,
    pendingCount,
    diagnostics
  };
}
