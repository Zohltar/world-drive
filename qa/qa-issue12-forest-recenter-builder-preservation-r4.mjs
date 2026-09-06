import fs from 'node:fs';
import {createForestChunkStreamer} from '../src/forest-chunk-streamer.js';
import {FOREST_STREAMING_POLICY as FOREST} from '../src/forest-streaming-policy.js';
import {ensureWorldDriveDiagnostics} from '../src/diagnostics.js';

function expect(condition,message){if(!condition)throw new Error(message);}

// Issue #12 R4 is deliberately NOT another budget/throughput retune.
expect(FOREST.forestSliceBudgetMs===.95,'Issue #12 R4 changed normal forest slice budget');
expect(FOREST.forestCatchupSliceBudgetMs===1.55,'Issue #12 R4 changed catch-up forest slice budget');
expect(FOREST.candidatesPerBuildSlice===12,'Issue #12 R4 changed normal candidate cap');
expect(FOREST.forestCatchupCandidatesPerSlice===20,'Issue #12 R4 changed catch-up candidate cap');
expect(FOREST.heightRefreshDistance===520,'Issue #12 R4 changed near terrain refresh radius');

const coreSource=fs.readFileSync(new URL('../src/forest-chunk-streamer-core.js',import.meta.url),'utf8');
const refreshStart=coreSource.indexOf('function refreshVisibleHeights()');
const clearStart=coreSource.indexOf('function clearAll()',refreshStart);
expect(refreshStart>=0&&clearStart>refreshStart,'Issue #12 R4 refreshVisibleHeights owner missing');
const refreshSource=coreSource.slice(refreshStart,clearStart);
expect(!refreshSource.includes('serial++'),'Issue #12 R4 still globally invalidates every builder on terrain refresh');
expect(
  refreshSource.includes('chunkCenterDistance(job,center)<=refreshRadius'),
  'Issue #12 R4 does not scope queued-builder invalidation to the near terrain refresh radius'
);
expect(
  refreshSource.includes('terrainRefreshBuilderPreserves'),
  'Issue #12 R4 does not retain evidence that distant builders survive terrain refreshes'
);
expect(
  /for\(const job of queue\)[\s\S]*?job\.builder=null[\s\S]*?else builderPreserves\+\+/.test(refreshSource),
  'Issue #12 R4 local reset/preserve split is missing'
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

  let initialReady=false;
  streamer.whenInitialReady().then(()=>{initialReady=true;});
  let startupCallbacks=0;
  while(!initialReady&&startupCallbacks<5000){
    const ran=pump(24);
    startupCallbacks+=ran;
    await Promise.resolve();
    if(!ran)break;
  }
  expect(initialReady,`Issue #12 R4 initial readiness never resolved after ${startupCallbacks} callbacks`);

  // Establish an actual prepared forward reserve first. R3 guarantees that this
  // can happen before all far-visible debt drains; R4 must then keep subsequent
  // partial distant builders alive while near terrain refreshes repeat.
  let firstPrepared=null;
  let reserveCallbacks=0;
  while(reserveCallbacks<2200){
    const ran=pump(12);
    reserveCallbacks+=ran;
    const stats=streamer.stats();
    if(stats.prefetchMeshPrepares>0){firstPrepared=stats;break;}
    if(!ran)break;
  }
  expect(firstPrepared,'Issue #12 R4 never established the forward reserve baseline');
  expect(firstPrepared.prefetchQueuedChunks>0,'Issue #12 R4 lacks queued reserve debt needed for recenter stress');

  let refreshes=0;
  for(let i=0;i<4;i++){
    // Allow both local replacement work and distant work to gain partial progress,
    // then model the repeated near-terrain refresh that accompanies recentering.
    pump(120);
    streamer.refreshVisibleHeights();
    refreshes++;
  }
  pump(260);

  const afterRefreshes=streamer.stats();
  expect(afterRefreshes.terrainRefreshRuns===refreshes,
    `Issue #12 R4 refresh accounting mismatch: ${afterRefreshes.terrainRefreshRuns} != ${refreshes}`);
  expect(afterRefreshes.terrainRefreshBuilderResets>0,
    'Issue #12 R4 stress never reset a genuinely local partial builder');
  expect(afterRefreshes.terrainRefreshBuilderPreserves>0,
    'Issue #12 R4 still failed to preserve any distant partial builder across repeated terrain refreshes');
  expect(afterRefreshes.prefetchMeshPrepares>=firstPrepared.prefetchMeshPrepares,
    'Issue #12 R4 lost already-prepared forward reserve across terrain refreshes');

  // Enter part of the prepared lobe: at least one cached reserve chunk must be
  // reused without a fresh in-view build.
  offset={x:0,z:1200};
  streamer.requestUpdate(true);
  pump(4);
  const afterAdvance=streamer.stats();
  expect(afterAdvance.prefetchHits>0,
    `Issue #12 R4 prepared reserve was not reused after advance: hits=${afterAdvance.prefetchHits}`);
  expect(afterAdvance.maxSliceMs<12,
    `Issue #12 R4 regressed forest slice pacing: ${afterAdvance.maxSliceMs.toFixed(2)} ms`);

  console.log('PASS Issue #12 R4 recenter builder-preservation regression');
  console.log({
    startupCallbacks,
    reserveCallbacks,
    refreshes,
    localBuilderResets:afterRefreshes.terrainRefreshBuilderResets,
    distantBuilderPreserves:afterRefreshes.terrainRefreshBuilderPreserves,
    prefetchMeshPrepares:afterRefreshes.prefetchMeshPrepares,
    prefetchHits:afterAdvance.prefetchHits,
    queuedAfterRefreshes:afterRefreshes.queuedChunks,
    maxSliceMs:Number(afterAdvance.maxSliceMs.toFixed(3))
  });
}finally{
  if(realRic===undefined)delete globalThis.requestIdleCallback;
  else globalThis.requestIdleCallback=realRic;
  globalThis.setInterval=realSetInterval;
  globalThis.clearInterval=realClearInterval;
}
