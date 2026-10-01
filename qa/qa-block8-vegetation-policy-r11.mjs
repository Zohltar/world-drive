import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVegetationPolicy} from '../tools/biomes/vegetation-policy.mjs';
import {createPaletteRegistry} from '../src/scenery/biomes/palette-registry.js';
import {BIOME_PROFILES} from '../src/scenery/biomes/biome-profiles.js';
import {BIOME_CONTEXT_SCHEMA} from '../src/scenery/biomes/biome-service.js';
import {VEGETATION_PROTOTYPES,buildVegetationPrototypeData} from '../tools/biomes/vegetation-prototype-data.mjs';
const source={id:'RESOLVE-ECOREGIONS-2017',license:'CC-BY-4.0',sha256:'a'.repeat(64)};
const ctx=(id,ecoregionId=id,realm='Test')=>({schema:BIOME_CONTEXT_SCHEMA,status:'resolved',
  precision:'source-polygons',paletteEligible:true,placementAuthority:false,elevationApplied:false,
  source:{...source},ecoregion:{id:ecoregionId,biome:id,name:`Synthetic ${id}`,realm},...BIOME_PROFILES[id]});
const A=(id,palettes,extra={})=>({id,palettes,weight:1,kind:'tree',reviewed:true,provenanceId:'synthetic-r11-only',...extra});
const opts=(i=0)=>({stableKey:`absolute-cell/-5/8/candidate/${i}`,placementAllowed:true});
const assets=[A('local-broadleaf',['temperate-broadleaf-mixed']),
  A('local-conifer',['temperate-conifer']),A('shared',['temperate-conifer','temperate-broadleaf-mixed']),
  A('boreal-only',['boreal-conifer']),A('tropical-only',['tropical-moist-broadleaf'])];
const transition={palettes:['temperate-conifer','temperate-broadleaf-mixed'],widthM:120,reference:'SYNTHETIC NOT GEOGRAPHIC',reviewed:true};
const treeline={ecoregionId:4,sourceId:source.id,sourceSha256:source.sha256,lowerM:1000,upperM:1600,
  datum:'synthetic-msl',reference:'SYNTHETIC NOT A REAL TREELINE',reviewed:true};
let groups=0,stressQueries=0;
const check=(name,fn)=>{fn();groups++;console.log('PASS',name);};
const configured=(extra={})=>createVegetationPolicy({assets,transitions:[transition],treelines:[treeline],...extra});
check('default production selection remains empty',()=>assert.equal(createVegetationPolicy().select(ctx(4),opts()).assetId,null));
check('reviewed provenance and original registry bounds are mandatory',()=>{
  for(const a of [[A('bad',['boreal-conifer'],{reviewed:false})],[assets[0],assets[0]],Array(257).fill(assets[0])])assert.throws(()=>createVegetationPolicy({assets:a}));
});
check('blocked placement retains precedence even without elevation',()=>assert.equal(configured().select(ctx(4),{...opts(),placementAllowed:false}).reason,'placement-not-authorized'));
check('unconfigured policy is identical to R3 selection',()=>{
  const old=createPaletteRegistry(assets,{revision:'block8-vegetation-policy-r11'}),next=createVegetationPolicy({assets});
  for(let i=0;i<2000;i++)for(const id of [1,4,5,6]){const a=old.select(ctx(id),opts(i)),b=next.select(ctx(id),opts(i));assert.equal(a.assetId,b.assetId);assert.equal(b.elevationApplied,false);stressQueries++;}
});
check('missing imprecise corrupt and unknown contexts cannot authorize trees',()=>{
  for(const c of [null,{...ctx(4),status:'unavailable'},{...ctx(4),precision:'regional-grid'},
    {...ctx(4),paletteEligible:false},{...ctx(4),biome:1},{...ctx(4),placementAuthority:true},
    {...ctx(4),elevationApplied:true},{...ctx(4),source:{...source,sha256:'bad'}}])assert.equal(configured().select(c,opts()).assetId,null);
});
check('no implicit tree in desert tundra montane rock or water-adjacent open biome',()=>{
  for(const id of [8,9,10,11,13,98])assert.equal(configured().select(ctx(id),opts()).assetId,null);
});
check('tropical source never receives the boreal model',()=>{
  const p=createVegetationPolicy({assets});for(let i=0;i<1000;i++){assert.equal(p.select(ctx(1),opts(i)).assetId,'tropical-only');stressQueries++;}
});
check('bad transition pairs widths references and duplicate entries are refused',()=>{
  for(const t of [{...transition,palettes:['boreal-conifer','tropical-moist-broadleaf']},{...transition,widthM:0},
    {...transition,widthM:501},{...transition,widthM:NaN},{...transition,reviewed:false},{...transition,reference:''},
    {...transition,palettes:['temperate-conifer','temperate-conifer']}])assert.throws(()=>configured({transitions:[t]}));
  assert.throws(()=>configured({transitions:[transition,transition]}));
});
check('altitude bands are bounded unique source-scoped and explicit',()=>{
  for(const b of [{...treeline,upperM:1000},{...treeline,upperM:9001},{...treeline,lowerM:-501},
    {...treeline,upperM:2600},{...treeline,sourceSha256:'bad'},{...treeline,sourceId:''},
    {...treeline,ecoregionId:-1},{...treeline,datum:''},{...treeline,reference:''},{...treeline,reviewed:false}])assert.throws(()=>configured({treelines:[b]}));
  assert.throws(()=>configured({treelines:[treeline,treeline]}));
  assert.throws(()=>configured({treelines:Array(257).fill(treeline)}));
  assert.throws(()=>configured({transitions:Array(9).fill(transition)}));
});
check('uncertain mismatched datum and absent altitude never silently coerce to sea level',()=>{
  for(const elevation of [undefined,null,{metres:1300,reliable:false,datum:'synthetic-msl'},
    {metres:1300,reliable:true,datum:'ellipsoid'},{metres:NaN,reliable:true,datum:'synthetic-msl'},
    {metres:'1300',reliable:true,datum:'synthetic-msl'},{metres:null,reliable:true,datum:'synthetic-msl'}]){
    const d=configured().select(ctx(4),{...opts(),elevation});assert.equal(d.assetId,null);assert.equal(d.reason,'elevation-unavailable');
  }
});
check('datum-matched regional band preserves below and removes above its endpoints',()=>{
  const p=configured();for(const [metres,keep] of [[-50,true],[1000,true],[1600,false],[2000,false]]){
    const d=p.select(ctx(4),{...opts(),elevation:{metres,reliable:true,datum:'synthetic-msl'}});assert.equal(!!d.assetId,keep);assert.equal(d.treeWeight,keep?1:0);
  }
});
check('source revision source identity and other ecoregions do not inherit a treeline',()=>{
  const p=configured();for(const c of [ctx(4,40),{...ctx(4),source:{...source,sha256:'b'.repeat(64)}},{...ctx(4),source:{...source,id:'other-source'}}]){
    const d=p.select(c,opts());assert.ok(d.assetId);assert.equal(d.elevationStatus,'unconfigured');
  }
});
check('treeline taper is monotone and deterministic for 10000 stable positions',()=>{
  const p=configured(),counts=[0,0,0,0,0];for(let i=0;i<10000;i++){
    let previous=1;for(const [j,metres] of [1000,1150,1300,1450,1600].entries()){
      const o={...opts(i),elevation:{metres,datum:'synthetic-msl',reliable:true}},d=p.select(ctx(4),o);
      assert.deepEqual(d,p.select(ctx(4),o));const keep=Number(!!d.assetId);assert.ok(keep<=previous);previous=keep;counts[j]+=keep;stressQueries+=2;
    }
  }
  assert.equal(counts[0],10000);assert.equal(counts[4],0);assert.ok(counts[2]>4000&&counts[2]<6000);console.log('Synthetic taper counts',counts);
});
check('shrubs are not erased by a tree-only band',()=>{
  const p=createVegetationPolicy({assets:[A('shrub',['temperate-broadleaf-mixed'],{kind:'shrub'})],treelines:[treeline]});
  const d=p.select(ctx(4),{...opts(),kind:'shrub'});assert.equal(d.assetId,'shrub');assert.equal(d.elevationStatus,'not-tree');
});
check('boundary centre uses only the pool approved on both sides',()=>{
  const p=configured({treelines:[]});for(let i=0;i<500;i++){
    const d=p.select(ctx(4),{...opts(i),boundary:{neighbor:ctx(5),distanceM:0,verified:true}});
    assert.equal(d.assetId,'shared');assert.equal(d.transitionWeight,1);assert.equal(d.transitionStatus,'shared-pool');stressQueries++;
  }
});
check('outside the corridor native selection is unchanged',()=>{
  const p=configured({treelines:[]});for(const distanceM of [120,121,1e6])assert.equal(p.select(ctx(4),{...opts(),boundary:{neighbor:ctx(5),distanceM,verified:true}}).assetId,p.select(ctx(4),opts()).assetId);
});
check('intermediate boundary weights change smoothly and stay bounded',()=>{
  const p=configured({treelines:[]});for(const [distanceM,expected] of [[0,1],[30,.84375],[60,.5],[90,.15625]]){
    const d=p.select(ctx(4),{...opts(),boundary:{neighbor:ctx(5),distanceM,verified:true}});assert.equal(d.transitionWeight,expected);
  }
});
check('invalid neighbour source and boundary distance cannot trigger blending',()=>{
  const p=configured({treelines:[]}),expected=p.select(ctx(4),opts()).assetId;
  for(const boundary of [{neighbor:ctx(5),distanceM:-1,verified:true},{neighbor:ctx(5),distanceM:NaN,verified:true},
    {neighbor:ctx(5),distanceM:0,verified:false},{neighbor:{...ctx(5),status:'no-data'},distanceM:0,verified:true},
    {neighbor:{...ctx(5),source:{...source,sha256:'b'.repeat(64)}},distanceM:0,verified:true}]){
    const d=p.select(ctx(4),{...opts(),boundary});assert.equal(d.assetId,expected);assert.equal(d.transitionStatus,'missing-boundary-evidence');
  }
});
check('a neighbour-only tree never crosses into another palette',()=>{
  const p=configured({treelines:[],assets:assets.filter(a=>a.id!=='shared')});
  const d=p.select(ctx(4),{...opts(),boundary:{neighbor:ctx(5),distanceM:0,verified:true}});assert.equal(d.assetId,'local-broadleaf');assert.equal(d.transitionStatus,'no-shared-compatible-asset');
});
check('dual-palette approval cannot override neighbour realm or ecoregion restrictions',()=>{
  for(const restriction of [{realms:['Test']},{ecoregionIds:[4]}]){
    const p=configured({treelines:[],assets:assets.map(a=>a.id==='shared'?{...a,...restriction}:a)});
    const d=p.select(ctx(4),{...opts(),boundary:{neighbor:ctx(5,5,'Other'),distanceM:0,verified:true}});
    assert.notEqual(d.transitionStatus,'shared-pool');
  }
});
check('input mutation order and repeated compilation cannot change decisions',()=>{
  const a=structuredClone(assets),t=structuredClone(transition),b=structuredClone(treeline);
  const p=createVegetationPolicy({assets:a,transitions:[t],treelines:[b]});
  const o={...opts(43),elevation:{metres:1000,reliable:true,datum:'synthetic-msl'},boundary:{neighbor:ctx(5),distanceM:20,verified:true}};
  const expected=p.select(ctx(4),o);a[0].palettes.length=0;t.widthM=500;b.lowerM=-500;
  assert.deepEqual(p.select(ctx(4),o),expected);
  assert.deepEqual(configured({assets:[...assets].reverse()}).select(ctx(4),o),expected);
});
check('policy never edits source context and returns immutable non-authoritative decisions',()=>{
  const c=ctx(4),before=structuredClone(c);const d=configured().select(c,{...opts(),elevation:{metres:1200,reliable:true,datum:'synthetic-msl'}});
  assert.deepEqual(c,before);assert.ok(Object.isFrozen(d));assert.equal(d.placementAuthority,false);
});
check('bounded policy owns no cache timer or network operation',()=>{
  const p=configured(),before=p.diagnostics();for(let i=0;i<1000;i++)p.select(ctx(1),opts(i));assert.deepEqual(p.diagnostics(),before);
  const s=fs.readFileSync(new URL('../tools/biomes/vegetation-policy.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(s,/\b(?:fetch|setInterval|setTimeout|requestAnimationFrame|requestIdleCallback)\s*\(|Math\.random/);
});
check('prototype catalog is explicitly not production approval',()=>{
  assert.equal(VEGETATION_PROTOTYPES.length,6);
  for(const p of VEGETATION_PROTOTYPES){assert.equal(p.productionApproved,false);assert.equal(p.species,null);assert.equal(p.placementAuthority,false);assert.ok(Object.isFrozen(p.palettes));}
  assert.equal(createPaletteRegistry().diagnostics().assets,0);
});
const geometryReport=[];
check('five new geometries meet their exact triangle budget and have finite bounded attributes',()=>{
  for(const p of VEGETATION_PROTOTYPES.slice(1)){
    const g=buildVegetationPrototypeData(p.id);assert.equal(g.triangles,p.triangles);assert.ok(g.triangles<=68);
    assert.equal(g.positions.length,g.normals.length);assert.equal(g.positions.length,g.colors.length);
    for(const v of [...g.positions,...g.normals,...g.colors])assert.ok(Number.isFinite(v));
    let minY=Infinity,maxY=-Infinity;
    for(let i=1;i<g.positions.length;i+=3){minY=Math.min(minY,g.positions[i]);maxY=Math.max(maxY,g.positions[i]);}
    assert.ok(minY>=-1e-7&&maxY<2.4);if(p.kind==='tree')assert.ok(Math.abs(maxY-1.9584)<1e-5);
    for(let i=0;i<g.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...g.normals.subarray(i,i+3))-1)<1e-6);
    for(const v of g.colors)assert.ok(v>=0&&v<=1);
    geometryReport.push({id:p.id,triangles:g.triangles,bufferBytes:g.positions.byteLength+g.normals.byteLength+g.colors.byteLength,minY,maxY});
  }
});
check('face winding matches normals with no degenerate triangles',()=>{
  for(const p of VEGETATION_PROTOTYPES.slice(1)){
    const g=buildVegetationPrototypeData(p.id);
    for(let i=0;i<g.positions.length;i+=9){
      const a=g.positions.subarray(i,i+3),b=g.positions.subarray(i+3,i+6),c=g.positions.subarray(i+6,i+9);
      const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      assert.ok(Math.hypot(...n)>1e-9);assert.ok(n.reduce((s,x,j)=>s+x*g.normals[i+j],0)>0);
    }
  }
});
check('prototype buffers are repeatable independently owned and reject unknown types',()=>{
  for(const p of VEGETATION_PROTOTYPES.slice(1)){const a=buildVegetationPrototypeData(p.id),b=buildVegetationPrototypeData(p.id);assert.deepEqual(a,b);a.positions.fill(0);assert.notDeepEqual(a.positions,b.positions);}
  assert.throws(()=>buildVegetationPrototypeData('missing'));
});
const report={status:'PASS',groups,stressQueries,geometryReport,scope:'Synthetic policy contracts and original authoring geometry; not geography, GPU FPS or visual acceptance'};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
