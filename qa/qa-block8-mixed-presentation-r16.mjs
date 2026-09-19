import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {partitionR16,r16Family,createMixedForestPresentation} from '../tools/biomes/mixed-forest-presentation-r16.mjs';
import {readR16Directory,start as launchR16,stop as stopR16} from '../tools/biomes/mixed-pilot-launcher-r16.mjs';
import {validateR12Config} from '../tools/biomes/rendered-pilot-r12.mjs';
import {R12_SOURCE,R12_CATALOG_SHA} from '../tools/biomes/rendered-pilot-policy-r12.mjs';
const tests=[];async function test(name,fn){await fn();tests.push(name);console.log('PASS',name);}
function matrices(n){const a=new Float32Array(n*16);for(let i=0;i<n;i++){
  a[i*16]=1+(i%7)/10;a[i*16+5]=1+(i%5)/10;a[i*16+10]=a[i*16];a[i*16+15]=1;
  a[i*16+12]=((i*7919)%47000)/100;a[i*16+13]=(i%31)-2;a[i*16+14]=((i*104729)%48000)/100;
}return a;}
class Attribute{constructor(n){this.array=new Float32Array(n*16);this.version=0;}set needsUpdate(v){if(v)this.version++;}setUsage(){}}
class Group{constructor(){this.children=[];this.parent=null;this.visible=true;this.matrixAutoUpdate=false;
  this.matrix={elements:Array.from({length:16},(_,i)=>i%5===0?1:0)};this.layers={mask:1};}
  add(m){m.parent?.remove(m);this.children.push(m);m.parent=this;}
  remove(m){this.children=this.children.filter(x=>x!==m);m.parent=null;}
  updateMatrixWorld(){for(const c of this.children)c.updateMatrixWorld?.();}}
class Mesh extends Group{constructor(geometry,material,n){super();this.geometry=geometry;this.material=material;
  this.instanceMatrix=new Attribute(n);this.count=n;this.disposeCount=0;this.boundingSphere={radius:380};}
  dispose(){this.disposeCount++;}}
const THREE={InstancedMesh:Mesh,DynamicDrawUsage:35048};
const kit={assets:['preview-temperate','preview-conifer','preview-temperate-winter','preview-conifer-winter']
  .map(id=>({id,parts:[{geometry:{attributes:{position:{count:180}},index:null}}]}))};
const proof={profileId:'r12-nord-rendered',ecoregionId:686,count:1744,cx:-2,cz:3,key:'-2:3'};
function setup(n=1744){const group=new Group(),source=new Mesh({}, {}, n);source.instanceMatrix.array.set(matrices(n));group.add(source);
  const original=source.instanceMatrix.array.slice();const p=createMixedForestPresentation({THREE,group,source,kit,proof,season:'summer',now:()=>0});
  return {group,source,p,original,parts:()=>group.children.filter(x=>x!==source)};}
await test('deterministic partition has exactly one family per original matrix',()=>{
  const a=matrices(1744),p=partitionR16(a,-2,3);assert.equal(p.capacity,1744);
  const ids=[...p.indices[0],...p.indices[1]].sort((a,b)=>a-b);assert.deepEqual(ids,Array.from({length:1744},(_,i)=>i));
  assert.ok(p.indices[0].length>1100&&p.indices[1].length>300);
  assert.deepEqual(partitionR16(a,-2,3),p);
  for(let n=0;n<=1744;n++)assert.equal(p.prefix[0][n]+p.prefix[1][n],n);
});
await test('family uses horizontal position, not height, visible prefix or input order',()=>{
  const a=matrices(512),p=partitionR16(a,2,-3);for(let i=0;i<512;i++)a[i*16+13]+=1000;
  assert.deepEqual(partitionR16(a,2,-3),p);
  const b=new Float32Array(a.length);for(let i=0;i<512;i++)b.set(a.subarray(i*16,i*16+16),(511-i)*16);
  const q=partitionR16(b,2,-3);for(let f=0;f<2;f++)assert.deepEqual([...q.indices[f]].map(i=>511-i).sort((a,b)=>a-b),[...p.indices[f]]);
});
await test('partition rejects invalid input, nonfinite transforms and excess capacity',()=>{
  for(const a of [[],new Float64Array(16),new Float32Array(0),new Float32Array(17),new Float32Array(1745*16)])assert.throws(()=>partitionR16(a,0,0));
  for(const bad of [NaN,Infinity]){const a=matrices(1);a[13]=bad;assert.throws(()=>partitionR16(a,0,0));}
  for(const bad of [NaN,Infinity,1.1])assert.throws(()=>r16Family(bad,0,1,1));
});
await test('mixed mode is opt-in and rejects other profiles before presentation changes',()=>{
  const directory={revision:'resolve2017-r12-nord-rendered',source:R12_SOURCE,catalogSha256:R12_CATALOG_SHA};
  const c={directory,baseUrl:'http://example.invalid/',presentation:'mixed-r16'};
  assert.equal(validateR12Config(c).presentation,'mixed-r16');
  assert.throws(()=>validateR12Config({...c,presentation:'arbitrary'}));
  assert.throws(()=>validateR12Config({...c,profile:'r13-manic-boreal',directory:{...directory,revision:'resolve2017-r13-manic-rendered'}}));
});
await test('source geometry, matrix bytes, material, count and bounds stay authoritative',()=>{
  const h=setup(),d=h.p.audit();assert.equal(h.group.children.length,3);assert.equal(h.source.visible,false);
  assert.ok(d.sourcePrefixExact&&d.sourceGeometryUnchanged&&d.sourceAttributeUnchanged&&d.sourceMaterialUnchanged);
  assert.deepEqual(h.source.instanceMatrix.array,h.original);assert.equal(h.source.count,1744);
  for(const m of h.parts()){assert.equal(m.material,h.source.material);assert.equal(m.boundingSphere,h.source.boundingSphere);assert.equal(m.matrix,h.source.matrix);}
  assert.equal(d.potentialAdditionalDrawCalls,1);assert.ok(d.accountedBytes<128*1024);h.p.restore();
});
await test('every R4 visible prefix partitions exactly, including zero and full density',()=>{
  const h=setup(256);for(let n=0;n<=256;n++){h.source.count=n;h.group.updateMatrixWorld();
    const d=h.p.audit();assert.ok(d.sourcePrefixExact);assert.equal(d.parts.reduce((s,p)=>s+p.count,0),n);}
  h.p.restore();assert.equal(h.source.count,256);assert.deepEqual(h.source.instanceMatrix.array,h.original);
});
await test('terrain heights synchronize before render-list GPU uploads, without reclassification',()=>{
  const h=setup(200),initial=h.p.audit().parts.map(p=>p.count);
  for(let i=0;i<200;i++)h.source.instanceMatrix.array[i*16+13]+=51;
  h.source.instanceMatrix.needsUpdate=true;h.group.updateMatrixWorld();
  const d=h.p.audit();assert.ok(d.sourcePrefixExact);assert.deepEqual(d.parts.map(p=>p.count),initial);assert.equal(d.syncs,2);
  for(const p of h.parts())assert.equal(p.instanceMatrix.version,2);
  h.p.restore();assert.equal(h.source.instanceMatrix.array[13],h.original[13]+51);
});
await test('steady-state callbacks do not copy or upload the same instance data again',()=>{
  const h=setup(500);for(let i=0;i<500;i++)h.group.updateMatrixWorld();assert.equal(h.p.diagnostics().syncs,1);
  for(const m of h.parts())assert.equal(m.instanceMatrix.version,1);h.p.restore();
});
await test('summer winter round-trips keep the exact same trees, counts and source buffers',()=>{
  const h=setup(350),before=h.p.audit();for(let i=0;i<100;i++){assert.ok(h.p.setSeason('winter'));assert.ok(h.p.setSeason('summer'));}
  const after=h.p.audit();assert.deepEqual(after.parts,before.parts);assert.equal(after.sourceMatrixHash,before.sourceMatrixHash);
  assert.throws(()=>h.p.setSeason('autumn'));assert.deepEqual(h.p.audit().parts,after.parts);h.p.restore();
});
await test('OFF restores visibility and frees ONLY owned instance buffers exactly once',()=>{
  const h=setup(70),parts=h.parts();assert.ok(h.p.restore());assert.equal(h.p.restore(),false);assert.equal(h.source.visible,true);
  assert.deepEqual(h.group.children,[h.source]);assert.equal(h.source.disposeCount,0);for(const p of parts)assert.equal(p.disposeCount,1);
  assert.deepEqual(h.source.instanceMatrix.array,h.original);
});
await test('foreign geometry, material or source buffer changes never get overwritten',()=>{
  for(const key of ['geometry','material','instanceMatrix']){const h=setup(60),foreign=key==='instanceMatrix'?new Attribute(60):{};
    h.source[key]=foreign;assert.equal(h.p.sync(),false);assert.equal(h.source.visible,true);h.p.restore();assert.equal(h.source[key],foreign);}
});
await test('invalid live counts and changed horizontal placement fall back safely',()=>{
  for(const count of [-1,61,NaN]){const h=setup(60);h.source.count=count;assert.equal(h.p.sync(),false);assert.equal(h.source.visible,true);h.p.restore();}
  const h=setup(60);h.source.instanceMatrix.array[12]+=1;h.source.instanceMatrix.needsUpdate=true;
  assert.equal(h.p.sync(),false);assert.equal(h.source.visible,true);assert.ok(h.parts().every(p=>p.count===0));h.p.restore();
});
await test('source proof and noncanonical presentation inputs are refused before hiding',()=>{
  const g=new Group(),s=new Mesh({}, {}, 40);s.instanceMatrix.array.set(matrices(40));g.add(s);
  for(const patch of [{ecoregionId:444},{count:1743},{profileId:'r15-yungas-tropical'}])
    assert.throws(()=>createMixedForestPresentation({THREE,group:g,source:s,kit,proof:{...proof,...patch},season:'summer'}));
  assert.equal(s.visible,true);assert.equal(g.children.length,1);
  s.instanceColor={};assert.throws(()=>createMixedForestPresentation({THREE,group:g,source:s,kit,proof,season:'summer'}));assert.equal(s.visible,true);
});
await test('failure while constructing the second mesh leaves original forest visible',()=>{
  const g=new Group(),s=new Mesh({}, {}, 100);s.instanceMatrix.array.set(matrices(100));g.add(s);let made=0,first;
  class Broken extends Mesh{constructor(...a){if(++made===2)throw new Error('allocation');super(...a);first=this;}}
  assert.throws(()=>createMixedForestPresentation({THREE:{...THREE,InstancedMesh:Broken},group:g,source:s,kit,proof,season:'summer'}),/allocation/);
  assert.equal(s.visible,true);assert.deepEqual(g.children,[s]);assert.equal(first.disposeCount,1);
});
await test('foreign children and reparented originals release the owned visibility mask',()=>{
  const h=setup(60),other=new Group();other.add(h.source);assert.equal(h.p.sync(),false);assert.equal(h.source.visible,true);h.p.restore();assert.equal(h.source.parent,other);
  const moved=setup(60),host=new Group(),part=moved.parts()[0];host.add(part);assert.equal(moved.p.sync(),false);moved.p.restore();assert.equal(host.children.length,0);assert.equal(part.disposeCount,1);
  const j=setup(60),foreign=new Group();j.group.add(foreign);assert.equal(j.p.sync(),false);j.p.restore();assert.ok(j.group.children.includes(foreign));assert.equal(j.source.visible,true);
});
await test('small or empty visible prefixes need no extra draw pass and remain restorable',()=>{
  const h=setup(1);h.source.count=0;h.group.updateMatrixWorld();assert.equal(h.p.audit().instances,0);
  assert.equal(h.p.diagnostics().potentialAdditionalDrawCalls,0);h.p.restore();assert.equal(h.source.count,0);
});
await test('local directory rejects missing, corrupted or oversized payloads',async()=>{
  await assert.rejects(readR16Directory(new Response('missing',{status:404}),webcrypto));
  await assert.rejects(readR16Directory(new Response('{}'),webcrypto),/données approuvées/);
  await assert.rejects(readR16Directory(new Response(new Uint8Array(131073)),webcrypto),/size bound/);
});
await test('stop cancels a pending root fetch before any runtime start',async()=>{
  const previousFetch=globalThis.fetch,previousDiagnostics=globalThis.WorldDriveDiagnostics;let starts=0,stops=0;
  globalThis.WorldDriveDiagnostics={forest:{visualPilot:{start(){starts++;},stop(){stops++;}}}};
  globalThis.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  try{const pending=launchR16();stopR16();assert.equal((await pending).status,'discarded');assert.equal(starts,0);assert.equal(stops,1);}
  finally{globalThis.fetch=previousFetch;if(previousDiagnostics===undefined)delete globalThis.WorldDriveDiagnostics;else globalThis.WorldDriveDiagnostics=previousDiagnostics;}
});
const result={status:'PASS',groups:tests.length,tests,scope:'Deterministic doubles, not a native Three or driving benchmark'};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
