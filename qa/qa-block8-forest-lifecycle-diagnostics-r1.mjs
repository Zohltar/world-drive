import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createForestChunkStreamer} from '../src/forest-chunk-streamer-core.js';

const wrapperSource=fs.readFileSync(new URL('../src/forest-chunk-streamer.js',import.meta.url),'utf8');
assert.ok(wrapperSource.includes("readinessMode:'block8-r4-progressive-first-layer'"),'Block 8 R4 readiness diagnostic mode is missing');
assert.ok(wrapperSource.includes("installDiagnosticAlias('__WORLD_DRIVE_BLOCK8_FOREST__'"),'Block 8 console diagnostic alias is missing');
assert.ok(wrapperSource.includes('lifecycle:{'),'Block 8 lifecycle snapshot is missing');

class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
}
class Group{
  constructor(){this.children=[];this.parent=null;this.position=new Vec3();this.matrixAutoUpdate=true;this.name='';}
  add(object){if(object.parent)object.parent.remove(object);this.children.push(object);object.parent=this;}
  remove(object){const index=this.children.indexOf(object);if(index>=0)this.children.splice(index,1);object.parent=null;}
  updateMatrix(){}
  traverse(fn){fn(this);for(const child of this.children)child.traverse?child.traverse(fn):fn(child);}
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
const root=new Group(),forestGroup=new Group();
root.add(forestGroup);

let offset={x:0,z:-180};
const idle=[];
globalThis.requestIdleCallback=callback=>{idle.push(callback);return idle.length;};
const runIdle=(count,{headroom=false}={})=>{
  let ran=0;
  while(ran<count&&idle.length){
    const callback=idle.shift();
    callback({didTimeout:false,timeRemaining:()=>headroom?8:.25});
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
  isWaterAt:()=>false,
  blocksForest:()=>false
});

streamer.setAssets({trees:[{name:'proxy-mid',parts:[{geometry:{},material:{}}]}]});
offset={x:0,z:0};
streamer.requestUpdate(true);

// Match the game startup gate: make the protected near ring ready with healthy
// idle headroom, then switch to sustained low-headroom driving.
let startupSlices=0;
while(streamer.stats().activeChunks<10&&startupSlices<5000){
  startupSlices+=runIdle(1,{headroom:true});
}
assert.ok(streamer.stats().activeChunks>=10,'mock startup never reached the protected near forest ring');

for(let z=120;z<=8400;z+=120){
  offset={x:0,z};
  streamer.requestUpdate(false);
  runIdle(160,{headroom:false});
}

const stats=streamer.stats();
assert.ok(stats.jobsQueued>0&&stats.jobsStarted>0,'job lifecycle counters did not observe queued/started work');
assert.equal(stats.jobsCompleted,stats.chunksBuilt,'completed job count must match committed chunk count');
assert.ok(stats.wantedSetUpdates>=70,'wanted-set churn was not recorded across the sustained drive');
assert.ok(stats.wantedAdded>0&&stats.wantedRemoved>0,'wanted-set additions/removals were not recorded');
assert.ok(stats.jobsAbandoned>0,'sustained drive should expose superseded job lifetimes');
assert.ok(stats.buildersAbandoned>0&&stats.candidatesAbandoned>0,'partial builder work loss was not measured');
assert.ok(stats.lastAbandonedJob?.reason,'last abandoned job diagnostic is missing');
assert.ok(Object.keys(stats.abandonReasons).length>0,'abandon reason histogram is missing');

console.log('PASS Block 8 forest lifecycle diagnostics QA');
console.log({
  startupSlices,
  active:stats.activeChunks,
  queued:stats.queuedChunks,
  prefetch:{wanted:stats.prefetchWantedChunks,ready:stats.prefetchedReadyChunks,queued:stats.prefetchQueuedChunks},
  lifecycle:{
    queued:stats.jobsQueued,started:stats.jobsStarted,completed:stats.jobsCompleted,
    abandoned:stats.jobsAbandoned,buildersAbandoned:stats.buildersAbandoned,
    candidatesProcessed:stats.candidatesProcessed,candidatesAbandoned:stats.candidatesAbandoned,
    visibleCompleted:stats.visibleJobsCompleted,prefetchCompleted:stats.prefetchJobsCompleted,
    wantedAdded:stats.wantedAdded,wantedRemoved:stats.wantedRemoved,
    abandonReasons:stats.abandonReasons,lastAbandonedJob:stats.lastAbandonedJob
  }
});
process.exit(0);
