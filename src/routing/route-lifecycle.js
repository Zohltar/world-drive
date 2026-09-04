export function createRouteLifecycle({
  version,
  getState,
  setState,
  validLatLon,
  geoDist,
  toast,
  setAutopilot,
  resetStreamingCoordinator,
  waterData,
  skidMarks,
  route,
  segments,
  bridgeManager,
  bridgeStatus,
  waterRenderer,
  sceneryData,
  elevationService,
  imageryService,
  signData,
  resetMinimapSignReadout,
  signStatus,
  updateRoadMetaHUD,
  clearActiveRoadProfile,
  terrainService,
  clearGroup,
  roadGroup,
  forestGroup,
  infrastructureGroup,
  signGroup,
  sceneryRenderer,
  resetRunChallenge,
  loading,
  loadingText,
  routingStatus,
  statusEl,
  setBootProgress,
  routingService,
  toWorld,
  prepMap,
  placeAt,
  loadWaterAround,
  preloadRoute,
  loadElevationAround,
  primeInitialTerrainPreloadBuffer,
  buildImageryMosaic,
  onElevationFallback,
  onImageryFallback,
  promiseWithTimeout,
  hasPendingWorld,
  cancelVisualJob,
  commitLocalWorldRefresh,
  prefetchRouteAhead,
  loadSceneryAround,
  onSceneryUnavailable,
  loadRoadMetadataAround,
  loadGeographicSignsAround,
}){
  const worldDrive={
    version,
    route:{generation:0},
    streaming:{generation:0},
    vehicle:{generation:0},
    ui:{generation:0}
  };
  let activeForestRouteKey=null;

  function bumpRouteGeneration(){
    worldDrive.route.generation++;
    worldDrive.streaming.generation++;
  }

  function ownsRouteGeneration(generation){
    return worldDrive.route.generation===generation;
  }

  function routeFingerprint(coordinates){
    let hash=2166136261>>>0;
    for(const coordinate of coordinates||[]){
      const lon=Math.round((Number(coordinate?.[0])||0)*1e5);
      const lat=Math.round((Number(coordinate?.[1])||0)*1e5);
      hash=Math.imul((hash^lon)>>>0,16777619)>>>0;
      hash=Math.imul((hash^lat)>>>0,16777619)>>>0;
    }
    return `${coordinates?.length||0}:${hash.toString(16)}`;
  }

  function managedForestSwitch(){
    const fn=forestGroup?.userData?.worldDriveSwitchForestRouteCache;
    return typeof fn==='function'?fn:null;
  }

  function resetRouteForest(){
    const managed=!!managedForestSwitch();
    sceneryRenderer.clearForestCache?.();
    // The managed streamer owns persistent route-cache subgroups. Its clearAll
    // already disposes their contents; removing those container groups here would
    // orphan the fixed cache slots. Legacy/mocked renderers keep the old fallback.
    if(!managed)clearGroup(forestGroup);
    activeForestRouteKey=null;
  }

  function switchRouteForest(routeKey){
    if(activeForestRouteKey===routeKey)return {restored:true,key:routeKey};
    const switcher=managedForestSwitch();
    if(switcher){
      const result=switcher(routeKey);
      activeForestRouteKey=routeKey;
      return result||{restored:false,key:routeKey};
    }
    // Compatibility path for QA/legacy renderers without route-cache namespaces.
    resetRouteForest();
    activeForestRouteKey=routeKey;
    return {restored:false,key:routeKey};
  }

  function resetWorldCachesForRequest({preserveForest=false}={}){
    setState({currentRoadGuideSign:null});
    resetStreamingCoordinator();
    waterData.reset();
    skidMarks.clear();

    route.length=0;
    segments.length=0;
    setState({
      routeLength:0,
      vehicleNearestHint:-1,
      vehicleNearestLastX:Infinity,
      vehicleNearestLastZ:Infinity
    });

    bridgeManager.reset();
    bridgeStatus.textContent='0';
    waterRenderer.clear();

    sceneryData.reset();
    // Keep completed elevation/imagery LRU caches across route changes.
    // Only in-flight operations and route-relative state are reset.
    elevationService.reset();
    imageryService.reset();
    bridgeManager.resetCounter();
    setState({
      activeRoadMeta:{
        highway:null,
        surface:'asphalt',
        maxspeed:null,
        lanes:null,
        width:null,
        name:null,
        ref:null,
        confidence:0
      }
    });
    signData.reset();
    resetMinimapSignReadout();
    if(signStatus)signStatus.textContent='0';
    setState({lastRoadMetaCenter:{x:Infinity,z:Infinity},roadMetaLoading:false});
    updateRoadMetaHUD();
    clearActiveRoadProfile();
    terrainService.clearRoadBed();
    clearGroup(roadGroup);

    // Ordinary route requests keep the active forest alive while replacement
    // work is speculative. Once the route owns final terrain it switches to its
    // geometry-keyed forest slot; the previous slot remains available for a
    // rapid return instead of being destroyed and regenerated.
    if(!preserveForest)resetRouteForest();

    clearGroup(infrastructureGroup);
    clearGroup(signGroup);
    sceneryRenderer.clear();
    terrainService.clearHorizon();
  }

  function resetWorldCaches(){
    return resetWorldCachesForRequest();
  }

  async function loadRouteForGeneration(routeGeneration){
    const state=getState();
    const routeStart=state.routeStart;
    const routeEnd=state.routeEnd;
    const routeWaypoints=state.routeWaypoints;
    const routePoints=[routeStart,...routeWaypoints,routeEnd];

    const {coordinates,provider}=await routingService.fetchRoute({points:routePoints,start:routeStart});
    if(!ownsRouteGeneration(routeGeneration))return false;

    routingStatus.textContent=provider;
    const coordsGeo=coordinates;
    const routeKey=routeFingerprint(coordsGeo);

    route.length=0;
    segments.length=0;
    let routeLength=0;
    setState({routeLength:0,vehicleNearestHint:-1,vehicleNearestLastX:Infinity,vehicleNearestLastZ:Infinity});

    for(let i=0;i<coordsGeo.length;i++){
      const [lon,lat]=coordsGeo[i];
      const p=toWorld(lat,lon);
      let cum=routeLength;
      if(i){
        const prev=route[i-1];
        const len=Math.hypot(p.x-prev.x,p.z-prev.z);
        if(len>.02){
          segments.push({ax:prev.x,az:prev.z,bx:p.x,bz:p.z,len,cum:routeLength});
          routeLength+=len;
        }
        cum=routeLength;
      }
      route.push({x:p.x,z:p.z,lat,lon,cum});
    }

    if(segments.length<2||routeLength<100)throw new Error('Tracé routier trop court ou invalide');

    setState({routeLength});
    statusEl.textContent=`Trajet chargé · ${(routeLength/1000).toFixed(1)} km · ${route.length.toLocaleString('fr-CA')} points`;
    return routeKey;
  }

  async function loadRoute(){
    return (await loadRouteForGeneration(worldDrive.route.generation))!==false;
  }

  async function createRequestedRoute(start,end,waypoints=[]){
    bumpRouteGeneration();
    const routeGeneration=worldDrive.route.generation;

    if(!validLatLon(start.lat,start.lon)||!validLatLon(end.lat,end.lon)){
      toast('Coordonnées invalides');
      return false;
    }
    if(geoDist(start,end)<100){
      toast('Départ et arrivée trop proches');
      return false;
    }

    const routeChangeNeedsForestReady=!!getState().gameStarted;

    if(getState().autopilot)setAutopilot(false,'Pilote auto désactivé');

    const routeStart={...start,name:start.name||'Départ'};
    const routeEnd={...end,name:end.name||'Arrivée'};
    const routeWaypoints=Array.isArray(waypoints)?waypoints.slice(0,8):[];

    setState({speed:0,steer:0,autopilotSteer:0,routeStart,routeEnd,routeWaypoints,origin:{lat:routeStart.lat,lon:routeStart.lon}});

    resetWorldCachesForRequest({preserveForest:true});
    resetRunChallenge();

    if(routeChangeNeedsForestReady)loading.classList.remove('hidden');
    else loading.classList.add('hidden');

    loadingText.textContent='Initialisation du trajet…';
    routingStatus.textContent='Connexion…';
    statusEl.textContent='Création du trajet…';

    let completed=false;
    const failsafe=setTimeout(()=>{
      if(!completed&&ownsRouteGeneration(routeGeneration)){
        loading.classList.add('hidden');
        routingStatus.textContent='Timeout';
        statusEl.textContent='Routage trop lent — tu peux réessayer';
        toast('Le routeur ne répond pas');
      }
    },15000);
    const stopIfStale=()=>{
      if(ownsRouteGeneration(routeGeneration))return false;
      completed=true;
      clearTimeout(failsafe);
      return true;
    };

    try{
      setBootProgress('route','loading',`Calcul du trajet ${start.name||'Départ'} → ${end.name||'Arrivée'}`);

      const routeKey=await loadRouteForGeneration(routeGeneration);
      if(stopIfStale())return false;
      if(routeKey===false)return false;

      setBootProgress('route','done','Trajet prêt');
      prepMap();
      placeAt(0);
      clearTimeout(failsafe);

      loadingText.textContent='Chargement de l’hydrographie initiale…';
      setBootProgress('hydro','loading','Hydrographie initiale');

      let position=getState();
      const hydroAttempt=Promise.resolve(loadWaterAround(position.absX,position.absZ)).catch(error=>{
        if(ownsRouteGeneration(routeGeneration))console.warn('Initial hydrography failed',error);
        return {ok:false,error};
      });
      const hydroResult=await Promise.race([
        hydroAttempt,
        new Promise(resolve=>setTimeout(()=>resolve({ok:false,timeout:true}),2500))
      ]);
      if(stopIfStale())return false;
      const hydroReady=hydroResult?.ok===true;

      setBootProgress('hydro',hydroReady?'done':'warn',hydroReady?'Hydrographie prête':'Hydrographie différée / indisponible');
      loadingText.textContent='Préchargement du terrain en avance…';

      position=getState();
      preloadRoute(position.absX,position.absZ);

      const initialElevationReady=await loadElevationAround(position.absX,position.absZ).catch(()=>{
        if(ownsRouteGeneration(routeGeneration))onElevationFallback();
        return false;
      });
      if(stopIfStale())return false;

      await primeInitialTerrainPreloadBuffer().catch(()=>{});
      if(stopIfStale())return false;

      if(imageryService.enabled){
        position=getState();
        await promiseWithTimeout(
          buildImageryMosaic(position.absX,position.absZ).catch(()=>{
            if(ownsRouteGeneration(routeGeneration))return onImageryFallback();
            return false;
          }),
          4500
        );
        if(stopIfStale())return false;
      }

      if(initialElevationReady||hasPendingWorld()){
        cancelVisualJob('world-rebuild');
        if(commitLocalWorldRefresh())placeAt(0,{finalizeOnly:true});
      }

      if(stopIfStale())return false;

      // Forest ownership changes only after final route/terrain work is current.
      // The streamer keeps one previous route slot, so A → B → A can restore A's
      // already-built chunks immediately even if B had entered its P9.35 wait.
      switchRouteForest(routeKey);

      prefetchRouteAhead();
      position=getState();
      loadSceneryAround(position.absX,position.absZ).catch(()=>{
        if(ownsRouteGeneration(routeGeneration))onSceneryUnavailable();
      });
      loadRoadMetadataAround(position.absX,position.absZ).catch(()=>{});
      loadGeographicSignsAround(position.absX,position.absZ).catch(()=>{});

      if(routeChangeNeedsForestReady&&typeof sceneryRenderer.whenInitialForestReady==='function'){
        loadingText.textContent='Préparation de la forêt devant…';
        await sceneryRenderer.whenInitialForestReady().catch(()=>false);
        if(stopIfStale())return false;
      }

      if(stopIfStale())return false;
      completed=true;
      loading.classList.add('hidden');
      toast('Trajet prêt · terrain préchargé');
      return true;
    }catch(error){
      if(!ownsRouteGeneration(routeGeneration)){
        completed=true;
        clearTimeout(failsafe);
        return false;
      }
      completed=true;
      clearTimeout(failsafe);
      console.error('Route creation failed:',error);
      loading.classList.add('hidden');
      routingStatus.textContent='Échec';
      statusEl.textContent='Impossible de créer le trajet — clique Créer le trajet pour réessayer';
      toast('Échec du routage');
      return false;
    }
  }

  return {worldDrive,bumpRouteGeneration,resetWorldCaches,loadRoute,createRequestedRoute};
}
