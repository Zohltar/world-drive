import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {R19_PRESENTATION,R19_MODELS,r19Family,r19Transform,partitionR19,buildDryClimateStyle,createDryClimatePresentation}
  from '../tools/biomes/dry-climate-presentation-r19.mjs';

const cases=[];function check(name,fn){fn();cases.push(name);}
check('R19 family selection is deterministic and biased toward Fort Ord chaparral structure',()=>{
  const counts=[0,0,0];
  for(let i=0;i<10000;i++){const f=r19Family(2,-3,i*.137,i*.293);counts[f]++;assert.equal(f,r19Family(2,-3,i*.137,i*.293));}
  assert.ok(counts[0]>2200&&counts[0]<2800,counts);assert.ok(counts[1]>5600&&counts[1]<6400,counts);assert.ok(counts[2]>1200&&counts[2]<1800,counts);
});
check('low-family transforms are stable and bounded',()=>{
  for(const family of [1,2])for(let i=0;i<500;i++){
    const a=r19Transform(family,1,4,i*.7,i*1.1),b=r19Transform(family,1,4,i*.7,i*1.1);assert.deepEqual(a,b);
    if(family===1){assert.ok(a.sx>=1.45&&a.sx<=2.25);assert.ok(a.sy>=1.20&&a.sy<=1.80);assert.ok(a.sz>=1.40&&a.sz<=2.15);}
    else{assert.ok(a.sx>=1.45&&a.sx<=2.25);assert.ok(a.sy>=.72&&a.sy<=1.20);assert.ok(a.sz>=1.40&&a.sz<=2.15);}
  }
});
const matrices=new Float32Array(1744*16);
for(let i=0;i<1744;i++){const o=i*16;matrices[o]=matrices[o+5]=matrices[o+10]=matrices[o+15]=1;matrices[o+12]=(i%44)*9.7;matrices[o+13]=i%17*.1;matrices[o+14]=Math.floor(i/44)*10.3;}
const partition=partitionR19(matrices,0,0);
check('partition owns every original root exactly once with visible-prefix tables',()=>{
  assert.equal(partition.indices.reduce((s,a)=>s+a.length,0),1744);
  const all=[...partition.indices[0],...partition.indices[1],...partition.indices[2]];assert.equal(new Set(all).size,1744);
  for(let n=0;n<=1744;n+=109)assert.equal(partition.prefix.reduce((s,p)=>s+p[n],0),n);
});
const style=buildDryClimateStyle(THREE);
check('dry assets are bounded Fort Ord oak chaparral and grass with one material',()=>{
  const d=style.diagnostics();assert.equal(d.id,R19_PRESENTATION);assert.deepEqual(d.models,[...R19_MODELS]);assert.deepEqual(d.triangles,[44,64,50]);
  assert.deepEqual(R19_MODELS,['coast-live-oak','maritime-chaparral','dry-grass']);
  const a=[0,1,2].map(f=>style.asset(f));assert.equal(new Set(a.map(x=>x.material)).size,1);assert.equal(d.sharedMaterials,1);assert.equal(d.transparent,false);
  assert.ok(a[1].geometry.boundingBox.max.y<.9);assert.ok(a[2].geometry.boundingBox.max.y<.7);assert.match(d.scope,/Fort Ord-compatible/);
});
const group=new THREE.Group(),base=new THREE.BufferGeometry();
base.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));
base.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array([0,0,1,0,0,1,0,0,1]),3));
base.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array([.1,.2,.1,.1,.2,.1,.1,.2,.1]),3));
const material=new THREE.MeshLambertMaterial({vertexColors:true});
const source=new THREE.InstancedMesh(base,material,600);source.name='source';source.matrixAutoUpdate=false;source.updateMatrix();source.boundingSphere=new THREE.Sphere(new THREE.Vector3(240,10,240),380);
for(let i=0;i<600;i++){const m=new THREE.Matrix4();m.makeRotationY((i%17)*.11);m.scale(new THREE.Vector3(7+i%5,10+i%7,7+i%5));m.setPosition((i%30)*14.5,i%19*.12,Math.floor(i/30)*19.2);source.setMatrixAt(i,m);}
source.instanceMatrix.needsUpdate=true;group.add(source);const before=source.instanceMatrix.array.slice();
const presentation=createDryClimatePresentation({THREE,group,source,proof:{profileId:'r14-laguna-woodland',ecoregionId:423,count:1744,cx:0,cz:0,key:'0:0'},style,now:()=>0});
group.updateMatrixWorld(true);
check('actual Three presentation keeps source buffers and replaces one dense pass by three researched Laguna families',()=>{
  const d=presentation.diagnostics(),a=presentation.audit();assert.equal(source.visible,false);assert.equal(group.children.length,4);
  assert.deepEqual(source.instanceMatrix.array,before);assert.equal(d.instances,600);assert.equal(Object.values(d.models).reduce((s,n)=>s+n,0),600);
  assert.ok(d.models['coast-live-oak']>0&&d.models['maritime-chaparral']>0&&d.models['dry-grass']>0);assert.equal(d.potentialAdditionalDrawCalls,2);
  assert.ok(a.sourcePrefixExact&&a.sourceHidden);assert.equal(a.parts.length,3);
});
check('source visible prefix controls all three families without new roots',()=>{
  for(const n of [0,1,37,128,299,600]){source.count=n;group.updateMatrixWorld(true);const a=presentation.audit();assert.ok(a.sourcePrefixExact);assert.equal(a.instances,n);}
});
check('height refresh keeps root XZ and source matrices authoritative',()=>{
  source.count=600;const low=group.children.find(m=>m.userData?.r19Family==='maritime-chaparral');const beforeXZ=[];for(let i=0;i<low.instanceMatrix.count;i++)beforeXZ.push(low.instanceMatrix.array[i*16+12],low.instanceMatrix.array[i*16+14]);
  for(let i=0;i<600;i++)source.instanceMatrix.array[i*16+13]+=4;source.instanceMatrix.needsUpdate=true;group.updateMatrixWorld(true);
  const afterXZ=[];for(let i=0;i<low.instanceMatrix.count;i++)afterXZ.push(low.instanceMatrix.array[i*16+12],low.instanceMatrix.array[i*16+14]);assert.deepEqual(afterXZ,beforeXZ);assert.ok(presentation.audit().sourcePrefixExact);
});
check('restore removes only owned meshes and restores original forest',()=>{
  assert.equal(presentation.restore(),true);assert.equal(source.visible,true);assert.equal(group.children.length,1);assert.equal(group.children[0],source);assert.deepEqual(source.instanceMatrix.array,before.map((v,i)=>i%16===13?v+4:v));
});
style.dispose();base.dispose();material.dispose();
const report={status:'PASS',groups:cases.length,cases,partition:partition.indices.map(a=>a.length),style:style.diagnostics(),threeRevision:THREE.REVISION};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'PASS',groups:cases.length,partition:report.partition}));
