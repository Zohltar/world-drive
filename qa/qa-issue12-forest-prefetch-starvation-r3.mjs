import fs from 'node:fs';
import {createForestChunkStreamer} from '../src/forest-chunk-streamer.js';
import {FOREST_STREAMING_POLICY as FOREST} from '../src/forest-streaming-policy.js';
import {ensureWorldDriveDiagnostics} from '../src/diagnostics.js';

function expect(condition,message){if(!condition)throw new Error(message);}

// Human R2 FAIL showed that the larger 96/192 caps were not the causal fix:
// runtime maxCandidates was only 40 and every forward-prefetch chunk still sat
// queued. R3 intentionally restores the certified P9.29/P9.36 budgets/caps and
// changes only queue ownership AFTER the protected initial-ready gate resolves.
expect(FOREST.forestSliceBudgetMs===.95,'Issue #12 R3 changed normal forest time budget');
expect(FOREST.forestCatchupSliceBudgetMs===1.55,'Issue #12 R3 changed catch-up forest time budget');
expect(FOREST.candidatesPerBuildSlice===12,'Issue #12 R3 did not restore normal candidate cap');
expect(FOREST.forestCatchupCandidatesPerSlice===20,'Issue #12 R3 did not restore catch-up candidate cap');

const coreSource=fs.readFileSync(new URL('../src/forest-chunk-streamer-core.js',import.meta.url),'utf8');
expect(coreSource.includes('prefetchPriorityPenalty=240'),'Issue #12 R3 prefetch priority penalty missing');
expect(coreSource.includes('prefetchPriorityBand:2'),'Issue #12 R3 startup diagnostics do not begin in historical band 2');
expect(
  coreSource.includes('const prefetchBand=initialResolved?1:2'),
  'Issue #12 R3 does not gate prefetch interleave behind initial readiness'
);
expect(
  coreSource.includes('perf.prefetchPriorityBand=1')&&coreSource.includes('queuePriorityDirty=true'),
  'Issue #12 R3 does not reprioritize queued reserve work when startup becomes ready'
);
expect(
  /if\(nearDistance<=nearPriorityDistance\)[\s\S]*?return \{band:0/.test(coreSource),
  'Issue #12 R3 no longer keeps near-visible chunks at highest priority'
);
expect(
  coreSource.includes("globalThis.requestIdleCallback(callback,{timeout:90})"),
  'Issue #12 R3 did not restore the certified 90 ms idle scheduling contract'
);

class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
}
class Group{
  constructor(){this.children=[];this.parent=null;this.position=new Vec3();this.matrixAutoUpdate=true;this.name='';this.visible=true;this.userData={};}
  add(object){if(object.parent)object.parent.remove(object);this.children.push(object);object.parent=this;}
  remove(object){const i=this.children.indexOf(object);if(i>=0)this.children.splice(i,1);object.parent=null;}
  updateMatrix(){}
  traverse(fn){fn(this);for(const child of this.children)child.traverse?child.traverse(fn):fn(child);}
}
class InstancedMesh{
  constructor(geometry,material,count){
    this.geometry=geometry;this.material=material;this.count=count;this.parent=null;
    this.userData={};this.position=new Vec3();this.matrixAutoUpdate=true;
    this.instanceMatrix={array:new Float32Array(count*16),setUsage(){},needsUpdate:false};
  }
  computeBoundingSphere(){}
  updateMatrix(){}
  dispose(){this.disposed=true;}
}
const THREE={Vector3:Vec3,Group,InstancedMesh,StaticDrawUsage:35044};

const pending=[];
const realRic=globalThis.requestIdleCallback;
const realSetInterval=globalThis.setInterval;
const realClearInterval=globalThis.clearInterval;
globalThis.requestIdleCallback=callback=>{pending.push(callback);return pending.length;};
globalThis.setInterval=(fn,ms)=>({fn,ms});
globalThis.clearInterval=()=>{};

function pump(count){
  let ran=0;
  while(ran<count&&pending.length){
    const callback=pending.shift();
    callback({didTimeout:false,timeRemaining:()=>4.5});
    ran++;
  }
  return ran;
}

try{
  const diagnostics=ensureWorldDriveDiagnostics();
  diagnostics.framePacing.snapshot=()=>({});

  const forestGroup=new Group();
  let offset={x:0,z:0};
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

  // Match the real startup contract: begin driving as soon as the protected
  // inner readiness promise resolves. Do NOT prebuild the entire visible ring;
  // the old R2 QA did that and therefore hid the starvation seen by the human.
  let initialReady=false;
  streamer.whenInitialReady().then(()=>{initialReady=true;});
  let startupCallbacks=0;
  while(!initialReady&&startupCallbacks<6000){
    const ran=pump(24);
    startupCallbacks+=ran;
    await Promise.resolve();
    if(!ran)break;
  }
  if(!initialReady){
    const stalled=streamer.stats();
    throw new Error(
      `Issue #12 R3 initial readiness never resolved after ${startupCallbacks} callbacks; `+
      `active=${stalled.activeChunks}, visible=${stalled.visibleWantedChunks}, `+
      `queued=${stalled.queuedChunks}, prefetchQueued=${stalled.prefetchQueuedChunks}, `+
      `prefetchBand=${stalled.prefetchPriorityBand}`
    );
  }

  const initial=streamer.stats();
  expect(initial.prefetchWantedChunks>0,'Issue #12 R3 startup did not create a forward prefetch lobe');
  expect(initial.prefetchQueuedChunks>0,'Issue #12 R3 startup unexpectedly had no queued prefetch debt');
  expect(initial.queuedChunks>initial.prefetchQueuedChunks,'Issue #12 R3 startup lacked far-visible debt needed to reproduce starvation');
  expect(initial.prefetchPriorityBand===1,'Issue #12 R3 did not switch prefetch to band 1 after initial readiness');

  let firstPrepared=null;
  let serviceCallbacks=0;
  while(serviceCallbacks<3000){
    const ran=pump(20);
    serviceCallbacks+=ran;
    const stats=streamer.stats();
    if(stats.prefetchMeshPrepares>0){firstPrepared=stats;break;}
    if(!ran)break;
  }
  expect(firstPrepared,'Issue #12 R3 forward prefetch still starved behind visible backlog');

  const nonPrefetchDebtAtFirstPrepare=
    firstPrepared.queuedChunks-firstPrepared.prefetchQueuedChunks;
  expect(
    nonPrefetchDebtAtFirstPrepare>0,
    'Issue #12 R3 only serviced prefetch after all visible debt drained; starvation remains possible'
  );

  // Once the car advances, at least one already-prepared forward chunk should
  // become visible as a cheap cache hit instead of being generated in view.
  offset={x:0,z:1200};
  streamer.requestUpdate(true);
  const afterAdvance=streamer.stats();
  expect(
    afterAdvance.prefetchHits>0,
    `Issue #12 R3 prepared reserve was not reused when entering visible range: hits=${afterAdvance.prefetchHits}`
  );

  console.log('PASS Issue #12 R3 forward-prefetch starvation regression');
  console.log({
    startupCallbacks,
    serviceCallbacks,
    initialQueued:initial.queuedChunks,
    initialPrefetchQueued:initial.prefetchQueuedChunks,
    firstPrepareQueued:firstPrepared.queuedChunks,
    firstPreparePrefetchQueued:firstPrepared.prefetchQueuedChunks,
    nonPrefetchDebtAtFirstPrepare,
    prefetchMeshPrepares:firstPrepared.prefetchMeshPrepares,
    prefetchHits:afterAdvance.prefetchHits,
    prefetchPriorityBand:afterAdvance.prefetchPriorityBand,
    candidateCap:afterAdvance.candidateBatchSize,
    catchupCandidateCap:afterAdvance.catchupCandidateBatchSize
  });
}finally{
  if(realRic===undefined)delete globalThis.requestIdleCallback;
  else globalThis.requestIdleCallback=realRic;
  globalThis.setInterval=realSetInterval;
  globalThis.clearInterval=realClearInterval;
}
