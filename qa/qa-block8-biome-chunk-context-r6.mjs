import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {BIOME_PROFILES} from '../src/scenery/biomes/biome-profiles.js';
import {CHUNK_CONTEXT_SCHEMA,MAX_CHUNK_POINTS,MAX_CHUNK_CONTEXTS,MISSING_CHUNK_CONTEXT,
  snapshotIdentity,chunkContextKey,copyChunkPoints,captureChunkContext,installChunkContext}
  from '../src/scenery/biomes/chunk-context-snapshot.js';
import {createBiomeChunkContextBridge} from '../src/scenery/biomes/chunk-context-bridge.js';
const groups=[];
async function test(name,fn){await fn();groups.push(name);}
const identity={revision:'r6-test',catalogSha256:'b'.repeat(64),source:{id:'RESOLVE-ECOREGIONS-2017',license:'CC-BY-4.0',sha256:'a'.repeat(64)}};
const context=(biome=6,id=1)=>({schema:'world-drive-biome-context-v1',...BIOME_PROFILES[biome],status:'resolved',reason:null,
  source:{...identity.source},ecoregion:{id,biome,name:`TEST ${id}`,realm:'Test'},precision:'source-polygons',confidence:'source-agreement',
  paletteEligible:true,regionalHint:null,resolutionDegrees:null,transitionReady:false,boundaryDiagnostic:false,placementAuthority:false,elevationApplied:false});
const missing=(status='unavailable',reason='tile-not-resident')=>({...context(),...BIOME_PROFILES[0],status,reason,ecoregion:null,precision:null,confidence:'unavailable',paletteEligible:false});
const oracle=(lat,lon)=>lon<0?context(1,1):lon===0?missing('no-data','source-no-data'):lon>1?missing():context(6,2);
function request(points=[[-.01,0],[.01,0]]){return {schema:CHUNK_CONTEXT_SCHEMA,key:chunkContextKey('proj1','test-v1',-1,2),
  projectionId:'proj1',layoutId:'test-v1',cx:-1,cz:2,points:copyChunkPoints(points),requestId:1,generation:1,serial:2};}
const session={diagnostics:()=>({ready:true,generation:1,serial:2}),query:oracle};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {resolve,reject,promise};};
class Client{
  generation=0;serial=0;captures=0;closed=false;gate=null;mutate=null;updateGate=null;
  async setRoute(){return {generation:++this.generation};}
  async update(){if(this.updateGate)await this.updateGate.promise;return {status:'ready',generation:this.generation,serial:++this.serial,revision:identity.revision};}
  async captureChunk(r){
    this.captures++;const clone=structuredClone(r);
    const p=captureChunkContext(clone,identity,{diagnostics:()=>({ready:true,generation:this.generation,serial:this.serial}),query:oracle});
    if(this.gate)await this.gate.promise;
    if(this.mutate)this.mutate(p);return p;
  }
  dispose(){this.closed=true;this.gate?.reject(new Error('disposed'));this.updateGate?.reject(new Error('disposed'));}
}
const route=[[-.05,0],[.05,0]];
async function bridge(options={}){
  const client=new Client(),b=createBiomeChunkContextBridge({client,identity,layoutId:'test-v1',...options});
  assert.equal((await b.setRoute(route,{projectionId:'proj1'})).status,'route-ready');assert.equal((await b.update(0)).status,'ready');return {b,client};
}
const prepare=(b,cx=0,points=[[-.01,0],[.01,0]],refresh=false)=>b.prepareChunk({cx,cz:0,points,refresh});
await test('exact positions on two sides of one boundary retain separate biomes',()=>{
  const r=request(),p=captureChunkContext(r,identity,session),s=installChunkContext(p,r,identity).view;
  assert.equal(s.lookup(0,-.01,0).biome,1);assert.equal(s.lookup(1,.01,0).biome,6);
  assert.equal(s.lookup(0,.01,0),MISSING_CHUNK_CONTEXT);assert.equal(s.lookup(0,-.01001,0),MISSING_CHUNK_CONTEXT);
  for(const i of [-1,2,NaN,.5])assert.equal(s.lookup(i,0,0),MISSING_CHUNK_CONTEXT);
});
await test('source no-data and unavailable never acquire forest or placement authority',()=>{
  const r=request([[0,0],[2,0]]),s=installChunkContext(captureChunkContext(r,identity,session),r,identity).view;
  assert.deepEqual(s.counts,{resolved:0,noData:1,unavailable:1});
  assert.equal(s.lookup(0,0,0).status,'no-data');assert.equal(s.lookup(1,2,0).paletteEligible,false);assert.equal(s.lookup(0,0,0).placementAuthority,false);
});
await test('Rock and Ice local profile preserves upstream tundra record',()=>{
  const c={...context(11,0),...BIOME_PROFILES[98],ecoregion:{id:0,biome:11,name:'Rock and Ice',realm:''}};
  const r=request(),s=installChunkContext(captureChunkContext(r,identity,{...session,query:()=>c}),r,identity).view;
  assert.equal(s.lookup(0,-.01,0).biome,98);assert.equal(s.lookup(0,-.01,0).ecoregion.biome,11);
});
await test('private copied buffers and deep-frozen contexts resist caller/packet mutation',()=>{
  const r=request(),p=captureChunkContext(r,identity,session),entry=installChunkContext(p,r,identity),s=entry.view;
  p.codes.fill(1);p.contexts.length=0;r.points.fill(70);
  assert.equal(s.lookup(0,-.01,0).biome,1);assert.equal(s.count,2);
  assert.throws(()=>{s.lookup(0,-.01,0).source.id='x';});assert.throws(()=>{s.lookup(0,-.01,0).ecoregion.name='x';});assert.throws(()=>{s.counts.resolved=0;});
  assert.equal(Object.values(s).some(v=>ArrayBuffer.isView(v)),false);
});
await test('maximum 2048 exact points supported; actual forest count 1744 fits',()=>{
  for(const count of [1744,MAX_CHUNK_POINTS]){const r=request(Array.from({length:count},()=>[.01,0]));
    assert.equal(installChunkContext(captureChunkContext(r,identity,session),r,identity).view.count,count);}
  assert.throws(()=>request(Array.from({length:2049},()=>[0,0])));assert.throws(()=>request([]));
});
await test('point address bounds include poles and both dateline representations',()=>{
  request([[180,90],[-180,-90]]);
  for(const p of [[[181,0]],[[0,91]],[[NaN,0]],[[0,Infinity]],[[0,0,0]]])assert.throws(()=>request(p));
  for(const c of [NaN,.5,2147483648])assert.throws(()=>chunkContextKey('p','l',c,0));
  assert.equal(chunkContextKey('p','l',-0,0),chunkContextKey('p','l',0,0));
  assert.notEqual(chunkContextKey('p','l',1,23),chunkContextKey('p','l',12,3));
  assert.notEqual(chunkContextKey('p','l',1,2),chunkContextKey('q','l',1,2));
  assert.throws(()=>chunkContextKey('p|l','l',0,0));
});
await test('all dataset identity components and route/window/request echoes checked',()=>{
  const r=request(),p=captureChunkContext(r,identity,session);
  for(const mutate of [q=>q.identity.revision='other',q=>q.identity.catalogSha256='c'.repeat(64),q=>q.identity.source.sha256='c'.repeat(64),
    q=>q.identity.source.id='other',q=>q.identity.source.license='other',q=>q.key='other',q=>q.requestId++,q=>q.generation++,q=>q.serial++]){
    const q=structuredClone(p);mutate(q);assert.throws(()=>installChunkContext(q,r,identity));}
});
await test('malformed packet sizes, indices, profiles and elevated authority rejected',()=>{
  const r=request(),p=captureChunkContext(r,identity,session);
  for(const mutate of [q=>q.codes=new Uint16Array(1),q=>q.codes[0]=64,q=>q.codes=new Uint8Array(2),q=>q.contexts=[],
    q=>q.contexts=Array(65).fill(q.contexts[0]),q=>q.contexts[0].placementAuthority=true,q=>q.contexts[0].elevationApplied=true,
    q=>q.contexts[0].transitionReady=true,q=>q.contexts[0].biome=6,q=>q.contexts[0].source.sha256='c'.repeat(64),
    q=>q.contexts[0].ecoregion.name='x'.repeat(257),q=>q.contexts[0].regionalHint={},q=>q.contexts[0].resolutionDegrees=.1]){
    const q=structuredClone(p);mutate(q);assert.throws(()=>installChunkContext(q,r,identity));}
});
await test('shared mutable buffers rejected',()=>{
  if(typeof SharedArrayBuffer==='undefined')return;
  const r=request(),p=captureChunkContext(r,identity,session);p.codes=new Uint16Array(new SharedArrayBuffer(4));
  assert.throws(()=>installChunkContext(p,r,identity));r.points=new Float64Array(new SharedArrayBuffer(32));assert.throws(()=>captureChunkContext(r,identity,session));
});
await test('unready and stale worker windows cannot produce a snapshot',()=>{
  for(const state of [{ready:false,generation:1,serial:2},{ready:true,generation:2,serial:2},{ready:true,generation:1,serial:3}])
    assert.throws(()=>captureChunkContext(request(),identity,{diagnostics:()=>state,query:oracle}));
});
await test('dictionary diversity is explicitly bounded',()=>{
  const r=request(Array.from({length:65},(_,i)=>[i,0]));
  assert.throws(()=>captureChunkContext(r,identity,{...session,query:(lat,lon)=>context(6,lon)}));
  assert.equal(MAX_CHUNK_CONTEXTS,64);
});
await test('unprepared reads cause zero asynchronous work',async()=>{
  const {b,client}=await bridge();for(let i=0;i<100000;i++)assert.equal(b.lookup(0,0,0,0,0),MISSING_CHUNK_CONTEXT);
  assert.equal(client.captures,0);b.dispose();
});
await test('published snapshot reads allocate no context and request no Worker work',async()=>{
  const {b,client}=await bridge();const s=(await prepare(b)).snapshot;const c=s.lookup(0,-.01,0);
  for(let i=0;i<100000;i++)assert.equal(b.lookup(0,0,0,-.01,0),c);
  assert.equal(client.captures,1);assert.equal(b.get(0,0),s);assert.equal((await prepare(b)).snapshot,s);assert.equal(client.captures,1);b.dispose();
});
await test('duplicate pending exact chunks share one operation',async()=>{
  const {b,client}=await bridge();client.gate=deferred();const p=prepare(b),q=prepare(b);
  assert.equal(p,q);await Promise.resolve();assert.equal(client.captures,1);client.gate.resolve();assert.equal((await p).status,'prepared');b.dispose();
});
await test('changing point layout behind the same key is rejected',async()=>{
  const {b,client}=await bridge();client.gate=deferred();const p=prepare(b);assert.equal((await prepare(b,0,[[1,0]])).reason,'chunk-layout-conflict');
  client.gate.resolve();await p;assert.equal((await prepare(b,0,[[1,0]],true)).reason,'chunk-layout-conflict');b.dispose();
});
await test('input positions are snapshotted before asynchronous work',async()=>{
  const {b}=await bridge(),points=[[-.01,0],[.01,0]],p=prepare(b,0,points);points[0][0]=60;points.length=0;
  assert.equal((await p).snapshot.lookup(0,-.01,0).biome,1);b.dispose();
});
await test('two pending chunk jobs are admitted; a third has no queue',async()=>{
  const {b,client}=await bridge();client.gate=deferred();const p=prepare(b,0),q=prepare(b,1);
  assert.equal((await prepare(b,2)).status,'busy');assert.equal(b.diagnostics().pendingChunks,2);client.gate.resolve();await Promise.all([p,q]);
  assert.equal(b.diagnostics().pendingReservedBytes,0);b.dispose();
});
await test('pending byte ceiling rejects without contacting Worker',async()=>{
  const {b,client}=await bridge({maxPendingBytes:1});assert.equal((await prepare(b)).status,'busy');assert.equal(client.captures,0);b.dispose();
});
await test('cache eviction is bounded and a return is explicitly re-prepared',async()=>{
  const {b,client}=await bridge({maxChunks:2});for(let i=0;i<50;i++)assert.equal((await prepare(b,i)).status,'prepared');
  assert.equal(b.get(0,0),null);assert.equal(b.diagnostics().residentChunks,2);assert.equal(b.diagnostics().peakChunks,2);
  await prepare(b,0);assert.equal(client.captures,51);assert.equal(b.diagnostics().evictions,49);b.dispose();
});
await test('byte eviction stays within payload budget, oversized snapshot leaves good data',async()=>{
  const {b}=await bridge({maxBytes:4200});assert.equal((await prepare(b,0,[[.01,0]])).status,'prepared');const s=b.get(0,0);
  assert.equal((await prepare(b,1)).reason,'chunk-residency-budget');assert.equal(b.get(0,0),s);
  assert.equal((await prepare(b,2,[[.01,0]])).status,'prepared');assert.equal(b.get(0,0),null);assert.ok(b.diagnostics().peakBytes<=4200);b.dispose();
});
await test('corrupt refreshed packet cannot evict a valid snapshot',async()=>{
  const {b,client}=await bridge();const old=(await prepare(b)).snapshot;client.mutate=p=>{p.codes[0]=65535;};
  assert.equal((await prepare(b,0,undefined,true)).status,'rejected');assert.equal(b.get(0,0),old);assert.equal(old.lookup(0,-.01,0).biome,1);b.dispose();
});
await test('window changes discard late packets but preserve published same-route geography',async()=>{
  const {b,client}=await bridge();const old=(await prepare(b)).snapshot;client.gate=deferred();const p=prepare(b,1);await Promise.resolve();
  await b.update(20);client.gate.resolve();assert.equal((await p).status,'discarded');assert.equal(b.get(1,0),null);assert.equal(b.get(0,0),old);b.dispose();
});
await test('new routes invalidate cached and externally retained snapshot lookups',async()=>{
  const {b,client}=await bridge();const old=(await prepare(b)).snapshot;client.gate=deferred();const p=prepare(b,1);await Promise.resolve();
  await b.setRoute(route,{projectionId:'proj2'});assert.equal(old.lookup(0,-.01,0),MISSING_CHUNK_CONTEXT);assert.equal(b.get(0,0),null);
  client.gate.resolve();assert.equal((await p).status,'discarded');await b.update(0);assert.equal((await prepare(b)).status,'prepared');b.dispose();
});
await test('invalid routes fail before destroying a published snapshot',async()=>{
  const {b}=await bridge();const old=(await prepare(b)).snapshot;
  await assert.rejects(()=>b.setRoute([[0,91],[1,0]],{projectionId:'new'}));assert.equal(b.get(0,0),old);
  await assert.rejects(()=>b.setRoute(route,{projectionId:'bad|id'}));assert.equal(b.get(0,0),old);b.dispose();
});
await test('unready window does not create synthetic neutral forest',async()=>{
  const {b,client}=await bridge();client.update=async()=>({status:'missing'});assert.equal((await b.update(0)).status,'unavailable');
  assert.equal((await prepare(b)).status,'unavailable');assert.equal(client.captures,0);b.dispose();
});
await test('window admission has no unbounded queue',async()=>{
  const {b,client}=await bridge();client.updateGate=deferred();const p=b.update(0);assert.equal((await b.update(1)).status,'busy');
  client.updateGate.resolve();assert.equal((await p).status,'ready');b.dispose();
});
await test('disposal invalidates retained views and rejects late preparation without publication',async()=>{
  const {b,client}=await bridge();const old=(await prepare(b)).snapshot;client.gate=deferred();const p=prepare(b,1);await Promise.resolve();b.dispose();
  assert.equal((await p).status,'discarded');assert.equal(old.lookup(0,-.01,0),MISSING_CHUNK_CONTEXT);assert.equal(b.get(0,0),null);
  assert.equal(b.diagnostics().pendingReservedBytes,0);assert.equal((await prepare(b)).reason,'disposed');
});
await test('fixed identity and configured layout are copied and validated',async()=>{
  const input=structuredClone(identity),fixed=snapshotIdentity(input);input.source.sha256='c'.repeat(64);assert.equal(fixed.source.sha256,identity.source.sha256);
  assert.throws(()=>snapshotIdentity({...identity,catalogSha256:'nope'}));assert.throws(()=>createBiomeChunkContextBridge({client:new Client(),identity,maxChunks:0}));
});
await test('client chunk RPC copies only bounded declared fields and private coordinates',async()=>{
  const previous=globalThis.Worker,instances=[];
  class FakeWorker{
    handlers=new Map();sent=[];terminated=false;
    constructor(){instances.push(this);}
    addEventListener(name,fn){this.handlers.set(name,fn);}
    postMessage(data){this.sent.push(data);}
    terminate(){this.terminated=true;}
    reply(id,value){this.handlers.get('message')({data:{id,ok:true,value}});}
  }
  globalThis.Worker=FakeWorker;
  try{
    const {createBiomeWorkerClient}=await import('../src/scenery/biomes/biome-worker-client.js');
    const c=createBiomeWorkerClient(),worker=instances[0],r=request();r.unrelated='must not cross RPC';
    const promise=c.captureChunk(r),message=worker.sent[0];r.points.fill(55);
    assert.equal(message.args[0].unrelated,undefined);assert.equal(message.args[0].points[0],-.01);
    worker.reply(message.id,{ok:'test'});assert.deepEqual(await promise,{ok:'test'});
    const stale=c.captureChunk(request()),changed=c.setRoute(route);
    const chunk=worker.sent[1],change=worker.sent[2];
    worker.reply(chunk.id,{});worker.reply(change.id,{generation:2});
    await assert.rejects(stale,/Stale route/);await changed;
    const outstanding=c.captureChunk(request());c.dispose();await assert.rejects(outstanding,/disposed/);assert.ok(worker.terminated);
  }finally{globalThis.Worker=previous;}
});
await test('oversized backing buffers are not admitted through small typed views',()=>{
  const r=request(),p=captureChunkContext(r,identity,session);
  p.codes=new Uint16Array(new ArrayBuffer(10000),0,2);assert.throws(()=>installChunkContext(p,r,identity));
  r.points=new Float64Array(new ArrayBuffer(10000),0,4);assert.throws(()=>captureChunkContext(r,identity,session));
});
const report={status:'PASS',groups:groups.length,names:groups,exactPointReads:200000,
  limits:{points:MAX_CHUNK_POINTS,contexts:MAX_CHUNK_CONTEXTS},scope:'Synthetic unit/lifecycle coverage, not gameplay frame pacing'};
if(process.env.BIOME_R6_REPORT)writeFileSync(process.env.BIOME_R6_REPORT,JSON.stringify(report,null,2)+'\n');
console.log('PASS R6 bounded exact-point chunk snapshot bridge',JSON.stringify(report,null,2));
