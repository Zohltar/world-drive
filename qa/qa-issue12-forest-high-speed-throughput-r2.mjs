import fs from 'node:fs';
import {createForestChunkStreamer} from '../src/forest-chunk-streamer.js';
import {FOREST_STREAMING_POLICY as FOREST} from '../src/forest-streaming-policy.js';
import {ensureWorldDriveDiagnostics} from '../src/diagnostics.js';

function expect(condition,message){if(!condition)throw new Error(message);}

// Issue #12 R2 must increase throughput without buying larger per-slice bursts.
expect(FOREST.forestSliceBudgetMs<=.95,'normal forest slice budget increased');
expect(FOREST.forestCatchupSliceBudgetMs<=1.55,'catch-up forest slice budget increased');
expect(FOREST.candidatesPerBuildSlice>=96,'normal candidate ceiling still too small');
expect(FOREST.forestCatchupCandidatesPerSlice>=192,'catch-up candidate ceiling still too small');
expect(FOREST.forestIdleTimeoutMs===90,'normal background scheduler timeout changed');
expect(FOREST.forestBacklogIdleTimeoutMs<=20,'backlogged queue can still starve too long');

const coreSource=fs.readFileSync(new URL('../src/forest-chunk-streamer-core.js',import.meta.url),'utf8');
expect(
  /queue\.length>=catchupQueueThreshold[\s\S]*?backlogIdleTimeoutMs[\s\S]*?:idleTimeoutMs/.test(coreSource),
  'forest scheduler does not select the short timeout only while backlogged'
);
expect(
  coreSource.includes("globalThis.requestIdleCallback(callback,{timeout})"),
  'forest scheduler does not pass the adaptive timeout to requestIdleCallback'
);
expect(
  coreSource.includes('nearSparse-nearFull'),
  'forest density transition contract was altered while changing scheduler throughput'
);

// Conservative steady-state demand at 330 km/h. Treat the visible circle and
// forward prefetch circle as independent swept areas (deliberately double-counting
// overlap) so the required candidate rate is an upper bound, not an optimistic one.
const speedKmh=330;
const speedMps=speedKmh/3.6;
const chunkSize=FOREST.cellSize*FOREST.chunkCells;
const chunkArea=chunkSize*chunkSize;
const candidatesPerChunk=FOREST.candidatesPerCell*FOREST.chunkCells*FOREST.chunkCells;
const visibleChunksPerSecond=(2*FOREST.maxDistance*speedMps)/chunkArea;
const prefetchChunksPerSecond=(2*FOREST.forestPrefetchRadiusM*speedMps)/chunkArea;
const conservativeCandidatesPerSecond=
  (visibleChunksPerSecond+prefetchChunksPerSecond)*candidatesPerChunk;
const timeoutSlicesPerSecond=1000/FOREST.forestBacklogIdleTimeoutMs;
const candidateCeilingPerSecond=timeoutSlicesPerSecond*FOREST.candidatesPerBuildSlice;
expect(
  candidateCeilingPerSecond>conservativeCandidatesPerSecond*1.08,
  `Issue #12 R2 scheduler ceiling is still below 330 km/h demand: `+
  `${candidateCeilingPerSecond.toFixed(0)} <= ${conservativeCandidatesPerSecond.toFixed(0)} candidates/s`
);

// Small runtime probe: simulate a browser with zero genuine idle headroom. Every
// callback therefore fires by timeout. The old 12-candidate ceiling and 90 ms
// backlog timeout are both directly observable here without building an entire
// 10 km synthetic forest in CI.
class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
}
class Group{
  constructor(){this.children=[];this.parent=null;this.position=new Vec3();this.matrixAutoUpdate=true;this.name='';this.userData={};}
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

const root=new Group();
const forestGroup=new Group();
root.add(forestGroup);
const segments=400,row=segments+1;
const attr={itemSize:3,count:row*row,array:new Float32Array(row*row*3)};
const ground={
  isMesh:true,parent:null,position:new Vec3(),
  geometry:{
    parameters:{width:5600,height:5600,widthSegments:segments,heightSegments:segments},
    getAttribute:name=>name==='position'?attr:null
  },
  getWorldPosition(out){out.set(0,0,0);return out;},
  traverse(fn){fn(this);}
};
root.add(ground);

const pending=[];
const requestedTimeouts=[];
const realRic=globalThis.requestIdleCallback;
const realSetInterval=globalThis.setInterval;
const realClearInterval=globalThis.clearInterval;
globalThis.requestIdleCallback=(callback,options={})=>{
  requestedTimeouts.push(options.timeout);
  pending.push(callback);
  return pending.length;
};
globalThis.setInterval=(fn,ms)=>({fn,ms});
globalThis.clearInterval=()=>{};

try{
  // The production wrapper retries diagnostic installation until this callable
  // exists. Real World Drive installs it before forest activation; the QA must do
  // the same or Node intentionally keeps a retry timer alive forever.
  const diagnostics=ensureWorldDriveDiagnostics();
  diagnostics.framePacing.snapshot=()=>({});

  const streamer=createForestChunkStreamer({
    THREE,
    forestGroup,
    getWorldOffset:()=>({x:0,z:0}),
    terrainHeight:()=>0,
    nearestRoute:(x,z)=>({d:Math.abs(x),i:0,angle:0,cum:z,px:0,pz:z}),
    isWaterAt:()=>false,
    blocksForest:()=>false
  });
  streamer.setAssets({trees:[{name:'proxy-mid',parts:[{geometry:{},material:{}}]}]});

  let callbacks=0;
  while(callbacks<40&&pending.length){
    const callback=pending.shift();
    callback({didTimeout:true,timeRemaining:()=>0});
    callbacks++;
  }

  const stats=streamer.stats();
  expect(callbacks>=20,'Issue #12 R2 runtime probe did not exercise enough slices');
  expect(
    requestedTimeouts.some(timeout=>timeout===FOREST.forestBacklogIdleTimeoutMs),
    'backlogged runtime never requested the short idle timeout'
  );
  expect(
    stats.maxCandidates>20,
    `historical 12/20 candidate ceiling still active at runtime: ${stats.maxCandidates}`
  );
  expect(stats.maxSliceMs<8,`forest runtime probe produced an oversized slice: ${stats.maxSliceMs.toFixed(2)} ms`);

  console.log('PASS Issue #12 R2 F1-speed forest throughput QA');
  console.log({
    speedKmh,
    conservativeCandidatesPerSecond:Number(conservativeCandidatesPerSecond.toFixed(0)),
    candidateCeilingPerSecond:Number(candidateCeilingPerSecond.toFixed(0)),
    backlogTimeoutMs:FOREST.forestBacklogIdleTimeoutMs,
    callbacks,
    maxCandidates:stats.maxCandidates,
    maxSliceMs:Number(stats.maxSliceMs.toFixed(3))
  });
}finally{
  if(realRic===undefined)delete globalThis.requestIdleCallback;
  else globalThis.requestIdleCallback=realRic;
  globalThis.setInterval=realSetInterval;
  globalThis.clearInterval=realClearInterval;
}
