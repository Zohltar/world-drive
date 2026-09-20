import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {R21_PRESENTATION,R21_MODELS,r21Family,partitionR21,buildBorealDiversityStyle,createBorealDiversityPresentation}
  from '../tools/biomes/boreal-presentation-r21.mjs';

const cases=[];function check(name,fn){fn();cases.push(name);}
check('R21 family selection is deterministic and conifer-dominant without measured-cover claim',()=>{
  const counts=[0,0,0,0];
  for(let i=0;i<20000;i++){const f=r21Family(-4,9,i*.137,i*.293);counts[f]++;assert.equal(f,r21Family(-4,9,i*.137,i*.293));}
  assert.ok(counts[0]>8500&&counts[0]<10000,counts);assert.ok(counts[1]>6000&&counts[1]<7600,counts);
  assert.ok(counts[2]>2300&&counts[2]<3300,counts);assert.ok(counts[3]>800&&counts[3]<1600,counts);
});
const matrices=new Float32Array(1744*16);
for(let i=0;i<1744;i++){const o=i*16;matrices[o]=matrices[o+5]=matrices[o+10]=matrices[o+15]=1;matrices[o+12]=(i%44)*9.7;matrices[o+13]=i%17*.1;matrices[o+14]=Math.floor(i/44)*10.3;}
const partition=partitionR21(matrices,0,0);
check('partition owns every original R4 root exactly once with four prefix tables',()=>{
  assert.equal(partition.indices.reduce((s,a)=>s+a.length,0),1744);const all=partition.indices.flatMap(a=>[...a]);assert.equal(new Set(all).size,1744);
  for(let n=0;n<=1744;n+=109)assert.equal(partition.prefix.reduce((s,p)=>s+p[n],0),n);
});
const style=buildBorealDiversityStyle(THREE);
check('boreal assets expose researched spruce fir birch aspen summer/winter silhouettes with one material',()=>{
  const d=style.diagnostics();assert.equal(d.id,R21_PRESENTATION);assert.deepEqual(d.models,[...R21_MODELS]);assert.deepEqual(R21_MODELS,['black-spruce','balsam-fir','paper-birch','trembling-aspen']);
  assert.equal(d.sharedMaterials,1);assert.equal(d.transparent,false);assert.equal(d.mix.measuredHabitatPercent,false);
  assert.equal(d.summerTriangles.length,4);assert.equal(d.winterTriangles.length,4);
  for(const n of [...d.summerTriangles,...d.winterTriangles])assert.ok(n>=40&&n<=500,n);
  assert.ok(d.winterTriangles[0]>d.summerTriangles[0]);assert.ok(d.winterTriangles[1]>d.summerTriangles[1]);
  assert.ok(d.winterTriangles[2]<d.summerTriangles[2]);assert.ok(d.winterTriangles[3]<d.summerTriangles[3]);
  const assets=[];for(const season of ['summer','winter'])for(let f=0;f<4;f++)assets.push(style.asset(f,season));assert.equal(new Set(assets.map(a=>a.material)).size,1);
  assert.match(d.scope,/black spruce \+ balsam fir dominant/);
});
const group=new THREE.Group(),base=new THREE.BufferGeometry();
base.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));
base.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array([0,0,1,0,0,1,0,0,1]),3));
base.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array([.1,.2,.1,.1,.2,.1,.1,.2,.1]),3));
const material=new THREE.MeshLambertMaterial({vertexColors:true});
const source=new THREE.InstancedMesh(base,material,700);source.name='source';source.matrixAutoUpdate=false;source.updateMatrix();source.boundingSphere=new THREE.Sphere(new THREE.Vector3(240,10,240),380);
for(let i=0;i<700;i++){const m=new THREE.Matrix4();m.makeRotationY((i%17)*.11);m.scale(new THREE.Vector3(7+i%5,10+i%7,7+i%5));m.setPosition((i%30)*14.5,i%19*.12,Math.floor(i/30)*19.2);source.setMatrixAt(i,m);}
source.instanceMatrix.needsUpdate=true;group.add(source);const before=source.instanceMatrix.array.slice();
const presentation=createBorealDiversityPresentation({THREE,group,source,proof:{profileId:'r13-manic-boreal',ecoregionId:373,count:1744,cx:0,cz:0,key:'0:0'},style,season:'summer',now:()=>0});
group.updateMatrixWorld(true);
check('actual Three presentation preserves source matrices and splits one pass into four researched boreal families',()=>{
  const d=presentation.diagnostics(),a=presentation.audit();assert.equal(source.visible,false);assert.equal(group.children.length,5);assert.deepEqual(source.instanceMatrix.array,before);assert.equal(d.instances,700);
  assert.equal(Object.values(d.models).reduce((s,n)=>s+o½,0),700);for(const id of R21_MODELS)assert.ok(d.models[id]>0,id);assert.equal(d.potentialAdditionalDrawCalls,3);assert.ok(a.sourcePrefixExact&&a.sourceHidden);assert.equal(a.parts.length,4);
});
check('visible prefix controls all families without adding or moving roots',()=>{for(const n of [0,1,37,128,299,700]){source.count=n;group.updateMatrixWorld(true);const a=presentation.audit();assert.ok(a.sourcePrefixExact);assert.equal(a.instances,n);}});
check('summer winter switches preserve counts and exact source matrices through repeated round trips',()=>{
  source.count=700;group.updateMatrixWorld(true);const summer=presentation.audit();assert.equal(summer.season,'summer');
  assert.equal(presentation.setSeason('winter'),true);group.updateMatrixWorld(true);const winter=presentation.audit();assert.equal(winter.season,'winter');assert.equal(winter.instances,summer.instances);assert.ok(winter.sourcePrefixExact);
  assert.notDeepEqual(winter.parts.map(p=>p.triangles),summer.parts.map(p=>p.triangles));
  for(let i=0;i<50;i++){assert.equal(presentation.setSeason('summer'),true);assert.equal(presentation.setSeason('winter'),true);}assert.ok(presentation.audit().sourcePrefixExact);
  assert.equal(presentation.setSeason('summer'),true);
});
check('height refresh stays byte-exact to authoritative source matrices',()=>{
  for(let i=0;i<700;i++)source.instanceMatrix.array[i*16+13]+=2.5;source.instanceMatrix.needsUpdate=true;group.updateMatrixWorld(true);assert.ok(presentation.audit().sourcePrefixExact);
});
check('restore removes only owned meshes and restores original R4 source',()=>{assert.equal(presentation.restore(),true);assert.equal(source.visible,true);assert.equal(group.children.length,1);assert.equal(group.children[0],source);});
style.dispose();base.dispose();material.dispose();
const report={status:'PASS',groups:cases.length,cases,partition:partition.indices.map(a=>a.length),style:style.diagnostics(),threeRevision:THREE.REVISION};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'PASS',groups:cases.length,partition:report.partition}));
