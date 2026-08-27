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
  array[i+1]=1.5*Math.sin(ix*.025)+1.2*Math.cos(iz*.021);
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
  terrainHeight:(x,z)=>1.5*Math.sin((x+2800)/12.5*.025)+1.2*Math.cos((z+2800)/12.5*.021),
  // Straight route travelling toward +Z. The P9.34 seed must make this known
  // before any vehicle movement/recenter occurs.
  nearestRoute:(x,z)=>({d:Math.abs(x),i:0,angle:0,cum:z,px:0,pz:z}),
  isWaterAt:()=>false,
  blocksForest:()=>false
});

streamer.setAssets({trees:[{name:'proxy-mid',parts:[{geometry:{},material:{}}]}]});

const deadline=Date.now()+5000;
while(forestGroup.children.filter(child=>/^forest-chunk-/.test(child.name)).length<14){
  if(Date.now()>deadline)throw new Error('P9.35 startup did not reach 14 active chunks in mock');
  await new Promise(resolve=>setImmediate(resolve));
}

const chunkSize=480;
const lateralBand=chunkSize*.15;
let front=0,rear=0,lateral=0,total=0;
for(const child of forestGroup.children){
  const match=/^forest-chunk-(-?\d+):(-?\d+)$/.exec(String(child?.name||''));
  if(!match)continue;
  total++;
  const cz=Number(match[2]);
  const z=(cz+.5)*chunkSize;
  if(z>lateralBand)front++;
  else if(z<-lateralBand)rear++;
  else lateral++;
}

const stats=streamer.stats();
if(front<8)throw new Error(`P9.35 built too few forward chunks at startup: ${front}`);
if(front<rear+2)throw new Error(`P9.35 startup is not forward-majority: front=${front}, rear=${rear}`);
if(stats.maxSliceMs>12)throw new Error(`P9.35 regressed forest slice budget: ${stats.maxSliceMs.toFixed(2)} ms`);
if(stats.p934?.startupDirection?.seeded!==true)throw new Error('P9.35 startup route direction was not seeded');

console.log('PASS P9.35 forward-majority startup runtime QA');
console.log({total,front,rear,lateral,maxSliceMs:Number(stats.maxSliceMs.toFixed(3))});
process.exit(0);
