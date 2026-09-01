import {createRoadFurnitureSystem} from '../src/road-furniture.js';

class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
}
class Group{
  constructor(){this.children=[];this.parent=null;this.position=new Vec3();this.rotation={y:0};this.name='';}
  add(object){if(object.parent)object.parent.remove(object);this.children.push(object);object.parent=this;}
  remove(object){const i=this.children.indexOf(object);if(i>=0)this.children.splice(i,1);object.parent=null;}
  traverse(fn){fn(this);for(const child of this.children)child.traverse?child.traverse(fn):fn(child);}
}
class Geometry{dispose(){this.disposed=true;}}
class MeshStandardMaterial{
  constructor(options={}){Object.assign(this,options);this.userData={};}
  dispose(){this.disposed=true;}
}
class CanvasTexture{
  constructor(canvas){this.canvas=canvas;}
  dispose(){this.disposed=true;}
}
class Mesh{
  constructor(geometry,material){
    this.geometry=geometry;this.material=material;this.children=[];this.parent=null;
    this.position=new Vec3();this.rotation={y:0};this.userData={};
  }
  traverse(fn){fn(this);}
}
const THREE={
  MeshStandardMaterial,
  CylinderGeometry:class extends Geometry{},
  CircleGeometry:class extends Geometry{},
  PlaneGeometry:class extends Geometry{},
  BoxGeometry:class extends Geometry{},
  CanvasTexture,
  Mesh,Group,
  DoubleSide:2,
  SRGBColorSpace:'srgb'
};

globalThis.document={
  createElement(tag){
    if(tag!=='canvas')throw new Error('unexpected element '+tag);
    return {
      width:0,height:0,
      getContext(){
        return {
          textAlign:'',textBaseline:'',fillStyle:'',strokeStyle:'',font:'',lineWidth:0,
          fillRect(){},beginPath(){},arc(){},fill(){},stroke(){},fillText(){},strokeRect(){}
        };
      }
    };
  }
};
globalThis.requestIdleCallback=callback=>
  setImmediate(()=>callback({didTimeout:false,timeRemaining:()=>8}));

const signGroup=new Group();
const infrastructureGroup=new Group();
let offset={x:0,z:0};
let system=null;
const profile=[
  {x:0,y:2,z:0,cum:0,angle:0},
  {x:0,y:2,z:1000,cum:1000,angle:0}
];

system=createRoadFurnitureSystem({
  THREE,
  signGroup,
  infrastructureGroup,
  routePointAtCum:cum=>({x:0,y:2,z:cum,cum,angle:0}),
  bridgeHeightAtCum:()=>null,
  roadHeightAt:()=>2,
  terrainAbs:()=>0,
  nearestRoute:()=>({d:0,cum:100,angle:0}),
  resetStaticGroupOrigin:()=>{},
  clearGroup:group=>{group.children.length=0;},
  freezeStaticMatrices:()=>{},
  addGeographicRoadSigns:()=>{
    system.addRoadSignAt({x:0,y:2,z:180,angle:0},90,'speed',1);
    system.addRoadSignAt({x:0,y:2,z:240,angle:0},'Rivière Test','river',1);
    system.addRoadSignAt({x:0,y:2,z:320,angle:0},'Ville Test','city',1);
  },
  getState:()=>({
    activeRoadProfile:profile,
    bridgeSpans:[],
    worldOffset:offset,
    activeRoadMeta:{confidence:.9,ref:'R-999',name:'Route Test'},
    absX:0,absZ:100,routeLength:1000
  }),
  setRoadGuideSign:()=>{}
});

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function waitUntil(predicate,timeoutMs=1500){
  const start=Date.now();
  while(!predicate()){
    if(Date.now()-start>timeoutMs)throw new Error('timeout waiting for road-sign build');
    await sleep(2);
  }
}

system.refreshRoadSignsOnly();
if(signGroup.children.length!==0)throw new Error('P9.30 must build off-scene before first atomic commit');
await waitUntil(()=>!system.diagnostics().pending);
if(signGroup.children.length!==4)throw new Error(`expected 4 committed signs, got ${signGroup.children.length}`);
const first=system.diagnostics();
if(first.slice.maxMs>8)throw new Error(`road-sign slice exceeded mock budget envelope: ${first.slice.maxMs} ms`);
if(first.faceCache.misses<4)throw new Error('first build did not populate sign face cache');

const visibleBeforeRefresh=signGroup.children.length;
system.refreshRoadSignsOnly();
if(signGroup.children.length!==visibleBeforeRefresh)throw new Error('refresh created a visible sign gap before atomic swap');
await waitUntil(()=>!system.diagnostics().pending);
const second=system.diagnostics();
if(signGroup.children.length!==4)throw new Error('second atomic commit lost signs');
if(second.faceCache.hits<4)throw new Error('second refresh did not reuse cached sign faces');
if(second.commit.maxMs>8)throw new Error(`road-sign commit exceeded mock envelope: ${second.commit.maxMs} ms`);

console.log('PASS P9.30 incremental road-sign runtime QA');
console.log({
  signs:signGroup.children.length,
  maxSliceMs:second.slice.maxMs,
  maxCommitMs:second.commit.maxMs,
  cacheHits:second.faceCache.hits,
  cacheMisses:second.faceCache.misses
});
process.exit(0);
