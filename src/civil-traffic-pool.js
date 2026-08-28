import * as THREE from 'three';

export const GENERIC_PASSENGER_PACK_URL='./assets/traffic/generic_passenger_car_pack_traffic.glb';
export const GENERIC_PASSENGER_PACK_FALLBACK_URL='./assets/traffic/generic_passenger_car_pack.glb';

export const CIVIL_TRAFFIC_VEHICLE_POOL=Object.freeze([
  Object.freeze({id:'sonata',label:'Hyundai Sonata',source:'sonata',weight:1.0,targetLength:4.85}),
  Object.freeze({id:'compact',label:'Compact',source:'generic-pack',bodyName:'Compact Body',weight:1.15,targetLength:4.05}),
  Object.freeze({id:'coupe',label:'Coupe',source:'generic-pack',bodyName:'Coupe Body',weight:.55,targetLength:4.55}),
  Object.freeze({id:'hatchback',label:'Hatchback',source:'generic-pack',bodyName:'Hatchback Body',weight:1.15,targetLength:4.30}),
  Object.freeze({id:'minivan',label:'Minivan',source:'generic-pack',bodyName:'minivan body',weight:.65,targetLength:5.05}),
  Object.freeze({id:'offroad',label:'Off-road',source:'generic-pack',bodyName:'Offroad Body',weight:.45,targetLength:4.55}),
  Object.freeze({id:'pickup',label:'Pickup',source:'generic-pack',bodyName:'Pickup Body',weight:.65,targetLength:5.50}),
  Object.freeze({id:'sedan',label:'Sedan',source:'generic-pack',bodyName:'Sedan Body',weight:1.35,targetLength:4.80}),
  Object.freeze({id:'sport',label:'Sport',source:'generic-pack',bodyName:'Sport body',weight:.35,targetLength:4.45}),
  Object.freeze({id:'suv',label:'SUV',source:'generic-pack',bodyName:'SUV Body',weight:1.35,targetLength:4.85}),
  Object.freeze({id:'wagon',label:'Wagon',source:'generic-pack',bodyName:'Wagon Body',weight:.75,targetLength:4.85})
]);

const POOL_BY_ID=new Map(CIVIL_TRAFFIC_VEHICLE_POOL.map(entry=>[entry.id,entry]));

export function civilTrafficPoolEntry(id){
  return POOL_BY_ID.get(String(id||''))||null;
}

export function civilTrafficAvailablePool(availableIds=[]){
  const allowed=new Set(availableIds);
  return CIVIL_TRAFFIC_VEHICLE_POOL.filter(entry=>allowed.has(entry.id));
}

export function civilTrafficChooseVehicleId(availableIds=[],randomValue=Math.random(),avoidId=null){
  let candidates=civilTrafficAvailablePool(availableIds);
  if(candidates.length>1&&avoidId){
    const withoutPrevious=candidates.filter(entry=>entry.id!==avoidId);
    if(withoutPrevious.length)candidates=withoutPrevious;
  }
  if(!candidates.length)return null;
  const total=candidates.reduce((sum,entry)=>sum+Math.max(.01,Number(entry.weight)||1),0);
  let cursor=Math.max(0,Math.min(.999999,Number(randomValue)||0))*total;
  for(const entry of candidates){
    cursor-=Math.max(.01,Number(entry.weight)||1);
    if(cursor<0)return entry.id;
  }
  return candidates[candidates.length-1].id;
}

// GLTFLoader sanitizes authored node names for animation bindings (spaces and
// punctuation can become underscores). Compare semantic names canonically so the
// runtime accepts both the raw Sketchfab/Blender names and Three.js sanitized names.
export function civilTrafficCanonicalNodeName(name){
  return String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
}

function findDirectAuthoredChild(rootNode,authoredName){
  const wanted=civilTrafficCanonicalNodeName(authoredName);
  return Array.from(rootNode?.children||[]).find(node=>civilTrafficCanonicalNodeName(node?.name)===wanted)||null;
}

function matrixPosition(node){
  const e=node?.matrix?.elements;
  return e?new THREE.Vector3(e[12],e[13],e[14]):new THREE.Vector3();
}

function normalizeGenericTemplate(root,targetLength){
  root.updateMatrixWorld(true);
  const box0=new THREE.Box3().setFromObject(root);
  const size=new THREE.Vector3();
  box0.getSize(size);
  const scale=Math.max(.001,Number(targetLength)||4.7)/Math.max(.001,size.z);
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root);
  const center=new THREE.Vector3();
  box.getCenter(center);
  root.position.x-=center.x;
  root.position.z-=center.z;
  root.position.y-=box.min.y;
  root.updateMatrixWorld(true);
}

function extractGenericVehicle(rootNode,entry){
  const direct=Array.from(rootNode?.children||[]);
  const body=findDirectAuthoredChild(rootNode,entry.bodyName);
  if(!body)return null;
  const wheels=direct.filter(node=>civilTrafficCanonicalNodeName(node?.name).startsWith('wheel'));
  const bodyPos=matrixPosition(body);
  const nearest=wheels
    .map(node=>{
      const p=matrixPosition(node);
      const dx=p.x-bodyPos.x,dz=p.z-bodyPos.z;
      return {node,d2:dx*dx+dz*dz};
    })
    .sort((a,b)=>a.d2-b.d2)
    .slice(0,4)
    .map(item=>item.node);
  if(nearest.length!==4)return null;

  const assembly=new THREE.Group();
  assembly.name=`traffic-pack-template-${entry.id}`;
  const bodyInverse=body.matrix.clone().invert();
  const sources=[body,...nearest];
  sources.forEach((source,index)=>{
    const clone=source.clone(true);
    const relative=bodyInverse.clone().multiply(source.matrix);
    relative.decompose(clone.position,clone.quaternion,clone.scale);
    clone.matrixAutoUpdate=true;
    if(index>0)clone.name=`traffic-pack-wheel-${index-1}`;
    assembly.add(clone);
  });

  // The source pack is Blender-style: X=lateral, Y=longitudinal, Z=up and
  // vehicles face -Y. Rotate into World Drive's X=lateral, Y=up, +Z=forward.
  assembly.rotation.x=-Math.PI/2;
  normalizeGenericTemplate(assembly,entry.targetLength);
  assembly.userData.trafficVehicleId=entry.id;
  assembly.userData.trafficVehicleLabel=entry.label;
  assembly.userData.trafficSource='generic-pack';
  assembly.userData.targetLength=entry.targetLength;
  return assembly;
}

export function buildGenericPassengerTemplates(packScene){
  const result=new Map();
  let rootNode=packScene?.getObjectByName?.('RootNode')||null;
  if(!rootNode&&packScene?.traverse){
    const wanted=civilTrafficCanonicalNodeName('RootNode');
    packScene.traverse(node=>{
      if(!rootNode&&civilTrafficCanonicalNodeName(node?.name)===wanted)rootNode=node;
    });
  }
  if(!rootNode)return result;
  rootNode.updateMatrixWorld(true);
  for(const entry of CIVIL_TRAFFIC_VEHICLE_POOL){
    if(entry.source!=='generic-pack')continue;
    const template=extractGenericVehicle(rootNode,entry);
    if(template)result.set(entry.id,template);
  }
  return result;
}

export function genericPassengerPackIds(){
  return CIVIL_TRAFFIC_VEHICLE_POOL.filter(entry=>entry.source==='generic-pack').map(entry=>entry.id);
}
