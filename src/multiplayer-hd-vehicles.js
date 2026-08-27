import {createRemoteAuthoredLighting} from './multiplayer-authored-lighting-m251.js';

// World Drive multiplayer HD vehicle cache.
// Remote peers reuse cached authored GLB templates, with peer-local presentation
// resources layered on each clone. M2.5 adds peer-local authored lamp control.

const REMOTE_HD_SPECS=Object.freeze({
  wrx:Object.freeze({url:new URL('./assets/subaru_wrx_vb.glb',import.meta.url).href,targetLength:4.60*1.20}),
  id4:Object.freeze({url:new URL('./assets/id4_2021_detailed.glb',import.meta.url).href,targetLength:4.58}),
  civic:Object.freeze({url:new URL('./assets/2006_honda_civic_si.glb',import.meta.url).href,targetLength:4.55}),
  sonata:Object.freeze({url:new URL('./assets/2006_hyundai_sonata.glb',import.meta.url).href,targetLength:4.85}),
  i3_2017:Object.freeze({url:new URL('./assets/2017_bmw_i3.glb',import.meta.url).href,targetLength:4.01*1.20}),
  f1_2010:Object.freeze({url:new URL('./assets/f1_2010_ferrari.glb',import.meta.url).href,targetLength:5.00}),
  countach_80:Object.freeze({url:new URL('./assets/countach_80.glb',import.meta.url).href,targetLength:4.14*1.15,targetWidth:2.08*1.15})
});

const templatePromises=new Map();
const templates=new Map();
const failures=new Map();
let loaderPromise=null;
let clonePromise=null;

const perf={
  requests:0,
  templateLoads:0,
  templateHits:0,
  instanceClones:0,
  failures:0,
  activeInstances:0,
  materialProfilesApplied:0,
  materialProfileMaterials:0,
  authoredLightingInstances:0,
  authoredLightingUpdates:0
};

function ensureEmissive(THREE,material,color,intensity,{useMap=false}={}){
  if(!material||!('emissive' in material))return;
  if(!material.emissive)material.emissive=new THREE.Color(color);
  else material.emissive.setHex(color);
  if(useMap&&material.map&&'emissiveMap' in material)material.emissiveMap=material.map;
  if('emissiveIntensity' in material)material.emissiveIntensity=intensity;
}

function semanticPath(object,root){
  const names=[];
  let cursor=object;
  while(cursor&&cursor!==root?.parent){
    if(cursor.name)names.push(String(cursor.name).toLowerCase());
    cursor=cursor.parent;
  }
  return names.join(' ');
}

function tuneWrxMaterial(THREE,material,name){
  if(name.includes('fh_paint')){
    material.color?.multiplyScalar?.(1.08);
    ensureEmissive(THREE,material,0x4a7dff,.26,{useMap:true});
    if('roughness' in material)material.roughness=Math.max(.20,Math.min(.45,Number(material.roughness)||.34));
    if('metalness' in material)material.metalness=Math.max(.12,Number(material.metalness)||.18);
    if('envMapIntensity' in material)material.envMapIntensity=1.9;
  }else if(name.includes('fh_blacktrim')){
    material.color?.multiplyScalar?.(1.12);
    ensureEmissive(THREE,material,0x15191f,.18);
    if('envMapIntensity' in material)material.envMapIntensity=1.55;
  }else if(name.includes('fh_rim')){
    material.color?.multiplyScalar?.(1.10);
    ensureEmissive(THREE,material,0x22262c,.16);
    if('envMapIntensity' in material)material.envMapIntensity=1.8;
  }else if(name.includes('fh_glass')){
    if('envMapIntensity' in material)material.envMapIntensity=1.35;
    if('opacity' in material&&material.opacity<1)material.opacity=Math.min(1,material.opacity*1.08);
    material.transparent=material.opacity<.999;
  }else{
    material.color?.multiplyScalar?.(1.06);
    if('envMapIntensity' in material)material.envMapIntensity=Math.max(1.15,Number(material.envMapIntensity)||1.15);
  }
}

function tuneCivicMaterial(THREE,material,name){
  if(name.includes('capaint')){
    material.color?.multiplyScalar?.(1.08);
    ensureEmissive(THREE,material,0x396dff,.22,{useMap:true});
    if('roughness' in material)material.roughness=Math.max(.18,Math.min(.42,Number(material.roughness)||.28));
    if('metalness' in material)material.metalness=Math.max(.10,Number(material.metalness)||.10);
    if('envMapIntensity' in material)material.envMapIntensity=1.85;
  }else if(name.includes('chassis')||name.includes('plas_2')||name.includes('plas')){
    material.color?.multiplyScalar?.(1.10);
    ensureEmissive(THREE,material,0x14181d,.12);
    if('envMapIntensity' in material)material.envMapIntensity=1.45;
  }else if(name.includes('material')||name.includes('disk')||name.includes('calipers')||name.includes('badges')){
    material.color?.multiplyScalar?.(1.08);
    ensureEmissive(THREE,material,0x24282e,.10);
    if('envMapIntensity' in material)material.envMapIntensity=1.65;
  }else if(name.includes('glass')||name.includes('light')){
    if('envMapIntensity' in material)material.envMapIntensity=1.35;
    ensureEmissive(THREE,material,0x0b0f14,.05);
  }else if(name.includes('internal')){
    material.color?.multiplyScalar?.(1.06);
    ensureEmissive(THREE,material,0x101214,.06);
    if('envMapIntensity' in material)material.envMapIntensity=1.15;
  }else{
    material.color?.multiplyScalar?.(1.05);
    if('envMapIntensity' in material)material.envMapIntensity=Math.max(1.15,Number(material.envMapIntensity)||1.15);
  }
}

function tuneSonataMaterial(THREE,material,name){
  if(name.includes('glass')||name.includes('window')||name.includes('windshield')){
    material.color?.multiplyScalar?.(1.10);
    ensureEmissive(THREE,material,0x101418,.08);
    if('envMapIntensity' in material)material.envMapIntensity=Math.max(1.45,Number(material.envMapIntensity)||1.45);
    if('opacity' in material&&material.opacity<1)material.opacity=Math.min(1,material.opacity*1.08);
    material.transparent=material.opacity<.999;
  }else if(name.includes('wheel')||name.includes('tire')||name.includes('rim')||name.includes('disk')||name.includes('caliper')){
    material.color?.multiplyScalar?.(1.10);
    ensureEmissive(THREE,material,0x2b3138,.10,{useMap:true});
    if('envMapIntensity' in material)material.envMapIntensity=Math.max(1.55,Number(material.envMapIntensity)||1.55);
  }else if(name.includes('interior')||name.includes('seat')||name.includes('dashboard')||name.includes('steer')){
    material.color?.multiplyScalar?.(1.08);
    ensureEmissive(THREE,material,0x1a1d20,.09,{useMap:true});
    if('envMapIntensity' in material)material.envMapIntensity=Math.max(1.20,Number(material.envMapIntensity)||1.20);
  }else{
    material.color?.multiplyScalar?.(1.08);
    ensureEmissive(THREE,material,0xf1ece2,.20,{useMap:true});
    if('roughness' in material)material.roughness=Math.max(.18,Math.min(.52,Number(material.roughness)||.34));
    if('metalness' in material)material.metalness=Math.max(.08,Number(material.metalness)||.08);
    if('envMapIntensity' in material)material.envMapIntensity=Math.max(1.75,Number(material.envMapIntensity)||1.75);
  }
}

function tuneI3Material(material,name){
  if(name.includes('pintura')){
    if('roughness' in material)material.roughness=.27;
    if('metalness' in material)material.metalness=.10;
    if('envMapIntensity' in material)material.envMapIntensity=1.65;
  }else if(name.includes('metal_preto')||name.includes('plastico')){
    if('roughness' in material)material.roughness=Math.max(.28,Number(material.roughness)||.34);
    if('envMapIntensity' in material)material.envMapIntensity=1.25;
  }else if(name.includes('cromado')||name.includes('roda')){
    if('metalness' in material)material.metalness=Math.max(.45,Number(material.metalness)||0);
    if('roughness' in material)material.roughness=.25;
    if('envMapIntensity' in material)material.envMapIntensity=1.85;
  }else if(name.includes('vidros')&&!name.includes('vermelhos')){
    material.transparent=true;
    material.depthWrite=false;
    material.color?.multiplyScalar?.(.72);
    material.opacity=Math.max(.55,Math.min(.82,Number(material.opacity)||.65));
    if('roughness' in material)material.roughness=.10;
    if('metalness' in material)material.metalness=.05;
    if('envMapIntensity' in material)material.envMapIntensity=1.65;
  }else if('envMapIntensity' in material){
    material.envMapIntensity=Math.max(1.15,Number(material.envMapIntensity)||1.15);
  }
}

function tuneCountachMaterial(THREE,material,name){
  if(name.includes('windows')){
    material.transparent=true;
    material.opacity=.18;
    material.depthWrite=false;
    material.side=THREE.DoubleSide;
    material.color?.setHex?.(0x2b3642);
  }
}

function tuneTemplate(THREE,root,vehicleId){
  const tuned=new WeakSet();
  let materialCount=0;
  root?.traverse?.(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    obj.castShadow=true;obj.receiveShadow=true;
    const semantic=semanticPath(obj,root);
    const materials=Array.isArray(obj.material)?obj.material:[obj.material];
    for(const material of materials){
      if(!material||tuned.has(material))continue;
      tuned.add(material);materialCount++;material.dithering=true;if(material.transparent)material.depthWrite=false;
      const materialName=String(material.name||'').toLowerCase();
      const contextualName=`${materialName} ${semantic}`;
      if(vehicleId==='wrx')tuneWrxMaterial(THREE,material,materialName);
      else if(vehicleId==='civic')tuneCivicMaterial(THREE,material,materialName);
      else if(vehicleId==='sonata')tuneSonataMaterial(THREE,material,contextualName);
      else if(vehicleId==='i3_2017')tuneI3Material(material,materialName);
      else if(vehicleId==='countach_80')tuneCountachMaterial(THREE,material,materialName);
      material.needsUpdate=true;
    }
  });
  perf.materialProfilesApplied++;
  perf.materialProfileMaterials+=materialCount;
}

function normalizeTemplate(THREE,root,spec){
  root.rotation?.set?.(0,0,0);root.updateMatrixWorld?.(true);
  const initialBox=new THREE.Box3().setFromObject(root),initialSize=new THREE.Vector3();initialBox.getSize(initialSize);
  let scale=spec.targetLength/Math.max(.001,initialSize.z);
  if(Number.isFinite(spec.targetWidth))scale=Math.min(scale,spec.targetWidth/Math.max(.001,initialSize.x));
  root.scale.multiplyScalar(scale);root.updateMatrixWorld?.(true);
  const box=new THREE.Box3().setFromObject(root),center=new THREE.Vector3();box.getCenter(center);
  root.position.x-=center.x;root.position.z-=center.z;root.position.y-=box.min.y;root.updateMatrixWorld?.(true);
}

async function loaderFactory(){
  if(!loaderPromise)loaderPromise=import('three/addons/loaders/GLTFLoader.js').then(m=>m.GLTFLoader);
  return loaderPromise;
}
async function cloneFactory(){
  if(!clonePromise)clonePromise=import('three/addons/utils/SkeletonUtils.js').then(m=>m.clone||null).catch(()=>null);
  return clonePromise;
}

async function loadTemplate(THREE,vehicleId){
  const spec=REMOTE_HD_SPECS[vehicleId];
  if(!spec)return null;
  const cached=templates.get(vehicleId);
  if(cached){perf.templateHits++;return cached;}
  if(failures.has(vehicleId))return null;
  if(templatePromises.has(vehicleId))return templatePromises.get(vehicleId);
  perf.templateLoads++;
  const promise=(async()=>{
    try{
      const GLTFLoader=await loaderFactory();
      if(typeof GLTFLoader!=='function')throw new Error('GLTFLoader unavailable');
      const gltf=await new GLTFLoader().loadAsync(spec.url);
      const root=gltf.scene||gltf.scenes?.[0]||null;
      if(!root)throw new Error(`${vehicleId}: GLB without scene`);
      root.name=`remote-hd-template-${vehicleId}`;
      normalizeTemplate(THREE,root,spec);tuneTemplate(THREE,root,vehicleId);root.visible=false;
      templates.set(vehicleId,root);failures.delete(vehicleId);return root;
    }catch(error){
      failures.set(vehicleId,error);perf.failures++;console.warn(`Remote HD ${vehicleId} unavailable; procedural fallback kept.`,error);return null;
    }finally{templatePromises.delete(vehicleId);}
  })();
  templatePromises.set(vehicleId,promise);return promise;
}

export function supportsRemoteHdVehicle(vehicleId){return !!REMOTE_HD_SPECS[vehicleId];}

export async function createRemoteHdVehicle(THREE,vehicleId){
  perf.requests++;
  const template=await loadTemplate(THREE,vehicleId);
  if(!template)return null;
  const skeletonClone=await cloneFactory();
  const root=typeof skeletonClone==='function'?skeletonClone(template):template.clone(true);
  root.name=`remote-hd-${vehicleId}`;root.visible=true;root.updateMatrixWorld?.(true);
  perf.instanceClones++;perf.activeInstances++;

  const lighting=createRemoteAuthoredLighting(THREE,vehicleId,root);
  if(lighting)perf.authoredLightingInstances++;
  let disposed=false;
  return {
    root,
    lightingMode:lighting?.mode||'none',
    setLighting(state){
      if(disposed)return;
      lighting?.setState(state);
      if(lighting)perf.authoredLightingUpdates++;
    },
    lightingDiagnostics:()=>lighting?.diagnostics?.()||null,
    dispose(){
      if(disposed)return;disposed=true;
      lighting?.dispose?.();
      if(lighting)perf.authoredLightingInstances=Math.max(0,perf.authoredLightingInstances-1);
      perf.activeInstances=Math.max(0,perf.activeInstances-1);
      root.removeFromParent?.();root.clear?.();
    }
  };
}

export function remoteHdDiagnostics(){
  return {
    enabled:true,
    mode:'multiplayer-hd-lazy-cache-local-material-parity',
    supported:Object.keys(REMOTE_HD_SPECS),loaded:[...templates.keys()],loading:[...templatePromises.keys()],failed:[...failures.keys()],
    requests:perf.requests,templateLoads:perf.templateLoads,templateHits:perf.templateHits,instanceClones:perf.instanceClones,activeInstances:perf.activeInstances,failures:perf.failures,
    materialProfile:'local-parity-v1',materialProfilesApplied:perf.materialProfilesApplied,materialProfileMaterials:perf.materialProfileMaterials,
    authoredLighting:'authored-glb-lamps-v1',authoredLightingInstances:perf.authoredLightingInstances,authoredLightingUpdates:perf.authoredLightingUpdates
  };
}
try{globalThis.__WORLD_DRIVE_MULTIPLAYER_HD__=remoteHdDiagnostics;}catch{}
