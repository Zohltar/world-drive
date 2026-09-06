import {createForestChunkStreamer} from '../src/forest-chunk-streamer.js';
import {FOREST_STREAMING_POLICY as FOREST} from '../src/forest-streaming-policy.js';
import {createForestBlockerIndex} from '../src/scenery/forest-blocker-index.js';

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

function pointInPolygon(x,z,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const xi=points[i].x,zi=points[i].z;
    const xj=points[j].x,zj=points[j].z;
    const crosses=((zi>z)!==(zj>z))&&x<((xj-xi)*(z-zi))/(zj-zi||1e-12)+xi;
    if(crosses)inside=!inside;
  }
  return inside;
}
function blockerFeature(id,x,z,size=90){
  const h=size*.5;
  return {id,type:'way',tags:{building:'yes'},points:[
    {x:x-h,z:z-h},{x:x+h,z:z-h},{x:x+h,z:z+h},{x:x-h,z:z+h}
  ]};
}

// Model accumulated scenery along a 12 km corridor. The spatial index is the
// Issue #12 R1 correction; R2 verifies that the forest builder can exploit the
// cheaper candidate path quickly enough for a 330 km/h F1 run.
const blockerIndex=createForestBlockerIndex({pointInPolygon,cellSize:720});
const blockers=[];
let blockerId=1;
for(let z=-5000;z<=15000;z+=360){
  for(const x of [-1320,-840,-360,360,840,1320]){
    blockers.push(blockerFeature(blockerId++,x,z));
  }
}
blockerIndex.rebuild(blockers);

const forestGroup=new Group();
let offset={x:0,z:0};
const idleQueue=[];
const realRequestIdleCallback=globalThis.requestIdleCallback;
const realSetInterval=globalThis.setInterval;
const realClearInterval=globalThis.clearInterval;

globalThis.requestIdleCallback=callback=>{idleQueue.push(callback);return idleQueue.length;};
globalThis.setInterval=(fn,ms)=>({fn,ms});
globalThis.clearInterval=()=>{};

function pumpIdle(maxCallbacks){
  let ran=0;
  while(ran<maxCallbacks&&idleQueue.length){
    const callback=idleQueue.shift();
    callback({didTimeout:false,timeRemaining:()=>4.5});
    ran++;
  }
  return ran;
}

try{
  const streamer=createForestChunkStreamer({
    THREE,
    forestGroup,
    getWorldOffset:()=>offset,
    terrainHeight:(x,z)=>1.4*Math.sin(x*.0017)+1.1*Math.cos(z*.0013),
    nearestRoute:(x,z)=>({d:Math.abs(x),i:0,angle:0,cum:z,px:0,pz:z}),
    isWaterAt:()=>false,
    blocksForest:(x,z)=>blockerIndex.blocksForest(x,z)
  });

  streamer.setAssets({trees:[{name:'proxy-mid',parts:[{geometry:{},material:{}}]}]});

  // Start from a fully prepared visible ring so this QA measures sustained
  // high-speed replenishment rather than startup readiness.
  let startupCallbacks=0;
  while(startupCallbacks<5000){
    const stats=streamer.stats();
    if(stats.queuedChunks===0&&stats.activeChunks>=stats.visibleWantedChunks)break;
    const ran=pumpIdle(100);
    startupCallbacks+=ran;
    if(!ran)break;
  }
  const startup=streamer.stats();
  if(startup.queuedChunks!==0||startup.activeChunks<startup.visibleWantedChunks){
    throw new Error(
      `Issue #12 R2 could not prime initial forest: active=${startup.activeChunks}, `+
      `visible=${startup.visibleWantedChunks}, queued=${startup.queuedChunks}`
    );
  }

  const speedKmh=330;
  const speedMps=speedKmh/3.6;
  const stepMeters=120;
  const secondsPerStep=stepMeters/speedMps;
  // Only ~54 idle callbacks/s are granted even though the reported human FAIL
  // ran near 142 FPS. This intentionally leaves substantial headroom for the
  // rest of World Drive and prevents a QA that assumes every frame is idle.
  const idleCallbacksPerSecond=54;
  const callbacksPerStep=Math.floor(secondsPerStep*idleCallbacksPerSecond);
  const targetDistance=10000;
  const steps=Math.ceil(targetDistance/stepMeters);

  let maxVisibleDeficit=0;
  let minReadyReserve=Infinity;
  let maxQueued=0;
  let totalPrefetchHits=0;
  const samples=[];

  for(let step=1;step<=steps;step++){
    offset={x:0,z:Math.min(targetDistance,step*stepMeters)};
    streamer.requestUpdate(true);
    pumpIdle(callbacksPerStep);
    const stats=streamer.stats();
    const deficit=Math.max(0,stats.visibleWantedChunks-stats.activeChunks);
    maxVisibleDeficit=Math.max(maxVisibleDeficit,deficit);
    maxQueued=Math.max(maxQueued,stats.queuedChunks);
    totalPrefetchHits=stats.prefetchHits;
    if(step>=5)minReadyReserve=Math.min(minReadyReserve,stats.prefetchedReadyChunks);
    if(step%10===0||step===steps){
      samples.push({
        distance:offset.z,
        active:stats.activeChunks,
        visibleWanted:stats.visibleWantedChunks,
        deficit,
        queued:stats.queuedChunks,
        prefetchedReady:stats.prefetchedReadyChunks,
        prefetchHits:stats.prefetchHits,
        maxCandidates:stats.maxCandidates,
        maxSliceMs:Number(stats.maxSliceMs.toFixed(3))
      });
    }
  }

  const final=streamer.stats();
  if(maxVisibleDeficit>1){
    throw new Error(`Issue #12 R2 forest fell behind at ${speedKmh} km/h: max visible deficit=${maxVisibleDeficit}`);
  }
  if(!Number.isFinite(minReadyReserve)||minReadyReserve<2){
    throw new Error(`Issue #12 R2 rolling reserve collapsed at ${speedKmh} km/h: min ready=${minReadyReserve}`);
  }
  if(totalPrefetchHits<6){
    throw new Error(`Issue #12 R2 did not reuse enough prefetched chunks: hits=${totalPrefetchHits}`);
  }
  if(final.maxSliceMs>8){
    throw new Error(`Issue #12 R2 regressed forest frame pacing: max slice=${final.maxSliceMs.toFixed(2)} ms`);
  }
  if(final.maxCandidates<=20){
    throw new Error(`Issue #12 R2 still has the historical 12/20 candidate ceiling: max=${final.maxCandidates}`);
  }
  if(FOREST.forestSliceBudgetMs>.95||FOREST.forestCatchupSliceBudgetMs>1.55){
    throw new Error('Issue #12 R2 must not buy throughput by increasing certified time budgets');
  }

  console.log('PASS Issue #12 R2 F1-equivalent forest throughput QA');
  console.log({
    speedKmh,
    targetDistance,
    callbacksPerStep,
    idleCallbacksPerSecond,
    startupCallbacks,
    maxVisibleDeficit,
    minReadyReserve,
    maxQueued,
    totalPrefetchHits,
    maxCandidates:final.maxCandidates,
    maxSliceMs:Number(final.maxSliceMs.toFixed(3)),
    samples
  });
}finally{
  if(realRequestIdleCallback===undefined)delete globalThis.requestIdleCallback;
  else globalThis.requestIdleCallback=realRequestIdleCallback;
  globalThis.setInterval=realSetInterval;
  globalThis.clearInterval=realClearInterval;
}
