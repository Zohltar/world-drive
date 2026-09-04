import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createForestChunkStreamer} from '../src/forest-chunk-streamer.js';
import {ensureWorldDriveDiagnostics} from '../src/diagnostics.js';

const scenerySource=fs.readFileSync(new URL('../src/scenery/scenery-renderer-p9.js',import.meta.url),'utf8');
const readinessSource=fs.readFileSync(new URL('../src/scenery/scenery-renderer-p933.js',import.meta.url),'utf8');
const lifecycleSource=fs.readFileSync(new URL('../src/routing/route-lifecycle.js',import.meta.url),'utf8');

assert.match(scenerySource,/let forestRouteCacheSuspended=false;/,'route-cache suspension state missing');
assert.match(scenerySource,/if\(!routeAvailable\)suspendForestRouteCache\(\);/,'route clear does not suspend retained forest');
assert.match(scenerySource,/function suspendForestRouteCache\(\)[\s\S]*forestStreamer\.setAssets\(null\);/,'suspension does not stop forest streamer assets/polling');
assert.match(scenerySource,/function switchForestRouteCache\(routeKey\)\{\s*return forestStreamer\.switchRouteCache\(routeKey\);\s*\}/s,'R6 dense-forest route-cache ownership contract changed');
assert.match(scenerySource,/function resumeForestRouteCache\(\)[\s\S]*forestRouteCacheSuspended=false;[\s\S]*forestStreamer\.setAssets\(forestAssets\);/,'suspended forest cannot resume after authoritative switch');
assert.match(readinessSource,/function switchForestRouteCache\(routeKey\)[\s\S]*base\.switchForestRouteCache\?\.\(routeKey\);[\s\S]*base\.resumeForestRouteCache\?\.\(\);/,'P9.35 facade does not resume frozen cache after authoritative route switch');
assert.match(scenerySource,/if\(forestAssetsActivated&&!activatedNow&&!forestRouteCacheSuspended\)/,'scenery rebuild can mutate a suspended route cache');
const clearRouteAt=lifecycleSource.indexOf('route.length=0;');
const clearSceneryAt=lifecycleSource.indexOf('sceneryRenderer.clear();');
assert.ok(clearRouteAt>=0&&clearSceneryAt>clearRouteAt,'route lifecycle no longer clears route geometry before scenery suspension boundary');

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
    this.geometry=geometry;this.material=material;this.count=count;this.parent=null;this.userData={};
    this.position=new Vec3();this.matrixAutoUpdate=true;
    this.instanceMatrix={array:new Float32Array(count*16),setUsage(){}};
  }
  computeBoundingSphere(){}
  updateMatrix(){}
  dispose(){this.disposed=true;}
}
const THREE={Vector3:Vec3,Group,InstancedMesh,StaticDrawUsage:35044};

const realSetInterval=globalThis.setInterval;
const realClearInterval=globalThis.clearInterval;
const realRequestIdleCallback=globalThis.requestIdleCallback;
const intervalHandles=new Set();
globalThis.setInterval=(fn,ms)=>{const handle={fn,ms};intervalHandles.add(handle);return handle;};
globalThis.clearInterval=handle=>intervalHandles.delete(handle);
globalThis.requestIdleCallback=callback=>setImmediate(()=>callback({didTimeout:false,timeRemaining:()=>8}));

try{
  ensureWorldDriveDiagnostics().framePacing.snapshot=()=>({});
  const forestGroup=new Group();
  let routeMode='A';
  let terrainY=0;
  const streamer=createForestChunkStreamer({
    THREE,
    forestGroup,
    getWorldOffset:()=>({x:0,z:0}),
    terrainHeight:()=>terrainY,
    nearestRoute:(x,z)=>routeMode==='A'
      ?{d:Math.abs(x),i:0,angle:0,cum:z,px:0,pz:z}
      :{d:Math.abs(z),i:0,angle:Math.PI/2,cum:x,px:x,pz:0},
    isWaterAt:()=>false,
    blocksForest:()=>false
  });
  const assets={trees:[{name:'proxy-mid',parts:[{geometry:{},material:{}}]}]};

  streamer.setAssets(assets);
  await streamer.whenInitialReady();
  streamer.switchRouteCache('route-A');
  const slotA=forestGroup.children.find(child=>child.name.includes('route-A'));
  assert.ok(slotA,'route A slot missing');
  const chunkA=slotA.children.find(child=>/^forest-chunk-/.test(child.name));
  assert.ok(chunkA,'route A chunk missing');
  const meshA=chunkA.children[0];
  const beforeMatrices=Array.from(meshA.instanceMatrix.array);
  const beforeReplaced=streamer.stats().chunksReplaced;
  assert.equal(intervalHandles.size,1,'A should poll before suspension');

  // This is the exact speculative B window: A remains retained on screen while
  // route/terrain authority has already changed. With assets suspended, neither
  // polling nor a scenery height-refresh request may mutate A using B geometry.
  streamer.setAssets(null);
  assert.equal(intervalHandles.size,0,'suspension left A polling active');
  routeMode='B';
  terrainY=90;
  streamer.refreshVisibleHeights();
  streamer.requestUpdate(true);
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));

  assert.strictEqual(slotA.children.find(child=>child.name===chunkA.name),chunkA,'suspended A chunk object was replaced during speculative B');
  assert.strictEqual(chunkA.children[0],meshA,'suspended A mesh was replaced during speculative B');
  assert.deepEqual(Array.from(meshA.instanceMatrix.array),beforeMatrices,'suspended A matrices were mutated using speculative B terrain/route');
  assert.equal(streamer.stats().chunksReplaced,beforeReplaced,'suspended A reported a chunk replacement during speculative B');

  console.log('FOREST ROUTE CACHE SUSPENSION R7 QA: PASS',{
    pollingStopped:true,
    retainedAObjectIdentity:true,
    retainedAMatricesUnchanged:true,
    speculativeRoute:'B'
  });
}finally{
  globalThis.setInterval=realSetInterval;
  globalThis.clearInterval=realClearInterval;
  if(realRequestIdleCallback===undefined)delete globalThis.requestIdleCallback;
  else globalThis.requestIdleCallback=realRequestIdleCallback;
}
