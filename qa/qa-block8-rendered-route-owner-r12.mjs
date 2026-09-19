import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRenderedBiomePilot} from '../tools/biomes/rendered-pilot-r12.mjs';
import {R12_SOURCE,R12_CATALOG_SHA,R12_REGION} from '../tools/biomes/rendered-pilot-policy-r12.mjs';
import {BIOME_PROFILES} from '../src/scenery/biomes/biome-profiles.js';
import {createForestCandidateAdapter,FOREST_LAYOUT_ID} from '../src/scenery/biomes/forest-candidate-adapter.js';
class Group{
 constructor(name){this.name=name;this.visible=true;this.children=[];this.parent=null;this.events=new Map();}
 addEventListener(t,f){if(!this.events.has(t))this.events.set(t,new Set());this.events.get(t).add(f);}
 removeEventListener(t,f){this.events.get(t)?.delete(f);}
 add(c){c.parent=this;this.children.push(c);for(const f of this.events.get('childadded')??[])f({child:c});}
}
const geom=n=>({attributes:Object.fromEntries(['position','normal','color'].map(k=>[k,{array:new Float32Array([n,1,2]),count:1}])),index:{array:new Uint16Array([0,1,2]),count:3}});
const original=geom(0),summer=geom(1),winter=geom(2),parent=new Group('forest');
const active=new Group('forest-route-cache-current'),previous=new Group('forest-route-cache-previous');
previous.visible=false;parent.add(active);parent.add(previous);
function mesh(owner){const c=new Group('forest-chunk-0:0'),m=new Group('mesh');
 Object.assign(m,{isInstancedMesh:true,userData:{sharedForestGeometry:true,forestChunk:'0:0'},geometry:original,
  material:{},count:51,instanceMatrix:{array:new Float32Array(1744*16)}});c.add(m);owner.add(c);return m;}
const currentMesh=mesh(active),previousMesh=mesh(previous);
const origin={lat:50.337751,lon:6.951275},adapter=createForestCandidateAdapter({origin,routeId:'visual-1'});
const identity={revision:'resolve2017-r12-nord-rendered',source:R12_SOURCE,catalogSha256:R12_CATALOG_SHA};
const context=Object.freeze({schema:'world-drive-biome-context-v1',...BIOME_PROFILES[4],status:'resolved',
 source:R12_SOURCE,ecoregion:R12_REGION,precision:'source-polygons',confidence:'source-agreement',
 paletteEligible:true,placementAuthority:false,elevationApplied:false});
const snapshot={layoutId:FOREST_LAYOUT_ID,count:1744,cx:0,cz:0,projectionId:adapter.projectionId,identity,lookup:()=>context};
const rows=JSON.parse(fs.readFileSync(new URL('../src/routing/circuits/nordschleife.json',import.meta.url)));
const route=(rows.coordinates??rows).map(([lon,lat])=>({lon,lat})),queue=[];
const pilot=createRenderedBiomePilot({THREE:{},forestGroup:parent,getGeneration:()=>1,getRoute:()=>route,
 getState:()=>({gameStarted:true,origin,absX:0,absZ:0}),now:()=>0,
 clientFactory:()=>({initialize:async()=>({}),diagnostics:async()=>({}),dispose(){}}),
 bridgeFactory:()=>({setRoute:async()=>({status:'route-ready'}),update:async()=>({status:'ready'}),get:()=>null,
  prepareForestChunk:async()=>({status:'prepared',snapshot}),diagnostics:()=>({}),dispose(){}}),
 assetFactory:()=>({summerAssets:[{parts:[{geometry:original}]}],assets:[
  {id:'preview-temperate',parts:[{geometry:summer}]},{id:'preview-temperate-winter',parts:[{geometry:winter}]}],dispose(){}}),
 schedule:cb=>{const item={cb,cancelled:false};queue.push(item);return ()=>item.cancelled=true;}});
pilot.start({directory:identity,baseUrl:'http://example.invalid/',season:'summer'});
for(let i=0;i<40&&!pilot.diagnostics().proofsCompleted;i++){
 const next=queue.shift();if(next&&!next.cancelled)void next.cb(true);
 for(let j=0;j<20;j++)await Promise.resolve();
}
assert.equal(pilot.diagnostics().proofsCompleted,1);
assert.equal(currentMesh.geometry,summer);assert.equal(previousMesh.geometry,original);
assert.equal(pilot.diagnostics().modifiedChunks,1);
pilot.season('winter');assert.equal(currentMesh.geometry,winter);assert.equal(previousMesh.geometry,original);
pilot.stop();assert.equal(currentMesh.geometry,original);assert.equal(previousMesh.geometry,original);
const report={status:'PASS',groups:1,case:'Hidden previous route with the same numeric chunk address remains untouched',
 scope:'Deterministic scene/Worker doubles; native full-game evidence is separate'};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
