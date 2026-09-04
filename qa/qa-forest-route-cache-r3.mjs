import assert from 'node:assert/strict';
import {createForestChunkStreamer} from '../src/forest-chunk-streamer.js';
import {FOREST_STREAMING_POLICY as FOREST} from '../src/forest-streaming-policy.js';
import {ensureWorldDriveDiagnostics} from '../src/diagnostics.js';

class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
}
class Group{
  constructor(){
    this.children=[];this.parent=null;this.position=new Vec3();this.matrixAutoUpdate=true;
    this.name='';this.visible=true;this.userData={};
  }
  add(object){if(object.parent)object.parent.remove(object);this.children.push(object);object.parent=this;}
  remove(object){const i=this.children.indexOf(object);if(i>=0)this.children.splice(i,1);object.parent=null;}
  updateMatrix(){}
  traverse(fn){fn(this);for(const child of this.children)child.traverse?child.traverse(fn):fn(child);}
}
let disposeCount=0;
class InstancedMesh{
  constructor(geometry,material,count){
    this.geometry=geometry;this.material=material;this.count=count;this.parent=null;
    this.userData={};this.position=new Vec3();this.matrixAutoUpdate=true;
    this.instanceMatrix={array:new Float32Array(count*16),setUsage(){}};
  }
  computeBoundingSphere(){this.boundingComputed=true;}
  updateMatrix(){}
  dispose(){if(!this.disposed){this.disposed=true;disposeCount++;}}
}
const THREE={Vector3:Vec3,Group,InstancedMesh,StaticDrawUsage:35044};

const realSetInterval=globalThis.setInterval;
const realClearInterval=globalThis.clearInterval;
const realRequestIdleCallback=globalThis.requestIdleCallback;
const intervalHandles=new Set();
let intervalSerial=0;
globalThis.setInterval=(fn,ms)=>{
  const handle={id:++intervalSerial,fn,ms};
  intervalHandles.add(handle);
  return handle;
};
globalThis.clearInterval=handle=>intervalHandles.delete(handle);
globalThis.requestIdleCallback=callback=>setImmediate(()=>callback({didTimeout:false,timeRemaining:()=>8}));

try{
  const diagnostics=ensureWorldDriveDiagnostics();
  diagnostics.framePacing.snapshot=()=>({});

  const forestGroup=new Group();
  let offset={x:0,z:0};
  let terrainY=0;
  const streamer=createForestChunkStreamer({
    THREE,
    forestGroup,
    getWorldOffset:()=>offset,
    terrainHeight:()=>terrainY,
    nearestRoute:(x,z)=>({d:Math.abs(x),i:0,angle:0,cum:z,px:0,pz:z}),
    isWaterAt:()=>false,
    blocksForest:()=>false
  });
  const assets={trees:[{name:'proxy-mid',parts:[{geometry:{},material:{}}]}]};

  streamer.setAssets(assets);
  await streamer.whenInitialReady();
  const initialSwitch=forestGroup.userData.worldDriveSwitchForestRouteCache('route-A');
  assert.equal(initialSwitch.restored,true,'first named route should adopt prepared default forest slot');
  assert.equal(intervalHandles.size,1,'only active A forest should poll');

  const slotA=forestGroup.children.find(child=>child.name.includes('route-A'));
  assert.ok(slotA,'route A forest slot missing');
  const chunkA=slotA.children.find(child=>/^forest-chunk-/.test(child.name));
  assert.ok(chunkA,'route A did not build a real forest chunk');
  const meshA=chunkA.children[0];
  assert.ok(meshA.instanceMatrix.array.length>=16,'route A test chunk has no tree matrix');
  const initialTreeY=meshA.instanceMatrix.array[13];
  assert.ok(Math.abs(initialTreeY+.28)<1e-4,'initial A tree did not use the initial terrain height');
  const aChildCount=slotA.children.length;
  const disposeBeforeB=disposeCount;

  const switchB=streamer.switchRouteCache('route-B');
  assert.equal(switchB.restored,false,'new B route unexpectedly restored an existing slot');
  assert.equal(forestGroup.children.length,2,'route cache must remain bounded to two slots');
  assert.equal(slotA.visible,false,'A slot stayed visible after switching to B');
  assert.equal(intervalHandles.size,1,'inactive A polling was not suspended when B activated');

  await streamer.whenInitialReady();
  const slotB=forestGroup.children.find(child=>child.name.includes('route-B'));
  assert.ok(slotB&&slotB.visible,'route B forest slot missing or hidden');
  const chunkB=slotB.children.find(child=>/^forest-chunk-/.test(child.name));
  assert.ok(chunkB,'route B did not build a real forest chunk');
  const meshB=chunkB.children[0];
  assert.equal(disposeCount,disposeBeforeB,'switching A to B disposed retained A geometry');

  // Human FAIL regression: returning to A after its terrain has been rebuilt must
  // retain the same forest mesh but reproject its instance Y values before reveal.
  terrainY=42;
  const switchA=streamer.switchRouteCache('route-A');
  assert.equal(switchA.restored,true,'return A did not restore the existing forest slot');
  assert.ok(switchA.reprojectedTrees>0,'return A did not reproject retained tree heights');
  assert.equal(slotA.visible,true,'restored A slot is not visible');
  assert.equal(slotB.visible,false,'B slot remained visible after returning A');
  assert.equal(intervalHandles.size,1,'return A left more than one forest polling loop active');
  assert.equal(slotA.children.length,aChildCount,'return A rebuilt/replaced its retained chunk set');
  assert.strictEqual(
    slotA.children.find(child=>child.name===chunkA.name),
    chunkA,
    'return A did not reuse the exact retained chunk object'
  );
  assert.strictEqual(chunkA.children[0],meshA,'return A replaced the retained A mesh');
  assert.equal(meshA.disposed,undefined,'return A reused an already-disposed mesh');
  assert.ok(
    Math.abs(meshA.instanceMatrix.array[13]-(terrainY-.28))<1e-4,
    'restored A tree matrix kept the stale pre-return terrain Y'
  );

  // Route-cache nesting must preserve the original streamer render-origin contract.
  // A shifted parent group must be cancelled exactly once by chunk placement.
  forestGroup.position.set(-640,0,310);
  streamer.requestUpdate(false);
  const match=/^forest-chunk-(-?\d+):(-?\d+)$/.exec(chunkA.name);
  assert.ok(match,'could not decode retained A chunk coordinates');
  const chunkSize=FOREST.cellSize*Math.max(1,FOREST.chunkCells||4);
  const originX=Number(match[1])*chunkSize;
  const originZ=Number(match[2])*chunkSize;
  const localTreeX=meshA.instanceMatrix.array[12];
  const localTreeZ=meshA.instanceMatrix.array[14];
  const renderedTreeX=forestGroup.position.x+slotA.position.x+chunkA.position.x+localTreeX;
  const renderedTreeZ=forestGroup.position.z+slotA.position.z+chunkA.position.z+localTreeZ;
  assert.ok(
    Math.abs(renderedTreeX-(originX+localTreeX-offset.x))<1e-4,
    'nested route cache double-applied parent X render-origin shift'
  );
  assert.ok(
    Math.abs(renderedTreeZ-(originZ+localTreeZ-offset.z))<1e-4,
    'nested route cache double-applied parent Z render-origin shift'
  );
  forestGroup.position.set(0,0,0);
  streamer.requestUpdate(false);

  // A third unique route must recycle only the inactive B slot, keeping memory bounded.
  const switchC=streamer.switchRouteCache('route-C');
  assert.equal(switchC.restored,false,'new C route unexpectedly restored old geometry');
  assert.equal(forestGroup.children.length,2,'third route grew forest cache beyond two slots');
  assert.equal(meshB.disposed,true,'recycling inactive B slot did not dispose B geometry');
  assert.notEqual(meshA.disposed,true,'recycling B incorrectly disposed retained A geometry');
  assert.equal(intervalHandles.size,1,'route C activation left hidden polling active');

  streamer.clearAll();
  assert.equal(intervalHandles.size,0,'hard forest clear left route-cache polling active');
  assert.equal(meshA.disposed,true,'hard forest clear did not dispose retained A geometry');

  console.log('FOREST ROUTE CACHE R4 QA: PASS',{
    restoredAObjectIdentity:true,
    restoredATerrainY:true,
    nestedParentOriginCompensated:true,
    activePollingLoops:intervalHandles.size,
    boundedSlots:forestGroup.children.length,
    hardClearDisposedA:meshA.disposed===true
  });
}finally{
  globalThis.setInterval=realSetInterval;
  globalThis.clearInterval=realClearInterval;
  if(realRequestIdleCallback===undefined)delete globalThis.requestIdleCallback;
  else globalThis.requestIdleCallback=realRequestIdleCallback;
}
