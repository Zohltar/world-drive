import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {NORDSCHLEIFE_CIRCUIT} from '../src/routing/route-presets.js';
import {createRoadGeometrySystem} from '../src/road/road-geometry.js';
import {createWheelGroundSupport} from '../src/physics/wheel-ground-support.js';
import {createWorldStreaming} from '../src/world-streaming.js';

const DEG=180/Math.PI;
const EARTH=6378137;
const track=JSON.parse(await readFile(
  new URL('../src/routing/circuits/nordschleife.json',import.meta.url),
  'utf8'
));
const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const streamingSource=await readFile(new URL('../src/streaming/streaming-coordinator-p913.js',import.meta.url),'utf8');
const trafficSource=await readFile(new URL('../src/traffic/civil-traffic.js',import.meta.url),'utf8');
const [originLon,originLat]=track.coordinates[0];
const cosOrigin=Math.cos(originLat*Math.PI/180);
const points=track.coordinates.map(([lon,lat])=>({
  x:(lon-originLon)*Math.PI/180*EARTH*cosOrigin,
  z:-(lat-originLat)*Math.PI/180*EARTH
}));

let routeLength=0;
const segments=[];
for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  const len=Math.hypot(b.x-a.x,b.z-a.z);
  assert.ok(Number.isFinite(len)&&len>.02,`invalid Nordschleife segment ${i}`);
  segments.push({ax:a.x,az:a.z,bx:b.x,bz:b.z,len,cum:routeLength});
  routeLength+=len;
}
assert.ok(routeLength>20700&&routeLength<20850,`unexpected projected Nordschleife length: ${routeLength.toFixed(2)} m`);

// A full 20.8 km ribbon is too expensive to rebuild at every world refresh.
// Place the local 5.4 km profile 500 m before T13 so it must continue through
// the route seam while retaining strictly increasing, unwrapped cums.
let centerCum=0;
const terrainAbs=(x,z)=>
  118*Math.sin(x/6200)+
  74*Math.cos(z/4700)+
  31*Math.sin((x+z)/2100);
const system=createRoadGeometrySystem({
  THREE,
  roadEdgeMat:new THREE.MeshBasicMaterial(),
  roadUnderMat:new THREE.MeshBasicMaterial(),
  ROAD_SURFACE_OFFSET:.10,
  terrainAbs,
  nearestRoute:()=>({cum:centerCum}),
  bridgeHeightAtCum:()=>null,
  bridgeManager:{isNearApproach:()=>false},
  getState:()=>({
    absX:0,absZ:0,routeLength,segments,
    worldOffset:{x:0,z:0},routeClosedLoop:true
  })
});

const profileCenters=[
  250,
  routeLength*.18,
  routeLength*.36,
  routeLength*.54,
  routeLength*.72,
  routeLength*.90,
  routeLength-500
];
const profileReports=[];
let profile=null;
let maxSegmentM=0;
for(const sampleCum of profileCenters){
  centerCum=sampleCum;
  const candidate=system.buildProfile();
  assert.ok(candidate.length>3000&&candidate.length<5000,`unexpected profile density at ${sampleCum.toFixed(1)} m: ${candidate.length}`);
  assert.ok(candidate[0].cum<sampleCum-1798,`local profile lost its behind buffer at ${sampleCum.toFixed(1)} m`);
  assert.ok(candidate.at(-1).cum>sampleCum+3598,`local profile lost its ahead buffer at ${sampleCum.toFixed(1)} m`);
  const windowM=candidate.at(-1).cum-candidate[0].cum;
  assert.ok(windowM>5395,'Nordschleife local road window is incomplete');
  assert.ok(windowM<5410,'road builder unexpectedly materialized more than the local circuit window');
  assert.ok(candidate.every(point=>
    ['x','y','z','cum','roll'].every(key=>Number.isFinite(point[key]))
  ),`Nordschleife local profile contains a non-finite value at ${sampleCum.toFixed(1)} m`);

  let localMaxSegmentM=0;
  for(let i=1;i<candidate.length;i++){
    assert.ok(candidate[i].cum>candidate[i-1].cum,`Nordschleife cumulative distance stopped at ${i}`);
    localMaxSegmentM=Math.max(localMaxSegmentM,Math.hypot(
      candidate[i].x-candidate[i-1].x,
      candidate[i].z-candidate[i-1].z
    ));
  }
  assert.ok(localMaxSegmentM<=1.501,`road section exceeds suspension-scale density at ${sampleCum.toFixed(1)} m: ${localMaxSegmentM.toFixed(3)} m`);
  maxSegmentM=Math.max(maxSegmentM,localMaxSegmentM);
  profileReports.push({
    centerCum:Number(sampleCum.toFixed(1)),
    points:candidate.length,
    windowM:Number(windowM.toFixed(1)),
    maxSegmentM:Number(localMaxSegmentM.toFixed(3))
  });
  profile=candidate;
}
system.setProfile(profile);
assert.ok(profile.some(point=>Math.abs(point.cum-routeLength)<2),'local profile did not cross the T13 seam');
assert.ok(Math.hypot(profile[0].x-profile.at(-1).x,profile[0].z-profile.at(-1).z)>10,'local window endpoints were incorrectly joined as a closed ribbon');

function angleDelta(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}
const seamBefore=system.roadProfileFrameAtCum(routeLength-.001);
const seamAfter=system.roadProfileFrameAtCum(.001);
assert.ok(seamBefore&&seamAfter,'road contact frame is missing at the T13 seam');
const seamPositionGap=Math.hypot(seamBefore.px-seamAfter.px,seamBefore.pz-seamAfter.pz);
const seamHeadingGapDeg=Math.abs(angleDelta(seamBefore.angle,seamAfter.angle))*DEG;
const seamPitchGapDeg=Math.abs(seamBefore.pitch-seamAfter.pitch)*DEG;
assert.ok(seamPositionGap<=.01,`T13 contact position opens by ${seamPositionGap.toFixed(5)} m`);
assert.ok(seamHeadingGapDeg<=.03,`T13 contact heading steps ${seamHeadingGapDeg.toFixed(5)} deg`);
assert.ok(seamPitchGapDeg<=.01,`T13 contact pitch steps ${seamPitchGapDeg.toFixed(5)} deg`);

const volume=system.buildRoadVolume(profile,NORDSCHLEIFE_CIRCUIT.roadSpec);
volume.traverse(object=>{
  const positions=object.geometry?.getAttribute?.('position');
  if(!positions)return;
  assert.ok(positions.array.every(Number.isFinite),'Nordschleife road mesh emitted a non-finite position');
  object.geometry.computeBoundingSphere();
  assert.ok(Number.isFinite(object.geometry.boundingSphere?.radius),'Nordschleife road mesh bounding sphere is non-finite');
});

const widthProfile=[
  {x:0,z:0,y:0,roll:0,cum:0},
  {x:0,z:20,y:0,roll:0,cum:20}
];
const widthVolume=system.buildRoadVolume(widthProfile,NORDSCHLEIFE_CIRCUIT.roadSpec);
const edge=widthVolume.children[0].geometry.getAttribute('position').array;
const leftTop=3*3,rightTop=4*3;
const asphaltWidth=Math.hypot(
  edge[leftTop]-edge[rightTop],
  edge[leftTop+2]-edge[rightTop+2]
);
assert.ok(asphaltWidth>8.99&&asphaltWidth<9.01,`expected 9 m Nordschleife asphalt, got ${asphaltWidth}`);

const roadY=12,terrainY=10;
const wheelSupport=createWheelGroundSupport({
  roadHalfWidth:8.5,
  getRoadCoreHalfWidth:()=>NORDSCHLEIFE_CIRCUIT.roadSpec.asphaltWidthM/2,
  roadSurfaceAt:x=>({lateral:x,y:roadY}),
  terrainAbs:()=>terrainY
});
wheelSupport.setFastWheelRoadSupport(true,{
  angle:0,pitch:0,roll:0,px:0,pz:0,y:roadY
},roadY,0,0);
assert.equal(wheelSupport.support.coreHalfWidth,4.5,'Nordschleife physical road core is wider than the asphalt');
assert.equal(wheelSupport.support.halfWidth,7.3,'Nordschleife shoulder blend threshold changed');
for(const lateral of [-4.49,4.49]){
  assert.equal(wheelSupport.groundHeightForWheel(lateral,0,true),roadY,`solid support ended early at ${lateral} m`);
}
const shoulderY=wheelSupport.groundHeightForWheel(5.5,0,true);
assert.ok(shoulderY<roadY&&shoulderY>terrainY,'road support did not blend after the Nordschleife asphalt edge');

// Directional cache targets and its progress gate must wrap after T13 instead
// of pinning every request to the final route point.
let nearestCum=routeLength-500;
const requestedCums=[];
const service={center:null,loading:false,load:()=>Promise.resolve(),prefetch:()=>Promise.resolve()};
const streaming=createWorldStreaming({
  toLatLon:(x,z)=>({lat:z,lon:x}),
  nearestRoute:()=>({cum:nearestCum}),
  routePointAtCum:cum=>{
    requestedCums.push(cum);
    return {x:cum,z:0};
  },
  routePointAtFraction:f=>({x:f*routeLength,z:0}),
  getRouteLength:()=>routeLength,
  getRouteClosedLoop:()=>true,
  elevation:{...service},
  water:{...service,generation:0},
  scenery:{...service,query:()=>''},
  imagery:{...service},
  roadMetadata:{...service},
  signs:{...service,query:()=>''},
  fetchCached:()=>Promise.resolve({data:null})
});
streaming.prefetchDirectional(0,0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(requestedCums.length,2,'first closed-loop directional prefetch did not run');
assert.ok(Math.abs(requestedCums[0]-1300)<.01,`near prefetch did not wrap after T13: ${requestedCums[0]}`);
assert.ok(Math.abs(requestedCums[1]-3100)<.01,`far prefetch did not wrap after T13: ${requestedCums[1]}`);
nearestCum=500;
streaming.prefetchDirectional(0,0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(requestedCums.length,4,'prefetch progress gate stalled across T13');
assert.ok(Math.abs(requestedCums[2]-2300)<.01);
assert.ok(Math.abs(requestedCums[3]-4100)<.01);
nearestCum=499;
streaming.prefetchDirectional(0,0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(requestedCums.length,4,'a 1 m backwards correction was misread as a complete circuit lap');

assert.match(mainSource,/getRouteClosedLoop:\(\)=>ROUTE_CLOSED_LOOP/);
assert.match(streamingSource,/function routePreloadCum\(cum,routeLength=/);
assert.match(streamingSource,/const cum=routePreloadCum\(nr\.cum\+dir\*distance,routeLength\);/);
assert.match(trafficSource,/if\(!routeTrafficEnabled\(\)\)return false;/);

console.log('BLOCK 11 NORDSCHLEIFE CONTINUITY R2 QA: PASS',{
  routeLengthM:Number(routeLength.toFixed(2)),
  localWindowM:Number((profile.at(-1).cum-profile[0].cum).toFixed(2)),
  profilePoints:profile.length,
  windowsValidated:profileReports.length,
  maxSegmentM:Number(maxSegmentM.toFixed(3)),
  seamPositionGapMm:Number((seamPositionGap*1000).toFixed(3)),
  seamHeadingGapDeg:Number(seamHeadingGapDeg.toFixed(5)),
  seamPitchGapDeg:Number(seamPitchGapDeg.toFixed(5)),
  asphaltWidthM:Number(asphaltWidth.toFixed(2)),
  physicalCoreWidthM:wheelSupport.support.coreHalfWidth*2,
  directionalPrefetchCums:requestedCums.map(value=>Number(value.toFixed(1))),
  civilTraffic:NORDSCHLEIFE_CIRCUIT.civilTraffic,
  finiteBoundingSpheres:true
});
