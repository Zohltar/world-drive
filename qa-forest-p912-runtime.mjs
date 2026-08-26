import {createForestChunkStreamer} from './src/forest-chunk-streamer.js';

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
  array[i+1]=2*Math.sin(ix*.03)+1.5*Math.cos(iz*.025);
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
  terrainHeight:(x,z)=>2*Math.sin((x+2800)/12.5*.03)+1.5*Math.cos((z+2800)/12.5*.025),
  nearestRoute:(x,z)=>({d:Math.abs(z),i:0}),
  isWaterAt:()=>false,
  blocksForest:()=>false
});

streamer.setAssets({trees:[{name:'proxy-mid',parts:[{geometry:{},material:{}}]}]});
await streamer.whenInitialReady();
let stats=streamer.stats();
if(stats.activeChunks<10)throw new Error('initial forest ring did not become ready');

for(let x=120;x<=2400;x+=120){
  offset={x,z:0};
  streamer.requestUpdate(false);
  await new Promise(resolve=>setImmediate(resolve));
}
await new Promise(resolve=>setTimeout(resolve,30));
stats=streamer.stats();
if(stats.maxSliceMs>12)throw new Error(`forest idle slice exceeded 12 ms in mock: ${stats.maxSliceMs.toFixed(2)} ms`);

const activeBefore=stats.activeChunks;
const replacements=streamer.refreshVisibleHeights();
const activeImmediate=streamer.stats().activeChunks;
if(activeImmediate!==activeBefore)throw new Error('terrain refresh removed visible forest chunks');

await new Promise(resolve=>setTimeout(resolve,40));
const after=streamer.stats();
if(after.activeChunks<activeBefore-2)throw new Error('double-buffer replacement created a visible forest gap');

console.log('Foret P9.12 runtime mock passed');
console.log({
  activeBeforeRefresh:activeBefore,
  requestedReplacements:replacements,
  activeAfterRefresh:after.activeChunks,
  matrixUploads:after.matrixUploads,
  densityCountUpdates:after.densityCountUpdates,
  maxSliceMs:Number(after.maxSliceMs.toFixed(3))
});
process.exit(0);
