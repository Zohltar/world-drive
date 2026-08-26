import * as THREE from 'three';
import {buildForestProxyAssets} from './forest-proxy-assets.js';
import {AUTHORED_WATER_STYLE} from './forest-authored-lite.js';

let cached=null;
let loading=null;

function cloneMaterial(material){
  if(Array.isArray(material))return material.map(cloneMaterial);
  if(!material)return new THREE.MeshStandardMaterial({color:0x315b2d,roughness:.9});
  const copy=material.clone();
  copy.dithering=true;

  // Forest foliage must never use expensive alpha blending. The optimized fir
  // still carries BLEND metadata in its source GLB, but World Drive converts it
  // to a depth-writing alpha cutout: visually close, much cheaper in dense woods.
  if(copy.transparent&&copy.map){
    copy.transparent=false;
    copy.opacity=1;
    copy.depthWrite=true;
    copy.alphaTest=Math.max(copy.alphaTest||0,.30);
    copy.side=THREE.DoubleSide;
  }else if(copy.transparent){
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

async function tryLoadTree(url,name){
  try{
    return await loadTree(url,name);
  }catch(error){
    console.warn(`Forest asset ${name} unavailable`,error);
    return null;
  }
}

export function loadForestWaterAssets(){
  if(cached)return Promise.resolve(cached);
  if(loading)return loading;

  loading=(async()=>{
    const simpleTrees=buildForestProxyAssets(THREE);
    const simpleMid=simpleTrees.find(tree=>tree.name==='proxy-mid')||simpleTrees[0]||null;
    const simpleFar=simpleTrees.find(tree=>tree.name==='proxy-far')||simpleMid;

    // P9.7 optimized near tree. The supplied fir source was 1612 triangles,
    // 42 meshes and 4.8 MB. The World Drive optimized derivative keeps its
    // textured silhouette but is reduced to one mesh, 592 triangles and a
    // single 512px foliage texture (~0.4 MB). Load only this near asset instead
    // of parsing all previous HD GLBs at startup.
    const fir=await tryLoadTree(
      new URL('./assets/forest/forest_fir_optimized.glb',import.meta.url).href,
      'fir-optimized'
    );

    // Compatibility fallback for a local checkout that has not copied the new
    // binary asset yet. This avoids a blank forest while making the missing file
    // obvious in the console.
    const legacy=fir?null:await tryLoadTree(
      new URL('./assets/forest/forest_pine_ps1.glb',import.meta.url).href,
      'ps1'
    );
    const activeNear=fir||legacy;

    if(activeNear&&simpleMid){
      const near={...activeNear,name:'proxy-mid',sourceName:activeNear.name,hd:true};
      const distant={...simpleMid,name:'proxy-far',sourceName:simpleMid.name,hd:false};
      const trees=[near,distant];

      cached={
        pine:activeNear,
        trees,
        hdTrees:[activeNear],
        simpleTrees,
        forestProfile:fir?'optimized-fir-near':'legacy-ps1-fallback',
        waterStyle:AUTHORED_WATER_STYLE,
        source:fir
          ?'P9.7 optimized 592-triangle fir near + 68-triangle proxy distant'
          :'P9.7 legacy PS1 fallback + 68-triangle proxy distant'
      };
      console.info(
        `Forest assets ready: ${fir?'optimized fir':'legacy fallback'} · `+
        `near ${activeNear.triangles} triangles / ${activeNear.parts.length} mesh · `+
        `distant ${simpleMid.triangles} triangles · `+
        `${simpleFar?.triangles||0} triangle ultra-far cached`
      );
      return cached;
    }

    console.warn('Near forest GLB unavailable; reverting to lightweight proxy forest.');
    cached={
      pine:simpleMid,
      trees:simpleTrees,
      hdTrees:[],
      simpleTrees,
      forestProfile:'simple-fallback',
      waterStyle:AUTHORED_WATER_STYLE,
      source:'P9.7 lightweight fallback because near forest GLB is unavailable'
    };
    return cached;
  })();

  return loading;
}

export function getForestWaterAssets(){
  return cached;
}
