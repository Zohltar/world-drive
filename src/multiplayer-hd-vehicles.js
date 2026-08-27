// World Drive multiplayer HD vehicle cache.
//
// Remote peers keep the proven procedural/network-support skeleton, but may
// replace the visible body/wheels with the same authored GLB assets used by the
// local fleet. Assets are loaded only when a remote peer actually needs them.
// One normalized template is cached per vehicle, then safely cloned per peer.

const REMOTE_HD_SPECS=Object.freeze({
  wrx:Object.freeze({
    url:new URL('./assets/subaru_wrx_vb.glb',import.meta.url).href,
    targetLength:4.60*1.20
  }),
  id4:Object.freeze({
    url:new URL('./assets/id4_2021_detailed.glb',import.meta.url).href,
    targetLength:4.58
  }),
  civic:Object.freeze({
    url:new URL('./assets/2006_honda_civic_si.glb',import.meta.url).href,
    targetLength:4.55
  }),
  sonata:Object.freeze({
    url:new URL('./assets/2006_hyundai_sonata.glb',import.meta.url).href,
    targetLength:4.85
  }),
  i3_2017:Object.freeze({
    url:new URL('./assets/2017_bmw_i3.glb',import.meta.url).href,
    targetLength:4.01*1.20
  }),
  f1_2010:Object.freeze({
    url:new URL('./assets/f1_2010_ferrari.glb',import.meta.url).href,
    targetLength:5.00
  }),
  countach_80:Object.freeze({
    url:new URL('./assets/countach_80.glb',import.meta.url).href,
    targetLength:4.14*1.15,
    targetWidth:2.08*1.15
  })
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
  activeInstances:0
};

function tuneTemplate(root){
  root?.traverse?.(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    obj.castShadow=true;
    obj.receiveShadow=true;
    const materials=Array.isArray(obj.material)?obj.material:[obj.material];
    for(const material of materials){
      if(!material)continue;
      material.dithering=true;
      if(material.transparent)material.depthWrite=false;
      material.needsUpdate=true;
    }
  });
}

function normalizeTemplate(THREE,root,spec){
  root.rotation?.set?.(0,0,0);
  root.updateMatrixWorld?.(true);

  const initialBox=new THREE.Box3().setFromObject(root);
  const initialSize=new THREE.Vector3();
  initialBox.getSize(initialSize);

  let scale=spec.targetLength/Math.max(.001,initialSize.z);
  if(Number.isFinite(spec.targetWidth)){
    scale=Math.min(
      scale,
      spec.targetWidth/Math.max(.001,initialSize.x)
    );
  }
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld?.(true);

  const box=new THREE.Box3().setFromObject(root);
  const center=new THREE.Vector3();
  box.getCenter(center);
  root.position.x-=center.x;
  root.position.z-=center.z;
  root.position.y-=box.min.y;
  root.updateMatrixWorld?.(true);
}

async function loaderFactory(){
  if(!loaderPromise){
    loaderPromise=import('three/addons/loaders/GLTFLoader.js')
      .then(module=>module.GLTFLoader);
  }
  return loaderPromise;
}

async function cloneFactory(){
  if(!clonePromise){
    clonePromise=import('three/addons/utils/SkeletonUtils.js')
      .then(module=>module.clone||null)
      .catch(()=>null);
  }
  return clonePromise;
}

async function loadTemplate(THREE,vehicleId){
  const spec=REMOTE_HD_SPECS[vehicleId];
  if(!spec)return null;

  const cached=templates.get(vehicleId);
  if(cached){
    perf.templateHits++;
    return cached;
  }
  if(failures.has(vehicleId))return null;
  if(templatePromises.has(vehicleId))return templatePromises.get(vehicleId);

  perf.templateLoads++;
  const promise=(async()=>{
    try{
      const GLTFLoader=await loaderFactory();
      if(typeof GLTFLoader!=='function')throw new Error('GLTFLoader unavailable');
      const loader=new GLTFLoader();
      const gltf=await loader.loadAsync(spec.url);
      const root=gltf.scene||gltf.scenes?.[0]||null;
      if(!root)throw new Error(`${vehicleId}: GLB without scene`);
      root.name=`remote-hd-template-${vehicleId}`;
      normalizeTemplate(THREE,root,spec);
      tuneTemplate(root);
      root.visible=false;
      templates.set(vehicleId,root);
      failures.delete(vehicleId);
      return root;
    }catch(error){
      failures.set(vehicleId,error);
      perf.failures++;
      console.warn(`Remote HD ${vehicleId} unavailable; procedural fallback kept.`,error);
      return null;
    }finally{
      templatePromises.delete(vehicleId);
    }
  })();

  templatePromises.set(vehicleId,promise);
  return promise;
}

export function supportsRemoteHdVehicle(vehicleId){
  return !!REMOTE_HD_SPECS[vehicleId];
}

export async function createRemoteHdVehicle(THREE,vehicleId){
  perf.requests++;
  const template=await loadTemplate(THREE,vehicleId);
  if(!template)return null;

  const skeletonClone=await cloneFactory();
  const root=typeof skeletonClone==='function'
    ?skeletonClone(template)
    :template.clone(true);

  root.name=`remote-hd-${vehicleId}`;
  root.visible=true;
  root.updateMatrixWorld?.(true);
  perf.instanceClones++;
  perf.activeInstances++;

  let disposed=false;
  return {
    root,
    dispose(){
      if(disposed)return;
      disposed=true;
      perf.activeInstances=Math.max(0,perf.activeInstances-1);
      root.removeFromParent?.();
      root.clear?.();
      // Geometry, materials and textures remain owned by the cached template.
      // SkeletonUtils clones hierarchy/bones while preserving those immutable
      // render resources, so disposing them here would break sibling peers.
    }
  };
}

export function remoteHdDiagnostics(){
  return {
    enabled:true,
    mode:'multiplayer-hd-lazy-cache',
    supported:Object.keys(REMOTE_HD_SPECS),
    loaded:[...templates.keys()],
    loading:[...templatePromises.keys()],
    failed:[...failures.keys()],
    requests:perf.requests,
    templateLoads:perf.templateLoads,
    templateHits:perf.templateHits,
    instanceClones:perf.instanceClones,
    activeInstances:perf.activeInstances,
    failures:perf.failures
  };
}

try{globalThis.__WORLD_DRIVE_MULTIPLAYER_HD__=remoteHdDiagnostics;}catch{}
