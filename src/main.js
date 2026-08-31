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
import { createRoutePlannerUi } from './route-planner-ui.js';
import { createRouteLifecycle } from './route-lifecycle.js';
import { createInstrumentCluster } from './instrument-cluster.js';
import { createMinimapSystem } from './minimap.js';
import { createRoadFurnitureSystem } from './road-furniture.js';
import { createRoadGeometrySystem } from './road-geometry.js';
import { createLocalWorldBuilder } from './local-world-builder.js';
import {
  createWorldMaterials,
  ROAD_SURFACE_OFFSET,
  TIRE_VISUAL_CLEARANCE,
  WHEEL_RADIUS,
  TIRE_HALF_WIDTH,
  ROAD_WHEEL_CONTACT_HALF_WIDTH
} from './world-materials.js';
import { createSkyLighting } from './sky-lighting.js';
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
import { createDrivingRuntime } from './driving-runtime.js';
import { createEnvironmentController } from './environment-controller.js';
import { createTransmissionController } from './transmission-controller.js';
import { createAutopilotController } from './autopilot-controller.js';
import { createWheelGroundSupport } from './wheel-ground-support.js';
import { createVehiclePlacementController } from './vehicle-placement-controller.js';
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
import { createCountachGlbSystem } from './vehicle-glb-entries.js';
import { createId4GlbSystem } from './vehicle-glb-entries.js';
import { createWrxGlbSystem } from './vehicle-glb-entries.js';
import { createCivicGlbSystem } from './vehicle-glb-entries.js';
import { createSonataGlbSystem } from './vehicle-glb-entries.js';
import { createF1GlbSystem } from './vehicle-glb-entries.js';
import { createI3GlbSystem } from './vehicle-glb-entries.js';
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

// ---------- sky lighting facade ----------
const {
  hemi,
  sun,
  moonLight,
  moonMaterial,
  moonSprite,
  moonDirection,
  updateMoonSkyPosition
}=createSkyLighting({THREE,scene,camera,documentRef:document});

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

// ---------- world materials facade ----------
const {
  roadMat,
  shoulderMat,
  roadEdgeMat,
  roadUnderMat,
  lineYellow,
  lineWhite,
  treeTrunkMat,
  treeMat,
  waterTex,
  waterMat,
  riverMat,
  coastWaterMat
}=createWorldMaterials({THREE,renderer,documentRef:document});

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
  sampleRoadVisualHeight:(x,z)=>terrainService.roadVisualHeightAt?.(x,z),
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
    velocityHeading,
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
    timeOfDay:getTimeOfDay()
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
let localWorldBuilder=null;
function rebuildLocalWorld(){
  return localWorldBuilder?.rebuild();
}
localWorldBuilder=createLocalWorldBuilder({
  THREE,
  resetStreamedWorldOrigins,
  terrainService,
  clearGroup,
  roadGroup,
  forestGroup,
  infrastructureGroup,
  signGroup,
  sceneryRenderer,
  getBridgeFeatureCount:()=>bridgeFeatures.length,
  rebuildBridgeSpans,
  buildRoadProfile,
  setActiveRoadProfile,
  buildRoadVolume,
  buildLateralBand,
  buildRibbon,
  buildOffsetRibbon,
  shoulderMat,
  roadMat,
  lineYellow,
  lineWhite,
  ROAD_SURFACE_OFFSET,
  getWorldOffset:()=>worldOffset,
  nearestRoute,
  isWaterAt,
  terrainAbs,
  treeTrunkMat,
  treeMat,
  rebuildLocalWater,
  scheduleVisualJob,
  rebuildLocalScenery,
  addEnhancedBridgeFurniture,
  refreshRoadSignsOnly,
  freezeStaticMatrices,
  rebuildHorizon,
  markStaticShadowsDirty,
});
// ---------- route lifecycle facade ----------
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

// ---------- transmission controller facade ----------
let transmissionController=null;
function activeTransmissionProfile(...args){return transmissionController.activeTransmissionProfile(...args);}
function effectiveEngineRedlineRpm(...args){return transmissionController.effectiveEngineRedlineRpm(...args);}
function transmissionRedlineSpeedKmh(...args){return transmissionController.transmissionRedlineSpeedKmh(...args);}
function resetTransmissionState(...args){return transmissionController.resetTransmissionState(...args);}
function requestManualShift(...args){return transmissionController.requestManualShift(...args);}
function desiredTransmissionGear(...args){return transmissionController.desiredTransmissionGear(...args);}
function updateTransmission(dt,requestedThrottle,onPavement=true){return transmissionController.updateTransmission(dt,requestedThrottle,onPavement,autopilot);}
// V21.21: generalized vehicle dynamics math lives in vehicle-dynamics.js.

// Mutable object identity is intentional: audio/physics keep the same reference
// when future vehicles are selected.
const VEHICLE=vehicleSystem.physics;
const transmissionStateBridge={};
Object.defineProperties(transmissionStateBridge,{
  transmissionGear:{get:()=>transmissionGear,set:value=>{transmissionGear=value;}},
  transmissionPendingGear:{get:()=>transmissionPendingGear,set:value=>{transmissionPendingGear=value;}},
  transmissionShiftTimer:{get:()=>transmissionShiftTimer,set:value=>{transmissionShiftTimer=value;}},
  transmissionShiftDuration:{get:()=>transmissionShiftDuration,set:value=>{transmissionShiftDuration=value;}},
  transmissionShiftStartRpm:{get:()=>transmissionShiftStartRpm,set:value=>{transmissionShiftStartRpm=value;}},
  transmissionShiftEndRpm:{get:()=>transmissionShiftEndRpm,set:value=>{transmissionShiftEndRpm=value;}},
  engineRpm:{get:()=>engineRpm,set:value=>{engineRpm=value;}},
  transmissionShifting:{get:()=>transmissionShifting,set:value=>{transmissionShifting=value;}},
  transmissionProfileKey:{get:()=>transmissionProfileKey,set:value=>{transmissionProfileKey=value;}},
  revLimiterActive:{get:()=>revLimiterActive,set:value=>{revLimiterActive=value;}},
  revLimiterPhase:{get:()=>revLimiterPhase,set:value=>{revLimiterPhase=value;}},
  transmissionMode:{get:()=>transmissionMode,set:value=>{transmissionMode=value;}},
  manualShiftRequest:{get:()=>manualShiftRequest,set:value=>{manualShiftRequest=value;}},
});
transmissionController=createTransmissionController({
  vehicleSystem,
  VEHICLE,
  computeGearRedlineSpeeds,
  computeTransmissionState,
  physicsClamp,
  physicsSmoothstep01,
  toast,
  getSpeed:()=>speed,
  getLongitudinalAccel:()=>longitudinalAccel,
  vehicleReverseLimitMps,
  state:transmissionStateBridge
});
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

// ---------- autopilot / assist controller facade ----------
let autopilotController=null;
function setAutopilot(...args){return autopilotController.setAutopilot(...args);}
function toggleAutopilot(...args){return autopilotController.toggleAutopilot(...args);}
function autopilotControl(...args){return autopilotController.autopilotControl(...args);}
function toggleAssist(...args){return autopilotController.toggleAssist(...args);}
function updateSpeedLimitModeUI(...args){return autopilotController.updateSpeedLimitModeUI(...args);}
function toggleRoadSpeedLimits(...args){return autopilotController.toggleRoadSpeedLimits(...args);}

const autopilotStateBridge={};
Object.defineProperties(autopilotStateBridge,{
  autopilot:{get:()=>autopilot,set:value=>{autopilot=value;}},
  autopilotSteer:{get:()=>autopilotSteer,set:value=>{autopilotSteer=value;}},
  assist:{get:()=>assist,set:value=>{assist=value;}},
  roadContact:{get:()=>roadContact,set:value=>{roadContact=value;}},
  speed:{get:()=>speed,set:value=>{speed=value;}},
  absX:{get:()=>absX,set:value=>{absX=value;}},
  absZ:{get:()=>absZ,set:value=>{absZ=value;}},
  heading:{get:()=>heading},
  routeLength:{get:()=>routeLength},
  maxSpeedMps:{get:()=>MAX},
  obeyRoadSpeedLimits:{get:()=>obeyRoadSpeedLimits,set:value=>{obeyRoadSpeedLimits=value;}},
  activeRoadMeta:{get:()=>activeRoadMeta},
  appSettings:{get:()=>appSettings}
});
autopilotController=createAutopilotController({
  state:autopilotStateBridge,
  $,
  nearestRoute,
  recenterIfNeeded,
  routePointAtCum,
  angleDelta,
  queueSettingsSave,
  syncRuntimeControls:()=>syncV21RuntimeControls(),
  toast
});

// ---------- wheel / road ground support facade ----------
const wheelGroundSupport=createWheelGroundSupport({
  roadSurfaceAt,
  terrainAbs,
  roadHalfWidth:ROAD_WHEEL_CONTACT_HALF_WIDTH
});
function setFastWheelRoadSupport(active,roadFrame,centerY,centerX=absX,centerZ=absZ){
  return wheelGroundSupport.setFastWheelRoadSupport(active,roadFrame,centerY,centerX,centerZ);
}
function groundHeightForWheel(...args){
  return wheelGroundSupport.groundHeightForWheel(...args);
}

let currentOnPavementForInstruments=true;

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

// ---------- driving runtime facade ----------
let drivingRuntime=null;
function updateDrive(dt){
  drivingRuntime?.update(dt);
}

// ---------- vehicle placement / reset controller facade ----------
const vehiclePlacementState={};
Object.defineProperties(vehiclePlacementState,{
  absX:{get:()=>absX,set:value=>{absX=value;}},
  absZ:{get:()=>absZ,set:value=>{absZ=value;}},
  heading:{get:()=>heading,set:value=>{heading=value;}},
  speed:{get:()=>speed,set:value=>{speed=value;}},
  steer:{get:()=>steer,set:value=>{steer=value;}},
  visualSteer:{get:()=>visualSteer,set:value=>{visualSteer=value;}},
  currentSteerAngle:{get:()=>currentSteerAngle,set:value=>{currentSteerAngle=value;}},
  driveHudAccumulator:{get:()=>driveHudAccumulator,set:value=>{driveHudAccumulator=value;}},
  minimapAccumulator:{get:()=>minimapAccumulator,set:value=>{minimapAccumulator=value;}},
  gripSolverAccumulator:{get:()=>gripSolverAccumulator,set:value=>{gripSolverAccumulator=value;}},
  longitudinalAccel:{get:()=>longitudinalAccel,set:value=>{longitudinalAccel=value;}},
  lateralGripUsage:{get:()=>lateralGripUsage,set:value=>{lateralGripUsage=value;}},
  wheelGripUsage:{get:()=>wheelGripUsage,set:value=>{wheelGripUsage=value;}},
  wheelSlipLevels:{get:()=>wheelSlipLevels,set:value=>{wheelSlipLevels=value;}},
  wheelLateralUsage:{get:()=>wheelLateralUsage,set:value=>{wheelLateralUsage=value;}},
  wheelLongitudinalUsage:{get:()=>wheelLongitudinalUsage,set:value=>{wheelLongitudinalUsage=value;}},
  frontSlipAmount:{get:()=>frontSlipAmount,set:value=>{frontSlipAmount=value;}},
  rearSlipAmount:{get:()=>rearSlipAmount,set:value=>{rearSlipAmount=value;}},
  dynamicYawRate:{get:()=>dynamicYawRate,set:value=>{dynamicYawRate=value;}},
  velocityHeading:{get:()=>velocityHeading,set:value=>{velocityHeading=value;}},
  roadContact:{get:()=>roadContact,set:value=>{roadContact=value;}},
  worldOffset:{get:()=>worldOffset}
});
const vehiclePlacementController=createVehiclePlacementController({
  state:vehiclePlacementState,
  VEHICLE,
  routePointAt,
  nearestRoute,
  resetTransmissionState,
  vehiclePresentation,
  skidMarks,
  recenterIfNeeded,
  ensureRoadProfileNear,
  roadProfileFrameAtCum,
  roadHeightAt,
  ROAD_SURFACE_OFFSET,
  TIRE_VISUAL_CLEARANCE,
  car,
  truckTrailerSystem,
  drawMap:(...args)=>drawMap(...args),
  DRIVE_HUD_INTERVAL,
  MINIMAP_INTERVAL,
  GRIP_SOLVER_INTERVAL
});
function placeAt(...args){return vehiclePlacementController.placeAt(...args);}
function resetToRoad(...args){return vehiclePlacementController.resetToRoad(...args);}

const maxSpeedSlider=$('maxSpeedSlider');
const maxSpeedLabel=$('maxSpeedLabel');
const speedLimitModeBtn=$('speedLimitModeBtn');

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





// ---------- route planner UI facade ----------
const routePlannerUi=createRoutePlannerUi({
  $,
  documentRef:document,
  geocodingService,
  createRequestedRoute,
  toast,
  MANIC2,
  MANIC5,
  R169_START,
  R169_END,
  R132_START,
  R132_END,
  YUNGAS_START,
  YUNGAS_END,
  YUNGAS_WAYPOINTS
});
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

// ---------- driving runtime ----------
drivingRuntime=createDrivingRuntime({
  getState:()=>({
    absX,
    absZ,
    heading,
    speed,
    steer,
    longitudinalAccel,
    visualSteer,
    currentSteerAngle,
    countachBrakeLightRequested,
    countachReverseLightRequested,
    lateralGripUsage,
    velocityHeading,
    dynamicYawRate,
    wheelGripUsage,
    wheelSlipLevels,
    wheelLateralUsage,
    wheelLongitudinalUsage,
    frontSlipAmount,
    rearSlipAmount,
    currentOnPavementForInstruments,
    driveHudAccumulator,
    minimapAccumulator,
    gripSolverAccumulator,
    worldStreamingAccumulator,
    lastContactModeText,
    roadContact,
  }),
  setState:state=>{
    absX=state.absX;
    absZ=state.absZ;
    heading=state.heading;
    speed=state.speed;
    steer=state.steer;
    longitudinalAccel=state.longitudinalAccel;
    visualSteer=state.visualSteer;
    currentSteerAngle=state.currentSteerAngle;
    countachBrakeLightRequested=state.countachBrakeLightRequested;
    countachReverseLightRequested=state.countachReverseLightRequested;
    lateralGripUsage=state.lateralGripUsage;
    velocityHeading=state.velocityHeading;
    dynamicYawRate=state.dynamicYawRate;
    wheelGripUsage=state.wheelGripUsage;
    wheelSlipLevels=state.wheelSlipLevels;
    wheelLateralUsage=state.wheelLateralUsage;
    wheelLongitudinalUsage=state.wheelLongitudinalUsage;
    frontSlipAmount=state.frontSlipAmount;
    rearSlipAmount=state.rearSlipAmount;
    currentOnPavementForInstruments=state.currentOnPavementForInstruments;
    driveHudAccumulator=state.driveHudAccumulator;
    minimapAccumulator=state.minimapAccumulator;
    gripSolverAccumulator=state.gripSolverAccumulator;
    worldStreamingAccumulator=state.worldStreamingAccumulator;
    lastContactModeText=state.lastContactModeText;
    roadContact=state.roadContact;
  },
  getFlags:()=>({
    assist,
    autopilot,
    menuOpen:v21MenuOpen,
    maxSpeedKmh,
    maxSpeedMps:MAX
  }),
  getRouteLength:()=>routeLength,
  getWorldOffset:()=>worldOffset,
  nearestRouteForVehicle,
  autopilotControl,
  keyboardActionDown,
  gamepadState,
  updateTransmission,
  vehiclePresentation,
  vehicleVisuals,
  truckTrailerSystem,
  roadSurfaceGrip,
  getVehicleId:()=>vehicleSystem.activeId,
  VEHICLE,
  vehicleTopSpeedKmh,
  activeTransmissionProfile,
  effectiveEngineRedlineRpm,
  transmissionRedlineSpeedKmh,
  vehicleReverseLimitMps,
  physicsClamp,
  longitudinalTractionLimit,
  computeGradeAcceleration,
  physicsRoadFrameScratch,
  dynamicsScratch,
  roadProfileFrameAtCum,
  ensureRoadProfileNear,
  roadFrameAt,
  terrainAbs,
  routePointAtCum,
  laneKeepAssistCommand,
  angleDelta,
  steeringCommand,
  advanceSteeringRack,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage,
  yawResponseRate,
  recenterIfNeeded,
  updateRunChallenge,
  terrainFrameAt,
  ROAD_SURFACE_OFFSET,
  TIRE_VISUAL_CLEARANCE,
  setFastWheelRoadSupport,
  car,
  skidMarks,
  xzToLL,
  elevationService,
  altitudeEl,
  updatePassedSignReadout,
  drawMap,
  worldStreaming,
  $,
  DRIVE_HUD_INTERVAL,
  MINIMAP_INTERVAL,
  GRIP_SOLVER_INTERVAL,
  WORLD_STREAMING_INTERVAL,
});


// ---------- display distance + time of day facade ----------
const environmentController=createEnvironmentController({
  THREE,
  $,
  appSettings,
  camera,
  scene,
  worldStreaming,
  queueSettingsSave,
  hemi,
  sun,
  moonLight,
  moonMaterial,
  moonSprite,
  vehicleVisuals,
  moonDirection,
  updateMoonSkyPosition,
});
const {
  applyDisplayDistanceProfile,
  setTimeOfDay,
  timeSlider,
  timeLabel,
  getTimeOfDay
}=environmentController;
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

// V21.27.2 diagnostics only. Safe to inspect from DevTools; values do not
// feed back into the authoritative V21.26 vehicle integrator.
window.WorldDrivePhysicsShadow=()=>
  drivingRuntime?.physicsShadowDiagnostics?.()||null;

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
