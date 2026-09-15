import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createBridgeManager} from '../src/bridges.js';
import {createRoadFurnitureSystem} from '../src/road/road-furniture-p930.js';

const routeLength=10000;
const bridgeFeatures=[{
  id:13,
  points:[{x:9970,z:0},{x:30,z:0}]
}];
const manager=createBridgeManager({
  getBridgeFeatures:()=>bridgeFeatures,
  getRouteLength:()=>routeLength,
  getRouteClosedLoop:()=>true,
  nearestRoute:(x,z)=>({cum:x,d:0,px:x,pz:z}),
  routePointAtCum:cum=>({x:cum,z:0,angle:0,cum}),
  terrainHeight:x=>x*.001
});

const spans=manager.rebuild();
assert.equal(spans.length,1,'T13 bridge feature was not projected');
assert.equal(spans[0].start,9970);
assert.equal(spans[0].end,10030);
assert.equal(spans[0].length,60,'T13 seam became an almost-complete-lap bridge');
assert.equal(spans[0].wrapped,true,'T13 bridge lost its closed-loop seam marker');
for(const cum of [9997,-3,2,10002]){
  assert.equal(manager.containsCum(spans[0],cum),true,`bridge seam lost ${cum}`);
  assert.ok(Number.isFinite(manager.heightAtCum(cum)),`bridge height is not finite at ${cum}`);
}
assert.equal(manager.containsCum(spans[0],5000),false,'unrelated half-lap point entered T13 bridge');
assert.equal(manager.heightAtCum(5000),null,'T13 bridge deck leaked across the circuit');
assert.deepEqual(manager.diagnostics(),{
  rebuildCount:1,
  spans:1,
  wrappedSpans:1,
  maxSpanM:60
});

// A real Nordschleife local profile contains roughly 4,000 samples but less
// than one lap. Only the short seam bridge may produce furniture.
const activeRoadProfile=[];
for(let cum=-1800;cum<=2200;cum++){
  activeRoadProfile.push({cum,x:cum,y:10,z:0});
}
const infrastructureGroup=new THREE.Group();
const furnitureRouteCums=[];
const roadFurniture=createRoadFurnitureSystem({
  THREE,
  signGroup:new THREE.Group(),
  infrastructureGroup,
  routePointAtCum:cum=>{
    furnitureRouteCums.push(cum);
    return {x:cum,z:0,angle:0,cum};
  },
  bridgeHeightAtCum:cum=>manager.heightAtCum(cum),
  bridgeSpanContainsCum:(span,cum)=>manager.containsCum(span,cum),
  roadHeightAt:()=>10,
  terrainAbs:()=>0,
  nearestRoute:()=>({cum:0}),
  resetStaticGroupOrigin:()=>{},
  clearGroup:()=>{},
  freezeStaticMatrices:()=>{},
  addGeographicRoadSigns:()=>{},
  getState:()=>({
    activeRoadProfile,
    bridgeSpans:spans,
    worldOffset:{x:0,z:0},
    activeRoadMeta:{confidence:0},
    absX:0,
    absZ:0,
    routeLength
  }),
  setRoadGuideSign:()=>{}
});
const stats=roadFurniture.addEnhancedBridgeFurniture();
assert.equal(stats.spans,1);
assert.equal(stats.profileSections,60,'bridge furniture expanded beyond the 60 m seam span');
assert.ok(stats.instances>600,'bridge fixture did not exercise dense furniture');
assert.ok(stats.batches<=8,'bridge furniture exceeded the bounded draw-batch contract');
assert.ok(
  furnitureRouteCums.every(cum=>cum>=0&&cum<routeLength),
  'wrapped bridge furniture queried clamped out-of-range route positions'
);
assert.ok(furnitureRouteCums.some(cum=>cum>routeLength-30),'wrapped bridge lost its pre-seam furniture');
assert.ok(furnitureRouteCums.some(cum=>cum>0&&cum<30),'wrapped bridge lost its post-seam furniture');
assert.equal(infrastructureGroup.children.length,stats.batches);
assert.ok(infrastructureGroup.children.every(child=>child.isInstancedMesh),'bridge boxes regressed to individual meshes');
assert.equal(
  infrastructureGroup.children.reduce((total,child)=>total+child.count,0),
  stats.instances,
  'bridge furniture batching lost instances'
);
for(const mesh of infrastructureGroup.children){
  assert.ok(mesh.instanceMatrix.array.every(Number.isFinite),'bridge instance matrix contains NaN/Infinity');
  assert.ok(Number.isFinite(mesh.boundingSphere?.radius),'bridge batch has a non-finite bounding sphere');
}

const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const furnitureSource=await readFile(new URL('../src/road/road-furniture-p930.js',import.meta.url),'utf8');
assert.match(mainSource,/getRouteClosedLoop:\(\)=>ROUTE_CLOSED_LOOP/);
assert.match(mainSource,/bridgeSpanContainsCum:\(span,cum\)=>bridgeManager\.containsCum\(span,cum\)/);
assert.match(mainSource,/infrastructure:renderGroupSnapshot\(infrastructureGroup\)/);
assert.match(furnitureSource,/createStaticBoxInstances/);
assert.doesNotMatch(
  furnitureSource,
  /new THREE\.Mesh\(new THREE\.BoxGeometry\(/,
  'enhanced bridge boxes regressed to one geometry and draw call per part'
);

console.log('BLOCK 11 NORDSCHLEIFE BRIDGE PERFORMANCE R4 QA: PASS',{
  routeLengthM:routeLength,
  seamBridgeM:spans[0].length,
  localProfilePoints:activeRoadProfile.length,
  furnitureSections:stats.profileSections,
  furnitureInstances:stats.instances,
  furnitureDrawables:stats.batches,
  finiteBoundingSpheres:true
});
