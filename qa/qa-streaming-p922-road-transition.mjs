import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLocalWorldBuilder} from '../src/local-world-builder.js';

const fullProfile=Array.from({length:101},(_,i)=>({
  x:i*3,
  z:0,
  y:i*.03,
  roll:0,
  cum:i*3
}));

let activeProfile=null;
let terrainProfile=null;

const terrainService={
  resetRoadBedOrigin(){},
  setRoadBed(profile){
    terrainProfile=profile;
    return true;
  },
  diagnostics(){return null;}
};

const builder=createLocalWorldBuilder({
  THREE,
  resetStreamedWorldOrigins(){},
  terrainService,
  clearGroup(){},
  roadGroup:new THREE.Group(),
  forestGroup:new THREE.Group(),
  infrastructureGroup:new THREE.Group(),
  signGroup:new THREE.Group(),
  sceneryRenderer:{clear(){}},
  getBridgeFeatureCount:()=>0,
  rebuildBridgeSpans(){},
  buildRoadProfile:()=>fullProfile,
  setActiveRoadProfile:profile=>{activeProfile=profile;},
  buildRoadVolume:()=>null,
  buildLateralBand:()=>null,
  buildRibbon:()=>null,
  buildOffsetRibbon:()=>null,
  shoulderMat:null,
  roadMat:null,
  lineYellow:null,
  lineWhite:null,
  ROAD_SURFACE_OFFSET:.2,
  getWorldOffset:()=>({x:0,z:0}),
  rebuildLocalWater(){},
  scheduleVisualJob(){},
  rebuildLocalScenery(){},
  addEnhancedBridgeFurniture(){},
  refreshRoadSignsOnly(){},
  freezeStaticMatrices(){},
  rebuildHorizon(){},
  markStaticShadowsDirty(){}
});

const report=builder.rebuild();
assert.equal(activeProfile,fullProfile,'physics/road profile must remain the full profile');
assert.ok(Array.isArray(terrainProfile),'terrain profile must be supplied');
assert.ok(terrainProfile.length<fullProfile.length*.55,'straight terrain profile should be materially reduced');
assert.equal(report.profilePoints,fullProfile.length);
assert.equal(report.terrainProfilePoints,terrainProfile.length);

let maxTerrainStep=0;
for(let i=1;i<terrainProfile.length;i++){
  maxTerrainStep=Math.max(
    maxTerrainStep,
    Math.hypot(
      terrainProfile[i].x-terrainProfile[i-1].x,
      terrainProfile[i].z-terrainProfile[i-1].z
    )
  );
}
// terrain.js rejects only centerStep > 9, so an exact 9 m step is safe and
// lets 3 m route samples decimate to every third point instead of every second.
assert.ok(maxTerrainStep<=9+1e-9,'terrain transition must stay inside the 9 m continuity fuse');

const gridSegments=4;
const grid=new THREE.PlaneGeometry(40,40,gridSegments,gridSegments);
grid.rotateX(-Math.PI/2);
grid.userData.worldDriveGroundSegments=gridSegments;
grid.userData.worldDriveGroundSize=40;
const positions=grid.getAttribute('position');
const center=Math.floor(positions.count/2);
positions.array[center*3+1]=2;
positions.needsUpdate=true;
grid.computeVertexNormals();
const normals=grid.getAttribute('normal');
assert.equal(normals.count,positions.count);
for(let i=0;i<normals.count;i++){
  assert.ok(Number.isFinite(normals.getX(i)));
  assert.ok(Number.isFinite(normals.getY(i)));
  assert.ok(Number.isFinite(normals.getZ(i)));
  assert.ok(normals.getY(i)>0,'ground normals must remain upward-facing');
}

const ordinary=new THREE.BufferGeometry();
ordinary.setAttribute('position',new THREE.Float32BufferAttribute([
  0,0,0,
  1,0,0,
  0,0,1
],3));
ordinary.setIndex([0,2,1]);
ordinary.computeVertexNormals();
assert.equal(ordinary.getAttribute('normal').count,3,'ordinary geometry must keep normal generation');

console.log('Streaming P9.22/P9.24 road-transition QA passed');
console.log({
  fullProfilePoints:fullProfile.length,
  terrainProfilePoints:terrainProfile.length,
  reductionPct:Number(((1-terrainProfile.length/fullProfile.length)*100).toFixed(1)),
  maxTerrainStep:Number(maxTerrainStep.toFixed(3)),
  fastGridNormals:true
});
