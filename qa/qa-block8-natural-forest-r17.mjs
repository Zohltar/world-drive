import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import {buildR17Atlas,buildR17TreeData,buildNaturalForestStyle,r17Tint,R17_LOOK} from '../tools/biomes/natural-forest-look-r17.mjs';
import {buildSeasonalVegetationPrototypes} from '../tools/biomes/vegetation-seasonal-prototypes.mjs';
import {createMixedForestPresentation} from '../tools/biomes/mixed-forest-presentation-r16.mjs';
import {validateR12Config} from '../tools/biomes/rendered-pilot-r12.mjs';
import {R12_SOURCE,R12_CATALOG_SHA} from '../tools/biomes/rendered-pilot-policy-r12.mjs';
const tests=[];const test=(name,fn)=>{fn();tests.push(name);console.log('PASS',name);};
const hash=a=>crypto.createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const kit=buildSeasonalVegetationPrototypes(THREE),saved=kit.assets.map(a=>hash(a.parts[0].geometry.attributes.position.array));
const style=buildNaturalForestStyle(THREE,kit);
const proof={profileId:'r12-nord-rendered',ecoregionId:686,count:1744,cx:-2,cz:3,key:'-2:3'};
function setup(capacity=1744){
 const group=new THREE.Group(),base=kit.assets[0].parts[0],source=new THREE.InstancedMesh(base.geometry,base.material,capacity);
 source.matrixAutoUpdate=false;source.boundingSphere=new THREE.Sphere(new THREE.Vector3(240,12,240),380);
 const matrix=new THREE.Matrix4();for(let i=0;i<capacity;i++){matrix.makeScale(10+i%5,12+i%4,10+i%5);matrix.setPosition((i*7.7)%475,i%9,(i*13.9)%477);source.setMatrixAt(i,matrix);}
 source.instanceMatrix.needsUpdate=true;group.add(source);
 const original=source.instanceMatrix.array.slice(),presentation=createMixedForestPresentation({THREE,group,source,kit,style,proof,season:'summer'});
 return {group,source,original,presentation,parts:group.children.slice(1)};
}
test('finite deterministic geometry, non-degenerate faces and unit foliage normals',()=>{
 for(const f of [0,1]){const d=buildR17TreeData(f),again=buildR17TreeData(f);
  assert.deepEqual(d,again);assert.ok(d.triangles>68&&d.triangles<=400);assert.equal(d.positions.length,d.triangles*9);
  assert.equal(d.normals.length,d.positions.length);assert.equal(d.colors.length,d.positions.length);assert.equal(d.uvs.length,d.positions.length*2/3);
  for(const a of [d.positions,d.normals,d.colors,d.uvs])assert.ok(a.every(Number.isFinite));
  for(let i=0;i<d.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...d.normals.slice(i,i+3))-1)<1e-6);
  for(let i=0;i<d.positions.length;i+=9){const a=new THREE.Vector3().fromArray(d.positions,i),b=new THREE.Vector3().fromArray(d.positions,i+3),c=new THREE.Vector3().fromArray(d.positions,i+6);assert.ok(b.sub(a).cross(c.sub(a)).length()>1e-10);}
 }
});
test('height and footprint remain within the conservative tree envelope',()=>{
 for(const f of [0,1]){const d=buildR17TreeData(f);let top=0,r=0,bottom=Infinity;
  for(let i=0;i<d.positions.length;i+=3){top=Math.max(top,d.positions[i+1]);bottom=Math.min(bottom,d.positions[i+1]);r=Math.max(r,Math.hypot(d.positions[i],d.positions[i+2]));}
  assert.ok(Math.abs(top-1.9584)<1e-6);assert.ok(bottom>=-1e-6);assert.ok(r<.81);
 }
});
test('single padded RGBA atlas has deterministic leaf and needle silhouettes',()=>{
 const a=buildR17Atlas();assert.equal(a.data.byteLength,262144);assert.deepEqual(a,buildR17Atlas());
 for(const x0 of [0,128]){let solid=0,empty=0;for(let y=0;y<128;y++)for(let x=x0;x<x0+128;x++){const n=a.data[(y*256+x)*4+3];solid+=n>=90;empty+=n===0;}assert.ok(solid>1000&&empty>1000);}
 for(let y=185;y<228;y++)for(let x=25;x<69;x++)assert.equal(a.data[(y*256+x)*4+3],255);
});
test('all UVs are finite atlas coordinates with a fully opaque bark swatch',()=>{
 for(const f of [0,1]){const d=buildR17TreeData(f);assert.ok(d.uvs.every(v=>v>=0&&v<=1));assert.ok(d.uvs.some(v=>v===.8125));}
});
test('no copied photograph, file fetch, canvas or unseeded random in authored assets',()=>{
 const text=fs.readFileSync(new URL('../tools/biomes/natural-forest-look-r17.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(text,/\bfetch\s*\(|new\s+Image\b|Math\.random\s*\(|document\./);
});
test('R17 is explicit and cannot replace homogeneous or foreign-region modes',()=>{
 const directory={revision:'resolve2017-r12-nord-rendered',source:R12_SOURCE,catalogSha256:R12_CATALOG_SHA};
 const c={directory,baseUrl:'http://example.invalid/',presentation:'mixed-r16',appearance:R17_LOOK};
 assert.equal(validateR12Config(c).appearance,R17_LOOK);
 assert.throws(()=>validateR12Config({...c,presentation:undefined}));assert.throws(()=>validateR12Config({...c,appearance:'anything'}));
 assert.throws(()=>validateR12Config({...c,profile:'r13-manic-boreal',directory:{...directory,revision:'resolve2017-r13-manic-rendered'}}));
});
test('two summer families share one cutout material and atlas, without alpha blending',()=>{
 const a=style.asset(0,'summer'),b=style.asset(1,'summer');assert.equal(a.material,b.material);assert.equal(a.material.map,b.material.map);
 assert.ok(a.geometry!==kit.assets[1].parts[0].geometry);assert.ok(a.material.alphaTest>0);assert.equal(a.material.transparent,false);assert.equal(a.material.depthWrite,true);
 assert.equal(a.material.side,THREE.DoubleSide);assert.equal(a.material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(a.material.map.generateMipmaps,true);
});
test('winter assets remain exactly the accepted snow/bare-branch geometry',()=>{
 for(const f of [0,1]){const a=style.asset(f,'winter');assert.equal(a.geometry,kit.assets.find(b=>b.id===a.id).parts[0].geometry);assert.equal(a.material,null);}
 assert.throws(()=>style.asset(2,'summer'));assert.throws(()=>style.asset(0,'autumn'));
});
test('natural palette keeps exact instance transforms, counts, family and source material',()=>{
 const h=setup();h.group.updateMatrixWorld(true);const d=h.presentation.audit();
 assert.ok(d.sourcePrefixExact&&d.sourceMaterialUnchanged&&d.sourceGeometryUnchanged);assert.equal(d.appearance,R17_LOOK);
 assert.equal(h.parts.length,2);assert.ok(h.parts.every(p=>p.material===style.asset(0,'summer').material));
 assert.deepEqual(h.source.instanceMatrix.array,h.original);assert.equal(h.source.instanceColor,null);assert.equal(h.source.material,kit.assets[0].parts[0].material);
 assert.ok(d.accountedBytes*128<22*1024*1024);assert.equal(d.potentialAdditionalDrawCalls,1);h.presentation.restore();
});
test('every visible-prefix count partitions the same source trees in the textured renderer',()=>{
 const h=setup(256);for(let count=0;count<=256;count++){h.source.count=count;h.group.updateMatrixWorld(true);const d=h.presentation.audit();assert.ok(d.sourcePrefixExact);assert.equal(d.parts.reduce((s,p)=>s+p.count,0),count);}h.presentation.restore();
});
test('height refresh updates only presentation transforms, never shade or family identity',()=>{
 const h=setup(256),before=h.presentation.audit();for(let i=0;i<256;i++)h.source.instanceMatrix.array[i*16+13]+=9;
 h.source.instanceMatrix.needsUpdate=true;h.group.updateMatrixWorld(true);const after=h.presentation.audit();assert.ok(after.sourcePrefixExact);assert.equal(after.syncs,before.syncs+1);
 assert.deepEqual(after.parts.map(p=>p.colorHash),before.parts.map(p=>p.colorHash));h.presentation.restore();
});
test('steady-state frames do not rebuild matrices, atlas or instance colors',()=>{
 const h=setup(300),versions=h.parts.map(p=>[p.instanceMatrix.version,p.instanceColor.version]),data=h.parts.map(p=>p.instanceColor.array);
 for(let i=0;i<200;i++)h.group.updateMatrixWorld(true);
 assert.deepEqual(h.parts.map(p=>[p.instanceMatrix.version,p.instanceColor.version]),versions);h.parts.forEach((p,i)=>assert.equal(p.instanceColor.array,data[i]));assert.equal(h.presentation.diagnostics().syncs,1);h.presentation.restore();
});
test('100 seasonal switches restore exact summer colors and untinted approved winter forms',()=>{
 const h=setup(300),before=h.presentation.audit(),summerColors=h.parts.map(p=>hash(p.instanceColor.array));
 for(let i=0;i<100;i++){
  h.presentation.setSeason('winter');assert.ok(h.parts.every(p=>p.instanceColor.array.every(v=>v===1)&&p.material===h.source.material));assert.ok(h.presentation.audit().sourcePrefixExact);
  h.presentation.setSeason('summer');assert.deepEqual(h.parts.map(p=>hash(p.instanceColor.array)),summerColors);
 }
 assert.deepEqual(h.presentation.audit().parts,before.parts);assert.deepEqual(h.source.instanceMatrix.array,h.original);h.presentation.restore();
});
test('position-derived tint is stable and varies across trees without frame-time work',()=>{
 const values=[];for(let i=0;i<100;i++){const a=r17Tint(-2,3,i*3.1,i*8.2);assert.deepEqual(a,r17Tint(-2,3,i*3.1,i*8.2));assert.ok(a.every(v=>Number.isFinite(v)&&v>.6&&v<1.2));values.push(a[0]);}assert.ok(new Set(values).size>90);
});
test('OFF removes only owned meshes and restores the original scene',()=>{
 const h=setup(300);let freed=0;h.parts.forEach(p=>p.addEventListener('dispose',()=>freed++));h.presentation.restore();h.presentation.restore();assert.equal(freed,2);assert.equal(h.source.visible,true);assert.deepEqual(h.group.children,[h.source]);assert.deepEqual(h.source.instanceMatrix.array,h.original);
});
test('foreign ownership retains the original safety fallback with natural materials',()=>{
 const h=setup(80),foreign=new THREE.MeshBasicMaterial();h.source.material=foreign;assert.equal(h.presentation.sync(),false);h.presentation.restore();assert.equal(h.source.material,foreign);assert.equal(h.source.visible,true);foreign.dispose();
});
test('all approved asset buffers remain untouched after the new style and lifecycle tests',()=>{
 assert.deepEqual(kit.assets.map(a=>hash(a.parts[0].geometry.attributes.position.array)),saved);
});
test('new shared geometries, texture and material have idempotent separate disposal',()=>{
 let n=0;for(const x of [style.asset(0,'summer').geometry,style.asset(1,'summer').geometry,style.asset(0,'summer').material,style.asset(0,'summer').material.map])x.addEventListener('dispose',()=>n++);
 style.dispose();style.dispose();assert.equal(n,4);assert.throws(()=>style.asset(0,'summer'),/disposed/);assert.deepEqual(kit.assets.map(a=>hash(a.parts[0].geometry.attributes.position.array)),saved);
});
kit.dispose();const report={status:'PASS',groups:tests.length,tests,threeRevision:THREE.REVISION,summerTriangles:[250,380],atlasBytes:262144,scope:'Pure and actual Three object tests, not full-game visual acceptance or GPU performance certification'};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
