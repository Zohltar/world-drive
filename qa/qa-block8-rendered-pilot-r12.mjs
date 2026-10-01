import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRenderedBiomePilot,scheduleR12} from '../tools/biomes/rendered-pilot-r12.mjs';
import {R12_SOURCE,R12_CATALOG_SHA,R12_REGION,R12_LIMITS,r12Model,r12Season,r12ContextEligible,createR12Proof,sameR12Geometry,r12ChunkKey} from '../tools/biomes/rendered-pilot-policy-r12.mjs';
import {BIOME_PROFILES} from '../src/scenery/biomes/biome-profiles.js';
import {createForestCandidateAdapter,FOREST_LAYOUT_ID} from '../src/scenery/biomes/forest-candidate-adapter.js';
const identity={revision:'resolve2017-r12-nord-rendered',source:R12_SOURCE,catalogSha256:R12_CATALOG_SHA};
const context=Object.freeze({schema:'world-drive-biome-context-v1',...BIOME_PROFILES[4],
  status:'resolved',reason:null,source:R12_SOURCE,ecoregion:R12_REGION,precision:'source-polygons',
  confidence:'source-agreement',paletteEligible:true,placementAuthority:false,elevationApplied:false});
const origin={lat:50.337751,lon:6.951275};
const adapter=createForestCandidateAdapter({origin,routeId:'visual-1'});
function snapshot(cx=0,cz=0,lookup=()=>context){return {layoutId:FOREST_LAYOUT_ID,count:1744,cx,cz,
  projectionId:adapter.projectionId,identity,counts:{resolved:1744,noData:0,unavailable:0},lookup};}
let tests=0;const results=[];
async function test(name,fn){await fn();tests++;results.push(name);console.log('PASS',name);}
await test('only explicit summer/winter mapping and scoped source contexts',()=>{
  assert.equal(r12Model('summer'),'preview-temperate');assert.equal(r12Model('winter'),'preview-temperate-winter');
  for(const s of [null,undefined,'autumn','Winter',{},1])assert.throws(()=>r12Season(s));
  assert.ok(r12ContextEligible(context));
  for(const patch of [{status:'unavailable'},{paletteEligible:false},{precision:'regional'},
    {confidence:'guess'},{placementAuthority:true},{elevationApplied:true},{family:'boreal'},
    {source:{...R12_SOURCE,sha256:'0'.repeat(64)}},{ecoregion:{...R12_REGION,id:373}},
    {ecoregion:{...R12_REGION,realm:'Nearctic'}},{ecoregion:{...R12_REGION,name:'Guess'}}])
    assert.equal(r12ContextEligible({...context,...patch}),false);
});
await test('whole original layout: every coordinate checked, not a centre assumption',()=>{
  const seen=[];const proof=createR12Proof(snapshot(0,0,(i,lon,lat)=>{
    const p=adapter.point(0,0,i);assert.equal(lon,p.lon);assert.equal(lat,p.lat);seen.push(i);return context;
  }),adapter,0,0);
  let r;do{r=proof.step();assert.ok(r.checked<=R12_LIMITS.checksPerSlice);}while(!r.done);
  assert.equal(r.eligible,true);assert.equal(proof.result().count,1744);
  assert.deepEqual(seen,Array.from({length:1744},(_,i)=>i));assert.equal(proof.step().checked,0);
});
await test('one unresolved or incompatible last candidate refuses the entire substitution',()=>{
  for(const last of [null,{...context,status:'unavailable'},{...context,ecoregion:{...R12_REGION,id:685}}]){
    const p=createR12Proof(snapshot(-1,-2,i=>i===1743?last:context),adapter,-1,-2);
    let r;do{r=p.step();}while(!r.done);assert.equal(r.eligible,false);assert.equal(p.result(),null);
  }
});
await test('immutable dictionary memoization still checks ALL exact point addresses',()=>{
  let reads=0;
  const p=createR12Proof(snapshot(0,0,(i,lon,lat)=>{reads++;const at=adapter.point(0,0,i);
    assert.equal(lon,at.lon);assert.equal(lat,at.lat);return context;}),adapter,0,0);
  let r;do{r=p.step();}while(!r.done);
  assert.equal(reads,1744);assert.equal(p.result().count,1744);
  assert.equal(p.diagnostics().contextChecks,1);assert.equal(p.diagnostics().cachedContexts,1);
});
await test('context cache stays bounded and never trusts mutable records or accessors',()=>{
  const many=Array.from({length:80},()=>Object.freeze({...context}));
  const p=createR12Proof(snapshot(0,0,i=>many[i%many.length]),adapter,0,0);
  let r;do{r=p.step();}while(!r.done);assert.ok(p.result());
  assert.equal(p.diagnostics().cachedContexts,64);assert.ok(p.diagnostics().contextChecks>64);
  for(const kind of ['record','source','accessor']){
    const record={...R12_REGION},source={...R12_SOURCE};let id=686;
    const changing=Object.freeze({...context,...(kind==='record'?{ecoregion:record}:kind==='source'?{source}:
      {ecoregion:Object.freeze({...R12_REGION,get id(){return id;}})})});
    const x=createR12Proof(snapshot(0,0,i=>{
      if(i===1743){record.id=373;source.sha256='0'.repeat(64);id=373;}return changing;
    }),adapter,0,0);
    do{r=x.step();}while(!r.done);
    assert.equal(x.result(),null,kind+' must be rechecked at the last position');
    assert.equal(x.diagnostics().cachedContexts,0);assert.equal(x.diagnostics().contextChecks,1744);
  }
});
await test('corrupt layout/address/source identity and unbounded slices are rejected',()=>{
  for(const patch of [{count:1743},{layoutId:'fake'},{cx:1},{projectionId:'old'},
    {identity:{...identity,catalogSha256:'0'.repeat(64)}}])assert.throws(()=>createR12Proof({...snapshot(),...patch},adapter,0,0));
  for(const n of [0,R12_LIMITS.checksPerSlice+1,NaN,Infinity,1.1])assert.throws(()=>createR12Proof(snapshot(),adapter,0,0).step(n));
  assert.deepEqual(r12ChunkKey({name:'forest-chunk--2:3'}),{key:'-2:3',cx:-2,cz:3});
  for(const name of ['x','forest-chunk-NaN:3','forest-chunk-1.1:3','forest-chunk-999999999999999999999:0'])assert.equal(r12ChunkKey({name}),null);
});
class Group{
  constructor(name=''){this.name=name;this.visible=true;this.children=[];this.parent=null;this.events=new Map();}
  addEventListener(t,f){if(!this.events.has(t))this.events.set(t,new Set());this.events.get(t).add(f);}
  removeEventListener(t,f){this.events.get(t)?.delete(f);}
  dispatch(t,child){for(const f of this.events.get(t)??[])f({type:t,child});}
  add(child){child.parent?.remove(child);this.children.push(child);child.parent=this;this.dispatch('childadded',child);}
  remove(child){const i=this.children.indexOf(child);if(i>=0){this.children.splice(i,1);child.parent=null;this.dispatch('childremoved',child);}}
}
function geometry(offset=0){return {attributes:Object.fromEntries(['position','normal','color'].map(k=>[k,{array:new Float32Array([offset,1,2]),count:1}])),index:{array:new Uint16Array([0,1,2]),count:3}};}
function setup({bad=false,late=false,wrongRoute=false,clock=null}={}){
  const base=geometry(),summer=geometry(1),winter=geometry(2),q=[],parent=new Group('forest'),rg=new Group('forest-route-cache-one');parent.add(rg);
  const state={gameStarted:true,origin:{...origin},absX:0,absZ:0};let generation=1,created=0,disposed=0,assetsDisposed=0,updates=0,fetches=0;
  const coordinates=JSON.parse(fs.readFileSync(new URL('../src/routing/circuits/nordschleife.json',import.meta.url)));
  const rows=coordinates.coordinates??coordinates;const route=rows.map(([lon,lat])=>({lon,lat}));if(wrongRoute)route.pop();
  const client={initialize(){created++;return late?new Promise(r=>initResolve=r):Promise.resolve({});},
    diagnostics:async()=>({ready:true,transport:{loaded:1,rejected:0},source:{},handoffs:1}),dispose(){if(!this.closed){this.closed=true;disposed++;}}};
  let initResolve;
  function add(cx=0,cz=0,count=100){const g=new Group(`forest-chunk-${cx}:${cz}`),m=new Group('mesh');m.isInstancedMesh=true;
    m.userData={sharedForestGeometry:true,forestChunk:`${cx}:${cz}`};m.geometry=base;m.material={unchanged:true};m.count=count;
    m.instanceMatrix={array:new Float32Array(1744*16).fill(.5)};m.boundingSphere={radius:379};g.add(m);rg.add(g);return {g,m};}
  const row=add();
  const bridge={setRoute:async()=>({status:'route-ready'}),update:async()=>{updates++;return {status:'ready'};},get:()=>null,
    prepareForestChunk:async({cx,cz})=>{fetches++;return {status:'prepared',snapshot:snapshot(cx,cz,i=>bad&&i===1743?null:context)};},
    dispose:()=>client.dispose(),diagnostics:()=>({residentChunks:1,maxChunks:16})};
  const pilot=createRenderedBiomePilot({THREE:{},forestGroup:parent,getState:()=>state,getGeneration:()=>generation,getRoute:()=>route,
    clientFactory:()=>client,bridgeFactory:()=>bridge,assetFactory:()=>({summerAssets:[{parts:[{geometry:base}]}],
      assets:[{id:'preview-temperate',parts:[{geometry:summer}]},{id:'preview-temperate-winter',parts:[{geometry:winter}]}],dispose:()=>assetsDisposed++}),
    now:clock??(()=>0),schedule:(cb,delay)=>{const v={cb,delay,cancelled:false};q.push(v);return ()=>v.cancelled=true;}});
  async function tick(ok=true){const v=q.shift();if(v&&!v.cancelled)void v.cb(ok);for(let i=0;i<15;i++)await Promise.resolve();}
  async function until(check,limit=500){for(let i=0;i<limit&&!check();i++)await tick();assert.ok(check(),'synthetic scheduler did not reach target');}
  const config={directory:identity,baseUrl:'http://example.invalid/data/',season:'summer'};
  return {pilot,row,add,q,rg,parent,base,summer,winter,state,config,tick,until,
    generation(v){generation=v;},resolve(){initResolve?.({});},counts:()=>({created,disposed,assetsDisposed,updates,fetches})};
}
await test('OFF has no model construction, Worker, timer, scene edits or requests',()=>{
  const h=setup();assert.equal(h.pilot.diagnostics().enabled,false);assert.equal(h.q.length,0);assert.equal(h.counts().created,0);assert.equal(h.row.m.geometry,h.base);
});
await test('actual mesh receives only geometry: count, buffer, material and bounds retained',async()=>{
  const h=setup(),{m}=h.row;const matrix=m.instanceMatrix,bytes=m.instanceMatrix.array.slice(),material=m.material,bounds=m.boundingSphere;
  h.pilot.start(h.config);await h.until(()=>h.pilot.diagnostics().modifiedChunks===1);
  assert.equal(m.geometry,h.summer);assert.equal(m.instanceMatrix,matrix);assert.deepEqual(matrix.array,bytes);
  assert.equal(m.count,100);assert.equal(m.material,material);assert.equal(m.boundingSphere,bounds);
  assert.equal(h.pilot.audit().meshes[0].proofCandidates,1744);assert.equal(h.pilot.diagnostics().proofCandidates,1744);
  assert.equal(h.row.g.children.length,1);assert.equal(h.pilot.diagnostics().modifiedInstances,100);h.pilot.stop();
  assert.equal(m.geometry,h.base);assert.equal(h.counts().disposed,1);assert.equal(h.counts().assetsDisposed,1);
});
await test('season changes are reversible with identical instance matrices and density counts',async()=>{
  const h=setup();h.pilot.start(h.config);await h.until(()=>h.pilot.diagnostics().modifiedChunks===1);
  const matrix=h.row.m.instanceMatrix,hash=h.pilot.audit().meshes[0].matrixHash;
  for(let i=0;i<100;i++){h.pilot.season('winter');assert.equal(h.row.m.geometry,h.winter);h.pilot.season('summer');}
  assert.equal(h.row.m.instanceMatrix,matrix);assert.equal(h.pilot.audit().meshes[0].matrixHash,hash);
  h.row.m.count=37;assert.equal(h.pilot.diagnostics().modifiedInstances,37);h.pilot.stop();
});
await test('R4 first-layer/full replacement immediately reuses proof without an extra model/frame queue',async()=>{
  const h=setup();h.pilot.start(h.config);await h.until(()=>h.pilot.diagnostics().modifiedChunks===1);
  h.rg.remove(h.row.g);assert.equal(h.row.m.geometry,h.base);
  const b=h.add(0,0,700);assert.equal(b.m.geometry,h.summer);assert.equal(b.m.count,700);
  assert.equal(h.pilot.diagnostics().proofsCompleted,1);assert.equal(h.pilot.diagnostics().modifiedChunks,1);h.pilot.stop();
});
await test('cache detach/reattach restores and reapplies only the owned geometry',async()=>{
  const h=setup();h.pilot.start(h.config);await h.until(()=>h.pilot.diagnostics().modifiedChunks===1);
  h.row.m.count=0;h.rg.remove(h.row.g);assert.equal(h.row.m.geometry,h.base);h.rg.add(h.row.g);assert.equal(h.row.m.geometry,h.summer);
  h.row.m.count=214;assert.equal(h.pilot.diagnostics().modifiedInstances,214);h.pilot.stop();
});
await test('no-data/boundary chunk stays baseline with no gap and is not hammered every idle tick',async()=>{
  const h=setup({bad:true});h.pilot.start(h.config);await h.until(()=>h.pilot.diagnostics().proofsRefused===1);
  for(let i=0;i<40;i++)await h.tick();assert.equal(h.counts().fetches,1);assert.equal(h.row.m.geometry,h.base);assert.equal(h.row.m.count,100);h.pilot.stop();
});
await test('cancel during asynchronous initialization disposes owned resources, no late mutation',async()=>{
  const h=setup({late:true});h.pilot.start(h.config);await h.until(()=>h.counts().created===1);h.pilot.stop();h.resolve();
  for(let i=0;i<10;i++)await h.tick();assert.equal(h.row.m.geometry,h.base);assert.equal(h.counts().assetsDisposed,1);assert.equal(h.pilot.diagnostics().enabled,false);
});
await test('cancel partway through the proof resolves pending idle waits and preserves the original mesh',async()=>{
  let time=0;const h=setup({clock:()=>{time+=.2;return time;}});h.pilot.start(h.config);await h.until(()=>h.pilot.diagnostics().proofCandidates>0);
  assert.equal(h.pilot.diagnostics().proofsCompleted,0);h.pilot.stop();
  for(let i=0;i<50;i++)await h.tick();assert.equal(h.row.m.geometry,h.base);assert.equal(h.pilot.diagnostics().modifiedChunks,0);
});
await test('foreign model geometry and other-owner replacements are never overwritten',async()=>{
  const h=setup();h.row.m.geometry=geometry(99);h.pilot.start(h.config);await h.until(()=>h.pilot.diagnostics().foreignGeometry>0);
  assert.equal(h.row.m.geometry.attributes.position.array[0],99);h.pilot.stop();
  const x=setup();x.pilot.start(x.config);await x.until(()=>x.pilot.diagnostics().modifiedChunks===1);const foreign=geometry(67);x.row.m.geometry=foreign;x.pilot.stop();assert.equal(x.row.m.geometry,foreign);
});
await test('idle admission defers proof work rather than using a timeout as a budget bypass',async()=>{
  const h=setup();h.pilot.start(h.config);for(let i=0;i<8;i++)await h.tick(false);
  assert.equal(h.counts().created,0);assert.equal(h.pilot.diagnostics().deferrals,8);h.pilot.stop();
});
await test('wrong route fails closed, does not silently run on a different region',async()=>{
  const h=setup({wrongRoute:true});h.pilot.start(h.config);await h.until(()=>h.pilot.diagnostics().phase==='fault');
  assert.equal(h.counts().created,0);assert.equal(h.row.m.geometry,h.base);assert.equal(h.pilot.diagnostics().enabled,false);
});
await test('invalid configuration does not tear down a working presentation',async()=>{
  const h=setup();h.pilot.start(h.config);await h.until(()=>h.pilot.diagnostics().modifiedChunks===1);
  assert.throws(()=>h.pilot.start({...h.config,season:'autumn'}));assert.equal(h.row.m.geometry,h.summer);
  assert.throws(()=>h.pilot.start({...h.config,directory:{...identity,catalogSha256:'0'.repeat(64)}}));assert.equal(h.row.m.geometry,h.summer);h.pilot.stop();
});
await test('route generation drift cannot publish or apply a stale prepared proof',async()=>{
  let time=0;const h=setup({clock:()=>{time+=.2;return time;}});h.pilot.start(h.config);await h.until(()=>h.pilot.diagnostics().proofCandidates>0);
  assert.equal(h.pilot.diagnostics().proofsCompleted,0);h.generation(2);
  for(let i=0;i<80;i++)await h.tick();assert.equal(h.row.m.geometry,h.base);assert.equal(h.pilot.diagnostics().modifiedChunks,0);h.pilot.stop();
});
await test('all proof iterations and repeated source decisions stay deterministic',()=>{
  for(let n=0;n<50;n++){
    const p=createR12Proof(snapshot(-n,n),adapter,-n,n);let r;do{r=p.step(64);}while(!r.done);
    assert.equal(p.result().ecoregionId,686);assert.equal(p.result().count,1744);
  }
});

await test('larger count cap retains the same per-read time deadline and denied-idle behavior',async()=>{
  const fast=setup();fast.pilot.start(fast.config);
  await fast.until(()=>fast.pilot.diagnostics().proofCandidates>0);
  assert.equal(fast.pilot.diagnostics().proofCandidates,R12_LIMITS.checksPerSlice);
  assert.equal(fast.pilot.diagnostics().proofsCompleted,1);fast.pilot.stop();
  let time=0;const slow=setup({clock:()=>{time+=.2;return time;}});
  slow.pilot.start(slow.config);await slow.until(()=>slow.pilot.diagnostics().proofCandidates>0);
  let previous=slow.pilot.diagnostics().proofCandidates;
  for(let i=0;i<20;i++){
    await slow.tick();const next=slow.pilot.diagnostics().proofCandidates;
    assert.ok(next>previous&&next-previous<=5,'deadline must cut work before the count cap');previous=next;
  }
  for(let i=0;i<8;i++)await slow.tick(false);
  assert.equal(slow.pilot.diagnostics().proofCandidates,previous,'denied idle slot executed proof work');
  assert.equal(slow.pilot.diagnostics().modifiedChunks,0);slow.pilot.stop();
});
await test('real scheduler never treats timeout as idle permission and cancellation stays effective',()=>{
  const names=['setTimeout','clearTimeout','requestIdleCallback','cancelIdleCallback'];
  const descriptors=names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]);
  let timer,idle,delay,options;const cancels=[];
  try{
    globalThis.setTimeout=(fn,ms)=>{timer=fn;delay=ms;return 1;};
    globalThis.clearTimeout=id=>cancels.push(['timer',id]);
    globalThis.requestIdleCallback=(fn,opt)=>{idle=fn;options=opt;return 2;};
    globalThis.cancelIdleCallback=id=>cancels.push(['idle',id]);
    for(const remaining of [0,.5,.999,1,5]){
      const seen=[];idle=null;const cancel=scheduleR12(ok=>seen.push(ok),120);
      assert.equal(delay,120);assert.equal(idle,null);timer();assert.equal(options.timeout,1000);
      idle({didTimeout:true,timeRemaining:()=>remaining});assert.deepEqual(seen,[remaining>=1]);cancel();
    }
    let count=0;idle=null;const early=scheduleR12(()=>count++);early();timer();assert.equal(idle,null);
    const late=scheduleR12(()=>count++);timer();late();idle({didTimeout:false,timeRemaining:()=>10});
    assert.equal(count,0);assert.ok(cancels.some(([kind,id])=>kind==='idle'&&id===2));
  }finally{for(const [name,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});

const report={status:'PASS',groups:tests,results,limits:R12_LIMITS,scope:'Pure contracts and deterministic scene/scheduler doubles; native Three/full-game validation is separate'};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',groups:tests}));
