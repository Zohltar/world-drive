import * as THREE from 'three';
import {buildPineTreeAsset} from './pine-tree-runtime.js';
import {AUTHORED_WATER_STYLE} from './forest-authored-lite.js';

let cached=null;
let loading=null;

function cloneMaterial(material){
  if(Array.isArray(material))return material.map(cloneMaterial);
  if(!material)return new THREE.MeshStandardMaterial({color:0x315b2d,roughness:.9});
  const copy=material.clone();
  copy.dithering=true;
  if(copy.transparent){
    copy.side=THREE.DoubleSide;
    copy.depthWrite=true;
    if(!copy.alphaTest)copy.alphaTest=.18;
  }
  return copy;
}

function normalizeTree(root,name){
  root.updateMatrixWorld(true);
  const parts=[];
  const bounds=new THREE.Box3();
  root.traverse(object=>{
    if(!object?.isMesh||!object.geometry)return;
    const geometry=object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.computeBoundingBox();
    if(geometry.boundingBox)bounds.union(geometry.boundingBox);
    parts.push({geometry,material:cloneMaterial(object.material)});
  });
  if(!parts.length||bounds.isEmpty())return null;

  const size=new THREE.Vector3();
  const center=new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);
  const invHeight=1/Math.max(.001,size.y);
  let triangles=0;
  for(const part of parts){
    part.geometry.translate(-center.x,-bounds.min.y,-center.z);
    part.geometry.scale(invHeight,invHeight,invHeight);
    part.geometry.computeBoundingSphere();
    const count=part.geometry.index?.count||part.geometry.getAttribute('position')?.count||0;
    triangles+=Math.floor(count/3);
  }
  return {name,parts,triangles,normalizedHeight:1};
}

async function loadTree(url,name){
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const loader=new GLTFLoader();
  const gltf=await loader.loadAsync(url);
  const root=gltf.scene||gltf.scenes?.[0];
  if(!root)throw new Error(`${name}: GLB sans scène`);
  const tree=normalizeTree(root,name);
  if(!tree)throw new Error(`${name}: aucune géométrie exploitable`);
  return tree;
}

function legacyFallback(){
  const pine=buildPineTreeAsset(THREE);
  return {
    name:'legacy-pine',
    parts:[{geometry:pine.geometry,material:pine.material}],
    triangles:pine.triangles||0,
    normalizedHeight:1
  };
}

export function loadForestWaterAssets(){
  if(cached)return Promise.resolve(cached);
  if(loading)return loading;

  loading=(async()=>{
    const sources=[
      ['authored',new URL('./assets/forest/forest_pine_authored.glb',import.meta.url).href],
      ['ps1',new URL('./assets/forest/forest_pine_ps1.glb',import.meta.url).href],
      ['scene',new URL('./assets/forest/forest_pine_scene.glb',import.meta.url).href]
    ];
    const settled=await Promise.allSettled(sources.map(([name,url])=>loadTree(url,name)));
    const trees=settled.filter(result=>result.status==='fulfilled').map(result=>result.value);
    if(!trees.length){
      console.warn('Forest authored assets unavailable; legacy pine fallback kept.');
      trees.push(legacyFallback());
    }
    cached={
      pine:trees[0],
      trees,
      waterStyle:AUTHORED_WATER_STYLE,
      source:'user supplied forest variants'
    };
    console.info(`Forest assets ready: ${trees.length} variants · ${trees.reduce((sum,t)=>sum+(t.triangles||0),0)} triangles across source meshes`);
    return cached;
  })();

  return loading;
}

export function getForestWaterAssets(){
  return cached;
}
