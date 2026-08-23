import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','route-lifecycle.js');

const raw=fs.readFileSync(mainPath,'utf8');
const eol=raw.includes('\r\n')?'\r\n':'\n';
let main=raw.replace(/\r\n/g,'\n');

const lifecycleImport="import { createRouteLifecycle } from './route-lifecycle.js';";

if(main.includes(lifecycleImport)&&fs.existsSync(modulePath)){
  console.log('V21.26 ROUTE LIFECYCLE REFACTOR: already applied');
  process.exit(0);
}
if(main.includes(lifecycleImport)||fs.existsSync(modulePath)){
  throw new Error('V21.26 route lifecycle refactor: partial previous application detected. Restore the branch before retrying.');
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`V21.26 route lifecycle refactor: ${label} not found. No files changed.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    throw new Error(`V21.26 route lifecycle refactor: ${label} is ambiguous. No files changed.`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

const startMarker='function resetWorldCaches(){';
const endMarker='// ---------- Driving ----------';
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start);
if(start<0||end<0||end<=start){
  throw new Error('V21.26 route lifecycle refactor: lifecycle block markers not found. No files changed.');
}

const legacyBlock=main.slice(start,end);
for(const required of [
  'function resetWorldCaches(){',
  'async function createRequestedRoute(start,end,waypoints=[]){',
  'const WorldDrive={',
  'function bumpRouteGeneration(){',
  'async function loadRoute(){',
  "loadingText.textContent='Préchargement du terrain en avance…';",
  'worldStreaming.preloadRoute(absX,absZ);',
  'await primeInitialTerrainPreloadBuffer().catch(()=>{});',
  'route.push({x:p.x,z:p.z,lat,lon,cum});'
]){
  if(!legacyBlock.includes(required)){
    throw new Error(`V21.26 route lifecycle refactor: expected behavior missing: ${required}. No files changed.`);
  }
}

const moduleSource=`export function createRouteLifecycle({
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

  function bumpRouteGeneration(){
    worldDrive.route.generation++;
    worldDrive.streaming.generation++;
  }

  function resetWorldCaches(){
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
    setState({
      lastRoadMetaCenter:{x:Infinity,z:Infinity},
      roadMetaLoading:false
    });
    updateRoadMetaHUD();
    clearActiveRoadProfile();
    terrainService.clearRoadBed();
    clearGroup(roadGroup);
    clearGroup(forestGroup);
    clearGroup(infrastructureGroup);
    clearGroup(signGroup);
    sceneryRenderer.clear();
    terrainService.clearHorizon();
  }

  async function loadRoute(){
    const state=getState();
    const routeStart=state.routeStart;
    const routeEnd=state.routeEnd;
    const routeWaypoints=state.routeWaypoints;
    const routePoints=[routeStart,...routeWaypoints,routeEnd];

    const {coordinates,provider}=await routingService.fetchRoute({
      points:routePoints,
      start:routeStart
    });

    routingStatus.textContent=provider;
    const coordsGeo=coordinates;

    route.length=0;
    segments.length=0;
    let routeLength=0;
    setState({
      routeLength:0,
      vehicleNearestHint:-1,
      vehicleNearestLastX:Infinity,
      vehicleNearestLastZ:Infinity
    });

    for(let i=0;i<coordsGeo.length;i++){
      const [lon,lat]=coordsGeo[i];
      const p=toWorld(lat,lon);
      let cum=routeLength;

      if(i){
        const prev=route[i-1];
        const len=Math.hypot(p.x-prev.x,p.z-prev.z);
        if(len>.02){
          segments.push({
            ax:prev.x,
            az:prev.z,
            bx:p.x,
            bz:p.z,
            len,
            cum:routeLength
          });
          routeLength+=len;
        }
        cum=routeLength;
      }

      route.push({x:p.x,z:p.z,lat,lon,cum});
    }

    if(segments.length<2||routeLength<100){
      throw new Error('Tracé routier trop court ou invalide');
    }

    setState({routeLength});
    statusEl.textContent=
      \`Trajet chargé · \${(routeLength/1000).toFixed(1)} km · \${route.length.toLocaleString('fr-CA')} points\`;
    return true;
  }

  async function createRequestedRoute(start,end,waypoints=[]){
    bumpRouteGeneration();

    if(!validLatLon(start.lat,start.lon)||!validLatLon(end.lat,end.lon)){
      toast('Coordonnées invalides');
      return false;
    }
    if(geoDist(start,end)<100){
      toast('Départ et arrivée trop proches');
      return false;
    }

    if(getState().autopilot){
      setAutopilot(false,'Pilote auto désactivé');
    }

    const routeStart={...start,name:start.name||'Départ'};
    const routeEnd={...end,name:end.name||'Arrivée'};
    const routeWaypoints=Array.isArray(waypoints)?waypoints.slice(0,8):[];

    setState({
      speed:0,
      steer:0,
      autopilotSteer:0,
      routeStart,
      routeEnd,
      routeWaypoints,
      origin:{lat:routeStart.lat,lon:routeStart.lon}
    });

    resetWorldCaches();
    resetRunChallenge();

    if(getState().gameStarted){
      loading.classList.remove('hidden');
    }else{
      loading.classList.add('hidden');
    }

    loadingText.textContent='Initialisation du trajet…';
    routingStatus.textContent='Connexion…';
    statusEl.textContent='Création du trajet…';

    // Absolute failsafe: UI must never stay hidden forever.
    let completed=false;
    const failsafe=setTimeout(()=>{
      if(!completed){
        loading.classList.add('hidden');
        routingStatus.textContent='Timeout';
        statusEl.textContent='Routage trop lent — tu peux réessayer';
        toast('Le routeur ne répond pas');
      }
    },15000);

    try{
      setBootProgress(
        'route',
        'loading',
        \`Calcul du trajet \${start.name||'Départ'} → \${end.name||'Arrivée'}\`
      );

      await loadRoute();

      setBootProgress('route','done','Trajet prêt');

      prepMap();
      placeAt(0);

      // Routing failsafe no longer owns the hydrography wait.
      clearTimeout(failsafe);

      loadingText.textContent='Chargement de l’hydrographie initiale…';
      setBootProgress('hydro','loading','Hydrographie initiale');

      let position=getState();
      const hydroReady=await loadWaterAround(position.absX,position.absZ)
        .catch(error=>{
          console.warn('Initial hydrography failed',error);
          return false;
        });

      setBootProgress(
        'hydro',
        hydroReady?'done':'warn',
        hydroReady?'Hydrographie prête':'Hydrographie indisponible'
      );

      // Do not expose fallback terrain while the first real DEM/image tiles
      // are still arriving. This is intentionally performed while stationary.
      loadingText.textContent='Préchargement du terrain en avance…';

      position=getState();
      preloadRoute(position.absX,position.absZ);

      const initialElevationReady=await loadElevationAround(position.absX,position.absZ)
        .catch(()=>{
          onElevationFallback();
          return false;
        });

      await primeInitialTerrainPreloadBuffer().catch(()=>{});

      if(imageryService.enabled){
        position=getState();
        await promiseWithTimeout(
          buildImageryMosaic(position.absX,position.absZ)
            .catch(()=>onImageryFallback()),
          4500
        );
      }

      if(initialElevationReady||hasPendingWorld()){
        cancelVisualJob('world-rebuild');
        commitLocalWorldRefresh();
      }

      prefetchRouteAhead();
      position=getState();
      loadSceneryAround(position.absX,position.absZ)
        .catch(()=>onSceneryUnavailable());
      loadRoadMetadataAround(position.absX,position.absZ).catch(()=>{});
      loadGeographicSignsAround(position.absX,position.absZ).catch(()=>{});

      completed=true;
      loading.classList.add('hidden');
      toast('Trajet prêt · terrain préchargé');
      return true;
    }catch(error){
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

  return {
    worldDrive,
    bumpRouteGeneration,
    resetWorldCaches,
    loadRoute,
    createRequestedRoute
  };
}
`;

const facade=`// ---------- route lifecycle facade ----------
let routeLifecycle=null;
function resetWorldCaches(){return routeLifecycle.resetWorldCaches();}
async function createRequestedRoute(start,end,waypoints=[]){
  return routeLifecycle.createRequestedRoute(start,end,waypoints);
}
function bumpRouteGeneration(){return routeLifecycle.bumpRouteGeneration();}
async function loadRoute(){return routeLifecycle.loadRoute();}

routeLifecycle=createRouteLifecycle({
  version:WORLD_DRIVE_VERSION,
  getState:()=>({
    autopilot,
    gameStarted,
    absX,
    absZ,
    speed,
    steer,
    autopilotSteer,
    routeStart:ROUTE_START,
    routeEnd:ROUTE_END,
    routeWaypoints:ROUTE_WAYPOINTS,
    origin,
    routeLength,
    vehicleNearestHint,
    vehicleNearestLastX,
    vehicleNearestLastZ,
    currentRoadGuideSign,
    activeRoadMeta,
    lastRoadMetaCenter,
    roadMetaLoading
  }),
  setState:state=>{
    if('speed' in state)speed=state.speed;
    if('steer' in state)steer=state.steer;
    if('autopilotSteer' in state)autopilotSteer=state.autopilotSteer;
    if('routeStart' in state)ROUTE_START=state.routeStart;
    if('routeEnd' in state)ROUTE_END=state.routeEnd;
    if('routeWaypoints' in state)ROUTE_WAYPOINTS=state.routeWaypoints;
    if('origin' in state)origin=state.origin;
    if('routeLength' in state)routeLength=state.routeLength;
    if('vehicleNearestHint' in state)vehicleNearestHint=state.vehicleNearestHint;
    if('vehicleNearestLastX' in state)vehicleNearestLastX=state.vehicleNearestLastX;
    if('vehicleNearestLastZ' in state)vehicleNearestLastZ=state.vehicleNearestLastZ;
    if('currentRoadGuideSign' in state)currentRoadGuideSign=state.currentRoadGuideSign;
    if('activeRoadMeta' in state)activeRoadMeta=state.activeRoadMeta;
    if('lastRoadMetaCenter' in state)lastRoadMetaCenter=state.lastRoadMetaCenter;
    if('roadMetaLoading' in state)roadMetaLoading=state.roadMetaLoading;
  },
  validLatLon,
  geoDist,
  toast,
  setAutopilot:(...args)=>setAutopilot(...args),
  resetStreamingCoordinator:()=>streamingCoordinator?.reset(),
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
  resetMinimapSignReadout:()=>resetMinimapSignReadout(),
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
  setBootProgress:(...args)=>setV21BootProgress(...args),
  routingService,
  toWorld:(lat,lon)=>llToXZ(lat,lon),
  prepMap:()=>prepMap(),
  placeAt:frac=>placeAt(frac),
  loadWaterAround:(x,z)=>loadWaterAround(x,z),
  preloadRoute:(x,z)=>worldStreaming.preloadRoute(x,z),
  loadElevationAround:(x,z)=>loadElevationAround(x,z),
  primeInitialTerrainPreloadBuffer:()=>primeInitialTerrainPreloadBuffer(),
  buildImageryMosaic:(x,z)=>buildImageryMosaic(x,z),
  onElevationFallback:()=>{elevStatus.textContent='Démo';},
  onImageryFallback:()=>{imageryStatus.textContent='Fallback';},
  promiseWithTimeout:(promise,timeoutMs)=>promiseWithTimeout(promise,timeoutMs),
  hasPendingWorld:()=>!!streamingCoordinator?.state.pendingWorld,
  cancelVisualJob:key=>cancelVisualJob(key),
  commitLocalWorldRefresh:()=>commitLocalWorldRefresh(),
  prefetchRouteAhead:()=>prefetchRouteAhead(),
  loadSceneryAround:(x,z)=>loadSceneryAround(x,z),
  onSceneryUnavailable:()=>{sceneryStatus.textContent='Indisponible';},
  loadRoadMetadataAround:(x,z)=>loadRoadMetadataAround(x,z),
  loadGeographicSignsAround:(x,z)=>loadGeographicSignsAround(x,z)
});
const WorldDrive=routeLifecycle.worldDrive;

`;

// Replace the original lifecycle block before adding an earlier import. This
// avoids shifting source offsets, the exact failure mode caught in the earlier
// route-planner extraction work.
main=main.slice(0,start)+facade+main.slice(end);

const importAnchor="import { createRoutePlannerUi } from './route-planner-ui.js';";
main=replaceOnce(
  main,
  importAnchor,
  `${importAnchor}\n${lifecycleImport}`,
  'route planner import anchor'
);

for(const legacyPattern of [
  "loadingText.textContent='Préchargement du terrain en avance…';",
  'worldStreaming.preloadRoute(absX,absZ);',
  'const WorldDrive={',
  'route.push({x:p.x,z:p.z,lat,lon,cum});'
]){
  if(main.includes(legacyPattern)){
    throw new Error(`V21.26 route lifecycle refactor: legacy ownership remains in main.js: ${legacyPattern}`);
  }
}

for(const required of [
  'function resetWorldCaches(){',
  'async function loadRoute(){',
  'async function createRequestedRoute(start,end,waypoints=[]){',
  "loadingText.textContent='Préchargement du terrain en avance…';",
  'preloadRoute(position.absX,position.absZ);',
  'await primeInitialTerrainPreloadBuffer().catch(()=>{});',
  'route.push({x:p.x,z:p.z,lat,lon,cum});',
  'worldDrive.route.generation++;'
]){
  if(!moduleSource.includes(required)){
    throw new Error(`V21.26 route lifecycle refactor: generated module lost behavior: ${required}`);
  }
}

const tempMain=path.join(root,'tools','__v21_26_route_lifecycle_main_check__.mjs');
const tempModule=path.join(root,'tools','__v21_26_route_lifecycle_module_check__.mjs');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){
    throw new Error(`Syntax check failed for ${path.basename(file)}:\n${result.stderr||result.stdout}`);
  }
}

try{
  fs.writeFileSync(tempMain,main,'utf8');
  fs.writeFileSync(tempModule,moduleSource,'utf8');
  syntaxCheck(tempMain);
  syntaxCheck(tempModule);
}finally{
  fs.rmSync(tempMain,{force:true});
  fs.rmSync(tempModule,{force:true});
}

const outputMain=eol==='\n'?main:main.replace(/\n/g,eol);
const outputModule=eol==='\n'?moduleSource:moduleSource.replace(/\n/g,eol);
fs.writeFileSync(modulePath,outputModule,'utf8');
fs.writeFileSync(mainPath,outputMain,'utf8');

const beforeLines=raw.split(/\r?\n/).length;
const afterLines=outputMain.split(/\r?\n/).length;
const moduleLines=outputModule.split(/\r?\n/).length;
console.log('V21.26 ROUTE LIFECYCLE REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines`);
console.log(`route-lifecycle.js: ${moduleLines} lines`);
console.log('Extracted: route reset, route generation counters, route fetch/build, initial hydro/terrain/imagery preload and route-ready orchestration.');
