from pathlib import Path


def replace_once(path, old, new):
    p=Path(path)
    text=p.read_text(encoding='utf-8')
    count=text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:100]!r}')
    p.write_text(text.replace(old,new,1),encoding='utf-8')


# Circuit contract: authored loop, nominal published track width, no civil traffic.
replace_once('src/routing/route-presets.js',
"""export const LAGUNA_SECA_CIRCUIT=Object.freeze({
  id:'laguna-seca-grand-prix',
  label:'Laguna Seca · Circuit',
  provider:'Circuit preset · OSM',
  lengthM:LagunaSecaTrack.lengthM,
  sourceWayIds:Object.freeze([...LagunaSecaTrack.sourceWayIds]),
  coordinates:Object.freeze(LagunaSecaTrack.coordinates.map(point=>Object.freeze([...point])))
});""",
"""export const LAGUNA_SECA_CIRCUIT=Object.freeze({
  id:'laguna-seca-grand-prix',
  label:'Laguna Seca · Circuit',
  provider:'Circuit preset · OSM',
  routeKind:'circuit',
  closedLoop:true,
  civilTraffic:false,
  roadSpec:Object.freeze({
    asphaltWidthM:15,
    shoulderWidthM:0,
    edgeLineInsetM:.22,
    centerLine:false,
    widthSource:'published MotoGP technical data · 15 m nominal width'
  }),
  lengthM:LagunaSecaTrack.lengthM,
  sourceWayIds:Object.freeze([...LagunaSecaTrack.sourceWayIds]),
  coordinates:Object.freeze(LagunaSecaTrack.coordinates.map(point=>Object.freeze([...point])))
});""")

replace_once('src/ui/route-planner-ui.js',
"""        {
          coordinates:LAGUNA_SECA_CIRCUIT.coordinates,
          provider:LAGUNA_SECA_CIRCUIT.provider
        }""",
"""        {
          coordinates:LAGUNA_SECA_CIRCUIT.coordinates,
          provider:LAGUNA_SECA_CIRCUIT.provider,
          routeKind:LAGUNA_SECA_CIRCUIT.routeKind,
          closedLoop:LAGUNA_SECA_CIRCUIT.closedLoop,
          civilTraffic:LAGUNA_SECA_CIRCUIT.civilTraffic,
          roadSpec:LAGUNA_SECA_CIRCUIT.roadSpec
        }""")

# Route lifecycle keeps ordinary road defaults but exposes circuit policy.
replace_once('src/routing/route-lifecycle.js',
"""    const routeWaypoints=Array.isArray(waypoints)?waypoints.slice(0,8):[];
    const routeAuthoredProvider=authoredCoordinates?String(options?.provider||'Circuit preset'):null;

    setState({""",
"""    const routeWaypoints=Array.isArray(waypoints)?waypoints.slice(0,8):[];
    const routeAuthoredProvider=authoredCoordinates?String(options?.provider||'Circuit preset'):null;
    const routeKind=authoredCoordinates&&options?.routeKind==='circuit'?'circuit':'road';
    const routeClosedLoop=routeKind==='circuit'&&options?.closedLoop===true;
    const routeRoadSpec=routeKind==='circuit'&&options?.roadSpec&&typeof options.roadSpec==='object'
      ?Object.freeze({...options.roadSpec,closedLoop:routeClosedLoop})
      :null;
    const routeCivilTraffic=options?.civilTraffic!==false;

    setState({""")
replace_once('src/routing/route-lifecycle.js',
"""      routeWaypoints,
      routeAuthoredCoordinates:authoredCoordinates,
      routeAuthoredProvider,
      origin:{lat:routeStart.lat,lon:routeStart.lon}""",
"""      routeWaypoints,
      routeAuthoredCoordinates:authoredCoordinates,
      routeAuthoredProvider,
      routeKind,
      routeClosedLoop,
      routeRoadSpec,
      routeCivilTraffic,
      origin:{lat:routeStart.lat,lon:routeStart.lon}""")

# Main remains wiring only.
replace_once('src/main.js',
"""let ROUTE_AUTHORED_COORDINATES=null;
let ROUTE_AUTHORED_PROVIDER=null;
const EARTH=6378137;""",
"""let ROUTE_AUTHORED_COORDINATES=null;
let ROUTE_AUTHORED_PROVIDER=null;
let ROUTE_KIND='road';
let ROUTE_CLOSED_LOOP=false;
let ROUTE_ROAD_SPEC=null;
let ROUTE_CIVIL_TRAFFIC=true;
const EARTH=6378137;""")
replace_once('src/main.js',
"""  getState:()=>({absX,absZ,routeLength,segments,worldOffset})
});""",
"""  getState:()=>({absX,absZ,routeLength,segments,worldOffset,routeClosedLoop:ROUTE_CLOSED_LOOP})
});""")
replace_once('src/main.js',
"""  ROAD_SURFACE_OFFSET,
  getWorldOffset:()=>worldOffset,
  nearestRoute,""",
"""  ROAD_SURFACE_OFFSET,
  getWorldOffset:()=>worldOffset,
  getRouteRoadSpec:()=>ROUTE_ROAD_SPEC,
  nearestRoute,""")
replace_once('src/main.js',
"""    routeAuthoredCoordinates:ROUTE_AUTHORED_COORDINATES,
    routeAuthoredProvider:ROUTE_AUTHORED_PROVIDER,
    origin,""",
"""    routeAuthoredCoordinates:ROUTE_AUTHORED_COORDINATES,
    routeAuthoredProvider:ROUTE_AUTHORED_PROVIDER,
    routeKind:ROUTE_KIND,
    routeClosedLoop:ROUTE_CLOSED_LOOP,
    routeRoadSpec:ROUTE_ROAD_SPEC,
    routeCivilTraffic:ROUTE_CIVIL_TRAFFIC,
    origin,""")
replace_once('src/main.js',
"""    if('routeAuthoredCoordinates' in state)ROUTE_AUTHORED_COORDINATES=state.routeAuthoredCoordinates;
    if('routeAuthoredProvider' in state)ROUTE_AUTHORED_PROVIDER=state.routeAuthoredProvider;
    if('origin' in state)origin=state.origin;""",
"""    if('routeAuthoredCoordinates' in state)ROUTE_AUTHORED_COORDINATES=state.routeAuthoredCoordinates;
    if('routeAuthoredProvider' in state)ROUTE_AUTHORED_PROVIDER=state.routeAuthoredProvider;
    if('routeKind' in state)ROUTE_KIND=state.routeKind;
    if('routeClosedLoop' in state)ROUTE_CLOSED_LOOP=!!state.routeClosedLoop;
    if('routeRoadSpec' in state)ROUTE_ROAD_SPEC=state.routeRoadSpec;
    if('routeCivilTraffic' in state){
      ROUTE_CIVIL_TRAFFIC=state.routeCivilTraffic!==false;
      if(!ROUTE_CIVIL_TRAFFIC)drivingRuntime?.traffic?.clear?.();
    }
    if('origin' in state)origin=state.origin;""")
replace_once('src/main.js',
"""  getRouteLength:()=>routeLength,
  getWorldOffset:()=>worldOffset,
  nearestRouteForVehicle,""",
"""  getRouteLength:()=>routeLength,
  getWorldOffset:()=>worldOffset,
  getCivilTrafficEnabled:()=>ROUTE_CIVIL_TRAFFIC,
  nearestRouteForVehicle,""")

# Road geometry: close presentation seam and keep compact circuits resident as one loop.
replace_once('src/road/road-geometry.js',
"""  let routeLength=0;
  let segments=[];
  let worldOffset={x:0,z:0};""",
"""  let routeLength=0;
  let segments=[];
  let worldOffset={x:0,z:0};
  let routeClosedLoop=false;""")
replace_once('src/road/road-geometry.js',
"""    segments=Array.isArray(state.segments)?state.segments:[];
    worldOffset=state.worldOffset||worldOffset;""",
"""    segments=Array.isArray(state.segments)?state.segments:[];
    worldOffset=state.worldOffset||worldOffset;
    routeClosedLoop=!!state.routeClosedLoop;""")
replace_once('src/road/road-geometry.js',
"""  let incoming=i>0?unitSegment(points[i-1],p):null;
  let outgoing=i<points.length-1?unitSegment(p,points[i+1]):null;

  if(!incoming){""",
"""  const lastIndex=points.length-1;
  const closed=points.length>3&&Math.hypot(
    points[0].x-points[lastIndex].x,
    points[0].z-points[lastIndex].z
  )<.5;
  let incoming=i>0?unitSegment(points[i-1],p):null;
  let outgoing=i<lastIndex?unitSegment(p,points[i+1]):null;
  if(closed&&i===0)incoming=unitSegment(points[lastIndex-1],p);
  if(closed&&i===lastIndex)outgoing=unitSegment(p,points[1]);

  if(!incoming){""")
replace_once('src/road/road-geometry.js',
"""function buildRoadVolume(profile){
  if(profile.length<2)return null;
  const group=new THREE.Group();
  const asphaltHalf=3.75,shoulderHalf=5.20,toeHalf=5.95;""",
"""function buildRoadVolume(profile,roadSpec=null){
  if(profile.length<2)return null;
  const group=new THREE.Group();
  const asphaltWidth=Math.max(5.5,Math.min(20,Number(roadSpec?.asphaltWidthM)||7.5));
  const asphaltHalf=asphaltWidth/2;
  const shoulderWidth=Math.max(0,Math.min(4,Number(roadSpec?.shoulderWidthM)??1.45));
  const shoulderHalf=asphaltHalf+shoulderWidth;
  const toeHalf=shoulderHalf+.75;""")
replace_once('src/road/road-geometry.js',
"""  const minCum=Math.max(0,centerCum-1800);
  const maxCum=Math.min(routeLength,centerCum+3600);""",
"""  const keepWholeClosedLoop=routeClosedLoop&&routeLength<=5000;
  const minCum=keepWholeClosedLoop?0:Math.max(0,centerCum-1800);
  const maxCum=keepWholeClosedLoop?routeLength:Math.min(routeLength,centerCum+3600);""")
replace_once('src/road/road-geometry.js',
"""  const hasRouteStart=(raw[0]?.cum||0)<=1;""",
"""  const hasRouteStart=!routeClosedLoop&&(raw[0]?.cum||0)<=1;""")
replace_once('src/road/road-geometry.js',
"""  for(let i=0;i<raw.length;i++){
    const p=raw[i],prev=raw[Math.max(0,i-1)],next=raw[Math.min(raw.length-1,i+1)];""",
"""  for(let i=0;i<raw.length;i++){
    const lastIndex=raw.length-1;
    const p=raw[i];
    const prev=routeClosedLoop&&raw.length>3&&i===0?raw[lastIndex-1]:raw[Math.max(0,i-1)];
    const next=routeClosedLoop&&raw.length>3&&i===lastIndex?raw[1]:raw[Math.min(lastIndex,i+1)];""")
replace_once('src/road/road-geometry.js',
"""  const maxRoadRoll=12*Math.PI/180;
  return raw.map((p,i)=>({x:p.x,z:p.z,y:startSafeH[i],cum:p.cum,roll:startProfileWeight(p.cum)*Math.max(-maxRoadRoll,Math.min(maxRoadRoll,smoothedRoll[i]))}));""",
"""  const maxRoadRoll=12*Math.PI/180;
  const profile=raw.map((p,i)=>({x:p.x,z:p.z,y:startSafeH[i],cum:p.cum,roll:startProfileWeight(p.cum)*Math.max(-maxRoadRoll,Math.min(maxRoadRoll,smoothedRoll[i]))}));
  if(routeClosedLoop&&profile.length>2&&Math.hypot(profile[0].x-profile.at(-1).x,profile[0].z-profile.at(-1).z)<.5){
    profile[profile.length-1].x=profile[0].x;
    profile[profile.length-1].z=profile[0].z;
    profile[profile.length-1].y=profile[0].y;
    profile[profile.length-1].roll=profile[0].roll;
  }
  return profile;""")
replace_once('src/road/road-geometry.js',
"export function engineerRoadBankingV21_31(profile){",
"export function engineerRoadBankingV21_31(profile,{closedLoop=false}={}){")
# There is exactly one routeStart inside engineerRoadBanking after the prior base replacement.
replace_once('src/road/road-geometry.js',
"""  const routeStart=(out[0]?.cum||0)<=1;""",
"""  const routeStart=!closedLoop&&(out[0]?.cum||0)<=1;""")
replace_once('src/road/road-geometry.js',
"""    out[i].roll=roll;
  }
  return out;
}""",
"""    out[i].roll=roll;
  }
  if(closedLoop&&out.length>1)out[out.length-1].roll=out[0].roll;
  return out;
}""")
replace_once('src/road/road-geometry.js',
"""export function smoothRoadProfileV21_31(profile,{terrainAbs,bridgeHeightAtCum,bridgeManager}={}){
  if(!Array.isArray(profile)||profile.length<5)return Array.isArray(profile)?engineerRoadBankingV21_31(profile):[];""",
"""export function smoothRoadProfileV21_31(profile,{terrainAbs,bridgeHeightAtCum,bridgeManager,closedLoop=false}={}){
  if(!Array.isArray(profile)||profile.length<5)return Array.isArray(profile)?engineerRoadBankingV21_31(profile,{closedLoop}):[];""")
replace_once('src/road/road-geometry.js',
"""  const routeStart=(source[0]?.cum||0)<=1;""",
"""  const routeStart=!closedLoop&&(source[0]?.cum||0)<=1;""")
replace_once('src/road/road-geometry.js',
"""  });
  return engineerRoadBankingV21_31(rounded);
}

export function createRoadGeometrySystem(args={}){
  const base=createRoadGeometryCore(args);
  return Object.freeze({
    ...base,
    buildProfile(){
      const profile=base.buildProfile();
      return smoothRoadProfileV21_31(profile,args);
    }
  });
}""",
"""  });
  if(closedLoop&&rounded.length>2&&Math.hypot(rounded[0].x-rounded.at(-1).x,rounded[0].z-rounded.at(-1).z)<.5){
    rounded[rounded.length-1].x=rounded[0].x;
    rounded[rounded.length-1].z=rounded[0].z;
    rounded[rounded.length-1].y=rounded[0].y;
    rounded[rounded.length-1].roll=rounded[0].roll;
  }
  return engineerRoadBankingV21_31(rounded,{closedLoop});
}

export function createRoadGeometrySystem(args={}){
  const base=createRoadGeometryCore(args);
  return Object.freeze({
    ...base,
    buildProfile(){
      const profile=base.buildProfile();
      const closedLoop=!!args.getState?.()?.routeClosedLoop;
      return smoothRoadProfileV21_31(profile,{...args,closedLoop});
    }
  });
}""")

# Local world: route-aware road dimensions, no generic start pad on a circuit.
replace_once('src/local-world-builder-p925.js',
"""function roadBedOptionsForProfile(profile){
  return {
    roadHalfWidth:5.4,
    terrainCutHalfWidth:16.5,
    blendWidth:14.0,
    surfaceOffset:0.20,
    startPad:profile.length>1&&(profile[0].cum||0)<=1?{""",
"""function resolveRoadSpec(spec){
  const asphaltWidthM=Math.max(5.5,Math.min(20,Number(spec?.asphaltWidthM)||7.5));
  const shoulderWidthM=Math.max(0,Math.min(4,Number(spec?.shoulderWidthM)??1.45));
  const edgeLineInsetM=Math.max(.08,Math.min(.8,Number(spec?.edgeLineInsetM)||.30));
  return {asphaltWidthM,shoulderWidthM,edgeLineInsetM,centerLine:spec?.centerLine!==false,closedLoop:!!spec?.closedLoop};
}

function roadBedOptionsForProfile(profile,roadSpec=null){
  const spec=resolveRoadSpec(roadSpec);
  const asphaltHalf=spec.asphaltWidthM/2;
  return {
    roadHalfWidth:Math.max(5.4,asphaltHalf+.4),
    terrainCutHalfWidth:Math.max(16.5,asphaltHalf+11.1),
    blendWidth:14.0,
    surfaceOffset:0.20,
    startPad:!spec.closedLoop&&profile.length>1&&(profile[0].cum||0)<=1?{""")
replace_once('src/local-world-builder-p925.js',
"""  ROAD_SURFACE_OFFSET,
  getWorldOffset,
  rebuildLocalWater,""",
"""  ROAD_SURFACE_OFFSET,
  getWorldOffset,
  getRouteRoadSpec,
  rebuildLocalWater,""")
replace_once('src/local-world-builder-p925.js',
"""  function buildRoadMeshes(profile){
    if(profile.length<=1)return;
    const roadVolume=buildRoadVolume(profile);
    if(roadVolume)roadGroup.add(roadVolume);
    const leftShoulder=buildLateralBand(profile,5.20,3.75,shoulderMat,.035);
    if(leftShoulder)roadGroup.add(leftShoulder);
    const rightShoulder=buildLateralBand(profile,-3.75,-5.20,shoulderMat,.035);
    if(rightShoulder)roadGroup.add(rightShoulder);
    const asphaltRoad=buildRibbon(profile,7.5,roadMat,ROAD_SURFACE_OFFSET);
    if(asphaltRoad)roadGroup.add(asphaltRoad);
    const center=buildOffsetRibbon(profile,0,.13,lineYellow,.165);
    if(center)roadGroup.add(center);
    for(const off of [-3.45,3.45]){
      const em=buildOffsetRibbon(profile,off,.10,lineWhite,.16);
      if(em)roadGroup.add(em);
    }
  }""",
"""  function buildRoadMeshes(profile){
    if(profile.length<=1)return;
    const spec=resolveRoadSpec(getRouteRoadSpec?.());
    const asphaltHalf=spec.asphaltWidthM/2;
    const shoulderOuter=asphaltHalf+spec.shoulderWidthM;
    const roadVolume=buildRoadVolume(profile,spec);
    if(roadVolume)roadGroup.add(roadVolume);
    if(spec.shoulderWidthM>.02){
      const leftShoulder=buildLateralBand(profile,shoulderOuter,asphaltHalf,shoulderMat,.035);
      if(leftShoulder)roadGroup.add(leftShoulder);
      const rightShoulder=buildLateralBand(profile,-asphaltHalf,-shoulderOuter,shoulderMat,.035);
      if(rightShoulder)roadGroup.add(rightShoulder);
    }
    const asphaltRoad=buildRibbon(profile,spec.asphaltWidthM,roadMat,ROAD_SURFACE_OFFSET);
    if(asphaltRoad)roadGroup.add(asphaltRoad);
    if(spec.centerLine){
      const center=buildOffsetRibbon(profile,0,.13,lineYellow,.165);
      if(center)roadGroup.add(center);
    }
    const edgeOffset=Math.max(.2,asphaltHalf-spec.edgeLineInsetM);
    for(const off of [-edgeOffset,edgeOffset]){
      const em=buildOffsetRibbon(profile,off,.10,lineWhite,.16);
      if(em)roadGroup.add(em);
    }
  }""")
p=Path('src/local-world-builder-p925.js')
text=p.read_text(encoding='utf-8')
old='roadBedOptionsForProfile(profile)'
count=text.count(old)
if count != 3:
    raise SystemExit(f'local-world-builder-p925: expected 3 roadBedOptions calls, found {count}')
p.write_text(text.replace(old,'roadBedOptionsForProfile(profile,getRouteRoadSpec?.())'),encoding='utf-8')

# P9.37 staged road meshes must use the same route dimensions.
replace_once('src/local-world-builder.js',
"""    const stage={volume:[],lateral:[],ribbon:[],offset:[]};
    const tasks=[
      ()=>stage.volume.push(originalRoadVolume?.(prepared.profile)||null),
      ()=>stage.lateral.push(originalLateralBand?.(prepared.profile,5.20,3.75,options.shoulderMat,.035)||null),
      ()=>stage.lateral.push(originalLateralBand?.(prepared.profile,-3.75,-5.20,options.shoulderMat,.035)||null),
      ()=>stage.ribbon.push(originalRibbon?.(prepared.profile,7.5,options.roadMat,options.ROAD_SURFACE_OFFSET)||null),
      ()=>stage.offset.push(originalOffsetRibbon?.(prepared.profile,0,.13,options.lineYellow,.165)||null),
      ()=>stage.offset.push(originalOffsetRibbon?.(prepared.profile,-3.45,.10,options.lineWhite,.16)||null),
      ()=>stage.offset.push(originalOffsetRibbon?.(prepared.profile,3.45,.10,options.lineWhite,.16)||null)
    ];""",
"""    const stage={volume:[],lateral:[],ribbon:[],offset:[]};
    const rawSpec=options.getRouteRoadSpec?.()||null;
    const asphaltWidth=Math.max(5.5,Math.min(20,Number(rawSpec?.asphaltWidthM)||7.5));
    const asphaltHalf=asphaltWidth/2;
    const shoulderWidth=Math.max(0,Math.min(4,Number(rawSpec?.shoulderWidthM)??1.45));
    const shoulderOuter=asphaltHalf+shoulderWidth;
    const edgeInset=Math.max(.08,Math.min(.8,Number(rawSpec?.edgeLineInsetM)||.30));
    const edgeOffset=Math.max(.2,asphaltHalf-edgeInset);
    const tasks=[()=>stage.volume.push(originalRoadVolume?.(prepared.profile,rawSpec)||null)];
    if(shoulderWidth>.02){
      tasks.push(
        ()=>stage.lateral.push(originalLateralBand?.(prepared.profile,shoulderOuter,asphaltHalf,options.shoulderMat,.035)||null),
        ()=>stage.lateral.push(originalLateralBand?.(prepared.profile,-asphaltHalf,-shoulderOuter,options.shoulderMat,.035)||null)
      );
    }
    tasks.push(()=>stage.ribbon.push(originalRibbon?.(prepared.profile,asphaltWidth,options.roadMat,options.ROAD_SURFACE_OFFSET)||null));
    if(rawSpec?.centerLine!==false)tasks.push(()=>stage.offset.push(originalOffsetRibbon?.(prepared.profile,0,.13,options.lineYellow,.165)||null));
    tasks.push(
      ()=>stage.offset.push(originalOffsetRibbon?.(prepared.profile,-edgeOffset,.10,options.lineWhite,.16)||null),
      ()=>stage.offset.push(originalOffsetRibbon?.(prepared.profile,edgeOffset,.10,options.lineWhite,.16)||null)
    );""")

# Civil traffic is route-policy controlled; road routes still default to enabled.
replace_once('src/driving-runtime.js',
"""    roadProfileFrameAtCum:args.roadProfileFrameAtCum,
    getHeadlightLevel:()=>Number(originalVehicleVisuals?.headlightLevel)||0
  });""",
"""    roadProfileFrameAtCum:args.roadProfileFrameAtCum,
    getHeadlightLevel:()=>Number(originalVehicleVisuals?.headlightLevel)||0,
    isEnabled:args.getCivilTrafficEnabled
  });""")
replace_once('src/traffic/civil-traffic.js',
"""  let mode='offline';
  let followerSignature='';
  let routeMismatch=false;""",
"""  let mode='offline';
  let followerSignature='';
  let routeMismatch=false;
  let enabledLast=true;
  const routeTrafficEnabled=()=>typeof args.isEnabled!=='function'||args.isEnabled()!==false;""")
replace_once('src/traffic/civil-traffic.js',
"""  function update(dt){
    const network=readCivilTrafficMultiplayerBridge();""",
"""  function update(dt){
    if(!routeTrafficEnabled()){
      if(enabledLast)clear();
      enabledLast=false;
      return;
    }
    enabledLast=true;
    const network=readCivilTrafficMultiplayerBridge();""")
replace_once('src/traffic/civil-traffic.js',
"""  function forceSpawn(kind='oncoming',vehicleId=null){
    const network=readCivilTrafficMultiplayerBridge();""",
"""  function forceSpawn(kind='oncoming',vehicleId=null){
    if(!routeTrafficEnabled())return false;
    const network=readCivilTrafficMultiplayerBridge();""")
replace_once('src/traffic/civil-traffic.js',
"""      multiplayerTraffic:{
        synchronized:true,""",
"""      routeTrafficEnabled:routeTrafficEnabled(),
      multiplayerTraffic:{
        synchronized:true,""")

# Focused permanent QA catches the visual seam (not merely duplicate coordinates), width, and traffic policy.
Path('qa/qa-block11-laguna-seca-r2.mjs').write_text(r'''import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {LAGUNA_SECA_CIRCUIT} from '../src/routing/route-presets.js';
import {createRoadGeometrySystem} from '../src/road/road-geometry.js';

assert.equal(LAGUNA_SECA_CIRCUIT.routeKind,'circuit');
assert.equal(LAGUNA_SECA_CIRCUIT.closedLoop,true);
assert.equal(LAGUNA_SECA_CIRCUIT.civilTraffic,false);
assert.equal(LAGUNA_SECA_CIRCUIT.roadSpec.asphaltWidthM,15);
assert.equal(LAGUNA_SECA_CIRCUIT.roadSpec.centerLine,false);

const lifecycle=await readFile(new URL('../src/routing/route-lifecycle.js',import.meta.url),'utf8');
const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const builder=await readFile(new URL('../src/local-world-builder-p925.js',import.meta.url),'utf8');
const staged=await readFile(new URL('../src/local-world-builder.js',import.meta.url),'utf8');
const traffic=await readFile(new URL('../src/traffic/civil-traffic.js',import.meta.url),'utf8');
for(const field of ['routeKind','routeClosedLoop','routeRoadSpec','routeCivilTraffic'])assert.ok(lifecycle.includes(field));
assert.match(main,/routeClosedLoop:ROUTE_CLOSED_LOOP/);
assert.match(main,/getRouteRoadSpec:\(\)=>ROUTE_ROAD_SPEC/);
assert.match(main,/getCivilTrafficEnabled:\(\)=>ROUTE_CIVIL_TRAFFIC/);
assert.match(builder,/!spec\.closedLoop&&profile\.length>1/);
assert.match(staged,/originalRoadVolume\?\.\(prepared\.profile,rawSpec\)/);
assert.match(traffic,/if\(!routeTrafficEnabled\(\)\)\{/);
assert.match(traffic,/if\(!routeTrafficEnabled\(\)\)return false;/);

const points=[{x:0,z:0},{x:0,z:120},{x:120,z:120},{x:120,z:0},{x:0,z:0}];
let cum=0;
const segments=[];
for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  const len=Math.hypot(b.x-a.x,b.z-a.z);
  segments.push({ax:a.x,az:a.z,bx:b.x,bz:b.z,len,cum});
  cum+=len;
}
const system=createRoadGeometrySystem({
  THREE,
  roadEdgeMat:new THREE.MeshBasicMaterial(),
  roadUnderMat:new THREE.MeshBasicMaterial(),
  ROAD_SURFACE_OFFSET:.10,
  terrainAbs:(x,z)=>x*.006+z*.004,
  nearestRoute:()=>({cum:0}),
  bridgeHeightAtCum:()=>null,
  bridgeManager:{isNearApproach:()=>false},
  getState:()=>({absX:0,absZ:0,routeLength:cum,segments,worldOffset:{x:0,z:0},routeClosedLoop:true})
});
const profile=system.buildProfile();
assert.ok(profile.length>20);
assert.ok(Math.hypot(profile[0].x-profile.at(-1).x,profile[0].z-profile.at(-1).z)<1e-6);
assert.ok(Math.abs(profile[0].y-profile.at(-1).y)<1e-6);
assert.ok(Math.abs(profile[0].roll-profile.at(-1).roll)<1e-6);
const ribbon=system.buildRibbon(profile,15,new THREE.MeshBasicMaterial(),.10);
const pos=ribbon.geometry.getAttribute('position').array;
const lastBase=(profile.length-1)*6;
for(let j=0;j<6;j++)assert.ok(Math.abs(pos[j]-pos[lastBase+j])<1e-4,`road seam differs at component ${j}`);
const volume=system.buildRoadVolume(profile,LAGUNA_SECA_CIRCUIT.roadSpec);
const edge=volume.children[0].geometry.getAttribute('position').array;
const leftTop=3*3,rightTop=4*3;
const width=Math.hypot(edge[leftTop]-edge[rightTop],edge[leftTop+2]-edge[rightTop+2]);
assert.ok(width>14.8&&width<16.0,`expected ~15m asphalt width, got ${width}`);
console.log('BLOCK 11 LAGUNA SECA R2 FIDELITY QA: PASS',{profilePoints:profile.length,seamClosed:true,asphaltWidthM:Number(width.toFixed(2)),civilTraffic:false});
''',encoding='utf-8')

print('Laguna Seca R2 patch applied')
