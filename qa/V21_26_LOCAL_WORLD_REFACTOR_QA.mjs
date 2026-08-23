import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const builderPath=path.join(root,'src','local-world-builder.js');

assert.ok(fs.existsSync(builderPath),'src/local-world-builder.js missing — run tools/refactor-main-local-world-v21-26.mjs first');

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
const builder=fs.readFileSync(builderPath,'utf8').replace(/\r\n/g,'\n');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${path.basename(file)} syntax failed:\n${result.stderr||result.stdout}`);
}

syntaxCheck(mainPath);
syntaxCheck(builderPath);

assert.match(main,/import \{ createLocalWorldBuilder \} from '\.\/local-world-builder\.js';/,'main.js missing local world builder import');
assert.match(main,/let localWorldBuilder=null;\s*function rebuildLocalWorld\(\)\{\s*return localWorldBuilder\?\.rebuild\(\);\s*\}/s,'main.js missing narrow rebuildLocalWorld facade');
assert.match(main,/localWorldBuilder=createLocalWorldBuilder\(\{/,'main.js missing local world builder initialization');
assert.match(main,/getBridgeFeatureCount:\(\)=>bridgeFeatures\.length/,'main.js local world builder lost live bridge feature accessor');
assert.match(main,/getWorldOffset:\(\)=>worldOffset/,'main.js local world builder lost live floating-origin accessor');

for(const pattern of [
  /terrainService\.setRoadBed\(profile,\{/,
  /const roadVolume=buildRoadVolume\(profile\);/,
  /let seed=Math\.floor\(worldOffset\.x\/90\)\*73856093/,
  /const nearTrees=\[\];/,
  /const farTrees=\[\];/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns local world rebuild behavior: ${pattern}`);
  assert.match(builder,pattern,`local-world-builder.js missing extracted behavior: ${pattern}`);
}

for(const pattern of [
  /export function createLocalWorldBuilder\s*\(\{/,
  /const worldOffset=getWorldOffset\(\);/,
  /if\(getBridgeFeatureCount\(\)\) rebuildBridgeSpans\(\);/,
  /terrainService\.setRoadBed\(profile,\{/,
  /buildLateralBand\(/,
  /buildOffsetRibbon\(/,
  /new THREE\.InstancedMesh\(/,
  /rebuildLocalWater\(\);/,
  /scheduleVisualJob\(\s*'scenery'/s,
  /addEnhancedBridgeFurniture\(\);/,
  /refreshRoadSignsOnly\(\);/,
  /scheduleVisualJob\(\s*'horizon'/s,
  /markStaticShadowsDirty\(\);/
]){
  assert.match(builder,pattern,`local-world-builder.js missing expected behavior: ${pattern}`);
}

const builderInit=main.indexOf('localWorldBuilder=createLocalWorldBuilder({');
const streamingInit=main.indexOf('streamingCoordinator=createStreamingCoordinator({');
assert.ok(builderInit>=0&&streamingInit>=0&&builderInit<streamingInit,'local world builder must exist before streaming coordinator receives rebuild callback');

const mainLines=main.split('\n').length;
assert.ok(mainLines<4250,`main.js still unexpectedly large after local world extraction: ${mainLines} lines`);

const { createLocalWorldBuilder }=await import(`${pathToFileURL(builderPath).href}?qa=${Date.now()}`);
assert.equal(typeof createLocalWorldBuilder,'function','createLocalWorldBuilder export missing');

const log=[];
const makeGroup=name=>({name,children:[],add(...items){this.children.push(...items);log.push(`add:${name}:${items.length}`);}});
const roadGroup=makeGroup('road');
const forestGroup=makeGroup('forest');
const infrastructureGroup=makeGroup('infrastructure');
const signGroup=makeGroup('sign');

class FakeObject3D{
  constructor(){
    this.position={set:(x,y,z)=>{this.p=[x,y,z];}};
    this.scale={setScalar:value=>{this.s=value;}};
    this.rotation={set:(x,y,z)=>{this.r=[x,y,z];}};
    this.matrix={};
  }
  updateMatrix(){this.matrix={p:this.p,s:this.s,r:this.r};}
}
class FakeGeometry{constructor(...args){this.args=args;}}
class FakeInstancedMesh{
  constructor(geometry,material,count){
    this.geometry=geometry;
    this.material=material;
    this.count=count;
    this.instanceMatrix={needsUpdate:false};
    this.matrices=[];
  }
  setMatrixAt(index,matrix){this.matrices[index]=matrix;}
}
const THREE={
  Object3D:FakeObject3D,
  CylinderGeometry:FakeGeometry,
  ConeGeometry:FakeGeometry,
  InstancedMesh:FakeInstancedMesh
};

const clearGroup=group=>{log.push(`clear:${group.name}`);group.children.length=0;};
const terrainService={
  resetRoadBedOrigin(){log.push('terrain:resetOrigin');},
  setRoadBed(profile,options){
    log.push('terrain:setRoadBed');
    assert.equal(profile.length,2,'road profile changed before terrain road-bed application');
    assert.equal(options.roadHalfWidth,5.4,'road-bed roadHalfWidth changed');
    assert.equal(options.terrainCutHalfWidth,16.5,'road-bed terrain cut changed');
    assert.equal(options.blendWidth,14,'road-bed blend width changed');
    assert.ok(options.startPad,'start pad was lost from local world rebuild');
  }
};
const profile=[
  {x:0,z:0,y:10,cum:0},
  {x:20,z:30,y:11,cum:36}
];
const mesh=kind=>({kind});
const scheduled=[];

const localWorldBuilder=createLocalWorldBuilder({
  THREE,
  resetStreamedWorldOrigins:()=>log.push('world:resetOrigins'),
  terrainService,
  clearGroup,
  roadGroup,
  forestGroup,
  infrastructureGroup,
  signGroup,
  sceneryRenderer:{clear:()=>log.push('scenery:clear')},
  getBridgeFeatureCount:()=>1,
  rebuildBridgeSpans:()=>log.push('bridge:rebuild'),
  buildRoadProfile:()=>{log.push('road:profile');return profile;},
  setActiveRoadProfile:value=>{log.push('road:setProfile');assert.equal(value,profile);},
  buildRoadVolume:()=>mesh('volume'),
  buildLateralBand:(_profile,a,b)=>mesh(`band:${a}:${b}`),
  buildRibbon:()=>mesh('asphalt'),
  buildOffsetRibbon:(_profile,off)=>mesh(`line:${off}`),
  shoulderMat:{},
  roadMat:{},
  lineYellow:{},
  lineWhite:{},
  ROAD_SURFACE_OFFSET:.10,
  getWorldOffset:()=>({x:180,z:270}),
  nearestRoute:()=>({d:100}),
  isWaterAt:()=>false,
  terrainAbs:()=>5,
  treeTrunkMat:{},
  treeMat:{},
  rebuildLocalWater:()=>log.push('water:rebuild'),
  scheduleVisualJob:(key,job,timeout)=>{scheduled.push({key,job,timeout});log.push(`schedule:${key}`);},
  rebuildLocalScenery:()=>{},
  addEnhancedBridgeFurniture:()=>log.push('furniture:bridge'),
  refreshRoadSignsOnly:()=>log.push('furniture:signs'),
  freezeStaticMatrices:group=>log.push(`freeze:${group.name}`),
  rebuildHorizon:()=>{},
  markStaticShadowsDirty:()=>log.push('shadows:dirty')
});

localWorldBuilder.rebuild();

assert.ok(log.indexOf('bridge:rebuild')<log.indexOf('road:profile'),'bridge spans must rebuild before road profile');
assert.ok(log.indexOf('road:setProfile')<log.indexOf('terrain:setRoadBed'),'active road profile must be installed before terrain road bed');
assert.ok(roadGroup.children.length>=7,`expected road volume/shoulders/asphalt/lines, got ${roadGroup.children.length} road meshes`);
assert.ok(forestGroup.children.length>=1,'procedural forest generation produced no instanced meshes');
assert.ok(log.includes('water:rebuild'),'local hydro rebuild was lost');
assert.deepEqual(scheduled.map(item=>item.key),['scenery','horizon'],'deferred scenery/horizon scheduling changed');
assert.equal(scheduled[0].timeout,220,'scenery defer timing changed');
assert.equal(scheduled[1].timeout,260,'horizon defer timing changed');
for(const groupName of ['road','forest','infrastructure','sign']){
  assert.ok(log.includes(`freeze:${groupName}`),`static matrix freeze lost for ${groupName}`);
}
assert.ok(log.includes('furniture:bridge'),'bridge furniture rebuild was lost');
assert.ok(log.includes('furniture:signs'),'road sign refresh was lost');
assert.ok(log.includes('shadows:dirty'),'static shadow invalidation was lost');

for(const qa of [
  'qa/V21_26_ROUTE_PLANNER_REFACTOR_QA.mjs',
  'qa/V21_25_ROAD_GEOMETRY_REFACTOR_QA.mjs',
  'qa/V21_25_STREAMING_REFACTOR_QA.mjs'
]){
  const result=spawnSync(process.execPath,[qa],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${qa} regressed:\n${result.stderr||result.stdout}`);
}

console.log('V21.26 LOCAL WORLD REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; local-world-builder.js: ${builder.split('\n').length} lines`);
console.log('road bed / road mesh / forest / hydro / scenery / furniture / horizon orchestration verified');