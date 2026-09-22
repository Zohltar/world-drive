import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {R20_PRESENTATION,R20_MODELS,r20Family,partitionR20,buildHumidMontaneStyle,createHumidMontanePresentation}
  from '../tools/biomes/humid-montane-presentation-r20.mjs';

const cases=[];function check(name,fn){fn();cases.push(name);}
check('R20 family selection is deterministic and broadleaf-dominant without claiming measured cover',()=>{
  const counts=[0,0,0,0];
  for(let i=0;i<12000;i++){const f=r20Family(-7,11,i*.137,i*.293);counts[f]++;assert.equal(f,r20Family(-7,11,i*.137,i*.293));}
  assert.ok(counts[0]>5400&&counts[0]<6100,counts);assert.ok(counts[1]>2350&&counts[1]<2900,counts);assert.ok(counts[2]>2150&&counts[2]<2700,counts);assert.ok(counts[3]>1000&&counts[3]<1450,counts);
});
const matrices=new Float32Array(1744*16);
for(let i=0;i<1744;i++){const o=i*16;matrices[o]=matrices[o+5]=matrices[o+10]=matrices[o+15]=1;matrices[o+12]=(i%44)*9.7;matrices[o+13]=i%19*.1;matrices[o+14]=Math.floor(i/44)*10.3;}
const partition=partitionR20(matrices,0,0);
check('partition owns every original root exactly once with visible-prefix tables',()=>{
  assert.equal(partition.indices.reduce((s,a)=>s+a.length,0),1744);assert.equal(new Set(partition.indices.flatMap(a=>[...a])).size,1744);
  for(let n=0;n<=1744;n+=109)assert.equal(partition.prefix.reduce((s,p)=>s+p[n],0),n);
});
const style=buildHumidMontaneStyle(THREE);
check('humid montane assets expose Yungas broadleaf epiphyte tree-fern and bamboo cues with one material',()=>{
  const d=style.diagnostics();assert.equal(d.id,R20_PRESENTATION);assert.deepEqual(d.models,[...R20_MODELS]);assert.deepEqual(d.triangles,[196,252,1052,96]);
  assert.deepEqual(R20_MODELS,['humid-montane-broadleaf','epiphyte-cloud-tree','tree-fern','bamboo-clump']);assert.equal(d.sharedMaterials,1);assert.equal(d.transparent,false);
  const a=[0,1,2,3].map(f=>style.asset(f));assert.equal(new Set(a.map(x=>x.material)).size,1);assert.ok(a[0].geometry.boundingBox.max.y>1);assert.ok(a[1].geometry.boundingBox.max.y>1);
  assert.ok(a[2].geometry.boundingBox.max.y>=.58&&a[2].geometry.boundingBox.max.y<=.65);assert.ok(d.treeFernSilhouette.height>=.58&&d.treeFernSilhouette.height<=.65);assert.ok(d.treeFernSilhouette.diameterX>=1.05&&d.treeFernSilhouette.diameterX<=1.12&&d.treeFernSilhouette.diameterZ>=1.05&&d.treeFernSilhouette.diameterZ<=1.12);assert.equal(d.treeFernSilhouette.fronds,20);assert.equal(d.treeFernSilhouette.segments,9);assert.equal(d.treeFernSilhouette.pinnae,320);assert.ok(d.treeFernSilhouette.pinnaNearCrownFullWidth>=.13);assert.ok(d.treeFernSilhouette.pinnaOuterFullWidth>=.12);assert.deepEqual(d.visualScales,[[.88,.86,.88],[1.10,1.18,1.10],[.56,.56,.56],[.80,.78,.80]]);assert.ok(a[3].geometry.boundingBox.max.y>.75);assert.match(d.scope,/prominent tree ferns/);assert.equal(d.mix.treeFernVisualWeight,20);assert.equal(d.mix.measuredHabitatPercent,false);assert.equal(d.mix.altitudeZonation,false);
});
const group=new THREE.Group(),base=new THREE.BufferGeometry();
base.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));
base.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array([0,0,1,0,0,1,0,0,1]),3));
base.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array([.1,.2,.1,.1,.2,.1,.1,.2,.1]),3));
const material=new THREE.MeshLambertMaterial({vertexColors:true});
const source=new THREE.InstancedMesh(base,material,700);source.name='source';source.matrixAutoUpdate=false;source.updateMatrix();source.boundingSphere=new THREE.Sphere(new THREE.Vector3(240,10,240),380);
for(let i=0;i<700;i++){const m=new THREE.Matrix4();m.makeRotationY((i%17)*.11);m.scale(new THREE.Vector3(7+i%5,10+i%7,7+i%5));m.setPosition((i%30)*14.5,i%19*.12,Math.floor(i/30)*19.2);source.setMatrixAt(i,m);}
source.instanceMatrix.needsUpdate=true;group.add(source);const before=source.instanceMatrix.array.slice();
const presentation=createHumidMontanePresentation({THREE,group,source,proof:{profileId:'r15-yungas-tropical',ecoregionId:444,count:1744,cx:0,cz:0,key:'0:0'},style,now:()=>0});
group.updateMatrixWorld(true);
check('actual Three presentation preserves source matrices and splits one pass into four researched Yungas families',()=>{
  const d=presentation.diagnostics(),a=presentation.audit();assert.equal(source.visible,false);assert.equal(group.children.length,5);assert.deepEqual(source.instanceMatrix.array,before);assert.equal(d.instances,700);
  assert.equal(Object.values(d.models).reduce((s,n)=>s+n,0),700);for(const id of R20_MODELS)assert.ok(d.models[id]>0,id);assert.equal(d.potentialAdditionalDrawCalls,3);assert.ok(a.sourcePrefixExact&&a.sourceHidden);assert.equal(a.parts.length,4);
});
check('source visible prefix controls all four families without new roots',()=>{for(const n of [0,1,37,128,299,700]){source.count=n;group.updateMatrixWorld(true);const a=presentation.audit();assert.ok(a.sourcePrefixExact);assert.equal(a.instances,n);}});
check('height and transform refresh stay byte-exact to source matrices',()=>{
  source.count=700;for(let i=0;i<700;i++)source.instanceMatrix.array[i*16+13]+=2.5;source.instanceMatrix.needsUpdate=true;group.updateMatrixWorld(true);assert.ok(presentation.audit().sourcePrefixExact);
});
check('unsupported winter is rejected without destroying the active humid presentation',()=>{const beforeAudit=presentation.audit();assert.equal(presentation.setSeason('winter'),false);assert.deepEqual(presentation.audit(),beforeAudit);assert.equal(source.visible,false);});
check('restore removes only owned meshes and restores the original source',()=>{assert.equal(presentation.restore(),true);assert.equal(source.visible,true);assert.equal(group.children.length,1);assert.equal(group.children[0],source);});
style.dispose();base.dispose();material.dispose();
const report={status:'PASS',groups:cases.length,cases,partition:partition.indices.map(a=>a.length),style:style.diagnostics(),threeRevision:THREE.REVISION};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'PASS',groups:cases.length,partition:report.partition}));
