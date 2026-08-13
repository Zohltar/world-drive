// World Drive - unified world streaming policy
// Owns WHEN visible services refresh and WHEN route-ahead caches prefetch.
// Individual data/render modules still own HOW their content loads/renders.

export function createWorldStreaming({
  toLatLon,
  nearestRoute,
  routePointAtCum,
  routePointAtFraction,
  getRouteLength,
  elevation,
  water,
  scenery,
  imagery,
  roadMetadata,
  signs,
  fetchCached,
  thresholds={
    elevation:1400,
    water:2200,
    scenery:2600,
    imagery:700,
    roadMetadata:700,
    signs:2500
  },
  prefetch={
    step:850,
    near:1800,
    far:3600
  }
}) {
  if(typeof toLatLon!=='function'){
    throw new Error('World streaming requires toLatLon()');
  }
  if(typeof nearestRoute!=='function'){
    throw new Error('World streaming requires nearestRoute()');
  }
  if(typeof routePointAtCum!=='function'){
    throw new Error('World streaming requires routePointAtCum()');
  }
  if(typeof routePointAtFraction!=='function'){
    throw new Error('World streaming requires routePointAtFraction()');
  }
  if(typeof getRouteLength!=='function'){
    throw new Error('World streaming requires getRouteLength()');
  }
  if(typeof fetchCached!=='function'){
    throw new Error('World streaming requires fetchCached()');
  }

  let lastPrefetchCum=-Infinity;
  let prefetchBusy=false;
  let routePreloadTimers=[];
  let distanceScale=1;

  function setDistanceScale(scale){
    const numeric=Number(scale);

    distanceScale=
      Number.isFinite(numeric)
        ?Math.max(.65,Math.min(1.6,numeric))
        :1;

    return distanceScale;
  }

  function distanceExceeded(x,z,center,distance){
    if(!center)return true;
    const dx=x-center.x;
    const dz=z-center.z;
    return dx*dx+dz*dz>distance*distance;
  }

  function fire(task,label){
    try{
      const result=task?.();
      result?.catch?.(error=>{
        console.warn(`Streaming ${label} failed`,error);
      });
    }catch(error){
      console.warn(`Streaming ${label} failed`,error);
    }
  }

  function maybeLoad(service,x,z,distance,label){
    if(!service||service.loading)return false;

    if(
      !distanceExceeded(
        x,
        z,
        service.center,
        distance*distanceScale
      )
    ){
      return false;
    }

    fire(()=>service.load(x,z),label);
    return true;
  }

  function updateVisible(x,z){
    maybeLoad(
      imagery,
      x,z,
      thresholds.imagery,
      'imagery'
    );

    maybeLoad(
      roadMetadata,
      x,z,
      thresholds.roadMetadata,
      'road metadata'
    );

    maybeLoad(
      elevation,
      x,z,
      thresholds.elevation,
      'elevation'
    );

    maybeLoad(
      water,
      x,z,
      thresholds.water,
      'hydro'
    );

    maybeLoad(
      signs,
      x,z,
      thresholds.signs,
      'signs'
    );

    maybeLoad(
      scenery,
      x,z,
      thresholds.scenery,
      'scenery'
    );
  }

  async function prefetchOsmAt(x,z){
    // Visible OSM requests always win over background caching.
    if(water.loading||scenery.loading)return;

    const ll=toLatLon(x,z);

    await Promise.allSettled([
      water.prefetch(x,z,7000),

      fetchCached(
        'scenery',
        ll,
        scenery.query(ll),
        7000,
        1000*60*60*24*10
      ),

      fetchCached(
        'signs',
        ll,
        signs.query(ll),
        5500,
        1000*60*60*24*10
      )
    ]);
  }

  async function runDirectionalPrefetch(x,z){
    if(prefetchBusy)return false;

    const routeLength=getRouteLength();
    if(routeLength<=0)return false;

    const nearest=nearestRoute(x,z);
    if(!nearest)return false;

    if(
      Number.isFinite(lastPrefetchCum) &&
      nearest.cum-lastPrefetchCum<prefetch.step*distanceScale
    ){
      return false;
    }

    lastPrefetchCum=nearest.cum;
    prefetchBusy=true;

    try{
      const maxCum=Math.max(0,routeLength-1);

      const near=routePointAtCum(
        Math.min(maxCum,nearest.cum+prefetch.near*distanceScale)
      );

      const far=routePointAtCum(
        Math.min(maxCum,nearest.cum+prefetch.far*distanceScale)
      );

      await Promise.allSettled([
        elevation.prefetch(near.x,near.z),
        imagery.prefetch(near.x,near.z),
        prefetchOsmAt(near.x,near.z)
      ]);

      await Promise.allSettled([
        elevation.prefetch(far.x,far.z),
        imagery.prefetch(far.x,far.z)
      ]);

      return true;
    }finally{
      prefetchBusy=false;
    }
  }

  function prefetchDirectional(x,z){
    runDirectionalPrefetch(x,z).catch(error=>{
      console.warn(
        'Directional world prefetch failed',
        error
      );
    });
  }

  function clearRouteTimers(){
    for(const timer of routePreloadTimers){
      clearTimeout(timer);
    }
    routePreloadTimers=[];
  }

  function preloadRoute(x,z){
    if(getRouteLength()<=0)return;

    clearRouteTimers();

    const generation=water.generation;

    // Current visible hydro may rebuild the scene.
    fire(
      ()=>water.load(x,z),
      'initial hydro'
    );

    // Future route samples are cache-only.
    const fractions=[.20,.40,.60,.80];

    fractions.forEach((fraction,index)=>{
      const timer=setTimeout(async()=>{
        if(
          generation!==water.generation ||
          water.loading ||
          scenery.loading
        ){
          return;
        }

        const point=routePointAtFraction(fraction);

        try{
          await water.prefetch(
            point.x,
            point.z,
            7000
          );
        }catch(error){
          console.warn(
            'Route hydro prefetch failed',
            error
          );
        }
      },3500+index*3500);

      routePreloadTimers.push(timer);
    });
  }

  function reset(){
    clearRouteTimers();
    lastPrefetchCum=-Infinity;
    prefetchBusy=false;
  }

  return {
    updateVisible,
    prefetchDirectional,
    preloadRoute,
    reset,
    setDistanceScale,

    get distanceScale(){
      return distanceScale;
    },

    get prefetchBusy(){
      return prefetchBusy;
    },

    get lastPrefetchCum(){
      return lastPrefetchCum;
    }
  };
}
