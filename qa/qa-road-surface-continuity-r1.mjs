import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createRoadGeometrySystem} from '../src/road/road-geometry.js';

const DEG=180/Math.PI;
const EARTH=6378137;
const track=JSON.parse(await readFile(
  new URL('../src/routing/circuits/laguna-seca.json',import.meta.url),
  'utf8'
));
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
  segments.push({ax:a.x,az:a.z,bx:b.x,bz:b.z,len,cum:routeLength});
  routeLength+=len;
}

// Smooth deterministic relief with Laguna-scale grades. The continuity contract
// must not depend on network DEM availability in CI.
const terrainAbs=(x,z)=>
  14*Math.sin(x/420)+
  12*Math.cos(z/310)+
  6*Math.sin((x+z)/180);

const system=createRoadGeometrySystem({
  THREE,
  roadEdgeMat:new THREE.MeshBasicMaterial(),
  roadUnderMat:new THREE.MeshBasicMaterial(),
  ROAD_SURFACE_OFFSET:.10,
  terrainAbs,
  nearestRoute:()=>({cum:0}),
  bridgeHeightAtCum:()=>null,
  bridgeManager:{isNearApproach:()=>false},
  getState:()=>({
    absX:0,absZ:0,routeLength,segments,
    worldOffset:{x:0,z:0},routeClosedLoop:true
  })
});

const profile=system.buildProfile();
system.setProfile(profile);
assert.ok(profile.length>2400&&profile.length<3600,`unexpected adaptive profile density: ${profile.length}`);
assert.ok(profile.every(point=>
  ['x','y','z','cum','roll'].every(key=>Number.isFinite(point[key]))
),'refined road profile contains non-finite values');
assert.ok(Math.hypot(profile[0].x-profile.at(-1).x,profile[0].z-profile.at(-1).z)<1e-8,'refined circuit seam opened');
assert.ok(Math.abs(profile[0].y-profile.at(-1).y)<1e-8,'refined circuit height seam opened');
assert.ok(Math.abs(profile[0].roll-profile.at(-1).roll)<1e-8,'refined circuit bank seam opened');

function angleDelta(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}

let maxSegmentM=0;
let maxHeadingStepDeg=0;
let maxPitchStepDeg=0;
let maxRollStepDeg=0;
let maxContactHeadingJoinDeg=0;
let maxContactPitchJoinDeg=0;
let maxWheelPlaneJoinM=0;

function supportPlaneAt(frame,x,z){
  const dx=x-frame.px,dz=z-frame.pz;
  const along=dx*Math.sin(frame.angle)+dz*Math.cos(frame.angle);
  const lateral=-dx*Math.cos(frame.angle)+dz*Math.sin(frame.angle);
  return frame.y+Math.tan(frame.pitch)*along+Math.tan(frame.roll||0)*lateral;
}

for(let i=1;i<profile.length;i++){
  const a=profile[i-1],b=profile[i];
  const segmentM=Math.hypot(b.x-a.x,b.z-a.z);
  maxSegmentM=Math.max(maxSegmentM,segmentM);
  assert.ok(b.cum>a.cum,`refined cumulative distance stopped at ${i}`);
}

for(let i=1;i<profile.length-1;i++){
  const a=profile[i-1],point=profile[i],b=profile[i+1];
  const beforeHeading=Math.atan2(point.x-a.x,point.z-a.z);
  const afterHeading=Math.atan2(b.x-point.x,b.z-point.z);
  const beforePitch=Math.atan2(point.y-a.y,Math.hypot(point.x-a.x,point.z-a.z));
  const afterPitch=Math.atan2(b.y-point.y,Math.hypot(b.x-point.x,b.z-point.z));
  maxHeadingStepDeg=Math.max(maxHeadingStepDeg,Math.abs(angleDelta(beforeHeading,afterHeading))*DEG);
  maxPitchStepDeg=Math.max(maxPitchStepDeg,Math.abs(afterPitch-beforePitch)*DEG);
  maxRollStepDeg=Math.max(maxRollStepDeg,Math.abs((b.roll||0)-(point.roll||0))*DEG);

  const epsilon=Math.min(.001,(b.cum-a.cum)*.10);
  const before=system.roadProfileFrameAtCum(point.cum-epsilon);
  const after=system.roadProfileFrameAtCum(point.cum+epsilon);
  maxContactHeadingJoinDeg=Math.max(
    maxContactHeadingJoinDeg,
    Math.abs(angleDelta(before.angle,after.angle))*DEG
  );
  maxContactPitchJoinDeg=Math.max(
    maxContactPitchJoinDeg,
    Math.abs(after.pitch-before.pitch)*DEG
  );

  const heading=before.angle+angleDelta(before.angle,after.angle)*.5;
  const cos=Math.cos(heading),sin=Math.sin(heading);
  for(const localX of [-.78,.78])for(const localZ of [-1.385,1.385]){
    const wheelX=point.x+localX*cos+localZ*sin;
    const wheelZ=point.z-localX*sin+localZ*cos;
    maxWheelPlaneJoinM=Math.max(
      maxWheelPlaneJoinM,
      Math.abs(supportPlaneAt(after,wheelX,wheelZ)-supportPlaneAt(before,wheelX,wheelZ))
    );
  }
}

assert.ok(maxSegmentM<=1.501,`visible road section is still too long: ${maxSegmentM.toFixed(3)} m`);
assert.ok(maxHeadingStepDeg<=3.1,`tight-curve road facet is still abrupt: ${maxHeadingStepDeg.toFixed(3)} deg`);
assert.ok(maxPitchStepDeg<=.28,`grade road facet is still abrupt: ${maxPitchStepDeg.toFixed(3)} deg`);
assert.ok(maxRollStepDeg<=.42,`bank road facet is still abrupt: ${maxRollStepDeg.toFixed(3)} deg`);
assert.ok(maxContactHeadingJoinDeg<=.02,`contact heading is discontinuous: ${maxContactHeadingJoinDeg.toFixed(5)} deg`);
assert.ok(maxContactPitchJoinDeg<=.001,`contact pitch is discontinuous: ${maxContactPitchJoinDeg.toFixed(5)} deg`);
assert.ok(maxWheelPlaneJoinM<=.0002,`wheel support plane still steps ${maxWheelPlaneJoinM.toFixed(6)} m at a join`);

const seamStart=system.roadProfileFrameAtCum(.001);
const seamEnd=system.roadProfileFrameAtCum(routeLength-.001);
assert.ok(Math.abs(angleDelta(seamStart.angle,seamEnd.angle))*DEG<=.02,'closed-loop contact heading seam is discontinuous');
assert.ok(Math.abs(seamStart.pitch-seamEnd.pitch)*DEG<=.001,'closed-loop contact pitch seam is discontinuous');

const material=new THREE.MeshBasicMaterial();
const roadObjects=[
  system.buildRibbon(profile,15,material,.10),
  system.buildRoadVolume(profile,{asphaltWidthM:15,shoulderWidthM:0})
];
for(const root of roadObjects){
  root.traverse(object=>{
    const geometry=object.geometry;
    if(!geometry)return;
    const positions=geometry.getAttribute('position');
    assert.ok(positions&&positions.array.every(Number.isFinite),'road mesh emitted a non-finite position');
    geometry.computeBoundingSphere();
    assert.ok(Number.isFinite(geometry.boundingSphere?.radius),'road mesh bounding sphere is non-finite');
  });
}

// Manic-2 -> Manic-5 browser repro: the reported failing road volume contained
// 19,976 positions, i.e. exactly eight edge vertices for each of 2,497 profile
// points. Ordinary routes intentionally have no circuit roadSpec, so this also
// protects the default shoulder width from Number(undefined) becoming NaN.
const manicReproOffset={x:412345,z:-553210};
const manicReproProfile=Array.from({length:2497},(_,index)=>{
  const cum=index*1.5;
  return {
    x:manicReproOffset.x+cum,
    y:238+7*Math.sin(index/85),
    z:manicReproOffset.z+30*Math.sin(index/130),
    cum,
    roll:.035*Math.sin(index/95)
  };
});
const manicRoadVolume=system.buildRoadVolume(manicReproProfile,null,manicReproOffset);
const manicEdges=manicRoadVolume.children.find(child=>
  child.geometry?.userData?.worldDriveGeometry==='road-volume-edges'
);
assert.ok(manicEdges,'Manic repro road edge geometry is missing');
const manicPositions=manicEdges.geometry.getAttribute('position');
assert.equal(manicPositions.count,19976,'Manic repro no longer matches the reported geometry count');
assert.equal(manicEdges.geometry.index.count,89856,'Manic repro road edge index count changed');
assert.ok(manicPositions.array.every(Number.isFinite),'default road volume emitted a non-finite position');
assert.ok(Math.abs(manicPositions.getX(0))<20,'prepared road volume ignored its explicit floating origin');
manicEdges.geometry.computeBoundingSphere();
assert.ok(Number.isFinite(manicEdges.geometry.boundingSphere?.radius),'Manic repro bounding sphere is non-finite');

const contaminatedProfile=manicReproProfile.map(point=>({...point}));
contaminatedProfile[1].x=NaN;
const guardedVolume=system.buildRoadVolume(contaminatedProfile,null,manicReproOffset);
guardedVolume.traverse(object=>{
  const positions=object.geometry?.getAttribute?.('position');
  if(positions)assert.ok(positions.array.every(Number.isFinite),'road-volume finite guard leaked a NaN');
});

console.log('ROAD SURFACE CONTINUITY R1 QA: PASS',{
  profilePoints:profile.length,
  maxSegmentM:Number(maxSegmentM.toFixed(3)),
  maxHeadingStepDeg:Number(maxHeadingStepDeg.toFixed(3)),
  maxPitchStepDeg:Number(maxPitchStepDeg.toFixed(3)),
  maxRollStepDeg:Number(maxRollStepDeg.toFixed(3)),
  maxContactHeadingJoinDeg:Number(maxContactHeadingJoinDeg.toFixed(5)),
  maxContactPitchJoinDeg:Number(maxContactPitchJoinDeg.toFixed(5)),
  maxWheelPlaneJoinMm:Number((maxWheelPlaneJoinM*1000).toFixed(3)),
  finiteBoundingSpheres:true,
  manicReproVertices:manicPositions.count,
  defaultRoadSpecFinite:true,
  preparedOriginPinned:true
});
