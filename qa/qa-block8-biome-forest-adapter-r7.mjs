import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {FOREST_LAYOUT_ID,FOREST_POINT_COUNT,FOREST_FIRST_LAYER_COUNT,
  createForestCandidateAdapter,forestChunkAtAbsolute,forestCandidateIndex,forestTraversalIndex,
  forestSlotAtTraversal,copyForestChunkRequest,buildForestChunkRequest}
  from '../src/scenery/biomes/forest-candidate-adapter.js';
import {createBiomeChunkContextBridge} from '../src/scenery/biomes/chunk-context-bridge.js';
import {CHUNK_CONTEXT_SCHEMA,chunkContextKey,captureChunkContext,MISSING_CHUNK_CONTEXT}
  from '../src/scenery/biomes/chunk-context-snapshot.js';
import {BIOME_PROFILES} from '../src/scenery/biomes/biome-profiles.js';
const groups=[];
async function test(name,fn){await fn();groups.push(name);}
const origin={lat:49.1,lon:-68.5},routeId='route-1';
const adapter=createForestCandidateAdapter({origin,routeId});
const descriptor=(cx=-1,cz=0)=>({cx,cz,origin:{...origin},routeId});
const identity={revision:'r7-unit',source:{id:'RESOLVE-ECOREGIONS-2017',license:'CC-BY-4.0',sha256:'a'.repeat(64)},catalogSha256:'b'.repeat(64)};
const context=(biome=6,id=2)=>({schema:'world-drive-biome-context-v1',...BIOME_PROFILES[biome],status:'resolved',reason:null,
  source:identity.source,ecoregion:{id,biome,name:'MOCK',realm:'Test'},precision:'source-polygons',confidence:'source-agreement',
  paletteEligible:true,regionalHint:null,resolutionDegrees:null,transitionReady:false,boundaryDiagnostic:false,placementAuthority:false,elevationApplied:false});
const absent=(status,reason)=>({...context(),...BIOME_PROFILES[0],status,reason,ecoregion:null,precision:null,confidence:'unavailable',paletteEligible:false});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
class MockClient {
  generation=0;serial=0;calls=0;gate=null;mutate=null;closed=false;query=()=>context();last=null;
  async setRoute(){return {generation:++this.generation};}
  async update(){return {status:'ready',generation:this.generation,serial:++this.serial,revision:identity.revision};}
  async captureChunk(){throw new Error('Wrong operation: R7 must generate in Worker');}
  async captureForestChunk(input){
    this.calls++;assert.equal('points' in input,false);this.last=structuredClone(input);
    const request=buildForestChunkRequest(input);
    const reply={points:request.points,packet:captureChunkContext(request,identity,{
      diagnostics:()=>({ready:true,generation:this.generation,serial:this.serial}),query:this.query})};
    if(this.gate)await this.gate.promise;if(this.mutate)this.mutate(reply);return reply;
  }
  dispose(){this.closed=true;this.gate?.resolve();}
}
async function open(options={}){
  const client=new MockClient(),b=createBiomeChunkContextBridge({client,identity,layoutId:FOREST_LAYOUT_ID,...options});
  await b.setRoute([[-68.5,49.1],[-68.4,49.1]],{projectionId:adapter.projectionId});await b.update(0);return {b,client};
}
function request(){return {...descriptor(),schema:CHUNK_CONTEXT_SCHEMA,requestId:1,generation:1,serial:1,
  layoutId:FOREST_LAYOUT_ID,projectionId:adapter.projectionId,key:chunkContextKey(adapter.projectionId,FOREST_LAYOUT_ID,-1,0)};}
await test('certified 1744 positions and 1024 first-layer slots',()=>{
  assert.equal(FOREST_POINT_COUNT,16*109);assert.equal(FOREST_FIRST_LAYER_COUNT,16*64);
  assert.equal(adapter.buildPoints(-1,0).length,3488);assert.equal(adapter.layoutId,FOREST_LAYOUT_ID);
});
await test('R4 traversal is a bijection; first layer precedes all densification',()=>{
  const seen=new Set();for(let order=0;order<1744;order++){
    const slot=forestSlotAtTraversal(order);assert.equal(forestTraversalIndex(slot),order);seen.add(slot);
    assert.equal(slot%109<64,order<1024);assert.equal(slot,forestCandidateIndex(Math.floor(slot/109),slot%109));
  }assert.equal(seen.size,1744);
});
await test('negative absolute cells use floor, not truncation; seam ownership',()=>{
  for(const [x,want] of [[-480.001,-2],[-480,-1],[-.001,-1],[-0,0],[0,0],[479.999,0],[480,1]])
    assert.deepEqual(forestChunkAtAbsolute(x,x),{cx:want,cz:want});
});
await test('all raw candidates remain in their absolute 480m chunk',()=>{
  for(const [cx,cz] of [[-12,-8],[-1,0],[0,-1],[0,0],[19,42]])for(let i=0;i<1744;i++){
    const p=adapter.point(cx,cz,i);assert.equal(p.cellIndex,Math.floor(i/109));assert.equal(p.candidateIndex,i%109);
    assert.deepEqual(forestChunkAtAbsolute(p.x,p.z),{cx,cz});
  }
});
await test('projection and route identities include exact origin bits',()=>{
  const ids=new Set();for(const lat of [49.1,49.1+1e-13])for(const lon of [-68.5,-68.5+1e-13])for(const rid of ['r','s'])
    ids.add(createForestCandidateAdapter({origin:{lat,lon},routeId:rid}).projectionId);
  assert.equal(ids.size,8);for(const v of ids)assert.ok(v.length<=96);
  assert.equal(createForestCandidateAdapter({origin:{lat:-0,lon:0},routeId:'r'}).projectionId,
    createForestCandidateAdapter({origin:{lat:0,lon:-0},routeId:'r'}).projectionId);
});
await test('caller cannot mutate a captured projection or immutable adapter',()=>{
  const input={origin:{...origin},routeId};const a=createForestCandidateAdapter(input),before=a.point(-1,-1,7);
  input.origin.lat=0;input.origin.lon=0;input.routeId='new';assert.deepEqual(a.point(-1,-1,7),before);
  assert.throws(()=>{a.origin.lat=0;});assert.throws(()=>{a.projectionId='x';});
});
await test('render-origin shifts do not enter deterministic hashes or projection',()=>{
  const a=adapter.buildPoints(-1,1);for(const offset of [{x:0,z:0},{x:4096,z:-2048},{x:-32768,z:65536}]){
    const p=adapter.point(-1,1,20),render={x:p.x-offset.x,z:p.z-offset.z};
    assert.deepEqual(forestChunkAtAbsolute(render.x+offset.x,render.z+offset.z),{cx:-1,cz:1});
    assert.deepEqual(adapter.buildPoints(-1,1),a);
  }
});
await test('finite coordinate/index/address/projection guards reject invalid input',()=>{
  for(const i of [-1,1744,.5,NaN,Infinity]){assert.throws(()=>adapter.point(0,0,i));assert.throws(()=>forestSlotAtTraversal(i));}
  for(const cx of [NaN,.5,536870912,-536870913])assert.throws(()=>adapter.buildPoints(cx,0));
  for(const o of [{lat:90,lon:0},{lat:-90,lon:0},{lat:0,lon:181},{lat:NaN,lon:0},{lat:89.99999999,lon:0}])
    assert.throws(()=>createForestCandidateAdapter({origin:o,routeId}));
  for(const r of ['',null,'r|other','x'.repeat(49)])assert.throws(()=>createForestCandidateAdapter({origin,routeId:r}));
  assert.throws(()=>forestCandidateIndex(16,0));assert.throws(()=>forestCandidateIndex(0,109));
});
await test('projection domain exit is explicit, never wrapped/clamped at a coast or pole',()=>{
  const a=createForestCandidateAdapter({origin:{lat:0,lon:180},routeId});
  assert.throws(()=>a.buildPoints(0,0),/projection domain/);assert.ok(a.buildPoints(-1,0).every(Number.isFinite));
  assert.throws(()=>adapter.project(Infinity,0));assert.throws(()=>adapter.project(0,1e12));
});
await test('fresh point buffers and reusable bounded point scratch',()=>{
  const p=adapter.buildPoints(0,0),q=adapter.buildPoints(0,0);assert.notEqual(p.buffer,q.buffer);p.fill(0);
  assert.deepEqual(q,adapter.buildPoints(0,0));const scratch={};assert.equal(adapter.point(0,0,17,scratch),scratch);
});
await test('procedural descriptor is bounded copied metadata, not caller point buffers',()=>{
  const r=request();r.points=new Float64Array(100000);r.untrusted='discard';const safe=copyForestChunkRequest(r);
  assert.equal('points' in safe,false);assert.equal('untrusted' in safe,false);r.origin.lat=0;assert.equal(safe.origin.lat,origin.lat);
  for(const k of ['projectionId','layoutId','key','schema'])assert.throws(()=>copyForestChunkRequest({...request(),[k]:'wrong'}));
  for(const k of ['generation','serial','requestId'])assert.throws(()=>copyForestChunkRequest({...request(),[k]:0}));
});
await test('full Worker-generated chunk publishes with exact point lookup and no authority',async()=>{
  const {b,client}=await open(),r=await b.prepareForestChunk(descriptor());assert.equal(r.status,'prepared');assert.equal(client.calls,1);
  for(let i=0;i<1744;i++){const p=adapter.point(-1,0,i),q=r.snapshot.lookup(i,p.lon,p.lat);assert.equal(q.ecoregion.id,2);assert.equal(q.placementAuthority,false);}
  assert.equal(r.snapshot.lookup(0,0,0),MISSING_CHUNK_CONTEXT);b.dispose();
});
await test('R7 layout cannot be poisoned by externally supplied exact points',async()=>{
  const {b,client}=await open();assert.equal((await b.prepareChunk({cx:-1,cz:0,points:[[0,0]]})).status,'rejected');assert.equal(client.calls,0);b.dispose();
});
await test('wrong origin or route identity rejected before Worker admission',async()=>{
  const {b,client}=await open();for(const change of [{origin:{lat:0,lon:0}},{routeId:'other'}])
    assert.equal((await b.prepareForestChunk({...descriptor(),...change})).status,'rejected');assert.equal(client.calls,0);b.dispose();
});
await test('pending procedural deduplication, bounded concurrency and metadata snapshot',async()=>{
  const {b,client}=await open();client.gate=deferred();const input=descriptor();const a=b.prepareForestChunk(input),same=b.prepareForestChunk(descriptor());
  assert.equal(a,same);input.origin.lat=0;const c=b.prepareForestChunk(descriptor(0));assert.equal((await b.prepareForestChunk(descriptor(1))).status,'busy');
  await Promise.resolve();assert.equal(client.last.origin.lat,origin.lat);client.gate.resolve();await Promise.all([a,c]);
  assert.equal(client.calls,2);assert.equal(b.diagnostics().pendingReservedBytes,0);b.dispose();
});
await test('truncated, shared and oversized-backing buffers rejected atomically',async()=>{
  const {b,client}=await open();const original=(await b.prepareForestChunk(descriptor())).snapshot;
  const attacks=[r=>r.points=new Float64Array(2),r=>r.points=new Float64Array(new ArrayBuffer(40000),0,3488),
    r=>r.points[0]=NaN,r=>r.packet.generation++,r=>r.packet.identity.source.sha256='c'.repeat(64)];
  if(typeof SharedArrayBuffer!=='undefined')attacks.push(r=>r.points=new Float64Array(new SharedArrayBuffer(3488*8)));
  for(const attack of attacks){client.mutate=attack;assert.equal((await b.prepareForestChunk({...descriptor(),refresh:true})).status,'rejected');assert.equal(b.get(-1,0),original);}
  b.dispose();
});
await test('incorrect Worker coordinate cannot answer the actual exact candidate',async()=>{
  const {b,client}=await open();client.mutate=r=>r.points[0]+=.001;const result=await b.prepareForestChunk(descriptor());
  const p=adapter.point(-1,0,0);assert.equal(result.snapshot.lookup(0,p.lon,p.lat),MISSING_CHUNK_CONTEXT);b.dispose();
});
await test('source no-data remains distinct from unavailable',async()=>{
  const {b,client}=await open();client.query=(lat,lon)=>lon< -68.504?absent('no-data','source-no-data'):absent('unavailable','tile-not-resident');
  const r=await b.prepareForestChunk(descriptor());assert.equal(r.status,'prepared');assert.ok(r.snapshot.counts.noData>0);assert.ok(r.snapshot.counts.unavailable>0);
  assert.equal(r.snapshot.counts.resolved,0);b.dispose();
});
await test('old procedural responses cannot publish across route/window epochs',async()=>{
  const {b,client}=await open();client.gate=deferred();const p=b.prepareForestChunk(descriptor());await Promise.resolve();await b.update(0);
  client.gate.resolve();assert.equal((await p).status,'discarded');assert.equal(b.get(-1,0),null);
  client.gate=null;const held=(await b.prepareForestChunk(descriptor())).snapshot;
  await b.setRoute([[-68.5,49.1],[-68.4,49.1]],{projectionId:adapter.projectionId});const a=adapter.point(-1,0,0);
  assert.equal(held.lookup(0,a.lon,a.lat),MISSING_CHUNK_CONTEXT);await b.update(0);assert.equal((await b.prepareForestChunk(descriptor())).status,'prepared');b.dispose();
});
await test('bounded byte/count eviction and return regenerate exact same coordinates',async()=>{
  const {b}=await open({maxChunks:1,maxBytes:40000});const first=(await b.prepareForestChunk(descriptor())).snapshot;
  await b.prepareForestChunk(descriptor(0));assert.equal(b.get(-1,0),null);const r=await b.prepareForestChunk(descriptor());
  assert.notEqual(r.snapshot,first);assert.equal(r.status,'prepared');assert.equal(b.diagnostics().evictions,2);b.dispose();
});
await test('pending byte bound rejects without generation; undersized resident budget rejects',async()=>{
  for(const option of [{maxPendingBytes:1},{maxBytes:1}]){const {b,client}=await open(option),r=await b.prepareForestChunk(descriptor());
    assert.equal(r.status,option.maxBytes?'rejected':'busy');if(option.maxPendingBytes)assert.equal(client.calls,0);assert.equal(b.get(-1,0),null);b.dispose();}
});
await test('100000 synchronous exact reads reuse objects without new work',async()=>{
  const {b,client}=await open(),snapshot=(await b.prepareForestChunk(descriptor())).snapshot,p=adapter.point(-1,0,0),q=snapshot.lookup(0,p.lon,p.lat);
  for(let i=0;i<100000;i++)assert.equal(b.lookup(-1,0,0,p.lon,p.lat),q);assert.equal(client.calls,1);
  assert.equal((await b.prepareForestChunk(descriptor())).snapshot,snapshot);assert.equal(client.calls,1);b.dispose();
  assert.equal(snapshot.lookup(0,p.lon,p.lat),MISSING_CHUNK_CONTEXT);
});
const report={status:'PASS',groups:groups.length,tests:groups,pointsPerChunk:1744,firstLayer:1024,reads:100000,
  worker:'emulated for unit tests; native Worker is a separate mandatory CI test'};
if(process.argv.includes('--report'))writeFileSync(process.argv[process.argv.indexOf('--report')+1],JSON.stringify(report,null,2)+'\n');
console.log('PASS R7 forest coordinate/bridge contracts',JSON.stringify(report));
