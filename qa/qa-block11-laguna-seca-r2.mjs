import assert from 'node:assert/strict';
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

// Measure the nominal asphalt dimension on a straight cross-section. Corner
// miters intentionally widen locally so adjoining triangles cannot open a gap.
const widthProfile=[
  {x:0,z:0,y:0,roll:0,cum:0},
  {x:0,z:20,y:0,roll:0,cum:20}
];
const volume=system.buildRoadVolume(widthProfile,LAGUNA_SECA_CIRCUIT.roadSpec);
const edge=volume.children[0].geometry.getAttribute('position').array;
const leftTop=3*3,rightTop=4*3;
const width=Math.hypot(edge[leftTop]-edge[rightTop],edge[leftTop+2]-edge[rightTop+2]);
assert.ok(width>14.99&&width<15.01,`expected 15m asphalt width, got ${width}`);
console.log('BLOCK 11 LAGUNA SECA R2 FIDELITY QA: PASS',{profilePoints:profile.length,seamClosed:true,asphaltWidthM:Number(width.toFixed(2)),civilTraffic:false});
