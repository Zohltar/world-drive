import * as THREE from 'three';
import { createVehicleAudio, computeTransmissionState, computeGearRedlineSpeeds } from './audio.js';
import { createGamepadController } from './gamepad.js';
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


// ---------- V21.20.1 desktop Overpass transport ----------
// The browser build talks to Overpass directly. The Windows/Electron build
// uses a same-origin local proxy hosted by electron/main.cjs. This avoids
// Chromium/Electron POST/CORS/network differences while leaving every OSM
// consumer (hydrography, scenery, signs, metadata, bridges) unchanged.
function installDesktopOverpassTransport(){
  if(
    !window.worldDriveDesktop?.isDesktop||
    window.__worldDriveOverpassTransportInstalled
  ){
    return;
  }

  const nativeFetch=window.fetch.bind(window);
  const allowedHosts=new Set([
    'overpass-api.de',
    'overpass.kumi.systems',
    'overpass.nchc.org.tw'
  ]);

  window.fetch=(input,init)=>{
    let sourceUrl='';

    try{
      if(typeof input==='string'||input instanceof URL){
        sourceUrl=String(input);
      }else if(input&&typeof input.url==='string'){
        sourceUrl=input.url;
      }

      const parsed=new URL(sourceUrl,window.location.href);

      if(
        parsed.protocol==='https:'&&
        allowedHosts.has(parsed.hostname)&&
        /\/api\/interpreter\/?$/i.test(parsed.pathname)
      ){
        const proxy=new URL(
          '/__worlddrive_proxy/overpass',
          window.location.origin
        );

        proxy.searchParams.set(
          'target',
          parsed.toString()
        );

        return nativeFetch(
          proxy.toString(),
          init
        );
      }
    }catch(error){
      console.warn(
        'Desktop Overpass proxy routing failed; using direct fetch',
        error
      );
    }

    return nativeFetch(input,init);
  };

  window.__worldDriveOverpassTransportInstalled=true;
  console.info('World Drive desktop Overpass proxy enabled');
}

installDesktopOverpassTransport();

// Default test route. V4 can replace these coordinates at runtime.
const MANIC2={lat:49.3213,lon:-68.3467,name:'Manic‑2'};
const MANIC5={lat:50.6451065,lon:-68.7271214,name:'Manic‑5'};

// Scenic presets
const R169_START={lat:48.39474,lon:-71.67772,name:'Hébertville'};
const R169_END={lat:48.650002,lon:-72.449997,name:'Saint‑Félicien'};
const R132_START={lat:48.849998,lon:-67.533333,name:'Matane'};
const R132_END={lat:48.533333,lon:-64.216667,name:'Percé'};

// Bolivia · Camino de la Muerte / North Yungas Road.
// Chuspipata -> Yolosa is the historic Death Road section; the midpoint
// waypoint pins the router onto the old Yungas road instead of the newer route.
const YUNGAS_START={lat:-16.29911,lon:-67.81891,name:'Chuspipata · Yungas'};
const YUNGAS_END={lat:-16.23312,lon:-67.73975,name:'Yolosa · Yungas'};
const YUNGAS_WAYPOINTS=[
  {lat:-16.2577,lon:-67.7861,name:'Camino de la Muerte'}
];

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
let v21BootMode='loading';
let v21MenuEl=null;
let v21MenuButton=null;
let v21SelectedStartupVehicle=null;

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

function installV21BaseStyle(){
  if(document.getElementById('v21BaseStyle')){
    return;
  }

  const style=
    document.createElement('style');

  style.id='v21BaseStyle';

  style.textContent=`
  #hud,
  #help{
    display:none!important;
  }

  #speedControl{
    display:none!important;
  }

  #showControlsBtn{
    display:none!important;
  }

  #speedometerDock{
    pointer-events:none;
  }

  #v21MenuButton{
    position:fixed;
    left:14px;
    top:14px;
    z-index:42;
    display:none;
    min-width:92px;
    height:40px;
    padding:0 14px;
    border:1px solid rgba(255,255,255,.15);
    border-radius:12px;
    background:rgba(5,12,20,.88);
    color:#f6f8fb;
    font:800 12px/1 system-ui,sans-serif;
    letter-spacing:.08em;
    box-shadow:0 10px 30px rgba(0,0,0,.34);
    backdrop-filter:blur(12px);
    cursor:pointer;
  }

  #v21MenuButton:hover{
    background:rgba(12,25,39,.94);
  }

  #v21MenuButton.hidden{
    opacity:0!important;
    pointer-events:none!important;
    transform:translateX(-10px)!important;
  }

  #v21MapChallenge{
    position:absolute;
    top:40px;
    right:12px;
    z-index:6;
    min-width:78px;
    pointer-events:none;
    color:#f3f7fb;
    text-align:left;
    font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
    text-shadow:0 1px 3px rgba(0,0,0,.95);
  }

  #v21MapChallenge .v21ChallengeLabel{
    margin-top:7px;
    color:#d9e3ec;
    font-size:9px;
    font-weight:800;
    letter-spacing:.03em;
  }

  #v21MapChallenge .v21ChallengeValue{
    margin-top:1px;
    color:#fff;
    font-size:10px;
    font-weight:900;
    line-height:1.15;
    white-space:nowrap;
  }

  #mapbox.collapsed #v21MapChallenge{
    display:none;
  }

  #v21Menu{
    position:fixed;
    inset:0;
    z-index:41;
    display:none;
    pointer-events:none;
    background:rgba(0,0,0,.18);
  }

  #v21Menu.open{
    display:block;
    pointer-events:auto;
  }

  #v21MenuPanel{
    position:absolute;
    left:0;
    top:0;
    bottom:0;
    width:min(760px,94vw);
    display:grid;
    grid-template-columns:180px minmax(0,1fr);
    background:linear-gradient(180deg,#07111b 0%,#050b12 100%);
    border-right:1px solid rgba(255,255,255,.12);
    box-shadow:22px 0 60px rgba(0,0,0,.5);
    color:#edf3f8;
    overflow:hidden;
  }

  .v21MenuNav{
    padding:20px 12px 16px;
    border-right:1px solid rgba(255,255,255,.08);
    background:rgba(255,255,255,.018);
  }

  .v21Brand{
    margin:0 6px 18px;
  }

  .v21Brand strong{
    display:block;
    font-size:18px;
    letter-spacing:.05em;
  }

  .v21Brand span{
    display:block;
    margin-top:4px;
    color:#7792a9;
    font-size:10px;
    letter-spacing:.08em;
  }

  .v21Tab{
    width:100%;
    display:flex;
    align-items:center;
    gap:9px;
    margin:3px 0;
    padding:10px 11px;
    border:0;
    border-radius:9px;
    background:transparent;
    color:#aebdca;
    text-align:left;
    font:700 12px/1.2 system-ui,sans-serif;
    cursor:pointer;
  }

  .v21Tab:hover{
    background:rgba(255,255,255,.055);
    color:#fff;
  }

  .v21Tab.active{
    background:#17314a;
    color:#fff;
  }

  .v21MenuMain{
    min-width:0;
    display:flex;
    flex-direction:column;
  }

  .v21MenuTop{
    position:relative;
    height:62px;
    flex:0 0 auto;
    display:flex;
    align-items:center;
    padding:0 52px 0 20px;
    border-bottom:1px solid rgba(255,255,255,.08);
  }

  .v21MenuTop h2{
    margin:0;
    font:800 17px/1 system-ui,sans-serif;
  }

  #v21MenuClose{
    position:absolute!important;
    top:19px!important;
    right:14px!important;

    width:24px!important;
    min-width:24px!important;
    max-width:24px!important;

    height:24px!important;
    min-height:24px!important;
    max-height:24px!important;

    margin:0!important;
    padding:0!important;
    box-sizing:border-box!important;
    flex:0 0 24px!important;

    display:grid!important;
    place-items:center!important;

    border:1px solid rgba(255,255,255,.13)!important;
    border-radius:5px!important;
    background:rgba(255,255,255,.055)!important;
    color:#dce5ed!important;

    font:700 16px/1 system-ui,sans-serif!important;
    text-align:center!important;
    letter-spacing:0!important;

    cursor:pointer;
  }

  #v21MenuClose:hover{
    background:rgba(255,255,255,.11)!important;
    color:#fff!important;
  }

  .v21Panel{
    display:none;
    flex:1 1 auto;
    min-height:0;
    overflow:auto;
    padding:20px;
  }

  .v21Panel.active{
    display:block;
  }

  .v21Section{
    margin-bottom:18px;
    padding:14px;
    border:1px solid rgba(255,255,255,.09);
    border-radius:12px;
    background:rgba(255,255,255,.025);
  }

  .v21SectionTitle{
    margin:0 0 11px;
    color:#8da4b8;
    font:800 10px/1 system-ui,sans-serif;
    text-transform:uppercase;
    letter-spacing:.13em;
  }

  .v21Row{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:14px;
    min-height:38px;
    border-top:1px solid rgba(255,255,255,.05);
  }

  .v21Row:first-of-type{
    border-top:0;
  }

  .v21Row label,
  .v21Row .v21Label{
    color:#dce6ee;
    font-size:12px;
    font-weight:650;
  }

  .v21Row small{
    display:block;
    margin-top:2px;
    color:#7890a5;
    font-size:9px;
    font-weight:500;
  }

  .v21MenuSelect,
  .v21MenuInput,
  #v21Menu select,
  #v21Menu input[type="text"],
  #v21Menu input[type="number"],
  #v21Menu textarea{
    max-width:100%;
    border:1px solid rgba(255,255,255,.13);
    border-radius:7px;
    background:#111d28;
    color:#fff;
  }

  .v21MenuSelect,
  #v21Menu select{
    min-width:148px;
    padding:7px 9px;
  }

  .v21MenuBtn{
    padding:7px 10px;
    border:1px solid rgba(255,255,255,.12);
    border-radius:7px;
    background:#172838;
    color:#fff;
    font:750 11px/1 system-ui,sans-serif;
    cursor:pointer;
  }

  .v21MenuBtn:hover{
    background:#20384f;
  }

  .v21MenuBtn.danger{
    border-color:rgba(255,92,98,.25);
    background:#3a1519;
  }

  .v21Toggle{
    min-width:58px;
    padding:6px 9px;
    border:1px solid rgba(255,255,255,.12);
    border-radius:999px;
    background:#22303c;
    color:#aab9c7;
    font:800 10px/1 system-ui,sans-serif;
    cursor:pointer;
  }

  .v21Toggle.on{
    background:#174a36;
    color:#a8ffd5;
  }

  .v21InfoGrid{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:8px;
  }

  .v21InfoCard{
    padding:10px;
    border-radius:9px;
    background:rgba(255,255,255,.04);
  }

  .v21InfoCard span{
    display:block;
    color:#7f97aa;
    font-size:9px;
    text-transform:uppercase;
    letter-spacing:.08em;
  }

  .v21InfoCard b{
    display:block;
    margin-top:4px;
    font-size:13px;
  }

  .v21ControlsGrid{
    display:grid;
    grid-template-columns:1fr auto;
    gap:0 10px;
  }

  .v21ControlName,
  .v21ControlValue{
    min-height:38px;
    display:flex;
    align-items:center;
    border-top:1px solid rgba(255,255,255,.05);
  }

  .v21ControlName{
    font-size:11px;
    color:#d9e3ea;
  }

  .v21ControlValue button{
    min-width:110px;
  }

  .v21JoystickSensitivity{
    display:flex;
    align-items:center;
    gap:9px;
  }

  .v21JoystickSensitivity input[type="range"]{
    width:138px;
    accent-color:#70b7ff;
    cursor:pointer;
  }

  .v21JoystickSensitivity span{
    min-width:42px;
    color:#dce6ee;
    font-size:10px;
    font-weight:800;
    text-align:right;
  }

  .v21StatusLine{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    padding:6px 0;
    color:#9fb2c1;
    font-size:10px;
    border-top:1px solid rgba(255,255,255,.05);
  }

  .v21StatusLine:first-child{
    border-top:0;
  }

  .v21StatusLine b{
    color:#eef5fa;
    font-size:11px;
    text-align:right;
  }

  #v21Startup{
    position:fixed;
    inset:0;
    z-index:90;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:24px;
    background:
      radial-gradient(circle at 50% 42%,rgba(21,47,67,.42),transparent 42%),
      rgba(2,7,11,.94);
    color:#f2f7fb;
    backdrop-filter:blur(10px);
  }

  #v21Startup.hidden{
    display:none;
  }

  .v21StartupCard{
    width:min(760px,94vw);
    max-height:90vh;
    overflow:auto;
    padding:26px;
    border:1px solid rgba(255,255,255,.12);
    border-radius:18px;
    background:linear-gradient(180deg,rgba(12,24,34,.96),rgba(5,12,19,.98));
    box-shadow:0 30px 90px rgba(0,0,0,.58);
  }

  .v21StartupBrand{
    margin-bottom:20px;
  }

  .v21StartupBrand h1{
    margin:0;
    font:900 28px/1 system-ui,sans-serif;
    letter-spacing:.04em;
  }

  .v21StartupBrand p{
    margin:7px 0 0;
    color:#7892a8;
    font-size:11px;
  }

  .v21BootRows{
    display:grid;
    gap:7px;
    margin:18px 0;
  }

  .v21BootRow{
    display:grid;
    grid-template-columns:20px 1fr auto;
    gap:9px;
    align-items:center;
    padding:9px 10px;
    border-radius:9px;
    background:rgba(255,255,255,.035);
    color:#aebdca;
    font-size:11px;
  }

  .v21BootRow[data-state="done"]{
    color:#b8f4d2;
  }

  .v21BootRow[data-state="warn"]{
    color:#ffd28c;
  }

  .v21BootDot{
    width:9px;
    height:9px;
    border-radius:50%;
    background:#526474;
    box-shadow:0 0 0 3px rgba(255,255,255,.025);
  }

  .v21BootRow[data-state="loading"] .v21BootDot{
    background:#64b5ff;
    animation:v21Pulse 1s infinite ease-in-out;
  }

  .v21BootRow[data-state="done"] .v21BootDot{
    background:#55d98b;
  }

  .v21BootRow[data-state="warn"] .v21BootDot{
    background:#ffb857;
  }

  @keyframes v21Pulse{
    0%,100%{opacity:.45}
    50%{opacity:1}
  }

  .v21VehicleGrid{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:10px;
    margin-top:14px;
  }

  .v21VehicleChoice{
    padding:13px;
    border:1px solid rgba(255,255,255,.09);
    border-radius:11px;
    background:rgba(255,255,255,.025);
    color:#eef5fa;
    text-align:left;
    cursor:pointer;
  }

  .v21VehicleChoice:hover{
    background:rgba(255,255,255,.055);
  }

  .v21VehicleChoice.selected{
    border-color:#4da4e8;
    background:#12324a;
  }

  .v21VehicleChoice b{
    display:block;
    font-size:13px;
  }

  .v21VehicleChoice span{
    display:block;
    margin-top:4px;
    color:#8199ad;
    font-size:10px;
  }

  #v21StartButton{
    width:100%;
    margin-top:16px;
    padding:12px;
    border:0;
    border-radius:10px;
    background:#1f7bc0;
    color:#fff;
    font:850 12px/1 system-ui,sans-serif;
    cursor:pointer;
  }

  #v21StartButton:disabled{
    opacity:.38;
    cursor:not-allowed;
  }

  .v21RouteSummary{
    display:flex;
    justify-content:space-between;
    gap:12px;
    padding:11px 12px;
    border-radius:9px;
    background:rgba(255,255,255,.035);
    color:#9db1c1;
    font-size:11px;
  }

  .v21RouteSummary b{
    color:#fff;
  }

  #v21Menu #plannerBox,
  #v21Menu #jumpBox,
  #v21Menu .multiplayerBox{
    margin:0!important;
    width:auto!important;
  }

  #v21Menu .presetGrid{
    grid-template-columns:1fr!important;
  }

  #v21Menu .placeRow{
    display:grid!important;
    grid-template-columns:minmax(0,1fr) auto!important;
  }

  .v21DesktopMp{
    display:grid;
    gap:10px;
  }

  .v21DesktopMpActions{
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
    gap:8px;
  }

  .v21DesktopMpJoin{
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
    gap:8px;
  }

  .v21DesktopMpInput{
    min-width:0;
    width:100%;
    box-sizing:border-box;
    padding:8px 10px;
    border:1px solid rgba(255,255,255,.12);
    border-radius:7px;
    background:#111d28;
    color:#fff;
    font:650 11px/1.2 system-ui,sans-serif;
    outline:none;
  }

  .v21DesktopMpInput:focus{
    border-color:rgba(64,158,225,.70);
  }

  .v21DesktopMpStatus{
    padding:9px 10px;
    border:1px solid rgba(255,255,255,.08);
    border-radius:8px;
    background:rgba(255,255,255,.035);
    color:#93a8ba;
    font-size:10px;
    line-height:1.45;
  }

  .v21DesktopMpStatus[data-state=on]{
    border-color:rgba(66,207,143,.28);
    background:rgba(24,89,62,.22);
    color:#a8ffd5;
  }

  .v21DesktopMpStatus[data-state=error]{
    border-color:rgba(255,92,98,.30);
    background:rgba(100,28,34,.24);
    color:#ffc0c3;
  }

  .v21DesktopMpHint{
    color:#7f97aa;
    font-size:10px;
    line-height:1.45;
  }

  @media(max-width:760px){
    #v21MenuPanel{
      grid-template-columns:1fr;
      width:min(430px,100vw);
    }

    .v21MenuNav{
      display:flex;
      gap:4px;
      overflow:auto;
      padding:8px;
      border-right:0;
      border-bottom:1px solid rgba(255,255,255,.08);
    }

    .v21Brand{
      display:none;
    }

    .v21Tab{
      width:auto;
      flex:0 0 auto;
      padding:8px 9px;
    }

    .v21MenuMain{
      min-height:0;
    }

    .v21VehicleGrid{
      grid-template-columns:1fr;
    }
  }
  `;

  document.head.appendChild(style);
}

function createV21BootOverlay(){
  installV21BaseStyle();

  if(document.getElementById('v21Startup')){
    return;
  }

  const overlay=
    document.createElement('div');

  overlay.id='v21Startup';

  overlay.innerHTML=`
    <div class="v21StartupCard">
      <div class="v21StartupBrand">
        <h1>WORLD DRIVE</h1>
        <p>V21.21.26 alpha · initialisation du monde</p>
      </div>

      <div id="v21BootContent">
        <div class="v21RouteSummary">
          <span>Trajet par défaut</span>
          <b>Manic-2 → Manic-5</b>
        </div>

        <div class="v21BootRows">
          <div class="v21BootRow" id="v21BootRoute" data-state="loading">
            <span class="v21BootDot"></span>
            <span>Trajet</span>
            <b>Préparation…</b>
          </div>

          <div class="v21BootRow" id="v21BootHydro" data-state="waiting">
            <span class="v21BootDot"></span>
            <span>Hydrographie initiale</span>
            <b>En attente</b>
          </div>

          <div class="v21BootRow" id="v21BootSettings" data-state="loading">
            <span class="v21BootDot"></span>
            <span>Réglages</span>
            <b>Chargement…</b>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.title=
    'World Drive V21.21.26';

  const oldLoadingTitle=
    loading?.querySelector('h1');

  if(oldLoadingTitle){
    oldLoadingTitle.textContent=
      'World Drive V21.21.26';
  }

  if(loading){
    loading.classList.add('hidden');
  }
}

function setV21BootProgress(
  key,
  state,
  text
){
  const map={
    route:'v21BootRoute',
    hydro:'v21BootHydro',
    settings:'v21BootSettings'
  };

  const row=$(
    map[key]
  );

  if(!row)return;

  row.dataset.state=
    state;

  const value=
    row.querySelector('b');

  if(value){
    value.textContent=text;
  }
}

function showV21VehicleChooser(){
  const content=
    $('v21BootContent');

  if(!content)return;

  v21BootMode='chooser';
  v21SelectedStartupVehicle=null;

  const vehicles=
    vehicleSystem.list();

  content.innerHTML=`
    <div class="v21RouteSummary">
      <span>Trajet prêt</span>
      <b>${ROUTE_START.name} → ${ROUTE_END.name}</b>
    </div>

    <div style="margin-top:18px">
      <div style="font-size:11px;color:#8aa0b3;text-transform:uppercase;letter-spacing:.12em;font-weight:800">
        Choisissez votre véhicule
      </div>
      <div class="v21VehicleGrid" id="v21VehicleGrid"></div>
    </div>

    <button id="v21StartButton" disabled>
      DÉMARRER
    </button>
  `;

  const grid=
    $('v21VehicleGrid');

  for(const vehicle of vehicles){
    const button=
      document.createElement('button');

    button.type='button';
    button.className=
      'v21VehicleChoice';

    button.dataset.vehicleId=
      vehicle.id;

    button.innerHTML=`
      <b>${vehicle.name}</b>
      <span>${vehicle.description}</span>
    `;

    button.addEventListener(
      'click',
      ()=>{
        v21SelectedStartupVehicle=
          vehicle.id;

        grid
          .querySelectorAll(
            '.v21VehicleChoice'
          )
          .forEach(
            item=>
              item.classList.toggle(
                'selected',
                item===button
              )
          );

        const startButton=
          $('v21StartButton');

        if(startButton){
          startButton.disabled=false;
        }
      }
    );

    grid.appendChild(button);
  }

  $('v21StartButton')
    ?.addEventListener(
      'click',
      async()=>{
        if(!v21SelectedStartupVehicle){
          return;
        }

        const startButton=
          $('v21StartButton');

        if(startButton){
          startButton.disabled=true;
          startButton.textContent=
            'DÉMARRAGE…';
        }

        applyVehicleSelection(
          v21SelectedStartupVehicle,
          {
            announce:false
          }
        );

        transmissionMode=
          appSettings.transmissionMode===
          'manual'
            ?'manual'
            :'automatic';

        if(transmissionModeSelect){
          transmissionModeSelect.value=
            transmissionMode;
        }

        try{
          await vehicleAudio.setEnabled(
            !!appSettings.audioEnabled
          );
        }catch(error){
          console.warn(
            'Default audio activation failed',
            error
          );
        }

        gameStarted=true;
        v21BootMode='done';

        const overlay=
          $('v21Startup');

        overlay?.classList.add(
          'hidden'
        );

        if(v21MenuButton){
          v21MenuButton.style.display=
            'block';
        }

        const speedDock=
          $('speedometerDock');

        speedDock?.classList.add(
          'visible'
        );

        syncV21RuntimeControls();
        syncV21VehicleInfo();

        toast(
          `Bonne route · ${vehicleSystem.active.name}`
        );
      }
    );
}

createV21BootOverlay();

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

// V21.3: the route challenge now lives inside the route map instead of in a
// separate bar below it. Keep the original DOM nodes alive for compatibility
// with the challenge logic, but remove that old presentation from view.
if(challengeSubsection){
  challengeSubsection.style.display='none';
}

if(runChallengeEl){
  runChallengeEl.style.display='none';
}

const v21MapChallenge=
  document.createElement('div');

v21MapChallenge.id='v21MapChallenge';
v21MapChallenge.innerHTML=`
  <div class="v21ChallengeLabel">Temps :</div>
  <div class="v21ChallengeValue" id="v21ChallengeTime">00:00.000 sec</div>
  <div class="v21ChallengeLabel">Qualité :</div>
  <div class="v21ChallengeValue" id="v21ChallengeQuality">100 %</div>
`;

$('mapbox')?.appendChild(
  v21MapChallenge
);

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

function formatRunTimeDetailed(ms){
  const safe=
    Math.max(
      0,
      Math.floor(ms||0)
    );

  const milliseconds=
    safe%1000;

  const totalSeconds=
    Math.floor(safe/1000);

  const seconds=
    totalSeconds%60;

  const minutes=
    Math.floor(totalSeconds/60);

  return (
    String(minutes).padStart(2,'0')+
    ':'+
    String(seconds).padStart(2,'0')+
    '.'+
    String(milliseconds).padStart(3,'0')+
    ' sec'
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

let nextRunChallengeHudAt=0;
function updateRunChallengeHUD(now=performance.now(),force=false){
  if(!runChallengeEl)return;
  if(!force&&now<nextRunChallengeHudAt)return;
  nextRunChallengeHudAt=now+100; // 10 Hz is visually smooth for timer/quality text.

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

  const mapChallengeTime=
    $('v21ChallengeTime');

  const mapChallengeQuality=
    $('v21ChallengeQuality');

  if(mapChallengeTime){
    mapChallengeTime.textContent=
      formatRunTimeDetailed(
        runElapsedMs(now)
      );
  }

  if(mapChallengeQuality){
    mapChallengeQuality.textContent=
      String(quality)+
      ' %';
  }

  if(runTimerEl){
    runTimerEl.textContent=
      formatRunTime(
        runElapsedMs(now)
      );
  }

  if(runQualityEl){
    runQualityEl.textContent=
      String(quality);
  }

  if(qualityFillEl){
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
  }

  if(runQualityEl){
    runQualityEl.style.color=
    quality>=90
      ?'#71e29f'
      :quality>=70
        ?'#f0d56b'
        :quality>=45
          ?'#f1a263'
          :'#f06a71';
  }

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

  updateRunChallengeHUD(performance.now(),true);
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

  updateRunChallengeHUD(now,true);
}

function finishRunChallenge(now){
  if(!runChallenge.running)return;

  runChallenge.running=false;
  runChallenge.finished=true;
  runChallenge.finishedAt=now;
  runChallenge.lastSampleAt=now;

  updateRunChallengeHUD(now,true);
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

// V21.22.3 HITCH-FREE STREAMING POLICY
// Periodic work must never force a heavy scene rebuild while the player is
// actively driving. Data can stream/cache in the background; geometry is
// refreshed only when the local world actually needs to move or while the car
// is nearly stopped. This targets frame-time spikes, not average FPS.
const HITCH_FREE_STREAMING={
  perfConsoleLogging:false,
  softRecenterDistance:520,
  hardWorldRefreshDistance:1450,
  urgentWorldRefreshDistance:2200,
  calmSpeed:4.5
};

const streamRefreshState={
  pendingWorld:false,
  reasons:new Set(),
  lastBuiltCenter:{x:0,z:0},
  lastWorldBuildAt:0,
  lastHitchAt:0,
  maxFrameMs:0,
  hitchCount:0
};

function markStreamWorldRefresh(reason='stream'){
  streamRefreshState.pendingWorld=true;
  streamRefreshState.reasons.add(reason);
}

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

// Heavy streamed visuals should not all rebuild inside the same animation frame.
// Coalesce duplicate requests and let the browser place them between frames.
const deferredVisualJobs=new Map();
let deferredVisualJobSerial=0;

function scheduleVisualJob(key,job,timeout=180){
  // One pending job per subsystem. This coalesces several network/cache
  // completions into one geometry rebuild instead of producing back-to-back
  // 25-35 FPS spikes.
  if(deferredVisualJobs.has(key))return;

  const token=++deferredVisualJobSerial;
  deferredVisualJobs.set(key,token);

  const run=()=>{
    if(deferredVisualJobs.get(key)!==token)return;
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
    setTimeout(run,Math.min(120,timeout));
  }
}

function cancelVisualJob(key){
  deferredVisualJobs.delete(key);
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

// ---------- continuous road ribbon ----------
// V21.19 — robust lateral frames for extreme mountain roads.
//
// A simple "next - previous" normal works on gentle curves, but on very sharp
// hairpins it can rotate or grow unpredictably. Every road layer then builds a
// slightly different twisted quad and the wider shoulder can poke through the
// asphalt as diagonal beige wedges. Use one bounded miter frame for every road
// layer so asphalt, shoulders, edge lines and the solid road body agree exactly.
function roadLateralFrame(points,i){
  const p=points[i];

  function unitSegment(a,b){
    let x=b.x-a.x;
    let z=b.z-a.z;
    const len=Math.hypot(x,z);
    if(len<1e-5)return null;
    return {x:x/len,z:z/len};
  }

  let incoming=i>0?unitSegment(points[i-1],p):null;
  let outgoing=i<points.length-1?unitSegment(p,points[i+1]):null;

  if(!incoming){
    for(let k=i-1;k>=0&&!incoming;k--)incoming=unitSegment(points[k],p);
  }
  if(!outgoing){
    for(let k=i+1;k<points.length&&!outgoing;k++)outgoing=unitSegment(p,points[k]);
  }

  const base=outgoing||incoming||{x:0,z:1};
  const baseNormal={x:-base.z,z:base.x};

  if(!incoming||!outgoing){
    return {x:baseNormal.x,z:baseNormal.z,scale:1};
  }

  const n0={x:-incoming.z,z:incoming.x};
  const n1={x:-outgoing.z,z:outgoing.x};

  let mx=n0.x+n1.x;
  let mz=n0.z+n1.z;
  const ml=Math.hypot(mx,mz);

  // Near a 180° reversal the mathematical miter is undefined. A bounded
  // outgoing normal is visually far safer than an enormous spike.
  if(ml<0.18){
    return {x:n1.x,z:n1.z,scale:1};
  }

  mx/=ml;
  mz/=ml;

  if(mx*n1.x+mz*n1.z<0){
    mx=-mx;
    mz=-mz;
  }

  const denom=Math.abs(mx*n1.x+mz*n1.z);
  let scale=denom>0.15?1/denom:1;

  // 90° corners naturally want ~1.414x. Allow that, but never permit the huge
  // miters produced by switchbacks approaching 180°.
  scale=Math.max(0.92,Math.min(1.48,scale));

  return {x:mx*scale,z:mz*scale,scale};
}

function buildLateralBand(points,leftOffset,rightOffset,material,yOffset=0){
  if(points.length<2)return null;

  const pos=[],uv=[],idx=[];
  let cumulative=0;

  for(let i=0;i<points.length;i++){
    const p=points[i];
    const lat=roadLateralFrame(points,i);

    if(i>0)cumulative+=Math.hypot(
      p.x-points[i-1].x,
      p.z-points[i-1].z
    );

    const roll=Number.isFinite(p.roll)?p.roll:0;
    const rollSlope=Math.tan(roll);

    const pushOffset=(off)=>{
      const effectiveOff=off*lat.scale;
      pos.push(
        p.x-worldOffset.x+lat.x*off,
        p.y+yOffset+rollSlope*effectiveOff,
        p.z-worldOffset.z+lat.z*off
      );
    };

    // Vertices stay ordered left-to-right so triangle winding stays upward.
    pushOffset(leftOffset);
    pushOffset(rightOffset);
    uv.push(0,cumulative/8,1,cumulative/8);

    if(i<points.length-1){
      const a=i*2;
      idx.push(a,a+2,a+1,a+2,a+3,a+1);
    }
  }

  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  g.computeVertexNormals();

  const m=new THREE.Mesh(g,material);
  m.receiveShadow=true;
  return m;
}

function buildRibbon(points,width,material,yOffset=0){
  const half=width/2;
  return buildLateralBand(points,half,-half,material,yOffset);
}

function buildOffsetRibbon(points,offset,width,material,yOffset=0){
  const half=width/2;
  return buildLateralBand(
    points,
    offset+half,
    offset-half,
    material,
    yOffset
  );
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
    const lat=roadLateralFrame(profile,i);
    return {
      p,
      nx:lat.x,
      nz:lat.z,
      lateralScale:lat.scale
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
    const {p,nx,nz,lateralScale}=basisAt(i);

    const roll=Number.isFinite(p.roll)
      ?p.roll
      :0;

    const rollSlope=Math.tan(roll);

    const push=(off,y)=>{
      edgePos.push(
        p.x-worldOffset.x+nx*off,
        p.y+y+rollSlope*(off*lateralScale),
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
      p.y+slabBottom+rollSlope*(asphaltHalf*lateralScale),
      p.z-worldOffset.z+nz*asphaltHalf,

      p.x-worldOffset.x-nx*asphaltHalf,
      p.y+slabBottom-rollSlope*(asphaltHalf*lateralScale),
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
  // V21.15.2 — build ONE CONTIGUOUS route window around the vehicle.
  //
  // The old spatial-radius filter could select two nearby hairpins while
  // skipping the route between them when that intermediate section left the
  // 1.05 km circle. buildRibbon() then joined those disconnected samples with
  // one giant triangle strip. Extreme switchback roads such as Yungas expose
  // this immediately. A cumulative-distance window stays contiguous by design.
  const nr=nearestRoute(absX,absZ);
  const centerCum=nr?.cum||0;
  const minCum=Math.max(0,centerCum-1800);
  const maxCum=Math.min(routeLength,centerCum+3600);
  const raw=[];
  let lastIncluded=null;

  for(const seg of segments){
    const segStart=seg.cum;
    const segEnd=seg.cum+seg.len;
    if(segEnd<minCum||segStart>maxCum)continue;

    const t0=seg.len>0?Math.max(0,(minCum-segStart)/seg.len):0;
    const t1=seg.len>0?Math.min(1,(maxCum-segStart)/seg.len):1;
    if(t1<t0)continue;

    const sampledLen=Math.max(0,seg.len*(t1-t0));
    const steps=Math.max(1,Math.ceil(sampledLen/3)); // V21.21.27: <=3 m road samples for smoother pavement/marking ribbons

    for(let k=0;k<steps;k++){
      const u=k/steps;
      const t=t0+(t1-t0)*u;
      const x=seg.ax+(seg.bx-seg.ax)*t;
      const z=seg.az+(seg.bz-seg.az)*t;
      const cum=segStart+seg.len*t;
      if(!raw.length||Math.hypot(x-raw[raw.length-1].x,z-raw[raw.length-1].z)>.4){
        raw.push({x,z,y:terrainAbs(x,z),cum});
      }
    }

    lastIncluded={seg,t:t1};
  }
  if(!raw.length)return raw;

  // Add the exact clipped endpoint of the contiguous window.
  if(lastIncluded){
    const {seg,t}=lastIncluded;
    const x=seg.ax+(seg.bx-seg.ax)*t;
    const z=seg.az+(seg.bz-seg.az)*t;
    const cum=seg.cum+seg.len*t;
    if(Math.hypot(x-raw[raw.length-1].x,z-raw[raw.length-1].z)>.05){
      raw.push({x,z,y:terrainAbs(x,z),cum});
    }
  }

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
  // V21.18 — guaranteed flat departure platform.
  //
  // Some routes begin on an extreme mountainside or immediately beside a stacked
  // switchback. Starting with the raw DEM profile can therefore put the car on a
  // severe pitch/roll before the player has even moved. Keep the first 28 m of
  // road perfectly level, then ease back to the untouched profile over the next
  // 72 m. Horizontal route geometry is never changed.
  const hasRouteStart=(raw[0]?.cum||0)<=1;
  const startPlatformY=finalH[0];
  const START_FLAT_LENGTH=28;
  const START_BLEND_LENGTH=72;
  const START_BLEND_END=START_FLAT_LENGTH+START_BLEND_LENGTH;

  function startProfileWeight(cum){
    // Once streaming has moved the contiguous profile window away from route
    // kilometre 0, this feature must become a complete no-op. Otherwise every
    // streaming window would accidentally acquire its own artificial flat start.
    if(!hasRouteStart)return 1;
    const d=Math.max(0,cum);
    if(d<=START_FLAT_LENGTH)return 0;
    if(d>=START_BLEND_END)return 1;
    const t=(d-START_FLAT_LENGTH)/START_BLEND_LENGTH;
    return t*t*(3-2*t);
  }

  const startSafeH=finalH.map((height,i)=>{
    const weight=startProfileWeight(raw[i].cum);
    return startPlatformY+(height-startPlatformY)*weight;
  });

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

  return raw.map((p,i)=>{
    const startWeight=startProfileWeight(p.cum);
    return {
      x:p.x,
      z:p.z,
      y:startSafeH[i],
      cum:p.cum,
      // The departure pad is truly flat crosswise too. Camber is restored with
      // the same smooth transition used for longitudinal height.
      roll:startWeight*Math.max(
        -maxRoadRoll,
        Math.min(
          maxRoadRoll,
          smoothedRoll[i]
        )
      )
    };
  });
}
let activeRoadProfile=[];

// V21.21.3 PERFORMANCE: spatial index for the local road profile.
// roadSurfaceAt() is called many times by wheel support, skid marks and the
// projected contact shadow. Previously each call scanned the whole ~2 km
// profile. The 48 m grid keeps the exact same nearest-segment result while
// limiting normal queries to nearby profile segments. Stacked switchbacks are
// still all evaluated because every segment sharing the neighboring cells is
// retained in the candidate set.
const ROAD_PROFILE_INDEX_CELL=48;
// Nested numeric maps avoid creating "cx:cz" strings in every wheel query.
let roadProfileSpatialIndex=new Map(); // Map<cx, Map<cz, number[]>>
let roadProfileVisitMarks=new Uint32Array(0);
let roadProfileVisitStamp=1;
const roadFrameSearchState={
  found:false,
  bd:Infinity,
  y:0,angle:0,pitch:0,roll:0,px:0,pz:0,index:0,t:0,distance:0
};

function roadProfileCellList(cx,cz,create=false){
  let column=roadProfileSpatialIndex.get(cx);
  if(!column){
    if(!create)return null;
    column=new Map();
    roadProfileSpatialIndex.set(cx,column);
  }
  let list=column.get(cz);
  if(!list&&create){
    list=[];
    column.set(cz,list);
  }
  return list||null;
}

function rebuildRoadProfileSpatialIndex(){
  roadProfileSpatialIndex=new Map();
  roadProfileVisitMarks=new Uint32Array(Math.max(0,activeRoadProfile.length-1));
  roadProfileVisitStamp=1;

  for(let i=0;i<activeRoadProfile.length-1;i++){
    const a=activeRoadProfile[i],b=activeRoadProfile[i+1];
    const minCx=Math.floor(Math.min(a.x,b.x)/ROAD_PROFILE_INDEX_CELL);
    const maxCx=Math.floor(Math.max(a.x,b.x)/ROAD_PROFILE_INDEX_CELL);
    const minCz=Math.floor(Math.min(a.z,b.z)/ROAD_PROFILE_INDEX_CELL);
    const maxCz=Math.floor(Math.max(a.z,b.z)/ROAD_PROFILE_INDEX_CELL);

    for(let cx=minCx;cx<=maxCx;cx++){
      for(let cz=minCz;cz<=maxCz;cz++){
        roadProfileCellList(cx,cz,true).push(i);
      }
    }
  }
}

function evaluateRoadProfileSegmentInto(i,x,z,state){
  const a=activeRoadProfile[i],b=activeRoadProfile[i+1];
  if(!a||!b)return;
  const vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z;
  const vv=vx*vx+vz*vz||1,t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
  const px=a.x+t*vx,pz=a.z+t*vz,dx=x-px,dz=z-pz,d2=dx*dx+dz*dz;
  // Match the legacy full scan exactly on X/Z ties: earlier route segment wins.
  // This matters on stacked switchbacks that can overlap almost perfectly in plan.
  if(d2>state.bd+1e-12)return;
  if(Math.abs(d2-state.bd)<=1e-12&&state.found&&i>=state.index)return;
  const horizontal=Math.sqrt(vx*vx+vz*vz)||1;
  state.found=true;
  state.bd=d2;
  state.y=a.y+(b.y-a.y)*t;
  state.angle=Math.atan2(vx,vz);
  state.pitch=Math.atan2(b.y-a.y,horizontal);
  state.roll=(a.roll||0)+((b.roll||0)-(a.roll||0))*t;
  state.px=px;state.pz=pz;state.index=i;state.t=t;state.distance=Math.sqrt(d2);
}

function roadFrameAt(x,z,out=null){
  const segmentCount=activeRoadProfile.length-1;
  if(segmentCount<=0)return null;

  const state=roadFrameSearchState;
  state.found=false;
  state.bd=Infinity;

  const cx=Math.floor(x/ROAD_PROFILE_INDEX_CELL);
  const cz=Math.floor(z/ROAD_PROFILE_INDEX_CELL);

  roadProfileVisitStamp=(roadProfileVisitStamp+1)>>>0;
  if(roadProfileVisitStamp===0){
    roadProfileVisitMarks.fill(0);
    roadProfileVisitStamp=1;
  }
  const stamp=roadProfileVisitStamp;

  for(let dx=-1;dx<=1;dx++){
    const column=roadProfileSpatialIndex.get(cx+dx);
    if(!column)continue;
    for(let dz=-1;dz<=1;dz++){
      const list=column.get(cz+dz);
      if(!list)continue;
      for(let k=0;k<list.length;k++){
        const i=list[k];
        if(roadProfileVisitMarks[i]===stamp)continue;
        roadProfileVisitMarks[i]=stamp;
        evaluateRoadProfileSegmentInto(i,x,z,state);
      }
    }
  }

  if(!(state.found&&state.bd<=ROAD_PROFILE_INDEX_CELL*ROAD_PROFILE_INDEX_CELL)){
    for(let i=0;i<segmentCount;i++){
      if(roadProfileVisitMarks[i]===stamp)continue;
      evaluateRoadProfileSegmentInto(i,x,z,state);
    }
  }

  if(!state.found)return null;
  const result=out||{};
  result.y=state.y;
  result.angle=state.angle;
  result.pitch=state.pitch;
  result.roll=state.roll;
  result.px=state.px;
  result.pz=state.pz;
  result.index=state.index;
  result.t=state.t;
  result.distance=state.distance;
  return result;
}
function roadProfileFrameAtCum(cum,out=null){
  if(activeRoadProfile.length<2)return null;

  const target=Math.max(
    activeRoadProfile[0].cum||0,
    Math.min(
      activeRoadProfile[activeRoadProfile.length-1].cum||0,
      Number.isFinite(cum)?cum:0
    )
  );

  // Profiles are ordered by cumulative route distance. Binary search avoids the
  // ambiguity of an X/Z nearest-point lookup when two Yungas switchbacks overlap.
  let lo=0;
  let hi=activeRoadProfile.length-2;
  while(lo<=hi){
    const mid=(lo+hi)>>1;
    const a=activeRoadProfile[mid];
    const b=activeRoadProfile[mid+1];
    if(target<a.cum){
      hi=mid-1;
      continue;
    }
    if(target>b.cum){
      lo=mid+1;
      continue;
    }

    const span=Math.max(.001,b.cum-a.cum);
    const t=Math.max(0,Math.min(1,(target-a.cum)/span));
    const vx=b.x-a.x;
    const vz=b.z-a.z;
    const horizontal=Math.hypot(vx,vz)||1;
    const result=out||{};
    result.x=a.x+(b.x-a.x)*t;result.z=a.z+(b.z-a.z)*t;result.y=a.y+(b.y-a.y)*t;
    result.angle=Math.atan2(vx,vz);result.pitch=Math.atan2(b.y-a.y,horizontal);
    result.roll=(a.roll||0)+((b.roll||0)-(a.roll||0))*t;result.cum=target;result.index=mid;result.t=t;
    return result;
  }

  const p=target<=(activeRoadProfile[0].cum||0)
    ?activeRoadProfile[0]
    :activeRoadProfile[activeRoadProfile.length-1];
  const result=out||{};
  result.x=p.x;result.z=p.z;result.y=p.y;result.angle=0;result.pitch=0;result.roll=p.roll||0;
  result.cum=target;result.index=0;result.t=0;
  return result;
}

function roadHeightAt(x,z){
  const f=roadFrameAt(x,z);
  return f?f.y:terrainAbs(x,z);
}

function roadSurfaceAt(x,z,out=null){
  const frame=roadFrameAt(x,z,out);
  if(!frame)return null;
  const normalX=-Math.cos(frame.angle);
  const normalZ= Math.sin(frame.angle);
  const dx=x-frame.px;
  const dz=z-frame.pz;
  const lateral=dx*normalX+dz*normalZ;
  const roll=Number.isFinite(frame.roll)?frame.roll:0;
  frame.lateral=lateral;
  frame.y=frame.y+Math.tan(roll)*lateral+ROAD_SURFACE_OFFSET;
  return frame;
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
 g.position.set(p.x+nx*lateral-worldOffset.x,p.y+.02,p.z+nz*lateral-worldOffset.z);g.rotation.y=ang;signGroup.add(g);
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

function refreshRoadSignsOnly(){
  resetStaticGroupOrigin(signGroup);
  clearGroup(signGroup);
  addCurrentRoadSigns();
  addGeographicRoadSigns();
  freezeStaticMatrices(signGroup);
}

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
 activeRoadProfile=profile;
 rebuildRoadProfileSpatialIndex();

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
function shiftRenderedWorldForOrigin(shiftX,shiftZ){
  // Existing local coordinates describe fixed absolute geography. Shift each
  // streamed subsystem root instead of the common `world` parent. That lets a
  // subsystem be rebuilt later relative to the new worldOffset without
  // inheriting a stale parent translation.
  for(const group of streamedWorldGroups){
    group.position.x-=shiftX;
    group.position.z-=shiftZ;
    group.updateMatrix();
  }

  ground.position.x-=shiftX;
  ground.position.z-=shiftZ;
  ground.updateMatrix();
  terrainService.shiftRoadBedOrigin?.(shiftX,shiftZ);
  imageryService.shiftOrigin?.(shiftX,shiftZ);
}


function commitLocalWorldRefresh(){
  // New geometry is generated directly relative to the CURRENT worldOffset.
  // Reset temporary parent shifts immediately before replacing the old scene.
  resetStreamedWorldOrigins();
  terrainService.resetRoadBedOrigin?.();

  rebuildLocalWorld();
  imageryService.realignToOrigin?.();
  imageryService.invalidateGeometry?.();
  applyImageryToGround();
  // Chunk creation is serialized/idle-budgeted. It is safe to request the new
  // visible coverage immediately after a world refresh without resurrecting
  // the giant-canvas upload hitches removed in V21.22.3.
  if(imageryService.enabled){
    buildImageryMosaic(absX,absZ).catch(()=>{});
  }
  streamRefreshState.pendingWorld=false;
  streamRefreshState.reasons.clear();
  streamRefreshState.lastBuiltCenter={...worldOffset};
  streamRefreshState.lastWorldBuildAt=performance.now();
  markStaticShadowsDirty();
}

function scheduleLocalWorldRefresh({urgent=false}={}){
  if(deferredVisualJobs.has('world-rebuild'))return;

  // A complete V21.22.2 world refresh now includes a 448x448 high-detail
  // terrain. Never launch it from a random network completion. Prefer a calm
  // vehicle state; only force it when the old local patch is approaching its
  // safe coverage limit.
  const attempt=()=>{
    const dx=absX-streamRefreshState.lastBuiltCenter.x;
    const dz=absZ-streamRefreshState.lastBuiltCenter.z;
    const buildDistance=Math.hypot(dx,dz);
    const calm=!gameStarted||v21MenuOpen||Math.abs(speed)<=HITCH_FREE_STREAMING.calmSpeed;
    const mustRun=urgent||buildDistance>=HITCH_FREE_STREAMING.urgentWorldRefreshDistance;

    if(!calm&&!mustRun){
      // Keep the already-shifted old world perfectly aligned while driving.
      // The animation loop will retry once the car is calm; a later soft
      // recenter escalates to the hard safety threshold if needed.
      return;
    }

    commitLocalWorldRefresh();
  };

  scheduleVisualJob('world-rebuild',attempt,1200);
}

function recenterIfNeeded(absx,absz,force=false){
 const dx=absx-worldOffset.x,dz=absz-worldOffset.z;
 if(force||dx*dx+dz*dz>HITCH_FREE_STREAMING.softRecenterDistance**2){
   const shiftX=absx-worldOffset.x;
   const shiftZ=absz-worldOffset.z;
   worldOffset={x:absx,z:absz};

   camera.position.x-=shiftX;
   camera.position.z-=shiftZ;
   camTarget.x-=shiftX;
   camTarget.z-=shiftZ;
   car.position.x-=shiftX;
   car.position.z-=shiftZ;

   if(force){
     cancelVisualJob('world-rebuild');
     commitLocalWorldRefresh();
     return true;
   }

   // Cheap floating-origin shift: O(1), no terrain/road allocation.
   shiftRenderedWorldForOrigin(shiftX,shiftZ);

   const bx=absx-streamRefreshState.lastBuiltCenter.x;
   const bz=absz-streamRefreshState.lastBuiltCenter.z;
   const buildDistance=Math.hypot(bx,bz);
   if(buildDistance>=HITCH_FREE_STREAMING.hardWorldRefreshDistance){
     markStreamWorldRefresh('recenter');
     scheduleLocalWorldRefresh({
       urgent:buildDistance>=HITCH_FREE_STREAMING.urgentWorldRefreshDistance
     });
   }
   return true;
 }
 return false;
}



function resetWorldCaches(){
  worldStreaming.reset();
  aheadStreamingBuckets?.clear?.();
  terrainPreloadQueuedKeys?.clear?.();
  terrainPreloadQueue.length=0;
  nextAheadStreamingAt=0;
  lastImageryRefreshAt=0;
  streamRefreshState.pendingWorld=false;
  streamRefreshState.reasons.clear();
  streamRefreshState.lastBuiltCenter={...worldOffset};
  streamRefreshState.lastWorldBuildAt=performance.now();
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
  passedSignKeys.clear();signReadout.key=null;signReadout.text='';signReadout.startedAt=0;
  if(signStatus)signStatus.textContent='0';
  lastRoadMetaCenter={x:Infinity,z:Infinity};
  roadMetaLoading=false;
  updateRoadMetaHUD();
  activeRoadProfile=[];
  rebuildRoadProfileSpatialIndex();
  terrainService.clearRoadBed();
  clearGroup(roadGroup);clearGroup(forestGroup);
  clearGroup(infrastructureGroup);clearGroup(signGroup);
  deferredVisualJobs.clear();
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
    if(initialElevationReady||streamRefreshState.pendingWorld){
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
  version:'21.24.0-candidate',
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

const keys={};

function keyboardCodes(action){
  const configured=
    appSettings?.controls?.keyboard?.[
      action
    ];

  const fallback=
    DEFAULT_WORLD_SETTINGS
      .controls
      .keyboard[
        action
      ]||
    [];

  return Array.isArray(configured)&&
    configured.length
      ?configured
      :fallback;
}

function keyboardActionDown(action){
  return keyboardCodes(action)
    .some(code=>!!keys[code]);
}

function keyboardActionMatches(action,code){
  return keyboardCodes(action)
    .includes(code);
}

function clearKeyboardState(){
  for(const key of Object.keys(keys)){
    delete keys[key];
  }
}

function assignKeyboardBinding(action,code){
  const controls=
    appSettings.controls.keyboard;

  // One primary key can only control one action after rebinding.
  for(const otherAction of Object.keys(controls)){
    if(otherAction===action)continue;

    controls[otherAction]=
      (controls[otherAction]||[])
        .filter(
          existing=>
            existing!==code
        );
  }

  controls[action]=[code];
  queueSettingsSave();
}

addEventListener('keydown',e=>{
  if(keyboardRebindAction){
    e.preventDefault();
    e.stopPropagation();

    if(e.code==='Escape'){
      keyboardRebindAction=null;
      window.dispatchEvent(
        new CustomEvent(
          'worlddrive-keyboard-rebind-cancel'
        )
      );
      return;
    }

    const action=
      keyboardRebindAction;

    keyboardRebindAction=null;
    assignKeyboardBinding(
      action,
      e.code
    );

    window.dispatchEvent(
      new CustomEvent(
        'worlddrive-keyboard-rebound',
        {
          detail:{
            action,
            code:e.code
          }
        }
      )
    );

    return;
  }

  const inputTag=
    String(
      e.target?.tagName||
      ''
    ).toUpperCase();

  if(
    !gameStarted||
    v21MenuOpen||
    inputTag==='INPUT'||
    inputTag==='TEXTAREA'||
    inputTag==='SELECT'||
    e.target?.isContentEditable
  ){
    return;
  }

  keys[e.code]=true;

  if(
    [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Space',
      'BracketLeft',
      'BracketRight'
    ].includes(e.code)
  ){
    e.preventDefault();
  }

  if(
    !e.repeat&&
    keyboardActionMatches(
      'shiftUp',
      e.code
    )
  ){
    requestManualShift(1);
  }

  if(
    !e.repeat&&
    keyboardActionMatches(
      'shiftDown',
      e.code
    )
  ){
    requestManualShift(-1);
  }

  if(
    !e.repeat&&
    keyboardActionMatches(
      'camera',
      e.code
    )
  ){
    cameraController.cycle();
  }

  if(
    !e.repeat&&
    keyboardActionMatches(
      'assist',
      e.code
    )
  ){
    toggleAssist();
  }

  if(
    !e.repeat&&
    keyboardActionMatches(
      'autopilot',
      e.code
    )
  ){
    toggleAutopilot();
  }

  if(
    !e.repeat&&
    keyboardActionMatches(
      'reset',
      e.code
    )
  ){
    resetToRoad();
  }

  // Immediate manual takeover: steering, braking or handbrake cancels autopilot.
  if(
    autopilot&&
    (
      keyboardActionMatches(
        'steerLeft',
        e.code
      )||
      keyboardActionMatches(
        'steerRight',
        e.code
      )||
      keyboardActionMatches(
        'brake',
        e.code
      )||
      keyboardActionMatches(
        'handbrake',
        e.code
      )
    )
  ){
    setAutopilot(
      false,
      'Reprise manuelle'
    );
  }
});

addEventListener(
  'keyup',
  e=>{
    keys[e.code]=false;
  }
);

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

// ---------- V20.7 unified instrument cluster ----------
const helpPanel=$('help');
const helpToggle=$('helpToggle');
const speedometerDock=$('speedometerDock');
const showControlsBtn=$('showControlsBtn');
const speedometerCanvas=$('speedometerCanvas');
const speedometerCtx=speedometerCanvas?.getContext('2d');

// The existing speedometer dock is reused so the new cluster keeps the same
// "Commandes" show/hide behavior. Everything is drawn by code: no image asset.
const instrumentClusterStyle=document.createElement('style');
instrumentClusterStyle.textContent=`
#speedometerDock{
  width:486px!important;
  gap:7px!important;
}
#speedometerCanvas{
  width:480px!important;
  height:236px!important;
  border-radius:18px!important;
  filter:drop-shadow(0 14px 34px rgba(0,0,0,.48))!important;
}
#showControlsBtn{
  width:118px!important;
}
@media(max-width:980px){
  #speedometerDock.visible{
    transform:scale(.82);
    transform-origin:right bottom;
  }
}
@media(max-width:700px){
  #speedometerDock{
    display:none!important;
  }
}
`;
document.head.appendChild(instrumentClusterStyle);

function setGameControlsHidden(hidden){
  helpPanel?.classList.toggle('hiddenControls',hidden);
  speedometerDock?.classList.toggle('visible',hidden);
  speedometerDock?.setAttribute(
    'aria-hidden',
    hidden?'false':'true'
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

function drawGaugeBezel(
  ctx,
  cx,
  cy,
  radius,
  {
    thick=false
  }={}
){
  // Outer black housing.
  const housing=ctx.createRadialGradient(
    cx,
    cy,
    radius*.35,
    cx,
    cy,
    radius*1.12
  );

  housing.addColorStop(0,'rgba(20,22,25,.98)');
  housing.addColorStop(.72,'rgba(5,6,8,.99)');
  housing.addColorStop(1,'rgba(0,0,0,1)');

  ctx.fillStyle=housing;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius+10,
    0,
    Math.PI*2
  );
  ctx.fill();

  // Chrome / brushed-metal ring inspired by the reference cluster.
  const metal=ctx.createLinearGradient(
    cx-radius,
    cy-radius,
    cx+radius,
    cy+radius
  );

  metal.addColorStop(0,'#777d83');
  metal.addColorStop(.18,'#f2f4f5');
  metal.addColorStop(.36,'#70757b');
  metal.addColorStop(.55,'#f7f8f8');
  metal.addColorStop(.75,'#777c81');
  metal.addColorStop(1,'#d8dbde');

  ctx.strokeStyle=metal;
  ctx.lineWidth=thick?7:5;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius+3,
    0,
    Math.PI*2
  );
  ctx.stroke();

  ctx.strokeStyle='rgba(255,255,255,.65)';
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius-2,
    0,
    Math.PI*2
  );
  ctx.stroke();

  // Black dial face.
  const face=ctx.createRadialGradient(
    cx-radius*.16,
    cy-radius*.18,
    radius*.06,
    cx,
    cy,
    radius
  );

  face.addColorStop(0,'#121417');
  face.addColorStop(.52,'#08090b');
  face.addColorStop(1,'#010203');

  ctx.fillStyle=face;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius-6,
    0,
    Math.PI*2
  );
  ctx.fill();
}

let instrumentStaticBuild=false;

function drawNeedle(
  ctx,
  cx,
  cy,
  angle,
  length,
  {
    width=4,
    tail=12
  }={}
){
  if(instrumentStaticBuild)return;
  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(angle);

  ctx.shadowColor='rgba(255,38,45,.48)';
  ctx.shadowBlur=5;
  ctx.strokeStyle='#ff2d35';
  ctx.lineWidth=width;
  ctx.lineCap='round';

  ctx.beginPath();
  ctx.moveTo(-tail,0);
  ctx.lineTo(length,0);
  ctx.stroke();

  ctx.shadowBlur=0;
  ctx.restore();

  const hub=ctx.createRadialGradient(
    cx-2,
    cy-2,
    1,
    cx,
    cy,
    8
  );

  hub.addColorStop(0,'#f7f7f7');
  hub.addColorStop(.24,'#8b8d90');
  hub.addColorStop(.58,'#25282b');
  hub.addColorStop(1,'#050607');

  ctx.fillStyle=hub;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    7,
    0,
    Math.PI*2
  );
  ctx.fill();
}

function drawTachometer(
  ctx,
  {
    cx,
    cy,
    radius
  }
){
  drawGaugeBezel(
    ctx,
    cx,
    cy,
    radius
  );

  const profile=activeTransmissionProfile();
  const isCombustion=
    profile.type==='combustion';

  const start=Math.PI*.75;
  const sweep=Math.PI*1.50;

  if(!isCombustion){
    // EVs keep the same physical cluster, but we avoid inventing RPM.
    for(let i=0;i<=8;i++){
      const ratio=i/8;
      const angle=start+sweep*ratio;
      const major=i%2===0;
      const r1=major?radius-25:radius-20;
      const r2=radius-11;

      ctx.strokeStyle=
        major
          ?'rgba(245,247,248,.92)'
          :'rgba(224,229,233,.55)';

      ctx.lineWidth=major?3:1.5;

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
    }

    ctx.fillStyle='#f5f6f7';
    ctx.font='800 24px Inter,system-ui,sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(
      'EV',
      cx,
      cy-5
    );

    ctx.fillStyle='rgba(220,225,230,.74)';
    ctx.font='700 9px Inter,system-ui,sans-serif';
    ctx.fillText(
      'ELECTRIC',
      cx,
      cy+16
    );

    return;
  }

  const redline=
    Number(profile.redlineRpm)||
    6500;

  const effectiveRedline=
    effectiveEngineRedlineRpm(
      profile,
      currentOnPavementForInstruments
    );

  const dialMaxThousands=
    Math.max(
      8,
      Math.ceil(
        redline/
        1000
      )
    );

  const dialMaxRpm=
    dialMaxThousands*
    1000;

  // Dense white ticks.
  const minorStep=200;

  for(
    let value=0;
    value<=dialMaxRpm;
    value+=minorStep
  ){
    const ratio=value/dialMaxRpm;
    const angle=start+sweep*ratio;

    const major=value%1000===0;
    const mid=value%500===0;

    const r1=
      major
        ?radius-28
        :mid
          ?radius-23
          :radius-18;

    const r2=radius-10;

    const inRed=
      value>=effectiveRedline*.90;

    ctx.strokeStyle=
      inRed
        ?'#ff383e'
        :major
          ?'rgba(250,250,250,.98)'
          :mid
            ?'rgba(242,244,245,.84)'
            :'rgba(226,230,232,.62)';

    ctx.lineWidth=
      major
        ?3.3
        :mid
          ?2.2
          :1.3;

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
  }

  // RPM labels.
  for(
    let i=0;
    i<=dialMaxThousands;
    i++
  ){
    const ratio=
      (i*1000)/
      dialMaxRpm;

    const angle=
      start+
      sweep*
      ratio;

    const labelRadius=
      radius-40;

    ctx.fillStyle=
      i*1000>=effectiveRedline*.90
        ?'#ff4a50'
        :'rgba(248,248,248,.94)';

    ctx.font='800 15px Inter,system-ui,sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';

    ctx.fillText(
      String(i),
      cx+Math.cos(angle)*labelRadius,
      cy+Math.sin(angle)*labelRadius
    );
  }

  ctx.fillStyle='rgba(232,235,237,.78)';
  ctx.font='700 9px Inter,system-ui,sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(
    'x1000 RPM',
    cx,
    cy+26
  );

  const rpmRatio=
    physicsClamp(
      engineRpm/
      dialMaxRpm,
      0,
      1
    );

  drawNeedle(
    ctx,
    cx,
    cy,
    start+sweep*rpmRatio,
    radius-31,
    {
      width:3.5,
      tail:10
    }
  );
}

function drawSpeedGauge(
  ctx,
  {
    cx,
    cy,
    radius
  }
){
  drawGaugeBezel(
    ctx,
    cx,
    cy,
    radius,
    {
      thick:true
    }
  );

  const start=Math.PI*.75;
  const sweep=Math.PI*1.50;

  const mechanicalMax=
    Math.max(
      80,
      vehicleTopSpeedKmh()
    );

  const dialMax=
    Math.max(
      180,
      Math.ceil(
        mechanicalMax/
        20
      )*
      20
    );

  // Bright inner scale band.
  ctx.strokeStyle='rgba(242,244,246,.88)';
  ctx.lineWidth=5;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius-13,
    start,
    start+sweep
  );
  ctx.stroke();

  for(
    let value=0;
    value<=dialMax;
    value+=10
  ){
    const ratio=value/dialMax;
    const angle=start+sweep*ratio;

    const major=value%20===0;
    const r1=
      major
        ?radius-29
        :radius-23;

    const r2=radius-13;

    ctx.strokeStyle=
      major
        ?'#08090a'
        :'rgba(13,14,15,.72)';

    ctx.lineWidth=
      major
        ?2.5
        :1.3;

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
      ctx.fillStyle='rgba(247,247,247,.97)';
      ctx.font='800 15px Inter,system-ui,sans-serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';

      ctx.fillText(
        String(value),
        cx+Math.cos(angle)*(radius-34),
        cy+Math.sin(angle)*(radius-34)
      );
    }
  }

  ctx.fillStyle='rgba(245,246,247,.92)';
  ctx.font='800 11px Inter,system-ui,sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(
    'km/h',
    cx,
    cy-28
  );

  const kmh=
    Math.abs(speed)*
    3.6;

  const speedRatio=
    physicsClamp(
      kmh/
      dialMax,
      0,
      1
    );

  drawNeedle(
    ctx,
    cx,
    cy,
    start+sweep*speedRatio,
    radius-39,
    {
      width:4,
      tail:13
    }
  );

  // Integrated gear LCD, inspired by the rectangular display in the reference.
  const lcdW=44;
  const lcdH=44;
  const lcdX=cx-lcdW/2;
  const lcdY=cy+42;

  const lcd=ctx.createLinearGradient(
    lcdX,
    lcdY,
    lcdX,
    lcdY+lcdH
  );

  lcd.addColorStop(0,'#383c42');
  lcd.addColorStop(.48,'#202329');
  lcd.addColorStop(1,'#111318');

  ctx.fillStyle=lcd;
  ctx.strokeStyle='rgba(180,186,192,.62)';
  ctx.lineWidth=1.4;

  ctx.beginPath();
  if(ctx.roundRect){
    ctx.roundRect(
      lcdX,
      lcdY,
      lcdW,
      lcdH,
      4
    );
  }else{
    ctx.rect(
      lcdX,
      lcdY,
      lcdW,
      lcdH
    );
  }
  ctx.fill();
  ctx.stroke();

  if(!instrumentStaticBuild){
    const profile=activeTransmissionProfile();
    const isCombustion=
      profile.type==='combustion';

    let gearText;

    if(!isCombustion){
      gearText=
        speed<-.25
          ?'R'
          :'D';
    }else if(transmissionShifting){
      gearText='—';
    }else{
      gearText=
        transmissionGear<0
          ?'R'
          :String(
             Math.max(
               1,
               transmissionGear
             )
           );
    }

    ctx.fillStyle=
      revLimiterActive
        ?'#ff474d'
        :'#ff3a40';

    ctx.font='900 27px Inter,system-ui,sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';

    ctx.fillText(
      gearText,
      cx,
      lcdY+lcdH/2+1
    );

    const status=
      revLimiterActive
        ?'LIMIT'
        :transmissionShifting
          ?'SHIFT'
          :transmissionMode==='manual'
            ?'MAN'
            :'AUTO';

    if(status){
      ctx.fillStyle=
        revLimiterActive
          ?'#ff575d'
          :transmissionShifting
            ?'#ffd36a'
            :'rgba(220,226,232,.72)';

      ctx.font=
        transmissionShifting||
        revLimiterActive
          ?'900 8px Inter,system-ui,sans-serif'
          :'800 7px Inter,system-ui,sans-serif';

      ctx.fillText(
        status,
        cx,
        lcdY-5
      );
    }
  }
}

const instrumentStaticCanvas=document.createElement('canvas');
const instrumentStaticCtx=instrumentStaticCanvas.getContext('2d');
let instrumentStaticCacheKey='';
const instrumentDynamicCache={
  dialMax:180,
  tachDialMaxRpm:8000,
  isCombustion:true
};

function instrumentCacheKey(dpr){
  return [
    vehicleSystem.activeId,
    currentOnPavementForInstruments?'road':'terrain',
    dpr.toFixed(2)
  ].join('|');
}

function drawTachometerDynamic(ctx,{cx,cy,radius}){
  if(!instrumentDynamicCache.isCombustion)return;
  const start=Math.PI*.75;
  const sweep=Math.PI*1.50;
  const rpmRatio=physicsClamp(engineRpm/instrumentDynamicCache.tachDialMaxRpm,0,1);
  drawNeedle(ctx,cx,cy,start+sweep*rpmRatio,radius-31,{width:3.5,tail:10});
}

function drawSpeedGaugeDynamic(ctx,{cx,cy,radius}){
  const start=Math.PI*.75;
  const sweep=Math.PI*1.50;
  const kmh=Math.abs(speed)*3.6;
  const speedRatio=physicsClamp(kmh/instrumentDynamicCache.dialMax,0,1);
  drawNeedle(ctx,cx,cy,start+sweep*speedRatio,radius-39,{width:4,tail:13});

  const lcdH=44;
  const lcdY=cy+42;
  let gearText;
  if(!instrumentDynamicCache.isCombustion){
    gearText=speed<-.25?'R':'D';
  }else if(transmissionShifting){
    gearText='—';
  }else{
    gearText=transmissionGear<0?'R':String(Math.max(1,transmissionGear));
  }

  ctx.fillStyle=revLimiterActive?'#ff474d':'#ff3a40';
  ctx.font='900 27px Inter,system-ui,sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(gearText,cx,lcdY+lcdH/2+1);

  const status=revLimiterActive?'LIMIT':transmissionShifting?'SHIFT':transmissionMode==='manual'?'MAN':'AUTO';
  if(status){
    ctx.fillStyle=revLimiterActive?'#ff575d':transmissionShifting?'#ffd36a':'rgba(220,226,232,.72)';
    ctx.font=transmissionShifting||revLimiterActive
      ?'900 8px Inter,system-ui,sans-serif'
      :'800 7px Inter,system-ui,sans-serif';
    ctx.fillText(status,cx,lcdY-5);
  }
}

function rebuildInstrumentStaticCache(dpr,cssW,cssH){
  const profile=activeTransmissionProfile();
  instrumentDynamicCache.isCombustion=profile.type==='combustion';
  instrumentDynamicCache.tachDialMaxRpm=Math.max(8,Math.ceil((Number(profile.redlineRpm)||6500)/1000))*1000;
  const mechanicalMax=Math.max(80,vehicleTopSpeedKmh());
  instrumentDynamicCache.dialMax=Math.max(180,Math.ceil(mechanicalMax/20)*20);

  const pxW=Math.round(cssW*dpr);
  const pxH=Math.round(cssH*dpr);
  instrumentStaticCanvas.width=pxW;
  instrumentStaticCanvas.height=pxH;
  const ctx=instrumentStaticCtx;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);

  const panel=ctx.createLinearGradient(0,0,0,cssH);
  panel.addColorStop(0,'rgba(9,10,12,.92)');
  panel.addColorStop(.38,'rgba(1,2,3,.97)');
  panel.addColorStop(1,'rgba(0,0,0,.99)');
  ctx.fillStyle=panel;
  ctx.strokeStyle='rgba(118,124,130,.30)';
  ctx.lineWidth=1.5;
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(2,2,cssW-4,cssH-4,22);else ctx.rect(2,2,cssW-4,cssH-4);
  ctx.fill();ctx.stroke();

  const hood=ctx.createLinearGradient(0,0,0,52);
  hood.addColorStop(0,'rgba(25,27,30,.80)');
  hood.addColorStop(1,'rgba(3,4,5,0)');
  ctx.fillStyle=hood;
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(16,8,cssW-32,55,24);else ctx.rect(16,8,cssW-32,55);
  ctx.fill();

  instrumentStaticBuild=true;
  try{
    drawTachometer(ctx,{cx:108,cy:125,radius:84});
    drawSpeedGauge(ctx,{cx:337,cy:120,radius:112});
  }finally{
    instrumentStaticBuild=false;
  }
}

function drawSpeedometer(){
  if(!speedometerCtx||!speedometerDock?.classList.contains('visible'))return;

  const canvas=speedometerCanvas;
  const dpr=devicePixelRatio||1;
  const cssW=480;
  const cssH=236;
  const pxW=Math.round(cssW*dpr);
  const pxH=Math.round(cssH*dpr);
  if(canvas.width!==pxW||canvas.height!==pxH){
    canvas.width=pxW;
    canvas.height=pxH;
    instrumentStaticCacheKey='';
  }

  const key=instrumentCacheKey(dpr);
  if(key!==instrumentStaticCacheKey){
    rebuildInstrumentStaticCache(dpr,cssW,cssH);
    instrumentStaticCacheKey=key;
  }

  const ctx=speedometerCtx;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(instrumentStaticCanvas,0,0);
  ctx.setTransform(dpr,0,0,dpr,0,0);

  // Dynamic layer remains full-rate: only the two needles and the LCD text are
  // repainted each frame. The expensive bezels, gradients, ticks and labels are
  // pixel-identical cached content.
  drawTachometerDynamic(ctx,{cx:108,cy:125,radius:84});
  drawSpeedGaugeDynamic(ctx,{cx:337,cy:120,radius:112});
}

// V21 always starts with the compact instrument cluster visible.
// Visibility is now persisted in IndexedDB through appSettings.display.
setGameControlsHidden(true);

// ---------- compass ----------
const compassCanvas=$('compass'),compassCtx=compassCanvas.getContext('2d'),compassHeading=$('compassHeading');
const compassTapeCanvas=document.createElement('canvas');
const compassTapeCtx=compassTapeCanvas.getContext('2d');
let compassTapeKey='';

function headingDeg(){
  // World coordinates use +X = east and +Z = south because llToXZ()
  // negates latitude. Vehicle heading 0 therefore points SOUTH, not north.
  let d=(180-heading*180/Math.PI)%360;
  if(d<0)d+=360;
  return d;
}
function cardinalLabel(d){
  const labels=['N','NE','E','SE','S','SO','O','NO'];
  return labels[Math.round(d/45)%8];
}

function rebuildCompassTape(w,h,dpr){
  const pxPerDeg=w/120;
  const tapeCssW=w*9; // 1080 degrees: safe crop across the 0/360 wrap.
  compassTapeCanvas.width=Math.max(1,Math.round(tapeCssW*dpr));
  compassTapeCanvas.height=Math.max(1,Math.round(h*dpr));
  const ctx=compassTapeCtx;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,tapeCssW,h);

  for(let deg=0;deg<=1080;deg+=5){
    const norm=((deg%360)+360)%360;
    const x=deg*pxPerDeg;
    const major=(norm%45===0);
    const mid=(norm%15===0);
    const tickH=major?16:mid?10:6;
    ctx.strokeStyle=major?'rgba(255,255,255,.95)':mid?'rgba(255,255,255,.5)':'rgba(255,255,255,.28)';
    ctx.lineWidth=major?2:1;
    ctx.beginPath();
    ctx.moveTo(x,12);ctx.lineTo(x,12+tickH);ctx.stroke();

    if(major){
      const txt=cardinalLabel(norm);
      ctx.font='700 12px system-ui';
      ctx.textAlign='center';
      ctx.textBaseline='top';
      ctx.fillStyle=(txt==='N')?'#ff6767':'#e4edf6';
      ctx.fillText(txt,x,31);
    }
  }
}

let lastCompassHeadingText='';
function drawCompass(){
  const dpr=devicePixelRatio||1,w=compassCanvas.clientWidth,h=compassCanvas.clientHeight;
  const W=Math.round(w*dpr),H=Math.round(h*dpr);
  if(compassCanvas.width!==W||compassCanvas.height!==H){
    compassCanvas.width=W;compassCanvas.height=H;compassTapeKey='';
  }
  const tapeKey=`${W}x${H}@${dpr.toFixed(2)}`;
  if(tapeKey!==compassTapeKey){
    rebuildCompassTape(w,h,dpr);
    compassTapeKey=tapeKey;
  }

  const hd=headingDeg();
  const pxPerDeg=w/120;
  const center=w/2;
  const sourceCssX=(hd+360)*pxPerDeg-center;

  // Full-rate refresh remains intact, but all ticks/labels come from one cached
  // strip. Per-frame work is a single blit plus the center marker.
  compassCtx.setTransform(1,0,0,1,0,0);
  compassCtx.clearRect(0,0,W,H);
  compassCtx.drawImage(
    compassTapeCanvas,
    sourceCssX*dpr,0,w*dpr,h*dpr,
    0,0,W,H
  );

  compassCtx.setTransform(dpr,0,0,dpr,0,0);
  compassCtx.strokeStyle='rgba(255,255,255,.16)';
  compassCtx.lineWidth=1;
  compassCtx.beginPath();
  compassCtx.moveTo(center,10);compassCtx.lineTo(center,h-8);compassCtx.stroke();

  const headingText=`${cardinalLabel(hd)} · ${String(Math.round(hd)%360).padStart(3,'0')}°`;
  if(headingText!==lastCompassHeadingText){
    lastCompassHeadingText=headingText;
    compassHeading.textContent=headingText;
  }
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

// V21.22.4 — TWO-DIMENSIONAL TERRAIN PRELOAD BUFFER.
//
// V21.22.2 expanded the high-quality DEM/imagery ground to a 5.6 km square.
// Warming only a few points on the road centreline was therefore insufficient:
// lateral portions of the visible square could still enter view before their
// real DEM/image tiles were cached, exposing the stretched procedural fallback.
//
// This policy keeps V21.22.3 hitch-free semantics: every request below is
// CACHE-ONLY. Network/cache completion never mutates scene geometry. The queue
// is drained in small batches so preloading cannot become a new main-thread
// frame-time spike.
const TERRAIN_PRELOAD_BUFFER={
  aheadDistance:10500,
  behindDistance:1800,
  longitudinalStep:900,
  lateralOffsets:[0,-1500,1500,-3000,3000],
  speedLeadPerMps:38,
  maxSpeedLead:3200,
  batchSize:5,
  bootstrapAheadDistance:7200,
  bootstrapStep:1200,
  bootstrapLateralOffsets:[0,-2800,2800],
  bootstrapTimeoutMs:6500
};

const aheadStreamingBuckets=new Set();
const terrainPreloadQueuedKeys=new Set();
const terrainPreloadQueue=[];
let nextAheadStreamingAt=0;
let lastImageryRefreshAt=0;

function routeTravelSign(nr){
  if(!nr)return 1;
  return Math.cos(heading-nr.angle)>=0?1:-1;
}

function routeBufferProbe(cum,lateralOffset=0){
  const p=routePointAtCum(cum);
  if(!p)return null;
  // Same road-normal convention used by the road/shoulder geometry.
  const nx=Math.cos(p.angle),nz=-Math.sin(p.angle);
  return {
    x:p.x+nx*lateralOffset,
    z:p.z+nz*lateralOffset,
    cum,
    lateralOffset
  };
}

function terrainPreloadKey(dir,cum,lateralOffset){
  const longBucket=Math.round(cum/450);
  const lateralBucket=Math.round(lateralOffset/500);
  return `${dir}:${longBucket}:${lateralBucket}`;
}

function enqueueTerrainPreloadProbe(dir,cum,lateralOffset){
  const key=terrainPreloadKey(dir,cum,lateralOffset);
  if(aheadStreamingBuckets.has(key)||terrainPreloadQueuedKeys.has(key))return false;
  const probe=routeBufferProbe(cum,lateralOffset);
  if(!probe)return false;
  terrainPreloadQueuedKeys.add(key);
  terrainPreloadQueue.push({...probe,key});
  return true;
}

function refillTerrainPreloadBuffer(){
  if(!routeLength||!route.length)return 0;
  const nr=nearestRoute(absX,absZ);
  if(!nr)return 0;

  const dir=routeTravelSign(nr);
  const speedLead=Math.min(
    TERRAIN_PRELOAD_BUFFER.maxSpeedLead,
    Math.abs(speed)*TERRAIN_PRELOAD_BUFFER.speedLeadPerMps
  );
  const ahead=TERRAIN_PRELOAD_BUFFER.aheadDistance+speedLead;
  let queued=0;

  for(
    let distance=-TERRAIN_PRELOAD_BUFFER.behindDistance;
    distance<=ahead;
    distance+=TERRAIN_PRELOAD_BUFFER.longitudinalStep
  ){
    const cum=Math.max(0,Math.min(routeLength,nr.cum+dir*distance));
    for(const lateralOffset of TERRAIN_PRELOAD_BUFFER.lateralOffsets){
      if(enqueueTerrainPreloadProbe(dir,cum,lateralOffset))queued++;
    }
  }
  return queued;
}

function startTerrainPreloadProbe(probe){
  terrainPreloadQueuedKeys.delete(probe.key);
  aheadStreamingBuckets.add(probe.key);

  try{
    const promise=elevationService.prefetchAt?.(probe.x,probe.z);
    if(promise!==undefined)Promise.resolve(promise).catch(()=>{});
  }catch{}

  if(imageryService.enabled){
    try{
      const promise=imageryService.prefetchAt?.(probe.x,probe.z);
      if(promise!==undefined)Promise.resolve(promise).catch(()=>{});
    }catch{}
  }
}

function drainTerrainPreloadBuffer(maxJobs=TERRAIN_PRELOAD_BUFFER.batchSize){
  let started=0;
  while(started<maxJobs&&terrainPreloadQueue.length){
    const probe=terrainPreloadQueue.shift();
    if(!probe)break;
    startTerrainPreloadProbe(probe);
    started++;
  }

  // Bound duplicate-suppression memory on very long drives.
  if(aheadStreamingBuckets.size>900){
    const keep=[...aheadStreamingBuckets].slice(-620);
    aheadStreamingBuckets.clear();
    keep.forEach(key=>aheadStreamingBuckets.add(key));
  }
  return started;
}

function prefetchRouteAhead(){
  const queued=refillTerrainPreloadBuffer();
  const started=drainTerrainPreloadBuffer();
  return queued>0||started>0;
}

function promiseWithTimeout(promise,timeoutMs){
  return Promise.race([
    Promise.resolve(promise),
    new Promise(resolve=>setTimeout(()=>resolve(null),timeoutMs))
  ]);
}

async function primeInitialTerrainPreloadBuffer(){
  if(!routeLength||!route.length)return;
  const nr=nearestRoute(absX,absZ);
  if(!nr)return;
  const dir=routeTravelSign(nr);
  const tasks=[];

  for(
    let distance=0;
    distance<=TERRAIN_PRELOAD_BUFFER.bootstrapAheadDistance;
    distance+=TERRAIN_PRELOAD_BUFFER.bootstrapStep
  ){
    const cum=Math.max(0,Math.min(routeLength,nr.cum+dir*distance));
    for(const lateralOffset of TERRAIN_PRELOAD_BUFFER.bootstrapLateralOffsets){
      const key=terrainPreloadKey(dir,cum,lateralOffset);
      if(aheadStreamingBuckets.has(key))continue;
      const probe=routeBufferProbe(cum,lateralOffset);
      if(!probe)continue;
      aheadStreamingBuckets.add(key);

      try{
        const promise=elevationService.prefetchAt?.(probe.x,probe.z);
        if(promise!==undefined)tasks.push(Promise.resolve(promise).catch(()=>null));
      }catch{}
      if(imageryService.enabled){
        try{
          const promise=imageryService.prefetchAt?.(probe.x,probe.z);
          if(promise!==undefined)tasks.push(Promise.resolve(promise).catch(()=>null));
        }catch{}
      }
    }
  }

  // Route creation may wait briefly for the critical first buffer, but never
  // indefinitely on a slow tile server. Remaining probes continue cache-only.
  if(tasks.length){
    await promiseWithTimeout(
      Promise.allSettled(tasks),
      TERRAIN_PRELOAD_BUFFER.bootstrapTimeoutMs
    );
  }

  refillTerrainPreloadBuffer();
  drainTerrainPreloadBuffer(TERRAIN_PRELOAD_BUFFER.batchSize*2);
}

function refreshCurrentImagerySooner(now){
  if(!imageryService.enabled)return;
  // V21.22.5 chunk composition is serialized and committed during idle time,
  // so visible satellite coverage may advance while driving without a giant
  // monolithic canvas upload. Tile prefetch remains cache-only ahead of this.
  const center=imageryService.center;
  if(!center||!Number.isFinite(center.x)||!Number.isFinite(center.z))return;
  const moved=Math.hypot(absX-center.x,absZ-center.z);
  if(moved<520||now-lastImageryRefreshAt<1200)return;
  lastImageryRefreshAt=now;
  buildImageryMosaic(absX,absZ).catch(()=>{});
}


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

// ---------- V21 reorganized menu ----------
const KEYBOARD_ACTION_LABELS={
  accelerate:'Accélérer',
  brake:'Freiner / reculer',
  steerLeft:'Tourner à gauche',
  steerRight:'Tourner à droite',
  handbrake:'Frein à main',
  shiftUp:'Rapport +',
  shiftDown:'Rapport −',
  camera:'Changer caméra',
  assist:'Assistance voie',
  autopilot:'Pilote automatique',
  reset:'Replacer sur la route'
};

const GAMEPAD_ACTION_LABELS={
  shiftUpButton:'Rapport +',
  shiftDownButton:'Rapport −',
  handbrakeButton:'Frein à main',
  cameraButton:'Changer caméra',
  assistButton:'Assistance voie',
  autopilotButton:'Pilote automatique',
  resetButton:'Replacer sur la route',
  reverseViewButton:'Vue arrière'
};

const GAMEPAD_BUTTONS=[
  [0,'A'],
  [1,'B'],
  [2,'X'],
  [3,'Y'],
  [4,'LB'],
  [5,'RB'],
  [6,'LT'],
  [7,'RT'],
  [8,'View / Back'],
  [9,'Menu / Start'],
  [10,'L3'],
  [11,'R3'],
  [12,'D-pad haut'],
  [13,'D-pad bas'],
  [14,'D-pad gauche'],
  [15,'D-pad droite']
];

const GAMEPAD_AXES=[
  [0,'Stick gauche X'],
  [1,'Stick gauche Y'],
  [2,'Stick droit X'],
  [3,'Stick droit Y']
];

function prettyKeyCode(code){
  const aliases={
    Space:'Espace',
    ArrowUp:'↑',
    ArrowDown:'↓',
    ArrowLeft:'←',
    ArrowRight:'→',
    BracketLeft:'[',
    BracketRight:']',
    Escape:'Échap'
  };

  if(aliases[code]){
    return aliases[code];
  }

  if(/^Key[A-Z]$/.test(code)){
    return code.slice(3);
  }

  if(/^Digit\d$/.test(code)){
    return code.slice(5);
  }

  return code||'—';
}

function prettyKeyboardBinding(action){
  const codes=
    keyboardCodes(action);

  return codes
    .map(prettyKeyCode)
    .join(' / ');
}

function formatCacheBytes(bytes){
  const value=
    Math.max(
      0,
      Number(bytes)||0
    );

  if(value<1024){
    return `${Math.round(value)} o`;
  }

  if(value<1024*1024){
    return `${(value/1024).toFixed(1)} Ko`;
  }

  if(value<1024*1024*1024){
    return `${(value/1024/1024).toFixed(1)} Mo`;
  }

  return `${(value/1024/1024/1024).toFixed(2)} Go`;
}

function v21SetToggle(
  id,
  enabled,
  {
    on='ON',
    off='OFF'
  }={}
){
  const button=$(id);
  if(!button)return;

  button.textContent=
    enabled
      ?on
      :off;

  button.classList.toggle(
    'on',
    !!enabled
  );
}

function syncV21VehicleInfo(){
  const active=
    vehicleSystem?.active;

  if(!active)return;

  const drivetrain=
    $('v21VehicleDrivetrain');

  const gears=
    $('v21VehicleGears');

  const redline=
    $('v21VehicleRedline');

  const top=
    $('v21VehicleTop');

  if(drivetrain){
    drivetrain.textContent=
      active.physics?.drivetrain||
      '—';
  }

  if(gears){
    gears.textContent=
      active.audio?.type==='combustion'
        ?`${active.audio.gearCount||active.audio.gearRatios?.length||'—'} rapports`
        :'Électrique';
  }

  if(redline){
    redline.textContent=
      active.audio?.type==='combustion'
        ?`${Math.round(active.audio.redlineRpm||0)} RPM`
        :'—';
  }

  if(top){
    top.textContent=
      `${Math.round(vehicleTopSpeedKmh())} km/h`;
  }
}

function applyV21DisplayVisibility(){
  const display=
    appSettings.display||
    DEFAULT_WORLD_SETTINGS.display;

  const dock=
    $('speedometerDock');

  if(dock){
    dock.style.display=
      display.cluster
        ?''
        :'none';

    if(display.cluster){
      dock.classList.add('visible');
    }
  }

  const map=
    $('mapbox');

  if(map){
    map.style.display=
      display.minimap
        ?''
        :'none';
  }

  const compass=
    $('compassWrap');

  if(compass){
    compass.style.display=
      display.compass
        ?''
        :'none';
  }
}

function syncV21RuntimeControls(){
  v21SetToggle(
    'v21AssistToggle',
    !!assist
  );

  v21SetToggle(
    'v21RoadLimitsToggle',
    !!obeyRoadSpeedLimits
  );

  v21SetToggle(
    'v21ImageryToggle',
    !!imageryService?.enabled
  );

  v21SetToggle(
    'v21AudioToggle',
    !!appSettings.audioEnabled
  );

  v21SetToggle(
    'v21ClusterToggle',
    !!appSettings.display?.cluster
  );

  v21SetToggle(
    'v21MinimapToggle',
    !!appSettings.display?.minimap
  );

  v21SetToggle(
    'v21CompassToggle',
    !!appSettings.display?.compass
  );

  const distance=
    $('v21DisplayDistance');

  if(distance){
    distance.value=
      appSettings.displayDistance||
      'high';
  }

  if(transmissionModeSelect){
    transmissionModeSelect.value=
      transmissionMode;
  }

  const autoStatus=
    $('v21AutopilotState');

  if(autoStatus){
    autoStatus.textContent=
      autopilot
        ?'ON'
        :'OFF';
  }

  syncV21VehicleInfo();
  refreshV21KeyboardBindings();
}

async function refreshV21CacheStats(){
  const sizeEl=
    $('v21CacheSize');

  const recordsEl=
    $('v21CacheRecords');

  if(sizeEl){
    sizeEl.textContent='Calcul…';
  }

  try{
    const stats=
      await getWorldCacheStats();

    if(sizeEl){
      sizeEl.textContent=
        formatCacheBytes(
          stats.bytes
        );
    }

    if(recordsEl){
      recordsEl.textContent=
        `${stats.records} éléments`;
    }
  }catch(error){
    console.warn(
      'Cache stats failed',
      error
    );

    if(sizeEl){
      sizeEl.textContent='—';
    }

    if(recordsEl){
      recordsEl.textContent='Indisponible';
    }
  }
}

function refreshV21KeyboardBindings(){
  const container=
    $('v21KeyboardControls');

  if(!container)return;

  for(const button of container.querySelectorAll('[data-keyboard-action]')){
    const action=
      button.dataset.keyboardAction;

    button.textContent=
      prettyKeyboardBinding(
        action
      );
  }
}

function buildV21KeyboardControls(){
  const wrap=
    document.createElement('div');

  wrap.id=
    'v21KeyboardControls';

  wrap.className=
    'v21ControlsGrid';

  for(
    const [action,label]
    of Object.entries(
      KEYBOARD_ACTION_LABELS
    )
  ){
    const name=
      document.createElement('div');

    name.className=
      'v21ControlName';

    name.textContent=
      label;

    const value=
      document.createElement('div');

    value.className=
      'v21ControlValue';

    const button=
      document.createElement('button');

    button.type='button';
    button.className=
      'v21MenuBtn';

    button.dataset.keyboardAction=
      action;

    button.textContent=
      prettyKeyboardBinding(
        action
      );

    button.addEventListener(
      'click',
      ()=>{
        keyboardRebindAction=
          action;

        button.textContent=
          'Appuyez sur une touche…';
      }
    );

    value.appendChild(button);
    wrap.append(name,value);
  }

  return wrap;
}

function gamepadOptionHtml(
  selectedValue,
  {
    allowNone=false
  }={}
){
  const parts=[];

  if(allowNone){
    parts.push(
      `<option value="" ${selectedValue===null?'selected':''}>—</option>`
    );
  }

  for(const [value,label] of GAMEPAD_BUTTONS){
    parts.push(
      `<option value="${value}" ${Number(selectedValue)===value?'selected':''}>${label}</option>`
    );
  }

  return parts.join('');
}

function buildV21GamepadControls(){
  const wrap=
    document.createElement('div');

  wrap.className=
    'v21ControlsGrid';

  const controls=
    appSettings.controls.gamepad;

  const sensitivityName=
    document.createElement('div');

  sensitivityName.className=
    'v21ControlName';

  sensitivityName.textContent=
    'Sensibilité joysticks';

  const sensitivityValue=
    document.createElement('div');

  sensitivityValue.className=
    'v21ControlValue v21JoystickSensitivity';

  const sensitivitySlider=
    document.createElement('input');

  sensitivitySlider.type='range';
  sensitivitySlider.min='50';
  sensitivitySlider.max='200';
  sensitivitySlider.step='5';
  sensitivitySlider.setAttribute(
    'aria-label',
    'Sensibilité des joysticks de la manette'
  );

  const rawSensitivity=
    Number(controls.joystickSensitivity);

  const sensitivity=
    Number.isFinite(rawSensitivity)
      ?Math.max(.5,Math.min(2,rawSensitivity))
      :1;

  sensitivitySlider.value=
    String(Math.round(sensitivity*100));

  const sensitivityLabel=
    document.createElement('span');

  const syncSensitivityLabel=()=>{
    sensitivityLabel.textContent=
      `${sensitivitySlider.value} %`;
  };

  syncSensitivityLabel();

  sensitivitySlider.addEventListener(
    'input',
    ()=>{
      controls.joystickSensitivity=
        Number(sensitivitySlider.value)/100;

      syncSensitivityLabel();
      queueSettingsSave();
    }
  );

  sensitivityValue.append(
    sensitivitySlider,
    sensitivityLabel
  );

  wrap.append(
    sensitivityName,
    sensitivityValue
  );

  const addSelect=(
    label,
    key,
    choices,
    {
      allowNone=false
    }={}
  )=>{
    const name=
      document.createElement('div');

    name.className=
      'v21ControlName';

    name.textContent=label;

    const value=
      document.createElement('div');

    value.className=
      'v21ControlValue';

    const select=
      document.createElement('select');

    select.className=
      'v21MenuSelect';

    if(choices==='buttons'){
      select.innerHTML=
        gamepadOptionHtml(
          controls[key],
          {
            allowNone
          }
        );
    }else{
      select.innerHTML=
        choices
          .map(
            ([index,text])=>
              `<option value="${index}" ${Number(controls[key])===index?'selected':''}>${text}</option>`
          )
          .join('');
    }

    select.addEventListener(
      'change',
      ()=>{
        controls[key]=
          allowNone&&
          select.value===''
            ?null
            :Number(
               select.value
             );

        queueSettingsSave();
      }
    );

    value.appendChild(select);
    wrap.append(name,value);
  };

  addSelect(
    'Direction',
    'steerAxis',
    GAMEPAD_AXES
  );

  addSelect(
    'Caméra horizontale',
    'lookXAxis',
    GAMEPAD_AXES
  );

  addSelect(
    'Caméra verticale',
    'lookYAxis',
    GAMEPAD_AXES
  );

  addSelect(
    'Accélérateur',
    'throttleButton',
    'buttons'
  );

  addSelect(
    'Frein / recul',
    'brakeButton',
    'buttons'
  );

  for(
    const [key,label]
    of Object.entries(
      GAMEPAD_ACTION_LABELS
    )
  ){
    addSelect(
      label,
      key,
      'buttons',
      {
        allowNone:
          key==='assistButton'
      }
    );
  }

  return wrap;
}

function createV21Section(
  title,
  content
){
  const section=
    document.createElement('section');

  section.className='v21Section';

  if(title){
    const heading=
      document.createElement('div');

    heading.className=
      'v21SectionTitle';

    heading.textContent=
      title;

    section.appendChild(
      heading
    );
  }

  if(content){
    section.appendChild(
      content
    );
  }

  return section;
}

function createV21Row(
  label,
  control,
  subtext=''
){
  const row=
    document.createElement('div');

  row.className='v21Row';

  const labelWrap=
    document.createElement('div');

  labelWrap.className=
    'v21Label';

  labelWrap.textContent=
    label;

  if(subtext){
    const small=
      document.createElement('small');

    small.textContent=
      subtext;

    labelWrap.appendChild(
      small
    );
  }

  row.append(
    labelWrap,
    control
  );

  return row;
}

function createV21ToggleButton(
  id,
  handler
){
  const button=
    document.createElement('button');

  button.type='button';
  button.id=id;
  button.className=
    'v21Toggle';

  button.addEventListener(
    'click',
    handler
  );

  return button;
}

function parseV21DesktopMultiplayerTarget(value){
  let raw=String(value||'').trim();
  raw=raw.replace(/^wss?:\/\//i,'');
  raw=raw.split('/')[0].trim();

  const match=raw.match(/^([A-Za-z0-9._-]+)(?::(\d{1,5}))?$/);
  if(!match){
    return null;
  }

  const port=match[2]
    ?Math.max(1,Math.min(65535,Number(match[2])||8081))
    :8081;

  return {
    host:match[1],
    port
  };
}

function waitV21DesktopNetwork(ms=110){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function installV21DesktopMultiplayer(multiplayerPanel){
  const desktop=window.worldDriveDesktop;
  const api=desktop?.multiplayer;

  if(!desktop?.isDesktop||!api||!multiplayerPanel){
    return;
  }

  const wrap=document.createElement('div');
  wrap.className='v21DesktopMp';

  const status=document.createElement('div');
  status.className='v21DesktopMpStatus';
  status.dataset.state='off';
  status.textContent='Aucune session Windows active.';

  const hostActions=document.createElement('div');
  hostActions.className='v21DesktopMpActions';

  const hostButton=document.createElement('button');
  hostButton.type='button';
  hostButton.className='v21MenuBtn';
  hostButton.textContent='Héberger une session';

  const stopButton=document.createElement('button');
  stopButton.type='button';
  stopButton.className='v21MenuBtn danger';
  stopButton.textContent='Arrêter';
  stopButton.disabled=true;

  hostActions.append(hostButton,stopButton);

  const joinWrap=document.createElement('div');
  joinWrap.className='v21DesktopMpJoin';

  const hostInput=document.createElement('input');
  hostInput.type='text';
  hostInput.className='v21DesktopMpInput';
  hostInput.autocomplete='off';
  hostInput.spellcheck=false;
  hostInput.placeholder='IP du PC hôte, ex. 192.168.1.42';
  hostInput.value=localStorage.getItem('worlddrive_windows_mp_host')||'';

  const joinButton=document.createElement('button');
  joinButton.type='button';
  joinButton.className='v21MenuBtn';
  joinButton.textContent='Se connecter';

  joinWrap.append(hostInput,joinButton);

  const hint=document.createElement('div');
  hint.className='v21DesktopMpHint';
  hint.textContent='LAN Windows · port 8081 par défaut. Autorise World Drive dans le pare-feu Windows si demandé.';

  wrap.append(hostActions,joinWrap,status,hint);

  multiplayerPanel.appendChild(
    createV21Section(
      'Session Windows',
      wrap
    )
  );

  let busy=false;

  function setBusy(value){
    busy=!!value;
    hostButton.disabled=busy;
    joinButton.disabled=busy;
    hostInput.disabled=busy;
    if(busy)stopButton.disabled=true;
  }

  function applyStatus(result){
    const state=result||{};
    stopButton.disabled=busy||state.mode==='off'||!state.mode;

    if(state.mode==='host'){
      const addresses=(state.lanUrls||[]).slice(0,3);
      const addressText=addresses.length
        ?addresses.join(' · ')
        :(state.localUrl||'ws://127.0.0.1:8081');
      status.dataset.state='on';
      status.textContent=`Session hébergée · ${addressText} · donne une de ces adresses aux autres joueurs.`;
      return;
    }

    if(state.mode==='join'){
      const remote=state.remoteHost
        ?`${state.remoteHost}:${state.remotePort||8081}`
        :'hôte LAN';
      status.dataset.state='on';
      status.textContent=`Connexion Windows prête · ${remote}. Le jeu passe par le relais local ${state.localUrl||'ws://127.0.0.1:8081'}.`;
      return;
    }

    if(state.error){
      status.dataset.state='error';
      status.textContent=`Erreur réseau · ${state.error}`;
      return;
    }

    status.dataset.state='off';
    status.textContent='Aucune session Windows active.';
  }

  async function resetGameClient(){
    try{
      multiplayer.disconnect();
    }catch{}
    await waitV21DesktopNetwork();
  }

  hostButton.addEventListener('click',async()=>{
    if(busy)return;
    setBusy(true);
    status.dataset.state='off';
    status.textContent='Démarrage de la session LAN…';

    try{
      await resetGameClient();
      const result=await api.host({port:8081});
      applyStatus(result);

      if(!result?.ok||result.mode!=='host'){
        toast(result?.error||'Impossible de démarrer la session multijoueur');
        return;
      }

      await waitV21DesktopNetwork(140);
      multiplayer.connect();
      toast('Session multijoueur hébergée');
    }catch(error){
      applyStatus({error:error?.message||String(error)});
      toast('Impossible de démarrer la session multijoueur');
    }finally{
      setBusy(false);
      try{
        applyStatus(await api.status());
      }catch{}
    }
  });

  joinButton.addEventListener('click',async()=>{
    if(busy)return;

    const target=parseV21DesktopMultiplayerTarget(hostInput.value);
    if(!target){
      status.dataset.state='error';
      status.textContent='Adresse invalide. Exemple : 192.168.1.42 ou PC-SALON:8081';
      return;
    }

    localStorage.setItem('worlddrive_windows_mp_host',hostInput.value.trim());
    setBusy(true);
    status.dataset.state='off';
    status.textContent=`Préparation de la connexion vers ${target.host}:${target.port}…`;

    try{
      await resetGameClient();
      const result=await api.join({
        host:target.host,
        port:target.port,
        localPort:8081
      });
      applyStatus(result);

      if(!result?.ok||result.mode!=='join'){
        toast(result?.error||'Impossible de joindre la session multijoueur');
        return;
      }

      await waitV21DesktopNetwork(140);
      multiplayer.connect();
      toast(`Connexion à ${target.host}:${target.port}`);
    }catch(error){
      applyStatus({error:error?.message||String(error)});
      toast('Impossible de joindre la session multijoueur');
    }finally{
      setBusy(false);
      try{
        applyStatus(await api.status());
      }catch{}
    }
  });

  hostInput.addEventListener('keydown',event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      joinButton.click();
    }
  });

  stopButton.addEventListener('click',async()=>{
    if(busy)return;
    setBusy(true);

    try{
      await resetGameClient();
      applyStatus(await api.stop());
      toast('Session multijoueur arrêtée');
    }catch(error){
      applyStatus({error:error?.message||String(error)});
    }finally{
      setBusy(false);
      try{
        applyStatus(await api.status());
      }catch{}
    }
  });

  api.status()
    .then(async result=>{
      applyStatus(result);
      if(result?.mode==='host'||result?.mode==='join'){
        await waitV21DesktopNetwork(160);
        if(!multiplayer.isConnected())multiplayer.connect();
      }
    })
    .catch(()=>{});
}

function setV21MenuOpen(open){
  v21MenuOpen=
    !!open;

  if(v21MenuEl){
    v21MenuEl.classList.toggle(
      'open',
      v21MenuOpen
    );
  }

  if(v21MenuButton){
    v21MenuButton.textContent=
      '☰ MENU';

    v21MenuButton.classList.toggle(
      'hidden',
      v21MenuOpen
    );

    v21MenuButton.setAttribute(
      'aria-hidden',
      v21MenuOpen
        ?'true'
        :'false'
    );
  }

  if(v21MenuOpen){
    clearKeyboardState();
    refreshV21CacheStats();
    syncV21RuntimeControls();
  }
}

function activateV21Tab(name){
  if(!v21MenuEl)return;

  for(const tab of v21MenuEl.querySelectorAll('.v21Tab')){
    tab.classList.toggle(
      'active',
      tab.dataset.tab===name
    );
  }

  for(const panel of v21MenuEl.querySelectorAll('.v21Panel')){
    panel.classList.toggle(
      'active',
      panel.dataset.panel===name
    );
  }

  const title=
    v21MenuEl.querySelector(
      '#v21MenuTitle'
    );

  const activeTab=
    v21MenuEl.querySelector(
      `.v21Tab[data-tab="${name}"]`
    );

  if(
    title&&
    activeTab
  ){
    title.textContent=
      activeTab.dataset.title||
      activeTab.textContent.trim();
  }
}

function installV21Menu(){
  if(v21MenuEl)return;

  installV21BaseStyle();

  const oldHud=
    $('hud');

  if(oldHud){
    oldHud.style.display='none';
  }

  const oldHelp=
    $('help');

  if(oldHelp){
    oldHelp.style.display='none';
  }

  const oldShowControls=
    $('showControlsBtn');

  if(oldShowControls){
    oldShowControls.style.display='none';
  }

  v21MenuButton=
    document.createElement('button');

  v21MenuButton.id=
    'v21MenuButton';

  v21MenuButton.type='button';
  v21MenuButton.textContent=
    '☰ MENU';

  v21MenuButton.addEventListener(
    'click',
    ()=>{
      setV21MenuOpen(
        !v21MenuOpen
      );
    }
  );

  document.body.appendChild(
    v21MenuButton
  );

  v21MenuEl=
    document.createElement('div');

  v21MenuEl.id=
    'v21Menu';

  v21MenuEl.innerHTML=`
    <div id="v21MenuPanel">
      <nav class="v21MenuNav">
        <div class="v21Brand">
          <strong>WORLD DRIVE</strong>
          <span>V21.21.1 ALPHA</span>
        </div>

        <button class="v21Tab active" data-tab="vehicle" data-title="Véhicule">🚗 Véhicule</button>
        <button class="v21Tab" data-tab="world" data-title="Carte & monde">🗺️ Carte & monde</button>
        <button class="v21Tab" data-tab="route" data-title="Trajet">🧭 Trajet</button>
        <button class="v21Tab" data-tab="driving" data-title="Conduite">🎮 Conduite</button>
        <button class="v21Tab" data-tab="audio" data-title="Audio & affichage">🔊 Audio & affichage</button>
        <button class="v21Tab" data-tab="multiplayer" data-title="Multijoueur">👥 Multijoueur</button>
        <button class="v21Tab" data-tab="advanced" data-title="Avancé">⚙️ Avancé</button>
      </nav>

      <div class="v21MenuMain">
        <header class="v21MenuTop">
          <h2 id="v21MenuTitle">Véhicule</h2>
          <button id="v21MenuClose" type="button" aria-label="Fermer le menu">×</button>
        </header>

        <div class="v21Panel active" data-panel="vehicle"></div>
        <div class="v21Panel" data-panel="world"></div>
        <div class="v21Panel" data-panel="route"></div>
        <div class="v21Panel" data-panel="driving"></div>
        <div class="v21Panel" data-panel="audio"></div>
        <div class="v21Panel" data-panel="multiplayer"></div>
        <div class="v21Panel" data-panel="advanced"></div>
      </div>
    </div>
  `;

  document.body.appendChild(
    v21MenuEl
  );

  v21MenuEl
    .querySelectorAll(
      '.v21Tab'
    )
    .forEach(
      tab=>
        tab.addEventListener(
          'click',
          ()=>activateV21Tab(
            tab.dataset.tab
          )
        )
    );

  $('v21MenuClose')
    ?.addEventListener(
      'click',
      ()=>setV21MenuOpen(false)
    );

  v21MenuEl.addEventListener(
    'click',
    event=>{
      if(event.target===v21MenuEl){
        setV21MenuOpen(false);
      }
    }
  );

  addEventListener(
    'keydown',
    event=>{
      if(
        event.code==='Escape'&&
        v21MenuOpen&&
        !keyboardRebindAction
      ){
        setV21MenuOpen(false);
      }
    }
  );

  const vehiclePanel=
    v21MenuEl.querySelector(
      '[data-panel="vehicle"]'
    );

  const vehicleControls=
    document.createElement('div');

  if(vehicleSelect){
    vehicleSelect.classList.add(
      'v21MenuSelect'
    );

    vehicleControls.appendChild(
      createV21Row(
        'Modèle',
        vehicleSelect
      )
    );
  }

  if(transmissionModeSelect){
    transmissionModeSelect.classList.add(
      'v21MenuSelect'
    );

    vehicleControls.appendChild(
      createV21Row(
        'Transmission',
        transmissionModeSelect
      )
    );
  }

  vehiclePanel.appendChild(
    createV21Section(
      'Véhicule',
      vehicleControls
    )
  );

  const vehicleInfo=
    document.createElement('div');

  vehicleInfo.className=
    'v21InfoGrid';

  vehicleInfo.innerHTML=`
    <div class="v21InfoCard">
      <span>Transmission</span>
      <b id="v21VehicleDrivetrain">—</b>
    </div>
    <div class="v21InfoCard">
      <span>Boîte</span>
      <b id="v21VehicleGears">—</b>
    </div>
    <div class="v21InfoCard">
      <span>Redline</span>
      <b id="v21VehicleRedline">—</b>
    </div>
    <div class="v21InfoCard">
      <span>Vitesse mécanique</span>
      <b id="v21VehicleTop">—</b>
    </div>
  `;

  vehiclePanel.appendChild(
    createV21Section(
      'Informations',
      vehicleInfo
    )
  );

  const vehicleActions=
    document.createElement('div');

  const resetVehicleButton=
    document.createElement('button');

  resetVehicleButton.type='button';
  resetVehicleButton.className=
    'v21MenuBtn';
  resetVehicleButton.textContent=
    'Replacer sur la route';
  resetVehicleButton.addEventListener(
    'click',
    ()=>resetToRoad()
  );

  vehicleActions.appendChild(
    resetVehicleButton
  );

  vehiclePanel.appendChild(
    createV21Section(
      '',
      vehicleActions
    )
  );

  // Map & world
  const worldPanel=
    v21MenuEl.querySelector(
      '[data-panel="world"]'
    );

  const worldControls=
    document.createElement('div');

  const imageryToggle=
    createV21ToggleButton(
      'v21ImageryToggle',
      ()=>{
        const enabled=
          imageryService.toggle();

        appSettings.imageryEnabled=
          enabled;

        queueSettingsSave();
        syncV21RuntimeControls();
      }
    );

  worldControls.appendChild(
    createV21Row(
      'Photo / imagerie',
      imageryToggle
    )
  );

  const distanceSelect=
    document.createElement('select');

  distanceSelect.id=
    'v21DisplayDistance';

  distanceSelect.className=
    'v21MenuSelect';

  distanceSelect.innerHTML=`
    <option value="low">Basse</option>
    <option value="medium">Moyenne</option>
    <option value="high">Haute</option>
  `;

  distanceSelect.addEventListener(
    'change',
    ()=>{
      applyDisplayDistanceProfile(
        distanceSelect.value,
        {
          save:true
        }
      );
    }
  );

  worldControls.appendChild(
    createV21Row(
      'Distance d’affichage',
      distanceSelect,
      'Haute par défaut'
    )
  );

  if(timeSlider){
    timeSlider.style.width='170px';

    const timeWrap=
      document.createElement('div');

    timeWrap.style.display='flex';
    timeWrap.style.alignItems='center';
    timeWrap.style.gap='8px';

    timeWrap.append(
      timeSlider,
      timeLabel
    );

    worldControls.appendChild(
      createV21Row(
        'Heure',
        timeWrap
      )
    );
  }

  worldPanel.appendChild(
    createV21Section(
      'Monde',
      worldControls
    )
  );

  const cacheWrap=
    document.createElement('div');

  cacheWrap.innerHTML=`
    <div class="v21InfoGrid">
      <div class="v21InfoCard">
        <span>Taille cache</span>
        <b id="v21CacheSize">Calcul…</b>
      </div>
      <div class="v21InfoCard">
        <span>Entrées persistantes</span>
        <b id="v21CacheRecords">—</b>
      </div>
    </div>
  `;

  const clearButton=
    document.createElement('button');

  clearButton.type='button';
  clearButton.className=
    'v21MenuBtn danger';

  clearButton.style.marginTop='10px';
  clearButton.textContent=
    'Vider la cache';

  clearButton.addEventListener(
    'click',
    async()=>{
      const confirmed=
        window.confirm(
          'Vider toute la cache et réinitialiser tous les réglages V21 ?'
        );

      if(!confirmed)return;

      clearButton.disabled=true;
      clearButton.textContent=
        'Vidage…';

      try{
        await clearWorldDriveCache();

        location.reload();
      }catch(error){
        console.warn(
          'Full cache clear failed',
          error
        );

        clearButton.disabled=false;
        clearButton.textContent=
          'Vider la cache';

        toast(
          'Impossible de vider la cache'
        );
      }
    }
  );

  cacheWrap.appendChild(
    clearButton
  );

  worldPanel.appendChild(
    createV21Section(
      'Cache',
      cacheWrap
    )
  );

  // Route
  const routePanel=
    v21MenuEl.querySelector(
      '[data-panel="route"]'
    );

  const planner=
    $('plannerBox');

  if(planner){
    routePanel.appendChild(
      createV21Section(
        'Planifier',
        planner
      )
    );
  }

  const jump=
    $('jumpBox');

  if(jump){
    routePanel.appendChild(
      createV21Section(
        'Progression',
        jump
      )
    );
  }

  // Driving
  const drivingPanel=
    v21MenuEl.querySelector(
      '[data-panel="driving"]'
    );

  const drivingControls=
    document.createElement('div');

  const assistToggle=
    createV21ToggleButton(
      'v21AssistToggle',
      ()=>toggleAssist()
    );

  drivingControls.appendChild(
    createV21Row(
      'Assistance voie',
      assistToggle
    )
  );

  const autoButton=
    document.createElement('button');

  autoButton.type='button';
  autoButton.className=
    'v21MenuBtn';
  autoButton.innerHTML=
    'Pilote auto · <span id="v21AutopilotState">OFF</span>';

  autoButton.addEventListener(
    'click',
    ()=>{
      toggleAutopilot();
      syncV21RuntimeControls();
    }
  );

  drivingControls.appendChild(
    createV21Row(
      'Pilote automatique',
      autoButton
    )
  );

  const roadLimitToggle=
    createV21ToggleButton(
      'v21RoadLimitsToggle',
      ()=>toggleRoadSpeedLimits()
    );

  drivingControls.appendChild(
    createV21Row(
      'Respect limites OSM',
      roadLimitToggle
    )
  );

  const cameraButton=
    document.createElement('button');

  cameraButton.type='button';
  cameraButton.className=
    'v21MenuBtn';
  cameraButton.textContent=
    'Changer caméra';
  cameraButton.addEventListener(
    'click',
    ()=>cameraController.cycle()
  );

  drivingControls.appendChild(
    createV21Row(
      'Caméra',
      cameraButton
    )
  );

  drivingPanel.appendChild(
    createV21Section(
      'Conduite',
      drivingControls
    )
  );

  const keyboardDetails=
    document.createElement('details');

  keyboardDetails.className=
    'v21Section';

  keyboardDetails.innerHTML=
    '<summary class="v21SectionTitle" style="cursor:pointer;margin:0">Clavier · configurer</summary>';

  keyboardDetails.appendChild(
    buildV21KeyboardControls()
  );

  const keyboardReset=
    document.createElement('button');

  keyboardReset.type='button';
  keyboardReset.className=
    'v21MenuBtn';
  keyboardReset.style.marginTop='10px';
  keyboardReset.textContent=
    'Réinitialiser clavier';

  keyboardReset.addEventListener(
    'click',
    ()=>{
      appSettings.controls.keyboard=
        cloneDefaultControls()
          .keyboard;

      queueSettingsSave();
      refreshV21KeyboardBindings();
    }
  );

  keyboardDetails.appendChild(
    keyboardReset
  );

  drivingPanel.appendChild(
    keyboardDetails
  );

  const gamepadDetails=
    document.createElement('details');

  gamepadDetails.className=
    'v21Section';

  gamepadDetails.innerHTML=
    '<summary class="v21SectionTitle" style="cursor:pointer;margin:0">Manette · configurer</summary>';

  gamepadDetails.appendChild(
    buildV21GamepadControls()
  );

  const gamepadReset=
    document.createElement('button');

  gamepadReset.type='button';
  gamepadReset.className=
    'v21MenuBtn';
  gamepadReset.style.marginTop='10px';
  gamepadReset.textContent=
    'Réinitialiser manette';

  gamepadReset.addEventListener(
    'click',
    ()=>{
      appSettings.controls.gamepad=
        cloneDefaultControls()
          .gamepad;

      queueSettingsSave();

      // Rebuild the editable list so all selects show their defaults.
      const fresh=
        buildV21GamepadControls();

      const current=
        gamepadDetails.querySelector(
          '.v21ControlsGrid'
        );

      current?.replaceWith(
        fresh
      );
    }
  );

  gamepadDetails.appendChild(
    gamepadReset
  );

  drivingPanel.appendChild(
    gamepadDetails
  );

  // Audio & display
  const audioPanel=
    v21MenuEl.querySelector(
      '[data-panel="audio"]'
    );

  const audioControls=
    document.createElement('div');

  const audioToggle=
    createV21ToggleButton(
      'v21AudioToggle',
      async()=>{
        const next=
          !appSettings.audioEnabled;

        appSettings.audioEnabled=
          next;

        queueSettingsSave();

        try{
          await vehicleAudio.setEnabled(
            next
          );
        }catch(error){
          console.warn(
            'Audio setting failed',
            error
          );
        }

        syncV21RuntimeControls();
      }
    );

  audioControls.appendChild(
    createV21Row(
      'Audio',
      audioToggle,
      'ON par défaut'
    )
  );

  const clusterToggle=
    createV21ToggleButton(
      'v21ClusterToggle',
      ()=>{
        appSettings.display.cluster=
          !appSettings.display.cluster;

        queueSettingsSave();
        applyV21DisplayVisibility();
        syncV21RuntimeControls();
      }
    );

  audioControls.appendChild(
    createV21Row(
      'Compteurs',
      clusterToggle
    )
  );

  const minimapToggle=
    createV21ToggleButton(
      'v21MinimapToggle',
      ()=>{
        appSettings.display.minimap=
          !appSettings.display.minimap;

        queueSettingsSave();
        applyV21DisplayVisibility();
        syncV21RuntimeControls();
      }
    );

  audioControls.appendChild(
    createV21Row(
      'Mini-carte',
      minimapToggle
    )
  );

  const compassToggle=
    createV21ToggleButton(
      'v21CompassToggle',
      ()=>{
        appSettings.display.compass=
          !appSettings.display.compass;

        queueSettingsSave();
        applyV21DisplayVisibility();
        syncV21RuntimeControls();
      }
    );

  audioControls.appendChild(
    createV21Row(
      'Boussole',
      compassToggle
    )
  );

  audioPanel.appendChild(
    createV21Section(
      'Audio & affichage',
      audioControls
    )
  );

  // Multiplayer
  const multiplayerPanel=
    v21MenuEl.querySelector(
      '[data-panel="multiplayer"]'
    );

  const multiplayerBox=
    document.querySelector(
      '.multiplayerBox'
    );

  installV21DesktopMultiplayer(
    multiplayerPanel
  );

  if(multiplayerBox){
    multiplayerPanel.appendChild(
      createV21Section(
        'Multijoueur LAN',
        multiplayerBox
      )
    );
  }

  // Advanced live status
  const advancedPanel=
    v21MenuEl.querySelector(
      '[data-panel="advanced"]'
    );

  const advanced=
    document.createElement('div');

  const statusSources=[
    ['Relief','elevStatus'],
    ['Hydrographie','waterStatus'],
    ['Ponts OSM','bridgeStatus'],
    ['Décor réel','sceneryStatus'],
    ['Imagerie','imageryStatus'],
    ['Routage','routingStatus'],
    ['Route active','roadTypeStatus'],
    ['Surface','roadSurfaceStatus'],
    ['Limite OSM','osmSpeedStatus'],
    ['Panneaux OSM','signStatus'],
    ['Manette','gamepadStatus'],
    ['Audio','audioStatus']
  ];

  for(const [label,id] of statusSources){
    const row=
      document.createElement('div');

    row.className=
      'v21StatusLine';

    row.innerHTML=`
      <span>${label}</span>
      <b data-v21-status-source="${id}">—</b>
    `;

    advanced.appendChild(row);
  }

  advancedPanel.appendChild(
    createV21Section(
      'État des sous-systèmes',
      advanced
    )
  );

  const statusTimer=
    setInterval(
      ()=>{
        if(
          !v21MenuOpen||
          !v21MenuEl
        ){
          return;
        }

        v21MenuEl
          .querySelectorAll(
            '[data-v21-status-source]'
          )
          .forEach(
            target=>{
              const source=$(
                target.dataset.v21StatusSource
              );

              target.textContent=
                source?.textContent?.trim()||
                '—';
            }
          );
      },
      500
    );

  v21MenuEl.dataset.statusTimer=
    String(statusTimer);

  addEventListener(
    'worlddrive-keyboard-rebound',
    ()=>refreshV21KeyboardBindings()
  );

  addEventListener(
    'worlddrive-keyboard-rebind-cancel',
    ()=>refreshV21KeyboardBindings()
  );

  syncV21RuntimeControls();
  syncV21VehicleInfo();
  applyV21DisplayVisibility();
}

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
  hitchCount:streamRefreshState.hitchCount,
  maxFrameMs:streamRefreshState.maxFrameMs,
  lastHitchAt:streamRefreshState.lastHitchAt,
  pendingWorldRefresh:streamRefreshState.pendingWorld,
  pendingReasons:[...streamRefreshState.reasons],
  worldBuildCenter:{...streamRefreshState.lastBuiltCenter},
  worldOffset:{...worldOffset}
});

// ---------- main ----------
let nextDirectionalPrefetchAt=0;

function animate(now){
 requestAnimationFrame(animate);
 updateFpsAndGovernor(now);
 const rawFrameMs=(now-last)||16;
 const dt=Math.min(.033,rawFrameMs/1000||.016);last=now;
 if(rawFrameMs>20){
   streamRefreshState.lastHitchAt=now;
   streamRefreshState.hitchCount++;
   streamRefreshState.maxFrameMs=Math.max(streamRefreshState.maxFrameMs,rawFrameMs);
 }
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

   if(
     gameStarted&&
     !v21MenuOpen&&
     now>=nextDirectionalPrefetchAt
   ){
     nextDirectionalPrefetchAt=now+250;
     worldStreaming.prefetchDirectional(absX,absZ);
   }

   if(
     gameStarted&&
     !v21MenuOpen&&
     now>=nextAheadStreamingAt
   ){
     nextAheadStreamingAt=now+420;
     prefetchRouteAhead();
     refreshCurrentImagerySooner(now);
   }

   if(
     streamRefreshState.pendingWorld&&
     !deferredVisualJobs.has('world-rebuild')&&
     (!gameStarted||v21MenuOpen||Math.abs(speed)<=HITCH_FREE_STREAMING.calmSpeed)
   ){
     scheduleLocalWorldRefresh({urgent:false});
   }

   waterTex.offset.x=(waterTex.offset.x+dt*.003)%1;
   waterTex.offset.y=(waterTex.offset.y+dt*.0015)%1;

   // User-facing instruments are intentionally full-rate in V21.21.5 (static instrument art is cached).
   drawCompass();
   drawSpeedometer();

   const renderStart=performance.now();
   renderer.render(scene,camera);
   const renderSubmitCost=performance.now()-renderStart;
   perfGovernor.renderSubmitMs=perfGovernor.renderSubmitMs*.90+renderSubmitCost*.10;

   if(HITCH_FREE_STREAMING.perfConsoleLogging&&now>=perfGovernor.nextPerfLogAt){
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
