import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as THREE from 'three';

for(const file of [
  'src/multiplayer-authored-lighting-m31.js',
  'src/multiplayer-hd-vehicles-m31.js',
  'src/multiplayer-visuals-m3.js'
])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});

const parity=fs.readFileSync('src/multiplayer-authored-lighting-m31.js','utf8');
const hd=fs.readFileSync('src/multiplayer-hd-vehicles-m31.js','utf8');
const visuals=fs.readFileSync('src/multiplayer-visuals-m3.js','utf8');
const localWrx=fs.readFileSync('src/wrx-glb.js','utf8');
const localSonata=fs.readFileSync('src/sonata-glb.js','utf8');

assert(visuals.includes("from './multiplayer-hd-vehicles-m31.js'"),'M3 visuals must use the M3.1 lighting wrapper');
assert(hd.includes("const LOCAL_PARITY_IDS=new Set(['wrx','sonata'])"),'M3.1 must remain limited to the two runtime-proven problem vehicles');
assert(hd.includes("baseSetLighting({...state,reversing:false})"),'generic WRX reverse binding must be disabled when local-parity reverse is active');
assert(hd.includes('braking:false')&&hd.includes('reversing:false')&&hd.includes('signalBlink:false'),'generic Sonata authored layers must stay dark under M3.1');

// WRX: remote reverse must use the same proven physical/material predicate as
// the local WRX, not the old fh_reverse_material assumption.
for(const marker of [
  "center.z<-1.7&&center.y>.65",
  "name.includes('fh_light_glass')",
  "path.includes('fh_light_glass_red_material')",
  "path.includes('fh_taillight_new_material')",
  "path.includes('fh_chmsl_new_material')"
]){
  assert(parity.includes(marker),`M3.1 WRX parity marker missing: ${marker}`);
}
assert(localWrx.includes("isRearCluster &&")&&localWrx.includes("name.includes('fh_light_glass')"),'local WRX proven reverse predicate drifted');
assert(!parity.includes("findMeshes(root,['fh_reverse_material'])"),'M3.1 must not resurrect the incorrect WRX reverse selector');

// Sonata: the same authored red lens owns both night running and brake output.
// A daytime brake state must therefore drive the lens directly.
for(const marker of [
  'rearRedOpacity=Math.max',
  "braking?.52:0",
  "setGlow(rearRed,rearRedOpacity)",
  "setGlow(reverse,reversing?.98:0)",
  "sourceMesh.parent.add(mesh)",
  "uvRegion:{min:[.04,.842],max:[.54,1],feather:[.004,.004]}",
  "uvRegion:{min:[.44,.842],max:[.96,1],feather:[.004,.004]}"
])assert(parity.includes(marker),`M3.1 Sonata parity marker missing: ${marker}`);
assert(localSonata.includes('Math.max(runningRed,brakingRed)'),'local Sonata must retain combined running/brake ownership');
assert(localSonata.includes("setGlow(authoredRearGlowLayers,'white',0,reverseWhite)"),'local Sonata reverse authored layer drifted');

function parseGlb(path){
  const data=fs.readFileSync(path);
  assert.equal(data.toString('ascii',0,4),'glTF',`${path}: invalid GLB`);
  let offset=12,json=null;
  while(offset+8<=data.length){
    const length=data.readUInt32LE(offset),type=data.readUInt32LE(offset+4),start=offset+8;
    if(type===0x4e4f534a){
      json=JSON.parse(data.subarray(start,start+length).toString('utf8').replace(/\0+$/,''));
      break;
    }
    offset=start+length;
  }
  assert(json,`${path}: JSON chunk missing`);
  return json;
}

function wrxReverseCandidates(){
  const json=parseGlb('src/assets/subaru_wrx_vb.glb');
  const nodes=json.nodes||[],meshes=json.meshes||[],materials=json.materials||[];
  const parents=new Array(nodes.length).fill(-1);
  for(let i=0;i<nodes.length;i++)for(const child of nodes[i].children||[])parents[child]=i;
  const localMatrix=node=>{
    if(Array.isArray(node.matrix)&&node.matrix.length===16)return new THREE.Matrix4().fromArray(node.matrix);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(...(node.translation||[0,0,0])),
      new THREE.Quaternion(...(node.rotation||[0,0,0,1])),
      new THREE.Vector3(...(node.scale||[1,1,1]))
    );
  };
  const cache=new Map();
  const worldMatrix=index=>{
    if(cache.has(index))return cache.get(index);
    const local=localMatrix(nodes[index]||{});
    const parent=parents[index];
    const world=parent>=0?worldMatrix(parent).clone().multiply(local):local;
    cache.set(index,world);
    return world;
  };
  const pathFor=index=>{
    const names=[];let i=index,guard=0;
    while(i>=0&&guard++<nodes.length+2){names.unshift(String(nodes[i]?.name||`node_${i}`).toLowerCase());i=parents[i];}
    return names.join('/');
  };
  const meshBox=meshIndex=>{
    const box=new THREE.Box3();let found=false;
    for(const primitive of meshes[meshIndex]?.primitives||[]){
      const accessor=json.accessors?.[primitive.attributes?.POSITION];
      if(!accessor?.min||!accessor?.max)continue;
      box.expandByPoint(new THREE.Vector3(...accessor.min));
      box.expandByPoint(new THREE.Vector3(...accessor.max));
      found=true;
    }
    return found?box:null;
  };

  const modelBox=new THREE.Box3();
  for(let i=0;i<nodes.length;i++){
    const node=nodes[i];if(!Number.isInteger(node.mesh))continue;
    const box=meshBox(node.mesh);if(!box)continue;
    modelBox.union(box.clone().applyMatrix4(worldMatrix(i)));
  }
  const size=new THREE.Vector3(),modelCenter=new THREE.Vector3();
  modelBox.getSize(size);modelBox.getCenter(modelCenter);
  const scale=(4.60*1.20)/Math.max(.001,size.z);

  const candidates=[];
  for(let i=0;i<nodes.length;i++){
    const node=nodes[i];if(!Number.isInteger(node.mesh))continue;
    const box=meshBox(node.mesh);if(!box)continue;
    const center=new THREE.Vector3();box.getCenter(center).applyMatrix4(worldMatrix(i));
    const normalized={
      x:(center.x-modelCenter.x)*scale,
      y:(center.y-modelBox.min.y)*scale,
      z:(center.z-modelCenter.z)*scale
    };
    const names=(meshes[node.mesh]?.primitives||[])
      .map(p=>Number.isInteger(p.material)?String(materials[p.material]?.name||'').toLowerCase():'')
      .filter(Boolean);
    const path=pathFor(i);
    const excluded=path.includes('fh_light_glass_red_material')||path.includes('fh_taillight_new_material')||path.includes('fh_chmsl_new_material');
    if(!excluded&&normalized.z<-1.7&&normalized.y>.65&&names.some(name=>name.includes('fh_light_glass'))){
      candidates.push({node:i,name:node.name||'',materials:names,center:normalized,path});
    }
  }
  return candidates;
}

const wrxCandidates=wrxReverseCandidates();
assert(wrxCandidates.length>0,'real WRX GLB must contain at least one local-proven reverse candidate after normalization');

const sonata=parseGlb('src/assets/2006_hyundai_sonata.glb');
for(const name of ['Object_46','Object_33','Object_7']){
  const nodeIndex=(sonata.nodes||[]).findIndex(node=>node.name===name);
  assert(nodeIndex>=0,`Sonata authored node missing: ${name}`);
  const mesh=sonata.meshes?.[sonata.nodes[nodeIndex]?.mesh];
  const primitive=mesh?.primitives?.[0];
  const material=sonata.materials?.[primitive?.material];
  assert(Number.isInteger(material?.pbrMetallicRoughness?.baseColorTexture?.index),`Sonata ${name} must retain its textured authored lens`);
}

console.log('V21.31 MULTIPLAYER M3.1 LIGHT PARITY QA: PASS',{
  wrxReverseCandidates:wrxCandidates.map(candidate=>({name:candidate.name,center:candidate.center,materials:candidate.materials,path:candidate.path})),
  sonataNodes:['Object_46','Object_33','Object_7'],
  fixes:['wrx-local-reverse-selector','sonata-local-authored-lens-shader','sonata-day-brake-shared-red-lens']
});
