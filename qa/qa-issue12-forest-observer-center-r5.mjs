import fs from 'node:fs';
import {createForestChunkStreamer} from '../src/forest-chunk-streamer.js';
import {FOREST_STREAMING_POLICY as FOREST} from '../src/forest-streaming-policy.js';
import {ensureWorldDriveDiagnostics} from '../src/diagnostics.js';

function expect(condition,message){if(!condition)throw new Error(message);}
function close(a,b,eps=.001){return Math.abs(Number(a)-Number(b))<=eps;}

// Issue #12 R5 is an ownership correction, not a density/budget/prefetch retune.
expect(FOREST.forestSliceBudgetMs===.95,'Issue #12 R5 changed normal forest slice budget');
expect(FOREST.forestCatchupSliceBudgetMs===1.55,'Issue #12 R5 changed catch-up forest slice budget');
expect(FOREST.candidatesPerBuildSlice===12,'Issue #12 R5 changed normal candidate cap');
expect(FOREST.forestCatchupCandidatesPerSlice===20,'Issue #12 R5 changed catch-up candidate cap');
expect(FOREST.maxDistance===1750,'Issue #12 R5 changed forest visible distance');
expect(FOREST.forestPrefetchLeadM===2500,'Issue #12 R5 changed forest prefetch lead');
expect(FOREST.forestPrefetchRadiusM===1250,'Issue #12 R5 changed forest prefetch radius');

const wrapperSource=fs.readFileSync(new URL('../src/forest-chunk-streamer.js',import.meta.url),'utf8');
const terrainSource=fs.readFileSync(new URL('../src/forest-terrain-sampler.js',import.meta.url),'utf8');
expect(wrapperSource.includes("VEHICLE_HEADLIGHT_RIG_NAME='vehicle-headlights'"),
  'Issue #12 R5 does not bind the forest observer to the canonical local vehicle root');
expect(wrapperSource.includes("observerSource:'vehicle-render-root'"),
  'Issue #12 R5 vehicle observer source missing');
expect(wrapperSource.includes('renderOriginX:render.x'),
  'Issue #12 R5 does not carry the real render origin separately from the observer');
expect(wrapperSource.includes('(render.x-observer.x)'),
  'Issue #12 R5 render-origin compensation missing');
expect(terrainSource.includes('offset.renderOriginX')&&terrainSource.includes('offset.renderOriginZ'),
  'Issue #12 R5 terrain sampler does not preserve render-origin ownership');

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

function worldAxis(object,axis){
  let value=0,node=object;
  while(node){value+=Number(node.position?.[axis])||0;node=node.parent;}
  return value;
}

function firstChunk(root){
  let found=null;
  root.traverse(object=>{
    if(!found&&String(object?.name||'').startsWith('forest-chunk-'))found=object;
  });
  return found;
}

try{
  const diagnostics=ensureWorldDriveDiagnostics();
  diagnostics.framePacing.snapshot=()=>({});

  const scene=new Group();
  const forestGroup=new Group();
  scene.add(forestGroup);

  // Reproduce the canonical local vehicle hierarchy created by vehicle-visuals:
  // scene -> car -> bodyGroup -> vehicle-headlights.
  const car=new Group();
  const bodyGroup=new Group();
  const headlights=new Group();
  headlights.name='vehicle-headlights';
  bodyGroup.add(headlights);car.add(bodyGroup);scene.add(car);

  let worldOffset={x:1000,z:2000};
  car.position.set(0,0,0);

  const streamer=createForestChunkStreamer({
    THREE,
    forestGroup,
    getWorldOffset:()=>worldOffset,
    terrainHeight:()=>0,
    nearestRoute:(x,z)=>({d:Math.abs(x-1000),i:0,angle:0,cum:z,px:1000,pz:z}),
    isWaterAt:()=>false,
    blocksForest:()=>false
  });

  streamer.setAssets({trees:[{name:'proxy-mid',parts:[{geometry:{},material:{}}]}]});
  pump(140);

  let snap=streamer.stats().p941;
  expect(snap.observer?.source==='vehicle-render-root',
    `Issue #12 R5 failed to discover local vehicle root: ${snap.observer?.source}`);
  expect(close(snap.observer.x,1000)&&close(snap.observer.z,2000),
    `Issue #12 R5 initial observer mismatch: ${JSON.stringify(snap.observer)}`);

  // The old bug: worldOffset does not move until the 520 m floating-origin
  // threshold. Moving the car 150 m must nevertheless move forest interest now.
  car.position.z=150;
  const updateA=streamer.requestUpdate(false);
  snap=streamer.stats().p941;
  expect(updateA===true,'Issue #12 R5 still waits for floating-origin recenter before updating forest interest');
  expect(close(snap.observer.z,2150)&&close(snap.observer.renderOriginZ,2000),
    `Issue #12 R5 observer did not follow 150 m vehicle motion: ${JSON.stringify(snap.observer)}`);
  expect(close(snap.observer.renderOriginLagM,150),
    `Issue #12 R5 observer/render lag diagnostic mismatch: ${snap.observer.renderOriginLagM}`);

  car.position.z=300;
  const updateB=streamer.requestUpdate(false);
  expect(updateB===true,'Issue #12 R5 failed second continuous vehicle-centered update');

  // Pick a currently attached chunk before the render-origin shift.
  pump(120);
  const chunk=firstChunk(forestGroup);
  expect(chunk,'Issue #12 R5 harness never produced an attached forest chunk');
  const beforeRenderShift=worldAxis(chunk,'z');

  // Model a normal 300 m floating-origin shift: absolute vehicle position stays
  // 2300 m, render origin moves to 2300 and car render-space z returns to 0.
  worldOffset={x:1000,z:2300};
  car.position.z=0;
  const logicalUpdateAfterRecenter=streamer.requestUpdate(false);
  const afterRenderShift=worldAxis(chunk,'z');
  snap=streamer.stats().p941;

  expect(logicalUpdateAfterRecenter===false,
    'Issue #12 R5 incorrectly treated render-origin recenter as new logical vehicle motion');
  expect(close(snap.observer.z,2300)&&close(snap.observer.renderOriginZ,2300),
    `Issue #12 R5 observer absolute position changed across recenter: ${JSON.stringify(snap.observer)}`);
  expect(close(snap.observer.renderOriginLagM,0),
    `Issue #12 R5 render-origin lag should collapse after recenter: ${snap.observer.renderOriginLagM}`);
  expect(close(afterRenderShift-beforeRenderShift,-300),
    `Issue #12 R5 chunk render placement did not follow worldOffset: ${beforeRenderShift} -> ${afterRenderShift}`);

  console.log('PASS Issue #12 R5 vehicle-centered forest observer regression');
  console.log({
    firstVehicleUpdate:updateA,
    secondVehicleUpdate:updateB,
    logicalUpdateAfterRecenter,
    observer:snap.observer,
    chunkRenderShiftM:Number((afterRenderShift-beforeRenderShift).toFixed(3)),
    queuedChunks:streamer.stats().queuedChunks,
    activeChunks:streamer.stats().activeChunks
  });
}finally{
  if(realRic===undefined)delete globalThis.requestIdleCallback;
  else globalThis.requestIdleCallback=realRic;
  globalThis.setInterval=realSetInterval;
  globalThis.clearInterval=realClearInterval;
}
