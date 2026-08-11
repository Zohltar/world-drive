import * as THREE from 'three';
import { createVehicleAudio } from './audio.js';
import { createGamepadController } from './gamepad.js';
import { createCameraController } from './camera.js';
import { createRoutingGeometry, angleDelta, nearestPointOnPolyline } from './routing.js';
import { createRoutingService } from './routing-service.js';
import { createGeocodingService, validLatLon } from './geocoding.js';
import { WorldCache, OsmCache } from './cache.js';
import { createOverpassClient } from './overpass.js';
import { createSignDataService } from './signs.js';
import { createBridgeManager } from './bridges.js';
import { createImageryService } from './imagery.js';
import { createElevationService } from './elevation.js';
import { createTerrainService } from './terrain.js';
import { createSceneryDataService } from './scenery-data.js';
import { createSceneryRenderer } from './scenery-renderer.js';
import { createWaterDataService } from './water-data.js';
import { createWaterRenderer } from './water-renderer.js';
import { createWorldStreaming } from './world-streaming.js';
import { createVehicleSystem } from './vehicle-system.js';
import { createMultiplayerClient } from './multiplayer.js';
import { createVehicleVisualSystem } from './vehicle-visuals.js';
import { createMultiplayerVisualSystem } from './multiplayer-visuals.js';
import { createVehiclePresentation } from './vehicle-presentation.js';
import { createSkidMarkSystem } from './skidmarks.js';

// Default test route. V4 can replace these coordinates at runtime.
const MANIC2={lat:49.3213,lon:-68.3467,name:'Manic‑2'};
const MANIC5={lat:50.6451065,lon:-68.7271214,name:'Manic‑5'};

// Scenic presets
const R169_START={lat:48.39474,lon:-71.67772,name:'Hébertville'};
const R169_END={lat:48.650002,lon:-72.449997,name:'Saint‑Félicien'};
const R132_START={lat:48.849998,lon:-67.533333,name:'Matane'};
const R132_END={lat:48.533333,lon:-64.216667,name:'Percé'};

let ROUTE_START={...MANIC2};
let ROUTE_END={...MANIC5};
let ROUTE_WAYPOINTS=[];
const EARTH=6378137;
let origin={lat:ROUTE_START.lat,lon:ROUTE_START.lon};
const route=[];       // {x,z,lat,lon,cum}
let routeLength=0;
let segments=[];

const routingGeometry=createRoutingGeometry({
  getSegments:()=>segments,
  getRouteLength:()=>routeLength
});
const nearestRoute=(x,z)=>routingGeometry.nearestRoute(x,z);
const routePointAt=frac=>routingGeometry.routePointAt(frac);
const routePointAtCum=cum=>routingGeometry.routePointAtCum(cum);

const $=id=>document.getElementById(id);
const loading=$('loading'),loadingText=$('loadingText'),statusEl=$('status'),notice=$('notice'),routingStatus=$('routingStatus');

// ---------- competitive route challenge ----------
const runChallengeEl=$('runChallenge');
const runStateEl=$('runState');
const runTimerEl=$('runTimer');
const runQualityEl=$('runQuality');
const qualityFillEl=$('qualityFill');
const resetRunBtn=$('resetRunBtn');
const challengeSubsection=$('challengeSubsection');
const challengeSubsectionToggle=$('challengeSubsectionToggle');
const challengeSubsectionSummary=$('challengeSubsectionSummary');

challengeSubsectionToggle?.addEventListener(
  'click',
  ()=>{
    const collapsed=
      challengeSubsection.classList.toggle(
        'collapsed'
      );

    const chevron=
      challengeSubsectionToggle.querySelector(
        '.routeSubsectionChevron'
      );

    if(chevron){
      chevron.textContent=
        collapsed
          ?'+'
          :'−';
    }
  }
);

const runChallenge={
  running:false,
  finished:false,
  startedAt:0,
  finishedAt:0,
  lastSampleAt:0,
  offroadMs:0
};

function formatRunTime(ms){
  const safe=Math.max(0,ms||0);
  const totalTenths=Math.floor(safe/100);
  const tenths=totalTenths%10;
  const totalSeconds=Math.floor(totalTenths/10);
  const seconds=totalSeconds%60;
  const minutes=Math.floor(totalSeconds/60);

  return (
    String(minutes).padStart(2,'0')+
    ':'+
    String(seconds).padStart(2,'0')+
    '.'+
    tenths
  );
}

function runElapsedMs(now=performance.now()){
  if(!runChallenge.running&&!runChallenge.finished){
    return 0;
  }

  const end=
    runChallenge.finished
      ?runChallenge.finishedAt
      :now;

  return Math.max(
    0,
    end-runChallenge.startedAt
  );
}

function updateRunChallengeHUD(now=performance.now()){
  if(!runChallengeEl)return;

  const penalty=
    Math.floor(
      runChallenge.offroadMs/
      1000
    );

  const quality=
    Math.max(
      0,
      100-penalty
    );

  runTimerEl.textContent=
    formatRunTime(
      runElapsedMs(now)
    );

  runQualityEl.textContent=
    String(quality);

  qualityFillEl.style.width=
    quality+'%';

  qualityFillEl.style.backgroundColor=
    quality>=90
      ?'#55d98b'
      :quality>=70
        ?'#e2c45b'
        :quality>=45
          ?'#e28b50'
          :'#df5a61';

  runQualityEl.style.color=
    quality>=90
      ?'#71e29f'
      :quality>=70
        ?'#f0d56b'
        :quality>=45
          ?'#f1a263'
          :'#f06a71';

  runChallengeEl.classList.toggle(
    'running',
    runChallenge.running
  );

  runChallengeEl.classList.toggle(
    'finished',
    runChallenge.finished
  );

  runStateEl.textContent=
    runChallenge.finished
      ?'TERMINÉ'
      :runChallenge.running
        ?'EN COURSE'
        :'PRÊT';

  if(challengeSubsectionSummary){
    challengeSubsectionSummary.textContent=
      runChallenge.finished
        ?formatRunTime(
            runElapsedMs(now)
          )
        :runChallenge.running
          ?formatRunTime(
              runElapsedMs(now)
            )
          :'PRÊT';
  }
}

function resetRunChallenge(){
  runChallenge.running=false;
  runChallenge.finished=false;
  runChallenge.startedAt=0;
  runChallenge.finishedAt=0;
  runChallenge.lastSampleAt=0;
  runChallenge.offroadMs=0;

  updateRunChallengeHUD();
}

function startRunChallenge(now){
  if(
    runChallenge.running||
    runChallenge.finished
  ){
    return;
  }

  runChallenge.running=true;
  runChallenge.startedAt=now;
  runChallenge.lastSampleAt=now;

  updateRunChallengeHUD(now);
}

function finishRunChallenge(now){
  if(!runChallenge.running)return;

  runChallenge.running=false;
  runChallenge.finished=true;
  runChallenge.finishedAt=now;
  runChallenge.lastSampleAt=now;

  updateRunChallengeHUD(now);
  toast(
    'Parcours terminé · '+
    formatRunTime(
      runElapsedMs(now)
    )
  );
}

function updateRunChallenge(onRoad,nr){
  const now=performance.now();
  const speedKmh=Math.abs(speed)*3.6;

  // Start at the first meaningful vehicle movement.
  if(
    !runChallenge.running&&
    !runChallenge.finished&&
    speedKmh>.8
  ){
    startRunChallenge(now);
  }

  if(runChallenge.running){
    const sampleDelta=
      Math.max(
        0,
        now-runChallenge.lastSampleAt
      );

    // "Hors piste" is exactly the game's Terrain contact state.
    if(!onRoad){
      runChallenge.offroadMs+=
        sampleDelta;
    }

    runChallenge.lastSampleAt=now;

    // Finish inside the final ~12 metres of the route.
    if(
      nr&&
      routeLength>0&&
      nr.cum>=routeLength-12
    ){
      finishRunChallenge(now);
    }
  }

  updateRunChallengeHUD(now);
}

resetRunBtn?.addEventListener(
  'click',
  ()=>{
    resetRunChallenge();
    toast('Défi parcours réinitialisé');
  }
);

updateRunChallengeHUD();

const routingService=createRoutingService({
  onStatus:label=>{routingStatus.textContent=label},
  onLoadingText:text=>{loadingText.textContent=text},
  distance:geoDist
});

const geocodingService=createGeocodingService({
  language:'fr',
  minIntervalMs:1050,
  timeoutMs:7000
});

const overpassClient=createOverpassClient({
  cache:OsmCache,
  keyFor:(namespace,lat,lon)=>WorldCache.osmKey(namespace,lat,lon)
});

function toast(t){notice.textContent=t;notice.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>notice.classList.remove('show'),1700)}
function llToXZ(lat,lon){return {x:(lon-origin.lon)*Math.PI/180*EARTH*Math.cos(origin.lat*Math.PI/180),z:-(lat-origin.lat)*Math.PI/180*EARTH}}
function xzToLL(x,z){return {lat:origin.lat+(-z/EARTH)*180/Math.PI,lon:origin.lon+(x/(EARTH*Math.cos(origin.lat*Math.PI/180)))*180/Math.PI}}
function geoDist(a,b){
 const R=6371000, p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180;
 const dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lon-a.lon)*Math.PI/180;
 const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}

// ---------- Three ----------
const scene=new THREE.Scene();scene.background=new THREE.Color(0x91b5d1);scene.fog=new THREE.FogExp2(0x91b5d1,0.00082);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,4500);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;$('app').appendChild(renderer.domElement);
const hemi=new THREE.HemisphereLight(0xd6ecff,0x4e6345,2.15);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff2d2,2.6);sun.position.set(-180,260,-120);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-300;sun.shadow.camera.right=300;sun.shadow.camera.top=300;sun.shadow.camera.bottom=-300;scene.add(sun);

// ---------- V18G crescent moon + subtle moonlight ----------
// The moon is intentionally much weaker than the sun. Its role is mainly to
// reveal car/body shapes at night while headlights remain the dominant light.
const moonLight=
  new THREE.DirectionalLight(
    0xb9d7ff,
    0
  );

moonLight.castShadow=false;
scene.add(moonLight);

function createCrescentMoonTexture(){
  const canvas=document.createElement('canvas');
  canvas.width=256;
  canvas.height=256;

  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,256,256);

  // Soft outer halo.
  const halo=
    ctx.createRadialGradient(
      128,128,42,
      128,128,116
    );

  halo.addColorStop(
    0,
    'rgba(218,232,255,.25)'
  );

  halo.addColorStop(
    .55,
    'rgba(190,215,255,.09)'
  );

  halo.addColorStop(
    1,
    'rgba(170,205,255,0)'
  );

  ctx.fillStyle=halo;
  ctx.beginPath();
  ctx.arc(128,128,116,0,Math.PI*2);
  ctx.fill();

  // Bright disc.
  ctx.fillStyle='rgba(236,244,255,.98)';
  ctx.beginPath();
  ctx.arc(128,128,67,0,Math.PI*2);
  ctx.fill();

  // Cut away an offset disc to form a classic crescent.
  ctx.globalCompositeOperation='destination-out';
  ctx.beginPath();
  ctx.arc(158,111,67,0,Math.PI*2);
  ctx.fill();

  ctx.globalCompositeOperation='source-over';

  const texture=
    new THREE.CanvasTexture(canvas);

  texture.colorSpace=THREE.SRGBColorSpace;
  texture.needsUpdate=true;
  return texture;
}

const moonTexture=
  createCrescentMoonTexture();

const moonMaterial=
  new THREE.SpriteMaterial({
    map:moonTexture,
    color:0xe8f2ff,
    transparent:true,
    opacity:0,
    depthWrite:false,
    depthTest:false,
    fog:false
  });

const moonSprite=
  new THREE.Sprite(moonMaterial);

moonSprite.scale.set(
  115,
  115,
  1
);

moonSprite.renderOrder=-5;
moonSprite.visible=false;
scene.add(moonSprite);

const moonDirection=
  new THREE.Vector3(
    .35,
    .72,
    -.60
  ).normalize();

function updateMoonSkyPosition(){
  // Keep the moon effectively at infinity while preserving a stable world
  // direction as the local rendering origin follows the car.
  moonSprite.position
    .copy(camera.position)
    .addScaledVector(
      moonDirection,
      3100
    );

  moonLight.position
    .copy(camera.position)
    .addScaledVector(
      moonDirection,
      850
    );
}

const world=new THREE.Group(),
      terrainDetailGroup=new THREE.Group(),
      waterGroup=new THREE.Group(),
      infrastructureGroup=new THREE.Group(), // bridges + road signs only
      sceneryInfrastructureGroup=new THREE.Group(),
      buildingGroup=new THREE.Group(),
      roadGroup=new THREE.Group(),
      forestGroup=new THREE.Group(), // procedural roadside forest only
      sceneryForestGroup=new THREE.Group(),
      horizonGroup=new THREE.Group();
world.add(
  terrainDetailGroup,
  waterGroup,
  infrastructureGroup,
  sceneryInfrastructureGroup,
  buildingGroup,
  roadGroup,
  forestGroup,
  sceneryForestGroup,
  horizonGroup
);
scene.add(world);
const groundMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000,88,88),groundMat);
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

// Local rendering origin follows the car to avoid large-coordinate precision loss.
let worldOffset={x:0,z:0};
function toRender(x,z){return new THREE.Vector3(x-worldOffset.x,0,z-worldOffset.z)}

// ---------- V5.2 unified streaming cache ----------
async function fetchOverpassCached(
  namespace,
  ll,
  query,
  timeoutMs=7500,
  ttlMs=1000*60*60*24*14
){
  return overpassClient.fetchCached({
    namespace,
    lat:ll.lat,
    lon:ll.lon,
    query,
    timeoutMs,
    ttlMs
  });
}

// ---------- elevation streaming ----------
const elevStatus=$('elevStatus'), altitudeEl=$('altitude');

const elevationService=createElevationService({
  cache:WorldCache,
  statusEl:elevStatus,
  toLatLon:(x,z)=>xzToLL(x,z),
  zoom:11
});
elevationService.relativeWorldHeight=(x,z)=>{
  const ll=xzToLL(x,z);
  return elevationService.relativeElevationAt(ll.lat,ll.lon);
};

const terrainService=createTerrainService({
  THREE,
  elevation:elevationService,
  ground,
  horizonGroup,
  getWorldOffset:()=>worldOffset,
  applyImagery:()=>applyImageryToGround()
});

const terrainAbs=(x,z)=>terrainService.heightAt(x,z);
const rebuildGroundTerrain=()=>terrainService.rebuildGround();
const rebuildHorizon=()=>terrainService.rebuildHorizon();

async function loadElevationAround(absx,absz){
  const result=await elevationService.loadAround(absx,absz);

  if(result.count>0){
    // Several DEM requests can complete almost together. A synchronous full
    // rebuild here caused visible hitches while driving. Coalesce them.
    scheduleVisualJob(
      'elevation-world',
      rebuildLocalWorld,
      260
    );

    toast(
      result.count>=5
        ?'Relief réel chargé'
        :'Relief partiel chargé'
    );
    return true;
  }

  console.warn('No DEM tiles available; keeping procedural terrain');
  return false;
}

// ---------- Materials ----------
function makeAsphalt(){
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#555a5e';ctx.fillRect(0,0,128,128);
 const d=ctx.getImageData(0,0,128,128);for(let i=0;i<d.data.length;i+=4){const n=(Math.random()-.5)*22;d.data[i]+=n;d.data[i+1]+=n;d.data[i+2]+=n}ctx.putImageData(d,0,0);
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1,4);t.colorSpace=THREE.SRGBColorSpace;return t;
}
const asphalt=makeAsphalt();
// ----- Road / vehicle visual contact constants -----
const ROAD_SURFACE_OFFSET=.10;
const TIRE_VISUAL_CLEARANCE=.018;
const WHEEL_RADIUS=.38;
const TIRE_HALF_WIDTH=.135;
const ROAD_WHEEL_CONTACT_HALF_WIDTH=8.5;

const roadMat=new THREE.MeshStandardMaterial({
  color:0xffffff,
  map:asphalt,
  roughness:.96,
  polygonOffset:true,
  polygonOffsetFactor:-2,
  polygonOffsetUnits:-2,

  // The visible roadway owns these pixels over transparent hydro surfaces.
  stencilWrite:true,
  stencilRef:1,
  stencilFunc:THREE.AlwaysStencilFunc,
  stencilFail:THREE.KeepStencilOp,
  stencilZFail:THREE.KeepStencilOp,
  stencilZPass:THREE.ReplaceStencilOp
});
const shoulderMat=new THREE.MeshStandardMaterial({
  color:0x89867a,
  roughness:1,
  polygonOffset:true,
  polygonOffsetFactor:-1,
  polygonOffsetUnits:-1,

  stencilWrite:true,
  stencilRef:1,
  stencilFunc:THREE.AlwaysStencilFunc,
  stencilFail:THREE.KeepStencilOp,
  stencilZFail:THREE.KeepStencilOp,
  stencilZPass:THREE.ReplaceStencilOp
});
const roadEdgeMat=new THREE.MeshStandardMaterial({
  color:0x4f4e49,
  roughness:1,
  metalness:0,

  // Same road priority over water as the top surface.
  stencilWrite:true,
  stencilRef:1,
  stencilFunc:THREE.AlwaysStencilFunc,
  stencilFail:THREE.KeepStencilOp,
  stencilZFail:THREE.KeepStencilOp,
  stencilZPass:THREE.ReplaceStencilOp
});

const roadUnderMat=new THREE.MeshStandardMaterial({
  color:0x292b2a,
  roughness:1,
  metalness:0,
  side:THREE.DoubleSide,

  stencilWrite:true,
  stencilRef:1,
  stencilFunc:THREE.AlwaysStencilFunc,
  stencilFail:THREE.KeepStencilOp,
  stencilZFail:THREE.KeepStencilOp,
  stencilZPass:THREE.ReplaceStencilOp
});

const lineYellow=new THREE.MeshBasicMaterial({
  color:0xe6c94f,
  polygonOffset:true,
  polygonOffsetFactor:-3,
  polygonOffsetUnits:-3
});
const lineWhite=new THREE.MeshBasicMaterial({
  color:0xe8e8e6,
  polygonOffset:true,
  polygonOffsetFactor:-3,
  polygonOffsetUnits:-3
});
const treeTrunkMat=new THREE.MeshStandardMaterial({color:0x604532,roughness:1}),treeMat=new THREE.MeshStandardMaterial({color:0x315b35,roughness:1});
function makeWaterTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#2a6f96';ctx.fillRect(0,0,128,128);
  ctx.strokeStyle='rgba(255,255,255,.08)';
  ctx.lineWidth=1;
  for(let y=6;y<128;y+=10){
    ctx.beginPath();
    for(let x=0;x<=128;x+=8){
      const yy=y+Math.sin((x+y)*.12)*1.6;
      if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);
    }
    ctx.stroke();
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(18,18);
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
const waterTex=makeWaterTexture();

const waterStencil={
  stencilWrite:true,
  stencilRef:1,
  stencilFunc:THREE.NotEqualStencilFunc,
  stencilFail:THREE.KeepStencilOp,
  stencilZFail:THREE.KeepStencilOp,
  stencilZPass:THREE.KeepStencilOp
};

const waterMat=new THREE.MeshStandardMaterial({
  color:0x2a6f96,map:waterTex,roughness:.16,metalness:.12,
  transparent:true,opacity:.90,side:THREE.DoubleSide,
  ...waterStencil
});
const riverMat=new THREE.MeshStandardMaterial({
  color:0x2f7da7,map:waterTex,roughness:.18,metalness:.10,
  transparent:true,opacity:.93,side:THREE.DoubleSide,
  ...waterStencil
});
const coastWaterMat=new THREE.MeshStandardMaterial({
  color:0x235f86,map:waterTex,roughness:.14,metalness:.16,
  transparent:true,opacity:.94,side:THREE.DoubleSide,
  ...waterStencil
});
const waterStatus=$('waterStatus');
const hydroCacheStatus=$('hydroCacheStatus');

// ---------- V5.1.1 safe road metadata ----------
const roadTypeStatus=$('roadTypeStatus');
const roadSurfaceStatus=$('roadSurfaceStatus');
const osmSpeedStatus=$('osmSpeedStatus');
const signStatus=$('signStatus');

let activeRoadMeta={
  highway:null,surface:'asphalt',maxspeed:null,lanes:null,width:null,name:null,ref:null,
  confidence:0
};
let lastRoadMetaCenter={x:Infinity,z:Infinity};
let roadMetaLoading=false;

const signData=createSignDataService({
  statusEl:signStatus,
  toLatLon:(x,z)=>xzToLL(x,z),
  toWorld:(lat,lon)=>llToXZ(lat,lon),
  nearestRoute:(x,z)=>nearestRoute(x,z),
  fetchCached:(namespace,ll,query,timeoutMs,ttlMs)=>
    fetchOverpassCached(namespace,ll,query,timeoutMs,ttlMs),
  getGeneration:()=>WorldDrive?.route?.generation??0,
  onChanged:()=>{
    if(activeRoadProfile.length)rebuildLocalWorld();
  }
});
const geographicSigns=signData.signs;

function parseMaxspeed(v){
  if(!v)return null;
  const t=String(v).toLowerCase().trim();
  const n=parseFloat(t);
  if(!Number.isFinite(n))return null;
  return t.includes('mph')?n*1.609344:n;
}
function roadSurfaceGrip(){
  const k=String(activeRoadMeta.surface||'asphalt').toLowerCase();
  if(k.includes('gravel'))return .74;
  if(['compacted','fine_gravel'].includes(k))return .80;
  if(['unpaved','dirt','ground','earth'].includes(k))return .64;
  if(k==='grass')return .54;
  return 1;
}
function safeRoadWidth(){
  // Conservative visual range, independent of suspicious metadata.
  const lanes=Math.max(1,Math.min(4,Number(activeRoadMeta.lanes)||2));
  const cls=activeRoadMeta.highway||'primary';
  let width=lanes*(['motorway','trunk'].includes(cls)?3.5:['primary','secondary'].includes(cls)?3.35:3.1);
  if(Number.isFinite(activeRoadMeta.width)&&activeRoadMeta.width>=4.5&&activeRoadMeta.width<=11.5){
    width=activeRoadMeta.width;
  }
  return Math.max(5.5,Math.min(9.5,width));
}
function updateRoadMetaHUD(){
  roadTypeStatus.textContent=activeRoadMeta.ref||activeRoadMeta.name||activeRoadMeta.highway||'—';
  roadSurfaceStatus.textContent=activeRoadMeta.surface||'—';
  osmSpeedStatus.textContent=activeRoadMeta.maxspeed?`${Math.round(activeRoadMeta.maxspeed)} km/h`:'—';
}

const waterData=createWaterDataService({
  statusEl:waterStatus,
  cacheStatusEl:hydroCacheStatus,
  cache:OsmCache,
  overpass:overpassClient,
  toLatLon:(x,z)=>xzToLL(x,z),
  toWorld:(lat,lon)=>llToXZ(lat,lon)
});

const waterFeatures=waterData.waterFeatures;
const bridgeFeatures=waterData.bridgeFeatures;
const coastlineFeatures=waterData.coastlineFeatures;

const bridgeStatus=$('bridgeStatus');

const bridgeManager=createBridgeManager({
  statusEl:bridgeStatus,
  getBridgeFeatures:()=>bridgeFeatures,
  getRouteLength:()=>routeLength,
  nearestRoute:(x,z)=>nearestRoute(x,z),
  routePointAtCum:cum=>routePointAtCum(cum),
  terrainHeight:(x,z)=>terrainAbs(x,z)
});
const bridgeSpans=bridgeManager.spans;

function roadMetaQuery(ll){
  return `[out:json][timeout:10];(
    way(around:90,${ll.lat},${ll.lon})["highway"];
  );out tags geom;`;
}

// ---------- V3 geographic scenery ----------
const sceneryStatus=$('sceneryStatus');

const sceneryData=createSceneryDataService({
  statusEl:sceneryStatus,
  toLatLon:(x,z)=>xzToLL(x,z),
  toWorld:(lat,lon)=>llToXZ(lat,lon),
  fetchCached:(namespace,ll,query,timeoutMs,ttlMs)=>
    fetchOverpassCached(namespace,ll,query,timeoutMs,ttlMs),
  getGeneration:()=>WorldDrive?.route?.generation??0
});
const sceneryFeatures=sceneryData.features;

// ---------- streamed aerial/satellite imagery ----------
const imageryStatus=$('imageryStatus');
const imageryService=createImageryService({
  THREE,
  renderer,
  cache:WorldCache,
  groundMaterial:groundMat,
  statusEl:imageryStatus,
  toggleButton:$('imageryToggle'),
  toLatLon:(x,z)=>xzToLL(x,z),
  toWorld:(lat,lon)=>llToXZ(lat,lon),
  getWorldOffset:()=>worldOffset,
  zoom:16,
  groundSize:2000
});

const buildImageryMosaic=(x,z)=>imageryService.buildMosaic(x,z);
const applyImageryToGround=()=>imageryService.applyToGround();
const loadImageryTile=(tx,ty,timeoutMs=5000)=>
  imageryService.loadTile(tx,ty,timeoutMs);

const buildingWallMat=new THREE.MeshStandardMaterial({color:0xa9a49a,roughness:.90,metalness:.01});
const roofMat=new THREE.MeshStandardMaterial({color:0x686c70,roughness:.84});
const rockMat=new THREE.MeshStandardMaterial({color:0x777a75,roughness:1});
const scrubMat=new THREE.MeshStandardMaterial({color:0x526b43,roughness:1,transparent:true,opacity:.88});
const towerMat=new THREE.MeshStandardMaterial({color:0x6a6f74,metalness:.55,roughness:.44});
const lineMatPower=new THREE.LineBasicMaterial({color:0x43484d,transparent:true,opacity:.72});
const railMat=new THREE.MeshStandardMaterial({color:0x8c8f91,metalness:.48,roughness:.4});
const damMat=new THREE.MeshStandardMaterial({color:0x777c80,roughness:.72,metalness:.12});
const bridgeDeckMat=new THREE.MeshStandardMaterial({color:0x6f7376,roughness:.82,metalness:.08});

function featureCentroid(points){
  let x=0,z=0;
  if(!points.length)return{x:0,z:0};
  for(const p of points){x+=p.x;z+=p.z}
  return{x:x/points.length,z:z/points.length};
}

const sceneryRenderer=createSceneryRenderer({
  THREE,
  statusEl:sceneryStatus,
  features:sceneryFeatures,
  terrainDetailGroup,
  infrastructureGroup:sceneryInfrastructureGroup,
  buildingGroup,
  forestGroup:sceneryForestGroup,
  materials:{
    buildingWallMat,
    rockMat,
    scrubMat,
    towerMat,
    lineMatPower,
    railMat,
    damMat,
    treeTrunkMat,
    treeMat
  },
  featureCentroid,
  terrainHeight:(x,z)=>terrainAbs(x,z),
  nearestRoute:(x,z)=>nearestRoute(x,z),
  isWaterAt:(x,z,margin)=>isWaterAt(x,z,margin),
  pointInPolygon:(x,z,points)=>pointInPolygon2D(x,z,points),
  getWorldOffset:()=>worldOffset
});

const rebuildLocalScenery=()=>sceneryRenderer.rebuild();

// Heavy streamed visuals should not all rebuild inside the same animation frame.
// Coalesce duplicate requests and let the browser place them between frames.
const deferredVisualJobs=new Set();

function scheduleVisualJob(key,job,timeout=180){
  if(deferredVisualJobs.has(key))return;

  deferredVisualJobs.add(key);

  const run=()=>{
    deferredVisualJobs.delete(key);

    try{
      job();
    }catch(error){
      console.warn(
        `Deferred visual job failed: ${key}`,
        error
      );
    }
  };

  if('requestIdleCallback' in window){
    requestIdleCallback(
      run,
      {timeout}
    );
  }else{
    setTimeout(run,0);
  }
}



// ---------- Vehicle systems ----------
const vehicleSystem=createVehicleSystem({
  initialId:'wrx'
});

const vehicleVisuals=createVehicleVisualSystem({
  THREE,
  scene,
  vehicleSystem
});

const {
  car,
  bodyGroup
}=vehicleVisuals;

const vehiclePresentation=createVehiclePresentation({
  THREE,
  scene,
  car,
  bodyGroup,
  wheels:vehicleVisuals.wheels,
  vehicleSystem,
  sun,
  roadSurfaceAt,
  terrainAbs,
  groundHeightForWheel,
  activeVehicleWheels:vehicleVisuals.activeVehicleWheels,
  getDrivingState:()=>({
    heading,
    absX,
    absZ,
    speed,
    longitudinalAccel,
    VEHICLE,
    roadContact,
    timeOfDay
  }),
  ROAD_WHEEL_CONTACT_HALF_WIDTH,
  WHEEL_RADIUS,
  TIRE_HALF_WIDTH,
  TIRE_VISUAL_CLEARANCE
});

const multiplayerVisuals=createMultiplayerVisualSystem({
  THREE,
  car,
  bodyGroup,
  wheels:vehicleVisuals.wheels,
  tailMat:vehicleVisuals.tailMat,
  brakeLampMat:vehicleVisuals.brakeLampMat,
  extraBrakeLampMaterials:vehicleVisuals.extraBrakeLampMaterials,
  llToXZ,
  groundHeightForWheel,
  WHEEL_RADIUS,
  TIRE_HALF_WIDTH,
  TIRE_VISUAL_CLEARANCE
});

const skidMarks=createSkidMarkSystem({
  THREE,
  scene,
  getWorldOffset:()=>worldOffset,
  getRoadSurface:(x,z)=>roadSurfaceAt(x,z),
  maxSegments:1800
});

function clearGroup(g){while(g.children.length){const c=g.children.pop();c.traverse?.(o=>{if(o.geometry)o.geometry.dispose();if(o.material&&![roadMat,shoulderMat,lineYellow,lineWhite,treeTrunkMat,treeMat].includes(o.material)){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}})}}
function segMesh(ax,az,bx,bz,width,mat,y=.05){
 const a=toRender(ax,az),b=toRender(bx,bz),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.12)return null;
 const m=new THREE.Mesh(new THREE.BoxGeometry(width,.10,len),mat);const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
 m.position.set(mx,terrainAbs((ax+bx)/2,(az+bz)/2)+y,mz);m.rotation.y=Math.atan2(dx,dz);m.receiveShadow=true;return m
}


async function loadRoadMetadataAround(absx,absz){
  if(roadMetaLoading)return false;
  roadMetaLoading=true;
  const generation=WorldDrive?.route?.generation??0;
  const ll=xzToLL(absx,absz);
  const routeNear=nearestRoute(absx,absz);

  const q=roadMetaQuery(ll);
  const {data}=await fetchOverpassCached('roadmeta',ll,q,6000,1000*60*60*24*7);

  if(generation!==(WorldDrive?.route?.generation??0)){
    roadMetaLoading=false;return false;
  }

  let winner=null,bestScore=Infinity;
  if(data&&routeNear){
    for(const e of data.elements||[]){
      if(!e.geometry?.length||!e.tags?.highway)continue;
      const pts=e.geometry.map(p=>{const q=llToXZ(p.lat,p.lon);return{x:q.x,z:q.z}});
      const np=nearestPointOnPolyline(absx,absz,pts);
      const angleDiff=Math.abs(angleDelta(np.angle,routeNear.angle));
      const aligned=Math.min(angleDiff,Math.abs(Math.PI-angleDiff));

      // Strict correlation: must be close to car AND aligned with active route.
      // Service/driveway candidates are penalized unless extremely well aligned.
      if(np.d>22||aligned>0.38)continue; // ~22m and ~22°
      let score=np.d + aligned*28;
      if(['service','track','path','footway'].includes(e.tags.highway))score+=12;
      if(score<bestScore){bestScore=score;winner=e}
    }
  }

  if(winner){
    const t=winner.tags||{};
    const lanes=parseInt(t.lanes||'',10);
    const width=parseFloat(t.width||'');
    activeRoadMeta={
      highway:t.highway||null,
      surface:t.surface||'asphalt',
      maxspeed:parseMaxspeed(t.maxspeed),
      lanes:Number.isFinite(lanes)?lanes:null,
      width:Number.isFinite(width)?width:null,
      name:t.name||null,
      ref:t.ref||null,
      confidence:Math.max(0,1-bestScore/45)
    };
  }else{
    // Safe fallback: do NOT mutate route geometry based on uncertain metadata.
    activeRoadMeta={
      highway:null,surface:'asphalt',maxspeed:null,lanes:null,width:null,name:null,ref:null,confidence:0
    };
  }

  lastRoadMetaCenter={x:absx,z:absz};
  updateRoadMetaHUD();
  if(activeRoadProfile.length)rebuildLocalWorld();
  roadMetaLoading=false;
  return !!winner;
}


// ---------- V5.1.7 geographic sign data ----------
async function loadGeographicSignsAround(absx,absz){
  return signData.loadAround(absx,absz);
}

function nearestRouteCumToFeature(points){
  let best=null,bd=Infinity;
  for(const p of points||[]){
    const n=nearestRoute(p.x,p.z);
    if(n&&n.d<bd){bd=n.d;best=n}
  }
  return best&&bd<120?best:null;
}


function collectEndpointLocalitySigns(){
  const candidates=[
    {p:ROUTE_START,cum:0},
    {p:ROUTE_END,cum:routeLength}
  ];
  const known=new Set(geographicSigns.filter(x=>x.kind==='city').map(x=>String(x.label).toLowerCase()));
  for(const c of candidates){
    const label=c.p?.name;
    if(!label||/^(départ|arrivée|waypoint)$/i.test(label)||known.has(String(label).toLowerCase()))continue;
    geographicSigns.push({
      key:`city:endpoint:${c.cum}:${label}`,
      kind:'city',
      label,
      maxspeed:null,
      x:0,z:0,
      routeCum:c.cum,
      routeDistance:0,
      fallback:true
    });
    known.add(String(label).toLowerCase());
  }
}

function collectFallbackRiverSigns(){
  const existing=new Set(geographicSigns.filter(x=>x.kind==='river').map(x=>String(x.label).toLowerCase()));
  for(const f of waterFeatures||[]){
    const tags=f.tags||{};
    const label=tags['name:fr']||tags.name||tags.official_name;
    if(!label||existing.has(String(label).toLowerCase()))continue;

    const n=nearestRouteCumToFeature(f.points);
    if(!n)continue;

    geographicSigns.push({
      key:`river:fallback:${f.type||'way'}:${f.id}:${label}`,
      kind:'river',
      label,
      maxspeed:null,
      x:n.px,z:n.pz,
      routeCum:n.cum,
      routeDistance:n.d,
      fallback:true
    });
    existing.add(String(label).toLowerCase());
  }
}

function addFallbackSpeedSign(){
  if(!activeRoadMeta.maxspeed||activeRoadMeta.confidence<=.20)return;
  const n=nearestRoute(absX,absZ);if(!n)return;

  // If no explicit OSM speed sign is near the vehicle, show one representative
  // sign for the active road section.
  const hasNearby=geographicSigns.some(f=>f.kind==='speed'&&Math.abs(f.routeCum-n.cum)<900);
  if(hasNearby)return;

  const p=routePointAtCum(Math.min(routeLength,n.cum+95));
  p.y=roadHeightAt(p.x,p.z);
  addRoadSignAt(p,Math.round(activeRoadMeta.maxspeed),'speed',1);
}

function addGeographicRoadSigns(){
  collectFallbackRiverSigns();
  collectEndpointLocalitySigns();
  if(!routeLength)return;
  const n=nearestRoute(absX,absZ);if(!n)return;

  addFallbackSpeedSign();

  signStatus.textContent=String(geographicSigns.length);
  for(const f of geographicSigns){
    if(Math.abs(f.routeCum-n.cum)>1600)continue;
    let cum=f.routeCum,side=1;
    if(f.kind==='river')cum=Math.max(0,f.routeCum-22);
    else if(f.kind==='city')cum=Math.max(0,f.routeCum-55);

    const p=routePointAtCum(cum);
    p.y=roadHeightAt(p.x,p.z);
    const label=f.kind==='speed'?Math.round(f.maxspeed||Number(f.label)):f.label;
    addRoadSignAt(p,label,f.kind,side);
  }
}
// ---------- geographic scenery rendering ----------













function pointInPolygon2D(x,z,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const xi=points[i].x,zi=points[i].z,xj=points[j].x,zj=points[j].z;
    const hit=((zi>z)!==(zj>z)) && (x < (xj-xi)*(z-zi)/((zj-zi)||1e-9)+xi);
    if(hit)inside=!inside;
  }
  return inside;
}
function pointSegDist2D(px,pz,a,b){
  const vx=b.x-a.x,vz=b.z-a.z,wx=px-a.x,wz=pz-a.z;
  const vv=vx*vx+vz*vz||1;
  const t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
  return Math.hypot(px-(a.x+vx*t),pz-(a.z+vz*t));
}
function isWaterAt(x,z,margin=5){
  for(const f of waterFeatures){
    if(!f.points?.length)continue;
    if(f.kind==='polygon'){
      if(pointInPolygon2D(x,z,f.points))return true;
      // Also reject close to shoreline to avoid trunks at water edge.
      for(let i=0;i<f.points.length;i++){
        const a=f.points[i],b=f.points[(i+1)%f.points.length];
        if(pointSegDist2D(x,z,a,b)<margin)return true;
      }
    }else{
      const half=Math.max(margin,waterWidth(f.tags)*.55+margin);
      for(let i=0;i<f.points.length-1;i++){
        if(pointSegDist2D(x,z,f.points[i],f.points[i+1])<half)return true;
      }
    }
  }
  return false;
}
function removeTreesOverWater(){
  // Existing forest may predate an asynchronous hydro response.
  // Remove any procedural tree pair whose ground point is now classified as water.
  const remove=[];
  for(const child of forestGroup.children){
    const ax=child.position.x+worldOffset.x,az=child.position.z+worldOffset.z;
    if(isWaterAt(ax,az,4))remove.push(child);
  }
  for(const child of remove){
    forestGroup.remove(child);
    child.geometry?.dispose?.();
  }
}







async function loadSceneryAround(absx,absz){
  const result=await sceneryData.loadAround(absx,absz);

  if(!result.ok)return false;

  // Applying hundreds of OSM objects is CPU-heavy. Coalesce and defer the
  // renderer rebuild so network completion cannot interrupt a driving frame.
  scheduleVisualJob(
    'scenery',
    rebuildLocalScenery,
    220
  );

  sceneryStatus.textContent=
    `${result.cached?'Cache':'OSM'} · ${sceneryFeatures.length} objets`;

  return true;
}

// ---------- bridge logic ----------
const rebuildBridgeSpans=()=>bridgeManager.rebuild();
const bridgeHeightAtCum=cum=>bridgeManager.heightAtCum(cum);

// ---------- continuous road ribbon ----------
function buildRibbon(points,width,material,yOffset=0){
  if(points.length<2)return null;
  const pos=[],uv=[],idx=[];
  let cumulative=0;
  for(let i=0;i<points.length;i++){
    const p=points[i];
    const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
    let tx=next.x-prev.x,tz=next.z-prev.z;
    const tl=Math.hypot(tx,tz)||1;tx/=tl;tz/=tl;
    const nx=-tz,nz=tx;
    if(i>0)cumulative+=Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z);

    const roll=Number.isFinite(p.roll)
      ?p.roll
      :0;

    const half=width/2;

    // Positive roll raises the left side (+normal) and lowers the right side.
    const leftY=
      p.y+
      yOffset+
      Math.tan(roll)*half;

    const rightY=
      p.y+
      yOffset-
      Math.tan(roll)*half;

    pos.push(
      p.x-worldOffset.x+nx*half,
      leftY,
      p.z-worldOffset.z+nz*half
    );

    pos.push(
      p.x-worldOffset.x-nx*half,
      rightY,
      p.z-worldOffset.z-nz*half
    );
    uv.push(0,cumulative/8,1,cumulative/8);
    if(i<points.length-1){
      const a=i*2;
      idx.push(a,a+2,a+1,a+2,a+3,a+1);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,material);m.receiveShadow=true;return m;
}

function buildRoadVolume(profile){
  if(profile.length<2)return null;

  const group=new THREE.Group();

  // Cross-section dimensions, in metres.
  const asphaltHalf=3.75;
  const shoulderHalf=5.20;
  const toeHalf=5.95;

  const asphaltTop=.10;
  const shoulderTop=.035;
  const slabBottom=-.20;
  const toeBottom=-.36;

  const edgePos=[];
  const edgeIdx=[];
  const underPos=[];
  const underIdx=[];

  function basisAt(i){
    const p=profile[i];
    const prev=profile[Math.max(0,i-1)];
    const next=profile[Math.min(profile.length-1,i+1)];

    let tx=next.x-prev.x;
    let tz=next.z-prev.z;
    const len=Math.hypot(tx,tz)||1;

    tx/=len;
    tz/=len;

    return {
      p,
      nx:-tz,
      nz:tx
    };
  }

  // Each row contains:
  // 0 left toe bottom
  // 1 left shoulder top
  // 2 left asphalt edge bottom
  // 3 left asphalt edge top
  // 4 right asphalt edge top
  // 5 right asphalt edge bottom
  // 6 right shoulder top
  // 7 right toe bottom
  for(let i=0;i<profile.length;i++){
    const {p,nx,nz}=basisAt(i);

    const roll=Number.isFinite(p.roll)
      ?p.roll
      :0;

    const rollSlope=Math.tan(roll);

    const push=(off,y)=>{
      edgePos.push(
        p.x-worldOffset.x+nx*off,
        p.y+y+rollSlope*off,
        p.z-worldOffset.z+nz*off
      );
    };

    push( toeHalf,toeBottom);
    push( shoulderHalf,shoulderTop);
    push( asphaltHalf,slabBottom);
    push( asphaltHalf,asphaltTop);
    push(-asphaltHalf,asphaltTop);
    push(-asphaltHalf,slabBottom);
    push(-shoulderHalf,shoulderTop);
    push(-toeHalf,toeBottom);

    // Bottom slab vertices, kept separate for a darker underside material.
    underPos.push(
      p.x-worldOffset.x+nx*asphaltHalf,
      p.y+slabBottom+rollSlope*asphaltHalf,
      p.z-worldOffset.z+nz*asphaltHalf,

      p.x-worldOffset.x-nx*asphaltHalf,
      p.y+slabBottom-rollSlope*asphaltHalf,
      p.z-worldOffset.z-nz*asphaltHalf
    );
  }

  const row=8;

  for(let i=0;i<profile.length-1;i++){
    const a=i*row;
    const b=(i+1)*row;

    // Left outer embankment slope.
    edgeIdx.push(
      a+0,b+0,a+1,
      a+1,b+0,b+1
    );

    // Left shoulder underside/slope into asphalt slab.
    edgeIdx.push(
      a+1,b+1,a+2,
      a+2,b+1,b+2
    );

    // Visible left asphalt thickness.
    edgeIdx.push(
      a+2,b+2,a+3,
      a+3,b+2,b+3
    );

    // Visible right asphalt thickness.
    edgeIdx.push(
      a+4,b+4,a+5,
      a+5,b+4,b+5
    );

    // Right shoulder underside/slope.
    edgeIdx.push(
      a+5,b+5,a+6,
      a+6,b+5,b+6
    );

    // Right outer embankment slope.
    edgeIdx.push(
      a+6,b+6,a+7,
      a+7,b+6,b+7
    );

    // Dark underside of the central asphalt slab.
    const u=i*2;
    const v=(i+1)*2;

    underIdx.push(
      u,v,u+1,
      u+1,v,v+1
    );
  }

  const edgeGeom=new THREE.BufferGeometry();
  edgeGeom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      edgePos,
      3
    )
  );
  edgeGeom.setIndex(edgeIdx);
  edgeGeom.computeVertexNormals();

  const edges=new THREE.Mesh(
    edgeGeom,
    roadEdgeMat
  );
  edges.castShadow=true;
  edges.receiveShadow=true;
  edges.renderOrder=1;
  group.add(edges);

  const underGeom=new THREE.BufferGeometry();
  underGeom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      underPos,
      3
    )
  );
  underGeom.setIndex(underIdx);
  underGeom.computeVertexNormals();

  const underside=new THREE.Mesh(
    underGeom,
    roadUnderMat
  );
  underside.castShadow=true;
  underside.receiveShadow=true;
  underside.renderOrder=0;
  group.add(underside);

  return group;
}

function buildRoadProfile(){
  // Find a little more than the visible corridor so the ribbon never ends at screen edge.
  const R=1050,R2=R*R,raw=[];
  for(const seg of segments){
    const mx=(seg.ax+seg.bx)/2,mz=(seg.az+seg.bz)/2,dx=mx-worldOffset.x,dz=mz-worldOffset.z;
    if(dx*dx+dz*dz>R2)continue;
    const steps=Math.max(1,Math.ceil(seg.len/5)); // <=5 m vertical samples
    for(let k=0;k<steps;k++){
      const t=k/steps,x=seg.ax+(seg.bx-seg.ax)*t,z=seg.az+(seg.bz-seg.az)*t,cum=seg.cum+seg.len*t;
      if(!raw.length||Math.hypot(x-raw[raw.length-1].x,z-raw[raw.length-1].z)>.4)raw.push({x,z,y:terrainAbs(x,z),cum});
    }
  }
  if(!raw.length)return raw;

  // Add last endpoint.
  const lastSeg=segments.findLast ? segments.findLast(seg=>{
    const mx=(seg.ax+seg.bx)/2,mz=(seg.az+seg.bz)/2,dx=mx-worldOffset.x,dz=mz-worldOffset.z;
    return dx*dx+dz*dz<=R2;
  }) : null;
  if(lastSeg)raw.push({x:lastSeg.bx,z:lastSeg.bz,y:terrainAbs(lastSeg.bx,lastSeg.bz),cum:lastSeg.cum+lastSeg.len});

  // Two-pass weighted smoothing on HEIGHT ONLY.
  // Horizontal geometry remains the exact routing polyline, preserving every curve.
  let heights=raw.map(p=>p.y);
  for(let pass=0;pass<2;pass++){
    const h2=heights.slice();
    for(let i=2;i<heights.length-2;i++){
      h2[i]=(heights[i-2]+2*heights[i-1]+4*heights[i]+2*heights[i+1]+heights[i+2])/10;
    }
    heights=h2;
  }
  // Bridges override the terrain-following height AFTER normal road smoothing.
  // This is what prevents a road deck from dipping into the river/valley below.
  for(let i=0;i<raw.length;i++){
    const by=bridgeHeightAtCum(raw[i].cum);
    if(by!==null)heights[i]=by;
  }

  // Light pass at bridge approach boundaries only, retaining the deck itself.
  const finalH=heights.slice();
  for(let i=1;i<heights.length-1;i++){
    const here=bridgeHeightAtCum(raw[i].cum);
    if(here===null){
      const nearBridge=bridgeManager.isNearApproach(raw[i].cum,18);
      if(nearBridge)finalH[i]=(heights[i-1]+2*heights[i]+heights[i+1])/4;
    }
  }
  // Terrain-aligned road roll/camber.
  // Sample terrain across the road instead of keeping every cross-section horizontal.
  // A wider probe reduces sensitivity to tiny DEM noise.
  const rollProbe=5.6;
  const rawRoll=new Array(raw.length).fill(0);

  for(let i=0;i<raw.length;i++){
    const p=raw[i];
    const prev=raw[Math.max(0,i-1)];
    const next=raw[Math.min(raw.length-1,i+1)];

    let tx=next.x-prev.x;
    let tz=next.z-prev.z;
    const tl=Math.hypot(tx,tz)||1;

    tx/=tl;
    tz/=tl;

    const nx=-tz;
    const nz=tx;

    const leftY=terrainAbs(
      p.x+nx*rollProbe,
      p.z+nz*rollProbe
    );

    const rightY=terrainAbs(
      p.x-nx*rollProbe,
      p.z-nz*rollProbe
    );

    // Positive roll means the left edge is higher than the right edge.
    rawRoll[i]=Math.atan2(
      leftY-rightY,
      rollProbe*2
    );
  }

  // Three smoothing passes prevent visible twisting from DEM noise.
  let smoothedRoll=rawRoll;

  for(let pass=0;pass<3;pass++){
    const nextRoll=smoothedRoll.slice();

    for(let i=2;i<smoothedRoll.length-2;i++){
      nextRoll[i]=(
        smoothedRoll[i-2]+
        2*smoothedRoll[i-1]+
        4*smoothedRoll[i]+
        2*smoothedRoll[i+1]+
        smoothedRoll[i+2]
      )/10;
    }

    smoothedRoll=nextRoll;
  }

  // Roads normally follow the terrain cross-slope but should not inherit
  // extreme cliff angles. Cap at ~12 degrees.
  const maxRoadRoll=
    12*Math.PI/180;

  return raw.map((p,i)=>({
    x:p.x,
    z:p.z,
    y:finalH[i],
    cum:p.cum,
    roll:Math.max(
      -maxRoadRoll,
      Math.min(
        maxRoadRoll,
        smoothedRoll[i]
      )
    )
  }));
}
let activeRoadProfile=[];
function roadFrameAt(x,z){
  // Returns height + the local 3D road tangent from the closest profile segment.
  let best=null,bd=Infinity;
  for(let i=0;i<activeRoadProfile.length-1;i++){
    const a=activeRoadProfile[i],b=activeRoadProfile[i+1];
    const vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z;
    const vv=vx*vx+vz*vz||1,t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
    const px=a.x+t*vx,pz=a.z+t*vz,d2=(x-px)**2+(z-pz)**2;
    if(d2<bd){
      const horizontal=Math.hypot(vx,vz)||1;
      const pitch=Math.atan2(b.y-a.y,horizontal);
      bd=d2;
      best={
        y:a.y+(b.y-a.y)*t,
        angle:Math.atan2(vx,vz),
        pitch,
        roll:
          (a.roll||0)+
          ((b.roll||0)-(a.roll||0))*t,
        px,pz,
        index:i,t,
        distance:Math.sqrt(d2)
      };
    }
  }
  return best;
}
function roadHeightAt(x,z){
  const f=roadFrameAt(x,z);
  return f?f.y:terrainAbs(x,z);
}

function roadSurfaceAt(x,z){
  const frame=roadFrameAt(x,z);

  if(!frame){
    return null;
  }

  // Match buildRibbon() exactly:
  // tangent=(sin(angle),cos(angle)), transverse normal=(-cos(angle),sin(angle)).
  const normalX=-Math.cos(frame.angle);
  const normalZ= Math.sin(frame.angle);

  const dx=x-frame.px;
  const dz=z-frame.pz;

  const lateral=
    dx*normalX+
    dz*normalZ;

  const roll=
    Number.isFinite(frame.roll)
      ?frame.roll
      :0;

  return {
    ...frame,
    lateral,
    y:
      frame.y+
      Math.tan(roll)*lateral+
      ROAD_SURFACE_OFFSET
  };
}

function terrainFrameAt(x,z,heading){
  // Compute the terrain gradient in WORLD X/Z, independent of vehicle heading.
  // This avoids the Euler-axis problem from v2.3.
  const d=2.5;
  const hL=terrainAbs(x-d,z), hR=terrainAbs(x+d,z);
  const hN=terrainAbs(x,z-d), hS=terrainAbs(x,z+d);
  const hC=terrainAbs(x,z);

  const dhdx=(hR-hL)/(2*d);
  const dhdz=(hS-hN)/(2*d);

  // Surface normal for y = h(x,z): (-dh/dx, 1, -dh/dz)
  const up=new THREE.Vector3(-dhdx,1,-dhdz).normalize();

  // Desired horizontal travel direction from vehicle heading.
  const forward=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));

  // Project travel direction onto terrain plane.
  forward.addScaledVector(up,-forward.dot(up));
  if(forward.lengthSq()<1e-8) forward.set(0,0,1);
  forward.normalize();

  // Right-handed basis: local car X=right, Y=up, Z=forward.
  const right=new THREE.Vector3().crossVectors(up,forward).normalize();
  const correctedForward=new THREE.Vector3().crossVectors(right,up).normalize();

  const basis=new THREE.Matrix4().makeBasis(right,up,correctedForward);
  const quaternion=new THREE.Quaternion().setFromRotationMatrix(basis);

  return {
    y:hC,
    up,
    forward:correctedForward,
    right,
    quaternion,
    slope:Math.sqrt(dhdx*dhdx+dhdz*dhdz)
  };
}
function ensureRoadProfileNear(x,z){
  // Rebuild immediately when coming back toward the road after an off-road excursion.
  const nr=nearestRoute(x,z);
  if(!nr)return null;

  let frame=roadFrameAt(x,z);
  const profileMissing=!frame || frame.distance>40 || activeRoadProfile.length<2;

  if(nr.d<80 && profileMissing){
    // Center the local road corridor on the vehicle right now instead of waiting
    // for the normal 360 m floating-origin threshold.
    recenterIfNeeded(x,z,true);
    frame=roadFrameAt(x,z);
  }
  return frame;
}


// ---------- Manicouagan / local hydrography ----------
function waterWidth(tags={}){
  if(tags.width){
    const w=parseFloat(String(tags.width).replace(',','.'));
    if(Number.isFinite(w))return Math.max(5,Math.min(220,w));
  }
  if(tags.waterway==='river')return 34;
  if(tags.waterway==='stream')return 7;
  return 18;
}
const waterRenderer=createWaterRenderer({
  THREE,
  group:waterGroup,
  statusEl:waterStatus,
  waterFeatures,
  coastlineFeatures,
  materials:{
    waterMat,
    riverMat,
    coastWaterMat
  },
  terrainHeight:(x,z)=>terrainAbs(x,z),
  getWorldOffset:()=>worldOffset,
  waterWidth,
  buildRibbon
});

const rebuildLocalWater=()=>waterRenderer.rebuild();










async function updateHydroCacheHUD(){
  return waterData.updateCacheHUD();
}
updateHydroCacheHUD().catch(()=>{});

async function loadWaterAround(absx,absz){
  const result=await waterData.loadAround(absx,absz);
  if(!result.ok)return false;

  // Geometry/render orchestration deliberately stays in main.js for 13A.
  rebuildBridgeSpans();

  // Hydro may arrive after vegetation.
  removeTreesOverWater();
  sceneryRenderer.removeTreesOverWater();

  bridgeManager.updateStatus();
  rebuildLocalWorld();

  return true;
}


function addBridgeStructures(){
  // Deprecated visual deck layer remains disabled: road ribbon is the ONLY roadway.
  return;
}


// ---------- V5.1.2 signs + enhanced bridge furniture ----------
const signPoleMat=new THREE.MeshStandardMaterial({color:0x74787b,roughness:.72,metalness:.45});
const signBackMat=new THREE.MeshStandardMaterial({color:0x9a9d9f,roughness:.65,metalness:.25});
const bridgeRailMat=new THREE.MeshStandardMaterial({color:0xb8bcc0,roughness:.55,metalness:.55});
const bridgeConcreteMat=new THREE.MeshStandardMaterial({color:0xa6a49b,roughness:.95});
const bridgeGirderMat=new THREE.MeshStandardMaterial({color:0x666b70,roughness:.62,metalness:.38});
const bridgeUndersideMat=new THREE.MeshStandardMaterial({color:0x808287,roughness:.82,metalness:.12});
const bridgeFasciaMat=new THREE.MeshStandardMaterial({color:0x70757a,roughness:.74,metalness:.22});
const bridgeBearingMat=new THREE.MeshStandardMaterial({color:0x4d5053,roughness:.58,metalness:.48});

function makeSignTexture(text,kind='speed'){
 const c=document.createElement('canvas');c.width=384;c.height=256;
 const x=c.getContext('2d');x.textAlign='center';x.textBaseline='middle';
 if(kind==='speed'){
  x.fillStyle='rgba(0,0,0,0)';x.fillRect(0,0,c.width,c.height);
  x.fillStyle='#fff';x.beginPath();x.arc(192,128,104,0,Math.PI*2);x.fill();
  x.lineWidth=18;x.strokeStyle='#d62828';x.stroke();
  x.fillStyle='#111';x.font='bold 92px Arial';x.fillText(String(text),192,132);
 }else{
  let bg='#176d45',fg='#fff',border='#fff';
  if(kind==='river')bg='#296b9b';
  if(kind==='city'){bg='#fff';fg='#111';border='#111'}
  x.fillStyle=bg;x.fillRect(12,40,360,176);
  x.lineWidth=7;x.strokeStyle=border;x.strokeRect(20,48,344,160);
  x.fillStyle=fg;
  const words=String(text||'').replace(/\|/g,' ').split(/\s+/);
  let lines=[''];
  for(const w of words){
    const k=lines.length-1;
    if((lines[k]+' '+w).trim().length>18&&lines.length<3)lines.push(w);
    else lines[k]=(lines[k]+' '+w).trim();
  }
  x.font=kind==='city'?'bold 43px Arial':'bold 38px Arial';
  const lineH=48,y0=128-(lines.length-1)*lineH/2;
  lines.slice(0,3).forEach((t,i)=>x.fillText(t,192,y0+i*lineH));
 }
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function addRoadSignAt(p,text,kind='speed',side=1){
 if(!p)return;
 const ang=p.angle??0,lateral=side*4.45,nx=Math.cos(ang),nz=-Math.sin(ang),g=new THREE.Group();
 const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,2.15,8),signPoleMat);pole.position.y=1.18;g.add(pole);
 const geom=kind==='speed'
   ?new THREE.CircleGeometry(.46,28)
   :new THREE.PlaneGeometry(kind==='city'?2.15:1.95,1.02);
 const face=new THREE.Mesh(geom,new THREE.MeshStandardMaterial({map:makeSignTexture(text,kind),side:THREE.DoubleSide,roughness:.72}));
 face.position.y=2.28;face.rotation.y=side>0?Math.PI:0;g.add(face);
 const back=new THREE.Mesh(geom,signBackMat);back.position.copy(face.position);back.rotation.y=face.rotation.y+Math.PI;g.add(back);
 g.position.set(p.x+nx*lateral-worldOffset.x,p.y+.02,p.z+nz*lateral-worldOffset.z);g.rotation.y=ang;infrastructureGroup.add(g);
}
function addBridgeRailFromProfile(a,b,side){
 const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.4)return;
 const ang=Math.atan2(dx,dz);
 const nx=Math.cos(ang),nz=-Math.sin(ang);
 // Align to the actual road edge. Main asphalt is 7.5m wide in this build.
 const off=side*4.15;

 // Rail beam follows exact road-profile heights.
 const rail=new THREE.Mesh(new THREE.BoxGeometry(.10,.18,len),bridgeRailMat);
 rail.position.set(
   (a.x+b.x)/2+nx*off-worldOffset.x,
   (a.y+b.y)/2+.48,
   (a.z+b.z)/2+nz*off-worldOffset.z
 );
 rail.rotation.y=ang;
 infrastructureGroup.add(rail);

 // Posts also interpolate directly between exact profile heights.
 const posts=Math.max(1,Math.floor(len/3.2));
 for(let i=0;i<=posts;i++){
   const t=i/posts;
   const px=a.x+(b.x-a.x)*t+nx*off;
   const pz=a.z+(b.z-a.z)*t+nz*off;
   const py=a.y+(b.y-a.y)*t;
   const post=new THREE.Mesh(new THREE.BoxGeometry(.09,.62,.09),bridgeRailMat);
   post.position.set(px-worldOffset.x,py+.20,pz-worldOffset.z);
   infrastructureGroup.add(post);
 }
}
function addEnhancedBridgeFurniture(){
 if(!activeRoadProfile?.length||!bridgeSpans?.length)return;

 for(const b of bridgeSpans){
   const pts=activeRoadProfile.filter(p=>p.cum>=b.start&&p.cum<=b.end);
   if(pts.length<2)continue;

   // 1) Guardrails follow the exact roadway profile.
   for(let i=0;i<pts.length-1;i++){
     addBridgeRailFromProfile(pts[i],pts[i+1],-1);
     addBridgeRailFromProfile(pts[i],pts[i+1],1);
   }

   // 2) Build true 3D under-structure segment-by-segment so side views
   // follow vertical curvature and don't look like one flat slab.
   for(let i=0;i<pts.length-1;i++){
     const a=pts[i],c=pts[i+1];
     const dx=c.x-a.x,dz=c.z-a.z,len=Math.hypot(dx,dz);
     if(len<.35)continue;

     const ang=Math.atan2(dx,dz);
     const nx=Math.cos(ang),nz=-Math.sin(ang);
     const my=(a.y+c.y)/2;

     // Main underside slab.
     const slab=new THREE.Mesh(new THREE.BoxGeometry(8.0,.62,len),bridgeUndersideMat);
     slab.position.set((a.x+c.x)/2-worldOffset.x,my-.64,(a.z+c.z)/2-worldOffset.z);
     slab.rotation.y=ang;
     slab.castShadow=true;slab.receiveShadow=true;
     infrastructureGroup.add(slab);

     // Strong side fascias: these are what make the bridge readable in profile.
     for(const side of [-1,1]){
       const off=side*3.72;
       const fascia=new THREE.Mesh(new THREE.BoxGeometry(.34,1.18,len),bridgeFasciaMat);
       fascia.position.set(
         (a.x+c.x)/2+nx*off-worldOffset.x,
         my-.93,
         (a.z+c.z)/2+nz*off-worldOffset.z
       );
       fascia.rotation.y=ang;
       fascia.castShadow=true;
       infrastructureGroup.add(fascia);

       // Inner longitudinal girders set in from the fascia.
       const girder=new THREE.Mesh(new THREE.BoxGeometry(.38,.82,len),bridgeGirderMat);
       girder.position.set(
         (a.x+c.x)/2+nx*(side*2.35)-worldOffset.x,
         my-1.18,
         (a.z+c.z)/2+nz*(side*2.35)-worldOffset.z
       );
       girder.rotation.y=ang;
       girder.castShadow=true;
       infrastructureGroup.add(girder);
     }
   }

   // 3) Cross-beams under the deck at fixed longitudinal spacing.
   const startCum=pts[0].cum,endCum=pts[pts.length-1].cum;
   const total=Math.max(0,endCum-startCum);
   const crossCount=Math.max(2,Math.floor(total/10));
   for(let i=1;i<crossCount;i++){
     const cum=startCum+total*i/crossCount;
     const p=routePointAtCum(cum);
     const y=bridgeHeightAtCum(cum)??roadHeightAt(p.x,p.z);
     const beam=new THREE.Mesh(new THREE.BoxGeometry(7.25,.32,.42),bridgeGirderMat);
     beam.position.set(p.x-worldOffset.x,y-1.18,p.z-worldOffset.z);
     beam.rotation.y=p.angle+Math.PI/2;
     infrastructureGroup.add(beam);
   }

   // 4) Abutments + visible bearings at bridge ends.
   for(const p of [pts[0],pts[pts.length-1]]){
     const idx=activeRoadProfile.indexOf(p);
     const p0=activeRoadProfile[Math.max(0,idx-1)];
     const p1=activeRoadProfile[Math.min(activeRoadProfile.length-1,idx+1)];
     const ang=Math.atan2(p1.x-p0.x,p1.z-p0.z);

     const ab=new THREE.Mesh(new THREE.BoxGeometry(8.9,1.15,.92),bridgeConcreteMat);
     ab.position.set(p.x-worldOffset.x,p.y-.78,p.z-worldOffset.z);
     ab.rotation.y=ang;
     ab.castShadow=true;ab.receiveShadow=true;
     infrastructureGroup.add(ab);

     for(const side of [-1,1]){
       const nx=Math.cos(ang),nz=-Math.sin(ang);
       const bearing=new THREE.Mesh(new THREE.BoxGeometry(.68,.18,.54),bridgeBearingMat);
       bearing.position.set(
         p.x+nx*(side*2.35)-worldOffset.x,
         p.y-1.03,
         p.z+nz*(side*2.35)-worldOffset.z
       );
       bearing.rotation.y=ang;
       infrastructureGroup.add(bearing);
     }
   }

   // 5) Piers for longer spans, with wider caps and footings.
   if(total>30){
     const pierCount=Math.max(1,Math.min(4,Math.floor(total/38)));
     for(let i=1;i<=pierCount;i++){
       const cum=startCum+total*i/(pierCount+1);
       const p=routePointAtCum(cum);
       const deckY=bridgeHeightAtCum(cum)??roadHeightAt(p.x,p.z);
       const groundY=terrainAbs(p.x,p.z);
       const h=Math.max(1.8,deckY-groundY-1.1);

       const pier=new THREE.Mesh(new THREE.BoxGeometry(1.35,h,.88),bridgeConcreteMat);
       pier.position.set(p.x-worldOffset.x,groundY+h/2,p.z-worldOffset.z);
       pier.rotation.y=p.angle;
       pier.castShadow=true;pier.receiveShadow=true;
       infrastructureGroup.add(pier);

       const cap=new THREE.Mesh(new THREE.BoxGeometry(6.8,.62,1.25),bridgeConcreteMat);
       cap.position.set(p.x-worldOffset.x,deckY-1.52,p.z-worldOffset.z);
       cap.rotation.y=p.angle+Math.PI/2;
       cap.castShadow=true;
       infrastructureGroup.add(cap);

       const footing=new THREE.Mesh(new THREE.BoxGeometry(2.2,.55,1.7),bridgeConcreteMat);
       footing.position.set(p.x-worldOffset.x,groundY+.18,p.z-worldOffset.z);
       footing.rotation.y=p.angle;
       footing.receiveShadow=true;
       infrastructureGroup.add(footing);
     }
   }
 }
}
function addCurrentRoadSigns(){
 if(activeRoadMeta.confidence<=.25)return;
 const n=nearestRoute(absX,absZ);if(!n)return;
 const label=activeRoadMeta.ref||activeRoadMeta.name;
 if(label){
  const p=routePointAtCum(Math.min(routeLength,n.cum+170));p.y=roadHeightAt(p.x,p.z);
  addRoadSignAt(p,String(label).slice(0,28),'guide',1);
 }
}

// Build only a corridor around the current location, preserving every source polyline curve.
function rebuildLocalWorld(){
 clearGroup(roadGroup);clearGroup(forestGroup);
 clearGroup(infrastructureGroup);
 sceneryRenderer.clear();

 // CRITICAL: bridge deck heights depend on terrain elevation at their approaches.
 // Elevation tiles, floating-origin shifts and asynchronous loads can all change
 // terrainAbs(). Recompute bridge spans BEFORE rebuilding the road every time.
 if(bridgeFeatures.length) rebuildBridgeSpans();

 const profile=buildRoadProfile();
 activeRoadProfile=profile;

 // Cut terrain fragments directly below the road corridor so coarse DEM
 // triangles can never protrude through asphalt or shoulders.
 terrainService.setRoadBed(profile,{
   roadHalfWidth:5.2,
   terrainCutHalfWidth:13.5,
   blendWidth:12.0,
   surfaceOffset:0.14
 });

 if(profile.length>1){
   // Solid 3D road body first; flat top layers are then drawn over it.
   const roadVolume=buildRoadVolume(profile);
   if(roadVolume)roadGroup.add(roadVolume);

   const shoulder=buildRibbon(profile,10.4,shoulderMat,.035);if(shoulder)roadGroup.add(shoulder);
   const asphaltRoad=buildRibbon(profile,7.5,roadMat,ROAD_SURFACE_OFFSET);if(asphaltRoad)roadGroup.add(asphaltRoad);
   const center=buildRibbon(profile,.13,lineYellow,.165);if(center)roadGroup.add(center);

   // Edge lines: derive horizontally offset profiles but reuse the exact smoothed height.
   for(const side of [-1,1]){
     const edge=[];
     for(let i=0;i<profile.length;i++){
       const p=profile[i],prev=profile[Math.max(0,i-1)],next=profile[Math.min(profile.length-1,i+1)];
       let tx=next.x-prev.x,tz=next.z-prev.z,tl=Math.hypot(tx,tz)||1;tx/=tl;tz/=tl;
       const nx=-tz,nz=tx,off=3.45*side;
       edge.push({
         x:p.x+nx*off,
         z:p.z+nz*off,
         y:p.y+Math.tan(p.roll||0)*off,
         roll:p.roll||0
       });
     }
     const em=buildRibbon(edge,.10,lineWhite,.16);if(em)roadGroup.add(em);
   }
 }

 // Lightweight boreal forest, deterministic around the current render origin.
 // Instancing avoids recreating hundreds of individual geometries on each stream
 // refresh and also cuts the resulting draw-call count dramatically.
 let seed=Math.floor(worldOffset.x/90)*73856093 ^ Math.floor(worldOffset.z/90)*19349663;
 function rnd(){seed=(seed*1664525+1013904223)|0;return ((seed>>>0)/4294967296)}

 const nearTrees=[];
 const farTrees=[];

 for(let i=0;i<170;i++){
   const rx=(rnd()-.5)*1700;
   const rz=(rnd()-.5)*1700;
   const absx=worldOffset.x+rx;
   const absz=worldOffset.z+rz;
   const n=nearestRoute(absx,absz);

   if(n&&n.d<16)continue;
   if(isWaterAt(absx,absz,7))continue;

   const scale=.7+rnd()*.8;
   const y=terrainAbs(absx,absz);
   const dist=Math.hypot(rx,rz);

   if(dist<520){
     nearTrees.push({rx,rz,y,scale});
   }else if(dist<900 || i%3===0){
     farTrees.push({rx,rz,y,scale});
   }
 }

 const dummy=new THREE.Object3D();

 if(nearTrees.length){
   const trunkGeom=new THREE.CylinderGeometry(.12,.18,1.5,6);
   const crownGeom=new THREE.ConeGeometry(.9,3.4,7);

   const trunks=new THREE.InstancedMesh(
     trunkGeom,
     treeTrunkMat,
     nearTrees.length
   );

   const crowns=new THREE.InstancedMesh(
     crownGeom,
     treeMat,
     nearTrees.length
   );

   for(let i=0;i<nearTrees.length;i++){
     const t=nearTrees[i];

     dummy.position.set(
       t.rx,
       t.y+.75*t.scale,
       t.rz
     );
     dummy.scale.setScalar(t.scale);
     dummy.rotation.set(0,0,0);
     dummy.updateMatrix();
     trunks.setMatrixAt(i,dummy.matrix);

     dummy.position.set(
       t.rx,
       t.y+2.35*t.scale,
       t.rz
     );
     dummy.updateMatrix();
     crowns.setMatrixAt(i,dummy.matrix);
   }

   trunks.instanceMatrix.needsUpdate=true;
   crowns.instanceMatrix.needsUpdate=true;
   forestGroup.add(trunks,crowns);
 }

 if(farTrees.length){
   const crownGeom=new THREE.ConeGeometry(.9,3.4,6);

   const crowns=new THREE.InstancedMesh(
     crownGeom,
     treeMat,
     farTrees.length
   );

   for(let i=0;i<farTrees.length;i++){
     const t=farTrees[i];

     dummy.position.set(
       t.rx,
       t.y+2.15*t.scale,
       t.rz
     );
     dummy.scale.setScalar(t.scale);
     dummy.rotation.set(0,0,0);
     dummy.updateMatrix();
     crowns.setMatrixAt(i,dummy.matrix);
   }

   crowns.instanceMatrix.needsUpdate=true;
   forestGroup.add(crowns);
 }

 // terrainService.setRoadBed() already rebuilt the main terrain geometry above.
 // The old rebuildGroundTerrain() here rebuilt the exact same ~120x120 mesh a
 // second time and was a major avoidable frame spike.
 rebuildLocalWater();

 scheduleVisualJob(
   'scenery',
   rebuildLocalScenery,
   220
 );

 addEnhancedBridgeFurniture();
 addCurrentRoadSigns();
 addGeographicRoadSigns();

 scheduleVisualJob(
   'horizon',
   rebuildHorizon,
   260
 );
}
function recenterIfNeeded(absx,absz,force=false){
 const dx=absx-worldOffset.x,dz=absz-worldOffset.z;
 if(force||dx*dx+dz*dz>360*360){
   // Preserve camera/car relative geometry across the floating-origin shift.
   // Before: render coordinate = absolute - oldOffset
   // After : render coordinate = absolute - newOffset
   // Therefore every existing render-space object/camera must be shifted by -(new-old).
   const shiftX=absx-worldOffset.x;
   const shiftZ=absz-worldOffset.z;
   worldOffset={x:absx,z:absz};

   camera.position.x -= shiftX;
   camera.position.z -= shiftZ;
   camTarget.x -= shiftX;
   camTarget.z -= shiftZ;

   // car position is updated immediately after this function, but shifting it here
   // prevents a one-frame mismatch if rendering occurs during a forced recenter.
   car.position.x -= shiftX;
   car.position.z -= shiftZ;

   rebuildLocalWorld();
   applyImageryToGround();
   return true;
 }
 return false
}


function resetWorldCaches(){
  worldStreaming.reset();
  waterData.reset();
  skidMarks.clear();

  route.length=0;segments.length=0;routeLength=0;
  bridgeManager.reset();
  bridgeStatus.textContent='0';
  waterRenderer.clear();

  sceneryData.reset();
  // Keep completed elevation/imagery LRU caches across route changes.
  // Only in-flight operations and route-relative state are reset.
  elevationService.reset();
  imageryService.reset();
  bridgeManager.resetCounter();
  activeRoadMeta={highway:null,surface:'asphalt',maxspeed:null,lanes:null,width:null,name:null,ref:null,confidence:0};
  signData.reset();
  passedSignKeys.clear();signReadout.key=null;signReadout.text='';signReadout.startedAt=0;
  if(signStatus)signStatus.textContent='0';
  lastRoadMetaCenter={x:Infinity,z:Infinity};
  roadMetaLoading=false;
  updateRoadMetaHUD();
  activeRoadProfile=[];
  terrainService.clearRoadBed();
  clearGroup(roadGroup);clearGroup(forestGroup);
  clearGroup(infrastructureGroup);
  sceneryRenderer.clear();
  terrainService.clearHorizon();
}

async function createRequestedRoute(start,end,waypoints=[]){
  bumpRouteGeneration();
  if(!validLatLon(start.lat,start.lon)||!validLatLon(end.lat,end.lon)){
    toast('Coordonnées invalides');return false;
  }
  if(geoDist(start,end)<100){toast('Départ et arrivée trop proches');return false;}

  if(autopilot)setAutopilot(false,'Pilote auto désactivé');
  speed=0;steer=0;autopilotSteer=0;
  ROUTE_START={...start,name:start.name||'Départ'};
  ROUTE_END={...end,name:end.name||'Arrivée'};
  ROUTE_WAYPOINTS=Array.isArray(waypoints)?waypoints.slice(0,8):[];
  origin={lat:ROUTE_START.lat,lon:ROUTE_START.lon};
  resetWorldCaches();
  resetRunChallenge();

  loading.classList.remove('hidden');
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
  },11000);

  try{
    await loadRoute();
    prepMap();
    placeAt(0);
    completed=true;
    clearTimeout(failsafe);
    loading.classList.add('hidden');

    loadElevationAround(absX,absZ).catch(()=>{elevStatus.textContent='Démo'});
    worldStreaming.preloadRoute(absX,absZ);
    loadSceneryAround(absX,absZ).catch(()=>{sceneryStatus.textContent='Indisponible'});
    buildImageryMosaic(absX,absZ).catch(()=>{imageryStatus.textContent='Fallback'});
    loadRoadMetadataAround(absX,absZ).catch(()=>{});
    loadGeographicSignsAround(absX,absZ).catch(()=>{});
    toast('Trajet prêt');
    return true;
  }catch(e){
    completed=true;
    clearTimeout(failsafe);
    console.error('Route creation failed:',e);
    loading.classList.add('hidden');
    routingStatus.textContent='Échec';
    statusEl.textContent='Impossible de créer le trajet — clique Créer le trajet pour réessayer';
    toast('Échec du routage');
    return false;
  }
}


// ---------- V5 subsystem facade ----------
const WorldDrive={
  version:'5.0-alpha',
  route:{generation:0},
  streaming:{generation:0},
  vehicle:{generation:0},
  ui:{generation:0}
};
function bumpRouteGeneration(){
  WorldDrive.route.generation++;
  WorldDrive.streaming.generation++;
}

// ---------- route fetch ----------
async function loadRoute(){
  const routePoints=[ROUTE_START,...ROUTE_WAYPOINTS,ROUTE_END];

  const {coordinates,provider}=await routingService.fetchRoute({
    points:routePoints,
    start:ROUTE_START
  });

  routingStatus.textContent=provider;
  const coordsGeo=coordinates;

  route.length=0;
  segments.length=0;
  routeLength=0;

  for(let i=0;i<coordsGeo.length;i++){
    const [lon,lat]=coordsGeo[i];
    const p=llToXZ(lat,lon);
    let cum=routeLength;

    if(i){
      const prev=route[i-1];
      const len=Math.hypot(p.x-prev.x,p.z-prev.z);
      if(len>.02){
        segments.push({
          ax:prev.x,az:prev.z,
          bx:p.x,bz:p.z,
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

  statusEl.textContent=`Trajet chargé · ${(routeLength/1000).toFixed(1)} km · ${route.length.toLocaleString('fr-CA')} points`;
  return true;
}

// ---------- Driving ----------
let absX=0,absZ=0,heading=0,speed=0,steer=0,assist=true,last=performance.now();
let autopilot=false;
let autopilotSteer=0;

// V4.1 vehicle dynamics state
let longitudinalAccel=0;
let visualSteer=0;
let bodyHeave=0;
let currentSteerAngle=0; // shared with audio / visual systems

// V18K — tire stress comes from the actual vehicle-physics grip clamp.
// This value is intentionally smoothed a little to represent tire-force/slip
// buildup and to ignore a momentary joystick twitch.
// 1.0 = the requested cornering force has reached available lateral grip.
let lateralGripUsage=0;

// Mutable object identity is intentional: audio/physics keep the same reference
// when future vehicles are selected.
const VEHICLE=vehicleSystem.physics;
const autopilotStatus=$('autopilotStatus');

const vehicleAudio=createVehicleAudio({
  statusEl:$('audioStatus'),
  enableButton:$('audioEnableBtn'),
  vehicle:VEHICLE,
  getProfile:()=>vehicleSystem.active.audio,
  getState:()=>({
    speed,
    longitudinalAccel,
    currentSteerAngle,
    lateralGripUsage,
    absX,
    absZ
  }),
  getNearestRoute:()=>nearestRoute(absX,absZ)
});

// V18 multiplayer is presentation-only: remote cars never participate
// in local collision, road contact or vehicle physics.
const multiplayer=createMultiplayerClient({
  THREE,
  scene,
  latLonToWorld:(lat,lon)=>llToXZ(lat,lon),
  getWorldOffset:()=>worldOffset,
  getLocalState:()=>{
    const ll=xzToLL(absX,absZ);
    return {
      lat:ll.lat,
      lon:ll.lon,
      // V18B sends the real local car-root height and presentation pose.
      // Remote clients can therefore reproduce the same procedural model,
      // chassis pitch/roll and wheel-plane camber without network physics.
      y:car.position.y,
      heading,
      speed,
      vehicleId:vehicleSystem.activeId,
      steer:currentSteerAngle,
      braking:vehicleVisuals.brakeLightLevel>.18,
      onRoad:skidMarks.localState.onRoad,
      skidFront:skidMarks.localState.front,
      skidRear:skidMarks.localState.rear,
      bodyPitch:bodyGroup.rotation.x,
      bodyYaw:bodyGroup.rotation.y,
      bodyRoll:bodyGroup.rotation.z,
      bodyY:bodyGroup.position.y,
      wheelPitch:vehiclePresentation.wheelPlanePitch,
      wheelRoll:vehiclePresentation.wheelPlaneRoll
    };
  },
  createRemoteVisual:multiplayerVisuals.createRemoteVehicleVisual,

  // V18C: anchor all remote peer positions to the local car using direct
  // geographic metre offsets. This is independent of route origin/recentering.
  getLocalRenderPosition:()=>({
    x:car.position.x,
    z:car.position.z
  }),

  // Remote vertical support is solved from THIS client's road/terrain.
  // Sender Y is intentionally ignored for normal rendering.
  solveRemoteSupport:multiplayerVisuals.solveRemoteVehicleSupport,

  // Remote headlights follow the same local dusk/night factor as our car.
  // No multiplayer protocol field is necessary for automatic headlights.
  getHeadlightLevel:()=>vehicleVisuals.headlightLevel,

  onRemoteSkidFrame:frame=>{
    skidMarks.updateRemote({
      peerId:frame.id,
      contacts:frame.contacts,
      front:frame.skidFront,
      rear:frame.skidRear,
      onRoad:frame.onRoad,
      distance:frame.distance
    });
  },

  onRemotePeerRemoved:id=>{
    skidMarks.resetSource(`remote:${id}`);
  },

  statusEl:$('multiplayerStatus'),
  countEl:$('multiplayerCount'),
  serverEl:$('multiplayerServer'),
  nameInput:$('multiplayerName'),
  toggleButton:$('multiplayerToggleBtn'),
  toast
});

const camTarget=new THREE.Vector3();

const cameraController=createCameraController({
  THREE,
  camera,
  camTarget,
  car,
  modeStatusEl:$('camMode'),
  getHeading:()=>heading,
  getLookState:()=>gamepadState
});

const gamepad=createGamepadController({
  statusEl:$('gamepadStatus'),
  audio:vehicleAudio,
  toast,
  onCycleCamera:()=>cameraController.cycle(),
  onToggleAssist:()=>toggleAssist(),
  onToggleAutopilot:()=>toggleAutopilot(),
  onResetToRoad:()=>resetToRoad(),
  isAutopilotEnabled:()=>autopilot,
  disableAutopilot:message=>setAutopilot(false,message)
});
const gamepadState=gamepad.state;

const keys={};addEventListener('keydown',e=>{
 keys[e.code]=true;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
 if(e.code==='KeyC')cameraController.cycle();
 if(e.code==='KeyL')toggleAssist();
 if(e.code==='KeyP')toggleAutopilot();
 if(e.code==='KeyR')resetToRoad();

 // Immediate manual takeover: steering, braking or reverse cancels autopilot.
 if(autopilot && ['KeyA','KeyD','ArrowLeft','ArrowRight','KeyS','ArrowDown','Space'].includes(e.code)){
   setAutopilot(false,'Reprise manuelle');
 }
});addEventListener('keyup',e=>keys[e.code]=false);
let maxSpeedKmh=200;let MAX=maxSpeedKmh/3.6;const REV=-10;
let obeyRoadSpeedLimits=localStorage.getItem('worlddrive_obey_speed_limits')!=='0';
let roadContact=false;

function setAutopilot(enabled,message=''){
  autopilot=enabled;
  $('autopilotBtn').textContent='Pilote auto: '+(autopilot?'ON':'OFF');
  autopilotStatus.textContent=autopilot?'ACTIF':'OFF';
  if(autopilot){
    assist=true;
    $('assist').textContent='Assist: ON';
    roadContact=true;
    const n=nearestRoute(absX,absZ);
    if(n && n.d>6){
      absX=n.px;absZ=n.pz;
      recenterIfNeeded(absX,absZ,true);
    }
    toast(message||'Pilote automatique activé');
  }else{
    autopilotSteer=0;
    toast(message||'Pilote automatique désactivé');
  }
}
function toggleAutopilot(){ setAutopilot(!autopilot); }

function autopilotControl(dt,nr){
  if(!autopilot||!nr||!routeLength)return {throttle:0,turn:0,hand:false};

  const kmh=Math.abs(speed)*3.6;
  const lookAhead=Math.max(18,Math.min(105,18+kmh*.40));
  const target=routePointAtCum(Math.min(routeLength-1,nr.cum+lookAhead));

  const desired=Math.atan2(target.x-absX,target.z-absZ);
  const headingErr=angleDelta(desired,heading);

  // Cross-track correction is blended with heading correction.
  const lateralSign=Math.sign(
    Math.sin(nr.angle)*(absZ-nr.pz)-Math.cos(nr.angle)*(absX-nr.px)
  )||0;
  const crossTrack=Math.min(1,nr.d/5)*lateralSign;
  const steerRequest=Math.max(-1,Math.min(1,headingErr*1.55-crossTrack*.34));
  autopilotSteer+=(steerRequest-autopilotSteer)*(1-Math.exp(-dt*(kmh>130?4.5:6.5)));

  // Sample several points instead of comparing only two headings.
  // This makes braking start before a sequence of bends rather than in the bend.
  let maxCurve=0;
  const step=Math.max(12,lookAhead*.45);
  let prev=routePointAtCum(Math.min(routeLength-1,nr.cum+step));
  for(let d=step*2;d<=lookAhead*2.6;d+=step){
    const q=routePointAtCum(Math.min(routeLength-1,nr.cum+d));
    const ds=Math.max(5,q.cum-prev.cum);
    maxCurve=Math.max(maxCurve,Math.abs(angleDelta(q.angle,prev.angle))/ds);
    prev=q;
  }

  // Approximate safe speed from lateral acceleration v²*kappa.
  // 3.0 m/s² keeps the autopilot comfortable rather than race-car aggressive.
  const curveSpeed=maxCurve>.00015?Math.sqrt(3.0/maxCurve):MAX;

  // Optional legal-speed cap. Curve safety remains active in both modes.
  const roadLimit=(
    obeyRoadSpeedLimits &&
    activeRoadMeta.maxspeed
  ) ? activeRoadMeta.maxspeed/3.6 : MAX;

  let targetSpeed=Math.min(
    MAX,
    roadLimit,
    Math.max(7.5,curveSpeed)
  );

  // Progressive destination braking.
  const remaining=routeLength-nr.cum;
  if(remaining<120)targetSpeed=Math.min(targetSpeed,Math.sqrt(Math.max(0,remaining)*5.2));
  if(remaining<8)targetSpeed=0;

  const errorV=targetSpeed-speed;
  let throttle=0;
  if(errorV>1.0)throttle=Math.min(1,.30+errorV/5);
  else if(errorV>.12)throttle=Math.max(.08,errorV/1.2);
  else if(errorV<-.25)throttle=Math.max(-1,errorV/3.5);

  if(remaining<5&&Math.abs(speed)<.45){
    speed=0;setAutopilot(false,'Arrivée à destination');
  }
  return {throttle,turn:autopilotSteer,hand:false};
}


function groundHeightForWheel(absx,absz){
  const rs=roadSurfaceAt(absx,absz);
  if(rs&&Math.abs(rs.lateral)<ROAD_WHEEL_CONTACT_HALF_WIDTH){
    return rs.y;
  }
  return terrainAbs(absx,absz);
}



function updateDrive(dt){
 const nr=nearestRoute(absX,absZ);
 const ap=autopilotControl(dt,nr);

 const keyboardThrottle=((keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0));
 const keyboardTurn=((keys.KeyA||keys.ArrowLeft?1:0)-(keys.KeyD||keys.ArrowRight?1:0));
 let manualThrottle=keyboardThrottle,manualTurn=keyboardTurn,manualHand=!!keys.Space;

 if(gamepadState.connected){
   if(gamepadState.throttle>.02||gamepadState.brake>.02)manualThrottle=gamepadState.throttle-gamepadState.brake;
   if(Math.abs(gamepadState.steer)>.001)manualTurn=-gamepadState.steer;
   manualHand=manualHand||gamepadState.hand;
 }

 const throttle=autopilot?ap.throttle:manualThrottle;
 const turn=autopilot?ap.turn:manualTurn;
 const hand=autopilot?ap.hand:manualHand;

 // Lane-keep is allowed only when the driver is not actively steering.
 // This keeps manual input authoritative at all times.
 const steeringNeutral=
   !autopilot &&
   Math.abs(manualTurn)<.055;

 const brakeRequested=hand||(throttle<-.04&&speed>.15);
 vehicleVisuals.updateBrakeLights(dt,brakeRequested);
 // ----- V4.1 longitudinal dynamics -----
 const previousSpeed=speed;
 const onPavement=nr&&nr.d<8.5;
 const surfaceGrip=onPavement?roadSurfaceGrip():1;
 const grip=onPavement?surfaceGrip:VEHICLE.offroadGrip;

 let accel=0;
 if(throttle>0){
   if(speed>=0){
     // EV-style power taper: strong low-speed response, progressively softer
     // above highway speed, but enough reserve to reach the selected 180–200 km/h cap.
     const performanceTop=
       (VEHICLE.topSpeedKmh||200)/3.6;

     const speedRatio=
       Math.min(
         1,
         Math.max(
           0,
           speed/performanceTop
         )
       );
     const powerTaper=1-.38*speedRatio;
     accel+=VEHICLE.accel*throttle*powerTaper;
   }else accel+=VEHICLE.brake*throttle; // brake reverse motion before going forward
 }else if(throttle<0){
   if(speed>0)accel+=VEHICLE.brake*throttle;
   else accel+=VEHICLE.reverseAccel*throttle;
 }

 // Rolling + aerodynamic resistance. Off-road adds substantial drag but no
 // artificial hard speed clamp.
 if(Math.abs(speed)>.05){
   const surfaceDrag=onPavement?Math.max(0,(1-surfaceGrip)*.75):VEHICLE.offroadDrag;
   const resist=VEHICLE.rolling+VEHICLE.aero*speed*speed+surfaceDrag;
   accel-=Math.sign(speed)*resist;
 }else if(!throttle)speed=0;

 if(hand){
   accel-=Math.sign(speed||1)*12;
 }

 speed+=accel*dt;
 speed=Math.max(REV,Math.min(MAX,speed));
 if(previousSpeed>0&&speed<0&&!throttle)speed=0;
 if(previousSpeed<0&&speed>0&&!throttle)speed=0;
 longitudinalAccel=(speed-previousSpeed)/Math.max(dt,.001);

 // ----- speed-sensitive bicycle steering -----
 const speedAbs=Math.abs(speed);

 // Speed-dependent mechanical steering angle.
 // Parking speeds get a tight turning circle; highway speeds progressively reduce
 // available road-wheel angle for stability.
 const speedBlend=Math.min(1,speedAbs/32);
 const maxRoadWheelAngle=VEHICLE.maxSteerLow+(VEHICLE.maxSteerHigh-VEHICLE.maxSteerLow)*(speedBlend*speedBlend);

 // Soft center dead-zone and self-centering. Digital keyboard input remains full
 // left/right, but releasing the key now brings steering cleanly back to zero.
 let steerTarget=turn;
 if(Math.abs(steerTarget)<.08)steerTarget=0;

 // Slower steering buildup around low speed; faster return to center.
 const highSpeedSteerResponse=VEHICLE.steeringResponseHigh??3.8;
 const steeringInRate=speedAbs<5
   ?3.7
   :(speedAbs>25?highSpeedSteerResponse:4.5);
 const steeringOutRate=speedAbs<5?6.5:7.5;
 const steerResponse=steerTarget===0?steeringOutRate:steeringInRate;
 steer+=(steerTarget-steer)*(1-Math.exp(-dt*steerResponse));
 if(steerTarget===0&&Math.abs(steer)<.008)steer=0;

 // Bicycle-model yaw rate.
 const steerAngle=steer*maxRoadWheelAngle;
 currentSteerAngle=steerAngle;

 // Off-road should behave like pavement at manoeuvring speeds. Grip loss becomes
 // progressively relevant only as speed rises.
 const offroadGripBlend=Math.min(1,Math.max(0,(speedAbs-8)/18));

 // Each vehicle can now have a distinct paved-road cornering personality.
 // ID4 remains at 1.00; WRX gets slightly more front-end authority.
 const roadGripMultiplier=VEHICLE.roadGripMultiplier??1;
 const effectiveGrip=onPavement
   ?surfaceGrip*roadGripMultiplier
   :(1+(VEHICLE.offroadGrip-1)*offroadGripBlend);

 let yawRate=(speed/VEHICLE.wheelbase)*Math.tan(steerAngle)*effectiveGrip;

 // Vehicle-specific lateral acceleration ceiling.
 // This was previously hard-coded to 7.0 m/s² for every vehicle, which made
 // the WRX understeer like the heavier ID4 in high-speed bends.
 const requestedLatAccel=Math.abs(speed*yawRate);
 const offroadLatLimit=speedAbs<10?7.0:3.8;
 const roadLatLimit=VEHICLE.lateralAccelLimit??7.0;
 const latLimit=onPavement?roadLatLimit:offroadLatLimit;

 // Raw tire demand is measured exactly where the physics reaches its grip
 // ceiling, rather than reconstructed later from joystick/steering angle.
 const rawGripUsage=
   onPavement&&latLimit>0
     ?Math.min(1.35,requestedLatAccel/latLimit)
     :0;

 // Real tires do not build slip/force in zero time. A short attack/release
 // also prevents a tiny joystick tap from instantly firing audio/decals.
 const gripResponse=
   rawGripUsage>lateralGripUsage
     ?12
     :18;

 lateralGripUsage+=
   (rawGripUsage-lateralGripUsage)*
   (1-Math.exp(-dt*gripResponse));

 if(lateralGripUsage<.002&&rawGripUsage===0){
   lateralGripUsage=0;
 }

 if(requestedLatAccel>latLimit&&requestedLatAccel>0){
   yawRate*=latLimit/requestedLatAccel;
 }
 heading+=yawRate*dt;

 // Road assist / lane keeping.
 // Autopilot keeps its stronger correction. In normal driving, correction only
 // acts while steering input is neutral, so the driver always wins instantly.
 if(assist&&nr&&nr.d<(autopilot?12:9.5)&&speedAbs>2){
   let routeHeading=nr.angle;

   if(
     Math.abs(angleDelta(routeHeading+Math.PI,heading))<
     Math.abs(angleDelta(routeHeading,heading))
   ){
     routeHeading+=Math.PI;
   }

   const hErr=
     angleDelta(routeHeading,heading);

   if(autopilot){
     heading+=
       hErr*dt*.55;

     if(nr.d>.55){
       const centerRate=.48;
       absX+=(nr.px-absX)*(1-Math.exp(-dt*centerRate));
       absZ+=(nr.pz-absZ)*(1-Math.exp(-dt*centerRate));
     }
   }else if(steeringNeutral){
     // Gentle heading correction begins immediately at neutral.
     // Position correction waits until the car drifts away from the center,
     // which avoids an artificial "rail" feeling.
     const speedAssist=
       Math.max(
         .22,
         Math.min(
           .60,
           .22+
           speedAbs/80
         )
       );

     heading+=
       hErr*dt*speedAssist;

     if(nr.d>.70){
       const drift=
         Math.max(
           0,
           Math.min(
             1,
             (nr.d-.70)/2.8
           )
         );

       const centerRate=
         .08+
         drift*.30;

       const centerAlpha=
         1-Math.exp(-dt*centerRate);

       absX+=(nr.px-absX)*centerAlpha;
       absZ+=(nr.pz-absZ)*centerAlpha;
     }
   }
 }

 absX+=Math.sin(heading)*speed*dt;
 absZ+=Math.cos(heading)*speed*dt;
 recenterIfNeeded(absX,absZ);
 const rx=absX-worldOffset.x,rz=absZ-worldOffset.z;

 // Hysteresis prevents rapid on/off flicker at the road edge:
 // enter at 8.5 m, remain attached until 11 m.
 if(nr){
   if(!roadContact && nr.d<8.5) roadContact=true;
   else if(roadContact && nr.d>11) roadContact=false;
 }else roadContact=false;

 let roadFrame=roadFrameAt(absX,absZ);
 if(roadContact && (!roadFrame || roadFrame.distance>18)){
   roadFrame=ensureRoadProfileNear(absX,absZ);
 }
 const onRoad=roadContact&&roadFrame&&roadFrame.distance<18;
 $('contactMode').textContent=onRoad?'Route':'Terrain';

 // Competitive run uses the same final Route/Terrain contact decision as HUD
 // and vehicle support, so penalties match what the player actually sees.
 updateRunChallenge(
   onRoad,
   nr
 );

 const terrainFrame=!onRoad?terrainFrameAt(absX,absZ,heading):null;

 // Off-road root height is terrain-driven. On-road height is solved later
 // from the four wheel contacts inside updateSuspensionVisuals().
 const centerRoadSurface=
   onRoad
     ?roadSurfaceAt(absX,absZ)
     :null;

 const baseGround=onRoad
   ?(centerRoadSurface?.y??roadFrame.y+ROAD_SURFACE_OFFSET)
   :(terrainFrame?terrainFrame.y:terrainAbs(absX,absZ));

 const targetY=
   baseGround+
   .38+
   (onRoad?TIRE_VISUAL_CLEARANCE:0);

 car.position.x=rx;
 car.position.z=rz;

 if(!onRoad){
   const yAlpha=
     1-Math.exp(-dt*10);

   car.position.y+=
     (targetY-car.position.y)*
     yAlpha;
 }
 // On-road Y is solved from the four wheel contacts.

 // Root vehicle stays yaw-aligned only. Wheel heights and the sprung body
 // handle suspension/pitch/roll independently.
 car.rotation.set(0,heading,0);
 vehiclePresentation.updateSuspensionVisuals(dt,onRoad,steerAngle);
 // Wheel rotation + visible front steering.
 // Steering pivot and wheel spin are now independent transforms.
 visualSteer+=(steerAngle-visualSteer)*(1-Math.exp(-dt*7));
 vehiclePresentation.updateWheels(dt,speed,visualSteer);

 skidMarks.updateLocal({
   contacts:vehiclePresentation.wheelContacts,
   onRoad,
   speed,
   steerAngle,
   lateralGripUsage,
   longitudinalAccel,
   handbrake:hand,
   vehicle:VEHICLE,
   dt
 });

 $('speed').textContent=Math.round(Math.abs(speed)*3.6);
 const llNow=xzToLL(absX,absZ),realElev=elevationService.elevationAt(llNow.lat,llNow.lon);
 altitudeEl.textContent=realElev!==null&&Number.isFinite(realElev)?Math.round(realElev):'—';
 const frameNow=roadFrameAt(absX,absZ);
 $('grade').textContent=frameNow?(Math.tan(frameNow.pitch)*100).toFixed(1):'0.0';
 if(nr){const pct=100*nr.cum/routeLength;$('progress').textContent=pct.toFixed(1);$('doneKm').textContent=(nr.cum/1000).toFixed(1);$('remainKm').textContent=((routeLength-nr.cum)/1000).toFixed(1);$('roadDist').textContent=Math.round(nr.d);updatePassedSignReadout(nr);drawMap(nr.cum)}
 // Streaming policy is centralized in world-streaming.js.
 worldStreaming.updateVisible(absX,absZ);
}

function toggleAssist(){
 if(autopilot){setAutopilot(false,'Pilote auto désactivé');}
 assist=!assist;
 $('assist').textContent='Assist: '+(assist?'ON':'OFF');
 toast('Assistance '+(assist?'activée':'désactivée'));
}

function placeAt(frac){const p=routePointAt(frac);absX=p.x;absZ=p.z;heading=p.angle;speed=0;steer=0;visualSteer=0;currentSteerAngle=0;longitudinalAccel=0;lateralGripUsage=0;vehiclePresentation.reset();skidMarks.resetSource('local');roadContact=true;recenterIfNeeded(absX,absZ,true);ensureRoadProfileNear(absX,absZ);const placedRoadSurface=roadSurfaceAt(absX,absZ);
car.position.set(
  0,
  (placedRoadSurface?.y??roadHeightAt(absX,absZ)+ROAD_SURFACE_OFFSET)+.38+TIRE_VISUAL_CLEARANCE,
  0
);drawMap(p.cum)}
function resetToRoad(){const n=nearestRoute(absX,absZ);if(n){absX=n.px;absZ=n.pz;heading=n.angle;speed=0;steer=0;visualSteer=0;currentSteerAngle=0;longitudinalAccel=0;lateralGripUsage=0;vehiclePresentation.reset();skidMarks.resetSource('local');roadContact=true;recenterIfNeeded(absX,absZ,true);ensureRoadProfileNear(absX,absZ)}}

const maxSpeedSlider=$('maxSpeedSlider'),maxSpeedLabel=$('maxSpeedLabel');
const speedLimitModeBtn=$('speedLimitModeBtn');

function updateSpeedLimitModeUI(){
  if(!speedLimitModeBtn)return;
  speedLimitModeBtn.textContent=
    'Limites route: '+(obeyRoadSpeedLimits?'ON':'OFF');
  speedLimitModeBtn.classList.toggle('active',obeyRoadSpeedLimits);
  speedLimitModeBtn.title=obeyRoadSpeedLimits
    ? 'Le pilote automatique respecte les limites OSM'
    : 'Le pilote automatique ignore les limites OSM';
}

function toggleRoadSpeedLimits(){
  obeyRoadSpeedLimits=!obeyRoadSpeedLimits;
  localStorage.setItem(
    'worlddrive_obey_speed_limits',
    obeyRoadSpeedLimits?'1':'0'
  );
  updateSpeedLimitModeUI();

  if(obeyRoadSpeedLimits&&activeRoadMeta.maxspeed){
    toast(`Limites route ON · ${Math.round(activeRoadMeta.maxspeed)} km/h`);
  }else{
    toast('Limites route '+(obeyRoadSpeedLimits?'ON':'OFF'));
  }
}

function vehicleTopSpeedKmh(){
  return Math.max(
    20,
    Number(VEHICLE.topSpeedKmh)||200
  );
}

function syncVehicleSpeedCapability({
  useVehicleMaximum=false
}={}){
  const top=
    vehicleTopSpeedKmh();

  maxSpeedSlider.max=
    String(top);

  if(useVehicleMaximum){
    maxSpeedSlider.value=
      String(top);
    setMaxSpeed(top);
  }else if(maxSpeedKmh>top){
    maxSpeedSlider.value=
      String(top);
    setMaxSpeed(top);
  }

  maxSpeedLabel.textContent=
    Math.round(maxSpeedKmh);
}

function setMaxSpeed(kmh){
  const vehicleTop=
    vehicleTopSpeedKmh();

  maxSpeedKmh=
    Math.max(
      20,
      Math.min(
        vehicleTop,
        Number(kmh)||100
      )
    );

  MAX=maxSpeedKmh/3.6;
  maxSpeedLabel.textContent=Math.round(maxSpeedKmh);
  // If the limit is reduced below current speed, taper immediately to new limit.
  if(speed>MAX)speed=MAX;
  toast(`Vitesse max: ${Math.round(maxSpeedKmh)} km/h`);
}
maxSpeedSlider.addEventListener('input',e=>setMaxSpeed(e.target.value));
if(speedLimitModeBtn)speedLimitModeBtn.onclick=toggleRoadSpeedLimits;
updateSpeedLimitModeUI();
syncVehicleSpeedCapability({
  useVehicleMaximum:true
});

const vehicleSelect=$('vehicleSelect');
if(vehicleSelect){
  vehicleSystem.populateSelect(vehicleSelect);

  vehicleSelect.addEventListener('change',event=>{
    const changed=vehicleSystem.select(event.target.value);

    if(changed){
      if(autopilot)setAutopilot(false,'Pilote auto désactivé');

      speed=0;
      steer=0;
      visualSteer=0;
      currentSteerAngle=0;
      longitudinalAccel=0;
      lateralGripUsage=0;

      vehicleVisuals.applyVehicleVisualProfile();
      vehicleAudio.setProfile(vehicleSystem.active.audio);

      // Each car exposes its own real top-speed capability.
      // Selecting a vehicle starts its speed limiter at that vehicle's maximum.
      syncVehicleSpeedCapability({
        useVehicleMaximum:true
      });

      toast(
        `Véhicule: ${vehicleSystem.active.name} · ${vehicleSystem.active.description}`
      );
    }
  });
}

$('autopilotBtn').onclick=toggleAutopilot;
$('assist').onclick=toggleAssist;$('camera').onclick=()=>cameraController.cycle();$('reset').onclick=resetToRoad;$('jump').oninput=e=>$('jumpPct').textContent=(+e.target.value).toFixed(1)+' %';$('jumpBtn').onclick=()=>placeAt(+$('jump').value/100);$('northBtn').onclick=()=>{$('jump').value=99.8;$('jumpPct').textContent='99.8 %';placeAt(.998)};





// ---------- human-friendly place search ----------
let selectedStart={...MANIC2};
let selectedEnd={...MANIC5};
function setSelectedPlace(which,p){
  if(which==='start'){
    selectedStart={lat:p.lat,lon:p.lon,name:p.name||$('startPlace').value};
    $('startLat').value=p.lat;$('startLon').value=p.lon;
    $('startPlace').value=p.name||$('startPlace').value;
    $('startSearchResults').classList.remove('open');
  }else{
    selectedEnd={lat:p.lat,lon:p.lon,name:p.name||$('endPlace').value};
    $('endLat').value=p.lat;$('endLon').value=p.lon;
    $('endPlace').value=p.name||$('endPlace').value;
    $('endSearchResults').classList.remove('open');
  }
}

function renderSearchResults(which,items){
  const box=$(which==='start'?'startSearchResults':'endSearchResults');
  box.innerHTML='';
  if(!items.length){
    const d=document.createElement('div');d.className='searchChoice';d.textContent='Aucun résultat';box.appendChild(d);
    box.classList.add('open');return;
  }
  for(const p of items){
    const b=document.createElement('button');b.className='searchChoice';
    b.innerHTML=`${p.name}<span class="searchMeta">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span>`;
    b.onclick=()=>setSelectedPlace(which,p);
    box.appendChild(b);
  }
  box.classList.add('open');
}

async function searchPlaceField(which){
  const input=$(which==='start'?'startPlace':'endPlace');
  const btn=$(which==='start'?'findStartBtn':'findEndBtn');
  const old=btn.textContent;btn.textContent='…';btn.disabled=true;
  try{
    const items=await geocodingService.search(input.value,5);
    renderSearchResults(which,items);
  }catch(e){
    console.warn(e);toast('Recherche de lieu indisponible');
  }finally{btn.textContent=old;btn.disabled=false}
}

$('findStartBtn').onclick=()=>searchPlaceField('start');
$('findEndBtn').onclick=()=>searchPlaceField('end');
$('startPlace').addEventListener('keydown',e=>{if(e.key==='Enter')searchPlaceField('start')});
$('endPlace').addEventListener('keydown',e=>{if(e.key==='Enter')searchPlaceField('end')});

// ---------- route planner ----------
$('buildRouteBtn').addEventListener('click',async()=>{
  const btn=$('buildRouteBtn'),old=btn.textContent;btn.textContent='Préparation…';btn.disabled=true;
  try{
    // If the user edited text without clicking Search, resolve it automatically.
    const startText=$('startPlace').value.trim();
    const endText=$('endPlace').value.trim();

    if(startText && startText!==selectedStart.name){
      const r=await geocodingService.search(startText,1);
      if(!r[0]){toast('Départ introuvable');return}
      setSelectedPlace('start',{...r[0],name:startText});
    }
    if(endText && endText!==selectedEnd.name){
      const r=await geocodingService.search(endText,1);
      if(!r[0]){toast('Destination introuvable');return}
      setSelectedPlace('end',{...r[0],name:endText});
    }

    const waypoints=await geocodingService.resolveWaypointLines($('waypointsInput').value);
    createRequestedRoute({...selectedStart},{...selectedEnd},waypoints);
  }catch(e){
    console.error(e);toast('Impossible de préparer le trajet');
  }finally{btn.textContent=old;btn.disabled=false}
});
function applyPreset(start,end){
  $('waypointsInput').value='';
  selectedStart={...start};selectedEnd={...end};
  $('startPlace').value=start.name;$('endPlace').value=end.name;
  $('startLat').value=start.lat;$('startLon').value=start.lon;
  $('endLat').value=end.lat;$('endLon').value=end.lon;
  createRequestedRoute({...start},{...end});
}
$('preset389Btn').addEventListener('click',()=>applyPreset(MANIC2,MANIC5));
$('preset169Btn').addEventListener('click',()=>applyPreset(R169_START,R169_END));
$('preset132Btn').addEventListener('click',()=>applyPreset(R132_START,R132_END));


document.querySelectorAll('.sectionHead').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const section=document.getElementById(btn.dataset.section);
    section.classList.toggle('collapsed');
    btn.lastElementChild.textContent=section.classList.contains('collapsed')?'+':'−';
  });
});

// ---------- collapsible panels ----------
const hudPanel=$('hud'),hudToggle=$('hudToggle'),mapPanel=$('mapbox'),mapToggle=$('mapToggle');

function setCollapsed(panel,button,collapsed,label){
  panel.classList.toggle('collapsed',collapsed);
  button.textContent=collapsed?'+':'−';
  button.title=collapsed?`Restaurer ${label}`:`Minimiser ${label}`;
  button.setAttribute('aria-label',button.title);
  if(label==='la carte'&&!collapsed)requestAnimationFrame(()=>drawMap());
}
hudToggle.addEventListener('click',()=>setCollapsed(hudPanel,hudToggle,!hudPanel.classList.contains('collapsed'),'les détails'));
mapToggle.addEventListener('click',()=>setCollapsed(mapPanel,mapToggle,!mapPanel.classList.contains('collapsed'),'la carte'));

// ---------- commands panel / alternate speedometer ----------
const helpPanel=$('help');
const helpToggle=$('helpToggle');
const speedometerDock=$('speedometerDock');
const showControlsBtn=$('showControlsBtn');
const speedometerCanvas=$('speedometerCanvas');
const speedometerCtx=speedometerCanvas?.getContext('2d');

function setGameControlsHidden(hidden){
  helpPanel?.classList.toggle('hiddenControls',hidden);
  speedometerDock?.classList.toggle('visible',hidden);
  speedometerDock?.setAttribute(
    'aria-hidden',
    hidden?'false':'true'
  );

  localStorage.setItem(
    'worlddrive_hide_controls',
    hidden?'1':'0'
  );

  if(!hidden){
    helpToggle.textContent='−';
    helpToggle.title='Masquer les commandes';
    helpToggle.setAttribute(
      'aria-label',
      helpToggle.title
    );
  }else{
    requestAnimationFrame(drawSpeedometer);
  }
}

helpToggle?.addEventListener(
  'click',
  ()=>setGameControlsHidden(true)
);

showControlsBtn?.addEventListener(
  'click',
  ()=>setGameControlsHidden(false)
);

function drawSpeedometer(){
  if(
    !speedometerCtx||
    !speedometerDock?.classList.contains('visible')
  ){
    return;
  }

  const canvas=speedometerCanvas;
  const dpr=devicePixelRatio||1;
  const cssSize=190;
  const px=Math.round(cssSize*dpr);

  if(canvas.width!==px||canvas.height!==px){
    canvas.width=px;
    canvas.height=px;
  }

  const ctx=speedometerCtx;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssSize,cssSize);

  const cx=cssSize/2;
  const cy=cssSize/2;
  const radius=88;

  const start=Math.PI*.75;
  const sweep=Math.PI*1.50;

  // Panel / bezel.
  const bg=ctx.createRadialGradient(
    cx,cy,20,
    cx,cy,radius
  );
  bg.addColorStop(0,'rgba(16,29,43,.94)');
  bg.addColorStop(1,'rgba(3,9,16,.94)');

  ctx.fillStyle=bg;
  ctx.beginPath();
  ctx.arc(cx,cy,radius,0,Math.PI*2);
  ctx.fill();

  ctx.strokeStyle='rgba(255,255,255,.18)';
  ctx.lineWidth=2;
  ctx.stroke();

  const dialMax=Math.max(
    200,
    Math.ceil(maxSpeedKmh/20)*20
  );

  // Tick marks.
  for(let value=0;value<=dialMax;value+=10){
    const ratio=value/dialMax;
    const angle=start+sweep*ratio;

    const major=value%20===0;
    const r1=major?68:73;
    const r2=82;

    ctx.strokeStyle=
      major
        ?'rgba(235,244,255,.82)'
        :'rgba(180,197,215,.42)';

    ctx.lineWidth=major?2:1;

    ctx.beginPath();
    ctx.moveTo(
      cx+Math.cos(angle)*r1,
      cy+Math.sin(angle)*r1
    );
    ctx.lineTo(
      cx+Math.cos(angle)*r2,
      cy+Math.sin(angle)*r2
    );
    ctx.stroke();

    if(major){
      ctx.fillStyle='rgba(220,232,244,.78)';
      ctx.font='10px Inter,system-ui,sans-serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';

      ctx.fillText(
        String(value),
        cx+Math.cos(angle)*56,
        cy+Math.sin(angle)*56
      );
    }
  }

  const kmh=Math.abs(speed)*3.6;
  const needleRatio=Math.max(
    0,
    Math.min(1,kmh/dialMax)
  );
  const needleAngle=start+sweep*needleRatio;

  // Needle.
  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(needleAngle);

  ctx.strokeStyle='#ff4f59';
  ctx.lineWidth=3;
  ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(-10,0);
  ctx.lineTo(67,0);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle='#ff4f59';
  ctx.beginPath();
  ctx.arc(cx,cy,5,0,Math.PI*2);
  ctx.fill();

  // Digital readout.
  ctx.textAlign='center';
  ctx.fillStyle='#ffffff';
  ctx.font='700 29px Inter,system-ui,sans-serif';
  ctx.fillText(
    String(Math.round(kmh)),
    cx,
    cy+30
  );

  ctx.fillStyle='rgba(190,210,228,.82)';
  ctx.font='700 10px Inter,system-ui,sans-serif';
  ctx.fillText(
    'KM/H',
    cx,
    cy+46
  );
}

setGameControlsHidden(
  localStorage.getItem('worlddrive_hide_controls')==='1'
);

// ---------- compass ----------
const compassCanvas=$('compass'),compassCtx=compassCanvas.getContext('2d'),compassHeading=$('compassHeading');

function headingDeg(){
  // World coordinates use +X = east and +Z = south because llToXZ()
  // negates latitude. Vehicle heading 0 therefore points SOUTH, not north.
  // Convert the simulation yaw into a conventional compass bearing:
  //   heading 0      -> 180° (S)
  //   heading +90°   ->  90° (E)
  //   heading 180°   ->   0° (N)
  //   heading -90°   -> 270° (W)
  let d=(180-heading*180/Math.PI)%360;
  if(d<0)d+=360;
  return d;
}
function cardinalLabel(d){
  const labels=['N','NE','E','SE','S','SO','O','NO'];
  return labels[Math.round(d/45)%8];
}
function drawCompass(){
  const dpr=devicePixelRatio||1,w=compassCanvas.clientWidth,h=compassCanvas.clientHeight;
  const W=Math.round(w*dpr),H=Math.round(h*dpr);
  if(compassCanvas.width!==W||compassCanvas.height!==H){compassCanvas.width=W;compassCanvas.height=H}
  compassCtx.setTransform(dpr,0,0,dpr,0,0);
  compassCtx.clearRect(0,0,w,h);

  const hd=headingDeg();
  const pxPerDeg=w/120; // show ~120 degrees across the strip
  const center=w/2;

  // subtle center line
  compassCtx.strokeStyle='rgba(255,255,255,.16)';
  compassCtx.lineWidth=1;
  compassCtx.beginPath();
  compassCtx.moveTo(center,10);compassCtx.lineTo(center,h-8);compassCtx.stroke();

  // ticks every 5 degrees, labels every 45
  const start=Math.floor((hd-70)/5)*5;
  const end=Math.ceil((hd+70)/5)*5;
  for(let deg=start;deg<=end;deg+=5){
    let norm=((deg%360)+360)%360;
    let delta=((deg-hd+540)%360)-180;
    const x=center+delta*pxPerDeg;
    if(x<-20||x>w+20)continue;

    const major=(norm%45===0);
    const mid=(norm%15===0);
    const tickH=major?16:mid?10:6;
    compassCtx.strokeStyle=major?'rgba(255,255,255,.95)':mid?'rgba(255,255,255,.5)':'rgba(255,255,255,.28)';
    compassCtx.lineWidth=major?2:1;
    compassCtx.beginPath();
    compassCtx.moveTo(x,12);compassCtx.lineTo(x,12+tickH);compassCtx.stroke();

    if(major){
      const txt=cardinalLabel(norm);
      compassCtx.font='700 12px system-ui';
      compassCtx.textAlign='center';
      compassCtx.textBaseline='top';
      compassCtx.fillStyle=(txt==='N')?'#ff6767':'#e4edf6';
      compassCtx.fillText(txt,x,31);
    }
  }
  compassHeading.textContent=`${cardinalLabel(hd)} · ${String(Math.round(hd)%360).padStart(3,'0')}°`;
}

// ---------- transient sign readout on minimap ----------
const signReadout={key:null,text:'',startedAt:0,duration:5000,fadeMs:1100};
const passedSignKeys=new Set();
function signDisplayCum(f){
  if(!f)return 0;
  if(f.kind==='river')return Math.max(0,f.routeCum-22);
  if(f.kind==='city')return Math.max(0,f.routeCum-55);
  return f.routeCum;
}
function signReadoutText(f){
  if(!f)return '';
  if(f.kind==='speed')return String(Math.round(f.maxspeed||Number(f.label)||0));
  return String(f.label||'');
}
function updatePassedSignReadout(nr){
  if(!nr||!geographicSigns.length)return;
  let best=null,bestDelta=Infinity;
  for(const f of geographicSigns){
    if(!f?.key||passedSignKeys.has(f.key))continue;
    const d=Math.abs(signDisplayCum(f)-nr.cum);
    if(d<=14 && d<bestDelta){best=f;bestDelta=d}
  }
  if(best){
    passedSignKeys.add(best.key);
    signReadout.key=best.key;
    signReadout.text=signReadoutText(best);
    signReadout.startedAt=performance.now();
  }
  // If the player resets far enough back, allow signs to be read again.
  for(const f of geographicSigns){
    if(passedSignKeys.has(f.key) && signDisplayCum(f)-nr.cum>80)passedSignKeys.delete(f.key);
  }
}

// ---------- minimap ----------
const mc=$('minimap'),mctx=mc.getContext('2d');
let bounds=null;
function prepMap(){let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;for(const p of route){minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z)}bounds={minx,maxx,minz,maxz}}
function drawMap(cum=0){if(!bounds)return;const dpr=devicePixelRatio||1,w=mc.clientWidth,h=mc.clientHeight;if(mc.width!==Math.round(w*dpr)||mc.height!==Math.round(h*dpr)){mc.width=Math.round(w*dpr);mc.height=Math.round(h*dpr)}mctx.setTransform(dpr,0,0,dpr,0,0);mctx.clearRect(0,0,w,h);mctx.fillStyle='#0a1725';mctx.fillRect(0,0,w,h);const pad=18,sx=(w-2*pad)/(bounds.maxx-bounds.minx),sz=(h-2*pad)/(bounds.maxz-bounds.minz),sc=Math.min(sx,sz),X=x=>pad+(x-bounds.minx)*sc,Z=z=>pad+(z-bounds.minz)*sc;
 mctx.strokeStyle='#89a3ba';mctx.lineWidth=3;mctx.beginPath();route.forEach((p,i)=>i?mctx.lineTo(X(p.x),Z(p.z)):mctx.moveTo(X(p.x),Z(p.z)));mctx.stroke();

 // Fixed endpoint markers: green = Manic-2 start, white = Manic-5 destination.
 if(route.length){
   const a=route[0],b=route[route.length-1];
   mctx.fillStyle='#56e37a';mctx.beginPath();mctx.arc(X(a.x),Z(a.z),4,0,Math.PI*2);mctx.fill();
   mctx.fillStyle='#f2f5f8';mctx.beginPath();mctx.arc(X(b.x),Z(b.z),4,0,Math.PI*2);mctx.fill();
 }
 // Red dot = current vehicle position/progress.
 const p=routePointAt(cum/routeLength),carMapX=X(p.x),carMapZ=Z(p.z);mctx.fillStyle='#ff4949';mctx.beginPath();mctx.arc(carMapX,carMapZ,5,0,Math.PI*2);mctx.fill();

 // V18A: connected LAN peers appear directly from their geographic position.
 for(const peer of multiplayer.getPeers()){
   const remote=llToXZ(peer.lat,peer.lon);
   if(
     remote.x<bounds.minx||remote.x>bounds.maxx||
     remote.z<bounds.minz||remote.z>bounds.maxz
   )continue;

   const px=X(remote.x),pz=Z(remote.z);
   mctx.fillStyle='#48d9ff';
   mctx.beginPath();
   mctx.arc(px,pz,4.5,0,Math.PI*2);
   mctx.fill();

   mctx.font='700 9px system-ui';
   mctx.textAlign='left';
   mctx.textBaseline='bottom';
   mctx.fillStyle='#bdefff';
   mctx.fillText(peer.name,px+7,pz-4);
 }

 // When a road sign is crossed, briefly repeat its text beside the vehicle marker.
 if(signReadout.text&&signReadout.startedAt){
   const age=performance.now()-signReadout.startedAt;
   if(age<signReadout.duration){
     const fadeStart=signReadout.duration-signReadout.fadeMs;
     const alpha=age<=fadeStart?1:Math.max(0,1-(age-fadeStart)/signReadout.fadeMs);
     mctx.save();mctx.globalAlpha=alpha;mctx.font='700 12px system-ui';mctx.textBaseline='middle';
     const text=signReadout.text,padX=8,boxH=24,boxW=Math.ceil(mctx.measureText(text).width)+padX*2;
     let bx=carMapX+12,by=carMapZ-boxH-7;
     if(bx+boxW>w-5)bx=carMapX-boxW-12;
     if(by<5)by=carMapZ+9;
     mctx.fillStyle='rgba(7,18,30,.94)';mctx.strokeStyle='rgba(235,244,252,.72)';mctx.lineWidth=1;
     mctx.beginPath();mctx.roundRect(bx,by,boxW,boxH,6);mctx.fill();mctx.stroke();
     mctx.fillStyle='#f6fbff';mctx.textAlign='left';mctx.fillText(text,bx+padX,by+boxH/2);
     mctx.restore();
   }else{signReadout.key=null;signReadout.text='';signReadout.startedAt=0}
 }
 // Endpoint labels are anchored to the actual route geometry.
 const startPt=route[0], endPt=route[route.length-1];
 if(startPt&&endPt){
   const sxp=X(startPt.x), szp=Z(startPt.z), exp=X(endPt.x), ezp=Z(endPt.z);
   mctx.font='700 11px system-ui';
   mctx.textBaseline='middle';

   mctx.fillStyle='#7dff9a';
   mctx.textAlign=sxp < w/2 ? 'left' : 'right';
   mctx.fillText(ROUTE_START.name||'Départ', sxp + (sxp < w/2 ? 8 : -8), szp);

   mctx.fillStyle='#f0f4f8';
   mctx.textAlign=exp < w/2 ? 'left' : 'right';
   mctx.fillText(ROUTE_END.name||'Arrivée', exp + (exp < w/2 ? 8 : -8), ezp);
 }
}


// ---------- directional world prefetch ----------
// ---------- unified world streaming ----------
const worldStreaming=createWorldStreaming({
  toLatLon:(x,z)=>xzToLL(x,z),
  nearestRoute:(x,z)=>nearestRoute(x,z),
  routePointAtCum:cum=>routePointAtCum(cum),
  routePointAtFraction:f=>routePointAt(f),
  getRouteLength:()=>routeLength,

  elevation:{
    get center(){return elevationService.center},
    get loading(){return elevationService.loading},
    load:(x,z)=>loadElevationAround(x,z),
    prefetch:(x,z)=>elevationService.prefetchAt(x,z)
  },

  water:{
    get center(){return waterData.center},
    get loading(){return waterData.loading},
    get generation(){return waterData.generation},
    load:(x,z)=>loadWaterAround(x,z),
    prefetch:(x,z,timeoutMs)=>waterData.prefetchAt(x,z,timeoutMs)
  },

  scenery:{
    get center(){return sceneryData.center},
    get loading(){return sceneryData.loading},
    load:(x,z)=>loadSceneryAround(x,z),
    query:ll=>sceneryData.query(ll)
  },

  imagery:{
    get center(){return imageryService.center},
    get loading(){return imageryService.loading},
    load:(x,z)=>buildImageryMosaic(x,z),
    prefetch:(x,z)=>imageryService.prefetchAt(x,z)
  },

  roadMetadata:{
    get center(){return lastRoadMetaCenter},
    get loading(){return roadMetaLoading},
    load:(x,z)=>loadRoadMetadataAround(x,z)
  },

  signs:{
    get center(){return signData.center},
    get loading(){return signData.loading},
    load:(x,z)=>loadGeographicSignsAround(x,z),
    query:ll=>signData.query(ll)
  },

  fetchCached:(namespace,ll,query,timeoutMs,ttlMs)=>
    fetchOverpassCached(namespace,ll,query,timeoutMs,ttlMs)
});

// ---------- V5 time-of-day prototype ----------
const timeSlider=$('timeSlider'),timeLabel=$('timeLabel');
let timeOfDay=12;
function setTimeOfDay(hour){
  timeOfDay=((Number(hour)%24)+24)%24;
  const hh=Math.floor(timeOfDay),mm=Math.round((timeOfDay-hh)*60)%60;
  timeLabel.textContent=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');

  const daylight=Math.max(0,Math.sin((timeOfDay-6)/12*Math.PI));

  // Smoothly bring moonlight in through dusk and remove it through dawn.
  // This keeps the transition compatible with the existing automatic lights.
  const nightFactor=
    1-Math.min(
      1,
      daylight/.24
    );

  scene.background=
    new THREE.Color().setHSL(
      .58,
      .45,
      .08+.50*daylight
    );

  scene.fog.color.copy(
    scene.background
  );

  hemi.intensity=
    .10+
    2.05*daylight;

  sun.intensity=
    .03+
    2.55*daylight;

  // A little directional blue moonlight makes body panels readable without
  // flattening the night scene. No moon shadows: cheap enough for multiplayer.
  moonLight.intensity=
    .22*
    nightFactor;

  moonMaterial.opacity=
    .92*
    nightFactor;

  moonSprite.visible=
    nightFactor>.02;

  vehicleVisuals.updateAutomaticHeadlights(daylight);

  const a=(timeOfDay-6)/12*Math.PI;

  sun.position.set(
    Math.cos(a)*900,
    Math.max(
      35,
      Math.sin(a)*950
    ),
    420
  );

  // Move the crescent through a simple east-to-west night arc.
  const nightHour=
    timeOfDay>=18
      ?timeOfDay-18
      :timeOfDay+6;

  const moonArc=
    Math.max(
      0,
      Math.min(
        12,
        nightHour
      )
    )/
    12*
    Math.PI;

  moonDirection.set(
    Math.cos(moonArc)*.72,
    .18+Math.sin(moonArc)*.82,
    -.58
  ).normalize();

  updateMoonSkyPosition();
}
timeSlider.addEventListener('input',e=>setTimeOfDay(e.target.value));

$('clearHydroCacheBtn').addEventListener('click',async()=>{
  try{
    await OsmCache.clear();
    await updateHydroCacheHUD();
    toast('Cache OSM IndexedDB vidé');
  }catch(e){console.warn(e);toast('Impossible de vider le cache')}
});

setTimeOfDay(12);

// ---------- main ----------
let nextDirectionalPrefetchAt=0;

function animate(now){
 requestAnimationFrame(animate);
 const dt=Math.min(.033,(now-last)/1000||.016);last=now;
 try{
   gamepad.update();
   updateDrive(dt);
   vehiclePresentation.updateContactShadow();
   multiplayer.update(dt);

   try{vehicleAudio.update()}catch(audioErr){
     console.warn('Audio frame error',audioErr);
     vehicleAudio.showError();
   }
   cameraController.update(dt);
   updateMoonSkyPosition();

   if(now>=nextDirectionalPrefetchAt){
     nextDirectionalPrefetchAt=now+100;
     worldStreaming.prefetchDirectional(absX,absZ);
   }

   waterTex.offset.x=(waterTex.offset.x+dt*.003)%1;
   waterTex.offset.y=(waterTex.offset.y+dt*.0015)%1;
   drawCompass();
   drawSpeedometer();
   renderer.render(scene,camera);
 }catch(e){
   console.error('Frame error:',e);
   statusEl.textContent='Erreur moteur 3D: '+(e?.message||e);
 }
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);drawMap();drawCompass();drawSpeedometer()});

(async()=>{
 // Start the renderer first. Network/routing is now an independent startup step.
 requestAnimationFrame(t=>{last=t;animate(t)});
 try{
   await createRequestedRoute({...MANIC2},{...MANIC5});
 }catch(e){
   console.error('Startup error',e);
   loading.classList.add('hidden');
   routingStatus.textContent='Erreur';
   statusEl.textContent='Erreur de démarrage — utilise Preset 389 ou Créer le trajet';
 }
})();
