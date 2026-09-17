import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createForestChunkStreamer} from '../src/forest-chunk-streamer-core.js';
import {FOREST_STREAMING_POLICY as FOREST} from '../src/forest-streaming-policy.js';

assert.equal(FOREST.candidatesPerCell,109,'R4 must preserve the full 109-candidate density');
assert.equal(FOREST.firstLayerCandidatesPerCell,64,'R4 first layer must use 64 candidates per cell');
assert.equal(FOREST.candidatesPerBuildSlice,12,'R4 must preserve the normal candidate cap');
assert.equal(FOREST.forestCatchupCandidatesPerSlice,20,'R4 must preserve the catch-up candidate cap');
assert.equal(FOREST.forestSliceBudgetMs,.95,'R4 must preserve the normal slice budget');
assert.equal(FOREST.forestCatchupSliceBudgetMs,1.55,'R4 must preserve the catch-up slice budget');
assert.equal(FOREST.chunkCells,4,'R4 QA assumes the certified 4x4 cell chunk');

const expectedFirstLayer=FOREST.chunkCells*FOREST.chunkCells*FOREST.firstLayerCandidatesPerCell;
const expectedFull=FOREST.chunkCells*FOREST.chunkCells*FOREST.candidatesPerCell;
assert.equal(expectedFirstLayer,1024,'R4 first layer target drifted');
assert.equal(expectedFull,1744,'R4 full chunk target drifted');
assert.ok(expectedFirstLayer<expectedFull,'R4 first layer no longer reduces time-to-first-display');

const coreSource=fs.readFileSync(new URL('../src/forest-chunk-streamer-core.js',import.meta.url),'utf8');
const wrapperSource=fs.readFileSync(new URL('../src/forest-chunk-streamer.js',import.meta.url),'utf8');
assert.ok(coreSource.includes('if(chunk.firstLayerCommitted){'),'R4 progressive jobs are not demoted after first display');
assert.ok(coreSource.includes('return {band:4,score:nearDistance'),'R4 densification priority band is missing');
assert.ok(coreSource.includes('targetFraction/availableFraction'),'R4 partial-layer density normalization is missing');
assert.ok(wrapperSource.includes("readinessMode:'block8-r4-progressive-first-layer'"),'R4 readiness diagnostic mode is missing');

class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
}
class Group{
  constructor(){this.children=[];this.parent=null;this.position=new Vec3();this.matrixAutoUpdate=true;this.name='';}
  add(object){if(object.parent)object.parent.remove(object);this.children.push(object);object.parent=this;}
  remove(object){const index=this.children.indexOf(object);if(index>=0)this.children.splice(index,1);object.parent=null;}
  updateMatrix(){}
}
class InstancedMesh{
  constructor(geometry,material,count){
    this.geometry=geometry;this.material=material;this.count=count;this.parent=null;
    this.userData={};this.position=new Vec3();this.matrixAutoUpdate=true;
    this.instanceMatrix={array:new Float32Array(count*16),setUsage(){}};
  }
  updateMatrix(){}
  dispose(){this.disposed=true;}
}

const THREE={Vector3:Vec3,Group,InstancedMesh,StaticDrawUsage:35044};
const forestGroup=new Group();
let offset={x:0,z:0};
const idle=[];
globalThis.requestIdleCallback=callback=>{idle.push(callback);return idle.length;};
const runIdle=(count)=>{
  let ran=0;
  while(ran<count&&idle.length){
    idle.shift()({didTimeout:false,timeRemaining:()=>8});
    ran++;
  }
  return ran;
};

const streamer=createForestChunkStreamer({
  THREE,
  forestGroup,
  getWorldOffset:()=>offset,
  terrainHeight:()=>0,
  nearestRoute:(x,z)=>({d:Math.abs(x),i:0,angle:0,cum:z,px:0,pz:z}),
  isNearRoute:(x,z,distance,inclusive=false)=>inclusive?Math.abs(x)<=distance:Math.abs(x)<distance,
  isWaterAt:()=>false,
  blocksForest:()=>false
});
streamer.setAssets({trees:[{name:'proxy-mid',parts:[{geometry:{},material:{}}]}]});

let firstLayerSlices=0;
while(streamer.stats().firstLayerChunksCommitted<1&&firstLayerSlices<200){
  firstLayerSlices+=runIdle(1);
}
const first=streamer.stats();
assert.equal(first.firstLayerChunksCommitted,1,'R4 did not commit the first progressive layer');
assert.equal(first.firstLayerCandidateTarget,1024,'R4 runtime first-layer target drifted');
assert.equal(first.candidatesProcessed,1024,'R4 first display did not occur exactly after one uniform 1,024-candidate layer');
assert.equal(first.jobsCompleted,0,'R4 completed a full chunk before exposing its first layer');
assert.equal(first.chunksBuilt,0,'R4 counted a chunk as fully built before densification');
assert.ok(first.activeChunks>=1,'R4 first visible layer was not attached');
assert.ok(first.progressiveInProgressChunks>=1,'R4 first-layer chunk is not retained for background densification');

// Force the same terrain-refresh competition that motivated R3. The already
// visible progressive chunk becomes replacement work, while the rest of the
// route still has empty coverage. R4 must continue filling another empty chunk
// before either that replacement or any densification can finish.
streamer.refreshVisibleHeights();
const competing=streamer.stats();
assert.ok(competing.queuedCoverageChunks>0,'R4 QA needs missing coverage after first display');
assert.ok(competing.queuedReplacementChunks>0,'R4 QA needs replacement work competing with missing coverage');

const firstLayerBefore=competing.firstLayerChunksCommitted;
let coverageSlices=0;
while(streamer.stats().firstLayerChunksCommitted===firstLayerBefore&&coverageSlices<200){
  coverageSlices+=runIdle(1);
}
const after=streamer.stats();
assert.ok(after.firstLayerChunksCommitted>firstLayerBefore,'R4 did not prioritize another empty chunk first layer');
assert.equal(after.replacementJobsCompleted,0,'R4 replacement work completed before missing first-layer coverage');
assert.equal(after.densificationChunksCompleted,0,'R4 densification completed before missing first-layer coverage');
assert.equal(after.jobsCompleted,0,'R4 completed full work while first-layer coverage was still winning');

console.log('PASS Block 8 R4 progressive first-layer QA');
console.log({
  firstLayerSlices,
  coverageSlices,
  targets:{firstLayer:expectedFirstLayer,full:expectedFull},
  firstDisplay:{active:first.activeChunks,candidates:first.candidatesProcessed,progressive:first.progressiveInProgressChunks},
  competition:{coverage:competing.queuedCoverageChunks,replacement:competing.queuedReplacementChunks},
  after:{firstLayers:after.firstLayerChunksCommitted,replacementsCompleted:after.replacementJobsCompleted,densified:after.densificationChunksCompleted}
});
process.exit(0);
