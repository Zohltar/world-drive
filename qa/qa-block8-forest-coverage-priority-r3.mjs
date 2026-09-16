import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createForestChunkStreamer} from '../src/forest-chunk-streamer-core.js';
import {FOREST_STREAMING_POLICY as FOREST} from '../src/forest-streaming-policy.js';

assert.equal(FOREST.candidatesPerBuildSlice,12,'R3 must preserve the normal candidate cap');
assert.equal(FOREST.forestCatchupCandidatesPerSlice,20,'R3 must preserve the catch-up candidate cap');
assert.equal(FOREST.forestSliceBudgetMs,.95,'R3 must preserve the normal slice budget');
assert.equal(FOREST.forestCatchupSliceBudgetMs,1.55,'R3 must preserve the catch-up slice budget');

const coreSource=fs.readFileSync(new URL('../src/forest-chunk-streamer-core.js',import.meta.url),'utf8');
const wrapperSource=fs.readFileSync(new URL('../src/forest-chunk-streamer.js',import.meta.url),'utf8');
assert.ok(coreSource.includes('if(chunk.replace){'),'R3 replacement priority band is missing');
assert.ok(coreSource.includes('return {band:2,score:nearDistance'),'R3 does not demote covered replacements');
assert.ok(coreSource.includes('job=>chunkCenterDistance(job,center)<=affectedDistance'),
  'R3 terrain refresh still restarts builders outside the affected area');
assert.ok(wrapperSource.includes("readinessMode:'block8-r3-coverage-before-replacement'"),
  'R3 readiness diagnostic mode is missing');

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

let startupSlices=0;
while(streamer.stats().activeChunks<1&&startupSlices<500){
  startupSlices+=runIdle(1);
}
assert.equal(streamer.stats().activeChunks,1,'mock did not produce an initial covered chunk');

streamer.refreshVisibleHeights();
const mixed=streamer.stats();
assert.ok(mixed.queuedCoverageChunks>0,'test needs missing coverage work');
assert.ok(mixed.queuedReplacementChunks>0,'test needs a covered replacement competing with coverage');

const completedBefore=mixed.jobsCompleted;
let prioritySlices=0;
while(streamer.stats().jobsCompleted===completedBefore&&prioritySlices<500){
  prioritySlices+=runIdle(1);
}
const after=streamer.stats();
assert.ok(after.jobsCompleted>completedBefore,'next prioritized job did not complete');
assert.equal(after.lastCompletedJob?.replace,false,
  'a covered terrain replacement preempted missing forest coverage');
assert.equal(after.replacementJobsCompleted,0,
  'replacement work completed while missing coverage was waiting');

console.log('PASS Block 8 R3 coverage-before-replacement QA');
console.log({
  startupSlices,
  prioritySlices,
  queueAtCompetition:{coverage:mixed.queuedCoverageChunks,replacement:mixed.queuedReplacementChunks},
  completion:after.lastCompletedJob,
  lifecycle:{
    coverageCompleted:after.coverageJobsCompleted,
    replacementCompleted:after.replacementJobsCompleted,
    buildersAbandoned:after.buildersAbandoned
  }
});
process.exit(0);
