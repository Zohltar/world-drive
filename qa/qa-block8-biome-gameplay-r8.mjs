import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createBiomeGameplayDiagnostics} from '../src/scenery/biomes/gameplay-diagnostics.js';
import {createBiomeObserverPlan} from '../src/scenery/biomes/route-observer-plan.js';
import {createBiomeRoutePlan} from '../src/scenery/biomes/route-tile-plan.js';
import {buildForestChunkRequest} from '../src/scenery/biomes/forest-candidate-adapter.js';
import {captureChunkContext} from '../src/scenery/biomes/chunk-context-snapshot.js';
import {BIOME_PROFILES} from '../src/scenery/biomes/biome-profiles.js';
import {attachBiomeRouteDiagnostics} from '../src/app/biome-diagnostics.js';
const tests=[];
const test=async(name,fn)=>{await fn();tests.push(name);};
const identity={revision:'r8-unit',source:{id:'RESOLVE-ECOREGIONS-2017',license:'CC-BY-4.0',sha256:'a'.repeat(64)},catalogSha256:'b'.repeat(64)};
const config={directory:identity,baseUrl:'http://localhost/data/'};
const resolved={schema:'world-drive-biome-context-v1',...BIOME_PROFILES[6],status:'resolved',reason:null,
  source:identity.source,ecoregion:{id:2,biome:6,name:'MOCK',realm:'Test'},precision:'source-polygons',confidence:'source-agreement',
  paletteEligible:true,regionalHint:null,resolutionDegrees:null,transitionReady:false,boundaryDiagnostic:false,placementAuthority:false,elevationApplied:false};
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
class MockClient{
  generation=0;serial=0;calls=0;closed=false;updateCalls=0;gate=null;mode='ready';query=()=>resolved;initFailure=false;
  async initialize(value){this.config=value;if(this.initFailure)throw new Error('init failed');}
  async setRoute(){return {generation:++this.generation};}
  async update(){this.updateCalls++;return {status:this.mode,generation:this.generation,serial:++this.serial,revision:identity.revision};}
  async captureChunk(){throw new Error('unexpected point capture');}
  async captureForestChunk(input){
    this.calls++;assert.ok(!('points' in input));const request=buildForestChunkRequest(input);
    const packet=captureChunkContext(request,identity,{query:this.query,
      diagnostics:()=>({ready:true,generation:this.generation,serial:this.serial})});
    if(this.gate)await this.gate.promise;
    return {points:request.points,packet};
  }
  async diagnostics(){return {ready:this.mode==='ready',last:{reason:this.mode==='ready'?null:'missing-tile'},peakServices:2,handoffs:0,source:{},transport:{}};}
  dispose(){this.closed=true;this.gate?.resolve();}
}
function open({factory=()=>new MockClient()}={}){
  const state={gameStarted:true,origin:{lat:0,lon:0},absX:100,absZ:0};
  let generation=1,ready=true,id=0;const scheduled=new Map(),clients=[];
  const route=Array.from({length:201},(_,i)=>({lon:i*.001,lat:0}));
  const api=createBiomeGameplayDiagnostics({getState:()=>state,getGeneration:()=>generation,getRoute:()=>route,isRouteReady:()=>ready,
    schedule:cb=>{const key=++id;scheduled.set(key,cb);return ()=>scheduled.delete(key);},
    clientFactory:()=>{const c=factory();clients.push(c);return c;}});
  return {api,state,clients,route,scheduled,setGeneration:v=>generation=v,setReady:v=>ready=v,
    async tick(admitted=true){assert.equal(scheduled.size,1);const [key,cb]=scheduled.entries().next().value;scheduled.delete(key);await cb(admitted);}};
}
await test('disabled owner performs no work or scheduling',()=>{
  const h=open();assert.equal(h.scheduled.size,0);assert.equal(h.clients.length,0);assert.equal(h.api.diagnostics().enabled,false);h.api.stop();
});
await test('game-not-started waits without allocating a Worker',async()=>{
  const h=open();h.state.gameStarted=false;h.api.start(config);await h.tick();assert.equal(h.clients.length,0);h.api.stop();
});
await test('route-not-ready waits without allocating a Worker',async()=>{
  const h=open();h.setReady(false);h.api.start(config);await h.tick();assert.equal(h.clients.length,0);h.api.stop();
});
await test('idle headroom defers admission',async()=>{
  const h=open();h.api.start(config);await h.tick(false);assert.equal(h.clients.length,0);assert.equal(h.api.diagnostics().idleDeferrals,1);h.api.stop();
});
await test('current and forward snapshots preserve source and false planting authority',async()=>{
  const h=open();h.api.start(config);await h.tick();const d=h.api.diagnostics();
  assert.equal(d.phase,'observed');assert.equal(d.freshCurrentChunk,true);assert.equal(d.last.chunks.length,4);
  assert.ok(d.last.chunks.every(c=>c.counts.resolved===1744));assert.equal(d.bridge.maxChunks,16);
  const q=h.api.sample(0,0,0);assert.equal(q.ecoregion.id,2);assert.equal(q.placementAuthority,false);assert.ok(Object.isFrozen(q));h.api.stop();
});
await test('stationary observations do not repeatedly request windows or chunks',async()=>{
  const h=open();h.api.start(config);await h.tick();const calls=h.clients[0].calls;
  for(let i=0;i<20;i++)await h.tick();assert.equal(h.clients[0].calls,calls);assert.equal(h.clients[0].updateCalls,1);h.api.stop();
});
await test('explicit refresh permits another observation without hidden retry loop',async()=>{
  const h=open();h.api.start(config);await h.tick();h.api.refresh();await h.tick();assert.equal(h.clients[0].updateCalls,2);h.api.stop();
});
await test('missing coverage is explicit and stationary failure is not retried',async()=>{
  const h=open({factory:()=>Object.assign(new MockClient(),{mode:'unavailable'})});h.api.start(config);await h.tick();
  assert.equal(h.api.diagnostics().phase,'missing-coverage');assert.equal(h.api.diagnostics().worker.reason,'missing-tile');
  for(let i=0;i<10;i++)await h.tick();assert.equal(h.clients[0].updateCalls,1);assert.equal(h.clients[0].calls,0);h.api.stop();
});
await test('partial valid packets do not become all-ready geography',async()=>{
  const q={...resolved,...BIOME_PROFILES[0],status:'unavailable',reason:'tile-not-resident',ecoregion:null,precision:null,confidence:'unavailable',paletteEligible:false};
  const h=open({factory:()=>Object.assign(new MockClient(),{query:()=>q})});h.api.start(config);await h.tick();
  assert.ok(h.api.diagnostics().last.chunks.every(c=>c.counts.unavailable===1744));assert.equal(h.api.sample(0,0,0).status,'unavailable');h.api.stop();
});
await test('worker initialization error suspends instead of continuously restarting',async()=>{
  const h=open({factory:()=>Object.assign(new MockClient(),{initFailure:true})});h.api.start(config);await h.tick();
  assert.equal(h.api.diagnostics().phase,'fault');assert.equal(h.scheduled.size,0);assert.equal(h.clients.length,1);assert.equal(h.clients[0].closed,true);h.api.stop();
});
await test('route invalidation immediately clears prepared synchronous reads',async()=>{
  const h=open();h.api.start(config);await h.tick();h.api.invalidate();h.setReady(false);assert.equal(h.clients[0].closed,true);
  assert.equal(h.api.sample(0,0,0).status,'unavailable');assert.equal(h.scheduled.size,0);
  h.setGeneration(2);h.setReady(true);h.api.routeReady();await h.tick();assert.equal(h.clients.length,2);h.api.stop();
});
await test('unannounced generation/origin change is also rejected',async()=>{
  const h=open();h.api.start(config);await h.tick();h.setGeneration(2);assert.equal(h.api.sample(0,0,0).status,'unavailable');await h.tick();
  assert.equal(h.clients[0].closed,true);await h.tick();h.state.origin.lon=.01;
  assert.equal(h.api.sample(0,0,0).status,'unavailable');await h.tick();h.api.stop();
});
await test('teleport detection invalidates current location and old handles',async()=>{
  const h=open();h.api.start(config);await h.tick();h.state.absX=5000;assert.equal(h.api.diagnostics().freshCurrentChunk,false);await h.tick();
  assert.equal(h.api.diagnostics().teleports,1);assert.equal(h.clients[0].closed,true);await h.tick();assert.equal(h.api.diagnostics().freshCurrentChunk,true);h.api.stop();
});
await test('in-flight capture cannot publish after route invalidation',async()=>{
  const h=open();const gate=deferred();h.api.start(config);
  const t=h.tick();while(!h.clients[0]?.calls)await Promise.resolve();h.clients[0].gate=gate;
  h.api.invalidate();h.setReady(false);await t;assert.equal(h.api.diagnostics().last,null);assert.equal(h.api.sample(0,0,0).status,'unavailable');h.api.stop();
});
await test('configuration copied before asynchronous initialization',async()=>{
  const h=open(),value=structuredClone(config);h.api.start(value);value.directory.source.sha256='c'.repeat(64);await h.tick();
  assert.equal(h.clients[0].config.directory.source.sha256,identity.source.sha256);h.api.stop();
});
await test('invalid and oversized roots rejected before scheduling',()=>{
  const h=open();assert.throws(()=>h.api.start({}));assert.throws(()=>h.api.start({x:'x'.repeat(2097153)}));
  assert.equal(h.scheduled.size,0);h.api.stop();
});
await test('stop is idempotent and cancels all observer-owned work',async()=>{
  const h=open();h.api.start(config);await h.tick();h.api.stop();h.api.stop();assert.equal(h.scheduled.size,0);
  assert.equal(h.clients[0].closed,true);assert.equal(h.api.diagnostics().phase,'disabled');
});
await test('geographic progress uses canonical cumulative metric, not projected distance',()=>{
  const origin={lat:50.3,lon:6.9},route=[{lon:6.9,lat:50.3},{lon:6.901,lat:50.305},{lon:6.91,lat:50.31}];
  const h=createBiomeObserverPlan(route,{origin,routeId:'unit'}),p=createBiomeRoutePlan(route.map(v=>[v.lon,v.lat]));
  for(let i=0;i<route.length;i++){
    const x=(route[i].lon-origin.lon)*Math.PI/180*6378137*Math.cos(origin.lat*Math.PI/180),z=-(route[i].lat-origin.lat)*Math.PI/180*6378137;
    assert.ok(Math.abs(h.locate(x,z).progress-p.distanceAtVertex(i))<1e-7);
  }assert.throws(()=>p.distanceAtVertex(-1));assert.throws(()=>p.distanceAtVertex(3));
});
await test('reverse progress points forward probes in direction of travel',()=>{
  const h=open(),p=createBiomeObserverPlan(h.route,{origin:h.state.origin,routeId:'reverse'});
  p.locate(5000,0);const pos=p.locate(4900,0);assert.equal(pos.direction,-1);assert.ok(pos.chunks.slice(1).every(c=>c.cx<=pos.chunks[0].cx));h.api.stop();
});
await test('negative absolute positions and unsupported seams are explicit',()=>{
  const route=[{lat:0,lon:-.01},{lat:0,lon:0},{lat:0,lon:.01}];
  const p=createBiomeObserverPlan(route,{origin:{lat:0,lon:0},routeId:'negative'});
  assert.equal(p.locate(-.1,0).chunks[0].cx,-1);
  assert.throws(()=>createBiomeObserverPlan([{lat:0,lon:179},{lat:0,lon:-179}],{origin:{lat:0,lon:179},routeId:'seam'}));
});
await test('sampling is synchronous and adds no transport',async()=>{
  const h=open();h.api.start(config);await h.tick();const calls=h.clients[0].calls,q=h.api.sample(0,0,0);
  for(let i=0;i<100000;i++)assert.equal(h.api.sample(0,0,0),q);assert.equal(h.clients[0].calls,calls);h.api.stop();
});
await test('nonbrowser routing callers retain exact original object',()=>{
  const value={};assert.equal(attachBiomeRouteDiagnostics(value,{}, {target:{}}),value);
});
await test('browser facade stays lazy and preserves original route promise/result',async()=>{
  const gate=deferred();let loads=0;const life={worldDrive:{route:{generation:0}},loadRoute:()=>gate.promise,
    createRequestedRoute:()=>gate.promise,bumpRouteGeneration:()=>17,resetWorldCaches:()=>23};
  const target={document:{}},out=attachBiomeRouteDiagnostics(life,{route:[]},{target,load:()=>{loads++;throw new Error('disabled');}});
  assert.equal(out.worldDrive,life.worldDrive);assert.equal(out.loadRoute(),gate.promise);gate.resolve(true);await gate.promise;
  assert.equal(out.bumpRouteGeneration(),17);assert.equal(out.resetWorldCaches(),23);assert.equal(loads,0);
  assert.equal(target.WorldDriveDiagnostics.forest.biomes.snapshot().enabled,false);
});
await test('pagehide cancels pending lazy startup before Worker construction',async()=>{
  const gate=deferred();let made=0;const target={document:{},addEventListener(){},removeEventListener(){}};
  attachBiomeRouteDiagnostics({worldDrive:{route:{generation:0}}},{route:[]},{target,load:()=>gate.promise});
  const api=target.WorldDriveDiagnostics.forest.biomes,p=api.start(config);api.stop();
  gate.resolve({createBiomeGameplayDiagnostics:()=>{made++;}});assert.equal((await p).status,'discarded');assert.equal(made,0);
});
await test('side observer failure cannot change the successful routing promise',async()=>{
  const target={document:{},addEventListener(){},removeEventListener(){}};const result=Promise.resolve(true);
  const fake={start:()=>({status:'enabled'}),stop(){},invalidate(){throw new Error('observer bug');},routeReady(){},diagnostics:()=>({})};
  const out=attachBiomeRouteDiagnostics({worldDrive:{route:{generation:0}},loadRoute:()=>result},{route:[]},
    {target,load:async()=>({createBiomeGameplayDiagnostics:()=>fake})});
  await target.WorldDriveDiagnostics.forest.biomes.start(config);assert.equal(out.loadRoute(),result);assert.equal(await result,true);
});
console.log(`PASS R8 diagnostic lifecycle ${tests.length} groups (unit clients are emulated)`);
if(process.argv.includes('--report'))writeFileSync(process.argv[process.argv.indexOf('--report')+1],JSON.stringify({status:'PASS',groups:tests,client:'EMULATED',synchronousReads:100000},null,2));
