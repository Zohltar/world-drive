import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createRenderedBiomePilot} from '../tools/biomes/rendered-pilot-r12.mjs';
import {buildSeasonalVegetationPrototypes} from '../tools/biomes/vegetation-seasonal-prototypes.mjs';
import {R12_REGION,R12_SOURCE,R12_CATALOG_SHA} from '../tools/biomes/rendered-pilot-policy-r12.mjs';
import {BIOME_PROFILES} from '../src/scenery/biomes/biome-profiles.js';
import {createBiomeObserverPlan} from '../src/scenery/biomes/route-observer-plan.js';
import {FOREST_LAYOUT_ID} from '../src/scenery/biomes/forest-candidate-adapter.js';
const coordinates=JSON.parse(fs.readFileSync(new URL('../src/routing/circuits/nordschleife.json',import.meta.url))).coordinates;
const origin={lon:coordinates[0][0],lat:coordinates[0][1]},route=coordinates.map(([lon,lat])=>({lon,lat}));
const plan=createBiomeObserverPlan(route,{origin,routeId:'visual-1'});
const identity={revision:'resolve2017-r12-nord-rendered',source:R12_SOURCE,catalogSha256:R12_CATALOG_SHA};
const context=Object.freeze({schema:'world-drive-biome-context-v1',...BIOME_PROFILES[4],status:'resolved',reason:null,
  source:R12_SOURCE,ecoregion:R12_REGION,precision:'source-polygons',confidence:'source-agreement',paletteEligible:true,placementAuthority:false,elevationApplied:false});
const baseline=buildSeasonalVegetationPrototypes(THREE),root=new THREE.Group(),owner=new THREE.Group(),hidden=new THREE.Group();
owner.name='forest-route-cache-current';hidden.name='forest-route-cache-hidden';hidden.visible=false;root.add(owner,hidden);
const queue=[];let generation=1,builds=0,clients=0,disposed=0;
function add(n,parent=owner){const group=new THREE.Group();group.name='forest-chunk-0:0';group.matrixAutoUpdate=false;
  const mesh=new THREE.InstancedMesh(baseline.summerAssets[0].parts[0].geometry,baseline.summerAssets[0].parts[0].material,n);
  mesh.userData={sharedForestGeometry:true,forestChunk:'0:0'};mesh.matrixAutoUpdate=false;mesh.updateMatrix();
  mesh.boundingSphere={center:new THREE.Vector3(240,12,240),radius:380};const m=new THREE.Matrix4();
  for(let i=0;i<n;i++){m.makeScale(8+i%9,12+i%6,8+i%9);m.setPosition(i*7.7%475,i%19,i*13.9%477);mesh.setMatrixAt(i,m);}
  mesh.instanceMatrix.needsUpdate=true;group.add(mesh);parent.add(group);return {group,mesh};}
const a=add(300),other=add(300,hidden),sourceBytes=a.mesh.instanceMatrix.array.slice();
const snapshot={layoutId:FOREST_LAYOUT_ID,count:1744,cx:0,cz:0,identity,projectionId:plan.adapter.projectionId,counts:{resolved:1744,noData:0,unavailable:0},lookup:()=>context};
const pilot=createRenderedBiomePilot({THREE,forestGroup:root,getState:()=>({gameStarted:true,origin,absX:0,absZ:0}),
  getGeneration:()=>generation,getRoute:()=>route,now:()=>0,
  clientFactory:()=>{clients++;return {initialize:async()=>({}),diagnostics:async()=>({ready:true,transport:{loaded:1,rejected:0}}),dispose(){disposed++;}};},
  bridgeFactory:()=>({setRoute:async()=>({status:'route-ready'}),update:async()=>({status:'ready'}),get:()=>null,prepareForestChunk:async()=>({status:'prepared',snapshot}),diagnostics:()=>({}),dispose(){}}),
  assetFactory:t=>{builds++;return buildSeasonalVegetationPrototypes(t);},
  schedule:(cb,delay)=>{const q={cb,delay,cancelled:false};queue.push(q);return ()=>q.cancelled=true;}});
async function tick(){const q=queue.shift();if(q&&!q.cancelled)void q.cb(true);for(let i=0;i<25;i++)await Promise.resolve();}
async function until(f){for(let i=0;i<2000&&!f();i++)await tick();assert.ok(f(),JSON.stringify(pilot.diagnostics()));}
const cases=[];function check(name,f){f();cases.push(name);}
check('actual Three controller is inert before explicit start',()=>{assert.equal(builds,0);assert.equal(clients,0);assert.equal(queue.length,0);});
pilot.start({directory:identity,baseUrl:'http://example.invalid/',presentation:'mixed-r16'});
await until(()=>pilot.diagnostics().modifiedChunks===1);root.updateMatrixWorld(true);
check('one source proof produces both approved model families without moving trees',()=>{
  const d=pilot.audit().meshes[0];assert.equal(pilot.diagnostics().pilot,'r16-nord-mixed');assert.equal(d.proofCandidates,1744);
  assert.ok(d.mixed.sourcePrefixExact&&d.mixed.sourceHidden);assert.equal(d.mixed.parts.length,2);
  assert.deepEqual(a.mesh.instanceMatrix.array,sourceBytes);assert.equal(a.group.children.length,3);
  assert.equal(other.mesh.visible,true);assert.equal(other.group.children.length,1);
});
check('all actual Three instance prefixes including zero preserve exact coverage',()=>{
  for(let n=0;n<=300;n++){a.mesh.count=n;root.updateMatrixWorld(true);const d=pilot.audit().meshes[0].mixed;
    assert.ok(d.sourcePrefixExact);assert.equal(d.parts.reduce((s,p)=>s+p.count,0),n);}
});
check('real attribute version update copies new terrain heights before scene upload',()=>{
  for(let i=0;i<300;i++)a.mesh.instanceMatrix.array[i*16+13]+=7;
  a.mesh.instanceMatrix.needsUpdate=true;root.updateMatrixWorld(true);
  assert.ok(pilot.audit().meshes[0].mixed.sourcePrefixExact);assert.equal(pilot.audit().meshes[0].mixed.syncs,2);
});
check('two approved winter variants keep the same matrices across 100 switches',()=>{
  const before=pilot.audit().meshes[0].matrixHash;
  for(let i=0;i<100;i++){pilot.season('winter');root.updateMatrixWorld(true);assert.ok(pilot.audit().meshes[0].mixed.sourcePrefixExact);pilot.season('summer');}
  pilot.season('winter');const row=pilot.audit().meshes[0];assert.equal(row.matrixHash,before);
  assert.deepEqual(row.mixed.parts.map(p=>[p.model,p.triangles]),[['preview-temperate-winter',114],['preview-conifer-winter',180]]);
});
check('detach restores source and disposes the owned presentation buffers',()=>{
  const parts=a.group.children.slice(1);let freed=0;parts.forEach(m=>m.addEventListener('dispose',()=>freed++));
  owner.remove(a.group);assert.equal(a.mesh.visible,true);assert.equal(a.group.children.length,1);assert.equal(freed,2);
});
const b=add(620);root.updateMatrixWorld(true);
check('full-layer replacement reuses proof but repartitions the new exact source matrices',()=>{
  assert.equal(pilot.diagnostics().proofsCompleted,1);assert.equal(b.group.children.length,3);assert.equal(b.mesh.visible,false);
  assert.ok(pilot.audit().meshes[0].mixed.sourcePrefixExact);assert.equal(pilot.diagnostics().modifiedInstances,620);
});
generation++;await until(()=>!pilot.diagnostics().enabled);
check('new route generation restores every original and terminates the Worker owner',()=>{
  assert.equal(b.mesh.visible,true);assert.equal(b.group.children.length,1);assert.equal(disposed,1);assert.equal(pilot.diagnostics().modifiedChunks,0);
  assert.equal(other.mesh.visible,true);assert.equal(other.group.children.length,1);
});
baseline.dispose();const report={status:'PASS',groups:cases.length,cases,threeRevision:THREE.REVISION,
  scope:'Actual Three objects and attributes with deterministic source/Worker doubles; native GPU rendering checked separately'};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
