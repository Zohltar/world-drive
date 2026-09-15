import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createStaticBoxInstances} from '../src/scenery/scenery-renderer-p9.js';

const scenerySource=await readFile(
  new URL('../src/scenery/scenery-renderer-p9.js',import.meta.url),
  'utf8'
);
const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');

const material=new THREE.MeshBasicMaterial();
const guardRailSections=1800;
const transforms=Array.from({length:guardRailSections},(_,index)=>({
  x:index*.8,
  y:2+Math.sin(index*.01),
  z:index%37,
  width:.10,
  height:.18,
  depth:.8,
  yaw:(index%19)*.01
}));
const guardRails=createStaticBoxInstances({
  THREE,
  material,
  transforms,
  name:'qa-guard-rails',
  kind:'guard-rail'
});

assert.ok(guardRails?.isInstancedMesh,'dense guard rails were not emitted as one InstancedMesh');
assert.equal(guardRails.count,guardRailSections,'guard-rail batching lost instances');
assert.equal(guardRails.userData.worldDriveInstanceKind,'guard-rail');
assert.ok(Number.isFinite(guardRails.boundingSphere?.radius),'guard-rail batch has a non-finite bounding sphere');
assert.ok(guardRails.geometry.getAttribute('position').array.every(Number.isFinite),'guard-rail unit geometry is non-finite');
assert.ok(guardRails.instanceMatrix.array.every(Number.isFinite),'guard-rail transforms contain a non-finite value');

const group=new THREE.Group();
group.add(guardRails);
let renderables=0;
group.traverse(object=>{if(object.isMesh)renderables++;});
assert.equal(renderables,1,'one dense guard-rail set still expands into multiple drawables');

const filtered=createStaticBoxInstances({
  THREE,
  material,
  transforms:[
    transforms[0],
    {...transforms[1],x:NaN},
    {...transforms[2],depth:0}
  ]
});
assert.equal(filtered.count,1,'invalid static instances reached GPU buffers');

assert.match(scenerySource,/guardRailInstances\.push\(\.\.\.guardRailBoxTransforms\(feature\.points\)\)/);
assert.match(scenerySource,/farBuildingShadowInstances/);
assert.match(scenerySource,/createStaticBoxInstances\(\{THREE,\.\.\.options\}\)/);
assert.doesNotMatch(
  scenerySource,
  /new THREE\.Mesh\(new THREE\.BoxGeometry\(\.10,\.18,len\)/,
  'guard-rail sections regressed to one Mesh per segment'
);
assert.match(mainSource,/function renderWorkloadSnapshot\(\)/);
for(const field of ['drawCalls','triangles','sceneObjects','roadProfilePoints','routePoints']){
  assert.ok(mainSource.includes(field),`runtime render diagnostic is missing ${field}`);
}

console.log('BLOCK 11 NORDSCHLEIFE PERFORMANCE R3 QA: PASS',{
  guardRailSections,
  guardRailDrawables:renderables,
  reduction:`${guardRailSections}:1`,
  finiteBoundingSphere:true,
  renderDiagnostics:true
});
