import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLocalWorldBuilder} from './src/local-world-builder.js';

const segments=24;
const ground=new THREE.Mesh(
  new THREE.PlaneGeometry(240,240,segments,segments),
  new THREE.MeshStandardMaterial({vertexColors:true})
);
ground.geometry.rotateX(-Math.PI/2);
ground.rotation.set(0,0,0);
ground.renderOrder=-5;
ground.geometry.userData.worldDriveGroundSegments=segments;
ground.geometry.userData.worldDriveGroundSize=240;

const scene=new THREE.Scene();
const world=new THREE.Group();
const roadGroup=new THREE.Group();
const forestGroup=new THREE.Group();
const infrastructureGroup=new THREE.Group();
const signGroup=new THREE.Group();
world.add(roadGroup,forestGroup,infrastructureGroup,signGroup);
scene.add(world,ground);

const realGeometry=ground.geometry;
let sawBypassGeometry=false;
let roadProfile=null;
const terrainService={
  resetRoadBedOrigin(){},
  setRoadBed(){
    if(ground.geometry!==realGeometry)sawBypassGeometry=true;
    return true;
  },
  renderHeightAt(x,z){return x*.01+z*.02;},
  diagnostics(){return {mock:true};}
};
const fullProfile=Array.from({length:81},(_,i)=>({x:i*3,z:0,y:i*.02,cum:i*3,roll:0}));

const builder=createLocalWorldBuilder({
  THREE,
  resetStreamedWorldOrigins(){},
  terrainService,
  clearGroup(group){while(group.children.length)group.remove(group.children[0]);},
  roadGroup,forestGroup,infrastructureGroup,signGroup,
  sceneryRenderer:{clear(){}},
  getBridgeFeatureCount:()=>0,
  rebuildBridgeSpans(){},
  buildRoadProfile:()=>fullProfile,
  setActiveRoadProfile(profile){roadProfile=profile;},
  buildRoadVolume:()=>null,
  buildLateralBand:()=>null,
  buildRibbon:()=>null,
  buildOffsetRibbon:()=>null,
  shoulderMat:null,roadMat:null,lineYellow:null,lineWhite:null,
  ROAD_SURFACE_OFFSET:.1,
  getWorldOffset:()=>({x:100,z:50}),
  rebuildLocalWater(){},
  scheduleVisualJob(){return true;},
  rebuildLocalScenery(){},
  addEnhancedBridgeFurniture(){},
  refreshRoadSignsOnly(){},
  freezeStaticMatrices(){},
  rebuildHorizon(){},
  markStaticShadowsDirty(){}
});

assert.equal(globalThis.__WORLD_DRIVE_P923_LOCAL_WORLD__,builder,
  'P9.23 builder bridge was not registered');

const before=realGeometry.getAttribute('position').array.slice();
const prepared=await builder.prepareIncremental();
assert.ok(prepared,'incremental preparation failed');
assert.equal(ground.geometry,realGeometry,'real ground geometry was not restored after road-state install');
assert.equal(sawBypassGeometry,true,'road-state install did not bypass the full ground rebuild');
assert.equal(prepared.meta.roadStateBypassedGround,true);
assert.equal(prepared.meta.preparedVertices,(segments+1)**2);
assert.ok(prepared.meta.prepareSlices>=3,'terrain work was not split into multiple preparation slices');
assert.deepEqual(realGeometry.getAttribute('position').array,before,
  'visible ground changed before prepared commit');

const report=builder.commitPrepared(prepared);
assert.ok(report&&report.p923,'prepared commit report missing');
assert.equal(roadProfile,fullProfile,'full road/physics profile was not committed');
assert.equal(report.p923.preparedVertices,(segments+1)**2);
assert.ok(Number.isFinite(report.p923.groundCommitMs));

const after=realGeometry.getAttribute('position').array;
let changedY=0;
for(let i=1;i<after.length;i+=3){if(Math.abs(after[i]-before[i])>1e-6)changedY++;}
assert.ok(changedY>0,'prepared heights were not committed to the live terrain');
assert.equal(realGeometry.getAttribute('normal').count,(segments+1)**2);
assert.equal(realGeometry.getAttribute('color').count,(segments+1)**2);

const diag=builder.p923Diagnostics();
assert.equal(diag.preparations,1);
assert.equal(diag.preparedCommits,1);
assert.ok(diag.maxGroundCommitMs>=0);

console.log('Streaming P9.23 prepared-refresh QA passed');
console.log({
  preparedVertices:prepared.meta.preparedVertices,
  prepareSlices:prepared.meta.prepareSlices,
  maxPrepareSliceMs:Number(prepared.meta.maxPrepareSliceMs.toFixed(3)),
  roadStateBypassedGround:prepared.meta.roadStateBypassedGround,
  groundCommitMs:Number(report.p923.groundCommitMs.toFixed(3)),
  changedY
});
