import {createForestChunkStreamer} from '../src/forest-chunk-streamer.js';

class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
}
class Group{
  constructor(){this.children=[];this.parent=null;this.position=new Vec3();this.matrixAutoUpdate=true;this.name='';}
  add(object){if(object.parent)object.parent.remove(object);this.children.push(object);object.parent=this;}
  remove(object){const i=this.children.indexOf(object);if(i>=0)this.children.splice(i,1);object.parent=null;}
  updateMatrix(){}
  traverse(fn){fn(this);for(const child of this.children)child.traverse?child.traverse(fn):fn(child);}
}
class InstancedMesh{
  constructor(geometry,material,count){
    this.geometry=geometry;this.material=material;this.count=count;this.parent=null;
    this.userData={};this.position=new Vec3();this.matrixAutoUpdate=true;
    this.instanceMatrix={array:new Float32Array(count*16),setUsage(){}};
  }
  computeBoundingSphere(){this.boundingComputed=true;}
  updateMatrix(){}
  dispose(){this.disposed=true;}
}
const THREE={Vector3:Vec3,Group,InstancedMesh,StaticDrawUsage:35044};

const root=new Group();
const forestGroup=new Group();
root.add(forestGroup);

const gridX=448,gridZ=448,row=gridX+1;
const width=5600,depth=5600,stepX=width/gridX,stepZ=depth/gridZ;
const array=new Float32Array(row*(gridZ+1)*3);
for(let iz=0;iz<=gridZ;iz++)for(let ix=0;ix<=gridX;ix++){
  const i=(ix+row*iz)*3;
  array[i]=-width/2+ix*stepX;
  array[i+1]=1.2*Math.sin(ix*.021)+.9*Math.cos(iz*.017);
  array[i+2]=-depth/2+iz*stepZ;
}
const attr={array,itemSize:3,count:row*(gridZ+1)};
const ground={
  isMesh:true,parent:null,position:new Vec3(),
  geometry:{
    parameters:{width,height:depth,widthSegments:gridX,heightSegments:gridZ},
    getAttribute:name=>name==='position'?attr:null
  },
  getWorldPosition(out){out.set(this.position.x,this.position.y,this.position.z);return out;},
  traverse(fn){fn(this);}
};
root.add(ground);

let offset={x:0,z:0};
globalThis.requestIdleCallback=callback=>
  setImmediate(()=>callback({didTimeout:false,timeRemaining:()=>8}));

const streamer=createForestChunkStreamer({
  THREE,
  forestGroup,
  getWorldOffset:()=>offset,
  terrainHeight:(x,z)=>1.2*Math.sin((x+2800)/12.5*.021)+.9*Math.cos((z+2800)/12.5*.017),
  nearestRoute:(x,z)=>({d:Math.abs(x),i:0,angle:0,cum:z,px:0,pz:z}),
  isWaterAt:()=>false,
  blocksForest:()=>false
});

streamer.setAssets({trees:[{name:'proxy-mid',parts:[{geometry:{},material:{}}]}]});

const deadline=Date.now()+8000;
let before=null;
while(true){
  const stats=streamer.stats();
  if(stats.prefetchedReadyChunks>=3){before=stats;break;}
  if(Date.now()>deadline){
    throw new Error(`P9.36 did not build rolling reserve: ready=${stats.prefetchedReadyChunks}, queued=${stats.queuedChunks}`);
  }
  await new Promise(resolve=>setImmediate(resolve));
}

if(before.cachedChunks<=before.activeChunks){
  throw new Error(`P9.36 prefetch must stay detached: active=${before.activeChunks}, cached=${before.cachedChunks}`);
}
if(before.p936?.prefetch?.enabled!==true)throw new Error('P9.36 diagnostics do not report rolling prefetch');
if(before.p936.prefetch.leadM<2200)throw new Error(`P9.36 lead too short: ${before.p936.prefetch.leadM}`);
if(before.p936.prefetch.ready<3)throw new Error('P9.36 diagnostics do not expose ready reserve');

const builtBefore=before.chunksBuilt;
const uploadsBefore=before.matrixUploads;
offset={x:0,z:1200};
streamer.requestUpdate(true);
await new Promise(resolve=>setImmediate(resolve));

const after=streamer.stats();
if(after.prefetchHits<1){
  throw new Error(`P9.36 cached reserve was not reused after advance; hits=${after.prefetchHits}`);
}
if(after.p936?.prefetch?.hits<1)throw new Error('P9.36 diagnostics do not expose prefetch hits');
if(after.maxSliceMs>12)throw new Error(`P9.36 regressed forest slice pacing: ${after.maxSliceMs.toFixed(2)} ms`);
if(after.catchupSlices<1)throw new Error('P9.36 idle catch-up path was never exercised');

console.log('PASS P9.36 rolling forest prefetch runtime QA');
console.log({
  activeBefore:before.activeChunks,
  cachedBefore:before.cachedChunks,
  readyBefore:before.prefetchedReadyChunks,
  prefetchHits:after.prefetchHits,
  catchupSlices:after.catchupSlices,
  builtDelta:after.chunksBuilt-builtBefore,
  uploadDelta:after.matrixUploads-uploadsBefore,
  maxSliceMs:Number(after.maxSliceMs.toFixed(3))
});
process.exit(0);
