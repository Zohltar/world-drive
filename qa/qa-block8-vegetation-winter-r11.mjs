/** Winter authoring QA uses actual pinned Three.js, not a geometry mock. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {buildVegetationPrototypes} from '../tools/biomes/vegetation-prototypes.mjs';
import {buildSeasonalVegetationPrototypes} from '../tools/biomes/vegetation-seasonal-prototypes.mjs';
import {WINTER_VARIANTS,seasonalVegetationId,buildWinterVegetationData} from '../tools/biomes/vegetation-winter-data.mjs';
const groups=[];
function test(name,fn){fn();groups.push(name);}
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const hash=a=>createHash('sha256').update(bytes(a)).digest('hex');
function geometryFingerprint(g){return JSON.stringify(Object.fromEntries([
  ...Object.entries(g.attributes).map(([k,a])=>[k,hash(a.array)]),['index',g.index?hash(g.index.array):null]
]));}
const original=buildVegetationPrototypes(THREE),kit=buildSeasonalVegetationPrototypes(THREE);
const source=original.assets[0].parts[0].geometry;
const reference={positions:source.attributes.position.array,colors:source.attributes.color.array,indices:source.index.array};
const sourceBefore=geometryFingerprint(source);
const measured=[];
try {
 test('Exactly four scoped winter variants; no tropical or dry-woodland winter',()=>{
  assert.equal(WINTER_VARIANTS.length,4);assert.equal(kit.assets.length,10);
  assert.equal(kit.summerAssets.length,6);assert.equal(kit.winterAssets.length,4);
  assert.equal(seasonalVegetationId('preview-tropical','winter'),null);
  assert.equal(seasonalVegetationId('preview-woodland','winter'),null);
 });
 test('Strict deterministic seasonal mapping',()=>{
  for(const a of original.assets)assert.equal(seasonalVegetationId(a.id,'summer'),a.id);
  for(const d of WINTER_VARIANTS)assert.equal(seasonalVegetationId(d.baseId,'winter'),d.id);
  for(const input of ['',null,{},'__proto__'])assert.throws(()=>seasonalVegetationId(input,'winter'),TypeError);
  for(const season of ['',null,{},'autumn'])assert.throws(()=>seasonalVegetationId('preview-conifer',season),TypeError);
  assert.throws(()=>kit.getAssets('autumn'),TypeError);
 });
 test('The six approved summer models remain byte-identical',()=>{
  for(let i=0;i<6;i++)assert.equal(geometryFingerprint(kit.summerAssets[i].parts[0].geometry),geometryFingerprint(original.assets[i].parts[0].geometry));
 });
 test('Isolated frozen winter descriptors; no production approval',()=>{
  assert.ok(Object.isFrozen(WINTER_VARIANTS));
  for(const d of WINTER_VARIANTS){assert.ok(Object.isFrozen(d));assert.equal(d.productionApproved,false);assert.equal(d.placementAuthority,false);assert.equal(d.season,'winter');assert.equal(d.species,null);}
 });
 test('Single shared opaque untextured material across all ten assets',()=>{
  const mats=new Set();
  for(const a of kit.assets){assert.equal(a.parts.length,1);const m=a.parts[0].material;mats.add(m);
   assert.equal(m.transparent,false);assert.equal(m.alphaTest,0);assert.equal(m.map,null);assert.equal(m.side,THREE.FrontSide);assert.equal(m.vertexColors,true);}
  assert.equal(mats.size,1);
 });
 for(const d of WINTER_VARIANTS) {
  const asset=kit.winterAssets.find(a=>a.id===d.id),g=asset.parts[0].geometry;
  const data=buildWinterVegetationData(d.id,reference);
  test(`${d.id}: finite, bounded, repeatable geometry and exact triangle budget`,()=>{
   const repeat=buildWinterVegetationData(d.id,reference);
   assert.equal(data.triangles,d.triangles);assert.ok(data.triangles<=192);
   assert.equal(g.attributes.position.count/3,d.triangles);
   assert.equal(data.positions.length,data.normals.length);assert.equal(data.positions.length,data.colors.length);
   for(const k of ['positions','normals','colors']){assert.ok(data[k].every(Number.isFinite));assert.deepEqual(data[k],repeat[k]);assert.notEqual(data[k].buffer,repeat[k].buffer);}
   assert.ok(data.colors.every(v=>v>=0&&v<=1));
   assert.deepEqual(data.surfaces,repeat.surfaces);
  });
  test(`${d.id}: unit outward-winding normals and containing bounds`,()=>{
   const p=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),v=new THREE.Vector3();
   for(let i=0;i<g.attributes.position.count;i+=3){
    p.fromBufferAttribute(g.attributes.position,i);b.fromBufferAttribute(g.attributes.position,i+1);c.fromBufferAttribute(g.attributes.position,i+2);
    normal.copy(b).sub(p).cross(v.copy(c).sub(p)).normalize();
    const stored=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i);
    assert.ok(Math.abs(stored.length()-1)<1e-5);assert.ok(normal.dot(stored)>.9999);
    if(data.surfaces[i/3]==='snow')assert.ok(stored.y>0,'Snow must be on an upward-facing surface');
   }
   for(let i=0;i<g.attributes.position.count;i++){
    p.fromBufferAttribute(g.attributes.position,i);assert.ok(g.boundingBox.containsPoint(p));
    assert.ok(p.distanceTo(g.boundingSphere.center)<=g.boundingSphere.radius+1e-5);
   }
   assert.ok(g.boundingBox.min.y>=-1e-6);assert.ok(g.boundingSphere.radius>0);
  });
  test(`${d.id}: actual snow with retained non-snow surfaces`,()=>{
   assert.ok(data.surfaces.includes('snow'));assert.ok(data.surfaces.some(s=>s!=='snow'));
   for(let i=0;i<data.surfaces.length;i++)if(data.surfaces[i]==='snow')assert.ok(data.colors[i*9]>.7);
   if(d.leafless){assert.ok(data.surfaces.every(s=>s==='wood'||s==='snow'));assert.ok(!data.surfaces.includes('needles'));}
   if(d.kind==='rock'){assert.ok(data.surfaces.includes('stone'));assert.ok(data.surfaces.includes('ice'));}
  });
  test(`${d.id}: instancing uses shared geometry without geometry multiplication`,()=>{
   const mesh=new THREE.InstancedMesh(g,asset.parts[0].material,8);
   for(let i=0;i<8;i++)mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(i,0,0));
   assert.equal(mesh.geometry,g);assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));mesh.dispose();
  });
  measured.push({id:d.id,triangles:data.triangles,snowTriangles:data.surfaces.filter(s=>s==='snow').length,
   geometryBytes:Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0),height:g.boundingBox.max.y,fingerprint:geometryFingerprint(g)});
 }
 test('Conifer snow reaches exposed skirts rather than being hidden by the next layer',()=>{
  const data=buildWinterVegetationData('preview-conifer-winter',reference);
  for(let f=0;f<56;f++){
   const ringY=reference.positions[reference.indices[36+f*3]*3+1];
   const apexY=reference.positions[reference.indices[37+f*3]*3+1];
   const snowY=data.positions[(12+f*3+2)*9+1];
   const ratio=(snowY-ringY)/(apexY-ringY);
   assert.ok(ratio>=.08&&ratio<=.16,'Snow cap must occupy the visible portion of each overlapping skirt');
  }
 });
 test('Winter preparation never mutates the original conifer',()=>assert.equal(geometryFingerprint(source),sourceBefore));
 test('Conifer and rock winter keep summer geometry extrema',()=>{
  for(const id of ['preview-conifer','preview-rock']){
   const base=kit.summerAssets.find(a=>a.id===id).parts[0].geometry.boundingBox;
   const winter=kit.winterAssets.find(a=>a.baseId===id).parts[0].geometry.boundingBox;
   assert.ok(base.min.distanceTo(winter.min)<1e-6);assert.ok(base.max.distanceTo(winter.max)<1e-6);
  }
 });
 test('Bare tree and shrub keep the approved height',()=>{
  for(const id of ['preview-temperate','preview-shrub']){
   const a=kit.summerAssets.find(a=>a.id===id),b=kit.winterAssets.find(a=>a.baseId===id);
   assert.ok(Math.abs(a.parts[0].geometry.boundingBox.max.y-b.parts[0].geometry.boundingBox.max.y)<1e-5);
  }
 });
 test('Invalid original buffers and unsupported winter variants are rejected',()=>{
  for(const r of [null,{}, {...reference,positions:new Float32Array([NaN])}, {...reference,indices:new Uint16Array(204).fill(999)}])assert.throws(()=>buildWinterVegetationData('preview-conifer-winter',r),TypeError);
  for(const id of ['preview-tropical-winter','preview-woodland-winter','',null])assert.throws(()=>buildWinterVegetationData(id,reference),TypeError);
 });
 test('One hundred rebuilds produce the same owned buffers',()=>{
  for(let i=0;i<100;i++)for(const d of WINTER_VARIANTS){const data=buildWinterVegetationData(d.id,reference);const g=kit.winterAssets.find(a=>a.id===d.id).parts[0].geometry;assert.equal(hash(data.positions),hash(g.attributes.position.array));}
 });
 test('Repeated seasonal selection retains exactly ten owned assets',()=>{
  for(let i=0;i<10000;i++)assert.equal(kit.getAssets(i%2?'summer':'winter'),i%2?kit.summerAssets:kit.winterAssets);
  assert.equal(kit.assets.length,10);
 });
 test('Disposal is idempotent and releases each geometry and shared material once',()=>{
  let geometries=0,materials=0;
  for(const a of kit.assets)a.parts[0].geometry.addEventListener('dispose',()=>geometries++);
  kit.assets[0].parts[0].material.addEventListener('dispose',()=>materials++);
  kit.dispose();kit.dispose();assert.equal(geometries,10);assert.equal(materials,1);
  assert.throws(()=>kit.getAssets('winter'),/disposed/);
 });
 const report={status:'PASS',groups:groups.length,tests:groups,models:measured,
  totalWinterTriangles:measured.reduce((n,m)=>n+m.triangles,0),totalWinterGeometryBytes:measured.reduce((n,m)=>n+m.geometryBytes,0),
  THREE:THREE.REVISION,scope:'Isolated authoring geometry/season selection. Not driving or seasonal ecology.'};
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
} finally {kit.dispose();original.dispose();}
