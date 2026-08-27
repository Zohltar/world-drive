import {getMultiplayerVehicleSpec,listMultiplayerVehicleSpecs} from './multiplayer-vehicle-registry.js';
import {createRemoteAuthoredLighting} from './multiplayer-authored-lighting-v2.js';

// M3 remote HD cache. Asset URLs, target dimensions and lighting contracts all
// come from multiplayer-vehicle-registry.js. Templates stay immutable; runtime
// lamp materials/geometries are peer-local.

const templatePromises=new Map();
const templates=new Map();
const failures=new Map();
let loaderPromise=null;
let clonePromise=null;

const perf={requests:0,templateLoads:0,templateHits:0,instanceClones:0,failures:0,activeInstances:0,materialProfilesApplied:0,materialProfileMaterials:0,lightingInstances:0,lightingReady:0,lightingUpdates:0};

function ensureEmissive(THREE,material,color,intensity,{useMap=false}={}){
  if(!material||!('emissive' in material))return;
  if(!material.emissive)material.emissive=new THREE.Color(color);else material.emissive.setHex(color);
  if(useMap&&material.map&&'emissiveMap' in material)material.emissiveMap=material.map;
  if('emissiveIntensity' in material)material.emissiveIntensity=intensity;
}
function semanticPath(object,root){
  const names=[];let cursor=object;
  while(cursor&&cursor!==root?.parent){if(cursor.name)names.push(String(cursor.name).toLowerCase());cursor=cursor.parent;}
  return names.join(' ');
}
function tuneWrx(THREE,material,name){
  if(name.includes('fh_paint')){material.color?.multiplyScalar?.(1.08);ensureEmissive(THREE,material,0x4a7dff,.26,{useMap:true});if('roughness'in material)material.roughness=Math.max(.20,Math.min(.45,Number(material.roughness)||.34));if('metalness'in material)material.metalness=Math.max(.12,Number(material.metalness)||.18);if('envMapIntensity'in material)material.envMapIntensity=1.9;}
  else if(name.includes('fh_blacktrim')){material.color?.multiplyScalar?.(1.12);ensureEmissive(THREE,material,0x15191f,.18);if('envMapIntensity'in material)material.envMapIntensity=1.55;}
  else if(name.includes('fh_rim')){material.color?.multiplyScalar?.(1.10);ensureEmissive(THREE,material,0x22262c,.16);if('envMapIntensity'in material)material.envMapIntensity=1.8;}
  else if(name.includes('fh_glass')){if('envMapIntensity'in material)material.envMapIntensity=1.35;if('opacity'in material&&material.opacity<1)material.opacity=Math.min(1,material.opacity*1.08);material.transparent=material.opacity<.999;}
  else{material.color?.multiplyScalar?.(1.06);if('envMapIntensity'in material)material.envMapIntensity=Math.max(1.15,Number(material.envMapIntensity)||1.15);}
}
function tuneCivic(THREE,material,name){
  if(name.includes('capaint')){material.color?.multiplyScalar?.(1.08);ensureEmissive(THREE,material,0x396dff,.22,{useMap:true});if('roughness'in material)material.roughness=Math.max(.18,Math.min(.42,Number(material.roughness)||.28));if('metalness'in material)material.metalness=Math.max(.10,Number(material.metalness)||.10);if('envMapIntensity'in material)material.envMapIntensity=1.85;}
  else if(name.includes('chassis')||name.includes('plas')){material.color?.multiplyScalar?.(1.10);ensureEmissive(THREE,material,0x14181d,.12);if('envMapIntensity'in material)material.envMapIntensity=1.45;}
  else if(name.includes('material')||name.includes('disk')||name.includes('calipers')||name.includes('badges')){material.color?.multiplyScalar?.(1.08);ensureEmissive(THREE,material,0x24282e,.10);if('envMapIntensity'in material)material.envMapIntensity=1.65;}
  else if(name.includes('glass')||name.includes('light')){if('envMapIntensity'in material)material.envMapIntensity=1.35;ensureEmissive(THREE,material,0x0b0f14,.05);}
  else{material.color?.multiplyScalar?.(1.05);if('envMapIntensity'in material)material.envMapIntensity=Math.max(1.15,Number(material.envMapIntensity)||1.15);}
}
function tuneSonata(THREE,material,name){
  if(name.includes('glass')||name.includes('window')||name.includes('windshield')){material.color?.multiplyScalar?.(1.10);ensureEmissive(THREE,material,0x101418,.08);if('envMapIntensity'in material)material.envMapIntensity=Math.max(1.45,Number(material.envMapIntensity)||1.45);if('opacity'in material&&material.opacity<1)material.opacity=Math.min(1,material.opacity*1.08);material.transparent=material.opacity<.999;}
  else if(name.includes('wheel')||name.includes('tire')||name.includes('rim')||name.includes('disk')||name.includes('caliper')){material.color?.multiplyScalar?.(1.10);ensureEmissive(THREE,material,0x2b3138,.10,{useMap:true});if('envMapIntensity'in material)material.envMapIntensity=Math.max(1.55,Number(material.envMapIntensity)||1.55);}
  else if(name.includes('interior')||name.includes('seat')||name.includes('dashboard')||name.includes('steer')){material.color?.multiplyScalar?.(1.08);ensureEmissive(THREE,material,0x1a1d20,.09,{useMap:true});if('envMapIntensity'in material)material.envMapIntensity=Math.max(1.20,Number(material.envMapIntensity)||1.20);}
  else{material.color?.multiplyScalar?.(1.08);ensureEmissive(THREE,material,0xf1ece2,.20,{useMap:true});if('roughness'in material)material.roughness=Math.max(.18,Math.min(.52,Number(material.roughness)||.34));if('metalness'in material)material.metalness=Math.max(.08,Number(material.metalness)||.08);if('envMapIntensity'in material)material.envMapIntensity=Math.max(1.75,Number(material.envMapIntensity)||1.75);}
}
function tuneI3(material,name){
  if(name.includes('pintura')){if('roughness'in material)material.roughness=.27;if('metalness'in material)material.metalness=.10;if('envMapIntensity'in material)material.envMapIntensity=1.65;}
  else if(name.includes('metal_preto')||name.includes('plastico')){if('roughness'in material)material.roughness=Math.max(.28,Number(material.roughness)||.34);if('envMapIntensity'in material)material.envMapIntensity=1.25;}
  else if(name.includes('cromado')||name.includes('roda')){if('metalness'in material)material.metalness=Math.max(.45,Number(material.metalness)||0);if('roughness'in material)material.roughness=.25;if('envMapIntensity'in material)material.envMapIntensity=1.85;}
  else if(name.includes('vidros')&&!name.includes('vermelhos')){material.transparent=true;material.depthWrite=false;material.color?.multiplyScalar?.(.72);material.opacity=Math.max(.55,Math.min(.82,Number(material.opacity)||.65));if('roughness'in material)material.roughness=.10;if('metalness'in material)material.metalness=.05;if('envMapIntensity'in material)material.envMapIntensity=1.65;}
  else if('envMapIntensity'in material)material.envMapIntensity=Math.max(1.15,Number(material.envMapIntensity)||1.15);
}
function tuneCountach(THREE,material,name){if(name.includes('windows')){material.transparent=true;material.opacity=.18;material.depthWrite=false;material.side=THREE.DoubleSide;material.color?.setHex?.(0x2b3642);}}
function tuneTemplate(THREE,root,vehicleId){
  const tuned=new WeakSet();let count=0;
  root?.traverse?.(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;obj.castShadow=true;obj.receiveShadow=true;
    const semantic=semanticPath(obj,root);
    for(const material of (Array.isArray(obj.material)?obj.material:[obj.material])){
      if(!material||tuned.has(material))continue;tuned.add(material);count++;material.dithering=true;if(material.transparent)material.depthWrite=false;
      const name=String(material.name||'').toLowerCase(),context=`${name} ${semantic}`;
      if(vehicleId==='wrx')tuneWrx(THREE,material,name);
      else if(vehicleId==='civic')tuneCivic(THREE,material,name);
      else if(vehicleId==='sonata')tuneSonata(THREE,material,context);
      else if(vehicleId==='i3_2017')tuneI3(material,name);
      else if(vehicleId==='countach_80')tuneCountach(THREE,material,name);
      else if('envMapIntensity'in material)material.envMapIntensity=Math.max(1.10,Number(material.envMapIntensity)||1.10);
      material.needsUpdate=true;
    }
  });
  perf.materialProfilesApplied++;perf.materialProfileMaterials+=count;
}
function normalizeTemplate(THREE,root,spec){
  root.rotation?.set?.(0,0,0);root.updateMatrixWorld?.(true);
  const initialBox=new THREE.Box3().setFromObject(root),initialSize=new THREE.Vector3();initialBox.getSize(initialSize);
  let scale=spec.hd.targetLength/Math.max(.001,initialSize.z);
  if(Number.isFinite(spec.hd.targetWidth))scale=Math.min(scale,spec.hd.targetWidth/Math.max(.001,initialSize.x));
  root.scale.multiplyScalar(scale);root.updateMatrixWorld?.(true);
  const box=new THREE.Box3().setFromObject(root),center=new THREE.Vector3();box.getCenter(center);
  root.position.x-=center.x;root.position.z-=center.z;root.position.y-=box.min.y;root.updateMatrixWorld?.(true);
}
async function loaderFactory(){if(!loaderPromise)loaderPromise=import('three/addons/loaders/GLTFLoader.js').then(m=>m.GLTFLoader);return loaderPromise;}
async function cloneFactory(){if(!clonePromise)clonePromise=import('three/addons/utils/SkeletonUtils.js').then(m=>m.clone||null).catch(()=>null);return clonePromise;}

async function loadTemplate(THREE,vehicleId){
  const spec=getMultiplayerVehicleSpec(vehicleId);if(!spec.hd.enabled)return null;
  if(templates.has(vehicleId)){perf.templateHits++;return templates.get(vehicleId);}
  if(failures.has(vehicleId))return null;
  if(templatePromises.has(vehicleId))return templatePromises.get(vehicleId);
  perf.templateLoads++;
  const promise=(async()=>{
    try{
      const GLTFLoader=await loaderFactory();const gltf=await new GLTFLoader().loadAsync(spec.hd.url);const root=gltf.scene||gltf.scenes?.[0]||null;
      if(!root)throw new Error(`${vehicleId}: GLB without scene`);
      root.name=`remote-hd-template-${vehicleId}`;normalizeTemplate(THREE,root,spec);tuneTemplate(THREE,root,vehicleId);root.visible=false;
      templates.set(vehicleId,root);failures.delete(vehicleId);return root;
    }catch(error){failures.set(vehicleId,error);perf.failures++;console.warn(`Remote HD ${vehicleId} unavailable; support fallback kept.`,error);return null;}
    finally{templatePromises.delete(vehicleId);}
  })();
  templatePromises.set(vehicleId,promise);return promise;
}

export function supportsRemoteHdVehicle(vehicleId){return !!getMultiplayerVehicleSpec(vehicleId).hd.enabled;}

export async function createRemoteHdVehicle(THREE,vehicleId){
  perf.requests++;
  const template=await loadTemplate(THREE,vehicleId);if(!template)return null;
  const skeletonClone=await cloneFactory();const root=typeof skeletonClone==='function'?skeletonClone(template):template.clone(true);
  root.name=`remote-hd-${vehicleId}`;root.visible=true;root.updateMatrixWorld?.(true);perf.instanceClones++;perf.activeInstances++;
  const lighting=createRemoteAuthoredLighting(THREE,vehicleId,root);if(lighting)perf.lightingInstances++;if(lighting?.ready)perf.lightingReady++;
  let disposed=false;
  return {
    root,
    vehicleSpec:getMultiplayerVehicleSpec(vehicleId),
    lightingMode:lighting?.mode||'none',
    lightingReady:!!lighting?.ready,
    lightingMissing:lighting?.missingFamilies||[],
    setLighting(state){if(disposed)return;lighting?.setState(state);if(lighting)perf.lightingUpdates++;},
    lightingDiagnostics:()=>lighting?.diagnostics?.()||null,
    dispose(){
      if(disposed)return;disposed=true;lighting?.dispose?.();
      if(lighting)perf.lightingInstances=Math.max(0,perf.lightingInstances-1);if(lighting?.ready)perf.lightingReady=Math.max(0,perf.lightingReady-1);
      perf.activeInstances=Math.max(0,perf.activeInstances-1);root.removeFromParent?.();root.clear?.();
    }
  };
}

export function remoteHdDiagnostics(){
  const supported=listMultiplayerVehicleSpecs().filter(spec=>spec.hd.enabled).map(spec=>spec.id);
  return {enabled:true,mode:'multiplayer-hd-m3-registry-cache',supported,loaded:[...templates.keys()],loading:[...templatePromises.keys()],failed:[...failures.keys()],requests:perf.requests,templateLoads:perf.templateLoads,templateHits:perf.templateHits,instanceClones:perf.instanceClones,activeInstances:perf.activeInstances,failures:perf.failures,materialProfile:'local-parity-v2',materialProfilesApplied:perf.materialProfilesApplied,materialProfileMaterials:perf.materialProfileMaterials,authoredLighting:'authored-glb-lamps-v2',lightingInstances:perf.lightingInstances,lightingReady:perf.lightingReady,lightingUpdates:perf.lightingUpdates};
}
try{globalThis.__WORLD_DRIVE_MULTIPLAYER_HD__=remoteHdDiagnostics;}catch{}
