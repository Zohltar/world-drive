import * as THREE from 'three';
import './v21-ui.css';
import './desktop-overpass-transport.js';
import {
  MANIC2,
  MANIC5,
  R169_START,
  R169_END,
  R132_START,
  R132_END,
  YUNGAS_START,
  YUNGAS_END,
  YUNGAS_WAYPOINTS
} from './route-presets.js';
import { createRouteChallenge } from './route-challenge.js';
import { createInstrumentCluster } from './instrument-cluster.js';
import { createMinimapSystem } from './minimap.js';
import { createRoadFurnitureSystem } from './road-furniture.js';
import { createRoadGeometrySystem } from './road-geometry.js';
import { createStartupUi } from './startup-ui.js';
import { createV21MenuSystem } from './v21-menu.js';
import {
  WORLD_DRIVE_VERSION,
  WORLD_DRIVE_VERSION_LABEL,
  WORLD_DRIVE_TITLE
} from './version.js';
import { createVehicleAudio, computeTransmissionState, computeGearRedlineSpeeds } from './audio.js';
import { createGamepadController } from './gamepad.js';
import { createKeyboardControls } from './keyboard-controls.js';
import { createCameraController } from './camera.js';
import { createRoutingGeometry, angleDelta, nearestPointOnPolyline } from './routing.js';
import { createRoutingService } from './routing-service.js';
import { createGeocodingService, validLatLon } from './geocoding.js';
import {
  WorldCache,
  OsmCache,
  WorldSettings,
  DEFAULT_WORLD_SETTINGS,
  getWorldCacheStats,
  clearWorldDriveCache
} from './cache.js';
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
import { createStreamingCoordinator } from './streaming-coordinator.js';
import { createVehicleSystem } from './vehicle-system.js';
import { createMultiplayerClient } from './multiplayer.js';
import { createVehicleVisualSystem } from './vehicle-visuals.js';
import { createTruckTrailerSystem } from './truck-trailer.js';
import { createCountachGlbSystem } from './countach-glb.js';
import { createId4GlbSystem } from './id4-glb.js';
import { createWrxGlbSystem } from './wrx-glb.js';
import { createCivicGlbSystem } from './civic-glb.js';
import { createSonataGlbSystem } from './sonata-glb.js';
import { createF1GlbSystem } from './f1-glb.js';
import { createI3GlbSystem } from './i3-glb.js';
import { createMultiplayerVisualSystem } from './multiplayer-visuals.js';
import { createVehiclePresentation } from './vehicle-presentation.js';
import { createSkidMarkSystem } from './skidmarks.js';
import {
  clampDynamics as physicsClamp,
  smoothstep01 as physicsSmoothstep01,
  computeGradeAcceleration,
  longitudinalTractionLimit,
  steeringCommand,
  advanceSteeringRack,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage,
  yawResponseRate,
  limitMomentumHeadingDelta,
  laneKeepAssistCommand
} from './vehicle-dynamics.js';




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

// V21.21.5 vehicle-local route lookup. The general nearestRoute() remains
// untouched for OSM/sign/metadata projections, but the driving loop exploits
// temporal locality: between frames the car can only move a few route segments.
// A bounded local scan avoids walking the entire route polyline every frame.
let vehicleNearestHint=-1;
let vehicleNearestLastX=Infinity;
let vehicleNearestLastZ=Infinity;
const vehicleNearestScratch={};
function nearestRouteForVehicle(x,z){
  const count=segments.length;
  if(!count)return null;

  const movedSq=(x-vehicleNearestLastX)**2+(z-vehicleNearestLastZ)**2;
  const hintValid=vehicleNearestHint>=0&&vehicleNearestHint<count&&movedSq<120*120;
  if(!hintValid){
    const full=nearestRoute(x,z);
    if(full&&Number.isInteger(full.i))vehicleNearestHint=full.i;
    vehicleNearestLastX=x;vehicleNearestLastZ=z;
    return full;
  }

  const first=Math.max(0,vehicleNearestHint-40);
  const last=Math.min(count-1,vehicleNearestHint+40);
  let bd=Infinity,bestI=-1,bestT=0,bestPx=0,bestPz=0;
  for(let i=first;i<=last;i++){
    const seg=segments[i];
    const vx=seg.bx-seg.ax,vz=seg.bz-seg.az,wx=x-seg.ax,wz=z-seg.az;
    const vv=vx*vx+vz*vz||1;
    const t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
    const px=seg.ax+t*vx,pz=seg.az+t*vz,dx=x-px,dz=z-pz,d2=dx*dx+dz*dz;
    if(d2<bd){bd=d2;bestI=i;bestT=t;bestPx=px;bestPz=pz;}
  }

  // Far from the hinted corridor, fall back to the exact global lookup. This
  // handles teleports and deliberate off-road shortcuts cleanly.
  if(bestI<0||bd>20*20){
    const full=nearestRoute(x,z);
    if(full&&Number.isInteger(full.i))vehicleNearestHint=full.i;
    vehicleNearestLastX=x;vehicleNearestLastZ=z;
    return full;
  }

  const seg=segments[bestI];
  const out=vehicleNearestScratch;
  out.i=bestI;out.t=bestT;out.px=bestPx;out.pz=bestPz;out.d=Math.sqrt(bd);
  out.angle=Math.atan2(seg.bx-seg.ax,seg.bz-seg.az);
  out.cum=seg.cum+bestT*seg.len;
  out.ax=seg.ax;out.az=seg.az;out.bx=seg.bx;out.bz=seg.bz;out.len=seg.len;
  vehicleNearestHint=bestI;
  vehicleNearestLastX=x;vehicleNearestLastZ=z;
  return out;
}

const routePointAt=frac=>routingGeometry.routePointAt(frac);
const routePointAtCum=cum=>routingGeometry.routePointAtCum(cum);

const $=id=>document.getElementById(id);
const loading=$('loading'),loadingText=$('loadingText'),statusEl=$('status'),notice=$('notice'),routingStatus=$('routingStatus');

// ---------- V21 application settings / startup state ----------
let appSettings=
  JSON.parse(
    JSON.stringify(
      DEFAULT_WORLD_SETTINGS
    )
  );

let settingsLoaded=false;
let settingsSaveTimer=null;
let gameStarted=false;
let v21MenuOpen=false;
let keyboardRebindAction=null;
let v21MenuSystem=null;

function queueSettingsSave(){
  if(!settingsLoaded)return;

  clearTimeout(settingsSaveTimer);

  settingsSaveTimer=setTimeout(
    ()=>{
      WorldSettings
        .save(appSettings)
        .catch(error=>
          console.warn(
            'Settings save failed',
            error
          )
        );
    },
    120
  );
}

function cloneDefaultControls(){
  return JSON.parse(
    JSON.stringify(
      DEFAULT_WORLD_SETTINGS.controls
    )
  );
}

// ---------- startup UI ----------
const startupUi=createStartupUi({
  versionLabel:WORLD_DRIVE_VERSION_LABEL,
  title:WORLD_DRIVE_TITLE,
  loading,
  getRouteSummary:()=>({start:ROUTE_START.name,end:ROUTE_END.name}),
  getVehicles:()=>vehicleSystem.list(),
  onStartVehicle:async vehicleId=>{
    applyVehicleSelection(vehicleId,{announce:false});
    transmissionMode=
      appSettings.transmissionMode==='manual'
        ?'manual'
        :'automatic';
    if(transmissionModeSelect)transmissionModeSelect.value=transmissionMode;
    try{
      await vehicleAudio.setEnabled(!!appSettings.audioEnabled);
    }catch(error){
      console.warn('Default audio activation failed',error);
    }
    gameStarted=true;
    showV21MenuButton();
    $('speedometerDock')?.classList.add('visible');
    syncV21RuntimeControls();
    syncV21VehicleInfo();
    toast(`Bonne route · ${vehicleSystem.active.name}`);
    return true;
  }
});
startupUi.install();
const setV21BootProgress=(...args)=>startupUi.setProgress(...args);
const showV21VehicleChooser=()=>startupUi.showVehicleChooser();

// ---------- competitive route challenge ----------
const routeChallenge=createRouteChallenge({
  getSpeed:()=>speed,
  getRouteLength:()=>routeLength,
  toast
});
const resetRunChallenge=()=>routeChallenge.reset();
const updateRunChallenge=(onRoad,nr)=>routeChallenge.update(onRoad,nr);

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
// V21.21.21: stencil is required for road-over-hydro pixel ownership.
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.35));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;$('app').appendChild(renderer.domElement);

// V21.21.21 balanced-quality frame-pacing governor (MSAA + modest supersampling, no FXAA).
// Keep the simulation model unchanged; only expensive visual refresh work is
// reduced when the measured frame rate is low.
// Full directional shadow maps are disabled in the 60-FPS performance path.
// The projected vehicle contact shadow remains active and much cheaper.
renderer.shadowMap.autoUpdate=false;

const fpsHud=document.createElement('div');
fpsHud.id='fpsHud';
fpsHud.textContent='FPS --';
Object.assign(fpsHud.style,{
  position:'fixed',
  left:'12px',
  bottom:'12px',
  zIndex:'10050',
  padding:'5px 8px',
  borderRadius:'7px',
  background:'rgba(5,10,16,.72)',
  border:'1px solid rgba(255,255,255,.16)',
  color:'#f4f7fa',
  font:'700 12px/1.2 system-ui, sans-serif',
  letterSpacing:'.03em',
  pointerEvents:'none',
  userSelect:'none'
});
document.body.appendChild(fpsHud);

const perfGovernor={
  level:0,
  fps:60,
  hasSample:false,
  frames:0,
  sampleStart:performance.now(),
  nextAdjustAt:0,
  nextShadowProjectionAt:0,
  nextShadowMapAt:0,
  nextMoonAt:0,
  simMs:0,
  renderSubmitMs:0,
  nextPerfLogAt:0
};

// ---------- streamed-world coordinator facade ----------
let streamingCoordinator=null;
function markStreamWorldRefresh(reason='stream'){return streamingCoordinator?.markWorldRefresh(reason);}
function scheduleVisualJob(key,job,timeout=180){return streamingCoordinator?.scheduleVisualJob(key,job,timeout);}
function cancelVisualJob(key){return streamingCoordinator?.cancelVisualJob(key);}
function commitLocalWorldRefresh(){return streamingCoordinator?.commitWorldRefresh();}
function scheduleLocalWorldRefresh(options={}){return streamingCoordinator?.scheduleWorldRefresh(options);}
function recenterIfNeeded(absx,absz,force=false){return streamingCoordinator?.recenterIfNeeded(absx,absz,force)??false;}

function markStaticShadowsDirty(){
  if(renderer.shadowMap.enabled){
    renderer.shadowMap.needsUpdate=true;
  }
}

function performanceIntervals(){
  if(perfGovernor.level>=3)return {shadowProjection:260,shadowMap:1400,moon:800};
  if(perfGovernor.level===2)return {shadowProjection:220,shadowMap:1100,moon:650};
  if(perfGovernor.level===1)return {shadowProjection:170,shadowMap:850,moon:500};
  return {shadowProjection:120,shadowMap:500,moon:400};
}

function applyPerformanceLevel(level){
  const next=Math.max(0,Math.min(3,Math.round(level)||0));
  const changed=next!==perfGovernor.level;
  perfGovernor.level=next;

  // V21.21.21 keeps MSAA and raises the internal render scale slightly at every
  // governor level. This improves lane-line edge quality without returning to
  // the expensive post-process AA experiment from V21.21.6.
  const ratioCap=next>=3?.76:(next===2?.84:(next===1?.96:1.08));
  const targetRatio=Math.min(devicePixelRatio||1,ratioCap);
  if(Math.abs(renderer.getPixelRatio()-targetRatio)>.01){
    renderer.setPixelRatio(targetRatio);
    renderer.setSize(innerWidth,innerHeight,false);
  }

  const wantFullShadows=next<2;
  if(renderer.shadowMap.enabled!==wantFullShadows){
    renderer.shadowMap.enabled=wantFullShadows;
    renderer.shadowMap.needsUpdate=wantFullShadows;
  }

  if(changed){
    perfGovernor.nextShadowProjectionAt=0;
    perfGovernor.nextShadowMapAt=0;
  }
}

function updateFpsAndGovernor(now){
  perfGovernor.frames++;
  const elapsed=now-perfGovernor.sampleStart;
  if(elapsed<500)return;

  const measured=perfGovernor.frames*1000/Math.max(1,elapsed);
  perfGovernor.fps=perfGovernor.hasSample
    ?perfGovernor.fps*.55+measured*.45
    :measured;
  perfGovernor.hasSample=true;
  fpsHud.textContent=`FPS ${Math.round(perfGovernor.fps)}`;
  perfGovernor.frames=0;
  perfGovernor.sampleStart=now;

  if(now<perfGovernor.nextAdjustAt)return;
  perfGovernor.nextAdjustAt=now+2500;

  // 60 FPS remains the target; V21.21.9 keeps V21.21.7 image quality while reducing CPU spikes while preserving MSAA, view distance and scene detail.
  // Shadows are disabled before the renderer reaches the lower resolution steps.
  if(perfGovernor.fps<43){
    applyPerformanceLevel(3);
  }else if(perfGovernor.fps<52){
    applyPerformanceLevel(Math.max(2,perfGovernor.level));
  }else if(perfGovernor.fps<59){
    applyPerformanceLevel(Math.max(1,perfGovernor.level));
  }else if(perfGovernor.fps>66){
    applyPerformanceLevel(0);
  }else if(perfGovernor.fps>62&&perfGovernor.level>0){
    applyPerformanceLevel(perfGovernor.level-1);
  }
}

const hemi=new THREE.HemisphereLight(0xd6ecff,0x4e6345,2.15);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff2d2,2.6);sun.position.set(-180,260,-120);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-300;sun.shadow.camera.right=300;sun.shadow.camera.top=300;sun.shadow.camera.bottom=-300;scene.add(sun);

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
      infrastructureGroup=new THREE.Group(), // bridges / fixed road infrastructure
      signGroup=new THREE.Group(), // dynamic OSM + road metadata signs
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
  signGroup,
  sceneryInfrastructureGroup,
  buildingGroup,
  roadGroup,
  forestGroup,
  sceneryForestGroup,
  horizonGroup
);
scene.add(world);

// V21.21.9 FRAME PACING: streamed world geometry is static between rebuilds.
// Freezing local matrices removes thousands of redundant matrix recomputations
// from ordinary render frames without changing geometry, lighting or materials.
function freezeStaticMatrices(root){
  root.traverse(obj=>{
    if(obj.matrixAutoUpdate){
      obj.updateMatrix();
      obj.matrixAutoUpdate=false;
    }
  });
}
freezeStaticMatrices(world);

const streamedWorldGroups=[
  terrainDetailGroup,
  waterGroup,
  infrastructureGroup,
  signGroup,
  sceneryInfrastructureGroup,
  buildingGroup,
  roadGroup,
  forestGroup,
  sceneryForestGroup,
  horizonGroup
];

function resetStaticGroupOrigin(group){
  group.position.set(0,0,0);
  group.updateMatrix();
}

function resetStreamedWorldOrigins(){
  for(const group of streamedWorldGroups)resetStaticGroupOrigin(group);
  ground?.position?.set?.(0,0,0);
  ground?.updateMatrix?.();
}

// V21.22.2: promote the visually important medium-distance band into the SAME
// high-detail terrain/imagery pipeline as the near field. The footprint grows
// from 3.2 km to 5.6 km while preserving the exact 12.5 m terrain grid spacing
// (448 segments). The procedural horizon now begins only beyond +/-2.8 km.
// This deliberately spends part of the newly verified GPU headroom on image
// quality rather than trying to imitate near terrain with a separate far mesh.
const NEAR_TERRAIN_SIZE=5600;
const NEAR_TERRAIN_SEGMENTS=448;
// V21.22.6: satellite chunks render first and mark stencil ref 2.
// The procedural DEM underlay then rejects those pixels entirely. This avoids
// z-fighting between two independently triangulated surfaces that represent the
// same terrain while preserving the procedural mesh for physics/fallback.
const groundMat=new THREE.MeshStandardMaterial({
  color:0xffffff,
  vertexColors:true,
  roughness:1,
  metalness:0,
  stencilWrite:true,
  stencilRef:2,
  stencilFunc:THREE.NotEqualStencilFunc,
  stencilFail:THREE.KeepStencilOp,
  stencilZFail:THREE.KeepStencilOp,
  stencilZPass:THREE.KeepStencilOp
});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(NEAR_TERRAIN_SIZE,NEAR_TERRAIN_SIZE,88,88),groundMat);
ground.rotation.x=-Math.PI/2;
ground.receiveShadow=true;
ground.renderOrder=-5;
scene.add(ground); // keep matrixAutoUpdate ON: terrain rebuilds reset rotation after rotating geometry into XZ

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
  applyImagery:()=>applyImageryToGround(),
  groundSize:NEAR_TERRAIN_SIZE,
  groundSegments:NEAR_TERRAIN_SEGMENTS
});

const terrainAbs=(x,z)=>terrainService.heightAt(x,z);
const rebuildGroundTerrain=()=>terrainService.rebuildGround();
const rebuildHorizon=()=>{resetStaticGroupOrigin(horizonGroup);terrainService.rebuildHorizon();freezeStaticMatrices(horizonGroup);markStaticShadowsDirty();};

async function loadElevationAround(absx,absz){
  const result=await elevationService.loadAround(absx,absz);

  if(result.count>0){
    // V21.22.3: DEM arrival only marks the visible world dirty. Route-ahead
    // prefetch already warms these tiles before they are needed; rebuilding a
    // 448x448 terrain + road + water scene on each async completion was the
    // largest recurring main-thread hitch source.
    markStreamWorldRefresh('dem');

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
function makeRoadSurfaceTextures(kind='asphalt'){
  const size=512;
  const colorCanvas=document.createElement('canvas');
  const bumpCanvas=document.createElement('canvas');
  const roughCanvas=document.createElement('canvas');
  colorCanvas.width=colorCanvas.height=size;
  bumpCanvas.width=bumpCanvas.height=size;
  roughCanvas.width=roughCanvas.height=size;

  const cctx=colorCanvas.getContext('2d');
  const bctx=bumpCanvas.getContext('2d');
  const rctx=roughCanvas.getContext('2d');
  const colorImage=cctx.createImageData(size,size);
  const bumpImage=bctx.createImageData(size,size);
  const roughImage=rctx.createImageData(size,size);

  // Deterministic procedural texture: stable between launches/rebuilds and
  // dense enough that the road no longer reads as one flat grey ribbon.
  let seed=kind==='asphalt'?0x21_21_27:0x51_0A_27;
  const rand=()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  };

  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const i=(y*size+x)*4;
      const macro=
        Math.sin(x*.041)+
        Math.sin(y*.033)+
        Math.sin((x+y)*.017);
      const grain=(rand()-.5);

      if(kind==='asphalt'){
        // Blue-neutral charcoal asphalt with low-frequency patching and fine aggregate.
        const base=72+macro*2.2+grain*16;
        const tyreBand=
          Math.exp(-Math.pow((x/size-.24)/.055,2))+
          Math.exp(-Math.pow((x/size-.76)/.055,2));
        const polished=tyreBand*2.3;
        colorImage.data[i]=Math.max(0,Math.min(255,base-polished));
        colorImage.data[i+1]=Math.max(0,Math.min(255,base+1-polished));
        colorImage.data[i+2]=Math.max(0,Math.min(255,base+2-polished));
        const bump=128+grain*54+macro*5;
        const rough=232-grain*18-tyreBand*10;
        bumpImage.data[i]=bumpImage.data[i+1]=bumpImage.data[i+2]=Math.max(0,Math.min(255,bump));
        roughImage.data[i]=roughImage.data[i+1]=roughImage.data[i+2]=Math.max(0,Math.min(255,rough));
      }else{
        // Compact gravel shoulder: warmer, more irregular and visibly rougher.
        const base=126+macro*5+grain*30;
        colorImage.data[i]=Math.max(0,Math.min(255,base+8));
        colorImage.data[i+1]=Math.max(0,Math.min(255,base+5));
        colorImage.data[i+2]=Math.max(0,Math.min(255,base-4));
        const bump=128+grain*88+macro*8;
        const rough=246-grain*8;
        bumpImage.data[i]=bumpImage.data[i+1]=bumpImage.data[i+2]=Math.max(0,Math.min(255,bump));
        roughImage.data[i]=roughImage.data[i+1]=roughImage.data[i+2]=Math.max(0,Math.min(255,rough));
      }
      colorImage.data[i+3]=bumpImage.data[i+3]=roughImage.data[i+3]=255;
    }
  }

  cctx.putImageData(colorImage,0,0);
  bctx.putImageData(bumpImage,0,0);
  rctx.putImageData(roughImage,0,0);

  // Sparse aggregate flecks break up the pixel noise at medium distance.
  cctx.globalAlpha=kind==='asphalt'?.22:.34;
  for(let i=0;i<(kind==='asphalt'?1800:2600);i++){
    const x=rand()*size,y=rand()*size;
    const radius=kind==='asphalt'?.35+rand()*1.15:.55+rand()*1.75;
    const light=rand()>.52;
    cctx.fillStyle=kind==='asphalt'
      ?(light?'#74787a':'#36393b')
      :(light?'#b3aa93':'#6f6a5e');
    cctx.beginPath();cctx.arc(x,y,radius,0,Math.PI*2);cctx.fill();
  }
  cctx.globalAlpha=1;

  const makeTexture=(canvas,{srgb=false}={})=>{
    const texture=new THREE.CanvasTexture(canvas);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(1,1);
    texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
    if(srgb)texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  };

  return {
    color:makeTexture(colorCanvas,{srgb:true}),
    bump:makeTexture(bumpCanvas),
    roughness:makeTexture(roughCanvas)
  };
}
const asphaltTextures=makeRoadSurfaceTextures('asphalt');
const shoulderTextures=makeRoadSurfaceTextures('gravel');
// ----- Road / vehicle visual contact constants -----
const ROAD_SURFACE_OFFSET=.10;
const TIRE_VISUAL_CLEARANCE=.018;
const WHEEL_RADIUS=.38;
const TIRE_HALF_WIDTH=.135;
const ROAD_WHEEL_CONTACT_HALF_WIDTH=8.5;

const roadMat=new THREE.MeshStandardMaterial({
  color:0xffffff,
  map:asphaltTextures.color,
  bumpMap:asphaltTextures.bump,
  bumpScale:.045,
  roughnessMap:asphaltTextures.roughness,
  roughness:.94,
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
  color:0xffffff,
  map:shoulderTextures.color,
  bumpMap:shoulderTextures.bump,
  bumpScale:.075,
  roughnessMap:shoulderTextures.roughness,
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

const lineYellow=new THREE.MeshStandardMaterial({
  color:0xe2c34a,
  roughness:.72,
  metalness:0,
  polygonOffset:true,
  polygonOffsetFactor:-3,
  polygonOffsetUnits:-3
});
const lineWhite=new THREE.MeshStandardMaterial({
  color:0xe3e3df,
  roughness:.72,
  metalness:0,
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
let currentRoadGuideSign=null;
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
    if(activeRoadProfile.length){
      scheduleVisualJob('road-signs',refreshRoadSignsOnly,420);
    }
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
  // V21.22.5: imagery is no longer stretched across the monolithic ground.
  // Each satellite chunk owns exact geographic bounds and follows the same
  // rendered terrain surface. The actual ground centre can lag the car during
  // hitch-free soft recentering, so expose it explicitly.
  getGroundCenter:()=>({
    x:worldOffset.x+(ground.position?.x||0),
    z:worldOffset.z+(ground.position?.z||0)
  }),
  sampleTerrainHeight:(x,z)=>terrainService.renderHeightAt(x,z),
  scene,
  zoom:16,
  groundSize:NEAR_TERRAIN_SIZE,
  chunkTiles:3,
  // Match the ~12.5 m near-terrain grid more closely. Stencil ownership is
  // the primary overlap fix; the denser chunk geometry also improves silhouette
  // agreement with the DEM on steep slopes.
  chunkSegments:96
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

const rebuildLocalScenery=()=>{for(const g of [terrainDetailGroup,sceneryInfrastructureGroup,buildingGroup,sceneryForestGroup])resetStaticGroupOrigin(g);sceneryRenderer.rebuild();freezeStaticMatrices(terrainDetailGroup);freezeStaticMatrices(sceneryInfrastructureGroup);freezeStaticMatrices(buildingGroup);freezeStaticMatrices(sceneryForestGroup);markStaticShadowsDirty();};

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

const countachGlbSystem=createCountachGlbSystem({
  THREE,
  bodyGroup,
  existingWheels:vehicleVisuals.wheels,
  vehicleSystem
});


const id4GlbSystem=createId4GlbSystem({
  THREE,
  bodyGroup,
  existingWheels:vehicleVisuals.wheels,
  vehicleSystem
});

const wrxGlbSystem=createWrxGlbSystem({
  THREE,
  bodyGroup,
  existingWheels:vehicleVisuals.wheels,
  vehicleSystem
});

const civicGlbSystem=createCivicGlbSystem({
  THREE,
  bodyGroup,
  existingWheels:vehicleVisuals.wheels,
  vehicleSystem
});

const sonataGlbSystem=createSonataGlbSystem({
  THREE,
  bodyGroup,
  existingWheels:vehicleVisuals.wheels,
  vehicleSystem
});

const f1GlbSystem=createF1GlbSystem({
  THREE,
  bodyGroup,
  existingWheels:vehicleVisuals.wheels,
  vehicleSystem
});


const i3GlbSystem=createI3GlbSystem({
  THREE,
  bodyGroup,
  existingWheels:vehicleVisuals.wheels,
  vehicleSystem
});

// V21.24.4 — mouse head-look for the Countach cockpit. Drag directly on
// the rendered world; UI panels keep intercepting their own pointer events.
let countachLookPointerId=null;
renderer.domElement.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  const modeLabel=$('camMode')?.textContent||'';
  if(vehicleSystem.activeId!=='countach_80'||!countachGlbSystem.isDriverCameraMode(modeLabel))return;
  countachLookPointerId=event.pointerId;
  renderer.domElement.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
renderer.domElement.addEventListener('pointermove',event=>{
  if(countachLookPointerId!==event.pointerId)return;
  countachGlbSystem.addHeadLookDelta(event.movementX||0,event.movementY||0);
});
const releaseCountachLookPointer=event=>{
  if(countachLookPointerId!==event.pointerId)return;
  renderer.domElement.releasePointerCapture?.(event.pointerId);
  countachLookPointerId=null;
};
renderer.domElement.addEventListener('pointerup',releaseCountachLookPointer);
renderer.domElement.addEventListener('pointercancel',releaseCountachLookPointer);

const truckTrailerSystem=createTruckTrailerSystem({
  THREE,
  scene,
  car,
  bodyGroup,
  existingWheels:vehicleVisuals.wheels,
  vehicleSystem,
  groundHeightForWheel,
  getWorldOffset:()=>worldOffset
});

const vehiclePresentation=createVehiclePresentation({
  THREE,
  scene,
  car,
  bodyGroup,
  wheels:[
    ...vehicleVisuals.wheels,
    ...truckTrailerSystem.tractorWheels
  ],
  vehicleSystem,
  sun,
  roadSurfaceAt,
  terrainAbs,
  groundHeightForWheel,
  activeVehicleWheels:()=>
    truckTrailerSystem.active
      ?truckTrailerSystem.tractorWheels
      :vehicleVisuals.activeVehicleWheels(),
  getDrivingState:()=>({
    heading,
    absX,
    absZ,
    speed,
    longitudinalAccel,
    rearSlipAmount:
      Math.max(
        0,
        rearSlipAmount-
        frontSlipAmount*.45
      ),
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

  // V19.0: larger shared pool + age-protected recycling keeps remote skid
  // trails visible while following another player through a long slide.
  maxSegments:7200
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
  if(activeRoadProfile.length){
    scheduleVisualJob('road-signs',refreshRoadSignsOnly,420);
  }
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

  // V21.22.3: applying hundreds of OSM objects is CPU-heavy. Network
  // completion only marks the world dirty; the data is rendered in the next
  // calm/coalesced world refresh instead of interrupting a driving frame.
  markStreamWorldRefresh('scenery');

  sceneryStatus.textContent=
    `${result.cached?'Cache':'OSM'} · ${sceneryFeatures.length} objets`;

  return true;
}

// ---------- bridge logic ----------
const rebuildBridgeSpans=()=>bridgeManager.rebuild();
const bridgeHeightAtCum=cum=>bridgeManager.heightAtCum(cum);

// ---------- road geometry facade ----------
const roadGeometry=createRoadGeometrySystem({
  THREE,
  roadEdgeMat,
  roadUnderMat,
  ROAD_SURFACE_OFFSET,
  terrainAbs,
  nearestRoute,
  bridgeHeightAtCum,
  bridgeManager,
  getState:()=>({absX,absZ,routeLength,segments,worldOffset})
});
const activeRoadProfile=roadGeometry.profile;
function buildRoadProfile(){return roadGeometry.buildProfile();}
function setActiveRoadProfile(profile){return roadGeometry.setProfile(profile);}
function clearActiveRoadProfile(){return roadGeometry.clearProfile();}
function rebuildRoadProfileSpatialIndex(){return roadGeometry.rebuildIndex();}
function buildLateralBand(...args){return roadGeometry.buildLateralBand(...args);}
function buildRibbon(...args){return roadGeometry.buildRibbon(...args);}
function buildOffsetRibbon(...args){return roadGeometry.buildOffsetRibbon(...args);}
function buildRoadVolume(...args){return roadGeometry.buildRoadVolume(...args);}
function roadFrameAt(...args){return roadGeometry.roadFrameAt(...args);}
function roadProfileFrameAtCum(...args){return roadGeometry.roadProfileFrameAtCum(...args);}
function roadHeightAt(...args){return roadGeometry.roadHeightAt(...args);}
function roadSurfaceAt(...args){return roadGeometry.roadSurfaceAt(...args);}

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

const rebuildLocalWater=()=>{resetStaticGroupOrigin(waterGroup);waterRenderer.rebuild();freezeStaticMatrices(waterGroup);markStaticShadowsDirty();};










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
  // V21.22.3: hydro data can complete at arbitrary times. Keep the response
  // off the critical driving frame and fold the expensive road/terrain refresh
  // into the next calm/recenter world refresh instead of rebuilding immediately.
  markStreamWorldRefresh('hydro');

  return true;
}


// ---------- road furniture facade ----------
const roadFurniture=createRoadFurnitureSystem({
  THREE,
  signGroup,
  infrastructureGroup,
  routePointAtCum,
  bridgeHeightAtCum,
  roadHeightAt,
  terrainAbs,
  nearestRoute,
  resetStaticGroupOrigin,
  clearGroup,
  freezeStaticMatrices,
  addGeographicRoadSigns:()=>addGeographicRoadSigns(),
  getState:()=>({
    activeRoadProfile,
    bridgeSpans,
    worldOffset,
    activeRoadMeta,
    absX,
    absZ,
    routeLength
  }),
  setRoadGuideSign:value=>{currentRoadGuideSign=value;}
});
const addRoadSignAt=(...args)=>roadFurniture.addRoadSignAt(...args);
const addEnhancedBridgeFurniture=()=>roadFurniture.addEnhancedBridgeFurniture();
const refreshRoadSignsOnly=()=>roadFurniture.refreshRoadSignsOnly();

// Build only a corridor around the current location, preserving every source polyline curve.
function rebuildLocalWorld(){
 resetStreamedWorldOrigins();
 terrainService.resetRoadBedOrigin?.();
 clearGroup(roadGroup);clearGroup(forestGroup);
 clearGroup(infrastructureGroup);clearGroup(signGroup);
 sceneryRenderer.clear();

 // CRITICAL: bridge deck heights depend on terrain elevation at their approaches.
 // Elevation tiles, floating-origin shifts and asynchronous loads can all change
 // terrainAbs(). Recompute bridge spans BEFORE rebuilding the road every time.
 if(bridgeFeatures.length) rebuildBridgeSpans();

 const profile=buildRoadProfile();
 setActiveRoadProfile(profile);

 // Cut terrain fragments directly below the road corridor so coarse DEM
 // triangles can never protrude through asphalt or shoulders.
 terrainService.setRoadBed(profile,{
   // V21.15.2: geometry-only road clearance. No stencil/depth trickery.
   // The safety cut extends well past the shoulder so coarse mountain
   // triangles cannot bridge across the pavement on extreme cross-slopes.
   roadHalfWidth:5.4,
   terrainCutHalfWidth:16.5,
   blendWidth:14.0,
   surfaceOffset:0.20,

   // A small terrain platform is tied to the FIRST route sample, not to the
   // nearest X/Z branch. This keeps every departure stable even when another
   // switchback passes almost directly above or below it.
   startPad:profile.length>1&&(profile[0].cum||0)<=1?{
     x:profile[0].x,
     z:profile[0].z,
     y:profile[0].y-0.20,
     angle:Math.atan2(
       profile[1].x-profile[0].x,
       profile[1].z-profile[0].z
     ),
     forwardOffset:7,
     halfLength:20,
     halfWidth:10,
     blendWidth:22
   }:null
 });

 if(profile.length>1){
   // Solid 3D road body first; flat top layers are then drawn over it.
   const roadVolume=buildRoadVolume(profile);
   if(roadVolume)roadGroup.add(roadVolume);

   // V21.19: shoulders are SIDE-ONLY bands. The old 10.4 m shoulder ribbon
   // continued underneath the entire 7.5 m asphalt ribbon. On highly twisted
   // mountain quads those two triangulated surfaces could intersect and show up
   // as the large diagonal beige wedges seen in extreme terrain.
   const leftShoulder=buildLateralBand(
     profile,
     5.20,
     3.75,
     shoulderMat,
     .035
   );
   if(leftShoulder)roadGroup.add(leftShoulder);

   const rightShoulder=buildLateralBand(
     profile,
     -3.75,
     -5.20,
     shoulderMat,
     .035
   );
   if(rightShoulder)roadGroup.add(rightShoulder);

   const asphaltRoad=buildRibbon(
     profile,
     7.5,
     roadMat,
     ROAD_SURFACE_OFFSET
   );
   if(asphaltRoad)roadGroup.add(asphaltRoad);

   const center=buildOffsetRibbon(
     profile,
     0,
     .13,
     lineYellow,
     .165
   );
   if(center)roadGroup.add(center);

   // White edge lines use the same bounded cross-section frame as the asphalt.
   // They can no longer calculate their own conflicting tangent on a hairpin.
   for(const off of [-3.45,3.45]){
     const em=buildOffsetRibbon(
       profile,
       off,
       .10,
       lineWhite,
       .16
     );
     if(em)roadGroup.add(em);
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
 refreshRoadSignsOnly();

 // Static meshes keep their exact V21.21.7 visual quality; only matrix update
 // bookkeeping is removed from subsequent frames.
 freezeStaticMatrices(roadGroup);
 freezeStaticMatrices(forestGroup);
 freezeStaticMatrices(infrastructureGroup);
 freezeStaticMatrices(signGroup);

 scheduleVisualJob(
   'horizon',
   rebuildHorizon,
   260
 );
 markStaticShadowsDirty();
}
function resetWorldCaches(){
  currentRoadGuideSign=null;
  streamingCoordinator?.reset();
  waterData.reset();
  skidMarks.clear();

  route.length=0;segments.length=0;routeLength=0;
  vehicleNearestHint=-1;vehicleNearestLastX=Infinity;vehicleNearestLastZ=Infinity;
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
  resetMinimapSignReadout();
  if(signStatus)signStatus.textContent='0';
  lastRoadMetaCenter={x:Infinity,z:Infinity};
  roadMetaLoading=false;
  updateRoadMetaHUD();
  clearActiveRoadProfile();
  terrainService.clearRoadBed();
  clearGroup(roadGroup);clearGroup(forestGroup);
  clearGroup(infrastructureGroup);clearGroup(signGroup);
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

  if(gameStarted){
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
    setV21BootProgress(
      'route',
      'loading',
      `Calcul du trajet ${start.name||'Départ'} → ${end.name||'Arrivée'}`
    );

    await loadRoute();

    setV21BootProgress(
      'route',
      'done',
      'Trajet prêt'
    );

    prepMap();
    placeAt(0);

    // Routing failsafe no longer owns the hydrography wait.
    clearTimeout(failsafe);

    loadingText.textContent=
      'Chargement de l’hydrographie initiale…';

    setV21BootProgress(
      'hydro',
      'loading',
      'Hydrographie initiale'
    );

    const hydroReady=
      await loadWaterAround(
        absX,
        absZ
      ).catch(error=>{
        console.warn(
          'Initial hydrography failed',
          error
        );

        return false;
      });

    setV21BootProgress(
      'hydro',
      hydroReady
        ?'done'
        :'warn',
      hydroReady
        ?'Hydrographie prête'
        :'Hydrographie indisponible'
    );

    // V21.22.4: do not expose the player to the procedural/fallback ground while
    // the first real DEM/image tiles are still arriving. Build the initial
    // high-quality patch only after the current elevation and a 2D route-ahead
    // buffer have had a chance to warm the persistent caches. This work happens
    // while the vehicle is stationary and the loading overlay is still visible.
    loadingText.textContent='Préchargement du terrain en avance…';

    // Keep the existing unified streamer as an additional first-pass warmer.
    worldStreaming.preloadRoute(absX,absZ);

    const initialElevationReady=await loadElevationAround(absX,absZ)
      .catch(()=>{elevStatus.textContent='Démo';return false;});

    await primeInitialTerrainPreloadBuffer().catch(()=>{});

    if(imageryService.enabled){
      await promiseWithTimeout(
        buildImageryMosaic(absX,absZ).catch(()=>{imageryStatus.textContent='Fallback'}),
        4500
      );
    }

    // One intentional rebuild BEFORE play replaces the fallback terrain with
    // whatever real data is already cached. During driving V21.22.3's
    // hitch-free cache-only policy remains unchanged.
    if(initialElevationReady||streamingCoordinator?.state.pendingWorld){
      cancelVisualJob('world-rebuild');
      commitLocalWorldRefresh();
    }

    prefetchRouteAhead();
    loadSceneryAround(absX,absZ).catch(()=>{sceneryStatus.textContent='Indisponible'});
    loadRoadMetadataAround(absX,absZ).catch(()=>{});
    loadGeographicSignsAround(absX,absZ).catch(()=>{});

    completed=true;
    loading.classList.add('hidden');
    toast('Trajet prêt · terrain préchargé');
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
  version:WORLD_DRIVE_VERSION,
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
  vehicleNearestHint=-1;vehicleNearestLastX=Infinity;vehicleNearestLastZ=Infinity;

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
let countachBrakeLightRequested=false;
let countachReverseLightRequested=false;

// V18K — tire stress comes from the actual vehicle-physics grip clamp.
// This value is intentionally smoothed a little to represent tire-force/slip
// buildup and to ignore a momentary joystick twitch.
// 1.0 = the requested cornering force has reached available lateral grip.
let lateralGripUsage=0;

// V20.0 — direction of travel can diverge from chassis heading during a slide.
// At normal grip this converges almost instantly and behaves like the old model.
let velocityHeading=0;

// V20.2: chassis yaw itself now has response time. This prevents a tiny
// high-speed steering correction from producing near-maximum lateral force in
// only a few frames.
let dynamicYawRate=0;

// Per-wheel normalized friction-circle demand:
// 1.0 = wheel has reached its estimated adhesion limit.
let wheelGripUsage=[0,0,0,0];
let wheelSlipLevels=[0,0,0,0];
// V21.11 skid/audio diagnostics. These expose the already-computed tire demand
// components to the renderer without changing vehicle handling.
let wheelLateralUsage=[0,0,0,0];
let wheelLongitudinalUsage=[0,0,0,0];

// Handling slip is derived from the friction circle by axle. Longitudinal
// demand can consume lateral grip, but it still cannot create yaw without an
// actual lateral demand (steering / cornering force).
let frontSlipAmount=0;
let rearSlipAmount=0;

// V20.4 automatic transmission state.
let transmissionGear=1;
let transmissionPendingGear=1;
let transmissionShiftTimer=0;
let transmissionShiftDuration=0;
let transmissionShiftStartRpm=0;
let transmissionShiftEndRpm=0;
let engineRpm=0;
let transmissionShifting=false;
let transmissionProfileKey='';

// V20.5 rev limiter state.
let revLimiterActive=false;
let revLimiterPhase=0;

// V20.11 transmission mode.
// Automatic is intentionally the default on every fresh game load.
let transmissionMode='automatic';
let manualShiftRequest=null;

function activeTransmissionProfile(){
  return vehicleSystem.active.audio||{type:'ev',profile:'ev'};
}

// For combustion vehicles, the last shift point is the road speed at which
// highest gear reaches engine redline. That is the mechanical maximum speed.
function effectiveEngineRedlineRpm(
  profile=activeTransmissionProfile(),
  onPavement=true
){
  const nominal=
    Math.max(
      1000,
      Number(profile.redlineRpm)||6500
    );

  // V20.6: loose terrain represents much higher drivetrain/load resistance.
  // Combustion engines effectively lose the upper 30% of their usable RPM.
  return onPavement
    ?nominal
    :nominal*.70;
}

function transmissionRedlineSpeedKmh(
  profile=activeTransmissionProfile(),
  effectiveRedlineRpm=null
){
  if(profile.type!=='combustion'){
    return Math.max(
      20,
      Number(VEHICLE.topSpeedKmh)||200
    );
  }

  const speeds=
    computeGearRedlineSpeeds(
      profile,
      effectiveRedlineRpm||
      Number(profile.redlineRpm)||
      6500
    );

  return Math.max(
    20,
    Number(
      speeds[
        speeds.length-1
      ]
    )||20
  );
}

function resetTransmissionState(){
  const profile=activeTransmissionProfile();

  transmissionGear=1;
  transmissionPendingGear=1;
  transmissionShiftTimer=0;
  transmissionShiftDuration=0;
  transmissionShiftStartRpm=0;
  transmissionShiftEndRpm=0;
  transmissionShifting=false;
  revLimiterActive=false;
  revLimiterPhase=0;
  manualShiftRequest=null;

  transmissionProfileKey=
    `${vehicleSystem.activeId}:${profile.profile||profile.type||''}`;

  engineRpm=
    profile.type==='combustion'
      ?Number(profile.idleRpm)||850
      :0;
}

function requestManualShift(direction){
  if(transmissionMode!=='manual'){
    return;
  }

  const profile=
    activeTransmissionProfile();

  if(
    profile.type!=='combustion'||
    speed<-.25||
    transmissionShifting||
    transmissionShiftTimer>0
  ){
    return;
  }

  const gearCount=
    Array.isArray(profile.gearRatios)&&
    profile.gearRatios.length
      ?profile.gearRatios.length
      :Math.max(
         1,
         Number(profile.gearCount)||1
       );

  const current=
    Math.max(
      1,
      Number(transmissionGear)||1
    );

  const target=
    Math.max(
      1,
      Math.min(
        gearCount,
        current+
        (
          direction>0
            ?1
            :-1
        )
      )
    );

  if(target===current){
    return;
  }

  manualShiftRequest=target;
}

function desiredTransmissionGear(
  kmh,
  profile,
  currentGear,
  effectiveRedlineRpm
){
  const points=
    computeGearRedlineSpeeds(
      profile,
      effectiveRedlineRpm
    );

  if(!points.length){
    return 1;
  }

  const gear=
    Math.max(
      1,
      Math.min(
        points.length,
        Number(currentGear)||1
      )
    );

  if(
    gear<points.length&&
    kmh>=points[gear-1]
  ){
    return gear+1;
  }

  if(
    gear>1&&
    kmh<
      points[gear-2]*
      .82
  ){
    return gear-1;
  }

  return gear;
}

function updateTransmission(dt,requestedThrottle,onPavement=true){
  const profile=activeTransmissionProfile();
  const profileKey=
    `${vehicleSystem.activeId}:${profile.profile||profile.type||''}`;

  if(profileKey!==transmissionProfileKey){
    resetTransmissionState();
  }

  if(profile.type!=='combustion'){
    transmissionGear=speed<-.25?-1:0;
    transmissionPendingGear=transmissionGear;
    transmissionShiftTimer=0;
    transmissionShiftDuration=0;
    transmissionShifting=false;
    revLimiterActive=false;
    revLimiterPhase=0;
    engineRpm=0;
    return requestedThrottle;
  }

  const idle=Number(profile.idleRpm)||850;
  const redline=Number(profile.redlineRpm)||6500;

  const effectiveRedline=
    effectiveEngineRedlineRpm(
      profile,
      onPavement
    );

  const kmh=Math.abs(speed)*3.6;

  if(speed<-.25){
    transmissionGear=-1;
    transmissionPendingGear=-1;
    transmissionShiftTimer=0;
    transmissionShiftDuration=0;
    transmissionShifting=false;
    revLimiterActive=false;
    revLimiterPhase=0;

    const reverseRatio=
      physicsClamp(
        Math.abs(speed)/Math.max(1,Math.abs(vehicleReverseLimitMps())),
        0,
        1
      );

    engineRpm=
      idle+(redline*.62-idle)*reverseRatio;

    return requestedThrottle;
  }

  if(transmissionGear<1){
    transmissionGear=1;
    transmissionPendingGear=1;
  }

  if(transmissionShiftTimer>0){
    revLimiterActive=false;
    revLimiterPhase=0;

    transmissionShiftTimer=
      Math.max(0,transmissionShiftTimer-dt);

    const progress=
      transmissionShiftDuration>0
        ?1-transmissionShiftTimer/transmissionShiftDuration
        :1;

    engineRpm=
      transmissionShiftStartRpm+
      (transmissionShiftEndRpm-transmissionShiftStartRpm)*
      physicsSmoothstep01(progress);

    transmissionShifting=
      transmissionShiftTimer>0;

    if(!transmissionShifting){
      transmissionGear=transmissionPendingGear;
      engineRpm=
        computeTransmissionState(
          kmh,
          0,
          profile,
          transmissionGear
        ).rpm;
    }

    return requestedThrottle>0&&transmissionShifting
      ?0
      :requestedThrottle;
  }

  let desiredGear=
    transmissionGear;

  if(transmissionMode==='automatic'){
    desiredGear=
      desiredTransmissionGear(
        kmh,
        profile,
        transmissionGear,
        effectiveRedline
      );
  }else if(manualShiftRequest!==null){
    const requestedGear=
      Math.max(
        1,
        Math.min(
          Array.isArray(profile.gearRatios)&&
          profile.gearRatios.length
            ?profile.gearRatios.length
            :Math.max(
               1,
               Number(profile.gearCount)||1
             ),
          Number(manualShiftRequest)||1
        )
      );

    manualShiftRequest=null;

    // Protect the engine from a mechanically impossible downshift.
    // A real manual box can be abused into an over-rev, but for World Drive
    // we reject the shift rather than creating an engine-damage subsystem.
    if(requestedGear<transmissionGear){
      const requestedState=
        computeTransmissionState(
          kmh,
          0,
          profile,
          requestedGear
        );

      if(
        requestedState.mechanicalRpm>
        effectiveRedline*
        1.035
      ){
        toast(
          'Rétrogradage refusé · régime trop élevé'
        );

        desiredGear=
          transmissionGear;
      }else{
        desiredGear=
          requestedGear;
      }
    }else{
      desiredGear=
        requestedGear;
    }
  }

  if(desiredGear!==transmissionGear){
    transmissionPendingGear=desiredGear;
    manualShiftRequest=null;

    const upshift=desiredGear>transmissionGear;

    transmissionShiftDuration=
      Math.max(
        .045,
        Number(
          upshift
            ?profile.shiftDuration
            :profile.downshiftDuration
        )||
        (upshift?.18:.15)
      );

    transmissionShiftTimer=transmissionShiftDuration;

    transmissionShiftStartRpm=
      computeTransmissionState(
        kmh,
        0,
        profile,
        transmissionGear
      ).rpm;

    transmissionShiftEndRpm=
      computeTransmissionState(
        kmh,
        0,
        profile,
        desiredGear
      ).rpm;

    transmissionShifting=true;
    revLimiterActive=false;
    revLimiterPhase=0;
    engineRpm=transmissionShiftStartRpm;

    return requestedThrottle>0
      ?0
      :requestedThrottle;
  }

  transmissionShifting=false;

  const load=
    physicsClamp(
      Math.abs(longitudinalAccel)/7.5,
      0,
      1
    );

  const steadyTransmission=
    computeTransmissionState(
      kmh,
      load,
      profile,
      transmissionGear
    );

  engineRpm=
    steadyTransmission.rpm;

  const gearCount=
    Array.isArray(profile.gearRatios)&&
    profile.gearRatios.length
      ?profile.gearRatios.length
      :Math.max(
         1,
         Number(profile.gearCount)||1
       );

  const topGear=
    transmissionGear>=gearCount;

  const redlineSpeedKmh=
    transmissionRedlineSpeedKmh(
      profile,
      effectiveRedline
    );

  const mechanicalState=
    computeTransmissionState(
      kmh,
      load,
      profile,
      transmissionGear
    );

  const limiterAllowed=
    transmissionMode==='manual'
      ?transmissionGear>=1
      :topGear;

  const touchingLimiter=
    limiterAllowed&&
    requestedThrottle>.05&&
    (
      (
        topGear&&
        kmh>=redlineSpeedKmh*.994
      )||
      mechanicalState.mechanicalRpm>=
        effectiveRedline*.994
    );

  if(touchingLimiter){
    revLimiterActive=true;

    const limiterHz=
      Math.max(
        6,
        Number(profile.revLimiterHz)||12
      );

    const limiterDropRpm=
      Math.max(
        100,
        Number(profile.revLimiterDropRpm)||
        Math.min(
          300,
          redline*.035
        )
      );

    revLimiterPhase+=
      dt*
      Math.PI*
      2*
      limiterHz;

    if(revLimiterPhase>Math.PI*2*100){
      revLimiterPhase%=Math.PI*2;
    }

    // Needle + audio bounce under the actual redline.
    const bounce=
      .5+
      .5*
      Math.sin(revLimiterPhase);

    const effectiveDrop=
      limiterDropRpm*
      (
        effectiveRedline/
        redline
      );

    engineRpm=
      effectiveRedline-
      effectiveDrop*
      (
        .18+
        bounce*.82
      );

    engineRpm=
      Math.max(
        idle,
        Math.min(
          effectiveRedline,
          engineRpm
        )
      );

    // Fuel/ignition-cut style torque pulse.
    const powerPulse=
      Math.sin(revLimiterPhase)<-.12;

    return powerPulse
      ?requestedThrottle
      :0;
  }

  revLimiterActive=false;
  revLimiterPhase=0;

  if(!onPavement){
    engineRpm=
      Math.min(
        engineRpm,
        effectiveRedline
      );
  }

  return requestedThrottle;
}

// V21.21: generalized vehicle dynamics math lives in vehicle-dynamics.js.

// Mutable object identity is intentional: audio/physics keep the same reference
// when future vehicles are selected.
const VEHICLE=vehicleSystem.physics;
// Reusable V21.21.3 dynamics results: avoid per-frame result/array churn while
// keeping the exact generalized equations used for future multi-axle vehicles.
const dynamicsScratch={
  drive:{axleLoads:[]},
  brake:{axleLoads:[]},
  handbrake:{axleLoads:[]},
  grade:{},
  steering:{},
  lateral:{},
  grip:{
    axleLoads:[],_lateralTransfer:[],raw:[],smoothed:[],slip:[],
    lateralSlip:[],lateralUsage:[],longitudinalUsage:[]
  }
};
const physicsRoadFrameScratch={};
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
    tireSquealLevel:skidMarks.localState.tireAudio,
    brakeSquealLevel:skidMarks.localState.brakeAudio,

    // V21.11 — keep the squeal alive during a real sustained slide even when
    // instantaneous friction-circle demand oscillates from frame to frame.
    // Visible skid intensity remains the authoritative "dark rubber" signal.
    skidFrontLevel:skidMarks.localState.front,
    skidRearLevel:skidMarks.localState.rear,
    frontSlipAmount,
    rearSlipAmount,
    chassisSlipAngle:Math.abs(
      angleDelta(
        heading,
        velocityHeading
      )
    ),

    engineRpm,
    transmissionGear,
    shifting:transmissionShifting,
    revLimiterActive,
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
  bodyGroup,
  modeStatusEl:$('camMode'),
  getHeading:()=>heading,
  getLookState:()=>gamepadState,

  // V21.13 camera collision uses the same rendered road/terrain support as the
  // world. Coordinates received here are render-space coordinates.
  getGroundHeight:(renderX,renderZ)=>{
    const worldX=renderX+worldOffset.x;
    const worldZ=renderZ+worldOffset.z;
    const terrainY=terrainAbs(worldX,worldZ);
    const road=roadSurfaceAt(worldX,worldZ);

    if(road&&road.distance<8.5){
      return Math.max(terrainY,road.y);
    }

    return terrainY;
  }
});

const gamepad=createGamepadController({
  statusEl:$('gamepadStatus'),
  audio:vehicleAudio,
  toast,
  onCycleCamera:()=>cameraController.cycle(),
  onToggleAssist:()=>toggleAssist(),
  onToggleAutopilot:()=>toggleAutopilot(),

  onShiftUp:()=>
    requestManualShift(1),

  onShiftDown:()=>
    requestManualShift(-1),

  onResetToRoad:()=>resetToRoad(),
  isAutopilotEnabled:()=>autopilot,
  disableAutopilot:message=>setAutopilot(false,message),
  getBindings:()=>appSettings.controls.gamepad
});
const gamepadState=gamepad.state;

// ---------- keyboard controller facade ----------
const keyboardControls=createKeyboardControls({
  appSettings,
  defaults:DEFAULT_WORLD_SETTINGS,
  queueSettingsSave,
  getKeyboardRebindAction:()=>keyboardRebindAction,
  setKeyboardRebindAction:value=>{keyboardRebindAction=value;},
  getRuntimeState:()=>({
    gameStarted,
    menuOpen:v21MenuOpen,
    autopilot
  }),
  onShiftUp:()=>requestManualShift(1),
  onShiftDown:()=>requestManualShift(-1),
  onCycleCamera:()=>cameraController.cycle(),
  onToggleAssist:()=>toggleAssist(),
  onToggleAutopilot:()=>toggleAutopilot(),
  onResetToRoad:()=>resetToRoad(),
  onManualTakeover:()=>setAutopilot(false,'Reprise manuelle')
});
const keyboardCodes=action=>keyboardControls.codes(action);
const keyboardActionDown=action=>keyboardControls.actionDown(action);
const keyboardActionMatches=(action,code)=>keyboardControls.actionMatches(action,code);
const clearKeyboardState=()=>keyboardControls.clearState();

let maxSpeedKmh=200;
let MAX=maxSpeedKmh/3.6;
const REV=-10;
function vehicleReverseLimitMps(){
  const configured=Number(VEHICLE?.reverseTopSpeedKmh);
  return Number.isFinite(configured)&&configured>0
    ?-configured/3.6
    :REV;
}

let obeyRoadSpeedLimits=true;
let roadContact=false;

function setAutopilot(enabled,message=''){
  autopilot=enabled;
  $('autopilotBtn').textContent='Pilote auto: '+(autopilot?'ON':'OFF');
  autopilotStatus.textContent=autopilot?'ACTIF':'OFF';
  if(autopilot){
    assist=true;
    appSettings.assist=true;
    queueSettingsSave();
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

  syncV21RuntimeControls();
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


const groundHeightRoadScratch={};

// V21.21.5 CPU fast path. While the vehicle is fully on the road, wheel support
// is evaluated from the already-resolved center road plane instead of repeating
// four spatial nearest-segment searches every frame. Precise lookups remain
// available for crest/jump probes and for wheels outside the road corridor.
const fastWheelRoadSupport={
  active:false,
  centerX:0,
  centerZ:0,
  centerY:0,
  sinAngle:0,
  cosAngle:1,
  tanPitch:0,
  tanRoll:0,
  halfWidth:ROAD_WHEEL_CONTACT_HALF_WIDTH
};
let currentOnPavementForInstruments=true;

function setFastWheelRoadSupport(active,roadFrame,centerY){
  if(!active||!roadFrame||!Number.isFinite(centerY)){
    fastWheelRoadSupport.active=false;
    return;
  }
  fastWheelRoadSupport.active=true;
  fastWheelRoadSupport.centerX=absX;
  fastWheelRoadSupport.centerZ=absZ;
  fastWheelRoadSupport.centerY=centerY;
  fastWheelRoadSupport.sinAngle=Math.sin(roadFrame.angle||0);
  fastWheelRoadSupport.cosAngle=Math.cos(roadFrame.angle||0);
  fastWheelRoadSupport.tanPitch=Math.tan(roadFrame.pitch||0);
  fastWheelRoadSupport.tanRoll=Math.tan(roadFrame.roll||0);
}

function groundHeightForWheel(absx,absz,preferLocalRoadPlane=false){
  if(preferLocalRoadPlane&&fastWheelRoadSupport.active){
    const dx=absx-fastWheelRoadSupport.centerX;
    const dz=absz-fastWheelRoadSupport.centerZ;
    const along=dx*fastWheelRoadSupport.sinAngle+dz*fastWheelRoadSupport.cosAngle;
    const lateral=-dx*fastWheelRoadSupport.cosAngle+dz*fastWheelRoadSupport.sinAngle;
    if(
      Math.abs(lateral)<fastWheelRoadSupport.halfWidth&&
      Math.abs(along)<8.5
    ){
      return fastWheelRoadSupport.centerY+
        fastWheelRoadSupport.tanPitch*along+
        fastWheelRoadSupport.tanRoll*lateral;
    }
  }

  const rs=roadSurfaceAt(absx,absz,groundHeightRoadScratch);
  if(rs&&Math.abs(rs.lateral)<ROAD_WHEEL_CONTACT_HALF_WIDTH)return rs.y;
  return terrainAbs(absx,absz);
}



// V21.21.3 PERFORMANCE: simulation stays per-frame, but DOM/canvas telemetry does
// not need render-frame cadence. This avoids repeatedly invalidating layout and
// redrawing the full route map when the GPU/CPU is already under load.
let driveHudAccumulator=0;
let minimapAccumulator=0;
let gripSolverAccumulator=1/20;
let worldStreamingAccumulator=0;
let lastContactModeText='';
const DRIVE_HUD_INTERVAL=.10;   // 10 Hz
const MINIMAP_INTERVAL=.20;     // 5 Hz
const GRIP_SOLVER_INTERVAL=1/20; // secondary per-wheel tire state at 20 Hz
const WORLD_STREAMING_INTERVAL=.12; // boundary checks ~8 Hz; load radii are hundreds of metres

function updateDrive(dt){
 const nr=nearestRouteForVehicle(absX,absZ);
 const ap=autopilotControl(dt,nr);

 // Presentation vertical physics was solved on the previous frame.
 // This one-frame-old state is stable and avoids a circular dependency.
 const airborneNow=
   !!vehiclePresentation.airborne;

 const keyboardThrottle=
   (
     keyboardActionDown('accelerate')
       ?1
       :0
   )-
   (
     keyboardActionDown('brake')
       ?1
       :0
   );

 const keyboardTurn=
   (
     keyboardActionDown('steerLeft')
       ?1
       :0
   )-
   (
     keyboardActionDown('steerRight')
       ?1
       :0
   );

 let manualThrottle=
   v21MenuOpen
     ?0
     :keyboardThrottle;

 let manualTurn=
   v21MenuOpen
     ?0
     :keyboardTurn;

 let manualHand=
   v21MenuOpen
     ?false
     :keyboardActionDown(
        'handbrake'
      );

 if(
   gamepadState.connected&&
   !v21MenuOpen
 ){
   if(
     gamepadState.throttle>.02||
     gamepadState.brake>.02
   ){
     manualThrottle=
       gamepadState.throttle-
       gamepadState.brake;
   }

   if(Math.abs(gamepadState.steer)>.001){
     manualTurn=
       -gamepadState.steer;
   }

   manualHand=
     manualHand||
     gamepadState.hand;
 }

 const throttle=autopilot?ap.throttle:manualThrottle;
 const turn=autopilot?ap.turn:manualTurn;
 const hand=autopilot?ap.hand:manualHand;

 const onPavement=
   !!(
     nr&&
     nr.d<8.5
   );
 currentOnPavementForInstruments=onPavement;

 const driveThrottle=
   updateTransmission(
     dt,
     throttle,
     onPavement
   );

 const brakeRequested=hand||(throttle<-.04&&speed>.15);
 countachBrakeLightRequested=brakeRequested;
 // Reverse lamps illuminate as soon as reverse drive is requested at/through
 // zero speed, and remain on while the car is actually travelling backwards.
 countachReverseLightRequested=(speed<-.08)||(driveThrottle<-.04&&speed<=.15);
 vehicleVisuals.updateBrakeLights(dt,brakeRequested);
 truckTrailerSystem.setBrakeLights(brakeRequested);
 const combination=truckTrailerSystem.longitudinalScales();
 // ----- V4.1 longitudinal dynamics -----
 const previousSpeed=speed;
 const surfaceGrip=onPavement?roadSurfaceGrip():1;

 // Terrain behavior:
 // every vehicle still loses 20% propulsion away from pavement.
 // Combustion vehicles additionally lose 30% usable redline in V20.6.
 // AWD keeps a meaningful traction advantage in loose terrain.
 const offroadPowerFactor=
   onPavement
     ?1
     :.80;

 const isAWD=
   VEHICLE.drivetrain==='AWD';

 const awdOffroadGripBonus=
   !onPavement&&isAWD
     ?1.18
     :1;

 // V21.21 — longitudinal force model. Propulsion and service braking are
 // resolved independently so axle load, drivetrain and surface grip can cap
 // the requested force before rolling/aero/grade forces are added.
 let requestedDriveAccel=0;
 let requestedBrakeAccel=0;

 if(driveThrottle>0){
   if(speed>=0){
     const performanceTop=vehicleTopSpeedKmh()/3.6;
     const speedRatio=Math.min(1,Math.max(0,speed/performanceTop));
     const powerTaper=truckTrailerSystem.active
       ?1
       :1-.38*speedRatio;
     requestedDriveAccel=
       VEHICLE.accel*
       offroadPowerFactor*
       driveThrottle*
       powerTaper;
   }else{
     requestedBrakeAccel=VEHICLE.brake*driveThrottle;
   }
 }else if(driveThrottle<0){
   if(speed>0){
     requestedBrakeAccel=VEHICLE.brake*driveThrottle;
   }else{
     requestedDriveAccel=
       VEHICLE.reverseAccel*
       offroadPowerFactor*
       driveThrottle;
   }
 }

 // V21.23.1 — when the tractor carries a trailer, engine force and service
 // braking are resolved against the mass/brake capability of the combination.
 // Passenger cars receive neutral scales of exactly 1.
 requestedDriveAccel*=truckTrailerSystem.active
   ?truckTrailerSystem.driveAccelScaleForSpeed(Math.abs(speed))
   :combination.driveAccelScale;
 requestedBrakeAccel*=combination.serviceBrakeScale;

 // V21.21.22 hotfix — longitudinal traction/downforce needs the current
 // pre-integration speed. The steering/lateral speedAbs is intentionally declared
 // later, after speed has been integrated for this frame, so do not reference it
 // here (doing so triggers the JS temporal dead zone on the first frame).
 const longitudinalSpeedAbs=Math.abs(speed);

 // V21.21.15 — static tire bite at walking/hairpin speed. Loose terrain
 // still has much less grip than asphalt, but a tire that is barely rolling
 // should not behave as if it were already in a high-slip state. Fade the
 // small static boost out before normal road speed.
 const offroadStaticTractionT=
   1-physicsClamp(Math.abs(speed)/7,0,1);
 const offroadStaticTractionBoost=
   1+.12*offroadStaticTractionT;

 const longitudinalMu=onPavement
   ?Math.max(
      .25,
      ((VEHICLE.longitudinalAccelLimit??VEHICLE.brake??9.8)/9.80665)*
      surfaceGrip
    )
   :Math.max(
      .22,
      (VEHICLE.offroadGrip??.60)*
      awdOffroadGripBonus*
      offroadStaticTractionBoost
    );

 const driveForce=longitudinalTractionLimit({
   vehicle:VEHICLE,requestedAccel:requestedDriveAccel,surfaceMu:longitudinalMu,mode:'drive',airborne:airborneNow,speedAbs:longitudinalSpeedAbs
 },dynamicsScratch.drive);

 const brakeForce=longitudinalTractionLimit({
   vehicle:VEHICLE,requestedAccel:requestedBrakeAccel,surfaceMu:longitudinalMu,mode:'brake',airborne:airborneNow,speedAbs:longitudinalSpeedAbs
 },dynamicsScratch.brake);

 let accel=
   driveForce.acceleration+
   brakeForce.acceleration;

 // Gravity is projected along the actual road/terrain grade. This is a key
 // foundation for heavy vehicles: climbs now cost speed and descents add load
 // instead of every route behaving as if it were level.
 let physicsRoadFrame=onPavement&&nr
   ?roadProfileFrameAtCum(nr.cum,physicsRoadFrameScratch)
   :null;

 if(onPavement&&!physicsRoadFrame){
   ensureRoadProfileNear(absX,absZ);
   physicsRoadFrame=
     (nr?roadProfileFrameAtCum(nr.cum,physicsRoadFrameScratch):null)||
     roadFrameAt(absX,absZ,physicsRoadFrameScratch);
 }

 const gradeForce=computeGradeAcceleration({
   onPavement,roadFrame:physicsRoadFrame,heading,airborne:airborneNow,x:absX,z:absZ,terrainHeightAt:terrainAbs
 },dynamicsScratch.grade);

 accel+=gradeForce.acceleration;

 // Rolling + aerodynamic resistance. In the air only aerodynamic resistance
 // remains; tires cannot provide propulsion, braking or rolling resistance.
 if(Math.abs(speed)>.05){
   const surfaceDrag=onPavement
     ?Math.max(0,(1-surfaceGrip)*.75)
     :VEHICLE.offroadDrag;
   const rollingAndSurface=airborneNow
     ?0
     :VEHICLE.rolling+surfaceDrag;
   const resist=
     rollingAndSurface+
     VEHICLE.aero*speed*speed+
     combination.rollingResistanceAccel+
     combination.aeroDragCoeff*speed*speed;
   accel-=Math.sign(speed)*resist;
 }else if(!throttle&&Math.abs(gradeForce.acceleration)<.04){
   speed=0;
 }

 if(hand&&!airborneNow){
   const handRequest=-Math.sign(speed||gradeForce.acceleration||1)*8.5;
   accel+=longitudinalTractionLimit({
     vehicle:VEHICLE,requestedAccel:handRequest,surfaceMu:longitudinalMu,mode:'handbrake',airborne:false,speedAbs:longitudinalSpeedAbs
   },dynamicsScratch.handbrake).acceleration;
 }

 speed+=accel*dt;

 // V20.6 off-road resistance.
 // Combustion: reduced effective redline naturally lowers every gear's usable
 // speed. If the car enters terrain above that top-gear redline speed, added
 // resistance bleeds the excess progressively rather than snapping speed.
 // EV: preserve the previous 20% off-road electronic reduction.
 if(!airborneNow&&!onPavement&&speed>0){
   const profile=
     activeTransmissionProfile();

   if(profile.type==='combustion'){
     const terrainRedline=
       effectiveEngineRedlineRpm(
         profile,
         false
       );

     const terrainMechanicalTop=
       transmissionRedlineSpeedKmh(
         profile,
         terrainRedline
       )/
       3.6;

     if(speed>terrainMechanicalTop){
       const excess=
         speed-
         terrainMechanicalTop;

       const terrainOverspeedResistance=
         Math.min(
           13.5,
           4.5+
           excess*.55
         );

       speed=
         Math.max(
           terrainMechanicalTop,
           speed-
           terrainOverspeedResistance*
           dt
         );
     }
   }else{
     const offroadEvMax=
       MAX*.80;

     if(speed>offroadEvMax){
       speed=
         Math.max(
           offroadEvMax,
           speed-
           12.5*
           dt
         );
     }
   }
 }

 // Full mechanical setting is NOT hard-clamped for combustion cars. The rev
 // limiter and drag determine their maximum. A deliberately lower user speed
 // setting still behaves as an explicit driver/electronic speed cap.
 const mechanicalTop=
   vehicleTopSpeedKmh();

 const userSpeedCapActive=
   maxSpeedKmh<
   mechanicalTop-.5;

 const hardForwardCap=
   userSpeedCapActive
     ?MAX
     :Infinity;

 const hardReverseCap=vehicleReverseLimitMps();
 speed=
   Math.max(
     hardReverseCap,
     Math.min(
       hardForwardCap,
       speed
     )
   );
 if(previousSpeed>0&&speed<0&&!throttle)speed=0;
 if(previousSpeed<0&&speed>0&&!throttle)speed=0;
 longitudinalAccel=(speed-previousSpeed)/Math.max(dt,.001);

 // ----- V21.21 generalized steering + lateral envelope -----
 const speedAbs=Math.abs(speed);

 // V21.21.19 — physical lane-keep assist. Normal Assist no longer edits the
 // chassis heading or world position after the tire simulation. Instead it
 // aims the FRONT WHEELS toward a preview point in the right-hand lane, and
 // that steering command must pass through the same steering rack, tire
 // friction circle and momentum model as the driver. If the tires cannot make
 // the corner, Assist cannot magically pull the car back onto the road.
 let assistedTurn=turn;
 if(
   assist&&
   !autopilot&&
   !airborneNow&&
   !hand&&
   nr&&
   routeLength&&
   nr.d<9.5&&
   speed>2
 ){
   let routeHeading=nr.angle;
   let routeDirection=1;

   if(
     Math.abs(angleDelta(routeHeading+Math.PI,heading))<
     Math.abs(angleDelta(routeHeading,heading))
   ){
     routeHeading+=Math.PI;
     routeDirection=-1;
   }

   // North-American/right-hand traffic: target the centre of the lane on
   // the driver's RIGHT, not the road centreline. World Drive maps geographic
   // north toward -Z (llToXZ), so for forward=(sin(h),cos(h)) the driver's
   // right-hand normal is (-cos(h),+sin(h)). V21.21.18 accidentally used the
   // opposite normal and therefore targeted the left lane on real routes.
   const laneOffset=1.65;
   const lookAhead=
     Math.max(
       10,
       Math.min(
         36,
         9+speedAbs*.72
       )
     );
   const targetCum=
     Math.max(
       0,
       Math.min(
         routeLength-1,
         nr.cum+routeDirection*lookAhead
       )
     );
   const target=routePointAtCum(targetCum);

   if(target){
     const targetHeading=
       target.angle+
       (routeDirection<0?Math.PI:0);
     const rightX=-Math.cos(targetHeading);
     const rightZ=Math.sin(targetHeading);
     const targetX=target.x+rightX*laneOffset;
     const targetZ=target.z+rightZ*laneOffset;
     const desiredHeading=
       Math.atan2(
         targetX-absX,
         targetZ-absZ
       );
     const assistHeadingError=
       angleDelta(
         desiredHeading,
         heading
       );
     const laneAssist=laneKeepAssistCommand({
       speedAbs,
       headingError:assistHeadingError,
       manualInput:manualTurn,
       frontSlipAmount,
       rearSlipAmount,
       airborne:false,
       handbrake:false
     });

     assistedTurn=
       physicsClamp(
         manualTurn+laneAssist.input,
         -1,
         1
       );
   }
 }

 const steeringModel=steeringCommand({vehicle:VEHICLE,speedAbs,input:assistedTurn},dynamicsScratch.steering);
 // V21.21.25 — finite steering-rack travel. When a profile defines a
 // centre-to-full time, joystick input requests a wheel angle but cannot move
 // the rack there instantaneously. This gives each vehicle a directly tunable
 // steering nervousness without adding fake yaw or grip.
 steer=advanceSteeringRack({
   current:steer,
   target:steeringModel.target,
   dt,
   inputSlewRate:steeringModel.inputSlewRate,
   returnSlewRate:steeringModel.returnSlewRate,
   inputRate:steeringModel.inputRate,
   returnRate:steeringModel.returnRate
 });
 if(steeringModel.target===0&&Math.abs(steer)<.008)steer=0;

 const steerAngle=steer*steeringModel.maxRoadWheelAngle;
 currentSteerAngle=steerAngle;

 const lateralEnvelope=lateralDynamicsEnvelope({
   vehicle:VEHICLE,speed,steerAngle,steerInput:steer,driveThrottle,onPavement,surfaceGrip,awdOffroadGripBonus,rearSlipAmount,airborne:airborneNow
 },dynamicsScratch.lateral);

 let yawRate=
   lateralEnvelope.yawRate*
   truckTrailerSystem.tractorYawScale(speedAbs);
 const drivetrain=lateralEnvelope.drivetrain;
 const powerCorneringLoad=lateralEnvelope.powerCorneringLoad;
 const requestedLatAccel=lateralEnvelope.requestedLatAccel;
 const latLimit=lateralEnvelope.latLimit;
 const signedLatAccel=lateralEnvelope.signedLatAccel;

 gripSolverAccumulator+=dt;
 let perWheelGrip=dynamicsScratch.grip;
 if(
   gripSolverAccumulator>=GRIP_SOLVER_INTERVAL||
   !perWheelGrip?.smoothed?.length
 ){
   const gripDt=Math.min(.10,Math.max(dt,gripSolverAccumulator));
   gripSolverAccumulator%=GRIP_SOLVER_INTERVAL;
   // V21.21.16 — the tire solver must receive the lateral force the chassis
   // can physically develop, not the unbounded kinematic request from full
   // steering lock. Passing a 3–10 g request into a ~1 g tire model made all
   // four tires appear saturated and could create a bogus opposite yaw moment.
   const tireSolverLatAccel=
     Math.min(
       Math.max(0,requestedLatAccel),
       Math.max(0,latLimit)
     );
   const tireSolverSignedLatAccel=
     Math.sign(signedLatAccel||steerAngle||1)*
     tireSolverLatAccel;

   perWheelGrip=estimateWheelGripUsage({
     requestedLatAccel:tireSolverLatAccel,signedLatAccel:tireSolverSignedLatAccel,latLimit,longitudinalAccel,
     propulsionAccel:driveForce.acceleration,serviceBrakeAccel:brakeForce.acceleration,
     surfaceMu:longitudinalMu,
     throttle:driveThrottle,handbrake:hand,airborne:airborneNow,vehicle:VEHICLE,speedAbs,
     contacts:vehiclePresentation?.wheelContacts||[],previousUsage:wheelGripUsage,dt:gripDt
   },dynamicsScratch.grip);
 }

 wheelGripUsage=
   perWheelGrip.smoothed;

 wheelSlipLevels=
   perWheelGrip.slip;

 wheelLateralUsage=
   perWheelGrip.lateralUsage;

 wheelLongitudinalUsage=
   perWheelGrip.longitudinalUsage;

 const targetFrontSlip=
   perWheelGrip.frontLateral;

 const targetRearSlip=
   perWheelGrip.rearLateral;

 // V21.21.12 — real axle-force imbalance from the friction circle. A locked
 // rear axle removes the counter-yaw force that normally balances the front
 // tires, so the chassis gains yaw angular velocity while momentum initially
 // keeps following the old trajectory. No steering/lateral demand = no moment.
 let frictionYawAccel=
   Number.isFinite(perWheelGrip.frictionYawAccel)
     ?perWheelGrip.frictionYawAccel
     :0;

 // V21.21.12 — the friction circle now feeds both rotational and translational
 // dynamics. Losing rear lateral force must not only rotate the chassis: the
 // center-of-mass trajectory also has less lateral force available, which is
 // what creates a visibly large slip angle instead of a car that still follows
 // the corner almost perfectly while its nose yaws.
 const netLateralAccel=
   Number.isFinite(perWheelGrip.netLateralAccel)
     ?perWheelGrip.netLateralAccel
     :signedLatAccel;
 const rearLateralForceScale=
   Number.isFinite(perWheelGrip.rearLateralForceScale)
     ?physicsClamp(perWheelGrip.rearLateralForceScale,0,1)
     :1;
 const rearLateralForceLoss=
   Math.abs(signedLatAccel)>.15
     ?1-rearLateralForceScale
     :0;

 const slipDt=
   Math.min(
     .05,
     dt
   );

 // V21.21.14 — at parking/neighbourhood speed, tire slip should disappear
 // very quickly once the demand falls back under static friction. Keeping the
 // old high-speed decay here made a tiny transient slip feel like the car was
 // gently skating sideways in the opposite direction of the turn.
 const lowSpeedSlipReleaseBoost=
   1+
   (1-physicsClamp(speedAbs/8,0,1))*1.6;

 frontSlipAmount+=
   (
     targetFrontSlip-
     frontSlipAmount
   )*
   (
     1-
     Math.exp(
       -slipDt*
       (
         targetFrontSlip>
         frontSlipAmount
           ?7.8
           :5.8*lowSpeedSlipReleaseBoost
       )
     )
   );

 rearSlipAmount+=
   (
     targetRearSlip-
     rearSlipAmount
   )*
   (
     1-
     Math.exp(
       -slipDt*
       (
         targetRearSlip>
         rearSlipAmount
           ?7.8
           :5.8*lowSpeedSlipReleaseBoost
       )
     )
   );

 if(airborneNow){
   frontSlipAmount*=
     Math.exp(
       -dt*5
     );

   rearSlipAmount*=
     Math.exp(
       -dt*5
     );
 }

 // Raw tire demand is measured exactly where the physics reaches its grip
 // ceiling, rather than reconstructed later from joystick/steering angle.
 const rawGripUsage=
   onPavement&&
   !airborneNow&&
   latLimit>0
     ?Math.min(
        1.35,
        requestedLatAccel/
        latLimit
      )
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
   yawRate*=
     latLimit/
     requestedLatAccel;
 }

 // ---------------------------------------------------------------
 // V20.2 AXLE BALANCE
 // ---------------------------------------------------------------
 // Front slip primarily causes understeer. Rear slip primarily causes
 // oversteer. If both axles are saturated, the entire car slides and steering
 // authority falls instead of the physics continuing to corner perfectly at
 // the grip limit.
 const frontDominance=
   Math.max(
     0,
     frontSlipAmount-
     rearSlipAmount*.55
   );

 const rearDominance=
   Math.max(
     0,
     rearSlipAmount-
     frontSlipAmount*.55
   );

 const fourWheelSlide=
   Math.min(
     frontSlipAmount,
     rearSlipAmount
   );

 if(!airborneNow){
   // Front saturation = the car refuses additional steering input.
   yawRate*=
     Math.max(
       .46,
       1-
       frontDominance*.54-
       fourWheelSlide*.24
     );
 }

 if(
   drivetrain==='RWD'&&
   powerCorneringLoad>.05&&
   !airborneNow
 ){
   // Power-oversteer remains a small vehicle-personality term, but only the
   // REAR-DOMINANT part can amplify rotation.
   const powerOversteerYaw=
     VEHICLE.powerOversteerYaw??
     .035;

   const rearSlipYaw=
     Math.sign(steer||1)*
     powerOversteerYaw*
     powerCorneringLoad*
     (
       .30+
       rearDominance*.70
     )*
     Math.min(
       1,
       speedAbs/18
     );

   yawRate+=
     rearSlipYaw*
     Math.sign(speed||1);
 }

 if(
   rearDominance>.015&&
   !airborneNow&&
   speedAbs>4
 ){
   // V21.21.13 — this older rear-slip yaw helper predates the real axle-force
   // moment added in V21.21.11/12. Keep its useful low/medium-speed character,
   // but progressively fade it at high speed so it does not stack on top of
   // the force-coupled model and make the rear break away too eagerly.
   const highSpeedRearStabilityT=
     physicsClamp(
       (speedAbs-25)/30,
       0,
       1
     );
   const legacySlipYawScale=
     1-
     highSpeedRearStabilityT*.55;

   const slipYaw=
     Math.sign(
       yawRate||
       steerAngle||
       1
     )*
     rearDominance*
     Math.min(
       .135,
       .040+
       speedAbs*.0022
     )*
     legacySlipYawScale;

   yawRate+=
     slipYaw*
     Math.sign(speed||1);
 }

 // V21.21.16 — front saturation is understeer, not reverse steering.
 // Under AWD acceleration the old force-loss sum could be dominated by the
 // unloaded front axle and produce a yaw acceleration opposite the commanded
 // turn. Front slip already reduces yawRate above, so do not integrate an
 // opposing friction moment while the driver is actively commanding a turn.
 // Same-sign rear-loss moments (handbrake / power oversteer) remain intact.
 if(
   Math.abs(steerAngle)>.006&&
   Math.abs(yawRate)>1e-5&&
   frictionYawAccel*yawRate<0
 ){
   frictionYawAccel=0;
 }

 // ---------------------------------------------------------------
 // HIGH-SPEED LATERAL FORCE BUILDUP
 // ---------------------------------------------------------------
 // The old model applied target yaw almost immediately. A real tire/chassis
 // needs time to build lateral force, and that response should become calmer
 // as speed rises.
 const yawResponse=yawResponseRate({
   vehicle:VEHICLE,
   speedAbs,
   airborne:airborneNow
 });

 const yawReleaseBoost=
   Math.abs(yawRate)<
   Math.abs(dynamicYawRate)
     ?1.35
     :1;

 // A rear axle with little lateral authority cannot also provide the strong
 // stabilizing cornering stiffness that normally drags yaw rate back toward
 // the bicycle-model target. Keep angular momentum while the rear is locked,
 // then restore the normal damping as soon as rear grip returns.
 const frictionYawLoss=
   physicsClamp(
     Math.abs(frictionYawAccel)/4.5,
     0,
     1
   );
 const forceCoupledSlide=
   physicsClamp(
     Math.max(
       frictionYawLoss,
       rearLateralForceLoss
     ),
     0,
     1
   );
 const yawGripResponseScale=
   Math.max(
     .34,
     1-forceCoupledSlide*.66
   );

 // Integrate the tire-force yaw moment directly. This is deliberately not a
 // `handbrake => yaw` shortcut: frictionYawAccel is zero unless there is actual
 // signed lateral force demand and an axle loses lateral capacity.
 dynamicYawRate+=
   frictionYawAccel*dt;

 dynamicYawRate+=
   (
     yawRate-
     dynamicYawRate
   )*
   (
     1-
     Math.exp(
       -dt*
       yawResponse*
       yawReleaseBoost*
       yawGripResponseScale
     )
   );

 heading+=
   dynamicYawRate*
   dt;

 // Four-wheel sliding scrubs speed away. This makes entering a corner far
 // beyond the efficient limit cost trajectory and speed instead of behaving
 // like a perfect constant-G turn.
 if(
   !airborneNow&&
   fourWheelSlide>.01&&
   speedAbs>6
 ){
   const scrubDecel=
     (
       1.0+
       fourWheelSlide*
       3.2
     );

   const scrubDelta=
     scrubDecel*
     dt;

   if(speed>0){
     speed=
       Math.max(
         0,
         speed-
         scrubDelta
       );
   }else if(speed<0){
     speed=
       Math.min(
         0,
         speed+
         scrubDelta
       );
   }
 }

 // Autopilot retains its own stronger recovery logic. Normal Assist is
 // intentionally absent here: V21.21.19 performs lane keeping exclusively by
 // steering the front wheels BEFORE tire forces are resolved.
 if(
   !airborneNow&&
   assist&&
   autopilot&&
   nr&&
   nr.d<12&&
   speedAbs>2
 ){
   let routeHeading=nr.angle;

   if(
     Math.abs(angleDelta(routeHeading+Math.PI,heading))<
     Math.abs(angleDelta(routeHeading,heading))
   ){
     routeHeading+=Math.PI;
   }

   const hErr=
     angleDelta(routeHeading,heading);

   heading+=
     hErr*dt*.55;

   if(nr.d>.55){
     const centerRate=.48;
     absX+=(nr.px-absX)*(1-Math.exp(-dt*centerRate));
     absZ+=(nr.pz-absZ)*(1-Math.exp(-dt*centerRate));
   }
 }

 // Direction of travel follows chassis heading almost instantly while the
 // tires are hooked up. During rear slip it lags progressively, creating a
 // real sideslip angle: the nose turns while momentum carries the car outward.
 if(
   !Number.isFinite(
     velocityHeading
   )||
   Math.abs(speed)<1.2
 ){
   velocityHeading=heading;
 }

 const trajectoryRearSlip=
   Math.max(
     0,
     rearSlipAmount-
     frontSlipAmount*.45
   );

 // When the friction circle has actually removed rear lateral force, momentum
 // should keep travelling on its old vector longer than the normal rear-slip
 // heuristic allowed. This is still force-driven: in a straight line
 // frictionYawAccel is zero and the historical trajectory-follow rate is kept.
 const frictionTrajectoryLoss=frictionYawLoss;

 // V21.21.14 — low-speed no-slip region. Below roughly 30 km/h, a normal
 // unsaturated tire should behave almost kinematically: the contact patches
 // roll where the front wheels point instead of carrying a persistent sideslip
 // angle from the transient tire solver. This is bypassed as soon as there is
 // a genuine breakaway (handbrake / saturated axle), so low-speed drift remains
 // possible when the tires are actually sliding.
 const lowSpeedNoSlip=
   !airborneNow&&
   speedAbs<8.5&&
   forceCoupledSlide<.18&&
   frontSlipAmount<.16&&
   rearSlipAmount<.16;

 if(lowSpeedNoSlip){
   if(speedAbs<2.5){
     velocityHeading=heading;
   }else{
     const lowSpeedLockT=
       1-physicsClamp((speedAbs-2.5)/6.0,0,1);
     const lowSpeedFollowRate=
       34+
       lowSpeedLockT*48;

     velocityHeading+=
       angleDelta(
         heading,
         velocityHeading
       )*
       (
         1-
         Math.exp(
           -dt*lowSpeedFollowRate
         )
       );
   }
 }
 // During a real rear breakaway, integrate the direction of travel from the
 // *remaining net lateral tire force* rather than simply making it chase the
 // chassis heading. V21.21.17 then caps the COMPLETE trajectory correction by
 // a_lat / v, so neither normal cornering nor service braking can rotate linear
 // momentum faster than the remaining tire friction physically allows.
 else{
   let attemptedTrajectoryDelta=0;

   if(
     !airborneNow&&
     speedAbs>4&&
     forceCoupledSlide>.10
   ){
     const signedSpeedForCurvature=
       Math.abs(speed)>.5
         ?speed
         :Math.sign(speed||1)*.5;
     const forceTrajectoryYawRate=
       netLateralAccel/
       signedSpeedForCurvature;

     attemptedTrajectoryDelta+=
       forceTrajectoryYawRate*dt;

     const slideAlignmentRate=
       .65+
       (1-forceCoupledSlide)*3.20;

     attemptedTrajectoryDelta+=
       angleDelta(
         heading,
         velocityHeading
       )*
       (
         1-
         Math.exp(
           -dt*slideAlignmentRate
         )
       );
   }else{
     const velocityFollowRate=
       airborneNow
         ?0
         :(
            (2.8-1.45*frictionTrajectoryLoss)+
            27.2*
            Math.pow(
              1-
              physicsClamp(
                trajectoryRearSlip,
                0,
                1
              ),
              2
            )
          );

     attemptedTrajectoryDelta+=
       angleDelta(
         heading,
         velocityHeading
       )*
       (
         1-
         Math.exp(
           -dt*velocityFollowRate
         )
       );
   }

   const trajectoryLateralCapacityAccel=
     Number.isFinite(perWheelGrip.trajectoryLateralCapacityAccel)
       ?Math.max(0,perWheelGrip.trajectoryLateralCapacityAccel)
       :Math.max(0,latLimit);

   velocityHeading+=
     limitMomentumHeadingDelta({
       attemptedDelta:attemptedTrajectoryDelta,
       speedAbs,
       lateralCapacityAccel:trajectoryLateralCapacityAccel,
       dt,
       airborne:airborneNow
     });
 }

 absX+=
   Math.sin(
     velocityHeading
   )*
   speed*
   dt;

 absZ+=
   Math.cos(
     velocityHeading
   )*
   speed*
   dt;

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
 currentOnPavementForInstruments=!!onRoad;
 const contactModeText=onRoad?'Route':'Terrain';
 if(contactModeText!==lastContactModeText){
   lastContactModeText=contactModeText;
   $('contactMode').textContent=contactModeText;
 }

 // Competitive run uses the same final Route/Terrain contact decision as HUD
 // and vehicle support, so penalties match what the player actually sees.
 updateRunChallenge(
   onRoad,
   nr
 );

 const terrainFrame=!onRoad?terrainFrameAt(absX,absZ,heading):null;

 // V21.21.5: reuse the road frame we already resolved above. Calling
 // roadSurfaceAt() here performed another nearest-segment search for the exact
 // same chassis center. The equivalent rolled surface height is reconstructed
 // directly and then reused by the four wheel support samples.
 let centerRoadSurfaceY=null;
 if(onRoad&&roadFrame){
   const normalX=-Math.cos(roadFrame.angle||0);
   const normalZ=Math.sin(roadFrame.angle||0);
   const centerLateral=(absX-roadFrame.px)*normalX+(absZ-roadFrame.pz)*normalZ;
   centerRoadSurfaceY=roadFrame.y+Math.tan(roadFrame.roll||0)*centerLateral+ROAD_SURFACE_OFFSET;
 }
 setFastWheelRoadSupport(onRoad,roadFrame,centerRoadSurfaceY);

 const baseGround=onRoad
   ?(centerRoadSurfaceY??roadFrame.y+ROAD_SURFACE_OFFSET)
   :(terrainFrame?terrainFrame.y:terrainAbs(absX,absZ));

 const targetY=
   baseGround+
   .38+
   (onRoad?TIRE_VISUAL_CLEARANCE:0);

 car.position.x=rx;
 car.position.z=rz;

 // V20.0: vehiclePresentation owns root Y on both pavement and terrain.
 // It may follow support geometry or continue ballistically while airborne.

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
   wheelGripUsage,
   wheelSlipLevels,
   wheelLateralUsage,
   wheelLongitudinalUsage,
   longitudinalAccel,
   handbrake:hand,
   vehicle:VEHICLE,
   dt
 });

 driveHudAccumulator+=dt;
 minimapAccumulator+=dt;

 if(driveHudAccumulator>=DRIVE_HUD_INTERVAL){
   driveHudAccumulator%=DRIVE_HUD_INTERVAL;
   $('speed').textContent=Math.round(Math.abs(speed)*3.6);
   const llNow=xzToLL(absX,absZ);
   const realElev=elevationService.elevationAt(llNow.lat,llNow.lon);
   altitudeEl.textContent=realElev!==null&&Number.isFinite(realElev)?Math.round(realElev):'—';
   const frameNow=roadFrameAt(absX,absZ);
   $('grade').textContent=frameNow?(Math.tan(frameNow.pitch)*100).toFixed(1):'0.0';

   if(nr){
     const pct=100*nr.cum/routeLength;
     $('progress').textContent=pct.toFixed(1);
     $('doneKm').textContent=(nr.cum/1000).toFixed(1);
     $('remainKm').textContent=((routeLength-nr.cum)/1000).toFixed(1);
     $('roadDist').textContent=Math.round(nr.d);
     updatePassedSignReadout(nr);
   }
 }

 if(nr&&minimapAccumulator>=MINIMAP_INTERVAL){
   minimapAccumulator%=MINIMAP_INTERVAL;
   drawMap(nr.cum);
 }

 // Streaming boundaries move slowly relative to vehicle physics. Checking
 // them at ~8 Hz removes main-thread work from every animation frame while
 // preserving exactly the same load distances and world detail.
 worldStreamingAccumulator+=dt;
 if(worldStreamingAccumulator>=WORLD_STREAMING_INTERVAL){
   worldStreamingAccumulator%=WORLD_STREAMING_INTERVAL;
   worldStreaming.updateVisible(absX,absZ);
 }
}

function toggleAssist(){
 if(autopilot){setAutopilot(false,'Pilote auto désactivé');}
 assist=!assist;
 appSettings.assist=assist;
 queueSettingsSave();
 $('assist').textContent='Assist: '+(assist?'ON':'OFF');
 syncV21RuntimeControls();
 toast('Assistance '+(assist?'activée':'désactivée'));
}

function placeAt(frac){
 const p=routePointAt(frac);
 absX=p.x;absZ=p.z;heading=p.angle;
 speed=0;steer=0;visualSteer=0;currentSteerAngle=0;
 driveHudAccumulator=DRIVE_HUD_INTERVAL;minimapAccumulator=MINIMAP_INTERVAL;
 longitudinalAccel=0;lateralGripUsage=0;
 const physicsWheelCount=Math.max(
   4,
   (VEHICLE.axles||[]).reduce(
     (sum,axle)=>sum+(Number(axle.wheelCount)||0),
     0
   )
 );
 wheelGripUsage=Array(physicsWheelCount).fill(0);
 wheelSlipLevels=Array(physicsWheelCount).fill(0);
 wheelLateralUsage=Array(physicsWheelCount).fill(0);
 wheelLongitudinalUsage=Array(physicsWheelCount).fill(0);
 frontSlipAmount=0;rearSlipAmount=0;dynamicYawRate=0;velocityHeading=heading;
 resetTransmissionState();vehiclePresentation.reset();skidMarks.resetSource('local');
 roadContact=true;recenterIfNeeded(absX,absZ,true);ensureRoadProfileNear(absX,absZ);

 // On stacked mountain roads, roadSurfaceAt(X,Z) can legitimately see two
 // branches at the same horizontal position. Spawn by ROUTE CUMULATIVE DISTANCE
 // instead so 0% always means the actual first road segment.
 const placedFrame=roadProfileFrameAtCum(p.cum);
 if(placedFrame){
   absX=placedFrame.x;
   absZ=placedFrame.z;
   heading=placedFrame.angle;
   velocityHeading=heading;
 }
 const placedY=(placedFrame?.y??roadHeightAt(absX,absZ))+ROAD_SURFACE_OFFSET;
 car.position.set(
   absX-worldOffset.x,
   placedY+.38+TIRE_VISUAL_CLEARANCE,
   absZ-worldOffset.z
 );
 if(truckTrailerSystem.active){
   truckTrailerSystem.resetPose(absX,absZ,heading);
 }
 drawMap(p.cum);
}
function resetToRoad(){
 const n=nearestRoute(absX,absZ);
 if(!n)return;
 absX=n.px;absZ=n.pz;heading=n.angle;speed=0;
 driveHudAccumulator=DRIVE_HUD_INTERVAL;
 minimapAccumulator=MINIMAP_INTERVAL;
 gripSolverAccumulator=GRIP_SOLVER_INTERVAL;
 steer=0;visualSteer=0;currentSteerAngle=0;
 longitudinalAccel=0;lateralGripUsage=0;
 const physicsWheelCount=Math.max(
   4,
   (VEHICLE.axles||[]).reduce(
     (sum,axle)=>sum+(Number(axle.wheelCount)||0),
     0
   )
 );
 wheelGripUsage=Array(physicsWheelCount).fill(0);
 wheelSlipLevels=Array(physicsWheelCount).fill(0);
 wheelLateralUsage=Array(physicsWheelCount).fill(0);
 wheelLongitudinalUsage=Array(physicsWheelCount).fill(0);
 frontSlipAmount=0;rearSlipAmount=0;dynamicYawRate=0;velocityHeading=heading;
 resetTransmissionState();vehiclePresentation.reset();skidMarks.resetSource('local');
 roadContact=true;recenterIfNeeded(absX,absZ,true);ensureRoadProfileNear(absX,absZ);
 if(truckTrailerSystem.active){
   truckTrailerSystem.resetPose(absX,absZ,heading);
 }
}

const maxSpeedSlider=$('maxSpeedSlider');
const maxSpeedLabel=$('maxSpeedLabel');
const speedLimitModeBtn=$('speedLimitModeBtn');

function updateSpeedLimitModeUI(){
  if(!speedLimitModeBtn)return;

  speedLimitModeBtn.textContent=
    'Limites route: '+
    (
      obeyRoadSpeedLimits
        ?'ON'
        :'OFF'
    );

  speedLimitModeBtn.classList.toggle(
    'active',
    obeyRoadSpeedLimits
  );

  speedLimitModeBtn.title=
    obeyRoadSpeedLimits
      ?'Le pilote automatique respecte les limites OSM'
      :'Le pilote automatique ignore les limites OSM';
}

function toggleRoadSpeedLimits(){
  obeyRoadSpeedLimits=
    !obeyRoadSpeedLimits;

  appSettings.obeyRoadSpeedLimits=
    obeyRoadSpeedLimits;

  queueSettingsSave();

  updateSpeedLimitModeUI();
  syncV21RuntimeControls();

  if(
    obeyRoadSpeedLimits&&
    activeRoadMeta.maxspeed
  ){
    toast(
      `Limites route ON · ${Math.round(activeRoadMeta.maxspeed)} km/h`
    );
  }else{
    toast(
      'Limites route '+
      (
        obeyRoadSpeedLimits
          ?'ON'
          :'OFF'
      )
    );
  }
}

function vehicleTopSpeedKmh(){
  const profile=
    activeTransmissionProfile();

  if(profile.type==='combustion'){
    return transmissionRedlineSpeedKmh(
      profile,
      Number(profile.redlineRpm)||6500
    );
  }

  // EVs retain their electronic vehicle-profile limiter.
  return Math.max(
    20,
    Number(VEHICLE.topSpeedKmh)||200
  );
}

// V21: the player speed slider is gone.
// MAX now follows the vehicle's real mechanical/electronic capability.
function syncVehicleSpeedCapability(){
  const top=
    vehicleTopSpeedKmh();

  maxSpeedKmh=top;
  MAX=top/3.6;

  if(maxSpeedSlider){
    maxSpeedSlider.max=String(top);
    maxSpeedSlider.value=String(top);
    maxSpeedSlider.disabled=true;
  }

  if(maxSpeedLabel){
    maxSpeedLabel.textContent=
      Math.round(top);
  }

  syncV21VehicleInfo();
}

if(speedLimitModeBtn){
  speedLimitModeBtn.onclick=
    toggleRoadSpeedLimits;
}

updateSpeedLimitModeUI();
syncVehicleSpeedCapability();

resetTransmissionState();

const vehicleSelect=$('vehicleSelect');

// V20.11 transmission selector.
// Created at runtime so the patch does not replace the user's current HTML/CSS.
const transmissionModeControl=
  document.createElement('div');

transmissionModeControl.id=
  'transmissionModeControl';

transmissionModeControl.style.cssText=`
  margin-top:8px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  font-size:11px;
`;

const transmissionModeLabel=
  document.createElement('span');

transmissionModeLabel.textContent=
  'Transmission';

transmissionModeLabel.style.cssText=`
  color:#9fb1c2;
  font-weight:700;
`;

const transmissionModeSelect=
  document.createElement('select');

transmissionModeSelect.id=
  'transmissionModeSelect';

transmissionModeSelect.innerHTML=`
  <option value="automatic">Automatique</option>
  <option value="manual">Manuelle</option>
`;

transmissionModeSelect.value=
  'automatic';

transmissionModeSelect.style.cssText=`
  min-width:118px;
  padding:4px 7px;
  border-radius:6px;
  border:1px solid rgba(255,255,255,.16);
  background:#26313a;
  color:#fff;
  font:inherit;
`;

transmissionModeSelect.addEventListener(
  'change',
  ()=>{
    transmissionMode=
      transmissionModeSelect.value==='manual'
        ?'manual'
        :'automatic';

    manualShiftRequest=null;

    appSettings.transmissionMode=
      transmissionMode;

    queueSettingsSave();
    syncV21RuntimeControls();

    toast(
      transmissionMode==='manual'
        ?'Transmission manuelle · [ / X rétrograder · ] / A monter'
        :'Transmission automatique'
    );
  }
);

if(vehicleSelect?.parentElement){
  transmissionModeControl.append(
    transmissionModeLabel,
    transmissionModeSelect
  );

  vehicleSelect.parentElement.appendChild(
    transmissionModeControl
  );
}

function applyVehicleSelection(
  id,
  {
    announce=true
  }={}
){
  const exists=
    vehicleSystem
      .list()
      .some(
        profile=>
          profile.id===id
      );

  if(!exists){
    return false;
  }

  if(autopilot){
    setAutopilot(
      false,
      'Pilote auto désactivé'
    );
  }

  const changed=
    vehicleSystem.select(id);

  if(
    !changed&&
    vehicleSystem.activeId!==id
  ){
    return false;
  }

  speed=0;
  steer=0;
  visualSteer=0;
  currentSteerAngle=0;
  longitudinalAccel=0;
  lateralGripUsage=0;
  const physicsWheelCount=Math.max(
    4,
    (VEHICLE.axles||[]).reduce(
      (sum,axle)=>sum+(Number(axle.wheelCount)||0),
      0
    )
  );
  wheelGripUsage=Array(physicsWheelCount).fill(0);
  wheelSlipLevels=Array(physicsWheelCount).fill(0);
  wheelLateralUsage=Array(physicsWheelCount).fill(0);
  wheelLongitudinalUsage=Array(physicsWheelCount).fill(0);
  gripSolverAccumulator=GRIP_SOLVER_INTERVAL;
  frontSlipAmount=0;
  rearSlipAmount=0;
  dynamicYawRate=0;
  velocityHeading=heading;

  resetTransmissionState();
  vehiclePresentation.reset();

  // Release passenger GLB ownership before generic/truck visibility changes.
  countachBrakeLightRequested=false;
  countachReverseLightRequested=false;
  countachGlbSystem.setActive(false);
  id4GlbSystem.setActive(false);
  wrxGlbSystem.setActive(false);
  civicGlbSystem.setActive(false);
  sonataGlbSystem.setActive(false);
  f1GlbSystem.setActive(false);
  i3GlbSystem.setActive(false);

  if(truckTrailerSystem.isTruckProfile(id)){
    truckTrailerSystem.setActive(
      true,
      {absX,absZ,heading}
    );
  }else{
    // Restore passenger meshes before vehicle-visuals applies the newly
    // selected profile, otherwise stale pre-truck visibility could win.
    truckTrailerSystem.setActive(false);
    vehicleVisuals.applyVehicleVisualProfile();
    // External authored GLBs replace their procedural body + visible wheels.
    // Hidden wheel pivots remain the unchanged suspension/physics probes.
    countachGlbSystem.setActive(id==='countach_80');
    id4GlbSystem.setActive(id==='id4');
    wrxGlbSystem.setActive(id==='wrx');
    civicGlbSystem.setActive(id==='civic');
    sonataGlbSystem.setActive(id==='sonata');
    f1GlbSystem.setActive(id==='f1_2010');
    i3GlbSystem.setActive(id==='i3_2017');
  }
  vehicleAudio.setProfile(
    vehicleSystem.active.audio
  );

  syncVehicleSpeedCapability();

  if(vehicleSelect){
    vehicleSelect.value=
      vehicleSystem.activeId;
  }

  syncV21VehicleInfo();

  if(announce){
    toast(
      `Véhicule: ${vehicleSystem.active.name} · ${vehicleSystem.active.description}`
    );
  }

  return true;
}

if(vehicleSelect){
  vehicleSystem.populateSelect(
    vehicleSelect
  );

  vehicleSelect.addEventListener(
    'change',
    event=>{
      applyVehicleSelection(
        event.target.value
      );
    }
  );
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
function applyPreset(start,end,waypoints=[]){
  const presetWaypoints=Array.isArray(waypoints)?waypoints:[];

  $('waypointsInput').value=
    presetWaypoints
      .map(point=>point.name||`${point.lat}, ${point.lon}`)
      .join('\n');

  selectedStart={...start};selectedEnd={...end};
  $('startPlace').value=start.name;$('endPlace').value=end.name;
  $('startLat').value=start.lat;$('startLon').value=start.lon;
  $('endLat').value=end.lat;$('endLon').value=end.lon;
  createRequestedRoute(
    {...start},
    {...end},
    presetWaypoints.map(point=>({...point}))
  );
}
$('preset389Btn').addEventListener('click',()=>applyPreset(MANIC2,MANIC5));
$('preset169Btn').addEventListener('click',()=>applyPreset(R169_START,R169_END));
$('preset132Btn').addEventListener('click',()=>applyPreset(R132_START,R132_END));

// V21.14: add Yungas without requiring an index.html replacement. The planner
// is later moved wholesale into the V21 Route tab, so this button follows it.
const presetGrid=document.querySelector('#plannerBox .presetGrid');
if(presetGrid&&!$('presetYungasBtn')){
  const button=document.createElement('button');
  button.id='presetYungasBtn';
  button.type='button';
  button.textContent='☠ Yungas · Chuspipata → Yolosa';
  button.title='Camino de la Muerte · Bolivie';
  button.addEventListener(
    'click',
    ()=>applyPreset(
      YUNGAS_START,
      YUNGAS_END,
      YUNGAS_WAYPOINTS
    )
  );
  presetGrid.appendChild(button);
}


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

// ---------- instrument cluster + compass ----------
const instrumentCluster=createInstrumentCluster({
  physicsClamp,
  activeTransmissionProfile,
  effectiveEngineRedlineRpm,
  vehicleTopSpeedKmh,
  vehicleSystem,
  getState:()=>({
    currentOnPavementForInstruments,
    engineRpm,
    speed,
    transmissionShifting,
    transmissionGear,
    revLimiterActive,
    transmissionMode,
    heading
  })
});
const {
  setGameControlsHidden,
  drawSpeedometer,
  drawCompass
}=instrumentCluster;

// ---------- minimap + transient sign readout ----------
const minimapSystem=createMinimapSystem({
  routePointAt,
  multiplayer,
  llToXZ,
  getState:()=>({
    route,
    routeLength,
    geographicSigns,
    roadGuideSign:currentRoadGuideSign,
    routeStart:ROUTE_START,
    routeEnd:ROUTE_END
  })
});
const {
  resetSignReadout:resetMinimapSignReadout,
  prepMap,
  drawMap,
  updatePassedSignReadout
}=minimapSystem;

// ---------- unified streamed-world coordinator ----------
streamingCoordinator=createStreamingCoordinator({
  createWorldStreaming,
  toLatLon:(x,z)=>xzToLL(x,z),
  nearestRoute:(x,z)=>nearestRoute(x,z),
  routePointAtCum:cum=>routePointAtCum(cum),
  routePointAtFraction:f=>routePointAt(f),
  getRouteLength:()=>routeLength,
  getRoutePointCount:()=>route.length,
  elevationService,
  waterData,
  sceneryData,
  imageryService,
  getRoadMetadataState:()=>({center:lastRoadMetaCenter,loading:roadMetaLoading}),
  signData,
  loadElevationAround,
  loadWaterAround,
  loadSceneryAround,
  buildImageryMosaic,
  loadRoadMetadataAround,
  loadGeographicSignsAround,
  fetchCached:(namespace,ll,query,timeoutMs,ttlMs)=>
    fetchOverpassCached(namespace,ll,query,timeoutMs,ttlMs),
  streamedWorldGroups,
  ground,
  terrainService,
  camera,
  camTarget,
  car,
  resetStreamedWorldOrigins,
  rebuildLocalWorld,
  applyImageryToGround,
  markStaticShadowsDirty,
  getRuntimeState:()=>({
    absX,absZ,heading,speed,
    gameStarted,
    menuOpen:v21MenuOpen,
    worldOffset
  }),
  setWorldOffset:value=>{worldOffset=value;}
});
const worldStreaming=streamingCoordinator.worldStreaming;
const prefetchRouteAhead=()=>streamingCoordinator.prefetchRouteAhead();
const primeInitialTerrainPreloadBuffer=()=>streamingCoordinator.primeInitialTerrainPreloadBuffer();
const promiseWithTimeout=(promise,timeoutMs)=>streamingCoordinator.promiseWithTimeout(promise,timeoutMs);

const DISPLAY_DISTANCE_PROFILES={
  low:{
    label:'Basse',
    cameraFar:3200,
    fogDensity:.00102,
    streamingScale:.96
  },

  medium:{
    label:'Moyenne',
    cameraFar:4500,
    fogDensity:.00082,
    streamingScale:1.32
  },

  high:{
    label:'Haute',
    cameraFar:6500,
    fogDensity:.00058,
    streamingScale:1.82
  }
};

function applyDisplayDistanceProfile(
  requestedProfile,
  {
    save=false
  }={}
){
  const key=
    DISPLAY_DISTANCE_PROFILES[
      requestedProfile
    ]
      ?requestedProfile
      :'high';

  const profile=
    DISPLAY_DISTANCE_PROFILES[key];

  appSettings.displayDistance=key;

  camera.far=
    profile.cameraFar;

  camera.updateProjectionMatrix();

  if(scene.fog){
    scene.fog.density=
      profile.fogDensity;
  }

  worldStreaming.setDistanceScale?.(
    profile.streamingScale
  );

  if(save){
    queueSettingsSave();
  }

  const select=$('v21DisplayDistance');

  if(select){
    select.value=key;
  }

  return key;
}

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

// ---------- V21 menu facade ----------

function ensureV21MenuSystem(){
  if(v21MenuSystem)return v21MenuSystem;
  v21MenuSystem=createV21MenuSystem({
    WORLD_DRIVE_VERSION_LABEL,
    DEFAULT_WORLD_SETTINGS,
    appSettings,
    vehicleSystem,
    vehicleSelect,
    transmissionModeSelect,
    timeSlider,
    timeLabel,
    vehicleTopSpeedKmh,
    keyboardCodes,
    clearKeyboardState,
    queueSettingsSave,
    cloneDefaultControls,
    applyDisplayDistanceProfile,
    imageryService,
    vehicleAudio,
    multiplayer,
    cameraController,
    toggleAssist,
    toggleRoadSpeedLimits,
    toggleAutopilot,
    resetToRoad,
    getWorldCacheStats,
    clearWorldDriveCache,
    toast,
    getRuntimeState:()=>({assist,obeyRoadSpeedLimits,transmissionMode,autopilot}),
    getKeyboardRebindAction:()=>keyboardRebindAction,
    setKeyboardRebindAction:value=>{keyboardRebindAction=value;},
    onMenuOpenChange:open=>{v21MenuOpen=!!open;}
  });
  return v21MenuSystem;
}
function installV21Menu(){ensureV21MenuSystem().install();}
function syncV21RuntimeControls(){v21MenuSystem?.syncRuntimeControls();}
function syncV21VehicleInfo(){v21MenuSystem?.syncVehicleInfo();}
function applyV21DisplayVisibility(){v21MenuSystem?.applyDisplayVisibility();}
function showV21MenuButton(){v21MenuSystem?.showButton();}

async function applyLoadedV21Settings(){
  transmissionMode=
    appSettings.transmissionMode===
    'manual'
      ?'manual'
      :'automatic';

  assist=
    appSettings.assist!==false;

  obeyRoadSpeedLimits=
    appSettings.obeyRoadSpeedLimits!==false;

  updateSpeedLimitModeUI();

  if(
    imageryService.enabled!==
    !!appSettings.imageryEnabled
  ){
    imageryService.toggle();
  }

  applyDisplayDistanceProfile(
    appSettings.displayDistance||
    'high'
  );

  applyV21DisplayVisibility();

  if($('assist')){
    $('assist').textContent=
      'Assist: '+
      (
        assist
          ?'ON'
          :'OFF'
      );
  }

  if(transmissionModeSelect){
    transmissionModeSelect.value=
      transmissionMode;
  }

  syncV21RuntimeControls();
}

$('clearHydroCacheBtn').addEventListener('click',async()=>{
  try{
    const confirmed=
      window.confirm(
        'Vider toute la cache World Drive et réinitialiser les réglages par défaut ?'
      );

    if(!confirmed)return;

    await clearWorldDriveCache();

    toast(
      'Cache vidée · retour aux réglages par défaut'
    );

    setTimeout(
      ()=>location.reload(),
      260
    );
  }catch(e){
    console.warn(e);
    toast('Impossible de vider le cache');
  }
});

setTimeOfDay(12);

// V21.22.3 diagnostics are kept in memory so observing them cannot itself
// cause a periodic console/devtools hitch. Inspect manually if needed:
// window.WorldDriveFramePacing()
window.WorldDriveFramePacing=()=>({
  fps:perfGovernor.fps,
  ...(streamingCoordinator?.diagnostics?.()||{})
});

// ---------- main ----------
function animate(now){
 requestAnimationFrame(animate);
 updateFpsAndGovernor(now);
 const rawFrameMs=(now-last)||16;
 const dt=Math.min(.033,rawFrameMs/1000||.016);last=now;
 streamingCoordinator?.recordFrame(rawFrameMs,now);
 try{
   const simStart=performance.now();
   if(
     gameStarted&&
     !v21MenuOpen
   ){
     gamepad.update();
     updateDrive(dt);
     truckTrailerSystem.update(
       dt,
       {
         absX,
         absZ,
         heading,
         speed,
         steerAngle:currentSteerAngle,
         steerInput:steer,
         braking:countachBrakeLightRequested,
         reversing:countachReverseLightRequested,
         nightLevel:vehicleVisuals.headlightLevel
       }
     );
     countachGlbSystem.update(
       dt,
       {
         speed,
         steerAngle:currentSteerAngle,
         braking:countachBrakeLightRequested,
         reversing:countachReverseLightRequested
       }
     );
     id4GlbSystem.update(
       dt,
       {
         speed,
         steerAngle:currentSteerAngle,
         braking:countachBrakeLightRequested,
         reversing:countachReverseLightRequested,
         nightLevel:vehicleVisuals.headlightLevel
       }
     );
     wrxGlbSystem.update(
       dt,
       {
         speed,
         steerAngle:currentSteerAngle,
         braking:countachBrakeLightRequested,
         reversing:countachReverseLightRequested,
         nightLevel:vehicleVisuals.headlightLevel
       }
     );
     civicGlbSystem.update(
       dt,
       {
         speed,
         steerAngle:currentSteerAngle,
         braking:countachBrakeLightRequested,
         reversing:countachReverseLightRequested,
         nightLevel:vehicleVisuals.headlightLevel
       }
     );
     sonataGlbSystem.update(
       dt,
       {
         speed,
         steerAngle:currentSteerAngle,
         braking:countachBrakeLightRequested,
         reversing:countachReverseLightRequested,
         nightLevel:vehicleVisuals.headlightLevel
       }
     );
     f1GlbSystem.update(
       dt,
       {
         speed,
         steerAngle:currentSteerAngle,
         braking:countachBrakeLightRequested,
         reversing:countachReverseLightRequested
       }
     );
     i3GlbSystem.update(
       dt,
       {
         speed,
         steerAngle:currentSteerAngle,
         braking:countachBrakeLightRequested,
         reversing:countachReverseLightRequested,
         nightLevel:vehicleVisuals.headlightLevel
       }
     );
   }
   const simCost=performance.now()-simStart;
   perfGovernor.simMs=perfGovernor.simMs*.90+simCost*.10;

   if(gameStarted){
     multiplayer.update(dt);
   }

   const perfIntervals=performanceIntervals();

   // Cheap shadow transform follows the vehicle every frame; the expensive
   // terrain projection is refreshed at a lower visual cadence.
   const projectShadow=now>=perfGovernor.nextShadowProjectionAt;
   if(projectShadow){
     perfGovernor.nextShadowProjectionAt=now+perfIntervals.shadowProjection;
   }
   vehiclePresentation.updateContactShadow(projectShadow);

   // V21.22.3: static shadow maps are refreshed only when streamed world
   // geometry actually changes. A timer-driven shadow pass can create a small
   // GPU frame-time spike even though neither the sun nor the static world moved.

   if(gameStarted){
     try{
       vehicleAudio.update();
     }catch(audioErr){
       console.warn('Audio frame error',audioErr);
       vehicleAudio.showError();
     }
   }

   cameraController.update(dt);
   truckTrailerSystem.adjustCamera(
     camera,
     camTarget,
     heading,
     dt,
     {
       modeLabel:$('camMode')?.textContent||'',
       lookX:gamepadState.lookX||0,
       lookY:gamepadState.lookY||0
     }
   );

   // V21.24.4: for the real Countach, the generic Capot/1st-person view is
   // replaced by an actual seated driver's-eye camera inside the authored GLB.
   // This final override intentionally runs after the generic/truck controllers.
   countachGlbSystem.adjustCamera(
     camera,
     camTarget,
     dt,
     {
       modeLabel:$('camMode')?.textContent||'',
       lookX:gamepadState.lookX||0,
       lookY:gamepadState.lookY||0
     }
   );

   if(now>=perfGovernor.nextMoonAt){
     updateMoonSkyPosition();
     perfGovernor.nextMoonAt=now+perfIntervals.moon;
   }

   streamingCoordinator?.updateFrame(now);

   waterTex.offset.x=(waterTex.offset.x+dt*.003)%1;
   waterTex.offset.y=(waterTex.offset.y+dt*.0015)%1;

   // User-facing instruments are intentionally full-rate in V21.21.5 (static instrument art is cached).
   drawCompass();
   drawSpeedometer();

   const renderStart=performance.now();
   renderer.render(scene,camera);
   const renderSubmitCost=performance.now()-renderStart;
   perfGovernor.renderSubmitMs=perfGovernor.renderSubmitMs*.90+renderSubmitCost*.10;

   if(streamingCoordinator?.policy.perfConsoleLogging&&now>=perfGovernor.nextPerfLogAt){
     perfGovernor.nextPerfLogAt=now+5000;
     console.info(
       '[WorldDrive perf]',
       `fps=${Math.round(perfGovernor.fps)}`,
       `scale=${renderer.getPixelRatio().toFixed(2)}`,
       `level=${perfGovernor.level}`,
       `shadows=${renderer.shadowMap.enabled?'on':'off'}`,
       `sim=${perfGovernor.simMs.toFixed(2)}ms`,
       `renderSubmit=${perfGovernor.renderSubmitMs.toFixed(2)}ms`
     );
   }
 }catch(e){
   console.error('Frame error:',e);
   statusEl.textContent='Erreur moteur 3D: '+(e?.message||e);
 }
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);drawMap();drawCompass();drawSpeedometer()});

(async()=>{
 // Renderer starts immediately so the loading / chooser screens sit over a
 // live world rather than a frozen blank page.
 requestAnimationFrame(t=>{last=t;animate(t)});

 try{
   setV21BootProgress(
     'settings',
     'loading',
     'Lecture IndexedDB…'
   );

   appSettings=
     await WorldSettings.load();

   settingsLoaded=true;

   setV21BootProgress(
     'settings',
     'done',
     'Réglages prêts'
   );

   installV21Menu();
   await applyLoadedV21Settings();

   // Manic-2 -> Manic-5 remains the first-route preset by design.
   const startupRouteReady=
     await createRequestedRoute(
       {...MANIC2},
       {...MANIC5}
     );

   if(!startupRouteReady){
     setV21BootProgress(
       'route',
       'warn',
       'Trajet indisponible'
     );

     return;
   }

   showV21VehicleChooser();
 }catch(e){
   console.error('Startup error',e);

   loading.classList.add('hidden');
   routingStatus.textContent='Erreur';
   statusEl.textContent=
     'Erreur de démarrage — recharge la page';

   setV21BootProgress(
     'route',
     'warn',
     'Erreur de démarrage'
   );
 }
})();
