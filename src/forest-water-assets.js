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
  if(copy.transparent&&copy.map){
    copy.transparent=false;
    copy.opacity=1;
    copy.depthWrite=true;
    copy.alphaTest=Math.max(copy.alphaTest||0,.28);
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

export function loadForestWaterAssets(){
  if(cached)return Promise.resolve(cached);
  if(loading)return loading;

  loading=(async()=>{
    // Keep both approved lightweight LODs in memory. P9.3 renders the complete
    // PS1 HD tree only in the near field, then hands distant chunks to the
    // 68-triangle proxy. The 20-triangle proxy stays cached for later tuning.
    const simpleTrees=buildForestProxyAssets(THREE);
    const simpleMid=simpleTrees.find(tree=>tree.name==='proxy-mid')||simpleTrees[0]||null;
    const simpleFar=simpleTrees.find(tree=>tree.name==='proxy-far')||simpleMid;

    const sources=[
      ['authored',new URL('./assets/forest/forest_pine_authored.glb',import.meta.url).href],
      ['ps1',new URL('./assets/forest/forest_pine_ps1.glb',import.meta.url).href],
      ['scene',new URL('./assets/forest/forest_pine_scene.glb',import.meta.url).href]
    ];
    const settled=await Promise.allSettled(sources.map(([name,url])=>loadTree(url,name)));
    const loaded=settled.filter(result=>result.status==='fulfilled').map(result=>result.value);
    const byName=name=>loaded.find(tree=>tree.name===name)||null;

    // The chunk streamer currently owns two render geometries: its `mid` asset
    // serves the near tier and its `far` asset serves distant tiers. Alias the
    // complete PS1 tree to proxy-mid, and the visually approved 68-triangle tree
    // to proxy-far. This keeps P9.1 streaming untouched while making the GPU LOD
    // transition explicit and reversible.
    const ps1=byName('ps1');
    const authored=byName('authored');
    const scene=byName('scene');
    const hdTrees=[ps1,authored,scene].filter(Boolean);
    const activeHd=ps1||hdTrees[0]||null;

    if(activeHd&&simpleMid){
      const hdNear={...activeHd,name:'proxy-mid',sourceName:activeHd.name,hd:true};
      const simpleDistant={...simpleMid,name:'proxy-far',sourceName:simpleMid.name,hd:false};
      const trees=[hdNear,simpleDistant];

      cached={
        pine:activeHd,
        trees,
        hdTrees,
        simpleTrees,
        forestProfile:'hybrid-hd-near',
        waterStyle:AUTHORED_WATER_STYLE,
        source:'P9.3 PS1 HD near + 68-triangle proxy distant'
      };
      console.info(
        `Forest assets ready: hybrid · near ${activeHd.name} ${activeHd.triangles} triangles · `+
        `distant ${simpleMid.triangles} triangles · ${simpleFar?.triangles||0} triangle ultra-far cached`
      );
      return cached;
    }

    if(activeHd){
      cached={
        pine:activeHd,
        trees:[{...activeHd,name:'proxy-mid'},{...activeHd,name:'proxy-far'}],
        hdTrees,
        simpleTrees,
        forestProfile:'hd-fallback',
        waterStyle:AUTHORED_WATER_STYLE,
        source:'P9.3 HD fallback because lightweight proxy is unavailable'
      };
      return cached;
    }

    console.warn('HD forest assets unavailable; reverting to lightweight proxy forest.');
    cached={
      pine:simpleMid,
      trees:simpleTrees,
      hdTrees:[],
      simpleTrees,
      forestProfile:'simple-fallback',
      waterStyle:AUTHORED_WATER_STYLE,
      source:'P9.3 lightweight fallback because HD GLBs are unavailable'
    };
    return cached;
  })();

  return loading;
}

export function getForestWaterAssets(){
  return cached;
}
