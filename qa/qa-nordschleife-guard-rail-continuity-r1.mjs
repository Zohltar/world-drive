import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createGuardRailBoxTransforms} from '../src/scenery/scenery-renderer-p9.js';
import {createStaticBoxInstances} from '../src/rendering/static-box-instances.js';

const terrainHeight=(x,z)=>10+x*.18+Math.sin(z*.15)*.4;
const transforms=createGuardRailBoxTransforms({
  points:[{x:100,z:200},{x:120,z:200},{x:130,z:210}],
  terrainHeight,
  getWorldOffset:()=>({x:100,z:200}),
  maxSpanM:5,
  overlapM:.14
});

assert.equal(transforms.length,7,'long OSM rail edges were not subdivided at the continuity span');
assert.ok(transforms.every(item=>Number.isFinite(item.pitch)&&item.depth>0),'rail pitch/depth is not finite');
assert.ok(transforms.some(item=>Math.abs(item.pitch)>.01),'rail spans stayed horizontal over relief');

const endpoint=(item,sign)=>{
  const local=new THREE.Vector3(0,0,sign*item.depth/2);
  const euler=new THREE.Euler(item.pitch||0,item.yaw||0,item.roll||0,'YXZ');
  return local.applyEuler(euler).add(new THREE.Vector3(item.x,item.y,item.z));
};
for(let i=0;i<transforms.length-1;i++){
  const end=endpoint(transforms[i],1);
  const start=endpoint(transforms[i+1],-1);
  const gap=end.distanceTo(start);
  assert.ok(gap<=.145,`guard-rail junction ${i}/${i+1} opened by ${gap.toFixed(3)} m`);
}

const mesh=createStaticBoxInstances({
  THREE,
  material:new THREE.MeshBasicMaterial(),
  transforms,
  kind:'guard-rail'
});
assert.ok(mesh?.isInstancedMesh,'continuous guard rails lost single-batch instancing');
assert.equal(mesh.count,transforms.length,'guard-rail batching lost a subdivided span');
assert.ok(mesh.instanceMatrix.array.every(Number.isFinite),'pitched guard-rail matrices contain non-finite values');
assert.ok(Number.isFinite(mesh.boundingSphere?.radius),'pitched guard-rail batch has an invalid bound');

console.log('NORDSCHLEIFE GUARD-RAIL CONTINUITY R1 QA: PASS',{
  spans:transforms.length,
  maxSpanM:5,
  overlapM:.14,
  drawables:1,
  followsRelief:true
});
