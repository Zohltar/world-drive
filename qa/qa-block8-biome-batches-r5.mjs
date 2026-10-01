import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createBiomeBatchSource} from '../src/scenery/biomes/batch-source.js';
import {createBiomeBatchRouteSession} from '../src/scenery/biomes/batch-route-session.js';
import {createBiomeTileTransport} from '../src/scenery/biomes/tile-transport.js';
import {createBiomeRoutePlan} from '../src/scenery/biomes/route-tile-plan.js';
import {batchFixture} from './biome-batch-fixtures-r5.mjs';
const f=batchFixture();let groups=0,mode=null;
const server=createServer((req,res)=>{
  const file=decodeURIComponent(req.url.slice(1));let body=f.files.get(file);
  if(!body){res.writeHead(404);res.end();return;}
  if(mode==='stall'){return;}
  if(mode==='corrupt'&&file.startsWith('batch-'))body=Buffer.from('x'.repeat(body.length));
  if(mode==='overflow'&&file.startsWith('batch-'))body=Buffer.concat([body,Buffer.from('x')]);
  const send=()=>{res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':body.length});res.end(body);};
  if(mode==='delay')setTimeout(send,30);else send();
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const baseUrl=`http://127.0.0.1:${server.address().port}/`;
const options={aheadMeters:1000,behindMeters:0,corridorMeters:0};
const point=i=>({x:1800+i,y:900,key:`${1800+i}-900`});
async function source(extra={}){return createBiomeBatchSource({directory:f.directory,baseUrl,...extra});}
async function session(){const src=await source();const transport=createBiomeTileTransport({baseUrl});return createBiomeBatchRouteSession({source:src,transport});}
async function check(name,fn){await fn();console.log('PASS',name);groups++;}
try{
 await check('directory validation rejects limits/paths/catalog and revision',async()=>{
  for(const change of [d=>d.batches.push(d.batches[0]),d=>d.batches[0].file='../page',d=>d.catalogSha256='f'.repeat(64),d=>d.revision='']){
    const d=structuredClone(f.directory);change(d);await assert.rejects(source({directory:d}));}
  for(const url of ['http://example.com/','https://x/a','https://u:p@x/','https://x/?a'])await assert.rejects(source({baseUrl:url}));
 });
 await check('150 tiles through 15 successive pages then reverse without growing residency',async()=>{
  const s=await session();s.setRoute(f.coordinates);const total=createBiomeRoutePlan(f.coordinates).totalMeters;
  for(const i of [...Array(150).keys(),...Array(150).keys()].map((v,k)=>k<150?v:149-v)){
    const r=await s.update(total*i/149,options);assert.equal(r.status,'ready',JSON.stringify(r));
    const [lon,lat]=f.coordinates[i];assert.equal(s.query(lat,lon).ecoregion.id,i%2+1);
  }
  const d=s.diagnostics();assert.ok(d.handoffs>=150);assert.equal(d.peakServices,2);assert.ok(d.source.evictions>0);
  assert.ok(d.source.peakCachedPages<=2);assert.ok(d.peakResidentArrayBytes<=2*8*1024*1024);assert.equal(d.pending,0);
  console.log('LONG_SYNTHETIC',JSON.stringify({windows:300,tiles:150,meters:total,handoffs:d.handoffs,peakResidentArrayBytes:d.peakResidentArrayBytes,manifestPages:d.source.directoryPages,peakCachedPages:d.source.peakCachedPages}));s.dispose();
 });
 await check('overlap reuse retains active service',async()=>{const s=await session();s.setRoute(f.coordinates);await s.update(0,options);await s.update(0,options);assert.equal(s.diagnostics().reuses,1);s.dispose();});
 await check('corrupted page cannot evict active valid data',async()=>{const s=await session();s.setRoute(f.coordinates);await s.update(0,options);mode='corrupt';assert.equal((await s.update(300000,options)).status,'rejected');assert.equal(s.query(-.05,.05).ecoregion.id,1);mode=null;s.dispose();});
 await check('declared page overflow is rejected',async()=>{const src=await source();mode='overflow';assert.equal((await src.resolve([point(0)])).status,'rejected');mode=null;src.dispose();});
 await check('page identity fails despite valid digest',async()=>{const key='batch-180-90.json',original=f.files.get(key),p=JSON.parse(original);p.sourceSha256='b'.repeat(64);const bytes=Buffer.from(JSON.stringify(p)),d=structuredClone(f.directory);d.batches[0].jsonBytes=bytes.length;d.batches[0].sha256=createHash('sha256').update(bytes).digest('hex');f.files.set(key,bytes);const src=await source({directory:d});assert.equal((await src.resolve([point(0)])).status,'rejected');src.dispose();f.files.set(key,original);});
 await check('missing coverage is explicit and cannot manufacture source records',async()=>{const src=await source();const r=await src.resolve([{x:2000,y:900,key:'2000-900'}]);assert.equal(r.status,'missing');assert.deepEqual(r.missing,['2000-900']);src.dispose();});
 await check('caller manifest mutation cannot poison cached page or identity',async()=>{const d=structuredClone(f.directory),src=await source({directory:d});d.source.sha256='b'.repeat(64);const r=await src.resolve([point(0)]);r.manifest.records[1].name='poison';r.manifest.tiles[0].file='poison';const again=await src.resolve([point(0)]);assert.equal(again.manifest.records[1].name,'MOCK tropical');assert.equal(again.manifest.tiles[0].file,'1800-900.json.gz');src.dispose();});
 await check('stalled HTTP respects deadline',async()=>{mode='stall';const src=await source({timeoutMs:40});const start=performance.now();assert.equal((await src.resolve([point(0)])).status,'discarded');assert.ok(performance.now()-start<2000);mode=null;src.dispose();});
 await check('page admission bounded; parallel resolver returns busy',async()=>{mode='delay';const src=await source();const p=src.resolve([point(0)]);assert.equal((await src.resolve([point(10)])).status,'busy');await p;mode=null;src.dispose();});
 await check('abort/dispose cancels page without late cache installation',async()=>{mode='delay';const src=await source();const p=src.resolve([point(0)]);src.dispose();assert.equal((await p).status,'discarded');assert.equal(src.diagnostics().cachedPages,0);mode=null;});
 await check('successive updates coalesce to a single latest request',async()=>{mode='delay';const s=await session();s.setRoute(f.coordinates);const p=s.update(0,options),q=s.update(120000,options),r=s.update(230000,options);assert.equal(s.diagnostics().pending,1);assert.equal((await q).status,'discarded');assert.equal((await p).status,'discarded');assert.equal((await r).status,'ready');mode=null;s.dispose();});
 await check('old-route completion cannot replace new route',async()=>{mode='delay';const s=await session();s.setRoute(f.coordinates);const old=s.update(0,options);s.setRoute(f.coordinates.slice(50));const fresh=s.update(0,options);assert.equal((await old).status,'discarded');assert.equal((await fresh).status,'ready');assert.equal(s.query(-.05,5.05).ecoregion.id,1);assert.equal(s.query(-.05,.05).status,'unavailable');mode=null;s.dispose();});
 await check('disposal rejects pending work and drops resident state',async()=>{mode='delay';const s=await session();s.setRoute(f.coordinates);const p=s.update(0,options),q=s.update(100000,options);s.dispose();assert.equal((await p).status,'discarded');assert.equal((await q).status,'discarded');assert.equal(s.query(-.05,.05).status,'unavailable');mode=null;});
 await check('invalid route/window do not replace valid state',async()=>{const s=await session();s.setRoute(f.coordinates);await s.update(0,options);assert.throws(()=>s.setRoute([[999,0],[0,0]]));assert.throws(()=>s.update(-1));assert.equal(s.query(-.05,.05).status,'resolved');s.dispose();});
 await check('route capacity failure explicit and no transport side effect',async()=>{const s=await session();s.setRoute([[.05,0],[14.95,0]]);const r=await s.update(0,{aheadMeters:50000,corridorMeters:5000,maxTiles:1});assert.equal(r.status,'limited');assert.equal(s.diagnostics().source.requests,0);s.dispose();});
 await check('100k synchronous queries produce no transport or preparation',async()=>{const s=await session();s.setRoute(f.coordinates);await s.update(0,options);const before=s.diagnostics();for(let i=0;i<100000;i++)assert.equal(s.query(-.05,.05).ecoregion.id,1);const after=s.diagnostics();assert.equal(after.source.requests,before.source.requests);assert.equal(after.transport.started,before.transport.started);s.dispose();});
 console.log(`PASS Block 8 R5 batches: ${groups} groups`);
}finally{mode=null;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
