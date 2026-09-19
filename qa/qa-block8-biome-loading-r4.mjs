import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {prepareBiomeService} from '../src/scenery/biomes/biome-service.js';
import {REFINEMENT_SCHEMA} from '../src/scenery/biomes/local-refinement.js';
import {createBiomeTileTransport} from '../src/scenery/biomes/tile-transport.js';
import {createBiomeRoutePlan} from '../src/scenery/biomes/route-tile-plan.js';
import {createBiomeRoutePreparer} from '../src/scenery/biomes/route-preparer.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source={id:'RESOLVE-ECOREGIONS-2017',license:'CC-BY-4.0',sha256:'a'.repeat(64)};
const records=[null,{id:1,biome:1,name:'Synthetic tropical',realm:'Test'}];
const catalogSha256=sha(JSON.stringify(records));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(count=8) {
  const payload=new Map(),tiles=[];
  for(let x=1800;x<1800+count;x++) {
    const key=`${x}-900`,tile={schema:REFINEMENT_SCHEMA,crs:'EPSG:4326',sourceSha256:source.sha256,
      catalogSha256,tileX:x,tileY:900,divisions:16,cellSlots:Array(256).fill(1),
      cellReasons:Array(256).fill(0),cellPolygonOffsets:Array(257).fill(0),polygonSlots:[],
      polygonRingOffsets:[0],ringPointOffsets:[0],coordinates:[]};
    const raw=Buffer.from(JSON.stringify(tile)),packed=gzipSync(raw);
    const d={key,x,y:900,file:`${key}.json.gz`,sha256:sha(raw),jsonBytes:raw.length,gzipBytes:packed.length};
    payload.set(d.file,{raw,packed});tiles.push(d);
  }
  return {manifest:{schema:REFINEMENT_SCHEMA,source,records,catalogSha256,tiles},payload};
}
function stream(bytes,chunk=19) {let i=0;return new ReadableStream({pull(c){if(i===bytes.length){c.close();return;}
  const end=Math.min(i+chunk,bytes.length);c.enqueue(bytes.subarray(i,end));i=end;}});}
const response=bytes=>new Response(stream(bytes),{status:200,headers:{'Content-Length':String(bytes.length)}});
const baseUrl='https://example.invalid/pinned-biomes/';
const f=fixture();const descriptor=f.manifest.tiles[0],packed=f.payload.get(descriptor.file).packed;
let groups=0;
async function check(name,fn){await fn();groups++;console.log('PASS',name);}
async function harness(count=8,localOptions={},fetchFactory=null) {
  const f=fixture(count),s=await prepareBiomeService({refinementManifest:f.manifest,localOptions});
  let requests=0;
  const transport=createBiomeTileTransport({baseUrl,fetchImpl:async(url,options)=>{
    requests++;return fetchFactory?fetchFactory(url,options,f):response(f.payload.get(url.split('/').at(-1)).packed);
  }});
  const c=createBiomeRoutePreparer({service:s,transport});
  return {f,s,c,transport,requests:()=>requests,close(){c.dispose();transport.dispose();}};
}
await check('split native gzip stream and exact byte lengths',async()=>{
  const t=createBiomeTileTransport({baseUrl,fetchImpl:async()=>response(packed)});
  const r=await t.load(descriptor);assert.equal(r.status,'loaded');assert.equal(sha(r.bytes),descriptor.sha256);
  assert.equal(t.diagnostics().reservedBytes,0);t.dispose();
});
await check('paths and origins are not inferred from untrusted names',async()=>{
  for(const url of ['file:///tmp/','http://elsewhere.test/','https://a:b@example.test/','https://example.test/?x=1']) {
    assert.throws(()=>createBiomeTileTransport({baseUrl:url}));
  }
  let calls=0;const t=createBiomeTileTransport({baseUrl,fetchImpl:async()=>{calls++;return response(packed);}});
  for(const d of [{...descriptor,file:'../evil.gz'},{...descriptor,key:'bad'},{...descriptor,jsonBytes:3e6},null])assert.equal((await t.load(d)).status,'rejected');
  assert.equal(calls,0);t.dispose();
});
await check('non-200 and redirected responses are refused',async()=>{
  for(const r of [new Response('no',{status:404}),{status:200,redirected:true}]) {
    const t=createBiomeTileTransport({baseUrl,fetchImpl:async()=>r});assert.equal((await t.load(descriptor)).reason,'response');t.dispose();
  }
});
await check('HTTP auto-decompression cannot cause ambiguous double gzip',async()=>{
  const t=createBiomeTileTransport({baseUrl,fetchImpl:async()=>new Response(packed,{headers:{'Content-Encoding':'gzip'}})});
  assert.equal((await t.load(descriptor)).reason,'http-content-encoding');t.dispose();
});
await check('content length mismatch and streaming overflow both fail',async()=>{
  for(const r of [new Response(packed,{headers:{'Content-Length':'1'}}),new Response(Buffer.concat([packed,packed]))]) {
    const t=createBiomeTileTransport({baseUrl,fetchImpl:async()=>r});assert.equal((await t.load(descriptor)).status,'rejected');t.dispose();
  }
});
await check('truncated, corrupt and wrong-size decoded payloads fail',async()=>{
  for(const [bytes,d] of [[packed.subarray(0,packed.length-5),descriptor],[Buffer.alloc(packed.length),descriptor],
    [packed,{...descriptor,jsonBytes:descriptor.jsonBytes+1}],[packed,{...descriptor,jsonBytes:descriptor.jsonBytes-1}]]) {
    const t=createBiomeTileTransport({baseUrl,fetchImpl:async()=>new Response(stream(bytes))});assert.equal((await t.load(d)).status,'rejected');t.dispose();
  }
});
await check('gzip expansion exceeding retained output cap is cancelled',async()=>{
  const bomb=gzipSync(Buffer.alloc(3*1024*1024));const d={...descriptor,gzipBytes:bomb.length,jsonBytes:128};
  const t=createBiomeTileTransport({baseUrl,fetchImpl:async()=>new Response(stream(bomb))});
  assert.equal((await t.load(d)).reason,'decoded-overflow');assert.equal(t.diagnostics().reservedBytes,0);t.dispose();
});
await check('transport concurrency and reservation budgets refuse extra work',async()=>{
  const gate=deferred(),t=createBiomeTileTransport({baseUrl,maxConcurrent:1,fetchImpl:async()=>{await gate.promise;return response(packed);}});
  const p=t.load(descriptor);assert.equal((await t.load(descriptor)).status,'busy');gate.resolve();assert.equal((await p).status,'loaded');
  assert.equal(t.diagnostics().peakConcurrent,1);t.dispose();
  const tiny=createBiomeTileTransport({baseUrl,maxReservedBytes:1,fetchImpl:async()=>{throw Error('not called');}});
  assert.equal((await tiny.load(descriptor)).status,'busy');tiny.dispose();
});
await check('timeout aborts a stalled response without an internal retry',async()=>{
  const t=createBiomeTileTransport({baseUrl,timeoutMs:10,fetchImpl:()=>new Promise(()=>{})});
  assert.equal((await t.load(descriptor)).status,'discarded');assert.equal(t.diagnostics().active,0);t.dispose();
});
await check('caller abort and disposal interrupt stalled body reads',async()=>{
  for(const disposal of [false,true]) {
    const t=createBiomeTileTransport({baseUrl,fetchImpl:async()=>new Response(new ReadableStream({pull(){return new Promise(()=>{});}}))});
    const controller=new AbortController(),p=t.load(descriptor,{signal:controller.signal});
    await new Promise(r=>setTimeout(r,2));if(disposal)t.dispose();else controller.abort();
    assert.equal((await p).status,'discarded');assert.equal(t.diagnostics().reservedBytes,0);t.dispose();
  }
});
await check('manifest snapshot prevents mid-fetch mutation',async()=>{
  const d={...descriptor},gate=deferred(),t=createBiomeTileTransport({baseUrl,fetchImpl:async()=>{await gate.promise;return response(packed);}});
  const p=t.load(d);d.file='../wrong';d.jsonBytes=1;gate.resolve();assert.equal((await p).status,'loaded');t.dispose();
});
await check('continuous plan includes intermediate cells omitted by endpoints',async()=>{
  const p=createBiomeRoutePlan([[.02,-.02],[.38,-.02]]);
  const w=p.window(0,{aheadMeters:50000,behindMeters:0,corridorMeters:0});
  assert.deepEqual(w.tiles.map(t=>t.x).sort(),[1800,1801,1802,1803]);assert.equal(w.planningLimited,false);
});
await check('antimeridian takes the short path and never scans the world',async()=>{
  const p=createBiomeRoutePlan([[179.95,10.02],[-179.95,10.02]]),w=p.window(0,{aheadMeters:20000,corridorMeters:0});
  assert.deepEqual(w.tiles.map(t=>t.x).sort(),[0,3599]);assert.ok(w.tests<10);
});
await check('seams and corners include both sides; zero-length routes are supported',async()=>{
  const p=createBiomeRoutePlan([[.1,-.1],[.1,-.1]]),w=p.window(0,{corridorMeters:0});
  assert.equal(w.tiles.length,4);assert.equal(w.tiles[0].key,'1801-901');
});
await check('capacity and polar work limits are explicit, never ready-by-truncation',async()=>{
  const p=createBiomeRoutePlan([[0,89.99],[1,89.99]]),w=p.window(0,{corridorMeters:5000,maxTests:10,maxTiles:1});
  assert.equal(w.planningLimited,true);assert.ok(w.tests<=10);
  assert.equal(createBiomeRoutePlan([[.02,-.02],[.4,-.02]]).window(0,{aheadMeters:50000,corridorMeters:0,maxTiles:1}).capacityLimited,true);
});
await check('malformed or ambiguous routes and invalid windows fail',async()=>{
  for(const p of [[],[[0,0]],[[0,0],[NaN,0]],[[0,0],[180,0]]])assert.throws(()=>createBiomeRoutePlan(p));
  const p=createBiomeRoutePlan([[0,0],[1,0]]);assert.throws(()=>p.window(-1));assert.throws(()=>p.window(0,{maxTests:0}));
});
await check('route coordinates are snapshotted and loop/backtracking is deterministic',async()=>{
  const points=[[.02,-.02],[.32,-.02],[.02,-.02]],p=createBiomeRoutePlan(points);
  const a=p.window(0,{aheadMeters:20000,corridorMeters:0});points[1][0]=100;
  assert.deepEqual(p.window(0,{aheadMeters:20000,corridorMeters:0}),a);
});
await check('coordinator loads continuous window and deduplicates updates',async()=>{
  const h=await harness();h.c.setRoute([[.02,-.02],[.38,-.02]]);
  h.c.update(0,{aheadMeters:50000,corridorMeters:0});h.c.update(0,{aheadMeters:50000,corridorMeters:0});
  const d=await h.c.drain();assert.equal(d.ready,true);assert.equal(h.requests(),4);assert.ok(d.peakActive<=2);h.close();
});
await check('missing manifest coverage is not reported as ready',async()=>{
  const h=await harness(1);h.c.setRoute([[.02,-.02],[.38,-.02]]);h.c.update(0,{aheadMeters:50000,corridorMeters:0});
  const d=await h.c.drain();assert.equal(d.ready,false);assert.equal(d.coverage.missing.length,3);assert.equal(h.requests(),1);h.close();
});
await check('coordinator capacity honors service residency ceiling',async()=>{
  const h=await harness(8,{maxTiles:2});h.c.setRoute([[.02,-.02],[.38,-.02]]);h.c.update(0,{aheadMeters:50000,corridorMeters:0});
  const d=await h.c.drain();assert.equal(d.ready,false);assert.equal(d.coverage.capacityLimited,true);assert.ok(d.resident<=2);h.close();
});
await check('transport rejection is visible and repeated updates do not retry endlessly',async()=>{
  const h=await harness(1,{},async(url,options,f)=>response(gzipSync(Buffer.alloc(f.payload.values().next().value.raw.length))));
  h.c.setRoute([[.02,-.02],[.03,-.02]]);const opts={aheadMeters:1000,corridorMeters:0};
  h.c.update(0,opts);await h.c.drain();const count=h.requests();
  for(let i=0;i<20;i++)h.c.update(0,opts);
  await h.c.drain();assert.equal(h.requests(),count);assert.equal(h.c.diagnostics().ready,false);
  h.c.retryFailed();await h.c.drain();assert.equal(h.requests(),count+1);h.close();
});
await check('aborted verification cannot install a tile in a superseded window',async()=>{
  const s=await prepareBiomeService({refinementManifest:f.manifest});const abort=new AbortController();
  const p=s.prepareTile(descriptor.key,f.payload.get(descriptor.file).raw,s.routeToken(),{signal:abort.signal});abort.abort();
  assert.equal((await p).status,'discarded');assert.equal(s.isTileResident(descriptor.key),false);s.dispose();
});
await check('route replacement keeps old work budgeted and reloads the same key',async()=>{
  const h=await harness(1),gate=deferred();let calls=0;
  const transport={load:async()=>{calls++;if(calls===1)await gate.promise;return {status:'loaded',bytes:h.f.payload.get(descriptor.file).raw};}};
  h.c.dispose(); // use a fresh exclusively owned service
  const s=await prepareBiomeService({refinementManifest:h.f.manifest}),c=createBiomeRoutePreparer({service:s,transport});
  const route=[[.02,-.02],[.03,-.02]],o={aheadMeters:1000,corridorMeters:0};
  c.setRoute(route);c.update(0,o);c.setRoute(route);c.update(0,o);gate.resolve();
  assert.equal((await c.drain()).ready,true);assert.equal(calls,2);assert.equal(s.query(-.02,.02).status,'resolved');c.dispose();h.transport.dispose();
});
await check('rolling windows and return driving recover evicted tiles',async()=>{
  const h=await harness(12,{maxTiles:2}),r=h.c.setRoute([[.02,-.02],[1.18,-.02]]);
  for(const k of [0,2,4,6,8,10,8,4,0]) {
    h.c.update(r.totalMeters*k/11,{aheadMeters:200,behindMeters:0,corridorMeters:0});
    const d=await h.c.drain();assert.equal(d.ready,true);assert.ok(h.s.diagnostics().refinement.residentTiles<=2);
  }
  assert.ok(h.requests()>=8);assert.ok(h.s.diagnostics().refinement.evictions>=6);h.close();
});
await check('synchronous service query does not trigger transport or planning',async()=>{
  const h=await harness(1);h.c.setRoute([[.02,-.02],[.03,-.02]]);h.c.update(0,{corridorMeters:0});await h.c.drain();
  const n=h.requests();for(let i=0;i<100000;i++)assert.equal(h.s.query(-.02,.02).status,'resolved');
  assert.equal(h.requests(),n);h.close();assert.equal(h.c.diagnostics().ready,false);
});
console.log(`PASS Block 8 biome loading R4: ${groups} groups; no game activation`);
