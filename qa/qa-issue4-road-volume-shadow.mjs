import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoadGeometrySystem} from '../src/road-geometry.js';
import {createLocalWorldBuilder} from '../src/local-world-builder.js';

const roadEdgeMat=new THREE.MeshStandardMaterial({color:0x4f4e49});
const roadUnderMat=new THREE.MeshStandardMaterial({color:0x292b2a,side:THREE.DoubleSide});
const roadGeometry=createRoadGeometrySystem({
  THREE,
  roadEdgeMat,
  roadUnderMat,
  ROAD_SURFACE_OFFSET:.10,
  terrainAbs:()=>0,
  nearestRoute:()=>({cum:0}),
  bridgeHeightAtCum:()=>null,
  bridgeManager:{isNearApproach:()=>false},
  getState:()=>({absX:0,absZ:0,routeLength:100,segments:[],worldOffset:{x:0,z:0}})
});

const profile=[
  {x:0,z:0,y:8,cum:0,roll:0},
  {x:0,z:20,y:8,cum:20,roll:0},
  {x:3,z:40,y:8,cum:40,roll:.02}
];

// The canonical C3 road geometry remains byte/behaviour compatible: its solid
// edge and underside meshes still carry the historical castShadow=true flags.
// Issue #4 is corrected in the current local-world presentation policy instead.
const direct=roadGeometry.buildRoadVolume(profile);
assert(direct&&direct.children.length===2,'Issue #4: canonical road volume did not build two solid meshes');
assert.deepEqual(direct.children.map(mesh=>mesh.castShadow),[true,true],
  'Issue #4: canonical road geometry shadow ownership changed unexpectedly');
const directPositions=direct.children.map(mesh=>Array.from(mesh.geometry.getAttribute('position').array));

const ground=new THREE.Mesh(
  new THREE.PlaneGeometry(120,120,4,4),
  new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:false})
);
const roadGroup=new THREE.Group();
const forestGroup=new THREE.Group();
const infrastructureGroup=new THREE.Group();
const signGroup=new THREE.Group();
const terrainService={
  setRoadBed(){return true;},
  resetRoadBedOrigin(){},
  cancelRoadTransitionPreparation(){},
  diagnostics(){return {};},
  p926Diagnostics(){return {};},
  p927Diagnostics(){return {};},
  captureHorizonOrigin(){return null;},
  restoreHorizonOrigin(){},
  clearRoadBed(){}
};
const noop=()=>{};
const builder=createLocalWorldBuilder({
  THREE,
  resetStreamedWorldOrigins:noop,
  terrainService,
  ground,
  clearGroup:group=>group?.clear?.(),
  roadGroup,
  forestGroup,
  infrastructureGroup,
  signGroup,
  sceneryRenderer:{clear:noop},
  getBridgeFeatureCount:()=>0,
  rebuildBridgeSpans:noop,
  buildRoadProfile:()=>profile.map(point=>({...point})),
  setActiveRoadProfile:noop,
  buildRoadVolume:roadGeometry.buildRoadVolume,
  buildLateralBand:()=>null,
  buildRibbon:()=>null,
  buildOffsetRibbon:()=>null,
  shoulderMat:null,
  roadMat:null,
  lineYellow:null,
  lineWhite:null,
  ROAD_SURFACE_OFFSET:.10,
  getWorldOffset:()=>({x:0,z:0}),
  rebuildLocalWater:noop,
  scheduleVisualJob:()=>null,
  rebuildLocalScenery:noop,
  addEnhancedBridgeFurniture:noop,
  refreshRoadSignsOnly:noop,
  freezeStaticMatrices:noop,
  rebuildHorizon:noop,
  markStaticShadowsDirty:noop
});

builder.rebuild();
assert.equal(roadGroup.children.length,1,'Issue #4: local-world rebuild did not install road volume');
const installed=roadGroup.children[0];
assert.equal(installed.children.length,2,'Issue #4: installed road volume lost edge/underside meshes');
assert.deepEqual(installed.children.map(mesh=>mesh.castShadow),[false,false],
  'Issue #4: road-volume shadow casters still active after local-world install');

// Shadow policy must not alter positions/topology: only the castShadow flag changes.
for(let i=0;i<installed.children.length;i++){
  assert.deepEqual(
    Array.from(installed.children[i].geometry.getAttribute('position').array),
    directPositions[i],
    `Issue #4: road-volume geometry changed on child ${i}`
  );
  assert.equal(installed.children[i].receiveShadow,true,
    `Issue #4: road-volume receiveShadow contract changed on child ${i}`);
}

const diag=builder.p923Diagnostics?.()?.p937RoadPrebuild;
assert((diag?.shadowSuppressions||0)===2,
  `Issue #4: expected exactly two road-volume shadow suppressions, got ${diag?.shadowSuppressions}`);

console.log('ISSUE 4 ROAD VOLUME SHADOW QA: PASS',{
  canonicalShadowCasters:2,
  installedShadowCasters:installed.children.filter(mesh=>mesh.castShadow).length,
  geometryChanged:false,
  receiveShadowPreserved:true,
  shadowSuppressions:diag.shadowSuppressions
});
