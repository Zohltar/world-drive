import fs from 'node:fs';
import * as THREE from 'three';

const ASSETS={
  wrx:'src/assets/subaru_wrx_vb.glb',
  id4:'src/assets/id4_2021_detailed.glb',
  civic:'src/assets/2006_honda_civic_si.glb',
  sonata:'src/assets/2006_hyundai_sonata.glb',
  i3_2017:'src/assets/2017_bmw_i3.glb',
  f1_2010:'src/assets/f1_2010_ferrari.glb',
  countach_80:'src/assets/countach_80.glb'
};

function parseGlb(path){
  const data=fs.readFileSync(path);
  if(data.toString('ascii',0,4)!=='glTF')throw new Error(`${path}: invalid GLB magic`);
  let offset=12,json=null;
  while(offset+8<=data.length){
    const length=data.readUInt32LE(offset),type=data.readUInt32LE(offset+4),start=offset+8;
    if(type===0x4e4f534a){json=JSON.parse(data.subarray(start,start+length).toString('utf8').replace(/\0+$/,''));break;}
    offset=start+length;
  }
  if(!json)throw new Error(`${path}: JSON chunk missing`);
  return json;
}

function nodeIndex(json){
  const nodes=json.nodes||[],parents=new Array(nodes.length).fill(-1);
  for(let i=0;i<nodes.length;i++)for(const child of nodes[i].children||[])parents[child]=i;
  const pathFor=index=>{
    const names=[];let i=index;const seen=new Set();
    while(i>=0&&!seen.has(i)){seen.add(i);names.unshift(nodes[i]?.name||`node_${i}`);i=parents[i];}
    return names.join('/');
  };
  const localMatrix=node=>{
    if(Array.isArray(node.matrix)&&node.matrix.length===16)return new THREE.Matrix4().fromArray(node.matrix);
    const p=new THREE.Vector3(...(node.translation||[0,0,0]));
    const q=new THREE.Quaternion(...(node.rotation||[0,0,0,1]));
    const s=new THREE.Vector3(...(node.scale||[1,1,1]));
    return new THREE.Matrix4().compose(p,q,s);
  };
  const worldCache=new Map();
  const worldMatrix=index=>{
    if(worldCache.has(index))return worldCache.get(index);
    const local=localMatrix(nodes[index]||{});
    const parent=parents[index];
    const world=parent>=0?worldMatrix(parent).clone().multiply(local):local;
    worldCache.set(index,world);return world;
  };
  return {parents,pathFor,worldMatrix};
}

function meshBounds(json,meshIndex){
  const mesh=json.meshes?.[meshIndex];
  if(!mesh)return null;
  const box=new THREE.Box3();
  let found=false;
  for(const primitive of mesh.primitives||[]){
    const accessorIndex=primitive.attributes?.POSITION;
    const accessor=json.accessors?.[accessorIndex];
    if(!accessor?.min||!accessor?.max)continue;
    box.expandByPoint(new THREE.Vector3(...accessor.min));
    box.expandByPoint(new THREE.Vector3(...accessor.max));
    found=true;
  }
  return found?box:null;
}

function centerFor(json,index,worldMatrix){
  const node=json.nodes?.[index];
  const box=meshBounds(json,node?.mesh);
  if(!box)return null;
  const center=new THREE.Vector3();box.getCenter(center);center.applyMatrix4(worldMatrix(index));
  return {x:+center.x.toFixed(3),y:+center.y.toFixed(3),z:+center.z.toFixed(3)};
}

const LIGHT_RE=/(light|lamp|signal|turn|indicator|amber|orange|red|led|glass|reflect|reverse|brake|tail|head)/i;

for(const [vehicleId,path] of Object.entries(ASSETS)){
  const json=parseGlb(path),materials=json.materials||[],meshes=json.meshes||[],nodes=json.nodes||[];
  const {pathFor,worldMatrix}=nodeIndex(json);
  const rows=[];
  for(let i=0;i<nodes.length;i++){
    const node=nodes[i];if(!Number.isInteger(node.mesh))continue;
    const mesh=meshes[node.mesh];
    const materialNames=[...new Set((mesh?.primitives||[]).map(p=>Number.isInteger(p.material)?(materials[p.material]?.name||`material_${p.material}`):'').filter(Boolean))];
    const pathText=pathFor(i);
    const text=`${node.name||''} ${mesh?.name||''} ${materialNames.join(' ')} ${pathText}`;
    const force=vehicleId==='wrx'&&/(taillight|running|signal|light_glass|chmsl)/i.test(pathText);
    if(!LIGHT_RE.test(text)&&!force)continue;
    rows.push({node:i,nodeName:node.name||'',meshName:mesh?.name||'',materials:materialNames.join(' | '),center:centerFor(json,i,worldMatrix),path:pathText});
  }

  const exactSonata=vehicleId==='sonata'?['Object_46','Object_33','Object_7'].map(name=>{
    const index=nodes.findIndex(n=>n.name===name),node=nodes[index],mesh=meshes[node?.mesh];
    const primitive=mesh?.primitives?.[0],mat=materials[primitive?.material];
    return {name,found:index>=0,node:index,mesh:mesh?.name||'',material:mat?.name||'',baseColorTexture:mat?.pbrMetallicRoughness?.baseColorTexture?.index??null,center:index>=0?centerFor(json,index,worldMatrix):null};
  }):undefined;

  const allMaterials=(vehicleId==='sonata'||vehicleId==='i3_2017')?materials.map((m,index)=>({index,name:m.name||'',baseColorTexture:m.pbrMetallicRoughness?.baseColorTexture?.index??null})):undefined;

  console.log(`\n=== MULTIPLAYER GLB LIGHT AUDIT: ${vehicleId} ===`);
  console.log(JSON.stringify({vehicleId,path,nodes:nodes.length,meshes:meshes.length,materials:materials.length,matchingRows:rows.length,exactSonataNodes:exactSonata,allMaterials,materialNames:materials.map(m=>m.name||'').filter(name=>LIGHT_RE.test(name)),rows},null,2));
}

console.log('\nV21.31 MULTIPLAYER GLB STRUCTURE AUDIT: COMPLETE');
