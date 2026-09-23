import assert from 'node:assert/strict';
import {createForestChunkStreamer} from '../src/forest-chunk-streamer-core.js';
import {FOREST_STREAMING_POLICY as FOREST} from '../src/forest-streaming-policy.js';

assert.equal(FOREST.candidatesPerCell,109,'R23 must preserve the global R4 baseline');
assert.equal(FOREST.maxCandidatesPerCell,160,'R23 bounded regional ceiling drifted');
assert.equal(FOREST.firstLayerCandidatesPerCell,64,'R23 must preserve R4 time-to-first-layer');

class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
}
class Group{
  constructor(){this.children=[];this.parent=null;this.position=new Vec3();this.matrixAutoUpdate=true;this.name='';this.visible=true;}
  add(object){if(object.parent)object.parent.remove(object);this.children.push(object);object.parent=this;}
  remove(object){const i=this.children.indexOf(object);if(i>=0)this.children.splice(i,1);object.parent=null;}
  updateMatrix(){}
}
class InstancedMesh{
  constructor(geometry,material,count){
    this.isInstancedMesh=true;this.geometry=geometry;this.material=material;this.count=count;this.parent=null;
    this.userData={};this.position=new Vec3();this.matrixAutoUpdate=true;
    this.instanceMatrix={array:new Float32Array(count*16),setUsage(){},needsUpdate:false};
  }
  updateMatrix(){}
  dispose(){this.disposed=true;}
}
const THREE={Vector3:Vec3,Group,InstancedMesh,StaticDrawUsage:35044};
const forestGroup=new Group();
const idle=[];
const saved={
  requestIdleCallback:globalThis.requestIdleCallback,
  cancelIdleCallback:globalThis.cancelIdleCallback,
  setInterval:globalThis.setInterval,
  clearInterval:globalThis.clearInterval
};
globalThis.requestIdleCallback=callback=>{idle.push(callback);return idle.length;};
globalThis.cancelIdleCallback=()=>{};
globalThis.setInterval=()=>1;
globalThis.clearInterval=()=>{};

const streamer=createForestChunkStreamer({
  THREE,forestGroup,
  getWorldOffset:()=>({x:0,z:0}),
  terrainHeight:()=>0,
  nearestRoute:()=>({d:9999,i:0,angle:0,cum:0,px:0,pz:0}),
  isNearRoute:()=>false,
  isWaterAt:()=>false,
  blocksForest:()=>false
});
const assets={trees:[{name:'proxy-mid',parts:[{geometry:{},material:{}}]}]};
const pumpUntil=(predicate,label,max=1200)=>{
  for(let i=0;i<max;i++){
    if(predicate())return i;
    assert.ok(idle.length, label+' stopped scheduling');
    idle.shift()({didTimeout:false,timeRemaining:()=>8});
  }
  assert.fail(label+' exceeded idle-slice bound');
};
const chunk=()=>{
  const g=forestGroup.children.find(x=>/^forest-chunk-/.test(x.name));
  if(!g)return null;
  const m=/^forest-chunk-(-?\d+):(-?\d+)$/.exec(g.name);
  return m?{group:g,mesh:g.children[0],cx:Number(m[1]),cz:Number(m[2])}:null;
};

try{
  streamer.setAssets(assets);
  pumpUntil(()=>streamer.stats().chunksBuilt>=1&&!!chunk(),'base R4 full chunk');
  let current=chunk();
  assert.ok(current?.mesh,'base chunk missing');
  assert.equal(current.mesh.userData.forestCandidatesPerCell,109);
  const baseCapacity=current.mesh.instanceMatrix.array.length/16;
  const baseStats=streamer.stats();
  assert.equal(baseStats.firstLayerCandidateTarget,1024);
  assert.equal(baseStats.baseCandidatesPerCell,109);
  assert.equal(baseStats.maxCandidatesPerCell,160);
  assert.equal(baseStats.candidateOverrides,0);

  assert.equal(streamer.setChunkCandidateLimit(current.cx,current.cz,150),true);
  assert.equal(streamer.stats().candidateOverrides,1);
  const baseMesh=current.mesh;
  pumpUntil(()=>{
    const next=chunk();
    return next&&next.cx===current.cx&&next.cz===current.cz&&next.mesh!==baseMesh
      &&next.mesh.userData.forestCandidatesPerCell===150;
  },'dense Yungas replacement');
  current=chunk();
  const denseCapacity=current.mesh.instanceMatrix.array.length/16;
  assert.equal(current.mesh.userData.forestCandidatesPerCell,150);
  assert.ok(denseCapacity>baseCapacity,{baseCapacity,denseCapacity});
  assert.equal(streamer.stats().firstLayerCandidateTarget,1024,'regional density changed first-layer readiness');
  assert.equal(streamer.stats().candidateOverrides,1);

  assert.equal(streamer.setChunkCandidateLimit(current.cx,current.cz,null),true);
  assert.equal(streamer.stats().candidateOverrides,0);
  const denseMesh=current.mesh;
  pumpUntil(()=>{
    const next=chunk();
    return next&&next.cx===current.cx&&next.cz===current.cz&&next.mesh!==denseMesh
      &&next.mesh.userData.forestCandidatesPerCell===109;
  },'baseline density restoration');
  current=chunk();
  assert.equal(current.mesh.userData.forestCandidatesPerCell,109);
  assert.ok(current.mesh.instanceMatrix.array.length/16<=denseCapacity);
  assert.equal(streamer.stats().candidateOverrides,0);

  assert.throws(()=>streamer.setChunkCandidateLimit(current.cx,current.cz,108),/bound/);
  assert.throws(()=>streamer.setChunkCandidateLimit(current.cx,current.cz,161),/bound/);

  console.log(JSON.stringify({
    status:'PASS',baseCandidatesPerCell:109,denseCandidatesPerCell:150,
    firstLayerCandidatesPerCell:64,firstLayerCandidateTarget:1024,
    baseCapacity,denseCapacity,restoredCandidatesPerCell:current.mesh.userData.forestCandidatesPerCell
  }));
}finally{
  streamer.setAssets(null);streamer.clearAll();
  globalThis.requestIdleCallback=saved.requestIdleCallback;
  globalThis.cancelIdleCallback=saved.cancelIdleCallback;
  globalThis.setInterval=saved.setInterval;
  globalThis.clearInterval=saved.clearInterval;
}
