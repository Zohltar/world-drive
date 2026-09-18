import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRenderedBiomePilot,validateR12Config} from '../tools/biomes/rendered-pilot-r12.mjs';
import {R12_PROFILE,R13_PROFILE,R12_REGION,R13_REGION,R12_SOURCE,R12_CATALOG_SHA,R12_LIMITS,
  renderedProfile,renderedRouteMatches,r12Model,r12ContextEligible,createR12Proof} from '../tools/biomes/rendered-pilot-policy-r12.mjs';
import {createForestCandidateAdapter,FOREST_LAYOUT_ID} from '../src/scenery/biomes/forest-candidate-adapter.js';
import {createBiomeObserverPlan} from '../src/scenery/biomes/route-observer-plan.js';
import {BIOME_PROFILES} from '../src/scenery/biomes/biome-profiles.js';
const origin={lon:-68.3467,lat:49.3213};
const captured=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/biomes/manic-r10/response.json.gz',import.meta.url))));
const route=captured.routes[0].geometry.coordinates.map(([lon,lat])=>({lon,lat}));
const plan=createBiomeObserverPlan(route,{origin,routeId:'visual-1'}),adapter=plan.adapter;
const identity={revision:renderedProfile(R13_PROFILE).revision,source:R12_SOURCE,catalogSha256:R12_CATALOG_SHA};
const context=Object.freeze({schema:'world-drive-biome-context-v1',...BIOME_PROFILES[6],status:'resolved',reason:null,
  source:R12_SOURCE,ecoregion:R13_REGION,precision:'source-polygons',confidence:'source-agreement',
  paletteEligible:true,placementAuthority:false,elevationApplied:false});
const config={profile:R13_PROFILE,directory:identity,baseUrl:'http://example.invalid/data/',season:'summer'};
function snap(cx=0,cz=0,lookup=()=>context){return {layoutId:FOREST_LAYOUT_ID,count:1744,cx,cz,identity,
  projectionId:adapter.projectionId,counts:{resolved:1744,noData:0,unavailable:0},lookup};}
function proof(s=snap()){return createR12Proof(s,adapter,s.cx,s.cz,R13_PROFILE);}
function finish(p){let r;do{r=p.step();}while(!r.done);return p.result();}
const passed=[];async function test(name,fn){await fn();passed.push(name);console.log('PASS',name);}
await test('fixed profile/model IDs preserve Nord defaults and map boreal seasons explicitly',()=>{
  assert.equal(r12Model('summer'),'preview-temperate');assert.equal(r12Model('winter'),'preview-temperate-winter');
  assert.equal(r12Model('summer',R13_PROFILE),'preview-conifer');assert.equal(r12Model('winter',R13_PROFILE),'preview-conifer-winter');
  assert.ok(Object.isFrozen(renderedProfile(R13_PROFILE)));assert.ok(Object.isFrozen(R13_REGION));
  for(const id of ['constructor','toString','__proto__','worldwide','',{},null,1])assert.throws(()=>renderedProfile(id));
});
await test('configuration binds profile to revision and the original pinned source',()=>{
  assert.equal(validateR12Config(config).profile,R13_PROFILE);
  for(const patch of [{profile:R12_PROFILE},{profile:'unknown'},{season:'autumn'},
    {directory:{...identity,revision:'resolve2017-r10-manic'}},
    {directory:{...identity,source:{...R12_SOURCE,sha256:'0'.repeat(64)}}}])assert.throws(()=>validateR12Config({...config,...patch}));
});
await test('regional eligibility rejects guesses, other realms/families and placement authority',()=>{
  assert.equal(r12ContextEligible(context,R13_PROFILE),true);assert.equal(r12ContextEligible(context),false);
  for(const patch of [{ecoregion:R12_REGION},{family:'temperate'},{palette:'temperate-conifer'},
    {paletteEligible:false},{precision:'regional'},{confidence:'guess'},{placementAuthority:true},{elevationApplied:true},
    {ecoregion:{...R13_REGION,realm:'Palearctic'}},{ecoregion:{...R13_REGION,name:'Guess'}},
    {source:{...R12_SOURCE,license:'unknown'}}])assert.equal(r12ContextEligible({...context,...patch},R13_PROFILE),false);
});
await test('all 1744 exact addresses are read with one immutable eligibility decision',()=>{
  const seen=[];const p=proof(snap(-2,-3,(i,lon,lat)=>{const at=adapter.point(-2,-3,i);assert.equal(lon,at.lon);assert.equal(lat,at.lat);seen.push(i);return context;}));
  const r=finish(p);assert.equal(r.ecoregionId,373);assert.equal(r.modelId,'preview-conifer');assert.equal(r.profileId,R13_PROFILE);
  assert.equal(r.count,1744);assert.deepEqual(seen,Array.from({length:1744},(_,i)=>i));assert.equal(p.diagnostics().contextChecks,1);
});
await test('one missing, mixed or mutable-last source context refuses the whole chunk',()=>{
  for(const last of [null,{...context,status:'unavailable'},{...context,ecoregion:R12_REGION}])
    assert.equal(finish(proof(snap(0,0,i=>i===1743?last:context))),null);
  const region={...R13_REGION},mutable=Object.freeze({...context,ecoregion:region});
  const p=proof(snap(0,0,i=>{if(i===1743)region.id=686;return mutable;}));
  assert.equal(finish(p),null);assert.equal(p.diagnostics().cachedContexts,0);
});
await test('snapshot layout, projection and revision cannot cross profile boundaries',()=>{
  for(const patch of [{layoutId:'other'},{projectionId:'old'},{count:1743},
    {identity:{...identity,revision:renderedProfile(R12_PROFILE).revision}}])assert.throws(()=>proof({...snap(),...patch}));
  assert.throws(()=>createR12Proof(snap(),adapter,0,0));
});
await test('real Manic route envelope accepts resampling but rejects other routes/directions',()=>{
  assert.equal(renderedRouteMatches(R13_PROFILE,plan,origin),true);
  const reduced=route.filter((_,i)=>i%5===0||i===route.length-1);
  assert.equal(renderedRouteMatches(R13_PROFILE,createBiomeObserverPlan(reduced,{origin,routeId:'reduced'}),origin),true);
  assert.equal(renderedRouteMatches(R12_PROFILE,plan,origin),false);
  for(const p of [{...plan,totalMeters:1000},{...plan,totalMeters:Infinity},
    {...plan,coordinates:[...plan.coordinates].reverse()},
    {...plan,coordinates:[plan.coordinates[0],[0,0],plan.coordinates.at(-1)]}])assert.equal(renderedRouteMatches(R13_PROFILE,p,origin),false);
  assert.equal(renderedRouteMatches(R13_PROFILE,plan,{lat:50,lon:0}),false);
});
class Group{
  constructor(name=''){this.name=name;this.children=[];this.parent=null;this.visible=true;this.listeners=new Map();}
  addEventListener(t,f){if(!this.listeners.has(t))this.listeners.set(t,new Set());this.listeners.get(t).add(f);}
  removeEventListener(t,f){this.listeners.get(t)?.delete(f);}
  add(c){c.parent?.remove(c);c.parent=this;this.children.push(c);for(const f of this.listeners.get('childadded')??[])f({child:c});}
  remove(c){const i=this.children.indexOf(c);if(i<0)return;this.children.splice(i,1);c.parent=null;for(const f of this.listeners.get('childremoved')??[])f({child:c});}
}
function geo(n=0){return {attributes:Object.fromEntries(['position','normal','color'].map(k=>[k,{array:new Float32Array([n,1,2]),count:3}])),index:{array:new Uint16Array([0,1,2]),count:3}};}
function setup({bad=false,wrong=false,clock=()=>0}={}){
  const q=[],base=geo(),summer=geo(),winter=geo(2),root=new Group('forest'),owner=new Group('forest-route-cache-manic');root.add(owner);
  const state={gameStarted:true,origin:{...origin},absX:0,absZ:0};let generation=1,clients=0,disposed=0,builds=0;
  function add(parent=owner){const group=new Group('forest-chunk-0:0'),mesh=new Group('tree');mesh.isInstancedMesh=true;
    Object.assign(mesh,{geometry:base,material:{id:'original'},count:100,instanceMatrix:{array:new Float32Array(1744*16).fill(.5)},boundingSphere:{radius:379},
      userData:{sharedForestGeometry:true,forestChunk:'0:0'}});group.add(mesh);parent.add(group);return {group,mesh};}
  const row=add();
  const pilot=createRenderedBiomePilot({THREE:{},forestGroup:root,getState:()=>state,getGeneration:()=>generation,
    getRoute:()=>wrong?route.slice(10):route,now:clock,
    clientFactory:()=>{clients++;return {initialize:async()=>({}),dispose:()=>disposed++,diagnostics:async()=>({ready:true,transport:{loaded:1,rejected:0}})};},
    bridgeFactory:()=>({setRoute:async()=>({status:'route-ready'}),update:async()=>({status:'ready'}),get:()=>null,
      prepareForestChunk:async()=>({status:'prepared',snapshot:snap(0,0,i=>bad&&i===1743?null:context)}),dispose(){},diagnostics:()=>({maxChunks:16})}),
    assetFactory:()=>{builds++;return {summerAssets:[{parts:[{geometry:base}]}],assets:[
      {id:'preview-conifer',parts:[{geometry:summer}]},{id:'preview-conifer-winter',parts:[{geometry:winter}]}],dispose(){}};},
    schedule:(cb,delay)=>{const item={cb,delay,cancelled:false};q.push(item);return ()=>item.cancelled=true;}});
  async function tick(ok=true){const item=q.shift();if(item&&!item.cancelled)void item.cb(ok);for(let i=0;i<15;i++)await Promise.resolve();}
  async function until(check){for(let i=0;i<2000&&!check();i++)await tick();assert.ok(check(),JSON.stringify(pilot.diagnostics()));}
  return {pilot,row,root,owner,add,state,q,base,summer,winter,tick,until,generation:v=>generation=v,counts:()=>({clients,disposed,builds})};
}
await test('R13 remains fully inert before explicit activation',()=>{
  const h=setup();assert.equal(h.q.length,0);assert.deepEqual(h.counts(),{clients:0,disposed:0,builds:0});assert.equal(h.row.mesh.geometry,h.base);
});
await test('boreal geometry-only replacement preserves all original instance and scene state',async()=>{
  const h=setup(),m=h.row.mesh,before={matrix:m.instanceMatrix,bytes:m.instanceMatrix.array.slice(),material:m.material,bounds:m.boundingSphere,parent:m.parent};
  h.pilot.start(config);await h.until(()=>h.pilot.diagnostics().modifiedChunks===1);
  assert.equal(h.pilot.diagnostics().pilot,R13_PROFILE);assert.equal(m.geometry,h.summer);assert.equal(m.count,100);
  assert.equal(m.instanceMatrix,before.matrix);assert.deepEqual(m.instanceMatrix.array,before.bytes);assert.equal(m.material,before.material);
  assert.equal(m.boundingSphere,before.bounds);assert.equal(m.parent,before.parent);assert.equal(m.parent.children.length,1);
  assert.equal(h.pilot.audit().meshes[0].ecoregion,373);h.pilot.stop();assert.equal(m.geometry,h.base);assert.equal(h.counts().disposed,1);
});
await test('100 summer/winter round trips keep placement/density unchanged and kit built once',async()=>{
  const h=setup();h.pilot.start(config);await h.until(()=>h.pilot.diagnostics().modifiedChunks===1);
  const hash=h.pilot.audit().meshes[0].matrixHash;
  for(let i=0;i<100;i++){h.pilot.season('winter');assert.equal(h.row.mesh.geometry,h.winter);h.pilot.season('summer');assert.equal(h.row.mesh.geometry,h.summer);}
  assert.equal(h.pilot.audit().meshes[0].matrixHash,hash);assert.equal(h.counts().builds,1);assert.equal(h.row.mesh.count,100);h.pilot.stop();
});
await test('new R4 layer inherits boreal proof, while hidden same-address route remains untouched',async()=>{
  const h=setup(),hidden=new Group('forest-route-cache-other');hidden.visible=false;h.root.add(hidden);const other=h.add(hidden);
  h.pilot.start(config);await h.until(()=>h.pilot.diagnostics().modifiedChunks===1);assert.equal(other.mesh.geometry,h.base);
  h.pilot.season('winter');h.owner.remove(h.row.group);assert.equal(h.row.mesh.geometry,h.base);
  const replacement=h.add();assert.equal(replacement.mesh.geometry,h.winter);assert.equal(h.pilot.diagnostics().proofsCompleted,1);h.pilot.stop();
});
await test('missing source data retains original forest, with bounded retry policy',async()=>{
  const h=setup({bad:true});h.pilot.start(config);await h.until(()=>h.pilot.diagnostics().proofsRefused===1);
  for(let i=0;i<25;i++)await h.tick();assert.equal(h.pilot.diagnostics().proofsRefused,1);assert.equal(h.row.mesh.geometry,h.base);h.pilot.stop();
});
await test('invalid profile or revision does not destroy a working boreal presentation',async()=>{
  const h=setup();h.pilot.start(config);await h.until(()=>h.pilot.diagnostics().modifiedChunks===1);
  for(const patch of [{profile:R12_PROFILE},{profile:'global'},{season:'autumn'}])assert.throws(()=>h.pilot.start({...config,...patch}));
  assert.equal(h.row.mesh.geometry,h.summer);assert.equal(h.pilot.diagnostics().enabled,true);h.pilot.stop();
});
await test('wrong route fails before assets/Worker and route generation drift restores geometry',async()=>{
  const h=setup();h.state.origin={lon:0,lat:0};h.pilot.start(config);await h.until(()=>h.pilot.diagnostics().phase==='fault');
  assert.equal(h.counts().clients,0);assert.equal(h.counts().builds,0);assert.equal(h.row.mesh.geometry,h.base);
  const v=setup();v.pilot.start(config);await v.until(()=>v.pilot.diagnostics().modifiedChunks===1);v.generation(2);
  await v.until(()=>!v.pilot.diagnostics().enabled);assert.equal(v.row.mesh.geometry,v.base);
});
await test('boreal proof keeps per-read time budget and never executes on denied idle slots',async()=>{
  let time=0;const h=setup({clock:()=>{time+=.2;return time;}});h.pilot.start(config);
  await h.until(()=>h.pilot.diagnostics().proofCandidates>0);const before=h.pilot.diagnostics().proofCandidates;
  assert.ok(before<1744);for(let i=0;i<12;i++)await h.tick(false);assert.equal(h.pilot.diagnostics().proofCandidates,before);
  assert.equal(R12_LIMITS.proofSliceMs,.8);assert.equal(R12_LIMITS.snapshotChunks,16);h.pilot.stop();
});
await test('finite multi-chunk boreal decisions remain deterministic',()=>{
  for(let n=0;n<128;n++){const r=finish(proof(snap(-n,n)));assert.equal(r.count,1744);assert.equal(r.ecoregionId,373);assert.equal(r.modelId,'preview-conifer');}
});
const report={status:'PASS',groups:passed.length,tests:passed,scope:'Pure contract/scene doubles; real source and rendered browser checks are separate'};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'PASS',groups:passed.length}));
