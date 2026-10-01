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
const scale=Math.PI/180*6378137,cos=Math.cos(origin.lat*Math.PI/180),xy=coordinates.map(([lon,lat])=>[(lon-origin.lon)*scale*cos,-(lat-origin.lat)*scale]);
let target=null;
for(let i=0;i<xy.length-1&&!target;i++){
  const a=xy[i],b=xy[i+1],mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;
  for(const side of [-1,1]){
    const x=mx+(-dz/len)*50*side,z=mz+(dx/len)*50*side,cx=Math.floor(x/480),cz=Math.floor(z/480),lx=x-cx*480,lz=z-cz*480;
    if(lx>90&&lx<390&&lz>90&&lz<390){target={x,z,cx,cz,lx,lz,tx:dx/len,tz:dz/len,nx:-dz/len*side,nz:dx/len*side};break;}
  }
}
assert.ok(target,'Nord route has no bounded R18 controller target');
const baseline=buildSeasonalVegetationPrototypes(THREE),root=new THREE.Group(),owner=new THREE.Group(),hidden=new THREE.Group();
owner.name='forest-route-cache-current';hidden.name='forest-route-cache-hidden';hidden.visible=false;root.add(owner,hidden);
const queue=[];let generation=1,builds=0,clients=0,disposed=0;
function add(n,parent=owner){const group=new THREE.Group();group.name=`forest-chunk-${target.cx}:${target.cz}`;group.matrixAutoUpdate=false;
  const mesh=new THREE.InstancedMesh(baseline.summerAssets[0].parts[0].geometry,baseline.summerAssets[0].parts[0].material,n);
  mesh.userData={sharedForestGeometry:true,forestChunk:`${target.cx}:${target.cz}`};mesh.matrixAutoUpdate=false;mesh.updateMatrix();
  mesh.boundingSphere={center:new THREE.Vector3(240,12,240),radius:380};const m=new THREE.Matrix4();
  for(let i=0;i<n;i++){
    const along=(i%21-10)*1.35,lateral=((i%5)-2)*2.1;
    const ax=target.x+target.tx*along+target.nx*lateral,az=target.z+target.tz*along+target.nz*lateral;
    m.makeRotationY((i%17)*.19);m.scale(new THREE.Vector3(8+i%7,12+i%5,8+i%7));m.setPosition(ax-target.cx*480,i%19,az-target.cz*480);mesh.setMatrixAt(i,m);
  }
  mesh.instanceMatrix.needsUpdate=true;group.add(mesh);parent.add(group);return {group,mesh};}
const a=add(300),other=add(300,hidden),sourceBytes=a.mesh.instanceMatrix.array.slice();
const snapshot={layoutId:FOREST_LAYOUT_ID,count:1744,cx:target.cx,cz:target.cz,identity,projectionId:plan.adapter.projectionId,counts:{resolved:1744,noData:0,unavailable:0},lookup:()=>context};
const pilot=createRenderedBiomePilot({THREE,forestGroup:root,getState:()=>({gameStarted:true,origin,absX:target.x,absZ:target.z}),
  getGeneration:()=>generation,getRoute:()=>route,now:()=>0,
  clientFactory:()=>{clients++;return {initialize:async()=>({}),diagnostics:async()=>({ready:true,transport:{loaded:1,rejected:0}}),dispose(){disposed++;}};},
  bridgeFactory:()=>({setRoute:async()=>({status:'route-ready'}),update:async()=>({status:'ready'}),get:()=>null,prepareForestChunk:async()=>({status:'prepared',snapshot}),diagnostics:()=>({}),dispose(){}}),
  assetFactory:t=>{builds++;return buildSeasonalVegetationPrototypes(t);},
  schedule:(cb,delay)=>{const q={cb,delay,cancelled:false};queue.push(q);return ()=>q.cancelled=true;}});
async function tick(){const q=queue.shift();if(q&&!q.cancelled)void q.cb(true);for(let i=0;i<25;i++)await Promise.resolve();}
async function until(f){for(let i=0;i<2500&&!f();i++)await tick();assert.ok(f(),JSON.stringify(pilot.diagnostics()));}
const cases=[];function check(name,f){f();cases.push(name);}
check('actual Three controller is inert before explicit R18 start',()=>{assert.equal(builds,0);assert.equal(clients,0);assert.equal(queue.length,0);});
pilot.start({directory:identity,baseUrl:'http://example.invalid/',presentation:'mixed-r16',appearance:'natural-r17',understory:'edge-r18'});
await until(()=>pilot.diagnostics().modifiedChunks===1);root.updateMatrixWorld(true);
check('R18 adds one low owned pass without moving or replacing the R17 trees',()=>{
  const d=pilot.audit().meshes[0],u=d.mixed.understory;assert.equal(pilot.diagnostics().pilot,'r18-nord-understory');assert.equal(d.proofCandidates,1744);
  assert.ok(d.mixed.sourcePrefixExact&&d.mixed.sourceHidden&&u?.sourcePrefixExact);assert.equal(d.mixed.parts.length,2);assert.ok(u.instances>0);
  assert.deepEqual(a.mesh.instanceMatrix.array,sourceBytes);assert.equal(a.group.children.length,4);assert.equal(other.mesh.visible,true);assert.equal(other.group.children.length,1);
});
check('source count prefixes control both R17 trees and the R18 clumps',()=>{
  for(let n=0;n<=300;n++){a.mesh.count=n;root.updateMatrixWorld(true);const d=pilot.audit().meshes[0].mixed;
    assert.ok(d.sourcePrefixExact&&d.understory.sourcePrefixExact);assert.equal(d.parts.reduce((s,p)=>s+p.count,0),n);assert.ok(d.understory.instances<=n);}
});
check('terrain-height refresh updates R18 Y only and preserves exact root XZ',()=>{
  const before=pilot.audit().meshes[0].mixed.understory;
  for(let i=0;i<300;i++)a.mesh.instanceMatrix.array[i*16+13]+=7;
  a.mesh.instanceMatrix.needsUpdate=true;root.updateMatrixWorld(true);
  const after=pilot.audit().meshes[0].mixed.understory;assert.ok(after.sourcePrefixExact);assert.equal(after.syncs,2);assert.equal(after.rootXZHash,before.rootXZHash);
});
check('summer and winter switch the clump geometry without moving roots',()=>{
  a.mesh.count=300;const before=pilot.audit().meshes[0].mixed.understory;
  for(let i=0;i<20;i++){pilot.season('winter');root.updateMatrixWorld(true);assert.equal(pilot.audit().meshes[0].mixed.understory.triangles,576);pilot.season('summer');}
  const summer=pilot.audit().meshes[0].mixed.understory;assert.equal(summer.triangles,336);assert.equal(summer.rootXZHash,before.rootXZHash);
});
check('detach restores source and disposes exactly the two tree meshes plus one clump mesh',()=>{
  const parts=a.group.children.slice(1);let freed=0;parts.forEach(m=>m.addEventListener('dispose',()=>freed++));owner.remove(a.group);
  assert.equal(a.mesh.visible,true);assert.equal(a.group.children.length,1);assert.equal(freed,3);
});
const b=add(620);root.updateMatrixWorld(true);
check('full-layer replacement rebuilds R18 only from the new accepted source roots',()=>{
  const d=pilot.audit().meshes[0].mixed;assert.equal(pilot.diagnostics().proofsCompleted,1);assert.equal(b.group.children.length,4);assert.equal(b.mesh.visible,false);
  assert.ok(d.sourcePrefixExact&&d.understory.sourcePrefixExact);assert.equal(pilot.diagnostics().modifiedInstances,620);assert.ok(pilot.diagnostics().understoryInstances>0);
});
generation++;await until(()=>!pilot.diagnostics().enabled);
check('route generation stop restores every source before shared R18 assets are released',()=>{
  assert.equal(b.mesh.visible,true);assert.equal(b.group.children.length,1);assert.equal(disposed,1);assert.equal(pilot.diagnostics().modifiedChunks,0);
  assert.equal(other.mesh.visible,true);assert.equal(other.group.children.length,1);
});
baseline.dispose();const report={status:'PASS',groups:cases.length,cases,threeRevision:THREE.REVISION,target};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
